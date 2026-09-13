"""Basic performance/stability test against a running MultiScore API
(local or deployed). Measures p50/p95/p99 latency and error rate for the
two endpoints that matter most: the precomputed /matches/{id}/shots (what
the explorer hits) and the live /predict (what the simulator hits, and the
only endpoint that runs the model at request time).

Usage:
    uv run python scripts/load_test.py --base-url https://<cloud-run-url> \
        --match-id 3857254 --n-requests 500 --concurrency 10
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path

import httpx

REPORTS_DIR = Path(__file__).resolve().parents[1] / "reports"


async def timed_request(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> tuple[float, bool]:
    t0 = time.perf_counter()
    try:
        resp = await client.request(method, url, timeout=30.0, **kwargs)
        ok = resp.status_code == 200
    except Exception:  # noqa: BLE001 - any failure (timeout, connection reset, etc.) counts as an error here
        ok = False
    elapsed_ms = (time.perf_counter() - t0) * 1000
    return elapsed_ms, ok


async def run_load(base_url: str, match_id: int, n_requests: int, concurrency: int) -> dict:
    async with httpx.AsyncClient(base_url=base_url) as client:
        # Cold-start timing: first /health call after the service may have
        # scaled to zero (Cloud Run min-instances=0).
        cold_start_ms, cold_ok = await timed_request(client, "GET", "/health")

        predict_payload = {
            "shooter_x": 108.0,
            "shooter_y": 40.0,
            "freeze_frame": [{"x": 116.0, "y": 40.0, "is_goalkeeper": True}],
        }

        async def bounded(sem, coro_fn):
            async with sem:
                return await coro_fn()

        sem = asyncio.Semaphore(concurrency)

        shots_tasks = [
            bounded(sem, lambda: timed_request(client, "GET", f"/matches/{match_id}/shots"))
            for _ in range(n_requests)
        ]
        predict_tasks = [
            bounded(sem, lambda: timed_request(client, "POST", "/predict", json=predict_payload))
            for _ in range(n_requests)
        ]

        shots_results = await asyncio.gather(*shots_tasks)
        predict_results = await asyncio.gather(*predict_tasks)

    def summarize(results):
        latencies = sorted(r[0] for r in results)
        errors = sum(1 for r in results if not r[1])
        n = len(latencies)
        return {
            "n": n,
            "errors": errors,
            "error_rate": errors / n,
            "p50_ms": latencies[int(n * 0.50)],
            "p95_ms": latencies[int(n * 0.95) - 1],
            "p99_ms": latencies[min(int(n * 0.99), n - 1)],
            "max_ms": latencies[-1],
        }

    return {
        "base_url": base_url,
        "cold_start_health_ms": cold_start_ms,
        "cold_start_ok": cold_ok,
        "matches_shots": summarize(shots_results),
        "predict": summarize(predict_results),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--match-id", type=int, required=True)
    parser.add_argument("--n-requests", type=int, default=500)
    parser.add_argument("--concurrency", type=int, default=10)
    args = parser.parse_args()

    result = asyncio.run(run_load(args.base_url, args.match_id, args.n_requests, args.concurrency))
    print(json.dumps(result, indent=2))

    REPORTS_DIR.mkdir(exist_ok=True)
    with open(REPORTS_DIR / "performance.json", "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nSaved -> {REPORTS_DIR / 'performance.json'}")


if __name__ == "__main__":
    main()

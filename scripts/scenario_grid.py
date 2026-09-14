"""Evidence for the write-up: runs a fixed grid of hand-picked shot
scenarios (empty net, goalkeeper at various distances/positions, crowded
box, header vs foot) through the live production model and compares them
against the real-data goal rate for the closest comparable bin, plus a
figure of model xG vs real goal rate by distance, header vs foot.

Usage:
    uv run python scripts/scenario_grid.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "ml"))

YARD_TO_M = 0.9144


def x_for_distance_m(distance_m: float) -> float:
    return 120.0 - distance_m / YARD_TO_M


def build_scenarios() -> list[dict]:
    gk_line = {"x": 119.0, "y": 40.0, "is_goalkeeper": True}
    gk_six_yard = {"x": 114.5, "y": 40.0, "is_goalkeeper": True}
    gk_off_center = {"x": 117.0, "y": 32.0, "is_goalkeeper": True}
    crowd_box = [
        {"x": 114.0, "y": 35.0, "is_goalkeeper": True},
        {"x": 116.0, "y": 38.5},
        {"x": 115.5, "y": 42.0},
    ]
    six_defenders = [
        gk_six_yard,
        {"x": 110.0, "y": 37.0},
        {"x": 109.0, "y": 39.0},
        {"x": 108.0, "y": 41.0},
        {"x": 108.5, "y": 43.0},
        {"x": 107.0, "y": 45.0},
        {"x": 109.0, "y": 44.0},
    ]
    return [
        {"name": "Arco vacío 11m", "distance_m": 11.0, "y": 40.0, "body": "Right Foot", "freeze_frame": [], "real_bin": "foot, 9-12m"},
        {"name": "Arco vacío 16.5m", "distance_m": 16.5, "y": 40.0, "body": "Right Foot", "freeze_frame": [], "real_bin": "foot, 16.5-20m"},
        {"name": "Arco vacío 25m", "distance_m": 25.0, "y": 40.0, "body": "Right Foot", "freeze_frame": [], "real_bin": "foot, 20-40m"},
        {"name": "Cabezazo arco vacío 11m", "distance_m": 11.0, "y": 40.0, "body": "Head", "freeze_frame": [], "real_bin": "cabeza, 9-12m"},
        {"name": "Cabezazo arco vacío 22m", "distance_m": 22.0, "y": 40.0, "body": "Head", "freeze_frame": [], "real_bin": "cabeza, 20-40m"},
        {"name": "Arquero en la línea, 12.9m", "distance_m": 12.9, "y": 40.0, "body": "Right Foot", "freeze_frame": [gk_line], "real_bin": "foot, 12-16.5m"},
        {"name": "Cabezazo, arquero en la línea, 12.9m", "distance_m": 12.9, "y": 40.0, "body": "Head", "freeze_frame": [gk_line], "real_bin": "cabeza, 12-16.5m"},
        {"name": "Arquero en el área chica, 20.9m", "distance_m": 20.9, "y": 40.0, "body": "Right Foot", "freeze_frame": [gk_six_yard], "real_bin": "foot, 16.5-20m"},
        {"name": "Cabezazo, arquero en el área chica, 20.9m", "distance_m": 20.9, "y": 40.0, "body": "Head", "freeze_frame": [gk_six_yard], "real_bin": "cabeza, 16.5-20m"},
        {"name": "Arquero corrido + 2 defensores, cabezazo 12.9m", "distance_m": 12.9, "y": 41.0, "body": "Head", "freeze_frame": crowd_box, "real_bin": "cabeza, 12-16.5m"},
        {"name": "Arquero fuera de posición, 12m", "distance_m": 12.0, "y": 40.0, "body": "Right Foot", "freeze_frame": [gk_off_center], "real_bin": "foot, 9-12m"},
        {"name": "6 rivales en la línea, 14.9m", "distance_m": 14.9, "y": 41.0, "body": "Right Foot", "freeze_frame": six_defenders, "real_bin": "foot, 12-16.5m"},
    ]


REAL_BIN_RATES = {
    "foot, 9-12m": 0.214,
    "foot, 12-16.5m": 0.151,
    "foot, 16.5-20m": 0.077,
    "foot, 20-40m": 0.027,
    "cabeza, 9-12m": 0.067,
    "cabeza, 12-16.5m": 0.037,
    "cabeza, 16.5-20m": 0.033,
    "cabeza, 20-40m": 0.0,
}


def _predict_request(distance_m: float, y: float, body: str, freeze_frame: list[dict]):
    from app.schemas import PredictRequest

    return PredictRequest(
        shooter_x=x_for_distance_m(distance_m),
        shooter_y=y,
        shot_body_part=body,
        freeze_frame=freeze_frame,
    )


def run_scenarios() -> pd.DataFrame:
    from app.service import MultiScoreService

    service = MultiScoreService()
    rows = []
    for sc in build_scenarios():
        request = _predict_request(sc["distance_m"], sc["y"], sc["body"], sc["freeze_frame"])
        result = service.predict(request)
        rows.append(
            {
                "scenario": sc["name"],
                "distance_m": sc["distance_m"],
                "body_part": sc["body"],
                "xg_model": round(result["xg_full"], 3),
                "real_bin": sc["real_bin"],
                "real_bin_goal_rate": REAL_BIN_RATES[sc["real_bin"]],
            }
        )
    return pd.DataFrame(rows)


def build_header_vs_foot_figure() -> None:
    features_path = ROOT / "data" / "processed" / "la_liga_features.parquet"
    if not features_path.exists():
        print("Skipping figure: data/processed/la_liga_features.parquet not found.")
        return

    df = pd.read_parquet(features_path)
    df = df[df["shot_type"] == "Open Play"]
    bins = [0, 6, 9, 12, 16.5, 20, 40]
    labels = ["0-6", "6-9", "9-12", "12-16.5", "16.5-20", "20-40"]
    df = df.assign(dist_bin=pd.cut(df["distance_to_goal_m"], bins=bins, labels=labels))

    fig, ax = plt.subplots(figsize=(8, 5))
    for body_part, marker in [("Head", "o"), ("Right Foot", "s")]:
        sub = df[df["shot_body_part"] == body_part] if body_part != "Right Foot" else df[df["shot_body_part"] != "Head"]
        agg = sub.groupby("dist_bin", observed=True)["is_goal"].mean()
        ax.plot(agg.index.astype(str), agg.values, marker=marker, label=f"Tasa real ({'cabeza' if body_part == 'Head' else 'pie'})")

    ax.set_xlabel("Distancia al arco (m)")
    ax.set_ylabel("Tasa de gol")
    ax.set_title("Cabezazo vs pie: tasa de gol real por distancia (La Liga, test)")
    ax.legend()
    fig.tight_layout()

    out_path = ROOT / "reports" / "figures" / "header_vs_foot_by_distance.png"
    fig.savefig(out_path, dpi=150)
    print(f"Saved figure -> {out_path}")


def main() -> None:
    df = run_scenarios()
    out_path = ROOT / "reports" / "tables" / "scenarios.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(df.to_string(index=False))
    print(f"\nSaved table -> {out_path}")

    build_header_vs_foot_figure()


if __name__ == "__main__":
    main()

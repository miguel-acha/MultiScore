# MultiScore API image: FastAPI + the trained models/precomputed data.
# The monorepo's ml/multiscore package is copied in (not pip-installed from
# PyPI) so the exact same feature-extraction code used at training time
# runs at inference time - the single most important guarantee for a
# correctly-served ML model.
FROM python:3.12-slim

WORKDIR /app

# System deps for lightgbm/xgboost wheels (libgomp for OpenMP).
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    # xgboost's wheel pulls in an NVIDIA NCCL package for distributed GPU
    # training that this CPU-only inference service never uses (~250MB) -
    # drop it to keep the image small and Cloud Run cold starts fast.
    && pip uninstall -y nvidia-nccl-cu13 2>/dev/null || true

# The multiscore package (geometry/features/modeling) used by app/service.py
COPY ml/multiscore /app/multiscore
COPY api/app /app/app

ENV PYTHONPATH=/app
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]

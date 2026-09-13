# MultiScore

Predicción de xG (probabilidad de gol) con Machine Learning, incorporando la
**posición de los defensores** como variable diferenciadora. Proyecto final
de Tópicos Selectos en TIC, Facultad de Ingeniería, UPB.

Web app: [ver despliegue] · API: [ver despliegue] · Documento completo: ver `docs/`

## Qué hace

1. Descarga disparos reales (con freeze frame: posición de todos los
   jugadores en el instante del remate) de **La Liga** (StatsBomb Open Data,
   17 temporadas) y del **Mundial 2022** (prueba externa de generalización).
2. Entrena y compara 6 modelos: {regresión logística, XGBoost, LightGBM} x
   {solo geometría del disparo, geometría + posición de defensores}.
3. Mide con rigor estadístico si agregar la posición de los defensores
   mejora la predicción (bootstrap agrupado por partido, log-loss, AUC,
   calibración, comparación contra el xG propio de StatsBomb).
4. Expone el mejor modelo en una API (FastAPI + Docker, desplegada en Google
   Cloud Run) y una web (React + Vite, desplegada en Vercel) donde se puede
   explorar disparos reales o simular uno moviendo jugadores en la cancha.

## Estructura del repositorio

```
ml/multiscore/    # pipeline de datos, features, entrenamiento, evaluación
configs/          # configuración de entrenamiento (semilla, hiperparámetros)
data/             # raw/ y processed/ (no versionado, se regenera)
models/           # modelos entrenados + model_card.json (no versionado)
reports/          # metrics.json, figuras, tablas — sí versionado (evidencia)
api/              # FastAPI + Dockerfile
web/              # React + Vite + TypeScript
tests/            # pytest (geometría, features, dataset, API)
docs/diagrams/    # diagramas de arquitectura (Mermaid)
scripts/          # pruebas de carga contra la API desplegada
```

## Requisitos

- Python 3.12 y [uv](https://docs.astral.sh/uv/)
- Node 20+ y npm
- Docker (para construir/probar la imagen de la API)

## Reproducir el pipeline completo

```bash
uv sync --extra dev

# 1. Descargar datos (La Liga + Mundial 2022) — cachea en data/raw/
uv run python -m multiscore.data

# 2. Limpiar, construir variables y separar train/val/test
uv run python -m multiscore.dataset

# 3. Exploración de datos (figuras en reports/eda/)
uv run python -m multiscore.eda

# 4. Entrenar las 6 variantes (semilla fija = 42, reproducible)
uv run python -m multiscore.train

# 5. Evaluación completa: métricas, bootstrap, calibración, figuras
uv run python -m multiscore.evaluate

# 6. Empaquetar modelos + datos precalculados para la API
uv run python -m multiscore.export
```

## Correr los tests

```bash
uv run pytest --cov=multiscore --cov-report=term-missing
```

Los tests de `tests/test_api.py` requieren haber corrido `export.py` antes
(se saltan automáticamente si no existe el bundle de modelos).

## Correr la API en local

```bash
cd api
uv run uvicorn app.main:app --reload --port 8080
# docs interactivas en http://localhost:8080/docs
```

## Correr la web en local

```bash
cd web
cp .env.example .env.local   # apunta VITE_API_URL a la API local
npm install
npm run dev
```

## Despliegue

### API en Google Cloud Run

```bash
gcloud run deploy multiscore-api \
  --source api/ \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --memory 512Mi
```

Capa gratuita: 2 millones de solicitudes/mes. Con `min-instances 0` el
servicio se apaga cuando no hay tráfico (costo esperado: $0), a cambio de un
arranque en frío de unos segundos en la primera solicitud tras inactividad.

Alternativa sin tarjeta de crédito: [Render](https://render.com) con el
mismo `api/Dockerfile` (plan gratuito, con "sleep" tras 15 min de
inactividad y ~30-60s de arranque en frío).

### Web en Vercel

Conectar el repositorio de GitHub, configurar el *root directory* en `web/`
y la variable de entorno `VITE_API_URL` con la URL pública de la API.

## Pruebas de rendimiento

```bash
uv run python scripts/load_test.py \
  --base-url https://<url-de-cloud-run> \
  --match-id <id-de-un-partido-del-mundial-2022> \
  --n-requests 500 --concurrency 10
```

Guarda p50/p95/p99 de latencia y tasa de error en `reports/performance.json`.

## Decisiones de diseño relevantes

- **Comparación justa**: todos los modelos (incluso el de solo geometría) se
  entrenan y evalúan sobre el mismo subconjunto de disparos con freeze frame
  disponible, para que la diferencia medida sea atribuible únicamente a las
  variables de defensores.
- **Split sin fuga de datos**: La Liga se separa por partido (no por
  disparo), así ningún partido aparece a la vez en entrenamiento y prueba.
  El Mundial 2022 se mantiene aparte como prueba externa de generalización.
- **xG de StatsBomb como referencia**, nunca como variable de entrada — se
  usa solo para comparar contra una solución existente (punto 8.3 de la
  guía del curso).
- **Sesgo conocido de los datos abiertos de La Liga**: sobrerrepresentan
  partidos del FC Barcelona (ver `reports/eda/eda_summary.json`). Documentado
  como limitación, no oculto.

## Versiones exactas

Ver `pyproject.toml` / `uv.lock` (Python) y `web/package.json` (Node). Las
versiones de scikit-learn/xgboost/lightgbm del contenedor de la API
(`api/requirements.txt`) están fijadas para coincidir exactamente con las
usadas al entrenar, evitando incompatibilidades al cargar los modelos
serializados con `joblib`.

## Autor

Miguel Angel Achá Boiano — Tópicos Selectos en TIC, UPB.

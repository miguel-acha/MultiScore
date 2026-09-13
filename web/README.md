# MultiScore — Web

React + Vite + TypeScript. Ver el [README principal](../README.md) del
repositorio para el pipeline completo (datos, entrenamiento, API).

```bash
cp .env.example .env.local   # VITE_API_URL -> API local o desplegada
npm install
npm run dev
```

- `src/api.ts` — cliente HTTP hacia la API (FastAPI).
- `src/Pitch.tsx` — cancha en SVG reutilizable (coordenadas StatsBomb).
- `src/Explorer.tsx` — navega competiciones/partidos/disparos reales.
- `src/Simulator.tsx` — arrastra jugadores y ve el xG en vivo.
- `src/ModelPage.tsx` — comparación de las 6 variantes de modelo.

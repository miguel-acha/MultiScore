// Model view: pulls /model and renders a comparison table of the 6 trained
// variants (3 families x geo/full) so a viewer can see, in one place, which
// model was selected for production and how much the defender features
// moved log-loss/AUC on both the La Liga test split and the World Cup 2022
// external test.
import { useEffect, useState } from "react";
import { api } from "./api";
import type { ModelInfo } from "./api";

export default function ModelPage() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.modelInfo().then(setInfo).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="error">Error: {error}</div>;
  if (!info) return <p>Cargando…</p>;

  const rows = Object.entries(info.metrics).map(([name, m]: [string, any]) => ({
    name,
    ...m,
  }));

  return (
    <div className="model-page">
      <p>
        Modelo de producción (geo): <strong>{info.geo_model}</strong>
        <br />
        Modelo de producción (con defensores): <strong>{info.full_model}</strong>{" "}
        {info.full_model_calibrated && <em>(calibrado con isotonic regression)</em>}
      </p>
      <table>
        <thead>
          <tr>
            <th>Variante</th>
            <th>Val log-loss</th>
            <th>Test AUC</th>
            <th>Test log-loss</th>
            <th>Mundial AUC</th>
            <th>Mundial log-loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.val_logloss?.toFixed(4)}</td>
              <td>{r.test_auc?.toFixed(3)}</td>
              <td>{r.test_logloss?.toFixed(4)}</td>
              <td>{r.external_test_auc?.toFixed(3)}</td>
              <td>{r.external_test_logloss?.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import type { ModelInfo } from "../api";
import Skeleton from "../components/Skeleton";

export default function Model() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.modelInfo().then(setInfo).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-(--color-rival)">Error: {error}</div>;
  if (!info) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const rows = Object.entries(info.metrics).map(([name, m]: [string, any]) => ({ name, ...m }));
  const chartData = rows.map((r) => ({
    name: r.name.replace(/_/g, " "),
    "AUC test": r.test_auc,
    "AUC mundial": r.external_test_auc,
  }));

  const bestAuc = Math.max(...rows.map((r) => r.test_auc ?? 0));
  const bestLogloss = Math.min(...rows.map((r) => r.test_logloss ?? Infinity));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">EL MODELO</h1>
        <p className="text-(--color-text-dim)">Comparación de las 6 variantes entrenadas, geo vs con defensores.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ModelStatCard title="Modelo en producción (geo)" name={info.geo_model} />
        <ModelStatCard title="Modelo en producción (con defensores)" name={info.full_model} calibrated={info.full_model_calibrated} />
      </div>

      <div className="clip-menu border border-(--color-border) bg-(--color-surface) p-5">
        <p className="mb-4 text-sm text-(--color-text-dim)">AUC por variante (test La Liga vs Mundial 2022)</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#98a2b3", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis domain={[0.7, 0.85]} tick={{ fill: "#98a2b3", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#161b23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="AUC test" fill="#c8ff00" radius={[4, 4, 0, 0]} />
            <Bar dataKey="AUC mundial" fill="#7c8798" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="clip-menu overflow-x-auto border border-(--color-border) bg-(--color-surface)">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs uppercase text-(--color-text-faint)">
              <th className="px-4 py-3">Variante</th>
              <th className="px-4 py-3">Val log-loss</th>
              <th className="px-4 py-3">Test AUC</th>
              <th className="px-4 py-3">Test log-loss</th>
              <th className="px-4 py-3">Mundial AUC</th>
              <th className="px-4 py-3">Mundial log-loss</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-(--color-border) last:border-0 hover:bg-(--color-surface-2)">
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5">{r.val_logloss?.toFixed(4)}</td>
                <td className={`px-4 py-2.5 ${r.test_auc === bestAuc ? "text-(--color-lime) font-semibold" : ""}`}>{r.test_auc?.toFixed(3)}</td>
                <td className={`px-4 py-2.5 ${r.test_logloss === bestLogloss ? "text-(--color-lime) font-semibold" : ""}`}>{r.test_logloss?.toFixed(4)}</td>
                <td className="px-4 py-2.5">{r.external_test_auc?.toFixed(3)}</td>
                <td className="px-4 py-2.5">{r.external_test_logloss?.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelStatCard({ title, name, calibrated }: { title: string; name: string; calibrated?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="clip-menu border border-(--color-border) bg-(--color-surface) p-5">
      <p className="text-xs uppercase tracking-wide text-(--color-text-faint)">{title}</p>
      <p className="font-display mt-1 text-2xl text-(--color-lime)">{name}</p>
      {calibrated && <span className="mt-2 inline-block rounded-full bg-(--color-lime)/10 px-2 py-0.5 text-xs text-(--color-lime)">Calibrado (isotonic)</span>}
    </motion.div>
  );
}

import { useState } from "react";
import Explorer from "./Explorer";
import Simulator from "./Simulator";
import ModelPage from "./ModelPage";
import "./app.css";

type Tab = "explorer" | "simulator" | "model";

export default function App() {
  const [tab, setTab] = useState<Tab>("explorer");

  return (
    <div className="app">
      <header>
        <h1>MultiScore</h1>
        <p>Predicción de xG con Machine Learning y posición de defensores</p>
        <nav>
          <button className={tab === "explorer" ? "active" : ""} onClick={() => setTab("explorer")}>
            Explorador
          </button>
          <button className={tab === "simulator" ? "active" : ""} onClick={() => setTab("simulator")}>
            Simulador
          </button>
          <button className={tab === "model" ? "active" : ""} onClick={() => setTab("model")}>
            Modelo
          </button>
        </nav>
      </header>
      <main>
        {tab === "explorer" && <Explorer />}
        {tab === "simulator" && <Simulator />}
        {tab === "model" && <ModelPage />}
      </main>
    </div>
  );
}

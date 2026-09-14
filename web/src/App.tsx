import { useState } from "react";
import Explorer from "./Explorer";
import Simulator from "./Simulator";
import ModelPage from "./ModelPage";
import "./app.css";

type Tab = "explorer" | "simulator" | "model";

export default function App() {
  const [tab, setTab] = useState<Tab>("explorer");

  return (
    <>
      <header className="glass-header">
        <div className="glass-header-inner">
          <div className="brand">
            <img src="/images/logo-white.png" alt="MultiScore" className="brand-logo" />
            <p>Predicción de xG con Machine Learning y posición de defensores</p>
          </div>
          <nav className="glass-nav">
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
        </div>
      </header>
      <div className="app">
        <main>
          {tab === "explorer" && <Explorer />}
          {tab === "simulator" && <Simulator />}
          {tab === "model" && <ModelPage />}
        </main>
      </div>
    </>
  );
}

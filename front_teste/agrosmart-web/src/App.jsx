import React, { useState } from "react";
import ClimaDashboard from "./components/ClimaDashboard";
import ComercialDashboard from "./components/ComercialDashboard";
import EstoqueGestao from "./components/EstoqueGestao";
import VendasDashboard from "./components/VendasDashboard";
import PlantiosGestao from "./components/PlantiosGestao";
import ChatWidget from "./components/ChatWidget";

const ABAS = [
  { id: "clima", label: "Clima & IoT", Tela: ClimaDashboard },
  { id: "plantios", label: "Plantios", Tela: PlantiosGestao },
  { id: "vendas", label: "Vendas", Tela: VendasDashboard },
  { id: "comercial", label: "Dashboard Comercial", Tela: ComercialDashboard },
  { id: "estoque", label: "Gestão de Estoque", Tela: EstoqueGestao },
];

function App() {
  const [abaAtiva, setAbaAtiva] = useState("estoque");
  const TelaAtiva = ABAS.find((a) => a.id === abaAtiva).Tela;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-emerald-800 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-2 shadow">
        <span className="font-bold tracking-wide">AgroSmart MVP</span>
        <div className="flex flex-wrap gap-2">
          {ABAS.map((aba) => (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                abaAtiva === aba.id ? "bg-white text-emerald-900" : "bg-emerald-700/60 hover:bg-emerald-700"
              }`}
            >
              {aba.label}
            </button>
          ))}
        </div>
      </nav>

      <TelaAtiva />

      <ChatWidget />
    </div>
  );
}

export default App;

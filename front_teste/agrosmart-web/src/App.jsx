import React, { useState } from "react";
import ClimaDashboard from "./components/ClimaDashboard";
import ComercialDashboard from "./components/ComercialDashboard";
import EstoqueGestao from "./components/EstoqueGestao";
import ChatWidget from "./components/ChatWidget";

function App() {
  const [abaAtiva, setAbaAtiva] = useState("estoque");

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-emerald-800 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-2 shadow">
        <span className="font-bold tracking-wide">AgroSmart MVP</span>
        <div className="flex gap-2">
          <button
            onClick={() => setAbaAtiva("clima")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              abaAtiva === "clima"
                ? "bg-white text-emerald-900"
                : "bg-emerald-700/60 hover:bg-emerald-700"
            }`}
          >
            Clima & IoT
          </button>
          <button
            onClick={() => setAbaAtiva("comercial")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              abaAtiva === "comercial"
                ? "bg-white text-emerald-900"
                : "bg-emerald-700/60 hover:bg-emerald-700"
            }`}
          >
            Dashboard Comercial
          </button>
          <button
            onClick={() => setAbaAtiva("estoque")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              abaAtiva === "estoque"
                ? "bg-white text-emerald-900"
                : "bg-emerald-700/60 hover:bg-emerald-700"
            }`}
          >
            Gestão de Estoque
          </button>
        </div>
      </nav>

      {abaAtiva === "clima" && <ClimaDashboard />}
      {abaAtiva === "comercial" && <ComercialDashboard />}
      {abaAtiva === "estoque" && <EstoqueGestao />}

      <ChatWidget />
    </div>
  );
}

export default App;
import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import ClimaDashboard from "./components/ClimaDashboard";
import ComercialDashboard from "./components/ComercialDashboard";
import EstoqueGestao from "./components/EstoqueGestao";
import VendasDashboard from "./components/VendasDashboard";
import PlantiosGestao from "./components/PlantiosGestao";
import ChatWidget from "./components/ChatWidget";
import ResumoDia from "./components/ResumoDia";

const ABAS = [
  { id: "clima", label: "Clima & IoT", Tela: ClimaDashboard },
  { id: "plantios", label: "Plantios", Tela: PlantiosGestao },
  { id: "vendas", label: "Vendas", Tela: VendasDashboard },
  { id: "comercial", label: "Dashboard Comercial", Tela: ComercialDashboard },
  { id: "estoque", label: "Gestão de Estoque", Tela: EstoqueGestao },
];

function App() {
  const [abaAtiva, setAbaAtiva] = useState("estoque");
  // Incrementar a versão remonta a tela ativa, que busca os dados de novo
  const [versao, setVersao] = useState(0);
  const [girando, setGirando] = useState(false);
  const TelaAtiva = ABAS.find((a) => a.id === abaAtiva).Tela;

  const atualizar = () => {
    setVersao((v) => v + 1);
    setGirando(true);
    setTimeout(() => setGirando(false), 700);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-emerald-800 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-2 shadow">
        <span className="font-bold tracking-wide">AgroSmart MVP</span>
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            onClick={atualizar}
            title="Atualizar dados da aba"
            aria-label="Atualizar dados da aba"
            className="ml-1 p-2 rounded-lg bg-emerald-700/60 hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${girando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </nav>

      <ResumoDia />

      <TelaAtiva key={`${abaAtiva}-${versao}`} />

      <ChatWidget />
    </div>
  );
}

export default App;

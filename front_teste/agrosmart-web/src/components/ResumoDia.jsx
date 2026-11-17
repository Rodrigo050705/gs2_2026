import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { API_BASE_URL } from "../api";

const CHAVE_RECOLHIDO = "agrosmart.resumoRecolhidoEm"; // guarda a data em que foi recolhido

const MD = {
  ul: ({ children }) => <ul className="space-y-2.5">{children}</ul>,
  li: ({ children }) => (
    <li className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
      <span className="mt-[9px] w-1 h-1 rounded-full bg-slate-400 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  p: ({ children }) => <span>{children}</span>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
};

const hoje = () => new Date().toLocaleDateString("sv-SE");

function lerRecolhido() {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDO) === hoje();
  } catch {
    return false;
  }
}

function salvarRecolhido(recolhido) {
  try {
    if (recolhido) localStorage.setItem(CHAVE_RECOLHIDO, hoje());
    else localStorage.removeItem(CHAVE_RECOLHIDO);
  } catch {
    /* sem armazenamento local: só não lembra */
  }
}

export default function ResumoDia() {
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  // Recolhido vale só para o dia: no dia seguinte o resumo novo aparece aberto
  const [recolhido, setRecolhido] = useState(lerRecolhido);

  const carregar = async (atualizar = false) => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`${API_BASE_URL}/resumo-dia?produtor_id=1${atualizar ? "&atualizar=true" : ""}`);
      if (!res.ok) throw new Error("Não foi possível carregar o resumo");
      setResumo(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const alternar = () => {
    setRecolhido((r) => {
      salvarRecolhido(!r);
      return !r;
    });
  };

  const horario = resumo ? new Date(resumo.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <section className={`bg-white border border-slate-200 rounded-2xl ${recolhido ? "" : "h-full"}`}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Resumo do dia</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {carregando && !resumo
              ? "Preparando o resumo"
              : resumo?.fonte === "ia"
              ? `Gerado pela IA às ${horario}`
              : "Gerado por regras, sem IA no momento"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!recolhido && (
            <button
              onClick={() => carregar(true)}
              disabled={carregando}
              title="Gerar um novo resumo com os dados de agora"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
              Gerar de novo
            </button>
          )}
          <button
            onClick={alternar}
            aria-expanded={!recolhido}
            aria-label={recolhido ? "Mostrar o resumo" : "Recolher o resumo"}
            title={recolhido ? "Mostrar o resumo" : "Recolher o resumo"}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            {recolhido ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!recolhido && (
        <div className="border-t border-slate-100 px-5 py-4">
          {carregando && !resumo && (
            <div className="space-y-2 animate-pulse">
              {[90, 75, 82, 60].map((w) => (
                <div key={w} className="h-3.5 bg-slate-100 rounded" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {erro && !resumo && <p className="text-sm text-red-600">{erro}</p>}
          {resumo && (
            <div className={carregando ? "opacity-50" : ""}>
              <ReactMarkdown components={MD}>{resumo.texto}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

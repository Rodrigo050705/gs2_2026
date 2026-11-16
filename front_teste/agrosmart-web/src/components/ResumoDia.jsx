import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { API_BASE_URL } from "../api";

const CHAVE_RECOLHIDO = "agrosmart.resumoRecolhidoEm"; // guarda a data em que foi recolhido

const MD = {
  ul: ({ children }) => <ul className="space-y-1.5">{children}</ul>,
  li: ({ children }) => (
    <li className="flex gap-2 text-sm text-slate-700">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  p: ({ children }) => <span>{children}</span>,
  strong: ({ children }) => <strong className="font-semibold text-emerald-900">{children}</strong>,
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
    <div className="max-w-6xl mx-auto px-6 pt-6">
      <div className="bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <button onClick={alternar} className="flex items-center gap-2 text-left" aria-expanded={!recolhido}>
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <span className="font-semibold text-slate-800">Resumo do dia</span>
            {resumo && !carregando && (
              <span className="text-xs text-slate-500">
                {resumo.fonte === "ia" ? `gerado pela IA às ${horario}` : "resumo automático (IA indisponível)"}
              </span>
            )}
            {recolhido ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
          </button>
          {!recolhido && (
            <button
              onClick={() => carregar(true)}
              disabled={carregando}
              title="Gerar um novo resumo com os dados de agora"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          )}
        </div>

        {!recolhido && (
          <div className="px-5 pb-4">
            {carregando && !resumo && (
              <div className="space-y-2 animate-pulse">
                {[90, 75, 82, 60].map((w) => (
                  <div key={w} className="h-3.5 bg-emerald-100 rounded" style={{ width: `${w}%` }} />
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
      </div>
    </div>
  );
}

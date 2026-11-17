import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { MessageSquare, ThumbsUp, ThumbsDown, AlertOctagon, Timer, ChevronDown, ChevronUp } from "lucide-react";
import { API_BASE_URL } from "../api";
import { CabecalhoPagina } from "./ui";
import { SERIES, EIXO, EIXO_Y, GRADE, CURSOR_BARRA } from "./temaGraficos";
import { Dica } from "./graficos";

const FILTROS = [
  { valor: "", label: "Todas" },
  { valor: "negativas", label: "Não ajudaram" },
  { valor: "positivas", label: "Ajudaram" },
  { valor: "sem_avaliacao", label: "Sem avaliação" },
  { valor: "falhas", label: "Falhas da IA" },
];

const formatarDiaCurto = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const ROTULOS_TELA = {
  clima: "Clima & IoT",
  plantios: "Plantios",
  vendas: "Vendas",
  comercial: "Dashboard Comercial",
  estoque: "Gestão de Estoque",
  assistente: "Assistente IA",
};
const rotuloTela = (tela) => ROTULOS_TELA[tela] || "Sem aba informada";

function Interacao({ item }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-slate-800">“{item.pergunta}”</p>
        <div className="flex items-center gap-2 shrink-0">
          {item.tela && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600" title="Aba aberta ao perguntar">
              {rotuloTela(item.tela)}
            </span>
          )}
          {!item.sucesso && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">Falha</span>
          )}
          {item.feedback === 1 && <ThumbsUp className="w-4 h-4 text-emerald-600" fill="currentColor" />}
          {item.feedback === -1 && <ThumbsDown className="w-4 h-4 text-red-500" fill="currentColor" />}
          <span className="text-xs text-slate-400">{new Date(item.criado_em).toLocaleString("pt-BR")}</span>
        </div>
      </div>

      {item.comentario && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded px-2 py-1">
          <strong>O que faltou:</strong> {item.comentario}
        </p>
      )}

      {item.sucesso ? (
        <>
          <button onClick={() => setAberta((a) => !a)} className="flex items-center gap-1 text-xs font-medium text-emerald-700">
            {aberta ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {aberta ? "Esconder resposta" : "Ver resposta"}
            <span className="text-slate-400 font-normal">
              · {(item.duracao_ms / 1000).toFixed(1)} s · {item.modelo}
            </span>
          </button>
          {aberta && (
            <div className="text-sm text-slate-700 bg-slate-50 rounded p-3 [&_ul]:list-disc [&_ul]:ml-4 [&_p]:mb-2">
              <ReactMarkdown>{item.resposta}</ReactMarkdown>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-500">{item.erro}</p>
      )}
    </div>
  );
}

export default function AssistenteInsights() {
  const [estatisticas, setEstatisticas] = useState(null);
  const [interacoes, setInteracoes] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [erroConexao, setErroConexao] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      try {
        const [resEst, resInt] = await Promise.all([
          fetch(`${API_BASE_URL}/chat/estatisticas?produtor_id=1&dias=30`),
          fetch(`${API_BASE_URL}/chat/interacoes?produtor_id=1&limite=50${filtro ? `&avaliacao=${filtro}` : ""}`),
        ]);
        if (!resEst.ok || !resInt.ok) throw new Error("Erro na API");
        setEstatisticas(await resEst.json());
        setInteracoes(await resInt.json());
        setErroConexao(false);
      } catch (err) {
        console.error("Falha ao carregar o histórico do assistente:", err);
        setErroConexao(true);
      }
    };
    carregar();
  }, [filtro]);

  const e = estatisticas;
  const kpis = [
    { titulo: "Perguntas (30 dias)", valor: e ? e.total : "--", detalhe: e ? `${e.respondidas} respondidas` : "", icone: MessageSquare, cor: "text-slate-400" },
    {
      titulo: "Satisfação",
      valor: e?.satisfacao_percentual != null ? `${e.satisfacao_percentual}%` : "--",
      detalhe: e ? `${e.positivas} ajudaram e ${e.negativas} não, de ${e.avaliadas} avaliadas` : "",
      icone: ThumbsUp,
      cor: "text-slate-400",
    },
    { titulo: "Falhas da IA", valor: e ? e.falhas : "--", detalhe: "sobrecarga ou chave inválida", icone: AlertOctagon, cor: e?.falhas ? "text-red-600" : "text-slate-400" },
    { titulo: "Tempo médio", valor: e?.tempo_medio_s != null ? `${e.tempo_medio_s} s` : "--", detalhe: "por resposta", icone: Timer, cor: "text-slate-400" },
  ];

  return (
    <div className="space-y-6">
      <CabecalhoPagina sobretitulo="Inteligência" titulo="Assistente IA" descricao="O que os produtores perguntam ao chat e como avaliam as respostas">
        {erroConexao && (
          <span className="text-xs font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 self-start">
            Sem conexão com a API
          </span>
        )}
      </CabecalhoPagina>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ titulo, valor, detalhe, icone: Icone, cor }) => (
          <div key={titulo} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{titulo}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{valor}</p>
              <p className="text-xs text-slate-400 mt-1">{detalhe}</p>
            </div>
            <div className={cor}>
              <Icone className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-[15px] font-semibold text-slate-900 mb-4">Perguntas por dia (últimos 14 dias)</h2>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={e?.perguntas_por_dia || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRADE} />
              <XAxis dataKey="data" tickFormatter={formatarDiaCurto} {...EIXO} />
              <YAxis allowDecimals={false} {...EIXO_Y} width={28} />
              <Tooltip
                cursor={CURSOR_BARRA}
                content={<Dica rotulo={formatarDiaCurto} formatar={(v) => `${v} ${v === 1 ? "pergunta" : "perguntas"}`} />}
              />
              <Bar dataKey="total" name="Perguntas" fill={SERIES[0]} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-[15px] font-semibold text-slate-900">De onde perguntam</h2>
        <p className="text-xs text-slate-500 mb-4">Aba aberta no momento da pergunta (30 dias)</p>
        {!e?.por_tela?.length ? (
          <p className="text-sm text-slate-400">Sem perguntas no período.</p>
        ) : (
          <div className="space-y-3">
            {e.por_tela.map((t) => (
              <div key={t.tela ?? "nenhuma"}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">{rotuloTela(t.tela)}</span>
                  <span className="font-semibold text-slate-800">{t.total}</span>
                </div>
                <div className="h-2 mt-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-700" style={{ width: `${(t.total / e.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Perguntas recentes</h2>
          <div className="flex flex-wrap rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                onClick={() => setFiltro(f.valor)}
                className={`px-3 py-1.5 transition-colors ${
                  filtro === f.valor ? "bg-emerald-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {interacoes.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma pergunta neste filtro. Use o botão Perguntar ao assistente, no canto da tela.</p>
        ) : (
          <div className="space-y-3">
            {interacoes.map((item) => (
              <Interacao key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

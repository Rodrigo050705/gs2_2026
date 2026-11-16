import React, { useEffect, useMemo, useState } from "react";
import {
  Sprout,
  CalendarDays,
  AlertTriangle,
  Ruler,
  Plus,
  BookOpen,
  CheckCircle2,
  XCircle,
  Trash2,
  X,
} from "lucide-react";

import { API_BASE_URL } from "../api";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIA_MS = 24 * 60 * 60 * 1000;

const paraData = (iso) => new Date(`${iso}T12:00:00`);
const formatarData = (iso) => (iso ? paraData(iso).toLocaleDateString("pt-BR") : "—");
const hojeISO = () => new Date().toLocaleDateString("sv-SE");

const ESTILO_FASE = {
  Inicial: "bg-sky-50 text-sky-700 border-sky-200",
  Desenvolvimento: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Pré-colheita": "bg-amber-50 text-amber-700 border-amber-200",
  "Em colheita": "bg-orange-50 text-orange-700 border-orange-200",
  Colhido: "bg-slate-100 text-slate-600 border-slate-200",
  Perdido: "bg-red-50 text-red-700 border-red-200",
};
const estiloFase = (fase) =>
  fase?.startsWith("Atrasado") ? "bg-red-50 text-red-700 border-red-200" : ESTILO_FASE[fase] || ESTILO_FASE.Inicial;

const FORM_INICIAL = {
  cultura: "",
  variedade: "",
  talhao: "",
  area_m2: "",
  data_plantio: hojeISO(),
  ciclo_dias: "",
  janela_colheita_dias: "7",
  producao_estimada: "",
  unidade: "kg",
};

/* ---------- Linha do tempo (Gantt simples) ---------- */
function LinhaDoTempo({ plantios }) {
  const hoje = paraData(hojeISO());
  const inicio = new Date(hoje.getTime() - 30 * DIA_MS);
  const fim = new Date(hoje.getTime() + 150 * DIA_MS);
  const total = fim - inicio;
  const pos = (data) => Math.max(0, Math.min(100, ((data - inicio) / total) * 100));

  const marcosMes = [];
  for (let d = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1); d < fim; d.setMonth(d.getMonth() + 1)) {
    marcosMes.push({ left: pos(d), label: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` });
  }

  return (
    <div className="space-y-2">
      <div className="relative h-5 ml-32 text-[10px] text-slate-400">
        {marcosMes.map((m) => (
          <span key={m.label} className="absolute -translate-x-1/2" style={{ left: `${m.left}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      {plantios.map((p) => {
        const plantio = paraData(p.data_plantio);
        const iniCol = paraData(p.inicio_colheita_previsto);
        const fimCol = paraData(p.fim_colheita_previsto);
        return (
          <div key={p.id} className="flex items-center gap-2">
            <div className="w-30 shrink-0 text-xs truncate">
              <span className="font-medium text-slate-700">{p.cultura}</span>
              <span className="text-slate-400"> · {p.talhao}</span>
            </div>
            <div className="relative flex-1 h-6 bg-slate-50 rounded border border-slate-100">
              {marcosMes.map((m) => (
                <div key={m.label} className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: `${m.left}%` }} />
              ))}
              {/* Crescimento */}
              <div
                className="absolute top-1 bottom-1 rounded-l bg-emerald-200"
                style={{ left: `${pos(plantio)}%`, width: `${pos(iniCol) - pos(plantio)}%` }}
                title={`Crescimento: ${formatarData(p.data_plantio)} → ${formatarData(p.inicio_colheita_previsto)}`}
              />
              {/* Janela de colheita */}
              <div
                className="absolute top-1 bottom-1 rounded-r bg-orange-400"
                style={{ left: `${pos(iniCol)}%`, width: `${Math.max(pos(fimCol) - pos(iniCol), 0.6)}%` }}
                title={`Colheita: ${formatarData(p.inicio_colheita_previsto)} → ${formatarData(p.fim_colheita_previsto)}`}
              />
              {/* Hoje */}
              <div className="absolute -top-1 -bottom-1 border-l-2 border-red-500" style={{ left: `${pos(hoje)}%` }} />
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-4 ml-32 pt-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-200" /> Crescimento</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400" /> Janela de colheita</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-red-500" /> Hoje</span>
      </div>
    </div>
  );
}

/* ---------- Modal da ficha técnica ---------- */
function FichaTecnicaModal({ cultura, onFechar }) {
  const [ficha, setFicha] = useState(null);
  const [condicoes, setCondicoes] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const nome = encodeURIComponent(cultura);
    Promise.all([fetch(`${API_BASE_URL}/culturas/${nome}`), fetch(`${API_BASE_URL}/culturas/${nome}/condicoes?produtor_id=1`)])
      .then(async ([rFicha, rCond]) => {
        if (!rFicha.ok) throw new Error("Esta cultura ainda não tem ficha técnica cadastrada.");
        setFicha(await rFicha.json());
        if (rCond.ok) setCondicoes(await rCond.json());
      })
      .catch((e) => setErro(e.message));
  }, [cultura]);

  const faixa = (f, un) => (f ? `${f.min}–${f.max} ${un}` : "—");

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-emerald-800 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            <span className="font-semibold">Ficha técnica — {ficha?.nome || cultura}</span>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="p-1 rounded hover:bg-emerald-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {erro && <p className="text-red-600">{erro}</p>}
          {!erro && !ficha && <p className="text-slate-400">Carregando…</p>}
          {ficha && (
            <>
              {condicoes && (
                <div
                  className={`rounded-lg border px-3 py-2 ${
                    condicoes.condicoes_ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  <p className="font-semibold text-xs uppercase mb-1">Condições agora (sensores + previsão)</p>
                  {condicoes.condicoes_ok ? (
                    <p>Dentro das faixas da ficha.</p>
                  ) : (
                    <ul className="list-disc ml-4 space-y-0.5">
                      {condicoes.alertas.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-xs text-slate-500">Ciclo</dt>
                  <dd className="font-medium text-slate-800">{faixa(ficha.ciclo_dias, "dias")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Temperatura ideal</dt>
                  <dd className="font-medium text-slate-800">{faixa(ficha.temperatura_ideal_c, "°C")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Limites críticos</dt>
                  <dd className="font-medium text-slate-800">{faixa(ficha.temperatura_critica_c, "°C")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Umidade do solo ideal</dt>
                  <dd className="font-medium text-slate-800">{faixa(ficha.umidade_solo_ideal_percentual, "%")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Água por semana</dt>
                  <dd className="font-medium text-slate-800">{faixa(ficha.necessidade_hidrica_mm_semana, "mm")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Conservação</dt>
                  <dd className="font-medium text-slate-800">
                    {ficha.conservacao_pos_colheita_dias?.ambiente} dias ambiente ·{" "}
                    {ficha.conservacao_pos_colheita_dias?.refrigerado} refrigerado
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-xs text-slate-500">Época de plantio na região</p>
                <p className="text-slate-800">{ficha.epoca_plantio_regiao}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {MESES.map((m, i) => (
                    <span
                      key={m}
                      className={`text-[11px] px-1.5 py-0.5 rounded ${
                        ficha.meses_plantio?.includes(i + 1) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {ficha.ciclo_dias?.obs && <p className="text-xs text-slate-500">{ficha.ciclo_dias.obs}</p>}
              {ficha.temperatura_critica_c?.obs && <p className="text-xs text-slate-500">{ficha.temperatura_critica_c.obs}</p>}

              <div>
                <p className="text-xs text-slate-500">Colheita</p>
                <p className="text-slate-800">{ficha.colheita}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Riscos climáticos</p>
                <ul className="space-y-1.5">
                  {ficha.riscos_climaticos?.map((r) => (
                    <li key={r.risco} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                      <span className="font-medium text-slate-800">{r.risco}</span>
                      <span className="block text-xs text-slate-500">{r.condicao}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-[11px] text-slate-400">
                Valores de referência aproximados para o MVP — validar com um agrônomo.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Tela principal ---------- */
export default function PlantiosGestao() {
  const [plantios, setPlantios] = useState([]);
  const [fichas, setFichas] = useState({});
  const [filtro, setFiltro] = useState("ATIVOS");
  const [erroConexao, setErroConexao] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [mensagem, setMensagem] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(null);

  const carregarDados = async () => {
    try {
      const [resPlantios, resFichas] = await Promise.all([
        fetch(`${API_BASE_URL}/plantios?produtor_id=1`),
        fetch(`${API_BASE_URL}/culturas`),
      ]);
      if (!resPlantios.ok) throw new Error("Erro na API");
      setPlantios(await resPlantios.json());
      if (resFichas.ok) setFichas(await resFichas.json());
      setErroConexao(false);
    } catch (err) {
      console.error("Falha ao carregar plantios:", err);
      setErroConexao(true);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const ativos = useMemo(() => plantios.filter((p) => p.status === "Em andamento"), [plantios]);
  const plantiosFiltrados = useMemo(() => {
    if (filtro === "ATIVOS") return ativos;
    if (filtro === "ENCERRADOS") return plantios.filter((p) => p.status !== "Em andamento");
    return plantios;
  }, [plantios, ativos, filtro]);

  const kpis = useMemo(
    () => ({
      ativos: ativos.length,
      colheita14d: ativos.filter((p) => p.dias_para_colheita <= 14 && !p.fase.startsWith("Atrasado")).length,
      area: ativos.reduce((acc, p) => acc + (p.area_m2 || 0), 0),
      atrasados: ativos.filter((p) => p.fase.startsWith("Atrasado")).length,
    }),
    [ativos]
  );

  // Ficha correspondente à cultura digitada (para sugerir ciclo e época)
  const fichaDoForm = useMemo(() => {
    const chave = form.cultura.trim().split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return fichas[chave] || null;
  }, [form.cultura, fichas]);

  const atualizarCampo = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const criarPlantio = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setMensagem(null);
    try {
      const corpo = {
        produtor_id: 1,
        cultura: form.cultura.trim(),
        variedade: form.variedade.trim() || null,
        talhao: form.talhao.trim(),
        data_plantio: form.data_plantio,
        ciclo_dias: Number(form.ciclo_dias),
        janela_colheita_dias: Number(form.janela_colheita_dias || 7),
        unidade: form.unidade,
      };
      if (form.area_m2) corpo.area_m2 = Number(form.area_m2);
      if (form.producao_estimada) corpo.producao_estimada = Number(form.producao_estimada);

      const res = await fetch(`${API_BASE_URL}/plantios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await res.json();
      if (!res.ok) {
        const detalhe = Array.isArray(dados.detail) ? dados.detail.map((d) => d.msg).join("; ") : dados.detail;
        throw new Error(detalhe || "Não foi possível cadastrar o plantio");
      }
      setMensagem({
        tipo: "ok",
        texto: `${dados.cultura} cadastrado no ${dados.talhao}. Colheita prevista a partir de ${formatarData(dados.inicio_colheita_previsto)}.`,
      });
      setForm({ ...FORM_INICIAL, data_plantio: hojeISO() });
      carregarDados();
    } catch (err) {
      setMensagem({ tipo: "erro", texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  const mudarStatus = async (plantio, status) => {
    await fetch(`${API_BASE_URL}/plantios/${plantio.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    carregarDados();
  };

  const excluir = async (plantio) => {
    if (!window.confirm(`Excluir o plantio de ${plantio.cultura} (${plantio.talhao})? Essa ação não pode ser desfeita.`)) return;
    await fetch(`${API_BASE_URL}/plantios/${plantio.id}`, { method: "DELETE" });
    carregarDados();
  };

  const classeInput =
    "w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-emerald-500";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Plantios & Calendário de Colheita</h1>
          <p className="text-sm text-slate-500">Talhões, fases das culturas e janelas de colheita previstas</p>
        </div>
        {erroConexao && (
          <span className="text-xs font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 self-start">
            Sem conexão com a API
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { titulo: "Plantios ativos", valor: kpis.ativos, icone: Sprout, cor: "bg-emerald-50 text-emerald-600" },
          { titulo: "Colheitas em 14 dias", valor: kpis.colheita14d, icone: CalendarDays, cor: "bg-orange-50 text-orange-600" },
          { titulo: "Área em uso", valor: `${kpis.area.toLocaleString("pt-BR")} m²`, icone: Ruler, cor: "bg-blue-50 text-blue-600" },
          {
            titulo: "Atrasados",
            valor: kpis.atrasados,
            icone: AlertTriangle,
            cor: kpis.atrasados ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500",
          },
        ].map(({ titulo, valor, icone: Icone, cor }) => (
          <div key={titulo} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{titulo}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{valor}</p>
            </div>
            <div className={`p-3 rounded-lg ${cor}`}>
              <Icone className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      {/* Linha do tempo */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Calendário dos plantios ativos</h2>
        {ativos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum plantio em andamento.</p>
        ) : (
          <LinhaDoTempo plantios={ativos} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário */}
        <form onSubmit={criarPlantio} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3 self-start">
          <div className="flex items-center gap-2 mb-1">
            <Plus className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-800">Novo plantio</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cultura *</label>
              <input
                required
                list="lista-culturas"
                value={form.cultura}
                onChange={(e) => atualizarCampo("cultura", e.target.value)}
                className={classeInput}
                placeholder="Ex: Tomate"
              />
              <datalist id="lista-culturas">
                {Object.values(fichas).map((f) => (
                  <option key={f.nome} value={f.nome} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Variedade</label>
              <input value={form.variedade} onChange={(e) => atualizarCampo("variedade", e.target.value)} className={classeInput} />
            </div>
          </div>

          {fichaDoForm && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 space-y-1">
              <p>
                <strong>Ficha técnica:</strong> ciclo de {fichaDoForm.ciclo_dias.min}–{fichaDoForm.ciclo_dias.max} dias.
              </p>
              <p>Época na região: {fichaDoForm.epoca_plantio_regiao}</p>
              {!fichaDoForm.meses_plantio.includes(Number(form.data_plantio.slice(5, 7))) && (
                <p className="text-amber-700 font-medium">⚠️ A data escolhida está fora da época recomendada.</p>
              )}
              {!form.ciclo_dias && (
                <button
                  type="button"
                  onClick={() =>
                    atualizarCampo("ciclo_dias", String(Math.round((fichaDoForm.ciclo_dias.min + fichaDoForm.ciclo_dias.max) / 2)))
                  }
                  className="underline font-medium"
                >
                  Usar ciclo médio da ficha
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Talhão *</label>
              <input
                required
                value={form.talhao}
                onChange={(e) => atualizarCampo("talhao", e.target.value)}
                className={classeInput}
                placeholder="Ex: Talhão 6"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Área (m²)</label>
              <input
                type="number"
                min="1"
                value={form.area_m2}
                onChange={(e) => atualizarCampo("area_m2", e.target.value)}
                className={classeInput}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data do plantio *</label>
              <input
                required
                type="date"
                value={form.data_plantio}
                onChange={(e) => atualizarCampo("data_plantio", e.target.value)}
                className={classeInput}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ciclo (dias) *</label>
              <input
                required
                type="number"
                min="1"
                max="730"
                value={form.ciclo_dias}
                onChange={(e) => atualizarCampo("ciclo_dias", e.target.value)}
                className={classeInput}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Janela (dias)</label>
              <input
                type="number"
                min="1"
                value={form.janela_colheita_dias}
                onChange={(e) => atualizarCampo("janela_colheita_dias", e.target.value)}
                className={classeInput}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Produção est.</label>
              <input
                type="number"
                min="0"
                value={form.producao_estimada}
                onChange={(e) => atualizarCampo("producao_estimada", e.target.value)}
                className={classeInput}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Unidade</label>
              <select value={form.unidade} onChange={(e) => atualizarCampo("unidade", e.target.value)} className={classeInput}>
                <option value="kg">kg</option>
                <option value="un">un</option>
                <option value="cx">cx</option>
              </select>
            </div>
          </div>

          {mensagem && (
            <p
              className={`text-xs rounded-lg px-3 py-2 border ${
                mensagem.tipo === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {mensagem.texto}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {enviando ? "Salvando…" : "Cadastrar plantio"}
          </button>
        </form>

        {/* Lista de plantios */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium bg-white w-fit">
            {[
              { valor: "ATIVOS", label: "Em andamento" },
              { valor: "ENCERRADOS", label: "Colhidos / perdidos" },
              { valor: "TODOS", label: "Todos" },
            ].map((op) => (
              <button
                key={op.valor}
                onClick={() => setFiltro(op.valor)}
                className={`px-3 py-1.5 transition-colors ${
                  filtro === op.valor ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>

          {plantiosFiltrados.length === 0 && (
            <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-6">Nenhum plantio neste filtro.</p>
          )}

          {plantiosFiltrados.map((p) => (
            <div key={p.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">
                    {p.cultura} {p.variedade && <span className="font-normal text-slate-500">{p.variedade}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.talhao}
                    {p.area_m2 ? ` · ${p.area_m2.toLocaleString("pt-BR")} m²` : ""}
                    {p.producao_estimada ? ` · produção est. ${p.producao_estimada.toLocaleString("pt-BR")} ${p.unidade}` : ""}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${estiloFase(p.fase)}`}>{p.fase}</span>
              </div>

              {p.status === "Em andamento" && (
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{p.dias_desde_plantio} dias desde o plantio</span>
                    <span>
                      {p.dias_para_colheita > 0
                        ? `colheita em ${p.dias_para_colheita} dias`
                        : p.fase.startsWith("Atrasado")
                        ? "janela de colheita passou"
                        : "em colheita"}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${p.progresso_percentual >= 100 ? "bg-orange-400" : "bg-emerald-500"}`}
                      style={{ width: `${p.progresso_percentual}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block">Plantio</span>
                  <span className="text-slate-700">{formatarData(p.data_plantio)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Janela de colheita</span>
                  <span className="text-slate-700">
                    {formatarData(p.inicio_colheita_previsto)} → {formatarData(p.fim_colheita_previsto)}
                  </span>
                </div>
                {p.data_colheita_real && (
                  <div>
                    <span className="text-slate-400 block">Encerrado em</span>
                    <span className="text-slate-700">{formatarData(p.data_colheita_real)}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => setFichaAberta(p.cultura)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> Ficha técnica
                </button>
                {p.status === "Em andamento" && (
                  <>
                    <button
                      onClick={() => mudarStatus(p, "Colhido")}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Marcar colhido
                    </button>
                    <button
                      onClick={() => mudarStatus(p, "Perdido")}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Marcar perdido
                    </button>
                  </>
                )}
                <button
                  onClick={() => excluir(p)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {fichaAberta && <FichaTecnicaModal cultura={fichaAberta} onFechar={() => setFichaAberta(null)} />}
    </div>
  );
}

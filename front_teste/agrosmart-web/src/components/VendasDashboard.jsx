import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Percent,
  Plus,
  Filter,
} from "lucide-react";

import { API_BASE_URL } from "../api";
import { CabecalhoPagina } from "./ui";
import { SERIES, COR_OUTROS, TINTA, EIXO, EIXO_Y, GRADE, CURSOR_BARRA, emMil } from "./temaGraficos";
import { Dica, Legenda } from "./graficos";
const CANAIS = ["Feira", "Mercado local", "CEASA", "Delivery", "Outro"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const formatarMoeda = (valor) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor || 0);
const formatarData = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
const hojeISO = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local

const FORM_INICIAL = {
  produto_id: "",
  quantidade: "",
  preco_unitario: "",
  canal: "Feira",
  data_venda: hojeISO(),
  baixar_estoque: true,
};

export default function VendasDashboard() {
  const [periodo, setPeriodo] = useState(90);
  const [resumo, setResumo] = useState(null);
  const [ultimasVendas, setUltimasVendas] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [erroConexao, setErroConexao] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null); // { tipo: "ok" | "erro", texto }

  const carregarDados = async () => {
    try {
      const [resResumo, resVendas, resProdutos] = await Promise.all([
        fetch(`${API_BASE_URL}/vendas/resumo?produtor_id=1&dias=${periodo}`),
        fetch(`${API_BASE_URL}/vendas?produtor_id=1&dias=${periodo}&limite=12`),
        fetch(`${API_BASE_URL}/produtos?produtor_id=1`),
      ]);
      if (!resResumo.ok || !resVendas.ok || !resProdutos.ok) throw new Error("Erro na API");
      setResumo(await resResumo.json());
      setUltimasVendas(await resVendas.json());
      setProdutos(await resProdutos.json());
      setErroConexao(false);
    } catch (err) {
      console.error("Falha ao carregar vendas:", err);
      setErroConexao(true);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [periodo]);

  const produtoSelecionado = produtos.find((p) => String(p.id) === String(form.produto_id));

  const kpis = useMemo(() => {
    if (!resumo) return null;
    const numVendas = resumo.produtos.reduce((acc, p) => acc + p.num_vendas, 0);
    return {
      receita: resumo.receita_total,
      lucro: resumo.lucro_total,
      margem: resumo.receita_total ? (resumo.lucro_total / resumo.receita_total) * 100 : 0,
      numVendas,
    };
  }, [resumo]);

  // receita_mensal { "2026-06": { Tomate: 123, ... } } -> [{ mes: "jun/26", Tomate: 123, ..., total }]
  // Cada produto tem uma cor fixa, pela ordem do nome. Acima de 8 produtos, a cauda vira "Outros".
  const { dadosMensais, seriesMensais } = useMemo(() => {
    if (!resumo?.receita_mensal) return { dadosMensais: [], seriesMensais: [] };
    const nomes = [...new Set(Object.values(resumo.receita_mensal).flatMap((porProduto) => Object.keys(porProduto)))].sort();
    const comCor = nomes.length > SERIES.length ? nomes.slice(0, SERIES.length - 1) : nomes;
    const series = comCor.map((nome, i) => ({ nome, cor: SERIES[i] }));
    if (comCor.length < nomes.length) series.push({ nome: "Outros", cor: COR_OUTROS });
    const mesAtual = hojeISO().slice(0, 7);
    const dados = Object.entries(resumo.receita_mensal).map(([mes, porProduto]) => {
      const [ano, m] = mes.split("-");
      const linha = { mes: `${MESES[Number(m) - 1]}/${ano.slice(2)}${mes === mesAtual ? "*" : ""}`, total: 0 };
      Object.entries(porProduto).forEach(([nome, valor]) => {
        const chave = comCor.includes(nome) ? nome : "Outros";
        linha[chave] = (linha[chave] || 0) + valor;
        linha.total += valor;
      });
      return linha;
    });
    return { dadosMensais: dados, seriesMensais: series };
  }, [resumo]);

  const atualizarCampo = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const registrarVenda = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setMensagem(null);
    try {
      const corpo = {
        produtor_id: 1,
        produto_id: Number(form.produto_id),
        quantidade: Number(form.quantidade),
        canal: form.canal,
        data_venda: form.data_venda,
        baixar_estoque: form.baixar_estoque,
      };
      if (form.preco_unitario) corpo.preco_unitario = Number(form.preco_unitario);

      const res = await fetch(`${API_BASE_URL}/vendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await res.json();
      if (!res.ok) {
        const detalhe = Array.isArray(dados.detail) ? dados.detail.map((d) => d.msg).join("; ") : dados.detail;
        throw new Error(detalhe || "Não foi possível registrar a venda");
      }
      setMensagem({
        tipo: "ok",
        texto: `Venda registrada: ${dados.quantidade} ${dados.unidade} de ${dados.produto_nome} (${formatarMoeda(dados.valor_total)}).`,
      });
      setForm({ ...FORM_INICIAL, data_venda: hojeISO() });
      carregarDados();
    } catch (err) {
      setMensagem({ tipo: "erro", texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  const classeInput =
    "w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-emerald-500";

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <CabecalhoPagina sobretitulo="Comercial" titulo="Vendas" descricao="Registro de vendas, lucro realizado, tendência e sazonalidade por produto">
        {erroConexao && (
          <span className="text-xs font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 self-start">
            Sem conexão com a API
          </span>
        )}
      </CabecalhoPagina>

      {/* Filtro de período */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="w-4 h-4 text-emerald-600" />
          <span>Período de análise:</span>
        </div>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
          {[30, 90, 180].map((d) => (
            <button
              key={d}
              onClick={() => setPeriodo(d)}
              className={`px-3 py-1.5 transition-colors ${
                periodo === d ? "bg-emerald-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              Últimos {d} dias
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { titulo: "Receita", valor: formatarMoeda(kpis?.receita), icone: DollarSign, cor: "text-slate-400" },
          { titulo: "Lucro realizado", valor: formatarMoeda(kpis?.lucro), icone: TrendingUp, cor: "text-slate-400" },
          { titulo: "Margem realizada", valor: kpis ? `${kpis.margem.toFixed(1)}%` : "--", icone: Percent, cor: "text-slate-400" },
          { titulo: "Nº de vendas", valor: kpis ? kpis.numVendas : "--", icone: ShoppingCart, cor: "text-slate-400" },
        ].map(({ titulo, valor, icone: Icone, cor }) => (
          <div key={titulo} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{titulo}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{valor}</p>
              <p className="text-xs text-slate-400 mt-1">Últimos {periodo} dias</p>
            </div>
            <div className={cor}>
              <Icone className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de nova venda */}
        <form onSubmit={registrarVenda} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Plus className="w-5 h-5 text-emerald-600" />
            <h2 className="text-[15px] font-semibold text-slate-900">Registrar venda</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Produto *</label>
            <select
              required
              value={form.produto_id}
              onChange={(e) => atualizarCampo("produto_id", e.target.value)}
              className={classeInput}
            >
              <option value="">Selecione…</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.quantidade} {p.unidade} em estoque)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Quantidade {produtoSelecionado ? `(${produtoSelecionado.unidade})` : ""} *
              </label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.quantidade}
                onChange={(e) => atualizarCampo("quantidade", e.target.value)}
                className={classeInput}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Preço unitário (R$)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={produtoSelecionado ? produtoSelecionado.preco_venda.toFixed(2) : "padrão"}
                value={form.preco_unitario}
                onChange={(e) => atualizarCampo("preco_unitario", e.target.value)}
                className={classeInput}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Canal</label>
              <select value={form.canal} onChange={(e) => atualizarCampo("canal", e.target.value)} className={classeInput}>
                {CANAIS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data</label>
              <input
                type="date"
                max={hojeISO()}
                value={form.data_venda}
                onChange={(e) => atualizarCampo("data_venda", e.target.value)}
                className={classeInput}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.baixar_estoque}
              onChange={(e) => atualizarCampo("baixar_estoque", e.target.checked)}
              className="accent-emerald-600"
            />
            Dar baixa no estoque
          </label>

          {produtoSelecionado && form.quantidade && (
            <p className="text-xs text-slate-500">
              Total:{" "}
              <strong className="text-slate-700">
                {formatarMoeda(Number(form.quantidade) * Number(form.preco_unitario || produtoSelecionado.preco_venda))}
              </strong>
            </p>
          )}

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
            {enviando ? "Registrando…" : "Registrar venda"}
          </button>
        </form>

        {/* Ranking por produto */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-4">Desempenho por produto</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3 text-right">Vendido</th>
                  <th className="py-2 pr-3 text-right">Receita</th>
                  <th className="py-2 pr-3 text-right">Lucro</th>
                  <th className="py-2 pr-3 text-right">Margem</th>
                  <th className="py-2 text-right">Tendência 30d</th>
                </tr>
              </thead>
              <tbody>
                {(resumo?.produtos || []).map((p) => {
                  const t = p.tendencia_30d_percentual;
                  return (
                    <tr key={p.produto} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{p.produto}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-600">
                        {p.quantidade.toLocaleString("pt-BR")} {p.unidade}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-slate-600">{formatarMoeda(p.receita)}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-slate-800">{formatarMoeda(p.lucro)}</td>
                      <td
                        className={`py-2.5 pr-3 text-right font-medium ${
                          p.margem_realizada_percentual < 20 ? "text-amber-600" : "text-emerald-700"
                        }`}
                      >
                        {p.margem_realizada_percentual}%
                      </td>
                      <td className="py-2.5 text-right">
                        {t === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                              t >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                            }`}
                          >
                            {t >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {t > 0 ? "+" : ""}
                            {t}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {resumo && resumo.produtos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Nenhuma venda no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Receita mensal (sazonalidade) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Receita mensal por produto</h2>
            <p className="text-xs text-slate-500">
              Últimos 6 meses, em R$. O número no topo de cada coluna é o total do mês
              {dadosMensais.some((d) => d.mes.endsWith("*")) && " (* mês em andamento)"}
            </p>
          </div>
          <Legenda itens={seriesMensais} />
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosMensais} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRADE} />
              {/* No eixo só o mês ("jun"); o ano aparece na caixinha do mouse ("jun/26") */}
              <XAxis dataKey="mes" {...EIXO} interval={0} tickFormatter={(m) => m.split("/")[0] + (m.endsWith("*") ? "*" : "")} />
              <YAxis {...EIXO_Y} width={52} tickFormatter={emMil} />
              <Tooltip cursor={CURSOR_BARRA} content={<Dica formatar={formatarMoeda} mostrarTotal inverter />} />
              {seriesMensais.map(({ nome, cor }, i) => {
                const topo = i === seriesMensais.length - 1;
                return (
                  <Bar
                    key={nome}
                    dataKey={nome}
                    stackId="receita"
                    fill={cor}
                    stroke="#ffffff"
                    strokeWidth={2}
                    maxBarSize={28}
                    radius={topo ? [4, 4, 0, 0] : 0}
                    isAnimationActive={false}
                  >
                    {topo && (
                      <LabelList
                        dataKey="total"
                        position="top"
                        offset={8}
                        formatter={(v) => Math.round(v).toLocaleString("pt-BR")}
                        style={{ fill: TINTA.forte, fontSize: 12, fontWeight: 600 }}
                      />
                    )}
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Últimas vendas */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-[15px] font-semibold text-slate-900 mb-4">Últimas vendas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3">Canal</th>
                <th className="py-2 pr-3 text-right">Quantidade</th>
                <th className="py-2 pr-3 text-right">Preço un.</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ultimasVendas.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-slate-600">{formatarData(v.data_venda)}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800">{v.produto_nome}</td>
                  <td className="py-2 pr-3">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{v.canal}</span>
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-600">
                    {v.quantidade} {v.unidade}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-600">{formatarMoeda(v.preco_unitario)}</td>
                  <td className="py-2 text-right font-semibold text-slate-800">{formatarMoeda(v.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

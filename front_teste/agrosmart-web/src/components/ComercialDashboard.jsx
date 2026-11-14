import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  DollarSign,
  AlertCircle,
  TrendingUp,
  Filter,
  RefreshCw,
} from "lucide-react";

const API_BASE_URL = "http://localhost:8000/api/v1";

const formatarMoeda = (valor) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);

export default function ComercialDashboard() {
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroConexao, setErroConexao] = useState(false);

  // Estados dos Filtros de Decisão Comercial
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("TODAS");
  const [apenasMargemBaixa, setApenasMargemBaixa] = useState(false);
  const [metricaRanking, setMetricaRanking] = useState("valor_total_estoque"); // ou "quantidade"

  const carregarDadosComerciais = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/comercial?produtor_id=1`);
      if (!response.ok) throw new Error("Erro ao carregar dados comerciais");

      const dados = await response.json();
      setProdutos(dados.produtos || []);
      setErroConexao(false);
    } catch (err) {
      console.error("Falha ao buscar indicadores comerciais:", err);
      setErroConexao(true);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDadosComerciais();
  }, []);

  // Lista dinâmica de categorias disponíveis
  const categoriasDisponiveis = useMemo(() => {
    const unicas = Array.from(new Set(produtos.map((p) => p.categoria)));
    return ["TODAS", ...unicas];
  }, [produtos]);

  // Aplica filtros instantâneos sobre os produtos
  const produtosFiltrados = useMemo(() => {
    return produtos.filter((item) => {
      const passaCategoria =
        categoriaSelecionada === "TODAS" || item.categoria === categoriaSelecionada;
      const passaMargem = !apenasMargemBaixa || item.margem_percentual < 20.0;
      return passaCategoria && passaMargem;
    });
  }, [produtos, categoriaSelecionada, apenasMargemBaixa]);

  // KPIs recalculados dinamicamente conforme os filtros ativos
  const kpisDinamicos = useMemo(() => {
    const totalEstoque = produtosFiltrados.reduce(
      (acc, item) => acc + item.valor_total_estoque,
      0
    );
    const capitalRisco = produtosFiltrados
      .filter((item) => item.dias_para_vencer <= 5)
      .reduce((acc, item) => acc + item.valor_total_estoque, 0);
    const margemMedia =
      produtosFiltrados.length > 0
        ? produtosFiltrados.reduce((acc, item) => acc + item.margem_percentual, 0) /
          produtosFiltrados.length
        : 0;

    return {
      totalEstoque,
      capitalRisco,
      margemMedia: margemMedia.toFixed(1),
    };
  }, [produtosFiltrados]);

  // Dados agregados para o Indicador 2 (Capital em Risco por Validade)
  const dadosRiscoValidade = useMemo(() => {
    const critico = produtosFiltrados
      .filter((i) => i.dias_para_vencer <= 3)
      .reduce((acc, i) => acc + i.valor_total_estoque, 0);
    const atencao = produtosFiltrados
      .filter((i) => i.dias_para_vencer >= 4 && i.dias_para_vencer <= 7)
      .reduce((acc, i) => acc + i.valor_total_estoque, 0);
    const saudavel = produtosFiltrados
      .filter((i) => i.dias_para_vencer > 7)
      .reduce((acc, i) => acc + i.valor_total_estoque, 0);

    return [
      { faixa: "Crítico (≤ 3 dias)", valor: Number(critico.toFixed(2)), cor: "#dc2626" },
      { faixa: "Atenção (4 a 7 dias)", valor: Number(atencao.toFixed(2)), cor: "#f59e0b" },
      { faixa: "Saudável (> 7 dias)", valor: Number(saudavel.toFixed(2)), cor: "#059669" },
    ];
  }, [produtosFiltrados]);

  // Dados ordenados para o Indicador 3 (Ranking / Curva ABC)
  const dadosRanking = useMemo(() => {
    return [...produtosFiltrados].sort(
      (a, b) => b[metricaRanking] - a[metricaRanking]
    );
  }, [produtosFiltrados, metricaRanking]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Inteligência Comercial & Estoque
          </h1>
          <p className="text-sm text-slate-500">
            Análise de margens, risco de perda por validade e concentração de capital
          </p>
        </div>

        <button
          onClick={carregarDadosComerciais}
          className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 px-3 py-2 rounded-lg border shadow-sm transition-colors self-start"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
          <span>{erroConexao ? "Erro de conexão" : "Atualizar Dados"}</span>
        </button>
      </div>

      {/* Barra de Filtros Operacionais */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="w-4 h-4 text-emerald-600" />
          <span>Filtros Comerciais:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 1. Filtro por Categoria */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {categoriasDisponiveis.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaSelecionada(cat)}
                className={`px-3 py-1.5 transition-colors ${
                  categoriaSelecionada === cat
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {cat === "TODAS" ? "Todas Categorias" : cat}
              </button>
            ))}
          </div>

          {/* 2. Toggle Margem Baixa */}
          <button
            onClick={() => setApenasMargemBaixa(!apenasMargemBaixa)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              apenasMargemBaixa
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-amber-50"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Margem Baixa (&lt; 20%)</span>
          </button>

          {/* 3. Alternador de Métrica do Ranking */}
          <select
            value={metricaRanking}
            onChange={(e) => setMetricaRanking(e.target.value)}
            className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="valor_total_estoque">Ranking por Valor (R$)</option>
            <option value="quantidade">Ranking por Volume Físico</option>
          </select>
        </div>
      </div>

      {/* Cards de KPIs Financeiros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Valor Total em Estoque</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">
              {formatarMoeda(kpisDinamicos.totalEstoque)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {produtosFiltrados.length} culturas selecionadas
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <DollarSign className="w-7 h-7" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Capital em Risco (≤ 5 dias)
            </p>
            <p
              className={`text-3xl font-bold mt-1 ${
                kpisDinamicos.capitalRisco > 0 ? "text-red-600" : "text-slate-800"
              }`}
            >
              {formatarMoeda(kpisDinamicos.capitalRisco)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Prioridade de escoamento</p>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-lg">
            <AlertCircle className="w-7 h-7" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Margem Média de Lucro</p>
            <p
              className={`text-3xl font-bold mt-1 ${
                Number(kpisDinamicos.margemMedia) < 20
                  ? "text-amber-600"
                  : "text-blue-700"
              }`}
            >
              {kpisDinamicos.margemMedia}%
            </p>
            <p className="text-xs text-slate-400 mt-1">Meta saudável: acima de 25%</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <TrendingUp className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* INDICADOR 1: Margem de Lucro vs. Preço de Mercado */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            1. Rentabilidade: Custo vs. Preço Praticado vs. Mercado (R$)
          </h2>
          <p className="text-xs text-slate-500">
            Compare seu preço unitário com a cotação regional para identificar oportunidades de reajuste
          </p>
        </div>

        {produtosFiltrados.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            Nenhum produto encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={produtosFiltrados}
                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="nome" tick={{ fontSize: 12 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                <Tooltip formatter={(value) => formatarMoeda(value)} />
                <Legend />
                <Bar
                  dataKey="custo_unitario"
                  name="Custo Unitário (R$)"
                  fill="#94a3b8"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="preco_venda"
                  name="Seu Preço (R$)"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="preco_mercado"
                  name="Preço Mercado/CEASA (R$)"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Grade Inferior: Indicador 2 (Validade) + Indicador 3 (Curva ABC) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* INDICADOR 2: Capital em Risco por Validade */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              2. Capital por Prazo de Validade (R$)
            </h2>
            <p className="text-xs text-slate-500">
              Identifique lotes que exigem promoção rápida antes do vencimento
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dadosRiscoValidade}
                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="faixa" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                <Tooltip formatter={(value) => formatarMoeda(value)} />
                <Bar dataKey="valor" name="Valor em Estoque (R$)" radius={[6, 6, 0, 0]}>
                  {dadosRiscoValidade.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* INDICADOR 3: Ranking / Curva ABC de Estoque */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              3. Ranking por Cultura (
              {metricaRanking === "valor_total_estoque" ? "Valor R$" : "Volume"})
            </h2>
            <p className="text-xs text-slate-500">
              Culturas que concentram maior participação no estoque atual
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dadosRanking}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#64748b" />
                <YAxis
                  dataKey="nome"
                  type="category"
                  width={110}
                  tick={{ fontSize: 12 }}
                  stroke="#64748b"
                />
                <Tooltip
                  formatter={(value) =>
                    metricaRanking === "valor_total_estoque"
                      ? formatarMoeda(value)
                      : `${value} un/kg`
                  }
                />
                <Bar
                  dataKey={metricaRanking}
                  name={
                    metricaRanking === "valor_total_estoque"
                      ? "Valor Total (R$)"
                      : "Quantidade"
                  }
                  fill="#0d9488"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
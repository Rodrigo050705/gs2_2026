import React, { useEffect, useState, useMemo } from "react";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Search,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";

import { API_BASE_URL } from "../api";

const FORM_INICIAL = {
  nome: "",
  categoria: "Hortaliças",
  quantidade: "",
  unidade: "kg",
  custo_unitario: "",
  preco_venda: "",
  preco_mercado: "",
  data_validade: "",
};

const formatarMoeda = (valor) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);

export default function EstoqueGestao() {
  const [produtos, setProdutos] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagemFeedback, setMensagemFeedback] = useState(null);

  // Filtros da tabela
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("TODAS");

  const carregarProdutos = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/produtos?produtor_id=1`);
      if (!response.ok) throw new Error("Erro ao listar produtos");
      const dados = await response.json();
      setProdutos(dados);
    } catch (err) {
      console.error("Falha ao buscar produtos:", err);
    }
  };

  useEffect(() => {
    carregarProdutos();
  }, []);

  const exibirFeedback = (texto, tipo = "sucesso") => {
    setMensagemFeedback({ texto, tipo });
    setTimeout(() => setMensagemFeedback(null), 3500);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const iniciarEdicao = (produto) => {
    setEditandoId(produto.id);
    setForm({
      nome: produto.nome,
      categoria: produto.categoria,
      quantidade: String(produto.quantidade),
      unidade: produto.unidade,
      custo_unitario: String(produto.custo_unitario),
      preco_venda: String(produto.preco_venda),
      preco_mercado: String(produto.preco_mercado),
      data_validade: produto.data_validade,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setForm(FORM_INICIAL);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSalvando(true);

    const payload = {
      produtor_id: 1,
      nome: form.nome.trim(),
      categoria: form.categoria,
      quantidade: parseFloat(form.quantidade),
      unidade: form.unidade,
      custo_unitario: parseFloat(form.custo_unitario),
      preco_venda: parseFloat(form.preco_venda),
      preco_mercado: parseFloat(form.preco_mercado),
      data_validade: form.data_validade,
    };

    try {
      const url = editandoId
        ? `${API_BASE_URL}/produtos/${editandoId}`
        : `${API_BASE_URL}/produtos`;
      const method = editandoId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Erro ao salvar produto");

      await carregarProdutos();
      exibirFeedback(
        editandoId
          ? "Produto atualizado com sucesso!"
          : "Novo produto cadastrado no estoque!"
      );
      cancelarEdicao();
    } catch (err) {
      console.error(err);
      exibirFeedback("Erro ao salvar. Verifique os campos e a conexão com a API.", "erro");
    } finally {
      setSalvando(false);
    }
  };

  const ajustarQuantidadeRapida = async (produto, delta) => {
    const novaQtd = Math.max(0, Number((produto.quantidade + delta).toFixed(2)));
    try {
      const response = await fetch(`${API_BASE_URL}/produtos/${produto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidade: novaQtd }),
      });
      if (response.ok) {
        carregarProdutos();
      }
    } catch (err) {
      console.error("Erro ao ajustar quantidade:", err);
    }
  };

  const handleExcluir = async (id, nome) => {
    if (!window.confirm(`Deseja realmente remover "${nome}" do estoque?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/produtos/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await carregarProdutos();
        exibirFeedback(`"${nome}" removido do estoque.`);
      }
    } catch (err) {
      console.error("Erro ao excluir:", err);
      exibirFeedback("Falha ao excluir o item.", "erro");
    }
  };

  const produtosFiltrados = useMemo(() => {
    return produtos.filter((p) => {
      const matchNome = p.nome.toLowerCase().includes(busca.toLowerCase());
      const matchCat =
        categoriaFiltro === "TODAS" || p.categoria === categoriaFiltro;
      return matchNome && matchCat;
    });
  }, [produtos, busca, categoriaFiltro]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Gestão & Cadastro de Estoque
          </h1>
          <p className="text-sm text-slate-500">
            Controle de lotes colhidos, preços praticados e validade da produção
          </p>
        </div>

        {mensagemFeedback && (
          <div
            className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-sm border ${
              mensagemFeedback.tipo === "erro"
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {mensagemFeedback.texto}
          </div>
        )}
      </div>

      {/* Formulário de Cadastro / Edição */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-800">
              {editandoId ? "Editar Produto Selecionado" : "Cadastrar Novo Produto"}
            </h2>
          </div>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicao}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Cancelar edição
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nome do Produto / Cultura *
            </label>
            <input
              type="text"
              name="nome"
              required
              placeholder="Ex: Tomate Italiano"
              value={form.nome}
              onChange={handleChange}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Categoria *
            </label>
            <select
              name="categoria"
              value={form.categoria}
              onChange={handleChange}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-emerald-500"
            >
              <option value="Hortaliças">Hortaliças</option>
              <option value="Frutas">Frutas</option>
              <option value="Grãos">Grãos</option>
              <option value="Raízes">Raízes</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Data de Validade / Limite *
            </label>
            <input
              type="date"
              name="data_validade"
              required
              value={form.data_validade}
              onChange={handleChange}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Quantidade *
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                name="quantidade"
                required
                placeholder="100"
                value={form.quantidade}
                onChange={handleChange}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Unidade
              </label>
              <select
                name="unidade"
                value={form.unidade}
                onChange={handleChange}
                className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-emerald-500"
              >
                <option value="kg">kg</option>
                <option value="un">un</option>
                <option value="cx">cx</option>
                <option value="sc">sc</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Custo Unitário (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="custo_unitario"
              required
              placeholder="2.50"
              value={form.custo_unitario}
              onChange={handleChange}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Seu Preço de Venda (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="preco_venda"
              required
              placeholder="4.80"
              value={form.preco_venda}
              onChange={handleChange}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Preço Médio Mercado (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="preco_mercado"
              required
              placeholder="5.20"
              value={form.preco_mercado}
              onChange={handleChange}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2 pt-2">
            {editandoId && (
              <button
                type="button"
                onClick={cancelarEdicao}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={salvando}
              className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              {editandoId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>
                {salvando
                  ? "Salvando..."
                  : editandoId
                  ? "Salvar Alterações"
                  : "Adicionar ao Estoque"}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Listagem & Controle de Estoque */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-800">
            Itens em Estoque ({produtosFiltrados.length})
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-emerald-500"
            >
              <option value="TODAS">Todas Categorias</option>
              <option value="Hortaliças">Hortaliças</option>
              <option value="Frutas">Frutas</option>
              <option value="Grãos">Grãos</option>
              <option value="Raízes">Raízes</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                <th className="py-3 px-4 font-semibold">Produto</th>
                <th className="py-3 px-4 font-semibold">Estoque Atual</th>
                <th className="py-3 px-4 font-semibold">Custo / Venda</th>
                <th className="py-3 px-4 font-semibold">Margem</th>
                <th className="py-3 px-4 font-semibold">Validade</th>
                <th className="py-3 px-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {produtosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    Nenhum item encontrado no estoque.
                  </td>
                </tr>
              ) : (
                produtosFiltrados.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-800">{item.nome}</p>
                      <span className="text-xs text-slate-500">{item.categoria}</span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => ajustarQuantidadeRapida(item, -5)}
                          title="Baixar 5 unidades"
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="font-medium text-slate-800 min-w-[65px] text-center">
                          {item.quantidade} {item.unidade}
                        </span>
                        <button
                          onClick={() => ajustarQuantidadeRapida(item, 5)}
                          title="Adicionar 5 unidades"
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Total: {formatarMoeda(item.valor_total_estoque)}
                      </p>
                    </td>

                    <td className="py-3 px-4">
                      <p className="font-medium text-emerald-700">
                        {formatarMoeda(item.preco_venda)}
                      </p>
                      <p className="text-xs text-slate-400">
                        Custo: {formatarMoeda(item.custo_unitario)} | Merc:{" "}
                        {formatarMoeda(item.preco_mercado)}
                      </p>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          item.margem_percentual < 20
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {item.margem_percentual < 20 && (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {item.margem_percentual}%
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                          item.status_validade === "CRITICO"
                            ? "bg-red-100 text-red-700"
                            : item.status_validade === "ATENCAO"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.dias_para_vencer < 0
                          ? "Vencido"
                          : `${item.dias_para_vencer} dias`}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(item.data_validade + "T00:00:00").toLocaleDateString(
                          "pt-BR"
                        )}
                      </p>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => iniciarEdicao(item)}
                          title="Editar produto"
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleExcluir(item.id, item.nome)}
                          title="Excluir produto"
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
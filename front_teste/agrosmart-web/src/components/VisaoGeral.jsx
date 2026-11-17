import React, { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { API_BASE_URL } from "../api";
import ResumoDia from "./ResumoDia";
import { CabecalhoPagina, RotuloSecao, Quadro, Carimbo, Numero, BarraSegmentada } from "./ui";

const reais = (v) => (v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const brl = (v) => `R$ ${reais(v)}`;
const num = (v, casas = 1) => (v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });
const dataHora = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

async function buscar(caminho) {
  const res = await fetch(`${API_BASE_URL}${caminho}`);
  if (!res.ok) throw new Error(caminho);
  return res.json();
}

// Curva suave passando pelos pontos (Catmull-Rom convertido em Bézier)
function caminhoSuave(pts) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// Receita somada por mês, a partir de { "2026-06": { produto: valor } }
function receitaPorMes(receitaMensal) {
  const mesAtual = new Date().toLocaleDateString("sv-SE").slice(0, 7);
  return Object.entries(receitaMensal || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([chave, produtos]) => {
      const [ano, mes] = chave.split("-").map(Number);
      const nome = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      return { chave, nome, parcial: chave === mesAtual, total: Object.values(produtos).reduce((s, v) => s + v, 0) };
    });
}

function GraficoMensal({ meses }) {
  const L = 600;
  const A = 110;
  const teto = Math.max(...meses.map((m) => m.total), 1) * 1.12;
  const passo = L / meses.length;
  const pts = meses.map((m, i) => [(i + 0.5) * passo, A - (m.total / teto) * A]);
  const linha = caminhoSuave(pts);
  const area = `${linha}L${pts[pts.length - 1][0]} ${A}L${pts[0][0]} ${A}Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="block w-full h-[110px]" aria-hidden="true">
        <path d={area} fill="#ffffff" fillOpacity="0.08" />
        <path d={linha} fill="none" stroke="#cfe3c2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 grid text-center" style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}>
        {meses.map((m) => (
          <div key={m.chave}>
            <p className="text-[13px] font-semibold tabular-nums text-white">{reais(m.total)}</p>
            <p className="text-[11px] text-white/50">
              {m.nome}
              {m.parcial ? "*" : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkPara({ destino, onNavegar, children }) {
  return (
    <button
      onClick={() => onNavegar(destino)}
      className="flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-slate-500 hover:text-emerald-800 transition-colors"
    >
      {children}
      <ArrowUpRight className="w-3.5 h-3.5" />
    </button>
  );
}

// Célula da faixa de leituras: número, rótulo e uma linha de contexto
function Leitura({ valor, unidade, rotulo, detalhe, tom = "text-slate-900", onClick }) {
  return (
    <button onClick={onClick} className="bg-white px-5 py-4 text-left hover:bg-slate-50 transition-colors">
      <p className={tom}>
        <Numero valor={valor} unidade={unidade} className="text-[30px]" />
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{rotulo}</p>
      <p className="text-xs text-slate-500 truncate">{detalhe}</p>
    </button>
  );
}

export default function VisaoGeral({ onNavegar, produtor }) {
  const [dados, setDados] = useState(null);
  const [falhas, setFalhas] = useState([]);

  useEffect(() => {
    let ativo = true;
    // Cada bloco carrega independente: se uma rota falhar, as outras ainda aparecem
    const fontes = {
      leitura: "/telemetria?limite=1",
      alertas: "/alertas?apenas_pendentes=true&limite=50",
      limites: "/automacao/limites",
      comercial: "/dashboard/comercial",
      vendas: "/vendas/resumo",
      calendario: "/plantios/calendario",
    };
    Promise.allSettled(Object.values(fontes).map(buscar)).then((resultados) => {
      if (!ativo) return;
      const chaves = Object.keys(fontes);
      const obtido = {};
      const erros = [];
      resultados.forEach((r, i) => {
        if (r.status === "fulfilled") obtido[chaves[i]] = r.value;
        else erros.push(chaves[i]);
      });
      setDados(obtido);
      setFalhas(erros);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const cabecalho = (
    <CabecalhoPagina
      sobretitulo={produtor ? `${produtor.nome} · ${produtor.cidade}-${produtor.uf}` : "AgroSmart"}
      titulo="Visão geral"
      descricao="O que pede atenção hoje na lavoura, no estoque e nas vendas."
    >
      <Carimbo quando={dataHora(dados?.leitura?.[0]?.timestamp)} origem="Última leitura dos sensores" />
    </CabecalhoPagina>
  );

  if (!dados) {
    return (
      <div className="space-y-6">
        {cabecalho}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 h-64 rounded-2xl bg-[#16271d]/85 animate-pulse" />
          <div className="lg:col-span-2 h-64 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  const { comercial, vendas, limites, calendario = [], alertas = [] } = dados;
  const leitura = dados.leitura?.[0];
  const kpis = comercial?.kpis;
  const vencendo = (comercial?.produtos || [])
    .filter((p) => p.status_validade === "CRITICO")
    .sort((a, b) => a.dias_para_vencer - b.dias_para_vencer);
  const produtosVenda = [...(vendas?.produtos || [])].sort((a, b) => b.receita_ultimos_30d - a.receita_ultimos_30d);
  const receita30 = produtosVenda.reduce((s, p) => s + (p.receita_ultimos_30d || 0), 0);
  const maiorReceita = produtosVenda[0]?.receita_ultimos_30d || 1;
  const margem = vendas?.receita_total ? (vendas.lucro_total / vendas.receita_total) * 100 : 0;
  const meses = receitaPorMes(vendas?.receita_mensal);
  const proximas = calendario
    .filter((p) => p.status === "Em andamento")
    .sort((a, b) => a.dias_para_colheita - b.dias_para_colheita)
    .slice(0, 4);
  const horaLeitura = leitura ? new Date(leitura.timestamp).toLocaleTimeString("pt-BR") : null;
  const parteEmRisco = kpis?.valor_total_estoque ? (kpis.capital_em_risco / kpis.valor_total_estoque) * 100 : 0;

  return (
    <div className="space-y-6">
      {cabecalho}

      {falhas.length > 0 && (
        <p className="text-sm text-red-700 bg-red-50 px-4 py-2.5 rounded-lg border border-red-200">
          Parte dos dados não carregou ({falhas.join(", ")}). Confira se a API está no ar.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Destaque: receita do mês e a curva dos últimos meses */}
        <section className="relative lg:col-span-3 overflow-hidden rounded-2xl bg-[#16271d] p-6 text-white">
          {/* Fileiras em perspectiva, o mesmo desenho do logo, bem de leve no fundo */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">
            <g stroke="#ffffff" strokeOpacity="0.045" strokeWidth="1.5" vectorEffect="non-scaling-stroke" fill="none">
              {[-260, -120, 0, 110, 220, 340, 480, 640, 840].map((x) => (
                <path key={x} d={`M520 -40L${x} 340`} />
              ))}
            </g>
          </svg>

          <div className="relative flex h-full flex-col justify-between gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white/70">Receita nos últimos 30 dias</p>
                <p className="mt-2 leading-none">
                  <span className="mr-1.5 text-xl font-medium text-white/55">R$</span>
                  <span className="text-[56px] font-bold tracking-[-0.03em] tabular-nums">{reais(receita30)}</span>
                </p>
                <p className="mt-3 text-[13px] text-white/60">
                  Lucro de {brl(vendas?.lucro_total)} em {vendas?.periodo_dias ?? 90} dias, margem de {num(margem)}%
                </p>
              </div>
              <button
                onClick={() => onNavegar("vendas")}
                className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-[13px] font-medium text-white/85 hover:bg-white/10 transition-colors"
              >
                Ver vendas
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {meses.length > 1 && (
              <div>
                <p className="mb-1 text-xs font-medium text-white/50">
                  Receita por mês, em R$
                  {meses.some((m) => m.parcial) && " (* mês em andamento)"}
                </p>
                <GraficoMensal meses={meses} />
              </div>
            )}
          </div>
        </section>

        <div className="lg:col-span-2">
          <ResumoDia />
        </div>
      </div>

      <div className="space-y-2.5">
        <RotuloSecao
          complemento={
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${leitura ? "bg-emerald-500" : "bg-slate-300"}`} />
              {leitura ? `Estação de campo, leitura às ${horaLeitura}` : "Sem leitura dos sensores"}
            </span>
          }
        >
          Lavoura agora
        </RotuloSecao>
        {/* gap-px sobre fundo cinza desenha as divisórias entre as células */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
          <Leitura
            valor={leitura ? num(leitura.temperatura_ar) : "--"}
            unidade="°C"
            rotulo="Temperatura do ar"
            detalhe={limites ? `crítico acima de ${limites.temperatura_max_critica} °C` : "estação de campo"}
            onClick={() => onNavegar("clima")}
          />
          <Leitura
            valor={leitura ? num(leitura.umidade_ar, 0) : "--"}
            unidade="%"
            rotulo="Umidade do ar"
            detalhe="conforto térmico das folhas"
            onClick={() => onNavegar("clima")}
          />
          <Leitura
            valor={leitura ? num(leitura.umidade_solo, 0) : "--"}
            unidade="%"
            rotulo="Umidade do solo"
            detalhe={limites ? `crítico abaixo de ${limites.umidade_solo_minima_critica}%` : "estação de campo"}
            onClick={() => onNavegar("clima")}
          />
          <Leitura
            valor={alertas.length}
            rotulo="Alertas pendentes"
            detalhe={alertas.length ? alertas[0].mensagem : "nenhuma condição crítica"}
            tom={alertas.length ? "text-red-700" : "text-slate-900"}
            onClick={() => onNavegar("clima")}
          />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Quadro
          titulo="Próximas colheitas"
          contagem={proximas.length}
          subtitulo="Plantios em andamento, do mais perto de colher"
          acao={<LinkPara destino="plantios" onNavegar={onNavegar}>Plantios</LinkPara>}
        >
          {proximas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum plantio em andamento.</p>
          ) : (
            <ul className="space-y-4">
              {proximas.map((p) => (
                <li key={p.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-semibold text-slate-900">{p.cultura}</span>{" "}
                      <span className="text-slate-500">· {p.talhao}</span>
                    </p>
                    <span className="text-xs tabular-nums text-slate-600">
                      {p.dias_para_colheita <= 0 ? "colher já" : `em ${p.dias_para_colheita} dias`}
                    </span>
                  </div>
                  <BarraSegmentada percentual={p.progresso_percentual} />
                </li>
              ))}
            </ul>
          )}
        </Quadro>

        <Quadro
          titulo="Estoque em risco"
          contagem={vencendo.length}
          subtitulo="Lotes que vencem em até 3 dias"
          acao={<LinkPara destino="estoque" onNavegar={onNavegar}>Estoque</LinkPara>}
          className="flex flex-col"
        >
          {vencendo.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum lote perto do vencimento.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vencendo.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.nome}</p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {num(p.quantidade, 0)} {p.unidade} · {brl(p.valor_total_estoque)}
                    </p>
                  </div>
                  <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold tabular-nums text-red-700">
                    {p.dias_para_vencer <= 0 ? "vence hoje" : `${p.dias_para_vencer} ${p.dias_para_vencer === 1 ? "dia" : "dias"}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {kpis && (
            <div className="mt-auto pt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(parteEmRisco, 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                <span className="font-semibold tabular-nums text-slate-900">{brl(kpis.capital_em_risco)}</span> vencem em até 7 dias,
                de {brl(kpis.valor_total_estoque)} em estoque
              </p>
            </div>
          )}
        </Quadro>

        <Quadro
          titulo="Receita por produto"
          subtitulo="Últimos 30 dias e a variação contra os 30 anteriores"
          acao={<LinkPara destino="vendas" onNavegar={onNavegar}>Vendas</LinkPara>}
        >
          <ul className="space-y-3">
            {produtosVenda.map((p) => (
              <li key={p.produto}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-slate-800">{p.produto}</span>
                  <span className="flex items-baseline gap-2 tabular-nums">
                    <span className="font-semibold text-slate-900">{brl(p.receita_ultimos_30d)}</span>
                    <span className={`w-12 text-right text-xs font-medium ${p.tendencia_30d_percentual >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {p.tendencia_30d_percentual > 0 ? "+" : ""}
                      {num(p.tendencia_30d_percentual)}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-800" style={{ width: `${(p.receita_ultimos_30d / maiorReceita) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Quadro>
      </div>
    </div>
  );
}

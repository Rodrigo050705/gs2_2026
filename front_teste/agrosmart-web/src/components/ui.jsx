import React from "react";

// Peças de layout comuns às telas: cabeçalho da página, quadro, carimbo e formas de mostrar número.

// Cabeçalho de toda tela: sobretítulo em caixa-alta, título, descrição e, à direita, as ações.
export function CabecalhoPagina({ sobretitulo, titulo, descricao, children }) {
  return (
    <header className="relative pb-5 border-b border-slate-200">
      {sobretitulo && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{sobretitulo}</p>
      )}
      <div className="mt-1.5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-[30px] sm:text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-slate-900">
            {titulo}
          </h1>
          {descricao && <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{descricao}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-3 lg:justify-end">{children}</div>}
      </div>
      <span className="absolute -bottom-px left-0 h-0.5 w-14 bg-emerald-900" aria-hidden="true" />
    </header>
  );
}

// Rótulo de seção: caixa-alta pequena, com um complemento opcional à direita.
export function RotuloSecao({ children, complemento }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
      {complemento && <div className="text-xs text-slate-500">{complemento}</div>}
    </div>
  );
}

// Quadro: título com contagem opcional, subtítulo e conteúdo.
export function Quadro({ titulo, contagem, subtitulo, acao, className = "", children }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl p-5 ${className}`}>
      {titulo && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              {titulo}
              {contagem !== undefined && contagem !== null && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                  {contagem}
                </span>
              )}
            </h2>
            {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
          </div>
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

// Carimbo de atualização: data/hora em destaque e a origem do dado embaixo.
export function Carimbo({ quando, origem }) {
  return (
    <div className="leading-tight lg:text-right">
      <p className="text-sm font-semibold tabular-nums text-slate-900">{quando || "--"}</p>
      <p className="text-[11px] text-slate-500">{origem}</p>
    </div>
  );
}

// Número grande com a unidade pequena ao lado (26,9 °C).
export function Numero({ valor, unidade, className = "text-[28px]", corUnidade = "text-slate-500" }) {
  return (
    <span className={`font-bold tracking-[-0.02em] tabular-nums ${className}`}>
      {valor}
      {unidade && <span className={`ml-1 text-[0.45em] font-medium tracking-normal ${corUnidade}`}>{unidade}</span>}
    </span>
  );
}

// Barra segmentada (progresso em blocos).
export function BarraSegmentada({ percentual, segmentos = 10, cor = "bg-emerald-700" }) {
  const cheios = Math.round((Math.min(Math.max(percentual, 0), 100) / 100) * segmentos);
  return (
    <div className="flex gap-1" role="img" aria-label={`${Math.round(percentual)}%`}>
      {Array.from({ length: segmentos }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < cheios ? cor : "bg-slate-200"}`} />
      ))}
    </div>
  );
}

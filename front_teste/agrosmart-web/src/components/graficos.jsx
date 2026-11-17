import React from "react";

// Peças dos gráficos: a legenda e a caixinha que aparece ao passar o mouse.
// Cores, eixos e grade ficam em temaGraficos.js.

// Legenda: o quadradinho leva a cor, o texto fica na cor de texto.
export function Legenda({ itens }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {itens.map(({ nome, cor }) => (
        <li key={nome} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: cor }} aria-hidden="true" />
          {nome}
        </li>
      ))}
    </ul>
  );
}

// Caixinha do mouse (use em <Tooltip content={<Dica ... />} />): todas as séries daquele ponto,
// com o valor em destaque. `inverter` lista de cima para baixo, como a pilha aparece na coluna.
export function Dica({ active, payload, label, formatar = (v) => v, rotulo, mostrarTotal = false, inverter = false }) {
  if (!active || !payload?.length) return null;
  const linhas = payload.filter((p) => p.value !== undefined && p.value !== null);
  if (inverter) linhas.reverse();
  const total = linhas.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="min-w-[11rem] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(18,36,26,0.14)]">
      <p className="mb-1.5 font-medium text-slate-500">{rotulo ? rotulo(label) : label}</p>
      {linhas.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-5 py-0.5">
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} aria-hidden="true" />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums text-slate-900">{formatar(p.value, p)}</span>
        </div>
      ))}
      {mostrarTotal && linhas.length > 1 && (
        <div className="mt-1.5 flex items-center justify-between gap-5 border-t border-slate-100 pt-1.5">
          <span className="text-slate-600">Total</span>
          <span className="font-semibold tabular-nums text-slate-900">{formatar(total)}</span>
        </div>
      )}
    </div>
  );
}

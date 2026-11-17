// Estilo único dos gráficos: paleta, eixos e grade. A legenda e a caixinha do mouse ficam em graficos.jsx.

// Cores das séries, em ordem fixa (verde, âmbar, azul, terracota, uva, turquesa, castanho, rosa).
// A ordem importa: cada cor foi conferida contra a vizinha para leitores com daltonismo
// (protanopia e deuteranopia), então use na sequência e não pule nem repita.
export const SERIES = ["#2f7d46", "#e0a21b", "#3a7cc0", "#c4532d", "#7a55a8", "#1c9a8a", "#a8662a", "#d76a93"];
export const COR_OUTROS = "#9aa497"; // série de contexto ou a cauda agrupada em "Outros"

// Cores de estado: só para o que significa bom / atenção / crítico, nunca para uma série qualquer.
export const STATUS = { critico: "#d03b3b", atencao: "#fab219", bom: "#2f9e44" };

export const TINTA = { forte: "#161b17", media: "#525d53", suave: "#6f7a6e", grade: "#e6eae3", eixo: "#c8cfc5" };

// Props prontas para os componentes do Recharts
export const EIXO = { tick: { fontSize: 12, fill: TINTA.suave }, tickLine: false, axisLine: { stroke: TINTA.eixo }, tickMargin: 8 };
export const EIXO_Y = { tick: { fontSize: 12, fill: TINTA.suave }, tickLine: false, axisLine: false, width: 44 };
export const GRADE = { stroke: TINTA.grade, vertical: false };
export const CURSOR_BARRA = { fill: "rgba(22, 27, 23, 0.05)" };
export const CURSOR_LINHA = { stroke: TINTA.eixo, strokeWidth: 1 };

// 0 / 2,5 mil / 5 mil
export const emMil = (v) => (v === 0 ? "0" : `${(v / 1000).toLocaleString("pt-BR")} mil`);

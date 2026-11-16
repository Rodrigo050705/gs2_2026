import React, { useEffect, useState } from "react";
import { CloudRain, CloudSun, Sun, Wind, MapPin, Leaf, CheckCircle2 } from "lucide-react";

const API_BASE_URL = "http://localhost:8000/api/v1";
const ATUALIZAR_A_CADA_MS = 10 * 60 * 1000; // a previsão muda pouco

const iconeDoDia = (d) => {
  if (d.prob_chuva_percentual >= 60 || d.chuva_mm >= 5) return { Icone: CloudRain, cor: "text-blue-600 bg-blue-50" };
  if (d.prob_chuva_percentual >= 30 || d.chuva_mm >= 1) return { Icone: CloudSun, cor: "text-slate-600 bg-slate-100" };
  return { Icone: Sun, cor: "text-amber-500 bg-amber-50" };
};

export default function PrevisaoTempo() {
  const [previsao, setPrevisao] = useState(null);
  const [alertasCulturas, setAlertasCulturas] = useState([]);
  const [erro, setErro] = useState(null);

  const carregar = async () => {
    try {
      const [resPrev, resPlantios] = await Promise.all([
        fetch(`${API_BASE_URL}/previsao?produtor_id=1`),
        fetch(`${API_BASE_URL}/plantios?produtor_id=1&status=Em%20andamento`),
      ]);
      if (!resPrev.ok) throw new Error((await resPrev.json()).detail || "Previsão indisponível");
      setPrevisao(await resPrev.json());
      setErro(null);

      // Alertas agronômicos das culturas plantadas (sensores + previsão x ficha técnica)
      if (resPlantios.ok) {
        const culturas = [...new Set((await resPlantios.json()).map((p) => p.cultura))];
        const resultados = await Promise.all(
          culturas.map((c) =>
            fetch(`${API_BASE_URL}/culturas/${encodeURIComponent(c)}/condicoes?produtor_id=1`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        );
        setAlertasCulturas(resultados.filter(Boolean));
      }
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, ATUALIZAR_A_CADA_MS);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Previsão de 7 dias */}
      <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Previsão para os próximos 7 dias</h2>
          {previsao && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              {previsao.local} · {previsao.fonte}
            </span>
          )}
        </div>

        {erro && <p className="text-sm text-slate-400">{erro}</p>}
        {!erro && !previsao && <p className="text-sm text-slate-400">Carregando previsão…</p>}

        {previsao && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {previsao.dias.map((d, i) => {
                const { Icone, cor } = iconeDoDia(d);
                return (
                  <div key={d.data} className={`rounded-lg border p-2.5 text-center ${i === 0 ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
                    <p className="text-xs font-semibold text-slate-700 capitalize">{i === 0 ? "Hoje" : d.dia_semana.slice(0, 3)}</p>
                    <p className="text-[11px] text-slate-400">
                      {d.data.slice(8, 10)}/{d.data.slice(5, 7)}
                    </p>
                    <div className={`mx-auto my-2 w-9 h-9 rounded-full flex items-center justify-center ${cor}`}>
                      <Icone className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">
                      {Math.round(d.temp_max)}° <span className="font-normal text-slate-400">{Math.round(d.temp_min)}°</span>
                    </p>
                    <p className="text-[11px] text-blue-600 mt-1">
                      {d.chuva_mm} mm · {d.prob_chuva_percentual}%
                    </p>
                    <p className="text-[11px] text-slate-400 flex items-center justify-center gap-0.5 mt-0.5">
                      <Wind className="w-3 h-3" /> {Math.round(d.vento_max_kmh)} km/h
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-600">
              <span>
                Chuva total prevista: <strong>{previsao.chuva_total_mm} mm</strong>
              </span>
              <span>
                Evapotranspiração prevista: <strong>{previsao.evapotranspiracao_total_mm} mm</strong>
              </span>
              <span className={previsao.chuva_total_mm < previsao.evapotranspiracao_total_mm ? "text-amber-700" : "text-emerald-700"}>
                {previsao.chuva_total_mm < previsao.evapotranspiracao_total_mm
                  ? "Balanço hídrico negativo: a chuva não repõe toda a água perdida"
                  : "Balanço hídrico positivo: chuva repõe a água perdida"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Alertas agronômicos por cultura */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Leaf className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-800">Condições por cultura</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">Sensores e previsão comparados com a ficha técnica de cada cultura plantada.</p>
        {alertasCulturas.length === 0 ? (
          <p className="text-sm text-slate-400">Sem culturas plantadas com ficha técnica.</p>
        ) : (
          <div className="space-y-3">
            {alertasCulturas.map((c) => (
              <div
                key={c.cultura}
                className={`rounded-lg border px-3 py-2 ${c.condicoes_ok ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}
              >
                <p className={`text-sm font-semibold flex items-center gap-1.5 ${c.condicoes_ok ? "text-emerald-800" : "text-amber-800"}`}>
                  {c.condicoes_ok && <CheckCircle2 className="w-4 h-4" />}
                  {c.cultura}
                </p>
                {c.condicoes_ok ? (
                  <p className="text-xs text-emerald-700">Dentro das faixas ideais.</p>
                ) : (
                  <ul className="text-xs text-amber-800 list-disc ml-4 mt-1 space-y-0.5">
                    {c.alertas.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

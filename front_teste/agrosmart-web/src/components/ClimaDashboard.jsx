import React, { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Thermometer,
  Droplets,
  Sprout,
  AlertTriangle,
  RefreshCw,
  Filter,
} from "lucide-react";
import PrevisaoTempo from "./PrevisaoTempo";

const API_BASE_URL = "http://localhost:8000/api/v1";

export default function ClimaDashboard() {
  const [telemetria, setTelemetria] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [erroConexao, setErroConexao] = useState(false);

  // Estados dos Filtros de Decisão
  const [limiteLeituras, setLimiteLeituras] = useState(15);
  const [sensorSelecionado, setSensorSelecionado] = useState("TODOS");
  const [apenasCriticos, setApenasCriticos] = useState(false);

  const carregarDados = async () => {
    try {
      const [resTel, resAlertas] = await Promise.all([
        fetch(`${API_BASE_URL}/telemetria?limite=${limiteLeituras}&produtor_id=1`),
        fetch(`${API_BASE_URL}/alertas?produtor_id=1`),
      ]);

      if (!resTel.ok || !resAlertas.ok) throw new Error("Erro na resposta da API");

      const dadosTel = await resTel.json();
      const dadosAlertas = await resAlertas.json();

      const dadosFormatados = dadosTel.map((item) => ({
        ...item,
        isCritico: item.temperatura_ar > 32 || item.umidade_solo < 30,
        horaFormatada: new Date(item.timestamp).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }));

      setTelemetria(dadosFormatados);
      setAlertas(dadosAlertas);
      setUltimaAtualizacao(new Date().toLocaleTimeString("pt-BR"));
      setErroConexao(false);
    } catch (err) {
      console.error("Falha ao buscar telemetria:", err);
      setErroConexao(true);
    }
  };

  // Recarrega imediatamente sempre que o usuário mudar a janela de tempo
  useEffect(() => {
    carregarDados();
    const interval = setInterval(carregarDados, 5000);
    return () => clearInterval(interval);
  }, [limiteLeituras]);

  // Extrai dinamicamente os sensores presentes nas leituras para montar o dropdown
  const sensoresDisponiveis = useMemo(() => {
    const unicos = Array.from(new Set(telemetria.map((t) => t.sensor_id)));
    return unicos.length > 0 ? unicos : ["estacao-campo-01"];
  }, [telemetria]);

  // Aplica os filtros instantâneos de Sensor e Condição Crítica
  const dadosFiltrados = useMemo(() => {
    return telemetria.filter((item) => {
      const passaSensor =
        sensorSelecionado === "TODOS" || item.sensor_id === sensorSelecionado;
      const passaCritico = !apenasCriticos || item.isCritico;
      return passaSensor && passaCritico;
    });
  }, [telemetria, sensorSelecionado, apenasCriticos]);

  // KPIs baseados na última leitura do conjunto filtrado (ou geral)
  const leituraAtual =
    dadosFiltrados.length > 0
      ? dadosFiltrados[dadosFiltrados.length - 1]
      : telemetria[telemetria.length - 1] || null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Monitoramento Climático & IoT
          </h1>
          <p className="text-sm text-slate-500">
            Telemetria em tempo real da estação de campo e alertas automáticos
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-3 py-2 rounded-lg border shadow-sm">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
          <span>
            {erroConexao
              ? "Sem conexão com a API"
              : `Atualizado às ${ultimaAtualizacao || "--:--:--"}`}
          </span>
        </div>
      </div>

      {/* Barra de Filtros Operacionais */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="w-4 h-4 text-emerald-600" />
          <span>Filtros de Decisão:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 1. Janela de Tempo */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {[
              { label: "Tempo Real (15)", valor: 15 },
              { label: "Recente (30)", valor: 30 },
              { label: "Estendido (60)", valor: 60 },
            ].map((opcao) => (
              <button
                key={opcao.valor}
                onClick={() => setLimiteLeituras(opcao.valor)}
                className={`px-3 py-1.5 transition-colors ${
                  limiteLeituras === opcao.valor
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {opcao.label}
              </button>
            ))}
          </div>

          {/* 2. Seletor de Setor / Sensor */}
          <select
            value={sensorSelecionado}
            onChange={(e) => setSensorSelecionado(e.target.value)}
            className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="TODOS">Todos os Setores</option>
            {sensoresDisponiveis.map((sensor) => (
              <option key={sensor} value={sensor}>
                Sensor: {sensor}
              </option>
            ))}
          </select>

          {/* 3. Toggle de Condição Crítica */}
          <button
            onClick={() => setApenasCriticos(!apenasCriticos)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              apenasCriticos
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-red-50"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Apenas Leituras Críticas</span>
          </button>
        </div>
      </div>

      {/* Cards de KPIs Atuais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Temperatura do Ar</p>
            <p
              className={`text-3xl font-bold mt-1 ${
                leituraAtual?.temperatura_ar > 32 ? "text-red-600" : "text-slate-800"
              }`}
            >
              {leituraAtual ? `${leituraAtual.temperatura_ar}°C` : "--"}
            </p>
            <p className="text-xs text-slate-400 mt-1">Limite ideal: até 32°C</p>
          </div>
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
            <Thermometer className="w-7 h-7" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Umidade do Ar</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">
              {leituraAtual ? `${leituraAtual.umidade_ar}%` : "--"}
            </p>
            <p className="text-xs text-slate-400 mt-1">Conforto térmico foliar</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Droplets className="w-7 h-7" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Umidade do Solo</p>
            <p
              className={`text-3xl font-bold mt-1 ${
                leituraAtual?.umidade_solo < 30 ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {leituraAtual ? `${leituraAtual.umidade_solo}%` : "--"}
            </p>
            <p className="text-xs text-slate-400 mt-1">Mínimo recomendado: 30%</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Sprout className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Previsão do tempo + condições por cultura */}
      <PrevisaoTempo />

      {/* Gráfico Principal (Recharts) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            Histórico de Sensores ({dadosFiltrados.length} registros exibidos)
          </h2>
          {apenasCriticos && (
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
              Exibindo apenas picos de estresse térmico/hídrico
            </span>
          )}
        </div>

        {dadosFiltrados.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
            {apenasCriticos
              ? "Nenhuma leitura crítica encontrada na janela selecionada."
              : "Aguardando leituras do simulador IoT..."}
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dadosFiltrados}
                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="horaFormatada" tick={{ fontSize: 12 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Legend />
                {/* Linhas de referência visual dos limiares críticos */}
                <ReferenceLine
                  y={32}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: "Máx Temp (32°C)", fill: "#ef4444", fontSize: 10 }}
                />
                <ReferenceLine
                  y={30}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  label={{ value: "Mín Solo (30%)", fill: "#059669", fontSize: 10 }}
                />
                <Line
                  type="monotone"
                  dataKey="temperatura_ar"
                  name="Temp. Ar (°C)"
                  stroke="#ea580c"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="umidade_ar"
                  name="Umidade Ar (%)"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="umidade_solo"
                  name="Umidade Solo (%)"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Feed de Alertas Automáticos */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-800">
            Alertas Disparados pela Automação
          </h2>
        </div>

        {alertas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum alerta crítico registrado. Condições climáticas dentro dos parâmetros ideais.
          </p>
        ) : (
          <div className="space-y-3">
            {alertas.map((alerta) => (
              <div
                key={alerta.id}
                className="flex items-start justify-between p-3.5 rounded-lg bg-red-50 border border-red-200"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-red-600 text-white">
                      {alerta.tipo} • {alerta.severidade}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(alerta.criado_em).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-red-900 pt-1">
                    {alerta.mensagem}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
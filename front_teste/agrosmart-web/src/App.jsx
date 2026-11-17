import React, { useEffect, useState } from "react";
import { RefreshCw, Menu, X, MapPin, LogOut } from "lucide-react";
import VisaoGeral from "./components/VisaoGeral";
import ClimaDashboard from "./components/ClimaDashboard";
import ComercialDashboard from "./components/ComercialDashboard";
import EstoqueGestao from "./components/EstoqueGestao";
import VendasDashboard from "./components/VendasDashboard";
import PlantiosGestao from "./components/PlantiosGestao";
import ChatWidget from "./components/ChatWidget";
import AssistenteInsights from "./components/AssistenteInsights";
import Logo from "./components/Logo";
import Login from "./components/Login";
import { API_BASE_URL, EVENTO_SESSAO_EXPIRADA, obterUsuarioAtual, sair } from "./api";

// `curto` aparece no menu; `label` é o nome completo da tela (o chat mostra em qual tela você está)
const ABAS = [
  { id: "visao", curto: "Visão geral", label: "Visão geral", Tela: VisaoGeral },
  { id: "clima", curto: "Clima", label: "Clima & IoT", Tela: ClimaDashboard },
  { id: "plantios", curto: "Plantios", label: "Plantios", Tela: PlantiosGestao },
  { id: "vendas", curto: "Vendas", label: "Vendas", Tela: VendasDashboard },
  { id: "comercial", curto: "Comercial", label: "Dashboard Comercial", Tela: ComercialDashboard },
  { id: "estoque", curto: "Estoque", label: "Gestão de Estoque", Tela: EstoqueGestao },
  { id: "assistente", curto: "Assistente", label: "Assistente IA", Tela: AssistenteInsights },
];

// A API do chat só conhece as abas de dados; a Visão geral conversa sem contexto de tela
const ABAS_DO_CHAT = new Set(["clima", "plantios", "vendas", "comercial", "estoque", "assistente"]);

// Porta de entrada: confere a sessão (cookie HttpOnly) e mostra o login ou o painel.
function App() {
  // undefined = verificando a sessão; null = sem login; objeto = usuário logado
  const [usuario, setUsuario] = useState(undefined);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    obterUsuarioAtual().then(setUsuario).catch(() => setUsuario(null));
    // Qualquer 401 da API (sessão vencida ou encerrada) volta para o login
    const expirou = () => {
      setUsuario((atual) => {
        if (atual) setAviso("Sua sessão terminou. Entre de novo.");
        return null;
      });
    };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
  }, []);

  if (usuario === undefined) return <div className="min-h-screen" />;
  if (!usuario) {
    return (
      <Login
        aviso={aviso}
        aoEntrar={(u) => {
          setAviso("");
          setUsuario(u);
        }}
      />
    );
  }
  return (
    <Painel
      usuario={usuario}
      aoSair={async () => {
        await sair();
        setUsuario(null);
      }}
    />
  );
}

function Painel({ usuario, aoSair }) {
  const [abaAtiva, setAbaAtiva] = useState("visao");
  const [menuAberto, setMenuAberto] = useState(false);
  const [produtor, setProdutor] = useState(null);
  // Incrementar a versão remonta a tela ativa, que busca os dados de novo
  const [versao, setVersao] = useState(0);
  const [girando, setGirando] = useState(false);
  const aba = ABAS.find((a) => a.id === abaAtiva);
  const TelaAtiva = aba.Tela;

  useEffect(() => {
    fetch(`${API_BASE_URL}/produtores/1`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProdutor)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (e) => e.key === "Escape" && setMenuAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [menuAberto]);

  const irPara = (id) => {
    setAbaAtiva(id);
    setMenuAberto(false);
    window.scrollTo({ top: 0 });
  };

  const atualizar = () => {
    setVersao((v) => v + 1);
    setGirando(true);
    setTimeout(() => setGirando(false), 700);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-[1400px] h-14 px-4 sm:px-6 flex items-center gap-6">
          <button onClick={() => irPara("visao")} aria-label="AgroSmart, ir para a Visão geral" className="shrink-0">
            <Logo />
          </button>

          {/* Telas em linha a partir de telas médias */}
          <nav className="hidden lg:flex h-full items-stretch gap-1" aria-label="Telas do sistema">
            {ABAS.map(({ id, curto }) => {
              const ativa = abaAtiva === id;
              return (
                <button
                  key={id}
                  onClick={() => irPara(id)}
                  aria-current={ativa ? "page" : undefined}
                  className={`relative px-3 text-sm transition-colors ${
                    ativa ? "font-semibold text-slate-900" : "font-medium text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {curto}
                  {ativa && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-emerald-900" aria-hidden="true" />}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {produtor && (
              <span className="hidden xl:flex items-center gap-1.5 text-[13px] text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium text-slate-800">{produtor.nome}</span>
                <span className="text-slate-400">·</span>
                {produtor.cidade}-{produtor.uf}
              </span>
            )}
            <button
              onClick={atualizar}
              title="Buscar os dados desta tela de novo"
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${girando ? "animate-spin" : ""}`} strokeWidth={1.75} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <button
              onClick={aoSair}
              title={`Sair (${usuario.nome || usuario.usuario})`}
              aria-label="Sair"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
              <span className="hidden md:inline">Sair</span>
            </button>
            <button
              onClick={() => setMenuAberto((m) => !m)}
              aria-expanded={menuAberto}
              aria-controls="menu-telas"
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              className="lg:hidden p-2 -mr-2 rounded-lg text-slate-700 hover:bg-slate-100"
            >
              {menuAberto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Telas estreitas: a lista abre embaixo da barra */}
        {menuAberto && (
          <nav id="menu-telas" className="lg:hidden border-t border-slate-200 bg-white" aria-label="Telas do sistema">
            <ul className="mx-auto max-w-[1400px] px-2 py-2">
              {ABAS.map(({ id, label }) => {
                const ativa = abaAtiva === id;
                return (
                  <li key={id}>
                    <button
                      onClick={() => irPara(id)}
                      aria-current={ativa ? "page" : undefined}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-3 text-[15px] text-left ${
                        ativa ? "bg-emerald-50 font-semibold text-emerald-950" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                      {ativa && <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-8 pb-24">
        {abaAtiva === "visao" ? (
          <VisaoGeral key={`visao-${versao}`} onNavegar={irPara} produtor={produtor} />
        ) : (
          <TelaAtiva key={`${abaAtiva}-${versao}`} />
        )}
      </main>

      <ChatWidget tela={ABAS_DO_CHAT.has(abaAtiva) ? abaAtiva : undefined} rotuloTela={aba.label} />
    </div>
  );
}

export default App;

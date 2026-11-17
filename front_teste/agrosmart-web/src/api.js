// Base da API. Relativa por padrão: em dev o Vite repassa /api para http://127.0.0.1:8000
// (vite.config.js) e no container o nginx repassa para o serviço da API (nginx.conf).
// Assim o mesmo build serve qualquer ambiente. VITE_API_URL só é necessário para apontar
// o front para uma API em outro endereço.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

// Autenticação: a sessão é um cookie HttpOnly que o navegador manda sozinho (mesma origem).
// Se qualquer chamada da API voltar 401 (sessão vencida ou encerrada), avisamos o App, que
// volta para a tela de login. Assim as telas continuam usando fetch() normalmente.
export const EVENTO_SESSAO_EXPIRADA = "agrosmart:sessao-expirada";

export function instalarAvisoDeSessao() {
  if (window.__agrosmartFetchInstalado) return;
  window.__agrosmartFetchInstalado = true;
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (entrada, opcoes) => {
    const resp = await fetchOriginal(entrada, { credentials: "same-origin", ...opcoes });
    const url = typeof entrada === "string" ? entrada : entrada?.url || "";
    if (resp.status === 401 && url.startsWith(API_BASE_URL) && !url.endsWith("/auth/login")) {
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
    }
    return resp;
  };
}

export async function obterUsuarioAtual() {
  const resp = await fetch(`${API_BASE_URL}/auth/me`);
  return resp.ok ? resp.json() : null;
}

export async function entrar(usuario, senha) {
  const resp = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados.detail || "Não foi possível entrar.");
  return dados;
}

export async function sair() {
  await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST" }).catch(() => {});
}

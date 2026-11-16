import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

// Estilo dos elementos Markdown das respostas da IA (Tailwind zera listas/títulos por padrão)
const MD_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-emerald-900">{children}</strong>,
  h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline">
      {children}
    </a>
  ),
};

const API_BASE_URL = "http://localhost:8000/api/v1";

const SUGESTOES = [
  "O que vou colher nas próximas 2 semanas?",
  "Qual produto mais me dá lucro?",
  "Qual o melhor momento para produzir morango?",
  "Vou precisar irrigar esta semana?",
];

export default function ChatWidget() {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([
    { papel: "model", texto: "Olá! Sou o assistente AgroSmart. Pergunte sobre seu estoque, vendas ou clima. 🌱" },
  ]);
  const [entrada, setEntrada] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregando, aberto]);

  async function enviar(texto) {
    const pergunta = (texto ?? entrada).trim();
    if (!pergunta || carregando) return;

    // histórico sem a mensagem de boas-vindas
    const historico = mensagens.slice(1);
    setMensagens((m) => [...m, { papel: "user", texto: pergunta }]);
    setEntrada("");
    setCarregando(true);

    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtor_id: 1, mensagem: pergunta, historico }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro no servidor");
      setMensagens((m) => [...m, { papel: "model", texto: data.resposta }]);
    } catch (err) {
      setMensagens((m) => [
        ...m,
        {
          papel: "model",
          texto: `⚠️ ${err.message === "Failed to fetch" ? "Não consegui falar com o servidor. A API está rodando?" : err.message}`,
          erro: true,
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto((a) => !a)}
        className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-emerald-700 text-white text-2xl shadow-lg hover:bg-emerald-800 transition-colors"
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente"}
      >
        {aberto ? "✕" : "💬"}
      </button>

      {/* Janela do chat */}
      {aberto && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="bg-emerald-800 px-4 py-3 text-white">
            <p className="font-semibold">Assistente AgroSmart</p>
            <p className="text-xs text-emerald-100">Responde com base nos seus dados</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {mensagens.map((m, i) => (
              <div key={i} className={`flex ${m.papel === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.papel === "user" ? "whitespace-pre-wrap" : ""
                  } ${
                    m.papel === "user"
                      ? "bg-emerald-700 text-white rounded-br-sm"
                      : m.erro
                      ? "bg-red-50 text-red-700 border border-red-200 rounded-bl-sm"
                      : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                  }`}
                >
                  {m.papel === "user" ? (
                    m.texto
                  ) : (
                    <ReactMarkdown components={MD_COMPONENTS}>{m.texto}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {carregando && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                  Analisando seus dados…
                </div>
              </div>
            )}

            {mensagens.length === 1 && !carregando && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
            className="flex gap-2 border-t border-slate-200 p-2"
          >
            <input
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              placeholder="Digite sua pergunta…"
              maxLength={2000}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              disabled={carregando || !entrada.trim()}
              className="rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}

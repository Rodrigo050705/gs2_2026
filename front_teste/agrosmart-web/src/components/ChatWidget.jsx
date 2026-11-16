import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ThumbsUp, ThumbsDown } from "lucide-react";

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

import { API_BASE_URL } from "../api";

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

    // histórico sem a mensagem de boas-vindas e sem os avisos de erro
    const historico = mensagens
      .slice(1)
      .filter((m) => !m.erro)
      .map(({ papel, texto: t }) => ({ papel, texto: t }));
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
      setMensagens((m) => [...m, { papel: "model", texto: data.resposta, interacaoId: data.interacao_id }]);
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

  const atualizarMensagem = (indice, campos) =>
    setMensagens((lista) => lista.map((m, i) => (i === indice ? { ...m, ...campos } : m)));

  // 👍/👎 numa resposta. No 👎 abre um campo opcional "o que faltou?".
  async function avaliar(indice, nota, comentario) {
    const m = mensagens[indice];
    atualizarMensagem(indice, { feedback: nota, comentarioEnviado: comentario !== undefined });
    try {
      await fetch(`${API_BASE_URL}/chat/${m.interacaoId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota, comentario }),
      });
    } catch {
      /* avaliação é opcional: se falhar, não atrapalha a conversa */
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
              <div key={i} className={`flex flex-col ${m.papel === "user" ? "items-end" : "items-start"}`}>
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

                {/* Avaliação da resposta */}
                {m.interacaoId && (
                  <div className="mt-1 ml-1 flex items-center gap-1 text-xs text-slate-400">
                    {m.feedback ? (
                      <span>{m.feedback === 1 ? "Obrigado pela avaliação!" : "Obrigado, vamos melhorar."}</span>
                    ) : (
                      <span>Esta resposta ajudou?</span>
                    )}
                    {[
                      { nota: 1, Icone: ThumbsUp, cor: "text-emerald-600", rotulo: "Ajudou" },
                      { nota: -1, Icone: ThumbsDown, cor: "text-red-500", rotulo: "Não ajudou" },
                    ].map(({ nota, Icone, cor, rotulo }) => (
                      <button
                        key={nota}
                        onClick={() => avaliar(i, nota)}
                        aria-label={rotulo}
                        title={rotulo}
                        className={`rounded p-1 hover:bg-slate-200 ${m.feedback === nota ? cor : ""}`}
                      >
                        <Icone className="h-3.5 w-3.5" fill={m.feedback === nota ? "currentColor" : "none"} />
                      </button>
                    ))}
                  </div>
                )}
                {m.feedback === -1 && !m.comentarioEnviado && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      avaliar(i, -1, m.rascunho || "");
                    }}
                    className="mt-1 ml-1 flex w-[85%] gap-1"
                  >
                    <input
                      autoFocus
                      value={m.rascunho || ""}
                      onChange={(e) => atualizarMensagem(i, { rascunho: e.target.value })}
                      maxLength={500}
                      placeholder="O que faltou? (opcional)"
                      className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-emerald-600"
                    />
                    <button type="submit" className="rounded-lg bg-slate-700 px-2 text-xs text-white">
                      Enviar
                    </button>
                  </form>
                )}
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

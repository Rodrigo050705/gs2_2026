import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ThumbsUp, ThumbsDown, X, ArrowUp, ArrowUpRight, AlertCircle } from "lucide-react";
import { LogoSimbolo } from "./Logo";

// Estilo dos elementos Markdown das respostas da IA (Tailwind zera listas/títulos por padrão)
const MD_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
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

// Sugestões de acordo com a aba aberta (o backend também recebe a aba e interpreta "isso", "aqui" etc.)
const SUGESTOES_POR_TELA = {
  clima: ["Vou precisar irrigar esta semana?", "Tem risco de doença com esse clima?", "O que esses alertas significam?"],
  plantios: ["O que vou colher nas próximas 2 semanas?", "Quando devo plantar morango?", "Qual talhão fica livre primeiro?"],
  vendas: ["Qual produto mais me dá lucro?", "Por que o morango está caindo?", "Em que mês vendo mais?"],
  comercial: ["Qual o meu capital em risco?", "Que preço devo ajustar?", "Qual produto tem a pior margem?"],
  estoque: ["O que devo vender primeiro?", "Algum produto está abaixo do preço de mercado?", "Qual o melhor produto do meu estoque?"],
  assistente: ["Como posso tirar mais proveito do assistente?", "Qual produto mais me dá lucro?", "Vou precisar irrigar esta semana?"],
};
const SUGESTOES_PADRAO = SUGESTOES_POR_TELA.estoque;

export default function ChatWidget({ tela, rotuloTela }) {
  const sugestoes = SUGESTOES_POR_TELA[tela] || SUGESTOES_PADRAO;
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([
    { papel: "model", texto: "Olá! Sou o assistente AgroSmart. Pergunte sobre seu estoque, vendas ou clima." },
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
        body: JSON.stringify({ produtor_id: 1, mensagem: pergunta, historico, tela }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro no servidor");
      setMensagens((m) => [...m, { papel: "model", texto: data.resposta, interacaoId: data.interacao_id }]);
    } catch (err) {
      setMensagens((m) => [
        ...m,
        {
          papel: "model",
          texto: `${err.message === "Failed to fetch" ? "Não consegui falar com o servidor. A API está rodando?" : err.message}`,
          erro: true,
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  const atualizarMensagem = (indice, campos) =>
    setMensagens((lista) => lista.map((m, i) => (i === indice ? { ...m, ...campos } : m)));

  // Avaliação de uma resposta (ajudou / não ajudou). No "não ajudou" abre um campo opcional "o que faltou?".
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

  const conversaVazia = mensagens.length === 1;

  return (
    <>
      {/* Botão que abre o assistente */}
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-emerald-900 py-2.5 pl-3 pr-4 text-sm font-medium text-white shadow-[0_6px_20px_rgba(18,36,26,0.28)] hover:bg-emerald-950 transition-colors"
        >
          <LogoSimbolo className="w-6 h-6" />
          Perguntar ao assistente
        </button>
      )}

      {/* Painel lateral do assistente */}
      {aberto && (
        <aside
          aria-label="Assistente AgroSmart"
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-200 bg-white shadow-[-12px_0_40px_rgba(18,36,26,0.12)] sm:w-[26rem]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <LogoSimbolo className="w-8 h-8" />
              <div className="leading-tight">
                <p className="font-display text-[17px] font-bold tracking-[-0.01em] text-slate-900">Assistente</p>
                <p className="text-xs text-slate-500">Responde com base nos dados da sua propriedade</p>
              </div>
            </div>
            <button
              onClick={() => setAberto(false)}
              aria-label="Fechar assistente"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {rotuloTela && (
            <p className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-600">
              Você está em <span className="font-semibold text-slate-900">{rotuloTela}</span>. Pode perguntar sobre o que está na tela.
            </p>
          )}

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {conversaVazia && !carregando && (
              <div>
                <p className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-slate-900">
                  O que você quer saber da sua lavoura?
                </p>
                <p className="mt-1.5 text-sm text-slate-600">Estoque, vendas, plantios e clima. Algumas ideias para começar:</p>
                <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {sugestoes.map((s) => (
                    <li key={s}>
                      <button
                        onClick={() => enviar(s)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50 transition-colors"
                      >
                        {s}
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mensagens.slice(1).map((m, idx) => {
              const i = idx + 1; // índice na lista completa (a posição 0 é a saudação, que virou a tela inicial)
              if (m.papel === "user") {
                return (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-950">
                      {m.texto}
                    </p>
                  </div>
                );
              }
              return (
                <div key={i}>
                  {m.erro ? (
                    <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {m.texto}
                    </p>
                  ) : (
                    <div className="text-sm leading-relaxed text-slate-800">
                      <ReactMarkdown components={MD_COMPONENTS}>{m.texto}</ReactMarkdown>
                    </div>
                  )}

                  {m.interacaoId && !m.erro && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                      <span className="mr-1">{m.feedback ? (m.feedback === 1 ? "Obrigado pela avaliação." : "Obrigado, vamos melhorar.") : "Esta resposta ajudou?"}</span>
                      {[
                        { nota: 1, Icone: ThumbsUp, cor: "text-emerald-700", rotulo: "Ajudou" },
                        { nota: -1, Icone: ThumbsDown, cor: "text-red-600", rotulo: "Não ajudou" },
                      ].map(({ nota, Icone, cor, rotulo }) => (
                        <button
                          key={nota}
                          onClick={() => avaliar(i, nota)}
                          aria-label={rotulo}
                          aria-pressed={m.feedback === nota}
                          title={rotulo}
                          className={`rounded-md p-1.5 hover:bg-slate-100 transition-colors ${m.feedback === nota ? cor : ""}`}
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
                      className="mt-2 flex gap-2"
                    >
                      <input
                        autoFocus
                        value={m.rascunho || ""}
                        onChange={(e) => atualizarMensagem(i, { rascunho: e.target.value })}
                        maxLength={500}
                        placeholder="O que faltou? (opcional)"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-emerald-700"
                      />
                      <button type="submit" className="rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-800 hover:bg-slate-50">
                        Enviar
                      </button>
                    </form>
                  )}
                </div>
              );
            })}

            {carregando && (
              <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 150, 300].map((atraso) => (
                    <span key={atraso} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${atraso}ms` }} />
                  ))}
                </span>
                Consultando os seus dados
              </p>
            )}
            <div ref={fimRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
            className="border-t border-slate-200 p-4"
          >
            <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-emerald-700">
              <textarea
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                rows={2}
                placeholder="Escreva sua pergunta"
                maxLength={2000}
                aria-label="Pergunta para o assistente"
                className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={carregando || !entrada.trim()}
                aria-label="Enviar pergunta"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-900 text-white hover:bg-emerald-950 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Enter envia, Shift + Enter quebra a linha.</p>
          </form>
        </aside>
      )}
    </>
  );
}

import React, { useState } from "react";
import { Lock, LogIn } from "lucide-react";
import { entrar } from "../api";
import { LogoSimbolo } from "./Logo";

export default function Login({ aoEntrar, aviso }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const dados = await entrar(usuario, senha);
      setSenha("");
      aoEntrar(dados);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={enviar} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 space-y-5">
        <div className="flex flex-col items-center gap-3 pb-1">
          <LogoSimbolo className="w-14 h-14" />
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-slate-900">AgroSmart</h1>
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
            Entre para acessar o painel
          </p>
        </div>

        {aviso && !erro && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{aviso}</p>
        )}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Usuário</span>
          <input
            type="text"
            autoComplete="username"
            autoFocus
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </label>

        {erro && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-900 hover:bg-emerald-950 disabled:opacity-60 text-white font-medium py-2.5 transition-colors"
        >
          <LogIn className="w-4 h-4" />
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

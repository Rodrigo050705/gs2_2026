import React, { useId } from "react";

// Símbolo do AgroSmart: o sol no horizonte e as fileiras do plantio em perspectiva.
// Mesmo desenho do public/favicon.svg; as cores ficam fixas porque são a marca.
export function LogoSimbolo({ className = "w-8 h-8" }) {
  // useId devolve ":r0:"; sem os dois-pontos o id é seguro dentro de url(#...)
  const recorte = `selo${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="AgroSmart">
      <defs>
        <clipPath id={recorte}>
          <circle cx="24" cy="24" r="22" />
        </clipPath>
      </defs>
      <circle cx="24" cy="24" r="22" fill="#1f3d2b" />
      <g clipPath={`url(#${recorte})`}>
        <path d="M14.5 25A9.5 9.5 0 0 1 33.5 25Z" fill="#f0b429" />
        <rect x="0" y="27" width="48" height="22" fill="#8dbf63" />
        <g fill="#1f3d2b">
          <path d="M24 25L22.4 50H25.6Z" />
          <path d="M24 25L10 50H14.5Z" />
          <path d="M24 25L38 50H33.5Z" />
          <path d="M24 25L-8 50H-1Z" />
          <path d="M24 25L56 50H49Z" />
          <path d="M24 25L-60 50H-40Z" />
          <path d="M24 25L108 50H88Z" />
        </g>
      </g>
    </svg>
  );
}

// Símbolo + nome. O nome usa a fonte de título do sistema (Bricolage Grotesque).
export default function Logo({ tamanho = "w-8 h-8", claro = false }) {
  return (
    <span className="flex items-center gap-2">
      <LogoSimbolo className={`${tamanho} shrink-0`} />
      <span className={`font-display text-[20px] font-bold leading-none tracking-[-0.02em] ${claro ? "text-white" : "text-slate-900"}`}>
        AgroSmart
      </span>
    </span>
  );
}

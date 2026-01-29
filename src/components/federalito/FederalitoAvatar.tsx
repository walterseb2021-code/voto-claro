"use client";

import React from "react";

type Props = {
  className?: string;
  size?: number; // px (opcional)
};

export default function FederalitoAvatar({ className = "", size }: Props) {
  // Ajusta tamaño si quieres (por defecto responsive)
  const style = size ? { width: size, height: "auto" as const } : undefined;

  return (
    <div className={`relative inline-block ${className}`} style={style}>
      {/* BASE: tu PNG profesional (NO se anima, queda idéntico) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/federalito.png"
        alt="Federalito AI"
        className="block w-full h-auto rounded-[22px]"
        draggable={false}
      />

      {/* CAPA ANIMADA: bandera ondeando (encima) */}
      {/* IMPORTANTE: esta capa es “fake” pero visualmente llama a click y no mueve todo el cuerpo */}
      <div className="pointer-events-none absolute left-[6%] top-[6%] w-[88%] h-[30%]">
        <svg viewBox="0 0 400 160" className="w-full h-full">
          {/* palo (muy sutil) */}
          <rect x="10" y="0" width="10" height="160" rx="5" fill="rgba(0,0,0,0.35)" />

          {/* bandera (ondea con path animado) */}
          <path className="federalito-flag" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.55)" strokeWidth="3" />

          <text
            x="220"
            y="88"
            textAnchor="middle"
            fontSize="42"
            fontWeight="800"
            fill="rgba(220,38,38,0.95)"
            fontFamily="Arial, Helvetica, sans-serif"
          >
            Perú Federal
          </text>
        </svg>
      </div>
    </div>
  );
}

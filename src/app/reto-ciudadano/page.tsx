// src/app/reto-ciudadano/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type PlayMode = "sin_premio" | "con_premio";

export default function RetoCiudadanoPage() {
  const [mode, setMode] = useState<PlayMode>("sin_premio");

  const modeLabel = useMemo(() => {
    return mode === "sin_premio" ? "Sin premio" : "Con premio";
  }, [mode]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">
            RETO CIUDADANO
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Juego por niveles: Conocimiento general → Partido → Ruleta.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Modo actual: <span className="font-semibold">{modeLabel}</span>
          </p>
        </div>

        <Link
          href="/"
          className="shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          ← Volver al inicio
        </Link>
      </div>

      {/* Mode selector */}
      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-extrabold text-slate-900">
          Elegir modalidad
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("sin_premio")}
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition ${
              mode === "sin_premio"
                ? "bg-green-100 text-green-900 border-green-300"
                : "bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            Sin premio
          </button>

          <button
            type="button"
            onClick={() => setMode("con_premio")}
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition ${
              mode === "con_premio"
                ? "bg-green-100 text-green-900 border-green-300"
                : "bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            Con premio (requiere registro)
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-600">
          Nota: el sistema de premios puede estar desactivado durante campaña por normativa.
        </p>
      </section>

      {/* Levels scaffold */}
      <section className="mt-5 grid grid-cols-1 gap-3">
        {/* Nivel 1 */}
        <div className="rounded-2xl border bg-green-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-extrabold text-slate-900">
                Nivel 1 — Conocimiento general
              </div>
              <div className="mt-1 text-xs text-slate-700">
                25 preguntas aleatorias (banco grande). Pool 280s. Máx 10s por pregunta. Umbral: 23 buenas.
              </div>
            </div>
            <button
              type="button"
              disabled
              className="rounded-xl border px-4 py-2 text-sm font-extrabold text-slate-500 bg-white opacity-70 cursor-not-allowed"
              title="En el siguiente paso activamos la lógica del nivel 1"
            >
              Próximamente
            </button>
          </div>
        </div>

        {/* Nivel 2 */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-extrabold text-slate-900">
                Nivel 2 — Partido (según “Un cambio con valentía”)
              </div>
              <div className="mt-1 text-xs text-slate-700">
                Bloqueado hasta aprobar Nivel 1 (23 buenas).
              </div>
            </div>
            <span className="rounded-xl border px-3 py-2 text-xs font-extrabold text-slate-700 bg-slate-50">
              🔒 Bloqueado
            </span>
          </div>
        </div>

        {/* Nivel 3 */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-extrabold text-slate-900">
                Nivel 3 — Ruleta (8 segmentos)
              </div>
              <div className="mt-1 text-xs text-slate-700">
                Bloqueado hasta aprobar Nivel 2 (23 buenas).
              </div>
            </div>
            <span className="rounded-xl border px-3 py-2 text-xs font-extrabold text-slate-700 bg-slate-50">
              🔒 Bloqueado
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

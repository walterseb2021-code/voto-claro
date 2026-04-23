"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

export default function RetoCiudadanoPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  useEffect(() => {
    setPageContext({
      pageId: "reto-ciudadano",
      pageTitle: "Reto ciudadano",
      route: "/reto-ciudadano",
      summary: "Módulo principal del Reto Ciudadano con acceso a sus subventanas de juego.",
      activeSection: "hub-reto-ciudadano",
      visibleText: [
        "Pantalla principal de Reto Ciudadano.",
        "Aquí se muestran las subventanas disponibles del módulo.",
        "Subventanas visibles: Reto principal y Camino Ciudadano.",
      ].join("\n"),
      availableActions: [
        "Entrar al Reto principal",
        "Entrar a Camino Ciudadano",
        "Volver al inicio",
      ],
      selectedItemTitle: "Reto Ciudadano",
      status: "ready",
      dynamicData: {
        subventanasDisponibles: 2,
        retoPrincipalVisible: true,
        caminoCiudadanoVisible: true,
      },
    });

    return () => {
      clearPageContext();
    };
  }, [setPageContext, clearPageContext]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 vc-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">
            RETO CIUDADANO
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Este módulo reúne varias experiencias de juego ciudadano.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Elige la juego al que quieres entrar.
          </p>
        </div>

        <div className="shrink-0 flex flex-col gap-2">
          <Link
            href="/"
            className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 text-center vc-btn-wave vc-btn-pulse"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/reto-ciudadano/principal"
          className="rounded-2xl border bg-white p-5 shadow-sm hover:bg-slate-50 vc-fade-up vc-card-hover"
        >
          <div className="text-base font-extrabold text-slate-900">
            Reto principal
          </div>
          <div className="mt-2 text-sm text-slate-700">
            Juego secuencial por niveles:
            conocimiento general, partido y ruleta.
          </div>
        </Link>

        <Link
          href="/reto-ciudadano/camino"
          className="rounded-2xl border bg-white p-5 shadow-sm hover:bg-slate-50 vc-fade-up vc-card-hover"
        >
          <div className="text-base font-extrabold text-slate-900">
            Camino Ciudadano
          </div>
          <div className="mt-2 text-sm text-slate-700">
            Subventana independiente dentro de Reto Ciudadano.
          </div>
        </Link>
      </section>
    </main>
  );
}
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CaminoCiudadano, {
  type CaminoCiudadanoRuntimeState,
} from "../components/CaminoCiudadano";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

type PlayMode = "sin_premio" | "con_premio";

export default function CaminoCiudadanoPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();
  const [mode, setMode] = useState<PlayMode>("sin_premio");
  const [caminoState, setCaminoState] = useState<CaminoCiudadanoRuntimeState | null>(null);

  useEffect(() => {
    const visibleParts: string[] = [];

visibleParts.push("Bienvenido a Camino Ciudadano.");
visibleParts.push(
  "Aquí avanzarás por un recorrido de casillas, respondiendo preguntas y buscando llegar a la meta."
);
visibleParts.push(
  `Modo actual visible: ${mode === "con_premio" ? "con premio" : "sin premio"}.`
);

    if (caminoState) {
      visibleParts.push(
        `Camino Ciudadano visible: casilla ${caminoState.position} de 30, turnos restantes ${caminoState.turnsLeft}.`
      );

      if (caminoState.showQuestion) {
        visibleParts.push(
          `Hay una pregunta abierta en Camino Ciudadano con ${caminoState.timeLeft} segundos restantes.`
        );
      }

      if (caminoState.won) {
        visibleParts.push("Camino Ciudadano muestra estado ganador.");
      } else if (caminoState.gameOver) {
        visibleParts.push("Camino Ciudadano muestra estado de juego perdido.");
      }
    }

    const activeSection = caminoState?.showQuestion
      ? "camino-ciudadano-pregunta"
      : caminoState?.won
      ? "camino-ciudadano-ganado"
      : "camino-ciudadano";

    const availableActions = caminoState?.showQuestion
  ? ["Responder pregunta de Camino Ciudadano"]
  : ["Elegir modalidad", "Lanzar dado", "Jugar Camino Ciudadano"];

    const summary = caminoState?.showQuestion
  ? "Pantalla de Camino Ciudadano con una pregunta activa."
  : caminoState?.won
  ? "Pantalla de Camino Ciudadano con juego completado."
  : "Pantalla de Camino Ciudadano con recorrido por casillas, preguntas y avance hacia la meta.";

    setPageContext({
      pageId: "reto-ciudadano-camino",
      pageTitle: "Camino Ciudadano",
      route: "/reto-ciudadano/camino",
      summary,
      activeSection,
      visibleText: visibleParts.join("\n"),
      availableActions,
      selectedItemTitle: mode === "con_premio" ? "Modo con premio" : "Modo sin premio",
      status: "ready",
      dynamicData: {
        mode,
        caminoVisible: true,
        caminoPosition: caminoState?.position ?? null,
        caminoTurnsLeft: caminoState?.turnsLeft ?? null,
        caminoShowQuestion: caminoState?.showQuestion ?? false,
        caminoTimeLeft: caminoState?.timeLeft ?? null,
        caminoWon: caminoState?.won ?? false,
        caminoGameOver: caminoState?.gameOver ?? false,
      },
    });

    return () => {
      clearPageContext();
    };
  }, [setPageContext, clearPageContext, mode, caminoState]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 vc-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">
            RETO CIUDADANO — CAMINO CIUDADANO
          </h1>
          <p className="mt-1 text-sm text-slate-700">
  Juego de recorrido por casillas donde avanzas, respondes preguntas y buscas llegar a la meta.
</p>
<p className="mt-1 text-xs text-slate-600">
  Puedes jugar esta experiencia como parte del módulo Reto Ciudadano.
</p>
        </div>

        <div className="shrink-0 flex flex-col gap-2">
            <Link
  href="/reto-ciudadano"
  className="rounded-xl border px-3 py-2 text-sm font-semibold text-white bg-blue-600 border-blue-700 hover:bg-blue-700 text-center vc-btn-wave vc-btn-pulse"
>
  ← Volver a Reto Ciudadano
</Link>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm vc-fade-up vc-delay-1">
        <div className="text-sm font-extrabold text-slate-900">Elegir modalidad</div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("sin_premio")}
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition vc-btn-wave vc-btn-pulse ${
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
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition vc-btn-wave vc-btn-pulse ${
              mode === "con_premio"
                ? "bg-green-100 text-green-900 border-green-300"
                : "bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            Con premio
          </button>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-3">
        <CaminoCiudadano
          mode={mode}
          onStateChange={setCaminoState}
        />
      </section>
    </main>
  );
}
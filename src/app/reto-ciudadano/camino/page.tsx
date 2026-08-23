"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CaminoCiudadano, {
  type CaminoCiudadanoRuntimeState,
} from "../components/CaminoCiudadano";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";
import CaminoSecurePrizeFlow from "./CaminoSecurePrizeFlow";

type PlayMode = "sin_premio" | "con_premio";

const PREMIO_ACTIVO = false;

type CaminoWinner = {
  alias: string;
  created_at: string;
  premio: string;
};

export default function CaminoCiudadanoPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();
  const introNarratedRef = useRef(false);


  const [mode, setMode] = useState<PlayMode>("sin_premio");
  const [caminoState, setCaminoState] =
    useState<CaminoCiudadanoRuntimeState | null>(null);
  const [hasData, setHasData] = useState(false);

  const [winnerSaving, setWinnerSaving] = useState(false);
  const [winnerMessage, setWinnerMessage] = useState<string | null>(null);

  const [ganadoresFiltro, setGanadoresFiltro] = useState("TRIMESTRE");
  const [ganadores, setGanadores] = useState<CaminoWinner[]>([]);
  const [ganadoresLoading, setGanadoresLoading] = useState(false);
  const [ganadoresError, setGanadoresError] = useState<string | null>(null);
  useEffect(() => {
  if (introNarratedRef.current) return;
  introNarratedRef.current = true;

  const text =
  "Estás en Camino Ciudadano. Lanza el dado, responde la pregunta y avanza por el tablero hasta llegar a la meta.";
 
  const t = window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: {
          action: "SAY",
          text,
          speak: true,
        },
      })
    );
  }, 650);

  return () => window.clearTimeout(t);
}, []);
  useEffect(() => {
    let alive = true;

    async function loadParticipant() {
      try {
        const res = await fetch("/api/participant/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.ok !== true) {
          throw new Error("session_unavailable");
        }
        if (!alive) return;

        const currentParticipant =
          data?.authenticated === true && data?.participant
            ? data.participant
            : null;

        setHasData(Boolean(currentParticipant));
      } catch {
        if (!alive) return;
        setHasData(false);
      }
    }

    void loadParticipant();

    return () => {
      alive = false;
    };
  }, []);

  async function cargarGanadoresCamino() {
    setGanadoresLoading(true);
    setGanadoresError(null);

    try {
      const params = new URLSearchParams({
        game: "camino",
        filter: ganadoresFiltro,
      });
      const res = await fetch(
        `/api/reto-ciudadano/public-winners?${params.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        }
      );
      const data = await res.json().catch(() => null);

      if (!res.ok || data?.ok !== true || !Array.isArray(data?.winners)) {
        throw new Error(
          data?.error || "No se pudo cargar la lista de Camino Ciudadano."
        );
      }

      setGanadores(data.winners as CaminoWinner[]);
    } catch (e: any) {
      setGanadoresError(
        e?.message || "Error al cargar ganadores de Camino Ciudadano."
      );
      setGanadores([]);
    } finally {
      setGanadoresLoading(false);
    }
  }

  useEffect(() => {
    void cargarGanadoresCamino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ganadoresFiltro]);

  useEffect(() => {
    if (!PREMIO_ACTIVO && mode === "con_premio") {
      setMode("sin_premio");
      setWinnerSaving(false);
      setWinnerMessage(null);
      return;
    }

    const visibleParts: string[] = [];

    visibleParts.push("Bienvenido a Camino Ciudadano.");
    visibleParts.push(
      "Aquí avanzarás por un recorrido de casillas, respondiendo preguntas y buscando llegar a la meta."
    );
    visibleParts.push(
      `Modo actual visible: ${
        mode === "con_premio" ? "con premio" : "sin premio"
      }.`
    );

    if (mode === "con_premio") {
      visibleParts.push(
        "En Camino Ciudadano con premio, los ganadores registrados participan en una selección trimestral."
      );
      visibleParts.push(
        "Aviso visible: de todos los ganadores acumulados durante el trimestre, VOTO CLARO escogerá a 5 ganadores para el evento trimestral."
      );
    } else {
      visibleParts.push(
        "En Camino Ciudadano sin premio, el usuario puede jugar para practicar y aprender, pero no participa en la selección trimestral."
      );
    }

    visibleParts.push("Está visible el bloque de ganadores de Camino Ciudadano.");
    visibleParts.push(
      `Ganadores visibles de Camino Ciudadano cargados: ${ganadores.length}.`
    );

    if (winnerSaving) {
      visibleParts.push("Se está registrando un ganador de Camino Ciudadano.");
    }

    if (winnerMessage) {
      visibleParts.push(`Mensaje visible de ganador: ${winnerMessage}`);
    }

    if (caminoState) {
      visibleParts.push(
        `Camino Ciudadano visible: casilla ${caminoState.position} de 30, turnos restantes ${caminoState.turnsLeft}.`
      );

      if (caminoState.currentRoll !== null) {
        visibleParts.push(`Último resultado visible del dado: ${caminoState.currentRoll}.`);
      }

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
      : [
          "Elegir modalidad",
          "Lanzar dado",
          "Jugar Camino Ciudadano",
          "Revisar aviso de selección trimestral",
          "Revisar ganadores de Camino Ciudadano",
        ];

     const summary =
  "Camino Ciudadano es un juego de recorrido por casillas donde el usuario lanza el dado, responde preguntas y busca llegar a la meta.";
    setPageContext({
      pageId: "reto-ciudadano-camino",
      pageTitle: "Camino Ciudadano",
      route: "/reto-ciudadano/camino",
      summary,
      speakableSummary: "",
      activeSection,
      visibleText: visibleParts.join("\n"),
      availableActions,
      suggestedPrompts: caminoState?.showQuestion
        ? [
            {
              id: "camino-1",
              label: "¿Qué hago ahora?",
              question:
                "¿Qué debo hacer ahora en esta pregunta de Camino Ciudadano?",
            },
            {
              id: "camino-2",
              label: "¿Cuánto tiempo queda?",
              question:
                "¿Cuánto tiempo queda para responder en Camino Ciudadano?",
            },
            {
              id: "camino-3",
              label: "¿Qué pasa si fallo?",
              question:
                "¿Qué pasa si no respondo bien esta pregunta en Camino Ciudadano?",
            },
          ]
        : caminoState?.won
        ? [
            {
              id: "camino-1",
              label: "¿Ya gané?",
              question: "¿Ya gané en Camino Ciudadano?",
            },
            {
              id: "camino-2",
              label: "¿Qué sigue ahora?",
              question: "¿Qué sigue ahora después de ganar en Camino Ciudadano?",
            },
            {
              id: "camino-3",
              label: "Premio trimestral",
              question:
                "¿Cómo funciona la selección trimestral de 5 ganadores en Camino Ciudadano?",
            },
          ]
        : [
            {
              id: "camino-1",
              label: "¿Cómo se juega?",
              question: "¿Cómo se juega Camino Ciudadano?",
            },
            {
              id: "camino-2",
              label: "¿Qué hago al empezar?",
              question: "¿Qué hago primero al entrar a Camino Ciudadano?",
            },
            {
              id: "camino-3",
              label: "¿Cómo avanzo?",
              question: "¿Cómo avanzo por las casillas en Camino Ciudadano?",
            },
            {
              id: "camino-4",
              label: "¿Qué diferencia hay?",
              question:
                "¿Qué diferencia hay entre jugar Camino Ciudadano con premio y sin premio?",
            },
            {
              id: "camino-5",
              label: "Premio trimestral",
              question:
                "¿Cómo funciona la selección trimestral de 5 ganadores en Camino Ciudadano?",
            },
            {
              id: "camino-6",
              label: "Ganadores",
              question: "¿Dónde veo los ganadores de Camino Ciudadano?",
            },
          ],
      selectedItemTitle:
        mode === "con_premio" ? "Modo con premio" : "Modo sin premio",
      status: "ready",
      dynamicData: {
        mode,
        caminoPosition: caminoState?.position ?? 0,
        caminoTurnsLeft: caminoState?.turnsLeft ?? 0,
        caminoCurrentRoll: caminoState?.currentRoll ?? null,
        caminoShowQuestion: caminoState?.showQuestion ?? false,
        caminoHasQuestion: caminoState?.hasQuestion ?? false,
        caminoTimeLeft: caminoState?.timeLeft ?? 0,
        caminoGameOver: caminoState?.gameOver ?? false,
        caminoWon: caminoState?.won ?? false,
        seleccionTrimestralActiva: mode === "con_premio",
        ganadoresTrimestralesCantidad: 5,
        ganadoresCaminoCount: ganadores.length,
        ganadoresCaminoFiltro: ganadoresFiltro,
        winnerSaving,
        winnerMessage: winnerMessage || "",
        participanteRegistrado: hasData,
        avisoTrimestral:
          mode === "con_premio"
            ? "De todos los ganadores acumulados durante el trimestre, VOTO CLARO escogerá a 5 ganadores para el evento trimestral."
            : "",
      },
    });
  }, [
    setPageContext,
    mode,
    caminoState,
    ganadores.length,
    ganadoresFiltro,
    winnerSaving,
    winnerMessage,
    hasData,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 vc-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">
            RETO CIUDADANO — CAMINO CIUDADANO
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Juego de recorrido por casillas donde avanzas, respondes preguntas y
            buscas llegar a la meta.
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
        <div className="text-sm font-extrabold text-slate-900">
          Elegir modalidad
        </div>

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
            onClick={() => {
              if (PREMIO_ACTIVO) setMode("con_premio");
            }}
            disabled={!PREMIO_ACTIVO}
            className={`rounded-xl border px-4 py-2 text-sm font-extrabold transition vc-btn-wave vc-btn-pulse ${
              !PREMIO_ACTIVO
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : mode === "con_premio"
                ? "bg-green-100 text-green-900 border-green-300"
                : "bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            Con premio
          </button>
        </div>

        {!PREMIO_ACTIVO ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            La modalidad con premio está temporalmente en mantenimiento. Puedes participar en modo educativo sin premio.
          </div>
        ) : mode === "con_premio" ? (
          <div className="mt-3 rounded-xl border border-green-300 bg-green-50 p-3 text-xs text-green-800">
            🎉 <strong>Modalidad con premio:</strong> Si ganas en Camino
            Ciudadano, quedarás registrado como ganador de esta dinámica.
            <br />
            🏆 <strong>Selección trimestral:</strong> de todos los ganadores
            acumulados durante el trimestre, VOTO CLARO escogerá a{" "}
            <strong>5 ganadores</strong> para el evento trimestral, según las
            reglas publicadas por la plataforma.
            {!hasData ? (
              <div className="mt-2 font-semibold text-amber-700">
                Para quedar registrado con premio necesitas estar registrado o
                haber iniciado sesión desde Reto Ciudadano.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            En modo sin premio puedes jugar libremente para practicar y aprender.
            Esta modalidad no registra participación para la selección trimestral.
          </div>
        )}
      </section>

      <section className="mt-5 grid grid-cols-1 gap-3">
        {mode === "con_premio" ? (
          !hasData ? (
            <div className="rounded-2xl border bg-white p-4 shadow-sm text-sm font-semibold text-slate-700">
              🔒 Para jugar Camino Ciudadano con premio debes registrarte o iniciar sesión desde Reto Ciudadano.
            </div>
          ) : (
            <CaminoSecurePrizeFlow onStateChange={setCaminoState} />
          )
        ) : (
          <CaminoCiudadano
            mode="sin_premio"
            onStateChange={setCaminoState}
          />
        )}
      </section>

      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm vc-fade-up vc-card-hover">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              🏆 Ganadores de Camino Ciudadano
            </h2>
            <p className="text-xs text-slate-600">
              {PREMIO_ACTIVO
                ? "Lista de ciudadanos registrados como ganadores en la modalidad con premio."
                : "La modalidad con premio está temporalmente en mantenimiento."}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { value: "TRIMESTRE", label: "Trimestre" },
              { value: "HOY", label: "Hoy" },
              { value: "SEMANA", label: "Semana" },
              { value: "MES", label: "Mes" },
              { value: "TODOS", label: "Todos" },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setGanadoresFiltro(f.value)}
                className={`rounded-xl border px-3 py-1 text-xs font-semibold transition vc-btn-wave vc-btn-pulse ${
                  ganadoresFiltro === f.value
                    ? "bg-green-100 text-green-900 border-green-300"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {PREMIO_ACTIVO ? (
        <div className="mt-3 rounded-xl border border-green-300 bg-green-50 p-3 text-xs text-green-800">
          🏆 <strong>Aviso trimestral:</strong> de todos los ganadores acumulados
          durante el trimestre, VOTO CLARO escogerá a{" "}
          <strong>5 ganadores</strong> para el evento trimestral, según las reglas
          publicadas por la plataforma.
        </div>
        ) : (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Puedes seguir jugando Camino Ciudadano en modo educativo sin premio.
        </div>
        )}

        {winnerSaving ? (
          <div className="mt-3 rounded-xl border bg-slate-50 p-3 text-sm font-semibold text-slate-700">
            Registrando ganador de Camino Ciudadano...
          </div>
        ) : null}

        {winnerMessage ? (
          <div className="mt-3 rounded-xl border bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {winnerMessage}
          </div>
        ) : null}

        <div className="mt-4">
          {ganadoresLoading ? (
            <div className="text-sm text-slate-600">Cargando ganadores...</div>
          ) : ganadoresError ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              Error: {ganadoresError}
            </div>
          ) : ganadores.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
              No hay ganadores de Camino Ciudadano en este período.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {ganadores.map((g, i) => (
                <div
                  key={`${g.alias}-${g.created_at}-${i}`}
                  className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-extrabold text-slate-900">
                      {g.alias}
                    </div>
                    <div className="text-xs text-slate-600">
                      {new Date(g.created_at).toLocaleString("es-PE")}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block rounded-full bg-green-600 text-white px-2 py-0.5 text-xs font-bold">
                      Camino
                    </span>
                    <div className="text-xs text-slate-700 mt-1">{g.premio}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

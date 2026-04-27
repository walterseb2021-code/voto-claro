// src/app/reflexion/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { REFLEXION_AXES } from "@/lib/reflexionContent";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

export default function ReflexionPage() {
  const { setPageContext } = useAssistantRuntime();
  const axes = REFLEXION_AXES;

  const cierre = useMemo(
    () =>
      "Reflexionar políticamente no garantiza gobiernos perfectos, pero sí forma ciudadanos más libres y responsables. Cuando piensas la vida pública con criterio, proteges tu dignidad y también la de los demás. La democracia se fortalece cuando el ciudadano no se deja llevar solo por el miedo, la rabia, la costumbre o la propaganda, sino por la conciencia.",
    []
  );

  const [activeAxisId, setActiveAxisId] = useState<string | null>(null);
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const openAnswerRef = useRef<HTMLDivElement | null>(null);

  const activeAxis = useMemo(
    () => axes.find((a) => a.id === activeAxisId) ?? null,
    [axes, activeAxisId]
  );

  useEffect(() => {
    function onScroll() {
      const scrollTop = window.scrollY || 0;
      setShowScrollTop(scrollTop > 300);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const axesList = axes.map((a) => a.title).join(", ");

    setPageContext({
      pageId: "reflexion-politica",
      route: "/reflexion",
      pageTitle: "Reflexiones políticas y ciudadanas",
      activeSection: activeAxis ? `Eje: ${activeAxis.title}` : "Ejes temáticos",
      status: "ready",
      summary:
        "Esta ventana reúne reflexiones políticas y ciudadanas por ejes temáticos. Su propósito es ayudar a formar criterio sobre la vida pública, no promover partidos ni candidatos.",
      speakableSummary:
        "Estás en Reflexiones políticas y ciudadanas. Puedes elegir un eje temático, abrir preguntas y leer reflexiones para formar criterio ciudadano.",
      visibleText:
        `Ejes disponibles: ${axesList}. Esta sección es informativa y reflexiva. No promueve partidos ni candidatos.`,
      availableActions: activeAxis
        ? [
            "Volver a ejes temáticos",
            "Ver preguntas del eje",
            "Abrir una reflexión",
            "Leer reflexión en voz alta",
            "Cambiar de eje",
          ]
        : [
            "Elegir eje temático",
            "Ver preguntas",
            "Leer cierre filosófico",
            "Subir al inicio de la página",
          ],
      dynamicData: {
        totalEjes: axes.length,
        ejeActivo: activeAxis?.title || "",
        preguntaAbierta: openQuestionId || "",
      },
      suggestedPrompts: [
        {
          id: "reflexion-que-es",
          label: "¿Qué es esta sección?",
          question: "¿Qué son las Reflexiones políticas y ciudadanas y para qué sirven?",
        },
        {
          id: "reflexion-ejes",
          label: "Ejes disponibles",
          question: "¿Qué ejes temáticos puedo revisar en esta sección?",
        },
        {
          id: "reflexion-economia",
          label: "Economía y empleo",
          question: "Muéstrame preguntas y reflexiones sobre economía y empleo.",
        },
        {
          id: "reflexion-salud-educacion",
          label: "Salud y educación",
          question: "Muéstrame preguntas y reflexiones sobre salud y educación.",
        },
        {
          id: "reflexion-seguridad-justicia",
          label: "Seguridad y justicia",
          question: "Muéstrame preguntas sobre seguridad ciudadana, justicia y corrupción.",
        },
        {
          id: "reflexion-futuro",
          label: "Ambiente y tecnología",
          question: "Muéstrame reflexiones sobre medio ambiente, tecnología e innovación.",
        },
      ],
    });
  }, [setPageContext, axes, activeAxis, openQuestionId]);

  // ✅ Narración al entrar SIN abrir Federalito
  useEffect(() => {
    const axesList = axes
      .slice(0, 9)
      .map((a, i) => `${i + 1}) ${a.title}`)
      .join("\n");

    const text =
      "Estás en Reflexiones políticas y ciudadanas. " +
      "Aquí eliges un eje temático y luego una pregunta para leer una reflexión que ayuda a formar criterio ciudadano, no solo durante elecciones sino durante toda la vida pública.\n\n" +
      "Ejes disponibles:\n" +
      axesList +
      "\n\n" +
      "Para usarlo: toca un eje, luego una pregunta. " +
      "También puedes preguntarme libremente por temas como salud, educación, corrupción, seguridad, economía, medio ambiente o tecnología.";

    // 🔒 1) Cerrar Federalito sí o sí
    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: { action: "CLOSE" },
      })
    );

    // 🎙️ 2) Narrar DESPUÉS (sin abrir panel)
    const t = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("votoclaro:guide", {
          detail: { action: "SAY", text, speak: true },
        })
      );
    }, 0);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openQuestionId) return;

    // Espera al render del panel abierto
    const t = setTimeout(() => {
      openAnswerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);

    return () => clearTimeout(t);
  }, [openQuestionId]);

  function goBackToAxes() {
    stopVoice();
    setActiveAxisId(null);
    setOpenQuestionId(null);
  }

  function goBackToQuestions() {
    stopVoice();
    setOpenQuestionId(null);
  }

  function guideSay(text: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: { action: "SAY", text, speak: true },
      })
    );
  }

  function stopVoice() {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }

  // ✅ Estilos base (para mantener coherencia)
  const CARD = "rounded-2xl border-4 border-red-700 bg-primary-soft shadow-sm";
  const CARD_HOVER = "hover:bg-green-100 transition";
  const RED_OUTLINE_BTN =
    "inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-red-700 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 transition vc-btn-wave vc-btn-pulse";
  const BLUE_PRIMARY_BTN =
    "vc-btn vc-btn-blue inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-600 text-white text-sm font-extrabold shadow-sm transition vc-btn-wave vc-btn-pulse";

  // ✅ Overrides SOLO cuando el html está en APP (no afecta Perú Federal)
  const APP_ON_BLUE = "[html[data-party='app']_&]:text-black";
  const APP_ON_BLUE_MUTED = "[html[data-party='app']_&]:text-slate-700";

  return (
    <main className="vc-reflexion min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-100 via-green-50 to-green-100">
      {/* Header */}
      <div className={`${CARD} p-5 vc-fade-up`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Reflexiones políticas y ciudadanas
            </h1>
            <p className="mt-2 text-sm md:text-base text-slate-700">
              Elige un eje, luego una pregunta, y lee con calma una reflexión para formar criterio ciudadano.
            </p>
          </div>

          <Link href="/" className={BLUE_PRIMARY_BTN}>
            ← Volver al inicio
          </Link>
        </div>

        {/* Nota */}
        <div className="mt-4 rounded-2xl border-2 border-red-700 bg-white px-4 py-3 text-sm text-slate-700">
          Esta sección es informativa y reflexiva. No promueve partidos ni
          candidatos. Busca ayudarte a pensar la política, la vida pública y tus decisiones ciudadanas con criterio.
        </div>
      </div>

      {/* NIVEL 1: Ejes */}
      {!activeAxis ? (
        <section className="mt-6">
          <div className={`${CARD} p-5 vc-fade-up vc-delay-1`}>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-slate-900">
                  Elige un eje temático
                </h2>
                <p className="mt-1 text-sm text-slate-700">
                  9 temas clave para pensar la vida pública desde distintos ángulos.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {axes.map((axis, idx) => (
                <button
                  key={axis.id}
                  type="button"
                  onClick={() => {
                    setActiveAxisId(axis.id);
                    setOpenQuestionId(null);
                  }}
                  className={`${CARD} ${CARD_HOVER} px-5 py-5 text-left vc-card-hover vc-fade-up vc-delay-${Math.min(
                    idx + 2,
                    5
                  )}`}
                >
                  {/* ✅ FIX contraste en APP: título blanco */}
                  <div
                    className={`text-base md:text-lg font-semibold text-black ${APP_ON_BLUE}`}
                  >
                    {axis.title}
                  </div>

                  {/* ✅ FIX contraste en APP: subtítulo blanco suave */}
                  {axis.subtitle ? (
                    <div
                      className={`mt-2 text-sm text-slate-700 leading-snug ${APP_ON_BLUE_MUTED}`}
                    >
                      {axis.subtitle}
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <span className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-red-700 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 transition vc-btn-wave vc-btn-pulse">
                      Ver preguntas →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <section className={`${CARD} mt-6 p-5 vc-fade-up vc-delay-2`}>
            <div className="text-sm font-semibold text-slate-900">
              Cierre filosófico
            </div>
            <p className="mt-2 text-sm md:text-base text-slate-800 leading-relaxed">
              {cierre}
            </p>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => guideSay(cierre)}
                className={BLUE_PRIMARY_BTN}
              >
                🔊 Leer cierre
              </button>
            </div>
          </section>
        </section>
      ) : (
        /* NIVEL 2 + 3: Preguntas y reflexiones */
        <section className="mt-6">
          <div className={`${CARD} p-5 vc-fade-up`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                {/* ✅ FIX contraste en APP (solo este bloque de eje activo) */}
                <div
                  className={`text-sm text-slate-600 font-semibold ${APP_ON_BLUE_MUTED}`}
                >
                  Eje temático
                </div>
                <h2
                  className={`text-xl md:text-2xl font-semibold text-slate-900 ${APP_ON_BLUE}`}
                >
                  {activeAxis.title}
                </h2>
                {activeAxis.subtitle ? (
                  <p
                    className={`mt-1 text-sm md:text-base text-slate-700 ${APP_ON_BLUE_MUTED}`}
                  >
                    {activeAxis.subtitle}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={goBackToQuestions}
                  className={RED_OUTLINE_BTN}
                >
                  ← Ver preguntas
                </button>

                <button
                  type="button"
                  onClick={goBackToAxes}
                  className={RED_OUTLINE_BTN}
                >
                  ← Cambiar eje
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              {activeAxis.questions.map((q, idx) => {
                const isOpen = openQuestionId === q.id;
                return (
                  <div key={q.id} className={`${CARD} overflow-hidden vc-card-hover`}>
                    <button
                      type="button"
                      onClick={() => {
                        stopVoice();
                        setOpenQuestionId(isOpen ? null : q.id);
                      }}
                      className={`w-full text-left px-5 py-4 flex items-start justify-between gap-3 ${CARD_HOVER}`}
                      aria-expanded={isOpen}
                    >
                      <div className="min-w-0">
                        {/* ✅ FIX contraste en APP: label blanco suave */}
                        <div
                          className={`text-sm text-slate-600 font-semibold ${APP_ON_BLUE_MUTED}`}
                        >
                          Pregunta {idx + 1} de 5
                        </div>
                        {/* ✅ FIX contraste en APP: pregunta blanco */}
                        <div
                          className={`mt-1 text-base md:text-lg font-semibold text-slate-900 ${APP_ON_BLUE}`}
                        >
                          {q.question}
                        </div>
                      </div>

                      <div className="shrink-0 text-red-700 text-2xl pt-1 font-bold">
                        {isOpen ? "−" : "+"}
                      </div>
                    </button>

                    {isOpen ? (
                      <div ref={openAnswerRef} className="px-5 pb-5">
                        <div className="mt-1 text-sm md:text-base text-slate-800 whitespace-pre-line leading-relaxed">
                          {q.reflection}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const follow = q.followups?.length
                                ? `\n\nPara seguir reflexionando:\n- ${q.followups.join(
                                    "\n- "
                                  )}`
                                : "";
                              const textToRead = `Eje: ${
                                activeAxis.title
                              }\n\nPregunta ${idx + 1}:\n${q.question}\n\n${
                                q.reflection
                              }${follow}`;
                              guideSay(textToRead);
                            }}
                            className={BLUE_PRIMARY_BTN}
                          >
                            🔊 Leer reflexión
                          </button>
                        </div>

                        {q.followups?.length ? (
                          <div className="mt-4 rounded-xl border-2 border-red-200 bg-white px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">
                              Para seguir reflexionando
                            </div>
                            <ul className="mt-2 list-disc pl-5 text-sm md:text-base text-slate-800 leading-relaxed">
                              {q.followups.map((f) => (
                                <li key={f}>{f}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <section className={`${CARD} mt-6 p-5 vc-fade-up vc-delay-1`}>
            <div className="text-sm font-semibold text-slate-900">
              Cierre filosófico
            </div>
            <p className="mt-2 text-sm md:text-base text-slate-800 leading-relaxed">
              {cierre}
            </p>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => guideSay(cierre)}
                className={BLUE_PRIMARY_BTN}
              >
                🔊 Leer cierre
              </button>
            </div>
          </section>
        </section>
      )}

      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="vc-btn vc-btn-blue fixed bottom-5 left-1/2 -translate-x-[120%] z-[9999] rounded-full px-4 py-3 text-sm font-extrabold shadow-lg transition vc-btn-wave vc-btn-pulse"
          aria-label="Subir"
        >
          ↑ Subir
        </button>
      ) : null}
    </main>
  );
}
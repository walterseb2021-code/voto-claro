// src/app/reflexion/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { REFLEXION_AXES, type Axis } from "@/lib/reflexionContent";

export default function ReflexionPage() {
                
          const axes = REFLEXION_AXES;

   const cierre = useMemo(
    () =>
      "Reflexionar antes de votar no garantiza gobiernos perfectos, pero sí ciudadanos más libres y responsables. Cuando piensas tu voto, proteges tu dignidad y también la de los demás. La democracia se fortalece cuando el ciudadano no se deja llevar solo por el miedo, la rabia o la costumbre, sino por la conciencia.",
    []
  );

  const [activeAxisId, setActiveAxisId] = useState<string | null>(null);
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

useEffect(() => {
  function onScroll() {
    const scrollTop = window.scrollY || 0;
    setShowScrollTop(scrollTop > 300);
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}, []);
// ✅ Narración al entrar SIN abrir Federalito
useEffect(() => {
  const axesList = axes
    .slice(0, 9)
    .map((a, i) => `${i + 1}) ${a.title}`)
    .join("\n");

  const text =
    "Estás en Reflexionar antes de votar. " +
    "Aquí eliges un eje temático y luego una pregunta para leer una reflexión.\n\n" +
    "Ejes disponibles:\n" +
    axesList +
    "\n\n" +
    "Para usarlo: toca un eje, luego una pregunta. " +
    "Si quieres, dime por ejemplo: educación pregunta tres.";

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

  const openAnswerRef = useRef<HTMLDivElement | null>(null);

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

  const activeAxis = useMemo(
    () => axes.find((a) => a.id === activeAxisId) ?? null,
    [axes, activeAxisId]
  );

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

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
            Reflexionar antes de votar
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-700">
            Elige un eje, luego una pregunta, y lee con calma una reflexión.
          </p>
        </div>

        <Link
  href="/"
  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-700 bg-green-600 text-white text-sm font-semibold hover:bg-green-700 shadow-md transition"
>
  ← Volver al inicio
</Link>

      </div>

      {/* Nota */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        Esta sección es informativa y reflexiva. No promueve partidos ni
        candidatos. Busca ayudarte a pensar tu voto con criterio.
      </div>

      {/* NIVEL 1: Ejes */}
      {!activeAxis ? (
        <section className="mt-6">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-slate-900">
                Elige un eje temático
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                9 temas clave para pensar tu voto desde distintos ángulos.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {axes.map((axis) => (
              <button
                key={axis.id}
                type="button"
                onClick={() => {
                  setActiveAxisId(axis.id);
                  setOpenQuestionId(null);
                }}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5 text-left hover:bg-slate-50 transition"
              >
                <div className="text-base md:text-lg font-semibold text-slate-900">
                  {axis.title}
                </div>
                {axis.subtitle ? (
                  <div className="mt-2 text-sm text-slate-700 leading-snug">
                    {axis.subtitle}
                  </div>
                ) : null}
                <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-green-700">
                  Ver preguntas →
                </div>
              </button>
            ))}
          </div>

          <section className="mt-6 rounded-2xl border border-green-100 bg-green-50/50 p-5">
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
      className="rounded-xl px-4 py-2 border border-green-700 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
    >
      🔊 Leer cierre
    </button>
  </div>

          </section>
        </section>
      ) : (
        /* NIVEL 2 + 3: Preguntas y reflexiones */
        <section className="mt-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm text-slate-600 font-semibold">
                Eje temático
              </div>
              <h2 className="text-xl md:text-2xl font-semibold text-slate-900">
                {activeAxis.title}
              </h2>
              {activeAxis.subtitle ? (
                <p className="mt-1 text-sm md:text-base text-slate-700">
                  {activeAxis.subtitle}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
  <button
    type="button"
    onClick={goBackToQuestions}
    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-700 bg-green-600 text-white text-sm font-semibold hover:bg-green-700 shadow-md transition"
  >
    ← Ver preguntas
  </button>

 <button
  type="button"
  onClick={goBackToAxes}
  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-700 bg-green-600 text-white text-sm font-semibold hover:bg-green-700 shadow-md transition"
>
  ← Cambiar eje
</button>

</div>

          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            {activeAxis.questions.map((q, idx) => {
              const isOpen = openQuestionId === q.id;
              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
  stopVoice();
  setOpenQuestionId(isOpen ? null : q.id);
}}

                    className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-slate-50 transition"
                    aria-expanded={isOpen}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-slate-500 font-semibold">
                        Pregunta {idx + 1} de 5
                      </div>
                      <div className="mt-1 text-base md:text-lg font-semibold text-slate-900">
                        {q.question}
                      </div>
                    </div>

                    <div className="shrink-0 text-slate-500 text-xl pt-1">
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
          const follow =
            q.followups?.length ? `\n\nPara seguir reflexionando:\n- ${q.followups.join("\n- ")}` : "";
          const textToRead = `Eje: ${activeAxis.title}\n\nPregunta ${idx + 1}:\n${q.question}\n\n${q.reflection}${follow}`;
          guideSay(textToRead);
        }}
        className="rounded-xl px-4 py-2 border border-green-700 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
      >
        🔊 Leer reflexión
      </button>
    </div>

    {q.followups?.length ? (
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
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

          <section className="mt-6 rounded-2xl border border-green-100 bg-green-50/50 p-5">
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
      className="rounded-xl px-4 py-2 border border-green-700 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
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
    onClick={() =>
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  className="fixed bottom-5 left-1/2 -translate-x-[120%] z-[9999] rounded-full bg-green-600 text-white px-4 py-3 text-sm font-semibold shadow-lg hover:bg-green-700 transition"

    aria-label="Subir"
  >
    ↑ Subir
  </button>
) : null}

    </main>
  );
}

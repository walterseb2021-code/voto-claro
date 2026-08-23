"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  answerSecureRetoQuestion,
  requestSecureRetoQuestion,
  RetoSecureClientError,
  spinSecurePrincipal,
  startSecureReto,
  type RetoPrincipalAnswerResponse,
  type RetoPrincipalProgress,
  type RetoPrincipalQuestionResponse,
  type RetoSecureQuestion,
  type RetoSecureSession,
  type RetoSecureSpinResponse,
} from "@/lib/retoSecureClient";

const QUESTION_SECONDS = 10;
const WHEEL_SEGMENTS = 8;
const WHEEL_SPINS = 6;
const WHEEL_ANIMATION_MS = 2800;

const SEGMENTS = [
  { n: 1, color: "#22c55e", label: "Inténtalo nuevamente" },
  { n: 2, color: "#f59e0b", label: "🎁 Premio" },
  { n: 3, color: "#06b6d4", label: "Inténtalo nuevamente" },
  { n: 4, color: "#a855f7", label: "Inténtalo nuevamente" },
  { n: 5, color: "#ef4444", label: "Inténtalo nuevamente" },
  { n: 6, color: "#f59e0b", label: "🎁 Premio" },
  { n: 7, color: "#3b82f6", label: "Inténtalo nuevamente" },
  { n: 8, color: "#84cc16", label: "Inténtalo nuevamente" },
] as const;

type SpinView = RetoSecureSpinResponse["spin"];

function isPrincipalProgress(
  value: RetoPrincipalProgress | { position: number }
): value is RetoPrincipalProgress {
  return "phase" in value;
}

function asPrincipalQuestion(
  value: Awaited<ReturnType<typeof requestSecureRetoQuestion>>
): RetoPrincipalQuestionResponse {
  if (
    !("progress" in value) ||
    !value.progress ||
    !("phase" in value.progress)
  ) {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolvió una respuesta de pregunta incompatible."
    );
  }

  return value as RetoPrincipalQuestionResponse;
}

function asPrincipalAnswer(
  value: Awaited<ReturnType<typeof answerSecureRetoQuestion>>
): RetoPrincipalAnswerResponse {
  if (
    !("progress" in value) ||
    !value.progress ||
    !("phase" in value.progress)
  ) {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolvió una respuesta de validación incompatible."
    );
  }

  return value as RetoPrincipalAnswerResponse;
}

function errorMessage(error: unknown) {
  if (error instanceof RetoSecureClientError) {
    if (error.code === "RETO_PRIZES_DISABLED") {
      return "La modalidad con premio continúa deshabilitada por seguridad.";
    }

    if (error.code === "RETO_PRINCIPAL_LOCKED") {
      return error.lockedUntil
        ? `Debes esperar antes de iniciar otro intento con premio. Bloqueo hasta ${new Date(
            error.lockedUntil
          ).toLocaleString()}.`
        : "Debes esperar antes de iniciar otro intento con premio.";
    }

    if (error.code === "RETO_SESSION_EXPIRED") {
      return "La sesión segura del juego venció. Inicia nuevamente cuando el sistema lo permita.";
    }

    if (error.code === "RETO_STATE_CONFLICT") {
      return "El estado seguro del juego cambió. Recarga la página antes de continuar.";
    }

    return error.message;
  }

  return "No se pudo continuar con el reto seguro.";
}

function guideSay(text: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: {
        action: "SAY",
        text,
        speak: true,
      },
    })
  );
}

function secondsUntil(deadline: string | null) {
  if (!deadline) return 0;
  const target = new Date(deadline).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

export default function PrincipalSecurePrizeFlow() {
  const [session, setSession] = useState<RetoSecureSession | null>(null);
  const [progress, setProgress] = useState<RetoPrincipalProgress | null>(null);
  const [question, setQuestion] = useState<RetoSecureQuestion | null>(null);
  const [questionDeadline, setQuestionDeadline] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [spinView, setSpinView] = useState<SpinView | null>(null);
  const [rotation, setRotation] = useState(0);

  const answeringRef = useRef(false);
  const spinTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      answeringRef.current = false;
      if (spinTimerRef.current !== null) {
        window.clearTimeout(spinTimerRef.current);
      }
    };
  }, []);

  const loadQuestion = useCallback(async (activeSession: RetoSecureSession) => {
    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const raw = await requestSecureRetoQuestion(activeSession);
      const response = asPrincipalQuestion(raw);

      setSession(response.session);
      setProgress(response.progress);

      if (response.question) {
        setQuestion(response.question);
        setQuestionDeadline(response.question_deadline ?? null);
        setTimeLeft(secondsUntil(response.question_deadline ?? null));
        guideSay(response.question.q);
      } else {
        setQuestion(null);
        setQuestionDeadline(null);
        setTimeLeft(QUESTION_SECONDS);

        if (response.level_finished) {
          if (response.passed && response.progress.phase === "level2") {
            setFeedback(
              "Nivel 1 aprobado. Continúa con el Nivel 2; el partido autorizado lo determina el servidor."
            );
          } else if (
            response.passed &&
            response.progress.phase === "roulette"
          ) {
            setFeedback("Nivel 2 aprobado. La ruleta segura está habilitada.");
          } else if (!response.passed) {
            setFeedback("El intento con premio finalizó sin aprobar el nivel.");
          }
        }
      }
    } catch (e) {
      setError(errorMessage(e));
      setQuestion(null);
      setQuestionDeadline(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const begin = useCallback(async () => {
    if (loading || answering || spinning) return;

    setLoading(true);
    setError(null);
    setFeedback(null);
    setSpinView(null);

    try {
      const response = await startSecureReto("principal");

      if (!isPrincipalProgress(response.progress)) {
        throw new RetoSecureClientError(
          502,
          "RETO_CLIENT_RESPONSE_INVALID",
          "El servidor devolvió un progreso incompatible."
        );
      }

      setSession(response.session);
      setProgress(response.progress);

      if (
        response.progress.phase === "level1" ||
        response.progress.phase === "level2"
      ) {
        setLoading(false);
        await loadQuestion(response.session);
        return;
      }

      if (response.progress.phase === "roulette") {
        setFeedback(
          response.resumed
            ? "Sesión segura reanudada en la ruleta."
            : "La ruleta segura está habilitada."
        );
      } else if (response.progress.phase === "failed") {
        setFeedback("Este intento con premio ya finalizó sin aprobar.");
      } else if (response.progress.phase === "completed") {
        setFeedback("Este intento con premio ya fue completado.");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [answering, loadQuestion, loading, spinning]);

  const submitAnswer = useCallback(
    async (answer: boolean | null) => {
      if (
        !session ||
        !question ||
        answeringRef.current ||
        loading ||
        spinning
      ) {
        return;
      }

      answeringRef.current = true;
      setAnswering(true);
      setError(null);
      setFeedback(null);

      try {
        const raw = await answerSecureRetoQuestion(
          session,
          question.id,
          answer
        );
        const response = asPrincipalAnswer(raw);

        setSession(response.session);
        setProgress(response.progress);
        setQuestion(null);
        setQuestionDeadline(null);
        setTimeLeft(QUESTION_SECONDS);

        if (response.skipped) {
          setFeedback("Pregunta no contestada dentro del tiempo válido.");
        } else {
          setFeedback(
            response.correct ? "Respuesta correcta." : "Respuesta incorrecta."
          );
        }

        if (response.level_finished) {
          if (response.passed && response.progress.phase === "level2") {
            setFeedback(
              "Nivel 1 aprobado. Continúa con el Nivel 2 seguro."
            );
          } else if (
            response.passed &&
            response.progress.phase === "roulette"
          ) {
            setFeedback("Nivel 2 aprobado. Ya puedes girar la ruleta segura.");
          } else if (!response.passed) {
            setFeedback("El intento con premio terminó sin aprobar el nivel.");
          }
          return;
        }

        // Libera el bloqueo local antes de cargar la siguiente pregunta.
        // Así el temporizador de la nueva pregunta siempre puede arrancar.
        answeringRef.current = false;
        setAnswering(false);

        await loadQuestion(response.session);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        answeringRef.current = false;
        setAnswering(false);
      }
    },
    [loadQuestion, loading, question, session, spinning]
  );

  useEffect(() => {
    if (!question || !questionDeadline || answeringRef.current) return;

    const updateCountdown = () => {
      setTimeLeft(secondsUntil(questionDeadline));
    };

    updateCountdown();

    const interval = window.setInterval(updateCountdown, 250);
    const deadlineMs = new Date(questionDeadline).getTime();
    const delay = Number.isFinite(deadlineMs)
      ? Math.max(0, deadlineMs - Date.now() + 75)
      : 0;

    const timeout = window.setTimeout(() => {
      void submitAnswer(null);
    }, delay);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [question, questionDeadline, submitAnswer]);

  const continueLevel = useCallback(async () => {
    if (!session || loading || answering || spinning) return;
    await loadQuestion(session);
  }, [answering, loadQuestion, loading, session, spinning]);

  const spin = useCallback(async () => {
    if (
      !session ||
      !progress ||
      progress.phase !== "roulette" ||
      spinning ||
      loading ||
      answering
    ) {
      return;
    }

    setSpinning(true);
    setError(null);
    setFeedback(null);
    setSpinView(null);

    try {
      const response = await spinSecurePrincipal(session);
      const result = response.spin;

      setSession(response.session);
      setProgress((current) =>
        current ? { ...current, phase: "completed" } : current
      );

      const segmentAngle = 360 / WHEEL_SEGMENTS;
      const centerAngle =
        (result.segment - 1) * segmentAngle + segmentAngle / 2;
      const desired = (360 - centerAngle) % 360;

      setRotation((currentRotation) => {
        const normalized = ((currentRotation % 360) + 360) % 360;
        const delta = (desired - normalized + 360) % 360;
        return currentRotation + WHEEL_SPINS * 360 + delta;
      });

      if (spinTimerRef.current !== null) {
        window.clearTimeout(spinTimerRef.current);
      }

      spinTimerRef.current = window.setTimeout(() => {
        setSpinView(result);

        if (result.is_prize && result.awarded) {
          setFeedback(
            `La ruleta segura cayó en el segmento ${result.segment}. Premio registrado por el servidor.`
          );
          guideSay(
            `Felicitaciones. La ruleta segura cayó en el número ${result.segment} y el premio quedó registrado.`
          );
        } else if (result.is_prize) {
          setFeedback(
            `La ruleta cayó en el segmento premiado ${result.segment}, pero el servidor no otorgó un nuevo premio por las reglas vigentes.`
          );
        } else {
          setFeedback(
            `La ruleta segura cayó en el segmento ${result.segment}. En este intento no corresponde premio.`
          );
        }

        setSpinning(false);
        spinTimerRef.current = null;
      }, WHEEL_ANIMATION_MS);
    } catch (e) {
      setError(errorMessage(e));
      setSpinning(false);
    }
  }, [answering, loading, progress, session, spinning]);

  const wheelBackground = useMemo(
    () =>
      `conic-gradient(${SEGMENTS.map(
        (segment, index) =>
          `${segment.color} ${index * 45}deg ${(index + 1) * 45}deg`
      ).join(",")})`,
    []
  );

  const phaseLabel =
    progress?.phase === "level1"
      ? "Nivel 1 — Conocimiento general"
      : progress?.phase === "level2"
      ? "Nivel 2 — Partido"
      : progress?.phase === "roulette"
      ? "Nivel 3 — Ruleta segura"
      : progress?.phase === "failed"
      ? "Intento finalizado"
      : progress?.phase === "completed"
      ? "Intento completado"
      : "Listo para iniciar";

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">
            Reto principal con premio — flujo seguro
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Identidad, preguntas, tiempos, avance y resultado de la ruleta son
            validados por el servidor.
          </p>
        </div>

        <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-800">
          {phaseLabel}
        </span>
      </div>

      {!session && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void begin()}
            disabled={loading}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Validando sesión segura..." : "Comenzar o reanudar intento seguro"}
          </button>
          <p className="mt-2 text-xs text-slate-600">
            El intento de 24 horas comienza únicamente cuando el servidor acepta
            este inicio.
          </p>
        </div>
      )}

      {progress && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">Pregunta</div>
            <div className="mt-1 font-extrabold text-slate-900">
              {progress.question_index}/25
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">Buenas</div>
            <div className="mt-1 font-extrabold text-emerald-700">
              {progress.good}
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">Malas</div>
            <div className="mt-1 font-extrabold text-rose-700">
              {progress.bad}
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">No contestadas</div>
            <div className="mt-1 font-extrabold text-amber-700">
              {progress.skipped}
            </div>
          </div>
        </div>
      )}

      {question && progress && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Pregunta segura
            </span>
            <span
              className={`rounded-lg px-2 py-1 text-xs font-extrabold ${
                timeLeft <= 3
                  ? "bg-rose-100 text-rose-700"
                  : "bg-white text-slate-700"
              }`}
            >
              {timeLeft}s
            </span>
          </div>

          <p className="mt-3 text-base font-semibold text-slate-900">
            {question.q}
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={answering || loading}
              onClick={() => void submitAnswer(true)}
              className="flex-1 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              Sí
            </button>
            <button
              type="button"
              disabled={answering || loading}
              onClick={() => void submitAnswer(false)}
              className="flex-1 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-extrabold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              No
            </button>
          </div>
        </div>
      )}

      {!question &&
        session &&
        progress &&
        (progress.phase === "level1" || progress.phase === "level2") && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void continueLevel()}
              disabled={loading || answering}
              className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              {loading ? "Cargando..." : "Continuar nivel seguro"}
            </button>
          </div>
        )}

      {session && progress?.phase === "roulette" && (
        <div className="mt-5">
          <div className="relative mx-auto h-64 w-64">
            <div
              className="h-full w-full rounded-full border-8 border-slate-800 shadow-xl transition-transform duration-[2800ms] ease-out"
              style={{
                background: wheelBackground,
                transform: `rotate(${rotation}deg)`,
              }}
            />
            <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 text-3xl">
              ▼
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-slate-800 bg-white text-xs font-black text-slate-900 shadow">
                VOTO
                <br />
                CLARO
              </div>
            </div>
          </div>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => void spin()}
              disabled={spinning}
              className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-extrabold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {spinning ? "Validando y girando..." : "Girar ruleta segura"}
            </button>
            <p className="mt-2 text-xs text-slate-600">
              El navegador no elige el segmento. El resultado proviene del
              servidor y solo se usa aquí para la animación.
            </p>
          </div>
        </div>
      )}

      {spinView && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800">
          Resultado seguro: segmento <b>{spinView.segment}</b>.{" "}
          {spinView.is_prize
            ? spinView.awarded
              ? "Premio otorgado y registrado."
              : "Segmento premiado sin nuevo otorgamiento por las reglas vigentes."
            : "Sin premio en este intento."}
        </div>
      )}

      {feedback && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">
          {feedback}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}
    </div>
  );
}

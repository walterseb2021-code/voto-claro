// src/app/reto-ciudadano/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import CaminoCiudadano, {
  type CaminoCiudadanoRuntimeState,
} from "./components/CaminoCiudadano";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

type PlayMode = "sin_premio" | "con_premio";

/** Pregunta tipo Sí/No */
type YesNoQuestion = {
  id: string;
  q: string;
  a: boolean; // true = SÍ, false = NO
  note?: string; // opcional: explicación breve
};

type Winner = {
  alias: string;
  created_at: string;
  segmento: number;
  premio: string;
};

/** Shuffle simple */
function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type QuestionsAPI = {
  level: number;
  count: number;
  source: "supabase" | "local";
  partyId: string | null;
  questions: YesNoQuestion[];
};
type PartiesAPI = {
  level: number;
  lang: string;
  count: number;
  partyIds: string[];
};

/** Normaliza texto + repara mojibake típico (UTF-8 leído como latin1) */
function fixMojibake(s: string) {
  const str = s ?? "";

  // Heurística: caracteres típicos de mojibake en ES (Ã, Â, �, ├, ┬, etc.)
  const looksBad = /[ÃÂ�├┬]/.test(str);
  if (!looksBad) return str;

  try {
    // Reinterpretar bytes latin1 -> UTF-8
    const bytes = Uint8Array.from(str, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded;
  } catch {
    return str;
  }
}

/** Normaliza texto (controles raros + mojibake + símbolos basura) */
function cleanText(s: string) {
  const base = (s ?? "")
    .replace(/\r?\n/g, " ")
    // quita controles y normaliza espacios
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const fixed = fixMojibake(base);

  // Quita símbolos basura típicos que aparecen en ese mojibake (no deberían existir en ES normal)
  return fixed.replace(/[┬┐]/g, "").replace(/\s+/g, " ").trim();
}

type Nivel1GeneralProps = {
  mode: PlayMode;
  onStatus?: (s: { started: boolean; finished: boolean; good: number; passed: boolean }) => void;
};

function Nivel1General({ onStatus, mode }: Nivel1GeneralProps) {
  const TOTAL = 25;
  const PASS = 23;

  // 10s por pregunta + pool total 250s
  const QUESTION_SEC = 10;
 
  // ✅ NUEVO: control de inicio
  const [started, setStarted] = useState(false);

  // ✅ Intentos + bloqueo
  const ATTEMPTS_MAX = mode === "sin_premio" ? 3 : 1;
  const LOCK_MS = mode === "sin_premio" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const LS_ATT = `reto_ciudadano:l1:attempts:${mode}`;
  const LS_LOCK = `reto_ciudadano:l1:lockUntil:${mode}`;

  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());

  const locked = lockUntil > 0 && nowTick < lockUntil;
  const attemptsLeft = Math.max(0, ATTEMPTS_MAX - attemptsUsed);

  // Cargar persistencia al montar
  useEffect(() => {
    try {
      const a = Number(localStorage.getItem(LS_ATT) || "0");
      const l = Number(localStorage.getItem(LS_LOCK) || "0");
      setAttemptsUsed(Number.isFinite(a) ? a : 0);
      setLockUntil(Number.isFinite(l) ? l : 0);
    } catch {
      // no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guardar persistencia cuando cambian
  useEffect(() => {
    try {
      localStorage.setItem(LS_ATT, String(attemptsUsed));
      localStorage.setItem(LS_LOCK, String(lockUntil));
    } catch {
      // no-op
    }
  }, [attemptsUsed, lockUntil]);

  // Tick SOLO para refrescar countdown cuando está bloqueado
  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [locked]);

  function lockAttemptWindowAndStop() {
    const until = Date.now() + LOCK_MS;
    setLockUntil(until);
    setStarted(false);
  }

  function formatRemaining(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}m ${String(ss).padStart(2, "0")}s`;
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quiz, setQuiz] = useState<YesNoQuestion[]>([]);
  const [idx, setIdx] = useState(0);

  const [good, setGood] = useState(0);
  const [bad, setBad] = useState(0);
  const [skip, setSkip] = useState(0);

    // Timers
 
  const [qLeft, setQLeft] = useState(QUESTION_SEC);

  // Control de resolución de pregunta
  const [isResolving, setIsResolving] = useState(false);
  const questionDeadlineRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const finished = started && idx >= TOTAL;

  function clearTick() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function syncClocks() {
  const now = Date.now();

  const nextQLeft = questionDeadlineRef.current
    ? Math.max(0, Math.ceil((questionDeadlineRef.current - now) / 1000))
    : QUESTION_SEC;

  setQLeft(nextQLeft);

  return { nextQLeft };
}

  function startClocks() {
  clearTick();

  questionDeadlineRef.current = Date.now() + QUESTION_SEC * 1000;
  setQLeft(QUESTION_SEC);

  tickRef.current = window.setInterval(() => {
    const { nextQLeft } = syncClocks();

    if (nextQLeft <= 0 && !isResolving) {
      resolveCurrentQuestion("skip");
    }
  }, 1000);
}

  function resetQuestionClock() {
  questionDeadlineRef.current = Date.now() + QUESTION_SEC * 1000;
  setQLeft(QUESTION_SEC);
}
  function resolveCurrentQuestion(action: "yes" | "no" | "skip") {
    if (!started) return;
    if (loading || error) return;
    if (finished) return;
    if (isResolving) return;

    const question = quiz[idx];
    if (!question && action !== "skip") return;

    setIsResolving(true);

    if (action === "skip") {
      setSkip((x) => x + 1);
    } else {
      const ok = question.a === (action === "yes");
      if (ok) setGood((x) => x + 1);
      else setBad((x) => x + 1);
    }

    setIdx((x) => x + 1);
    resetQuestionClock();

    window.setTimeout(() => {
      setIsResolving(false);
    }, 120);
  }

  async function resetRun() {
    if (locked) throw new Error("Estás temporalmente bloqueado. Vuelve más tarde.");

     setLoading(true);
setError(null);
clearTick();
questionDeadlineRef.current = null;
setIsResolving(false);

    try {
      const cfg = await safeFetchJson<any>("/reto-ciudadano/config.json");
      if (!cfg) throw new Error("No se pudo cargar /reto-ciudadano/config.json");

      const api = await safeFetchJson<QuestionsAPI>("/api/reto-ciudadano/questions?level=1");
      const poolQuestions =
        Array.isArray(api?.questions) && api!.questions!.length > 0 ? api!.questions! : [];

      if (poolQuestions.length === 0) {
        throw new Error("No hay preguntas disponibles para Nivel 1.");
      }

      const selected =
        poolQuestions.length > TOTAL
          ? shuffle(poolQuestions).slice(0, TOTAL)
          : poolQuestions.slice(0, TOTAL);

      const cleaned = selected.map((x) => ({
        ...x,
        q: cleanText(x.q),
        note: x.note ? cleanText(x.note) : undefined,
      }));

      setQuiz(cleaned);

      setIdx(0);
      setGood(0);
      setBad(0);
      setSkip(0);

      setQLeft(QUESTION_SEC);
      setIsResolving(false);
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido");
      setQuiz([]);
      setIdx(0);
      setGood(0);
      setBad(0);
      setSkip(0);
      setQLeft(QUESTION_SEC);
      setIsResolving(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // no-op
  }, []);

  const current = quiz[idx] ?? null;
   
     async function startLevel1() {
    if (started) return;
    if (locked) return;

    if (attemptsLeft <= 0) {
      lockAttemptWindowAndStop();
      return;
    }

    setAttemptsUsed((x) => x + 1);

    setStarted(true);
await resetRun();
window.setTimeout(() => {
  startClocks();
}, 50);
  }

    function answer(val: boolean) {
    resolveCurrentQuestion(val ? "yes" : "no");
  }

    function doSkip() {
    resolveCurrentQuestion("skip");
  }

  const passed = finished && good >= PASS;

    useEffect(() => {
  if (!finished) return;

  clearTick();

  if (!passed && attemptsLeft <= 0) {
    lockAttemptWindowAndStop();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [finished, passed]);
    useEffect(() => {
    return () => {
      clearTick();
    };
  }, []);

  useEffect(() => {
    onStatus?.({ started, finished, good, passed });
  }, [onStatus, started, finished, good, passed]);

  return (
    <div className="rounded-2xl border bg-green-50 p-4 shadow-sm vc-fade-up vc-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-extrabold text-slate-900">Nivel 1 — Conocimiento general</div>
          <div className="mt-1 text-xs text-slate-700">
            {TOTAL} preguntas • Umbral: <b>{PASS}</b> buenas • {QUESTION_SEC}s por pregunta
          </div>

          <div className="mt-1 text-[11px] text-slate-600">
            Intentos restantes: <b>{attemptsLeft}</b> de {ATTEMPTS_MAX}
            {locked && (
              <span className="ml-2 text-red-700 font-semibold">
                ⏳ Bloqueado por {formatRemaining(lockUntil - nowTick)} — te recomendamos informarte un
                poco más y volver a intentar.
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!started) return;
            if (locked) return;

                       if (attemptsLeft <= 0) {
              lockAttemptWindowAndStop();
              return;
            }

            setAttemptsUsed((x) => x + 1);
            resetRun().then(() => {
  window.setTimeout(() => {
    startClocks();
  }, 50);
});
          }}
          disabled={!started}
          className={`rounded-xl border px-3 py-2 text-xs font-extrabold vc-btn-wave vc-btn-pulse ${
            started
              ? "text-slate-800 bg-white hover:bg-slate-50"
              : "text-slate-400 bg-slate-100 cursor-not-allowed"
          }`}
        >
          Reiniciar
        </button>
      </div>

      {!started && (
        <div className="mt-4 rounded-2xl border bg-white p-4">
          <div className="text-sm font-extrabold text-slate-900">Listo para iniciar</div>
          <div className="mt-1 text-xs text-slate-700">
            El tiempo y las preguntas empiezan solo cuando presionas comenzar.
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={startLevel1}
              disabled={locked || attemptsLeft <= 0}
              className={`w-full rounded-xl border px-5 py-3 text-sm font-extrabold vc-btn-wave vc-btn-pulse ${
                locked || attemptsLeft <= 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-green-100 text-green-900 border-green-300 hover:bg-green-200"
              }`}
            >
              COMENZAR NIVEL 1
            </button>
          </div>
        </div>
      )}

      {started && (
  <div className="mt-3 grid grid-cols-1 gap-2">
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs text-slate-600">⌛ Tiempo de esta pregunta</div>
      <div className="text-lg font-extrabold text-slate-900">{qLeft}s</div>
    </div>
  </div>
)}
      {started && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">✅ Buenas</div>
            <div className="text-lg font-extrabold text-slate-900">{good}</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">❌ Malas</div>
            <div className="text-lg font-extrabold text-slate-900">{bad}</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">⏭ No contestadas</div>
            <div className="text-lg font-extrabold text-slate-900">{skip}</div>
          </div>
        </div>
      )}

      {started && (
        <div className="mt-3">
          {loading && <div className="text-sm text-slate-700">Cargando…</div>}
          {error && <div className="text-sm text-red-700 font-semibold">Error: {error}</div>}
        </div>
      )}

      {started && !loading && !error && (
        <div className="mt-4 rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">
            Pregunta {Math.min(idx + 1, TOTAL)}/{TOTAL}
          </div>

          {!finished ? (
            <>
              <div className="mt-2 text-base font-extrabold text-slate-900">{current?.q}</div>

                               <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => answer(true)}
                  disabled={isResolving}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200 vc-btn-wave vc-btn-pulse disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => answer(false)}
                  disabled={isResolving}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-900 hover:bg-slate-50 vc-btn-wave vc-btn-pulse disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={doSkip}
                  disabled={isResolving}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-slate-50 text-slate-800 hover:bg-slate-100 vc-btn-wave vc-btn-pulse disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Saltar
                </button>
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-slate-800">
              Nivel finalizado. Buenas: <b>{good}</b> · Malas: <b>{bad}</b> · No contestadas:{" "}
              <b>{skip}</b>
              <div className="mt-2 text-sm font-extrabold">
                {passed ? "✅ APROBADO (pasa a Nivel 2)" : "❌ NO APROBADO"}
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Regla: se aprueba con {PASS} respuestas correctas en un total de {TOTAL} preguntas.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Nivel3Ruleta(props: {
  enabled: boolean;
  mode: PlayMode;
  onRestartToLevel1?: () => void;
  onFinishPick?: (pick: number) => void;
}) {
  const { enabled, mode, onRestartToLevel1, onFinishPick } = props;

  const [started, setStarted] = useState(false);

  const MAX_SPINS = mode === "sin_premio" ? 3 : 1;
  const LS_SPINS = `reto_ciudadano:l3:spinsUsed:${mode}`;

  const [spinsUsed, setSpinsUsed] = useState(0);
  const spinsLeft = Math.max(0, MAX_SPINS - spinsUsed);
  const l3Locked = spinsLeft <= 0;

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(LS_SPINS) || "0");
      setSpinsUsed(Number.isFinite(v) ? v : 0);
    } catch {
      // no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SPINS, String(spinsUsed));
    } catch {
      // no-op
    }
  }, [spinsUsed]);

  function clearLevel3SpinLock() {
    try {
      localStorage.removeItem(LS_SPINS);
    } catch {
      // no-op
    }
    setSpinsUsed(0);
  }

  const [spinning, setSpinning] = useState(false);

  const [result, setResult] = useState<{
    n: number;
    color: string;
    isPrize: boolean;
    message: string;
  } | null>(null);

  const [rotation, setRotation] = useState(0);
  const [winPulse, setWinPulse] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const confetti = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.round(Math.random() * 100),
      delay: Math.random() * 0.25,
      duration: 1.8 + Math.random() * 0.6,
      size: 6 + Math.round(Math.random() * 8),
      rot: Math.round(Math.random() * 360),
    }));
  }, []);

  const timerRef = useRef<number | null>(null);

  const segments = useMemo(
    () => [
      { n: 1, color: "#22c55e", label: "Inténtalo nuevamente" },
      { n: 2, color: "#f59e0b", label: "🎁 Premio" },
      { n: 3, color: "#06b6d4", label: "Inténtalo nuevamente" },
      { n: 4, color: "#a855f7", label: "Inténtalo nuevamente" },
      { n: 5, color: "#ef4444", label: "Inténtalo nuevamente" },
      { n: 6, color: "#f59e0b", label: "🎁 Premio" },
      { n: 7, color: "#3b82f6", label: "Inténtalo nuevamente" },
      { n: 8, color: "#84cc16", label: "Inténtalo nuevamente" },
    ],
    []
  );

  function cleanupTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => cleanupTimer();
  }, []);

  useEffect(() => {
    if (!result) return;

    const isWinnerNumber = result.n === 2 || result.n === 6;

    if (!isWinnerNumber) return;

    setWinPulse(true);
    const t1 = window.setTimeout(() => setWinPulse(false), 4200);

    if (result.isPrize && mode === "con_premio") {
      setShowConfetti(true);
      const t2 = window.setTimeout(() => setShowConfetti(false), 2200);

      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }

    return () => {
      window.clearTimeout(t1);
    };
  }, [result, mode]);

  function resetLevel3() {
    cleanupTimer();
    setStarted(false);
    setSpinning(false);
    setResult(null);
    setRotation(0);
  }

  async function startLevel3() {
    if (!enabled) return;
    if (spinning) return;
    if (l3Locked) return;

    setStarted(true);
    setSpinning(true);
    setResult(null);

    const pick = Math.floor(Math.random() * 8) + 1;

    const SEG = 360 / 8;
    const centerAngle = (pick - 1) * SEG + SEG / 2;
    const desired = (360 - centerAngle) % 360;

    const current = ((rotation % 360) + 360) % 360;
    const delta = (desired - current + 360) % 360;

    const spins = 6;
    const targetRotation = rotation + spins * 360 + delta;

    setRotation(targetRotation);

    cleanupTimer();
    timerRef.current = window.setTimeout(async () => {
      const seg = segments.find((x) => x.n === pick)!;
      const isPrize = pick === 2 || pick === 6;

      let message = isPrize ? "🎉 ¡Ganaste!" : "😅 Inténtalo nuevamente";

      if (isPrize && mode === "sin_premio") {
        message = "✨ Cayó en un número premiado, pero estás en modo SIN premio (no se entrega premio).";
      }

      setResult({
        n: pick,
        color: seg.color,
        isPrize,
        message,
      });

      setSpinsUsed((x) => x + 1);
      setSpinning(false);

      onFinishPick?.(pick);
    }, 2800);
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-80 vc-fade-up vc-card-hover">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold text-slate-900">
              Nivel 3 — Ruleta (8 segmentos)
            </div>
            <div className="mt-1 text-xs text-slate-700">Bloqueado hasta aprobar Nivel 2 (23 buenas).</div>
          </div>
          <span className="rounded-xl border px-3 py-2 text-xs font-extrabold text-slate-700 bg-slate-50">
            🔒 Bloqueado
          </span>
        </div>
      </div>
    );
  }

  const wheelBg = `conic-gradient(
    ${segments[0].color} 0deg 45deg,
    ${segments[1].color} 45deg 90deg,
    ${segments[2].color} 90deg 135deg,
    ${segments[3].color} 135deg 180deg,
    ${segments[4].color} 180deg 225deg,
    ${segments[5].color} 225deg 270deg,
    ${segments[6].color} 270deg 315deg,
    ${segments[7].color} 315deg 360deg
  )`;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm vc-fade-up vc-card-hover">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-extrabold text-slate-900">Nivel 3 — Ruleta (8 segmentos)</div>
          <div className="mt-1 text-xs text-slate-700">✅ Desbloqueado • Presiona comenzar para girar.</div>

          <div className="mt-1 text-[11px] text-slate-600">
            Premio solo en: <b>#2</b> y <b>#6</b> • Giros restantes: <b>{spinsLeft}</b> de {MAX_SPINS}
          </div>

          {l3Locked && (
            <div className="mt-2 text-xs text-red-700 font-semibold">
              🛑 Ya agotaste tus giros. Para volver a jugar, debes empezar desde el Nivel 1.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetLevel3}
            disabled={!started && !result && rotation === 0}
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold vc-btn-wave vc-btn-pulse ${
              started || result || rotation !== 0
                ? "text-slate-800 bg-white hover:bg-slate-50"
                : "text-slate-400 bg-slate-100 cursor-not-allowed"
            }`}
          >
            Reiniciar
          </button>

          <button
            type="button"
            onClick={startLevel3}
            disabled={spinning || l3Locked}
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold vc-btn-wave vc-btn-pulse ${
              spinning || l3Locked
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-green-100 text-green-900 border-green-300 hover:bg-green-200"
            }`}
          >
            COMENZAR NIVEL 3
          </button>
        </div>
      </div>

      {/* Ruleta */}
      <div className="mt-4 flex flex-col items-center">
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
            {confetti.map((p) => (
              <span
                key={p.id}
                className="vc-confetti"
                style={{
                  left: `${p.left}vw`,
                  width: p.size,
                  height: p.size,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                  transform: `rotate(${p.rot}deg)`,
                }}
              />
            ))}
          </div>
        )}
        <div className="relative" style={{ width: 280, height: 280 }}>
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-2 z-20"
            style={{
              width: 0,
              height: 0,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderBottom: "18px solid #111827",
              filter: "drop-shadow(0 6px 10px rgba(0,0,0,.25))",
            }}
          />

          <div
            className={`absolute inset-0 rounded-full border ${winPulse ? "vc-win-pulse" : ""}`}
            style={{
              background: wheelBg,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 2.8s cubic-bezier(.12,.75,.05,1)" : "none",
              boxShadow: "0 18px 45px rgba(0,0,0,.18)",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full border bg-white px-4 py-3 text-center shadow-sm">
                <div className="text-[10px] text-slate-600">Voto Claro</div>
                <div className="text-sm font-extrabold text-slate-900">Ruleta</div>
              </div>
            </div>

            {segments.map((s) => {
              const angle = (s.n - 1) * 45 + 22.5;
              return (
                <div
                  key={s.n}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: `rotate(${angle}deg) translate(0, -110px) rotate(${-angle}deg)`,
                    transformOrigin: "center",
                  }}
                >
                  <div className="rounded-lg bg-white/80 px-2 py-1 text-xs font-extrabold text-slate-900 border">
                    {s.n}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {result && (
          <div className="mt-4 w-full rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm font-extrabold text-slate-900">Resultado</div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-800">
                Cayó en: <b>#{result.n}</b>
                <div className="mt-1 text-xs text-slate-600">{result.message}</div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Color:</span>
                <span
                  className="inline-block h-6 w-10 rounded-md border"
                  style={{ background: result.color }}
                  title={result.color}
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 w-full rounded-2xl border bg-white p-4">
          <div className="text-sm font-extrabold text-slate-900 mb-3">Premios por número</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {segments.map((s) => (
              <div 
                key={s.n} 
                className="flex items-center justify-between rounded-xl border bg-white p-2 min-h-[48px]"
                style={{ borderLeft: `6px solid ${s.color}` }}
              >
                <div className="flex items-center gap-2 min-w-[40px]">
                  <span className="text-xs font-extrabold text-slate-900 bg-slate-100 rounded-full w-6 h-6 flex items-center justify-center">
                    {s.n}
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-slate-700 text-right flex-1 ml-2 break-words">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          {!result && (
            <div className="mt-3 text-[11px] text-slate-600">
              {mode === "con_premio"
                ? "Modo con premio: #2 y #6 entregan premio."
                : "Modo sin premio: #2 y #6 no entregan premio."}
            </div>
          )}

          {/* Descripción del premio */}
          <div className="mt-3 text-xs text-green-700 bg-green-50 p-2 rounded-lg border border-green-300">
            🎉 <strong>Premio:</strong> Asistencia al Congreso Político "Democracia y Participación Ciudadana" 
            con pasajes y estadía cubiertos (3 días, 2 noches). Incluye alimentación y participación en mesas de diálogo 
            con representantes políticos y líderes de opinión.
          </div>
        </div>

        {l3Locked && (
          <div className="mt-4 w-full">
            <button
              type="button"
              onClick={() => {
                clearLevel3SpinLock();
                onRestartToLevel1?.();
              }}
              className="w-full rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-800 hover:bg-slate-50 vc-btn-wave vc-btn-pulse"
            >
              ↺ Volver a empezar (Nivel 1)
            </button>
          </div>
        )}
        <style>{`
          .vc-win-pulse{
            animation: vcWinPulse 4.2s ease-in-out;
            box-shadow: 0 18px 45px rgba(0,0,0,.18), 0 0 0 0 rgba(245,158,11,.0);
          }
          @keyframes vcWinPulse{
            0%   { filter: brightness(1);   transform: scale(1); }
            10%  { filter: brightness(1.2); transform: scale(1.01); box-shadow: 0 18px 45px rgba(0,0,0,.18), 0 0 18px 6px rgba(245,158,11,.35); }
            25%  { filter: brightness(0.95);transform: scale(0.995); }
            40%  { filter: brightness(1.18);transform: scale(1.01); box-shadow: 0 18px 45px rgba(0,0,0,.18), 0 0 18px 6px rgba(245,158,11,.32); }
            60%  { filter: brightness(0.97);transform: scale(0.997); }
            85%  { filter: brightness(1.10);transform: scale(1.005); box-shadow: 0 18px 45px rgba(0,0,0,.18), 0 0 12px 4px rgba(245,158,11,.22); }
            100% { filter: brightness(1);   transform: scale(1); }
          }

          .vc-confetti{
            position: absolute;
            top: -16px;
            border-radius: 4px;
            background: rgba(245,158,11,.95);
            box-shadow: 0 6px 18px rgba(0,0,0,.15);
            animation-name: vcConfettiFall;
            animation-timing-function: ease-in;
            animation-fill-mode: both;
          }
          .vc-confetti:nth-child(3n){ background: rgba(34,197,94,.95); }
          .vc-confetti:nth-child(4n){ background: rgba(59,130,246,.95); }
          .vc-confetti:nth-child(5n){ background: rgba(168,85,247,.95); }

          @keyframes vcConfettiFall{
            0%   { transform: translateY(-10px) rotate(0deg); opacity: 0; }
            10%  { opacity: 1; }
            100% { transform: translateY(105vh) rotate(420deg); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}

function Nivel2Partido(props: {
  enabled: boolean;
  mode: PlayMode;
  nivel1Good: number;
  partyId: string;
  setPartyId: (v: string) => void;
  partyIds: string[];
  partyLoading: boolean;
  partyError: string | null;
  onStatus?: (s: { good: number; passed: boolean }) => void;
  onHardResetToLevel1?: () => void;
}) {
  const TOTAL = 25;
  const PASS = 23;

  const QUESTION_SEC = 10;
  const POOL_TOTAL_SEC = 250;

  const { enabled, mode, partyId, setPartyId, partyIds, partyLoading, partyError } = props;

  const [started, setStarted] = useState(false);
  const [runPartyId, setRunPartyId] = useState<string>("");

  const ATTEMPTS_MAX = mode === "sin_premio" ? 3 : 1;
  const LOCK_MS = mode === "sin_premio" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const LS_ATT = `reto_ciudadano:l2:attempts:${mode}`;
  const LS_LOCK = `reto_ciudadano:l2:lockUntil:${mode}`;

  function readLSNumber(key: string, fallback = 0) {
    try {
      const v = Number(localStorage.getItem(key) || "");
      return Number.isFinite(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  const [attemptsUsed, setAttemptsUsed] = useState<number>(() => readLSNumber(LS_ATT, 0));
  const [lockUntil, setLockUntil] = useState<number>(() => readLSNumber(LS_LOCK, 0));
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const locked = lockUntil > 0 && nowTick < lockUntil;
  const attemptsLeft = Math.max(0, ATTEMPTS_MAX - attemptsUsed);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ATT, String(attemptsUsed));
      localStorage.setItem(LS_LOCK, String(lockUntil));
    } catch {
      // no-op
    }
  }, [attemptsUsed, lockUntil]);

  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [locked]);

  function formatRemaining(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}m ${String(ss).padStart(2, "0")}s`;
  }

  function lockOneHourAndHardReset() {
    const until = Date.now() + LOCK_MS;

    try {
      localStorage.setItem(LS_LOCK, String(until));
      localStorage.setItem(LS_ATT, String(ATTEMPTS_MAX));
    } catch {
      // no-op
    }

    setLockUntil(until);
    setAttemptsUsed(ATTEMPTS_MAX);
    setStarted(false);

    props.onHardResetToLevel1?.();
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quiz, setQuiz] = useState<YesNoQuestion[]>([]);
  const [idx, setIdx] = useState(0);

  const [good, setGood] = useState(0);
  const [bad, setBad] = useState(0);
  const [skip, setSkip] = useState(0);

  const [poolLeft, setPoolLeft] = useState(POOL_TOTAL_SEC);
  const [qLeft, setQLeft] = useState(QUESTION_SEC);

  const lockedRef = useRef(false);

  const finished = started && (idx >= TOTAL || poolLeft <= 0);
  const passed = finished && good >= PASS;

  useEffect(() => {
    if (!finished) return;
    if (passed) return;

    if (attemptsUsed >= ATTEMPTS_MAX) {
      lockOneHourAndHardReset();
    }
  }, [finished, passed, attemptsUsed, ATTEMPTS_MAX]);

  useEffect(() => {
    if (!finished) return;
    props.onStatus?.({ good, passed });
  }, [finished, good, passed, props]);

  const current = quiz[idx] ?? null;

  async function resetRun(nextPartyId?: string) {
    if (locked) throw new Error("Estás temporalmente bloqueado. Vuelve más tarde.");

    const pid = String(nextPartyId ?? runPartyId ?? partyId ?? "").trim();

    setLoading(true);
    setError(null);
    lockedRef.current = false;

    try {
      if (!enabled) throw new Error("Nivel 2 está bloqueado.");
      if (!pid) throw new Error("Selecciona un Party ID para iniciar Nivel 2.");

      const cfg = await safeFetchJson<any>("/reto-ciudadano/config.json");
      if (!cfg) throw new Error("No se pudo cargar /reto-ciudadano/config.json");

      const url = `/api/reto-ciudadano/questions?level=2&partyId=${encodeURIComponent(pid)}`;
      const api = await safeFetchJson<QuestionsAPI>(url);

      const poolQuestions =
        Array.isArray(api?.questions) && api!.questions!.length > 0 ? api!.questions! : [];

      if (poolQuestions.length === 0) {
        throw new Error(`No hay preguntas disponibles para Nivel 2 (partyId=${pid}).`);
      }

      const selected =
        poolQuestions.length > TOTAL
          ? shuffle(poolQuestions).slice(0, TOTAL)
          : poolQuestions.slice(0, TOTAL);

      const cleaned = selected.map((x) => ({
        ...x,
        q: cleanText(x.q),
        note: x.note ? cleanText(x.note) : undefined,
      }));

      setQuiz(cleaned);

      setIdx(0);
      setGood(0);
      setBad(0);
      setSkip(0);

      setPoolLeft(POOL_TOTAL_SEC);
      setQLeft(QUESTION_SEC);

      setRunPartyId(pid);
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido");
      setQuiz([]);
      setIdx(0);
      setGood(0);
      setBad(0);
      setSkip(0);
      setPoolLeft(POOL_TOTAL_SEC);
      setQLeft(QUESTION_SEC);
    } finally {
      setLoading(false);
    }
  }

  async function startLevel2() {
    if (!enabled) return;
    if (started) return;

    if (locked) return;

    if (attemptsLeft <= 0) {
      lockOneHourAndHardReset();
      return;
    }

    setAttemptsUsed((x) => x + 1);

    const pid = String(partyId ?? "").trim();
    setRunPartyId(pid);
    setStarted(true);
    await resetRun(pid);
  }

  
  useEffect(() => {
    if (!enabled) return;
    if (!started) return;
    if (loading || error) return;
    if (finished) return;
    if (qLeft > 0) return;

    if (lockedRef.current) return;
    lockedRef.current = true;

    setSkip((x) => x + 1);
    setIdx((x) => x + 1);
    setQLeft(QUESTION_SEC);

    queueMicrotask(() => {
      lockedRef.current = false;
    });
  }, [enabled, started, loading, error, finished, qLeft]);

  function answer(val: boolean) {
    if (!enabled) return;
    if (!started) return;
    if (loading || error) return;
    if (finished) return;
    if (!current) return;
    if (lockedRef.current) return;

    lockedRef.current = true;

    const ok = current.a === val;
    if (ok) setGood((x) => x + 1);
    else setBad((x) => x + 1);

    setIdx((x) => x + 1);
    setQLeft(QUESTION_SEC);

    queueMicrotask(() => {
      lockedRef.current = false;
    });
  }

  function doSkip() {
    if (!enabled) return;
    if (!started) return;
    if (loading || error) return;
    if (finished) return;
    if (lockedRef.current) return;

    lockedRef.current = true;

    setSkip((x) => x + 1);
    setIdx((x) => x + 1);
    setQLeft(QUESTION_SEC);

    queueMicrotask(() => {
      lockedRef.current = false;
    });
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-80 vc-fade-up vc-card-hover">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold text-slate-900">
              Nivel 2 — Partido (según “Alianza para el Progreso”)
            </div>
            <div className="mt-1 text-xs text-slate-700">Bloqueado hasta aprobar Nivel 1 (23 buenas).</div>
          </div>
          <span className="rounded-xl border px-3 py-2 text-xs font-extrabold text-slate-700 bg-slate-50">
            🔒 Bloqueado
          </span>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-90 vc-fade-up vc-card-hover">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold text-slate-900">
              Nivel 2 — Partido (según “Alianza para el Progreso”)
            </div>
            <div className="mt-1 text-xs text-slate-700">
              🔒 Bloqueado temporalmente por {formatRemaining(lockUntil - nowTick)}.
            </div>
            <div className="mt-2 text-[11px] text-slate-600">
              Te recomendamos revisar “Alianza para el Progreso” y volver luego.
            </div>
          </div>

          <span className="rounded-xl border px-3 py-2 text-xs font-extrabold text-slate-700 bg-slate-50">
            🔒 Bloqueado
          </span>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => props.onHardResetToLevel1?.()}
            className="w-full rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-800 hover:bg-slate-50 vc-btn-wave vc-btn-pulse"
          >
            ↺ Volver a empezar (Nivel 1)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm vc-fade-up vc-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-extrabold text-slate-900">
            Nivel 2 — Partido (según “Alianza para el Progreso”)
          </div>
          <div className="mt-1 text-xs text-slate-700">
            ✅ Desbloqueado • {TOTAL} preguntas • Umbral: <b>{PASS}</b> • {QUESTION_SEC}s/pregunta • Pool:{" "}
            <b>{POOL_TOTAL_SEC}s</b>
          </div>

          <div className="mt-1 text-[11px] text-slate-600">
            Intentos restantes: <b>{attemptsLeft}</b> de {ATTEMPTS_MAX}
            {locked && (
              <span className="ml-2 text-red-700 font-semibold">
                ⏳ Bloqueado por {formatRemaining(lockUntil - nowTick)} — revisa “Alianza para el Progreso” y vuelve luego.
              </span>
            )}
          </div>

          <div className="mt-2 text-[11px] text-slate-600">
            Party ID en uso:{" "}
            <code className="font-semibold">{(runPartyId || partyId || "").trim() || "(vacío)"}</code>
            {!started && <span className="ml-2 text-slate-500">(puedes cambiar el selector antes de comenzar)</span>}
            {started && <span className="ml-2 text-slate-500">(si cambias el selector, aplica recién al reiniciar)</span>}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!started) return;
            if (locked) return;

            if (attemptsLeft <= 0) {
              lockOneHourAndHardReset();
              return;
            }

            setAttemptsUsed((x) => x + 1);
            resetRun(runPartyId || partyId);
          }}
          disabled={!started}
          className={`rounded-xl border px-3 py-2 text-xs font-extrabold vc-btn-wave vc-btn-pulse ${
            started
              ? "text-slate-800 bg-white hover:bg-slate-50"
              : "text-slate-400 bg-slate-100 cursor-not-allowed"
          }`}
        >
          Reiniciar
        </button>
      </div>

      {!started && (
        <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
          <div className="text-sm font-extrabold text-slate-900">Listo para iniciar</div>
          <div className="mt-1 text-xs text-slate-700">
            El tiempo y las preguntas empiezan solo cuando presionas comenzar.
          </div>

          <div className="mt-4">
            <button
              type="button"
              disabled={!partyId || locked}
              onClick={startLevel2}
              className={`w-full rounded-xl border px-5 py-3 text-sm font-extrabold vc-btn-wave vc-btn-pulse ${
                !partyId || locked
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-green-100 text-green-900 border-green-300 hover:bg-green-200"
              }`}
            >
              COMENZAR NIVEL 2
            </button>
          </div>

          {partyLoading && <div className="mt-2 text-xs text-slate-600">Cargando partidos…</div>}
          {partyError && <div className="mt-2 text-xs text-red-700 font-semibold">{partyError}</div>}

          {partyIds.length > 0 && (
            <div className="mt-3">
              <label className="text-[11px] font-bold text-slate-700">Selecciona partido</label>
              <select
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                disabled={started}
              >
                {partyIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {started && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">⏱ Pool restante</div>
            <div className="text-lg font-extrabold text-slate-900">{poolLeft}s</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">⌛ Tiempo de esta pregunta</div>
            <div className="text-lg font-extrabold text-slate-900">{qLeft}s</div>
          </div>
        </div>
      )}

      {started && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">✅ Buenas</div>
            <div className="text-lg font-extrabold text-slate-900">{good}</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">❌ Malas</div>
            <div className="text-lg font-extrabold text-slate-900">{bad}</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-600">⏭ No contestadas</div>
            <div className="text-lg font-extrabold text-slate-900">{skip}</div>
          </div>
        </div>
      )}

      {started && (
        <div className="mt-3">
          {loading && <div className="text-sm text-slate-700">Cargando…</div>}
          {error && <div className="text-sm text-red-700 font-semibold">Error: {error}</div>}
        </div>
      )}

      {started && !loading && !error && (
        <div className="mt-4 rounded-2xl border bg-white p-4">
          <div className="text-xs text-slate-600">
            Pregunta {Math.min(idx + 1, TOTAL)}/{TOTAL}
          </div>

          {!finished ? (
            <>
              <div className="mt-2 text-base font-extrabold text-slate-900">{current?.q}</div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => answer(true)}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200 vc-btn-wave vc-btn-pulse"
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => answer(false)}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-900 hover:bg-slate-50 vc-btn-wave vc-btn-pulse"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={doSkip}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-slate-50 text-slate-800 hover:bg-slate-100 vc-btn-wave vc-btn-pulse"
                >
                  Saltar
                </button>
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-slate-800">
              Nivel finalizado. Buenas: <b>{good}</b> · Malas: <b>{bad}</b> · No contestadas: <b>{skip}</b>
              <div className="mt-2 text-sm font-extrabold">
                {passed ? "✅ APROBADO (pasa a Nivel 3)" : "❌ NO APROBADO"}
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Regla: se aprueba con {PASS} buenas antes de que termine el pool.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPONENTE DE LISTA DE GANADORES
// ============================================
function ListaGanadores(props: {
  onStateChange?: (state: {
    filtro: string;
    loading: boolean;
    error: string | null;
    ganadoresCount: number;
  }) => void;
}) {
  const [filtro, setFiltro] = useState<string>("HOY");
  const [ganadores, setGanadores] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  async function cargarGanadores() {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .rpc('get_reto_ganadores', { filtro });

      if (error) throw error;

      setGanadores(data || []);
    } catch (e: any) {
      console.error('Error cargando ganadores:', e);
      setError(e?.message || 'Error al cargar ganadores');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarGanadores();
  }, [filtro]);
     useEffect(() => {
  props.onStateChange?.({
    filtro,
    loading,
    error,
    ganadoresCount: ganadores.length,
  });
}, [props, filtro, loading, error, ganadores.length]);
  const filtros = [
    { value: "HOY", label: "Hoy" },
    { value: "AYER", label: "Ayer" },
    { value: "SEMANA", label: "Última semana" },
    { value: "MES", label: "Último mes" },
    { value: "TODOS", label: "Todos" },
  ];

  return (
    <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm vc-fade-up vc-card-hover">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">🏆 Ganadores del Reto</h2>
          <p className="text-xs text-slate-600">Lista de ciudadanos que ganaron premios</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {filtros.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`rounded-xl border px-3 py-1 text-xs font-semibold transition vc-btn-wave vc-btn-pulse ${
                filtro === f.value
                  ? "bg-green-100 text-green-900 border-green-300"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {loading && <div className="text-sm text-slate-600">Cargando ganadores...</div>}

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Error: {error}
          </div>
        )}

        {!loading && !error && ganadores.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
            No hay ganadores en este período
          </div>
        )}

        {!loading && !error && ganadores.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {ganadores.map((g, i) => (
              <div
                key={i}
                className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-extrabold text-slate-900">{g.alias}</div>
                  <div className="text-xs text-slate-600">
                    {new Date(g.created_at).toLocaleString('es-PE')}
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-full bg-green-600 text-white px-2 py-0.5 text-xs font-bold">
                    #{g.segmento}
                  </span>
                  <div className="text-xs text-slate-700 mt-1">{g.premio}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function RetoCiudadanoPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();
  const [mode, setMode] = useState<PlayMode>("sin_premio");
 const [participant, setParticipant] = useState<any>(null);
const [checkingData, setCheckingData] = useState(true);
const [hasData, setHasData] = useState(false);

const [codigoAcceso, setCodigoAcceso] = useState("");
const [loginCodigoLoading, setLoginCodigoLoading] = useState(false);
const [loginCodigoError, setLoginCodigoError] = useState<string | null>(null);

const [premioAutorizado, setPremioAutorizado] = useState(false);
const [premioError, setPremioError] = useState<string | null>(null);

function getOrCreateDeviceId() {
  if (typeof window === "undefined") return null;
  const key = "vc_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = "DEV-" + crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

async function refreshParticipant(currentDeviceId?: string | null) {
  const deviceId = currentDeviceId ?? getOrCreateDeviceId();
  if (!deviceId) {
    setParticipant(null);
    setHasData(false);
    setCheckingData(false);
    return null;
  }

  setCheckingData(true);
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("project_participants")
      .select("*")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) throw error;

    setParticipant(data ?? null);
    setHasData(!!data);
    return data ?? null;
  } catch {
    setParticipant(null);
    setHasData(false);
    return null;
  } finally {
    setCheckingData(false);
  }
}

async function loginConCodigo() {
  setLoginCodigoError(null);

  const code = codigoAcceso.trim();
  if (!code) {
    setLoginCodigoError("Ingresa tu código de acceso.");
    return;
  }

  const deviceId = getOrCreateDeviceId();
  if (!deviceId) {
    setLoginCodigoError("No se pudo identificar este dispositivo.");
    return;
  }

  setLoginCodigoLoading(true);

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("project_participants")
      .select("*")
      .eq("codigo_acceso", code)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      setLoginCodigoError("Código no encontrado.");
      return;
    }

    const { error: updateError } = await supabase
      .from("project_participants")
      .update({ device_id: deviceId })
      .eq("id", data.id);

    if (updateError) throw updateError;

    setCodigoAcceso("");
    await refreshParticipant(deviceId);
  } catch {
    setLoginCodigoError("No se pudo iniciar sesión con ese código.");
  } finally {
    setLoginCodigoLoading(false);
  }
}

async function autorizarPremioConParticipante(currentParticipant: any) {
  setPremioError(null);

  if (!currentParticipant) {
    setPremioError("Primero debes registrarte o iniciar sesión con tu código.");
    return;
  }

  const dni = String(currentParticipant?.dni ?? "").trim();
  const celular = String(currentParticipant?.phone ?? "").trim();
  const email = String(currentParticipant?.email ?? "").trim();
  const alias = String(currentParticipant?.alias ?? "").trim();
  const device_id = String(currentParticipant?.device_id ?? "").trim();

  if (!dni || !celular || !email || !alias) {
    setPremioError("Tu ficha general del app debe tener DNI, celular, correo y alias completos.");
    return;
  }

  try {
    const res = await fetch("/api/reto-ciudadano/premio/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dni,
        celular,
        email,
        alias,
        device_id,
        group_code: "GRUPOA",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.error === "BLOQUEO_24H") {
        setPremioError("Estás bloqueado por 24 horas.");
        return;
      }
      if (data.error === "BLOQUEO_PREMIO") {
        setPremioError("Ya ganaste premio. Debes esperar 1 mes.");
        return;
      }

      setPremioError("No se pudo validar el acceso al premio.");
      return;
    }

    setPremioAutorizado(true);
  } catch {
    setPremioError("Error de conexión.");
  }
}

  const [partyId, setPartyId] = useState<string>("perufederal");
  const [partyIds, setPartyIds] = useState<string[]>([]);
  const [partyLoading, setPartyLoading] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);

  const [nivel1Passed, setNivel1Passed] = useState(false);
  const [nivel1Good, setNivel1Good] = useState(0);
  const [nivel2Passed, setNivel2Passed] = useState(false);
  const [nivel2Good, setNivel2Good] = useState(0);

  const [sessionKey, setSessionKey] = useState(0);
  
  const [caminoState, setCaminoState] = useState<CaminoCiudadanoRuntimeState | null>(null);
const [ganadoresState, setGanadoresState] = useState<{
  filtro: string;
  loading: boolean;
  error: string | null;
  ganadoresCount: number;
} | null>(null);
  function hardResetToLevel1() {
    setNivel1Passed(false);
    setNivel1Good(0);
    setNivel2Passed(false);
    setNivel2Good(0);

    // fuerza remount de los componentes para limpiar "started" internos
    setSessionKey((k) => k + 1);

    // ✅ llevar arriba
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
    useEffect(() => {
  void refreshParticipant();
}, []);
  useEffect(() => {
    if (!nivel1Passed) return;

    let alive = true;

    (async () => {
      setPartyLoading(true);
      setPartyError(null);

      const api = await safeFetchJson<PartiesAPI>("/api/reto-ciudadano/parties?level=2&lang=es");
      if (!alive) return;

      const ids = Array.isArray(api?.partyIds) ? api!.partyIds : [];
      setPartyIds(ids);

      if (ids.length > 0) {
        if (!ids.includes(partyId)) setPartyId(ids[0]);
      } else {
        setPartyError("Aún no hay partidos con preguntas de Nivel 2 en Supabase.");
      }

      setPartyLoading(false);
    })().catch((e: any) => {
      if (!alive) return;
      setPartyError(e?.message ?? "No se pudo cargar la lista de partidos.");
      setPartyLoading(false);
    });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel1Passed]);

  const modeLabel = useMemo(() => {
    return mode === "sin_premio" ? "Sin premio" : "Con premio";
  }, [mode]);

      // ✅ Datos del ganador para pasar a la ruleta
          useEffect(() => {
  const visibleParts: string[] = [];

  visibleParts.push(
    `Modo actual visible: ${mode === "con_premio" ? "con premio" : "sin premio"}.`
  );

   if (mode === "con_premio" && !premioAutorizado) {
  if (checkingData) {
    visibleParts.push("Se está verificando si el usuario ya tiene una sesión activa para participar con premio.");
  } else if (!hasData || !participant) {
    visibleParts.push("Se muestra acceso por registro general del app o inicio de sesión con código para participar con premio.");
  } else {
    visibleParts.push("El usuario ya tiene sesión activa y puede validar su acceso con premio.");
  }
}

  if (mode === "con_premio" && premioAutorizado) {
  visibleParts.push(
    `Acceso con premio validado para el alias visible: ${participant?.alias || "(sin alias)"}.`
  );
}

  if (premioError) {
    visibleParts.push(`Error visible de premio: ${premioError}`);
  }

  if (nivel1Passed) {
    visibleParts.push(`Nivel 1 aprobado con ${nivel1Good} respuestas buenas.`);
  } else {
    visibleParts.push(
      `Nivel 1 aún no aprobado. Buenas actuales visibles: ${nivel1Good}.`
    );
  }

  if (nivel2Passed) {
    visibleParts.push(`Nivel 2 aprobado con ${nivel2Good} respuestas buenas.`);
  } else {
    visibleParts.push(
      `Nivel 2 aún no aprobado. Buenas actuales visibles: ${nivel2Good}.`
    );
  }

  if (partyLoading) {
    visibleParts.push("Se están cargando partidos para el Nivel 2.");
  }

  if (partyError) {
    visibleParts.push(`Error visible en partidos del Nivel 2: ${partyError}`);
  }

  if (partyId) {
    visibleParts.push(`Partido actualmente seleccionado para Nivel 2: ${partyId}.`);
  }

  if (partyIds.length > 0) {
    visibleParts.push(`Partidos disponibles visibles para Nivel 2: ${partyIds.length}.`);
  }

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

  visibleParts.push("Está visible la lista pública de ganadores del reto.");

  if (ganadoresState) {
    visibleParts.push(`Filtro visible de ganadores: ${ganadoresState.filtro}.`);

    if (ganadoresState.loading) {
      visibleParts.push("La lista de ganadores se está cargando.");
    }

    if (ganadoresState.error) {
      visibleParts.push(`Error visible en lista de ganadores: ${ganadoresState.error}`);
    } else {
      visibleParts.push(
        `Cantidad visible de ganadores cargados: ${ganadoresState.ganadoresCount}.`
      );
    }
  }

  const activeSection =
    mode === "con_premio" && !premioAutorizado
      ? "registro-premio"
      : caminoState?.showQuestion
      ? "camino-ciudadano-pregunta"
      : caminoState?.won
      ? "camino-ciudadano-ganado"
      : !nivel1Passed
      ? "nivel-1"
      : !nivel2Passed
      ? "nivel-2"
      : "nivel-3";

      const availableActions =
  mode === "con_premio" && !premioAutorizado
    ? checkingData
      ? ["Verificar sesión activa", "Elegir modalidad"]
      : !hasData || !participant
      ? ["Registrarme primero", "Ingresar con código", "Elegir modalidad"]
      : ["Validar acceso con premio", "Elegir modalidad"]
    : caminoState?.showQuestion
      ? ["Responder pregunta de Camino Ciudadano"]
      : !nivel1Passed
      ? ["Comenzar Nivel 1", "Responder preguntas de conocimiento general"]
      : !nivel2Passed
      ? ["Seleccionar partido", "Comenzar Nivel 2", "Responder preguntas del partido"]
      : [
          "Comenzar Nivel 3",
          "Girar la ruleta",
          "Jugar Camino Ciudadano",
          "Revisar lista de ganadores",
        ];

       const summary =
  mode === "con_premio" && !premioAutorizado
    ? checkingData
      ? "Pantalla del reto ciudadano verificando sesión activa para participar con premio."
      : !hasData || !participant
      ? "Pantalla del reto ciudadano que exige registro general del app o inicio de sesión con código para participar con premio."
      : "Pantalla del reto ciudadano lista para validar el acceso con premio de un participante ya identificado."
    : caminoState?.showQuestion
      ? "Pantalla del reto ciudadano con una pregunta activa en Camino Ciudadano."
      : caminoState?.won
      ? "Pantalla del reto ciudadano con Camino Ciudadano ganado."
      : !nivel1Passed
      ? "Pantalla del reto ciudadano en Nivel 1 de conocimiento general."
      : !nivel2Passed
      ? "Pantalla del reto ciudadano en Nivel 2 por partido político."
      : "Pantalla del reto ciudadano con Nivel 3 desbloqueado y juegos activos.";

  const status =
    partyError || premioError || ganadoresState?.error
      ? "error"
      : partyLoading || ganadoresState?.loading
      ? "loading"
      : "ready";

  setPageContext({
    pageId: "reto-ciudadano",
    pageTitle: "Reto ciudadano",
    route: "/reto-ciudadano",
    summary,
    activeSection,
    visibleText: visibleParts.join("\n"),
    availableActions,
    selectedItemTitle: undefined,
    status,
    dynamicData: {
      mode,
      premioAutorizado,
      nivel1Passed,
      nivel1Good,
      nivel2Passed,
      nivel2Good,
      partyId,
      partyIdsCount: partyIds.length,
      partyLoading,
      tieneErrorPremio: !!premioError,
      tieneErrorPartido: !!partyError,
      listaGanadoresVisible: true,
      filtroGanadores: ganadoresState?.filtro ?? null,
      ganadoresCount: ganadoresState?.ganadoresCount ?? null,
      caminoCiudadanoVisible: true,
      caminoPosition: caminoState?.position ?? null,
      caminoTurnsLeft: caminoState?.turnsLeft ?? null,
      caminoShowQuestion: caminoState?.showQuestion ?? false,
      caminoTimeLeft: caminoState?.timeLeft ?? null,
      caminoWon: caminoState?.won ?? false,
      caminoGameOver: caminoState?.gameOver ?? false,
      participantVisible: !!participant,
participantAlias: participant?.alias || null,
participantDni: participant?.dni || null,
participantPhone: participant?.phone || null,
participantEmail: participant?.email || null,
checkingData,
hasData,
loginCodigoLoading,
loginCodigoError,
    },
  });
}, 
[
  setPageContext,
  mode,
  premioAutorizado,
  premioError,
  nivel1Passed,
  nivel1Good,
  nivel2Passed,
  nivel2Good,
  partyId,
  partyIds.length,
  partyLoading,
  partyError,
  caminoState,
  ganadoresState,
  participant,
  checkingData,
  hasData,
  loginCodigoLoading,
  loginCodigoError,
]
);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);

  return (
    <main className="vc-reto mx-auto max-w-4xl px-4 py-6 vc-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">RETO CIUDADANO</h1>
          <p className="mt-1 text-sm text-slate-700">Juego por niveles: Conocimiento general → Partido → Ruleta.</p>
          <p className="mt-1 text-xs text-slate-600">
            Modo actual: <span className="font-semibold">{modeLabel}</span>
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
            Con premio (requiere registro)
          </button>
          {/* Descripción del premio */}
          {mode === "con_premio" && (
            <div className="mt-3 text-xs text-green-700 bg-green-50 p-2 rounded-lg border border-green-300">
              🎉 <strong>Premio:</strong> Asistencia al Congreso Político "Democracia y Participación Ciudadana" 
              con pasajes y estadía cubiertos (3 días, 2 noches). Incluye alimentación y materiales del evento.
              El ganador o ganadores podrán participar en mesas de diálogo con representantes políticos y líderes de opinión.
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-600">
          Nota: el sistema de premios puede estar desactivado durante campaña por normativa.
        </p>
      </section>

        {mode === "con_premio" && (
  <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm vc-fade-up vc-delay-2">
    <div className="text-sm font-extrabold text-slate-900">
      Acceso obligatorio para participar con premio
    </div>

    {checkingData ? (
      <div className="mt-3 text-sm text-slate-600">
        Verificando si ya tienes una sesión activa...
      </div>
    ) : !hasData || !participant ? (
      <>
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-slate-700">
          Para participar con premio debes usar el mismo registro general del app.
          Si aún no tienes código, regístrate una sola vez. Si ya te registraste antes,
          inicia sesión con tu código.
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Link
            href="/proyecto-ciudadano/registro?returnTo=/reto-ciudadano"
            className="rounded-xl border px-4 py-2 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200 text-center vc-btn-wave vc-btn-pulse"
          >
            Registrarme primero
          </Link>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-xs font-extrabold text-slate-700">Iniciar sesión con código</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="Ingresa tu código de acceso"
                value={codigoAcceso}
                onChange={(e) => setCodigoAcceso(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={loginConCodigo}
                disabled={loginCodigoLoading}
                className="rounded-xl border px-4 py-2 text-sm font-extrabold bg-white text-slate-800 hover:bg-slate-50 vc-btn-wave vc-btn-pulse"
              >
                {loginCodigoLoading ? "Ingresando..." : "Ingresar con código"}
              </button>
            </div>

            {loginCodigoError && (
              <div className="mt-3 text-xs font-semibold text-red-700">
                {loginCodigoError}
              </div>
            )}
          </div>
        </div>
      </>
    ) : !premioAutorizado ? (
      <>
        <div className="mt-3 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-slate-700">
          Sesión activa detectada. Participarás con estos datos:
          <div className="mt-2 text-xs text-slate-700">
            <div><b>Alias:</b> {participant.alias || "-"}</div>
            <div><b>DNI:</b> {participant.dni || "-"}</div>
            <div><b>Celular:</b> {participant.phone || "-"}</div>
            <div><b>Correo:</b> {participant.email || "-"}</div>
          </div>
        </div>

        {premioError && (
          <div className="mt-3 text-xs font-semibold text-red-700">
            {premioError}
          </div>
        )}

        <button
          type="button"
          onClick={() => autorizarPremioConParticipante(participant)}
          className="mt-4 rounded-xl border px-4 py-2 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200 vc-btn-wave vc-btn-pulse"
        >
          Validar acceso con premio
        </button>
      </>
    ) : (
      <div className="mt-3 text-xs font-semibold text-green-700">
        ✅ Acceso con premio validado. Puedes iniciar el reto. Alias:{" "}
        <span className="font-bold">{participant?.alias || "-"}</span>
      </div>
    )}
  </section>
)}

      <section className="vc-reto-levels mt-5 grid grid-cols-1 gap-3">
        {mode === "con_premio" && !premioAutorizado ? (
          <div className="rounded-2xl border bg-white p-4 shadow-sm text-sm font-semibold text-slate-700">
            🔒 Debes completar el registro para iniciar el Nivel 1.
          </div>
        ) : (
          <Nivel1General
            key={`l1-${sessionKey}-${mode}`}
            mode={mode}
            onStatus={(s) => {
              setNivel1Good(s.good);
              setNivel1Passed(s.passed);
            }}
          />
        )}

        <Nivel2Partido
          key={`l2-${sessionKey}-${mode}`}
          enabled={nivel1Passed}
          mode={mode}
          nivel1Good={nivel1Good}
          partyId={partyId}
          setPartyId={setPartyId}
          partyIds={partyIds}
          partyLoading={partyLoading}
          partyError={partyError}
          onStatus={(s) => {
            setNivel2Good(s.good);
            setNivel2Passed(s.passed);
          }}
          onHardResetToLevel1={hardResetToLevel1}
        />

        <Nivel3Ruleta
  enabled={nivel2Passed}
  mode={mode}
  onRestartToLevel1={hardResetToLevel1}
  onFinishPick={async (pick) => {
            if (mode !== "con_premio") return;

            // Si no tenemos celular, no podemos bloquear server-side
             const celularPremio = String(participant?.phone ?? "").trim();

if (!celularPremio) {
  setPremioAutorizado(false);
  hardResetToLevel1();
  return;
}

            const isPrize = pick === 2 || pick === 6;

            try {
        if (isPrize) {
  await fetch("/api/reto-ciudadano/premio/lockPrizeMonth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      celular: celularPremio,
      prize_segment: pick,
      prize_note: "Premio ruleta",
    }),
  });
} else {
  await fetch("/api/reto-ciudadano/premio/lock24h", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ celular: celularPremio }),
  });
}
            } catch {}

            // Fuerza que vuelva a pedir registro
            setPremioAutorizado(false);

            // ✅ Deja 2.4s para ver el glow/confetti antes de resetear
            window.setTimeout(() => {
              hardResetToLevel1();
            }, 2400);
          }}
        />
           <CaminoCiudadano
  mode={mode}
  onStateChange={setCaminoState}
  onGameWin={async () => {
  if (mode !== "con_premio") return;

  const celularPremio = String(participant?.phone ?? "").trim();
  if (!celularPremio) return;

  try {
    await fetch("/api/reto-ciudadano/premio/lockPrizeMonth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        celular: celularPremio,
        prize_segment: 0,
        prize_note: "Premio Camino Ciudadano",
      }),
    });
  } catch (error) {
    console.error("Error registrando premio:", error);
  }

  setPremioAutorizado(false);

  window.setTimeout(() => {
    hardResetToLevel1();
  }, 1200);
}}
  />
      </section>
 
      {/* ✅ NUEVO: LISTA DE GANADORES */}
      <ListaGanadores onStateChange={setGanadoresState} />
    </main>
  );
}
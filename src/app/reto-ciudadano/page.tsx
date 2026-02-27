// src/app/reto-ciudadano/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type PlayMode = "sin_premio" | "con_premio";

/** Pregunta tipo Sí/No */
type YesNoQuestion = {
  id: string;
  q: string;
  a: boolean; // true = SÍ, false = NO
  note?: string; // opcional: explicación breve
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
  const POOL_TOTAL_SEC = 250;

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

  function lockOneHourAndStop() {
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
  const [poolLeft, setPoolLeft] = useState(POOL_TOTAL_SEC);
  const [qLeft, setQLeft] = useState(QUESTION_SEC);

  // Control anti doble respuesta
  const lockedRef = useRef(false);

  const finished = started && (idx >= TOTAL || poolLeft <= 0);

  async function resetRun() {
    if (locked) throw new Error("Estás temporalmente bloqueado. Vuelve más tarde.");

    setLoading(true);
    setError(null);
    lockedRef.current = false;

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

      setPoolLeft(POOL_TOTAL_SEC);
      setQLeft(QUESTION_SEC);
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

  useEffect(() => {
    // no-op
  }, []);

  const current = quiz[idx] ?? null;

  useEffect(() => {
    if (!started) return;
    if (loading || error) return;
    if (finished) return;

    const t = window.setInterval(() => {
      setPoolLeft((p) => Math.max(0, p - 1));
      setQLeft((q) => Math.max(0, q - 1));
    }, 1000);

    return () => window.clearInterval(t);
  }, [started, loading, error, finished]);

  useEffect(() => {
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
  }, [qLeft, started, loading, error, finished]);

  async function startLevel1() {
    if (started) return;

    if (locked) return;

    if (attemptsLeft <= 0) {
      lockOneHourAndStop();
      return;
    }

    setAttemptsUsed((x) => x + 1);

    setStarted(true);
    await resetRun();
  }

  function answer(val: boolean) {
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

  const passed = finished && good >= PASS;

  useEffect(() => {
    if (!finished) return;
    if (passed) return;

    if (attemptsLeft <= 0) {
      lockOneHourAndStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, passed]);

  useEffect(() => {
    onStatus?.({ started, finished, good, passed });
  }, [onStatus, started, finished, good, passed]);

  return (
    <div className="rounded-2xl border bg-green-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-extrabold text-slate-900">Nivel 1 — Conocimiento general</div>
          <div className="mt-1 text-xs text-slate-700">
            {TOTAL} preguntas • Umbral: <b>{PASS}</b> buenas • {QUESTION_SEC}s/pregunta • Pool total:{" "}
            <b>{POOL_TOTAL_SEC}s</b>
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
              lockOneHourAndStop();
              return;
            }

            setAttemptsUsed((x) => x + 1);
            resetRun();
          }}
          disabled={!started}
          className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
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
              className={`w-full rounded-xl border px-5 py-3 text-sm font-extrabold ${
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
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200"
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => answer(false)}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-900 hover:bg-slate-50"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={doSkip}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-slate-50 text-slate-800 hover:bg-slate-100"
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
                Regla: se aprueba con {PASS} buenas antes de que termine el pool.
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
 onFinishPick?: (pick: number) => void; // ✅ NUEVO: mandamos el número exacto (1..8)
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
    // ✅ WIN FX: glow + pulso + confetti corto
  const [winPulse, setWinPulse] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const confetti = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.round(Math.random() * 100),     // 0..100 vw
      delay: Math.random() * 0.25,               // 0..0.25s
      duration: 1.8 + Math.random() * 0.6,       // 1.8..2.4s
      size: 6 + Math.round(Math.random() * 8),   // 6..14px
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
  // ✅ Disparar FX cuando hay resultado
  useEffect(() => {
    if (!result) return;

    const isWinnerNumber = result.n === 2 || result.n === 6;

    if (!isWinnerNumber) return;

    // glow/pulso siempre en 2/6
    setWinPulse(true);
    const t1 = window.setTimeout(() => setWinPulse(false), 2200);

    // confetti SOLO si es premio REAL (mode con premio + isPrize)
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

  function startLevel3() {
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
    timerRef.current = window.setTimeout(() => {
      const seg = segments.find((x) => x.n === pick)!;
      const isPrize = pick === 2 || pick === 6;

      let message = isPrize ? "🎉 ¡Ganaste premio!" : "😅 Inténtalo nuevamente";
      if (isPrize && mode === "sin_premio") {
        message = "🎯 Cayó en premio, pero estás en modo SIN premio.";
      }
      if (!isPrize && mode === "con_premio") {
        message = "😅 Inténtalo nuevamente";
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
      <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-80">
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
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
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
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
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
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
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
                {/* ✅ Confetti corto (solo al ganar en modo con premio) */}
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
          {/* Puntero */}
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

          {/* Círculo */}
                         <div
            className={`absolute inset-0 rounded-full border ${winPulse ? "vc-win-pulse" : ""}`}
            style={{
              background: wheelBg,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 2.8s cubic-bezier(.12,.75,.05,1)" : "none",
              boxShadow: "0 18px 45px rgba(0,0,0,.18)",
            }}
          >
            {/* Centro */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full border bg-white px-4 py-3 text-center shadow-sm">
                <div className="text-[10px] text-slate-600">Voto Claro</div>
                <div className="text-sm font-extrabold text-slate-900">Ruleta</div>
              </div>
            </div>

            {/* Números */}
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

        {/* Resultado */}
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

        {/* Tabla/lista de premios */}
        <div className="mt-4 w-full rounded-2xl border bg-white p-4">
          <div className="text-sm font-extrabold text-slate-900">Premios por número</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {segments.map((s) => (
              <div key={s.n} className="flex items-center justify-between rounded-xl border bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-900">#{s.n}</span>
                  <span className="inline-block h-4 w-4 rounded border" style={{ background: s.color }} />
                </div>
                <div className="text-xs font-semibold text-slate-700">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-slate-600">
            {mode === "con_premio"
              ? "Modo con premio: si cae en #2 o #6, muestra premio."
              : "Modo sin premio: no entrega premio aunque caiga en #2 o #6."}
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
              className="w-full rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-800 hover:bg-slate-50"
            >
              ↺ Volver a empezar (Nivel 1)
            </button>
          </div>
        )}
              <style>{`
        .vc-win-pulse{
          animation: vcWinPulse 2.2s ease-in-out;
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
  // ✅ NUEVO: si Nivel 2 se bloquea → volver a empezar desde Nivel 1
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

  // ✅ CRÍTICO: hidratar desde localStorage SIN esperar useEffect (evita “race” de bloqueo)
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

    // ✅ Bloquear SOLO cuando realmente se agotaron los intentos
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
  // Tick timers SOLO si started y enabled
  useEffect(() => {
    if (!enabled) return;
    if (!started) return;
    if (loading || error) return;
    if (finished) return;

    const t = window.setInterval(() => {
      setPoolLeft((p) => Math.max(0, p - 1));
      setQLeft((q) => Math.max(0, q - 1));
    }, 1000);

    return () => window.clearInterval(t);
  }, [enabled, started, loading, error, finished]);

  // Auto-skip cuando qLeft llega a 0
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
      <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold text-slate-900">
              Nivel 2 — Partido (según “Un cambio con valentía”)
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
  // ✅ NUEVO: si está en lock, debe verse bloqueado aunque enabled=true
  if (locked) {
    return (
      <div className="rounded-2xl border bg-white p-4 shadow-sm opacity-90">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-extrabold text-slate-900">
              Nivel 2 — Partido (según “Un cambio con valentía”)
            </div>
            <div className="mt-1 text-xs text-slate-700">
              🔒 Bloqueado temporalmente por {formatRemaining(lockUntil - nowTick)}.
            </div>
            <div className="mt-2 text-[11px] text-slate-600">
              Te recomendamos revisar “Un cambio con valentía” y volver luego.
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
            className="w-full rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-800 hover:bg-slate-50"
          >
            ↺ Volver a empezar (Nivel 1)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-extrabold text-slate-900">
            Nivel 2 — Partido (según “Un cambio con valentía”)
          </div>
          <div className="mt-1 text-xs text-slate-700">
            ✅ Desbloqueado • {TOTAL} preguntas • Umbral: <b>{PASS}</b> • {QUESTION_SEC}s/pregunta • Pool:{" "}
            <b>{POOL_TOTAL_SEC}s</b>
          </div>

          <div className="mt-1 text-[11px] text-slate-600">
            Intentos restantes: <b>{attemptsLeft}</b> de {ATTEMPTS_MAX}
            {locked && (
              <span className="ml-2 text-red-700 font-semibold">
                ⏳ Bloqueado por {formatRemaining(lockUntil - nowTick)} — revisa “Un cambio con valentía” y vuelve luego.
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
          className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
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
              className={`w-full rounded-xl border px-5 py-3 text-sm font-extrabold ${
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
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200"
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => answer(false)}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-white text-slate-900 hover:bg-slate-50"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={doSkip}
                  className="rounded-xl border px-5 py-3 text-sm font-extrabold bg-slate-50 text-slate-800 hover:bg-slate-100"
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

export default function RetoCiudadanoPage() {
  const [mode, setMode] = useState<PlayMode>("sin_premio");
  const [dni, setDni] = useState("");
const [celular, setCelular] = useState("");
const [email, setEmail] = useState("");
const [premioAutorizado, setPremioAutorizado] = useState(false);
const [premioError, setPremioError] = useState<string | null>(null);

async function registrarPremio() {
  setPremioError(null);

  if (!dni || !celular || !email) {
    setPremioError("Todos los campos son obligatorios.");
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
        device_id: "WEB",
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

      setPremioError("No se pudo registrar.");
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
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
            className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 text-center"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-extrabold text-slate-900">Elegir modalidad</div>

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
      {mode === "con_premio" && (
  <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
    <div className="text-sm font-extrabold text-slate-900">
      Registro obligatorio para participar con premio
    </div>

    {!premioAutorizado ? (
      <>
        <div className="mt-3 grid gap-3">
          <input
            type="text"
            placeholder="DNI"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Celular"
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
          />
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        {premioError && (
          <div className="mt-3 text-xs font-semibold text-red-700">
            {premioError}
          </div>
        )}

        <button
          type="button"
          onClick={registrarPremio}
          className="mt-4 rounded-xl border px-4 py-2 text-sm font-extrabold bg-green-100 text-green-900 border-green-300 hover:bg-green-200"
        >
          Registrarme y continuar
        </button>
      </>
    ) : (
      <div className="mt-3 text-xs font-semibold text-green-700">
        ✅ Registro validado. Puedes iniciar el reto.
      </div>
    )}
  </section>
)}
      <section className="mt-5 grid grid-cols-1 gap-3">
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
    if (!celular) {
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
            celular,
            prize_segment: pick,      // ✅ AQUÍ VA 2 o 6
            prize_note: "Premio ruleta",
          }),
        });
      } else {
        await fetch("/api/reto-ciudadano/premio/lock24h", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ celular }),
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
      </section>
    </main>
  );
}

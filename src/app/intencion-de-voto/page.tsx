// src/app/intencion-de-voto/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// ============================================
// TIPOS
// ============================================
type VoteOption = {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  position: number;
  total_votes: number;
};

type GlobalRound = {
  id: string;
  name: string;
  is_active: boolean;
  group_code: string;
  created_at: string;
};

type IntentionQuestions = {
  id: string;
  question_1: string;
  question_2: string;
  question_3: string;
};

// ============================================
// FUNCIONES DE FILTRO
// ============================================
function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0]/g, "o")
    .replace(/[1]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9\s]/g, " ");
}

function hasSoeces(text: string) {
  if (!text) return false;
  const t = normalizeText(text);
  const words = t.split(/\s+/).filter(Boolean);

  const banned = new Set([
    "porqueria", "basura", "asco", "mierda", "carajo", "puta", "puto",
    "culo", "verga", "cabron", "cabrona", "joder", "maldito", "maldita",
    "idiota", "imbecil", "pendejo", "pendeja", "cojudo", "cojuda",
  ]);

  return words.some((w) => banned.has(w));
}

function hasLinks(text: string): boolean {
  if (!text) return false;
  const linkRegex = /https?:\/\/|www\./i;
  return linkRegex.test(text);
}

function validateAnswer(text: string): { valid: boolean; error?: string } {
  if (!text || !text.trim()) return { valid: true };
  
  const trimmed = text.trim();
  
  if (trimmed.length < 10) {
    return { valid: false, error: "Cada respuesta debe tener al menos 10 caracteres" };
  }
  
  if (hasSoeces(trimmed)) {
    return { valid: false, error: "Tus respuestas contienen palabras no permitidas" };
  }
  
  if (hasLinks(trimmed)) {
    return { valid: false, error: "No está permitido incluir enlaces en las respuestas" };
  }
  
  return { valid: true };
}

// ============================================
// FUNCIONES UTILITARIAS
// ============================================
function logoSrc(slug: string) {
  return `/voto/parties/${slug}.png`;
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  return newId;
}

function getGroupFromToken(): string {
  if (typeof window === "undefined") return "GRUPOB"; // default
  const url = new URL(window.location.href);
  const token = url.searchParams.get("t") || "";
  
  if (token.startsWith("GRUPOA-")) return "GRUPOA";
  if (token.startsWith("GRUPOB-")) return "GRUPOB";
  if (token.startsWith("GRUPOC-")) return "GRUPOC";
  if (token.startsWith("GRUPOD-")) return "GRUPOD";
  if (token.startsWith("GRUPOE-")) return "GRUPOE";
  
  return "GRUPOB"; // default
}

const MOTIVATIONAL: string[] = [
  "Un voto responsable empieza con información verificable.",
  "Decidir bien es un acto de respeto por tu futuro y el de tu familia.",
  "No sigas la bulla: sigue la evidencia.",
  "Antes de creer, contrasta. Antes de votar, verifica.",
];

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full border border-green-200 bg-green-100 text-green-800 font-medium">
      {children}
    </span>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
function IntencionDeVotoContent() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // Estados principales
  const [deviceId, setDeviceId] = useState<string>("");
  const [globalRound, setGlobalRound] = useState<GlobalRound | null>(null);
  const [parties, setParties] = useState<VoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userGroup, setUserGroup] = useState<string>("GRUPOB");

  // Flujo de votación
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [confirmedPartyId, setConfirmedPartyId] = useState<string | null>(null);
  const [confirmedPartyName, setConfirmedPartyName] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Estados para preguntas
  const [showQuestions, setShowQuestions] = useState(false);
  const [questions, setQuestions] = useState<IntentionQuestions | null>(null);
  const [answers, setAnswers] = useState({
    answer_1: "",
    answer_2: "",
    answer_3: ""
  });
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  const [answersSubmitted, setAnswersSubmitted] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [answerValidations, setAnswerValidations] = useState({
    answer_1: { valid: true, error: "" },
    answer_2: { valid: true, error: "" },
    answer_3: { valid: true, error: "" }
  });

  // ============================================
  // FUNCIONES DE CARGA
  // ============================================
  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    setUserGroup(getGroupFromToken());
  }, []);

  async function loadGlobalRound() {
    try {
      const { data, error } = await supabase
        .from('vote_rounds')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      setGlobalRound(data);
      return data;
    } catch (e) {
      console.error('Error cargando ronda global:', e);
      setError('No se pudo cargar la ronda actual');
      return null;
    }
  }

  async function loadParties(groupCode: string) {
    try {
      const { data, error } = await supabase
        .from('vote_parties')
        .select('*')
        .eq('group_code', groupCode)
        .eq('enabled', true)
        .order('position');

      if (error) throw error;
      setParties(data || []);
      
      // Calcular total de votos (esto podría venir de otra tabla)
      const total = (data || []).reduce((acc, p) => acc + (p.total_votes || 0), 0);
      return total;
    } catch (e) {
      console.error('Error cargando partidos:', e);
      setError('No se pudieron cargar los partidos');
      return 0;
    }
  }

  async function loadActive() {
    setLoading(true);
    setError(null);
    
    try {
      // 1. Cargar ronda global activa
      const round = await loadGlobalRound();
      
      // 2. Cargar partidos del grupo del usuario
      await loadParties(userGroup);
      
      // 3. Verificar si ya votó en esta ronda
      if (round?.id && deviceId) {
        await checkIfVotedInCurrentRound(deviceId, round.id);
      }
    } catch (e) {
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }

  async function checkIfVotedInCurrentRound(devId: string, roundId: string) {
    try {
      const res = await fetch(`/api/vote/status?device_id=${encodeURIComponent(devId)}&round_id=${roundId}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (res.ok && data?.voted && data?.party_id) {
        setConfirmedPartyId(String(data.party_id));
        
        const party = parties.find(o => o.id === data.party_id);
        if (party) {
          setConfirmedPartyName(party.name);
        }
        
        setLocked(true);
        setNotice(`Ya votaste en la ronda ${globalRound?.name || 'actual'}.`);
        
        // Verificar si ya respondió las preguntas en ESTA ronda
        await checkIfAlreadyAnswered(devId, roundId, data.party_id);
      }
    } catch {
      // Silencio
    }
  }

  async function runGate() {
    if (!token) return;
    try {
      await fetch("/api/gate/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    async function init() {
      await runGate();
      await loadActive();
    }
    init();
  }, [deviceId, userGroup]);

  // ============================================
  // FUNCIONES DE PREGUNTAS
  // ============================================
  async function loadActiveQuestions() {
    try {
      const { data, error } = await supabase
        .rpc('get_active_questions');
      
      if (!error && data && data.length > 0) {
        setQuestions(data[0]);
        return;
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from('vote_intention_questions')
        .select('id, question_1, question_2, question_3')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!questionsError && questionsData && questionsData.length > 0) {
        setQuestions(questionsData[0]);
      } else {
        setQuestions({
          id: 'default',
          question_1: '¿Cuál es la principal razón por la que elegiste este partido?',
          question_2: '¿Qué propuesta o idea de este partido te parece más importante?',
          question_3: '¿Qué valores o principios de este partido se alinean con tu forma de pensar?'
        });
      }
    } catch (e) {
      console.error('Error cargando preguntas:', e);
      setQuestions({
        id: 'default',
        question_1: '¿Cuál es la principal razón por la que elegiste este partido?',
        question_2: '¿Qué propuesta o idea de este partido te parece más importante?',
        question_3: '¿Qué valores o principios de este partido se alinean con tu forma de pensar?'
      });
    }
  }

  async function checkIfAlreadyAnswered(devId: string, roundId: string, partyId: string) {
    try {
      const { data, error } = await supabase
        .from('vote_intention_answers')
        .select('id')
        .eq('device_id', devId)
        .eq('round_id', roundId)
        .eq('party_id', partyId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setAnswersSubmitted(true);
      } else {
        await loadActiveQuestions();
        setShowQuestions(true);
      }
    } catch (e) {
      console.error('Error verificando respuestas:', e);
      await loadActiveQuestions();
      setShowQuestions(true);
    }
  }

  // ============================================
  // VALIDACIÓN DE RESPUESTAS
  // ============================================
  function validateAnswerField(field: keyof typeof answers, value: string) {
    const result = validateAnswer(value);
    setAnswerValidations(prev => ({
      ...prev,
      [field]: { valid: result.valid, error: result.error || "" }
    }));
    return result.valid;
  }

  function handleAnswerChange(question: keyof typeof answers, value: string) {
    setAnswers(prev => ({ ...prev, [question]: value }));
    validateAnswerField(question, value);
    if (questionsError) setQuestionsError(null);
  }

  // ============================================
  // ENVÍO DE RESPUESTAS
  // ============================================
  async function submitAnswers() {
    if (!deviceId || !globalRound?.id || !confirmedPartyId || !confirmedSlug || !questions) {
      setQuestionsError('Faltan datos para enviar las respuestas');
      return;
    }

    // Validar que al menos una respuesta tenga texto
    if (!answers.answer_1.trim() && !answers.answer_2.trim() && !answers.answer_3.trim()) {
      setQuestionsError('Por favor responde al menos una pregunta');
      return;
    }

    // Validar cada respuesta individualmente
    const validations = {
      answer_1: validateAnswer(answers.answer_1),
      answer_2: validateAnswer(answers.answer_2),
      answer_3: validateAnswer(answers.answer_3)
    };

    setAnswerValidations({
      answer_1: { valid: validations.answer_1.valid, error: validations.answer_1.error || "" },
      answer_2: { valid: validations.answer_2.valid, error: validations.answer_2.error || "" },
      answer_3: { valid: validations.answer_3.valid, error: validations.answer_3.error || "" }
    });

    if (!validations.answer_1.valid || !validations.answer_2.valid || !validations.answer_3.valid) {
      setQuestionsError('Por favor corrige los errores en las respuestas');
      return;
    }

    setSubmittingAnswers(true);
    setQuestionsError(null);

    try {
      const { error } = await supabase
        .from('vote_intention_answers')
        .insert({
          device_id: deviceId,
          round_id: globalRound.id,
          party_id: confirmedPartyId,
          party_slug: confirmedSlug,
          questions_id: questions.id !== 'default' ? questions.id : null,
          answer_1: answers.answer_1.trim() || null,
          answer_2: answers.answer_2.trim() || null,
          answer_3: answers.answer_3.trim() || null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
        });

      if (error) throw error;

      setAnswersSubmitted(true);
      setShowQuestions(false);
      setNotice('¡Gracias por compartir tu opinión!');
    } catch (e: any) {
      console.error('Error enviando respuestas:', e);
      
      if (e.message?.includes('unique') || e.code === '23505') {
        setQuestionsError('Ya respondiste estas preguntas en esta ronda.');
        setAnswersSubmitted(true);
        setShowQuestions(false);
      } else {
        setQuestionsError(e?.message || 'Error al enviar las respuestas');
      }
    } finally {
      setSubmittingAnswers(false);
    }
  }

  // ============================================
  // FUNCIONES DE VOTACIÓN
  // ============================================
  const total = useMemo(() => {
    return parties.reduce((acc, o) => acc + (o.total_votes ?? 0), 0);
  }, [parties]);

  const quote = useMemo(() => {
    const idx = Math.abs(total) % MOTIVATIONAL.length;
    return MOTIVATIONAL[idx];
  }, [total]);

  function voteSelect(slug: string) {
    if (locked) return;
    setPendingSlug(slug);
    setNotice(null);
    setShowReflection(slug === "nulo-blanco");
  }

  async function confirmVote() {
    if (locked) return;
    if (!deviceId) return;
    if (!pendingSlug) {
      setNotice("Selecciona una opción antes de confirmar.");
      return;
    }
    if (!globalRound) {
      setNotice("No hay una ronda activa.");
      return;
    }

    setNotice("Registrando tu intención de voto…");

    try {
      const res = await fetch("/api/vote/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          device_id: deviceId,
          party_slug: pendingSlug,
          round_id: globalRound.id,  // ← enviamos la ronda global
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice(data?.error ?? "No se pudo registrar el voto.");
        if (res.status === 409) {
          setLocked(true);
        }
        return;
      }

      // OK - Voto registrado
      setLocked(true);
      setConfirmedPartyId(String(data?.party?.id ?? ""));
      
      const party = parties.find(o => o.id === data?.party?.id);
      if (party) {
        setConfirmedPartyName(party.name);
      }
      
      setNotice(`Listo. Tu voto en la ronda ${globalRound.name} quedó registrado.`);
      if (pendingSlug === "nulo-blanco") setShowReflection(true);

      await loadActive();
      
      // Cargar preguntas para ESTA ronda
      await loadActiveQuestions();
      setShowQuestions(true);
      
    } catch (e) {
      setNotice("Error de conexión. Intenta nuevamente.");
    }
  }

  const confirmedSlug = useMemo(() => {
    if (!confirmedPartyId) return null;
    const opt = parties.find((o) => o.id === confirmedPartyId);
    return opt?.slug ?? null;
  }, [confirmedPartyId, parties]);

  function scrollToTop() {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  // ============================================
  // RENDER
  // ============================================
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100">
      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">

        {/* HEADER */}
        <section className="rounded-3xl border-[6px] border-red-600 shadow-sm overflow-hidden bg-white">
          <div className="p-6 md:p-8 bg-gradient-to-br from-sky-50 via-white to-white">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                    Intención de voto
                  </h1>

                  {globalRound && (
                    <div className="mt-2">
                      <span className="inline-block bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                        {globalRound.name}
                      </span>
                      <span className="ml-2 text-xs text-slate-600">
                        Grupo: {userGroup}
                      </span>
                    </div>
                  )}

                  <p className="mt-2 text-sm md:text-base text-slate-800">
                    Cada mes puedes votar nuevamente. Tu voto anterior queda guardado para análisis histórico.
                  </p>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Pill>Editable hasta confirmar</Pill>
                    <Pill>1 voto por ronda</Pill>
                    <Pill>Nueva ronda cada mes</Pill>
                  </div>

                  <div className="mt-4 text-sm text-slate-900">
                    <span className="inline-block rounded-lg bg-green-100 px-3 py-2 border-2 border-red-500">
                      “{quote}”
                    </span>
                  </div>

                  <div className="mt-4 text-xs text-slate-700">
                    Total registrado en esta ronda: <b>{total}</b>
                  </div>

                  {notice ? (
                    <div className="mt-4 text-sm text-slate-900">
                      <div className="inline-block rounded-xl bg-green-50 border-2 border-red-500 px-4 py-2">
                        {notice}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 shadow-sm transition"
                  >
                    ← Volver al inicio
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* GRID DE VOTACIÓN */}
        <section className="mt-6 border-[6px] border-red-600 rounded-2xl p-6 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="inline-block rounded-lg bg-green-100 px-3 py-1 text-lg font-semibold text-slate-900 border-2 border-red-500">
                Elige una opción
              </h2>
              <p className="text-sm text-slate-800 mt-1">
                Tocar una tarjeta <b>solo selecciona</b>. El registro real ocurre al presionar <b>Confirmar</b>.
              </p>
            </div>

            <div className="text-xs text-slate-800 border border-green-200 rounded-full px-3 py-1 bg-green-50">
              Estado:{" "}
              {locked ? <b>voto confirmado</b> : pendingSlug ? <b>selección pendiente</b> : <b>sin selección</b>}
            </div>
          </div>

          {loading ? (
            <div className="mt-6 text-sm text-slate-700">Cargando opciones…</div>
          ) : error ? (
            <div className="mt-6 text-sm text-red-700">{error}</div>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {parties.map((opt) => {
                  const isSelected = pendingSlug === opt.slug;
                  const isConfirmed = confirmedSlug === opt.slug;
                  const isBlank = opt.slug === "nulo-blanco";

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => voteSelect(opt.slug)}
                      disabled={locked}
                      className={[
                        "text-left w-full rounded-2xl border-[6px] p-4 shadow-sm transition",
                        "border-red-600",
                        locked ? "opacity-95" : "hover:shadow-md",
                        isSelected
                          ? "bg-green-100"
                          : isBlank
                          ? "bg-green-50 hover:bg-green-100"
                          : "bg-white hover:bg-slate-50",
                        isConfirmed ? "ring-2 ring-green-400" : "",
                      ].join(" ")}
                      aria-label={`Seleccionar ${opt.name}`}
                      title={opt.slug}
                    >
                      <div className="flex flex-col items-center text-center">
                        <div
                          className={[
                            "w-full h-24 rounded-xl flex items-center justify-center mb-3 overflow-hidden",
                            isBlank ? "bg-green-200" : "bg-slate-50",
                          ].join(" ")}
                        >
                          <img
                            src={logoSrc(opt.slug)}
                            alt={opt.name}
                            className="h-full w-full object-contain object-top p-2"
                            draggable={false}
                          />
                        </div>

                        <div className="font-semibold text-slate-900 leading-tight">{opt.name}</div>

                        <div className="mt-2 w-full flex justify-end">
                          <div className="text-sm font-extrabold text-slate-900">{opt.total_votes ?? 0}</div>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-700">
                          {locked
                            ? isConfirmed
                              ? "Tu voto en esta ronda"
                              : "Voto ya registrado"
                            : "Toca para seleccionar."}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Reflexión para Nulo/Blanco */}
              {!locked && showReflection && pendingSlug === "nulo-blanco" ? (
                <div className="mt-6 p-4 rounded-xl border-2 border-red-500 bg-green-50 text-sm text-slate-900 text-center">
                  “Antes de optar por <b>nulo</b> o <b>en blanco</b>, asegúrate de haber investigado, comparado y
                  reflexionado. Si nadie te convence, que sea una decisión consciente.”
                </div>
              ) : null}

              {/* Barra de confirmación */}
              <div className="mt-6 flex flex-col gap-3 items-center">
                {!locked ? (
                  <>
                    <div className="text-xs text-slate-700 text-center">
                      {pendingSlug ? (
                        <>
                          Selección actual: <b>{pendingSlug}</b>. Si estás seguro, presiona <b>Confirmar</b>.
                        </>
                      ) : (
                        <>Selecciona una opción para habilitar “Confirmar”.</>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={confirmVote}
                      disabled={!pendingSlug || !deviceId}
                      className={[
                        "inline-flex items-center gap-2 rounded-xl px-5 py-3 border-2 border-red-500 text-sm font-semibold shadow-sm transition",
                        pendingSlug
                          ? "bg-green-700 text-white hover:bg-green-800"
                          : "bg-slate-200 text-slate-600 cursor-not-allowed",
                      ].join(" ")}
                    >
                      ✅ Confirmar voto en {globalRound?.name || 'ronda actual'}
                    </button>
                  </>
                ) : (
                  <div className="text-sm text-slate-900 text-center">
                    ✅ Ya votaste en la ronda {globalRound?.name || 'actual'}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* SECCIÓN DE PREGUNTAS */}
        {locked && showQuestions && !answersSubmitted && questions && (
          <section className="mt-6 border-[6px] border-red-600 rounded-2xl p-6 bg-white shadow-sm">
            <div className="mb-4">
              <h2 className="inline-block rounded-lg bg-green-100 px-3 py-1 text-lg font-semibold text-slate-900 border-2 border-red-500">
                {globalRound?.name}: Cuéntanos ¿por qué {confirmedPartyName ? `elegiste ${confirmedPartyName}` : 'elegiste este partido'}?
              </h2>
              <p className="text-sm text-slate-800 mt-2">
                Tus respuestas nos ayudan a entender cómo evoluciona la opinión ciudadana mes a mes.
                Puedes responder una, dos o las tres preguntas.
              </p>
              <p className="text-xs text-slate-600 mt-1">
                <span className="font-bold">Reglas:</span> Mínimo 10 caracteres por respuesta • Sin groserías • Sin enlaces
              </p>
            </div>

            <div className="space-y-4">
              {/* Pregunta 1 */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  1. {questions.question_1}
                </label>
                <textarea
                  value={answers.answer_1}
                  onChange={(e) => handleAnswerChange('answer_1', e.target.value)}
                  rows={3}
                  className={`w-full rounded-xl border-2 p-3 text-sm bg-green-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    !answerValidations.answer_1.valid && answers.answer_1.trim() 
                      ? 'border-red-600' 
                      : 'border-red-500'
                  }`}
                  placeholder="Escribe tu respuesta aquí..."
                  disabled={submittingAnswers}
                />
                {!answerValidations.answer_1.valid && answers.answer_1.trim() && (
                  <p className="text-xs text-red-600 mt-1">{answerValidations.answer_1.error}</p>
                )}
              </div>

              {/* Pregunta 2 */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  2. {questions.question_2}
                </label>
                <textarea
                  value={answers.answer_2}
                  onChange={(e) => handleAnswerChange('answer_2', e.target.value)}
                  rows={3}
                  className={`w-full rounded-xl border-2 p-3 text-sm bg-green-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    !answerValidations.answer_2.valid && answers.answer_2.trim() 
                      ? 'border-red-600' 
                      : 'border-red-500'
                  }`}
                  placeholder="Escribe tu respuesta aquí..."
                  disabled={submittingAnswers}
                />
                {!answerValidations.answer_2.valid && answers.answer_2.trim() && (
                  <p className="text-xs text-red-600 mt-1">{answerValidations.answer_2.error}</p>
                )}
              </div>

              {/* Pregunta 3 */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  3. {questions.question_3}
                </label>
                <textarea
                  value={answers.answer_3}
                  onChange={(e) => handleAnswerChange('answer_3', e.target.value)}
                  rows={3}
                  className={`w-full rounded-xl border-2 p-3 text-sm bg-green-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    !answerValidations.answer_3.valid && answers.answer_3.trim() 
                      ? 'border-red-600' 
                      : 'border-red-500'
                  }`}
                  placeholder="Escribe tu respuesta aquí..."
                  disabled={submittingAnswers}
                />
                {!answerValidations.answer_3.valid && answers.answer_3.trim() && (
                  <p className="text-xs text-red-600 mt-1">{answerValidations.answer_3.error}</p>
                )}
              </div>

              {questionsError && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">
                  {questionsError}
                </div>
              )}

              <div className="flex justify-center mt-4">
                <button
                  type="button"
                  onClick={submitAnswers}
                  disabled={submittingAnswers}
                  className={[
                    "inline-flex items-center gap-2 rounded-xl px-5 py-3 border-2 border-red-500 text-sm font-semibold shadow-sm transition",
                    submittingAnswers
                      ? "bg-slate-200 text-slate-600 cursor-not-allowed"
                      : "bg-green-700 text-white hover:bg-green-800",
                  ].join(" ")}
                >
                  {submittingAnswers ? "Enviando..." : "💬 Compartir mi opinión"}
                </button>
              </div>

              <p className="text-xs text-slate-600 text-center mt-2">
                Tus respuestas son anónimas y nos ayudan a entender la evolución de la opinión ciudadana.
              </p>
            </div>
          </section>
        )}

        {/* Mensaje de agradecimiento si ya respondió */}
        {locked && answersSubmitted && (
          <section className="mt-6 border-[6px] border-red-600 rounded-2xl p-6 bg-green-50 shadow-sm">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                ¡Gracias por compartir tu opinión!
              </h2>
              <p className="text-sm text-slate-800">
                Tus respuestas en la ronda {globalRound?.name || 'actual'} han sido guardadas.
                Podrás votar nuevamente el próximo mes.
              </p>
            </div>
          </section>
        )}

        <footer className="mt-6 text-xs text-slate-700">
          VOTO CLARO • Intención de voto (rondas mensuales) • “Infórmate, Reflexiona y Decide cada mes.”
        </footer>

        {/* Botón Subir */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={scrollToTop}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 shadow-sm transition"
            aria-label="Subir al inicio"
            title="Subir"
          >
            ⬆ Subir
          </button>
        </div>
      </div>
    </main>
  );
}

export default function IntencionDeVotoPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Cargando...</div>}>
      <IntencionDeVotoContent />
    </Suspense>
  );
}
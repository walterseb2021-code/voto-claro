// components/assistant/FederalitoAssistantPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import FederalitoAvatar from "@/components/federalito/FederalitoAvatar";

type GuideEventDetail = {
  action?: "SAY" | "OPEN" | "CLOSE" | "SAY_AND_OPEN";
  text?: string;
  speak?: boolean;
};

type Msg = { role: "system" | "user" | "assistant"; content: string };

type VoiceMode = "OFF" | "ON";
type VoiceLang = "es-PE" | "qu"; // qu = quechua (si existe voz instalada)
type AskMode = "HV" | "PLAN" | "NEWS";

const LS_VOICE_MODE = "votoclaro_voice_mode_v1";
const LS_VOICE_LANG = "votoclaro_voice_lang_v1";
const LS_VOICE_HINT_SHOWN = "votoclaro_voice_hint_shown_v1";
const LS_ASK_MODE = "votoclaro_assistant_mode_v1";
// ✅ Panel flotante: posición persistente
const LS_ASSIST_POS = "votoclaro_assistant_pos_v1";

type PanelPos = { x: number; y: number };

// ✅ TEMA 2 (Memoria corta): estado + persistencia
const LS_ASSIST_MEM = "votoclaro_assistant_memory_v1";

type MemoryState = {
  lastCandidateId?: string;
  lastCandidateName?: string;
  lastMode?: AskMode;
  lastQuestion?: string;
  lastAnswer?: string;
  lastAnswerHasLinks?: boolean;
  lastUpdatedAt?: number;
};

function normalize(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function getVoicesSafe(): SpeechSynthesisVoice[] {
  try {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  } catch {
    return [];
  }
}

// Espera a que el navegador “cargue” voces (Chrome a veces llega vacío al inicio)
function waitVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      const v = getVoicesSafe();
      if (v.length) return resolve(v);
      if (Date.now() - start > timeoutMs) return resolve(v);
      setTimeout(check, 120);
    }

    try {
      const onChanged = () => {
        const v = getVoicesSafe();
        if (v.length) {
          try {
            window.speechSynthesis.removeEventListener("voiceschanged", onChanged);
          } catch {}
          resolve(v);
        }
      };
      window.speechSynthesis?.addEventListener?.("voiceschanged", onChanged as any);
    } catch {}

    check();
  });
}

/**
 * Selección “más humana” posible SOLO con Web Speech.
 * - Español Perú: preferimos es-PE / es-419 / es-* (Google/Microsoft)
 * - Quechua: intentamos qu*, quz-PE, etc. (si existe en el SO)
 */
function pickBestVoice(all: SpeechSynthesisVoice[], lang: VoiceLang): SpeechSynthesisVoice | null {
  if (!all.length) return null;

  const scored = all.map((v) => {
    const name = normalize(v.name || "");
    const vlang = normalize(v.lang || "");
    const local = !!v.localService;

    let score = 0;

    // Motor (suele sonar mejor)
    if (name.includes("google")) score += 30;
    if (name.includes("microsoft")) score += 25;

    // Preferir servicios locales
    if (local) score += 10;

    // Idioma preferido
    if (lang === "es-PE") {
      if (vlang === "es-pe") score += 60;
      if (vlang.startsWith("es-")) score += 35;
      if (vlang.includes("es-419")) score += 25;
    } else {
      // Quechua: qu / quz / etc (si existe)
      if (vlang.startsWith("qu")) score += 80;
      if (vlang.includes("quz")) score += 80; // en Windows puede salir quz-PE
      if (name.includes("quech")) score += 50;
      if (name.includes("quich")) score += 30;
    }

    // Heurísticas suaves
    if (name.includes("male") || name.includes("hombre")) score += 6;
    if (name.includes("juan") || name.includes("carlos") || name.includes("diego") || name.includes("andres")) score += 3;

    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}
function humanizeForSpeech(input: string) {
  let s = String(input || "");

  // 1) Quitar rutas /candidate/... y cosas técnicas
  s = s.replace(/\/candidate\/\[[^\]]+\]/gi, "la ficha del candidato");
  s = s.replace(/\/candidate\/[a-z0-9\-_]+/gi, "la ficha del candidato");
  s = s.replace(/\/api\/[a-z0-9\/\-_?=&]+/gi, "el servidor");
  s = s.replace(/https?:\/\/\S+/gi, "un enlace");

  // 2) Reemplazar símbolos que suenan feo
  s = s
    .replace(/[\/\\]+/g, " ")     // barras
    .replace(/[\*\|_#]+/g, " ")   // asteriscos, pipes, etc.
    .replace(/[-]{2,}/g, " ")     // guiones largos
    .replace(/\s{2,}/g, " ")
    .trim();

  return s;
}

async function speakText(
  text: string,
  lang: VoiceLang
): Promise<{ ok: boolean; usedLang: "es-PE" | "qu" | "fallback-es"; reason?: string }> {
  const msg = humanizeForSpeech((text || "").trim());
  if (!msg) return { ok: false, usedLang: "fallback-es", reason: "empty" };

  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return { ok: false, usedLang: "fallback-es", reason: "no-tts" };
  }

  const voices = await waitVoices(1200);

  // Si pidió quechua pero no hay, hacemos fallback a español
  let targetLang: VoiceLang = lang;
  let usedLang: "es-PE" | "qu" | "fallback-es" = lang === "qu" ? "qu" : "es-PE";

  const hasQuechua = voices.some((v) => {
    const l = normalize(v.lang || "");
    const n = normalize(v.name || "");
    return l.startsWith("qu") || l.includes("quz") || n.includes("quech") || n.includes("quich");
  });

  if (lang === "qu" && !hasQuechua) {
    targetLang = "es-PE";
    usedLang = "fallback-es";
  }

  const voice = pickBestVoice(voices, targetLang);

  try {
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(msg);

    // idioma
    if (targetLang === "qu") u.lang = "qu";
    else u.lang = "es-PE";

    // “joven”: un poco más rápido y menos grave
    u.rate = 1.02;
    u.pitch = 0.78;
    u.volume = 1;

    if (voice) u.voice = voice;

    return await new Promise((resolve) => {
      u.onend = () => resolve({ ok: true, usedLang });
      u.onerror = () => resolve({ ok: false, usedLang, reason: "utterance-error" });

      window.speechSynthesis.speak(u);
    });
  } catch {
    return { ok: false, usedLang, reason: "exception" };
  }
}

type AiAnswerResponse = {
  ok: boolean;
  id: string;
  doc: "plan" | "hv";
  axis?: string;
  answer: string;
  citations?: Array<{ title: string; url?: string; page?: number }>;
  error?: string;
};

type WebAskSource = { source: number; title: string; url: string; domain: string };
type WebAskCitation = { source: number; url: string; quote: string };
type WebAskResponse = {
  q: string;
  answer: string;
  sources?: WebAskSource[];
  citations?: WebAskCitation[];
  error?: string;
};

async function safeReadJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const text = await res.text();
  return { _nonJson: true, text: text.slice(0, 5000) };
}

function slugToName(slug: string) {
  return (slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

// ✅ Helpers Tema 2: follow-ups y contexto
function looksLikeFollowUp(q: string) {
  const t = normalize(q).trim();
  if (!t) return false;

  // corto y ambiguo => probablemente follow-up
  if (t.length <= 22) return true;

  // patrones típicos
  const patterns = [
    "y eso",
    "y esa",
    "y ese",
    "y eso?",
    "y esa?",
    "y ese?",
    "cuando",
    "cuándo",
    "donde",
    "dónde",
    "quien",
    "quién",
    "cual",
    "cuál",
    "que año",
    "qué año",
    "en que año",
    "en qué año",
    "en que fecha",
    "en qué fecha",
    "cual es",
    "cuál es",
    "por que",
    "por qué",
    "como asi",
    "cómo así",
    "mas detalle",
    "más detalle",
    "explica",
    "explicame",
    "explícame",
    "amplia",
    "amplía",
    "fuente",
    "fuentes",
    "link",
    "enlace",
    "prueba",
    "evidencia",
    "cita",
    "citas",
  ];

  return patterns.some((p) => t.includes(normalize(p)));
}

function buildContextualQuestion(rawQ: string, mem: MemoryState, candidateName: string, askMode: AskMode) {
  const q = (rawQ || "").trim();
  if (!q) return q;

  // Si no hay memoria previa útil, no tocamos nada
  const hasPrev = !!(mem?.lastQuestion || mem?.lastAnswer);
  if (!hasPrev) return q;

  // Si cambia de candidato, no “arrastramos” contexto
  if (mem.lastCandidateId && mem.lastCandidateId !== mem.lastCandidateId) {
    return q;
  }

  // Solo contextualizamos cuando parece follow-up
  if (!looksLikeFollowUp(q)) return q;

  const modeLabel = askMode === "HV" ? "Hoja de Vida (PDF)" : askMode === "PLAN" ? "Plan de Gobierno (PDF)" : "Actuar político (web)";
  const who = (candidateName || mem.lastCandidateName || "").trim();

  const prevQ = (mem.lastQuestion || "").trim();
  const prevA = (mem.lastAnswer || "").trim();

  // Resumen micro (solo para anclar “eso/esa/ese”)
  const anchor =
    prevA && prevA.length > 0
      ? `Respuesta previa (resumen): ${prevA.slice(0, 220)}${prevA.length > 220 ? "…" : ""}`
      : prevQ
      ? `Pregunta previa: ${prevQ.slice(0, 180)}${prevQ.length > 180 ? "…" : ""}`
      : "";

  // Construir pregunta enriquecida SIN inventar: solo añade contexto de conversación
  const enriched =
    `${who ? who + " — " : ""}${modeLabel}.\n` +
    `Contexto: el usuario está haciendo una pregunta de seguimiento.\n` +
    `${anchor ? anchor + "\n" : ""}` +
    `Pregunta actual: ${q}`;

  return enriched;
}

function safeLoadMem(): MemoryState {
  try {
    const raw = localStorage.getItem(LS_ASSIST_MEM);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MemoryState;
  } catch {
    return {};
  }
}

function safeSaveMem(mem: MemoryState) {
  try {
    localStorage.setItem(LS_ASSIST_MEM, JSON.stringify(mem || {}));
  } catch {}
}

export default function FederalitoAssistantPanel() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
    // ✅ Panel flotante (draggable)
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [pos, setPos] = useState<PanelPos>(() => {
    if (typeof window === "undefined") return { x: 16, y: 16 };
    try {
      const raw = localStorage.getItem(LS_ASSIST_POS);
      if (!raw) return { x: 16, y: 16 };
      const p = JSON.parse(raw);
      if (typeof p?.x === "number" && typeof p?.y === "number") return p;
      return { x: 16, y: 16 };
    } catch {
      return { x: 16, y: 16 };
    }
  });

  const dragRef = useRef<{
    dragging: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  }>({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  });

  function clampPos(p: PanelPos): PanelPos {
    if (typeof window === "undefined") return p;
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 420;
    const h = el?.offsetHeight ?? 520;

    const pad = 8;
    const maxX = Math.max(pad, window.innerWidth - w - pad);
    const maxY = Math.max(pad, window.innerHeight - h - pad);

    return {
      x: Math.min(Math.max(p.x, pad), maxX),
      y: Math.min(Math.max(p.y, pad), maxY),
    };
  }

  function defaultBottomRight(): PanelPos {
    if (typeof window === "undefined") return { x: 16, y: 16 };
    const w = panelRef.current?.offsetWidth ?? 420;
    const h = panelRef.current?.offsetHeight ?? 520;
    const pad = 16;
    return clampPos({
      x: window.innerWidth - w - pad,
      y: window.innerHeight - h - (pad + 80), // deja espacio al FAB abajo
    });
  }

  useEffect(() => {
    // si no hay posición guardada, colócalo abajo a la derecha al abrir por primera vez
    try {
      const raw = localStorage.getItem(LS_ASSIST_POS);
      if (!raw) setPos(defaultBottomRight());
      // eslint-disable-next-line no-empty
    } catch {}
    // reajusta si el viewport cambia
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ASSIST_POS, JSON.stringify(pos));
    } catch {}
  }, [pos]);
function isInteractiveTarget(el: any) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return Boolean(
    t.closest?.(
      "button, a, input, select, textarea, label, [role='button'], [data-no-drag='1']"
    )
  );
}

  function onHeaderPointerDown(e: React.PointerEvent) {
    if (isInteractiveTarget(e.target)) return;
    // solo arrastrar con click/touch principal
    if ((e as any).button != null && (e as any).button !== 0) return;

    const el = panelRef.current;
    if (!el) return;

    dragRef.current.dragging = true;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startPosX = pos.x;
    dragRef.current.startPosY = pos.y;

    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {}
  }

  function onHeaderPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return;
    if (dragRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    setPos(
      clampPos({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      })
    );
  }

  function onHeaderPointerUp(e: React.PointerEvent) {
    if (dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.dragging = false;
    dragRef.current.pointerId = null;
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {}
  }

  function resetPanelPos() {
    setPos(defaultBottomRight());
  }
  function resetAssistantChat() {
  // Borra mensajes del asistente
  setMsgs([
    {
      role: "system",
      content:
        "Hola, soy Federalito AI. Puedo ayudarte a usar la app y responder preguntas según la pestaña actual: Hoja de vida, Plan de gobierno o Actuar político.",
    },
  ]);

  // Limpia lo que el usuario estaba escribiendo
  setDraft("");

  // Borra la memoria corta
  setMem({});
  try {
    localStorage.removeItem("votoclaro_assistant_memory_v1");
  } catch {}
}

  function resetAssistantChat() {
    // 1) Borra el chat (mensajes)
    setMsgs([
      {
        role: "system",
        content:
          "Hola, soy Federalito AI. Estoy aquí para ayudarte a usar la app y también responder preguntas según la pestaña actual: Hoja de vida (HV), Plan (PLAN) o Actuar político (NEWS).",
      },
    ]);

    // 2) Limpia el campo de escritura
    setDraft("");

    // 3) Borra memoria corta (para que no arrastre contexto)
    setMem({});
    try {
      localStorage.removeItem(LS_ASSIST_MEM);
    } catch {}
  }

  const [voiceMode, setVoiceMode] = useState<VoiceMode>(() => {
    try {
      return (localStorage.getItem(LS_VOICE_MODE) as VoiceMode) || "OFF";
    } catch {
      return "OFF";
    }
  });

  const [voiceLang, setVoiceLang] = useState<VoiceLang>(() => {
    try {
      return (localStorage.getItem(LS_VOICE_LANG) as VoiceLang) || "es-PE";
    } catch {
      return "es-PE";
    }
  });

  const [askMode, setAskMode] = useState<AskMode>(() => {
    try {
      return (localStorage.getItem(LS_ASK_MODE) as AskMode) || "HV";
    } catch {
      return "HV";
    }
  });

  // ✅ TEMA 2: Memoria corta (persistente)
  const [mem, setMem] = useState<MemoryState>(() => {
    if (typeof window === "undefined") return {};
    return safeLoadMem();
  });

  // ✅ el navegador solo permite TTS “bien” después de interacción del usuario
  const [userInteracted, setUserInteracted] = useState(false);

  const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      role: "system",
      content:
        "Hola, soy Federalito AI. Puedes elegir: Hoja de vida (HV), Plan (PLAN) o Actuar político (NEWS). También puedo escucharte con 🎙️ y responder con voz.",
    },
  ]);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // 🔎 detectar candidato desde ruta /candidate/[id]
  const [candidateId, setCandidateId] = useState<string>("");
  const [candidateName, setCandidateName] = useState<string>("");

  // 🎙️ reconocimiento de voz
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(LS_VOICE_MODE, voiceMode);
      localStorage.setItem(LS_VOICE_LANG, voiceLang);
      localStorage.setItem(LS_ASK_MODE, askMode);
    } catch {}
  }, [voiceMode, voiceLang, askMode]);

  // ✅ persist memory (Tema 2)
  useEffect(() => {
    safeSaveMem(mem);
  }, [mem]);

  // “user gesture” detector
  useEffect(() => {
    function mark() {
      setUserInteracted(true);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    }
    window.addEventListener("pointerdown", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  // detectar candidateId por pathname
  useEffect(() => {
    const p = String(pathname || "");
    const m = p.match(/^\/candidate\/([^/?#]+)/i);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    setCandidateId(id);
    if (!id) {
      setCandidateName("");
      return;
    }
    // intenta obtener full_name (si endpoint existe)
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`/api/candidates/profile?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const j = await res.json();
        const nm = String(j?.profile?.full_name ?? "").trim();
        if (!aborted) setCandidateName(nm || slugToName(id));
      } catch {
        if (!aborted) setCandidateName(slugToName(id));
      }
    })();

    return () => {
      aborted = true;
    };
  }, [pathname]);
// ✅ Auto-sincroniza el modo del asistente con el tab actual (HV / PLAN / NEWS)
useEffect(() => {
  const tab = String(searchParams?.get("tab") || "").toUpperCase();

  if (tab === "PLAN") setAskMode("PLAN");
  else if (tab === "NEWS") setAskMode("NEWS");
  else if (tab === "HV") setAskMode("HV");
  // si no hay tab, no forzamos nada
}, [searchParams]);

  // helpers globales
  useEffect(() => {
    (window as any).__federalitoAssistantOpen = () => setOpen(true);
    (window as any).__federalitoAssistantClose = () => setOpen(false);
    (window as any).__federalitoAssistantToggle = () => setOpen((v: boolean) => !v);
    return () => {
      try {
        delete (window as any).__federalitoAssistantOpen;
        delete (window as any).__federalitoAssistantClose;
        delete (window as any).__federalitoAssistantToggle;
      } catch {}
    };
  }, []);

  // escuchar eventos guia (por si los usas desde otras pantallas)
  useEffect(() => {
    async function onGuide(ev: Event) {
      const e = ev as CustomEvent<GuideEventDetail>;
      const action = e.detail?.action ?? "SAY_AND_OPEN";
      const text = (e.detail?.text ?? "").trim();
      const speak = !!e.detail?.speak;

      if (action === "OPEN") setOpen(true);
      if (action === "CLOSE") setOpen(false);

      if (text) {
        setMsgs((prev) => [...prev, { role: "assistant", content: text }]);
      }

      if (action === "SAY_AND_OPEN") setOpen(true);

      if (text && speak && voiceMode === "ON" && userInteracted) {
        const r = await speakText(text, voiceLang);

        if (voiceLang === "qu" && r.usedLang === "fallback-es") {
          try {
            const shown = localStorage.getItem(LS_VOICE_HINT_SHOWN);
            if (!shown) {
              localStorage.setItem(LS_VOICE_HINT_SHOWN, "1");
              setMsgs((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: "Nota: no encontré voz Quechua instalada. Estoy leyendo en Español (Perú) como respaldo.",
                },
              ]);
            }
          } catch {}
        }
      }
    }

    window.addEventListener("votoclaro:guide", onGuide as any);
    return () => window.removeEventListener("votoclaro:guide", onGuide as any);
  }, [voiceMode, voiceLang, userInteracted]);

  // autoscroll
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, msgs]);

  function pushAssistant(text: string) {
    setMsgs((prev) => [...prev, { role: "assistant", content: text }]);
  }

  async function maybeSpeak(text: string) {
    if (voiceMode !== "ON") return;
    if (!userInteracted) {
      pushAssistant("Tip: toca cualquier parte de la pantalla y vuelve a intentar (bloqueo de audio del navegador).");
      return;
    }
    const r = await speakText(text, voiceLang);
    if (voiceLang === "qu" && r.usedLang === "fallback-es") {
      pushAssistant("Nota: no detecté voz Quechua en este dispositivo. Estoy leyendo en Español (Perú) como respaldo.");
    }
  }

  // ✅ TEMA 2: update memory al responder
  function updateMemAfterAnswer(params: {
    mode: AskMode;
    candidateId: string;
    candidateName: string;
    question: string;
    answer: string;
    answerHasLinks?: boolean;
  }) {
    setMem((prev) => ({
      ...prev,
      lastMode: params.mode,
      lastCandidateId: params.candidateId,
      lastCandidateName: params.candidateName,
      lastQuestion: (params.question || "").trim().slice(0, 2500),
      lastAnswer: (params.answer || "").trim().slice(0, 5000),
      lastAnswerHasLinks: !!params.answerHasLinks,
      lastUpdatedAt: Date.now(),
    }));
  }

  async function askBackend(question: string) {
    const rawQ = (question || "").trim();
    if (!rawQ) return;

    // si es HV/PLAN/NEWS necesitamos estar en /candidate/[id]
   if (!candidateId) {
  const msg =
    "Para ayudarte con un candidato, primero abre su ficha.\n" +
    "Ve a la lista de candidatos, busca el nombre y haz clic para entrar.\n" +
    "Ya dentro de la ficha, aquí podrás preguntar por: Hoja de Vida (HV), Plan o Actuar político.";
  pushAssistant(msg);
  await maybeSpeak(msg);
  return;
}

    const cname = (candidateName || slugToName(candidateId)).trim();

    // ✅ TEMA 2: “enriquecer” preguntas de seguimiento sin que el usuario repita
    const enrichedQ = buildContextualQuestion(rawQ, mem, cname, askMode);

    setBusy(true);
    try {
      // 1) HV / PLAN (PDF) → /api/ai/answer
      if (askMode === "HV" || askMode === "PLAN") {
        const doc = askMode === "HV" ? "hv" : "plan";
        const res = await fetch("/api/ai/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ id: candidateId, doc, question: enrichedQ }),
        });

        const payload = await safeReadJson(res);

        if (!res.ok) {
          const msg =
            (payload as any)?._nonJson
              ? "Error IA: el servidor devolvió una respuesta no-JSON. Revisa DevTools → Network → /api/ai/answer."
              : `Error IA: ${String((payload as any)?.error ?? (payload as any)?.message ?? "desconocido")}`;
          pushAssistant(msg);
          await maybeSpeak(msg);
          return;
        }

        const data = payload as AiAnswerResponse;
        const ans = String(data?.answer ?? "No hay evidencia suficiente en las fuentes consultadas.").trim();

        pushAssistant(ans);
        await maybeSpeak(ans);

        updateMemAfterAnswer({
          mode: askMode,
          candidateId,
          candidateName: cname,
          question: rawQ,
          answer: ans,
          answerHasLinks: false,
        });

        return;
      }

      // 2) NEWS (Actuar político) → /api/web/ask
      if (askMode === "NEWS") {
        // ✅ En NEWS, la API ya espera "Nombre: pregunta"
        const finalQ = cname ? `${cname}: ${rawQ}` : rawQ;

        // ✅ pero igual le pasamos enrichedQ si era follow-up (para anclar “eso/esa/ese”)
        //    SIN duplicar el "Nombre:"; buildContextualQuestion ya incluye contexto.
        const finalToSend = looksLikeFollowUp(rawQ) ? enrichedQ : finalQ;

        const res = await fetch("/api/web/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ q: finalToSend, num: 4 }),
        });

        const payload = await safeReadJson(res);

        if (!res.ok) {
          const msg =
            (payload as any)?._nonJson
              ? "Error WEB: el servidor devolvió una respuesta no-JSON. Revisa DevTools → Network → /api/web/ask."
              : `Error WEB: ${String((payload as any)?.error ?? (payload as any)?.message ?? "desconocido")}`;
          pushAssistant(msg);
          await maybeSpeak(msg);
          return;
        }

        const data = payload as WebAskResponse;
        const ans = String(data?.answer ?? "No hay evidencia suficiente en las fuentes consultadas.").trim();

        const sources = Array.isArray(data?.sources) ? (data.sources as WebAskSource[]) : [];
        const topLinks =
          sources.length > 0
            ? "\n\nFuentes:\n" +
              sources
                .slice(0, 6)
                .map((s) => `- ${s.title} (${s.domain}) — ${s.url}`)
                .join("\n")
            : "";

        const out = ans + topLinks;
        pushAssistant(out);

        // voz: lee solo la respuesta (sin URLs)
        await maybeSpeak(ans);

        updateMemAfterAnswer({
          mode: askMode,
          candidateId,
          candidateName: cname,
          question: rawQ,
          answer: ans,
          answerHasLinks: sources.length > 0,
        });

        return;
      }
    } finally {
      setBusy(false);
    }
  }

  function sendTyped() {
    const t = draft.trim();
    if (!t || busy) return;

    setMsgs((prev) => [...prev, { role: "user", content: t }]);
    setDraft("");
    askBackend(t);
  }

  // 🎙️ setup SpeechRecognition (Web Speech)
  function canUseSpeechRec() {
    const w = window as any;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    setListening(false);
  }

  function startListening() {
    if (busy) return;

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      pushAssistant("Este navegador no soporta reconocimiento de voz (SpeechRecognition). Prueba Chrome en Windows.");
      return;
    }

    try {
      // si ya hay uno activo, lo paramos
      try {
        recognitionRef.current?.stop?.();
      } catch {}

      const rec = new SR();
      recognitionRef.current = rec;

      rec.lang = "es-PE";
      rec.interimResults = true;
      rec.continuous = false;

      let finalText = "";
      rec.onresult = (ev: any) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const txt = String(ev.results[i][0]?.transcript ?? "");
          if (ev.results[i].isFinal) finalText += txt;
          else interim += txt;
        }
        const merged = (finalText + " " + interim).trim();
        setDraft(merged);
      };

      rec.onerror = (e: any) => {
        const code = String(e?.error ?? "");
        const msg =
          code === "not-allowed"
            ? "No tengo permiso de micrófono. Dale permitir en el navegador y prueba otra vez."
            : `Error micrófono: ${code || "desconocido"}`;
        pushAssistant(msg);
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
        const q = (finalText || draft || "").trim();
        // si quedó algo, lo enviamos automáticamente
        if (q) {
          setMsgs((prev) => [...prev, { role: "user", content: q }]);
          setDraft("");
          askBackend(q);
        }
      };

      setListening(true);
      rec.start();
    } catch {
      pushAssistant("No pude iniciar el micrófono. Revisa permisos del navegador.");
      setListening(false);
    }
  }

  async function speakLastAssistant() {
    const last = [...msgs].reverse().find((m) => m.role === "assistant")?.content ?? "";
    if (!last) return;
    if (voiceMode !== "ON") setVoiceMode("ON");
    await maybeSpeak(last);
  }

  const fabLabel = useMemo(() => (open ? "Cerrar Federalito AI" : "Abrir Federalito AI"), [open]);

  const modeLabel = askMode === "HV" ? "HV" : askMode === "PLAN" ? "Plan" : "Actuar político";

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "fixed z-[60] right-4 bottom-4 md:right-6 md:bottom-6",
          "flex items-center gap-2 rounded-full border bg-white",
          "shadow-lg px-3 py-2",
          "hover:shadow-xl active:scale-[0.98] transition",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-200",
          "hover:-translate-y-[2px]",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        ].join(" ")}
        aria-label={fabLabel}
        title={fabLabel}
      >
        <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-gray-100 shrink-0">
          <FederalitoAvatar className="w-full h-full" />
          <span
            className={[
              "absolute -top-1 -right-1",
              "w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white",
              "shadow-sm",
              "animate-pulse motion-reduce:animate-none",
            ].join(" ")}
            aria-hidden="true"
          />
        </div>

        <div className="text-left leading-[14px]">
          <div className="text-[12px] font-extrabold text-slate-900">Federalito AI</div>
          <div className="text-[11px] text-slate-600">{open ? `Modo: ${modeLabel}` : "Asistente / Guía"}</div>
        </div>
      </button>

      {/* Panel */}
    {open ? (
  <div
    ref={panelRef}
    className="fixed z-[70] w-[min(92vw,420px)]"
    style={{ left: pos.x, top: pos.y }}
  >
    <div className="rounded-2xl border bg-white shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">

            {/* Header */}
          <div
  className="px-4 py-3 flex items-center justify-between gap-3 bg-gradient-to-r from-green-700 to-green-600 text-white cursor-move select-none"
  onPointerDown={onHeaderPointerDown}
  onPointerMove={onHeaderPointerMove}
  onPointerUp={onHeaderPointerUp}
>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/15 shrink-0">
                  <FederalitoAvatar className="w-full h-full" />
                </div>

                <div className="min-w-0">
                  <div className="text-[13px] font-extrabold truncate">Federalito AI</div>
                  <div className="text-[11px] opacity-90 truncate">
                    {candidateId ? `ID: ${candidateId} • ${modeLabel}` : `Modo: ${modeLabel}`}
                  </div>
                </div>
              </div>

           <div className="flex items-center gap-2">
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      resetAssistantChat();
    }}
    className="rounded-xl bg-white/15 hover:bg-white/20 px-3 py-1 text-[12px] font-bold"
    title="Reiniciar posición"
  >
    Reset
  </button>

  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      setOpen(false);
    }}
    className="rounded-xl bg-white/15 hover:bg-white/20 px-3 py-1 text-[12px] font-bold"
  >
    Cerrar
  </button>
</div>

            </div>

            {/* Controls */}
            <div className="px-4 py-3 border-b bg-white">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setVoiceMode((v) => (v === "ON" ? "OFF" : "ON"))}
                  className={[
                    "rounded-full px-3 py-1 text-[12px] font-bold border transition active:scale-[0.98]",
                    "motion-reduce:transition-none motion-reduce:active:scale-100",
                    voiceMode === "ON"
                      ? "bg-green-600 text-white border-green-700"
                      : "bg-white text-slate-800 border-slate-300",
                  ].join(" ")}
                >
                  {voiceMode === "ON" ? "Voz: ON" : "Voz: OFF"}
                </button>

                <select
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value as VoiceLang)}
                  className="rounded-full border px-3 py-1 text-[12px] font-bold bg-white"
                  title="Idioma de voz"
                >
                  <option value="es-PE">Español (Perú)</option>
                  <option value="qu">Quechua (si existe)</option>
                </select>

                {/* ✅ MODO: HV / PLAN / NEWS */}
                <select
                  value={askMode}
                  onChange={(e) => setAskMode(e.target.value as AskMode)}
                  className="rounded-full border px-3 py-1 text-[12px] font-bold bg-white"
                  title="Qué fuente consultar"
                >
                  <option value="HV">HV (PDF)</option>
                  <option value="PLAN">Plan (PDF)</option>
                  <option value="NEWS">Actuar político</option>
                </select>

                {/* 🔊 leer último */}
                <button
                  type="button"
                  onClick={speakLastAssistant}
                  className="ml-auto rounded-full px-3 py-1 text-[12px] font-extrabold border bg-black text-white hover:opacity-90 active:scale-[0.98] transition motion-reduce:transition-none motion-reduce:active:scale-100"
                  title="Leer último mensaje"
                >
                  🔊 Leer
                </button>

                {/* 🎙️ mic */}
                <button
                  type="button"
                  onClick={() => {
                    if (listening) stopListening();
                    else startListening();
                  }}
                  className={[
                    "rounded-full px-3 py-1 text-[12px] font-extrabold border transition",
                    listening ? "bg-red-600 text-white border-red-700" : "bg-white text-slate-800 border-slate-300",
                    "hover:shadow-sm active:scale-[0.98]",
                  ].join(" ")}
                  title={canUseSpeechRec() ? (listening ? "Detener micrófono" : "Hablar (micrófono)") : "No soportado"}
                  disabled={!canUseSpeechRec()}
                >
                  {listening ? "🎙️ Escuchando…" : "🎙️ Hablar"}
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                {askMode === "NEWS"
                  ? "Actuar político: usa fuentes web (lista blanca) y muestra enlaces."
                  : "HV/Plan: responde solo con evidencia del PDF y cita páginas (p. X)."}{" "}
                {candidateId ? "" : "Tip: entra a /candidate/[id] para que el asistente sepa qué candidato consultar."}
              </div>

              {/* ✅ (Tema 2) mini indicador: memoria activa */}
              <div className="mt-2 text-[10px] text-slate-400">
                Memoria corta: {mem?.lastUpdatedAt ? `ON (última: ${new Date(mem.lastUpdatedAt).toLocaleString()})` : "OFF"}
              </div>
            </div>

            {/* Body */}
           <div
  ref={listRef}
  className="flex-1 overflow-auto p-4 space-y-3 bg-gradient-to-b from-green-50 via-white to-white"
>

              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={[
                    "text-[13px] leading-[18px] whitespace-pre-wrap rounded-2xl px-3 py-2 border",
                    m.role === "user" ? "ml-10 bg-white border-slate-200" : "mr-10 bg-green-50 border-green-200",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              ))}

              {busy ? (
                <div className="mr-10 bg-green-50 border border-green-200 rounded-2xl px-3 py-2 text-[13px]">
                  Procesando…
                </div>
              ) : null}
            </div>

            {/* Composer */}
            <div className="p-3 border-t bg-white sticky bottom-0">
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendTyped();
                    }
                  }}
                  placeholder={askMode === "NEWS" ? "Pregunta sobre actuar político…" : "Pregunta sobre HV/Plan…"}
                  className="flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-green-200"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={sendTyped}
                  className="rounded-xl px-3 py-2 text-[13px] font-bold text-white bg-black hover:opacity-90 active:scale-[0.98] transition motion-reduce:transition-none motion-reduce:active:scale-100"
                  disabled={busy}
                >
                  Enviar
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                Tip: con 🎙️ “Hablar” puedes dictar la pregunta. Se enviará sola al terminar tu frase.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

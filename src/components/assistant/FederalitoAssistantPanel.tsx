// src/componentes/asistente/FederalitoAssistantPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import FederalitoAvatar from "@/components/federalito/FederalitoAvatar";
import { REFLEXION_AXES } from "@/lib/reflexionContent";
import {
  CIUDADANO_SERVICES,
  CIUDADANO_PAGE_GUIDE,
  CIUDADANO_LEGAL_NOTE,
} from "@/lib/ciudadanoServiceContent";
import {
  CAMBIO_PAGE_ROUTE,
  CAMBIO_PAGE_TITLE,
  CAMBIO_PAGE_LINK_URL,
  CAMBIO_PAGE_PHRASE,
  CAMBIO_PAGE_GUIDE,
} from "@/lib/cambioConValentiaContent";

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

// ✅ Memoria corta: estado + persistencia
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
function answerFromReflexion(rawQ: string) {
  const q = normalize(rawQ);

  // Si el usuario pregunta algo muy corto o vacío:
  if (!q || q.length < 3) {
    return (
      "Estoy listo para ayudarte a reflexionar.\n\n" +
      "Puedes escribir por ejemplo:\n" +
      "- “economía”\n" +
      "- “salud”\n" +
      "- “seguridad”\n" +
      "- “corrupción”\n\n" +
      "O pega una frase de la pregunta que te llamó la atención."
    );
  }

  // 1) Intento: buscar coincidencia con un eje (por título)
  const axisHit = REFLEXION_AXES.find((a) => normalize(a.title).includes(q) || q.includes(normalize(a.title)));

  if (axisHit) {
    const list = axisHit.questions
      .map((qq, i) => `${i + 1}) ${qq.question}`)
      .join("\n");

    return (
      `Eje: ${axisHit.title}\n` +
      (axisHit.subtitle ? `${axisHit.subtitle}\n\n` : "\n") +
      "Estas son las 5 preguntas:\n" +
      list +
      "\n\n" +
      "Dime el número (1 a 5) o copia una parte de la pregunta para leerte la reflexión."
    );
  }

  // 2) Intento: buscar coincidencia en preguntas
  const flat = REFLEXION_AXES.flatMap((a) =>
    a.questions.map((qq) => ({ axis: a, q: qq }))
  );

  // score simple por “palabras” encontradas
  const words = q.split(" ").filter((w) => w.length >= 4);
  let best: any = null;
  let bestScore = 0;

  for (const item of flat) {
    const t = normalize(item.q.question);
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best && bestScore >= 1) {
    const follow =
      best.q.followups?.length
        ? "\n\nPara seguir reflexionando:\n" + best.q.followups.map((f: string) => `- ${f}`).join("\n")
        : "";

    return `Eje: ${best.axis.title}\n\nPregunta:\n${best.q.question}\n\nReflexión:\n${best.q.reflection}${follow}`;
  }

  // 3) Si no entiende, ofrece menú de ejes
  const menu = REFLEXION_AXES.map((a) => `- ${a.title}`).join("\n");
  return (
    "No estoy seguro de a qué reflexión te refieres.\n\n" +
    "Prueba escribiendo el tema así:\n" +
    menu +
    "\n\nO copia una frase exacta de la pregunta que quieres abrir."
  );
}
function answerFromCiudadanoServicio(rawQ: string) {
  const q = normalize(rawQ);

  // ayuda general
  if (!q || q.length < 3 || q.includes("ayuda") || q.includes("guia") || q.includes("guía") || q.includes("como usar")) {
    return `${CIUDADANO_PAGE_GUIDE}\n\n${CIUDADANO_LEGAL_NOTE}`;
  }

  // pedir listado
  if (
    q.includes("lista") ||
    q.includes("servicios") ||
    q.includes("que hay") ||
    q.includes("qué hay") ||
    q.includes("leer todo") ||
    q.includes("todo")
  ) {
    const list = CIUDADANO_SERVICES.map(
      (s, i) => `${i + 1}) ${s.title} (${s.entity})`
    ).join("\n");

    return (
      "Servicios disponibles:\n" +
      list +
      "\n\n" +
      "Dime el número (por ejemplo “3”) o una palabra clave (por ejemplo “multas”, “miembro de mesa”, “reniec”) y te leo el detalle."
    );
  }

  // si manda solo número
  const mNum = q.match(/^\s*(\d{1,2})\s*$/);
  if (mNum) {
    const n = Number(mNum[1]);
    const item = CIUDADANO_SERVICES[n - 1];
    if (!item) return "Ese número no existe en la lista. Dime un número válido.";
    return (
      `${item.title} (${item.entity})\n\n` +
      `${item.description}\n\n` +
      `Enlace oficial:\n${item.url}`
    );
  }

  // filtro por entidad
  const wantsJNE = q.includes("jne");
  const wantsONPE = q.includes("onpe");
  const wantsRENIEC = q.includes("reniec");

  if (wantsJNE || wantsONPE || wantsRENIEC) {
    const ent = wantsJNE ? "JNE" : wantsONPE ? "ONPE" : "RENIEC";
    const list = CIUDADANO_SERVICES.filter((s) => s.entity === ent)
      .map((s, i) => `${i + 1}) ${s.title}`)
      .join("\n");

    return (
      `Servicios de ${ent}:\n` +
      list +
      "\n\n" +
      "Dime el nombre exacto del servicio o escribe “lista” para ver todo."
    );
  }

  // match por título / palabras clave
  const hit = CIUDADANO_SERVICES.find((s) => {
    const t = normalize(s.title);
    return t.includes(q) || q.includes(t);
  });

  if (hit) {
    return (
      `${hit.title} (${hit.entity})\n\n` +
      `${hit.description}\n\n` +
      `Enlace oficial:\n${hit.url}`
    );
  }

  // match por palabras “sueltas”
  const words = q.split(" ").filter((w) => w.length >= 4);
  let best: any = null;
  let bestScore = 0;

  for (const s of CIUDADANO_SERVICES) {
    const t = normalize(`${s.title} ${s.description}`);
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  if (best && bestScore >= 1) {
    return (
      `${best.title} (${best.entity})\n\n` +
      `${best.description}\n\n` +
      `Enlace oficial:\n${best.url}`
    );
  }

  return (
    "No encontré ese servicio en esta página.\n\n" +
    "Prueba con: “lista”, “multas”, “miembro de mesa”, “local de votación”, “cédula”, “reniec”.\n\n" +
    CIUDADANO_PAGE_GUIDE
  );
}

async function handleCiudadanoServicio(rawQ: string, maybeSpeakFn: (t: string) => Promise<void>, pushFn: (t: string) => void) {
  const out = answerFromCiudadanoServicio(rawQ);
  pushFn(out);
  await maybeSpeakFn(out);
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
    if (
      name.includes("juan") ||
      name.includes("carlos") ||
      name.includes("diego") ||
      name.includes("andres")
    )
      score += 3;

    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}
function humanizeForSpeech(input: string) {
  let s = String(input || "");

  // 0) Quitar emojis/símbolos que la voz lee feo
  // ✅ -> "marca de verificación", 🎙️ -> "micrófono", etc.
  s = s.replace(/[✅✔️☑️]/g, "");
  s = s.replace(/[🎙️🔊]/g, "");

  // 1) Quitar rutas /candidate/... y cosas técnicas
  s = s.replace(/\/candidate\/\[[^\]]+\]/gi, "la ficha del candidato");
  s = s.replace(/\/candidate\/[a-z0-9\-_]+/gi, "la ficha del candidato");
  s = s.replace(/\/api\/[a-z0-9\/\-_?=&]+/gi, "el servidor");
  s = s.replace(/https?:\/\/\S+/gi, "un enlace");

  // 2) Quitar bullets y guiones al inicio de línea (la voz dice “menos”)
  // - texto
  // – texto
  // — texto
  // • texto
  s = s.replace(/^\s*[-–—−•]\s+/gm, "");

  // 3) Si quedó un guion largo en medio (Pregunta 3 — Salud), lo cambiamos por pausa
  s = s.replace(/[—−]/g, ", ");

  // 4) Reemplazar símbolos que suenan feo
  s = s
    .replace(/[\/\\]+/g, " ") // barras
    .replace(/[\*\|_#]+/g, " ") // asteriscos, pipes, etc.
    .replace(/[-]{2,}/g, " ") // guiones largos repetidos
    .replace(/\s{2,}/g, " ")
    .trim();

  // 5) Mejorar citas para voz/lectura: (p. 36) -> (página 36)
  s = s.replace(/\(p\.\s*(\d+)\)/gi, "(página $1)");
  s = s.replace(/\bp\.\s*(\d+)\b/gi, "página $1");

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
function splitForSpeech(text: string, maxLen = 220) {
  const s = humanizeForSpeech(String(text || "").trim());
  if (!s) return [];

  // corta por saltos de línea / puntos / signos, intentando no cortar frases
  const parts: string[] = [];
  const chunks = s
    .split(/\n+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const c of chunks) {
    if (c.length <= maxLen) {
      parts.push(c);
      continue;
    }

    // sub-split por signos
    const sentences = c.split(/(?<=[\.\!\?\:])\s+/g);
    let buf = "";
    for (const sent of sentences) {
      const candidate = (buf ? buf + " " : "") + sent;
      if (candidate.length <= maxLen) buf = candidate;
      else {
        if (buf) parts.push(buf.trim());
        buf = sent;
      }
    }
    if (buf) parts.push(buf.trim());
  }

  // último fallback: si aún hay algo enorme, cortar duro
  const finalParts: string[] = [];
  for (const p of parts) {
    if (p.length <= maxLen) finalParts.push(p);
    else {
      for (let i = 0; i < p.length; i += maxLen) {
        finalParts.push(p.slice(i, i + maxLen).trim());
      }
    }
  }

  return finalParts.filter(Boolean);
}

async function speakTextChunked(text: string, lang: VoiceLang) {
  const parts = splitForSpeech(text, 220);
  if (!parts.length) return;

  for (const part of parts) {
    const r = await speakText(part, lang);
    if (!r.ok) break;
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
function inferAxisFromQuestion(q: string): "ECO" | "SEG" | "SAL" | "EDU" {
  const t = q.toLowerCase();

  if (t.includes("seguridad") || t.includes("delinc") || t.includes("crimen") || t.includes("extors"))
    return "SEG";

  if (t.includes("salud") || t.includes("hospital") || t.includes("essalud") || t.includes("sis"))
    return "SAL";

  if (
    t.includes("educ") ||
    t.includes("coleg") ||
    t.includes("escuel") ||
    t.includes("univers") ||
    t.includes("docente")
  )
    return "EDU";

  // por defecto
  return "ECO";
}

function prettyCitationsText(input: string) {
  let s = String(input || "");
  // (p. 36) -> (página 36)
  s = s.replace(/\(p\.\s*(\d+)\)/gi, "(página $1)");
  // p.36 / p. 36 -> página 36
  s = s.replace(/\bp\.\s*(\d+)\b/gi, "página $1");
  return s;
}

// ✅ Helpers: follow-ups y contexto
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
  if (mem.lastCandidateName && candidateName && mem.lastCandidateName !== candidateName) {
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
function getCompareIdFromSearchParams(sp: any) {
  const candidates = [
    sp?.get("idB"),
    sp?.get("b"),
    sp?.get("compare"),
    sp?.get("compareWith"),
    sp?.get("vs"),
  ].filter(Boolean) as string[];

  return (candidates[0] ?? "").trim();
}
function answerFromCambioConValentia(rawQ: string) {
  const q = normalize(rawQ);

  // Casi cualquier input en esta página debe devolver el contenido real.
  // Pero damos "guía" cuando preguntan algo tipo ayuda.
  const wantsGuide =
    !q ||
    q.length < 3 ||
    q.includes("ayuda") ||
    q.includes("guia") ||
    q.includes("guía") ||
    q.includes("como usar") ||
    q.includes("qué es") ||
    q.includes("que es");

  if (wantsGuide) {
    return `${CAMBIO_PAGE_GUIDE}\n\n${CAMBIO_PAGE_TITLE}\n\nEnlace:\n${CAMBIO_PAGE_LINK_URL}\n\n${CAMBIO_PAGE_PHRASE}`;
  }

  // Si pide enlace
  if (q.includes("link") || q.includes("enlace") || q.includes("web") || q.includes("pagina") || q.includes("página")) {
    return `Enlace oficial:\n${CAMBIO_PAGE_LINK_URL}`;
  }

  // Si pide leer/frase
  if (q.includes("leer") || q.includes("frase") || q.includes("mensaje") || q.includes("texto")) {
    return `${CAMBIO_PAGE_PHRASE}\n\nEnlace:\n${CAMBIO_PAGE_LINK_URL}`;
  }

  // Default: repetir todo el contenido de la página (sin inventar)
  return `${CAMBIO_PAGE_TITLE}\n\nEnlace:\n${CAMBIO_PAGE_LINK_URL}\n\n${CAMBIO_PAGE_PHRASE}`;
}

async function handleCambioConValentia(
  rawQ: string,
  maybeSpeakFn: (t: string) => Promise<void>,
  pushFn: (t: string) => void
) {
  const out = answerFromCambioConValentia(rawQ);
  pushFn(out);
  await maybeSpeakFn(out);
}

export default function FederalitoAssistantPanel() {
  const pathname = usePathname();

  // ✅ Reemplazo de useSearchParams(): funciona en cliente y no rompe el build
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  const compareCandidateId = getCompareIdFromSearchParams(searchParams);
    // ===============================
  // MODO ESPECIAL: /reflexion
  // ===============================
  const isReflexionPage = String(pathname || "").startsWith("/reflexion");
    // ===============================
  // MODO ESPECIAL: /ciudadano/servicio
  // ===============================
  const isCiudadanoServicioPage = String(pathname || "").startsWith("/ciudadano/servicio");
  const isCambioConValentiaPage = String(pathname || "").startsWith(CAMBIO_PAGE_ROUTE);

  const [refAxisId, setRefAxisId] = useState<string | null>(null);
  const [refWaitingNumber, setRefWaitingNumber] = useState(false);


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
      t.closest?.("button, a, input, select, textarea, label, [role='button'], [data-no-drag='1']")
    );
  }

  function onHeaderPointerDown(e: React.PointerEvent) {
    if (isInteractiveTarget(e.target)) return;
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

    // ✅ ÚNICA versión (sin duplicados)
  function resetAssistantChat() {
    // 1) Cortar voz si está hablando
    try {
      window.speechSynthesis?.cancel();
    } catch {}

    // 2) Cortar micrófono si está escuchando
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    setListening(false);

    // 3) Reset UI/estado
    setBusy(false);
    setMsgs([
      {
        role: "system",
        content:
          "Hola, soy Federalito AI. Puedo ayudarte a usar la app y responder preguntas según la pestaña actual: Hoja de vida, Plan de gobierno o Actuar político.",
      },
    ]);
    setDraft("");

    // 4) Reset memoria (estado + storage)
    setMem({});
    try {
      localStorage.removeItem(LS_ASSIST_MEM);
    } catch {}
    setRefAxisId(null);
    setRefWaitingNumber(false);

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

  // ✅ Memoria corta (persistente)
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
const [pageReadText, setPageReadText] = useState<string>("");
const [pageReadAt, setPageReadAt] = useState<number>(0);

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

  // ✅ persist memory
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

  // escuchar eventos guia
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
// ===============================
// 📄 Escuchar contenido de la página (comparaciones, etc.)
// ===============================
useEffect(() => {
  function onPageRead(ev: Event) {
    const e = ev as CustomEvent<{ text?: string }>;
    const txt = String(e.detail?.text ?? "").trim();
    if (!txt) return;

  setPageReadText(txt);
setPageReadAt(Date.now());

// ✅ Debug visual: confirma que llegó contenido de página
setMsgs((prev) => [
  ...prev,
  { role: "assistant", content: "📄 Listo: tengo una comparación en pantalla para leer con 🔊 Leer." },
]);

  }

  window.addEventListener("votoclaro:page-read", onPageRead as any);
  return () =>
    window.removeEventListener("votoclaro:page-read", onPageRead as any);
}, []);

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
    await speakTextChunked(text, voiceLang);
const r = { ok: true, usedLang: voiceLang === "qu" ? "qu" : "es-PE" as any };

    if (voiceLang === "qu" && r.usedLang === "fallback-es") {
      pushAssistant("Nota: no detecté voz Quechua en este dispositivo. Estoy leyendo en Español (Perú) como respaldo.");
    }
  }

  // update memory al responder
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
  function normalizeLite(s: string) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();
  }
type PageCtx = "HOME" | "REFLEXION" | "CIUDADANO" | "CAMBIO" | "CANDIDATE" | "OTHER";

function getPageCtx(pathname: string) : PageCtx {
  const p = String(pathname || "");
  if (p === "/" || p.startsWith("/#")) return "HOME";
  if (p.startsWith("/reflexion")) return "REFLEXION";
  if (p.startsWith("/ciudadano/servicio")) return "CIUDADANO";
  if (p.startsWith("/cambio-con-valentia")) return "CAMBIO";
  if (p.startsWith("/candidate/")) return "CANDIDATE";
  return "OTHER";
}

function hasProfanity(rawQ: string) {
  const t = normalizeLite(rawQ);
  if (!t) return false;

  // Lista corta (no exhaustiva) de groserías/insultos comunes
  const bad = [
    "idiota",
    "imbecil",
    "imbécil",
    "estupido",
    "estúpido",
    "cojudo",
    "cojuda",
    "concha",
    "mierda",
    "carajo",
    "puta",
    "puto",
    "ctm",
    "csm",
    "huevon",
    "huevón",
    "huevona",
    "huevona",
    "pendejo",
    "pendeja",
    "gil",
  ].map(normalizeLite);

  return bad.some((w) => w && t.includes(w));
}

function detectIntent(rawQ: string) {
  const t = normalizeLite(rawQ);

  const wantsHV =
    t.includes("hoja de vida") || t.includes("hv") || t.includes("vida") && t.includes("candidato");

  const wantsPLAN =
    t.includes("plan") || t.includes("plan de gobierno") || t.includes("plan de trabajo") || t.includes("propuesta") || t.includes("promesa");

  const wantsNEWS =
    t.includes("actuar") || t.includes("noticia") || t.includes("noticias") || t.includes("investigacion") || t.includes("investigación") || t.includes("denuncia") || t.includes("caso");

  const wantsREFLEXION =
    t.includes("reflexion") || t.includes("reflexión") || t.includes("pregunta") && (t.includes("salud") || t.includes("educ") || t.includes("segur") || t.includes("corrup") || t.includes("econom"));

  const wantsCIUDADANO =
    t.includes("servicio al ciudadano") ||
    t.includes("servicios al ciudadano") ||
    t.includes("miembro de mesa") ||
    t.includes("local de votacion") ||
    t.includes("local de votación") ||
    t.includes("multas") ||
    t.includes("reniec") ||
    t.includes("jne") ||
    t.includes("onpe");

  const wantsCAMBIO =
    t.includes("peru federal") || t.includes("perú federal") || t.includes("cambio con valentia") || t.includes("cambio con valentía");

  const asksPartyDetails =
    t.includes("partido") || t.includes("propuesta del partido") || t.includes("ideologia") || t.includes("ideología") || t.includes("programa") || t.includes("estatuto") || t.includes("milit");

  return {
    t,
    wantsHV,
    wantsPLAN,
    wantsNEWS,
    wantsREFLEXION,
    wantsCIUDADANO,
    wantsCAMBIO,
    asksPartyDetails,
  };
}

function buildRedirectMessage(ctx: PageCtx, rawQ: string) {
  const i = detectIntent(rawQ);

  // Si pregunta por Perú Federal / partido desde cualquier lugar => preferir dirigir a página oficial o a nuestra ventana
  if (i.wantsCAMBIO || i.asksPartyDetails) {
    if (ctx === "CAMBIO") {
      return (
        "Para información detallada del partido o su propuesta oficial, lo mejor es visitar su web.\n\n" +
        "👉 Abre el sitio oficial: https://perufederal.pe/\n\n" +
        "Aquí en VotoClaro solo mostramos esta ventana como acceso rápido (imagen, frase y enlace)."
      );
    }
    return (
      "Ese tema corresponde a “UN CAMBIO CON VALENTÍA”.\n\n" +
      "👉 Ve a: /cambio-con-valentia\n\n" +
      "Ahí encontrarás el enlace oficial para conocer la propuesta."
    );
  }

  // Preguntas sobre HV/PLAN/NEWS => dirigir a ficha candidato
  if (i.wantsHV || i.wantsPLAN || i.wantsNEWS) {
    if (ctx === "CANDIDATE") {
      // Ya está en candidato, pero puede estar en tab distinto (lo resolvemos con guía)
      if (i.wantsHV) return "Esto es de Hoja de Vida. En la ficha del candidato cambia a la pestaña HV y pregúntame ahí.";
      if (i.wantsPLAN) return "Esto es del Plan. En la ficha del candidato cambia a la pestaña Plan y pregúntame ahí.";
      if (i.wantsNEWS) return "Esto es de Actuar político. En la ficha del candidato cambia a la pestaña Actuar político y pregúntame ahí.";
    }

    // No está en candidato
    const which = i.wantsHV ? "Hoja de Vida (HV)" : i.wantsPLAN ? "Plan (PLAN)" : "Actuar político (NEWS)";
    return (
      `Eso corresponde a la ficha del candidato (${which}).\n\n` +
      "👉 Ve al inicio (/), busca el candidato y entra a su ficha.\n" +
      "Luego elige la pestaña HV / Plan / Actuar político y me preguntas ahí."
    );
  }

  // Reflexión
  if (i.wantsREFLEXION) {
    if (ctx === "REFLEXION") return null; // ya está en la ventana correcta
    return (
      "Eso corresponde a “Reflexionar antes de votar”.\n\n" +
      "👉 Ve a: /reflexion\n\n" +
      "Ahí puedo leerte preguntas y reflexiones sin inventar."
    );
  }

  // Servicios al ciudadano
  if (i.wantsCIUDADANO) {
    if (ctx === "CIUDADANO") return null;
    return (
      "Eso corresponde a “Servicios al ciudadano”.\n\n" +
      "👉 Ve a: /ciudadano/servicio\n\n" +
      "Ahí te guío por los enlaces oficiales (JNE, ONPE, RENIEC)."
    );
  }

  // Si está en /reflexion y pregunta por HV/PLAN/NEWS ya se cubrió arriba,
  // pero si está en otras ventanas y pregunta algo sin intención clara => fallback
  return (
    "Ese tema no está dentro del alcance directo de esta pantalla.\n\n" +
    "Si buscas información general, te recomiendo usar Google u otro buscador confiable.\n" +
    "Y si es sobre candidatos o elecciones dentro de la app, dime exactamente qué necesitas (HV, Plan, Actuar político, Reflexión o Servicios)."
  );
}

async function handleGlobalPolicyAndRedirect(params: {
  pathname: string;
  rawQ: string;
  candidateId: string;
  askMode: AskMode;
  pushAssistant: (t: string) => void;
  maybeSpeak: (t: string) => Promise<void>;
}): Promise<{ handled: boolean }> {
  const { pathname, rawQ, pushAssistant, maybeSpeak } = params;

  // 1) Insultos / groserías
  if (hasProfanity(rawQ)) {
    const msg =
      "Este espacio es para informarse con respeto.\n\n" +
      "Si deseas continuar, reformula tu pregunta sin insultos. " +
      "Si vas a seguir con groserías, te recomiendo retirarte de la app.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return { handled: true };
  }

  // 2) Redirección por contexto
  const ctx = getPageCtx(pathname);
  const redirect = buildRedirectMessage(ctx, rawQ);

  // Si redirect es null => significa “estás en la pantalla correcta” (no interceptar)
  if (redirect === null) return { handled: false };

  // Si estamos en candidato, dejamos que el backend responda salvo que el redirect sea de “cambia pestaña”
  // (ya lo resolvimos arriba con mensajes específicos)
  if (ctx === "CANDIDATE") {
    const i = detectIntent(rawQ);
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

  // Si estamos en pantallas locales (REFLEXION/CIUDADANO/CAMBIO/HOME/OTHER),
  // solo redirigimos cuando la intención NO corresponde a esa pantalla.
  // Ejemplo: en CAMBIO, si preguntan HV/PLAN/NEWS => redirigir.
  const i = detectIntent(rawQ);
  if (ctx === "REFLEXION") {
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsCIUDADANO || i.wantsCAMBIO || i.asksPartyDetails) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

  if (ctx === "CIUDADANO") {
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsREFLEXION || i.wantsCAMBIO || i.asksPartyDetails) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

  if (ctx === "CAMBIO") {
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsREFLEXION || i.wantsCIUDADANO || i.asksPartyDetails) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

  if (ctx === "HOME" || ctx === "OTHER") {
    // En inicio, si no hay intención clara => fallback a buscador
    const anyKnown = i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsREFLEXION || i.wantsCIUDADANO || i.wantsCAMBIO || i.asksPartyDetails;
    if (!anyKnown) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }

    // Si sí hay intención, redirect te guía a la pantalla correcta
    pushAssistant(redirect);
    await maybeSpeak(redirect);
    return { handled: true };
  }

  return { handled: false };
}

  function matchRefAxisId(input: string): string | null {
    const t = normalizeLite(input);

    // Mapeo “humano” -> id real del eje
    const rules: Array<[RegExp, string]> = [
      [/econom|emple|trabaj/, "eco"],
      [/salud|hospital|sis|essalud/, "salud"],
      [/segurid|delinc|extors|crimen|polic/, "seg"],
      [/educ|coleg|escuel|univers|docen/, "edu"],
      [/descentr|region|lima/, "des"],
      [/justic|corrup|fiscal|juez/, "jus"],
      [/ambien|clima|agua|bosque/, "amb"],
      [/tecnolog|innov|digital|datos|privac/, "tec"],
      [/exterior|defensa|soberan|frontera|ciber/, "ext"],
    ];

    for (const [re, id] of rules) {
      if (re.test(t)) return id;
    }
    return null;
  }

  function parseQuestionNumber(input: string): number | null {
    const t = normalizeLite(input);

    // “pregunta 5”, “p 5”, “5”
    const m = t.match(/(?:pregunta|p)?\s*(\d)\b/);
    if (!m) return null;

    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
    return null;
  }

  async function handleReflexion(rawQ: string) {
    const q = (rawQ || "").trim();
    if (!q) return;

    // Si el usuario dice solo "1..5"
    const onlyNumber = q.match(/^\s*[1-5]\s*$/) ? Number(q.trim()) : null;

    // 1) Caso: venimos esperando número
    if (refWaitingNumber && refAxisId && onlyNumber) {
      const axis = REFLEXION_AXES.find((a) => a.id === refAxisId);
      const idx = onlyNumber - 1;

      if (!axis || !axis.questions?.[idx]) {
        const msg = "No encontré esa pregunta. Dime un número del 1 al 5.";
        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }

      const item = axis.questions[idx];
      const out =
        `✅ ${axis.title}\n` +
        `Pregunta ${onlyNumber}:\n${item.question}\n\n` +
        `${item.reflection}\n` +
        (item.followups?.length
          ? `\n\nPara seguir reflexionando:\n- ${item.followups.join("\n- ")}`
          : "");

      pushAssistant(out);
      await maybeSpeak(out);

      setRefWaitingNumber(false);
      return;
    }

    // 2) Caso: "educacion pregunta 5" (o parecido)
    const axisFromText = matchRefAxisId(q);
    const nFromText = parseQuestionNumber(q);

    if (axisFromText) {
      const axis = REFLEXION_AXES.find((a) => a.id === axisFromText);
      if (!axis) {
        const msg = "No encontré ese eje. Prueba: educación, salud, seguridad, economía…";
        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }

      setRefAxisId(axisFromText);

      // Si también vino el número, respondemos directo
      if (nFromText) {
        const idx = nFromText - 1;
        const item = axis.questions?.[idx];

        if (!item) {
          const msg = "Ese eje tiene preguntas del 1 al 5. Dime un número válido.";
          pushAssistant(msg);
          await maybeSpeak(msg);
          setRefWaitingNumber(true);
          return;
        }

        const out =
          `✅ ${axis.title}\n` +
          `Pregunta ${nFromText}:\n${item.question}\n\n` +
          `${item.reflection}\n` +
          (item.followups?.length
            ? `\n\nPara seguir reflexionando:\n- ${item.followups.join("\n- ")}`
            : "");

        pushAssistant(out);
        await maybeSpeak(out);
        setRefWaitingNumber(false);
        return;
      }

      // Si NO vino número: listamos las 5 y pedimos número
      const list =
        axis.questions
          .slice(0, 5)
          .map((qq, i) => `${i + 1}) ${qq.question}`)
          .join("\n\n");

      const msg =
        `Estás en el eje: ${axis.title}.\n\n` +
        `Estas son las 5 preguntas:\n\n${list}\n\n` +
        `Dime un número del 1 al 5 y te leo la pregunta y su reflexión.`;

      pushAssistant(msg);
      await maybeSpeak(msg);
      setRefWaitingNumber(true);
      return;
    }

    // 3) Si el usuario dice "pregunta 3" pero NO dijo eje (y no está esperando número)
    if (nFromText && refAxisId) {
      // si ya hay eje guardado, usamos eso
      setRefWaitingNumber(true);
      await handleReflexion(String(nFromText));
      return;
    }

    // 4) Mensaje de ayuda general
    const help =
      "Estoy en Reflexionar antes de votar.\n" +
      "Puedes decir por ejemplo:\n" +
      "- “educación” (te muestro las 5 preguntas)\n" +
      "- “educación pregunta 5” (te leo directo)\n" +
      "- o si ya te mostré el eje: solo di “1”, “2”, “3”, “4” o “5”.";
    pushAssistant(help);
    await maybeSpeak(help);
  }

  async function askBackend(question: string) {
  const rawQ = (question || "").trim();
  if (!rawQ) return;
  // =========================================
  // ✅ POLÍTICA GLOBAL: insultos + redirección por contexto
  // =========================================
  const gate = await handleGlobalPolicyAndRedirect({
    pathname: String(pathname || ""),
    rawQ,
    candidateId,
    askMode,
    pushAssistant,
    maybeSpeak,
  });

  if (gate.handled) return;

  // =========================================
  // 🧠 MODO LOCAL: /reflexion (SIN Gemini)
  // =========================================
  const isReflexionPage = String(pathname || "").startsWith("/reflexion");

if (isReflexionPage) {
  await handleReflexion(rawQ);
  return;
}
  // =========================================
  // 🧠 MODO LOCAL: /cambio-con-valentia (SIN IA)
  // =========================================
  if (isCambioConValentiaPage) {
    await handleCambioConValentia(rawQ, maybeSpeak, pushAssistant);
    return;
  }

  // =========================================
  // 🧠 MODO LOCAL: /ciudadano/servicio (SIN Gemini)
  // =========================================
  if (isCiudadanoServicioPage) {
    await handleCiudadanoServicio(rawQ, maybeSpeak, pushAssistant);
    return;
  }

  // =========================================
  // 🔒 MODO NORMAL: requiere candidato
  // =========================================
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
  const enrichedQ = buildContextualQuestion(rawQ, mem, cname, askMode);

  setBusy(true);
  try {
    // 👉 aquí sigue TODO tu código actual (HV / PLAN / NEWS)

      // 1) HV / PLAN (PDF)
     // 1) HV / PLAN (PDF)
if (askMode === "HV" || askMode === "PLAN") {
  const doc = askMode === "HV" ? "hv" : "plan";

  // ✅ Detectar si la pregunta pide comparación (simple)
  const qNorm = normalize(rawQ);
  const wantsCompare =
    askMode === "PLAN" &&
    !!compareCandidateId &&
    (qNorm.includes("compara") ||
      qNorm.includes("comparar") ||
      qNorm.includes("vs") ||
      qNorm.includes("versus") ||
      qNorm.includes("diferencia") ||
      qNorm.includes("diferencias"));

  // ✅ Si es comparación PLAN vs PLAN => pegarle a /api/compare/plan
  if (wantsCompare) {
    // axis: si en tu UI ya lo tienes, úsalo; si no, default ECO
    // (en el siguiente paso te doy el helper de axis)
    const axis = inferAxisFromQuestion(rawQ);

    const url =
      `/api/compare/plan?axis=${encodeURIComponent(axis)}` +
      `&idA=${encodeURIComponent(candidateId)}` +
      `&idB=${encodeURIComponent(compareCandidateId)}`;

    const res = await fetch(url, { cache: "no-store" });
    const payload = await safeReadJson(res);

    if (!res.ok) {
      const msg =
        (payload as any)?._nonJson
          ? "Error COMPARAR: el servidor devolvió una respuesta no-JSON. Revisa DevTools → Network → /api/compare/plan."
          : `Error COMPARAR: ${String((payload as any)?.error ?? (payload as any)?.message ?? "desconocido")}`;
      pushAssistant(msg);
      await maybeSpeak(msg);
      return;
    }

    // el endpoint compare devuelve { a: {answer}, b:{answer}, axis... }
    const aAnsRaw = String((payload as any)?.a?.answer ?? "").trim();
    const bAnsRaw = String((payload as any)?.b?.answer ?? "").trim();

    const out =
      `Comparación (Plan vs Plan) — Eje: ${axis}\n\n` +
      `A) ${cname}\n${aAnsRaw}\n\n` +
      `B) ${slugToName(compareCandidateId)}\n${bAnsRaw}`;

    const outPretty = prettyCitationsText(out);

    pushAssistant(outPretty);
    await maybeSpeak(outPretty);

    updateMemAfterAnswer({
      mode: askMode,
      candidateId,
      candidateName: cname,
      question: rawQ,
      answer: outPretty,
      answerHasLinks: false,
    });

    return;
  }

  // ✅ Normal (HV o PLAN individual) => /api/ai/answer
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

  const ansRaw = String(
    data?.answer ?? "No hay evidencia suficiente en las fuentes consultadas."
  ).trim();

  const ans = prettyCitationsText(ansRaw);

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

      // 2) NEWS (Actuar político)
      if (askMode === "NEWS") {
        const finalQ = cname ? `${cname}: ${rawQ}` : rawQ;
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

  // SpeechRecognition (Web Speech)
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
        <div ref={panelRef} className="fixed z-[70] w-[min(92vw,420px)]" style={{ left: pos.x, top: pos.y }}>
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
                {/* ✅ ahora sí: reset de POSICIÓN */}
                <button
                  type="button"
                  onClick={(e) => {
                  e.stopPropagation();
                  resetPanelPos();
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

                {/* ✅ Botón para reiniciar CHAT (opcional pero útil) */}
                <button
                  type="button"
                  onClick={resetAssistantChat}
                  className="rounded-full px-3 py-1 text-[12px] font-extrabold border bg-white text-slate-800 hover:bg-slate-50"
                  title="Reiniciar chat"
                >
                  Reiniciar chat
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                {askMode === "NEWS"
                  ? "Actuar político: usa fuentes web (lista blanca) y muestra enlaces."
                  : "HV/Plan: responde solo con evidencia del PDF y cita páginas (p. X)."}{" "}
                {candidateId ? "" : "Tip: entra a /candidate/[id] para que el asistente sepa qué candidato consultar."}
              </div>

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
      "text-[14px] leading-[20px] whitespace-pre-wrap rounded-2xl px-4 py-3 border shadow-sm",
      m.role === "user"
        ? "ml-10 bg-green-700 text-white border-green-800"
        : "mr-10 bg-white text-slate-900 border-slate-200",
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
                  className={[
  "flex-1 rounded-xl border px-3 py-2 text-[14px] font-semibold",
  "bg-slate-50 text-slate-900 placeholder:text-slate-500",
  "border-slate-300 outline-none",
  "focus:ring-4 focus:ring-green-200 focus:border-green-600",
  "caret-green-700",
].join(" ")}

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

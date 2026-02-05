// src/components/assistant/FederalitoAssistantPanel.tsx
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
type VoiceLang = "es-PE" | "qu";
type AskMode = "HV" | "PLAN" | "NEWS";

const LS_VOICE_MODE = "votoclaro_voice_mode_v1";
const LS_VOICE_LANG = "votoclaro_voice_lang_v1";
const LS_VOICE_HINT_SHOWN = "votoclaro_voice_hint_shown_v1";
const LS_ASK_MODE = "votoclaro_assistant_mode_v1";

// ✅ Panel flotante: posición persistente
const LS_ASSIST_POS = "votoclaro_assistant_pos_v1";
type PanelPos = { x: number; y: number };

// ✅ FAB movible: posición persistente
const LS_ASSIST_FAB_POS = "votoclaro_assistant_fab_pos_v1";

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

function normalizeLite(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function answerFromReflexion(rawQ: string) {
  const q = normalize(rawQ);

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

  const axisHit = REFLEXION_AXES.find(
    (a) => normalize(a.title).includes(q) || q.includes(normalize(a.title))
  );

  if (axisHit) {
    const list = axisHit.questions.map((qq, i) => `${i + 1}) ${qq.question}`).join("\n");

    return (
      `Eje: ${axisHit.title}\n` +
      (axisHit.subtitle ? `${axisHit.subtitle}\n\n` : "\n") +
      "Estas son las 5 preguntas:\n" +
      list +
      "\n\n" +
      "Dime el número (1 a 5) o copia una parte de la pregunta para leerte la reflexión."
    );
  }

  const flat = REFLEXION_AXES.flatMap((a) => a.questions.map((qq) => ({ axis: a, q: qq })));
  const words = q.split(" ").filter((w) => w.length >= 4);

  let best: any = null;
  let bestScore = 0;

  for (const item of flat) {
    const t = normalize(item.q.question);
    let score = 0;
    for (const w of words) if (t.includes(w)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best && bestScore >= 1) {
    const follow = best.q.followups?.length
      ? "\n\nPara seguir reflexionando:\n" + best.q.followups.map((f: string) => `- ${f}`).join("\n")
      : "";
    return `Eje: ${best.axis.title}\n\nPregunta:\n${best.q.question}\n\nReflexión:\n${best.q.reflection}${follow}`;
  }

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

  if (!q || q.length < 3 || q.includes("ayuda") || q.includes("guia") || q.includes("guía") || q.includes("como usar")) {
    return `${CIUDADANO_PAGE_GUIDE}\n\n${CIUDADANO_LEGAL_NOTE}`;
  }

  if (
    q.includes("lista") ||
    q.includes("servicios") ||
    q.includes("que hay") ||
    q.includes("qué hay") ||
    q.includes("leer todo") ||
    q.includes("todo")
  ) {
    const list = CIUDADANO_SERVICES.map((s, i) => `${i + 1}) ${s.title} (${s.entity})`).join("\n");
    return (
      "Servicios disponibles:\n" +
      list +
      "\n\n" +
      "Dime el número (por ejemplo “3”) o una palabra clave (por ejemplo “multas”, “miembro de mesa”, “reniec”) y te leo el detalle."
    );
  }

  const mNum = q.match(/^\s*(\d{1,2})\s*$/);
  if (mNum) {
    const n = Number(mNum[1]);
    const item = CIUDADANO_SERVICES[n - 1];
    if (!item) return "Ese número no existe en la lista. Dime un número válido.";
    return `${item.title} (${item.entity})\n\n${item.description}\n\nEnlace oficial:\n${item.url}`;
  }

  const wantsJNE = q.includes("jne");
  const wantsONPE = q.includes("onpe");
  const wantsRENIEC = q.includes("reniec");

  if (wantsJNE || wantsONPE || wantsRENIEC) {
    const ent = wantsJNE ? "JNE" : wantsONPE ? "ONPE" : "RENIEC";
    const list = CIUDADANO_SERVICES.filter((s) => s.entity === ent)
      .map((s, i) => `${i + 1}) ${s.title}`)
      .join("\n");

    return `Servicios de ${ent}:\n${list}\n\nDime el nombre exacto del servicio o escribe “lista” para ver todo.`;
  }

  const hit = CIUDADANO_SERVICES.find((s) => {
    const t = normalize(s.title);
    return t.includes(q) || q.includes(t);
  });

  if (hit) {
    return `${hit.title} (${hit.entity})\n\n${hit.description}\n\nEnlace oficial:\n${hit.url}`;
  }

  const words = q.split(" ").filter((w) => w.length >= 4);
  let best: any = null;
  let bestScore = 0;

  for (const s of CIUDADANO_SERVICES) {
    const t = normalize(`${s.title} ${s.description}`);
    let score = 0;
    for (const w of words) if (t.includes(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  if (best && bestScore >= 1) {
    return `${best.title} (${best.entity})\n\n${best.description}\n\nEnlace oficial:\n${best.url}`;
  }

  return (
    "No encontré ese servicio en esta página.\n\n" +
    "Prueba con: “lista”, “multas”, “miembro de mesa”, “local de votación”, “cédula”, “reniec”.\n\n" +
    CIUDADANO_PAGE_GUIDE
  );
}

async function handleCiudadanoServicio(
  rawQ: string,
  maybeSpeakFn: (t: string) => Promise<void>,
  pushFn: (t: string) => void
) {
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

function pickBestVoice(all: SpeechSynthesisVoice[], lang: VoiceLang): SpeechSynthesisVoice | null {
  if (!all.length) return null;

  const scored = all.map((v) => {
    const name = normalize(v.name || "");
    const vlang = normalize(v.lang || "");
    const local = !!v.localService;

    let score = 0;

    if (name.includes("google")) score += 30;
    if (name.includes("microsoft")) score += 25;
    if (local) score += 10;

    if (lang === "es-PE") {
      if (vlang === "es-pe") score += 60;
      if (vlang.startsWith("es-")) score += 35;
      if (vlang.includes("es-419")) score += 25;
    } else {
      if (vlang.startsWith("qu")) score += 80;
      if (vlang.includes("quz")) score += 80;
      if (name.includes("quech")) score += 50;
      if (name.includes("quich")) score += 30;
    }

    if (name.includes("male") || name.includes("hombre")) score += 6;
    if (name.includes("juan") || name.includes("carlos") || name.includes("diego") || name.includes("andres"))
      score += 3;

    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}

function humanizeForSpeech(input: string) {
  let s = String(input || "");

  s = s.replace(/[✅✔️☑️]/g, "");
  s = s.replace(/[🎙️🔊]/g, "");

  s = s.replace(/\/candidate\/\[[^\]]+\]/gi, "la ficha del candidato");
  s = s.replace(/\/candidate\/[a-z0-9\-_]+/gi, "la ficha del candidato");
  s = s.replace(/\/api\/[a-z0-9\/\-_?=&]+/gi, "el servidor");
  s = s.replace(/https?:\/\/\S+/gi, "un enlace");

  s = s.replace(/^\s*[-–—−•]\s+/gm, "");
  s = s.replace(/[—−]/g, ", ");

  s = s
    .replace(/[\/\\]+/g, " ")
    .replace(/[\*\|_#]+/g, " ")
    .replace(/[-]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

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

    u.lang = targetLang === "qu" ? "qu" : "es-PE";
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

  const parts: string[] = [];
  const chunks = s.split(/\n+/g).map((x) => x.trim()).filter(Boolean);

  for (const c of chunks) {
    if (c.length <= maxLen) {
      parts.push(c);
      continue;
    }

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

  if (t.includes("seguridad") || t.includes("delinc") || t.includes("crimen") || t.includes("extors")) return "SEG";
  if (t.includes("salud") || t.includes("hospital") || t.includes("essalud") || t.includes("sis")) return "SAL";
  if (t.includes("educ") || t.includes("coleg") || t.includes("escuel") || t.includes("univers") || t.includes("docente"))
    return "EDU";

  return "ECO";
}

function prettyCitationsText(input: string) {
  let s = String(input || "");
  s = s.replace(/\(p\.\s*(\d+)\)/gi, "(página $1)");
  s = s.replace(/\bp\.\s*(\d+)\b/gi, "página $1");
  return s;
}

// ✅ Helpers: follow-ups y contexto
function looksLikeFollowUp(q: string) {
  const t = normalize(q).trim();
  if (!t) return false;
  if (t.length <= 22) return true;

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

  const hasPrev = !!(mem?.lastQuestion || mem?.lastAnswer);
  if (!hasPrev) return q;

  if (mem.lastCandidateName && candidateName && mem.lastCandidateName !== candidateName) {
    return q;
  }

  if (!looksLikeFollowUp(q)) return q;

  const modeLabel =
    askMode === "HV" ? "Hoja de Vida (PDF)" : askMode === "PLAN" ? "Plan de Gobierno (PDF)" : "Actuar político (web)";
  const who = (candidateName || mem.lastCandidateName || "").trim();

  const prevQ = (mem.lastQuestion || "").trim();
  const prevA = (mem.lastAnswer || "").trim();

  const anchor =
    prevA && prevA.length > 0
      ? `Respuesta previa (resumen): ${prevA.slice(0, 220)}${prevA.length > 220 ? "…" : ""}`
      : prevQ
      ? `Pregunta previa: ${prevQ.slice(0, 180)}${prevQ.length > 180 ? "…" : ""}`
      : "";

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
  const candidates = [sp?.get("idB"), sp?.get("b"), sp?.get("compare"), sp?.get("compareWith"), sp?.get("vs")].filter(
    Boolean
  ) as string[];
  return (candidates[0] ?? "").trim();
}

function answerFromCambioConValentia(rawQ: string) {
  const q = normalize(rawQ);

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

  if (q.includes("link") || q.includes("enlace") || q.includes("web") || q.includes("pagina") || q.includes("página")) {
    return `Enlace oficial:\n${CAMBIO_PAGE_LINK_URL}`;
  }

  if (q.includes("leer") || q.includes("frase") || q.includes("mensaje") || q.includes("texto")) {
    return `${CAMBIO_PAGE_PHRASE}\n\nEnlace:\n${CAMBIO_PAGE_LINK_URL}`;
  }

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

type PageCtx = "HOME" | "REFLEXION" | "CIUDADANO" | "CAMBIO" | "CANDIDATE" | "OTHER";

function getPageCtx(pathname: string): PageCtx {
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
    "pendejo",
    "pendeja",
    "gil",
  ].map(normalizeLite);

  return bad.some((w) => w && t.includes(w));
}

function detectIntent(rawQ: string) {
  const t = normalizeLite(rawQ);

  const wantsHV =
    t.includes("hoja de vida") ||
    t.includes("hv") ||
    (t.includes("vida") && t.includes("candidato"));

  const wantsPLAN =
    t.includes("plan") ||
    t.includes("plan de gobierno") ||
    t.includes("plan de trabajo") ||
    t.includes("propuesta") ||
    t.includes("promesa");

  const wantsNEWS =
    t.includes("actuar") ||
    t.includes("noticia") ||
    t.includes("noticias") ||
    t.includes("investigacion") ||
    t.includes("investigación") ||
    t.includes("denuncia") ||
    t.includes("caso");

  const wantsREFLEXION =
    t.includes("reflexion") ||
    t.includes("reflexión") ||
    (t.includes("pregunta") &&
      (t.includes("salud") ||
        t.includes("educ") ||
        t.includes("segur") ||
        t.includes("corrup") ||
        t.includes("econom")));

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
    t.includes("peru federal") ||
    t.includes("perú federal") ||
    t.includes("cambio con valentia") ||
    t.includes("cambio con valentía");

  const asksPartyDetails =
    t.includes("partido") ||
    t.includes("propuesta del partido") ||
    t.includes("ideologia") ||
    t.includes("ideología") ||
    t.includes("programa") ||
    t.includes("estatuto") ||
    t.includes("milit");

  // ✅ HOME: ayuda genérica
  const wantsHOMEHELP =
    t.includes("que hago") ||
    t.includes("qué hago") ||
    t.includes("como uso") ||
    t.includes("cómo uso") ||
    t.includes("como funciona") ||
    t.includes("cómo funciona") ||
    t.includes("ayuda") ||
    t.includes("guia") ||
    t.includes("guía") ||
    t.includes("inicio") ||
    t.includes("esta ventana") ||
    t.includes("esta pagina") ||
    t.includes("esta página");

  // ✅ HOME: comparar candidatos / planes
  const wantsCompare =
    t.includes("compar") ||
    t.includes("vs") ||
    t.includes("versus") ||
    (t.includes("difer") &&
      (t.includes("candidato") ||
        t.includes("plan") ||
        t.includes("propuesta")));

  // ✅ HOME: cómo votar / dónde voto
  const wantsHowToVote =
    t.includes("como votar") ||
    t.includes("cómo votar") ||
    t.includes("donde voto") ||
    t.includes("dónde voto") ||
    t.includes("mi local") ||
    t.includes("local de vot") ||
    t.includes("miembro de mesa") ||
    t.includes("multa");

  // ✅ HOME: búsqueda de candidatos / quién es
  const wantsCandidateSearch =
    t.includes("buscar candidato") ||
    t.includes("busco candidato") ||
    (t.includes("buscar") &&
      (t.includes("candidato") || t.includes("nombre"))) ||
    t.includes("quien es") ||
    t.includes("quién es") ||
    t.includes("quien postula") ||
    t.includes("quién postula");

  // ✅ HOME: navegación por tarjetas
  const wantsNavigateHomeCards =
    t.includes("servicios") ||
    t.includes("reflex") ||
    t.includes("cambio con valent") ||
    t.includes("peru federal") ||
    t.includes("perú federal");

  return {
    t,
    wantsHV,
    wantsPLAN,
    wantsNEWS,
    wantsREFLEXION,
    wantsCIUDADANO,
    wantsCAMBIO,
    asksPartyDetails,
    wantsHOMEHELP,
    wantsCompare,
    wantsHowToVote,
    wantsCandidateSearch,
    wantsNavigateHomeCards,
  };
}
function buildRedirectMessage(ctx: PageCtx, rawQ: string) {
  const i = detectIntent(rawQ);

  // ✅ HOME: nunca redirigir con mensaje genérico
  if (ctx === "HOME") {
    // Si es ayuda de inicio, lo maneja HOME local
    if (
      i.wantsHOMEHELP ||
      i.wantsCandidateSearch ||
      i.wantsCompare ||
      i.wantsHowToVote ||
      i.wantsNavigateHomeCards
    ) {
      return null;
    }

    // HOME fallback guiado (NUNCA Google)
    return (
      "Puedo ayudarte dentro de VotoClaro.\n\n" +
      "Opciones disponibles:\n" +
      "1) Buscar candidatos y abrir su ficha (HV, Plan, Actuar político).\n" +
      "2) Servicios al ciudadano: local de votación, miembro de mesa, multas.\n" +
      "3) Reflexionar antes de votar: preguntas por economía, salud, educación y seguridad.\n" +
      "4) Un cambio con valentía: acceso a propuesta oficial.\n\n" +
      "Dime qué opción te interesa o escribe, por ejemplo:\n" +
      "“buscar candidato”, “dónde voto”, “reflexión sobre salud”, “plan de gobierno”."
    );
  }

  // ===== resto de pantallas =====

  if (i.wantsCAMBIO || i.asksPartyDetails) {
    if (ctx === "CAMBIO") {
      return (
        "Para información detallada del partido o su propuesta oficial, lo mejor es visitar su web.\n\n" +
        "👉 Abre el sitio oficial: https://perufederal.pe/\n\n" +
        "Aquí en VotoClaro solo mostramos esta ventana como acceso rápido."
      );
    }
    return (
      "Ese tema corresponde a “UN CAMBIO CON VALENTÍA”.\n\n" +
      "👉 Ve a: /cambio-con-valentia\n\n" +
      "Ahí encontrarás el enlace oficial para conocer la propuesta."
    );
  }

  if (i.wantsHV || i.wantsPLAN || i.wantsNEWS) {
    if (ctx === "CANDIDATE") {
      if (i.wantsHV) return "Esto es de Hoja de Vida. Cambia a la pestaña HV y pregúntame ahí.";
      if (i.wantsPLAN) return "Esto es del Plan. Cambia a la pestaña Plan y pregúntame ahí.";
      if (i.wantsNEWS) return "Esto es de Actuar político. Cambia a la pestaña Actuar político y pregúntame ahí.";
    }

    const which = i.wantsHV ? "Hoja de Vida (HV)" : i.wantsPLAN ? "Plan (PLAN)" : "Actuar político (NEWS)";
    return (
      `Eso corresponde a la ficha del candidato (${which}).\n\n` +
      "👉 Ve al inicio (/), busca el candidato y entra a su ficha.\n" +
      "Luego elige la pestaña HV / Plan / Actuar político y me preguntas ahí."
    );
  }

  if (i.wantsREFLEXION) {
    if (ctx === "REFLEXION") return null;
    return (
      "Eso corresponde a “Reflexionar antes de votar”.\n\n" +
      "👉 Ve a: /reflexion\n\n" +
      "Ahí puedo leerte preguntas y reflexiones sin inventar."
    );
  }

  if (i.wantsCIUDADANO || i.wantsHowToVote) {
    if (ctx === "CIUDADANO") return null;
    return (
      "Eso corresponde a “Servicios al ciudadano”.\n\n" +
      "👉 Ve a: /ciudadano/servicio\n\n" +
      "Ahí te guío por los enlaces oficiales (JNE, ONPE, RENIEC)."
    );
  }

  // fallback fuera de HOME (controlado)
  return (
    "No puedo responder eso desde esta pantalla.\n\n" +
    "Muévete a una de estas secciones:\n" +
    "- Inicio: búsqueda de candidatos\n" +
    "- Servicios al ciudadano\n" +
    "- Reflexión antes de votar\n" +
    "- Un cambio con valentía"
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

  if (hasProfanity(rawQ)) {
    const msg =
      "Este espacio es para informarse con respeto.\n\n" +
      "Si deseas continuar, reformula tu pregunta sin insultos. " +
      "Si vas a seguir con groserías, te recomiendo retirarte de la app.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return { handled: true };
  }

  const ctx = getPageCtx(pathname);
  const redirect = buildRedirectMessage(ctx, rawQ);

  // ✅ null => estás en pantalla correcta / o HOME help => NO interceptar
  if (redirect === null) return { handled: false };

  if (ctx === "CANDIDATE") {
    const i = detectIntent(rawQ);
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

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
    const anyKnown =
      i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsREFLEXION || i.wantsCIUDADANO || i.wantsCAMBIO || i.asksPartyDetails || i.wantsHOMEHELP;

    // ✅ Si es HOMEHELP: no interceptamos (lo maneja HOME local abajo)
    if (ctx === "HOME" && i.wantsHOMEHELP) return { handled: false };

    if (!anyKnown) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }

    pushAssistant(redirect);
    await maybeSpeak(redirect);
    return { handled: true };
  }

  return { handled: false };
}

export default function FederalitoAssistantPanel() {
  const pathname = usePathname();
  const isPitchPage = String(pathname || "").startsWith("/pitch");

  // ✅ Evita mismatch SSR/cliente (hydration)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ✅ Al cambiar de ventana, cortar cualquier narración en curso
  useEffect(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }, [pathname]);

  useEffect(() => {
    if (!mounted) return;

    // Preferencias (voz/idioma/modo)
    try {
      const vm = localStorage.getItem(LS_VOICE_MODE) as VoiceMode | null;
      if (vm === "ON" || vm === "OFF") setVoiceMode(vm);

      const vl = localStorage.getItem(LS_VOICE_LANG) as VoiceLang | null;
      if (vl === "es-PE" || vl === "qu") setVoiceLang(vl);

      const am = localStorage.getItem(LS_ASK_MODE) as AskMode | null;
      if (am === "HV" || am === "PLAN" || am === "NEWS") setAskMode(am);
    } catch {}
    hydratedPrefsRef.current = true;

    // Memoria corta
    try {
      setMem(safeLoadMem());
    } catch {
      setMem({});
    }
    hydratedMemRef.current = true;
  }, [mounted]);

  const [searchParams, setSearchParams] = useState<URLSearchParams>(new URLSearchParams());

  useEffect(() => {
    try {
      setSearchParams(new URLSearchParams(window.location.search));
    } catch {
      setSearchParams(new URLSearchParams());
    }
  }, [pathname]);

  const compareCandidateId = useMemo(() => getCompareIdFromSearchParams(searchParams), [searchParams]);

  const isCiudadanoServicioPage = String(pathname || "").startsWith("/ciudadano/servicio");
  const isCambioConValentiaPage = String(pathname || "").startsWith(CAMBIO_PAGE_ROUTE);

  const [refAxisId, setRefAxisId] = useState<string | null>(null);
  const [refWaitingNumber, setRefWaitingNumber] = useState(false);

  const [open, setOpen] = useState(false);

  // ✅ Panel flotante (draggable)
  const panelRef = useRef<HTMLDivElement | null>(null);
  const hydratedPrefsRef = useRef(false);
  const hydratedMemRef = useRef(false);
  const hydratedPanelPosRef = useRef(false);
  const hydratedFabPosRef = useRef(false);

  const [pos, setPos] = useState<PanelPos>({ x: 16, y: 16 });

  // ✅ FAB movible (draggable)
  const fabRef = useRef<HTMLDivElement | null>(null);
  // ✅ FAB: márgenes seguros para no tapar contenido (barra inferior / safe area)
  const FAB_EDGE_PAD = 12;
  const FAB_BOTTOM_GUTTER = 88; // espacio extra para no tapar texto/barras inferiores

  const [fabPos, setFabPos] = useState<PanelPos>({ x: 16, y: 16 });

  const fabDragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  }>({
    dragging: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  });

  function clampFabPos(p: PanelPos): PanelPos {
    if (typeof window === "undefined") return p;

    const el = fabRef.current;
    const w = el?.offsetWidth ?? 170;
    const h = el?.offsetHeight ?? 56;

    const padX = FAB_EDGE_PAD;
    const padTop = FAB_EDGE_PAD;
    const padBottom = FAB_EDGE_PAD + FAB_BOTTOM_GUTTER;

    const maxX = Math.max(padX, window.innerWidth - w - padX);
    const maxY = Math.max(padTop, window.innerHeight - h - padBottom);

    return {
      x: Math.min(Math.max(p.x, padX), maxX),
      y: Math.min(Math.max(p.y, padTop), maxY),
    };
  }

  function defaultFabBottomRight(): PanelPos {
    if (typeof window === "undefined") return { x: 16, y: 16 };

    const el = fabRef.current;
    const w = el?.offsetWidth ?? 170;
    const h = el?.offsetHeight ?? 56;

    const pad = FAB_EDGE_PAD;
    const bottomPad = FAB_EDGE_PAD + FAB_BOTTOM_GUTTER;

    return clampFabPos({
      x: window.innerWidth - w - pad,
      y: window.innerHeight - h - bottomPad,
    });
  }

  function onFabPointerDown(e: React.PointerEvent) {
    if ((e as any).button != null && (e as any).button !== 0) return;

    // NO activar drag aquí (para no matar el click)
    fabDragRef.current.dragging = false;
    fabDragRef.current.moved = false;
    fabDragRef.current.pointerId = e.pointerId;
    fabDragRef.current.startX = e.clientX;
    fabDragRef.current.startY = e.clientY;
    fabDragRef.current.startPosX = fabPos.x;
    fabDragRef.current.startPosY = fabPos.y;

    // ❌ NO setPointerCapture (esto rompía clicks en algunos casos)
  }

  function onFabPointerMove(e: React.PointerEvent) {
    if (fabDragRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - fabDragRef.current.startX;
    const dy = e.clientY - fabDragRef.current.startY;

    // threshold para distinguir click vs drag
    if (!fabDragRef.current.moved && Math.abs(dx) + Math.abs(dy) > 6) {
      fabDragRef.current.moved = true;
      fabDragRef.current.dragging = true;
    }

    if (!fabDragRef.current.dragging) return;

    setFabPos(
      clampFabPos({
        x: fabDragRef.current.startPosX + dx,
        y: fabDragRef.current.startPosY + dy,
      })
    );
  }

  function onFabPointerUp(e: React.PointerEvent) {
    if (fabDragRef.current.pointerId !== e.pointerId) return;

    const wasMoved = fabDragRef.current.moved;

    fabDragRef.current.dragging = false;
    fabDragRef.current.moved = false;
    fabDragRef.current.pointerId = null;

    // ✅ si NO se movió, esto fue un click real => toggle aquí (100% confiable)
    if (!wasMoved) {
      setOpen((v) => !v);
    }
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ASSIST_FAB_POS);

      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setFabPos(clampFabPos(parsed));
        } else {
          setFabPos(defaultFabBottomRight());
        }
      } else {
        setFabPos(defaultFabBottomRight());
      }
    } catch {
      setFabPos(defaultFabBottomRight());
    }

    const onResize = () => {
      setFabPos((p) => clampFabPos(p));
      setPos((p) => clampPos(p));
    };
    hydratedFabPosRef.current = true;

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedFabPosRef.current) return;

    try {
      localStorage.setItem(LS_ASSIST_FAB_POS, JSON.stringify(fabPos));
    } catch {}
  }, [mounted, fabPos]);

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
      y: window.innerHeight - h - (pad + 80),
    });
  }

  useEffect(() => {
    if (!mounted) return;

    try {
      const raw = localStorage.getItem(LS_ASSIST_POS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setPos(clampPos(parsed));
        } else {
          setPos(defaultBottomRight());
        }
      } else {
        setPos(defaultBottomRight());
      }
    } catch {
      setPos(defaultBottomRight());
    }

    hydratedPanelPosRef.current = true;

    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedPanelPosRef.current) return;

    try {
      localStorage.setItem(LS_ASSIST_POS, JSON.stringify(pos));
    } catch {}
  }, [mounted, pos]);

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

  function rectsOverlap(a: DOMRect, b: DOMRect) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function pickFabCornerAwayFromPanel(panelRect: DOMRect): PanelPos {
    const el = fabRef.current;
    const w = el?.offsetWidth ?? 170;
    const h = el?.offsetHeight ?? 56;

    const pad = FAB_EDGE_PAD;
    const bottomPad = FAB_EDGE_PAD + FAB_BOTTOM_GUTTER;

    // 4 esquinas candidatas (todas pasan por clamp)
    const corners: PanelPos[] = [
      { x: pad, y: pad }, // top-left
      { x: window.innerWidth - w - pad, y: pad }, // top-right
      { x: pad, y: window.innerHeight - h - bottomPad }, // bottom-left
      { x: window.innerWidth - w - pad, y: window.innerHeight - h - bottomPad }, // bottom-right
    ].map(clampFabPos);

    const pcx = panelRect.left + panelRect.width / 2;
    const pcy = panelRect.top + panelRect.height / 2;

    // elegimos la esquina más lejos del centro del panel
    let best = corners[0];
    let bestD = -1;

    for (const c of corners) {
      const fx = c.x + w / 2;
      const fy = c.y + h / 2;
      const dx = fx - pcx;
      const dy = fy - pcy;
      const d2 = dx * dx + dy * dy;
      if (d2 > bestD) {
        bestD = d2;
        best = c;
      }
    }

    return best;
  }

  function resetAssistantChat() {
    try {
      window.speechSynthesis?.cancel();
    } catch {}

    try {
      recognitionRef.current?.stop?.();
    } catch {}
    setListening(false);

    setBusy(false);
    setMsgs([
      {
        role: "system",
        content:
          "Hola, soy Federalito AI. Puedo ayudarte a usar la app y responder preguntas según la pestaña actual: Hoja de vida, Plan de gobierno o Actuar político.",
      },
    ]);
    setDraft("");

    setMem({});
    try {
      localStorage.removeItem(LS_ASSIST_MEM);
    } catch {}
    setRefAxisId(null);
    setRefWaitingNumber(false);
  }

  const [voiceMode, setVoiceMode] = useState<VoiceMode>("OFF");
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("es-PE");
  const [askMode, setAskMode] = useState<AskMode>("HV");
  const [mem, setMem] = useState<MemoryState>({});
  const [userInteracted, setUserInteracted] = useState(false);
  const pendingGuideSpeakRef = useRef<string | null>(null);

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

  const [candidateId, setCandidateId] = useState<string>("");
  const [candidateName, setCandidateName] = useState<string>("");

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedPrefsRef.current) return;

    try {
      localStorage.setItem(LS_VOICE_MODE, voiceMode);
      localStorage.setItem(LS_VOICE_LANG, voiceLang);
      localStorage.setItem(LS_ASK_MODE, askMode);
    } catch {}
  }, [mounted, voiceMode, voiceLang, askMode]);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedMemRef.current) return;
    safeSaveMem(mem);
  }, [mounted, mem]);

  useEffect(() => {
    try {
      const already = sessionStorage.getItem("votoclaro_user_interacted_v1") === "1";
      if (already) setUserInteracted(true);
    } catch {}

    function mark() {
      setUserInteracted(true);
      try {
        sessionStorage.setItem("votoclaro_user_interacted_v1", "1");
      } catch {}
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

  useEffect(() => {
    const tab = String(searchParams?.get("tab") || "").toUpperCase();
    if (tab === "PLAN") setAskMode("PLAN");
    else if (tab === "NEWS") setAskMode("NEWS");
    else if (tab === "HV") setAskMode("HV");
  }, [searchParams]);

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

// ✅ Listener primero (para no perder eventos)
useEffect(() => {
  async function onGuide(ev: Event) {
    const e = ev as CustomEvent<GuideEventDetail>;
    const action = e.detail?.action ?? "SAY";
    const text = (e.detail?.text ?? "").trim();
    const speak = !!e.detail?.speak;

    // ✅ Manejar acciones correctamente
    if (action === "OPEN" || action === "SAY_AND_OPEN") setOpen(true);
    if (action === "CLOSE") setOpen(false);

    // ✅ Siempre mostrar el texto en el chat si llegó texto
    if (text) setMsgs((prev) => [...prev, { role: "assistant", content: text }]);

    // ✅ Si no hay que hablar, terminamos aquí
    if (!text || !speak) return;

    // ✅ Si la voz está OFF, guardamos el texto para decirlo luego
    if (voiceMode !== "ON") {
      pendingGuideSpeakRef.current = text;
      setMsgs((prev) => [
        ...prev,
        { role: "assistant", content: "Tip: activa “Voz: ON” para que pueda hablar en voz alta." },
      ]);
      return;
    }

    // ✅ Si aún no hay interacción, guardamos el texto para decirlo luego
    if (!userInteracted) {
      pendingGuideSpeakRef.current = text;
      setMsgs((prev) => [
        ...prev,
        { role: "assistant", content: "Tip: toca la pantalla una vez para que pueda hablar en voz alta." },
      ]);
      return;
    }

    // ✅ Si todo está listo, hablamos ahora
    await speakText(text, voiceLang);
    pendingGuideSpeakRef.current = null;
  }

  window.addEventListener("votoclaro:guide", onGuide as any);
  return () => window.removeEventListener("votoclaro:guide", onGuide as any);
}, [voiceMode, voiceLang, userInteracted]);
// ✅ Si había un mensaje pendiente, hablar apenas sea posible
useEffect(() => {
  async function flushPending() {
    const pending = pendingGuideSpeakRef.current;
    if (!pending) return;
    if (voiceMode !== "ON") return;
    if (!userInteracted) return;

    pendingGuideSpeakRef.current = null;
    await speakText(pending, voiceLang);
  }

  flushPending();
}, [voiceMode, voiceLang, userInteracted, voiceLang]);

  // ✅ MENSAJE AUTOMÁTICO AL ENTRAR A CADA VENTANA (sin abrir panel)
  useEffect(() => {
    try {
      const key = `votoclaro_autoguide_seen:${String(pathname || "")}`;
      const seen = sessionStorage.getItem(key) === "1";
      if (seen) return;
      sessionStorage.setItem(key, "1");
    } catch {}

    let text = "";

    if (pathname === "/") {
      text =
        "Esta es la pantalla de inicio de VotoClaro. " +
        "Aquí puedes buscar candidatos, aprender cómo usar la app y acceder a servicios al ciudadano, reflexión electoral y otras secciones. " +
        "Empieza buscando un candidato por su nombre.";
    } else if (pathname.startsWith("/ciudadano/servicio") || pathname.startsWith("/ciudadano/servicios")) {
      text =
        "Estás en Servicios al ciudadano. " +
        "Aquí encontrarás enlaces oficiales para consultar local de votación, miembro de mesa, multas y otros trámites electorales.";
    } else if (pathname.startsWith("/reflexion")) {
      text =
        "Estás en Reflexionar antes de votar. " +
        "Aquí puedes explorar preguntas y reflexiones por ejes como economía, salud, educación y seguridad.";
    } else if (pathname.startsWith("/cambio-con-valentia")) {
      text =
        "Estás en Un cambio con valentía. " +
        "Esta ventana muestra una propuesta política y te dirige a su sitio oficial para más información.";
    }

    if (text) {
      // ✅ Delay mínimo: garantiza que el listener ya existe
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("votoclaro:guide", {
            detail: { action: "SAY", text, speak: true },
          })
        );
      }, 0);
    }
  }, [pathname]);

  useEffect(() => {
    function onPageRead(ev: Event) {
      const e = ev as CustomEvent<{ text?: string }>;
      const txt = String(e.detail?.text ?? "").trim();
      if (!txt) return;

      setPageReadText(txt);
      setPageReadAt(Date.now());

      setMsgs((prev) => [...prev, { role: "assistant", content: "📄 Listo: tengo una comparación en pantalla para leer con 🔊 Leer." }]);
    }

    window.addEventListener("votoclaro:page-read", onPageRead as any);
    return () => window.removeEventListener("votoclaro:page-read", onPageRead as any);
  }, []);
  useEffect(() => {
    if (!open) return;

    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;

    // foco al input al abrir
    const raf = requestAnimationFrame(() => {
      try {
        inputRef.current?.focus?.();
      } catch {}
    });

    return () => cancelAnimationFrame(raf);
  }, [open, msgs]);

  useEffect(() => {
    if (!mounted) return;
    if (!open) return;

    const raf = requestAnimationFrame(() => {
      const fabEl = fabRef.current;
      const panelEl = panelRef.current;
      if (!fabEl || !panelEl) return;

      const fabRect = fabEl.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();

      if (!rectsOverlap(fabRect, panelRect)) return;

      const next = pickFabCornerAwayFromPanel(panelRect);

      setFabPos((prev) => {
        // evita loops: solo cambia si realmente cambia
        if (Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1) return prev;
        return next;
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [mounted, open, pos]);

  function pushAssistant(text: string) {
    setMsgs((prev) => [...prev, { role: "assistant", content: text }]);
  }

  async function maybeSpeak(text: string) {
    if (voiceMode !== "ON") {
      pushAssistant("Tip: activa “Voz: ON” para que pueda leerte el contenido con 🔊 (solo necesitas hacerlo una vez).");
      return;
    }

    if (!userInteracted) {
      pushAssistant("Tip: toca cualquier parte de la pantalla y vuelve a intentar (bloqueo de audio del navegador).");
      return;
    }
    await speakTextChunked(text, voiceLang);

    const r = { ok: true, usedLang: voiceLang === "qu" ? "qu" : ("es-PE" as any) };
    if (voiceLang === "qu" && (r as any).usedLang === "fallback-es") {
      pushAssistant("Nota: no detecté voz Quechua en este dispositivo. Estoy leyendo en Español (Perú) como respaldo.");
    }
  }

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

  function matchRefAxisId(input: string): string | null {
    const t = normalizeLite(input);

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

    for (const [re, id] of rules) if (re.test(t)) return id;
    return null;
  }

  function parseQuestionNumber(input: string): number | null {
    const t = normalizeLite(input);
    const m = t.match(/(?:pregunta|p)?\s*(\d)\b/);
    if (!m) return null;

    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
    return null;
  }

  async function handleReflexion(rawQ: string) {
    const q = (rawQ || "").trim();
    if (!q) return;

    const onlyNumber = q.match(/^\s*[1-5]\s*$/) ? Number(q.trim()) : null;

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
        (item.followups?.length ? `\n\nPara seguir reflexionando:\n- ${item.followups.join("\n- ")}` : "");

      pushAssistant(out);
      await maybeSpeak(out);

      setRefWaitingNumber(false);
      return;
    }

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
          (item.followups?.length ? `\n\nPara seguir reflexionando:\n- ${item.followups.join("\n- ")}` : "");

        pushAssistant(out);
        await maybeSpeak(out);
        setRefWaitingNumber(false);
        return;
      }

      const list = axis.questions
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

    if (nFromText && refAxisId) {
      setRefWaitingNumber(true);
      await handleReflexion(String(nFromText));
      return;
    }

    const help =
      "Estoy en Reflexionar antes de votar.\n" +
      "Puedes decir por ejemplo:\n" +
      "- “educación” (te muestro las 5 preguntas)\n" +
      "- “educación pregunta 5” (te leo directo)\n" +
      "- o si ya te mostré el eje: solo di “1”, “2”, “3”, “4” o “5”.";
    pushAssistant(help);
    await maybeSpeak(help);
  }

  // ✅ Guía local HOME (para preguntas genéricas en inicio)
  function answerFromHomeGeneric(rawQ: string) {
    const t = normalizeLite(rawQ);
    const i = detectIntent(rawQ);

    // 1) Ayuda general en inicio (“qué hago aquí”)
    if (i.wantsHOMEHELP) {
      return (
        "Estás en la pantalla de inicio.\n\n" +
        "Aquí puedes:\n" +
        "1) Buscar candidatos: escribe al menos 2 letras en “Buscar candidato”.\n" +
        "2) Abrir la ficha del candidato y revisar HV, Plan y Actuar político.\n" +
        "3) Entrar a accesos rápidos: Servicios al ciudadano, Reflexión y Un cambio con valentía.\n\n" +
        "Tip: escribe un apellido (por ejemplo: “Acuña”, “López Aliaga”, “Keiko”) y abre la ficha."
      );
    }

    // 2) Quiere comparar (orientación: primero entra a fichas + PLAN)
    if (i.wantsCompare) {
      return (
        "Para comparar propuestas entre candidatos:\n\n" +
        "1) Busca un candidato y entra a su ficha.\n" +
        "2) Cambia a la pestaña “Plan”.\n" +
        "3) Si tienes opción de comparar, elige el segundo candidato.\n" +
        "4) Luego pregúntame: “compara seguridad”, “compara economía”, etc.\n\n" +
        "Si me dices los 2 nombres, te digo cómo encontrarlos rápido en la lista."
      );
    }

    // 3) Preguntas típicas de “cómo voto / dónde voto / multas” => redirige a Servicios
    if (i.wantsHowToVote) {
      return (
        "Eso se resuelve en “Servicios al ciudadano”.\n\n" +
        "👉 Ve a: /ciudadano/servicio\n\n" +
        "Ahí tienes enlaces oficiales (JNE, ONPE, RENIEC) para:\n" +
        "- local de votación\n" +
        "- miembro de mesa\n" +
        "- multas electorales\n" +
        "- trámites y consultas"
      );
    }

    // 4) Navegación rápida por tarjetas de inicio
    if (i.wantsNavigateHomeCards) {
      return (
        "Desde inicio puedes entrar a:\n\n" +
        "👉 /ciudadano/servicio  (local de votación, multas, miembro de mesa)\n" +
        "👉 /reflexion  (preguntas por ejes: economía, salud, educación, seguridad)\n" +
        "👉 /cambio-con-valentia  (acceso a web oficial de la propuesta)\n\n" +
        "Dime cuál quieres abrir y te digo qué encontrarás allí."
      );
    }

    // 5) Quiere buscar candidato / “quién es X” => instrucciones claras sin inventar
    if (i.wantsCandidateSearch || t.includes("candidato") || t.includes("nombre") || t.includes("buscar")) {
      return (
        "Para buscar un candidato:\n" +
        "- Escribe al menos 2 letras en el cuadro “Buscar candidato”.\n" +
        "- Luego haz clic en el resultado para abrir la ficha.\n\n" +
        "Dentro de la ficha puedes preguntar por:\n" +
        "- HV (Hoja de Vida)\n" +
        "- Plan de Gobierno\n" +
        "- Actuar político\n\n" +
        "Si me dices el nombre o apellido que buscas, te indico cómo escribirlo para encontrarlo más rápido."
      );
    }

    // fallback (pero útil)
    return (
      "En inicio puedes buscar candidatos y abrir sus fichas.\n\n" +
      "Si me dices:\n" +
      "- “cómo busco un candidato”\n" +
      "- “quiero ver el plan”\n" +
      "- “dónde voto / multas / miembro de mesa”\n" +
      "te guío al lugar correcto."
    );
  }

  async function askBackend(question: string) {
    const rawQ = (question || "").trim();
    if (!rawQ) return;

    const gate = await handleGlobalPolicyAndRedirect({
      pathname: String(pathname || ""),
      rawQ,
      candidateId,
      askMode,
      pushAssistant,
      maybeSpeak,
    });
    if (gate.handled) return;

    const isReflexionPage = String(pathname || "").startsWith("/reflexion");
    if (isReflexionPage) {
      await handleReflexion(rawQ);
      return;
    }

    if (isCambioConValentiaPage) {
      await handleCambioConValentia(rawQ, maybeSpeak, pushAssistant);
      return;
    }

    if (isCiudadanoServicioPage) {
      await handleCiudadanoServicio(rawQ, maybeSpeak, pushAssistant);
      return;
    }

    // ✅ HOME: responder preguntas genéricas sin exigir candidato
    if ((pathname === "/" || String(pathname || "").startsWith("/#")) && !candidateId) {
      const out = answerFromHomeGeneric(rawQ);
      pushAssistant(out);
      await maybeSpeak(out);
      return;
    }

    if (!candidateId) {
      const msg =
        "Primero abre la ficha de un candidato.\n\n" +
        "Cómo hacerlo:\n" +
        "1) Ve al inicio.\n" +
        "2) Escribe el nombre o apellido del candidato.\n" +
        "3) Haz clic en el resultado para entrar a su ficha.\n\n" +
        "Luego podrás preguntarme por:\n" +
        "- Hoja de Vida (HV)\n" +
        "- Plan de Gobierno\n" +
        "- Actuar político";

      pushAssistant(msg);
      await maybeSpeak(msg);
      return;
    }

    const cname = (candidateName || slugToName(candidateId)).trim();
    const enrichedQ = buildContextualQuestion(rawQ, mem, cname, askMode);

    setBusy(true);
    try {
      if (askMode === "HV" || askMode === "PLAN") {
        const doc = askMode === "HV" ? "hv" : "plan";

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

        if (wantsCompare) {
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
        const ansRaw = String(data?.answer ?? "No hay evidencia suficiente en las fuentes consultadas.").trim();
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
    if (!t || t.length < 2 || busy) return;

    setMsgs((prev) => [...prev, { role: "user", content: t }]);
    setDraft("");
    askBackend(t);
  }

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
            ? "No tengo permiso para usar el micrófono. Actívalo en el navegador y vuelve a intentar."
            : "No pude usar el micrófono. Revisa permisos o prueba otro navegador.";
        pushAssistant(msg);
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
        const q = (finalText || draft || "").trim();

        // evita enviar ruido muy corto
        if (!q || q.length < 3) return;

        setMsgs((prev) => [...prev, { role: "user", content: q }]);
        setDraft("");
        askBackend(q);
      };

      setListening(true);
      rec.start();
    } catch {
      pushAssistant("No pude iniciar el micrófono. Revisa permisos del navegador.");
      setListening(false);
    }
  }

  async function speakLastAssistant() {
    // prioridad: comparación/lectura de pantalla reciente
    const hasPageRead = pageReadText && Date.now() - pageReadAt < 5 * 60 * 1000;

    const target = hasPageRead
      ? pageReadText
      : [...msgs].reverse().find((m) => m.role === "assistant")?.content ?? "";

    if (!target) return;

    if (voiceMode !== "ON") setVoiceMode("ON");
    await maybeSpeak(target);
  }

  const fabLabel = useMemo(() => (open ? "Cerrar Federalito AI" : "Abrir Federalito AI"), [open]);
  const modeLabel = askMode === "HV" ? "HV" : askMode === "PLAN" ? "Plan" : "Actuar político";

  return (
    <>
      {/* ✅ FAB MOVIBLE */}
      {!isPitchPage && (
        <div
          ref={fabRef}
          className="fixed z-[60] touch-none"
          style={
            mounted
              ? { left: fabPos.x, top: fabPos.y }
              : { right: 16, bottom: 16, left: "auto", top: "auto" }
          }
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
        >
          <button
            type="button"
            className={[
              "flex items-center gap-2 rounded-full border bg-white",
              "shadow-lg px-3 py-2",
              "hover:shadow-xl active:scale-[0.98] transition",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-200",
              "hover:-translate-y-[2px]",
              "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
              "select-none",
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

            <span
              data-no-drag="1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Si tu archivo original tenía safeResetFabPos(), se mantiene en tu base.
                // Si NO existe, comenta esta línea.
                // @ts-ignore
                safeResetFabPos();
              }}
              className="ml-2 text-[11px] font-extrabold text-slate-600 hover:text-slate-900 cursor-pointer"
              title="Reiniciar posición del botón"
            >
              ↺
            </span>
          </button>
        </div>
      )}

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

                <button
                  type="button"
                  onClick={speakLastAssistant}
                  className="ml-auto rounded-full px-3 py-1 text-[12px] font-extrabold border bg-black text-white hover:opacity-90 active:scale-[0.98] transition motion-reduce:transition-none motion-reduce:active:scale-100"
                  title="Leer último mensaje"
                >
                  🔊 Leer
                </button>

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
                Memoria corta:{" "}
                {mem?.lastUpdatedAt ? `ON (última: ${new Date(mem.lastUpdatedAt).toLocaleString()})` : "OFF"}
              </div>
            </div>

            {/* Body */}
            <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-3 bg-gradient-to-b from-green-50 via-white to-white">
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={[
                    "text-[14px] leading-[20px] whitespace-pre-wrap rounded-2xl px-4 py-3 border shadow-sm",
                    m.role === "user" ? "ml-10 bg-green-700 text-white border-green-800" : "mr-10 bg-white text-slate-900 border-slate-200",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              ))}

              {busy ? (
                <div className="mr-10 bg-green-50 border border-green-200 rounded-2xl px-3 py-2 text-[13px]">
                  Procesando respuesta…
                </div>
              ) : null}
            </div>

            {/* Composer */}
            <div className="p-3 border-t bg-white sticky bottom-0">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
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

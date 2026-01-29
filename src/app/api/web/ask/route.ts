// src/app/api/web/ask/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { isAllowedUrl, getDomain } from "@/lib/votoclaro/webAllowlist";

type WebMode = "strict" | "summary";

type WebSource = {
  title: string;
  url: string;
  domain: string;
  snippet?: string; // puede guardar fecha/seenDate
  extracted?: string; // texto plano extraído
};

type WebAskCitation = { source: number; url: string; quote: string };

const NO_EVIDENCE = "No hay evidencia suficiente en las fuentes consultadas";

// DEBUG controlado
const VC_WEB_DEBUG = process.env.VC_WEB_DEBUG === "1";
function vcDebug(...args: any[]) {
  if (VC_WEB_DEBUG) console.log("[VotoClaro][web/ask]", ...args);
}

// 🔓 MODO ABIERTO (SIN RESTRICCIONES) POR DEFECTO
// - Si quieres volver a allowlist: pon VC_WEB_OPEN=0 en .env.local
const VC_WEB_OPEN = process.env.VC_WEB_OPEN !== "0";
function isSearchAllowedUrl(url: string) {
  if (VC_WEB_OPEN) return true;
  return isAllowedUrl(url);
}

// ⏱ Helper para evitar rate limit (GDELT suele pedir 1 request cada ~5s si lo spameas)
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function cleanText(s: string) {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html: string) {
  const noScripts = (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = noScripts.replace(/<[^>]+>/g, " ");
  return cleanText(
    noTags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

/**
 * Guardrails:
 * - Bloquea vida privada (familia / sexual).
 */
function isPrivacyBlocked(q: string) {
  const t = (q || "").toLowerCase();

  const sexual = [
    "sexual",
    "sexo",
    "intim",
    "amante",
    "infidel",
    "porn",
    "prostit",
    "orientación",
    "orientacion",
    "gay",
    "lesb",
    "bisex",
    "trans",
  ];

  const family = [
    "esposa",
    "esposo",
    "hijo",
    "hija",
    "familia",
    "novia",
    "novio",
    "pareja",
    "matrimonio",
    "divorcio",
  ];

  return sexual.some((k) => t.includes(k)) || family.some((k) => t.includes(k));
}

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function tokenize(s: string) {
  const t = norm(s)
    .replace(/[^a-z0-9ñáéíóúü\s]/gi, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const stop = new Set([
    "ultimas",
    "últimas",
    "noticias",
    "noticia",
    "reciente",
    "recientes",
    "hoy",
    "ayer",
    "semana",
    "mes",
    "peru",
    "perú",
    "lima",
    "candidato",
    "candidatos",
    "presidente",
    "presidencial",
    "controversia",
    "controversias",
    "denuncia",
    "denuncias",
    "acusacion",
    "acusación",
    "investigacion",
    "investigación",
    "actuar",
    "politico",
    "político",
  ]);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of t) {
    if (w.length < 4) continue;
    if (stop.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/**
 * Tokens tipo “nombre/apellido” inferidos del query
 */
function nameTokensFromQuery(q: string) {
  const raw = (q || "").trim();
  const candidatePart = raw.split(":")[0]?.trim() || raw;

  const t = norm(candidatePart)
    .replace(/[^a-zñáéíóúü\s]/gi, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const stop = new Set([
    "que",
    "qué",
    "hizo",
    "hace",
    "hara",
    "hará",
    "haran",
    "dijo",
    "dice",
    "decia",
    "decía",
    "opina",
    "opinion",
    "opinión",
    "sobre",
    "del",
    "de",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "en",
    "y",
    "o",
    "por",
    "para",
    "con",
    "sin",
    "actuar",
    "politico",
    "político",
    "noticias",
    "noticia",
    "rpp",
    "peru",
    "perú",
    "candidato",
    "candidatos",
    "presidente",
    "presidencial",
  ]);

  const cand: string[] = [];
  const seen = new Set<string>();

  for (const w of t) {
    if (w.length < 3) continue;
    if (stop.has(w)) continue;
    if (/\d/.test(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    cand.push(w);
  }

  if (cand.length >= 4) {
    const first = cand[0];
    const last2 = cand.slice(-2);
    return [first, ...last2];
  }

  if (cand.length === 3) return cand;
  return cand.slice(-2);
}

/**
 * Mejor búsqueda (para armar una query decente)
 */
function buildNewsSearchQuery(originalQ: string) {
  const qNorm = norm(originalQ);
  const names = nameTokensFromQuery(originalQ);
  const who = names.length ? names.join(" ") : originalQ.split(":")[0]?.trim() || originalQ;

  let kw = "noticia";
  if (qNorm.includes("controvers") || qNorm.includes("polémic") || qNorm.includes("polem")) kw = "controversia";
  if (qNorm.includes("investig") || qNorm.includes("proceso") || qNorm.includes("fiscal") || qNorm.includes("fiscalia")) {
    kw = "investigación fiscal fiscalía";
  }
  if (qNorm.includes("lavado") || qNorm.includes("odebrecht") || qNorm.includes("coctel") || qNorm.includes("cóctel")) {
    kw = "lavado de activos fiscalía";
  }
  if (qNorm.includes("sentenc") || qNorm.includes("conden")) kw = "sentencia";

  return `${who} ${kw}`.replace(/\s+/g, " ").trim();
}

/**
 * Variantes cortas para GDELT (general para cualquier candidato)
 */
function buildGdeltQueryVariants(originalQ: string): string[] {
  const names = nameTokensFromQuery(originalQ);
  const whoRaw = names.length ? names.join(" ") : (originalQ.split(":")[0]?.trim() || originalQ);

  const who = norm(cleanText(whoRaw))
    .replace(/[?¿!¡"]/g, " ")
    .replace(/[:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const qN = norm(originalQ);

  let kws: string[] = ["noticia"];
  if (qN.includes("investig") || qN.includes("proceso") || qN.includes("fiscal") || qN.includes("fiscalia")) {
    kws = ["investigacion", "fiscalia"];
  } else if (qN.includes("lavado") || qN.includes("odebrecht") || qN.includes("coctel")) {
    kws = ["lavado", "odebrecht"];
  } else if (qN.includes("sentenc") || qN.includes("conden")) {
    kws = ["sentencia"];
  } else if (qN.includes("controvers") || qN.includes("polem") || qN.includes("polémic")) {
    kws = ["controversia"];
  }

  const whoShort = who.split(/\s+/).slice(0, 2).join(" ").trim();

  const variants: string[] = [];
  if (who) variants.push(`"${who}"`);
  if (who && kws[0]) variants.push(`"${who}" ${kws[0]}`);
  if (who && kws.length >= 2) variants.push(`"${who}" ${kws[0]} ${kws[1]}`);
  if (whoShort && whoShort !== who) variants.push(`"${whoShort}"`);
  if (whoShort && kws[0]) variants.push(`"${whoShort}" ${kws[0]}`);

  const qLoose = norm(cleanText(originalQ))
    .replace(/[?¿!¡"]/g, " ")
    .replace(/[:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .trim();

  if (qLoose && qLoose !== who && qLoose !== whoShort) variants.push(qLoose);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of variants.map((x) => x.trim()).filter(Boolean)) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function countTokenHits(haystack: string, tokens: string[]) {
  const t = norm(haystack);
  let hits = 0;
  for (const tok of tokens) {
    if (!tok) continue;
    if (t.includes(tok)) hits++;
  }
  return hits;
}

function parseMode(input: any): WebMode {
  const m = String(input ?? "").trim().toLowerCase();
  if (m === "summary") return "summary";
  return "strict";
}

/** ---------------------------
 *  A) GOOGLE CSE (opcional)
 *  (si algún día lo habilitas, esto ya está “open web”)
 * --------------------------*/
async function cseSearch(
  q: string,
  num: number
): Promise<{ items: WebSource[]; cseBlocked: boolean; rawError?: string }> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!key || !cx) {
    return {
      items: [],
      cseBlocked: true,
      rawError: !key ? "Falta GOOGLE_CSE_API_KEY" : "Falta GOOGLE_CSE_CX",
    };
  }

  const endpoint =
    "https://www.googleapis.com/customsearch/v1" +
    `?key=${encodeURIComponent(key)}` +
    `&cx=${encodeURIComponent(cx)}` +
    `&q=${encodeURIComponent(q)}` +
    `&num=${encodeURIComponent(String(num))}`;

  const r = await fetch(endpoint);

  if (r.status === 403) {
    const detail = await r.text();
    return { items: [], cseBlocked: true, rawError: detail };
  }

  if (!r.ok) {
    const detail = await r.text();
    return { items: [], cseBlocked: true, rawError: `HTTP ${r.status}: ${detail}` };
  }

  const data = (await r.json()) as { items?: Array<{ title?: string; link?: string; snippet?: string }> };

  const items = (data.items ?? [])
    .map((x): WebSource | null => {
      const url = (x.link ?? "").trim();
      if (!url) return null;

      // 🔓 open web (sin allowlist)
      if (!isSearchAllowedUrl(url)) return null;

      return {
        title: (x.title ?? "").trim() || "Sin título",
        url,
        domain: getDomain(url),
        snippet: (x.snippet ?? "").trim() || "",
      };
    })
    .filter(Boolean) as WebSource[];

  return { items, cseBlocked: false };
}

/** ---------------------------
 *  A2) GDELT (SIN GOOGLE)
 *  OPEN WEB: no filtramos por allowlist en búsqueda
 * --------------------------*/
async function gdeltSearch(q: string, num: number): Promise<WebSource[]> {
  const max = Math.max(2, Math.min(10, Number(num ?? 4)));

  async function fetchGdelt(url: string) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (VotoClaroBot; +http://localhost)",
          Accept: "application/json,text/plain,*/*",
        },
        cache: "no-store",
      });

      vcDebug("[GDELT] status =", r.status);

      const txt = await r.text();
      if (!r.ok) {
        vcDebug("[GDELT] nonOK body (first 300) =", txt.slice(0, 300));
        return null;
      }

      try {
        return JSON.parse(txt);
      } catch {
        vcDebug("[GDELT] jsonParseError body (first 200) =", txt.slice(0, 200));
        return null;
      }
    } catch (e: any) {
      vcDebug("[GDELT] fetchError =", e?.message || e);
      return null;
    }
  }

  const queriesToTry = buildGdeltQueryVariants(q).slice(0, 3); // menos variantes = menos 429
  if (!queriesToTry.length) return [];

  const timespan = (process.env.VC_GDELT_TIMESPAN || "3m").trim();

  const out: WebSource[] = [];
  const seen = new Set<string>();

  for (const qq of queriesToTry) {
    const endpoint =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      `?query=${encodeURIComponent(qq)}` +
      `&mode=ArtList` +
      `&format=json` +
      `&maxrecords=${encodeURIComponent(String(max))}` +
      `&sort=datedesc` +
      (timespan ? `&timespan=${encodeURIComponent(timespan)}` : "");

    vcDebug("[GDELT] tryQuery =", qq);
    vcDebug("[GDELT] endpoint =", endpoint);

    const data = await fetchGdelt(endpoint);
    const articles = Array.isArray((data as any)?.articles) ? (data as any).articles : [];
    vcDebug("[GDELT] articles =", articles.length);

    for (const a of articles) {
      const url = String(a?.url ?? "").trim();
      const title = String(a?.title ?? "").trim();
      const seendate = String(a?.seendate ?? "").trim();

      if (!url || !title) continue;
      if (!isSearchAllowedUrl(url)) continue;

      const canonical = url.split("?")[0];
      if (seen.has(canonical)) continue;
      seen.add(canonical);

      out.push({
        title,
        url: canonical,
        domain: getDomain(canonical),
        snippet: seendate,
      });

      if (out.length >= max) break;
    }

    if (out.length >= max) break;

    // Evita rate limit si hay más variantes
    await sleep(1200);
  }

  vcDebug("[GDELT] accepted =", out.length);
  return out;
}

/** ---------------------------
 *  B) DIRECTO RPP (SIN GOOGLE)
 *  (ya es open por naturaleza, solo quitamos allowlist aquí también)
 * --------------------------*/
function safeDecodeHtmlEntities(s: string) {
  return (s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(s: string) {
  return cleanText(safeDecodeHtmlEntities(String(s || "").replace(/<[^>]+>/g, " ")));
}

function absoluteUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function extractRppFromNextData(html: string): Array<{ title: string; url: string }> {
  const m = (html || "").match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];

  const jsonText = (m[1] || "").trim();
  if (!jsonText) return [];

  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  const stack: any[] = [data];
  let guard = 0;

  while (stack.length && guard++ < 20000) {
    const node = stack.pop();
    if (!node) continue;

    if (Array.isArray(node)) {
      for (const it of node) stack.push(it);
      continue;
    }

    if (typeof node === "object") {
      const title =
        (typeof (node as any).title === "string" && (node as any).title) ||
        (typeof (node as any).headline === "string" && (node as any).headline) ||
        (typeof (node as any).name === "string" && (node as any).name) ||
        "";

      const url =
        (typeof (node as any).url === "string" && (node as any).url) ||
        (typeof (node as any).link === "string" && (node as any).link) ||
        (typeof (node as any).permalink === "string" && (node as any).permalink) ||
        "";

      if (title && url) {
        const key = `${title}||${url}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ title, url });
        }
      }

      for (const k of Object.keys(node)) stack.push((node as any)[k]);
    }
  }

  return out;
}

async function rppSearch(q: string, num: number): Promise<WebSource[]> {
  const base = "https://rpp.pe";
  const searchUrl = `${base}/buscar?q=${encodeURIComponent(q)}`;
  const max = Math.max(2, Math.min(6, Number(num ?? 4)));

  let html = "";
  let status = 0;

  try {
    const r = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (VotoClaroBot; +https://localhost)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    status = r.status;
    if (!r.ok) return [];
    html = await r.text();
  } catch {
    return [];
  }

  const qTokens = tokenize(q);
  const nameTokens = nameTokensFromQuery(q);
  const requireName = nameTokens.length > 0;

  const fromNext = extractRppFromNextData(html)
    .map((x) => {
      const url = absoluteUrl(base, x.url || "");
      return {
        title: stripTags(x.title || ""),
        url: url.split("?")[0],
      };
    })
    .filter((x) => x.title && x.title.length >= 10 && x.url.includes("rpp.pe/"))
    .filter((x) => {
      const titleNorm = norm(x.title);
      const urlNorm = norm(x.url);

      if (requireName) {
        const nameHits = countTokenHits(titleNorm + " " + urlNorm, nameTokens);
        return nameHits >= 1;
      } else {
        const hits = countTokenHits(titleNorm + " " + urlNorm, qTokens);
        return hits >= 2;
      }
    });

  if (fromNext.length) {
    const seen = new Set<string>();
    const out: WebSource[] = [];

    for (const it of fromNext) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);

      out.push({
        title: it.title,
        url: it.url,
        domain: getDomain(it.url),
        snippet: `rpp_status=${status}`,
      });

      if (out.length >= max) break;
    }

    return out;
  }

  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const candidates: Array<WebSource & { _score: number }> = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const hrefRaw = (m[1] || "").trim();
    if (!hrefRaw) continue;

    const url = absoluteUrl(base, hrefRaw).split("?")[0];
    if (!url.includes("rpp.pe/")) continue;

    const title = stripTags(m[2] || "");
    if (!title || title.length < 10) continue;

    if (seen.has(url)) continue;
    seen.add(url);

    const urlNorm = norm(url);
    const titleNorm = norm(title);

    if (requireName) {
      const nameHits = countTokenHits(titleNorm + " " + urlNorm, nameTokens);
      if (nameHits < 1) continue;
    } else {
      const hits = countTokenHits(titleNorm + " " + urlNorm, qTokens);
      if (hits < 2) continue;
    }

    let score = 0;
    score += countTokenHits(titleNorm, qTokens) * 4;
    score += countTokenHits(urlNorm, qTokens) * 2;
    if (requireName) score += countTokenHits(titleNorm + " " + urlNorm, nameTokens) * 6;

    candidates.push({
      title,
      url,
      domain: getDomain(url),
      snippet: `rpp_status=${status}`,
      _score: score,
    });

    if (candidates.length >= 120) break;
  }

  candidates.sort((a, b) => b._score - a._score);
  return candidates.slice(0, max).map(({ _score, ...s }) => s);
}

/** Extrae texto del HTML de la noticia */
async function fetchAndExtract(url: string, maxChars = 18000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);

  try {
    const r = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VotoClaroBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!r.ok) return "";

    const html = await r.text();
    const text = stripHtml(html);
    const out = text.length > maxChars ? text.slice(0, maxChars) : text;
    return cleanText(out);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

/**
 * Validación robusta de citas (STRICT)
 */
function validateCitations(sources: WebSource[], citations: any): WebAskCitation[] {
  if (!Array.isArray(citations)) return [];

  function softNorm(s: string) {
    return norm(String(s || ""))
      .replace(/[^a-z0-9ñáéíóúü\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const out: WebAskCitation[] = [];

  for (const c of citations) {
    const sourceNum = Number((c as any)?.source);
    const quoteRaw = String((c as any)?.quote ?? "").trim();
    const urlRaw = String((c as any)?.url ?? "").trim();

    if (!Number.isFinite(sourceNum)) continue;
    if (sourceNum < 1 || sourceNum > sources.length) continue;
    if (!quoteRaw || quoteRaw.length < 10) continue;

    const src = sources[sourceNum - 1];
    const extracted = String(src?.extracted ?? "");
    if (!extracted) continue;

    const hay = softNorm(extracted);
    const needle = softNorm(quoteRaw);

    let ok = false;

    if (needle.length >= 10 && hay.includes(needle)) ok = true;

    if (!ok) {
      const chunk = needle.slice(0, Math.min(80, needle.length)).trim();
      if (chunk.length >= 30 && hay.includes(chunk)) ok = true;
    }

    if (!ok) continue;

    out.push({
      source: sourceNum,
      url: urlRaw || src.url,
      quote: quoteRaw.slice(0, 240),
    });
  }

  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.source}::${c.quote}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** ---------
 * Gemini STRICT (con citas)
 * ---------*/
async function geminiAnswerStrict(question: string, sources: WebSource[]) {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) return { answer: NO_EVIDENCE, citations: [], gemini_enabled: false };

  const packedSources = sources
    .map((s, i) => {
      const body = (s.extracted ?? "").slice(0, 16000);
      return `SOURCE #${i + 1}\nTITLE: ${s.title}\nURL: ${s.url}\nDOMAIN: ${s.domain}\nCONTENT:\n${body}\n`;
    })
    .join("\n\n");

  const systemRules =
    `Eres un asistente de verificación para VotoClaro (Perú).` +
    `\nReglas estrictas:` +
    `\n1) SOLO puedes afirmar cosas explícitamente sustentadas en el texto (SOURCE #).` +
    `\n2) Si no hay evidencia suficiente, responde EXACTAMENTE: "${NO_EVIDENCE}".` +
    `\n3) Devuelve JSON válido: { "answer": string, "citations": [ { "source": number, "url": string, "quote": string } ] }` +
    `\n4) quote: copia literal del CONTENT provisto (máx. 220 chars).` +
    `\n5) Prohibido: suposiciones, opinión, conocimiento externo.` +
    `\n6) Si afirmas algo, incluye al menos 1 citation.`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: systemRules + "\n\nPREGUNTA:\n" + question + "\n\nFUENTES:\n" + packedSources }],
      },
    ],
    generationConfig: { temperature: 0.2 },
  };

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
  });

  if (!r.ok) return { answer: NO_EVIDENCE, citations: [], gemini_enabled: true };

  const data = (await r.json()) as any;
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  if (!text) return { answer: NO_EVIDENCE, citations: [], gemini_enabled: true };

  try {
    const parsed = JSON.parse(text);
    return { ...parsed, gemini_enabled: true };
  } catch {
    return { answer: NO_EVIDENCE, citations: [], gemini_enabled: true };
  }
}

/** ---------
 * Gemini SUMMARY (solo con contenido)
 * ---------*/
async function geminiAnswerSummary(question: string, sources: WebSource[]) {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) {
    return {
      answer:
        "Resumen informativo no disponible (IA no configurada). Revisa las fuentes listadas para ver el contenido completo.",
      gemini_enabled: false,
    };
  }

  const packedSources = sources
    .map((s, i) => {
      const body = (s.extracted ?? "").slice(0, 16000);
      return `SOURCE #${i + 1}\nTITLE: ${s.title}\nURL: ${s.url}\nDOMAIN: ${s.domain}\nCONTENT:\n${body}\n`;
    })
    .join("\n\n");

  const systemRules =
    `Eres un resumidor informativo para VotoClaro (Perú).` +
    `\nReglas:` +
    `\n1) SOLO usa el contenido provisto en SOURCE # (nada externo).` +
    `\n2) Si el contenido NO responde la pregunta, responde EXACTAMENTE: "${NO_EVIDENCE}".` +
    `\n3) Devuelve JSON válido: { "answer": string } (sin markdown).` +
    `\n4) Redacta en español, neutro, y atribuye: "Según <medio>..."` +
    `\n5) Incluye al final 1 línea de disclaimer: "Resumen informativo basado en cobertura periodística; no implica culpabilidad ni sustituye pronunciamiento oficial."` +
    `\n6) NO uses lenguaje condenatorio.`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: systemRules + "\n\nPREGUNTA:\n" + question + "\n\nFUENTES:\n" + packedSources }],
      },
    ],
    generationConfig: { temperature: 0.2 },
  };

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    return {
      answer:
        "Resumen informativo no disponible (error de IA). Revisa las fuentes listadas para ver el contenido completo.",
      gemini_enabled: true,
    };
  }

  const data = (await r.json()) as any;
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  if (!text) return { answer: NO_EVIDENCE, gemini_enabled: true };

  try {
    const parsed = JSON.parse(text);
    return { ...parsed, gemini_enabled: true };
  } catch {
    return { answer: NO_EVIDENCE, gemini_enabled: true };
  }
}

function sourceMentionsCandidate(extracted: string, nameTokens: string[]) {
  if (!nameTokens.length) return true;
  const hits = countTokenHits(extracted || "", nameTokens);
  return hits >= 1;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { q?: string; num?: number; mode?: WebMode };
    const q = (body.q ?? "").trim();
    const mode: WebMode = parseMode((body as any)?.mode);

    if (!q || q.length < 2) {
      return NextResponse.json({ error: "q es obligatorio (mín. 2 caracteres)" }, { status: 400 });
    }

    if (isPrivacyBlocked(q)) {
      return NextResponse.json(
        {
          q,
          mode,
          answer:
            "Consulta bloqueada: vida privada (familia/sexualidad) no pertinente a evaluación política en VotoClaro.",
          citations: [],
          sources: [],
          rule: "No se responde sobre familia/vida sexual u otros aspectos íntimos.",
        },
        { status: 400 }
      );
    }

    const num = Math.max(2, Math.min(6, Number(body.num ?? 4)));

    const cse = await cseSearch(q, num);

    let results: WebSource[] = [];
    let used = "CSE";
    let searchQ = "";

    if (cse.cseBlocked) {
      searchQ = buildNewsSearchQuery(q);

      used = "GDELT";
      results = await gdeltSearch(searchQ, num);

      if (!results.length) {
        results = await gdeltSearch(q, num);
      }

      if (!results.length) {
        used = "RPP";
        results = await rppSearch(searchQ, num);
      }

      if (!results.length) {
        return NextResponse.json(
          {
            q,
            mode,
            answer: NO_EVIDENCE,
            citations: [],
            sources: [],
            rule: "WEB: CSE bloqueado → se intentó GDELT y luego RPP. Sin resultados → frase estándar.",
            debug:
              "No results. used=" +
              used +
              " searchQ=" +
              searchQ +
              " | CSE raw: " +
              (cse.rawError ? String(cse.rawError).slice(0, 300) : "N/A"),
            gemini_enabled: Boolean((process.env.GEMINI_API_KEY ?? "").trim()),
          },
          { status: 200 }
        );
      }
    } else {
      results = cse.items;
    }

    if (!results.length) {
      return NextResponse.json({
        q,
        mode,
        answer: NO_EVIDENCE,
        citations: [],
        sources: [],
        rule: "Sin resultados.",
        gemini_enabled: Boolean((process.env.GEMINI_API_KEY ?? "").trim()),
      });
    }

    // Extraer contenido: escanea hasta 10, toma 3 con texto
    const scanMax = Math.min(results.length, 10);
    const picked: WebSource[] = [];

    for (let i = 0; i < scanMax; i++) {
      const s = results[i];
      s.extracted = await fetchAndExtract(s.url);

      if ((s.extracted || "").length >= 250) {
        picked.push(s);
      }
      if (picked.length >= 3) break;
    }

    const top = picked.length ? picked : results.slice(0, 3);

    // Filtro por mención del candidato (suave: si filtra todo, vuelve a top)
    const nameTokens = nameTokensFromQuery(q);
    const filteredTop =
      nameTokens.length > 0 ? top.filter((s) => sourceMentionsCandidate(s.extracted || "", nameTokens)) : top;

    const finalTop = filteredTop.length ? filteredTop : top;

    if (!finalTop.length) {
      return NextResponse.json({
        q,
        mode,
        answer: NO_EVIDENCE,
        citations: [],
        sources: top.map((s, idx) => ({
          source: idx + 1,
          title: s.title,
          url: s.url,
          domain: s.domain,
          snippet: s.snippet || "",
          extracted_len: (s.extracted || "").length,
        })),
        gemini_enabled: Boolean((process.env.GEMINI_API_KEY ?? "").trim()),
        rule: "Se hallaron URLs, pero no se pudo extraer texto útil o no se detectó mención del candidato.",
      });
    }

    if (mode === "summary") {
      const out = await geminiAnswerSummary(q, finalTop);
      const ans = String((out as any)?.answer ?? "").trim() || NO_EVIDENCE;

      return NextResponse.json({
        q,
        mode,
        answer: ans,
        citations: [],
        sources: finalTop.map((s, idx) => ({
          source: idx + 1,
          title: s.title,
          url: s.url,
          domain: s.domain,
          snippet: s.snippet || "",
          extracted_len: (s.extracted || "").length,
        })),
        gemini_enabled: Boolean((out as any)?.gemini_enabled),
        rule: "Resumen (con fuentes): basado SOLO en el texto extraído. used=" + used + (searchQ ? " searchQ=" + searchQ : ""),
      });
    }

    // ---- STRICT ----
    const out = await geminiAnswerStrict(q, finalTop);
    const safeCitations = validateCitations(finalTop, (out as any)?.citations);

    const safeAnswer =
      safeCitations.length > 0 && String((out as any)?.answer ?? "").trim()
        ? String((out as any).answer).trim()
        : NO_EVIDENCE;

    return NextResponse.json({
      q,
      mode,
      answer: safeAnswer,
      citations: safeCitations,
      sources: finalTop.map((s, idx) => ({
        source: idx + 1,
        title: s.title,
        url: s.url,
        domain: s.domain,
        snippet: s.snippet || "",
        extracted_len: (s.extracted || "").length,
      })),
      gemini_enabled: Boolean((out as any)?.gemini_enabled),
      rule: "Estricto (citas): solo se responde afirmando si hay citas textuales válidas. used=" + used + (searchQ ? " searchQ=" + searchQ : ""),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "ask failed" }, { status: 500 });
  }
}

// src/app/api/ai/answer/route.ts
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import {
  consumeAiAnswerRateLimit,
  getAiAnswerIpFingerprint,
} from "@/lib/aiAnswerRateLimit";
import fs from "fs/promises";
import path from "path";

type DocType = "plan" | "hv";
type Axis = "ECO" | "SEG" | "SAL" | "EDU" | "GEN";

type Source = { title: string; url?: string; page?: number };

type PdfPagesApiResponse = {
  id: string;
  filename: string;
  pages_read: number;
  pages: Array<{ page: number; text: string }>;
  source?: { title?: string; page_range?: string };
};

const MAX_BODY_BYTES = 16 * 1024;
const MAX_ID_CHARS = 96;
const MAX_QUESTION_CHARS = 6000;
const CANDIDATE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9ñáéíóúü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAxisFromQuestion(q: string): Axis {
  const t = norm(q);
  if (/(segur|delinc|extors|polic|crimen|homic|robo|pena|carcel)/.test(t)) return "SEG";
  if (/(salud|hospital|posta|essalud|sis|medic|vacun|enferm|nutric)/.test(t)) return "SAL";
  if (/(educ|coleg|escuel|univers|docent|beca|curricul|aprendiz)/.test(t)) return "EDU";
  if (/(econom|emple|trabaj|labor|mype|pymes|igv|renta|impuest|tribut|pbi|inflac|salario|invers)/.test(t)) return "ECO";
  return "GEN";
}

const AXIS_KEYWORDS: Record<Axis, Array<{ k: string; w: number }>> = {
  ECO: [
    { k: "econom", w: 3 },
    { k: "emple", w: 3 },
    { k: "trabaj", w: 3 },
    { k: "labor", w: 2 },
    { k: "formal", w: 2 },
    { k: "informal", w: 2 },
    { k: "mype", w: 2 },
    { k: "pymes", w: 2 },
    { k: "empresa", w: 2 },
    { k: "emprend", w: 2 },
    { k: "invers", w: 3 },
    { k: "pbi", w: 3 },
    { k: "inflac", w: 3 },
    { k: "salario", w: 2 },
    { k: "ingreso", w: 2 },
    { k: "recaud", w: 2 },
    { k: "tribut", w: 3 },
    { k: "impuest", w: 3 },
    { k: "igv", w: 3 },
    { k: "renta", w: 3 },
    { k: "sunat", w: 2 },
    { k: "credito", w: 2 },
    { k: "presupuesto", w: 2 },
    { k: "export", w: 2 },
  ],
  SEG: [
    { k: "segur", w: 3 },
    { k: "delinc", w: 3 },
    { k: "crimen", w: 3 },
    { k: "extors", w: 3 },
    { k: "polic", w: 2 },
    { k: "serenaz", w: 2 },
    { k: "homic", w: 2 },
    { k: "robo", w: 2 },
    { k: "pena", w: 2 },
    { k: "carcel", w: 2 },
    { k: "fiscal", w: 1 },
  ],
  SAL: [
    { k: "salud", w: 3 },
    { k: "hospital", w: 3 },
    { k: "posta", w: 2 },
    { k: "essalud", w: 3 },
    { k: "sis", w: 2 },
    { k: "medic", w: 2 },
    { k: "enferm", w: 2 },
    { k: "vacun", w: 2 },
    { k: "nutric", w: 2 },
    { k: "atencion", w: 2 },
    { k: "atención", w: 2 },
  ],
  EDU: [
    { k: "educ", w: 3 },
    { k: "coleg", w: 2 },
    { k: "escuel", w: 2 },
    { k: "univers", w: 2 },
    { k: "docent", w: 2 },
    { k: "curricul", w: 2 },
    { k: "currícul", w: 2 },
    { k: "beca", w: 2 },
    { k: "aprendiz", w: 2 },
  ],
  GEN: [],
};

const STOP = new Set(
  [
    "resume","resumen","resumir","explica","explicar","describe","describir","detalla","detallar",
    "menciona","mencionar","indica","indicar","dime","cuales","cual","que","como","sobre","acerca",
    "respecto","propuesta","propuestas","plan","gobierno","programa","medidas","acciones","objetivo",
    "objetivos","meta","metas","eje","ejes","tema","temas","para","por","con","sin","del","al","los",
    "las","una","uno","unos","unas","este","esta","estos","estas","hay","si","no","mas","menos","muy",
  ].map((w) => norm(w))
);

function tokenize(q: string) {
  const t = norm(q)
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && !STOP.has(x));
  return Array.from(new Set(t));
}

function countIncludes(t: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const next = t.indexOf(needle, idx);
    if (next === -1) break;
    count++;
    idx = next + needle.length;
  }
  return count;
}

function scoreChunk(axis: Axis, tokens: string[], text: string) {
  const t = norm(text);
  if (!t) return 0;

  let s = 0;
  let strongHits = 0;

  for (const kw of AXIS_KEYWORDS[axis] ?? []) {
    const needle = norm(kw.k);
    const c = Math.min(3, countIncludes(t, needle));
    if (c > 0) {
      s += kw.w * c;
      strongHits += c;
    }
  }

  let tokenHits = 0;
  for (const tok of tokens) {
    if (!tok) continue;
    if (t.includes(tok)) {
      s += 1;
      tokenHits += 1;
    }
  }

  if (axis !== "GEN") {
    if (strongHits === 0 && tokenHits < 1) return 0;
  } else {
    if (tokenHits === 0) return 0;
  }

  return s;
}

function normalizeEvidenceText(s: string) {
  let t = String(s || "");
  t = t.replace(/\r/g, "");
  t = t.replace(/[|]+/g, " ");
  t = t.replace(/^\s*•\s+/gm, "- ");
  t = t.replace(/(\p{L})-\n(\p{L})/gu, "$1$2");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");

  const lines = t
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  t = lines.join("\n");
  t = t.replace(/\b(\p{L}+)\b(?:\s+\1\b)+/giu, "$1");

  return t.trim();
}

function chunkText(text: string, maxChars = 900) {
  const t = normalizeEvidenceText(text);
  if (!t) return [];

  const rawParts = t
    .split(/\n\s*\n/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const p of rawParts) {
    if (p.length <= maxChars) {
      chunks.push(p);
      continue;
    }

    const sentences = p
      .split(/(?<=[.!?])\s+/g)
      .map((x) => x.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      for (let i = 0; i < p.length; i += maxChars) {
        chunks.push(p.slice(i, i + maxChars).trim());
      }
      continue;
    }

    let buf = "";
    for (const s of sentences) {
      if (!buf) {
        buf = s;
        continue;
      }
      if ((buf + " " + s).length <= maxChars) {
        buf = buf + " " + s;
      } else {
        chunks.push(buf);
        buf = s;
      }
    }
    if (buf) chunks.push(buf);
  }

  return chunks.filter((c) => c.length >= 40);
}

function clipEvidence(s: string, maxChars: number) {
  const x = (s || "").replace(/\r/g, "").trim();
  if (x.length <= maxChars) return x;
  return x.slice(0, maxChars).trim() + "…";
}

function getBaseUrl(req: NextRequest) {
  return req.nextUrl.origin;
}

async function fetchLocalJson(url: string) {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text();

  if (!res.ok) {
    throw new Error("document_source_unavailable");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("document_source_invalid");
  }
}

function isNoEvidenceAnswer(s: string) {
  const t = norm(s);
  return t.includes("no hay evidencia suficiente en las fuentes consultadas");
}

function extractPagesFromAnswer(answer: string): number[] {
  const pages = new Set<number>();
  const re = /\(p\.?\s*(\d{1,4})\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) pages.add(n);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * ✅ Gemini (PDF directo) — versión más compatible:
 * - parts: [ inlineData(PDF), text(prompt) ]
 * - role: "user"
 * - debug de candidates/finishReason
 */
async function callGeminiWithPdf(args: { question: string; pdfBase64: string; filename?: string }) {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en .env.local");

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
 const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const system = [
    "Eres un asistente neutral.",
"Hablas en tercera persona sobre el candidato.",
"NO digas 'VOTO CLARO propone'. Di: 'El candidato propone…' o 'El plan señala…'.",

    "Estás respondiendo preguntas usando ÚNICAMENTE el PDF adjunto.",
    "REGLAS DURAS:",
    "1) SOLO puedes usar información que exista en el PDF adjunto.",
    "2) NO inventes. Si no hay evidencia clara, responde EXACTAMENTE: “No hay evidencia suficiente en las fuentes consultadas.”",
    "3) Devuelve máximo 8 viñetas.",
    "4) Cada viñeta DEBE terminar con cita (p. X).",
    "5) No copies texto largo literal; resume.",
  ].join("\n");

  const promptText = [
    system,
    "",
    args.filename ? `PDF: ${args.filename}` : "PDF adjunto.",
    "",
    "PREGUNTA:",
    args.question,
    "",
    "RESPONDE AHORA:",
  ].join("\n");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: args.pdfBase64,
            },
          },
          { text: promptText },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2500,
      topP: 0.9,
    },
  };

  const r = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const j = await r.json();
  if (!r.ok) {
    const msg = (j as any)?.error?.message ?? (j as any)?.error ?? `Gemini error HTTP ${r.status}`;
    throw new Error(msg);
  }

  const cand0 = (j as any)?.candidates?.[0];
  const finishReason = cand0?.finishReason ?? cand0?.finish_reason ?? undefined;

  const text =
    cand0?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";

  return {
    text: String(text || "").trim(),
    modelUsed: model,
    hasCandidates: Array.isArray((j as any)?.candidates) && (j as any)?.candidates.length > 0,
    finishReason,
  };
}

function pageLooselyMatchesAxis(axis: Axis, pageText: string) {
  const t = norm(pageText);
  if (!t) return false;
  if (axis === "GEN") return t.length >= 120;

  const kws = AXIS_KEYWORDS[axis] ?? [];
  let hits = 0;
  for (const kw of kws) {
    const needle = norm(kw.k);
    if (needle && t.includes(needle)) hits++;
    if (hits >= 1) return true;
  }
  return false;
}
async function resolveHvPdfPath(id: string) {
  const baseDir = path.join(process.cwd(), "data", "docs", "persona");

  const expected = path.join(baseDir, `${id}_hv.pdf`);
  try {
    await fs.access(expected);
    return { ok: true as const, pdfPath: expected, filename: `${id}_hv.pdf`, strategy: "expected" as const };
  } catch {
    // sigue al fallback
  }

  let files: string[] = [];
  try {
    files = (await fs.readdir(baseDir)).filter((f) => f.toLowerCase().endsWith("_hv.pdf"));
  } catch {
    return { ok: false as const, pdfPath: expected, filename: `${id}_hv.pdf`, strategy: "dir_missing" as const };
  }

  const wanted = norm(id);
  for (const f of files) {
    const slug = f.replace(/_hv\.pdf$/i, "");
    if (norm(slug) === wanted) {
      return { ok: true as const, pdfPath: path.join(baseDir, f), filename: f, strategy: "scan_match" as const };
    }
  }

  return { ok: false as const, pdfPath: expected, filename: `${id}_hv.pdf`, strategy: "not_found" as const };
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const json = await readBoundedJsonObject(req, MAX_BODY_BYTES);
    if (!json) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const keys = Object.keys(json);
    if (keys.some((key) => key !== "id" && key !== "doc" && key !== "question")) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const id = typeof json.id === "string" ? json.id.trim() : "";
    const docRaw = json.doc === undefined ? "plan" : json.doc;
    const question = typeof json.question === "string" ? json.question.trim() : "";

    if (!id || id.length > MAX_ID_CHARS || !CANDIDATE_ID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (typeof docRaw !== "string") {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const doc = docRaw.trim().toLowerCase() as DocType;
    if (doc !== "plan" && doc !== "hv") {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!question || question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const ipFingerprint = getAiAnswerIpFingerprint(req);
    if (!ipFingerprint.ok) {
      return NextResponse.json(
        { ok: false, error: "ai_answer_unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    const rateLimit = await consumeAiAnswerRateLimit(ipFingerprint.value);
    if (!rateLimit.ok) {
      return NextResponse.json(
        { ok: false, error: "ai_answer_unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!rateLimit.allowed) {
      const retryAfter = String(
        Math.max(1, Math.min(3600, rateLimit.retryAfterSeconds))
      );

      return NextResponse.json(
        { ok: false, error: "ai_answer_rate_limited" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": retryAfter,
          },
        }
      );
    }

    const axis = detectAxisFromQuestion(question);
    const tokens = tokenize(question);

    // ✅ PASO 1: SOLO HV por PDF directo
    if (doc === "hv") {
    const resolved = await resolveHvPdfPath(id);

if (!resolved.ok) {
  return NextResponse.json(
    {
      ok: true,
      id,
      doc,
      axis,
      answer: "No hay evidencia suficiente en las fuentes consultadas.",
      citations: [] as Source[],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

const filename = resolved.filename;
const pdfPath = resolved.pdfPath;

let pdfBuf: Buffer;
try {
  pdfBuf = await fs.readFile(pdfPath);
} catch {
  return NextResponse.json(
    {
      ok: true,
      id,
      doc,
      axis,
      answer: "No hay evidencia suficiente en las fuentes consultadas.",
      citations: [] as Source[],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

      const pdfBase64 = pdfBuf.toString("base64");

      const gem = await callGeminiWithPdf({
        question,
        pdfBase64,
        filename,
      });

      const answerRaw = gem.text;

      if (!answerRaw || isNoEvidenceAnswer(answerRaw)) {
        return NextResponse.json(
          {
            ok: true,
            id,
            doc,
            axis,
            answer: "No hay evidencia suficiente en las fuentes consultadas.",
            citations: [] as Source[],
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      const pages = extractPagesFromAnswer(answerRaw);
      const title = "Hoja de Vida (PDF) (cargado por el admin)";
      const citations: Source[] = pages.map((p) => ({ title, page: p }));

      return NextResponse.json(
        {
          ok: true,
          id,
          doc,
          axis,
          answer: answerRaw,
          citations,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ PLAN: sin cambios (por ahora)
    const base = getBaseUrl(req);

    const sourceUrl =
      doc === "plan"
        ? `${base}/api/docs/plan?id=${encodeURIComponent(id)}`
        : `${base}/api/docs/hv?id=${encodeURIComponent(id)}`;

    const data = (await fetchLocalJson(sourceUrl)) as PdfPagesApiResponse;

    const allChunks: Array<{ page: number; chunk: string; score: number }> = [];
    for (const p of data.pages ?? []) {
      const chunks = chunkText(p.text ?? "", 900);
      for (const c of chunks) {
        allChunks.push({ page: p.page, chunk: c, score: scoreChunk(axis, tokens, c) });
      }
    }

    const ranked = allChunks.sort((a, b) => b.score - a.score);

    const picked: Array<{ page: number; text: string; score: number }> = [];
    const usedPages = new Map<number, number>();

    for (const r of ranked) {
      if (r.score <= 0) continue;

      const c = usedPages.get(r.page) ?? 0;
      if (c >= 2) continue;

      picked.push({ page: r.page, text: r.chunk, score: r.score });
      usedPages.set(r.page, c + 1);

      if (picked.length >= 8) break;
    }

    if (!picked.length) {
      const fallbackPages = (data.pages ?? [])
        .filter((p) => pageLooselyMatchesAxis(axis, p.text ?? ""))
        .slice(0, 3);

      for (const p of fallbackPages) {
        const chunks = chunkText(p.text ?? "", 900).slice(0, 2);
        for (const c of chunks) picked.push({ page: p.page, text: c, score: 1 });
        if (picked.length >= 6) break;
      }
    }

    if (!picked.length) {
      return NextResponse.json(
        {
          ok: true,
          id,
          doc,
          axis,
          answer: "No hay evidencia suficiente en las fuentes consultadas.",
          citations: [] as Source[],
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const packedEvidence = picked
      .map((e, i) => `FRAGMENTO ${i + 1} (p. ${e.page}):\n${clipEvidence(e.text, 1800)}\n(p. ${e.page})`)
      .join("\n\n---\n\n");

    async function callGemini(args: { question: string; packedEvidence: string }) {
      const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
      if (!apiKey) throw new Error("Falta GEMINI_API_KEY en .env.local");

      const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

      const system = [
        "Eres un asistente neutral.",
"Hablas en tercera persona sobre el candidato.",
"NO digas 'VOTO CLARO propone'. Di: 'El candidato propone…' o 'El plan señala…'.",

        "Responde como un chat con un PDF.",
        "REGLAS DURAS:",
        "1) SOLO puedes usar la evidencia proporcionada (fragmentos por página).",
        "2) NO inventes. Si no hay evidencia clara, responde EXACTAMENTE: “No hay evidencia suficiente en las fuentes consultadas.”",
        "3) Devuelve máximo 8 viñetas.",
        "4) Cada viñeta DEBE terminar con cita (p. X).",
        "5) No copies texto largo literal; resume.",
        "6) Usa las páginas que YA aparecen marcadas en la evidencia (p. X).",
        "7) Si te falta espacio, acorta cantidad de viñetas, pero NO cortes una viñeta a la mitad.",
      ].join("\n");

      const prompt = [
        system,
        "",
        "EVIDENCIA (fragmentos por página):",
        args.packedEvidence,
        "",
        "PREGUNTA:",
        args.question,
        "",
        "RESPONDE AHORA:",
      ].join("\n");

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2500,
          topP: 0.9,
        },
      };

      const r = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });

      const j = await r.json();
      if (!r.ok) {
        const msg = (j as any)?.error?.message ?? (j as any)?.error ?? `Gemini error HTTP ${r.status}`;
        throw new Error(msg);
      }

      const text = (j as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
      return String(text || "").trim();
    }

    const answer = await callGemini({ question, packedEvidence });

    if (!answer || isNoEvidenceAnswer(answer)) {
      return NextResponse.json(
        {
          ok: true,
          id,
          doc,
          axis,
          answer: "No hay evidencia suficiente en las fuentes consultadas.",
          citations: [] as Source[],
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const title =
      data.source?.title ??
      (doc === "plan"
        ? "Plan de Gobierno (PDF por partido) (cargado por el admin)"
        : "Hoja de Vida (JNE) (PDF cargado por el admin)");

    const citations = Array.from(new Set(picked.map((p) => p.page))).map((p) => ({ title, page: p }));

    return NextResponse.json(
      {
        ok: true,
        id,
        doc,
        axis,
        answer,
        citations,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.error("[ai-answer] request failed");
    return NextResponse.json(
      { ok: false, error: "ai_answer_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

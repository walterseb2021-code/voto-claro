// src/app/api/compare/plan/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";

type Source = { title: string; url?: string; page?: number };

type CompareAxis = "SEG" | "ECO" | "SAL" | "EDU";

type PdfPagesApiResponse = {
  id: string;
  party_name?: string;
  party_id?: string;
  filename: string;
  pages_read: number;
  pages: Array<{ page: number; text: string }>;
  source?: { title?: string; page_range?: string };
};

function axisToQuestion(axis: CompareAxis) {
  if (axis === "SEG") return "Resume las propuestas sobre seguridad ciudadana.";
  if (axis === "SAL") return "Resume las propuestas sobre salud.";
  if (axis === "EDU") return "Resume las propuestas sobre educación.";
  return "Resume las propuestas sobre economía y empleo.";
}

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function tokenize(q: string) {
  const base = norm(q)
    .replace(/[^a-z0-9ñáéíóúü\s]/gi, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  return Array.from(new Set(base));
}

const AXIS_KEYWORDS: Record<CompareAxis, Array<{ k: string; w: number }>> = {
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
    { k: "productiv", w: 2 },
    { k: "recaud", w: 2 },
    { k: "tribut", w: 3 },
    { k: "impuest", w: 3 },
    { k: "igv", w: 3 },
    { k: "renta", w: 3 },
    { k: "sunat", w: 2 },
    { k: "export", w: 2 },
    { k: "import", w: 2 },
    { k: "competit", w: 2 },
    { k: "costo", w: 2 },
    { k: "deuda", w: 2 },
    { k: "credito", w: 2 },
    { k: "bcrp", w: 2 },
    { k: "presupuesto", w: 2 },
  ],
  SEG: [
    { k: "segur", w: 3 },
    { k: "delinc", w: 3 },
    { k: "crimen", w: 3 },
    { k: "extors", w: 3 },
    { k: "polic", w: 2 },
        { k: "orden interno", w: 2 },
    { k: "narcot", w: 2 },
    { k: "terror", w: 2 },
    { k: "sicari", w: 2 },
    { k: "trata", w: 2 },
    { k: "frontera", w: 1 },
    { k: "inteligencia", w: 1 },
    { k: "penal", w: 1 },

    { k: "serenaz", w: 2 },
    { k: "homic", w: 2 },
    { k: "robo", w: 2 },
    { k: "pena", w: 2 },
    { k: "carcel", w: 2 },
    { k: "cárcel", w: 2 },
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
    { k: "infraestructura educativa", w: 2 },
    { k: "aprendiz", w: 2 },
  ],
};

const NEGATIVE_HINTS = [
  "ideario",
  "princip",
  "valores",
  "vision",
  "visión",
  "mision",
  "misión",
  "historia",
  "presentacion",
  "presentación",
  "introduccion",
  "introducción",
  "resumen",
  "diagnostico",
  "diagnóstico",
  "perfil",
  "quienes somos",
  "quiénes somos",
];

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

function scoreByAxis(axis: CompareAxis, questionTokens: string[], text: string) {
  if (!text) return 0;
  const t = norm(text);

  let score = 0;
  let strongHits = 0;
  let tokenHits = 0;

  for (const kw of AXIS_KEYWORDS[axis] ?? []) {
    const needle = norm(kw.k);
    if (!needle) continue;

    if (needle.includes(" ")) {
      if (t.includes(needle)) {
        score += kw.w * 2;
        strongHits += 2;
      }
      continue;
    }

    const c = Math.min(3, countIncludes(t, needle));
    if (c > 0) {
      score += kw.w * c;
      strongHits += c;
    }
  }

  for (const tok of questionTokens) {
    if (!tok) continue;
    if (t.includes(tok)) {
      score += 1;
      tokenHits++;
    }
  }

  const negCount = NEGATIVE_HINTS.reduce((acc, n) => (t.includes(norm(n)) ? acc + 1 : acc), 0);
  if (negCount > 0) score -= Math.min(10, negCount) * 1.25;

  const hasSignal = strongHits >= 1 || tokenHits >= 1;
  if (!hasSignal) return 0;

  if (/\b(se|se\s+propone|propon|implementar|crearemos|promover|fortalecer|reducir|aumentar)\b/i.test(text))
    score += 2;

  return score;
}

function detectTopic(question: string) {
  const q = norm(question);

  const hints = [
    { k: ["migr", "extranj", "calidades migratorias"], label: "Migración" },
    { k: ["segur", "delinc", "extors", "polic"], label: "Seguridad" },
    { k: ["econom", "emple", "inversion", "impuest", "pbi", "igv", "tribut"], label: "Economía y empleo" },
    { k: ["salud", "hospital", "essalud", "posta"], label: "Salud" },
    { k: ["educ", "coleg", "escuel", "docent", "univers"], label: "Educación" },
    { k: ["corrup", "transparen", "contralor", "fiscal"], label: "Integridad / Anticorrupción" },
    { k: ["infra", "carreter", "puente", "obra", "metro", "tren"], label: "Infraestructura" },
  ];

  for (const h of hints) {
    if (h.k.some((x) => q.includes(norm(x)))) return h.label;
  }
  return "Tema";
}

function getBaseUrl(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
async function fetchPlan(req: Request, candidateId: string): Promise<PdfPagesApiResponse> {
  const origin = new URL(req.url).origin; // ✅ siempre el mismo origen real del request
  const url = `${origin}/api/docs/plan?id=${encodeURIComponent(candidateId)}`;

const res = await fetch(url, {
  cache: "no-store",
  headers: {
    cookie: req.headers.get("cookie") ?? "",
  },
});

  // ✅ leer como texto primero para evitar "Unexpected token <" si llega HTML
  const text = await res.text();
  let data: any = null;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`docs/plan devolvió no-JSON (status ${res.status}) (id=${candidateId})`);
  }

  if (!res.ok) {
    const msg = data?.error ?? "No se pudo cargar el plan";
    throw new Error(`${msg} (id=${candidateId})`);
  }

  return data as PdfPagesApiResponse;
}

// ✅ helper: intentar cargar plan sin romper flujo
async function tryFetchPlan(req: Request, candidateId: string): Promise<{ ok: true; data: PdfPagesApiResponse } | { ok: false; error: string }> {
  try {
    const data = await fetchPlan(req, candidateId);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/** ✅ Limpieza fuerte para que Gemini reciba evidencia “tipo PDF chat” */
function normalizeEvidenceText(s: string) {
  let t = String(s || "");
  t = t.replace(/\r/g, "");
  t = t.replace(/[|]+/g, " ");
  t = t.replace(/^\s*•\s+/gm, "- ");
  t = t.replace(/(\p{L})-\n(\p{L})/gu, "$1$2");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/\b(\p{L}+)\b(?:\s+\1\b)+/giu, "$1");
  return t.trim();
}

/** ✅ CHUNKING REAL */
function chunkText(text: string, maxChars = 900) {
  const t = normalizeEvidenceText(text);
  if (!t) return [];

  const blocks = t
    .split(/\n\s*\n/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const b of blocks) {
    const lines = b.split("\n").map((x) => x.trim()).filter(Boolean);
    const listLikeCount = lines.filter((x) => /^(-|\d+[\).])\s+/.test(x)).length;

    if (lines.length >= 3 && listLikeCount >= 2) {
      let buf = "";
      for (const ln of lines) {
        const add = (buf ? "\n" : "") + ln;
        if ((buf + add).length <= maxChars) {
          buf = buf + add;
        } else {
          if (buf.trim()) chunks.push(buf.trim());
          buf = ln;
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }

    if (b.length <= maxChars) {
      chunks.push(b);
      continue;
    }

    const sentences = b.split(/(?<=[.!?])\s+/g).map((x) => x.trim()).filter(Boolean);
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

  return chunks.map((c) => c.trim()).filter((c) => c.length >= 25);
}

function clipEvidence(s: string, maxChars: number) {
  const x = (s || "").replace(/\r/g, "").trim();
  if (x.length <= maxChars) return x;
  return x.slice(0, maxChars).trim() + "…";
}

async function geminiAnswerFromEvidence(args: {
  question: string;
  topic: string;
  docLabel: string;
  evidence: Array<{ page: number; text: string }>;
}) {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      text: "No hay evidencia suficiente en las fuentes consultadas. (Falta GEMINI_API_KEY en el servidor.)",
      ok: false,
    };
  }

  const model = (process.env.GEMINI_MODEL ?? "gemini-1.5-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const packedEvidence = args.evidence
    .map((e, i) => `PÁGINA ${e.page} — FRAGMENTO ${i + 1}:\n${clipEvidence(e.text, 1800)}`)
    .join("\n\n---\n\n");

  const system = [
    "Eres un asistente informativo neutral que responde como un chat con un PDF.",
    "Reglas duras:",
    "1) SOLO puedes usar la evidencia proporcionada (fragmentos por página del PDF).",
    "2) NO inventes. Si no hay evidencia clara, responde exactamente: “No hay evidencia suficiente en las fuentes consultadas.”",
    "3) Responde en español claro, coherente y resumido.",
    "4) Devuelve máximo 6 viñetas.",
    "5) Cada viñeta debe terminar con cita (p. X).",
    "6) NO repitas palabras ni frases. NO copies texto literal largo; resume.",
    "7) Si hay varias ideas, agrúpalas por subtema (ej. impuestos, empleo, inversión).",
  ].join("\n");

  const prompt = [
    system,
    "",
    `Documento: ${args.docLabel}`,
    `Tema: ${args.topic}`,
    `Pregunta: ${args.question}`,
    "",
    "EVIDENCIA (fragmentos por página):",
    packedEvidence,
    "",
    "RESPONDE AHORA:",
  ].join("\n");

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
    },
  };

  let res: Response;
  let data: any;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    data = await res.json();
  } catch {
    return { text: "No hay evidencia suficiente en las fuentes consultadas.", ok: false };
  }

  if (!res.ok) return { text: "No hay evidencia suficiente en las fuentes consultadas.", ok: false };

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("")?.trim() ??
    "No hay evidencia suficiente en las fuentes consultadas.";

  return { text, ok: true };
}

function scorePageQuick(axis: CompareAxis, qTokens: string[], pageText: string) {
  const s = scoreByAxis(axis, qTokens, pageText);
  if (s > 0) return s;
  const t = norm(pageText || "");
  let hits = 0;
  for (const tok of qTokens) if (tok && t.includes(tok)) hits++;
  return hits >= 1 ? hits : 0;
}

async function buildAnswerWithGemini(axis: CompareAxis, docLabel: string, question: string, pages: Array<{ page: number; text: string }>) {
  const qTokens = tokenize(question);

  const allChunks: Array<{ page: number; chunk: string; score: number }> = [];
  for (const p of pages ?? []) {
    const chunks = chunkText(p.text ?? "", 900);
    for (const c of chunks) {
      allChunks.push({
        page: p.page,
        chunk: c,
        score: scoreByAxis(axis, qTokens, c),
      });
    }
  }

  const ranked = allChunks.sort((a, b) => b.score - a.score);

  const picked: Array<{ page: number; text: string }> = [];
  const usedPages = new Map<number, number>();

  for (const r of ranked) {
    if (r.score <= 0) continue;

    const c = usedPages.get(r.page) ?? 0;
    if (c >= 2) continue;

    picked.push({ page: r.page, text: r.chunk });
    usedPages.set(r.page, c + 1);

    if (picked.length >= 8) break;
  }

  if (!picked.length) {
    const pageRank = (pages ?? [])
      .map((p) => ({
        page: p.page,
        text: normalizeEvidenceText(p.text ?? ""),
        score: scorePageQuick(axis, qTokens, p.text ?? ""),
      }))
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.score > 0)
      .slice(0, 3);

    for (const pr of pageRank) {
      const clipped = clipEvidence(pr.text, 2200);
      if (clipped.trim()) picked.push({ page: pr.page, text: clipped });
    }
  }

  if (!picked.length) {
    return { answer: "No hay evidencia suficiente en las fuentes consultadas.", pages: [] as number[] };
  }

  const topic = detectTopic(question);

  const gem = await geminiAnswerFromEvidence({
    question,
    topic,
    docLabel,
    evidence: picked,
  });

  const pagesUsed = Array.from(new Set(picked.map((x) => x.page)));

  const answer =
    `${topic} (según el ${docLabel})\n\n` +
    `Pregunta: ${question.trim()}\n\n` +
    `${(gem.text || "").trim()}\n\n` +
    `Regla: si un dato no aparece en el PDF consultado, se responde “No hay evidencia suficiente en las fuentes consultadas.”`;

  return { answer, pages: pagesUsed };
}

function noPlanPayload(id: string, question: string, sideLabel: "a" | "b", reason = "NO_PLAN_PDF") {
  return {
    id,
    answer:
      `Plan de Gobierno (PDF)\n\n` +
      `Pregunta: ${question}\n\n` +
      `No hay evidencia suficiente en las fuentes consultadas.\n\n` +
      `Regla: si un dato no aparece en el PDF consultado, se responde “No hay evidencia suficiente en las fuentes consultadas.”`,
    citations: [] as Source[],
    _debug: { side: sideLabel, reason },
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idA = searchParams.get("idA") ?? searchParams.get("a");
    const idB = searchParams.get("idB") ?? searchParams.get("b");
    const axisRaw = (searchParams.get("axis") ?? "ECO").trim().toUpperCase();

    const axis: CompareAxis = (["SEG", "ECO", "SAL", "EDU"] as const).includes(axisRaw as any) ? (axisRaw as CompareAxis) : "ECO";

    if (!idA || !idB) return NextResponse.json({ error: "Missing idA or idB" }, { status: 400 });

    const qCustom = (searchParams.get("q") ?? "").trim();
    const question = qCustom || axisToQuestion(axis);

    // ✅ 1) Intentar cargar ambos planes (sin depender de exists)
    const aTry = await tryFetchPlan(req, idA);
    const bTry = await tryFetchPlan(req, idB);

    const hasPlanA = aTry.ok;
    const hasPlanB = bTry.ok;

   // ✅ 2) Si uno o ambos no tienen plan, igual responde el que sí tiene (sin "Pendiente...")
if (!hasPlanA || !hasPlanB) {
  const aOut = hasPlanA ? ((aTry as any).data as PdfPagesApiResponse) : null;
  const bOut = hasPlanB ? ((bTry as any).data as PdfPagesApiResponse) : null;

  let aPayload: any;
  let bPayload: any;

  if (aOut) {
    const aBuilt = await buildAnswerWithGemini(axis, "Plan de Gobierno", question, aOut.pages ?? []);
    const aTitle = aOut.source?.title ?? "Plan de Gobierno (PDF)";
    const aCitations: Source[] = (aBuilt.pages ?? []).map((p) => ({ title: aTitle, page: p }));
    aPayload = { id: idA, answer: aBuilt.answer, citations: aCitations };
  } else {
    aPayload = noPlanPayload(idA, question, "a", "NO_PLAN_PDF");
  }

  if (bOut) {
    const bBuilt = await buildAnswerWithGemini(axis, "Plan de Gobierno", question, bOut.pages ?? []);
    const bTitle = bOut.source?.title ?? "Plan de Gobierno (PDF)";
    const bCitations: Source[] = (bBuilt.pages ?? []).map((p) => ({ title: bTitle, page: p }));
    bPayload = { id: idB, answer: bBuilt.answer, citations: bCitations };
  } else {
    bPayload = noPlanPayload(idB, question, "b", "NO_PLAN_PDF");
  }

  return NextResponse.json(
    {
      axis,
      a: aPayload,
      b: bPayload,
      debug: {
        axis,
        rule: "Compare plan: intenta /api/docs/plan; si falla, NO_PLAN_PDF. (No depende de exists).",
        model: (process.env.GEMINI_MODEL ?? "gemini-1.5-flash").trim(),
        hasPlanA,
        hasPlanB,
        errA: aTry.ok ? null : (aTry as any).error,
        errB: bTry.ok ? null : (bTry as any).error,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// ✅ 3) Si ambos tienen plan, comparación completa
const planA = (aTry as any).data as PdfPagesApiResponse;
const planB = (bTry as any).data as PdfPagesApiResponse;

const aBuilt = await buildAnswerWithGemini(axis, "Plan de Gobierno", question, planA.pages ?? []);
const bBuilt = await buildAnswerWithGemini(axis, "Plan de Gobierno", question, planB.pages ?? []);

const aTitle = planA.source?.title ?? "Plan de Gobierno (PDF)";
const bTitle = planB.source?.title ?? "Plan de Gobierno (PDF)";

const aCitations: Source[] = (aBuilt.pages ?? []).map((p) => ({ title: aTitle, page: p }));
const bCitations: Source[] = (bBuilt.pages ?? []).map((p) => ({ title: bTitle, page: p }));

return NextResponse.json(
  {
    axis,
    a: { id: idA, answer: aBuilt.answer, citations: aCitations },
    b: { id: idB, answer: bBuilt.answer, citations: bCitations },
    debug: {
      axis,
      rule:
        "RAG por fragmentos (chunks) + chunking que respeta bullets + score flexible + fallback por página + Gemini (sin inventar) + citas por página.",
      model: (process.env.GEMINI_MODEL ?? "gemini-1.5-flash").trim(),
      hasPlanA,
      hasPlanB,
    },
  },
  { headers: { "Cache-Control": "no-store" } }
);

     } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Compare failed" }, { status: 500 });
  }
}

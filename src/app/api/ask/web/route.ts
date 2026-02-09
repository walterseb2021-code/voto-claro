export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { isAllowedUrl } from "@/lib/votoclaro/webSources";
import crypto from "crypto";
import fs from "fs";
import path from "path";

type WebSource = {
  title: string;
  url: string;
  snippet?: string;
};

type EvidenceChunk = {
  url: string;
  title: string;
  excerpt: string; // texto breve extraído
};

function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function safeTrim(s: string, max = 1600) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max).trimEnd() + "…";
}

function stripHtml(html: string) {
  // Simple y suficiente para MVP (sin librerías)
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function googleCseSearch(q: string, num = 8): Promise<WebSource[]> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!key || !cx) {
    throw new Error("Missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX in .env.local");
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(Math.min(Math.max(num, 1), 10)));

  const r = await fetch(url.toString(), { method: "GET" });
  if (!r.ok) throw new Error(`Google CSE error: ${r.status}`);

  const data: any = await r.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  return items
    .map((it: any) => ({
      title: String(it?.title ?? ""),
      url: String(it?.link ?? ""),
      snippet: String(it?.snippet ?? ""),
    }))
    .filter((x: WebSource) => x.url && x.title);
}

async function fetchEvidence(url: string, title: string): Promise<EvidenceChunk | null> {
  if (!isAllowedUrl(url)) return null;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      // evita bloqueos simples
      "User-Agent": "VotoClaroBot/1.0 (evidence-only)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!r.ok) return null;

  const html = await r.text();
  const text = stripHtml(html);

  // tomamos un extracto inicial; en MVP no hacemos “mejor párrafo”
  const excerpt = safeTrim(text, 1400);
  if (!excerpt || excerpt.length < 80) return null;

  return { url, title, excerpt };
}

function cachePathFor(query: string) {
  const dir = path.join(process.cwd(), "data", "cache", "web");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${sha1(query)}.json`);
}

async function geminiAnswer(question: string, evidence: EvidenceChunk[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local");

  // Prompt duro: NO inventar, SOLO con evidencia, SIEMPRE citar URLs usadas
  const systemRules = `
Eres un asistente de verificación para VOTO CLARO.
Reglas estrictas:
- NO inventes datos.
- SOLO puedes responder usando la evidencia proporcionada (extractos de fuentes).
- Si la evidencia no alcanza para responder: responde exactamente "No hay evidencia suficiente en las fuentes consultadas".
- Prohibido emitir juicios de valor (por ejemplo: "es una persona proba", "es alcohólico").
- Si la pregunta pide algo reputacional/sensible, solo reporta hechos citando la fuente, usando lenguaje: "Según [FUENTE]..."
- SIEMPRE incluye un bloque final "Fuentes:" con la lista de URLs que realmente sustentan la respuesta.
`;

  const evidenceBlock = evidence
    .map((e, i) => `Fuente ${i + 1}:\nTITULO: ${e.title}\nURL: ${e.url}\nEXTRACTO: ${e.excerpt}\n`)
    .join("\n");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemRules },
          { text: `Pregunta del usuario: ${question}` },
          { text: `EVIDENCIA (única fuente permitida):\n\n${evidenceBlock}` },
          {
            text:
              `Responde en español, breve y directo.\n` +
              `Formato obligatorio:\n` +
              `- Respuesta: ...\n` +
              `- Fuentes:\n  - <url1>\n  - <url2>\n`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1400,
    },
  };

   const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();

  // Endpoint correcto + API key (Gemini)
  const endpoint =
    `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Gemini error: ${r.status} ${txt}`);
  }

  const data: any = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") ?? "";

  return (text || "").trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const candidate = (searchParams.get("candidate") ?? "").trim();

  if (!q || q.length < 6) {
    return NextResponse.json({ error: "Missing or too short q" }, { status: 400 });
  }

  // Query final: puedes afinar luego (nombre completo, alias, etc.)
  const query = candidate ? `${candidate} ${q}` : q;

  // Cache simple (evita gastar cuotas)
  const cacheFile = cachePathFor(query);
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    // 1) Buscar
    const results = await googleCseSearch(query, 10);

    // 2) Filtrar SOLO dominios permitidos
    const allowed = results.filter((r) => isAllowedUrl(r.url)).slice(0, 6);

    if (!allowed.length) {
      const payload = {
        query,
        answer: "No hay evidencia suficiente en las fuentes consultadas.",
        sources: [],
        rule: "Campo Web: solo fuentes permitidas. Sin evidencia => respuesta estándar.",
      };
      fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), "utf8");
      return NextResponse.json(payload);
    }

    // 3) Descargar extractos (evidencia)
    const evidences: EvidenceChunk[] = [];
    for (const r of allowed) {
      const ev = await fetchEvidence(r.url, r.title);
      if (ev) evidences.push(ev);
      if (evidences.length >= 4) break; // MVP: 3-4 fuentes máximo
    }

    if (!evidences.length) {
      const payload = {
        query,
        answer: "No hay evidencia suficiente en las fuentes consultadas.",
        sources: allowed.map((a) => ({ title: a.title, url: a.url })),
        rule: "Campo Web: sin extractos útiles => respuesta estándar.",
      };
      fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), "utf8");
      return NextResponse.json(payload);
    }

    // 4) Redactar con Gemini usando SOLO evidencia
    const answer = await geminiAnswer(q, evidences);

    // Blindaje final: si Gemini no cumplió, forzamos estándar
    const finalAnswer = answer.includes("No hay evidencia suficiente en las fuentes consultadas")
      ? "No hay evidencia suficiente en las fuentes consultadas."
      : answer;

    const payload = {
      query,
      answer: finalAnswer,
      sources: evidences.map((e) => ({ title: e.title, url: e.url })),
      rule: "Campo Web: solo evidencia de fuentes permitidas + respuesta con URLs. Si no hay evidencia => estándar.",
    };

    fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), "utf8");
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "ask/web failed" }, { status: 500 });
  }
}

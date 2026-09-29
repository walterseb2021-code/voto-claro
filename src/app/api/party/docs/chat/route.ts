// src/app/api/party/docs/chat/route.ts
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
import { loadPartyDocsFromPublic } from "@/lib/partyDocs/loadPartyDocs";
import { retrieveRelevantChunks } from "@/lib/partyDocs/retrieve";

type Mode = "STRICT" | "SUMMARY";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_QUESTION_CHARS = 6000;
const REQUEST_KEYS = new Set(["partyId", "mode", "question"]);
const ALLOWED_PARTY_IDS = new Set(["app", "perufederal"]);
const VALID_MODES = new Set<Mode>(["STRICT", "SUMMARY"]);
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

   function normalizeText(input: string) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildLocalFallbackAnswer(params: {
  partyId: string;
  mode: Mode;
  question: string;
  chunks: any[];
  docs: any[];
}) {
  const { partyId, question, chunks, docs } = params;

  const partyName =
    partyId === "app"
      ? "Alianza para el Progreso"
      : partyId === "perufederal"
      ? "Perú Federal"
      : "el partido";

  const q = normalizeText(question);

  const usableChunks = Array.isArray(chunks) && chunks.length > 0
    ? chunks.slice(0, 5)
    : [];

  if (usableChunks.length > 0) {
    const body = usableChunks
      .map((c: any, i: number) => {
        const title = String(c.title || `Documento ${i + 1}`).trim();
        const topic = String(c.topic || "").trim();
        const text = String(c.text || "").replace(/\s+/g, " ").trim();

        return (
          `${i + 1}. ${title}${topic ? ` — ${topic}` : ""}\n` +
          `${text || "Sin texto disponible."}`
        );
      })
      .join("\n\n");

    return (
      `Según los documentos base disponibles de ${partyName}, encontré esta información relacionada:\n\n` +
      body +
      `\n\nEsta respuesta se generó desde el respaldo local porque la IA no estuvo disponible.`
    );
  }

  const docsSummary = Array.isArray(docs)
    ? docs.slice(0, 3).map((d: any, i: number) => {
        const title = String(d.title || `Documento ${i + 1}`).trim();

        const principles = Array.isArray(d.principles)
          ? d.principles
              .slice(0, 4)
              .map((p: any) => `- ${String(p.principle || p.title || p.name || "").trim()}`)
              .filter((x: string) => x !== "-")
              .join("\n")
          : "";

        const sections = Array.isArray(d.sections)
          ? d.sections
              .slice(0, 4)
              .map((s: any) => {
                const name = String(s.name || s.title || "").trim();
                const summary = String(s.summary || s.text || "").trim();
                return name || summary ? `- ${name}${summary ? `: ${summary}` : ""}` : "";
              })
              .filter(Boolean)
              .join("\n")
          : "";

        return (
          `${i + 1}. ${title}\n` +
          `${principles ? `Principios:\n${principles}\n` : ""}` +
          `${sections ? `Secciones:\n${sections}` : ""}`
        ).trim();
      }).filter(Boolean).join("\n\n")
    : "";

  const asksIdeology =
    q.includes("ideologia") ||
    q.includes("doctrina") ||
    q.includes("principios") ||
    q.includes("bases");

  const asksProposal =
    q.includes("propuesta") ||
    q.includes("plan") ||
    q.includes("programa") ||
    q.includes("educacion") ||
    q.includes("salud") ||
    q.includes("seguridad") ||
    q.includes("economia") ||
    q.includes("corrupcion") ||
    q.includes("descentralizacion");

  if (docsSummary) {
    return (
      `No encontré un fragmento específico para esa pregunta, pero estos son los documentos base disponibles de ${partyName}:\n\n` +
      docsSummary +
      `\n\n${asksIdeology || asksProposal
        ? "Si quieres una respuesta más precisa, pregunta por un eje concreto, por ejemplo: educación, seguridad, economía, salud, corrupción o descentralización."
        : "Puedes hacer una pregunta más concreta sobre uno de esos puntos."}\n\n` +
      "Esta respuesta se generó desde el respaldo local porque la IA no estuvo disponible."
    );
  }

  return (
    `Ese punto aún no está desarrollado en los documentos base disponibles de ${partyName}.\n\n` +
    "Esta respuesta se generó desde el respaldo local."
  );
}
export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);

    if (
      !body ||
      Object.keys(body).some((key) => !REQUEST_KEYS.has(key))
    ) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const rawPartyId =
      body.partyId === undefined ? "perufederal" : body.partyId;
    const rawMode = body.mode === undefined ? "SUMMARY" : body.mode;

    if (
      typeof rawPartyId !== "string" ||
      typeof rawMode !== "string" ||
      typeof body.question !== "string"
    ) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const partyId = rawPartyId.trim().toLowerCase();
    const normalizedMode = rawMode.trim().toUpperCase();
    const question = body.question.trim();

    if (
      !ALLOWED_PARTY_IDS.has(partyId) ||
      !VALID_MODES.has(normalizedMode as Mode) ||
      !question ||
      question.length > MAX_QUESTION_CHARS
    ) {
      return NextResponse.json(
        { ok: false, error: "request_invalid" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const mode = normalizedMode as Mode;

    // 1) Cargar docs JSON oficiales
    const docs = await loadPartyDocsFromPublic(partyId);
    if (!docs.length) {
      return NextResponse.json(
        { ok: false, error: "party_docs_unavailable" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // 2) Recuperar chunks relevantes
    const chunks = retrieveRelevantChunks(docs, question);

    const context =
      chunks.length > 0
        ? chunks
            .map((c, i) => {
              const head = `${i + 1}) [${c.title}]` + (c.topic ? ` (${c.topic})` : "");
              return `${head}\n${c.text}`;
            })
            .join("\n\n")
        : docs
            .slice(0, 3)
            .map((d, i) => {
              const principles = (d.principles || [])
                .slice(0, 4)
                .map((p: any) => `- ${p.principle}`)
                .join("\n");

              const sections = (d.sections || [])
                .slice(0, 4)
                .map((s: any) => `- ${s.name}: ${s.summary}`)
                .join("\n");

              return `${i + 1}) [${d.title}]
Principios:
${principles || "- (sin principios)"}

Secciones:
${sections || "- (sin secciones)"}`;
            })
            .join("\n\n");

    // 3) Key SOLO server-side
        const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: true,
          partyId,
          mode,
          answer: buildLocalFallbackAnswer({
            partyId,
            mode,
            question,
            chunks,
            docs,
          }),
          fallback: "LOCAL_JSON",
        },
        { headers: NO_STORE_HEADERS }
      );
    }
    // 🔒 Límite de seguridad para evitar payload excesivo
    const MAX_CONTEXT_CHARS = 12000;
    const safeContext =
      context.length > MAX_CONTEXT_CHARS
        ? context.slice(0, MAX_CONTEXT_CHARS) + "\n\n[Contenido recortado por límite técnico]"
        : context;

    const ipFingerprint = getAiAnswerIpFingerprint(req);

    if (ipFingerprint.ok) {
      const rateLimit = await consumeAiAnswerRateLimit(ipFingerprint.value);

      if (!rateLimit.ok || !rateLimit.allowed) {
        return NextResponse.json(
          {
            ok: true,
            partyId,
            mode,
            answer: buildLocalFallbackAnswer({
              partyId,
              mode,
              question,
              chunks,
              docs,
            }),
            fallback: "LOCAL_JSON",
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    } else {
      return NextResponse.json(
        {
          ok: true,
          partyId,
          mode,
          answer: buildLocalFallbackAnswer({
            partyId,
            mode,
            question,
            chunks,
            docs,
          }),
          fallback: "LOCAL_JSON",
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // 4) Reglas anti-invento + estilo humano
    const system = `
Eres Federalito, asistente oficial del partido. Conversas de manera humana, clara y cercana.

Reglas absolutas:
- Responde SOLO usando el CONTEXTO OFICIAL proporcionado (documentos base del partido).
- No inventes información, cifras, nombres, promesas ni supuestos.
- Si algo no está en el contexto, di con honestidad: "Ese punto aún no está desarrollado en nuestros documentos base."
- No uses números de página, ni artículos, ni códigos técnicos, ni IDs internos.
- Evita enumeraciones largas; prioriza explicación natural.
- Usa conectores conversacionales: "mira", "te explico", "en simple", "desde nuestra visión".

Modo STRICT:
- Sé más preciso y pegado al contenido del contexto.
- Refuerza con frases como: "según nuestros documentos base", "en coherencia con nuestra línea programática".
- Si falta información, dilo sin rellenar con suposiciones.

Modo SUMMARY:
- Mantén una conversación fluida, cálida y directa.
- Explica ideas en simple sin formalismos.
- Mantén coherencia con el contexto sin mencionarlo como si fuera un documento.
`.trim();

    const user = `
MODO=${mode}
PREGUNTA=${question}

CONTEXTO OFICIAL (docs del partido):
${safeContext}
`.trim();

    // 5) Gemini con fallback real
    async function callGemini(model: string) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;

      return fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
          generationConfig: {
            temperature: mode === "STRICT" ? 0.2 : 0.6,
          },
        }),
      });
    }

    const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();

    let data: any = {};

    try {
      const resp = await callGemini(model);
      data = await safeJson(resp);

      if (!resp.ok) {
        console.error("[party-docs] Gemini request failed", resp.status);

        return NextResponse.json(
          {
            ok: true,
            partyId,
            mode,
            answer: buildLocalFallbackAnswer({
              partyId,
              mode,
              question,
              chunks,
              docs,
            }),
            fallback: "LOCAL_JSON",
          },
          { headers: NO_STORE_HEADERS }
        );
      }
    } catch {
      console.error("[party-docs] Gemini request failed");

      return NextResponse.json(
        {
          ok: true,
          partyId,
          mode,
          answer: buildLocalFallbackAnswer({
            partyId,
            mode,
            question,
            chunks,
            docs,
          }),
          fallback: "LOCAL_JSON",
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text)
        .join("")
        ?.trim() || "";
    if (!text) {
      return NextResponse.json(
        {
          ok: true,
          partyId,
          mode,
          answer: buildLocalFallbackAnswer({
            partyId,
            mode,
            question,
            chunks,
            docs,
          }),
          fallback: "LOCAL_JSON",
        },
        { headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      {
        ok: true,
        partyId,
        mode,
        answer: text,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    console.error("[party-docs] request failed");
    return NextResponse.json(
      { ok: false, error: "party_docs_unavailable" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

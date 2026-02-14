// src/app/api/party/docs/chat/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { loadPartyDocsFromPublic } from "@/lib/partyDocs/loadPartyDocs";
import { retrieveRelevantChunks } from "@/lib/partyDocs/retrieve";

type Mode = "STRICT" | "SUMMARY";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const partyId = String(body.partyId ?? "perufederal");
    const mode = (String(body.mode ?? "SUMMARY").toUpperCase() as Mode) || "SUMMARY";
    const question = String(body.question ?? "").trim();

    if (!question) {
      return NextResponse.json({ ok: false, error: "Falta question" }, { status: 400 });
    }

    // 1) Cargar docs JSON oficiales
    const docs = await loadPartyDocsFromPublic(partyId);
    if (!docs.length) {
      return NextResponse.json(
        { ok: false, error: `No hay docs JSON en /public/party/${partyId}/docs/` },
        { status: 404 }
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
      return NextResponse.json({ ok: false, error: "Falta GEMINI_API_KEY" }, { status: 500 });
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
${context}
`.trim();

    // 5) Llamada Gemini con fallback por 403
  async function callGemini(model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: {
        temperature: mode === "STRICT" ? 0.2 : 0.6,
      },
    }),
  });
}

    const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
let resp = await callGemini(model);
  
  const data = await resp.json().catch(() => ({}));

if (!resp.ok) {
  console.log("🧪 PARTY DOCS → GEMINI HTTP STATUS:", resp.status);
  console.log("🧪 PARTY DOCS → GEMINI ERROR BODY:", JSON.stringify(data).slice(0, 2000));

  return NextResponse.json(
    {
      ok: false,
      error: `Gemini error HTTP ${resp.status}`,
      gemini_message: (data as any)?.error?.message ?? null,
      raw: data,
    },
    { status: 502 }
  );
}
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("")?.trim() || "";

    if (!text) {
      return NextResponse.json({ ok: false, error: "Gemini no devolvió texto", raw: data }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      partyId,
      mode,
      answer: text,
      chunks_used: chunks.length,
      docs_loaded: docs.map((d: any) => ({ doc_id: d.doc_id, title: d.title, updated_at: d.updated_at }))
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}

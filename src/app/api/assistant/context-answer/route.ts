import { NextResponse } from "next/server";
import {
  getPageIdFromPathname,
  getPageProfile,
  normalizePageId,
} from "@/lib/assistant/pageProfiles";
import { sanitizeAssistantTextForUi } from "@/lib/assistant/sanitizeAssistantText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  question?: string;
  pathname?: string;
  pageContext?: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeJson(value: unknown, maxLength = 8000): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n...[recortado]`;
  } catch {
    return "{}";
  }
}

function pickContextFields(
  pageContext: Record<string, unknown>,
  priorityFields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of priorityFields) {
    if (key in pageContext) {
      result[key] = pageContext[key];
    }
  }

  const commonKeys = [
    "pageId",
    "pageTitle",
    "pageSubtitle",
    "activeViewId",
    "activeViewTitle",
    "activeBlockId",
    "activeBlockTitle",
    "currentLevel",
    "currentStep",
    "breadcrumb",
    "openPanels",
    "visibleSections",
    "visibleActions",
    "selectedOption",
    "selectedOptions",
    "selectedItem",
    "selectedItems",
    "selectedCategory",
    "selectedSubcategory",
    "selectedTopic",
    "selectedComment",
    "selectedParty",
    "selectedRound",
    "resultsSummary",
    "speakableSummary",
    "contextVersion",
  ];

  for (const key of commonKeys) {
    if (key in pageContext && !(key in result)) {
      result[key] = pageContext[key];
    }
  }

  return result;
}

function buildFocusSummary(pageContext: Record<string, unknown>): string {
  const breadcrumb = Array.isArray(pageContext.breadcrumb)
    ? pageContext.breadcrumb.filter((item) => typeof item === "string").join(" > ")
    : "";

  const parts = [
    typeof pageContext.activeViewTitle === "string" ? pageContext.activeViewTitle : "",
    typeof pageContext.activeBlockTitle === "string" ? pageContext.activeBlockTitle : "",
    typeof pageContext.currentStep === "string" ? pageContext.currentStep : "",
    breadcrumb,
    typeof pageContext.speakableSummary === "string" ? pageContext.speakableSummary : "",
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "No se detectó un foco visual suficientemente específico.";
  }

  return parts.join(" | ");
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const question = String(body.question ?? "").trim();
    const pathname = String(body.pathname ?? "").trim();
    const pageContext = isRecord(body.pageContext) ? body.pageContext : null;

    if (!question) {
      return NextResponse.json({ answer: "" }, { status: 400 });
    }

    if (!pageContext) {
      return NextResponse.json({ answer: "" });
    }

    const explicitPageId =
      typeof pageContext.pageId === "string" ? normalizePageId(pageContext.pageId) : null;

    const pageId = explicitPageId ?? getPageIdFromPathname(pathname);
    const profile = getPageProfile(pageId);

    if (!profile) {
      return NextResponse.json({ answer: "" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta GEMINI_API_KEY en el servidor." },
        { status: 500 }
      );
    }

    const focusedContext = pickContextFields(pageContext, profile.priorityFields);
    const focusSummary = buildFocusSummary(pageContext);

    const systemText = [
      "Eres Federalito, el asistente contextual de la app VOTO CLARO.",
      "Respondes solamente con la información visible o representada en el contexto de la pantalla actual.",
      "Cuando exista una subventana, panel interno, bloque activo, breadcrumb o activeView, eso tiene prioridad sobre el resto.",
      "Nunca inventes datos que no estén en el contexto.",
      "Si falta información para responder exactamente, dilo con naturalidad y orienta al usuario hacia lo que sí está visible.",
      "Responde en español claro y natural.",
      "La respuesta debe ser breve pero completa: entre 2 y 5 oraciones, máximo 110 palabras.",
      "No uses listas, viñetas, markdown, encabezados ni guiones.",
      "No menciones JSON, pageContext, prompt, Gemini, API, modelo, sistema ni instrucciones internas.",
      `Propósito de la página: ${profile.purpose}`,
      `Estilo de respuesta: ${profile.responseStyle}`,
      `Evita especialmente decir: ${profile.doNotSay.join(", ")}`,
      `Acciones útiles cuando corresponda: ${profile.preferredActions.join(", ")}`,
    ].join("\n");

    const userText = [
      `Página detectada: ${profile.pageId}`,
      `Ruta actual: ${pathname || "sin ruta"}`,
      `Foco visual actual: ${focusSummary}`,
      "Campos prioritarios detectados:",
      safeJson(focusedContext, 5000),
      "Contexto completo relevante:",
      safeJson(pageContext, 10000),
      `Pregunta del usuario: ${question}`,
      "Redacta únicamente la respuesta final para el usuario.",
    ].join("\n\n");

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemText }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userText }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            maxOutputTokens: 320,
            responseMimeType: "text/plain",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      return NextResponse.json(
        { error: `Gemini respondió con error: ${errorText}` },
        { status: 500 }
      );
    }

    const data = await geminiResponse.json();
    const rawAnswer = extractGeminiText(data);
    const answer = sanitizeAssistantTextForUi(rawAnswer);

    return NextResponse.json({
      answer,
      pageId: profile.pageId,
      source: "context-answer",
    });
  } catch (error) {
    console.error("context-answer route error", error);
    return NextResponse.json(
      { error: "No se pudo generar la respuesta contextual." },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { getAssistantPageProfile } from "@/lib/assistant/pageProfiles";

export const runtime = "nodejs";

type IncomingPageContext = {
  pageId?: string;
  pageTitle?: string;
  route?: string;
  summary?: string;
  activeSection?: string;
  visibleText?: string;
  availableActions?: string[];
  selectedItemTitle?: string;
  status?: string;
  dynamicData?: Record<string, unknown>;
};

function cleanString(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.map((x) => stringifyValue(x)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return "";
}

function buildPriorityDataBlock(
  dynamicData: Record<string, unknown> | undefined,
  priorityFields: string[]
) {
  if (!dynamicData || typeof dynamicData !== "object") return "";

  const lines = priorityFields
    .map((key) => {
      const raw = dynamicData[key];
      const text = stringifyValue(raw);
      return text ? `${key}: ${text}` : "";
    })
    .filter(Boolean);

  return lines.join("\n");
}

function buildPrompt(params: {
  question: string;
  pathname: string;
  pageContext: IncomingPageContext;
}) {
  const { question, pathname, pageContext } = params;
  const profile = getAssistantPageProfile(pageContext.pageId);

  const availableActions = Array.isArray(pageContext.availableActions)
    ? pageContext.availableActions.filter(Boolean).join(", ")
    : "";

  const priorityData = buildPriorityDataBlock(
    pageContext.dynamicData,
    profile?.priorityFields ?? []
  );

  const doNotSay = (profile?.doNotSay ?? []).join(" | ");
  const preferredActions = (profile?.preferredActions ?? []).join(", ");

  return `
Eres Federalito, un asistente dentro de una aplicación web llamada VOTO CLARO.

Tu trabajo es responder SOLO con base en el contexto real de la ventana actual.
No inventes información.
No menciones estructuras internas ni nombres técnicos del sistema.
No repitas literalmente dumps del contexto.
No digas frases como: ${doNotSay || "Pantalla, Resumen, Datos actuales"}.
No digas "interpreté tu pregunta".
No respondas como programador.
Responde como guía práctico de la app, en español claro, natural y útil.

Si el contexto visible no alcanza para responder exactamente, dilo con honestidad y orienta al usuario según las acciones visibles.
Si el usuario pregunta qué puede hacer, responde con lenguaje natural, no con listas con guiones salvo que sea realmente necesario.
Evita símbolos raros o formato que suene mal leído por voz.

PERFIL DE LA PÁGINA
Page ID: ${cleanString(pageContext.pageId)}
Propósito: ${cleanString(profile?.purpose)}
Estilo de respuesta: ${cleanString(profile?.responseStyle)}
Acciones preferidas: ${preferredActions}

CONTEXTO ACTUAL DE LA VENTANA
Ruta actual: ${cleanString(pathname)}
Título: ${cleanString(pageContext.pageTitle)}
Resumen: ${cleanString(pageContext.summary)}
Sección activa: ${cleanString(pageContext.activeSection)}
Elemento seleccionado: ${cleanString(pageContext.selectedItemTitle)}
Estado: ${cleanString(pageContext.status)}
Acciones visibles: ${availableActions}
Texto visible resumido:
${cleanString(pageContext.visibleText)}

DATOS PRIORITARIOS DE ESTA VENTANA
${priorityData || "Sin datos prioritarios visibles."}

PREGUNTA DEL USUARIO
${cleanString(question)}

INSTRUCCIÓN FINAL
Devuelve una sola respuesta breve o media, útil y natural, basada únicamente en el contexto visible de esta ventana.
`.trim();
}

async function callGemini(prompt: string) {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en .env.local");

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 300,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const raw = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      raw?.error?.message ||
      raw?.message ||
      `Gemini error HTTP ${res.status}`;
    throw new Error(msg);
  }

  const text = String(
    raw?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") ?? ""
  ).trim();

  return text;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = cleanString(body?.question);
    const pathname = cleanString(body?.pathname);
    const pageContext = (body?.pageContext ?? {}) as IncomingPageContext;

    if (!question) {
      return NextResponse.json(
        { ok: false, error: "Falta question." },
        { status: 400 }
      );
    }

    if (!pageContext?.pageId) {
      return NextResponse.json(
        {
          ok: true,
          answer:
            "No tengo suficiente contexto visible de esta ventana para responder con seguridad.",
        },
        { status: 200 }
      );
    }

    const prompt = buildPrompt({ question, pathname, pageContext });
    const answer = await callGemini(prompt);

    return NextResponse.json({
      ok: true,
      answer:
        cleanString(answer) ||
        "No pude generar una respuesta útil para esta ventana.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error inesperado en context-answer.",
      },
      { status: 500 }
    );
  }
}
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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function getNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function truncateText(value: string, max = 240): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function finalizeAssistantAnswer(rawAnswer: string): string {
  let answer = sanitizeAssistantTextForUi(rawAnswer);

  if (!answer) return "";

  const danglingWords = new Set([
    "donde",
    "porque",
    "aunque",
    "si",
    "cuando",
    "para",
    "con",
    "sobre",
    "y",
    "o",
    "que",
  ]);

  const words = answer.split(/\s+/).filter(Boolean);
  const lastWord = words.length ? words[words.length - 1].toLowerCase() : "";

  if (danglingWords.has(lastWord)) {
    words.pop();
    answer = words.join(" ").trim();
  }

  answer = answer.replace(/[,:;]\s*$/, "").trim();

  if (answer && !/[.!?]$/.test(answer)) {
    answer = `${answer}.`;
  }

  return answer;
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
    "route",
    "summary",
    "activeSection",
    "activeViewId",
    "activeViewTitle",
    "activeBlockId",
    "activeBlockTitle",
    "currentLevel",
    "currentStep",
    "breadcrumb",
    "openPanels",
    "visibleText",
    "visibleSections",
    "availableActions",
    "visibleActions",
    "selectedItemTitle",
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
    "status",
    "dynamicData",
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

  const visibleText = truncateText(getString(pageContext.visibleText), 220);

  const parts = [
    getString(pageContext.activeViewTitle),
    getString(pageContext.activeBlockTitle),
    getString(pageContext.pageTitle),
    getString(pageContext.selectedItemTitle),
    getString(pageContext.summary),
    getString(pageContext.activeSection),
    getString(pageContext.currentStep),
    breadcrumb,
    getString(pageContext.speakableSummary),
    visibleText ? `Visible: ${visibleText}` : "",
    getString(pageContext.status) ? `Estado: ${getString(pageContext.status)}` : "",
  ].filter(Boolean);

  if (!parts.length) {
    return "No se detectó un foco visual suficientemente específico.";
  }

  return parts.join(" | ");
}

function buildCommentDomainGuidance(
  pageId: string,
  pageContext: Record<string, unknown>,
  pathname: string
): string {
  const route = getString(pageContext.route) || pathname;
  const activeSection = getString(pageContext.activeSection);
  const activeViewTitle = getString(pageContext.activeViewTitle);
  const visibleActions = getStringList(pageContext.visibleActions);
  const availableActions = getStringList(pageContext.availableActions);
  const dynamicData = getRecord(pageContext.dynamicData);

  const accesoVerificado = getBoolean(dynamicData?.accesoVerificado);
  const checkingData = getBoolean(dynamicData?.checkingData);
  const weeklyTopic = getString(dynamicData?.weeklyTopic);
  const weeklyQuestion = getString(dynamicData?.weeklyQuestion);
  const videosAprobadosCount = getNumber(dynamicData?.videosAprobadosCount);
  const videosEnVotacionCount = getNumber(dynamicData?.videosEnVotacionCount);
  const preguntasFundadorCount = getNumber(dynamicData?.preguntasFundadorCount);
  const forosAbiertosCount = getNumber(dynamicData?.forosAbiertosCount);
  const registroUnicoApp = getBoolean(dynamicData?.registroUnicoApp);
  const codigoUnicoPorParticipante = getBoolean(dynamicData?.codigoUnicoPorParticipante);
  const mismoCodigoEnTodoElApp = getBoolean(dynamicData?.mismoCodigoEnTodoElApp);
  const requiereRegistroPrevioAntesDeUsarCodigo = getBoolean(
    dynamicData?.requiereRegistroPrevioAntesDeUsarCodigo
  );

  const lines = [
    "Nunca mezcles esta ruta con Espacio Emprendedor, Proyecto Ciudadano, Intención de Voto, Reto Ciudadano ni candidatos.",
    "No respondas con frases genéricas si el contexto ya muestra un bloque específico activo.",
    "Si el usuario pregunta por una sección concreta como comentario, video, votación, pregunta al fundador o foro, responde sobre ese bloque y no sobre la ventana en general.",
    "Si la pregunta compara dos bloques de la misma ventana, explica la diferencia de forma directa y explícita.",
  ];

  if (pageId === "comentario-ciudadano" || route === "/comentarios") {
    lines.push(
      "En Comentarios Ciudadanos principal, distingue claramente entre acceso de participación, tema semanal, comentario ciudadano, videos aprobados, votación semanal, pregunta al fundador, historial y foros abiertos."
    );
    lines.push(
      "Cuando el usuario pregunte cómo participar, explica el flujo real: registro único del app, obtención de código único y uso de ese mismo código en otras ventanas cuando haga falta."
    );
    lines.push(
      "No digas ni sugieras que basta con guardar correo o celular dentro de esta pantalla para habilitar la participación."
    );
    lines.push(
      "Si el usuario pregunta por el mismo código, responde con claridad que el registro es único y que el código también es único por participante cuando el contexto lo indique."
    );
    lines.push(
      "Si el usuario pregunta por votación, explica cuántas veces puede votar, qué significa que un video esté en votación y en qué se diferencia de un video solo aprobado."
    );
    lines.push(
      "Si el usuario pregunta por pregunta al fundador, explica quién puede usar ese bloque, cuándo aparece y cuál es su sentido, no solo la cantidad visible."
    );
    lines.push(
      "Si el usuario pregunta por la diferencia entre comentar el tema semanal y participar en foros abiertos, responde comparando ambos bloques de forma concreta."
    );

    if (checkingData) {
      lines.push("Ahora mismo la pantalla está verificando si existe una sesión activa de participante.");
    }

    if (!checkingData && !accesoVerificado) {
      lines.push(
        "El contexto actual muestra modo observador. Debes responder desde ese estado y aclarar que la participación activa todavía no está habilitada."
      );
    }

    if (accesoVerificado) {
      lines.push(
        "El contexto actual muestra acceso habilitado. Puedes responder que ya puede comentar, enviar video, votar y participar en foros si esos bloques están visibles."
      );
    }

    if (weeklyTopic) {
      lines.push(`Tema semanal visible: ${weeklyTopic}.`);
    }

    if (weeklyQuestion) {
      lines.push(`Pregunta guía visible: ${weeklyQuestion}.`);
    }

    lines.push(`Videos aprobados visibles: ${videosAprobadosCount}.`);
    lines.push(`Videos en votación visibles: ${videosEnVotacionCount}.`);
    lines.push(`Preguntas al fundador visibles: ${preguntasFundadorCount}.`);
    lines.push(`Foros abiertos visibles: ${forosAbiertosCount}.`);

    if (
      registroUnicoApp &&
      codigoUnicoPorParticipante &&
      mismoCodigoEnTodoElApp &&
      requiereRegistroPrevioAntesDeUsarCodigo
    ) {
      lines.push(
        "El contexto confirma registro único del app, código único por participante y uso del mismo código en todo el ecosistema."
      );
    }
  }

  if (pageId === "comentarios-foro-ciudadano" || route.includes("/comentarios/foro/")) {
    lines.push(
      "En Foro Ciudadano, responde desde el tema archivado abierto actual y no como si fuera la pantalla principal de Comentarios."
    );
    lines.push(
      "Distingue entre leer el foro en modo observador, habilitar acceso para participar, definir alias del foro y publicar dentro del debate."
    );
    lines.push(
      "Si el usuario pregunta de qué trata este foro, usa el tema visible, la pregunta guía visible y el estado actual del acceso."
    );
    lines.push(
      "Si el usuario pregunta cómo participar en el foro, explica que primero debe existir el registro único del app y luego puede usar su mismo código si hace falta."
    );
    lines.push(
      "Si el usuario pregunta qué diferencia hay entre el comentario semanal y el foro, aclara que el comentario semanal responde al tema activo de la semana y el foro profundiza un tema archivado ya abierto al debate."
    );
    lines.push(
      "Si el usuario pregunta qué tipo de aporte conviene hacer aquí, responde orientando a debate, argumento, análisis y aporte de conocimiento político, solo con base en lo visible."
    );
  }

  if (activeViewTitle) {
    lines.push(`Vista activa detectada: ${activeViewTitle}.`);
  }

  if (activeSection) {
    lines.push(`Sección activa detectada: ${activeSection}.`);
  }

  if (visibleActions.length) {
    lines.push(`Acciones visibles detectadas: ${visibleActions.join(", ")}.`);
  } else if (availableActions.length) {
    lines.push(`Acciones disponibles detectadas: ${availableActions.join(", ")}.`);
  }

  return lines.join("\n");
}

function buildPageSpecificGuidance(
  pageId: string,
  pageContext: Record<string, unknown>,
  pathname: string
): string {
  const route = getString(pageContext.route) || pathname;
  const activeSection = getString(pageContext.activeSection);
  const visibleActions = getStringList(pageContext.visibleActions);
  const availableActions = getStringList(pageContext.availableActions);

  if (pageId.startsWith("espacio-emprendedor")) {
    const lines = [
      "Nunca mezcles esta ruta con lógica de candidatos ni con otras ventanas externas de la app.",
      "Si el usuario pregunta qué puede hacer aquí, cómo empezar o para qué sirve esta pantalla, responde con 1 o 2 frases cortas usando solo la pantalla actual y acciones visibles. No hagas introducciones largas.",
      "Si la información pedida pertenece a otra subventana del mismo dominio y aquí no está visible, dilo brevemente y deriva a la subventana correcta dentro de Espacio Emprendedor.",
      "Derivaciones internas válidas: filtros, búsqueda, categoría o departamento -> Explorar; empresa, rango de inversión o preferencias -> Perfil inversionista; formulario, PDF o envío -> Nuevo proyecto; hilos privados, inversionista, privacidad o último mensaje -> Detalle del proyecto.",
    ];

    if (pageId === "espacio-emprendedor-proyecto-detalle" || route.includes("/espacio-emprendedor/proyectos/")) {
      lines.push(
        "En detalle de proyecto, distingue con claridad entre detalle público, lista de hilos e hilo privado abierto."
      );
      lines.push(
        "Si la vista activa es lista de hilos, no hables como si hubiera un hilo abierto."
      );
      lines.push(
        "Si la vista activa es pública, aclara que visitantes no ven conversación privada."
      );
      lines.push(
        "Si hay datos del último mensaje o del inversionista visible, úsalos textualmente y con precisión."
      );
    }

    if (pageId === "espacio-emprendedor-explorar" || route.includes("/espacio-emprendedor/explorar")) {
      lines.push(
        "En Explorar, prioriza filtros aplicados, búsqueda activa, cantidad de proyectos visibles, categoría y departamento."
      );
    }

    if (
      pageId === "espacio-emprendedor-perfil-inversionista" ||
      route.includes("/espacio-emprendedor/perfil-inversionista")
    ) {
      lines.push(
        "En Perfil inversionista, prioriza empresa, rango de inversión, categorías, departamentos, notify_email y estado de guardado."
      );
    }

    if (
      pageId === "espacio-emprendedor-nuevo-proyecto" ||
      route.includes("/espacio-emprendedor/nuevo-proyecto")
    ) {
      lines.push(
        "En Nuevo proyecto, prioriza el estado del formulario, campos llenos, PDF cargado y resultado del envío."
      );
    }

    if (pageId === "espacio-emprendedor" && !route.includes("/espacio-emprendedor/")) {
      lines.push(
        "En la pantalla principal del espacio emprendedor, si preguntan por filtros, perfil inversionista, nuevo proyecto o hilos privados, explica brevemente que eso se ve en otra subventana y nombra cuál es."
      );
    }

    return lines.join("\n");
  }

  if (pageId.startsWith("proyecto-ciudadano")) {
    const lines = [
      "Nunca mezcles esta ruta con Espacio Emprendedor, comentarios, intención de voto o candidatos.",
      "Si el usuario pregunta qué puede hacer aquí, cómo empezar o para qué sirve esta pantalla, responde con 1 o 2 frases cortas usando solo la pantalla actual y acciones visibles.",
      "Si la información pedida pertenece a otra subventana del mismo dominio y aquí no está visible, dilo brevemente y deriva a la subventana correcta dentro de Proyecto Ciudadano.",
      "Derivaciones internas válidas: registro, código de acceso o datos personales -> Registro; formulario, PDF, categoría, departamento o envío del proyecto -> Nuevo proyecto; filtros, búsqueda, departamentos o lista visible -> Proyectos; apoyos, líder, PDF o foro del proyecto -> Detalle del proyecto.",
    ];

    if (pageId === "proyecto-ciudadano" && !route.includes("/proyecto-ciudadano/")) {
      lines.push(
        "En la pantalla principal de Proyecto Ciudadano, si preguntan por registro, presentar proyecto, filtros de proyectos, apoyo o foro, explica brevemente que eso se ve en otra subventana y nombra cuál es."
      );
      lines.push(
        "Prioriza si el usuario ya aparece como participante registrado, si puede presentar proyectos y si hay acceso visible a ver proyectos activos."
      );
    }

    if (
      pageId === "proyecto-ciudadano-registro" ||
      route.includes("/proyecto-ciudadano/registro")
    ) {
      lines.push(
        "En Registro, prioriza estado del formulario, campos faltantes, validaciones visibles, error visible, éxito de registro y código de acceso generado."
      );
      lines.push(
        "Si el registro ya fue exitoso, orienta al siguiente paso visible sin repetir instrucciones largas."
      );
    }

    if (
      pageId === "proyecto-ciudadano-nuevo-proyecto" ||
      route.includes("/proyecto-ciudadano/nuevo-proyecto")
    ) {
      lines.push(
        "En Nuevo proyecto, prioriza estado del formulario, categoría, departamento, PDF cargado, ciclo activo, error visible y resultado del envío."
      );
      lines.push(
        "Si el usuario no aparece habilitado para presentar proyecto, dilo brevemente y orienta a registro si esa acción está indicada por el contexto."
      );
    }

    if (
      pageId === "proyecto-ciudadano-proyectos" ||
      route.includes("/proyecto-ciudadano/proyectos")
    ) {
      lines.push(
        "En Proyectos, prioriza filtro de departamento, búsqueda activa, cantidad de proyectos visibles, resultados vacíos, carga o error."
      );
      lines.push(
        "Si el usuario pregunta por un proyecto concreto y no está visible en el listado actual, responde solo con lo que muestra la lista actual."
      );
    }

    if (
      pageId === "proyecto-ciudadano-proyecto-detalle" ||
      route.includes("/proyecto-ciudadano/proyectos/")
    ) {
      lines.push(
        "En Detalle del proyecto, diferencia claramente entre información del proyecto, bloque de apoyo y foro."
      );
      lines.push(
        "Prioriza nombre del proyecto, categoría, ubicación, líder visible, cantidad de apoyos, PDF disponible, estado de apoyo del usuario y actividad visible del foro."
      );
      lines.push(
        "Si el usuario pregunta por apoyar o comentar y no está registrado, aclara brevemente ese límite solo si el contexto visible lo muestra."
      );
    }

    if (activeSection) {
      lines.push(`Sección activa detectada: ${activeSection}.`);
    }

    if (visibleActions.length) {
      lines.push(`Acciones visibles detectadas: ${visibleActions.join(", ")}.`);
    } else if (availableActions.length) {
      lines.push(`Acciones disponibles detectadas: ${availableActions.join(", ")}.`);
    }

    return lines.join("\n");
  }

  if (pageId === "comentario-ciudadano" || pageId === "comentarios-foro-ciudadano") {
    return buildCommentDomainGuidance(pageId, pageContext, pathname);
  }

  return "";
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

    const pathPageId = getPageIdFromPathname(pathname);

    const pageId =
      explicitPageId &&
      explicitPageId !== "espacio-emprendedor" &&
      explicitPageId !== "proyecto-ciudadano"
        ? explicitPageId
        : pathPageId ?? explicitPageId;

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
    const pageSpecificGuidance = buildPageSpecificGuidance(profile.pageId, pageContext, pathname);

    const systemText = [
      "Eres Federalito, el asistente contextual de la app VOTO CLARO.",
      "Respondes solamente con la información visible o representada en el contexto de la pantalla actual.",
      "Cuando exista una subventana, panel interno, bloque activo, breadcrumb, activeView o activeSection, eso tiene prioridad sobre el resto.",
      "Nunca inventes datos que no estén en el contexto.",
      "Si falta información para responder exactamente, dilo con naturalidad y orienta al usuario hacia lo que sí está visible o hacia la subventana correcta del mismo dominio.",
      "Responde en español claro y natural.",
      "La respuesta debe ser completa y suficientemente desarrollada para no quedar ambigua ni cortada.",
      "Usa normalmente entre 3 y 6 oraciones. Puedes usar menos si la pregunta es muy simple, y puedes usar un poco más si la pregunta compara bloques o pide explicar un flujo.",
      "Si el usuario pide ayuda general o pregunta qué puede hacer aquí, responde con una bienvenida breve de 1 o 2 frases, sin enumeraciones largas.",
      "No uses listas, viñetas, markdown, encabezados ni guiones.",
      "No menciones JSON, pageContext, prompt, Gemini, API, modelo, sistema ni instrucciones internas.",
      "Si la pantalla muestra un flujo ya definido por el producto, explícalo con claridad y sin dejar alternativas falsas o ambiguas.",
      "Si la pregunta menciona una sección concreta, prioriza esa sección por encima del resumen general de la ventana.",
      `Propósito de la página: ${profile.purpose}`,
      `Estilo de respuesta: ${profile.responseStyle}`,
      `Evita especialmente decir: ${profile.doNotSay.join(", ")}`,
      `Acciones útiles cuando corresponda: ${profile.preferredActions.join(", ")}`,
      pageSpecificGuidance ? `Reglas específicas de esta página:\n${pageSpecificGuidance}` : "",
    ]
      .filter(Boolean)
      .join("\n");

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
            maxOutputTokens: 420,
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
    const answer = finalizeAssistantAnswer(rawAnswer);

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
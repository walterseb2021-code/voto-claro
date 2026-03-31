export type PageProfile = {
  pageId: string;
  purpose: string;
  responseStyle: string;
  priorityFields: string[];
  doNotSay: string[];
  preferredActions: string[];
};

export const PAGE_PROFILES: Record<string, PageProfile> = {
  "espacio-emprendedor": {
    pageId: "espacio-emprendedor",
    purpose:
      "Ayudar al usuario a entender la ventana actual del espacio emprendedor usando solo el contexto visible y vigente.",
    responseStyle:
      "Natural, claro, útil y breve. Debe responder según el bloque o subventana activa, no con plantilla rígida.",
    priorityFields: [
      "pageTitle",
      "activeViewId",
      "activeViewTitle",
      "breadcrumb",
      "selectedCategory",
      "selectedSubcategory",
      "selectedItem",
      "visibleSections",
      "visibleActions",
      "speakableSummary",
    ],
    doNotSay: [
      "No tengo suficiente información",
      "Como modelo de IA",
      "Según el JSON",
      "No puedo ver tu pantalla",
    ],
    preferredActions: [
      "explicar lo que está abierto ahora",
      "resumir el bloque activo",
      "indicar la acción disponible en esta pantalla",
    ],
  },

  "comentario-ciudadano": {
    pageId: "comentario-ciudadano",
    purpose:
      "Responder preguntas sobre la ventana actual de comentarios, filtros, resultados visibles y acciones disponibles.",
    responseStyle:
      "Conversacional, claro y muy pegado a lo visible en la pantalla actual.",
    priorityFields: [
      "pageTitle",
      "activeViewId",
      "activeViewTitle",
      "breadcrumb",
      "selectedFilter",
      "selectedTopic",
      "selectedComment",
      "visibleComments",
      "visibleSections",
      "visibleActions",
      "speakableSummary",
    ],
    doNotSay: [
      "No tengo acceso",
      "Como asistente",
      "Según la estructura",
      "No puedo leer esa parte",
    ],
    preferredActions: [
      "resumir lo visible",
      "explicar el filtro o comentario activo",
      "orientar sobre la siguiente acción dentro de la misma ventana",
    ],
  },

  "intencion-de-voto": {
    pageId: "intencion-de-voto",
    purpose:
      "Explicar el estado actual de la pantalla de intención de voto, selecciones activas, resultados visibles y acciones posibles.",
    responseStyle:
      "Preciso, natural y enfocado en el estado actual de la votación o del bloque visible.",
    priorityFields: [
      "pageTitle",
      "activeViewId",
      "activeViewTitle",
      "breadcrumb",
      "selectedGroup",
      "selectedParty",
      "selectedRound",
      "resultsSummary",
      "visibleParties",
      "visibleSections",
      "visibleActions",
      "speakableSummary",
    ],
    doNotSay: [
      "No sé",
      "Como modelo",
      "No tengo la data",
      "No puedo ver la interfaz",
    ],
    preferredActions: [
      "aclarar la selección actual",
      "resumir el resultado o bloque visible",
      "indicar el siguiente paso posible en esta pantalla",
    ],
  },

  "reto-ciudadano": {
    pageId: "reto-ciudadano",
    purpose:
      "Responder sobre el reto ciudadano usando el bloque o subventana activa, el nivel actual y las acciones disponibles.",
    responseStyle:
      "Natural, orientado a la pantalla activa y priorizando la subventana abierta sobre el resto del recorrido.",
    priorityFields: [
      "pageTitle",
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
      "speakableSummary",
    ],
    doNotSay: [
      "No puedo ayudarte",
      "Como IA",
      "No tengo contexto",
      "Según la lógica interna",
    ],
    preferredActions: [
      "explicar el nivel o bloque activo",
      "resumir la subventana abierta",
      "guiar a la siguiente acción dentro del reto",
    ],
  },
};

const PATH_ALIASES: Record<string, string> = {
  "/espacio-emprendedor": "espacio-emprendedor",
  "/comentarios": "comentario-ciudadano",
  "/comentario-ciudadano": "comentario-ciudadano",
  "/intencion-de-voto": "intencion-de-voto",
  "/reto-ciudadano": "reto-ciudadano",
};

export function normalizePageId(value?: string | null): string | null {
  if (!value) return null;

  const cleaned = value.toLowerCase().trim();

  if (cleaned === "comentarios") return "comentario-ciudadano";
  if (cleaned === "comentario-ciudadano") return "comentario-ciudadano";

  return cleaned;
}

export function getPageIdFromPathname(pathname?: string | null): string | null {
  if (!pathname) return null;

  const cleanPath = pathname.split("?")[0].split("#")[0];
  if (PATH_ALIASES[cleanPath]) return PATH_ALIASES[cleanPath];

  const firstSegment = `/${cleanPath.split("/").filter(Boolean)[0] ?? ""}`;
  if (PATH_ALIASES[firstSegment]) return PATH_ALIASES[firstSegment];

  return normalizePageId(firstSegment.replace(/^\//, ""));
}

export function getPageProfile(pageIdOrPathname?: string | null): PageProfile | null {
  if (!pageIdOrPathname) return null;

  const normalized = pageIdOrPathname.startsWith("/")
    ? getPageIdFromPathname(pageIdOrPathname)
    : normalizePageId(pageIdOrPathname);

  if (!normalized) return null;

  return PAGE_PROFILES[normalized] ?? null;
}

export function isContextualAssistantPage(pageIdOrPathname?: string | null): boolean {
  return Boolean(getPageProfile(pageIdOrPathname));
}
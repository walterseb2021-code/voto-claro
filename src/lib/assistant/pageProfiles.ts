export type PageProfile = {
  pageId: string;
  purpose: string;
  responseStyle: string;
  priorityFields: string[];
  doNotSay: string[];
  preferredActions: string[];
};

const COMMON_CONTEXT_FIELDS = [
  "pageId",
  "pageTitle",
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
  "selectedItemTitle",
  "selectedCategory",
  "selectedSubcategory",
  "selectedTopic",
  "selectedComment",
  "selectedParty",
  "selectedRound",
  "visibleText",
  "visibleSections",
  "availableActions",
  "visibleActions",
  "status",
  "resultsSummary",
  "speakableSummary",
  "dynamicData",
  "contextVersion",
];

export const PAGE_PROFILES: Record<string, PageProfile> = {
  "espacio-emprendedor": {
    pageId: "espacio-emprendedor",
    purpose:
      "Ayudar al usuario a entender la pantalla principal del espacio emprendedor usando solo el contexto visible y vigente.",
    responseStyle:
      "Natural, claro, útil y breve. Debe responder desde la subventana activa y sin mezclar esta pantalla con otras rutas de la app.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No tengo suficiente información",
      "Como modelo de IA",
      "Según el JSON",
      "No puedo ver tu pantalla",
    ],
    preferredActions: [
      "explicar qué pantalla del espacio emprendedor está abierta",
      "resumir lo visible ahora",
      "indicar la acción disponible en esta pantalla",
      "derivar a una subventana interna correcta cuando la pregunta pertenezca a otra parte del mismo dominio",
    ],
  },

  "espacio-emprendedor-explorar": {
    pageId: "espacio-emprendedor-explorar",
    purpose:
      "Responder desde la subruta Explorar usando filtros visibles, búsqueda activa, cantidad de proyectos y resultados mostrados.",
    responseStyle:
      "Muy contextual, breve y orientado a filtros, búsqueda, categoría, departamento y proyectos visibles.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedCategory",
      "selectedSubcategory",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No tengo acceso",
      "Como asistente",
      "No veo nada",
      "No puedo leer esa parte",
    ],
    preferredActions: [
      "decir qué filtros están aplicados",
      "resumir cuántos proyectos visibles hay",
      "indicar categoría, departamento o búsqueda activa",
    ],
  },

  "espacio-emprendedor-perfil-inversionista": {
    pageId: "espacio-emprendedor-perfil-inversionista",
    purpose:
      "Responder desde la subruta de perfil inversionista usando datos visibles del formulario, rango, preferencias y estado de guardado.",
    responseStyle:
      "Claro, útil y breve. Debe hablar solo del perfil inversionista abierto ahora.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No sé",
      "Como IA",
      "No tengo la data",
      "No puedo ver la interfaz",
    ],
    preferredActions: [
      "resumir el estado del perfil",
      "indicar empresa, rango y preferencias visibles",
      "decir si el guardado aparece exitoso o con error",
    ],
  },

  "espacio-emprendedor-nuevo-proyecto": {
    pageId: "espacio-emprendedor-nuevo-proyecto",
    purpose:
      "Responder desde la subruta de nuevo proyecto usando el estado real del formulario, campos llenos, PDF y estado de envío.",
    responseStyle:
      "Natural, preciso y orientado al formulario visible y al siguiente paso posible.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No puedo ayudarte",
      "Como modelo",
      "No tengo contexto",
      "Según la lógica interna",
    ],
    preferredActions: [
      "decir qué falta en el formulario",
      "confirmar si el PDF está cargado",
      "indicar si el envío fue exitoso o falló",
    ],
  },

  "espacio-emprendedor-proyecto-detalle": {
    pageId: "espacio-emprendedor-proyecto-detalle",
    purpose:
      "Responder desde el detalle de un proyecto emprendedor distinguiendo entre detalle público, lista de hilos privados e hilo privado abierto.",
    responseStyle:
      "Muy contextual, claro y corto. Debe diferenciar bien la vista activa y nunca mezclar hilo abierto con lista de hilos ni exponer información privada que no esté visible.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No tengo suficiente información",
      "Como modelo de IA",
      "No puedo ver tu pantalla",
      "No sé quién escribe",
    ],
    preferredActions: [
      "explicar si el usuario está en detalle público, lista de hilos o hilo privado",
      "decir quién es el inversionista visible si hay hilo abierto",
      "decir fecha y hora del último mensaje visible",
      "indicar cuántos hilos privados hay",
    ],
  },

  "proyecto-ciudadano": {
    pageId: "proyecto-ciudadano",
    purpose:
      "Ayudar al usuario a entender la pantalla principal de Proyecto Ciudadano usando el estado visible de acceso, registro, participación y acciones disponibles.",
    responseStyle:
      "Natural, claro, útil y breve. Debe responder desde la pantalla principal activa sin mezclarla con otras rutas del dominio.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "visibleActions",
      "status",
      "resultsSummary",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No tengo suficiente información",
      "Como modelo de IA",
      "Según el JSON",
      "No puedo ver tu pantalla",
    ],
    preferredActions: [
      "explicar qué pantalla de Proyecto Ciudadano está abierta",
      "resumir lo visible ahora",
      "indicar si el usuario puede registrarse, presentar proyectos o ver proyectos",
      "derivar a la subventana correcta cuando la pregunta pertenezca a otra parte del mismo dominio",
    ],
  },

  "proyecto-ciudadano-registro": {
    pageId: "proyecto-ciudadano-registro",
    purpose:
      "Responder desde la subruta de registro usando el estado visible del formulario, validaciones, éxito del registro, código de acceso y acción de retorno.",
    responseStyle:
      "Claro, breve y orientado al formulario visible y al siguiente paso posible.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "visibleText",
      "availableActions",
      "visibleActions",
      "status",
      "selectedItemTitle",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No sé",
      "Como IA",
      "No tengo la data",
      "No puedo ver la interfaz",
    ],
    preferredActions: [
      "decir qué campos faltan o qué validación está visible",
      "confirmar si el registro fue exitoso",
      "indicar si ya se generó el código de acceso",
      "orientar sobre el siguiente paso después del registro",
    ],
  },

  "proyecto-ciudadano-nuevo-proyecto": {
    pageId: "proyecto-ciudadano-nuevo-proyecto",
    purpose:
      "Responder desde la subruta de nuevo proyecto usando el estado real del formulario, validaciones, PDF cargado, ciclo activo y resultado del envío.",
    responseStyle:
      "Natural, preciso y orientado al formulario visible y a la siguiente acción disponible.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedCategory",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "visibleActions",
      "status",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No puedo ayudarte",
      "Como modelo",
      "No tengo contexto",
      "Según la lógica interna",
    ],
    preferredActions: [
      "decir qué falta en el formulario",
      "confirmar si el PDF está cargado",
      "indicar la categoría o departamento seleccionados",
      "decir si el proyecto ya fue enviado o si hay error visible",
    ],
  },

  "proyecto-ciudadano-proyectos": {
    pageId: "proyecto-ciudadano-proyectos",
    purpose:
      "Responder desde la subruta de proyectos usando filtros visibles, búsqueda activa, cantidad de proyectos mostrados y resultados visibles.",
    responseStyle:
      "Muy contextual, breve y orientado a filtros, búsqueda, departamento y proyectos visibles.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedCategory",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "visibleActions",
      "status",
      "resultsSummary",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No tengo acceso",
      "Como asistente",
      "No veo nada",
      "No puedo leer esa parte",
    ],
    preferredActions: [
      "decir qué filtro está aplicado",
      "resumir cuántos proyectos visibles hay",
      "indicar si hay búsqueda activa",
      "resumir qué proyecto o departamento destaca en pantalla",
    ],
  },

  "proyecto-ciudadano-proyecto-detalle": {
    pageId: "proyecto-ciudadano-proyecto-detalle",
    purpose:
      "Responder desde el detalle de un proyecto ciudadano usando el proyecto visible, líder, apoyos, PDF, foro y estado de participación del usuario.",
    responseStyle:
      "Muy contextual, claro y corto. Debe diferenciar el detalle del proyecto, el bloque de apoyo y el foro visible.",
    priorityFields: [
      "pageTitle",
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedItemTitle",
      "visibleText",
      "availableActions",
      "visibleActions",
      "status",
      "resultsSummary",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No tengo suficiente información",
      "Como modelo de IA",
      "No puedo ver tu pantalla",
      "No sé quién participa",
    ],
    preferredActions: [
      "explicar qué proyecto está abierto",
      "decir cuántos apoyos visibles tiene",
      "indicar si se puede apoyar o comentar",
      "resumir el estado del foro o del PDF visible",
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
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedTopic",
      "selectedComment",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
    ],
    doNotSay: [
      "No tengo acceso",
      "Como asistente",
      "Según la estructura",
      "No puedo leer esa parte",
    ],
    preferredActions: [
      "resumir lo visible",
      "explicar el comentario o tema activo",
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
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "selectedParty",
      "selectedRound",
      "resultsSummary",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
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
      "route",
      "summary",
      "activeSection",
      "activeViewId",
      "activeViewTitle",
      "activeBlockId",
      "activeBlockTitle",
      "currentLevel",
      "currentStep",
      "visibleText",
      "availableActions",
      "status",
      "speakableSummary",
      "dynamicData",
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

const PATH_PREFIX_ALIASES: Array<[string, string]> = [
  ["/espacio-emprendedor/proyectos/", "espacio-emprendedor-proyecto-detalle"],
  ["/espacio-emprendedor/explorar", "espacio-emprendedor-explorar"],
  ["/espacio-emprendedor/perfil-inversionista", "espacio-emprendedor-perfil-inversionista"],
  ["/espacio-emprendedor/nuevo-proyecto", "espacio-emprendedor-nuevo-proyecto"],

  ["/proyecto-ciudadano/proyectos/", "proyecto-ciudadano-proyecto-detalle"],
  ["/proyecto-ciudadano/proyectos", "proyecto-ciudadano-proyectos"],
  ["/proyecto-ciudadano/nuevo-proyecto", "proyecto-ciudadano-nuevo-proyecto"],
  ["/proyecto-ciudadano/registro", "proyecto-ciudadano-registro"],
];

const PATH_ALIASES: Record<string, string> = {
  "/espacio-emprendedor": "espacio-emprendedor",
  "/proyecto-ciudadano": "proyecto-ciudadano",
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

  for (const [prefix, pageId] of PATH_PREFIX_ALIASES) {
    if (cleanPath.startsWith(prefix)) return pageId;
  }

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
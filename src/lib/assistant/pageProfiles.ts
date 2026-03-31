export type AssistantPageProfile = {
  pageId: string;
  purpose: string;
  responseStyle: string;
  priorityFields: string[];
  doNotSay: string[];
  preferredActions?: string[];
};

export const ASSISTANT_PAGE_PROFILES: Record<string, AssistantPageProfile> = {
  "espacio-emprendedor": {
    pageId: "espacio-emprendedor",
    purpose:
      "Ayudar al usuario a entender su acceso, verificación, proyectos, mensajes y acciones disponibles dentro del panel emprendedor.",
    responseStyle:
      "Claro, práctico, orientado a acciones concretas según el estado visible de la pantalla.",
    priorityFields: [
      "participantLogueado",
      "afiliadoVerificado",
      "misProyectosCount",
      "mensajesRecibidosCount",
      "proyectosDestacadosCount",
      "cargandoMensajes",
      "loginCodigoLoading",
      "verificandoDni",
    ],
    doNotSay: [
      "Pantalla:",
      "Resumen:",
      "Sección activa:",
      "Elemento seleccionado:",
      "Estado:",
      "Contenido visible:",
      "Acciones disponibles:",
      "Datos actuales:",
      "Interpreté tu pregunta",
    ],
    preferredActions: [
      "Registrarme ahora",
      "Iniciar sesión con código",
      "Verificar DNI",
      "Revisar proyectos",
      "Revisar mensajes",
    ],
  },

  "comentario-ciudadano": {
    pageId: "comentario-ciudadano",
    purpose:
      "Ayudar al usuario a participar en comentarios, videos, votación, preguntas al fundador y foros abiertos según lo visible en la pantalla.",
    responseStyle:
      "Natural, útil y orientado a participación ciudadana. Debe contestar con base en el tema visible, acceso, votación y foros.",
    priorityFields: [
      "accesoVerificado",
      "checkingData",
      "weeklyTopic",
      "weeklyQuestion",
      "weeklyTopicId",
      "votingTopicId",
      "timeFilter",
      "comentariosPublicadosCount",
      "videosAprobadosCount",
      "videosEnVotacionCount",
      "preguntasFundadorCount",
      "premiosTrimestralesCount",
      "forosAbiertosCount",
      "showPublic",
      "showPublicVideos",
      "yaVotoVideo",
      "myVotedVideoId",
      "ganadorOficialVisible",
      "latestOfficialWinnerTopic",
      "puedePreguntarFundador",
      "yaEnvioPreguntaFundador",
      "winnerQuestionPending",
      "formularioAccesoVisible",
      "votacionSemanalVisible",
    ],
    doNotSay: [
      "Pantalla:",
      "Resumen:",
      "Sección activa:",
      "Elemento seleccionado:",
      "Estado:",
      "Contenido visible:",
      "Acciones disponibles:",
      "Datos actuales:",
      "Interpreté tu pregunta",
    ],
    preferredActions: [
      "Guardar mis datos",
      "Enviar comentario",
      "Enviar video",
      "Votar por un video",
      "Entrar al foro",
      "Revisar preguntas al fundador",
    ],
  },

  "intencion-de-voto": {
    pageId: "intencion-de-voto",
    purpose:
      "Ayudar al usuario a entender la ronda activa, su estado de voto, su selección, preguntas posteriores y reflexión asociada.",
    responseStyle:
      "Claro, preciso y centrado en el estado actual del voto visible en pantalla.",
    priorityFields: [
      "rondaActiva",
      "nombreRonda",
      "grupoUsuario",
      "votoBloqueado",
      "opcionPendienteSlug",
      "votoConfirmadoNombre",
      "totalVotosRonda",
      "opcionesHabilitadasCount",
      "hayPreguntas",
      "showQuestions",
      "answersSubmitted",
      "showReflection",
    ],
    doNotSay: [
      "Pantalla:",
      "Resumen:",
      "Sección activa:",
      "Elemento seleccionado:",
      "Estado:",
      "Contenido visible:",
      "Acciones disponibles:",
      "Datos actuales:",
      "Interpreté tu pregunta",
    ],
    preferredActions: [
      "Seleccionar opción de voto",
      "Confirmar voto",
      "Responder preguntas posteriores",
      "Revisar reflexión",
    ],
  },

  "reto-ciudadano": {
    pageId: "reto-ciudadano",
    purpose:
      "Ayudar al usuario a entender el modo del reto, su progreso, niveles, ruleta, registro y lista de ganadores.",
    responseStyle:
      "Guía práctica, enfocada en el avance real del usuario dentro del reto.",
    priorityFields: [
      "mode",
      "premioAutorizado",
      "alias",
      "nivel1Passed",
      "nivel1Good",
      "nivel2Passed",
      "nivel2Good",
      "partyId",
      "partyIdsCount",
      "partyLoading",
      "tieneErrorPremio",
      "tieneErrorPartido",
      "listaGanadoresVisible",
      "filtroGanadores",
      "ganadoresCount",
      "caminoCiudadanoVisible",
      "caminoPosition",
      "caminoTurnsLeft",
      "caminoShowQuestion",
      "caminoTimeLeft",
      "caminoWon",
      "caminoGameOver",
    ],
    doNotSay: [
      "Pantalla:",
      "Resumen:",
      "Sección activa:",
      "Elemento seleccionado:",
      "Estado:",
      "Contenido visible:",
      "Acciones disponibles:",
      "Datos actuales:",
      "Interpreté tu pregunta",
    ],
    preferredActions: [
      "Completar registro para premio",
      "Comenzar Nivel 1",
      "Seleccionar partido",
      "Comenzar Nivel 2",
      "Girar la ruleta",
      "Jugar Camino Ciudadano",
      "Revisar lista de ganadores",
    ],
  },
};

export function getAssistantPageProfile(pageId?: string | null): AssistantPageProfile | null {
  if (!pageId) return null;
  return ASSISTANT_PAGE_PROFILES[pageId] ?? null;
}
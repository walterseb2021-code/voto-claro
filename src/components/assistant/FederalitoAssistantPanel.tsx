// src/components/assistant/FederalitoAssistantPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import FederalitoAvatar from "@/components/federalito/FederalitoAvatar";
import { REFLEXION_AXES } from "@/lib/reflexionContent";
import {
  CIUDADANO_SERVICES,
  CIUDADANO_PAGE_GUIDE,
  CIUDADANO_LEGAL_NOTE,
} from "@/lib/ciudadanoServiceContent";
import {
  CAMBIO_PAGE_ROUTE,
  CAMBIO_PAGE_TITLE,
  CAMBIO_PAGE_LINK_URL,
  CAMBIO_PAGE_PHRASE,
  CAMBIO_PAGE_GUIDE,
} from "@/lib/cambioConValentiaContent";
  import {
  COMO_FUNCIONA_ROUTE,
  COMO_FUNCIONA_GUIDE,
  COMO_FUNCIONA_FAQ,
} from "@/lib/comoFuncionaContent";
import { useAssistantRuntime } from "./AssistantRuntimeContext";
import {
  sanitizeAssistantTextForUi,
  sanitizeAssistantTextForVoice,
} from "@/lib/assistant/sanitizeAssistantText";

type GuideEventDetail = {
  action?: "SAY" | "OPEN" | "CLOSE" | "SAY_AND_OPEN";
  text?: string;
  speak?: boolean;
};

type Msg = { role: "system" | "user" | "assistant"; content: string };

type VoiceMode = "OFF" | "ON";
type VoiceLang = "es-PE" | "qu";
type AskMode = "HV" | "PLAN" | "NEWS";

const LS_VOICE_MODE = "votoclaro_voice_mode_v1";
const LS_VOICE_LANG = "votoclaro_voice_lang_v1";
const LS_VOICE_HINT_SHOWN = "votoclaro_voice_hint_shown_v1";
const LS_ASK_MODE = "votoclaro_assistant_mode_v1";

// ✅ Panel flotante: posición persistente
const LS_ASSIST_POS = "votoclaro_assistant_pos_v1";
type PanelPos = { x: number; y: number };

// ✅ FAB movible: posición persistente
const LS_ASSIST_FAB_POS = "votoclaro_assistant_fab_pos_v1";

// ✅ Memoria corta: estado + persistencia
const LS_ASSIST_MEM = "votoclaro_assistant_memory_v1";

type MemoryState = {
  lastCandidateId?: string;
  lastCandidateName?: string;
  lastMode?: AskMode;
  lastQuestion?: string;
  lastAnswer?: string;
  lastAnswerHasLinks?: boolean;
  lastUpdatedAt?: number;
};
   type SuggestedPrompt = {
  id: string;
  label: string;
  question: string;
};

function getDefaultAssistantGreeting(pathname: string) {
  const p = String(pathname || "");

  if (p.startsWith("/proyecto-ciudadano")) {
    return "Hola, soy el asistente de Proyecto Ciudadano. Puedo ayudarte a entender esta pantalla, las acciones visibles y las preguntas clave de esta subventana.";
  }

  if (p.startsWith("/espacio-emprendedor")) {
    return "Hola, soy el asistente de Espacio Emprendedor. Puedo ayudarte con lo que está visible en esta pantalla y sus subventanas.";
  }

  if (p.startsWith("/comentarios")) {
    return "Hola, soy el asistente de Comentarios Ciudadanos. Puedo ayudarte a entender lo que está visible en esta pantalla.";
  }

  if (p.startsWith("/reto-ciudadano")) {
    return "Hola, soy el asistente del Reto Ciudadano. Puedo ayudarte a entender el nivel, bloque o paso visible.";
  }

  if (p.startsWith("/intencion-de-voto")) {
    return "Hola, soy el asistente de Intención de Voto. Puedo ayudarte con el estado visible de esta pantalla.";
  }

  if (p.startsWith("/reflexion")) {
    return "Hola, soy el asistente de Reflexión antes de votar. Puedo ayudarte con las preguntas y reflexiones visibles.";
  }

  if (p.startsWith("/ciudadano/servicio") || p.startsWith("/ciudadano/servicios")) {
    return "Hola, soy el asistente de Servicios al ciudadano. Puedo ayudarte a ubicar el servicio correcto en esta pantalla.";
  }

  if (p.startsWith("/cambio-con-valentia")) {
    return "Hola, soy el asistente de esta ventana. Puedo explicarte el contenido visible y el acceso disponible.";
  }

  if (p.startsWith("/candidate/")) {
    return "Hola, soy el asistente de VOTO CLARO. Puedo ayudarte con la Hoja de Vida, el Plan y Actuar político del candidato abierto.";
  }

  return "Hola, soy el asistente de VOTO CLARO. Puedo ayudarte a entender la pantalla actual y sus acciones visibles.";
}
 function stringifyContextValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  if (Array.isArray(v)) {
    const arr = v
      .map((x) => stringifyContextValue(x))
      .filter(Boolean);
    return arr.join(", ");
  }

  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }

  return "";
}

function buildDynamicPageContextText(pageContext: {
  pageTitle?: string;
  summary?: string;
  activeSection?: string;
  visibleText?: string;
  availableActions?: string[];
  selectedItemTitle?: string;
  status?: string;
  dynamicData?: Record<string, unknown>;
} | null) {
  if (!pageContext) return "";

  const lines: string[] = [];

  if (pageContext.pageTitle) lines.push(`Pantalla: ${pageContext.pageTitle}`);
  if (pageContext.summary) lines.push(`Resumen: ${pageContext.summary}`);
  if (pageContext.activeSection) lines.push(`Sección activa: ${pageContext.activeSection}`);
  if (pageContext.selectedItemTitle) lines.push(`Elemento seleccionado: ${pageContext.selectedItemTitle}`);
  if (pageContext.status) lines.push(`Estado: ${pageContext.status}`);

  if (pageContext.visibleText) {
    lines.push(`Contenido visible:\n${String(pageContext.visibleText).trim()}`);
  }

  if (pageContext.availableActions?.length) {
    lines.push(`Acciones disponibles: ${pageContext.availableActions.join(", ")}`);
  }

  if (pageContext.dynamicData && typeof pageContext.dynamicData === "object") {
    const entries = Object.entries(pageContext.dynamicData)
      .map(([k, v]) => {
        const text = stringifyContextValue(v);
        return text ? `- ${k}: ${text}` : "";
      })
      .filter(Boolean);

    if (entries.length) {
      lines.push(`Datos actuales:\n${entries.join("\n")}`);
    }
  }

  return lines.join("\n\n").trim();
}

    function answerFromDynamicPageContext(
  rawQ: string,
  pageContext: {
    pageId?: string;
    pageTitle?: string;
    summary?: string;
    activeSection?: string;
    visibleText?: string;
    availableActions?: string[];
    selectedItemTitle?: string;
    status?: string;
    dynamicData?: Record<string, unknown>;
  } | null
) 
{
  if (!pageContext) return "";

  const q = normalizeLite(rawQ);
  const contextText = buildDynamicPageContextText(pageContext);
  const actions = pageContext.availableActions || [];
  const data = pageContext.dynamicData || {};
  const pageId = String(pageContext.pageId || "");
    const retoMode = String(data.mode || "").trim();
  const premioAutorizado = Boolean(data.premioAutorizado);
  const retoAlias = String(data.alias || "").trim();
  const retoNivel1Passed = Boolean(data.nivel1Passed);
  const retoNivel1Good = Number(data.nivel1Good || 0);
  const retoNivel2Passed = Boolean(data.nivel2Passed);
  const retoNivel2Good = Number(data.nivel2Good || 0);
  const retoPartyId = String(data.partyId || "").trim();
  const retoPartyIdsCount = Number(data.partyIdsCount || 0);
  const listaGanadoresVisible = Boolean(data.listaGanadoresVisible);

    const rondaActiva = Boolean(data.rondaActiva);
  const nombreRonda = String(data.nombreRonda || "").trim();
  const grupoUsuario = String(data.grupoUsuario || "").trim();
  const votoBloqueado = Boolean(data.votoBloqueado);
  const opcionPendienteSlug = String(data.opcionPendienteSlug || "").trim();
  const votoConfirmadoNombre = String(data.votoConfirmadoNombre || "").trim();
  const totalVotosRonda = Number(data.totalVotosRonda || 0);
  const opcionesHabilitadasCount = Number(data.opcionesHabilitadasCount || 0);
  const hayPreguntas = Boolean(data.hayPreguntas);
  const showQuestions = Boolean(data.showQuestions);
  const answersSubmitted = Boolean(data.answersSubmitted);
  const showReflection = Boolean(data.showReflection);

  const participantLogueado = Boolean(data.participantLogueado);
  const afiliadoVerificado = Boolean(data.afiliadoVerificado);
  const misProyectosCount = Number(data.misProyectosCount || 0);
  const mensajesRecibidosCount = Number(data.mensajesRecibidosCount || 0);
  const proyectosDestacadosCount = Number(data.proyectosDestacadosCount || 0);
  const cargandoMensajes = Boolean(data.cargandoMensajes);
  const loginCodigoLoading = Boolean(data.loginCodigoLoading);
  const verificandoDni = Boolean(data.verificandoDni);

  const accesoVerificado = Boolean(data.accesoVerificado);
  const checkingData = Boolean(data.checkingData);
  const comentariosPublicadosCount = Number(data.comentariosPublicadosCount || 0);
  const videosAprobadosCount = Number(data.videosAprobadosCount || 0);
  const videosEnVotacionCount = Number(data.videosEnVotacionCount || 0);
  const preguntasFundadorCount = Number(data.preguntasFundadorCount || 0);
  const premiosTrimestralesCount = Number(data.premiosTrimestralesCount || 0);
  const forosAbiertosCount = Number(data.forosAbiertosCount || 0);
  const showPublic = Boolean(data.showPublic);
  const showPublicVideos = Boolean(data.showPublicVideos);
  const yaVotoVideo = Boolean(data.yaVotoVideo);
  const ganadorOficialVisible = Boolean(data.ganadorOficialVisible);
  const puedePreguntarFundador = Boolean(data.puedePreguntarFundador);
     const weeklyTopic = String(data.weeklyTopic || "").trim();
  const weeklyQuestion = String(data.weeklyQuestion || "").trim();
  const registroUnicoApp = Boolean(data.registroUnicoApp);
  const codigoUnicoPorParticipante = Boolean(data.codigoUnicoPorParticipante);
  const mismoCodigoEnTodoElApp = Boolean(data.mismoCodigoEnTodoElApp);
  const requiereRegistroPrevioAntesDeUsarCodigo = Boolean(data.requiereRegistroPrevioAntesDeUsarCodigo);
  const formularioAccesoVisible = Boolean(data.formularioAccesoVisible);
  const votacionSemanalVisible = Boolean(data.votacionSemanalVisible);
  const historialForosVisible = Boolean(data.historialForosVisible);

  const foroHasAccess = Boolean(
    data.hasAccess ?? data.foroHasAccess ?? data.accesoForoHabilitado
  );
  const foroLoading = Boolean(data.loading ?? data.foroLoading);
  const forumAlias = String(data.forumAlias || data.alias || "").trim();
  const forumTopicTitle = String(
    data.topicTitle || data.forumTopicTitle || pageContext.selectedItemTitle || ""
  ).trim();
  const forumQuestion = String(data.topicQuestion || data.forumQuestion || "").trim();
  const forumCommentsCount = Number(data.commentsCount || data.forumCommentsCount || 0);

    const asksHelp =
    !q ||
    q.length < 2 ||
    q.includes("ayuda") ||
    q.includes("que hago") ||
    q.includes("qué hago") ||
    q.includes("como funciona") ||
    q.includes("cómo funciona") ||
    q.includes("que puedo hacer") ||
    q.includes("qué puedo hacer") ||
    q.includes("como puedo participar") ||
    q.includes("cómo puedo participar") ||
    q.includes("como participo") ||
    q.includes("cómo participo") ||
    q.includes("como entro") ||
    q.includes("cómo entro") ||
    q.includes("que tengo que hacer") ||
    q.includes("qué tengo que hacer") ||
    q.includes("como empiezo") ||
    q.includes("cómo empiezo");

  const asksActions =
    q.includes("acciones") ||
    q.includes("puedo hacer") ||
    q.includes("opciones") ||
    q.includes("botones") ||
    q.includes("sigue") ||
    q.includes("siguiente paso");

  const asksScreen =
    q.includes("que hay") ||
    q.includes("qué hay") ||
    q.includes("que veo") ||
    q.includes("qué veo") ||
    q.includes("pantalla") ||
    q.includes("ventana") ||
    q.includes("contenido");

  const asksStatus =
    q.includes("estado") ||
    q.includes("como voy") ||
    q.includes("cómo voy") ||
    q.includes("en que estoy") ||
    q.includes("en qué estoy") ||
    q.includes("que me falta") ||
    q.includes("qué me falta");

  const asksVerification =
    q.includes("verificado") ||
    q.includes("verificacion") ||
    q.includes("verificación") ||
    q.includes("afiliado") ||
    q.includes("dni");

  const asksMessages =
    q.includes("mensaje") ||
    q.includes("mensajes") ||
    q.includes("bandeja") ||
    q.includes("recibidos");

  const asksProjects =
    q.includes("proyecto") ||
    q.includes("proyectos") ||
    q.includes("publicar") ||
    q.includes("destacados");

    const asksCommentAccess =
    q.includes("puedo comentar") ||
    q.includes("ya puedo comentar") ||
    q.includes("tengo acceso para comentar") ||
    q.includes("ya tengo acceso") ||
    q.includes("acceso") ||
    q.includes("registrar mis datos") ||
    q.includes("correo") ||
    q.includes("celular");

  const asksWeeklyTopic =
    q.includes("tema") ||
    q.includes("pregunta guia") ||
    q.includes("pregunta guía") ||
    q.includes("tema activo") ||
    q.includes("tema semanal");

    const asksVideoSubmission =
    q.includes("como participo con un video") ||
    q.includes("cómo participo con un video") ||
    q.includes("cuantos videos puedo enviar") ||
    q.includes("cuántos videos puedo enviar") ||
    q.includes("reglas debo seguir") ||
    q.includes("enviar video") ||
    q.includes("subir video") ||
    q.includes("yo politico") ||
    q.includes("yo político");

  const asksWeeklyVotingFlow =
    q.includes("como funciona la votacion") ||
    q.includes("cómo funciona la votación") ||
    q.includes("cuantas veces puedo votar") ||
    q.includes("cuántas veces puedo votar") ||
    q.includes("ya registre mi voto") ||
    q.includes("ya registré mi voto") ||
    q.includes("que opciones tengo ahora") ||
    q.includes("qué opciones tengo ahora");

  const asksVotingVideoMeaning =
    q.includes("que significa que un video ya este en votacion") ||
    q.includes("qué significa que un video ya esté en votación") ||
    q.includes("video ya esta en votacion") ||
    q.includes("video ya está en votación");

  const asksWinner =
    q.includes("ganador") ||
    q.includes("ganador oficial") ||
    q.includes("politico de la semana") ||
    q.includes("político de la semana");

  const asksFounder =
    q.includes("fundador") ||
    q.includes("pregunta al fundador") ||
    q.includes("preguntas al fundador");

       const asksForum =
    q.includes("foro") ||
    q.includes("foros") ||
    q.includes("debate") ||
    q.includes("foro abierto");

  const asksForumParticipation =
    q.includes("como participo en el foro") ||
    q.includes("cómo participo en el foro") ||
    q.includes("como comentar en el foro") ||
    q.includes("cómo comentar en el foro") ||
    q.includes("puedo comentar en el foro") ||
    q.includes("ya puedo comentar en el foro") ||
    q.includes("necesito codigo para el foro") ||
    q.includes("necesito código para el foro") ||
    q.includes("necesito registrarme para el foro");

  const asksForumTopic =
    q.includes("de que trata este foro") ||
    q.includes("de qué trata este foro") ||
    q.includes("cual es el tema de este foro") ||
    q.includes("cuál es el tema de este foro") ||
    q.includes("que se debate aqui") ||
    q.includes("qué se debate aquí") ||
    q.includes("que se discute aqui") ||
    q.includes("qué se discute aquí");

  const asksCommentVsForum =
    q.includes("diferencia entre comentar y foro") ||
    q.includes("diferencia entre comentario y foro") ||
    q.includes("diferencia entre el comentario semanal y el foro") ||
    q.includes("que diferencia hay entre comentar y participar en el foro") ||
    q.includes("qué diferencia hay entre comentar y participar en el foro") ||
    q.includes("que diferencia hay entre el tema semanal y el foro") ||
    q.includes("qué diferencia hay entre el tema semanal y el foro");
      const asksCommentBlock =
    q.includes("bloque de comentario ciudadano") ||
    q.includes("como funciona el bloque de comentario") ||
    q.includes("cómo funciona el bloque de comentario") ||
    q.includes("cuantos comentarios puedo enviar") ||
    q.includes("cuántos comentarios puedo enviar") ||
    q.includes("que tipo de comentario") ||
    q.includes("qué tipo de comentario") ||
    q.includes("que comentario si se publica") ||
    q.includes("qué comentario sí se publica") ||
    q.includes("como conviene comentar") ||
    q.includes("cómo conviene comentar");

  const asksFounderFull =
    q.includes("que significa el bloque de pregunta al fundador") ||
    q.includes("qué significa el bloque de pregunta al fundador") ||
    q.includes("quien puede usarlo") ||
    q.includes("quién puede usarlo") ||
    q.includes("cuando aparece") ||
    q.includes("cuándo aparece") ||
    q.includes("para que sirve la pregunta al fundador") ||
    q.includes("para qué sirve la pregunta al fundador");

    const asksOpenForumsDefinition =
  q.includes("que son los foros abiertos") ||
  q.includes("qué son los foros abiertos") ||
  q.includes("que son los foros abiertos de debate ciudadano") ||
  q.includes("qué son los foros abiertos de debate ciudadano");

const asksOpenForumsActions =
  q.includes("que puedo hacer en los foros abiertos") ||
  q.includes("qué puedo hacer en los foros abiertos") ||
  q.includes("que puedo hacer en los foros abiertos que aparecen en esta pantalla") ||
  q.includes("qué puedo hacer en los foros abiertos que aparecen en esta pantalla");

const asksCommentVsOpenForums =
  q.includes("diferencia entre comentar el tema semanal y participar en los foros") ||
  q.includes("qué diferencia hay entre comentar el tema semanal y participar en los foros") ||
  q.includes("que diferencia hay entre comentar el tema semanal y participar en los foros") ||
  q.includes("diferencia entre comentar el tema semanal y los foros abiertos") ||
  q.includes("diferencia entre comentario semanal y foros abiertos");

    if (pageId === "intencion-de-voto") {
    const asksVote =
      q.includes("votar") ||
      q.includes("voto") ||
      q.includes("puedo votar") ||
      q.includes("ya vote") ||
      q.includes("ya voté") ||
      q.includes("confirmar");

    const asksRound =
      q.includes("ronda") ||
      q.includes("mes") ||
      q.includes("activa");

    const asksSelected =
      q.includes("seleccione") ||
      q.includes("seleccioné") ||
      q.includes("elegi") ||
      q.includes("elegí") ||
      q.includes("opcion") ||
      q.includes("opción") ||
      q.includes("partido");

    const asksQuestions =
      q.includes("pregunta") ||
      q.includes("preguntas") ||
      q.includes("responder") ||
      q.includes("respuesta") ||
      q.includes("respuestas");

    const asksReflection =
      q.includes("nulo") ||
      q.includes("blanco") ||
      q.includes("reflexion") ||
      q.includes("reflexión");

    if (asksHelp) {
      return (
        `${pageContext.summary || "Estoy leyendo esta pantalla en tiempo real."}\n\n` +
        (actions.length ? `Ahora mismo puedes hacer:\n- ${actions.join("\n- ")}\n\n` : "") +
        "También puedes preguntarme, por ejemplo:\n" +
        "- “¿ya voté?”\n" +
        "- “¿qué ronda está activa?”\n" +
        "- “¿qué opción elegí?”\n" +
        "- “¿hay preguntas después del voto?”"
      );
    }

    if (asksRound) {
      if (!rondaActiva) {
        return "No detecto una ronda activa visible en esta pantalla.";
      }

      return (
        `La ronda activa visible es: ${nombreRonda || "ronda actual"}.` +
        (grupoUsuario ? `\n\nGrupo visible: ${grupoUsuario}.` : "")
      );
    }

    if (asksVote) {
      if (!rondaActiva) {
        return "No detecto una ronda activa disponible para votar en este momento.";
      }

      if (votoBloqueado) {
        return (
          "Sí. Esta pantalla indica que tu voto ya quedó confirmado y bloqueado para la ronda actual." +
          (votoConfirmadoNombre ? `\n\nOpción confirmada: ${votoConfirmadoNombre}.` : "")
        );
      }

      if (opcionPendienteSlug) {
        return (
          `Todavía no aparece un voto confirmado, pero sí una selección pendiente: ${opcionPendienteSlug}.\n\n` +
          "Aún puedes cambiarla antes de confirmar."
        );
      }

      return (
        `Sí, puedes votar en esta pantalla.` +
        `\n\nOpciones habilitadas visibles: ${opcionesHabilitadasCount}.`
      );
    }

    if (asksSelected) {
      if (votoConfirmadoNombre) {
        return `La opción confirmada visible en esta pantalla es: ${votoConfirmadoNombre}.`;
      }

      if (opcionPendienteSlug) {
        return `La opción actualmente seleccionada, pero todavía no confirmada, es: ${opcionPendienteSlug}.`;
      }

      return "Todavía no detecto una opción seleccionada en esta pantalla.";
    }

    if (asksQuestions) {
      if (!hayPreguntas && !showQuestions) {
        return "Ahora mismo no detecto preguntas visibles posteriores al voto.";
      }

      if (answersSubmitted) {
        return "Las respuestas posteriores al voto ya aparecen como enviadas.";
      }

      if (showQuestions) {
        return "Sí. Esta pantalla está mostrando preguntas posteriores al voto para responder.";
      }

      return "Sí, esta ronda tiene preguntas disponibles después del voto.";
    }

    if (asksReflection) {
      if (showReflection) {
        return "Sí. En esta pantalla está visible la reflexión asociada al voto nulo o blanco.";
      }

      return "Ahora mismo no detecto una reflexión visible sobre voto nulo o blanco.";
    }

    if (asksStatus) {
      if (!rondaActiva) {
        return "Tu estado actual en esta pantalla es sin ronda activa visible.";
      }

      if (votoBloqueado) {
        return (
          `Tu estado actual en esta pantalla es de voto confirmado en la ronda ${nombreRonda || "actual"}.` +
          (votoConfirmadoNombre ? `\n\nOpción confirmada: ${votoConfirmadoNombre}.` : "")
        );
      }

      if (showQuestions) {
        return (
          `Tu estado actual en esta pantalla es posterior al voto, con preguntas visibles para responder.` +
          `\n\nRonda: ${nombreRonda || "actual"}.`
        );
      }

      return (
        `Tu estado actual en esta pantalla es de selección de voto aún editable.` +
        `\n\nRonda: ${nombreRonda || "actual"}.\n` +
        `Opciones habilitadas visibles: ${opcionesHabilitadasCount}.\n` +
        `Total registrado visible en la ronda: ${totalVotosRonda}.`
      );
    }

    if (asksScreen) {
      return contextText || "No detecté contenido visible suficiente en esta pantalla.";
    }

    return (
  "Estoy usando el estado real de esta pantalla para responderte.\n\n" +
  (pageContext.summary ? `${pageContext.summary}\n\n` : "") +
  (actions.length
    ? `Ahora mismo, según lo visible aquí, puedes hacer esto:\n- ${actions.join("\n- ")}`
    : "Si quieres, pregúntame algo más concreto sobre tu voto, la ronda activa, tu selección o las preguntas posteriores.")
);
  }
       if (pageId === "reto-ciudadano") {
    const asksMode =
      q.includes("modo") ||
      q.includes("con premio") ||
      q.includes("sin premio") ||
      q.includes("premio");

    const asksRegister =
      q.includes("registr") ||
      q.includes("dni") ||
      q.includes("correo") ||
      q.includes("celular") ||
      q.includes("alias");

    const asksLevel1 =
      q.includes("nivel 1") ||
      q.includes("primer nivel") ||
      q.includes("conocimiento general");

    const asksLevel2 =
      q.includes("nivel 2") ||
      q.includes("segundo nivel") ||
      q.includes("partido");

    const asksLevel3 =
      q.includes("nivel 3") ||
      q.includes("tercer nivel") ||
      q.includes("ruleta");

    const asksProgress =
      q.includes("avance") ||
      q.includes("progreso") ||
      q.includes("como voy") ||
      q.includes("cómo voy") ||
      q.includes("que me falta") ||
      q.includes("qué me falta");

    const asksWinners =
      q.includes("ganador") ||
      q.includes("ganadores") ||
      q.includes("lista de ganadores");

         if (asksHelp) {
      if (retoMode === "con_premio" && !premioAutorizado) {
        return (
          "Para participar en este reto con premio, primero debes completar el registro que aparece en pantalla.\n\n" +
          "Después podrás comenzar el Nivel 1, luego pasar al Nivel 2 y finalmente llegar a la ruleta."
        );
      }

      if (!retoNivel1Passed) {
        return (
          "Para participar aquí, debes comenzar por el Nivel 1 de conocimiento general.\n\n" +
          "Si lo apruebas, se desbloquea el Nivel 2. Después de aprobar el Nivel 2, se desbloquea la ruleta del Nivel 3."
        );
      }

      if (!retoNivel2Passed) {
        return (
          "Ahora mismo ya avanzaste al Nivel 2.\n\n" +
          "Tu siguiente paso es responder las preguntas del partido seleccionado. Si apruebas ese nivel, se desbloquea la ruleta."
        );
      }

      return (
        "Ya llegaste al Nivel 3.\n\n" +
        "Ahora puedes girar la ruleta y también revisar la lista pública de ganadores."
      );
    }

    if (asksMode) {
      if (!retoMode) {
        return "No detecto claramente el modo actual del reto en esta pantalla.";
      }

      if (retoMode === "con_premio") {
        return (
          "El modo actual visible es: con premio.\n\n" +
          (premioAutorizado
            ? "El registro para premio ya aparece validado."
            : "Todavía se requiere completar el registro para jugar por premio.")
        );
      }

      return "El modo actual visible es: sin premio.";
    }

    if (asksRegister) {
      if (retoMode !== "con_premio") {
        return "En modo sin premio no detecto que necesites registro obligatorio para jugar.";
      }

      if (premioAutorizado) {
        return (
          `Sí. El registro para premio ya aparece validado.` +
          (retoAlias ? `\n\nAlias visible: ${retoAlias}.` : "")
        );
      }

      return "Todavía falta completar el registro obligatorio para participar con premio.";
    }

    if (asksLevel1) {
      return retoNivel1Passed
        ? `Sí. El Nivel 1 ya aparece aprobado con ${retoNivel1Good} respuestas buenas.`
        : `El Nivel 1 todavía no aparece aprobado. Buenas visibles hasta ahora: ${retoNivel1Good}.`;
    }

    if (asksLevel2) {
      if (!retoNivel1Passed) {
        return "Todavía no estás en Nivel 2 porque el Nivel 1 aún no aparece aprobado.";
      }

      if (retoNivel2Passed) {
        return `Sí. El Nivel 2 ya aparece aprobado con ${retoNivel2Good} respuestas buenas.`;
      }

      return (
        `El Nivel 2 está activo pero todavía no aparece aprobado.` +
        (retoPartyId ? `\n\nPartido seleccionado visible: ${retoPartyId}.` : "")
      );
    }

    if (asksLevel3) {
      if (!retoNivel2Passed) {
        return "Todavía no detecto la ruleta desbloqueada, porque el Nivel 2 aún no aparece aprobado.";
      }

      return "Sí. El Nivel 3 aparece desbloqueado y la ruleta ya debería estar disponible.";
    }

    if (asksProgress) {
      if (!retoNivel1Passed) {
        return `Tu avance actual está en Nivel 1.\n\nBuenas visibles: ${retoNivel1Good}.`;
      }

      if (!retoNivel2Passed) {
        return (
          `Tu avance actual está en Nivel 2.` +
          `\n\nNivel 1 ya aprobado con ${retoNivel1Good} buenas.` +
          `\nNivel 2 buenas visibles: ${retoNivel2Good}.` +
          (retoPartyId ? `\nPartido seleccionado: ${retoPartyId}.` : "")
        );
      }

      return (
        `Tu avance actual ya llegó al Nivel 3.` +
        `\n\nNivel 1 buenas: ${retoNivel1Good}.` +
        `\nNivel 2 buenas: ${retoNivel2Good}.`
      );
    }

    if (asksWinners) {
      return listaGanadoresVisible
        ? "Sí. En esta pantalla está visible la lista pública de ganadores del reto."
        : "No detecto la lista de ganadores visible en este momento.";
    }

    if (asksActions) {
      if (!actions.length) {
        return "En este momento no detecté acciones claras en esta pantalla.";
      }

      return "Según esta pantalla, ahora mismo puedes hacer esto:\n" + `- ${actions.join("\n- ")}`;
    }

    if (asksScreen || asksStatus) {
      return contextText || "No detecté contenido visible suficiente en esta pantalla.";
    }

    return (
  "Estoy respondiendo según el estado real del reto que veo en esta pantalla.\n\n" +
  (pageContext.summary ? `${pageContext.summary}\n\n` : "") +
  (actions.length
    ? `Ahora mismo puedes hacer esto:\n- ${actions.join("\n- ")}`
    : "Si quieres, pregúntame algo concreto sobre el registro, el nivel 1, el nivel 2, la ruleta o la lista de ganadores.")
);
  }
         if (pageId === "comentario-ciudadano") {
    const asksSingleCode =
      q.includes("mismo codigo") ||
      q.includes("mismo código") ||
      q.includes("sirve el mismo codigo") ||
      q.includes("sirve el mismo código") ||
      q.includes("otro codigo") ||
      q.includes("otro código") ||
      q.includes("varios codigos") ||
      q.includes("varios códigos") ||
      q.includes("multiples codigos") ||
      q.includes("múltiples códigos") ||
      q.includes("codigo unico") ||
      q.includes("código único");

      const asksParticipationFlow =
  (
    q.includes("como participo") ||
    q.includes("cómo participo") ||
    q.includes("que debo hacer exactamente") ||
    q.includes("qué debo hacer exactamente") ||
    q.includes("como entro a participar") ||
    q.includes("cómo entro a participar") ||
    q.includes("desde el registro") ||
    q.includes("uso del codigo") ||
    q.includes("uso del código")
  ) &&
  !asksVideoSubmission &&
  !asksWeeklyVotingFlow &&
  !asksVotingVideoMeaning &&
  !asksForum &&
  !asksForumParticipation &&
  !asksCommentBlock &&
  !asksFounderFull &&
  !asksCommentVsForum &&
  !asksCommentVsOpenForums;

     if (asksHelp || asksParticipationFlow) {
  if (checkingData) {
    return "Ahora mismo la pantalla todavía está verificando si ya existe una sesión activa de participante.";
  }

  if (!accesoVerificado) {
    return (
      "Para participar activamente en Comentarios Ciudadanos, el flujo correcto es este:\n\n" +
      "1. Registrarte una sola vez en la ficha general del app.\n" +
      "2. Obtener tu código de acceso único.\n" +
      "3. Usar ese mismo código cuando necesites entrar a esta u otras ventanas del app.\n\n" +
      "Mientras no tengas ese registro activo, aquí solo puedes observar el contenido público."
    );
  }

  return (
    "Aquí ya tienes participación activa habilitada.\n\n" +
    "En esta pantalla puedes comentar sobre el tema de la semana, enviar un video, votar cuando haya una votación abierta y entrar a los foros ciudadanos.\n\n" +
    "Tu registro sigue siendo el mismo registro único del app."
  );
}

    if (asksSingleCode) {
      if (
        registroUnicoApp &&
        codigoUnicoPorParticipante &&
        mismoCodigoEnTodoElApp &&
        requiereRegistroPrevioAntesDeUsarCodigo
      ) {
        return (
          "Sí. El código de acceso es único por participante y el mismo código sirve para entrar a las diferentes ventanas del app.\n\n" +
          "No corresponde manejar múltiples códigos para una misma persona dentro del flujo normal."
        );
      }

      return "Esta pantalla no muestra suficiente información para confirmar el comportamiento del código de acceso.";
    }

    if (asksActions) {
      if (!actions.length) {
        return "En este momento no detecté acciones claras en esta pantalla.";
      }

      return "Según esta pantalla, ahora mismo puedes hacer esto:\n" + `- ${actions.join("\n- ")}`;
    }
         
    if (asksOpenForumsDefinition) {
  if (!(forosAbiertosCount > 0 || historialForosVisible)) {
    return "Ahora mismo no detecto foros abiertos visibles en esta pantalla.";
  }

  return (
    `En esta pantalla detecto ${forosAbiertosCount === 1 ? "un foro abierto" : `${forosAbiertosCount} foros abiertos`} de debate ciudadano.\n\n` +
    "Los foros abiertos son espacios donde un tema semanal ya cerrado sigue disponible para un debate más amplio entre participantes.\n\n" +
    "A diferencia del comentario semanal, aquí el foco es profundizar la discusión sobre un tema que ya quedó abierto al debate."
  );
}

if (asksOpenForumsActions) {
  if (!(forosAbiertosCount > 0 || historialForosVisible)) {
    return "Ahora mismo no detecto foros abiertos visibles en esta pantalla.";
  }

  if (!accesoVerificado) {
    return (
      "En los foros abiertos que ves en esta pantalla puedes explorar el debate público y leer los temas abiertos.\n\n" +
      "Para participar activamente y comentar, primero necesitas completar el registro único del app y usar tu código de acceso."
    );
  }

  return (
    "En los foros abiertos que ves en esta pantalla puedes entrar al debate de un tema ya abierto, leer los aportes visibles y participar activamente si tu acceso está habilitado.\n\n" +
    "Estos foros sirven para profundizar la conversación más allá del comentario semanal."
  );
}
          if (asksCommentVsForum || asksCommentVsOpenForums) {
      return (
        "Comentar el tema semanal sirve para responder directamente al tema activo y a la pregunta guía de la semana dentro de Comentarios Ciudadanos.\n\n" +
        "En cambio, los foros abiertos de debate ciudadano sirven para profundizar un tema que ya quedó abierto al debate y continuar la conversación con más intercambio de argumentos entre participantes.\n\n" +
        "En el comentario semanal prima la respuesta al tema actual; en los foros abiertos prima el debate más amplio y sostenido sobre un tema ya abierto."
      );
    }

    if (asksCommentBlock) {
      return (
        "El bloque de Comentario Ciudadano sirve para que expreses tu propuesta, opinión o aporte sobre el tema semanal activo.\n\n" +
        "En esta dinámica puedes enviar hasta tres comentarios sobre el tema de la semana. Conviene que el comentario sea claro, directo y realmente conectado con la pregunta guía visible.\n\n" +
        "Lo que sí conviene publicar aquí es un aporte útil, entendible y relacionado con el tema semanal, no un texto fuera de tema o sin contenido ciudadano."
      );
    }

    if (asksFounderFull) {
      if (puedePreguntarFundador) {
        return (
          "El bloque de Pregunta al fundador es un espacio especial que aparece para el ganador semanal oficial.\n\n" +
          "No lo usa cualquier participante: solo puede usarlo quien quedó como ganador oficial de la semana.\n\n" +
          "Cuando aparece, permite hacer una sola pregunta al fundador y, después de enviarla, ya no se puede editar."
        );
      }

      if (preguntasFundadorCount > 0) {
        return (
          "El bloque de Pregunta al fundador corresponde a preguntas públicas ya registradas para ese espacio especial.\n\n" +
          "Ese bloque no está pensado para todos los participantes, sino para el ganador semanal oficial cuando esa opción se habilita.\n\n" +
          "Si ahora solo ves preguntas públicas, significa que el espacio ya muestra preguntas registradas, aunque no necesariamente el formulario activo para hacer una nueva."
        );
      }

      return (
        "El bloque de Pregunta al fundador es un espacio especial que no está abierto para cualquier participante.\n\n" +
        "Normalmente se habilita para el ganador semanal oficial, cuando esa etapa aparece en la dinámica de la pantalla.\n\n" +
        "Ahora mismo no detecto preguntas públicas ni formulario visible de ese bloque."
      );
    }
    if (asksCommentAccess) {
      if (checkingData) {
        return "Todavía se está verificando si tu acceso ya está habilitado.";
      }

      if (!accesoVerificado) {
        return (
          "Todavía no aparece una sesión activa de participante en esta pantalla.\n\n" +
          "Para comentar, votar, subir video o participar en los foros, primero debes haberte registrado una sola vez en la ficha general del app y luego usar tu código si hace falta."
        );
      }

      return "Sí. En esta pantalla tu acceso ya aparece habilitado para comentar, votar, subir video y participar en foros.";
    }

    if (asksWeeklyTopic) {
      if (!weeklyTopic && !weeklyQuestion) {
        return "No detecté todavía un tema semanal activo en esta pantalla.";
      }

      return (
        `Tema activo: ${weeklyTopic || "Tema en preparación"}\n\n` +
        (weeklyQuestion ? `Pregunta guía: ${weeklyQuestion}` : "")
      ).trim();
    }

         if (asksVideoSubmission) {
      return (
        "Para participar con un video en esta pantalla, primero debes tener acceso activo como participante.\n\n" +
        "En la dinámica semanal puedes enviar un solo video por tema. Ese video debe responder al tema activo, mantener respeto y pasar primero por revisión antes de publicarse.\n\n" +
        "Después de ser aprobado, recién podría entrar a una etapa de votación si corresponde al ciclo visible."
      );
    }

    if (asksWeeklyVotingFlow) {
      if (!(videosEnVotacionCount > 0 || votacionSemanalVisible)) {
        return "Ahora mismo no detecto una votación semanal abierta en esta pantalla.";
      }

      return (
  "La votación de la semana anterior funciona sobre videos que ya pasaron la etapa de envío y revisión.\n\n" +
  `Ahora mismo detecto ${
    videosEnVotacionCount === 1 ? "un video en votación" : `${videosEnVotacionCount} videos en votación`
  }. En esta fase cada participante puede votar una sola vez por tema semanal.\n\n` +
  (yaVotoVideo
    ? "La pantalla indica que tu voto ya fue registrado, así que ya no podrías emitir otro en este mismo tema."
    : "Si tu acceso está habilitado y todavía no votaste, puedes revisar los videos en votación y elegir uno.")
);
    }

    if (asksVotingVideoMeaning) {
      if (!(videosEnVotacionCount > 0 || votacionSemanalVisible)) {
        return "Ahora mismo no detecto videos en votación visibles en esta pantalla.";
      }

      return (
  "Que un video ya esté en votación significa que ese video ya superó la etapa de envío y revisión, y ahora pasó a la fase donde los participantes pueden votar por él.\n\n" +
  `En esta pantalla detecto ${
    videosEnVotacionCount === 1 ? "un video en esa fase" : `${videosEnVotacionCount} videos en esa fase`
  }.`
);
    }

    if (asksWinner) {
      if (!ganadorOficialVisible) {
        return "No detecto un ganador oficial visible en este momento.";
      }

      return (
        "Sí, hay un ganador oficial visible." +
        (pageContext.selectedItemTitle ? `\n\nTema relacionado: ${pageContext.selectedItemTitle}.` : "")
      );
    }

         if (asksFounder) {
      if (puedePreguntarFundador) {
        return (
          "El bloque de pregunta al fundador solo puede usarlo el ganador semanal oficial cuando esa opción aparece habilitada en esta pantalla.\n\n" +
          "Permite enviar una sola pregunta y, después de registrarla, ya no se puede editar."
        );
      }

      if (preguntasFundadorCount > 0) {
        return (
          "En esta pantalla sí hay preguntas públicas al fundador visibles, pero eso no significa que cualquier participante pueda usar el formulario.\n\n" +
          "Ese uso está reservado para el ganador semanal oficial cuando esa opción se habilita."
        );
      }

      return (
        "Ahora mismo no detecto formulario activo de pregunta al fundador para uso general.\n\n" +
        "Ese bloque normalmente se reserva para el ganador semanal oficial."
      );
    }

      if (asksForum) {
  if (forosAbiertosCount > 0 || historialForosVisible) {
    return (
      `Sí. Ahora mismo detecto ${
        forosAbiertosCount === 1 ? "un foro abierto" : `${forosAbiertosCount} foros abiertos`
      } de debate ciudadano.\n\n` +
      "Los foros abiertos corresponden a temas semanales ya cerrados, donde el ciudadano puede seguir debatiendo más a fondo."
    );
  }

  return "No detecto foros abiertos visibles en este momento.";
}

    if (asksStatus) {
      if (checkingData) {
        return "La pantalla está verificando tu acceso antes de habilitar la participación.";
      }

      if (!accesoVerificado) {
        return (
          "Tu estado actual en esta pantalla es de modo observador.\n\n" +
          "Todavía puedes ver contenido público, pero para participar activamente primero debes completar el registro único del app."
        );
      }

      return (
        "Tu estado actual en esta pantalla es de acceso habilitado.\n\n" +
        `Tema activo: ${weeklyTopic || "No visible"}.\n` +
        `Comentarios publicados detectados: ${comentariosPublicadosCount}.\n` +
        `Videos aprobados detectados: ${videosAprobadosCount}.\n` +
        `Videos en votación detectados: ${videosEnVotacionCount}.\n` +
        `Foros abiertos detectados: ${forosAbiertosCount}.`
      );
    }

    if (asksScreen) {
      return contextText || "No detecté contenido visible suficiente en esta pantalla.";
    }

    return (
      "Estoy respondiendo según el estado real de Comentarios Ciudadanos.\n\n" +
      (pageContext.summary ? `${pageContext.summary}\n\n` : "") +
      (actions.length
        ? `Desde aquí puedes hacer cosas como estas:\n- ${actions.join("\n- ")}`
        : "Pregúntame algo concreto sobre registro único, código de acceso, comentarios, videos, votación, fundador o foros.")
    );
  }
          if (pageId === "comentarios-foro-ciudadano") {
    if (asksHelp) {
      if (foroLoading) {
        return "Ahora mismo el foro todavía está cargando su estado de acceso y participación.";
      }

      if (!foroHasAccess) {
        return (
          "Ahora mismo estás viendo este foro en modo observador.\n\n" +
          "Puedes leer el debate abierto, pero para participar activamente primero debes haber completado el registro único del app y luego usar tu mismo código si hace falta.\n\n" +
          "Después de habilitar el acceso, aquí podrás definir tu alias del foro y publicar tu aporte."
        );
      }

      if (!forumAlias) {
        return (
          "Tu acceso al foro ya aparece habilitado, pero todavía falta definir el alias con el que participarás en este debate.\n\n" +
          "Después de guardar ese alias ya podrás comentar dentro del foro abierto."
        );
      }

      return (
        "Aquí ya puedes participar activamente en este foro ciudadano.\n\n" +
        "Esta subventana sirve para debatir con más profundidad un tema ya abierto, aportar argumentos y comentar dentro del hilo visible."
      );
    }

    if (asksCommentVsForum) {
      return (
        "El comentario semanal responde al tema activo de la semana dentro de Comentarios Ciudadanos.\n\n" +
        "En cambio, el foro ciudadano sirve para profundizar y debatir más a fondo un tema que ya quedó abierto como espacio de discusión.\n\n" +
        "En el comentario semanal prima la respuesta al tema actual; en el foro prima el intercambio de argumentos y debate entre participantes."
      );
    }

    if (asksForumParticipation || asksCommentAccess) {
      if (foroLoading) {
        return "Todavía se está verificando si tu acceso al foro ya está habilitado.";
      }

      if (!foroHasAccess) {
        return (
          "Todavía no aparece acceso habilitado para participar en este foro.\n\n" +
          "Primero debes haberte registrado una sola vez en la ficha general del app y luego usar tu mismo código de acceso si esta sección lo solicita."
        );
      }

      if (!forumAlias) {
        return (
          "Tu acceso al foro ya aparece habilitado, pero antes de comentar todavía debes guardar tu alias visible para este debate."
        );
      }

      return "Sí. En este momento ya puedes comentar activamente dentro de este foro ciudadano.";
    }
         const asksForumVsMain =
  q.includes("diferencia entre esta pantalla de foro y la pantalla principal") ||
  q.includes("diferencia entre este foro y comentarios ciudadanos") ||
  q.includes("que diferencia hay entre esta pantalla de foro y la principal") ||
  q.includes("qué diferencia hay entre esta pantalla de foro y la principal") ||
  q.includes("que diferencia hay entre esta pantalla de foro y la pantalla principal de comentarios ciudadanos") ||
  q.includes("qué diferencia hay entre esta pantalla de foro y la pantalla principal de comentarios ciudadanos");

    if (asksForumVsMain) {
      return (
        "La pantalla principal de Comentarios Ciudadanos se centra en el tema semanal activo, el comentario ciudadano, el video semanal, la votación y otros bloques generales.\n\n" +
        "En cambio, esta pantalla de foro está dedicada a un tema archivado que quedó abierto al debate más amplio entre participantes.\n\n" +
        "Aquí el foco principal es discutir a fondo ese tema concreto dentro del foro."
      );
    }
    if (asksForumTopic || asksWeeklyTopic || asksForum) {
      if (!forumTopicTitle && !forumQuestion) {
        return (
          pageContext.summary ||
          "No detecté suficiente detalle visible para describir con precisión el tema de este foro."
        );
      }

      return (
        `Foro abierto: ${forumTopicTitle || "Tema visible en foro"}\n\n` +
        (forumQuestion ? `Pregunta guía del debate: ${forumQuestion}\n\n` : "") +
        (forumCommentsCount > 0
          ? `Comentarios visibles detectados en este foro: ${forumCommentsCount}.`
          : "Este espacio está orientado al debate y al aporte de argumentos sobre el tema abierto.")
      ).trim();
    }

    if (asksActions) {
      if (!actions.length) {
        return "En este momento no detecté acciones claras en esta pantalla del foro.";
      }

      return "Según este foro, ahora mismo puedes hacer esto:\n" + `- ${actions.join("\n- ")}`;
    }

    if (asksStatus) {
      if (foroLoading) {
        return "El foro está verificando tu acceso antes de habilitar la participación.";
      }

      if (!foroHasAccess) {
        return (
          "Tu estado actual en este foro es de modo observador.\n\n" +
          "Puedes leer el debate, pero todavía no aparece participación activa habilitada."
        );
      }

      if (!forumAlias) {
        return (
          "Tu estado actual en este foro es de acceso habilitado, pero con alias pendiente.\n\n" +
          "Después de guardar el alias ya podrás comentar en el debate."
        );
      }

      return (
        "Tu estado actual en este foro es de participación habilitada.\n\n" +
        (forumTopicTitle ? `Tema del foro: ${forumTopicTitle}.\n` : "") +
        `Alias visible: ${forumAlias || "No visible"}.\n` +
        `Comentarios detectados: ${forumCommentsCount}.`
      );
    }

    if (asksScreen) {
      return contextText || "No detecté contenido visible suficiente en este foro.";
    }

    return (
      "Estoy respondiendo según el estado real de este foro ciudadano.\n\n" +
      (pageContext.summary ? `${pageContext.summary}\n\n` : "") +
      (actions.length
        ? `Desde aquí puedes hacer cosas como estas:\n- ${actions.join("\n- ")}`
        : "Pregúntame algo concreto sobre el tema del foro, acceso, alias, participación o debate visible.")
    );
  }
       if (asksHelp) {
  if (!participantLogueado) {
    return "Aquí puedes registrarte ahora o iniciar sesión con tu código.";
  }

  if (participantLogueado && !afiliadoVerificado) {
    return "Aquí ya ingresaste, pero todavía falta completar o confirmar tu verificación de DNI para habilitar el panel emprendedor.";
  }

  return `Aquí puedes revisar tus proyectos, ver tus mensajes y gestionar tu espacio emprendedor. Ahora mismo detecto ${misProyectosCount} proyecto(s) y ${mensajesRecibidosCount} mensaje(s).`;
}

  if (asksActions) {
    if (!actions.length) {
      return "En este momento no detecté acciones claras en esta pantalla.";
    }

    return (
      "Según esta pantalla, ahora mismo puedes hacer esto:\n" +
      `- ${actions.join("\n- ")}`
    );
  }

  if (asksScreen) {
    return contextText || "No detecté contenido visible suficiente en esta pantalla.";
  }

  if (asksStatus) {
    if (!participantLogueado) {
      return (
        "Ahora mismo todavía no detecto un participante con sesión activa.\n\n" +
        "La pantalla está en modo de acceso: registro o inicio con código."
      );
    }

    if (participantLogueado && !afiliadoVerificado) {
      return (
        "Sí detecto un participante activo, pero todavía no aparece como afiliado verificado.\n\n" +
        "El siguiente paso visible es verificar el DNI para habilitar el panel emprendedor."
      );
    }

    return (
      "Tu estado actual en esta pantalla es de emprendedor verificado.\n\n" +
      `Tienes ${misProyectosCount} proyecto(s) propio(s) y ${mensajesRecibidosCount} mensaje(s) recibido(s).`
    );
  }

  if (asksVerification) {
    if (!participantLogueado) {
      return "Todavía no detecto sesión iniciada. Primero necesitas registrarte o ingresar con tu código.";
    }

    if (!afiliadoVerificado) {
      return (
        "Aún no apareces como afiliado verificado en esta pantalla.\n\n" +
        "Lo que falta es completar o confirmar la verificación de DNI."
      );
    }

    return "Sí. En esta pantalla apareces como afiliado verificado.";
  }

  if (asksMessages) {
    if (cargandoMensajes) {
      return "La bandeja de mensajes todavía está cargando.";
    }

    return `Ahora mismo detecto ${mensajesRecibidosCount} mensaje(s) recibido(s) en esta pantalla.`;
  }

  if (asksProjects) {
    if (!participantLogueado) {
      return "Primero necesitas registrarte o iniciar sesión para poder gestionar proyectos.";
    }

    if (participantLogueado && !afiliadoVerificado) {
      return (
        "Todavía no estás en el panel completo para publicar proyectos.\n\n" +
        "Antes debes aparecer como afiliado verificado."
      );
    }

    return (
      `Ahora mismo detecto ${misProyectosCount} proyecto(s) propio(s)` +
      ` y ${proyectosDestacadosCount} proyecto(s) destacado(s) visibles.\n\n` +
      (actions.length ? `Acciones disponibles:\n- ${actions.join("\n- ")}` : "")
    );
  }

  if (loginCodigoLoading) {
    return "Estoy detectando que el acceso con código está en proceso.";
  }

  if (verificandoDni) {
    return "Estoy detectando que la verificación de DNI está en proceso.";
  }

  return (
  "Estoy usando el contexto real de esta pantalla para ayudarte.\n\n" +
  (pageContext.summary ? `${pageContext.summary}\n\n` : "") +
  (actions.length
    ? `Ahora mismo aparecen estas acciones disponibles:\n- ${actions.join("\n- ")}`
    : "Hazme una pregunta más específica sobre lo que ves en esta pantalla.")
);
}
function normalize(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeLite(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}


function answerFromReflexion(rawQ: string) {
  const q = normalize(rawQ);

  if (!q || q.length < 3) {
    return (
      "Estoy listo para ayudarte a reflexionar.\n\n" +
      "Puedes escribir por ejemplo:\n" +
      "- “economía”\n" +
      "- “salud”\n" +
      "- “seguridad”\n" +
      "- “corrupción”\n\n" +
      "O pega una frase de la pregunta que te llamó la atención."
    );
  }

  const axisHit = REFLEXION_AXES.find(
    (a) => normalize(a.title).includes(q) || q.includes(normalize(a.title))
  );

  if (axisHit) {
    const list = axisHit.questions.map((qq, i) => `${i + 1}) ${qq.question}`).join("\n");

    return (
      `Eje: ${axisHit.title}\n` +
      (axisHit.subtitle ? `${axisHit.subtitle}\n\n` : "\n") +
      "Estas son las 5 preguntas:\n" +
      list +
      "\n\n" +
      "Dime el número (1 a 5) o copia una parte de la pregunta para leerte la reflexión."
    );
  }

  const flat = REFLEXION_AXES.flatMap((a) => a.questions.map((qq) => ({ axis: a, q: qq })));
  const words = q.split(" ").filter((w) => w.length >= 4);

  let best: any = null;
  let bestScore = 0;

  for (const item of flat) {
    const t = normalize(item.q.question);
    let score = 0;
    for (const w of words) if (t.includes(w)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best && bestScore >= 1) {
    const follow = best.q.followups?.length
      ? "\n\nPara seguir reflexionando:\n" + best.q.followups.map((f: string) => `- ${f}`).join("\n")
      : "";
    return `Eje: ${best.axis.title}\n\nPregunta:\n${best.q.question}\n\nReflexión:\n${best.q.reflection}${follow}`;
  }

  const menu = REFLEXION_AXES.map((a) => `- ${a.title}`).join("\n");
  return (
    "No estoy seguro de a qué reflexión te refieres.\n\n" +
    "Prueba escribiendo el tema así:\n" +
    menu +
    "\n\nO copia una frase exacta de la pregunta que quieres abrir."
  );
}

function answerFromCiudadanoServicio(rawQ: string) {
  const q = normalize(rawQ);

  if (!q || q.length < 3 || q.includes("ayuda") || q.includes("guia") || q.includes("guía") || q.includes("como usar")) {
    return `${CIUDADANO_PAGE_GUIDE}\n\n${CIUDADANO_LEGAL_NOTE}`;
  }

  if (
    q.includes("lista") ||
    q.includes("servicios") ||
    q.includes("que hay") ||
    q.includes("qué hay") ||
    q.includes("leer todo") ||
    q.includes("todo")
  ) {
    const list = CIUDADANO_SERVICES.map((s, i) => `${i + 1}) ${s.title} (${s.entity})`).join("\n");
    return (
      "Servicios disponibles:\n" +
      list +
      "\n\n" +
      "Dime el número (por ejemplo “3”) o una palabra clave (por ejemplo “multas”, “miembro de mesa”, “reniec”) y te leo el detalle."
    );
  }

  const mNum = q.match(/^\s*(\d{1,2})\s*$/);
  if (mNum) {
    const n = Number(mNum[1]);
    const item = CIUDADANO_SERVICES[n - 1];
    if (!item) return "Ese número no existe en la lista. Dime un número válido.";
    return `${item.title} (${item.entity})\n\n${item.description}\n\nEnlace oficial:\n${item.url}`;
  }

  const wantsJNE = q.includes("jne");
  const wantsONPE = q.includes("onpe");
  const wantsRENIEC = q.includes("reniec");

  if (wantsJNE || wantsONPE || wantsRENIEC) {
    const ent = wantsJNE ? "JNE" : wantsONPE ? "ONPE" : "RENIEC";
    const list = CIUDADANO_SERVICES.filter((s) => s.entity === ent)
      .map((s, i) => `${i + 1}) ${s.title}`)
      .join("\n");

    return `Servicios de ${ent}:\n${list}\n\nDime el nombre exacto del servicio o escribe “lista” para ver todo.`;
  }

  const hit = CIUDADANO_SERVICES.find((s) => {
    const t = normalize(s.title);
    return t.includes(q) || q.includes(t);
  });

  if (hit) {
    return `${hit.title} (${hit.entity})\n\n${hit.description}\n\nEnlace oficial:\n${hit.url}`;
  }

  const words = q.split(" ").filter((w) => w.length >= 4);
  let best: any = null;
  let bestScore = 0;

  for (const s of CIUDADANO_SERVICES) {
    const t = normalize(`${s.title} ${s.description}`);
    let score = 0;
    for (const w of words) if (t.includes(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  if (best && bestScore >= 1) {
    return `${best.title} (${best.entity})\n\n${best.description}\n\nEnlace oficial:\n${best.url}`;
  }

  return (
    "No encontré ese servicio en esta página.\n\n" +
    "Prueba con: “lista”, “multas”, “miembro de mesa”, “local de votación”, “cédula”, “reniec”.\n\n" +
    CIUDADANO_PAGE_GUIDE
  );
}

async function handleCiudadanoServicio(
  rawQ: string,
  maybeSpeakFn: (t: string) => Promise<void>,
  pushFn: (t: string) => void
 ) 
 
 {
  const out = answerFromCiudadanoServicio(rawQ);
  pushFn(out);
  await maybeSpeakFn(out);
 }
function answerFromComoFunciona(rawQ: string) {
  const q = normalizeLite(rawQ);

  // 0) si pregunta muy corta o tipo "ayuda"
  if (!q || q.length < 3 || q.includes("ayuda") || q.includes("guia") || q.includes("guía")) {
    return COMO_FUNCIONA_GUIDE;
  }

  // 1) “lista / qué hay / leer todo”
  if (
    q.includes("lista") ||
    q.includes("que hay") ||
    q.includes("qué hay") ||
    q.includes("leer todo") ||
    q.includes("todo")
  ) {
    const list = COMO_FUNCIONA_FAQ.map((it, i) => `${i + 1}) ${it.title}`).join("\n");
    return (
      `${COMO_FUNCIONA_GUIDE}\n\n` +
      `Temas disponibles:\n${list}\n\n` +
      `Dime el número (por ejemplo “2”) o una palabra clave (por ejemplo “políticas”, “privacidad”, “voz”, “micrófono”).`
    );
  }

  // 2) si el usuario dice solo un número 1..N
  const mNum = q.match(/^\s*(\d{1,2})\s*$/);
  if (mNum) {
    const n = Number(mNum[1]);
    const item = COMO_FUNCIONA_FAQ[n - 1];
    if (!item) return "Ese número no existe en la lista. Dime un número válido.";
    return `✅ ${item.title}\n\n${dedupeLeadingTitle(item.title, item.answer)}`;
  }

  // 3) match por keyword / título
  const hit =
    COMO_FUNCIONA_FAQ.find((it) => (it.keywords || []).some((k) => q.includes(normalizeLite(k)))) ||
    COMO_FUNCIONA_FAQ.find((it) => normalizeLite(it.title).includes(q) || q.includes(normalizeLite(it.title)));

  if (hit) return `✅ ${hit.title}\n\n${dedupeLeadingTitle(hit.title, hit.answer)}`;

  // 4) fallback: búsqueda suave por palabras (>=4 letras)
  const words = q.split(" ").filter((w) => w.length >= 4);
  let best: { item: any; score: number } | null = null;

  for (const it of COMO_FUNCIONA_FAQ) {
    const t = normalizeLite(`${it.title} ${it.answer} ${(it.keywords || []).join(" ")}`);
    let score = 0;
    for (const w of words) if (t.includes(w)) score++;
    if (!best || score > best.score) best = { item: it, score };
  }

  if (best && best.score >= 1) {
    return `✅ ${best.item.title}\n\n${dedupeLeadingTitle(best.item.title, best.item.answer)}`;
  }

  // 5) si no entiende, vuelve a guía + lista
  const list = COMO_FUNCIONA_FAQ.map((it, i) => `${i + 1}) ${it.title}`).join("\n");
  return (
    "No encontré ese tema en esta página.\n\n" +
    "Prueba con: “lista”, “políticas”, “privacidad”, “voz”, “micrófono”, “fuentes”, “qué hace el asistente”.\n\n" +
    `Temas disponibles:\n${list}\n\n` +
    COMO_FUNCIONA_GUIDE
  );
}

async function handleComoFunciona(
  rawQ: string,
  maybeSpeakFn: (t: string) => Promise<void>,
  pushFn: (t: string) => void
) {
  const out = answerFromComoFunciona(rawQ);
  pushFn(out);
  await maybeSpeakFn(out);
}
function getVoicesSafe(): SpeechSynthesisVoice[] {
  try {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  } catch {
    return [];
  }
}

function waitVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      const v = getVoicesSafe();
      if (v.length) return resolve(v);
      if (Date.now() - start > timeoutMs) return resolve(v);
      setTimeout(check, 120);
    }

    try {
      const onChanged = () => {
        const v = getVoicesSafe();
        if (v.length) {
          try {
            window.speechSynthesis.removeEventListener("voiceschanged", onChanged);
          } catch {}
          resolve(v);
        }
      };
      window.speechSynthesis?.addEventListener?.("voiceschanged", onChanged as any);
    } catch {}

    check();
  });
}
// ✅ Cache simple de voces: evita llamar waitVoices() en cada chunk
let _voicesCache: SpeechSynthesisVoice[] | null = null;
let _voicesCacheAt = 0;

async function getVoicesCached(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  const now = Date.now();

  // si ya hay cache reciente (30s), úsalo
  if (_voicesCache && now - _voicesCacheAt < 30_000) return _voicesCache;

  const v = await waitVoices(timeoutMs);
  _voicesCache = v;
  _voicesCacheAt = now;
  return v;
}

function pickBestVoice(all: SpeechSynthesisVoice[], lang: VoiceLang): SpeechSynthesisVoice | null {
  if (!all.length) return null;

  const scored = all.map((v) => {
    const name = normalize(v.name || "");
    const vlang = normalize(v.lang || "");
    const local = !!v.localService;

    let score = 0;

    if (name.includes("google")) score += 30;
    if (name.includes("microsoft")) score += 25;
    if (local) score += 10;

    if (lang === "es-PE") {
      if (vlang === "es-pe") score += 60;
      if (vlang.startsWith("es-")) score += 35;
      if (vlang.includes("es-419")) score += 25;
    } else {
      if (vlang.startsWith("qu")) score += 80;
      if (vlang.includes("quz")) score += 80;
      if (name.includes("quech")) score += 50;
      if (name.includes("quich")) score += 30;
    }

    if (name.includes("male") || name.includes("hombre")) score += 6;
    if (name.includes("juan") || name.includes("carlos") || name.includes("diego") || name.includes("andres"))
      score += 3;

    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}
 function replaceCountWithArticle(
  text: string,
  words: string[],
  article: "un" | "una"
) {
  let out = text;

  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b1\\s+(${escaped})\\b`, "gi");
    out = out.replace(re, `${article} $1`);
  }

  return out;
}

function humanizeCountPhrasesForSpeech(input: string) {
  let s = String(input || "");

  s = replaceCountWithArticle(
    s,
    [
      "imagen",
      "pregunta",
      "respuesta",
      "acción",
      "accion",
      "opción",
      "opcion",
      "ventana",
      "página",
      "pagina",
      "ruta",
      "regla",
      "lista",
      "persona",
      "sesión",
      "sesion",
      "fase",
      "etapa",
      "idea",
      "prueba",
      "ficha",
    ],
    "una"
  );

  s = replaceCountWithArticle(
    s,
    [
      "comentario",
      "foro",
      "video",
      "bloque",
      "tema",
      "resultado",
      "proyecto",
      "mensaje",
      "registro",
      "código",
      "codigo",
      "paso",
      "nivel",
      "dato",
      "campo",
      "voto",
      "ganador",
      "error",
    ],
    "un"
  );

  return s;
}
function humanizeForSpeech(input: string) {
  // ✅ Limpieza global ANTES de cualquier replace
   let s = cleanForSpeech(sanitizeAssistantTextForVoice(String(input ?? ""))).normalize("NFC");

  // (opcional pero recomendado) reemplaza NBSP por espacio normal
  s = s.replace(/\u00A0/g, " ");

  s = s.replace(/[✅✔️☑️]/g, "");
  s = s.replace(/[🎙️🔊]/g, "");

  s = s.replace(/\/candidate\/\[[^\]]+\]/gi, "la ficha del candidato");
  s = s.replace(/\/candidate\/[a-z0-9\-_]+/gi, "la ficha del candidato");
  s = s.replace(/\/api\/[a-z0-9\/\-_?=&]+/gi, "el servidor");
  s = s.replace(/https?:\/\/\S+/gi, "un enlace");

  s = s.replace(/^\s*[-–—−•]\s+/gm, "");
  s = s.replace(/[—−]/g, ", ");

  s = s
    .replace(/[\/\\]+/g, " ")
    .replace(/[\*\|_#]+/g, " ")
    .replace(/[-]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
      // ✅ VERSIÓN 2 (ultra segura):
  // Suaviza la pausa SOLO en "debe + infinitivo"
  // No afecta el resto del texto
  s = s.replace(
    /\b(debe)\s+(?=[a-záéíóúñ]{3,}(?:ar|er|ir)\b)/gi,
    "$1 "
  );

  // ✅ Suavizar pausa SOLO para "debe + infinitivo"
  s = s.replace(/\b(debe)\s+(?=[a-záéíóúñ]{3,}ir)\b/gi, "$1 ");

    s = s.replace(/\(p\.\s*(\d+)\)/gi, "(página $1)");
  s = s.replace(/\bp\.\s*(\d+)\b/gi, "página $1");

  s = humanizeCountPhrasesForSpeech(s);

  return s;
}

async function speakText(
  text: string,
  lang: VoiceLang
): Promise<{ ok: boolean; usedLang: "es-PE" | "qu" | "fallback-es"; reason?: string }> {

  const msg = humanizeForSpeech((text || "").trim());

  // ✅ DEBUG del texto FINAL que realmente se habla
  debugUnicode("SPEAK_MSG", msg);

  if (!msg) return { ok: false, usedLang: "fallback-es", reason: "empty" };

  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return { ok: false, usedLang: "fallback-es", reason: "no-tts" };
  }

    const voices = await getVoicesCached(1200);

  let targetLang: VoiceLang = lang;
  let usedLang: "es-PE" | "qu" | "fallback-es" = lang === "qu" ? "qu" : "es-PE";

  const hasQuechua = voices.some((v) => {
    const l = normalize(v.lang || "");
    const n = normalize(v.name || "");
    return l.startsWith("qu") || l.includes("quz") || n.includes("quech") || n.includes("quich");
  });

  if (lang === "qu" && !hasQuechua) {
    targetLang = "es-PE";
    usedLang = "fallback-es";
  }

  const voice = pickBestVoice(voices, targetLang);

// ✅ Preferir voces más naturales si existen (sin cambiar lógica general)
let natural: SpeechSynthesisVoice | null = null;

for (const v of voices) {
  if (
    (v.lang || "").toLowerCase().startsWith("es") &&
    /google|microsoft|natural|neural/i.test(v.name || "")
  ) {
    natural = v;
    break;
  }
}

try {
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(msg);

  // idioma
  u.lang = targetLang === "qu" ? "qu" : "es-PE";

  // ✅ usar la mejor voz disponible (sin ??)
  if (natural) {
    u.voice = natural;
  } else if (voice) {
    u.voice = voice;
  }

    // ✅ PRUEBA: NO forzar voz (que el navegador elija)
  // u.voice = ...

  // ✅ PRUEBA: parámetros neutros
  u.rate = 1;
  u.pitch = 1;
  u.volume = 1;

  return await new Promise((resolve) => {
    u.onend = () => resolve({ ok: true, usedLang });
    u.onerror = () => resolve({ ok: false, usedLang, reason: "utterance-error" });
    window.speechSynthesis.speak(u);
  });
} catch {
  return { ok: false, usedLang, reason: "exception" };
}

} // ✅ cierre de speakText (ESTA era la llave que faltaba)

function splitForSpeech(text: string, maxLen = 220) {
  const s = humanizeForSpeech(String(text || "").trim());
  if (!s) return [];

  const parts: string[] = [];

  // 1) separar por saltos de línea
  const chunks = s
    .split(/\n+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  // 2) dentro de cada chunk, separar por oraciones (puntuación)
  for (const c of chunks) {
    const sentences = c.split(/(?<=[\.\!\?\:])\s+/g).map((x) => x.trim()).filter(Boolean);

    for (const sent of sentences) {
      if (sent.length <= maxLen) {
        parts.push(sent);
        continue;
      }

      // 3) si una oración es muy larga, partir SIN cortar palabras
      let rest = sent;

      while (rest.length > maxLen) {
        const slice = rest.slice(0, maxLen);

        // cortar en el último espacio dentro del límite
        let cut = slice.lastIndexOf(" ");

        // si no hay espacio razonable, intenta con coma/; dentro del límite
        if (cut < 20) {
          const comma = slice.lastIndexOf(", ");
          const semi = slice.lastIndexOf("; ");
          cut = Math.max(cut, comma, semi);
        }

        // si aún no hay, corte duro (caso raro: palabra larguísima sin espacios)
        if (cut < 20) cut = maxLen;

               let head = rest.slice(0, cut).trim();
        let tail = rest.slice(cut).trim();

        // ✅ Ultra específico: si el chunk queda solo "debe"
        // y lo que sigue parece infinitivo, movemos "debe" al siguiente chunk
        if (
          /^debe$/i.test(head) &&
          /^[a-záéíóúñ]{3,}(?:ar|er|ir)\b/i.test(tail)
        ) {
          tail = `${head} ${tail}`.trim();
          head = "";
        }

        if (head) parts.push(head);
        rest = tail;

      }

      if (rest) parts.push(rest);
    }
  }

  return parts.filter(Boolean);
}
function dedupeLeadingTitle(title: string, answer: string) {
  const t = String(title ?? "").trim();
  let a = String(answer ?? "");

  if (!t) return a;

  // Escape para regex
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Quita al inicio: "Titulo:" (con espacios/saltos)
  const re = new RegExp("^\\s*" + escaped + "\\s*:\\s*", "i");
  if (re.test(a)) a = a.replace(re, "");

  return a;
}
function cleanForSpeech(text: string) {
  let t = String(text ?? "");

  // invisibles comunes (mantiene lo que ya tenías)
  t = t
    .replace(/\u00AD/g, "") // soft hyphen
    .replace(/\u200B/g, "") // zero-width space
    .replace(/\u200C/g, "") // zero-width non-joiner
    .replace(/\u200D/g, "") // zero-width joiner
    .replace(/\u2060/g, ""); // word joiner

  // quitar markdown básico para que no lea símbolos
  t = t
    .replace(/```[\s\S]*?```/g, " ") // bloques de código
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1"); // links markdown

  // términos técnicos: evita "storage, storage"
  t = t
    .replace(/\bLocalStorage\/SessionStorage\b/gi, "almacenamiento local o de sesión")
    .replace(/\bLocalStorage\b/gi, "almacenamiento local")
    .replace(/\bSessionStorage\b/gi, "almacenamiento de sesión");

  // URLs: que suenen humano
  t = t
    .replace(/\bhttps?:\/\/www\./gi, "www punto ")
    .replace(/\bhttps?:\/\//gi, "")
    .replace(/\bwww\./gi, "www punto ")
    .replace(/\.gob\.pe\b/gi, " punto gob punto pe")
    .replace(/\.com\b/gi, " punto com")
    .replace(/\.pe\b/gi, " punto pe")
    .replace(/\.org\b/gi, " punto org")
    .replace(/\//g, " / ");

  // siglas comunes (ajusta pronunciación)
  t = t
    .replace(/\bPDF\b/g, "P D F")
    .replace(/\bAPI\b/g, "A P I")
    .replace(/\bTTS\b/g, "T T S")
    .replace(/\bHV\b/g, "H V");

  // limpieza final
  t = t
    .replace(/\s+/g, " ")
    .replace(/\s([,.;:!?])/g, "$1")
    .trim();

  return t;
}

function fixMojibakeBasic(input: string) {
  let s = String(input ?? "");

  // casos más comunes ES
  s = s
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã/g, "Í")
    .replace(/Ã“/g, "Ó")
    .replace(/Ãš/g, "Ú")
    .replace(/Ã‘/g, "Ñ")
    .replace(/Ã¼/g, "ü")
    .replace(/Ãœ/g, "Ü")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€˜/g, "‘")
    .replace(/â€™/g, "’")
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—")
    .replace(/â€¢/g, "•")
    .replace(/Â/g, ""); // típico “Â ” antes de espacios

  return s.normalize("NFC");
}

  function cleanForChat(input: string) {
  return fixMojibakeBasic(
    String(input ?? "")
      .replace(/\u00AD/g, "")
      .replace(/\u200B/g, "")
      .replace(/\u200C/g, "")
      .replace(/\u200D/g, "")
      .replace(/\u2060/g, "")
      .trim()
  ).normalize("NFC");
}

function debugUnicode(label: string, s: string) {
  try {
    const codes = Array.from(s).map((c) => {
      const cp = c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
      const shown = c === " " ? "<SP>" : c;
      return `U+${cp}(${shown})`;
    });
    console.log(`[${label}]`, codes.join(" "));
  } catch (err) {
    console.log(`[${label}] debugUnicode error`, err);
  }
}

async function speakTextChunked(
  text: string,
  lang: VoiceLang
): Promise<{ ok: boolean; usedLang: "es-PE" | "qu" | "fallback-es"; reason?: string } | null> {
  const parts = splitForSpeech(text, 220);
  if (!parts.length) return null;

  // ✅ Cancelar UNA sola vez por lectura completa (evita pausas largas entre partes)
  
  let last: { ok: boolean; usedLang: "es-PE" | "qu" | "fallback-es"; reason?: string } | null = null;

  for (const part of parts) {
    const r = await speakText(part, lang);
    last = r;
    if (!r.ok) break;
  }

  return last;
}


type AiAnswerResponse = {
  ok: boolean;
  id: string;
  doc: "plan" | "hv";
  axis?: string;
  answer: string;
  citations?: Array<{ title: string; url?: string; page?: number }>;
  error?: string;
};

type WebAskSource = { source: number; title: string; url: string; domain: string };
type WebAskCitation = { source: number; url: string; quote: string };
type WebAskResponse = {
  q: string;
  answer: string;
  sources?: WebAskSource[];
  citations?: WebAskCitation[];
  error?: string;
};

async function safeReadJson(res: Response) {
  // ✅ Siempre leemos como texto primero.
  // Así evitamos errores raros de res.json() cuando el servidor devuelve HTML, texto,
  // o un JSON inválido (o truncado) en producción.
  const text = await res.text();

  // Intento de parseo seguro
  try {
    // Si viene vacío, lo tratamos como no-JSON
    if (!text || !text.trim()) return { _nonJson: true, text: "" };

    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    // No era JSON válido (por ejemplo HTML de error 500)
    return { _nonJson: true, text: text.slice(0, 5000) };
  }
}

function slugToName(slug: string) {
  return (slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferAxisFromQuestion(q: string): "ECO" | "SEG" | "SAL" | "EDU" {
  const t = q.toLowerCase();

  if (t.includes("seguridad") || t.includes("delinc") || t.includes("crimen") || t.includes("extors")) return "SEG";
  if (t.includes("salud") || t.includes("hospital") || t.includes("essalud") || t.includes("sis")) return "SAL";
  if (t.includes("educ") || t.includes("coleg") || t.includes("escuel") || t.includes("univers") || t.includes("docente"))
    return "EDU";

  return "ECO";
}

function prettyCitationsText(input: string) {
  let s = String(input || "");
  s = s.replace(/\(p\.\s*(\d+)\)/gi, "(página $1)");
  s = s.replace(/\bp\.\s*(\d+)\b/gi, "página $1");
  return s;
}
 function looksTruncatedContextAnswer(input: string) {
  const s = String(input || "").trim();
  if (!s) return true;

  const lower = normalizeLite(s);

  // finales sospechosos muy típicos de corte
  const badEndings = [
    "lo que significa.",
    "lo.",
    "la.",
    "los.",
    "las.",
    "que.",
    "como.",
    "cómo.",
    "cuando.",
    "cuándo.",
    "donde.",
    "dónde.",
    "quien.",
    "quién.",
    "ya han sido.",
    "ya fue.",
    "ya han.",
    "ya se.",
    "para.",
    "porque.",
    "por que.",
    "sin que.",
    "aunque.",
    "mientras.",
    "dentro de comentarios ciudadanos, lo.",
    "en modo observador, lo.",
  ].map(normalizeLite);

  if (badEndings.some((ending) => lower.endsWith(ending))) {
    return true;
  }

  // si termina con conector o frase claramente abierta
  if (
    /\b(lo|la|los|las|que|como|cuando|donde|quien|porque|para|mientras|aunque)\.$/i.test(s)
  ) {
    return true;
  }

  // frases demasiado cortas para preguntas compuestas
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 8) {
    const compoundQuestionSignals = [
      "quien puede",
      "quién puede",
      "cuando aparece",
      "cuándo aparece",
      "que diferencia",
      "qué diferencia",
      "cuantos comentarios",
      "cuántos comentarios",
      "que tipo de comentario",
      "qué tipo de comentario",
    ];

    // este helper solo evalúa la respuesta; el filtro fino se hace afuera con la pregunta
    // pero igual sirve para descartar respuestas anormalmente pobres
    if (compoundQuestionSignals.some((x) => lower.includes(x))) {
      return true;
    }
  }

  return false;
}
// ✅ Helpers: follow-ups y contexto
function looksLikeFollowUp(q: string) {
  const t = normalize(q).trim();
  if (!t) return false;
  if (t.length <= 22) return true;

  const patterns = [
    "y eso",
    "y esa",
    "y ese",
    "cuando",
    "cuándo",
    "donde",
    "dónde",
    "quien",
    "quién",
    "cual",
    "cuál",
    "que año",
    "qué año",
    "en que año",
    "en qué año",
    "en que fecha",
    "en qué fecha",
    "cual es",
    "cuál es",
    "por que",
    "por qué",
    "como asi",
    "cómo así",
    "mas detalle",
    "más detalle",
    "explica",
    "explicame",
    "explícame",
    "amplia",
    "amplía",
    "fuente",
    "fuentes",
    "link",
    "enlace",
    "prueba",
    "evidencia",
    "cita",
    "citas",
  ];

  return patterns.some((p) => t.includes(normalize(p)));
}

function buildContextualQuestion(rawQ: string, mem: MemoryState, candidateName: string, askMode: AskMode) {
  const q = (rawQ || "").trim();
  if (!q) return q;

  const hasPrev = !!(mem?.lastQuestion || mem?.lastAnswer);
  if (!hasPrev) return q;

  if (mem.lastCandidateName && candidateName && mem.lastCandidateName !== candidateName) {
    return q;
  }

  if (!looksLikeFollowUp(q)) return q;

  const modeLabel =
    askMode === "HV" ? "Hoja de Vida (PDF)" : askMode === "PLAN" ? "Plan de Gobierno (PDF)" : "Actuar político (web)";
  const who = (candidateName || mem.lastCandidateName || "").trim();

  const prevQ = (mem.lastQuestion || "").trim();
  const prevA = (mem.lastAnswer || "").trim();

  const anchor =
    prevA && prevA.length > 0
      ? `Respuesta previa (resumen): ${prevA.slice(0, 220)}${prevA.length > 220 ? "…" : ""}`
      : prevQ
      ? `Pregunta previa: ${prevQ.slice(0, 180)}${prevQ.length > 180 ? "…" : ""}`
      : "";

  const enriched =
    `${who ? who + " — " : ""}${modeLabel}.\n` +
    `Contexto: el usuario está haciendo una pregunta de seguimiento.\n` +
    `${anchor ? anchor + "\n" : ""}` +
    `Pregunta actual: ${q}`;

  return enriched;
}

function safeLoadMem(): MemoryState {
  try {
    const raw = sessionStorage.getItem(LS_ASSIST_MEM);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MemoryState;
  } catch {
    return {};
  }
}

function safeSaveMem(mem: MemoryState) {
  try {
    sessionStorage.setItem(LS_ASSIST_MEM, JSON.stringify(mem || {}));
  } catch {}
}

function getCompareIdFromSearchParams(sp: any) {
  const candidates = [sp?.get("idB"), sp?.get("b"), sp?.get("compare"), sp?.get("compareWith"), sp?.get("vs")].filter(
    Boolean
  ) as string[];
  return (candidates[0] ?? "").trim();
}

function answerFromCambioConValentia(rawQ: string) {
  const q = normalize(rawQ);

  const wantsGuide =
    !q ||
    q.length < 3 ||
    q.includes("ayuda") ||
    q.includes("guia") ||
    q.includes("guía") ||
    q.includes("como usar") ||
    q.includes("qué es") ||
    q.includes("que es");

  if (wantsGuide) {
    return `${CAMBIO_PAGE_GUIDE}\n\n${CAMBIO_PAGE_TITLE}\n\nEnlace:\n${CAMBIO_PAGE_LINK_URL}\n\n${CAMBIO_PAGE_PHRASE}`;
  }
    // ✅ Preguntas por temas/propuestas: esta ventana solo es acceso + mensaje + link
  if (
    q.includes("tema") ||
    q.includes("temas") ||
    q.includes("propuesta") ||
    q.includes("propuestas") ||
    q.includes("eje") ||
    q.includes("ejes") ||
    q.includes("plan")
  ) {
    return (
      "En esta ventana solo muestro el acceso y el mensaje principal.\n\n" +
      "Para ver temas y propuestas detalladas, revisa el sitio oficial:\n" +
      CAMBIO_PAGE_LINK_URL
    );
  }
  if (q.includes("link") || q.includes("enlace") || q.includes("web") || q.includes("pagina") || q.includes("página")) {
    return `Enlace oficial:\n${CAMBIO_PAGE_LINK_URL}`;
  }

  if (q.includes("leer") || q.includes("frase") || q.includes("mensaje") || q.includes("texto")) {
    return `${CAMBIO_PAGE_PHRASE}\n\nEnlace:\n${CAMBIO_PAGE_LINK_URL}`;
  }

  return `${CAMBIO_PAGE_TITLE}\n\nEnlace:\n${CAMBIO_PAGE_LINK_URL}\n\n${CAMBIO_PAGE_PHRASE}`;
}

async function handleCambioConValentia(
  rawQ: string,
  maybeSpeakFn: (t: string) => Promise<void>,
  pushFn: (t: string) => void
) {
  // ✅ Si es “Conversación del partido” => responder desde docs del partido
  const i = detectIntent(rawQ);

  if (i.asksPartyDetails || i.wantsPLAN || i.wantsHV || i.wantsNEWS || i.t.length >= 12) {
    try {
      const res = await fetch("/api/party/docs/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          partyId: "perufederal",
          mode: "SUMMARY",
          question: String(rawQ || "").trim(),
        }),
      });

      const payload = await safeReadJson(res);

      if (!res.ok) {
        const msg =
          (payload as any)?._nonJson
            ? "Error PARTY DOCS: respuesta no-JSON. Revisa DevTools → Network → /api/party/docs/chat."
            : `Error PARTY DOCS: ${String((payload as any)?.error ?? (payload as any)?.message ?? "desconocido")}`;
        pushFn(msg);
        await maybeSpeakFn(msg);
        return;
      }

      const ans = String((payload as any)?.answer ?? (payload as any)?.text ?? "").trim();
      const out = ans || "No encontré una respuesta en los documentos del partido para esa pregunta.";

      pushFn(out);
      await maybeSpeakFn(out);
      return;
    } catch {
      const msg = "No pude consultar los documentos del partido en este momento.";
      pushFn(msg);
      await maybeSpeakFn(msg);
      return;
    }
  }

  // ✅ Caso normal de esta ventana (guía/link/frase)
  const out = answerFromCambioConValentia(rawQ);
  pushFn(out);
  await maybeSpeakFn(out);
}

type PageCtx =
  | "HOME"
  | "REFLEXION"
  | "CIUDADANO"
  | "CAMBIO"
  | "CANDIDATE"
  | "INTENCION"
  | "RETO"
  | "COMENTARIO"
  | "COMO_FUNCIONA"
  | "OTHER";
function getPageCtx(pathname: string): PageCtx {
  const p = String(pathname || "");
  if (p === "/" || p.startsWith("/#")) return "HOME";
  if (p.startsWith("/como-funciona")) return "COMO_FUNCIONA";
  if (p.startsWith("/reflexion")) return "REFLEXION";
  if (p.startsWith("/ciudadano/servicio") || p.startsWith("/ciudadano/servicios"))
  return "CIUDADANO";
  if (p.startsWith("/cambio-con-valentia")) return "CAMBIO";
  if (p.startsWith("/candidate/")) return "CANDIDATE";
  if (p.startsWith("/intencion-de-voto")) return "INTENCION";
  if (p.startsWith("/reto-ciudadano")) return "RETO";
 if (
  p.startsWith("/comentario-ciudadano") ||
  p.startsWith("/comentarios-ciudadanos") ||
  p.startsWith("/comentarios")
)
  return "COMENTARIO";
  return "OTHER";
}

function hasProfanity(rawQ: string) {
  const t = normalizeLite(rawQ);
  if (!t) return false;

  const bad = [
    "idiota",
    "imbecil",
    "imbécil",
    "estupido",
    "estúpido",
    "cojudo",
    "cojuda",
    "concha",
    "mierda",
    "carajo",
    "puta",
    "puto",
    "ctm",
    "csm",
    "huevon",
    "huevón",
    "huevona",
    "pendejo",
    "pendeja",
    "gil",
  ].map(normalizeLite);

  return bad.some((w) => w && t.includes(w));
}
  function shouldForceLocalComentarioAnswer(
  rawQ: string,
  pageContext: {
    pageId?: string;
    dynamicData?: Record<string, unknown>;
  } | null
) {
  if (!pageContext) return false;
  if (String(pageContext.pageId || "") !== "comentario-ciudadano") return false;

  const q = normalizeLite(rawQ);

  return (
    q.includes("que puedo hacer en comentarios ciudadanos si todavia no me he registrado") ||
    q.includes("qué puedo hacer en comentarios ciudadanos si todavía no me he registrado") ||
    q.includes("que debo hacer exactamente para participar en comentarios ciudadanos") ||
    q.includes("qué debo hacer exactamente para participar en comentarios ciudadanos") ||
    q.includes("el mismo codigo") ||
    q.includes("el mismo código") ||
    q.includes("como funciona el bloque de comentario ciudadano") ||
    q.includes("cómo funciona el bloque de comentario ciudadano") ||
    q.includes("cuantos comentarios puedo enviar") ||
    q.includes("cuántos comentarios puedo enviar") ||
    q.includes("que tipo de comentario") ||
    q.includes("qué tipo de comentario") ||
    q.includes("como participo con un video") ||
    q.includes("cómo participo con un video") ||
    q.includes("cuantos videos puedo enviar") ||
    q.includes("cuántos videos puedo enviar") ||
    q.includes("reglas debo seguir") ||
    q.includes("como funciona la votacion de la semana anterior") ||
    q.includes("cómo funciona la votación de la semana anterior") ||
    q.includes("que significa exactamente que un video ya este en votacion") ||
    q.includes("qué significa exactamente que un video ya esté en votación") ||
    q.includes("ya registre mi voto") ||
    q.includes("ya registré mi voto") ||
    q.includes("que significa el bloque de pregunta al fundador") ||
    q.includes("qué significa el bloque de pregunta al fundador") ||
    q.includes("quien puede usar el bloque de pregunta al fundador") ||
    q.includes("quién puede usar el bloque de pregunta al fundador") ||
    q.includes("que son los foros abiertos") ||
    q.includes("qué son los foros abiertos") ||
    q.includes("que puedo hacer en los foros abiertos") ||
    q.includes("qué puedo hacer en los foros abiertos") ||
    q.includes("que diferencia hay entre comentar el tema semanal y participar en los foros") ||
    q.includes("qué diferencia hay entre comentar el tema semanal y participar en los foros")
  );
}
function detectIntent(rawQ: string) {
  const t = normalizeLite(rawQ);

  const wantsHV =
    t.includes("hoja de vida") ||
    t.includes("hv") ||
    (t.includes("vida") && t.includes("candidato"));

  const wantsPLAN =
    t.includes("plan") ||
    t.includes("plan de gobierno") ||
    t.includes("plan de trabajo") ||
    t.includes("propuesta") ||
    t.includes("promesa");

  const wantsNEWS =
    t.includes("actuar") ||
    t.includes("noticia") ||
    t.includes("noticias") ||
    t.includes("investigacion") ||
    t.includes("investigación") ||
    t.includes("denuncia") ||
    t.includes("caso");

  const wantsREFLEXION =
    t.includes("reflexion") ||
    t.includes("reflexión") ||
    (t.includes("pregunta") &&
      (t.includes("salud") ||
        t.includes("educ") ||
        t.includes("segur") ||
        t.includes("corrup") ||
        t.includes("econom")));

  const wantsCIUDADANO =
    t.includes("servicio al ciudadano") ||
    t.includes("servicios al ciudadano") ||
    t.includes("miembro de mesa") ||
    t.includes("local de votacion") ||
    t.includes("local de votación") ||
    t.includes("multas") ||
    t.includes("reniec") ||
    t.includes("jne") ||
    t.includes("onpe");

  const wantsCAMBIO =
    t.includes("peru federal") ||
    t.includes("perú federal") ||
    t.includes("cambio con valentia") ||
    t.includes("cambio con valentía");

  const asksPartyDetails =
    t.includes("partido") ||
    t.includes("propuesta del partido") ||
    t.includes("ideologia") ||
    t.includes("ideología") ||
    t.includes("programa") ||
    t.includes("estatuto") ||
    t.includes("milit");

  // ✅ HOME: ayuda genérica
  const wantsHOMEHELP =
    t.includes("que hago") ||
    t.includes("qué hago") ||
    t.includes("como uso") ||
    t.includes("cómo uso") ||
    t.includes("como funciona") ||
    t.includes("cómo funciona") ||
    t.includes("ayuda") ||
    t.includes("guia") ||
    t.includes("guía") ||
    t.includes("inicio") ||
    t.includes("esta ventana") ||
    t.includes("esta pagina") ||
    t.includes("esta página");

  // ✅ HOME: comparar candidatos / planes
  const wantsCompare =
    t.includes("compar") ||
    t.includes("vs") ||
    t.includes("versus") ||
    (t.includes("difer") &&
      (t.includes("candidato") ||
        t.includes("plan") ||
        t.includes("propuesta")));

  // ✅ HOME: cómo votar / dónde voto
  const wantsHowToVote =
    t.includes("como votar") ||
    t.includes("cómo votar") ||
    t.includes("donde voto") ||
    t.includes("dónde voto") ||
    t.includes("mi local") ||
    t.includes("local de vot") ||
    t.includes("miembro de mesa") ||
    t.includes("multa");

  // ✅ HOME: búsqueda de candidatos / quién es
  const wantsCandidateSearch =
    t.includes("buscar candidato") ||
    t.includes("busco candidato") ||
    (t.includes("buscar") &&
      (t.includes("candidato") || t.includes("nombre"))) ||
    t.includes("quien es") ||
    t.includes("quién es") ||
    t.includes("quien postula") ||
    t.includes("quién postula");

  // ✅ HOME: navegación por tarjetas
  const wantsNavigateHomeCards =
    t.includes("servicios") ||
    t.includes("reflex") ||
    t.includes("cambio con valent") ||
    t.includes("peru federal") ||
    t.includes("perú federal");

  return {
    t,
    wantsHV,
    wantsPLAN,
    wantsNEWS,
    wantsREFLEXION,
    wantsCIUDADANO,
    wantsCAMBIO,
    asksPartyDetails,
    wantsHOMEHELP,
    wantsCompare,
    wantsHowToVote,
    wantsCandidateSearch,
    wantsNavigateHomeCards,
  };
}
function buildRedirectMessage(ctx: PageCtx, rawQ: string) {
  const i = detectIntent(rawQ);

  // ✅ HOME: nunca redirigir con mensaje genérico
  if (ctx === "HOME") {
    // Si es ayuda de inicio, lo maneja HOME local
    if (
      i.wantsHOMEHELP ||
      i.wantsCandidateSearch ||
      i.wantsCompare ||
      i.wantsHowToVote ||
      i.wantsNavigateHomeCards
    ) {
      return null;
    }

    // HOME fallback guiado (NUNCA Google)
    return (
      "Puedo ayudarte dentro de VOTO CLARO.\n\n" +
      "Opciones disponibles:\n" +
      "1) Buscar candidatos y abrir su ficha (HV, Plan, Actuar político).\n" +
      "2) Servicios al ciudadano: local de votación, miembro de mesa, multas.\n" +
      "3) Reflexionar antes de votar: preguntas por economía, salud, educación y seguridad.\n" +
      "4) Un cambio con valentía: acceso a propuesta oficial.\n\n" +
      "Dime qué opción te interesa o escribe, por ejemplo:\n" +
      "“buscar candidato”, “dónde voto”, “reflexión sobre salud”, “plan de gobierno”."
    );
  }

  // ===== resto de pantallas =====

  if (i.wantsCAMBIO || i.asksPartyDetails) {
    if (ctx === "CAMBIO") {
      return (
        "Para información detallada del partido o su propuesta oficial, lo mejor es visitar su web.\n\n" +
        "👉 Abre el sitio oficial: https://perufederal.pe/\n\n" +
        "Aquí en VOTO CLARO solo mostramos esta ventana como acceso rápido."
      );
    }
    return (
      "Ese tema corresponde a “UN CAMBIO CON VALENTÍA”.\n\n" +
      "👉 Ve a: /cambio-con-valentia\n\n" +
      "Ahí encontrarás el enlace oficial para conocer la propuesta."
    );
  }

  if (i.wantsHV || i.wantsPLAN || i.wantsNEWS) {
    if (ctx === "CANDIDATE") {
      if (i.wantsHV) return "Esto es de Hoja de Vida. Cambia a la pestaña HV y pregúntame ahí.";
      if (i.wantsPLAN) return "Esto es del Plan. Cambia a la pestaña Plan y pregúntame ahí.";
      if (i.wantsNEWS) return "Esto es de Actuar político. Cambia a la pestaña Actuar político y pregúntame ahí.";
    }

    const which = i.wantsHV ? "Hoja de Vida (HV)" : i.wantsPLAN ? "Plan (PLAN)" : "Actuar político (NEWS)";
    return (
      `Eso corresponde a la ficha del candidato (${which}).\n\n` +
      "👉 Ve al inicio (/), busca el candidato y entra a su ficha.\n" +
      "Luego elige la pestaña HV / Plan / Actuar político y me preguntas ahí."
    );
  }

  if (i.wantsREFLEXION) {
    if (ctx === "REFLEXION") return null;
    return (
      "Eso corresponde a “Reflexionar antes de votar”.\n\n" +
      "👉 Ve a: /reflexion\n\n" +
      "Ahí puedo leerte preguntas y reflexiones sin inventar."
    );
  }

  if (i.wantsCIUDADANO || i.wantsHowToVote) {
    if (ctx === "CIUDADANO") return null;
    return (
      "Eso corresponde a “Servicios al ciudadano”.\n\n" +
      "👉 Ve a: /ciudadano/servicio\n\n" +
      "Ahí te guío por los enlaces oficiales (JNE, ONPE, RENIEC)."
    );
  }

  // fallback fuera de HOME (controlado)
  return (
    "No puedo responder eso desde esta pantalla.\n\n" +
    "Muévete a una de estas secciones:\n" +
    "- Inicio: búsqueda de candidatos\n" +
    "- Servicios al ciudadano\n" +
    "- Reflexión antes de votar\n" +
    "- Un cambio con valentía"
  );
}

async function handleGlobalPolicyAndRedirect(params: {
  pathname: string;
  rawQ: string;
  candidateId: string;
  askMode: AskMode;
  pushAssistant: (t: string) => void;
  maybeSpeak: (t: string) => Promise<void>;
}): Promise<{ handled: boolean }> {
  const { pathname, rawQ, pushAssistant, maybeSpeak } = params;

  if (hasProfanity(rawQ)) {
    const msg =
      "Este espacio es para informarse con respeto.\n\n" +
      "Si deseas continuar, reformula tu pregunta sin insultos. " +
      "Si vas a seguir con groserías, te recomiendo retirarte de la app.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return { handled: true };
  }

      const ctx = getPageCtx(String(pathname || ""));
  const currentPath = String(pathname || "");
  const isEspacioEmprendedor = currentPath.startsWith("/espacio-emprendedor");
  const isProyectoCiudadano = currentPath.startsWith("/proyecto-ciudadano");

  // ✅ Estas pantallas no deben ser interceptadas por el gate global
  if (
    ctx === "INTENCION" ||
    ctx === "RETO" ||
    ctx === "COMENTARIO" ||
    isEspacioEmprendedor ||
    isProyectoCiudadano
  ) {
    return { handled: false };
  }
  const redirect = buildRedirectMessage(ctx, rawQ);

  // ✅ null => estás en pantalla correcta / o HOME help => NO interceptar
  if (redirect === null) return { handled: false };

if (ctx === "CANDIDATE") {
  const i = detectIntent(rawQ);

  // Solo redirigir si pide una sección distinta a la pestaña actual
  if (i.wantsHV || i.wantsPLAN || i.wantsNEWS) {
    const target: AskMode = i.wantsHV ? "HV" : i.wantsPLAN ? "PLAN" : "NEWS";

    if (params.askMode !== target) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
  }

  // Si ya está en la pestaña correcta, NO bloquear: que responda normal
  return { handled: false };
}
  const i = detectIntent(rawQ);

  if (ctx === "REFLEXION") {
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsCIUDADANO || i.wantsCAMBIO || i.asksPartyDetails) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

  if (ctx === "CIUDADANO") {
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsREFLEXION || i.wantsCAMBIO || i.asksPartyDetails) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

  if (ctx === "CAMBIO") {
    if (i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsREFLEXION || i.wantsCIUDADANO || i.asksPartyDetails) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }
    return { handled: false };
  }

  if (ctx === "HOME" || ctx === "OTHER") {
    const anyKnown =
      i.wantsHV || i.wantsPLAN || i.wantsNEWS || i.wantsREFLEXION || i.wantsCIUDADANO || i.wantsCAMBIO || i.asksPartyDetails || i.wantsHOMEHELP;

    // ✅ Si es HOMEHELP: no interceptamos (lo maneja HOME local abajo)
    if (ctx === "HOME" && i.wantsHOMEHELP) return { handled: false };

    if (!anyKnown) {
      pushAssistant(redirect);
      await maybeSpeak(redirect);
      return { handled: true };
    }

    pushAssistant(redirect);
    await maybeSpeak(redirect);
    return { handled: true };
  }

  return { handled: false };
}
type ActuarSource = { name: string; domain: string };
type ActuarItem = {
  id: string;
  title: string;
  date: string | null;
  source: ActuarSource;
  url: string;
  topic: string;
  snippet: string;
};

type ActuarFile = {
  candidate_full_name: string;
  candidate_slug: string;
  generated_at: string;
  items: ActuarItem[];
};

function safeIsoDate(d: string | null) {
  // null se manda al final
  if (!d) return "";
  return String(d).slice(0, 10);
}

function sortItemsNewest(items: ActuarItem[]) {
  return [...items].sort((a, b) => {
    const da = safeIsoDate(a.date);
    const db = safeIsoDate(b.date);
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da);
  });
}

function uniqueSources(items: ActuarItem[]) {
  const seen = new Set<string>();
  const out: ActuarSource[] = [];
  for (const it of items) {
    const key = `${it.source?.name || ""}__${it.source?.domain || ""}`.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: it.source.name, domain: it.source.domain });
  }
  return out;
}

function fmtItem(it: ActuarItem) {
  const d = it.date ? it.date : "sin fecha";
  const src = it.source?.name ? `${it.source.name} (${it.source.domain})` : "Fuente";
  return `• ${d} — ${it.title}\n  Fuente: ${src}\n  Link: ${it.url}\n  Nota: ${it.snippet}`;
}

function buildActuarFallback(rawQ: string) {
  return (
    "En el archivo local de Actuar Político de este candidato no tengo un registro sobre ese tema.\n\n" +
    "Para ampliar, puedes buscar en Internet en fuentes confiables (medios reconocidos, documentos oficiales o portales institucionales).\n\n" +
    `Tu pregunta fue: "${rawQ}"`
  );
}

function detectActuarIntent(rawQ: string) {
  const t = normalizeLite(rawQ);

  const wantsSummary =
    t.includes("resumen") || t.includes("rapido") || t.includes("rápido") || t.includes("lo mas importante") || t.includes("lo más importante");

  const wantsRecent =
    t.includes("reciente") || t.includes("último") || t.includes("ultimo") || t.includes("novedad") || t.includes("novedades");

  const wantsTimeline =
    t.includes("cronologia") || t.includes("cronología") || t.includes("linea de tiempo") || t.includes("línea de tiempo") || t.includes("orden");

  const wantsSources =
    t.includes("fuente") || t.includes("fuentes") || t.includes("dominio") || t.includes("enlaces") || t.includes("links");

  // topics
  const wantsSentencia = t.includes("sentencia") || t.includes("fallo") || t.includes("tc") || t.includes("corte");
  const wantsProceso = t.includes("proceso") || t.includes("caso") || t.includes("imput") || t.includes("acus") || t.includes("juicio");
  const wantsInvestigacion = t.includes("investig") || t.includes("denuncia") || t.includes("fiscal") || t.includes("corrup");
  const wantsControversia = t.includes("controvers") || t.includes("polém") || t.includes("polem") || t.includes("cuestion");
  const wantsCargo = t.includes("cargo") || t.includes("alcald") || t.includes("gobern") || t.includes("congres") || t.includes("minist");
  const wantsPartido = t.includes("partido") || t.includes("lider") || t.includes("lidera") || t.includes("presidenta") || t.includes("presidente");

  return {
    t,
    wantsSummary,
    wantsRecent,
    wantsTimeline,
    wantsSources,
    wantsSentencia,
    wantsProceso,
    wantsInvestigacion,
    wantsControversia,
    wantsCargo,
    wantsPartido,
  };
}

function filterByTopic(items: ActuarItem[], topic: string) {
  const tt = normalizeLite(topic);
  return items.filter((it) => normalizeLite(it.topic).includes(tt));
}

function keywordSearch(items: ActuarItem[], q: string) {
  const t = normalizeLite(q);
  if (!t || t.length < 3) return [];
  const words = t.split(/\s+/g).filter((w) => w.length >= 4);

  // match por texto completo o por palabras largas
  const hit = items.filter((it) => {
    const hay = normalizeLite(`${it.title} ${it.snippet} ${it.topic} ${it.source?.name} ${it.source?.domain}`);
    if (hay.includes(t)) return true;
    if (words.length) return words.some((w) => hay.includes(w));
    return false;
  });

  return hit;
}

function buildActuarAnswer(file: ActuarFile, rawQ: string) {
  const items = Array.isArray(file?.items) ? file.items : [];
  if (!items.length) return buildActuarFallback(rawQ);

  const i = detectActuarIntent(rawQ);
  const newest = sortItemsNewest(items);

  // 1) Fuentes
  if (i.wantsSources) {
    const srcs = uniqueSources(items);
    if (!srcs.length) return buildActuarFallback(rawQ);
    return (
      `Fuentes registradas para ${file.candidate_full_name}:\n\n` +
      srcs.map((s) => `• ${s.name} — ${s.domain}`).join("\n") +
      `\n\nTotal de ítems: ${items.length}`
    );
  }

  // 2) Resumen rápido
  if (i.wantsSummary) {
    const counts: Record<string, number> = {};
    for (const it of items) {
      const k = (it.topic || "otro").trim();
      counts[k] = (counts[k] || 0) + 1;
    }
    const top3 = newest.filter((x) => !!x.date).slice(0, 3);
      return (
      `Actuar político de ${file.candidate_full_name}\n` +
      `Total de registros encontrados: ${items.length}\n\n` +
      `Por temas:\n` +
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `• ${k}: ${v}`)
        .join("\n") +
      `\n\nMás recientes:\n` +
      (top3.length ? top3.map(fmtItem).join("\n\n") : "No hay ítems con fecha.")
    );
  }

  // 3) Recientes
  if (i.wantsRecent) {
    const top = newest.filter((x) => !!x.date).slice(0, 6);
    if (!top.length) return buildActuarFallback(rawQ);
   return `Hechos más recientes de ${file.candidate_full_name}\n\n` + top.map(fmtItem).join("\n\n");
  }

  // 4) Cronología
  if (i.wantsTimeline) {
    const top = newest.slice(0, 10);
   return `Cronología de ${file.candidate_full_name} (de lo más reciente a lo más antiguo)\n\n` + top.map(fmtItem).join("\n\n");
  }

  // 5) Filtros por “tema” (topics)
  if (i.wantsSentencia) {
    const hit = filterByTopic(items, "sentencia");
    const top = sortItemsNewest(hit).slice(0, 6);
    return top.length ? `Sentencias / fallos registrados — ${file.candidate_full_name}\n\n${top.map(fmtItem).join("\n\n")}` : buildActuarFallback(rawQ);
  }

  if (i.wantsProceso) {
    const hit = filterByTopic(items, "proceso");
    const top = sortItemsNewest(hit).slice(0, 6);
    return top.length ? `Procesos / casos registrados — ${file.candidate_full_name}\n\n${top.map(fmtItem).join("\n\n")}` : buildActuarFallback(rawQ);
  }

  if (i.wantsInvestigacion) {
    const hit = items.filter((it) => {
      const t = normalizeLite(it.topic);
      return t.includes("investig") || t.includes("denuncia");
    });
    const top = sortItemsNewest(hit).slice(0, 6);
    return top.length ? `Investigaciones / denuncias registradas — ${file.candidate_full_name}\n\n${top.map(fmtItem).join("\n\n")}` : buildActuarFallback(rawQ);
  }

  if (i.wantsControversia) {
    const hit = filterByTopic(items, "controversia");
    const top = sortItemsNewest(hit).slice(0, 6);
    return top.length ? `Controversias registradas — ${file.candidate_full_name}\n\n${top.map(fmtItem).join("\n\n")}` : buildActuarFallback(rawQ);
  }

  if (i.wantsCargo) {
    const hit = items.filter((it) => {
      const t = normalizeLite(it.topic);
      return t.includes("cargo") || t.includes("gestion") || t.includes("gestión");
    });
    const top = sortItemsNewest(hit).slice(0, 6);
    return top.length ? `Cargos / gestión registrada — ${file.candidate_full_name}\n\n${top.map(fmtItem).join("\n\n")}` : buildActuarFallback(rawQ);
  }

  if (i.wantsPartido) {
    const hit = filterByTopic(items, "partido");
    const top = sortItemsNewest(hit).slice(0, 6);
    return top.length ? `Partido / liderazgo registrado — ${file.candidate_full_name}\n\n${top.map(fmtItem).join("\n\n")}` : buildActuarFallback(rawQ);
  }

  // 6) Búsqueda libre por palabras
  const searchHits = keywordSearch(items, rawQ);
  const top = sortItemsNewest(searchHits).slice(0, 6);
  if (top.length) {
    return `Coincidencias en Actuar Político — ${file.candidate_full_name}\n\n` + top.map(fmtItem).join("\n\n");
  }

  return buildActuarFallback(rawQ);
}

export default function FederalitoAssistantPanel() {
  const pathname = usePathname();
  const { pageContext } = useAssistantRuntime();
  const isPitchPage = String(pathname || "").startsWith("/pitch");

  // ✅ Evita mismatch SSR/cliente (hydration)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ✅ Al cambiar de ventana, cortar cualquier narración en curso
        useEffect(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}

    pendingGuideSpeakRef.current = null;
    pendingGuidePathRef.current = null;
    pageReadPathRef.current = String(pathname || "");
    setPageReadText("");
    setPageReadAt(0);
  }, [pathname]);

  useEffect(() => {
    if (!mounted) return;

    // Preferencias (voz/idioma/modo)
    try {
      const vm = sessionStorage.getItem(LS_VOICE_MODE) as VoiceMode | null;
      setVoiceMode(vm === "OFF" ? "OFF" : "ON");

      const vl = sessionStorage.getItem(LS_VOICE_LANG) as VoiceLang | null;
      if (vl === "es-PE" || vl === "qu") setVoiceLang(vl);

      const am = sessionStorage.getItem(LS_ASK_MODE) as AskMode | null;
      if (am === "HV" || am === "PLAN" || am === "NEWS") setAskMode(am);
    } catch {}
    hydratedPrefsRef.current = true;

    // Memoria corta
    try {
      setMem(safeLoadMem());
    } catch {
      setMem({});
    }
    hydratedMemRef.current = true;
  }, [mounted]);

  const [searchParams, setSearchParams] = useState<URLSearchParams>(new URLSearchParams());

  useEffect(() => {
    try {
      setSearchParams(new URLSearchParams(window.location.search));
    } catch {
      setSearchParams(new URLSearchParams());
    }
  }, [pathname]);

  const compareCandidateId = useMemo(() => getCompareIdFromSearchParams(searchParams), [searchParams]);

  const isCiudadanoServicioPage =
  String(pathname || "").startsWith("/ciudadano/servicio") ||
  String(pathname || "").startsWith("/ciudadano/servicios");
  const isCambioConValentiaPage = String(pathname || "").startsWith(CAMBIO_PAGE_ROUTE);

  const [refAxisId, setRefAxisId] = useState<string | null>(null);
  const [refWaitingNumber, setRefWaitingNumber] = useState(false);

  const [open, setOpen] = useState(false);

  // ✅ Panel flotante (draggable)
  const panelRef = useRef<HTMLDivElement | null>(null);
  const hydratedPrefsRef = useRef(false);
  const hydratedMemRef = useRef(false);
  const hydratedPanelPosRef = useRef(false);
  const hydratedFabPosRef = useRef(false);

  const [pos, setPos] = useState<PanelPos>({ x: 16, y: 16 });

  // ✅ FAB movible (draggable)
  const fabRef = useRef<HTMLDivElement | null>(null);
  // ✅ FAB: márgenes seguros para no tapar contenido (barra inferior / safe area)
  const FAB_EDGE_PAD = 12;
  const FAB_BOTTOM_GUTTER = 88; // espacio extra para no tapar texto/barras inferiores

  const [fabPos, setFabPos] = useState<PanelPos>({ x: 16, y: 16 });

  const fabDragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  }>({
    dragging: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  });

  function clampFabPos(p: PanelPos): PanelPos {
    if (typeof window === "undefined") return p;

    const el = fabRef.current;
    const w = el?.offsetWidth ?? 170;
    const h = el?.offsetHeight ?? 56;

    const padX = FAB_EDGE_PAD;
    const padTop = FAB_EDGE_PAD;
    const padBottom = FAB_EDGE_PAD + FAB_BOTTOM_GUTTER;

    const maxX = Math.max(padX, window.innerWidth - w - padX);
    const maxY = Math.max(padTop, window.innerHeight - h - padBottom);

    return {
      x: Math.min(Math.max(p.x, padX), maxX),
      y: Math.min(Math.max(p.y, padTop), maxY),
    };
  }

  function defaultFabBottomRight(): PanelPos {
    if (typeof window === "undefined") return { x: 16, y: 16 };

    const el = fabRef.current;
    const w = el?.offsetWidth ?? 170;
    const h = el?.offsetHeight ?? 56;

    const pad = FAB_EDGE_PAD;
    const bottomPad = FAB_EDGE_PAD + FAB_BOTTOM_GUTTER;

    return clampFabPos({
      x: window.innerWidth - w - pad,
      y: window.innerHeight - h - bottomPad,
    });
  }
function safeResetFabPos() {
  const next = defaultFabBottomRight();
  setFabPos(next);
  try {
    localStorage.setItem(LS_ASSIST_FAB_POS, JSON.stringify(next));
  } catch {}
}

  function onFabPointerDown(e: React.PointerEvent) {
    if ((e as any).button != null && (e as any).button !== 0) return;

    // NO activar drag aquí (para no matar el click)
    fabDragRef.current.dragging = false;
    fabDragRef.current.moved = false;
    fabDragRef.current.pointerId = e.pointerId;
    fabDragRef.current.startX = e.clientX;
    fabDragRef.current.startY = e.clientY;
    fabDragRef.current.startPosX = fabPos.x;
    fabDragRef.current.startPosY = fabPos.y;

    // ❌ NO setPointerCapture (esto rompía clicks en algunos casos)
  }

  function onFabPointerMove(e: React.PointerEvent) {
    if (fabDragRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - fabDragRef.current.startX;
    const dy = e.clientY - fabDragRef.current.startY;

    // threshold para distinguir click vs drag
    if (!fabDragRef.current.moved && Math.abs(dx) + Math.abs(dy) > 6) {
      fabDragRef.current.moved = true;
      fabDragRef.current.dragging = true;
    }

    if (!fabDragRef.current.dragging) return;

    setFabPos(
      clampFabPos({
        x: fabDragRef.current.startPosX + dx,
        y: fabDragRef.current.startPosY + dy,
      })
    );
  }

  function onFabPointerUp(e: React.PointerEvent) {
    if (fabDragRef.current.pointerId !== e.pointerId) return;

    const wasMoved = fabDragRef.current.moved;

    fabDragRef.current.dragging = false;
    fabDragRef.current.moved = false;
    fabDragRef.current.pointerId = null;

    // ✅ si NO se movió, esto fue un click real => toggle aquí (100% confiable)
    if (!wasMoved) {
      setOpen((v) => !v);
    }
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ASSIST_FAB_POS);

      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setFabPos(clampFabPos(parsed));
        } else {
          setFabPos(defaultFabBottomRight());
        }
      } else {
        setFabPos(defaultFabBottomRight());
      }
    } catch {
      setFabPos(defaultFabBottomRight());
    }

    const onResize = () => {
      setFabPos((p) => clampFabPos(p));
      setPos((p) => clampPos(p));
    };
    hydratedFabPosRef.current = true;

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedFabPosRef.current) return;

    try {
      localStorage.setItem(LS_ASSIST_FAB_POS, JSON.stringify(fabPos));
    } catch {}
  }, [mounted, fabPos]);

  const dragRef = useRef<{
    dragging: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  }>({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  });

  function clampPos(p: PanelPos): PanelPos {
    if (typeof window === "undefined") return p;
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 420;
    const h = el?.offsetHeight ?? 520;

    const pad = 8;
    const maxX = Math.max(pad, window.innerWidth - w - pad);
    const maxY = Math.max(pad, window.innerHeight - h - pad);

    return {
      x: Math.min(Math.max(p.x, pad), maxX),
      y: Math.min(Math.max(p.y, pad), maxY),
    };
  }

  function defaultBottomRight(): PanelPos {
    if (typeof window === "undefined") return { x: 16, y: 16 };
    const w = panelRef.current?.offsetWidth ?? 420;
    const h = panelRef.current?.offsetHeight ?? 520;
    const pad = 16;
    return clampPos({
      x: window.innerWidth - w - pad,
      y: window.innerHeight - h - (pad + 80),
    });
  }

  useEffect(() => {
    if (!mounted) return;

    try {
      const raw = localStorage.getItem(LS_ASSIST_POS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setPos(clampPos(parsed));
        } else {
          setPos(defaultBottomRight());
        }
      } else {
        setPos(defaultBottomRight());
      }
    } catch {
      setPos(defaultBottomRight());
    }

    hydratedPanelPosRef.current = true;

    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedPanelPosRef.current) return;

    try {
      localStorage.setItem(LS_ASSIST_POS, JSON.stringify(pos));
    } catch {}
  }, [mounted, pos]);

  function isInteractiveTarget(el: any) {
    const t = el as HTMLElement | null;
    if (!t) return false;
    return Boolean(
      t.closest?.("button, a, input, select, textarea, label, [role='button'], [data-no-drag='1']")
    );
  }

  function onHeaderPointerDown(e: React.PointerEvent) {
    if (isInteractiveTarget(e.target)) return;
    if ((e as any).button != null && (e as any).button !== 0) return;

    const el = panelRef.current;
    if (!el) return;

    dragRef.current.dragging = true;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startPosX = pos.x;
    dragRef.current.startPosY = pos.y;

    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {}
  }

  function onHeaderPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return;
    if (dragRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    setPos(
      clampPos({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      })
    );
  }

  function onHeaderPointerUp(e: React.PointerEvent) {
    if (dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.dragging = false;
    dragRef.current.pointerId = null;
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {}
  }

  function resetPanelPos() {
    setPos(defaultBottomRight());
  }

  function rectsOverlap(a: DOMRect, b: DOMRect) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function pickFabCornerAwayFromPanel(panelRect: DOMRect): PanelPos {
    const el = fabRef.current;
    const w = el?.offsetWidth ?? 170;
    const h = el?.offsetHeight ?? 56;

    const pad = FAB_EDGE_PAD;
    const bottomPad = FAB_EDGE_PAD + FAB_BOTTOM_GUTTER;

    // 4 esquinas candidatas (todas pasan por clamp)
    const corners: PanelPos[] = [
      { x: pad, y: pad }, // top-left
      { x: window.innerWidth - w - pad, y: pad }, // top-right
      { x: pad, y: window.innerHeight - h - bottomPad }, // bottom-left
      { x: window.innerWidth - w - pad, y: window.innerHeight - h - bottomPad }, // bottom-right
    ].map(clampFabPos);

    const pcx = panelRect.left + panelRect.width / 2;
    const pcy = panelRect.top + panelRect.height / 2;

    // elegimos la esquina más lejos del centro del panel
    let best = corners[0];
    let bestD = -1;

    for (const c of corners) {
      const fx = c.x + w / 2;
      const fy = c.y + h / 2;
      const dx = fx - pcx;
      const dy = fy - pcy;
      const d2 = dx * dx + dy * dy;
      if (d2 > bestD) {
        bestD = d2;
        best = c;
      }
    }

    return best;
  }

  function resetAssistantChat() {
    try {
      window.speechSynthesis?.cancel();
    } catch {}

    try {
      recognitionRef.current?.stop?.();
    } catch {}
    setListening(false);

    setBusy(false);
    setMsgs([
      {
        role: "system",
        content:
          "Hola, soy el asistente de VOTO CLARO. Puedo ayudarte a usar la app y responder preguntas según la pestaña actual: Hoja de vida, Plan de gobierno o Actuar político.",
      },
    ]);
    setDraft("");

    setMem({});
   try {
  sessionStorage.removeItem(LS_ASSIST_MEM);
   } catch {}
    setRefAxisId(null);
    setRefWaitingNumber(false);
  }

  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ON");
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("es-PE");
  const [askMode, setAskMode] = useState<AskMode>("HV");
  const [mem, setMem] = useState<MemoryState>({});
  const [userInteracted, setUserInteracted] = useState(false);
  const pendingGuideSpeakRef = useRef<string | null>(null);
  const pendingGuidePathRef = useRef<string | null>(null);

    const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      role: "system",
      content: getDefaultAssistantGreeting(typeof window !== "undefined" ? window.location.pathname : ""),
    },
  ]);

  const [pageReadText, setPageReadText] = useState<string>("");
  const [pageReadAt, setPageReadAt] = useState<number>(0);
  const pageReadPathRef = useRef<string>("");

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const [candidateId, setCandidateId] = useState<string>("");
  const [candidateName, setCandidateName] = useState<string>("");

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedPrefsRef.current) return;

    try {
      sessionStorage.setItem(LS_VOICE_MODE, voiceMode);
      sessionStorage.setItem(LS_VOICE_LANG, voiceLang);
      sessionStorage.setItem(LS_ASK_MODE, askMode);
    } catch {}
  }, [mounted, voiceMode, voiceLang, askMode]);

  useEffect(() => {
    if (!mounted) return;
    if (!hydratedMemRef.current) return;
    safeSaveMem(mem);
  }, [mounted, mem]);

useEffect(() => {
  try {
    const already = sessionStorage.getItem("votoclaro_user_interacted_v1") === "1";
    if (already) setUserInteracted(true);
  } catch {}

  function mark() {
    setUserInteracted(true);
    try {
      sessionStorage.setItem("votoclaro_user_interacted_v1", "1");
    } catch {}

    window.removeEventListener("pointerdown", mark);
    window.removeEventListener("mousedown", mark);
    window.removeEventListener("touchstart", mark);
    window.removeEventListener("keydown", mark);
  }

  window.addEventListener("pointerdown", mark, { once: true });
  window.addEventListener("mousedown", mark, { once: true });
  window.addEventListener("touchstart", mark, { once: true });
  window.addEventListener("keydown", mark, { once: true });

  return () => {
    window.removeEventListener("pointerdown", mark);
    window.removeEventListener("mousedown", mark);
    window.removeEventListener("touchstart", mark);
    window.removeEventListener("keydown", mark);
  };
}, []);

  useEffect(() => {
    const p = String(pathname || "");
    const m = p.match(/^\/candidate\/([^/?#]+)/i);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    setCandidateId(id);

    if (!id) {
      setCandidateName("");
      return;
    }

    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`/api/candidates/profile?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const j = await res.json();
        const nm = String(j?.profile?.full_name ?? "").trim();
        if (!aborted) setCandidateName(nm || slugToName(id));
      } catch {
        if (!aborted) setCandidateName(slugToName(id));
      }
    })();

    return () => {
      aborted = true;
    };
  }, [pathname]);

useEffect(() => {
  const tab = String(searchParams?.get("tab") || "").toUpperCase();

  if (tab === "PLAN") setAskMode("PLAN");
  else if (tab === "NEWS") setAskMode("NEWS");
  else setAskMode("HV"); // default: HV
}, [searchParams]);
  useEffect(() => {
    (window as any).__federalitoAssistantOpen = () => setOpen(true);
    (window as any).__federalitoAssistantClose = () => setOpen(false);
    (window as any).__federalitoAssistantToggle = () => setOpen((v: boolean) => !v);

    return () => {
      try {
        delete (window as any).__federalitoAssistantOpen;
        delete (window as any).__federalitoAssistantClose;
        delete (window as any).__federalitoAssistantToggle;
      } catch {}
    };
  }, []);

// ✅ Listener primero (para no perder eventos)
useEffect(() => {
  async function onGuide(ev: Event) {
    const e = ev as CustomEvent<GuideEventDetail>;
    const action = e.detail?.action ?? "SAY";

    const raw = String(e.detail?.text ?? "");
const text = cleanForChat(raw);

    const speak = !!e.detail?.speak;

    if (action === "OPEN" || action === "SAY_AND_OPEN") setOpen(true);
        if (action === "CLOSE") setOpen(false);

        if (text) {
  setMsgs((prev) => [...prev, { role: "assistant", content: text }]);

  // ✅ SOLO guarda para 🔊 Leer si hay texto real
  setPageReadText(text);
  setPageReadAt(Date.now());
  pageReadPathRef.current = String(pathname || "");
}
    if (!text || !speak) return;

        if (voiceMode !== "ON") {
      pendingGuideSpeakRef.current = text;
      pendingGuidePathRef.current = String(pathname || "");
      setMsgs((prev) => [
        ...prev,
        { role: "assistant", content: "Tip: activa “Voz: ON” para que pueda hablar en voz alta." },
      ]);
      return;
    }

    if (!userInteracted) {
      pendingGuideSpeakRef.current = text;
      pendingGuidePathRef.current = String(pathname || "");
      return;
    }

    // 👇 AQUÍ va el debug, JUSTO antes de hablar:
    debugUnicode("GUIDE_TEXT", text);

    await speakTextChunked(text, voiceLang);
    pendingGuideSpeakRef.current = null;
  }

  window.addEventListener("votoclaro:guide", onGuide as any);
  return () => window.removeEventListener("votoclaro:guide", onGuide as any);
}, [voiceMode, voiceLang, userInteracted]);


// ✅ Si había un mensaje pendiente, hablar apenas sea posible
useEffect(() => {
  async function flushPending() {
    const pending = pendingGuideSpeakRef.current;
    const pendingPath = pendingGuidePathRef.current;
    const currentPath = String(pathname || "");

    if (!pending) return;
    if (voiceMode !== "ON") return;
    if (!userInteracted) return;

    if (pendingPath && pendingPath !== currentPath) {
      pendingGuideSpeakRef.current = null;
      pendingGuidePathRef.current = null;
      return;
    }

    pendingGuideSpeakRef.current = null;
    pendingGuidePathRef.current = null;
    await speakTextChunked(pending, voiceLang);
  }

  flushPending();
}, [voiceMode, voiceLang, userInteracted, pathname]);

 // ✅ MENSAJE AUTOMÁTICO AL ENTRAR A CADA VENTANA (sin abrir panel)
// Regla PRO:
// - Se lee 1 vez por sesión por cada ruta
// - Inicio (/) NO vuelve a narrar al regresar
 useEffect(() => {
  if (!mounted) return;

  const p = String(pathname || "");
  const isHome = p === "/" || p.startsWith("/#");
  const isContextualDomain =
    p.startsWith("/espacio-emprendedor") ||
    p.startsWith("/proyecto-ciudadano") ||
    p.startsWith("/intencion-de-voto") ||
    p.startsWith("/reto-ciudadano") ||
    p.startsWith("/comentarios");

  const contextualViewKey = [
    p,
    String((pageContext as any)?.pageId || ""),
    String((pageContext as any)?.activeViewId || ""),
    String((pageContext as any)?.activeSection || ""),
    String((pageContext as any)?.selectedItemTitle || ""),
  ].join("::");

  const key = `votoclaro_autoguide_seen:${isContextualDomain ? contextualViewKey : isHome ? "/" : p}`;

  try {
    const seen = sessionStorage.getItem(key) === "1";
    if (seen) return;
    sessionStorage.setItem(key, "1");
  } catch {
  }

  let text = "";

  if (isHome) {
    text =
      "Esta es la pantalla de inicio de VOTO CLARO. " +
      "Aquí puedes buscar candidatos, aprender cómo usar la app y acceder a servicios al ciudadano, reflexión electoral y otras secciones. " +
      "Empieza buscando un candidato por su nombre.";
  } else if (p.startsWith("/ciudadano/servicio") || p.startsWith("/ciudadano/servicios")) {
    text =
      "Estás en Servicios al ciudadano. " +
      "Aquí encontrarás enlaces oficiales para consultar local de votación, miembro de mesa, multas y otros trámites electorales.";
  } else if (p.startsWith("/reflexion")) {
    text =
      "Estás en Reflexionar antes de votar. " +
      "Aquí puedes explorar preguntas y reflexiones por ejes como economía, salud, educación y seguridad.";
  } else if (p.startsWith("/cambio-con-valentia")) {
    text =
      "Estás en Un cambio con valentía. " +
      "Esta ventana muestra una propuesta política y te dirige a su sitio oficial para más información.";
  } else if (p.startsWith("/como-funciona")) {
    text =
      "Estás en Cómo funciona VOTO CLARO. " +
      "Aquí tienes la guía de uso: flujo recomendado, qué hace el Asistente, límites técnicos y política de uso.";
  } else if (isContextualDomain && pageContext) {
    text = String(
      (pageContext as any)?.speakableSummary ||
      (pageContext as any)?.summary ||
      (pageContext as any)?.activeViewTitle ||
      (pageContext as any)?.pageTitle ||
      ""
    ).trim();
  } else {
    return;
  }

  if (!text) return;

  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: { action: "SAY", text, speak: true },
      })
    );
  }, 0);
}, [mounted, pathname, pageContext]);


useEffect(() => {
  function onPageRead(ev: Event) {
    const e = ev as CustomEvent<{ text?: string }>;
    const raw = String(e.detail?.text ?? "");
    const txt = cleanForChat(raw);

    if (!txt) return;

    setPageReadText(txt);
setPageReadAt(Date.now());
pageReadPathRef.current = String(pathname || "");

setMsgs((prev) => [
  ...prev,
  { role: "assistant", content: "📄 Listo: tengo una comparación en pantalla para leer con 🔊 Leer." },
]);
  }

  window.addEventListener("votoclaro:page-read", onPageRead as any);
  return () => window.removeEventListener("votoclaro:page-read", onPageRead as any);
}, []);

  useEffect(() => {
    if (!open) return;

    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;

    // foco al input al abrir
    const raf = requestAnimationFrame(() => {
      try {
        inputRef.current?.focus?.();
      } catch {}
    });

    return () => cancelAnimationFrame(raf);
  }, [open, msgs]);

  useEffect(() => {
    if (!mounted) return;
    if (!open) return;

    const raf = requestAnimationFrame(() => {
      const fabEl = fabRef.current;
      const panelEl = panelRef.current;
      if (!fabEl || !panelEl) return;

      const fabRect = fabEl.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();

      if (!rectsOverlap(fabRect, panelRect)) return;

      const next = pickFabCornerAwayFromPanel(panelRect);

      setFabPos((prev) => {
        // evita loops: solo cambia si realmente cambia
        if (Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1) return prev;
        return next;
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [mounted, open, pos]);

    function pushAssistant(text: string) {
  const safe = sanitizeAssistantTextForUi(cleanForChat(text));
  setMsgs((prev) => [...prev, { role: "assistant", content: safe }]);
}

  // ✅ DEBUG: muestra cómo se parte el texto antes de hablar (sin consola)
  const DEBUG_TTS_PARTS = false;

  function showTtsParts(label: string, input: string) {
    if (!DEBUG_TTS_PARTS) return;

    const parts = splitForSpeech(input, 220);

    const lines = parts.map((p, i) => {
      const visible = p.replace(/ /g, "␠");
      return `${i + 1}) len=${p.length} |${visible}|`;
    });

    pushAssistant(`🧪 DEBUG TTS PARTS (${label})\n` + lines.join("\n"));
  }

      async function maybeSpeak(text: string) {
  if (voiceMode !== "ON") {
    pushAssistant("Tip: activa “Voz: ON” para que pueda leerte el contenido con 🔊 (solo necesitas hacerlo una vez).");
    return;
  }

  if (!userInteracted) {
    setUserInteracted(true);
    try {
      sessionStorage.setItem("votoclaro_user_interacted_v1", "1");
    } catch {}
  }

  const cleaned = sanitizeAssistantTextForVoice(text);
  if (!cleaned) return;

  showTtsParts("maybeSpeak", cleaned);

  const r = await speakTextChunked(cleaned, voiceLang);

  if (voiceLang === "qu" && r?.usedLang === "fallback-es") {
    pushAssistant("Nota: no detecté voz Quechua en este dispositivo. Estoy leyendo en Español (Perú) como respaldo.");
  }
}

  function updateMemAfterAnswer(params: {
    mode: AskMode;
    candidateId: string;
    candidateName: string;
    question: string;
    answer: string;
    answerHasLinks?: boolean;
  }) {
    setMem((prev) => ({
      ...prev,
      lastMode: params.mode,
      lastCandidateId: params.candidateId,
      lastCandidateName: params.candidateName,
      lastQuestion: (params.question || "").trim().slice(0, 2500),
      lastAnswer: (params.answer || "").trim().slice(0, 5000),
      lastAnswerHasLinks: !!params.answerHasLinks,
      lastUpdatedAt: Date.now(),
    }));
  }

  function matchRefAxisId(input: string): string | null {
    const t = normalizeLite(input);

    const rules: Array<[RegExp, string]> = [
      [/econom|emple|trabaj/, "eco"],
      [/salud|hospital|sis|essalud/, "salud"],
      [/segurid|delinc|extors|crimen|polic/, "seg"],
      [/educ|coleg|escuel|univers|docen/, "edu"],
      [/descentr|region|lima/, "des"],
      [/justic|corrup|fiscal|juez/, "jus"],
      [/ambien|clima|agua|bosque/, "amb"],
      [/tecnolog|innov|digital|datos|privac/, "tec"],
      [/exterior|defensa|soberan|frontera|ciber/, "ext"],
    ];

    for (const [re, id] of rules) if (re.test(t)) return id;
    return null;
  }

  function parseQuestionNumber(input: string): number | null {
    const t = normalizeLite(input);
    const m = t.match(/(?:pregunta|p)?\s*(\d)\b/);
    if (!m) return null;

    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
    return null;
  }

  async function handleReflexion(rawQ: string) {
    const q = (rawQ || "").trim();
    if (!q) return;

    const onlyNumber = q.match(/^\s*[1-5]\s*$/) ? Number(q.trim()) : null;

    if (refWaitingNumber && refAxisId && onlyNumber) {
      const axis = REFLEXION_AXES.find((a) => a.id === refAxisId);
      const idx = onlyNumber - 1;

      if (!axis || !axis.questions?.[idx]) {
        const msg = "No encontré esa pregunta. Dime un número del 1 al 5.";
        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }

      const item = axis.questions[idx];
      const out =
        `✅ ${axis.title}\n` +
        `Pregunta ${onlyNumber}:\n${item.question}\n\n` +
        `${item.reflection}\n` +
        (item.followups?.length ? `\n\nPara seguir reflexionando:\n- ${item.followups.join("\n- ")}` : "");

      pushAssistant(out);
      await maybeSpeak(out);

      setRefWaitingNumber(false);
      return;
    }

    const axisFromText = matchRefAxisId(q);
    const nFromText = parseQuestionNumber(q);

    if (axisFromText) {
      const axis = REFLEXION_AXES.find((a) => a.id === axisFromText);
      if (!axis) {
        const msg = "No encontré ese eje. Prueba: educación, salud, seguridad, economía…";
        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }

      setRefAxisId(axisFromText);

      if (nFromText) {
        const idx = nFromText - 1;
        const item = axis.questions?.[idx];

        if (!item) {
          const msg = "Ese eje tiene preguntas del 1 al 5. Dime un número válido.";
          pushAssistant(msg);
          await maybeSpeak(msg);
          setRefWaitingNumber(true);
          return;
        }

        const out =
          `✅ ${axis.title}\n` +
          `Pregunta ${nFromText}:\n${item.question}\n\n` +
          `${item.reflection}\n` +
          (item.followups?.length ? `\n\nPara seguir reflexionando:\n- ${item.followups.join("\n- ")}` : "");

        pushAssistant(out);
        await maybeSpeak(out);
        setRefWaitingNumber(false);
        return;
      }

      const list = axis.questions
        .slice(0, 5)
        .map((qq, i) => `${i + 1}) ${qq.question}`)
        .join("\n\n");

      const msg =
        `Estás en el eje: ${axis.title}.\n\n` +
        `Estas son las 5 preguntas:\n\n${list}\n\n` +
        `Dime un número del 1 al 5 y te leo la pregunta y su reflexión.`;

      pushAssistant(msg);
      await maybeSpeak(msg);
      setRefWaitingNumber(true);
      return;
    }

    if (nFromText && refAxisId) {
      setRefWaitingNumber(true);
      await handleReflexion(String(nFromText));
      return;
    }

    const help =
      "Estoy en Reflexionar antes de votar.\n" +
      "Puedes decir por ejemplo:\n" +
      "- “educación” (te muestro las 5 preguntas)\n" +
      "- “educación pregunta 5” (te leo directo)\n" +
      "- o si ya te mostré el eje: solo di “1”, “2”, “3”, “4” o “5”.";
    pushAssistant(help);
    await maybeSpeak(help);
  }

  // ✅ Guía local HOME (para preguntas genéricas en inicio)
  function answerFromHomeGeneric(rawQ: string) {
    const t = normalizeLite(rawQ);
    const i = detectIntent(rawQ);

    // 1) Ayuda general en inicio (“qué hago aquí”)
    if (i.wantsHOMEHELP) {
      return (
        "Estás en la pantalla de inicio.\n\n" +
        "Aquí puedes:\n" +
        "1) Buscar candidatos: escribe al menos 2 letras en “Buscar candidato”.\n" +
        "2) Abrir la ficha del candidato y revisar HV, Plan y Actuar político.\n" +
        "3) Entrar a accesos rápidos: Servicios al ciudadano, Reflexión y Un cambio con valentía.\n\n" +
        "Tip: escribe un apellido (por ejemplo: “Armando Massé”, “López Aliaga”, “Keiko”) y abre la ficha."
      );
    }

    // 2) Quiere comparar (orientación: primero entra a fichas + PLAN)
    if (i.wantsCompare) {
      return (
        "Para comparar propuestas entre candidatos:\n\n" +
        "1) Busca un candidato y entra a su ficha.\n" +
        "2) Cambia a la pestaña “Plan”.\n" +
        "3) Si tienes opción de comparar, elige el segundo candidato.\n" +
        "4) Luego pregúntame: “compara seguridad”, “compara economía”, etc.\n\n" +
        "Si me dices los 2 nombres, te digo cómo encontrarlos rápido en la lista."
      );
    }

    // 3) Preguntas típicas de “cómo voto / dónde voto / multas” => redirige a Servicios
    if (i.wantsHowToVote) {
      return (
        "Eso se resuelve en “Servicios al ciudadano”.\n\n" +
        "👉 Ve a: /ciudadano/servicio\n\n" +
        "Ahí tienes enlaces oficiales (JNE, ONPE, RENIEC) para:\n" +
        "- local de votación\n" +
        "- miembro de mesa\n" +
        "- multas electorales\n" +
        "- trámites y consultas"
      );
    }

    // 4) Navegación rápida por tarjetas de inicio
    if (i.wantsNavigateHomeCards) {
      return (
        "Desde inicio puedes entrar a:\n\n" +
        "👉 /ciudadano/servicio  (local de votación, multas, miembro de mesa)\n" +
        "👉 /reflexion  (preguntas por ejes: economía, salud, educación, seguridad)\n" +
        "👉 /cambio-con-valentia  (acceso a web oficial de la propuesta)\n\n" +
        "Dime cuál quieres abrir y te digo qué encontrarás allí."
      );
    }

    // 5) Quiere buscar candidato / “quién es X” => instrucciones claras sin inventar
    if (i.wantsCandidateSearch || t.includes("candidato") || t.includes("nombre") || t.includes("buscar")) {
      return (
        "Para buscar un candidato:\n" +
        "- Escribe al menos 2 letras en el cuadro “Buscar candidato”.\n" +
        "- Luego haz clic en el resultado para abrir la ficha.\n\n" +
        "Dentro de la ficha puedes preguntar por:\n" +
        "- HV (Hoja de Vida)\n" +
        "- Plan de Gobierno\n" +
        "- Actuar político\n\n" +
        "Si me dices el nombre o apellido que buscas, te indico cómo escribirlo para encontrarlo más rápido."
      );
    }

    // fallback (pero útil)
    return (
      "En inicio puedes buscar candidatos y abrir sus fichas.\n\n" +
      "Si me dices:\n" +
      "- “cómo busco un candidato”\n" +
      "- “quiero ver el plan”\n" +
      "- “dónde voto / multas / miembro de mesa”\n" +
      "te guío al lugar correcto."
    );
  }

  async function askBackend(question: string) {
    const rawQ = (question || "").trim();
    if (!rawQ) return;

    const gate = await handleGlobalPolicyAndRedirect({
      pathname: String(pathname || ""),
      rawQ,
      candidateId,
      askMode,
      pushAssistant,
      maybeSpeak,
    });
    if (gate.handled) return;

    const isReflexionPage = String(pathname || "").startsWith("/reflexion");
    if (isReflexionPage) {
      await handleReflexion(rawQ);
      return;
    }

    if (isCambioConValentiaPage) {
      await handleCambioConValentia(rawQ, maybeSpeak, pushAssistant);
      return;
    }

    if (isCiudadanoServicioPage) {
      await handleCiudadanoServicio(rawQ, maybeSpeak, pushAssistant);
      return;
    }
        const isComoFuncionaPage = String(pathname || "").startsWith("/como-funciona");
    if (isComoFuncionaPage) {
      await handleComoFunciona(rawQ, maybeSpeak, pushAssistant);
      return;
    }
    // ✅ /como-funciona: FAQ local + redirección inteligente (sin backend)
if (String(pathname || "").startsWith("/como-funciona")) {
  const q = normalizeLite(rawQ);

  // FAQ: voz / micrófono
  if (q.includes("voz") || q.includes("audio") || q.includes("no habla") || q.includes("no se escucha")) {
    const msg =
      "Si el Asistente no habla automáticamente, haz un clic o toque en la pantalla y vuelve a intentar. " +
      "Es un bloqueo normal del navegador para permitir audio.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  if (q.includes("micro") || q.includes("micrófono") || q.includes("no me escucha") || q.includes("dictar")) {
    const msg =
      "Para usar el micrófono, toca 🎙️ Hablar. Si no funciona, revisa permisos del navegador. " +
      "En algunos equipos puede pedir autorización o fallar por configuración.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  // flujo recomendado / buscar candidato
  if (q.includes("buscar") || q.includes("candidato") || q.includes("inicio")) {
    const msg =
      "Para buscar candidatos, ve a Inicio (/). Escribe al menos 2 letras en el buscador, " +
      "elige un candidato y abre su ficha.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  // secciones clave
  if (q.includes("hoja de vida") || q === "hv") {
    const msg =
      "Hoja de Vida: respuestas basadas en el documento oficial. Pregunta por estudios, experiencia, ingresos, " +
      "sentencias y datos del documento. Si no hay evidencia, se indicará.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  if (q.includes("plan")) {
    const msg =
      "Plan de Gobierno: respuestas basadas en el plan del candidato. Puedes preguntar por economía, salud, seguridad, " +
      "educación y propuestas. Si eliges un segundo candidato, aparece la comparación.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  if (q.includes("actuar") || q.includes("politico") || q.includes("político") || q.includes("cronologia") || q.includes("cronología")) {
    const msg =
      "Actuar Político: información basada en registros disponibles. Puedes pedir resumen, hechos recientes, cronología " +
      "o preguntar por un tema específico.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  // redirecciones recomendadas
  if (q.includes("servicio") || q.includes("local de vot") || q.includes("miembro de mesa") || q.includes("multa")) {
    const msg = "Eso está en Servicios al ciudadano. Ve a /ciudadano/servicio.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  if (q.includes("reflex") || q.includes("eje") || q.includes("pregunta")) {
    const msg = "Eso está en Reflexionar antes de votar. Ve a /reflexion.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  if (q.includes("cambio con valent") || q.includes("peru federal") || q.includes("perú federal") || q.includes("partido")) {
    const msg = "Eso está en Un cambio con valentía. Ve a /cambio-con-valentia.";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }

  // fallback útil
  const msg =
    "Puedo ayudarte a usar VOTO CLARO.\n\n" +
    "Dime qué quieres hacer: buscar candidatos, abrir ficha, hoja de vida, plan, actuar político, " +
    "servicios al ciudadano, reflexión o cambio con valentía.";
  pushAssistant(msg);
  await maybeSpeak(msg);
  return;
}
    // ✅ HOME: responder preguntas genéricas sin exigir candidato
    if ((pathname === "/" || String(pathname || "").startsWith("/#")) && !candidateId) {
      const out = answerFromHomeGeneric(rawQ);
      pushAssistant(out);
      await maybeSpeak(out);
      return;
    }
   

           // ✅ Páginas con contexto dinámico: primero consultar endpoint contextual escalable
               const currentPath = String(pathname || "");
    const ctxNow: PageCtx = getPageCtx(currentPath);
    const isEspacioEmprendedorPage = currentPath.startsWith("/espacio-emprendedor");
    const isProyectoCiudadanoPage = currentPath.startsWith("/proyecto-ciudadano");
    const isDynamicContextPage =
      ctxNow === "INTENCION" ||
      ctxNow === "RETO" ||
      ctxNow === "COMENTARIO" ||
      isEspacioEmprendedorPage ||
      isProyectoCiudadanoPage;

    if (isDynamicContextPage && pageContext) {
            if (ctxNow === "COMENTARIO" && shouldForceLocalComentarioAnswer(rawQ, pageContext as any)) {
        const localAnswer = sanitizeAssistantTextForUi(
          answerFromDynamicPageContext(rawQ, pageContext as any)
        );

        if (localAnswer) {
          pushAssistant(localAnswer);
          await maybeSpeak(localAnswer);
          return;
        }
      }
      let contextAnswer = "";

      try {
        const res = await fetch("/api/assistant/context-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            question: rawQ,
            pathname: String(pathname || ""),
            pageContext,
          }),
        });

                const payload = await safeReadJson(res);
        contextAnswer = sanitizeAssistantTextForUi(
          String((payload as any)?.answer ?? "").trim()
        );

        const questionLooksCompound =
          (() => {
            const qn = normalizeLite(rawQ);
            return (
              qn.includes("quien puede") ||
              qn.includes("quién puede") ||
              qn.includes("cuando aparece") ||
              qn.includes("cuándo aparece") ||
              qn.includes("que diferencia") ||
              qn.includes("qué diferencia") ||
              qn.includes("cuantos comentarios") ||
              qn.includes("cuántos comentarios") ||
              qn.includes("que tipo de comentario") ||
              qn.includes("qué tipo de comentario") ||
              qn.includes("como funciona el bloque") ||
              qn.includes("cómo funciona el bloque")
            );
          })();

        const shouldRejectContextAnswer =
          !contextAnswer ||
          looksTruncatedContextAnswer(contextAnswer) ||
          (questionLooksCompound && contextAnswer.split(/\s+/).filter(Boolean).length < 18);

        if (res.ok && contextAnswer && !shouldRejectContextAnswer) {
          pushAssistant(contextAnswer);
          await maybeSpeak(contextAnswer);
          return;
        }
      } catch {
        // silencio: cae al respaldo local
      }

              if (isEspacioEmprendedorPage || isProyectoCiudadanoPage) {
        const summary = String((pageContext as any)?.summary ?? "").trim();
        const activeViewTitle = String((pageContext as any)?.activeViewTitle ?? "").trim();
        const activeSection = String((pageContext as any)?.activeSection ?? "").trim();
        const availableActions = Array.isArray((pageContext as any)?.availableActions)
          ? (pageContext as any).availableActions.filter(
              (item: unknown): item is string => typeof item === "string" && item.trim().length > 0
            )
          : [];

        const domainLabel = isEspacioEmprendedorPage
          ? "Espacio Emprendedor"
          : "Proyecto Ciudadano";

        const fallback = sanitizeAssistantTextForUi(
          [
            activeViewTitle || summary || `Estoy dentro de ${domainLabel}.`,
            availableActions.length
              ? `Ahora mismo puedo ayudarte con esta subventana y con acciones como ${availableActions
                  .slice(0, 3)
                  .join(", ")}.`
              : "Puedo ayudarte con lo que está visible en esta subventana.",
            activeSection ? "Hazme una pregunta concreta sobre esta pantalla." : "",
          ]
            .filter(Boolean)
            .join(" ")
        );

        const msg =
          fallback ||
          `Estoy dentro de ${domainLabel}, pero no pude leer bien el contexto actual. Hazme una pregunta sobre la sección visible.`;

        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }
      const dynamicMsg = sanitizeAssistantTextForUi(
        answerFromDynamicPageContext(rawQ, pageContext as any)
      );

      if (dynamicMsg) {
        pushAssistant(dynamicMsg);
        await maybeSpeak(dynamicMsg);
        return;
      }

      if (ctxNow === "INTENCION") {
        const msg =
          "Estoy dentro de la pantalla de intención de voto, pero ahora mismo no tengo suficiente contexto para responder con precisión.";
        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }

      if (ctxNow === "RETO") {
        const msg =
          "Estoy dentro del reto ciudadano, pero en este momento no tengo suficiente contexto visible para responder con precisión.";
        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }

      if (ctxNow === "COMENTARIO") {
        const msg =
          "Estoy dentro de comentarios ciudadanos, pero ahora mismo no tengo suficiente contexto visible para responder con precisión.";
        pushAssistant(msg);
        await maybeSpeak(msg);
        return;
      }
    }
    if (!candidateId) {
      const msg =
        "Primero abre la ficha de un candidato.\n\n" +
        "Cómo hacerlo:\n" +
        "1) Ve al inicio.\n" +
        "2) Escribe el nombre o apellido del candidato.\n" +
        "3) Haz clic en el resultado para entrar a su ficha.\n\n" +
        "Luego podrás preguntarme por:\n" +
        "- Hoja de Vida (HV)\n" +
        "- Plan de Gobierno\n" +
        "- Actuar político";

      pushAssistant(msg);
      await maybeSpeak(msg);
      return;
    }

    const cname = (candidateName || slugToName(candidateId)).trim();
    const enrichedQ = buildContextualQuestion(rawQ, mem, cname, askMode);

    setBusy(true);
    try {
      if (askMode === "HV" || askMode === "PLAN") {
        const doc = askMode === "HV" ? "hv" : "plan";

        const qNorm = normalize(rawQ);
        const wantsCompare =
          askMode === "PLAN" &&
          !!compareCandidateId &&
          (qNorm.includes("compara") ||
            qNorm.includes("comparar") ||
            qNorm.includes("vs") ||
            qNorm.includes("versus") ||
            qNorm.includes("diferencia") ||
            qNorm.includes("diferencias"));

        if (wantsCompare) {
          const axis = inferAxisFromQuestion(rawQ);

          const url =
            `/api/compare/plan?axis=${encodeURIComponent(axis)}` +
            `&idA=${encodeURIComponent(candidateId)}` +
            `&idB=${encodeURIComponent(compareCandidateId)}`;

          const res = await fetch(url, { cache: "no-store" });
          const payload = await safeReadJson(res);

          if (!res.ok) {
            const msg =
              (payload as any)?._nonJson
                ? "Error COMPARAR: el servidor devolvió una respuesta no-JSON. Revisa DevTools → Network → /api/compare/plan."
                : `Error COMPARAR: ${String((payload as any)?.error ?? (payload as any)?.message ?? "desconocido")}`;
            pushAssistant(msg);
            await maybeSpeak(msg);
            return;
          }

          const aAnsRaw = String((payload as any)?.a?.answer ?? "").trim();
          const bAnsRaw = String((payload as any)?.b?.answer ?? "").trim();

          const out =
            `Comparación (Plan vs Plan) — Eje: ${axis}\n\n` +
            `A) ${cname}\n${aAnsRaw}\n\n` +
            `B) ${slugToName(compareCandidateId)}\n${bAnsRaw}`;

          const outPretty = prettyCitationsText(out);

          pushAssistant(outPretty);
          await maybeSpeak(outPretty);

          updateMemAfterAnswer({
            mode: askMode,
            candidateId,
            candidateName: cname,
            question: rawQ,
            answer: outPretty,
            answerHasLinks: false,
          });

          return;
        }

        const res = await fetch("/api/ai/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ id: candidateId, doc, question: enrichedQ }),
        });

        const payload = await safeReadJson(res);

        if (!res.ok) {
          const msg =
            (payload as any)?._nonJson
              ? `Error IA (${askMode} • ${String(pathname || "")}): el servidor devolvió una respuesta no-JSON. Revisa DevTools → Network → /api/ai/answer.`
             : `Error IA (${askMode} • ${String(pathname || "")}): ${String((payload as any)?.error ?? (payload as any)?.message ?? "desconocido")}`;
          pushAssistant(msg);
          await maybeSpeak(msg);
          return;
        }

        const data = payload as AiAnswerResponse;
        const ansRaw = String(data?.answer ?? "No hay evidencia suficiente en las fuentes consultadas.").trim();
        const ans = prettyCitationsText(ansRaw);

        pushAssistant(ans);
        await maybeSpeak(ans);

        updateMemAfterAnswer({
          mode: askMode,
          candidateId,
          candidateName: cname,
          question: rawQ,
          answer: ans,
          answerHasLinks: false,
        });

        return;
      }

     if (askMode === "NEWS") {
  // ✅ Actuar Político LOCAL: leer JSON del candidato (sin web)
  const url = `/actuar/${encodeURIComponent(candidateId)}.json`;

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const msg =
        "No encontré el archivo local de Actuar Político para este candidato.\n\n" +
        `Esperaba: ${url}\n\n` +
        "Solución: verifica que el JSON exista en /public/actuar/ y que el nombre coincida con el slug del candidato.";
      pushAssistant(msg);
      await maybeSpeak(msg);
      return;
    }

    const file = (await res.json()) as ActuarFile;

    const out = buildActuarAnswer(file, rawQ);
    pushAssistant(out);
    await maybeSpeak(out);

    updateMemAfterAnswer({
      mode: askMode,
      candidateId,
      candidateName: cname,
      question: rawQ,
      answer: out,
      answerHasLinks: true,
    });

    return;
  } catch {
    const msg =
      "No pude leer el archivo local de Actuar Político.\n\n" +
      "Puedes buscar más noticias en Internet en fuentes confiables (medios reconocidos, documentos oficiales o portales institucionales).";
    pushAssistant(msg);
    await maybeSpeak(msg);
    return;
  }
}

    } finally {
      setBusy(false);
    }
  }

  function sendTyped() {
    const t = draft.trim();
    if (!t || t.length < 2 || busy) return;

    setMsgs((prev) => [...prev, { role: "user", content: t }]);
    setDraft("");
    askBackend(t);
  }
function sendQuick(q: string) {
  if (busy) return;
  const t = (q || "").trim();
  if (!t) return;
  setMsgs((prev) => [...prev, { role: "user", content: t }]);
  askBackend(t);
}

  function canUseSpeechRec() {
    const w = window as any;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    setListening(false);
  }

  function startListening() {
    if (busy) return;

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      pushAssistant("Este navegador no soporta reconocimiento de voz (SpeechRecognition). Prueba Chrome en Windows.");
      return;
    }

    try {
      try {
        recognitionRef.current?.stop?.();
      } catch {}

      const rec = new SR();
      recognitionRef.current = rec;

      rec.lang = "es-PE";
      rec.interimResults = true;
      rec.continuous = false;

      let finalText = "";
      rec.onresult = (ev: any) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const txt = String(ev.results[i][0]?.transcript ?? "");
          if (ev.results[i].isFinal) finalText += txt;
          else interim += txt;
        }
        const merged = (finalText + " " + interim).trim();
        setDraft(merged);
      };

      rec.onerror = (e: any) => {
        const code = String(e?.error ?? "");
        const msg =
          code === "not-allowed"
            ? "No tengo permiso para usar el micrófono. Actívalo en el navegador y vuelve a intentar."
            : "No pude usar el micrófono. Revisa permisos o prueba otro navegador.";
        pushAssistant(msg);
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
        const q = (finalText || draft || "").trim();

        // evita enviar ruido muy corto
        if (!q || q.length < 3) return;

        setMsgs((prev) => [...prev, { role: "user", content: q }]);
        setDraft("");
        askBackend(q);
      };

      setListening(true);
      rec.start();
    } catch {
      pushAssistant("No pude iniciar el micrófono. Revisa permisos del navegador.");
      setListening(false);
    }
  }

   async function speakLastAssistant() {
  // prioridad: comparación/lectura de pantalla reciente
  const hasPageRead =
  pageReadText &&
  Date.now() - pageReadAt < 5 * 60 * 1000 &&
  pageReadPathRef.current === String(pathname || "");

  // ✅ fallback: si no hay pageReadText, leer guía según ventana actual
  const p = String(pathname || "");
  const isHome = p === "/" || p.startsWith("/#");

  const pageGuide =
    isHome
      ? "Esta es la pantalla de inicio de VOTO CLARO. Aquí puedes buscar candidatos, aprender cómo usar la app y acceder a servicios al ciudadano, reflexión electoral y otras secciones. Empieza buscando un candidato por su nombre."
      : p.startsWith("/ciudadano/servicio") || p.startsWith("/ciudadano/servicios")
      ? "Estás en Servicios al ciudadano. Aquí encontrarás enlaces oficiales para consultar local de votación, miembro de mesa, multas y otros trámites electorales."
      : p.startsWith("/reflexion")
      ? "Estás en Reflexionar antes de votar. Aquí puedes explorar preguntas y reflexiones por ejes como economía, salud, educación y seguridad."
      : p.startsWith("/cambio-con-valentia")
      ? "Estás en Un cambio con valentía. Esta ventana muestra una propuesta política y te dirige a su sitio oficial para más información."
      : "";

  const target =
    (hasPageRead ? pageReadText : "") ||
    [...msgs].reverse().find((m) => m.role === "assistant")?.content ||
    pageGuide ||
    "";

  if (!target) return;

  const finalTarget = sanitizeAssistantTextForVoice(target);
  if (!finalTarget) return;

  // ✅ si voz estaba OFF, prenderla y esperar 1 tick para que el estado se aplique
  if (voiceMode !== "ON") {
    setVoiceMode("ON");
    await new Promise((r) => setTimeout(r, 0));
  }

  // ✅ Este click ya es interacción del usuario: marcarla aquí
  if (!userInteracted) {
    setUserInteracted(true);
    try {
      sessionStorage.setItem("votoclaro_user_interacted_v1", "1");
    } catch {}
  }

  // ✅ hablar directo (evita depender de maybeSpeak con estado viejo)
  await speakTextChunked(finalTarget, voiceLang);
}

  const fabLabel = useMemo(() => (open ? "Cerrar Asistente" : "Abrir Asistente"), [open]);
  const modeLabel = askMode === "HV" ? "HV" : askMode === "PLAN" ? "Plan" : "Actuar político";
     useEffect(() => {
    const greeting = getDefaultAssistantGreeting(String(pathname || ""));

    setMsgs((prev) => {
      if (!prev.length) {
        return [{ role: "system", content: greeting }];
      }

      if (prev.length === 1 && prev[0]?.role === "system") {
        return [{ role: "system", content: greeting }];
      }

      return prev;
    });
  }, [pathname]);
    const suggestedPrompts = useMemo<SuggestedPrompt[]>(() => {
    const raw = (pageContext as any)?.suggestedPrompts;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item: any, index: number) => ({
        id: String(item?.id || `prompt-${index + 1}`),
        label: String(item?.label || "").trim(),
        question: String(item?.question || "").trim(),
      }))
      .filter((item) => item.label && item.question)
      .slice(0, 6);
  }, [pageContext]);

  return (
    <>
      {/* ✅ FAB MOVIBLE */}
      {!isPitchPage && (
            <div
  ref={fabRef}
  className={[
    "fixed z-[60] pointer-events-none vc-assistant-fab-wrap",
    open ? "vc-assistant-open" : "",
  ].join(" ")}
  style={
    mounted
      ? { left: fabPos.x, top: fabPos.y }
      : { right: 16, bottom: 16, left: "auto", top: "auto" }
  }
>
              <button
  type="button"
  onPointerDown={onFabPointerDown}
  onPointerMove={onFabPointerMove}
  onPointerUp={onFabPointerUp}
  className={[
    "flex items-center gap-2 rounded-full border bg-white",
    "shadow-lg px-3 py-2",
    "hover:shadow-xl active:scale-[0.98] transition",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-200",
    "hover:-translate-y-[2px]",
    "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    "select-none pointer-events-auto touch-none",
    "vc-assistant-fab",
  ].join(" ")}
  aria-label={fabLabel}
  title={fabLabel}
>
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-gray-100 shrink-0">
              <FederalitoAvatar className="w-full h-full" />
              <span
                className={[
                  "absolute -top-1 -right-1",
                  "w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white",
                  "shadow-sm",
                  "animate-pulse motion-reduce:animate-none",
                ].join(" ")}
                aria-hidden="true"
              />
            </div>

            <div className="text-left leading-[14px]">
              <div className="text-[12px] font-extrabold text-slate-900">Asistente</div>
              <div className="text-[11px] text-slate-600">{open ? `Modo: ${modeLabel}` : "Asistente / Guía"}</div>
            </div>

            <span
              data-no-drag="1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Si tu archivo original tenía safeResetFabPos(), se mantiene en tu base.
                // Si NO existe, comenta esta línea.
                // @ts-ignore
                safeResetFabPos();
              }}
              className="ml-2 text-[11px] font-extrabold text-slate-600 hover:text-slate-900 cursor-pointer"
              title="Reiniciar posición del botón"
            >
              ↺
            </span>
          </button>
        </div>
      )}

      {/* Panel */}
      {open ? (
         <div
  ref={panelRef}
  className={[
    "fixed z-[70] w-[min(92vw,420px)] vc-assistant-panel",
    open ? "vc-assistant-panel-open" : "",
  ].join(" ")}
  style={{ left: pos.x, top: pos.y }}
>
            <div className="rounded-2xl border bg-white shadow-2xl overflow-hidden flex flex-col max-h-[75vh] vc-assistant-shell">
            {/* Header */}
            <div
                className="px-4 py-3 flex items-center justify-between gap-3 bg-gradient-to-r from-green-700 to-green-600 text-white cursor-move select-none vc-assistant-header"
              onPointerDown={onHeaderPointerDown}
              onPointerMove={onHeaderPointerMove}
              onPointerUp={onHeaderPointerUp}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/15 shrink-0">
                  <FederalitoAvatar className="w-full h-full" />
                </div>

                <div className="min-w-0">
                   <div className="text-[13px] font-extrabold truncate">Asistente</div>
                  <div className="text-[11px] opacity-90 truncate">
                    {candidateId ? `ID: ${candidateId} • ${modeLabel}` : `Modo: ${modeLabel}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetPanelPos();
                    resetAssistantChat();
                  }}
                  className="rounded-xl bg-white/15 hover:bg-white/20 px-3 py-1 text-[12px] font-bold vc-assistant-chip"
                  title="Reiniciar posición"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                   className="rounded-xl bg-white/15 hover:bg-white/20 px-3 py-1 text-[12px] font-bold vc-assistant-chip"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Controls */}
             <div className="px-4 py-3 border-b bg-white vc-assistant-controls">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setVoiceMode((v) => (v === "ON" ? "OFF" : "ON"))}
                  className={[
  "rounded-full px-3 py-1 text-[12px] font-bold border transition active:scale-[0.98] vc-assistant-control",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
  voiceMode === "ON"
    ? "bg-green-600 text-white border-green-700"
    : "bg-white text-slate-800 border-slate-300",
].join(" ")}
                >
                  {voiceMode === "ON" ? "Voz: ON" : "Voz: OFF"}
                </button>

                <select
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value as VoiceLang)}
                  className="rounded-full border px-3 py-1 text-[12px] font-bold bg-white vc-assistant-control"
                  title="Idioma de voz"
                >
                  <option value="es-PE">Español (Perú)</option>
                  <option value="qu">Quechua (si existe)</option>
                </select>

                <select
                  value={askMode}
                  onChange={(e) => setAskMode(e.target.value as AskMode)}
                   className="rounded-full border px-3 py-1 text-[12px] font-bold bg-white vc-assistant-control"
                  title="Qué fuente consultar"
                >
                  <option value="HV">HV (PDF)</option>
                  <option value="PLAN">Plan (PDF)</option>
                  <option value="NEWS">Actuar político</option>
                </select>

                <button
                  type="button"
                  onClick={speakLastAssistant}
                  className="ml-auto rounded-full px-3 py-1 text-[12px] font-extrabold border bg-black text-white hover:opacity-90 active:scale-[0.98] transition motion-reduce:transition-none motion-reduce:active:scale-100 vc-assistant-cta-dark"
                  title="Leer último mensaje"
                >
                  🔊 Leer
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (listening) stopListening();
                    else startListening();
                  }}
                       className={[
  "rounded-full px-3 py-1 text-[12px] font-extrabold border transition vc-assistant-control",
  listening ? "bg-red-600 text-white border-red-700" : "bg-white text-slate-800 border-slate-300",
  "hover:shadow-sm active:scale-[0.98]",
].join(" ")}
                  title={canUseSpeechRec() ? (listening ? "Detener micrófono" : "Hablar (micrófono)") : "No soportado"}
                  disabled={!canUseSpeechRec()}
                >
                  {listening ? "🎙️ Escuchando…" : "🎙️ Hablar"}
                </button>

                <button
                  type="button"
                  onClick={resetAssistantChat}
                  className="rounded-full px-3 py-1 text-[12px] font-extrabold border bg-white text-slate-800 hover:bg-slate-50"
                  title="Reiniciar chat"
                >
                  Reiniciar chat
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                {askMode === "NEWS"
                  ? "Actuar político: usa archivo local (JSON) y muestra fuentes/enlaces."
                  : "HV/Plan: responde solo con evidencia del PDF y cita páginas (p. X)."}{" "}
                {candidateId ? "" : "Tip: entra a /candidate/[id] para que el asistente sepa qué candidato consultar."}
              </div>
 {askMode === "NEWS" ? (
  <div className="mt-3 flex flex-wrap gap-2">
    {[
      "Resumen rápido",
      "Hechos más recientes",
      "Cronología",
      "Procesos/casos",
      "Sentencias/fallos",
      "Investigaciones/denuncias",
      "Controversias",
            "Fuentes",
      "Buscar: corrupción",
      "Buscar: lavado de activos",
      "No está en el archivo (¿cómo buscar en internet?)",
    ].map((label) => (
      <button
        key={label}
        type="button"
        onClick={() => sendQuick(label)}
        className="rounded-full border bg-white px-3 py-1 text-[12px] font-bold text-black hover:opacity-90 active:scale-[0.98] transition"
        title="Preguntar"
      >
        {label}
      </button>
    ))}
  </div>
 ) : null}

              <div className="mt-2 text-[10px] text-slate-400">
                Memoria corta:{" "}
                {mem?.lastUpdatedAt ? `ON (última: ${new Date(mem.lastUpdatedAt).toLocaleString()})` : "OFF"}
              </div>
            </div>

            {/* Body */}
            <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-3 bg-gradient-to-b from-green-50 via-white to-white vc-assistant-body">
                          {suggestedPrompts.length ? (
                <div className="mr-10 mb-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                  <div className="text-[12px] font-extrabold text-slate-700 mb-2">
                    Preguntas clave de esta pantalla
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {suggestedPrompts.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => sendQuick(item.question)}
                        disabled={busy}
                        className="rounded-full border bg-slate-50 px-3 py-1 text-[12px] font-bold text-slate-800 hover:bg-slate-100 active:scale-[0.98] transition disabled:opacity-60"
                        title={item.question}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {msgs.map((m, i) => (
                 <div
  key={i}
  className={[
    "text-[14px] leading-[20px] whitespace-pre-wrap rounded-2xl px-4 py-3 border shadow-sm vc-assistant-msg",
    m.role === "user" ? "ml-10 bg-green-700 text-white border-green-800 vc-assistant-msg-user" : "mr-10 bg-white text-slate-900 border-slate-200 vc-assistant-msg-bot",
  ].join(" ")}
>
                
                  {m.content}
                </div>
              ))}

              {busy ? (
                <div className="mr-10 bg-green-50 border border-green-200 rounded-2xl px-3 py-2 text-[13px]">
                  Procesando respuesta…
                </div>
              ) : null}
            </div>

            {/* Composer */}
             <div className="p-3 border-t bg-white sticky bottom-0 vc-assistant-composer">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendTyped();
                    }
                  }}
                  placeholder={askMode === "NEWS" ? "Pregunta sobre actuar político…" : "Pregunta sobre HV/Plan…"}
                  className={[
                    "flex-1 rounded-xl border px-3 py-2 text-[14px] font-semibold",
                    "bg-slate-50 text-slate-900 placeholder:text-slate-500",
                    "border-slate-300 outline-none",
                    "focus:ring-4 focus:ring-green-200 focus:border-green-600",
                    "caret-green-700",
                  ].join(" ")}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={sendTyped}
                  className="rounded-xl px-3 py-2 text-[13px] font-bold text-white bg-black hover:opacity-90 active:scale-[0.98] transition motion-reduce:transition-none motion-reduce:active:scale-100"
                  disabled={busy}
                >
                  Enviar
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                Tip: con 🎙️ “Hablar” puedes dictar la pregunta. Se enviará sola al terminar tu frase.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

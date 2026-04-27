// src/app/como-funciona/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

function sendGuide(text: string, action: "SAY" | "SAY_AND_OPEN" = "SAY") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: { action, text, speak: true },
    })
  );
}

export default function ComoFuncionaPage() {
  const router = useRouter();
  const { setPageContext } = useAssistantRuntime();

  useEffect(() => {
  setPageContext({
  pageId: "como-funciona",
  route: "/como-funciona",
  pageTitle: "Cómo funciona VOTO CLARO",
    activeSection: "Guía de uso",
    status: "ready",
    summary:
      "Esta ventana explica qué es VOTO CLARO, cómo se usa la app, qué hace el Asistente, cuáles son sus límites técnicos, cuál es la política de uso y qué secciones contiene la plataforma.",
    speakableSummary:
      "Estás en Cómo funciona VOTO CLARO. Aquí puedes entender cómo usar la app, qué hace el Asistente, sus límites técnicos, la política de uso y las secciones disponibles.",
    visibleText:
      "Guía de uso de VOTO CLARO: qué es la plataforma, flujo recomendado, ayuda del Asistente, límites técnicos, política de uso, secciones disponibles y transparencia.",
    availableActions: [
      "Leer qué es VOTO CLARO",
      "Leer el flujo recomendado",
      "Leer cómo ayuda el Asistente",
      "Leer límites técnicos",
      "Leer política de uso",
      "Revisar secciones disponibles",
      "Volver al inicio",
    ],
    suggestedPrompts: [
      {
        id: "que-es-voto-claro",
        label: "¿Qué es VOTO CLARO?",
        question: "¿Qué es VOTO CLARO y para qué sirve esta plataforma?",
      },
      {
        id: "como-usar-app",
        label: "¿Cómo uso la app?",
        question: "¿Cómo se usa la app paso a paso?",
      },
      {
        id: "asistente-ayuda",
        label: "¿Cómo ayuda el Asistente?",
        question: "¿Cómo me ayuda el Asistente dentro de VOTO CLARO?",
      },
      {
        id: "limites-tecnicos",
        label: "Límites técnicos",
        question: "¿Cuáles son los límites técnicos del Asistente?",
      },
      {
        id: "politica-uso",
        label: "Política de uso",
        question: "¿Cuál es la política de uso de esta app?",
      },
      {
        id: "secciones-disponibles",
        label: "Secciones",
        question: "¿Qué secciones tiene VOTO CLARO y para qué sirve cada una?",
      },
    ],
  });

  // ✅ Al entrar a esta ventana: NO abrir el panel
  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: { action: "CLOSE" },
    })
  );

  const t = setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: {
          action: "SAY",
          text: "Bienvenido a Cómo funciona VOTO CLARO. Aquí aprenderás cómo usar la app, cómo te ayuda el Asistente, cuáles son sus límites técnicos y la política de uso para una experiencia respetuosa.",
          speak: true,
        },
      })
    );
  }, 0);

   return () => {
  clearTimeout(t);
};
}, [setPageContext]);

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
     <main className="vc-how min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto text-slate-900">
      <header className="mb-6">
        {/* ⬅ Volver a Inicio - AHORA CORRECTO */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => router.push('/')}
             className="rounded-xl px-4 py-2 bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition shadow-sm border border-blue-900 vc-btn-wave"
          >
            ⬅ Volver a Inicio
          </button>
        </div>

        <h1 className="text-3xl font-semibold text-slate-900 vc-fade-up">
          ¿Cómo funciona VOTO CLARO?
        </h1>
        <p className="mt-2 text-slate-800 max-w-3xl vc-fade-up vc-delay-1">
          Esta ventana reúne una guía clara para usar la plataforma, entender el papel del Asistente, conocer sus límites técnicos y revisar las normas básicas de uso responsable.
          </p>
      </header>

      {/* 1) Qué es */}
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm vc-fade-up vc-card-hover mb-5">
        <h2 className="text-lg font-bold text-slate-900">1) ¿Qué es VOTO CLARO?</h2>
        <p className="mt-2 text-slate-800 text-sm">
          VOTO CLARO es una app informativa para ayudarte a entender información pública antes de votar. No es un juego,
          no es una red social y no reemplaza tu criterio.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "Voto Claro es una app informativa para entender información pública antes de votar. No reemplaza tu criterio."
              )
            }
            className="rounded-xl px-4 py-2 bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition shadow-sm vc-btn-wave"
          >
            🔊 Leer esta parte
          </button>
        </div>
      </section>

      {/* 2) Flujo de uso */}
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm vc-fade-up vc-card-hover mb-5">
        <h2 className="text-lg font-bold text-slate-900">2) ¿Cómo se usa la app? (flujo recomendado)</h2>

        <ol className="mt-3 space-y-3 text-sm text-slate-800 list-decimal pl-5">
          <li>
            <b>Entra a Inicio</b> y busca un candidato escribiendo al menos 2 letras.
          </li>
          <li>
            <b>Abre la ficha del candidato</b> y revisa sus secciones (Hoja de Vida, Plan, Actuar político).
          </li>
          <li>
            <b>Haz preguntas dentro de la sección correcta</b>. El Asistente responde mejor cuando estás en la pestaña
            correcta.
          </li>
          <li>
            <b>Revisa la información</b> con calma. Si algo no aparece en la app, se indicará claramente.
          </li>
          <li>
            <b>Luego decides tú</b>, con criterio.
          </li>
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "Flujo recomendado: uno, en Inicio busca un candidato. Dos, abre su ficha. Tres, cambia entre Hoja de Vida, Plan y Actuar político. Cuatro, pregunta dentro de la sección correcta. Cinco, revisa la información y luego decide tú."
              )
            }
           className="rounded-xl px-4 py-2 bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition shadow-sm vc-btn-wave"
          >
            🔊 Leer el flujo
          </button>
        </div>
      </section>

      {/* 3) Qué hace el Asistente */}
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm vc-fade-up vc-card-hover mb-5">
        <h2 className="text-lg font-bold text-slate-900">3) ¿Cómo te ayuda el Asistente?</h2>

        <ul className="mt-3 space-y-2 text-sm text-slate-800 list-disc pl-5">
          <li>
            Te guía según <b>la ventana donde estás</b> (Inicio, Servicios, Reflexión, Alianza para el Progreso, ficha de
            candidato, Proyecto Ciudadano, Espacio Emprendedor).
          </li>
          <li>
            Puede <b>hablar en voz alta</b> si activas <b>Voz: ON</b>.
          </li>
          <li>
            Puede <b>escucharte</b> con el botón 🎙️ si tu navegador lo permite.
          </li>
          <li>
            Si preguntas algo fuera de contexto, te <b>redirige con instrucciones</b> para ir a la ventana correcta.
          </li>
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "El Asistente te ayuda según la ventana en la que estás. Puede hablar si activas Voz: ON, puede escucharte con el micrófono si tu navegador lo permite, y si preguntas algo fuera de contexto te guía para ir a la ventana correcta."
              )
            }
           className="rounded-xl px-4 py-2 bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition shadow-sm vc-btn-wave"
          >
            🔊 Leer esta parte
          </button>
        </div>
      </section>

      {/* 4) Límites técnicos */}
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm vc-fade-up vc-card-hover mb-5">
        <h2 className="text-lg font-bold text-slate-900">4) Límites técnicos (para evitar falsas expectativas)</h2>

        <ul className="mt-3 space-y-2 text-sm text-slate-800 list-disc pl-5">
          <li>
            <b>No siempre hablará automáticamente al entrar</b>. Algunos navegadores bloquean el audio hasta que hagas{" "}
            <b>un clic/toque</b>.
          </li>
          <li>
            <b>No mantiene una conversación infinita</b>. Tiene <b>memoria corta</b> para ayudarte en el momento, no para
            “recordarte siempre”.
          </li>
          <li>
            <b>No habla de cualquier tema</b>. Responde sobre lo que existe en la app y sobre la sección actual. Si le
            preguntas algo fuera, te dirá que no corresponde.
          </li>
          <li>
            <b>No adivina</b> ni inventa: si esa información no está disponible en la app, te lo dirá y te orientará.
          </li>
          <li>
            <b>El micrófono depende del navegador</b>. En algunos equipos puede fallar o pedir permisos.
          </li>
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "Límites técnicos: algunos navegadores bloquean el audio hasta un clic o toque. El Asistente no mantiene conversación infinita; tiene memoria corta. No habla de cualquier tema: responde solo sobre lo que existe en la app y la sección actual. No inventa. El micrófono depende de permisos del navegador."
              )
            }
             className="rounded-xl px-4 py-2 bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition shadow-sm vc-btn-wave"
          >
            🔊 Leer límites técnicos
          </button>
        </div>
      </section>

      {/* 5) Política de uso */}
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm vc-fade-up vc-card-hover mb-5">
        <h2 className="text-lg font-bold text-slate-900">5) Política de uso (buen uso de la app)</h2>

        <p className="mt-2 text-slate-800 text-sm">
          Para que VOTO CLARO funcione bien y sea útil para todos, usa la app con respeto y dentro de su propósito:
          informarte.
        </p>

        <ul className="mt-3 space-y-2 text-sm text-slate-800 list-disc pl-5">
          <li>
            <b>Respeto:</b> no uses insultos, lisuras ni lenguaje soez.
          </li>
          <li>
            <b>Uso correcto:</b> pregunta sobre lo que existe en la app (candidatos, secciones y contenidos disponibles).
          </li>
          <li>
            <b>Sin ingeniería inversa:</b> no intentes desarmar, copiar o atacar el funcionamiento de la app.
          </li>
          <li>
            <b>Sin manipulación:</b> no intentes forzar al Asistente a “inventar” o a hablar de temas fuera de contexto.
          </li>
          <li>
            <b>Propósito:</b> esta app es para informarte y ayudarte a decidir con criterio.
          </li>
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "Política de uso: utiliza VOTO CLARO con respeto. No insultos ni lisuras. Pregunta dentro de lo que existe en la app. No intentes desarmar o atacar el funcionamiento. No intentes forzar al Asistente a inventar o hablar fuera de contexto."
              )
            }
            className="rounded-xl px-4 py-2 bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition shadow-sm vc-btn-wave"
          >
            🔊 Leer política de uso
          </button>
        </div>
      </section>

      {/* 6) Qué hay en las secciones */}
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm vc-fade-up vc-card-hover mb-5">
        <h2 className="text-lg font-bold text-slate-900">6) ¿Qué encontrarás en cada sección?</h2>

        <p className="mt-2 text-slate-800 text-sm">
          Aquí tienes un mapa rápido de la app. En cada sección, el Asistente puede guiarte con voz (Voz: ON) y también
          puedes dictar con 🎙️ si tu navegador lo permite.
        </p>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Inicio</div>
            <div className="text-slate-800 mt-1">
              Es el centro de navegación. Desde aquí buscas candidatos y entras a todas las demás secciones.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Escribe al menos 2 letras en “Buscar candidato” y elige uno de la lista.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Ficha del candidato</div>
            <div className="text-slate-800 mt-1">
              Aquí exploras la información del candidato en tres partes: Hoja de Vida, Plan de Gobierno y Actuar
              Político.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se busca información? Entra a la pestaña correcta y escribe tu pregunta (o usa una de las preguntas
              clave).
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Hoja de Vida</div>
            <div className="text-slate-800 mt-1">
              Respuestas basadas en el documento oficial. Si no existe evidencia, la app lo indicará.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo preguntar bien? Pregunta por estudios, experiencia, sentencias, ingresos, declaraciones y datos del
              documento.
            </div>
          </div>

           <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Plan de Gobierno</div>
            <div className="text-slate-800 mt-1">
              Respuestas basadas en el plan. Puedes preguntar por economía, salud, seguridad, educación y propuestas.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              Extra: incluye comparación entre planes cuando eliges un segundo candidato.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Actuar Político</div>
            <div className="text-slate-800 mt-1">
              Información basada en registros disponibles para revisar hechos relevantes del candidato.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo usarlo? Pide “Resumen”, “Hechos recientes”, “Cronología”, o pregunta por un tema específico.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Servicios al ciudadano</div>
            <div className="text-slate-800 mt-1">
              Enlaces oficiales para trámites electorales (local de votación, miembro de mesa, multas y más).
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Escribe el servicio que buscas y te guía hacia el enlace oficial correspondiente.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Reflexionar antes de votar</div>
            <div className="text-slate-800 mt-1">
              Preguntas y reflexiones por ejes (economía, salud, educación, seguridad y más).
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Escribe un tema (por ejemplo “salud”) y luego el número de pregunta (1 a 5).
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Alianza para el Progreso (APP)</div>
            <div className="text-slate-800 mt-1">
              Espacio institucional del partido: imagen del candidato, fundadores, perfil multidisciplinario, conversación ideológica, videos y buscador de candidatos por categoría y distrito electoral.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Explora los bloques informativos, mira los videos de los candidatos o usa “Conversación” para preguntar sobre ideología y bases del partido.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Videos y transmisiones</div>
            <div className="text-slate-800 mt-1">
              Reúne videos grabados o en vivo de candidatos (cuando estén disponibles en la plataforma).
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Busca el nombre del candidato para ver sus transmisiones y presentaciones.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Intención de voto</div>
            <div className="text-slate-800 mt-1">
              Registra tu preferencia de forma guiada. Incluye opción blanco / nulo con reflexión previa.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Elige una opción y confirma para registrar tu decisión.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Reto ciudadano</div>
            <div className="text-slate-800 mt-1">
              Juego por niveles para aprender y participar. Tiene intentos limitados y tiempos de espera.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Entra al nivel, responde y avanza. Si fallas, el sistema te indica cuándo reintentar.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Comentarios ciudadanos</div>
            <div className="text-slate-800 mt-1">
              Espacio para publicar comentarios y leer aportes de otras personas, con reglas para evitar abusos.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Registra tus datos una vez, escribe tu comentario y envía. Luego puedes ver comentarios.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Proyecto Ciudadano</div>
            <div className="text-slate-800 mt-1">
              Presenta proyectos comunitarios, forma un equipo y recibe apoyo vecinal. Los mejores proyectos son premiados cada 3 meses con fondos para materiales, herramientas e insumos.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Regístrate con tus datos, presenta tu proyecto en PDF, recibe apoyos de la comunidad y participa en los ciclos de premiación.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm vc-card-hover">
            <div className="font-bold text-slate-900">Espacio Emprendedor APP</div>
            <div className="text-slate-800 mt-1">
              Espacio exclusivo para afiliados a Alianza para el Progreso. Publica tu proyecto emprendedor, recibe contactos de inversionistas y configura tu perfil de inversión.
            </div>
            <div className="text-slate-700 mt-2 font-semibold">
              ¿Cómo se usa aquí? Si eres afiliado, verifica tu DNI y publica tu proyecto. Si eres inversionista, explora proyectos por categoría y departamento, y contacta a los emprendedores.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "Resumen de secciones: En Inicio buscas candidatos. En la ficha del candidato tienes Hoja de Vida, Plan de Gobierno y Actuar Político. Servicios al ciudadano te lleva a enlaces oficiales. Reflexionar antes de votar te guía por ejes y preguntas. Alianza para el Progreso reúne información institucional del partido. También hay videos y transmisiones, intención de voto, reto ciudadano, comentarios ciudadanos, proyecto ciudadano y espacio emprendedor APP."
              )
            }
            className="rounded-xl px-4 py-2 bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition shadow-sm vc-btn-wave"
          >
            🔊 Leer resumen de secciones
          </button>
        </div>
      </section>

      {/* 7) Transparencia y autoría */}
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm vc-fade-up vc-card-hover mb-5">
        <h2 className="text-lg font-bold text-slate-900">7) Transparencia y autoría</h2>

        <p className="mt-2 text-slate-800 text-sm">
          Esta aplicación es una herramienta informativa para facilitar el acceso a información pública.{" "}
          VOTO CLARO busca ayudar a entender información pública y <b>no reemplaza el criterio personal</b> del usuario.
          <br />
          <span className="text-slate-600">
            Desarrollado por: <b>WALTER SEBASTIAN CABANILLAS ALVAREZ</b>
          </span>
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "Transparencia: esta aplicación es una herramienta informativa para facilitar el acceso a información pública. VOTO CLARO no reemplaza tu criterio personal. Desarrollado por: WALTER SEBASTIAN CABANILLAS ALVAREZ."
              )
            }
             className="rounded-xl px-4 py-2 bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition shadow-sm vc-btn-wave"
          >
            🔊 Leer transparencia
          </button>
        </div>
      </section>

      {/* ⬆ Subir */}
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={scrollTop}
          className="rounded-full px-6 py-3 bg-blue-800 text-white text-sm font-bold hover:bg-blue-900 transition shadow-md vc-btn-wave"
        >
          ⬆ Subir
        </button>
      </div>

      <footer className="mt-8 text-xs text-slate-700 text-center">Gracias por usar VOTO CLARO.</footer>
    </main>
  );
}
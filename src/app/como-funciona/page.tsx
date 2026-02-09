// src/app/como-funciona/page.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";

function sendGuide(text: string, action: "SAY" | "SAY_AND_OPEN" = "SAY") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: { action, text, speak: true },
    })
  );
}

export default function ComoFuncionaPage() {
  useEffect(() => {
    // ✅ Mensaje de bienvenida (intenta narrar; si el navegador bloquea audio, bastará 1 clic/toque)
        // ✅ Al entrar a esta ventana: NO abrir el panel (evita que tape la pantalla)
    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: { action: "CLOSE" },
      })
    );

    const t = setTimeout(() => {
      sendGuide(
        "Bienvenido a Cómo funciona VOTO CLARO. Aquí aprenderás cómo usar la app, cómo te ayuda Federalito, cuáles son sus límites técnicos y la política de uso para una experiencia respetuosa."
      );
    }, 0);

    return () => clearTimeout(t);
  }, []);
  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100">
     <header className="mb-6 relative">
  {/* ⬅ Volver a Inicio (arriba derecha) */}
  <div className="absolute right-0 top-0">
    <Link
      href="/"
     className="rounded-xl px-4 py-2 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition shadow-md border-2 border-red-500"
    >
      ⬅ Volver a Inicio
    </Link>
  </div>

  <h1 className="text-3xl font-semibold text-slate-900">¿Cómo funciona VOTO CLARO?</h1>
  <p className="mt-2 text-slate-800 max-w-3xl">
    Esta ventana es la guía de uso. Si Federalito no habla automáticamente, haz un clic/toque en la pantalla y
    vuelve a intentar (es un bloqueo normal del navegador).
  </p>
</header>

      {/* 1) Qué es */}
      <section className="rounded-2xl border-[6px] border-red-600 bg-green-50/40 p-5">
       <h2 className="text-lg font-bold text-slate-900">1) ¿Qué es VOTO CLARO?</h2>
        <p className="mt-2 text-slate-800 text-sm">
          Voto Claro es una app informativa para ayudarte a entender información pública antes de votar. No es un juego,
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
           className="rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
          >
            🔊 Leer esta parte
          </button>
        </div>
      </section>

      {/* 2) Flujo de uso */}
      <section className="mt-6 rounded-2xl border-[6px] border-red-600 bg-green-50/40 p-5">
        <h2 className="text-lg font-bold text-slate-900">2) ¿Cómo se usa la app? (flujo recomendado)</h2>

        <ol className="mt-3 space-y-3 text-sm text-slate-800 list-decimal pl-5">
          <li>
            <b>Entra a Inicio (/)</b> y busca un candidato escribiendo al menos 2 letras.
          </li>
          <li>
            <b>Abre la ficha del candidato</b> y revisa sus secciones (HV, Plan, Actuar político).
          </li>
          <li>
            <b>Haz preguntas dentro de la sección correcta</b>. Federalito responde mejor cuando estás en la pestaña
            correcta.
          </li>
          <li>
            <b>Usa evidencia</b>: páginas, fragmentos y fuentes. Si no hay evidencia, la app lo indica.
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
                "Flujo recomendado: uno, en Inicio busca un candidato. Dos, abre su ficha. Tres, cambia entre HV, Plan y Actuar político. Cuatro, pregunta dentro de la sección correcta. Cinco, revisa evidencia y luego decide tú."
              )
            }
           className="rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
          >
            🔊 Leer el flujo
          </button>
        </div>
      </section>

      {/* 3) Qué hace Federalito */}
     <section className="mt-6 rounded-2xl border-[6px] border-red-600 bg-green-50/40 p-5">
        <h2 className="text-lg font-bold text-slate-900">3) ¿Cómo te ayuda Federalito?</h2>

        <ul className="mt-3 space-y-2 text-sm text-slate-800 list-disc pl-5">
          <li>
            Te guía según <b>la ventana donde estás</b> (Inicio, Servicios, Reflexión, Cambio con valentía, ficha de
            candidato).
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
                "Federalito te ayuda según la ventana en la que estás. Puede hablar si activas Voz: ON, puede escucharte con el micrófono si tu navegador lo permite, y si preguntas algo fuera de contexto te guía para ir a la ventana correcta."
              )
            }
           className="rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
          >
            🔊 Leer Federalito
          </button>
        </div>
      </section>

      {/* 4) Límites técnicos */}
      <section className="mt-6 rounded-2xl border-[6px] border-red-600 bg-amber-50 p-5">
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
            <b>No adivina</b> ni inventa: si no hay evidencia, lo marca como “sin evidencia” o te orienta a fuentes.
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
                "Límites técnicos: algunos navegadores bloquean el audio hasta un clic o toque. Federalito no mantiene conversación infinita; tiene memoria corta. No habla de cualquier tema: responde solo sobre lo que existe en la app y la sección actual. No inventa. El micrófono depende de permisos del navegador."
              )
            }
            className="rounded-xl px-4 py-2 border border-amber-700 bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition"
          >
            🔊 Leer límites técnicos
          </button>
        </div>
      </section>

      {/* 5) Política de uso */}
     <section className="mt-6 rounded-2xl border-[6px] border-red-600 bg-green-50/40 p-5">
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
            <b>Sin manipulación:</b> no intentes forzar a Federalito a “inventar” o a hablar de temas fuera de contexto.
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
               "Política de uso: utiliza VOTO CLARO con respeto. No insultos ni lisuras. Pregunta dentro de lo que existe en la app. No ingeniería inversa ni intentos de atacar la app. No intentes forzar a Federalito a inventar o hablar fuera de contexto."
              )
            }
            className="rounded-xl px-4 py-2 border border-slate-900 bg-slate-900 text-white text-sm font-semibold hover:opacity-90 transition"
          >
            🔊 Leer política de uso
          </button>
        </div>
      </section>

      {/* 6) Qué hay en las secciones (resumen corto) */}
      <section className="mt-6 rounded-2xl border-[6px] border-red-600 bg-green-50/40 p-5">
        <h2 className="text-lg font-bold text-slate-900">6) ¿Qué encontrarás en cada sección?</h2>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border-2 border-red-400 bg-green-50 p-4">
            <div className="font-bold text-slate-900">Inicio (/)</div>
            <div className="text-slate-800 mt-1">Buscar candidatos y entrar a su ficha.</div>
          </div>

          <div className="rounded-xl border-2 border-red-400 bg-green-50 p-4">
            <div className="font-bold text-slate-900">Servicios al ciudadano</div>
            <div className="text-slate-800 mt-1">Enlaces oficiales: local de votación, multas, miembro de mesa.</div>
          </div>

         <div className="rounded-xl border-2 border-red-400 bg-green-50 p-4">
            <div className="font-bold text-slate-900">Reflexionar antes de votar</div>
            <div className="text-slate-800 mt-1">Preguntas por ejes: economía, salud, educación, seguridad.</div>
          </div>

         <div className="rounded-xl border-2 border-red-400 bg-green-50 p-4">
            <div className="font-bold text-slate-900">Un cambio con valentía</div>
            <div className="text-slate-800 mt-1">Acceso a propuesta y enlace oficial.</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
                "Resumen de secciones: en Inicio buscas candidatos. En Servicios al ciudadano hay enlaces oficiales como local de votación y multas. En Reflexión hay preguntas por ejes. En Cambio con valentía hay una propuesta y enlace oficial."
              )
            }
           className="rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition"
          >
            🔊 Leer resumen de secciones
          </button>
        </div>
      </section>

      {/* 7) Transparencia y autoría */}
      <section className="mt-6 rounded-2xl border-[6px] border-red-600 bg-green-50/40 p-5">
        <h2 className="text-lg font-bold text-slate-900">7) Transparencia y autoría</h2>
        <p className="mt-2 text-slate-800 text-sm">
          Esta aplicación fue desarrollada por encargo de un <b>Partido Político </b> como una
          herramienta informativa. VOTO CLARO busca ayudar a entender información pública y{" "}
          <b>no reemplaza el criterio personal</b> del usuario.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendGuide(
               "Transparencia: esta aplicación fue desarrollada por encargo del Partido Político Democrático Perú Federal como una herramienta informativa. VOTO CLARO no reemplaza tu criterio personal."
              )
            }
            className="rounded-xl px-4 py-2 border border-slate-900 bg-slate-900 text-white text-sm font-semibold hover:opacity-90 transition"
          >
            🔊 Leer transparencia
          </button>
        </div>
      </section>
      {/* ✅ ACCIONES RÁPIDAS */}
    {/* ✅ ACCIONES RÁPIDAS */}
<div className="mt-10 flex justify-center">
  <button
    type="button"
    onClick={scrollTop}
   className="rounded-full px-6 py-3 bg-green-700 text-white text-sm font-bold hover:bg-green-800 transition shadow-lg border-2 border-red-500"
  >
    ⬆ Subir
  </button>
</div>

      <footer className="mt-8 text-xs text-slate-600">
        Siguiente mejora opcional (en otro paso): agregar botones aquí para ir directo a Inicio, Servicios, Reflexión y
        Cambio con valentía.
      </footer>
    </main>
  );
}

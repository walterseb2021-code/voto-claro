"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CAMBIO_PAGE_TITLE,
  CAMBIO_PAGE_LINK_URL,
  CAMBIO_PAGE_LINK_LABEL,
  CAMBIO_PAGE_PHRASE,
} from "@/lib/cambioConValentiaContent";

function guideHoverOnce(text: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: {
        action: "SAY_AND_OPEN",
        text,
        speak: true,
      },
    })
  );
}

export default function CambioConValentiaPage() {
   const [hoverSpoken, setHoverSpoken] = useState(false);
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const [welcomeFinished, setWelcomeFinished] = useState(false);


    // 1) Bienvenida automática (UN SOLO MENSAJE para evitar cortes de TTS)
    // Bienvenida automática (bloquea cualquier otra voz hasta terminar)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const welcome =
      "Bienvenido a Perú Federal. " +
      "Aquí nace un nuevo Perú: descentralización, gobierno eficaz y justicia social. " +
      "El futuro no se espera, se construye. " +
      "Haz clic para conocer la propuesta y visitar la página oficial.";

    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: {
          action: "SAY_AND_OPEN",
          text: welcome,
          speak: true,
          // 🔒 flag interno para Federalito (si existe)
          blocking: true,
        },
      })
    );

    // ⏱️ liberamos interacción SOLO después de un tiempo seguro
    const unlock = setTimeout(() => {
      setWelcomeFinished(true);
      setHoverEnabled(true);
    }, 6000); // tiempo largo a propósito (móvil)

    return () => clearTimeout(unlock);
  }, []);

  function onHoverSpeak() {
    if (!hoverEnabled) return;
    if (hoverSpoken) return;
    setHoverSpoken(true);
    guideHoverOnce("Haz clic para conocer la propuesta.");
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
            {CAMBIO_PAGE_TITLE}
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-700">
            Conoce más en el sitio oficial.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-600 bg-white text-green-700 text-sm font-semibold hover:bg-green-50 shadow-sm transition"
        >
          ← Volver al inicio
        </Link>
      </div>

      {/* Imagen */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="w-full flex justify-center">
          <a
            href="https://perufederal.pe/"
            target="_blank"
            rel="noreferrer"
            onMouseEnter={onHoverSpeak}
            onTouchStart={onHoverSpeak}
            className="relative w-[min(520px,100%)] aspect-[16/9] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 hover:shadow-lg transition"
            title="Abrir sitio oficial del Partido Democrático Perú Federal"
          >
            <Image
              src="/cambio-con-valentia.jpg"
              alt="Un cambio con valentía"
              fill
              className="object-contain"
              priority
            />
          </a>
        </div>

        {/* Nombre candidato */}
        <div className="mt-4 text-center">
          <div className="text-xs text-slate-600 font-semibold tracking-wide">
            CANDIDATO
          </div>
          <div className="mt-1 text-base md:text-lg font-extrabold text-slate-900">
            Armando Joaquín Massé Fernández
          </div>
        </div>

        {/* Link destacado */}
        <div className="mt-8">
          <a
            href={CAMBIO_PAGE_LINK_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-2xl px-5 py-3 font-extrabold text-slate-900 bg-green-300 border border-green-700 shadow-md hover:shadow-lg hover:bg-green-200 transition"
          >
            🔗 {CAMBIO_PAGE_LINK_LABEL}
          </a>

          {/* Frase debajo del link */}
          <a
            href="https://perufederal.pe/"
            target="_blank"
            rel="noreferrer"
            onMouseEnter={onHoverSpeak}
            onTouchStart={onHoverSpeak}
            className="mt-7 block rounded-2xl border border-green-700 bg-green-200 px-5 py-4 shadow-sm hover:bg-green-300 hover:shadow-md transition"
            title="Abrir sitio oficial del Partido Democrático Perú Federal"
          >
            <p className="text-sm md:text-base font-extrabold text-slate-900 text-center uppercase leading-relaxed">
              “{CAMBIO_PAGE_PHRASE}”
            </p>
          </a>
        </div>
      </section>

      <div className="mt-6 text-xs text-slate-500">
        Nota: Este enlace abre un sitio externo en una pestaña nueva.
      </div>
    </main>
  );
}

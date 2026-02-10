// src/app/ciudadano/servicios/page.tsx
"use client";

import Link from "next/link";
import { CIUDADANO_SERVICES } from "@/lib/ciudadanoServiceContent";
import { useEffect, useState } from "react";

type ServiceLink = {
  title: string;
  entity: "JNE" | "ONPE" | "RENIEC";
  url: string;
  note?: string;
  description: string;
};

/**
 * ⚠️ IMPORTANTE
 * Estos enlaces pertenecen a entidades oficiales del Estado Peruano.
 * VOTO CLARO NO ofrece, gestiona ni intermedia estos servicios.
 * Únicamente facilita el acceso a páginas públicas oficiales.
 */

function EntityBadge({ text }: { text: string }) {
  return (
    <span className="text-[11px] font-semibold tracking-wide px-2 py-1 rounded-full border border-red-200 bg-white text-slate-700">
      {text}
    </span>
  );
}

export default function ServiciosCiudadanoPage() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function onScroll() {
      const scrollTop = window.scrollY || 0;
      setShowScrollTop(scrollTop > 300);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ✅ Narración al entrar: contenido real de esta ventana (resumen + lista corta)
  useEffect(() => {
    const list = CIUDADANO_SERVICES.slice(0, 6)
      .map((s, i) => `${i + 1}) ${s.title}`)
      .join("\n");

    const text =
      "Estás en Servicios al ciudadano. " +
      "Aquí tienes enlaces oficiales para trámites electorales.\n\n" +
      "Servicios principales:\n" +
      list +
      "\n\n" +
      "Puedes tocar “Abrir sitio oficial” en cualquiera. " +
      "Si quieres, también puedes pedirme: “lista”, o decir “multas”, “miembro de mesa” o “local de votación”.";

    // ✅ Al entrar a esta ventana: NO dejar el panel abierto (evita que tape la pantalla)
    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: { action: "CLOSE" },
      })
    );

    window.dispatchEvent(
      new CustomEvent("votoclaro:guide", {
        detail: { action: "SAY", text, speak: true },
      })
    );
  }, []);

  // ✅ Estilo consistente (como A-8 / Cambio con valentía)
  const CARD = "rounded-2xl border-4 border-red-700 bg-green-50 shadow-sm";
  const CARD_HOVER = "hover:bg-green-100 transition";

  const RED_OUTLINE_BTN =
    "inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-red-700 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 transition";

  const GREEN_PRIMARY_BTN =
    "inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-900 bg-green-800 text-white text-sm font-semibold hover:bg-green-900 shadow-md transition";

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-100 via-green-50 to-green-100">
      {/* Header */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Servicios al ciudadano
            </h1>
            <p className="mt-2 text-sm md:text-base text-slate-700">
              Enlaces oficiales del Estado Peruano para consultas electorales,
              trámites y documentos públicos.
            </p>
          </div>

          <Link href="/" className={GREEN_PRIMARY_BTN}>
            ← Volver al inicio
          </Link>
        </div>

        {/* Aviso legal / aclaración */}
        <div className="mt-4 rounded-2xl border-2 border-red-700 bg-white px-4 py-3 text-sm text-slate-700">
          ⚠️ <b>Nota importante:</b> VOTO CLARO no pertenece ni representa a
          ninguna entidad del Estado. Los enlaces mostrados dirigen a páginas
          oficiales públicas administradas por JNE, ONPE y RENIEC. VOTO CLARO solo
          facilita el acceso informativo a estos sitios.
        </div>
      </div>

      {/* Lista de servicios */}
      <section className="mt-6 grid grid-cols-1 gap-3">
        {CIUDADANO_SERVICES.map((s) => (
          <div
            key={`${s.entity}-${s.title}`}
            className={`${CARD} ${CARD_HOVER} p-5`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-base font-semibold text-slate-900">
                    {s.title}
                  </div>
                  <EntityBadge text={s.entity} />
                  {s.note ? <EntityBadge text={s.note} /> : null}
                </div>

                <div className="mt-1 text-sm text-slate-700 break-words">
                  {s.url}
                </div>
              </div>

              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className={GREEN_PRIMARY_BTN}
              >
                🔗 Abrir sitio oficial
              </a>
            </div>

            {/* Texto explicativo */}
            <div className="mt-3 text-sm text-slate-700 leading-relaxed">
              {s.description}
            </div>

            {/* Mini acción opcional: copiar link (botón rojo delgado) */}
            <div className="mt-4">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(s.url);
                  } catch {}
                }}
                className={RED_OUTLINE_BTN}
              >
                📋 Copiar enlace
              </button>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-6 text-xs text-slate-600">
        Esta sección puede ampliarse incorporando nuevos enlaces oficiales cuando
        sea necesario.
      </div>

      {/* Botón flotante ↑ Subir */}
      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 left-1/2 -translate-x-[120%] z-[9999] rounded-full bg-green-800 text-white px-4 py-3 text-sm font-semibold shadow-lg hover:bg-green-900 transition"
          aria-label="Subir"
        >
          ↑ Subir
        </button>
      ) : null}
    </main>
  );
}

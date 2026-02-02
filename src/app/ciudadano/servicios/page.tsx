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
 * VotoClaro NO ofrece, gestiona ni intermedia estos servicios.
 * Únicamente facilita el acceso a páginas públicas oficiales.
 */

function EntityBadge({ text }: { text: string }) {
  return (
    <span className="text-[11px] font-semibold tracking-wide px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
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

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100">
      {/* Header */}
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

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-600 bg-white text-green-700 text-sm font-semibold hover:bg-green-50 shadow-sm transition"
        >
          ← Volver al inicio
        </Link>
      </div>

      {/* Aviso legal / aclaración */}
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        ⚠️ <b>Nota importante:</b> VotoClaro no pertenece ni representa a ninguna
        entidad del Estado. Los enlaces mostrados dirigen a páginas oficiales
        públicas administradas por JNE, ONPE y RENIEC. VotoClaro solo facilita el
        acceso informativo a estos sitios.
      </div>

      {/* Lista de servicios */}
      <section className="mt-6 grid grid-cols-1 gap-3">
        {CIUDADANO_SERVICES.map((s) => (
          <div
            key={`${s.entity}-${s.title}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition"
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
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-700 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm font-semibold hover:from-green-700 hover:to-green-800 shadow-md hover:shadow-lg transition"
              >
                🔗 Abrir sitio oficial
              </a>
            </div>

            {/* Texto explicativo */}
            <div className="mt-3 text-sm text-slate-600 leading-relaxed">
              {s.description}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-6 text-xs text-slate-500">
        Esta sección puede ampliarse incorporando nuevos enlaces oficiales cuando
        sea necesario.
      </div>

      {/* Botón flotante ↑ Subir (igual que /reflexion, movido a la izquierda) */}
      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 left-1/2 -translate-x-[120%] z-[9999] rounded-full bg-green-600 text-white px-4 py-3 text-sm font-semibold shadow-lg hover:bg-green-700 transition"
          aria-label="Subir"
        >
          ↑ Subir
        </button>
      ) : null}
    </main>
  );
}

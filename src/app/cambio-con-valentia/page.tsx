"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CAMBIO_PAGE_TITLE,
  CAMBIO_PAGE_LINK_URL,
  CAMBIO_PAGE_LINK_LABEL,
  CAMBIO_PAGE_PHRASE,
} from "@/lib/cambioConValentiaContent";
import { FOUNDERS } from "@/lib/perufederalFounders";
import { CANDIDATE_GROUPS } from "@/lib/perufederalCandidates";

function guideHoverOnce(text: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: {
        action: "SAY",
        text,
        speak: true,
      },
    })
  );
}
function guideSpeak(text: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: {
        action: "SAY",
        text,
        speak: true,
      },
    })
  );
}

const CATEGORY_OPTIONS = [
  { value: "PRESIDENCIAL", label: "Presidencial" },
  { value: "PARLAMENTO_ANDINO", label: "Parlamento Andino" },
  { value: "DIPUTADOS", label: "Diputados" },
  { value: "SENADORES_DISTRITO_UNICO", label: "Senadores Distrito Único" },
  { value: "SENADORES_DISTRITO_MULTIPLE", label: "Senadores Distrito Múltiple" },
] as const;

type CategoryValue = (typeof CATEGORY_OPTIONS)[number]["value"];

export default function CambioConValentiaPage() {
  const router = useRouter();

  const [hoverSpoken, setHoverSpoken] = useState(false);
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const [welcomeFinished, setWelcomeFinished] = useState(false);

  const [selectedRegion, setSelectedRegion] = useState<string>("TODAS");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryValue>("PRESIDENCIAL");

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of CANDIDATE_GROUPS) {
      for (const c of g.candidates) {
        if (c.region) set.add(String(c.region).trim());
      }
    }

    const regions = Array.from(set).filter(Boolean);

    const hasNacional = regions.includes("NACIONAL");
    const rest = regions.filter((r) => r !== "NACIONAL").sort((a, b) =>
      a.localeCompare(b, "es")
    );

    return hasNacional ? ["NACIONAL", ...rest] : rest;
  }, []);

  const visibleCandidates = useMemo(() => {
    const group =
      CANDIDATE_GROUPS.find((g) => g.category === selectedCategory) ?? null;

    const candidates = group?.candidates ?? [];

    if (selectedRegion === "TODAS") return candidates;

    return candidates.filter((c) => String(c.region).trim() === selectedRegion);
  }, [selectedCategory, selectedRegion]);

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
          action: "SAY",
          text: welcome,
          speak: true,
          // 🔒 flag interno para Federalito (si existe)
          blocking: true,
        },
      })
    );

    const unlock = setTimeout(() => {
      setWelcomeFinished(true);
      setHoverEnabled(true);
    }, 6000);

    return () => clearTimeout(unlock);
  }, []);

  function onHoverSpeak() {
    if (!hoverEnabled) return;
    if (hoverSpoken) return;
    setHoverSpoken(true);
    guideHoverOnce("Haz clic para conocer la propuesta.");
  }

  function scrollToTop() {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
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
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-green-800 bg-green-700 text-white text-sm font-extrabold hover:bg-green-800 shadow-sm transition"
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
            className="relative w-[min(520px,100%)] aspect-[16/9] rounded-xl overflow-hidden bg-green-900 border border-slate-200 hover:shadow-lg transition"
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

      {/* Fundadores */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Fundadores
        </h2>

        <div className="mt-4 space-y-4">
          {FOUNDERS.map((f) => (
            <div
              key={f.id}
              className="flex gap-4 items-start rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden border border-slate-200 bg-white shrink-0">
                <Image
                  src={f.photo}
                  alt={f.name}
                  fill
                  className="object-cover"
                />
              </div>

             <div className="min-w-0">
  <div className="text-sm md:text-base font-extrabold text-slate-900">
    {f.name}
  </div>

  <p className="mt-1 text-sm md:text-base text-slate-700">
    “{f.quote}”
  </p>

  <button
    type="button"
    onClick={() => guideSpeak(f.quote)}
    className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-green-800 bg-green-700 text-white text-xs font-extrabold hover:bg-green-800 transition"
    title="Leer frase del fundador"
  >
    🔊 Leer frase
  </button>
</div>

            </div>
          ))}
        </div>
      </section>

      {/* Consulta tu candidato */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
            Consulta tu candidato
          </h2>

          {/* Filtros: Región primero, luego Categoría */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label
                htmlFor="candidateRegion"
                className="text-sm font-semibold text-slate-700"
              >
                Región:
              </label>

              <select
                id="candidateRegion"
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                <option value="TODAS">Todas</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="candidateCategory"
                className="text-sm font-semibold text-slate-700"
              >
                Categoría:
              </label>

              <select
                id="candidateCategory"
                value={selectedCategory}
                onChange={(e) =>
                  setSelectedCategory(e.target.value as CategoryValue)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tarjetas */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCandidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/candidate/${c.id}?tab=HV&from=cambio`)}

              className="text-left rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden"
            >
             <div className="relative w-full aspect-[4/3] bg-slate-100">
                <Image
                  src={c.photo}
                  alt={c.name}
                  fill
                  className="object-contain"
                />
              </div>

              <div className="p-4">
                <div className="text-sm md:text-base font-extrabold text-slate-900">
                  {c.name}
                </div>

                {c.dni ? (
                  <div className="mt-1 text-xs text-slate-600 font-semibold">
                    DNI: {c.dni}
                  </div>
                ) : null}

                <div className="mt-2 text-sm text-slate-700 font-semibold">
                  {c.cargo}
                </div>

                <div className="mt-2 text-xs text-slate-600 font-semibold">
                  Región: {c.region}
                </div>

                <a
  href={c.profileLink}
  target="_blank"
  rel="noreferrer"
  onClick={(e) => e.stopPropagation()}
  className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-blue-800 bg-blue-700 text-white text-xs font-extrabold hover:bg-blue-800 transition"
  title="Conoce al candidato"
  >
  ▶️ Conoce al candidato
</a>

              </div>
            </button>
          ))}
        </div>

        {visibleCandidates.length === 0 ? (
          <div className="mt-4 text-sm text-slate-600">
            No hay candidatos para esta región y categoría.
          </div>
        ) : null}
      </section>

      {/* Botón Subir */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={scrollToTop}
          className="rounded-xl px-4 py-2 border border-green-800 bg-green-700 text-white text-sm font-extrabold shadow-sm hover:bg-green-800 transition"
        >
          ↑ Subir
        </button>
      </div>
    </main>
  );
}

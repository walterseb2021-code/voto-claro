"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import PartyDocsBlock from "@/components/party/PartyDocsBlock";

import {
  CAMBIO_PAGE_TITLE,
  CAMBIO_PAGE_LINK_URL,
  CAMBIO_PAGE_LINK_LABEL,
  CAMBIO_PAGE_PHRASE,
} from "@/lib/cambioConValentiaContent";
import { CANDIDATE_GROUPS } from "@/lib/perufederalCandidates";
import { supabase } from "@/lib/supabaseClient";

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

const ALL_REGIONS = [
  "AMAZONAS",
  "ÁNCASH",
  "APURÍMAC",
  "AREQUIPA",
  "AYACUCHO",
  "CAJAMARCA",
  "CALLAO",
  "CUSCO",
  "HUANCAVELICA",
  "HUÁNUCO",
  "ICA",
  "JUNÍN",
  "LA LIBERTAD",
  "LAMBAYEQUE",
  "LIMA",
  "LORETO",
  "MADRE DE DIOS",
  "MOQUEGUA",
  "PASCO",
  "PIURA",
  "PUNO",
  "SAN MARTÍN",
  "TACNA",
  "TUMBES",
  "UCAYALI",
  "PERUANOS EN EL EXTERIOR",
];
// ===============================
// 🔎 Normalización de regiones
// ===============================
function normRegion(input: string) {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const CANON_REGION_BY_NORM = new Map<string, string>(
  ALL_REGIONS.map((r) => [normRegion(r), r])
);

function toCanonRegion(r: string) {
  const n = normRegion(r);
  return CANON_REGION_BY_NORM.get(n) ?? String(r ?? "").trim().toUpperCase();
}

// ===============================
// ✅ EN VIVO (Demo PRO con localStorage)
// ===============================
type LivePlatform = "YOUTUBE" | "FACEBOOK" | "TIKTOK" | "OTRA";

type LiveEntry = {
  id: string; // uuid simple
  candidateId: string; // debe coincidir con c.id de CANDIDATE_GROUPS
  candidateName: string;
  platform: LivePlatform;
  url: string;
  createdAt: number; // Date.now()
  status: "LIVE" | "ENDED";
};

const LS_LIVE_KEY = "votoclaro_live_entries_v1";

function readLiveEntries(): LiveEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_LIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LiveEntry[];
  } catch {
    return [];
  }
}

function writeLiveEntries(entries: LiveEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_LIVE_KEY, JSON.stringify(entries));
}

function platformLabel(p: LivePlatform) {
  switch (p) {
    case "YOUTUBE":
      return "YouTube";
    case "FACEBOOK":
      return "Facebook";
    case "TIKTOK":
      return "TikTok";
    default:
      return "Otra";
  }
}

export default function CambioConValentiaPage() {
  const router = useRouter();

  const [hoverSpoken, setHoverSpoken] = useState(false);
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const [welcomeFinished, setWelcomeFinished] = useState(false);

  const [selectedRegion, setSelectedRegion] = useState<string>("TODAS");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryValue>("PRESIDENCIAL");
      
  // ✅ Regiones reales POR CATEGORÍA (evita que el filtro "parezca roto")
  const regionsForSelectedCategory = useMemo(() => {
    const group =
      CANDIDATE_GROUPS.find((g) => g.category === selectedCategory) ?? null;

    const candidates = group?.candidates ?? [];

    const set = new Set<string>();
    for (const c of candidates) {
      const raw = String((c as any).region ?? "").trim();
      if (!raw) continue;

      const canon = toCanonRegion(raw);
      if (canon && canon !== "NACIONAL") set.add(canon);
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [selectedCategory]);


  // ✅ Fallback: si una categoría no trae regiones, usamos ALL_REGIONS
  const regionOptions = useMemo(() => {
    return regionsForSelectedCategory.length > 0
      ? regionsForSelectedCategory
      : ALL_REGIONS;
  }, [regionsForSelectedCategory]);
useEffect(() => {
    // Categorías nacionales (ignoran distrito electoral)
    const NATIONAL_CATEGORIES: CategoryValue[] = [
      "PRESIDENCIAL",
      "PARLAMENTO_ANDINO",
      "SENADORES_DISTRITO_UNICO",
    ];

    // Si es nacional: siempre TODAS
    if (NATIONAL_CATEGORIES.includes(selectedCategory)) {
      if (selectedRegion !== "TODAS") setSelectedRegion("TODAS");
      return;
    }

    // Si NO es nacional y la región actual no existe en la categoría, resetea
    if (
      selectedRegion !== "TODAS" &&
      regionOptions.length > 0 &&
            !regionOptions.some((r) => normRegion(r) === normRegion(selectedRegion))
    ) {
      setSelectedRegion("TODAS");
    }
  }, [selectedCategory, selectedRegion, regionOptions]);
  const visibleCandidates = useMemo(() => {
    const group =
      CANDIDATE_GROUPS.find((g) => g.category === selectedCategory) ?? null;

    const candidates = group?.candidates ?? [];

    // Categorías nacionales (ignoran distrito electoral)
    const NATIONAL_CATEGORIES: CategoryValue[] = [
      "PRESIDENCIAL",
      "PARLAMENTO_ANDINO",
      "SENADORES_DISTRITO_UNICO",
    ];

    if (NATIONAL_CATEGORIES.includes(selectedCategory)) {
      return candidates;
    }

    // Para Diputados y Senadores Distrito Múltiple
    if (selectedRegion === "TODAS") return candidates;

      return candidates.filter((c) => normRegion(String(c.region)) === normRegion(selectedRegion));

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

  // ===== Estilos cálidos (verde + rojo) =====
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";

  const innerCard = "rounded-2xl border-2 border-red-600 bg-white/80 p-4";

  const btnGreen =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm";

  const btnGreenSm =
    "inline-flex items-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition";

  const selectWarm =
    "rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold text-slate-900 " +
    "shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-600";
  // ===============================
  // ✅ EN VIVO: estado UI (lee localStorage)
  // ===============================
  // ===============================
// ===============================
// ✅ EN VIVO: estado UI (Supabase real + Realtime FORZADO)
// ===============================
useEffect(() => {
  let alive = true;

  async function loadLives() {
    const { data, error } = await supabase
      .from("votoclaro_live_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("[CambioConValentia] loadLives error", error);
      return;
    }

    if (!alive) return;

    const mapped: LiveEntry[] = (data ?? []).map((x: any) => ({
      id: x.id,
      candidateId: x.candidate_id,
      candidateName: x.candidate_name,
      platform: x.platform,
      url: x.url,
      createdAt: new Date(x.created_at).getTime(),
      status: x.status,
    }));

    setLiveEntries(mapped);
  }

  // 1) Cargar al entrar
  loadLives();

  // 2) Realtime: FORZAR websocket con broadcast + escuchar cambios Postgres
  const channel = supabase
    .channel("votoclaro_live_entries:cambio", {
      config: { broadcast: { self: true } },
    })
    // ✅ Esto fuerza la conexión websocket aunque no haya cambios de BD
    .on("broadcast", { event: "ping" }, (payload) => {
      console.log("[CambioConValentia] broadcast ping recibido:", payload);
    })
    // ✅ Cambios reales en BD
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "votoclaro_live_entries" },
      (payload) => {
        console.log("[CambioConValentia] postgres_changes:", payload);
        loadLives();
      }
    )
    .subscribe((status) => {
      console.log("[CambioConValentia] realtime status:", status);

      // Cuando ya está suscrito, mandamos un ping para confirmar que hay websocket
      if (status === "SUBSCRIBED") {
        channel
          .send({
            type: "broadcast",
            event: "ping",
            payload: { t: Date.now(), from: "cambio" },
          })
          .catch((e) => console.error("[CambioConValentia] ping send error", e));
      }
    });

  return () => {
    alive = false;
    supabase.removeChannel(channel);
  };
}, []);

  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([]);
  const [liveSearch, setLiveSearch] = useState("");
  const [selectedCandidateForHistory, setSelectedCandidateForHistory] =
    useState<string>("");

  /*useEffect(() => {
    if (typeof window === "undefined") return;
    setLiveEntries(readLiveEntries());

    // sincroniza cambios si se modifican en otra pestaña
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_LIVE_KEY) setLiveEntries(readLiveEntries());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);*/

  const liveNow = useMemo(() => {
    return liveEntries
      .filter((x) => x.status === "LIVE")
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [liveEntries]);

  const candidatesFlat = useMemo(() => {
    const all: Array<{ id: string; name: string }> = [];
    for (const g of CANDIDATE_GROUPS) {
      for (const c of g.candidates) {
        all.push({ id: String(c.id), name: String(c.name) });
      }
    }
    return all;
  }, []);

  const filteredCandidateSuggestions = useMemo(() => {
    const q = liveSearch.trim().toLowerCase();
    if (!q) return [];
    return candidatesFlat
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [liveSearch, candidatesFlat]);

  const historyForSelected = useMemo(() => {
    if (!selectedCandidateForHistory) return [];
    return liveEntries
      .filter((x) => x.candidateId === selectedCandidateForHistory)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [liveEntries, selectedCandidateForHistory]);

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 break-words">
            {CAMBIO_PAGE_TITLE}
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-700 whitespace-normal break-words">
            Conoce más en el sitio oficial.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold hover:bg-green-900 shadow-sm transition"
        >
          ← Volver al inicio
        </Link>
      </div>

      {/* Imagen + frase + link */}
      <section className={sectionWrap}>
        <div className="w-full flex justify-center">
          <a
            href="https://perufederal.pe/"
            target="_blank"
            rel="noreferrer"
            onMouseEnter={onHoverSpeak}
            onTouchStart={onHoverSpeak}
            className="relative w-[min(520px,100%)] aspect-[16/9] rounded-xl overflow-hidden bg-green-900 border-2 border-red-600 hover:shadow-lg transition"
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
          <div className="text-xs text-slate-700 font-extrabold tracking-wide">
            CANDIDATO
          </div>
          <div className="mt-1 text-base md:text-lg font-extrabold text-slate-900 whitespace-normal break-words">
            Armando Joaquín Massé Fernández
          </div>
        </div>

        {/* Link destacado */}
        <div className="mt-5 flex justify-center">
          <a
            href={CAMBIO_PAGE_LINK_URL}
            target="_blank"
            rel="noreferrer"
            className={
              "w-full sm:w-auto text-center rounded-2xl px-5 py-3 " +
              "font-extrabold text-white bg-green-800 border-2 border-red-600 " +
              "shadow-md hover:shadow-lg hover:bg-green-900 transition"
            }
          >
            🔗 {CAMBIO_PAGE_LINK_LABEL}
          </a>
        </div>

        {/* Frase debajo del link */}
        <a
          href="https://perufederal.pe/"
          target="_blank"
          rel="noreferrer"
          onMouseEnter={onHoverSpeak}
          onTouchStart={onHoverSpeak}
          className="mt-4 block rounded-2xl border-2 border-red-600 bg-green-50/80 px-5 py-4 shadow-sm hover:bg-green-100 hover:shadow-md transition"
          title="Abrir sitio oficial del Partido Democrático Perú Federal"
        >
          <p className="text-sm md:text-base font-extrabold text-slate-900 text-center uppercase leading-relaxed whitespace-normal break-words">
            “{CAMBIO_PAGE_PHRASE}”
          </p>
        </a>
      </section>

      <div className="mt-3 text-xs text-slate-600">
        Nota: Este enlace abre un sitio externo en una pestaña nueva.
      </div>

      {/* =========================
          BLOQUE FUNDADOR (pequeño)
          ========================= */}
      <section className={sectionWrap}>
        <div className={innerCard}>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="relative w-36 h-36 md:w-40 md:h-40 rounded-2xl overflow-hidden border-2 border-red-600 bg-white shrink-0">
              <Image
                src="/candidates/virgilio-acuña-peralta.png"
                alt="Virgilio Acuña Peralta"
                fill
                className="object-contain bg-white"
              />
            </div>

            <div className="min-w-0">
              <div className="text-xs text-slate-700 font-extrabold tracking-wide uppercase">
                Fundador
              </div>

              <h2 className="mt-1 text-base md:text-lg font-extrabold text-slate-900 break-words">
                Virgilio Acuña Peralta
              </h2>

              <p className="mt-2 text-sm md:text-base text-slate-800 font-semibold leading-relaxed break-words">
                “El Perú no se desarrollará mientras el poder siga concentrado en
                Lima. La descentralización es justicia territorial.”
              </p>

              <button
                type="button"
                onClick={() =>
                  guideSpeak(
                    "Virgilio Acuña Peralta. El Perú no se desarrollará mientras el poder siga concentrado en Lima. La descentralización es justicia territorial."
                  )
                }
                className={btnGreenSm + " mt-3"}
              >
                🔊 Leer
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =========================
          BLOQUE CANDIDATO (principal)
          ========================= */}
      <section className={sectionWrap}>
        <div className={innerCard}>
          <div className="text-center">
            <div className="text-xs text-slate-700 font-extrabold tracking-wide uppercase">
              Candidato
            </div>

            <h2 className="mt-1 text-xl md:text-2xl font-extrabold text-slate-900 break-words">
              Armando Joaquín Massé Fernández
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-[180px,1fr] gap-5 items-start">
            <div className="flex justify-center md:justify-start">
              <div className="relative w-44 h-44 rounded-2xl overflow-hidden border-2 border-red-600 bg-white shrink-0">
                <Image
                  src="/candidates/armando-joaquin-masse-fernandez.png"
                  alt="Armando Joaquín Massé Fernández"
                  fill
                  className="object-contain bg-white"
                />
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-sm md:text-base text-slate-800 font-extrabold leading-relaxed break-words">
                “El Perú es un país que duele cuando la vida no se cuida, se
                estanca cuando no se produce, se rompe cuando no se escucha y se
                pierde cuando el poder olvida para quién existe.”
              </p>

              <button
                type="button"
                onClick={() =>
                  guideSpeak(
                    "El Perú es un país que duele cuando la vida no se cuida, se estanca cuando no se produce, se rompe cuando no se escucha y se pierde cuando el poder olvida para quién existe."
                  )
                }
                className={btnGreen + " mt-3"}
              >
                🔊 Leer
              </button>
              {/* Perfil Multidisciplinario */}
<div className="mt-6 rounded-2xl border-2 border-red-600 bg-green-50/60 p-4">
  <h3 className="text-sm md:text-base font-extrabold text-slate-900 text-center">
    Perfil Multidisciplinario
  </h3>

  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
    {[
      {
        label: "Médico cirujano",
        url: "https://www.youtube.com/watch?v=5mE11zwfqno",
      },
      {
        label: "Cantautor y compositor",
        url: "https://www.youtube.com/watch?v=ikOo6jHi3tA",
      },
      {
        label: "Locutor y comunicador",
        url: "https://www.youtube.com/watch?v=hJYQl315YK0&t=31s",
      },
      {
        label: "Gestor cultural y líder en derechos de autor",
        url: "https://www.youtube.com/watch?v=GcZCwjK8K-Q",
      },
      {
        label: "Escritor",
        url: "https://web.facebook.com/share/v/1DaBDzvBa2/",
      },
      {
        label: "Político",
        url: "https://www.youtube.com/shorts/v1LYIpYGmno",
      },
    ].map((item) => (
      <div
        key={item.label}
        className="flex items-center justify-between gap-3 rounded-xl border-2 border-red-500 bg-white/85 px-4 py-3"
      >
        <span className="text-sm font-semibold text-slate-900 break-words">
          {item.label}
        </span>

        <button
          type="button"
          onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
          className="rounded-lg px-3 py-1 bg-green-800 text-white text-xs font-extrabold border border-red-500 hover:bg-green-900 transition shrink-0"
        >
          Ver
        </button>
      </div>
    ))}
  </div>
</div>
<p className="mt-3 text-xs text-slate-600 text-center">
  Los enlaces conducen a contenidos públicos alojados en plataformas de terceros.
  VOTO CLARO no es titular de dichos contenidos ni los aloja en sus servidores.
</p>

            </div>
          </div>
        </div>
      </section>

      {/* =========================
    DOCUMENTOS BASE (JSON)
   ========================= */}
<section className={sectionWrap}>
  <PartyDocsBlock partyId="perufederal" />
</section>

            {/* =========================
          🔴 EN VIVO AHORA (PRO - listado global)
          ========================= */}
      <section className={sectionWrap}>
        <div className={innerCard}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
              🔴 EN VIVO AHORA
            </h2>

            <div className="text-xs font-semibold text-slate-600">
              (Se actualiza cuando se activan enlaces de transmisión)
            </div>
          </div>

          {liveNow.length === 0 ? (
            <div className="mt-3 rounded-2xl border-2 border-red-600 bg-green-50/70 p-4 text-sm font-semibold text-slate-700">
              No hay transmisiones en vivo en este momento.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {liveNow.map((x) => (
                <div
                  key={x.id}
                  className="rounded-2xl border-4 border-red-700 bg-red-50/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-red-800 tracking-wide">
                        EN VIVO
                      </div>
                      <div className="mt-1 text-sm md:text-base font-extrabold text-slate-900 break-words">
                        {x.candidateName}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-700">
                        Plataforma: {platformLabel(x.platform)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => window.open(x.url, "_blank")}
                      className={
                        "shrink-0 rounded-xl px-4 py-2 border-2 border-red-700 " +
                        "bg-green-800 text-white text-xs font-extrabold hover:bg-green-900 transition"
                      }
                      title="Ver en vivo"
                    >
                      Ver en vivo
                    </button>
                  </div>

                  <div className="mt-3 text-[11px] text-slate-600 break-words">
                    {x.url}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =========================
          🔎 BUSCAR TRANSMISIONES (historial por candidato)
          ========================= */}
      <section className={sectionWrap}>
        <div className={innerCard}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
              🔎 Buscar transmisiones
            </h2>
            <div className="text-xs font-semibold text-slate-600">
              Escribe el nombre del candidato y elige uno.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr,220px] gap-3 items-start">
            <div className="min-w-0">
              <label className="text-sm font-extrabold text-slate-800">
                Nombre del candidato:
              </label>

              <input
                value={liveSearch}
                onChange={(e) => setLiveSearch(e.target.value)}
                placeholder="Ej: Massé, Acuña, López Aliaga..."
                className="mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />

              {filteredCandidateSuggestions.length > 0 ? (
                <div className="mt-2 rounded-2xl border-2 border-red-600 bg-green-50/70 p-2">
                  {filteredCandidateSuggestions.map((c, idx) => (
  <button
    key={`${c.id}-${idx}`}

                      type="button"
                      onClick={() => {
                        setSelectedCandidateForHistory(c.id);
                        setLiveSearch(c.name);
                      }}
                      className="w-full text-left rounded-xl px-3 py-2 hover:bg-green-100 transition text-sm font-extrabold text-slate-900"
                      title="Ver historial"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-extrabold text-slate-800">
                Acciones:
              </label>

              <button
                type="button"
                onClick={() => {
                  setSelectedCandidateForHistory("");
                  setLiveSearch("");
                }}
                className={btnGreen + " mt-2 w-full"}
                title="Limpiar búsqueda"
              >
                Limpiar
              </button>
            </div>
          </div>

          {selectedCandidateForHistory ? (
            <div className="mt-5 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4">
              <div className="text-sm font-extrabold text-slate-900">
                Historial de transmisiones
              </div>

              {historyForSelected.length === 0 ? (
                <div className="mt-2 text-sm font-semibold text-slate-700">
                  No hay transmisiones registradas para este candidato.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {historyForSelected.map((x) => (
                    <div
                      key={x.id}
                      className="rounded-2xl border-2 border-red-600 bg-white/85 p-3 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-700">
                          {new Date(x.createdAt).toLocaleString("es-PE")}
                          {" · "}
                          {platformLabel(x.platform)}
                          {" · "}
                          {x.status === "LIVE" ? "🔴 EN VIVO" : "Finalizado"}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600 break-words">
                          {x.url}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => window.open(x.url, "_blank")}
                        className={
                          "rounded-xl px-4 py-2 border-2 border-red-600 " +
                          "bg-green-800 text-white text-xs font-extrabold hover:bg-green-900 transition"
                        }
                        title="Ver"
                      >
                        Ver
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 text-sm font-semibold text-slate-700">
              Selecciona un candidato para ver su historial.
            </div>
          )}
        </div>
      </section>

{/* Consulta tu candidato */}
<section className={sectionWrap}>
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
      Consulta tu candidato
    </h2>

    {/* Filtros: Categoría primero, luego Distrito electoral */}
    <div className="flex items-center gap-3 flex-wrap">
      {/* Categoría */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="candidateCategory"
          className="text-sm font-extrabold text-slate-800"
        >
          Categoría:
        </label>

        <select
          id="candidateCategory"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as CategoryValue)}
          className={selectWarm}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Distrito electoral */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="candidateRegion"
          className="text-sm font-extrabold text-slate-800"
        >
          Distrito electoral:
        </label>

        {[
          "PRESIDENCIAL",
          "PARLAMENTO_ANDINO",
          "SENADORES_DISTRITO_UNICO",
        ].includes(selectedCategory) ? (
          <select
            id="candidateRegion"
            value="NO_APLICA"
            disabled
            className="rounded-xl px-3 py-2 text-sm font-semibold shadow-sm focus:outline-none border-2 border-red-600 bg-slate-100 text-slate-400 cursor-not-allowed"
          >
            <option value="NO_APLICA">Muestra todos</option>
          </select>
        ) : (
          <select
            id="candidateRegion"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className={selectWarm}
          >
            <option value="TODAS">Todos</option>

                       {regionOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}

          </select>
        )}
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
        className="text-left rounded-2xl border-2 border-red-600 bg-white/85 shadow-sm hover:shadow-md transition overflow-hidden"
      >
        <div className="relative w-full aspect-[4/3] bg-green-50 border-b-2 border-red-600">
          <Image src={c.photo} alt={c.name} fill className="object-contain" />
        </div>

        <div className="p-4">
          <div className="text-sm md:text-base font-extrabold text-slate-900 whitespace-normal break-words">
            {c.name}
          </div>

          {c.dni ? (
            <div className="mt-1 text-xs text-slate-700 font-semibold whitespace-normal break-words">
              DNI: {c.dni}
            </div>
          ) : null}

          <div className="mt-2 text-sm text-slate-700 font-semibold whitespace-normal break-words">
            {c.cargo}
          </div>

          <div className="mt-2 text-xs text-slate-700 font-semibold whitespace-normal break-words">
            Región: {c.region}
          </div>

          {/* Botón VER (en vez de azul) */}
          <a
            href={c.profileLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={
              "mt-3 inline-flex items-center justify-center " +
              "rounded-xl px-4 py-2 border-2 border-red-600 bg-green-800 " +
              "text-white text-xs font-extrabold hover:bg-green-900 transition"
            }
            title="Ver"
          >
            Ver
          </a>
        </div>
      </button>
    ))}
  </div>

  {visibleCandidates.length === 0 ? (
    <div className="mt-4 text-sm text-slate-700 font-semibold">
      No hay candidatos para esta región y categoría.
    </div>
  ) : null}
</section>


      {/* Botón Subir */}
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={scrollToTop} className={btnGreen}>
          ↑ Subir
        </button>
      </div>
    </main>
  );
}

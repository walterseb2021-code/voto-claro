// src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = {
  id: string;
  full_name: string;
  party_name: string;
  photo_url: string | null;
};

const PITCH_DONE_KEY = "votoclaro_pitch_done_v1";
const BASE_NAV_DELAY_MS = 6500;     // tiempo base antes de navegar
const MS_PER_WORD = 420;            // velocidad aproximada de narración
const MIN_NAV_DELAY_MS = 9000;      // mínimo para textos cortos
const MAX_NAV_DELAY_MS = 22000;     // máximo para textos largos
// ✅ tiempo para que Federalito termine antes de navegar
const DOUBLE_CLICK_WINDOW_MS = 280; // ✅ ventana para detectar 2 clics y entrar directo

function FederalitoAvatar({ size = 140 }: { size?: number }) {
  return (
    <div
      className="federalito-anim rounded-2xl border bg-white overflow-hidden p-2"
      style={{ width: size, height: size }}
      aria-label="Federalito AI"
      title="Federalito AI"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/federalito.png"
        alt="Federalito AI"
        className="w-full h-full object-contain"
        draggable={false}
      />
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full border border-green-200 bg-green-100 text-green-800 font-medium">
      {children}
    </span>
  );
}

/**
 * ✅ Envía un mensaje al panel FederalitoGuide (abajo a la derecha)
 * Requiere que FederalitoGuide escuche el evento: "votoclaro:guide"
 */
function guideSay(text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: { action: "SAY", text, speak: true },
    })
  );
}

export default function HomePage() {
  const router = useRouter();

  // ✅ Hooks SIEMPRE arriba (sin returns antes)
  const [allowHome, setAllowHome] = useState(false);
  const [activeParty, setActiveParty] = useState<"perufederal" | "app">("perufederal");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);
  const searchRef = useRef<HTMLElement | null>(null);

  // ✅ Timers para 1 clic vs 2 clics (NO romper UX)
  const clickTimersRef = useRef<Record<string, number | null>>({});
  const navTimersRef = useRef<Record<string, number | null>>({});

  function stopVoice() {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }

  function clearTimers(key: string) {
    const t1 = clickTimersRef.current[key];
    const t2 = navTimersRef.current[key];
    if (typeof t1 === "number") window.clearTimeout(t1);
    if (typeof t2 === "number") window.clearTimeout(t2);
    clickTimersRef.current[key] = null;
    navTimersRef.current[key] = null;
  }
function estimateNavDelayMs(speech: string) {
  const words = speech.trim().split(/\s+/).filter(Boolean).length;
  const estimated = BASE_NAV_DELAY_MS + words * MS_PER_WORD;
  return Math.max(MIN_NAV_DELAY_MS, Math.min(MAX_NAV_DELAY_MS, estimated));
}
  /**
   * ✅ 1 clic: (espera ventana de doble click) -> narra -> navega con delay largo
   * ✅ 2 clics rápidos: entra directo SIN narración
   */
  function handleSmartNavigate(opts: {
    key: string;
    href: string;
    speech: string;
    preventDefault?: boolean;
    e?: React.MouseEvent;
  }) {
    const { key, href, speech, e, preventDefault } = opts;

    if (preventDefault && e) e.preventDefault();

    // Si ya hubo 1er clic y llega el 2do dentro de la ventana => entrar directo
    if (clickTimersRef.current[key]) {
      clearTimers(key);
      stopVoice();
      router.push(href);
      return;
    }

    // Primer clic: armamos ventana corta para detectar el segundo clic
    clearTimers(key);

    clickTimersRef.current[key] = window.setTimeout(() => {
      // Si nadie hizo segundo clic, recién aquí narramos y programamos navegación
      clickTimersRef.current[key] = null;

      guideSay(speech);

      navTimersRef.current[key] = window.setTimeout(() => {
        navTimersRef.current[key] = null;
        router.push(href);
      }, estimateNavDelayMs(speech));
    }, DOUBLE_CLICK_WINDOW_MS);
  }

  // ✅ Gate PRO: si aún no se salió de /pitch en esta sesión, mandar a /pitch
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);

      // Si vienes desde pitch con parámetro, marcamos la sesión y limpiamos la URL.
      if (sp.get("fromPitch") === "1") {
        sessionStorage.setItem(PITCH_DONE_KEY, "1");
        setAllowHome(true);
        // ✅ Detectar party desde URL o storage
        const partyFromUrl = sp.get("party");
        const partyFromStorage = localStorage.getItem("votoclaro_active_party_v1");

        if (partyFromUrl === "app" || partyFromStorage === "app") {
         setActiveParty("app");
       } else {
         setActiveParty("perufederal");
      }
        router.replace("/"); // limpia ?fromPitch=1
        return;
      }

      const done = sessionStorage.getItem(PITCH_DONE_KEY) === "1";
      if (!done) {
        router.replace("/pitch");
        return;
      }

      setAllowHome(true);
    } catch {
      router.replace("/pitch");
    }
  }, [router]);

  useEffect(() => {
    searchRef.current = document.getElementById("buscar") as HTMLElement | null;
  }, []);

  useEffect(() => {
    let aborted = false;

    async function run() {
      if (!canSearch) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/candidates/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!aborted) setItems(data.items ?? []);
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    const t = setTimeout(run, 250);
    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [q, canSearch]);

  // ✅ Limpieza al salir de Home (evita timers colgados)
  useEffect(() => {
    return () => {
      Object.keys(clickTimersRef.current).forEach((k) => clearTimers(k));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToSearch() {
    const el = searchRef.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goToSearchAndGuide(text: string) {
    guideSay(text);
    goToSearch();
  }

  // ✅ Ahora sí: bloquear render SIN romper hooks
  if (!allowHome) return null;

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100">
      {/* HERO */}
      <section className="rounded-3xl border-[6px] border-red-600 shadow-sm overflow-hidden bg-white">
        {/* Banner superior (SIN imagen, como pediste) */}
        <div className="p-6 md:p-8 bg-gradient-to-br from-sky-50 via-white to-white">
          <div className="flex flex-col gap-6">
            <div className="min-w-0">
              {/* Título */}
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                VOTO CLARO
              </h1>

              {/* Pills (verde claro de fondo, texto verde oscuro) */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Pill>Asistente AI • modo guía</Pill>
                <Pill>Sin inventar</Pill>
                <Pill>Con evidencia</Pill>
              </div>

              {/* Frase principal (negro) + explicación (gris oscuro) */}
              <p className="mt-3 text-base md:text-lg font-semibold text-slate-900">
                Información clara para decidir mejor.
              </p>
              <p className="mt-1 text-sm md:text-base text-slate-800">
                Federalito te guía paso a paso por documentos, fuentes y comparaciones.
              </p>

              {/* 3 pasos (verde claro porque NO navegan) */}
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    goToSearchAndGuide(
                      "Paso 1: Busca. Escribe al menos 2 letras del nombre del candidato que buscas y abre su ficha para ver Hoja de Vida, Plan de gobierno y actuar político."
                    )
                  }
                  className="text-left rounded-2xl border-[6px] border-red-600 bg-green-50 p-4 shadow-sm hover:shadow-md hover:bg-green-100 transition"
                >
                  <div className="text-sm font-semibold text-slate-900">1) Busca</div>
                  <div className="mt-1 text-xs text-slate-800">
                    Escribe un nombre y entra a la ficha del candidato.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    goToSearchAndGuide(
                      "Paso 2: Verifica. En la ficha revisa Hoja de Vida y Plan de Gobierno. Si no hay páginas o fuentes, lo marcaremos como sin evidencia."
                    )
                  }
                  className="text-left rounded-2xl border-[6px] border-red-600 bg-green-50 p-4 shadow-sm hover:shadow-md hover:bg-green-100 transition"
                >
                  <div className="text-sm font-semibold text-slate-900">2) Verifica</div>
                  <div className="mt-1 text-xs text-slate-800">
                    Revisa HV, Plan y fuentes. Mira páginas y fragmentos.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    goToSearchAndGuide(
                      "Paso 3: Decide. Antes de votar, revisa la evidencia: Hoja de vida, Plan y Actuar político. Luego decide con criterio: coherencia, viabilidad y conducta pública."
                    )
                  }
                  className="text-left rounded-2xl border-[6px] border-red-600 bg-green-50 p-4 shadow-sm hover:shadow-md hover:bg-green-100 transition"
                >
                  <div className="text-sm font-semibold text-slate-900">3) Decide</div>
                  <div className="mt-1 text-xs text-slate-800">
                    Elige con criterio: coherencia, viabilidad y conducta pública.
                  </div>
                </button>
              </div>

              {/* Acciones rápidas */}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    goToSearchAndGuide(
                      "Vamos a empezar. Escribe el nombre del candidato y entra a su ficha. Luego cambia entre HV, Plan y Actuar político."
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 border-2 border-red-500 bg-gradient-to-r from-green-700 to-green-800 text-white text-sm font-semibold hover:from-green-800 hover:to-green-900 shadow-md hover:shadow-lg transition"
                >
                  🔎 Empezar búsqueda
                </button>

                {/* ✅ SMART: 1 clic explica / 2 clics entra directo */}
                <button
                  type="button"
                  onClick={(e) =>
                    handleSmartNavigate({
                      key: "como-funciona",
                      href: "/como-funciona",
                      speech:
                        "Vamos a la sección Cómo funciona. Ahí te explicaré paso a paso cómo usar VOTO CLARO.",
                      preventDefault: true,
                      e,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-500 bg-green-700 text-white text-sm font-semibold hover:bg-green-800 shadow-sm transition"
                >
                  🧭 Cómo funciona
                </button>

                <button
                  type="button"
                  onClick={() =>
                    guideSay(
                      "Recuerda: un voto responsable empieza con información verificable. Primero busca, luego verifica, y recién al final decide."
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-red-400 bg-green-50 text-slate-900 text-sm hover:bg-green-100"
                >
                  “Un voto responsable empieza con información verificable.”
                </button>
              </div>

              <div className="mt-4 text-[11px] text-slate-800">
                Tip: <b>1 clic</b> explica, <b>2 clics</b> entra directo.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BUSCADOR */}
      <section id="buscar" className="mt-6 border-[6px] border-red-600 rounded-2xl p-6 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="inline-block rounded-lg bg-green-100 px-3 py-1 text-lg font-semibold text-slate-900 border-2 border-red-500">
              Buscar candidato
            </h2>

            <p className="text-sm text-slate-800 mt-1">
              Escribe al menos 2 letras del candidato que buscas. Abre la ficha para consultar Hoja de
              Vida (HV), Plan de Gobierno y Actuar Político.
            </p>
          </div>
          <div className="text-xs text-slate-800 border border-green-200 rounded-full px-3 py-1 bg-green-50">
            Reglas: sin vida privada • con fuentes • sin inventar
          </div>
        </div>

        <div className="mt-4">
          <input
            className="
              w-full
              border-2 border-red-600
              rounded-xl
              px-4 py-3
              bg-green-800
              text-white
              font-semibold
              placeholder:text-green-100
              focus:outline-none
              focus:ring-2
              focus:ring-green-300
            "
            placeholder="Escribe: 'Armando Massé', 'César Acuña', 'López Aliaga', 'Keiko Fujimori'..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {loading && <div className="text-sm mt-2 text-slate-700">Buscando...</div>}
        </div>

        <div className="mt-5 grid gap-3">
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/candidate/${c.id}`}
              className="border rounded-xl p-4 flex gap-4 bg-white hover:bg-slate-50 hover:shadow-sm transition"
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-200 shrink-0">
                {c.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo_url} alt={c.full_name} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate text-slate-900">{c.full_name}</div>
                <div className="text-sm text-slate-700 truncate">{c.party_name}</div>
              </div>
            </Link>
          ))}
        </div>

        {!items.length && q.trim().length >= 2 && !loading ? (
          <div className="mt-6 text-sm text-slate-700">
            Sin resultados. Revisa que tu lista de candidatos esté cargada en{" "}
            <code className="px-1">/api/candidates/search</code>.
          </div>
        ) : null}
      </section>

      {/* ✅ ACCESOS RÁPIDOS */}
      <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ✅ SMART LINK: 1 clic explica / 2 clics entra directo */}
        <Link
          href="/ciudadano/servicios"
          onClick={(e) =>
            handleSmartNavigate({
              key: "servicios",
              href: "/ciudadano/servicios",
              speech:
                "Vas a entrar a Servicios al ciudadano. Allí verás enlaces oficiales para consultar local de votación, miembro de mesa, multas y trámites electorales.",
              preventDefault: true,
              e,
            })
          }
          className="group text-left w-full rounded-2xl border-[6px] border-red-600 bg-green-50 p-5 shadow-sm hover:shadow-md hover:bg-green-100 transition"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl leading-none">🗳️</div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">Servicios al ciudadano</div>
              <p className="mt-1 text-sm text-slate-800">
                Consulta tu local de votación, verifica si eres miembro de mesa, revisa planes de gobierno,
                trámites oficiales y más.
              </p>
              <div className="mt-3 inline-flex items-center text-sm font-semibold text-green-800 group-hover:text-green-900">
                Abrir servicios →
              </div>
            </div>
          </div>
        </Link>

        {/* ✅ SMART LINK */}
        <Link
          href="/reflexion"
          onClick={(e) =>
            handleSmartNavigate({
              key: "reflexion",
              href: "/reflexion",
              speech:
                "Vas a entrar a Reflexionar antes de votar. Allí encontrarás ejes como economía, salud, educación y seguridad, con preguntas y reflexiones para decidir mejor.",
              preventDefault: true,
              e,
            })
          }
          className="group text-left w-full md:col-span-2 rounded-2xl border-[6px] border-red-600 bg-green-100 p-5 shadow-sm hover:shadow-md hover:bg-green-200 transition"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl leading-none">🧠</div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">Reflexionar antes de votar</div>
              <p className="mt-1 text-sm text-slate-800">
                Preguntas y reflexiones para pensar cuál es la realidad actual del país, qué esperas del Estado,
                qué puedes aportar como ciudadano, qué atributos debería tener quien gobierne y más.
              </p>
              <div className="mt-3 inline-flex items-center text-sm font-semibold text-green-800 group-hover:text-green-900">
                Abrir reflexiones →
              </div>
            </div>
          </div>
        </Link>

        {/* ✅ SMART LINK */}
        {activeParty === "app" ? (
  <Link
    href="/cambio-app"
    onClick={(e) =>
      handleSmartNavigate({
        key: "cambio-app",
        href: "/cambio-app",
        speech:
          "Vas a entrar a Alianza para el Progreso. Aquí encontrarás la propuesta correspondiente al grupo activo.",
        preventDefault: true,
        e,
      })
    }
    className="group text-left w-full md:col-span-2 rounded-2xl border-[6px] border-red-600 bg-blue-100 p-5 shadow-sm hover:shadow-md hover:bg-blue-200 transition"
  >
    <div className="flex items-start gap-3">
      <div className="text-2xl leading-none">🔵</div>
      <div className="min-w-0">
        <div className="text-base font-extrabold text-slate-900">ALIANZA PARA EL PROGRESO</div>
        <p className="mt-1 text-sm text-slate-900">
          Explora la propuesta correspondiente al grupo APP.
        </p>
        <div className="mt-3 inline-flex items-center text-sm font-extrabold text-slate-900 group-hover:underline">
          Abrir página →
        </div>
      </div>
    </div>
  </Link>
) : (
  <Link
    href="/cambio-con-valentia"
    onClick={(e) =>
      handleSmartNavigate({
        key: "cambio",
        href: "/cambio-con-valentia",
        speech:
          "Vas a entrar a Un cambio con valentía. Esta ventana muestra la propuesta del Partido Democrático Perú Federal.",
        preventDefault: true,
        e,
      })
    }
    className="group text-left w-full md:col-span-2 rounded-2xl border-[6px] border-red-600 bg-green-100 p-5 shadow-sm hover:shadow-md hover:bg-green-200 transition"
  >
    <div className="flex items-start gap-3">
      <div className="text-2xl leading-none">🔥</div>
      <div className="min-w-0">
        <div className="text-base font-extrabold text-slate-900">UN CAMBIO CON VALENTÍA</div>
        <p className="mt-1 text-sm text-slate-900">
          Propuesta del Partido Democrático Perú Federal.
        </p>
        <div className="mt-3 inline-flex items-center text-sm font-extrabold text-slate-900 group-hover:underline">
          Abrir página →
        </div>
      </div>
    </div>
  </Link>
)}
                {/* ✅ SMART LINK: Intención de voto (UI) */}
        <Link
          href="/intencion-de-voto"
          onClick={(e) =>
            handleSmartNavigate({
              key: "intencion",
              href: "/intencion-de-voto",
              speech:
                "Vas a entrar a Intención de voto. Es una pantalla piloto con once partidos y nulo o blanco, para visualizar tendencias de forma simple. Recuerda: decide con información verificable.",
              preventDefault: true,
              e,
            })
          }
          className="group text-left w-full md:col-span-2 rounded-2xl border-[6px] border-red-600 bg-green-100 p-5 shadow-sm hover:shadow-md hover:bg-green-200 transition"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl leading-none">📊</div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900">INTENCIÓN DE VOTO</div>
              <p className="mt-1 text-sm text-slate-900">
                Vista piloto (11 partidos + Nulo/Blanco) para explorar tendencias. Próximamente se incluirán
                todos los partidos.
              </p>
              <div className="mt-3 inline-flex items-center text-sm font-extrabold text-slate-900 group-hover:underline">
                Abrir página →
              </div>
            </div>
          </div>
        </Link>
               {/* ✅ SMART LINK: Reto Ciudadano (UI) */}
        <Link
          href="/reto-ciudadano"
          onClick={(e) =>
            handleSmartNavigate({
              key: "reto-ciudadano",
              href: "/reto-ciudadano",
              speech:
                "Vas a entrar a Reto Ciudadano. Es un juego por niveles: conocimiento general, partido y ruleta. Puedes jugar en modo sin premio o con premio.",
              preventDefault: true,
              e,
            })
          }
          className="group text-left w-full md:col-span-2 rounded-2xl border-[6px] border-red-600 bg-green-100 p-5 shadow-sm hover:shadow-md hover:bg-green-200 transition"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl leading-none">🎯</div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900">RETO CIUDADANO</div>
              <p className="mt-1 text-sm text-slate-900">
                Juego por niveles: Conocimiento general → Partido → Ruleta. Practica y vuelve a intentar con
                información verificable.
              </p>
              <div className="mt-3 inline-flex items-center text-sm font-extrabold text-slate-900 group-hover:underline">
                Abrir página →
              </div>
            </div>
          </div>
        </Link>
        {/* ✅ SMART LINK: Comentario Ciudadano (UI) */}
<Link
  href="/comentarios"
  onClick={(e) =>
    handleSmartNavigate({
      key: "comentarios",
      href: "/comentarios",
      speech:
        "Vas a entrar a Comentarios ciudadanos. Ahí puedes dejar tu opinión o sugerencia. Es anónimo y ayuda a mejorar la app.",
      preventDefault: true,
      e,
    })
  }
  className="group text-left w-full md:col-span-2 rounded-2xl border-[6px] border-red-600 bg-green-100 p-5 shadow-sm hover:shadow-md hover:bg-green-200 transition"
>
  <div className="flex items-start gap-3">
    <div className="text-2xl leading-none">💬</div>
    <div className="min-w-0">
      <div className="text-base font-extrabold text-slate-900">COMENTARIO CIUDADANO</div>
      <p className="mt-1 text-sm text-slate-900">
        Deja tu opinión o sugerencia para mejorar Voto Claro. (Se publica solo si es aprobado).
      </p>
      <div className="mt-3 inline-flex items-center text-sm font-extrabold text-slate-900 group-hover:underline">
        Abrir página →
      </div>
    </div>
  </div>
</Link>
      </section>

      <footer className="mt-6 text-xs text-slate-700">
        VOTO CLARO muestra información para ayudar a entender propuestas y antecedentes según documentos y fuentes. No
        reemplaza el criterio personal.
      </footer>
    </main>
  );
}

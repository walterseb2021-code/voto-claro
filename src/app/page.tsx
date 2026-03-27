// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SafeLink from "@/components/SafeLink";

type Candidate = {
  id: string;
  full_name: string;
  party_name: string;
  photo_url: string | null;
};

const PITCH_DONE_KEY = "votoclaro_pitch_done_v1";
const BASE_NAV_DELAY_MS = 6500;
const MS_PER_WORD = 420;
const MIN_NAV_DELAY_MS = 9000;
const MAX_NAV_DELAY_MS = 22000;
const DOUBLE_CLICK_WINDOW_MS = 280;

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full border border-borderparty bg-primary-soft text-primary font-semibold">
      {children}
    </span>
  );
}

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

  const [allowHome, setAllowHome] = useState(false);
  const [activeParty, setActiveParty] = useState<"perufederal" | "app">("perufederal");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);
  const searchRef = useRef<HTMLElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

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

  function handleSmartNavigate(opts: {
    key: string;
    href: string;
    speech: string;
    preventDefault?: boolean;
    e?: React.MouseEvent;
  }) {
    const { key, href, speech, e, preventDefault } = opts;

    if (preventDefault && e) e.preventDefault();

    if (clickTimersRef.current[key]) {
      clearTimers(key);
      stopVoice();
      router.push(href);
      return;
    }

    clearTimers(key);

    clickTimersRef.current[key] = window.setTimeout(() => {
      clickTimersRef.current[key] = null;

      guideSay(speech);

      navTimersRef.current[key] = window.setTimeout(() => {
        navTimersRef.current[key] = null;
        router.push(href);
      }, estimateNavDelayMs(speech));
    }, DOUBLE_CLICK_WINDOW_MS);
  }

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return;
    const scrollAmount = carouselRef.current.clientWidth * 0.8;
    const newScrollLeft = carouselRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
    carouselRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });
  };

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);

      const resolveParty = () => {
        const partyFromUrl = sp.get("party");
        const partyFromStorage = localStorage.getItem("votoclaro_active_party_v1");
        return partyFromUrl === "app" || partyFromStorage === "app" ? "app" : "perufederal";
      };

      if (sp.get("fromPitch") === "1") {
        const nextParty = resolveParty();

        try {
          localStorage.setItem("votoclaro_active_party_v1", nextParty);
          sessionStorage.setItem("votoclaro_active_party_v1", nextParty);
        } catch {}

        setActiveParty(nextParty);

        sessionStorage.setItem(PITCH_DONE_KEY, "1");
        setAllowHome(true);

        router.replace("/");
        return;
      }

      const done = sessionStorage.getItem(PITCH_DONE_KEY) === "1";
      if (!done) {
        router.replace("/pitch");
        return;
      }

      try {
        const stored = localStorage.getItem("votoclaro_active_party_v1");
        setActiveParty(stored === "app" ? "app" : "perufederal");
      } catch {
        setActiveParty("perufederal");
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

  if (!allowHome) return null;

  const carouselBlocks = [
    { href: "/ciudadano/servicios", icon: "🗳️", title: "Servicios al ciudadano", description: "Consulta tu local de votación, verifica si eres miembro de mesa, revisa planes de gobierno, trámites oficiales y más.", key: "servicios", speech: "Vas a entrar a Servicios al ciudadano. Allí verás enlaces oficiales para consultar local de votación, miembro de mesa, multas y trámites electorales." },
    { href: "/reflexion", icon: "🧠", title: "Reflexionar antes de votar", description: "Preguntas y reflexiones para pensar cuál es la realidad actual del país, qué esperas del Estado, qué puedes aportar como ciudadano, qué atributos debería tener quien gobierne y más.", key: "reflexion", speech: "Vas a entrar a Reflexionar antes de votar. Allí encontrarás ejes como economía, salud, educación y seguridad, con preguntas y reflexiones para decidir mejor." },
    { href: activeParty === "app" ? "/cambio-app" : "/cambio-con-valentia", icon: activeParty === "app" ? "🔵" : "🔥", title: activeParty === "app" ? "ALIANZA PARA EL PROGRESO" : "UN CAMBIO CON VALENTÍA", description: activeParty === "app" ? "Explora la propuesta correspondiente al grupo APP." : "Propuesta del Partido Democrático Perú Federal.", key: activeParty === "app" ? "cambio-app" : "cambio", speech: activeParty === "app" ? "Vas a entrar a Alianza para el Progreso. Aquí encontrarás la propuesta correspondiente al grupo activo." : "Vas a entrar a Un cambio con valentía. Esta ventana muestra la propuesta del Partido Democrático Perú Federal." },
    { href: "/intencion-de-voto", icon: "📊", title: "INTENCIÓN DE VOTO", description: "Vista piloto (11 partidos + Nulo/Blanco) para explorar tendencias. Próximamente se incluirán todos los partidos.", key: "intencion", speech: "Vas a entrar a Intención de voto. Es una pantalla piloto con once partidos y nulo o blanco, para visualizar tendencias de forma simple. Recuerda: decide con información verificable." },
    { href: "/reto-ciudadano", icon: "🎯", title: "RETO CIUDADANO", description: "Juego por niveles: Conocimiento general → Partido → Ruleta. Practica y vuelve a intentar con información verificable.", key: "reto-ciudadano", speech: "Vas a entrar a Reto Ciudadano. Es un juego por niveles: conocimiento general, partido y ruleta. Puedes jugar en modo sin premio o con premio." },
    { href: "/comentarios", icon: "💬", title: "COMENTARIO CIUDADANO", description: "Deja tu opinión o sugerencia para mejorar Voto Claro. (Se publica solo si es aprobado).", key: "comentarios", speech: "Vas a entrar a Comentarios ciudadanos. Ahí puedes dejar tu opinión o sugerencia. Es anónimo y ayuda a mejorar la app." },
    { href: "/proyecto-ciudadano", icon: "🏘️", title: "PROYECTO CIUDADANO", description: "Presenta tu proyecto comunitario, forma un equipo y recibe apoyo vecinal. Los mejores proyectos son premiados.", key: "proyecto-ciudadano", speech: "Vas a entrar a Proyecto Ciudadano. Aquí puedes presentar proyectos para tu comunidad, formar un equipo y recibe apoyo vecinal. Los mejores proyectos serán premiados cada tres meses." },
    { href: "/espacio-emprendedor", icon: "💼", title: "ESPACIO EMPRENDEDOR APP", description: "Espacio exclusivo para afiliados a Alianza para el Progreso. Publica tu proyecto emprendedor y conecta con inversionistas.", key: "espacio-emprendedor", speech: "Vas a entrar a Espacio Emprendedor APP. Espacio exclusivo para afiliados a Alianza para el Progreso donde puedes publicar proyectos emprendedores y conectar con inversionistas." },
  ];

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* HERO */}
      <div className="vc-block vc-fade-up">
        <section className="vc-block-inner overflow-hidden shadow-sm">
          <div className="p-6 md:p-8">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-black">
              VOTO CLARO
            </h1>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Pill>Asistente AI • modo guía</Pill>
              <Pill>Sin inventar</Pill>
              <Pill>Con evidencia</Pill>
            </div>

            <p className="mt-3 text-base md:text-lg font-extrabold text-black">
              Información clara para decidir mejor.
            </p>
            <p className="mt-1 text-sm md:text-base text-black">
              El Asistente te guía paso a paso por documentos, fuentes y comparaciones.
            </p>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() =>
                  goToSearchAndGuide(
                    "Paso 1: Busca. Escribe al menos 2 letras del nombre del candidato que buscas y abre su ficha para ver Hoja de Vida, Plan de gobierno y actuar político."
                  )
                }
                className="text-left rounded-2xl border-[6px] border-borderparty bg-white p-4 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover vc-btn-pulse"
              >
                <div className="text-sm font-extrabold text-black">1) Busca</div>
                <div className="mt-1 text-xs text-black">
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
                className="text-left rounded-2xl border-[6px] border-borderparty bg-white p-4 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover vc-btn-pulse"
              >
                <div className="text-sm font-extrabold text-black">2) Verifica</div>
                <div className="mt-1 text-xs text-black">
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
                className="text-left rounded-2xl border-[6px] border-borderparty bg-white p-4 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover vc-btn-pulse"
              >
                <div className="text-sm font-extrabold text-black">3) Decide</div>
                <div className="mt-1 text-xs text-black">
                  Elige con criterio: coherencia, viabilidad y conducta pública.
                </div>
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  goToSearchAndGuide(
                    "Vamos a empezar. Escribe el nombre del candidato y entra a su ficha. Luego cambia entre HV, Plan y Actuar político."
                  )
                }
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 border-2 border-borderparty bg-primary-soft text-black font-extrabold text-sm hover:brightness-95 shadow-md hover:shadow-lg transition vc-btn-wave vc-btn-pulse"
              >
                🔎 Empezar búsqueda
              </button>

              <button
                type="button"
                onClick={(e) =>
                  handleSmartNavigate({
                    key: "como-funciona",
                    href: "/como-funciona",
                    speech: "Vamos a la sección Cómo funciona. Ahí te explicaré paso a paso cómo usar VOTO CLARO.",
                    preventDefault: true,
                    e,
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-borderparty bg-primary text-white font-extrabold text-sm hover:brightness-95 shadow-sm transition vc-btn-wave vc-btn-pulse"
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
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border-2 border-borderparty bg-white text-black font-semibold hover:brightness-95 transition vc-btn-wave vc-btn-pulse"
              >
                “Un voto responsable empieza con información verificable.”
              </button>
            </div>

            <div className="mt-4 text-[11px] text-black">
              Tip: <b>1 clic</b> explica, <b>2 clics</b> entra directo.
            </div>
          </div>
        </section>
      </div>

      {/* BUSCADOR */}
      <div className="vc-block mt-6 vc-fade-up">
        <section id="buscar" className="vc-block-inner p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="inline-block rounded-lg bg-white px-3 py-1 text-lg font-extrabold text-black border-2 border-borderparty">
                Buscar candidato
              </h2>
              <p className="text-sm text-black mt-1">
                Escribe al menos 2 letras del candidato que buscas. Abre la ficha para consultar Hoja de Vida (HV),
                Plan de Gobierno y Actuar Político.
              </p>
            </div>
            <div className="text-xs text-black border-2 border-borderparty rounded-full px-3 py-1 bg-white">
              Reglas: sin vida privada • con fuentes • sin inventar
            </div>
          </div>

          <div className="mt-4">
            <input
              className="w-full border-2 border-borderparty rounded-xl px-4 py-3 bg-white text-black font-semibold placeholder:text-black focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Escribe: 'Armando Massé', 'César Acuña', 'López Aliaga', 'Keiko Fujimori'..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {loading && <div className="text-sm mt-2 text-black">Buscando...</div>}
          </div>

          <div className="mt-5 grid gap-3">
            {items.map((c) => (
              <SafeLink
                key={c.id}
                href={`/candidate/${c.id}`}
                className="border-2 border-borderparty rounded-xl p-4 flex gap-4 bg-white hover:brightness-95 hover:shadow-sm transition vc-card-hover"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-primary-soft shrink-0 border border-borderparty">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt={c.full_name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold truncate text-black">{c.full_name}</div>
                  <div className="text-sm font-semibold truncate text-black">{c.party_name}</div>
                </div>
              </SafeLink>
            ))}
          </div>

          {!items.length && q.trim().length >= 2 && !loading ? (
            <div className="mt-6 text-sm text-black">
              Sin resultados. Revisa que tu lista de candidatos esté cargada en{" "}
              <code className="px-1">/api/candidates/search</code>.
            </div>
          ) : null}
        </section>
      </div>

      {/* CARRUSEL HORIZONTAL */}
      <div className="mt-6 relative">
        {/* Botones de navegación */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 hidden md:block">
          <button
            onClick={() => scrollCarousel('left')}
            className="w-10 h-10 rounded-full bg-white shadow-md border-2 border-red-500 flex items-center justify-center hover:bg-gray-100 transition vc-btn-wave"
            aria-label="Anterior"
          >
            ◀
          </button>
        </div>
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 hidden md:block">
          <button
            onClick={() => scrollCarousel('right')}
            className="w-10 h-10 rounded-full bg-white shadow-md border-2 border-red-500 flex items-center justify-center hover:bg-gray-100 transition vc-btn-wave"
            aria-label="Siguiente"
          >
            ▶
          </button>
        </div>

        {/* Contenedor del carrusel */}
        <div
          ref={carouselRef}
          className="flex overflow-x-auto scroll-smooth snap-x snap-mandatory gap-4 pb-4"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {carouselBlocks.map((block, index) => (
            <div
              key={block.key}
              className="flex-shrink-0 w-[280px] md:w-[320px] snap-start vc-fade-up"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <SafeLink
                href={block.href}
                onClick={(e) =>
                  handleSmartNavigate({
                    key: block.key,
                    href: block.href,
                    speech: block.speech,
                    preventDefault: true,
                    e,
                  })
                }
                className="vc-block-inner block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover h-full"
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl leading-none vc-icon-hover">{block.icon}</div>
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-black">{block.title}</div>
                    <p className="mt-1 text-sm text-black line-clamp-3">{block.description}</p>
                    <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                      Abrir →
                    </div>
                  </div>
                </div>
              </SafeLink>
            </div>
          ))}
        </div>

        {/* Indicador de scroll */}
        <div className="flex justify-center gap-2 mt-4 md:hidden">
          {carouselBlocks.map((_, idx) => (
            <div key={idx} className="w-2 h-2 rounded-full bg-gray-300" />
          ))}
        </div>
      </div>

      <footer className="mt-6 text-xs text-black">
        VOTO CLARO muestra información para ayudar a entender propuestas y antecedentes según documentos y fuentes. No
        reemplaza el criterio personal.
      </footer>
    </main>
  );
}
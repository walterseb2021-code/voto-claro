// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SafeLink from "@/components/SafeLink"; // ✅ importamos SafeLink
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

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
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [allowHome, setAllowHome] = useState(false);
  const [activeParty, setActiveParty] = useState<"perufederal" | "app">("perufederal");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);
  const searchRef = useRef<HTMLElement | null>(null);

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
  
  useEffect(() => {
    if (!allowHome) return;

    setPageContext({
      pageId: "inicio",
      pageTitle: "Inicio",
      route: "/",
      summary:
        "Pantalla principal de Voto Claro donde puedes informarte, participar y explorar las distintas experiencias de la plataforma.",
      speakableSummary:
        "Estás en la pantalla principal de Voto Claro. Desde aquí puedes informarte, participar o explorar distintas experiencias dentro de la plataforma. Puedo ayudarte a encontrar por dónde empezar.",
      activeSection: "inicio-principal",
      visibleText: [
        "Pantalla principal de Voto Claro.",
        "Aquí puedes buscar candidatos y revisar Hoja de Vida, Plan de Gobierno y Actuar Político.",
        "También puedes acceder a Servicios al ciudadano, Reflexionar antes de votar, Intención de voto, Comentario ciudadano, Proyecto ciudadano, Espacio emprendedor, Reto Ciudadano y Solo para ganadores.",
        "El asistente puede orientar al usuario según si quiere informarse, participar, comparar, reflexionar o aprender jugando.",
      ].join("\n"),
      availableActions: [
        "Buscar candidatos",
        "Abrir Cómo funciona",
        "Entrar a Servicios al ciudadano",
        "Entrar a Reflexionar antes de votar",
        "Entrar a Intención de voto",
        "Entrar a Comentario ciudadano",
        "Entrar a Proyecto ciudadano",
        "Entrar a Espacio emprendedor",
        "Entrar a Reto Ciudadano",
        "Entrar a Solo para ganadores",
      ],
      suggestedPrompts: [
  {
    id: "inicio-1",
    label: "Quiero informarme",
    question: "Quiero informarme sobre candidatos y propuestas. ¿Por dónde empiezo?",
  },
  {
    id: "inicio-2",
    label: "Quiero participar",
    question: "Quiero participar activamente dentro de Voto Claro. ¿Qué opciones tengo?",
  },
  {
    id: "inicio-3",
    label: "Decidir mejor",
    question: "¿Cómo puedo usar Voto Claro para tomar una mejor decisión de voto?",
  },
  {
    id: "inicio-4",
    label: "Proponer ideas",
    question: "Tengo una idea o propuesta ciudadana. ¿Qué ventana debo abrir?",
  },
  {
    id: "inicio-5",
    label: "Aprender jugando",
    question: "Quiero aprender o participar jugando. ¿Dónde debo entrar?",
  },
  {
    id: "inicio-6",
    label: "Ver espacios",
    question: "Explícame brevemente qué espacios tiene Voto Claro y para qué sirve cada uno.",
  },
],
      selectedItemTitle: "Inicio de Voto Claro",
      status: "ready",
      dynamicData: {
        activeParty,
        canSearch,
        searchTerm: q,
        resultadosCandidatosCount: items.length,
        loadingCandidates: loading,
        ventanasDisponibles: [
          "Buscar candidatos",
          "Servicios al ciudadano",
          "Reflexionar antes de votar",
          "Intención de voto",
          "Comentario ciudadano",
          "Proyecto ciudadano",
          "Espacio emprendedor",
          "Reto Ciudadano",
          "Solo para ganadores",
        ],
      },
    });

    return () => {
      clearPageContext();
    };
  }, [
    allowHome,
    activeParty,
    canSearch,
    q,
    items.length,
    loading,
    setPageContext,
    clearPageContext,
  ]);

  if (!allowHome) return null;

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* HERO - con margen inferior agregado */}
        <div className="vc-block vc-fade-up mb-0">
  <section className="vc-block-inner vc-hero-white overflow-hidden shadow-sm">
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

                  <div className="mt-4 text-[11px] text-black mb-2">
                   Tip: <b>1 clic</b> explica, <b>2 clics</b> entra directo.
               </div>
          </div>
        </section>
      </div>

      {/* BUSCADOR - con margen superior aumentado */}
      <div className="vc-block mt-8 vc-fade-up">
         <section id="buscar" className="vc-block-inner bg-primary-soft p-6 shadow-sm">
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
              className="
                w-full
                border-2 border-borderparty
                rounded-xl
                px-4 py-3
                bg-white
                text-black
                font-semibold
                placeholder:text-black
                focus:outline-none
                focus:ring-2
                focus:ring-accent
              "
              placeholder="Escribe: 'Armando Massé', 'César Acuña', 'López Aliaga', 'Keiko Fujimori'..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            {loading && <div className="text-sm mt-2 text-black">Buscando...</div>}
          </div>

          {/* Tarjetas de candidatos - REDUCIDAS */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((c) => (
              <SafeLink
                key={c.id}
                href={`/candidate/${c.id}`}
                className="border-2 border-borderparty rounded-xl p-3 flex gap-3 bg-white hover:brightness-95 hover:shadow-sm transition vc-card-hover"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-primary-soft shrink-0 border border-borderparty">
                  {c.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo_url} alt={c.full_name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-black text-sm truncate">{c.full_name}</div>
                  <div className="text-xs font-semibold text-black truncate">{c.party_name}</div>
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

      {/* ACCESOS RÁPIDOS - SIN CAMBIOS */}
      <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="vc-block vc-fade-up vc-delay-1">
          <SafeLink
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
            className="vc-block-inner block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none vc-icon-hover">🗳️</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-black">Servicios al ciudadano</div>
                <p className="mt-1 text-sm text-black">
                  Consulta tu local de votación, verifica si eres miembro de mesa, revisa planes de gobierno, trámites
                  oficiales y más.
                </p>
                <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                  Abrir servicios →
                </div>
              </div>
            </div>
          </SafeLink>
        </div>

        <div className="vc-block md:col-span-2 vc-fade-up vc-delay-2">
          <SafeLink
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
            className="vc-block-inner bg-primary-soft block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none vc-icon-hover">🧠</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-black">Reflexionar antes de votar</div>
                <p className="mt-1 text-sm text-black">
                  Preguntas y reflexiones para pensar cuál es la realidad actual del país, qué esperas del Estado, qué
                  puedes aportar como ciudadano, qué atributos debería tener quien gobierne y más.
                </p>
                <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                  Abrir reflexiones →
                </div>
              </div>
            </div>
          </SafeLink>
        </div>

        {activeParty === "app" ? (
          <div className="vc-block md:col-span-2 vc-fade-up vc-delay-3">
            <SafeLink
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
              className="vc-block-inner block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl leading-none vc-icon-hover">🔵</div>
                <div className="min-w-0">
                  <div className="text-base font-extrabold text-black">ALIANZA PARA EL PROGRESO</div>
                  <p className="mt-1 text-sm text-black">Explora la propuesta correspondiente al grupo APP.</p>
                  <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                    Abrir página →
                  </div>
                </div>
              </div>
            </SafeLink>
          </div>
        ) : (
          <div className="vc-block md:col-span-2 vc-fade-up vc-delay-3">
            <SafeLink
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
              className="vc-block-inner block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl leading-none vc-icon-hover">🔥</div>
                <div className="min-w-0">
                  <div className="text-base font-extrabold text-black">UN CAMBIO CON VALENTÍA</div>
                  <p className="mt-1 text-sm text-black">Propuesta del Partido Democrático Perú Federal.</p>
                  <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                    Abrir página →
                  </div>
                </div>
              </div>
            </SafeLink>
          </div>
        )}

        <div className="vc-block md:col-span-2 vc-fade-up vc-delay-4">
          <SafeLink
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
            className="vc-block-inner bg-primary-soft block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none vc-icon-hover">📊</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-black">INTENCIÓN DE VOTO</div>
                <p className="mt-1 text-sm text-black">
                  Vista piloto (11 partidos + Nulo/Blanco) para explorar tendencias. Próximamente se incluirán todos los
                  partidos.
                </p>
                <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                  Abrir página →
                </div>
              </div>
            </div>
          </SafeLink>
        </div>

        <div className="vc-block md:col-span-2 vc-fade-up vc-delay-5">
          <SafeLink
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
            className="vc-block-inner block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none vc-icon-hover">🎯</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-black">RETO CIUDADANO</div>
                <p className="mt-1 text-sm text-black">
                  Juego por niveles: Conocimiento general → Partido → Ruleta. Practica y vuelve a intentar con
                  información verificable.
                </p>
                <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                  Abrir página →
                </div>
              </div>
            </div>
          </SafeLink>
        </div>
         
         <div className="vc-block md:col-span-2 vc-fade-up vc-delay-1">
          <SafeLink
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
            className="vc-block-inner bg-primary-soft block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none vc-icon-hover">💬</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-black">COMENTARIO CIUDADANO</div>
                <p className="mt-1 text-sm text-black">
                  Deja tu opinión o sugerencia para mejorar Voto Claro. (Se publica solo si es aprobado).
                </p>
                <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                  Abrir página →
                </div>
              </div>
            </div>
          </SafeLink>
        </div>

        <div className="vc-block md:col-span-2 vc-fade-up vc-delay-2">
          <SafeLink
            href="/proyecto-ciudadano"
            onClick={(e) =>
              handleSmartNavigate({
                key: "proyecto-ciudadano",
                href: "/proyecto-ciudadano",
                speech:
                  "Vas a entrar a Proyecto Ciudadano. Aquí puedes presentar proyectos para tu comunidad, formar un equipo y recibe apoyo vecinal. Los mejores proyectos serán premiados cada tres meses.",
                preventDefault: true,
                e,
              })
            }
            className="vc-block-inner block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none vc-icon-hover">🏘️</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-black">PROYECTO CIUDADANO</div>
                <p className="mt-1 text-sm text-black">
                  Presenta tu proyecto comunitario, forma un equipo y recibe apoyo vecinal. Los mejores proyectos son premiados.
                </p>
                <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                  Abrir página →
                </div>
              </div>
            </div>
          </SafeLink>
        </div>

        <div className="vc-block md:col-span-2 vc-fade-up vc-delay-3">
          <SafeLink
            href="/espacio-emprendedor"
            onClick={(e) =>
              handleSmartNavigate({
                key: "espacio-emprendedor",
                href: "/espacio-emprendedor",
                speech:
                  "Vas a entrar a Espacio Emprendedor APP. Espacio exclusivo para afiliados a Alianza para el Progreso donde puedes publicar proyectos emprendedores y conectar con inversionistas.",
                preventDefault: true,
                e,
              })
            }
            className="vc-block-inner bg-primary-soft block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none vc-icon-hover">💼</div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-black">ESPACIO EMPRENDEDOR APP</div>
                <p className="mt-1 text-sm text-black">
                  Espacio exclusivo para afiliados a Alianza para el Progreso. Publica tu proyecto emprendedor y conecta con inversionistas.
                </p>
                <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
                  Abrir espacio →
                </div>
              </div>
            </div>
          </SafeLink>
        </div>
                       <div className="vc-block md:col-span-2 vc-fade-up vc-delay-5">
  <SafeLink
    href="/solo-para-ganadores"
    onClick={(e) =>
      handleSmartNavigate({
        key: "solo-para-ganadores",
        href: "/solo-para-ganadores",
        speech:
          "Vitrina final de resultados: ganadores, entrega de premios, fotos, videos, entrevistas y reconocimientos de Voto Claro.",
        preventDefault: true,
        e,
      })
    }
     className="vc-block-inner block p-5 shadow-sm hover:shadow-md hover:brightness-95 transition vc-card-hover"
  >
    <div className="flex items-start gap-3">
      <div className="text-2xl leading-none vc-icon-hover">🏆</div>
      <div className="min-w-0">
        <div className="text-base font-extrabold text-black">SOLO PARA GANADORES</div>
        <p className="mt-1 text-sm text-black">
          Vitrina pública de ganadores, entrega de premios, fotos, videos, entrevistas y reconocimientos de Voto Claro.
        </p>
        <div className="mt-3 inline-flex items-center text-sm font-extrabold text-primary">
          Abrir ventana →
        </div>
      </div>
    </div>
  </SafeLink>
</div>

      </section>

      <footer className="mt-6 text-xs text-black">
        VOTO CLARO muestra información para ayudar a entender propuestas y antecedentes según documentos y fuentes. No
        reemplaza el criterio personal.
      </footer>
    </main>
  );
}
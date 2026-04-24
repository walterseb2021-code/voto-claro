// src/app/solo-para-ganadores/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

type SoloGanadoresEvent = {
  id: string;
  title: string;
  semester: string | null;
  event_date: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  recognitions: string | null;
  main_image_url: string | null;
  promo_video_url: string | null;
  status: string;
  published: boolean;
  featured: boolean;
  created_at: string;
};

type SoloGanadoresPost = {
  id: string;
  source_module: string;
  source_winner_id: string | null;
  winner_name: string | null;
  winner_alias: string | null;
  title: string;
  prize_name: string | null;
  description: string | null;
  photo_url: string | null;
  video_url: string | null;
  interview_url: string | null;
  event_date: string | null;
  published: boolean;
  featured: boolean;
  created_at: string;
};

type SoloGanadoresMedia = {
  id: string;
  title: string;
  media_type: string;
  media_url: string;
  description: string | null;
  related_winner_id: string | null;
  published: boolean;
  featured: boolean;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return "Fecha por confirmar";

  try {
    return new Date(value).toLocaleDateString("es-PE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function sourceLabel(source: string) {
  const key = String(source || "").trim();

  if (key === "reto_ciudadano") return "Reto Ciudadano";
  if (key === "comentarios_ciudadanos") return "Comentarios Ciudadanos";
  if (key === "proyecto_ciudadano") return "Proyecto Ciudadano";
  if (key === "espacio_emprendedor") return "Espacio Emprendedor";
  if (key === "intencion_de_voto") return "Intención de voto";

  return "Voto Claro";
}

function isVideoUrl(url: string) {
  const u = String(url || "").toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov");
}

export default function SoloParaGanadoresPage() {
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [events, setEvents] = useState<SoloGanadoresEvent[]>([]);
  const [posts, setPosts] = useState<SoloGanadoresPost[]>([]);
  const [media, setMedia] = useState<SoloGanadoresMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const featuredEvent = events.find((e) => e.featured) || events[0] || null;
  const featuredPosts = posts.filter((p) => p.featured).length
    ? posts.filter((p) => p.featured)
    : posts.slice(0, 3);

  const featuredMedia = media.filter((m) => m.featured).length
    ? media.filter((m) => m.featured)
    : media.slice(0, 6);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      setLoading(true);
      setLoadError("");

      try {
        const [eventsRes, postsRes, mediaRes] = await Promise.all([
          supabase
            .from("solo_ganadores_events")
            .select("*")
            .eq("published", true)
            .order("featured", { ascending: false })
            .order("created_at", { ascending: false }),

          supabase
            .from("solo_ganadores_posts")
            .select("*")
            .eq("published", true)
            .order("featured", { ascending: false })
            .order("created_at", { ascending: false }),

          supabase
            .from("solo_ganadores_media")
            .select("*")
            .eq("published", true)
            .order("featured", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

        if (eventsRes.error) throw eventsRes.error;
        if (postsRes.error) throw postsRes.error;
        if (mediaRes.error) throw mediaRes.error;

        if (!alive) return;

        setEvents((eventsRes.data || []) as SoloGanadoresEvent[]);
        setPosts((postsRes.data || []) as SoloGanadoresPost[]);
        setMedia((mediaRes.data || []) as SoloGanadoresMedia[]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        if (alive) setLoadError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();

    return () => {
      alive = false;
    };
  }, [supabase]);

  useEffect(() => {
    setPageContext({
      pageId: "solo-para-ganadores",
      pageTitle: "Solo para ganadores",
      route: "/solo-para-ganadores",
      summary:
        "Ventana pública de reconocimiento a los ganadores de Voto Claro, con información sobre premios, eventos, fotos, videos, entrevistas y entregas.",
      speakableSummary:
        "Estás en Solo para ganadores. Esta ventana reúne reconocimientos, ganadores, eventos, fotos, videos, entrevistas y entregas de premios dentro de Voto Claro.",
      activeSection: "vitrina-ganadores",
      visibleText: [
        "Pantalla pública Solo para ganadores.",
        "Aquí se muestran ganadores de las distintas dinámicas de Voto Claro.",
        "También se presentan fotos, videos, entrevistas, reconocimientos y detalles del evento del semestre.",
        featuredEvent
          ? `Evento destacado visible: ${featuredEvent.title}.`
          : "No hay evento destacado visible todavía.",
        `Ganadores publicados visibles: ${posts.length}.`,
        `Elementos de galería visibles: ${media.length}.`,
      ].join("\n"),
      availableActions: [
        "Ver ganadores destacados",
        "Ver evento del semestre",
        "Ver galería de fotos",
        "Ver videos y entrevistas",
        "Volver al inicio",
      ],
      suggestedPrompts: [
        {
          id: "ganadores-1",
          label: "¿Qué es esto?",
          question: "¿Qué es la ventana Solo para ganadores?",
        },
        {
          id: "ganadores-2",
          label: "Ganadores",
          question: "¿Qué ganadores aparecen en esta ventana?",
        },
        {
          id: "ganadores-3",
          label: "Evento",
          question: "¿Qué información hay sobre el evento del semestre?",
        },
        {
          id: "ganadores-4",
          label: "Galería",
          question: "¿Qué fotos, videos o entrevistas puedo ver aquí?",
        },
        {
          id: "ganadores-5",
          label: "Transparencia",
          question: "¿Por qué esta ventana ayuda a dar transparencia a los premios?",
        },
      ],
      selectedItemTitle: "Solo para ganadores",
      status: loading ? "loading" : "ready",
      dynamicData: {
        moduloPublico: true,
        loading,
        loadError,
        eventosPublicadosCount: events.length,
        ganadoresPublicadosCount: posts.length,
        mediaPublicadaCount: media.length,
        eventoDestacadoTitulo: featuredEvent?.title || "",
        contieneGanadores: posts.length > 0,
        contieneEventoSemestre: events.length > 0,
        contieneGaleria: media.length > 0,
        contieneVideosEntrevistas: media.some((m) =>
          ["video", "entrevista"].includes(String(m.media_type || "").toLowerCase())
        ),
      },
    });

    return () => {
      clearPageContext();
    };
  }, [
    setPageContext,
    clearPageContext,
    loading,
    loadError,
    events.length,
    posts.length,
    media.length,
    featuredEvent?.title,
  ]);

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/90 p-4";
  const card = "rounded-2xl border-2 border-red-600 bg-white/90 p-5 shadow-sm";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm";

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-slate-900">
            SOLO PARA GANADORES
          </h1>
          <p className="mt-2 text-sm md:text-base font-semibold text-slate-700 max-w-3xl">
            Una vitrina pública para reconocer a los ciudadanos que participaron,
            destacaron y recibieron premios dentro de Voto Claro.
          </p>
        </div>

        <Link href="/" className={btn}>
          ← Volver al inicio
        </Link>
      </div>

      {loading ? (
        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">
              Cargando información…
            </div>
            <p className="mt-2 text-sm text-slate-700">
              Estamos consultando ganadores, evento del semestre y galería pública.
            </p>
          </div>
        </section>
      ) : null}

      {loadError ? (
        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-red-700">
              No se pudo cargar la información.
            </div>
            <p className="mt-2 text-sm text-slate-700">{loadError}</p>
          </div>
        </section>
      ) : null}

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            <div className={card}>
              <div className="text-xl font-extrabold text-slate-900">
                🏆 Reconocimiento público
              </div>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Aquí se reúnen los ganadores de las distintas dinámicas de la
                plataforma: retos, comentarios ciudadanos, proyectos, iniciativas
                y otras actividades con premio.
              </p>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Cada reconocimiento busca mostrar una historia visible: quién participó,
                en qué dinámica destacó y qué premio recibió.
              </p>
            </div>

            <div className={card}>
              <div className="text-xl font-extrabold text-slate-900">
                🎥 Evidencia y memoria
              </div>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Esta ventana muestra fotos, videos, entrevistas, testimonios y momentos
                de entrega de premios.
              </p>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                Así, los usuarios pueden ver el proceso de reconocimiento y el contenido
                relacionado con cada evento.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={sectionWrap + " mt-6"}>
        <div className={inner}>
          <div className="text-lg font-extrabold text-slate-900">
            🗓️ Evento del semestre
          </div>

          {featuredEvent ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  {featuredEvent.title}
                </h2>

                <div className="mt-2 text-sm font-semibold text-slate-700">
                  {featuredEvent.semester ? `Semestre: ${featuredEvent.semester}` : "Semestre por confirmar"}
                </div>

                <div className="mt-1 text-sm text-slate-700">
                  Fecha: {formatDate(featuredEvent.event_date)}
                </div>

                <div className="mt-1 text-sm text-slate-700">
                  Lugar: {featuredEvent.location_name || "Lugar por confirmar"}
                </div>

                <div className="mt-1 text-sm text-slate-700">
                  Ciudad: {featuredEvent.city || "Por confirmar"}
                </div>

                {featuredEvent.address ? (
                  <div className="mt-1 text-sm text-slate-700">
                    Dirección: {featuredEvent.address}
                  </div>
                ) : null}

                {featuredEvent.description ? (
                  <p className="mt-4 text-sm text-slate-700 leading-relaxed">
                    {featuredEvent.description}
                  </p>
                ) : null}

                {featuredEvent.recognitions ? (
                  <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
                    <b>Reconocimientos:</b>
                    <br />
                    {featuredEvent.recognitions}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-300 bg-slate-50 overflow-hidden min-h-[220px] flex items-center justify-center">
                {featuredEvent.promo_video_url ? (
                  isVideoUrl(featuredEvent.promo_video_url) ? (
                    <video
                      src={featuredEvent.promo_video_url}
                      controls
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <a
                      href={featuredEvent.promo_video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-5 text-sm font-extrabold text-green-800 underline"
                    >
                      Ver video promocional
                    </a>
                  )
                ) : featuredEvent.main_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={featuredEvent.main_image_url}
                    alt={featuredEvent.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="p-5 text-center text-sm text-slate-600">
                    Imagen o video del evento por publicar.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">
              Los detalles del evento serán publicados por la administración cuando se confirme la programación oficial. Aquí se mostrará el lugar, la fecha, los ambientes, reconocimientos, fotos, videos y entrevistas relacionadas con la entrega de premios.
            </p>
          )}
        </div>
      </section>

      <section className={sectionWrap + " mt-6"}>
        <div className={inner}>
          <div className="text-lg font-extrabold text-slate-900">
            🏅 Ganadores destacados
          </div>

          {featuredPosts.length ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {featuredPosts.map((post) => (
                <div key={post.id} className={card}>
                  <div className="rounded-xl bg-slate-100 border border-slate-300 overflow-hidden h-44 flex items-center justify-center">
                    {post.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.photo_url}
                        alt={post.title}
                        className="w-full h-full object-cover"
                      />
                    ) : post.video_url && isVideoUrl(post.video_url) ? (
                      <video src={post.video_url} controls className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-4xl">🏆</div>
                    )}
                  </div>

                  <div className="mt-3 text-xs font-extrabold text-green-800">
                    {sourceLabel(post.source_module)}
                  </div>

                  <div className="mt-1 text-base font-extrabold text-slate-900">
                    {post.title}
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-700">
                    {post.winner_alias || post.winner_name || "Ganador destacado"}
                  </div>

                  {post.prize_name ? (
                    <div className="mt-2 text-xs font-bold text-slate-700">
                      Premio: {post.prize_name}
                    </div>
                  ) : null}

                  <div className="mt-1 text-xs text-slate-600">
                    {formatDate(post.event_date)}
                  </div>

                  {post.description ? (
                    <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                      {post.description}
                    </p>
                  ) : null}

                  {post.video_url && !isVideoUrl(post.video_url) ? (
                    <a
                      href={post.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-xs font-extrabold text-green-800 underline"
                    >
                      Ver video
                    </a>
                  ) : null}

                  {post.interview_url ? (
                    <a
                      href={post.interview_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-xs font-extrabold text-green-800 underline"
                    >
                      Ver entrevista
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              Todavía no hay ganadores publicados. Cuando el administrador publique
              ganadores, aparecerán aquí.
            </p>
          )}
        </div>
      </section>

      <section className={sectionWrap + " mt-6"}>
        <div className={inner}>
          <div className="text-lg font-extrabold text-slate-900">
            📸 Galería pública
          </div>
          <p className="mt-2 text-sm text-slate-700 leading-relaxed">
            Fotos, videos, entrevistas, testimonios, ambientes del evento y registros
            de entrega de premios.
          </p>

          {featuredMedia.length ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {featuredMedia.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-300 bg-white overflow-hidden shadow-sm">
                  <div className="h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                    {isVideoUrl(item.media_url) || item.media_type === "video" ? (
                      <video src={item.media_url} controls className="w-full h-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.media_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="p-3">
                    <div className="text-xs font-extrabold text-green-800 uppercase">
                      {item.media_type}
                    </div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">
                      {item.title}
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-center">
                <div className="text-2xl">📷</div>
                <div className="mt-2 text-xs font-extrabold text-slate-900">Fotos</div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-center">
                <div className="text-2xl">🎥</div>
                <div className="mt-2 text-xs font-extrabold text-slate-900">Videos</div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-center">
                <div className="text-2xl">🎙️</div>
                <div className="mt-2 text-xs font-extrabold text-slate-900">Entrevistas</div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-center">
                <div className="text-2xl">🎖️</div>
                <div className="mt-2 text-xs font-extrabold text-slate-900">Reconocimientos</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="mt-6 text-xs text-slate-600 leading-relaxed">
        Esta ventana muestra información pública de reconocimiento, evidencia de premios
        y contenido relacionado con eventos de ganadores dentro de Voto Claro.
      </footer>
    </main>
  );
}
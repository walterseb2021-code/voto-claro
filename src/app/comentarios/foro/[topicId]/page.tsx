"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAssistantRuntime } from "@/components/assistant/AssistantRuntimeContext";

type ArchivedTopicRow = {
  id: string;
  topic: string;
  question: string;
  winner_video_entry_id: string | null;
  winner_votes: number | null;
  winner_published_at: string | null;
};

type ForumCommentRow = {
  id: string;
  created_at: string;
  message: string;
  forum_alias: string | null;
};

export default function TopicForumPage() {
  const router = useRouter();
  const params = useParams();
  const topicId = String(params?.topicId ?? "");
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const [topic, setTopic] = useState<ArchivedTopicRow | null>(null);
  const [comments, setComments] = useState<ForumCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [forumAlias, setForumAlias] = useState<string>("");
  const [forumMessage, setForumMessage] = useState("");
  const [sendingForumComment, setSendingForumComment] = useState(false);
  const [forumOkMsg, setForumOkMsg] = useState<string | null>(null);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/comentarios");
    }
  }
  function getOrCreateDeviceId() {
  if (typeof window === "undefined") return null;
  const key = "vc_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = "DEV-" + crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

  async function checkForumAccess(currentDeviceId: string) {
    try {
      const res = await fetch("/api/comments/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: currentDeviceId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.access?.id) {
        setHasAccess(false);
        setForumAlias("");
        return;
      }

      setHasAccess(true);
      setForumAlias(String(data.access.forum_alias ?? "").trim());
    } catch {
      setHasAccess(false);
      setForumAlias("");
    }
  }
  async function loadForum() {
    if (!topicId) {
      setErrorMsg("No se encontró el tema del foro.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/comments/forum-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", topic_id: topicId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.topic) {
        setErrorMsg("Este foro no existe o el tema aún no está archivado.");
        setTopic(null);
        setComments([]);
        return;
      }

      setTopic({
        id: data.topic.id,
        topic: data.topic.title ?? "",
        question: data.topic.question ?? "",
        winner_video_entry_id: null,
        winner_votes: null,
        winner_published_at: null,
      });
      setComments((data.comments ?? []) as ForumCommentRow[]);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setTopic(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }
  async function submitForumComment(e: React.FormEvent) {
  e.preventDefault();
  setForumOkMsg(null);
  setErrorMsg(null);

  if (!deviceId) {
    setErrorMsg("No se pudo identificar tu dispositivo.");
    return;
  }

  if (!hasAccess) {
    setErrorMsg("Primero debes registrarte como participante o iniciar sesion con tu codigo de acceso en Comentarios Ciudadanos.");
    return;
  }

  const text = forumMessage.trim();
  if (!text) {
    setErrorMsg("Escribe un comentario antes de publicarlo.");
    return;
  }

  setSendingForumComment(true);

  try {
    const res = await fetch("/api/comments/forum-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        topic_id: topicId,
        device_id: deviceId,
        message: text,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      if (data?.code === "LINKS_NOT_ALLOWED") {
        setErrorMsg("No se permiten enlaces en los comentarios del foro.");
      } else {
        setErrorMsg(data?.error ?? "No se pudo publicar el comentario.");
      }
      return;
    }

    setForumMessage("");
    setForumOkMsg("Tu comentario fue publicado en el foro.");
    await loadForum();
  } catch (e: any) {
    setErrorMsg(e?.message ?? String(e));
  } finally {
    setSendingForumComment(false);
  }
}
  useEffect(() => {
    void loadForum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);
   useEffect(() => {
  const currentDeviceId = getOrCreateDeviceId();
  setDeviceId(currentDeviceId);

  if (currentDeviceId) {
    void checkForumAccess(currentDeviceId);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
     useEffect(() => {
    const commentsCount = comments.length;
    const latestComment = comments[0] ?? null;

    const activeSection = loading
      ? "cargando-foro"
      : errorMsg
      ? "error-foro"
      : !hasAccess
      ? "acceso-foro"
      : "comentarios-foro";

    const activeViewId = loading
      ? `forum-loading-${topicId || "unknown"}`
      : errorMsg
      ? `forum-error-${topicId || "unknown"}`
      : !hasAccess
      ? `forum-access-required-${topicId || "unknown"}`
      : `forum-active-${topicId || "unknown"}`;

    const activeViewTitle = loading
      ? "Cargando foro"
      : errorMsg
      ? "Error del foro"
      : !hasAccess
      ? "Acceso requerido al foro"
      : topic?.topic
      ? `Foro activo: ${topic.topic}`
      : "Foro ciudadano activo";

    const visibleSections = [
      "cabecera-foro",
      topic ? "tema-archivado" : null,
      !hasAccess ? "acceso-foro" : null,
      hasAccess ? "formulario-comentario-foro" : null,
      "comentarios-del-foro",
    ].filter(Boolean) as string[];

    const summary = loading
      ? "Foro ciudadano en proceso de carga."
      : errorMsg
      ? "Foro ciudadano con un error visible."
      : !hasAccess
      ? "Foro ciudadano en modo observador. El usuario puede leer el debate, pero para participar primero debe haber completado el registro único del app y luego usar su mismo código de acceso si hace falta."
      : "Foro ciudadano con comentarios abiertos sobre un tema semanal archivado.";

    const speakableSummary = loading
      ? "Estamos entrando a un foro ciudadano y la pantalla está cargando el tema junto con los comentarios publicados."
      : errorMsg
      ? "Estamos en un foro ciudadano, pero esta pantalla muestra un error y no se pudo cargar correctamente el contenido."
      : !hasAccess
      ? `Estamos en un foro ciudadano abierto${
          topic?.topic ? ` sobre ${topic.topic}` : ""
        }. Aquí puedes leer el debate, pero para comentar primero debes haberte registrado una sola vez en la ficha general del app y luego usar tu mismo código de acceso.`
      : `Estamos en un foro ciudadano abierto${
          topic?.topic ? ` sobre ${topic.topic}` : ""
        }. Aquí puedes leer el debate, publicar tu comentario y aportar ideas útiles sobre este tema ya archivado.`;

    const visibleParts: string[] = [];
    visibleParts.push(`Vista activa: ${activeViewTitle}.`);

    if (topic?.topic) {
      visibleParts.push(`Tema del foro visible: ${topic.topic}.`);
    }

    if (topic?.question) {
      visibleParts.push(`Pregunta guía visible: ${topic.question}.`);
    }

      if (!hasAccess && !loading) {
  visibleParts.push("El usuario aún no tiene acceso habilitado para participar en este foro.");
  visibleParts.push("Para comentar aquí, primero debe registrarse una sola vez en la ficha general del app.");
  visibleParts.push("Después puede usar su mismo código de acceso para entrar también a esta sección.");
}

    if (hasAccess) {
      visibleParts.push(`Alias visible del foro: ${forumAlias || "Ciudadano"}.`);
      visibleParts.push("El formulario de comentario del foro está habilitado.");
    }

    visibleParts.push(`Comentarios visibles en el foro: ${commentsCount}.`);

    if (latestComment?.forum_alias) {
      visibleParts.push(`Último comentario visible de ${latestComment.forum_alias}.`);
    }

    if (latestComment?.message) {
      visibleParts.push(`Contenido visible del último comentario: ${latestComment.message}`);
    }

    if (forumOkMsg) {
      visibleParts.push(`Mensaje de éxito visible: ${forumOkMsg}`);
    }

    if (errorMsg) {
      visibleParts.push(`Mensaje de error visible: ${errorMsg}`);
    }

      const availableActions = !hasAccess
  ? [
      "Volver a comentarios",
      "Registrarme una sola vez en la ficha general si aún no tengo registro",
      "Ingresar con mi código si ya me registré antes",
    ]
  : ["Publicar comentario", "Volver a comentarios"];

          const suggestedPrompts = !hasAccess
      ? [
          {
            id: "foro-1",
            label: "¿De qué trata este foro?",
            question: "¿De qué trata este foro, qué tema se debate aquí y qué tipo de aportes se esperan?",
          },
          {
            id: "foro-2",
            label: "¿Cómo entro a participar?",
            question: "¿Qué debo hacer exactamente para poder participar en este foro ciudadano?",
          },
          {
            id: "foro-3",
            label: "¿Puedo solo leer?",
            question: "¿Puedo leer este foro aunque todavía no tenga una sesión activa como participante?",
          },
        ]
      : [
          {
            id: "foro-7",
            label: "¿Qué se debate aquí?",
            question: "¿Qué se debate en este foro y cómo conviene enfocar mi comentario?",
          },
          {
            id: "foro-8",
            label: "¿Qué reglas debo seguir?",
            question: "¿Qué reglas debo seguir para que mi comentario sea válido y útil en este foro?",
          },
          {
            id: "foro-9",
            label: "¿Cómo aportar mejor?",
            question: "¿Qué tipo de aporte ciudadano puede ayudarme a participar mejor y destacar en este foro?",
          },
          {
            id: "foro-10",
            label: "¿Cómo se eligen los mejores?",
            question: "¿Cómo se eligen los participantes más destacados de los foros ciudadanos al final de cada ciclo?",
          },
        ];

    const status = loading ? "loading" : errorMsg ? "error" : "ready";

    setPageContext({
      pageId: "comentarios-foro-ciudadano",
      pageTitle: topic?.topic ? `Foro: ${topic.topic}` : "Foro ciudadano abierto",
      route: `/comentarios/foro/${topicId}`,
      summary,
      speakableSummary,
      activeSection,
      activeViewId,
      activeViewTitle,
      breadcrumb: ["Comentarios Ciudadanos", "Foro ciudadano", topic?.topic || "Tema archivado"],
      visibleSections,
      suggestedPrompts,
      visibleText: visibleParts.join("\n"),
      availableActions,
      selectedItemId: topic?.id || undefined,
      selectedItemTitle: topic?.topic || undefined,
      status,
      dynamicData: {
        topicId,
        topicTitle: topic?.topic || "",
        topicQuestion: topic?.question || "",
        hasAccess,
        forumAlias,
        commentsCount,
        latestCommentAlias: latestComment?.forum_alias || "",
        latestCommentMessage: latestComment?.message || "",
        aliasPending: false,
        commentFormVisible: hasAccess,
      },
    });
  }, [
    setPageContext,
    topicId,
    loading,
    errorMsg,
    hasAccess,
    forumAlias,
    comments,
    forumOkMsg,
    topic,
  ]);

  useEffect(() => {
    return () => {
      clearPageContext();
    };
  }, [clearPageContext]);
  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const card = "mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-5 shadow-sm";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            Foro ciudadano abierto
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
            Debate abierto sobre un tema semanal ya cerrado.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
            <button
  type="button"
  onClick={() => router.push("/comentarios")}
  className={btn}
>
  ← Volver a comentarios
</button>
          <button type="button" onClick={goBack} className={btn}>
            ← Atrás
          </button>
        </div>
      </div>

      {loading ? (
        <section className={card}>
          <div className="text-sm font-semibold text-slate-700">Cargando foro...</div>
        </section>
      ) : null}

      {errorMsg ? (
        <section className={card}>
          <div className="text-sm font-bold text-red-700">{errorMsg}</div>
        </section>
      ) : null}

      {!loading && !errorMsg && topic ? (
        <>
          <section className={card}>
            <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
              Tema archivado
            </div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold text-slate-900">
              {topic.topic}
            </div>

            <div className="mt-4 text-xs font-extrabold text-slate-700 uppercase tracking-wide">
              Pregunta guía
            </div>
            <div className="mt-1 text-sm md:text-base font-semibold text-slate-800 leading-relaxed">
              {topic.question}
            </div>

            <div className="mt-4 text-xs font-semibold text-slate-600">
              Este foro permanece abierto para debate ciudadano.
            </div>
          </section>
            <section className={card}>
  <div className="text-sm font-extrabold text-slate-900">
    Participa en este foro
  </div>
  <div className="mt-1 text-xs text-slate-600">
    Los comentarios se publican automáticamente si cumplen las reglas del foro.
  </div>

  {forumOkMsg ? (
    <div className="mt-4 rounded-xl border-2 border-green-700 bg-white p-3 text-sm font-bold text-green-800">
      {forumOkMsg}
    </div>
  ) : null}

    {!hasAccess ? (
    <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4 text-sm font-semibold text-slate-700">
      Para participar en el foro, primero debes registrarte como participante o iniciar sesión con tu código de acceso en Comentarios Ciudadanos.
    </div>
  ) : (
    <form onSubmit={submitForumComment} className="grid gap-4 mt-4">
      <div className="rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
        Alias del foro: <span className="font-extrabold">{forumAlias || "Ciudadano"}</span>
      </div>

      <div>
        <div className="text-xs font-extrabold text-slate-700">Tu comentario</div>
        <textarea
          className="mt-2 w-full min-h-[140px] rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold"
          value={forumMessage}
          onChange={(e) => setForumMessage(e.target.value)}
          placeholder="Escribe tu comentario para este foro..."
          maxLength={500}
        />
        <div className="mt-1 text-xs text-slate-600">
          Máximo 500 caracteres.
        </div>
      </div>

      <button type="submit" className={btn} disabled={sendingForumComment}>
        {sendingForumComment ? "Publicando..." : "Publicar comentario"}
      </button>
    </form>
  )}
</section>
          <section className={card}>
            <div className="text-sm font-extrabold text-slate-900">
              Comentarios del foro
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Ordenados del mas antiguo al mas reciente.
            </div>

            {comments.length === 0 ? (
              <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4 text-sm font-semibold text-slate-700">
                Aún no hay comentarios en este foro.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {comments.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                  >
                    <div className="text-xs font-extrabold text-slate-900">
                      {item.forum_alias || "Ciudadano"} •{" "}
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                      {item.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

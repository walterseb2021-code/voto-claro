"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
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
  weekly_topic_id: string;
  access_participant_id: string;
  group_code: string;
  message: string;
  status: string;
  forum_alias: string | null;
};

export default function TopicForumPage() {
  const router = useRouter();
  const params = useParams();
  const topicId = String(params?.topicId ?? "");
  const { setPageContext, clearPageContext } = useAssistantRuntime();

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [topic, setTopic] = useState<ArchivedTopicRow | null>(null);
  const [comments, setComments] = useState<ForumCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [forumAlias, setForumAlias] = useState<string>("");
  const [forumAliasDraft, setForumAliasDraft] = useState<string>("");
  const [savingForumAlias, setSavingForumAlias] = useState(false);
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

function toSafeForumAlias(input: string | null | undefined) {
  const base = (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (base.length >= 3) return base.slice(0, 20);

  return `Usuario_${Math.random().toString(36).slice(2, 8)}`;
}
   
      async function checkForumAccess(currentDeviceId: string) {
  try {
    const { data: participantData, error: participantError } = await supabase
      .from("project_participants")
      .select("*")
      .eq("device_id", currentDeviceId)
      .maybeSingle();

    if (participantError) throw new Error(participantError.message);

    setParticipant(participantData ?? null);
    setHasAccess(!!participantData);

    if (!participantData) {
      setForumAlias("");
      setForumAliasDraft("");
      return;
    }

    const { data: commentAccessData, error: commentAccessError } = await supabase
      .from("comment_access_participants")
      .select("id, forum_alias")
      .eq("device_id", currentDeviceId)
      .limit(1)
      .maybeSingle();

    if (commentAccessError) throw new Error(commentAccessError.message);

    setForumAlias(commentAccessData?.forum_alias ?? toSafeForumAlias(participantData.alias) ?? "");
setForumAliasDraft(commentAccessData?.forum_alias ?? toSafeForumAlias(participantData.alias) ?? "");
  } catch {
    setParticipant(null);
    setHasAccess(false);
    setForumAlias("");
    setForumAliasDraft("");
  }
}
  async function ensureCommentAccessParticipant() {
    if (!deviceId) {
      throw new Error("No se pudo identificar tu dispositivo.");
    }

    if (!participant?.id) {
      throw new Error("Primero debes registrarte como participante.");
    }

    const { data: existingByDevice, error: existingByDeviceError } = await supabase
      .from("comment_access_participants")
      .select("id")
      .eq("device_id", deviceId)
      .limit(1)
      .maybeSingle();

    if (existingByDeviceError) {
      throw new Error(existingByDeviceError.message);
    }

    if (existingByDevice?.id) {
      return existingByDevice.id as string;
    }

    const participantEmail = (participant.email ?? "").trim();
    const participantPhone = (participant.phone ?? "").trim();

    if (participantEmail) {
      const { data: existingByEmail, error: existingByEmailError } = await supabase
        .from("comment_access_participants")
        .select("id")
        .eq("email", participantEmail)
        .limit(1)
        .maybeSingle();

      if (existingByEmailError) {
        throw new Error(existingByEmailError.message);
      }

      if (existingByEmail?.id) {
        const { error: updateError } = await supabase
          .from("comment_access_participants")
                    .update({
            device_id: deviceId,
            forum_alias: toSafeForumAlias(participant.alias),
            group_code: "GENERAL",
          })
          .eq("id", existingByEmail.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        return existingByEmail.id as string;
      }
    }

    if (participantPhone) {
      const { data: existingByPhone, error: existingByPhoneError } = await supabase
        .from("comment_access_participants")
        .select("id")
        .eq("celular", participantPhone)
        .limit(1)
        .maybeSingle();

      if (existingByPhoneError) {
        throw new Error(existingByPhoneError.message);
      }

      if (existingByPhone?.id) {
        const { error: updateError } = await supabase
          .from("comment_access_participants")
                    .update({
            device_id: deviceId,
            forum_alias: toSafeForumAlias(participant.alias),
            group_code: "GENERAL",
          })
          .eq("id", existingByPhone.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        return existingByPhone.id as string;
      }
    }

        const payload: any = {
      device_id: deviceId,
      group_code: "GENERAL",
      forum_alias: toSafeForumAlias(participant.alias),
    };

    if (participantEmail) payload.email = participantEmail;
    if (participantPhone) payload.celular = participantPhone;

    const { data: inserted, error: insertError } = await supabase
      .from("comment_access_participants")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    return inserted.id as string;
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
      const { data: topicData, error: topicError } = await supabase
        .from("weekly_topics")
        .select("id,topic,question,winner_video_entry_id,winner_votes,winner_published_at")
        .eq("id", topicId)
        .eq("status", "archived")
        .maybeSingle();

      if (topicError) throw new Error(topicError.message);

      if (!topicData) {
        setErrorMsg("Este foro no existe o el tema aún no está archivado.");
        setTopic(null);
        setComments([]);
        return;
      }

      setTopic(topicData as ArchivedTopicRow);

      const { data: forumRows, error: forumError } = await supabase
        .from("archived_topic_forum_comments")
        .select(
          "id,created_at,weekly_topic_id,access_participant_id,group_code,message,status"
        )
        .eq("weekly_topic_id", topicId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(100);

      if (forumError) throw new Error(forumError.message);

      const rows = (forumRows ?? []) as Omit<ForumCommentRow, "forum_alias">[];

      const participantIds = [...new Set(rows.map((x) => x.access_participant_id).filter(Boolean))];

      let aliasMap: Record<string, string | null> = {};

      if (participantIds.length > 0) {
        const { data: participantsData, error: participantsError } = await supabase
          .from("comment_access_participants")
          .select("id,forum_alias")
          .in("id", participantIds);

        if (participantsError) throw new Error(participantsError.message);

        aliasMap = Object.fromEntries(
          (participantsData ?? []).map((row: any) => [row.id, row.forum_alias ?? null])
        );
      }

      const normalized: ForumCommentRow[] = rows.map((row) => ({
        ...row,
        forum_alias: aliasMap[row.access_participant_id] ?? null,
      }));

      setComments(normalized);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setTopic(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }
    async function appendForumComment(newRow: {
  id: string;
  created_at: string;
  weekly_topic_id: string;
  access_participant_id: string;
  group_code: string;
  message: string;
  status: string;
}) {
  let alias: string | null = null;

  if (newRow.access_participant_id) {
    const { data } = await supabase
      .from("comment_access_participants")
      .select("forum_alias")
      .eq("id", newRow.access_participant_id)
      .maybeSingle();

    alias = data?.forum_alias ?? null;
  }

  setComments((prev) => {
    const exists = prev.some((item) => item.id === newRow.id);
    if (exists) return prev;

    return [
      {
        ...newRow,
        forum_alias: alias,
      },
      ...prev,
    ];
  });
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
    setErrorMsg("Primero debes registrarte como participante o iniciar sesión con tu código de acceso en Comentarios Ciudadanos.");
    return;
  }

  const text = forumMessage.trim();
  if (!text) {
    setErrorMsg("Escribe un comentario antes de publicarlo.");
    return;
  }

  setSendingForumComment(true);

  try {
    // 1️⃣ Obtener participant ID
          const accessParticipantId = await ensureCommentAccessParticipant();
    // 2️⃣ Verificar si el usuario puede comentar usando la función SQL
          const canCommentResult: any = await supabase
      .rpc('can_user_comment', { p_user_id: accessParticipantId })
      .maybeSingle();

    if (canCommentResult.error) throw new Error(canCommentResult.error.message);

    if (!canCommentResult.data?.can_comment) {
      setErrorMsg("No puedes comentar aún, espera un momento antes de publicar de nuevo.");
      return;
    }

    // 3️⃣ Preparar payload y enviar comentario
         const payload = {
      weekly_topic_id: topicId,
      access_participant_id: accessParticipantId,
      device_id: deviceId,
      group_code: "GENERAL",
      message: text,
      status: "published",
    };

    const { data: insertedData, error: insertError } = await supabase
      .from("archived_topic_forum_comments")
      .insert(payload)
      .select("id, created_at, weekly_topic_id, access_participant_id, group_code, message, status")
      .single();

    if (insertError) throw new Error(insertError.message);

    setForumMessage("");
    setForumOkMsg("Tu comentario fue publicado en el foro.");

    if (insertedData) {
      await appendForumComment(insertedData);
    }

  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();

    if (msg.includes("forum_flood_blocked")) {
      setErrorMsg("Espera unos segundos antes de volver a comentar.");
    } else if (msg.includes("forum_bad_words_blocked")) {
      setErrorMsg("Tu comentario contiene palabras no permitidas.");
    } else if (msg.includes("forum_daily_limit_reached")) {
      setErrorMsg("Ya alcanzaste el máximo diario de comentarios en el foro.");
    } else {
      setErrorMsg(e?.message ?? String(e));
    }
  } finally {
    setSendingForumComment(false);
  }
}
  async function saveForumAlias(e: React.FormEvent) {
  e.preventDefault();
  setForumOkMsg(null);
  setErrorMsg(null);

  if (!deviceId) {
    setErrorMsg("No se pudo identificar tu dispositivo.");
    return;
  }

  if (!hasAccess) {
    setErrorMsg("Primero debes registrarte como participante o iniciar sesión con tu código de acceso en Comentarios Ciudadanos.");
    return;
  }

    const alias = toSafeForumAlias(forumAliasDraft.trim());

  if (!alias) {
    setErrorMsg("Escribe un alias para participar en el foro.");
    return;
  }

  setSavingForumAlias(true);

  try {
          const accessParticipantId = await ensureCommentAccessParticipant();

    const { error } = await supabase
      .from("comment_access_participants")
      .update({ forum_alias: alias })
      .eq("id", accessParticipantId);

    if (error) throw new Error(error.message);

    setForumAlias(alias);
    setForumOkMsg("Tu alias del foro fue guardado correctamente.");
    await checkForumAccess(deviceId);
  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();

    if (msg.includes("forum_alias_invalid_length")) {
      setErrorMsg("Tu alias debe tener entre 3 y 20 caracteres.");
    } else if (msg.includes("forum_alias_invalid_characters")) {
      setErrorMsg("Tu alias solo puede usar letras, números y guion bajo.");
    } else if (msg.includes("forum_alias_bad_word")) {
      setErrorMsg("Tu alias contiene palabras no permitidas.");
    } else if (msg.includes("duplicate") || msg.includes("unique")) {
      setErrorMsg("Ese alias ya está en uso. Elige otro.");
    } else {
      setErrorMsg(e?.message ?? String(e));
    }
  } finally {
    setSavingForumAlias(false);
  }
}
  useEffect(() => {
    void loadForum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

    useEffect(() => {
  if (!topicId) return;

  const channel = supabase
    .channel(`forum-comments-${topicId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "archived_topic_forum_comments",
        filter: `weekly_topic_id=eq.${topicId}`,
      },
      async (payload) => {
        const newComment = payload.new as {
          id: string;
          created_at: string;
          weekly_topic_id: string;
          access_participant_id: string;
          group_code: string;
          message: string;
          status: string;
        };

        if (newComment.status !== "published") return;

        await appendForumComment(newComment);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [supabase, topicId]);
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
      : !forumAlias
      ? "configuracion-alias"
      : "comentarios-foro";

    const activeViewId = loading
      ? `forum-loading-${topicId || "unknown"}`
      : errorMsg
      ? `forum-error-${topicId || "unknown"}`
      : !hasAccess
      ? `forum-access-required-${topicId || "unknown"}`
      : !forumAlias
      ? `forum-alias-setup-${topicId || "unknown"}`
      : `forum-active-${topicId || "unknown"}`;

    const activeViewTitle = loading
      ? "Cargando foro"
      : errorMsg
      ? "Error del foro"
      : !hasAccess
      ? "Acceso requerido al foro"
      : !forumAlias
      ? "Configuración de alias del foro"
      : topic?.topic
      ? `Foro activo: ${topic.topic}`
      : "Foro ciudadano activo";

    const visibleSections = [
      "cabecera-foro",
      topic ? "tema-archivado" : null,
      !hasAccess ? "acceso-foro" : null,
      hasAccess && !forumAlias ? "alias-foro" : null,
      hasAccess && !!forumAlias ? "formulario-comentario-foro" : null,
      "comentarios-del-foro",
    ].filter(Boolean) as string[];

    const summary = loading
      ? "Foro ciudadano en proceso de carga."
      : errorMsg
      ? "Foro ciudadano con un error visible."
      : !hasAccess
      ? "Foro ciudadano en modo observador. El usuario puede leer el debate, pero para participar primero debe haber completado el registro único del app y luego usar su mismo código de acceso si hace falta."
      : !forumAlias
      ? "Foro ciudadano listo para configurar alias antes de participar."
      : "Foro ciudadano con comentarios abiertos sobre un tema semanal archivado.";

    const speakableSummary = loading
      ? "Estamos entrando a un foro ciudadano y la pantalla está cargando el tema junto con los comentarios publicados."
      : errorMsg
      ? "Estamos en un foro ciudadano, pero esta pantalla muestra un error y no se pudo cargar correctamente el contenido."
      : !hasAccess
      ? `Estamos en un foro ciudadano abierto${
          topic?.topic ? ` sobre ${topic.topic}` : ""
        }. Aquí puedes leer el debate, pero para comentar primero debes haberte registrado una sola vez en la ficha general del app y luego usar tu mismo código de acceso.`
      : !forumAlias
      ? `Estamos en un foro ciudadano abierto${
          topic?.topic ? ` sobre ${topic.topic}` : ""
        }. Ya tienes acceso para participar, pero antes debes confirmar tu alias del foro para que tus comentarios aparezcan publicados con ese nombre.`
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

    if (hasAccess && !forumAlias) {
      visibleParts.push("El usuario tiene acceso, pero aún debe confirmar o guardar un alias del foro.");
    }

    if (hasAccess && forumAlias) {
      visibleParts.push(`Alias visible del foro: ${forumAlias}.`);
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
  : !forumAlias
  ? ["Guardar alias", "Volver a comentarios"]
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
      : !forumAlias
      ? [
          {
            id: "foro-4",
            label: "¿Para qué sirve el alias?",
            question: "¿Para qué sirve el alias del foro y cómo aparecerá cuando publique un comentario?",
          },
          {
            id: "foro-5",
            label: "¿Qué reglas debo seguir?",
            question: "¿Qué reglas debo tener en cuenta antes de comentar en este foro ciudadano?",
          },
          {
            id: "foro-6",
            label: "¿Cómo puedo destacar?",
            question: "¿Qué tipo de aportes ayudan más a destacar en este foro ciudadano?",
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
        aliasPending: hasAccess && !forumAlias,
        commentFormVisible: hasAccess && !!forumAlias,
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
  ) : !forumAlias ? (
    <form onSubmit={saveForumAlias} className="grid gap-4 mt-4">
      <div>
        <div className="text-xs font-extrabold text-slate-700">Elige tu alias del foro</div>
        <input
          className="mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold"
          value={forumAliasDraft}
          onChange={(e) => setForumAliasDraft(e.target.value)}
          placeholder="Ej: Voz Ciudadana"
          maxLength={20}
        />
        <div className="mt-1 text-xs text-slate-600">
          Entre 3 y 20 caracteres. Solo letras, números y guion bajo.
        </div>
      </div>

      <button type="submit" className={btn} disabled={savingForumAlias}>
        {savingForumAlias ? "Guardando alias..." : "Guardar alias"}
      </button>
    </form>
  ) : (
    <form onSubmit={submitForumComment} className="grid gap-4 mt-4">
      <div className="rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
        Alias del foro: <span className="font-extrabold">{forumAlias}</span>
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
              Ordenados del más reciente al más antiguo.
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
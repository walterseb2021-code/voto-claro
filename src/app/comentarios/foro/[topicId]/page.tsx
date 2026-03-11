"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

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

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [topic, setTopic] = useState<ArchivedTopicRow | null>(null);
  const [comments, setComments] = useState<ForumCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/comentarios");
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

  useEffect(() => {
    void loadForum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

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
          <Link href="/comentarios" className={btn}>
            ← Volver a comentarios
          </Link>
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
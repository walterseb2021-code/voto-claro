"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type CommentRow = {
  id: string;
  created_at: string;
  group_code: string;
  device_id: string | null;
  page: string | null;
  message: string;
  status: "new" | "reviewed" | "archived" | "blocked";
};

type WeeklyTopicRow = {
  id: string;
  topic: string;
  question: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  winner_video_entry_id?: string | null;
  winner_votes?: number | null;
  winner_published_at?: string | null;
};

type VideoRow = {
  id: string;
  created_at: string;
  weekly_topic_id: string;
  device_id: string | null;
  group_code: string;
  platform: string;
  video_url: string;
  title: string | null;
  status: "new" | "reviewed" | "archived" | "blocked";
};

type FounderQuestionRow = {
  id: string;
  created_at: string;
  weekly_topic_id: string;
  weekly_video_entry_id: string;
  device_id: string | null;
  group_code: string;
  question_text: string;
  question_status: string;
  founder_answer_text: string | null;
  founder_answer_video_url: string | null;
  founder_answered_at: string | null;
  published: boolean;
};

type CommentAwardRow = {
  id: string;
  created_at: string;
  user_comment_id: string;
  device_id: string | null;
  group_code: string;
  award_year: number;
  award_quarter: number;
  award_title: string | null;
  award_note: string | null;
  contact_status: string;
  logistics_note: string | null;
  includes_companion: boolean;
  published: boolean;
  published_at: string | null;
};

export default function AdminCommentsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);

  const supabaseSessionClient = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("new");

  const [weeklyTopic, setWeeklyTopic] = useState<WeeklyTopicRow | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);
  const [runningRotation, setRunningRotation] = useState(false);
  const [rotationMsg, setRotationMsg] = useState<string | null>(null);
  const [rotationMsgType, setRotationMsgType] = useState<"success" | "error" | null>(null);

  const [videoItems, setVideoItems] = useState<VideoRow[]>([]);
  const [archivedTopics, setArchivedTopics] = useState<WeeklyTopicRow[]>([]);
  const [founderQuestions, setFounderQuestions] = useState<FounderQuestionRow[]>([]);
  const [commentAwards, setCommentAwards] = useState<CommentAwardRow[]>([]);

  const [founderAnswerDrafts, setFounderAnswerDrafts] = useState<
    Record<string, { text: string; videoUrl: string }>
  >({});
  const [founderQuestionSavingId, setFounderQuestionSavingId] = useState<string | null>(null);

  const [awardCommentId, setAwardCommentId] = useState("");
  const [awardYear, setAwardYear] = useState(String(new Date().getFullYear()));
  const [awardQuarter, setAwardQuarter] = useState("1");
  const [awardTitle, setAwardTitle] = useState("");
  const [awardNote, setAwardNote] = useState("");
  const [awardContactStatus, setAwardContactStatus] = useState("pending");
  const [awardLogisticsNote, setAwardLogisticsNote] = useState("");
  const [awardIncludesCompanion, setAwardIncludesCompanion] = useState(true);
  const [awardPublished, setAwardPublished] = useState(false);
  const [savingAward, setSavingAward] = useState(false);
  const [updatingAwardId, setUpdatingAwardId] = useState<string | null>(null);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/admin");
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabaseSessionClient.auth.getSession();
        if (!alive) return;

        if (!data?.session) {
          router.replace("/admin/login");
          return;
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadComments() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "200");

      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      const res = await fetch(`/api/admin/comments?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = json?.reason
          ? `No autorizado (${json.reason}).`
          : json?.detail
          ? json.detail
          : json?.error
          ? json.error
          : "Error desconocido.";
        throw new Error(msg);
      }

      const topic = (json?.weeklyTopic ?? null) as WeeklyTopicRow | null;
      setWeeklyTopic(topic);
      setTopicDraft(topic?.topic ?? "");
      setQuestionDraft(topic?.question ?? "");

      const archived = (json?.archivedTopics ?? []) as WeeklyTopicRow[];
      setArchivedTopics(archived);

      const videos = (json?.videoItems ?? []) as VideoRow[];
      setVideoItems(videos);

      const founderQ = (json?.founderQuestions ?? []) as FounderQuestionRow[];
      setFounderQuestions(founderQ);

      const awards = (json?.commentAwards ?? []) as CommentAwardRow[];
      setCommentAwards(awards);

      let list = (json?.items ?? []) as CommentRow[];

      if (groupFilter !== "ALL") {
        list = list.filter((x) => x.group_code === groupFilter);
      }

      setItems(list);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id: string, status: "reviewed" | "archived") {
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id, status }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = json?.reason
          ? `No autorizado (${json.reason}).`
          : json?.detail
          ? json.detail
          : json?.error
          ? json.error
          : "Error desconocido.";
        throw new Error(msg);
      }

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    }
  }

  async function setVideoStatus(id: string, status: "reviewed" | "archived") {
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id, status, target: "video" }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = json?.reason
          ? `No autorizado (${json.reason}).`
          : json?.detail
          ? json.detail
          : json?.error
          ? json.error
          : "Error desconocido.";
        throw new Error(msg);
      }

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    }
  }

  async function saveWeeklyTopic() {
    if (!weeklyTopic?.id) {
      setErrorMsg("No se encontró un tema activo para actualizar.");
      return;
    }

    const topic = topicDraft.trim();
    const question = questionDraft.trim();

    if (!topic) {
      setErrorMsg("Escribe el tema.");
      return;
    }

    if (!question) {
      setErrorMsg("Escribe la pregunta guía.");
      return;
    }

    setSavingTopic(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          id: weeklyTopic.id,
          topic,
          question,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = json?.reason
          ? `No autorizado (${json.reason}).`
          : json?.detail
          ? json.detail
          : json?.error
          ? json.error
          : "Error desconocido.";
        throw new Error(msg);
      }

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setSavingTopic(false);
    }
  }

  async function runWeeklyRotationNow() {
    setRunningRotation(true);
    setRotationMsg(null);
    setRotationMsgType(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "run_weekly_rotation",
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          json?.detail ??
          json?.error ??
          "No se pudo ejecutar la rotación semanal.";
        throw new Error(msg);
      }

      const msg = json?.activated
        ? `Rotación ejecutada ✔ Archivado: ${json.archived} → Activado: ${json.activated}`
        : json?.message ?? "Rotación ejecutada.";

      setRotationMsg(msg);
      setRotationMsgType("success");
      await loadComments();
    } catch (e: any) {
      setRotationMsg(e?.message ?? String(e));
      setRotationMsgType("error");
    } finally {
      setRunningRotation(false);
    }
  }

  async function answerFounderQuestion(id: string) {
    const draft = founderAnswerDrafts[id] ?? { text: "", videoUrl: "" };
    const founder_answer_text = draft.text.trim();
    const founder_answer_video_url = draft.videoUrl.trim();

    if (!founder_answer_text && !founder_answer_video_url) {
      setErrorMsg("Escribe una respuesta del fundador o pega un video.");
      return;
    }

    setFounderQuestionSavingId(id);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "answer_founder_question",
          id,
          founder_answer_text,
          founder_answer_video_url,
          published: true,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.detail ?? json?.error ?? "No se pudo guardar la respuesta.");
      }

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setFounderQuestionSavingId(null);
    }
  }

  async function toggleFounderQuestionPublish(id: string, published: boolean) {
    setFounderQuestionSavingId(id);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "set_founder_question_publish",
          id,
          published,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.detail ?? json?.error ?? "No se pudo actualizar la publicación.");
      }

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setFounderQuestionSavingId(null);
    }
  }

  async function createCommentAward() {
    const user_comment_id = awardCommentId.trim();
    const award_year = Number(awardYear);
    const award_quarter = Number(awardQuarter);

    if (!user_comment_id) {
      setErrorMsg("Escribe el ID del comentario ganador.");
      return;
    }

    if (!award_year) {
      setErrorMsg("Escribe el año del premio.");
      return;
    }

    if (![1, 2, 3, 4].includes(award_quarter)) {
      setErrorMsg("El trimestre debe ser 1, 2, 3 o 4.");
      return;
    }

    const matchedComment = items.find((x) => x.id === user_comment_id);

    setSavingAward(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "create_comment_award",
          user_comment_id,
          device_id: matchedComment?.device_id ?? null,
          group_code: matchedComment?.group_code ?? "GENERAL",
          award_year,
          award_quarter,
          award_title: awardTitle.trim(),
          award_note: awardNote.trim(),
          contact_status: awardContactStatus.trim() || "pending",
          logistics_note: awardLogisticsNote.trim(),
          includes_companion: awardIncludesCompanion,
          published: awardPublished,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.detail ?? json?.error ?? "No se pudo crear el premio trimestral.");
      }

      setAwardCommentId("");
      setAwardTitle("");
      setAwardNote("");
      setAwardContactStatus("pending");
      setAwardLogisticsNote("");
      setAwardIncludesCompanion(true);
      setAwardPublished(false);

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setSavingAward(false);
    }
  }

  async function updateCommentAward(row: CommentAwardRow) {
    setUpdatingAwardId(row.id);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "update_comment_award",
          id: row.id,
          award_title: row.award_title ?? "",
          award_note: row.award_note ?? "",
          contact_status: row.contact_status,
          logistics_note: row.logistics_note ?? "",
          includes_companion: row.includes_companion,
          published: row.published,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.detail ?? json?.error ?? "No se pudo actualizar el premio.");
      }

      await loadComments();
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setUpdatingAwardId(null);
    }
  }

  useEffect(() => {
    if (checking) return;
    void loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, groupFilter, statusFilter]);

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const btnSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const select =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";
  const input =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";
  const textarea =
    "mt-2 w-full min-h-[100px] rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";

  if (checking) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – Comentarios
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Verificando sesión.
            </div>
          </div>
        </section>

        <button type="button" onClick={goBack} className={btnSm + " mt-4"}>
          ← Volver
        </button>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin – Comentarios
        </h1>

        <div className="flex gap-2 flex-wrap">
          <Link href="/admin" className={btnSm}>
            🛠 Admin Central
          </Link>
          <button type="button" onClick={goBack} className={btnSm}>
            ← Volver
          </button>
        </div>
      </div>

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="rounded-2xl border-2 border-red-600 bg-white/90 p-4 mb-4">
            <div className="text-sm font-extrabold text-slate-900">
              🗓 Tema de la semana
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Este bloque controla lo que ve la página pública de comentarios.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-700">Tema</div>
                <input
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  className={input}
                  placeholder="Ej: Corrupción"
                />
              </div>

              <div>
                <div className="text-xs font-extrabold text-slate-700">
                  Pregunta guía
                </div>
                <textarea
                  value={questionDraft}
                  onChange={(e) => setQuestionDraft(e.target.value)}
                  className={textarea}
                  placeholder="Escribe la pregunta guía del tema semanal..."
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={saveWeeklyTopic}
                  className={btnSm}
                  disabled={savingTopic || loading || runningRotation}
                >
                  {savingTopic ? "Guardando..." : "Guardar tema semanal"}
                </button>

                <button
                  type="button"
                  onClick={loadComments}
                  className={btnSm}
                  disabled={savingTopic || loading || runningRotation}
                >
                  Recargar tema
                </button>

                <button
                  type="button"
                  onClick={runWeeklyRotationNow}
                  className={btnSm}
                  disabled={savingTopic || loading || runningRotation}
                  title="Ejecuta ahora la rotación semanal sin esperar al cron"
                >
                  {runningRotation ? "Ejecutando..." : "⏩ Ejecutar cambio semanal ahora"}
                </button>
              </div>

              {runningRotation ? (
                <div className="rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-slate-800">
                  Ejecutando rotación semanal...
                </div>
              ) : null}

              {rotationMsg ? (
                <div
                  className={
                    rotationMsgType === "success"
                      ? "rounded-xl border-2 border-green-700 bg-white p-3 text-sm font-bold text-green-800"
                      : "rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700"
                  }
                >
                  {rotationMsg}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-red-600 bg-white/90 p-4 mb-4">
            <div className="text-sm font-extrabold text-slate-900">
              🏆 Historial oficial de ganadores
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Aquí se muestran los temas semanales ya cerrados con su resultado oficial.
            </div>

            <div className="mt-4 space-y-3">
              {archivedTopics.length === 0 ? (
                <div className="text-sm font-semibold text-slate-700">
                  Aún no hay semanas cerradas con ganador oficial guardado.
                </div>
              ) : null}

              {archivedTopics.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                >
                  <div className="text-sm font-extrabold text-slate-900">{t.topic}</div>

                  <div className="mt-1 text-xs text-slate-600">
                    Estado: {t.status}
                    {t.winner_published_at
                      ? ` • Publicado: ${new Date(t.winner_published_at).toLocaleString()}`
                      : ""}
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-800 leading-relaxed">
                    {t.question}
                  </div>

                  <div className="mt-3 text-sm font-extrabold text-slate-900">
                    Ganador oficial:{" "}
                    {t.winner_video_entry_id ? "Sí registrado" : "Sin video ganador"}
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-700">
                    Votos ganadores: {t.winner_votes ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-red-600 bg-white/90 p-4 mb-4">
            <div className="text-sm font-extrabold text-slate-900">
              🎙 Preguntas al fundador
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Aquí se responde la pregunta del ganador semanal y se decide si se publica.
            </div>

            <div className="mt-4 space-y-3">
              {founderQuestions.length === 0 ? (
                <div className="text-sm font-semibold text-slate-700">
                  Aún no hay preguntas registradas para el fundador.
                </div>
              ) : null}

              {founderQuestions.map((q) => {
                const draft = founderAnswerDrafts[q.id] ?? {
                  text: q.founder_answer_text ?? "",
                  videoUrl: q.founder_answer_video_url ?? "",
                };

                return (
                  <div
                    key={q.id}
                    className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                  >
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <div className="text-xs font-extrabold text-slate-900">
                        {q.group_code} • {new Date(q.created_at).toLocaleString()}
                      </div>
                      <div className="text-xs font-extrabold text-slate-700">
                        estado: {q.question_status} • publicado: {q.published ? "sí" : "no"}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-600">
                      topic_id: {q.weekly_topic_id} • video_id: {q.weekly_video_entry_id}
                    </div>

                    <div className="mt-3 text-sm font-extrabold text-slate-900">
                      Pregunta del ganador
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-800 whitespace-pre-wrap">
                      {q.question_text}
                    </div>

                    <div className="mt-4">
                      <div className="text-xs font-extrabold text-slate-700">
                        Respuesta escrita del fundador
                      </div>
                      <textarea
                        className={textarea}
                        value={draft.text}
                        onChange={(e) =>
                          setFounderAnswerDrafts((prev) => ({
                            ...prev,
                            [q.id]: {
                              ...draft,
                              text: e.target.value,
                            },
                          }))
                        }
                        placeholder="Escribe la respuesta del fundador..."
                      />
                    </div>

                    <div className="mt-4">
                      <div className="text-xs font-extrabold text-slate-700">
                        Video de respuesta (opcional)
                      </div>
                      <input
                        className={input}
                        value={draft.videoUrl}
                        onChange={(e) =>
                          setFounderAnswerDrafts((prev) => ({
                            ...prev,
                            [q.id]: {
                              ...draft,
                              videoUrl: e.target.value,
                            },
                          }))
                        }
                        placeholder="https://..."
                      />
                    </div>

                    <div className="mt-3 flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className={btnSm}
                        disabled={founderQuestionSavingId === q.id}
                        onClick={() => answerFounderQuestion(q.id)}
                      >
                        {founderQuestionSavingId === q.id ? "Guardando..." : "Guardar y publicar"}
                      </button>

                      <button
                        type="button"
                        className={btnSm}
                        disabled={founderQuestionSavingId === q.id}
                        onClick={() => toggleFounderQuestionPublish(q.id, !q.published)}
                      >
                        {q.published ? "Ocultar publicación" : "Publicar respuesta"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-red-600 bg-white/90 p-4 mb-4">
            <div className="text-sm font-extrabold text-slate-900">
              ✈ Ganador trimestral de comentarios
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Aquí se registra el comentario ganador del trimestre y su coordinación.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-700">
                  ID del comentario ganador
                </div>
                <input
                  className={input}
                  value={awardCommentId}
                  onChange={(e) => setAwardCommentId(e.target.value)}
                  placeholder="Pega aquí el ID del comentario"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-extrabold text-slate-700">Año</div>
                  <input
                    className={input}
                    value={awardYear}
                    onChange={(e) => setAwardYear(e.target.value)}
                    placeholder="2026"
                  />
                </div>

                <div>
                  <div className="text-xs font-extrabold text-slate-700">Trimestre</div>
                  <select
                    className={select}
                    value={awardQuarter}
                    onChange={(e) => setAwardQuarter(e.target.value)}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs font-extrabold text-slate-700">Título público</div>
                <input
                  className={input}
                  value={awardTitle}
                  onChange={(e) => setAwardTitle(e.target.value)}
                  placeholder="Ej: Participación ciudadana destacada"
                />
              </div>

              <div>
                <div className="text-xs font-extrabold text-slate-700">Nota pública</div>
                <textarea
                  className={textarea}
                  value={awardNote}
                  onChange={(e) => setAwardNote(e.target.value)}
                  placeholder="Describe brevemente el premio o reconocimiento..."
                />
              </div>

              <div>
                <div className="text-xs font-extrabold text-slate-700">Estado de contacto</div>
                <select
                  className={select}
                  value={awardContactStatus}
                  onChange={(e) => setAwardContactStatus(e.target.value)}
                >
                  <option value="pending">pending</option>
                  <option value="contacted">contacted</option>
                  <option value="confirmed">confirmed</option>
                  <option value="completed">completed</option>
                </select>
              </div>

              <div>
                <div className="text-xs font-extrabold text-slate-700">Nota logística</div>
                <textarea
                  className={textarea}
                  value={awardLogisticsNote}
                  onChange={(e) => setAwardLogisticsNote(e.target.value)}
                  placeholder="Coordinación de viaje, estadía, acompañante, etc."
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={awardIncludesCompanion}
                  onChange={(e) => setAwardIncludesCompanion(e.target.checked)}
                />
                Incluye acompañante
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={awardPublished}
                  onChange={(e) => setAwardPublished(e.target.checked)}
                />
                Publicar en la app
              </label>

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className={btnSm}
                  onClick={createCommentAward}
                  disabled={savingAward}
                >
                  {savingAward ? "Guardando..." : "Crear ganador trimestral"}
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {commentAwards.length === 0 ? (
                <div className="text-sm font-semibold text-slate-700">
                  Aún no hay ganadores trimestrales registrados.
                </div>
              ) : null}

              {commentAwards.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                >
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="text-xs font-extrabold text-slate-900">
                      {a.group_code} • {a.award_year} / T{a.award_quarter}
                    </div>
                    <div className="text-xs font-extrabold text-slate-700">
                      contacto: {a.contact_status} • publicado: {a.published ? "sí" : "no"}
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    comment_id: {a.user_comment_id}
                    {a.published_at ? ` • publicado: ${new Date(a.published_at).toLocaleString()}` : ""}
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-extrabold text-slate-700">Título público</div>
                    <input
                      className={input}
                      value={a.award_title ?? ""}
                      onChange={(e) =>
                        setCommentAwards((prev) =>
                          prev.map((row) =>
                            row.id === a.id ? { ...row, award_title: e.target.value } : row
                          )
                        )
                      }
                    />
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-extrabold text-slate-700">Nota pública</div>
                    <textarea
                      className={textarea}
                      value={a.award_note ?? ""}
                      onChange={(e) =>
                        setCommentAwards((prev) =>
                          prev.map((row) =>
                            row.id === a.id ? { ...row, award_note: e.target.value } : row
                          )
                        )
                      }
                    />
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-extrabold text-slate-700">Estado de contacto</div>
                    <select
                      className={select}
                      value={a.contact_status}
                      onChange={(e) =>
                        setCommentAwards((prev) =>
                          prev.map((row) =>
                            row.id === a.id ? { ...row, contact_status: e.target.value } : row
                          )
                        )
                      }
                    >
                      <option value="pending">pending</option>
                      <option value="contacted">contacted</option>
                      <option value="confirmed">confirmed</option>
                      <option value="completed">completed</option>
                    </select>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-extrabold text-slate-700">Nota logística</div>
                    <textarea
                      className={textarea}
                      value={a.logistics_note ?? ""}
                      onChange={(e) =>
                        setCommentAwards((prev) =>
                          prev.map((row) =>
                            row.id === a.id ? { ...row, logistics_note: e.target.value } : row
                          )
                        )
                      }
                    />
                  </div>

                  <div className="mt-3 flex gap-4 flex-wrap">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={a.includes_companion}
                        onChange={(e) =>
                          setCommentAwards((prev) =>
                            prev.map((row) =>
                              row.id === a.id
                                ? { ...row, includes_companion: e.target.checked }
                                : row
                            )
                          )
                        }
                      />
                      Incluye acompañante
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={a.published}
                        onChange={(e) =>
                          setCommentAwards((prev) =>
                            prev.map((row) =>
                              row.id === a.id ? { ...row, published: e.target.checked } : row
                            )
                          )
                        }
                      />
                      Publicado
                    </label>
                  </div>

                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className={btnSm}
                      disabled={updatingAwardId === a.id}
                      onClick={() => updateCommentAward(a)}
                    >
                      {updatingAwardId === a.id ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs font-extrabold text-slate-700">Grupo</div>
              <select
                className={select}
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="ALL">Todos</option>
                <option value="GRUPOA">GRUPOA</option>
                <option value="GRUPOB">GRUPOB</option>
                <option value="GRUPOC">GRUPOC</option>
                <option value="GRUPOD">GRUPOD</option>
                <option value="GRUPOE">GRUPOE</option>
              </select>
            </div>

            <div>
              <div className="text-xs font-extrabold text-slate-700">Estado</div>
              <select
                className={select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="new">new</option>
                <option value="reviewed">reviewed</option>
                <option value="archived">archived</option>
                <option value="blocked">blocked</option>
                <option value="ALL">Todos</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={loadComments}
                className={btnSm + " w-full"}
              >
                {loading ? "Cargando..." : "Recargar"}
              </button>
            </div>
          </div>

          {errorMsg ? (
            <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
              {errorMsg}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4">
            <div className="text-sm font-extrabold text-slate-900">
              🎥 Videos enviados – YO POLÍTICO
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Aquí se revisan los enlaces enviados por ciudadanos para el tema semanal.
            </div>

            <div className="mt-4 space-y-3">
              {videoItems.length === 0 && !loading ? (
                <div className="text-sm font-semibold text-slate-700">
                  No hay videos enviados todavía.
                </div>
              ) : null}

              {videoItems.map((v) => (
                <div
                  key={v.id}
                  className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                >
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="text-xs font-extrabold text-slate-900">
                      {v.group_code} • {new Date(v.created_at).toLocaleString()}
                    </div>
                    <div className="text-xs font-extrabold text-slate-700">
                      status:{" "}
                      {v.status === "new"
                        ? "Nuevo"
                        : v.status === "reviewed"
                        ? "Revisado"
                        : v.status === "archived"
                        ? "Archivado"
                        : "Bloqueado"}
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    Plataforma: {v.platform}
                  </div>

                  {v.title ? (
                    <div className="mt-1 text-sm font-semibold text-slate-800">
                      Título: {v.title}
                    </div>
                  ) : null}

                  <div className="mt-2 text-xs text-slate-600 break-all">
                    {v.video_url}
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    device: {v.device_id ?? "-"} • id: {v.id}
                  </div>

                  <div className="mt-3 flex gap-2 flex-wrap">
                    <a
                      href={v.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 rounded-lg border-2 border-red-600 bg-green-700 text-white text-xs font-bold"
                    >
                      Ver video
                    </a>

                    {v.status !== "reviewed" && v.status !== "blocked" && (
                      <button
                        type="button"
                        className="px-3 py-1 rounded-lg border-2 border-red-600 bg-green-700 text-white text-xs font-bold"
                        onClick={() => setVideoStatus(v.id, "reviewed")}
                      >
                        Marcar como Revisado
                      </button>
                    )}

                    {v.status !== "archived" && (
                      <button
                        type="button"
                        className="px-3 py-1 rounded-lg border-2 border-red-600 bg-slate-700 text-white text-xs font-bold"
                        onClick={() => setVideoStatus(v.id, "archived")}
                      >
                        Marcar como Archivado
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {items.length === 0 && !loading ? (
              <div className="text-sm font-semibold text-slate-700">
                No hay comentarios para mostrar.
              </div>
            ) : null}

            {items.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
              >
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="text-xs font-extrabold text-slate-900">
                    {c.group_code} • {new Date(c.created_at).toLocaleString()}
                  </div>
                  <div className="text-xs font-extrabold text-slate-700">
                    status:{" "}
                    {c.status === "new"
                      ? "Nuevo"
                      : c.status === "reviewed"
                      ? "Revisado"
                      : c.status === "archived"
                      ? "Archivado"
                      : "Bloqueado"}
                  </div>
                </div>

                <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                  {c.message}
                </div>

                <div className="mt-2 text-xs text-slate-600">
                  page: {c.page ?? "-"} • device: {c.device_id ?? "-"} • id: {c.id}
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  {c.status !== "reviewed" && c.status !== "blocked" && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border-2 border-red-600 bg-green-700 text-white text-xs font-bold"
                      onClick={() => setStatus(c.id, "reviewed")}
                    >
                      Marcar como Revisado
                    </button>
                  )}

                  {c.status !== "archived" && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border-2 border-red-600 bg-slate-700 text-white text-xs font-bold"
                      onClick={() => setStatus(c.id, "archived")}
                    >
                      Marcar como Archivado
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
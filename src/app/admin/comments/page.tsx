"use client";

import { useEffect, useMemo, useState } from "react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminNavActions from "@/components/admin/AdminNavActions";
import AdminButton from "@/components/admin/AdminButton";
import AdminCard from "@/components/admin/AdminCard";
import { useRouter } from "next/navigation";

type CommentRow = {
  id: string;
  created_at: string;
  group_code: string;
  device_id: string | null;
  page: string | null;
  message: string;
  status: "published" | "archived" | "blocked";
};

type CommentFilters = {
  query: string;
  group: string;
  status: "ALL" | CommentRow["status"];
  from: string;
  until: string;
};

const COMMENT_PAGE_SIZE = 10;
const EMPTY_COMMENT_FILTERS: CommentFilters = { query: "", group: "", status: "ALL", from: "", until: "" };

function filterCommentEntries(comments: CommentRow[], filters: CommentFilters) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  const query = normalize(filters.query);
  const group = normalize(filters.group);
  return comments.filter((comment) => {
    if (query && !normalize(comment.message).includes(query)) return false;
    if (group && !normalize(comment.group_code).includes(group)) return false;
    if (filters.status !== "ALL" && comment.status !== filters.status) return false;
    if (filters.from || filters.until) {
      const date = new Date(comment.created_at);
      if (Number.isNaN(date.getTime())) return false;
      const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      if (filters.from && day < filters.from) return false;
      if (filters.until && day > filters.until) return false;
    }
    return true;
  });
}

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

type VideoFilters = {
  query: string;
  status: "ALL" | VideoRow["status"];
  from: string;
  until: string;
};

const VIDEO_PAGE_SIZE = 10;
const EMPTY_VIDEO_FILTERS: VideoFilters = { query: "", status: "ALL", from: "", until: "" };

function filterVideoEntries(videos: VideoRow[], filters: VideoFilters, topics: WeeklyTopicRow[]) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  const query = normalize(filters.query);
  const topicNames = new Map(topics.map((topic) => [topic.id, topic.topic]));
  return videos.filter((video) => {
    if (filters.status !== "ALL" && video.status !== filters.status) return false;
    if (query && !normalize([video.title ?? "", topicNames.get(video.weekly_topic_id) ?? ""].join(" ")).includes(query)) return false;
    if (filters.from || filters.until) {
      const date = new Date(video.created_at);
      if (Number.isNaN(date.getTime())) return false;
      const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      if (filters.from && day < filters.from) return false;
      if (filters.until && day > filters.until) return false;
    }
    return true;
  });
}

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

type SectionFilters = { query: string; status: string; flag: "ALL" | "yes" | "no"; from: string; until: string };
const SECTION_PAGE_SIZE = 10;
const EMPTY_SECTION_FILTERS: SectionFilters = { query: "", status: "ALL", flag: "ALL", from: "", until: "" };

function normalizeSectionQuery(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

function matchesSectionDate(value: string | null | undefined, filters: SectionFilters) {
  if (!filters.from && !filters.until) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return (!filters.from || day >= filters.from) && (!filters.until || day <= filters.until);
}

function filterHistoryEntries(topics: WeeklyTopicRow[], filters: SectionFilters) {
  const query = normalizeSectionQuery(filters.query);
  return topics.filter((topic) => {
    if (query && !normalizeSectionQuery([topic.topic, topic.question].join(" ")).includes(query)) return false;
    if (filters.status !== "ALL" && topic.status !== filters.status) return false;
    const hasWinner = !!topic.winner_video_entry_id;
    if (filters.flag !== "ALL" && hasWinner !== (filters.flag === "yes")) return false;
    return matchesSectionDate(topic.winner_published_at, filters);
  });
}

function filterFounderEntries(questions: FounderQuestionRow[], filters: SectionFilters) {
  const query = normalizeSectionQuery(filters.query);
  return questions.filter((question) => {
    if (query && !normalizeSectionQuery(question.question_text).includes(query)) return false;
    if (filters.status !== "ALL" && question.question_status !== filters.status) return false;
    if (filters.flag !== "ALL" && question.published !== (filters.flag === "yes")) return false;
    return matchesSectionDate(question.created_at, filters);
  });
}

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

  const [items, setItems] = useState<CommentRow[]>([]);
  const [commentFilters, setCommentFilters] = useState<CommentFilters>(EMPTY_COMMENT_FILTERS);
  const [commentPage, setCommentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("published");

  const [weeklyTopic, setWeeklyTopic] = useState<WeeklyTopicRow | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);
  const [runningRotation, setRunningRotation] = useState(false);
  const [rotationMsg, setRotationMsg] = useState<string | null>(null);
  const [rotationMsgType, setRotationMsgType] = useState<"success" | "error" | null>(null);

  const [videoItems, setVideoItems] = useState<VideoRow[]>([]);
  const [videoFilters, setVideoFilters] = useState<VideoFilters>(EMPTY_VIDEO_FILTERS);
  const [videoPage, setVideoPage] = useState(1);
  const [archivedTopics, setArchivedTopics] = useState<WeeklyTopicRow[]>([]);
  const [founderQuestions, setFounderQuestions] = useState<FounderQuestionRow[]>([]);
  const [historyFilters, setHistoryFilters] = useState<SectionFilters>(EMPTY_SECTION_FILTERS);
  const [historyPage, setHistoryPage] = useState(1);
  const [founderFilters, setFounderFilters] = useState<SectionFilters>(EMPTY_SECTION_FILTERS);
  const [founderPage, setFounderPage] = useState(1);
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

  const filteredHistoryItems = useMemo(() => filterHistoryEntries(archivedTopics, historyFilters), [archivedTopics, historyFilters]);
  const historyPageCount = Math.max(1, Math.ceil(filteredHistoryItems.length / SECTION_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistoryItems = filteredHistoryItems.slice((currentHistoryPage - 1) * SECTION_PAGE_SIZE, currentHistoryPage * SECTION_PAGE_SIZE);
  const historyStatusOptions = Array.from(new Set([...archivedTopics.map((row) => row.status), ...(historyFilters.status !== "ALL" ? [historyFilters.status] : [])]));

  function updateHistoryFilter<K extends keyof SectionFilters>(key: K, value: SectionFilters[K]) {
    setHistoryFilters((previous) => ({ ...previous, [key]: value }));
    setHistoryPage(1);
  }

  function clearHistoryFilters() {
    setHistoryFilters(EMPTY_SECTION_FILTERS);
    setHistoryPage(1);
  }

  const filteredFounderItems = useMemo(() => filterFounderEntries(founderQuestions, founderFilters), [founderQuestions, founderFilters]);
  const founderPageCount = Math.max(1, Math.ceil(filteredFounderItems.length / SECTION_PAGE_SIZE));
  const currentFounderPage = Math.min(founderPage, founderPageCount);
  const visibleFounderItems = filteredFounderItems.slice((currentFounderPage - 1) * SECTION_PAGE_SIZE, currentFounderPage * SECTION_PAGE_SIZE);
  const founderStatusOptions = Array.from(new Set([...founderQuestions.map((row) => row.question_status), ...(founderFilters.status !== "ALL" ? [founderFilters.status] : [])]));

  function updateFounderFilter<K extends keyof SectionFilters>(key: K, value: SectionFilters[K]) {
    setFounderFilters((previous) => ({ ...previous, [key]: value }));
    setFounderPage(1);
  }

  function clearFounderFilters() {
    setFounderFilters(EMPTY_SECTION_FILTERS);
    setFounderPage(1);
  }

  const filteredCommentItems = useMemo(() => filterCommentEntries(items, commentFilters), [items, commentFilters]);
  const commentPageCount = Math.max(1, Math.ceil(filteredCommentItems.length / COMMENT_PAGE_SIZE));
  const currentCommentPage = Math.min(commentPage, commentPageCount);
  const visibleCommentItems = filteredCommentItems.slice((currentCommentPage - 1) * COMMENT_PAGE_SIZE, currentCommentPage * COMMENT_PAGE_SIZE);

  function updateCommentFilter<K extends keyof CommentFilters>(key: K, value: CommentFilters[K]) {
    setCommentFilters((previous) => ({ ...previous, [key]: value }));
    setCommentPage(1);
  }

  function clearCommentFilters() {
    setCommentFilters(EMPTY_COMMENT_FILTERS);
    setCommentPage(1);
  }

  const filteredVideoItems = useMemo(
    () => filterVideoEntries(videoItems, videoFilters, weeklyTopic ? [weeklyTopic, ...archivedTopics] : archivedTopics),
    [videoItems, videoFilters, weeklyTopic, archivedTopics]
  );
  const videoPageCount = Math.max(1, Math.ceil(filteredVideoItems.length / VIDEO_PAGE_SIZE));
  const currentVideoPage = Math.min(videoPage, videoPageCount);
  const visibleVideoItems = filteredVideoItems.slice((currentVideoPage - 1) * VIDEO_PAGE_SIZE, currentVideoPage * VIDEO_PAGE_SIZE);

  function updateVideoFilter<K extends keyof VideoFilters>(key: K, value: VideoFilters[K]) {
    setVideoFilters((previous) => ({ ...previous, [key]: value }));
    setVideoPage(1);
  }

  function clearVideoFilters() {
    setVideoFilters(EMPTY_VIDEO_FILTERS);
    setVideoPage(1);
  }

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/admin");
    }
  }

  useEffect(() => {
    setChecking(false);
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

  async function setStatus(id: string, status: "published" | "archived" | "blocked") {
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
    const hasActiveTopic = !!weeklyTopic?.id;

    const res = await fetch("/api/admin/comments", {
      method: hasActiveTopic ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(
        hasActiveTopic
          ? {
              id: weeklyTopic!.id,
              topic,
              question,
            }
          : {
              action: "upsert_weekly_topic",
              topic,
              question,
            }
      ),
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

  const select =
    "mt-2 w-full rounded-xl min-h-11 border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 font-semibold";
  const input =
    "mt-2 w-full rounded-xl min-h-11 border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 font-semibold";
  const textarea =
    "mt-2 w-full min-h-[100px] rounded-xl min-h-11 border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 font-semibold";

  if (checking) {
    return (
      <AdminPageShell>
        <AdminHeader title="Admin – Comentarios" />

        <section className="min-w-0 space-y-6">
          <div className="min-w-0 space-y-6">
            <div className="text-lg font-extrabold text-black">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
              Verificando sesión.
            </div>
          </div>
        </section>

        <AdminButton type="button" onClick={goBack} variant="secondary" className="max-w-full whitespace-normal mt-4">
          ← Volver
        </AdminButton>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminHeader
        title="Admin – Comentarios"
        actions={
          <AdminNavActions includeLogout>
            <AdminButton href="/admin">🛠 Admin Central</AdminButton>
            <AdminButton href="/">Inicio</AdminButton>
            <AdminButton type="button" onClick={goBack}>← Volver</AdminButton>
          </AdminNavActions>
        }
      />

      <section className="min-w-0 space-y-6">
        <div className="min-w-0 space-y-6">
          <AdminCard className="min-w-0 break-words mb-4">
            <div className="text-lg font-extrabold text-black">
              🗓 Tema de la semana
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Este bloque controla lo que ve la página pública de comentarios.
            </div>

            <div className="mt-4 grid [&>*]:min-w-0 grid-cols-1 gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-700">Tema</div>
                <input
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  className={input}
                  placeholder="Ej: Corrupción"
                />
              </div>

              <div>
                <div className="text-sm font-extrabold text-slate-700">
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
                <AdminButton
                  type="button"
                  onClick={saveWeeklyTopic}
                  variant="primary" className="max-w-full whitespace-normal"
                  disabled={savingTopic || loading || runningRotation}
                >
                  {savingTopic
                  ? "Guardando..."
                  : weeklyTopic?.id
                  ? "Guardar tema semanal"
                  : "Crear tema semanal activo"}
                </AdminButton>

                <AdminButton
                  type="button"
                  onClick={loadComments}
                  variant="secondary" className="max-w-full whitespace-normal"
                  disabled={savingTopic || loading || runningRotation}
                >
                  Recargar tema
                </AdminButton>

                <AdminButton
                  type="button"
                  onClick={runWeeklyRotationNow}
                  variant="primary" className="max-w-full whitespace-normal"
                  disabled={savingTopic || loading || runningRotation}
                  title="Ejecuta ahora la rotación semanal sin esperar al cron"
                >
                  {runningRotation ? "Ejecutando..." : "⏩ Ejecutar cambio semanal ahora"}
                </AdminButton>
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
          </AdminCard>

          <AdminCard className="min-w-0 break-words mb-4">
            <div className="text-lg font-extrabold text-black">
              🏆 Historial oficial de ganadores
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Aquí se muestran los temas semanales ya cerrados con su resultado oficial.
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <label className="text-sm font-bold text-slate-700">
                Tema / pregunta
                <input className={input} value={historyFilters.query} onChange={(e) => updateHistoryFilter("query", e.target.value)} placeholder="Buscar texto" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Estado
                <select className={select} value={historyFilters.status} onChange={(e) => updateHistoryFilter("status", e.target.value)}>
                  <option value="ALL">Todos</option>
                  {historyStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Ganador
                <select className={select} value={historyFilters.flag} onChange={(e) => updateHistoryFilter("flag", e.target.value as SectionFilters["flag"])}>
                  <option value="ALL">Todos</option>
                  <option value="yes">Con ganador</option>
                  <option value="no">Sin ganador</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Fecha Desde
                <input className={input + " min-w-0 max-w-full"} type="date" value={historyFilters.from} onChange={(e) => updateHistoryFilter("from", e.target.value)} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Fecha Hasta
                <input className={input + " min-w-0 max-w-full"} type="date" value={historyFilters.until} onChange={(e) => updateHistoryFilter("until", e.target.value)} />
              </label>
              <div className="flex items-end">
                <AdminButton type="button" onClick={clearHistoryFilters}>Limpiar filtros</AdminButton>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">Fechas de publicación del ganador. Los registros sin esa fecha no coinciden al aplicar un rango.</p>
            <p className="mt-2 text-sm font-bold text-slate-700" aria-live="polite">Resultados: {filteredHistoryItems.length} de {archivedTopics.length} registros cargados.</p>
            {historyFilters.from && historyFilters.until && historyFilters.from > historyFilters.until ? (
              <p className="mt-2 text-sm text-red-700">La fecha Desde debe ser anterior o igual a la fecha Hasta.</p>
            ) : null}

            <div className="mt-4 space-y-3">
              {filteredHistoryItems.length === 0 ? (
                <div className="text-sm font-semibold text-slate-700">
                  No hay registros del historial que coincidan con los filtros.
                </div>
              ) : null}

              {visibleHistoryItems.map((t) => (
                <div
                  key={t.id}
                  className="min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="text-lg font-extrabold text-black">{t.topic}</div>

                  <div className="mt-1 text-sm text-slate-600">
                    Estado: {t.status}
                    {t.winner_published_at
                      ? ` • Publicado: ${new Date(t.winner_published_at).toLocaleString()}`
                      : ""}
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-800 leading-relaxed">
                    {t.question}
                  </div>

                  <div className="mt-3 text-lg font-extrabold text-black">
                    Ganador oficial:{" "}
                    {t.winner_video_entry_id ? "Sí registrado" : "Sin video ganador"}
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-700">
                    Votos ganadores: {t.winner_votes ?? 0}
                  </div>
                </div>
              ))}
            </div>
            <nav aria-label="Paginación de historial" className="mt-4 flex flex-wrap items-center gap-3">
              <AdminButton type="button" disabled={currentHistoryPage <= 1} onClick={() => setHistoryPage(currentHistoryPage - 1)}>Anterior</AdminButton>
              <span className="text-sm font-bold text-slate-700">Página {currentHistoryPage} de {historyPageCount}</span>
              <AdminButton type="button" disabled={currentHistoryPage >= historyPageCount} onClick={() => setHistoryPage(currentHistoryPage + 1)}>Siguiente</AdminButton>
            </nav>
          </AdminCard>

          <AdminCard className="min-w-0 break-words mb-4">
            <div className="text-lg font-extrabold text-black">
              🎙 Preguntas al fundador
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Aquí se responde la pregunta del ganador semanal y se decide si se publica.
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <label className="text-sm font-bold text-slate-700">
                Texto de la pregunta
                <input className={input} value={founderFilters.query} onChange={(e) => updateFounderFilter("query", e.target.value)} placeholder="Buscar texto" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Estado
                <select className={select} value={founderFilters.status} onChange={(e) => updateFounderFilter("status", e.target.value)}>
                  <option value="ALL">Todos</option>
                  {founderStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Publicación
                <select className={select} value={founderFilters.flag} onChange={(e) => updateFounderFilter("flag", e.target.value as SectionFilters["flag"])}>
                  <option value="ALL">Todos</option>
                  <option value="yes">Publicado</option>
                  <option value="no">No publicado</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Fecha Desde
                <input className={input + " min-w-0 max-w-full"} type="date" value={founderFilters.from} onChange={(e) => updateFounderFilter("from", e.target.value)} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Fecha Hasta
                <input className={input + " min-w-0 max-w-full"} type="date" value={founderFilters.until} onChange={(e) => updateFounderFilter("until", e.target.value)} />
              </label>
              <div className="flex items-end">
                <AdminButton type="button" onClick={clearFounderFilters}>Limpiar filtros</AdminButton>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">Fechas de creación de la pregunta.</p>
            <p className="mt-2 text-sm font-bold text-slate-700" aria-live="polite">Resultados: {filteredFounderItems.length} de {founderQuestions.length} registros cargados.</p>
            {founderFilters.from && founderFilters.until && founderFilters.from > founderFilters.until ? (
              <p className="mt-2 text-sm text-red-700">La fecha Desde debe ser anterior o igual a la fecha Hasta.</p>
            ) : null}

            <div className="mt-4 space-y-3">
              {filteredFounderItems.length === 0 ? (
                <div className="text-sm font-semibold text-slate-700">
                  No hay preguntas que coincidan con los filtros.
                </div>
              ) : null}

              {visibleFounderItems.map((q) => {
                const draft = founderAnswerDrafts[q.id] ?? {
                  text: q.founder_answer_text ?? "",
                  videoUrl: q.founder_answer_video_url ?? "",
                };

                return (
                  <div
                    key={q.id}
                    className="min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <div className="text-lg font-extrabold text-black">
                        {q.group_code} • {new Date(q.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm font-extrabold text-slate-700">
                        estado: {q.question_status} • publicado: {q.published ? "sí" : "no"}
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-slate-600">
                      topic_id: {q.weekly_topic_id} • video_id: {q.weekly_video_entry_id}
                    </div>

                    <div className="mt-3 text-lg font-extrabold text-black">
                      Pregunta del ganador
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-800 whitespace-pre-wrap">
                      {q.question_text}
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-extrabold text-slate-700">
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
                      <div className="text-sm font-extrabold text-slate-700">
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
                      <AdminButton
                        type="button"
                        variant="primary" className="max-w-full whitespace-normal"
                        disabled={founderQuestionSavingId === q.id}
                        onClick={() => answerFounderQuestion(q.id)}
                      >
                        {founderQuestionSavingId === q.id ? "Guardando..." : "Guardar y publicar"}
                      </AdminButton>

                      <AdminButton
                        type="button"
                        variant={q.published ? "danger" : "primary"} className="max-w-full whitespace-normal"
                        disabled={founderQuestionSavingId === q.id}
                        onClick={() => toggleFounderQuestionPublish(q.id, !q.published)}
                      >
                        {q.published ? "Ocultar publicación" : "Publicar respuesta"}
                      </AdminButton>
                    </div>
                  </div>
                );
              })}
            </div>
            <nav aria-label="Paginación de preguntas" className="mt-4 flex flex-wrap items-center gap-3">
              <AdminButton type="button" disabled={currentFounderPage <= 1} onClick={() => setFounderPage(currentFounderPage - 1)}>Anterior</AdminButton>
              <span className="text-sm font-bold text-slate-700">Página {currentFounderPage} de {founderPageCount}</span>
              <AdminButton type="button" disabled={currentFounderPage >= founderPageCount} onClick={() => setFounderPage(currentFounderPage + 1)}>Siguiente</AdminButton>
            </nav>
          </AdminCard>

          <AdminCard className="min-w-0 break-words mb-4">
            <div className="text-lg font-extrabold text-black">
              ✈ Ganador trimestral de comentarios
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Aquí se registra el comentario ganador del trimestre y su coordinación.
            </div>

            <div className="mt-4 grid [&>*]:min-w-0 grid-cols-1 gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-700">
                  ID del comentario ganador
                </div>
                <input
                  className={input}
                  value={awardCommentId}
                  onChange={(e) => setAwardCommentId(e.target.value)}
                  placeholder="Pega aquí el ID del comentario"
                />
              </div>

              <div className="grid [&>*]:min-w-0 grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-700">Año</div>
                  <input
                    className={input}
                    value={awardYear}
                    onChange={(e) => setAwardYear(e.target.value)}
                    placeholder="2026"
                  />
                </div>

                <div>
                  <div className="text-sm font-extrabold text-slate-700">Trimestre</div>
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
                <div className="text-sm font-extrabold text-slate-700">Título público</div>
                <input
                  className={input}
                  value={awardTitle}
                  onChange={(e) => setAwardTitle(e.target.value)}
                  placeholder="Ej: Participación ciudadana destacada"
                />
              </div>

              <div>
                <div className="text-sm font-extrabold text-slate-700">Nota pública</div>
                <textarea
                  className={textarea}
                  value={awardNote}
                  onChange={(e) => setAwardNote(e.target.value)}
                  placeholder="Describe brevemente el premio o reconocimiento..."
                />
              </div>

              <div>
                <div className="text-sm font-extrabold text-slate-700">Estado de contacto</div>
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
                <div className="text-sm font-extrabold text-slate-700">Nota logística</div>
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
                <AdminButton
                  type="button"
                  variant="primary" className="max-w-full whitespace-normal"
                  onClick={createCommentAward}
                  disabled={savingAward}
                >
                  {savingAward ? "Guardando..." : "Crear ganador trimestral"}
                </AdminButton>
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
                  className="min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="text-lg font-extrabold text-black">
                      {a.group_code} • {a.award_year} / T{a.award_quarter}
                    </div>
                    <div className="text-sm font-extrabold text-slate-700">
                      contacto: {a.contact_status} • publicado: {a.published ? "sí" : "no"}
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-slate-600">
                    comment_id: {a.user_comment_id}
                    {a.published_at ? ` • publicado: ${new Date(a.published_at).toLocaleString()}` : ""}
                  </div>

                  <div className="mt-3">
                    <div className="text-sm font-extrabold text-slate-700">Título público</div>
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
                    <div className="text-sm font-extrabold text-slate-700">Nota pública</div>
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
                    <div className="text-sm font-extrabold text-slate-700">Estado de contacto</div>
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
                    <div className="text-sm font-extrabold text-slate-700">Nota logística</div>
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
                    <AdminButton
                      type="button"
                      variant="primary" className="max-w-full whitespace-normal"
                      disabled={updatingAwardId === a.id}
                      onClick={() => updateCommentAward(a)}
                    >
                      {updatingAwardId === a.id ? "Guardando..." : "Guardar cambios"}
                    </AdminButton>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard className="grid [&>*]:min-w-0 grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-700">Grupo</div>
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
              <div className="text-sm font-extrabold text-slate-700">Estado</div>
              <select
                className={select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="published">published</option>
                <option value="archived">archived</option>
                <option value="blocked">blocked</option>
                <option value="ALL">Todos</option>
              </select>
            </div>

            <div className="flex items-end">
              <AdminButton
                type="button"
                onClick={loadComments}
                variant="secondary" className="max-w-full whitespace-normal"
              >
                {loading ? "Cargando..." : "Recargar"}
              </AdminButton>
            </div>
          </AdminCard>

          {errorMsg ? (
            <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
              {errorMsg}
            </div>
          ) : null}

          <AdminCard className="min-w-0 break-words mt-4">
            <div className="text-lg font-extrabold text-black">
              🎥 Videos enviados – YO POLÍTICO
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Aquí se revisan los enlaces enviados por ciudadanos para el tema semanal.
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <label className="text-sm font-bold text-slate-700">
                Tema / título
                <input className={input} value={videoFilters.query} onChange={(e) => updateVideoFilter("query", e.target.value)} placeholder="Buscar tema o título" />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Estado del video
                <select className={select} value={videoFilters.status} onChange={(e) => updateVideoFilter("status", e.target.value as VideoFilters["status"])}>
                  <option value="ALL">Todos</option>
                  <option value="new">Nuevo</option>
                  <option value="reviewed">Revisado</option>
                  <option value="archived">Archivado</option>
                  <option value="blocked">Bloqueado</option>
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                Fecha Desde
                <input className={input + " min-w-0 max-w-full"} type="date" value={videoFilters.from} onChange={(e) => updateVideoFilter("from", e.target.value)} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Fecha Hasta
                <input className={input + " min-w-0 max-w-full"} type="date" value={videoFilters.until} onChange={(e) => updateVideoFilter("until", e.target.value)} />
              </label>
              <div className="flex items-end">
                <AdminButton type="button" onClick={clearVideoFilters}>Limpiar filtros</AdminButton>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">La búsqueda por tema usa los temas disponibles en esta página.</p>
            <p className="mt-2 text-sm font-bold text-slate-700" aria-live="polite">Resultados: {filteredVideoItems.length} de {videoItems.length} videos cargados.</p>
            {videoFilters.from && videoFilters.until && videoFilters.from > videoFilters.until ? (
              <p className="mt-2 text-sm text-red-700">La fecha Desde debe ser anterior o igual a la fecha Hasta.</p>
            ) : null}

            <div className="mt-4 space-y-3">
              {filteredVideoItems.length === 0 && !loading ? (
                <div className="text-sm font-semibold text-slate-700">
                  No hay videos que coincidan con los filtros.
                </div>
              ) : null}

              {visibleVideoItems.map((v) => (
                <div
                  key={v.id}
                  className="min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="text-lg font-extrabold text-black">
                      {v.group_code} • {new Date(v.created_at).toLocaleString()}
                    </div>
                    <div className="text-sm font-extrabold text-slate-700">
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

                  <div className="mt-2 text-sm text-slate-600 break-all">
                    {v.video_url}
                  </div>

                  <div className="mt-2 text-sm text-slate-600">
                    device: {v.device_id ?? "-"} • id: {v.id}
                  </div>

                  <div className="mt-3 flex gap-2 flex-wrap">
                    <AdminButton
                      href={v.video_url}
                      target="_blank"
                      rel="noreferrer"
                      variant="secondary" className="max-w-full whitespace-normal"
                    >
                      Ver video
                    </AdminButton>

                    {v.status !== "reviewed" && v.status !== "blocked" && (
                      <AdminButton
                        type="button"
                        variant="primary" className="max-w-full whitespace-normal"
                        onClick={() => setVideoStatus(v.id, "reviewed")}
                      >
                        Marcar como Revisado
                      </AdminButton>
                    )}

                    {v.status !== "archived" && (
                      <AdminButton
                        type="button"
                        variant="danger" className="max-w-full whitespace-normal"
                        onClick={() => setVideoStatus(v.id, "archived")}
                      >
                        Marcar como Archivado
                      </AdminButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <nav aria-label="Paginación de videos" className="mt-4 flex flex-wrap items-center gap-3">
              <AdminButton type="button" disabled={currentVideoPage <= 1} onClick={() => setVideoPage(currentVideoPage - 1)}>Anterior</AdminButton>
              <span className="text-sm font-bold text-slate-700">Página {currentVideoPage} de {videoPageCount}</span>
              <AdminButton type="button" disabled={currentVideoPage >= videoPageCount} onClick={() => setVideoPage(currentVideoPage + 1)}>Siguiente</AdminButton>
            </nav>
          </AdminCard>

          <div className="mt-4 space-y-3">
            <AdminCard className="min-w-0 break-words">
              <h2 className="text-lg font-extrabold text-black">Comentarios</h2>
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <label className="text-sm font-bold text-slate-700">
                  Texto del comentario
                  <input className={input} value={commentFilters.query} onChange={(e) => updateCommentFilter("query", e.target.value)} placeholder="Buscar texto" />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Grupo
                  <input className={input} value={commentFilters.group} onChange={(e) => updateCommentFilter("group", e.target.value)} placeholder="Ej: GRUPOA" />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Estado del comentario
                  <select className={select} value={commentFilters.status} onChange={(e) => updateCommentFilter("status", e.target.value as CommentFilters["status"])}>
                    <option value="ALL">Todos</option>
                    <option value="published">Publicado</option>
                    <option value="archived">Archivado</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Fecha Desde
                  <input className={input + " min-w-0 max-w-full"} type="date" value={commentFilters.from} onChange={(e) => updateCommentFilter("from", e.target.value)} />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Fecha Hasta
                  <input className={input + " min-w-0 max-w-full"} type="date" value={commentFilters.until} onChange={(e) => updateCommentFilter("until", e.target.value)} />
                </label>
                <div className="flex items-end">
                  <AdminButton type="button" onClick={clearCommentFilters}>Limpiar filtros</AdminButton>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">Para buscar en todos los grupos y estados, selecciona Todos en los filtros superiores.</p>
              <p className="mt-2 text-sm font-bold text-slate-700" aria-live="polite">Resultados: {filteredCommentItems.length} de {items.length} comentarios cargados.</p>
              {commentFilters.from && commentFilters.until && commentFilters.from > commentFilters.until ? (
                <p className="mt-2 text-sm text-red-700">La fecha Desde debe ser anterior o igual a la fecha Hasta.</p>
              ) : null}
            </AdminCard>
            {filteredCommentItems.length === 0 && !loading ? (
              <div className="text-sm font-semibold text-slate-700">
                No hay comentarios que coincidan con los filtros.
              </div>
            ) : null}

            {visibleCommentItems.map((c) => (
              <AdminCard
                key={c.id}
                className="min-w-0 break-words"
              >
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="text-lg font-extrabold text-black">
                    {c.group_code} • {new Date(c.created_at).toLocaleString()}
                  </div>
                  <div className="text-sm font-extrabold text-slate-700">
                    status:{" "}
                              {c.status === "published"
  ? "Publicado"
  : c.status === "archived"
  ? "Archivado"
  : "Bloqueado"}
                  </div>
                </div>

                <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                  {c.message}
                </div>

                <div className="mt-2 text-sm text-slate-600">
                  page: {c.page ?? "-"} • device: {c.device_id ?? "-"} • id: {c.id}
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">

                  {c.status !== "archived" && (
                    <AdminButton
                      type="button"
                      variant="danger" className="max-w-full whitespace-normal"
                      onClick={() => setStatus(c.id, "archived")}
                    >
                      Marcar como Archivado
                    </AdminButton>
                  )}
                </div>
              </AdminCard>
            ))}
            <nav aria-label="Paginación de comentarios" className="mt-4 flex flex-wrap items-center gap-3">
              <AdminButton type="button" disabled={currentCommentPage <= 1} onClick={() => setCommentPage(currentCommentPage - 1)}>Anterior</AdminButton>
              <span className="text-sm font-bold text-slate-700">Página {currentCommentPage} de {commentPageCount}</span>
              <AdminButton type="button" disabled={currentCommentPage >= commentPageCount} onClick={() => setCommentPage(currentCommentPage + 1)}>Siguiente</AdminButton>
            </nav>
          </div>
        </div>
      </section>
    </AdminPageShell>
  );
}

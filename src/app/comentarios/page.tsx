"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CommentRow = {
  id: string;
  created_at: string;
  group_code: string;
  message: string;
  status: "new" | "reviewed" | "archived" | "blocked";
};

type PublicVideoRow = {
  id: string;
  created_at: string;
  weekly_topic_id: string;
  group_code: string;
  platform: string;
  video_url: string;
  title: string | null;
  status: "new" | "reviewed" | "archived" | "blocked";
};

type LatestOfficialWinner = {
  topicId: string;
  topic: string;
  question: string;
  winnerVideoEntryId: string;
  winnerVotes: number;
  winnerPublishedAt: string | null;
  video: {
    id: string;
    created_at: string;
    weekly_topic_id: string;
    group_code: string;
    platform: string;
    video_url: string;
    title: string | null;
    status: "new" | "reviewed" | "archived" | "blocked";
  } | null;
};

type VideoVoteCountRow = {
  weekly_video_entry_id: string;
  count: number;
};

type TimeFilter = "TODAY" | "D7" | "D30" | "ALL";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
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

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0]/g, "o")
    .replace(/[1]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9\s]/g, " ");
}

function hasSoeces(text: string) {
  const t = normalizeText(text);
  const words = t.split(/\s+/).filter(Boolean);

  const banned = new Set([
    "porqueria",
    "basura",
    "asco",
    "mierda",
    "carajo",
    "puta",
    "puto",
    "culo",
    "verga",
    "cabron",
    "cabrona",
    "joder",
    "maldito",
    "maldita",
    "idiota",
    "imbecil",
    "pendejo",
    "pendeja",
    "cojudo",
    "cojuda",
  ]);

  return words.some((w) => banned.has(w));
}

function isValidVideoUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function getSinceDate(filter: TimeFilter): Date | null {
  const now = new Date();
  if (filter === "ALL") return null;

  if (filter === "TODAY") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (filter === "D7") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return d;
}

export default function ComentariosPage() {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  const [groupCode, setGroupCode] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const [sending, setSending] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [showPublic, setShowPublic] = useState(false);
  const [showPublicVideos, setShowPublicVideos] = useState(false);
  const [publicItems, setPublicItems] = useState<CommentRow[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [publicVideos, setPublicVideos] = useState<PublicVideoRow[]>([]);
  const [publicVideosLoading, setPublicVideosLoading] = useState(false);
  const [publicVideosError, setPublicVideosError] = useState<string | null>(null);
  const [votingVideoId, setVotingVideoId] = useState<string | null>(null);
  const [myVotedVideoId, setMyVotedVideoId] = useState<string | null>(null);
  const [videoVoteCounts, setVideoVoteCounts] = useState<Record<string, number>>({});

  const [latestOfficialWinner, setLatestOfficialWinner] = useState<LatestOfficialWinner | null>(
    null
  );
  const [latestOfficialWinnerLoading, setLatestOfficialWinnerLoading] = useState(false);
  const [latestOfficialWinnerError, setLatestOfficialWinnerError] = useState<string | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);

  const [checkingData, setCheckingData] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [savingData, setSavingData] = useState(false);
  const [videoPlatform, setVideoPlatform] = useState("YOUTUBE");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [sendingVideo, setSendingVideo] = useState(false);

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("D7");
  const [weeklyTopic, setWeeklyTopic] = useState<string>("");
  const [weeklyQuestion, setWeeklyQuestion] = useState<string>("");
  const [weeklyTopicId, setWeeklyTopicId] = useState<string>("");

  useEffect(() => {
    const g = readCookie("vc_group");
    if (g) setGroupCode(g);
    setDeviceId(getOrCreateDeviceId());

    void loadWeeklyTopic();
    void loadLatestOfficialWinner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function checkIfHasData(currentDeviceId: string) {
    setCheckingData(true);
    setDataError(null);

    try {
      const { data, error } = await supabase
        .from("reto_premio_participants")
        .select("device_id")
        .eq("device_id", currentDeviceId)
        .limit(1);

      if (error) throw new Error(error.message);

      setHasData(!!(data && data.length > 0));
    } catch (e: any) {
      setHasData(false);
      setDataError(e?.message ?? String(e));
    } finally {
      setCheckingData(false);
    }
  }

  useEffect(() => {
    if (!deviceId) return;
    void checkIfHasData(deviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  async function saveMyData() {
    setOkMsg(null);
    setErrMsg(null);
    setDataError(null);

    if (!deviceId) {
      setErrMsg("No se pudo identificar tu dispositivo. Recarga la página.");
      return;
    }

    const em = email.trim();
    const ce = celular.trim();

    if (!em && !ce) {
      setErrMsg("Escribe al menos un correo o un celular.");
      return;
    }

    setSavingData(true);
    try {
      const payload: any = {
        device_id: deviceId,
        group_code: groupCode,
      };

      if (em) payload.email = em;
      if (ce) payload.celular = ce;

      const { error } = await supabase
        .from("reto_premio_participants")
        .update(payload)
        .eq("device_id", deviceId);

      if (error) throw new Error(error.message);

      setHasData(true);
      setOkMsg("Listo. Tus datos fueron guardados. Ya puedes comentar.");
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setSavingData(false);
    }
  }

  async function loadPublicReviewed() {
    setPublicLoading(true);
    setPublicError(null);

    try {
      let q = supabase
        .from("user_comments")
        .select("id,created_at,group_code,message,status")
        .eq("status", "reviewed")
        .order("created_at", { ascending: false })
        .limit(50);

      const since = getSinceDate(timeFilter);
      if (since) {
        q = q.gte("created_at", since.toISOString());
      }

      const { data, error } = await q;

      if (error) throw new Error(error.message);

      setPublicItems((data ?? []) as CommentRow[]);
    } catch (e: any) {
      setPublicError(e?.message ?? String(e));
    } finally {
      setPublicLoading(false);
    }
  }

  async function loadPublicReviewedVideos() {
    setPublicVideosLoading(true);
    setPublicVideosError(null);

    try {
      if (!weeklyTopicId) {
        setPublicVideos([]);
        return;
      }

      const { data, error } = await supabase
        .from("weekly_video_entries")
        .select("id,created_at,weekly_topic_id,group_code,platform,video_url,title,status")
        .eq("status", "reviewed")
        .eq("weekly_topic_id", weeklyTopicId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw new Error(error.message);

      setPublicVideos((data ?? []) as PublicVideoRow[]);
    } catch (e: any) {
      setPublicVideosError(e?.message ?? String(e));
    } finally {
      setPublicVideosLoading(false);
    }
  }

  async function loadMyVoteForWeeklyTopic() {
    try {
      if (!deviceId || !weeklyTopicId) {
        setMyVotedVideoId(null);
        return;
      }

      const { data, error } = await supabase
        .from("weekly_video_votes")
        .select("weekly_video_entry_id")
        .eq("device_id", deviceId)
        .eq("weekly_topic_id", weeklyTopicId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);

      setMyVotedVideoId(data?.weekly_video_entry_id ?? null);
    } catch {
      setMyVotedVideoId(null);
    }
  }

  async function loadVideoVoteCounts() {
    try {
      if (!weeklyTopicId) {
        setVideoVoteCounts({});
        return;
      }

      const { data, error } = await supabase
        .from("weekly_video_votes")
        .select("weekly_video_entry_id")
        .eq("weekly_topic_id", weeklyTopicId);

      if (error) throw new Error(error.message);

      const counts: Record<string, number> = {};

      for (const row of data ?? []) {
        const id = String((row as any).weekly_video_entry_id ?? "");
        if (!id) continue;
        counts[id] = (counts[id] ?? 0) + 1;
      }

      setVideoVoteCounts(counts);
    } catch {
      setVideoVoteCounts({});
    }
  }

  async function loadWeeklyTopic() {
    try {
      const { data, error } = await supabase
        .from("weekly_topics")
        .select("id, topic, question")
        .eq("status", "active")
        .limit(1)
        .single();

      if (error) return;

      if (data) {
        setWeeklyTopicId(data.id);
        setWeeklyTopic(data.topic);
        setWeeklyQuestion(data.question);
      }
    } catch {}
  }

  async function loadLatestOfficialWinner() {
    setLatestOfficialWinnerLoading(true);
    setLatestOfficialWinnerError(null);

    try {
      const { data: topicData, error: topicError } = await supabase
        .from("weekly_topics")
        .select("id, topic, question, winner_video_entry_id, winner_votes, winner_published_at")
        .eq("status", "archived")
        .not("winner_video_entry_id", "is", null)
        .order("winner_published_at", { ascending: false })
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (topicError) throw new Error(topicError.message);

      if (!topicData?.winner_video_entry_id) {
        setLatestOfficialWinner(null);
        return;
      }

      const { data: videoData, error: videoError } = await supabase
        .from("weekly_video_entries")
        .select("id,created_at,weekly_topic_id,group_code,platform,video_url,title,status")
        .eq("id", topicData.winner_video_entry_id)
        .limit(1)
        .maybeSingle();

      if (videoError) throw new Error(videoError.message);

      setLatestOfficialWinner({
        topicId: topicData.id,
        topic: topicData.topic ?? "",
        question: topicData.question ?? "",
        winnerVideoEntryId: topicData.winner_video_entry_id,
        winnerVotes: Number(topicData.winner_votes ?? 0),
        winnerPublishedAt: topicData.winner_published_at ?? null,
        video: videoData
          ? ({
              id: videoData.id,
              created_at: videoData.created_at,
              weekly_topic_id: videoData.weekly_topic_id,
              group_code: videoData.group_code,
              platform: videoData.platform,
              video_url: videoData.video_url,
              title: videoData.title,
              status: videoData.status,
            } as LatestOfficialWinner["video"])
          : null,
      });
    } catch (e: any) {
      setLatestOfficialWinner(null);
      setLatestOfficialWinnerError(e?.message ?? String(e));
    } finally {
      setLatestOfficialWinnerLoading(false);
    }
  }

  useEffect(() => {
    if (!showPublic && !showPublicVideos) return;

    if (showPublic) {
      void loadPublicReviewed();
    }

    if (showPublicVideos) {
      void loadPublicReviewedVideos();
      void loadMyVoteForWeeklyTopic();
      void loadVideoVoteCounts();
    }

    const id = window.setInterval(() => {
      if (showPublic) {
        void loadPublicReviewed();
      }

      if (showPublicVideos) {
        void loadPublicReviewedVideos();
        void loadMyVoteForWeeklyTopic();
        void loadVideoVoteCounts();
      }
    }, 8000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPublic, showPublicVideos, timeFilter, weeklyTopicId, deviceId]);

  const weeklyWinner = useMemo(() => {
    if (!publicVideos.length) return null;

    const sorted = [...publicVideos].sort((a, b) => {
      const votesA = videoVoteCounts[a.id] ?? 0;
      const votesB = videoVoteCounts[b.id] ?? 0;
      return votesB - votesA;
    });

    const top = sorted[0];
    if (!top) return null;

    return {
      ...top,
      votes: videoVoteCounts[top.id] ?? 0,
    };
  }, [publicVideos, videoVoteCounts]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    if (checkingData) {
      setErrMsg("Espera un momento… estamos verificando tus datos.");
      return;
    }

    if (!hasData) {
      setErrMsg("Para comentar, primero debes registrar tu correo o celular.");
      return;
    }

    const text = message.trim();
    if (!text) {
      setErrMsg("Escribe un comentario antes de enviar.");
      return;
    }

    if (hasSoeces(text)) {
      setErrMsg(
        "Aceptamos críticas negativas, pero sin insultos ni groserías. Por favor reescribe tu comentario con respeto."
      );
      return;
    }

    setSending(true);
    try {
      const payload: any = {
        message: text,
        status: "new",
        page: "/comentarios",
        group_code: groupCode?.trim() || "GENERAL",
      };

      if (deviceId) payload.device_id = deviceId;

      const { error } = await supabase.from("user_comments").insert(payload);
      if (error) throw new Error(error.message);

      setMessage("");
      setOkMsg(
        "¡Gracias! Tu comentario fue enviado y está en revisión. Aparecerá en 'Comentarios aprobados' si cumple las normas de respeto."
      );

      if (showPublic) {
        await loadPublicReviewed();
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  }

  async function onSubmitVideo(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    if (checkingData) {
      setErrMsg("Espera un momento… estamos verificando tus datos.");
      return;
    }

    if (!hasData) {
      setErrMsg("Para participar con video, primero debes registrar tu correo o celular.");
      return;
    }

    if (!weeklyTopicId) {
      setErrMsg("No se encontró un tema semanal activo.");
      return;
    }

    const url = videoUrl.trim();
    const title = videoTitle.trim();

    if (!url) {
      setErrMsg("Pega el enlace del video.");
      return;
    }

    if (!isValidVideoUrl(url)) {
      setErrMsg("Pega un enlace válido (https://...).");
      return;
    }

    if (title.length > 120) {
      setErrMsg("El título corto no debe superar 120 caracteres.");
      return;
    }

    setSendingVideo(true);
    try {
      const payload: any = {
        weekly_topic_id: weeklyTopicId,
        device_id: deviceId,
        group_code: groupCode?.trim() || "GENERAL",
        platform: videoPlatform,
        video_url: url,
        title: title || null,
        status: "new",
      };

      const { error } = await supabase.from("weekly_video_entries").insert(payload);
      if (error) throw new Error(error.message);

      setVideoUrl("");
      setVideoTitle("");
      setVideoPlatform("YOUTUBE");

      setOkMsg(
        "Tu video fue enviado y está en revisión. Se publicará cuando sea aprobado por moderación."
      );
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setSendingVideo(false);
    }
  }

  async function voteForVideo(videoId: string) {
    setOkMsg(null);
    setErrMsg(null);

    if (checkingData) {
      setErrMsg("Espera un momento… estamos verificando tus datos.");
      return;
    }

    if (!hasData) {
      setErrMsg("Para votar, primero debes registrar tu correo o celular.");
      return;
    }

    if (!deviceId) {
      setErrMsg("No se pudo identificar tu dispositivo.");
      return;
    }

    if (!weeklyTopicId) {
      setErrMsg("No se encontró un tema semanal activo.");
      return;
    }

    if (myVotedVideoId) {
      setErrMsg("Ya registraste tu voto en este tema semanal.");
      return;
    }

    setVotingVideoId(videoId);

    try {
      const payload = {
        weekly_topic_id: weeklyTopicId,
        weekly_video_entry_id: videoId,
        device_id: deviceId,
        group_code: groupCode?.trim() || "GENERAL",
      };

      const { error } = await supabase.from("weekly_video_votes").insert(payload);
      if (error) throw new Error(error.message);

      setOkMsg("Tu voto fue registrado correctamente.");
      setMyVotedVideoId(videoId);
      await loadVideoVoteCounts();
      setMyVotedVideoId(videoId);
    } catch (e: any) {
      setErrMsg(e?.message ?? String(e));
    } finally {
      setVotingVideoId(null);
    }
  }

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const card = "mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-5 shadow-sm";
  const label = "text-xs font-extrabold text-slate-700";
  const input =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";
  const textarea =
    "mt-2 w-full min-h-[140px] rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const select =
    "mt-2 w-full rounded-xl border-2 border-red-600 bg-white px-3 py-2 text-sm font-semibold";
  const placeholderCard =
    "mt-4 rounded-2xl border-2 border-dashed border-red-500 bg-white/80 p-5 shadow-sm";

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            Comentarios ciudadanos
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
            Participa en el tema de la semana, comenta con acceso verificado y sigue
            el debate público.
            <br />
            <span className="text-xs text-slate-600">
              La participación está sujeta a control de respeto y moderación.
            </span>
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link href="/" className={btn}>
            🏠 Inicio
          </Link>
          <button type="button" onClick={goBack} className={btn}>
            ← Volver
          </button>
        </div>
      </div>
            {/* BLOQUE 1: Acceso verificado */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Acceso verificado
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Para comentar en esta sección, primero debes registrar por lo menos un
          correo o un celular. Tus datos no se muestran públicamente.
        </p>

        {okMsg ? (
          <div className="mt-4 rounded-xl border-2 border-green-700 bg-white p-3 text-sm font-bold text-green-800">
            {okMsg}
          </div>
        ) : null}

        {errMsg ? (
          <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
            Error: {errMsg}
          </div>
        ) : null}

        {dataError ? (
          <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
            Error al verificar datos: {dataError}
          </div>
        ) : null}

        {checkingData ? (
          <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-slate-800">
            Verificando si ya registraste tus datos…
          </div>
        ) : null}

        {!checkingData && !hasData ? (
          <div className="mt-4 grid gap-4">
            <div className="rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-slate-800">
              Para poder comentar, registra por lo menos un correo o un celular.
              <div className="mt-1 text-xs text-slate-600">
                Si ya dejaste tus datos en otra sección, toca “Ya dejé mis datos” para verificar.
              </div>
            </div>

            <div>
              <div className={label}>Correo (opcional si pones celular)</div>
              <input
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@dominio.com"
              />
            </div>

            <div>
              <div className={label}>Celular (opcional si pones correo)</div>
              <input
                className={input}
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                placeholder="999888777"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="button" className={btn} onClick={saveMyData} disabled={savingData}>
                {savingData ? "Guardando..." : "Guardar mis datos"}
              </button>

              <button
                type="button"
                className={btn}
                onClick={() => deviceId && checkIfHasData(deviceId)}
                disabled={savingData}
              >
                🔄 Ya dejé mis datos (verificar)
              </button>
            </div>
          </div>
        ) : null}

        {!checkingData && hasData ? (
          <div className="mt-4 rounded-2xl border-2 border-green-700 bg-green-50 p-4">
            <div className="text-sm font-extrabold text-green-800">Acceso habilitado</div>
            <div className="mt-1 text-sm font-semibold text-slate-800 leading-relaxed">
              Ya puedes comentar en el tema activo y participar en las próximas
              dinámicas de esta sección.
            </div>
          </div>
        ) : null}
      </section>

      {/* BLOQUE 2: Tema de la semana */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Tema de la semana
        </h2>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50/70 p-4">
          <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            Tema
          </div>
          <div className="mt-1 text-xl md:text-2xl font-extrabold text-slate-900">
            {weeklyTopic || "Tema en preparación"}
          </div>

          <div className="mt-4 text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            Pregunta guía
          </div>
          <div className="mt-1 text-sm md:text-base font-semibold text-slate-800 leading-relaxed">
            {weeklyQuestion}
          </div>

          <div className="mt-4 text-xs text-slate-600 font-semibold">
            Estado actual: abierto para comentarios ciudadanos.
          </div>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4">
          <div className="text-sm font-extrabold text-slate-900">
            🏆 Último ganador oficial
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Resultado ya cerrado y publicado oficialmente.
          </div>

          {latestOfficialWinnerError ? (
            <div className="mt-3 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
              Error al cargar ganador oficial: {latestOfficialWinnerError}
            </div>
          ) : null}

          {latestOfficialWinnerLoading ? (
            <div className="mt-3 text-sm font-semibold text-slate-700">
              Cargando ganador oficial...
            </div>
          ) : null}

          {!latestOfficialWinnerLoading && !latestOfficialWinnerError && !latestOfficialWinner ? (
            <div className="mt-3 text-sm font-semibold text-slate-700">
              Aún no hay un ganador oficial publicado.
            </div>
          ) : null}

          {!latestOfficialWinnerLoading && !latestOfficialWinnerError && latestOfficialWinner ? (
            <div className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50/70 p-4">
              <div className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                Tema ganador cerrado
              </div>
              <div className="mt-1 text-base md:text-lg font-extrabold text-slate-900">
                {latestOfficialWinner.topic}
              </div>

              {latestOfficialWinner.question ? (
                <>
                  <div className="mt-4 text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                    Pregunta guía
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-800 leading-relaxed">
                    {latestOfficialWinner.question}
                  </div>
                </>
              ) : null}

              <div className="mt-4 text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                Video ganador
              </div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">
                {latestOfficialWinner.video?.title || "Participación ciudadana destacada"}
              </div>

              {latestOfficialWinner.video?.platform ? (
                <div className="mt-1 text-sm font-semibold text-slate-700">
                  Plataforma: {latestOfficialWinner.video.platform}
                </div>
              ) : null}

              {latestOfficialWinner.video?.group_code ? (
                <div className="mt-1 text-sm font-semibold text-slate-700">
                  Grupo: {latestOfficialWinner.video.group_code}
                </div>
              ) : null}

              <div className="mt-1 text-sm font-extrabold text-slate-800">
                Votos oficiales: {latestOfficialWinner.winnerVotes}
              </div>

              {latestOfficialWinner.winnerPublishedAt ? (
                <div className="mt-1 text-xs font-semibold text-slate-600">
                  Publicado: {new Date(latestOfficialWinner.winnerPublishedAt).toLocaleString()}
                </div>
              ) : null}

              {latestOfficialWinner.video?.video_url ? (
                <a
                  href={latestOfficialWinner.video.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold hover:bg-green-900 transition shadow-sm"
                >
                  ▶ Ver video ganador oficial
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* BLOQUE 3: Comentario del tema */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Tu comentario sobre el tema de la semana
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Puedes opinar, criticar o proponer, pero siempre con respeto.
        </p>

        {!checkingData && hasData ? (
          <form onSubmit={onSubmit} className="grid gap-4 mt-4">
            <div>
              <div className={label}>Grupo (opcional)</div>
              <input
                className={input}
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                placeholder="Ej: GRUPOA"
              />
              <div className="mt-1 text-xs text-slate-600">
                Si vienes desde un pitch, esto se llena automáticamente.
              </div>
            </div>

            <div>
              <div className={label}>Comentario</div>
              <textarea
                className={textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe aquí tu opinión sobre el tema de la semana..."
                maxLength={500}
              />
              <div className="mt-1 text-xs text-slate-600">Máximo 500 caracteres.</div>
            </div>

            <button type="submit" className={btn} disabled={sending}>
              {sending ? "Enviando..." : "Enviar comentario"}
            </button>
          </form>
        ) : (
          !checkingData && (
            <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-4 text-sm font-semibold text-slate-700">
              Primero activa tu acceso verificado para poder comentar en este tema.
            </div>
          )
        )}
      </section>

      {/* BLOQUE 4: Comentarios aprobados */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Comentarios aprobados
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Los comentarios enviados no aparecen de inmediato. Primero pasan por revisión
          y luego se publican si son aprobados.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
          <div className={label}>Mostrar</div>
          <select
            className={select}
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
          >
            <option value="TODAY">Hoy</option>
            <option value="D7">Últimos 7 días</option>
            <option value="D30">Últimos 30 días</option>
            <option value="ALL">Todos</option>
          </select>

          <button
            type="button"
            className={btn + " w-full mt-3"}
            onClick={async () => {
              const next = !showPublic;
              setShowPublic(next);

              if (next && publicItems.length === 0 && !publicLoading) {
                await loadPublicReviewed();
              }
            }}
          >
            {showPublic ? "▲ Ocultar comentarios publicados" : "▼ Ver comentarios publicados"}
          </button>

          {showPublic ? (
            <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
              <div className="text-sm font-extrabold text-slate-900">
                Comentarios aprobados
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Se actualiza automáticamente cada pocos segundos.
              </div>

              {publicError ? (
                <div className="mt-3 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
                  Error al cargar comentarios: {publicError}
                </div>
              ) : null}

              {publicLoading ? (
                <div className="mt-3 text-sm font-semibold text-slate-700">Cargando...</div>
              ) : null}

              {!publicLoading && !publicError && publicItems.length === 0 ? (
                <div className="mt-3 text-sm font-semibold text-slate-700">
                  Aún no hay comentarios publicados.
                </div>
              ) : null}

              <div className="mt-3 space-y-3">
                {publicItems.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                  >
                    <div className="text-xs font-extrabold text-slate-900">
                      {c.group_code} • {new Date(c.created_at).toLocaleString()}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                      {c.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* BLOQUE 5: Yo Político */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          YO POLÍTICO DE LA SEMANA
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Graba un video corto en TikTok, YouTube, Facebook u otra plataforma sobre el
          tema de la semana y pega aquí tu enlace para participar.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-green-50/60 p-4">
          <div className="text-sm font-extrabold text-slate-900">Reglas básicas</div>
          <ul className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed pl-5 list-disc">
            <li>Un video por usuario por semana.</li>
            <li>Debe responder al tema semanal activo.</li>
            <li>Debe mantener respeto y claridad.</li>
            <li>Primero pasa por revisión antes de publicarse.</li>
          </ul>
        </div>

        {!checkingData && hasData ? (
          <form onSubmit={onSubmitVideo} className="grid gap-4 mt-4">
            <div>
              <div className={label}>Plataforma</div>
              <select
                className={select}
                value={videoPlatform}
                onChange={(e) => setVideoPlatform(e.target.value)}
              >
                <option value="YOUTUBE">YouTube</option>
                <option value="TIKTOK">TikTok</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="OTRA">Otra</option>
              </select>
            </div>

            <div>
              <div className={label}>Título corto (opcional)</div>
              <input
                className={input}
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="Ej: Mi propuesta contra la corrupción"
                maxLength={120}
              />
            </div>

            <div>
              <div className={label}>Enlace del video</div>
              <input
                className={input}
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <button type="submit" className={btn} disabled={sendingVideo}>
              {sendingVideo ? "Enviando video..." : "Enviar video"}
            </button>
          </form>
        ) : (
          !checkingData && (
            <div className="mt-4 rounded-xl border-2 border-red-600 bg-white p-4 text-sm font-semibold text-slate-700">
              Primero activa tu acceso verificado para participar con video.
            </div>
          )
        )}
      </section>

      {/* BLOQUE 6: Videos aprobados – YO POLÍTICO */}
      <section className={card}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Videos aprobados – YO POLÍTICO
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Aquí se muestran por separado las participaciones en video aprobadas del tema semanal activo.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
          <button
            type="button"
            className={btn + " w-full"}
            onClick={async () => {
              const next = !showPublicVideos;
              setShowPublicVideos(next);

              if (next) {
                if (publicVideos.length === 0 && !publicVideosLoading) {
                  await loadPublicReviewedVideos();
                }
                await loadMyVoteForWeeklyTopic();
                await loadVideoVoteCounts();
              }
            }}
          >
            {showPublicVideos ? "▲ Ocultar videos aprobados" : "▼ Ver videos aprobados"}
          </button>

          {showPublicVideos ? (
            <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/85 p-4">
              <div className="text-sm font-extrabold text-slate-900">
                Videos aprobados – YO POLÍTICO
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Se actualiza automáticamente cada pocos segundos.
              </div>

              {publicVideosError ? (
                <div className="mt-3 rounded-xl border-2 border-red-600 bg-white p-3 text-sm font-bold text-red-700">
                  Error al cargar videos: {publicVideosError}
                </div>
              ) : null}

              {publicVideosLoading ? (
                <div className="mt-3 text-sm font-semibold text-slate-700">
                  Cargando videos...
                </div>
              ) : null}

              {!publicVideosLoading && !publicVideosError && publicVideos.length === 0 ? (
                <div className="mt-3 text-sm font-semibold text-slate-700">
                  Aún no hay videos aprobados para este tema.
                </div>
              ) : null}

              {weeklyWinner ? (
                <div className="mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4">
                  <div className="text-sm font-extrabold text-slate-900">
                    🏆 Político de la semana
                  </div>
                  <div className="mt-2 text-base font-extrabold text-slate-900">
                    {weeklyWinner.title || "Participación ciudadana destacada"}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">
                    Plataforma: {weeklyWinner.platform}
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-800">
                    Votos: {weeklyWinner.votes}
                  </div>

                  <a
                    href={weeklyWinner.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold hover:bg-green-900 transition shadow-sm"
                  >
                    ▶ Ver video ganador
                  </a>
                </div>
              ) : null}

              <div className="mt-3 space-y-3">
                {publicVideos.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-2xl border-2 border-red-600 bg-white/90 p-4"
                  >
                    <div className="text-xs font-extrabold text-slate-900">
                      {v.group_code} • {new Date(v.created_at).toLocaleString()}
                    </div>

                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      Plataforma: {v.platform}
                    </div>

                    <div className="mt-1 text-xs font-extrabold text-slate-700">
                      Votos: {videoVoteCounts[v.id] ?? 0}
                    </div>

                    {v.title ? (
                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {v.title}
                      </div>
                    ) : null}

                    <div className="mt-2 text-xs text-slate-600 break-all">
                      {v.video_url}
                    </div>

                    <div className="mt-3 flex gap-2 flex-wrap">
                      <a
                        href={v.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold hover:bg-green-900 transition shadow-sm"
                      >
                        ▶ Ver video
                      </a>

                      <button
                        type="button"
                        onClick={() => voteForVideo(v.id)}
                        disabled={!!myVotedVideoId || votingVideoId === v.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 border-2 border-red-600 bg-slate-800 text-white text-xs font-extrabold hover:bg-slate-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {votingVideoId === v.id
                          ? "Votando..."
                          : myVotedVideoId === v.id
                          ? "✅ Tu voto"
                          : myVotedVideoId
                          ? "Voto cerrado"
                          : "🗳 Votar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* BLOQUE 7: Debates anteriores */}
      <section className={placeholderCard}>
        <h2 className="text-lg md:text-xl font-extrabold text-slate-900">
          Debates anteriores
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 leading-relaxed">
          Aquí se archivarán los temas semanales, sus comentarios aprobados,
          participaciones destacadas y resultados.
        </p>

        <div className="mt-4 rounded-2xl border-2 border-red-600 bg-white/90 p-4">
          <div className="text-sm font-extrabold text-slate-900">Archivo histórico</div>
          <div className="mt-2 text-sm font-semibold text-slate-700">
            Próximamente se mostrará el historial de temas de debate ciudadano.
          </div>
        </div>
      </section>

      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 right-5 rounded-full border-2 border-red-600 bg-green-800 text-white font-extrabold px-4 py-3 shadow-sm hover:bg-green-900"
          aria-label="Subir"
          title="Subir"
        >
          ⬆ Subir
        </button>
      ) : null}
    </main>
  );
}
// src/app/admin/solo-ganadores/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";

type Tab = "evento" | "ganadores" | "media";

type SoloEvent = {
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
  created_at: string | null;
};

type SoloPost = {
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
  created_at: string | null;
};

type SoloMedia = {
  id: string;
  title: string;
  media_type: string;
  media_url: string;
  description: string | null;
  related_winner_id: string | null;
  published: boolean;
  featured: boolean;
  created_at: string | null;
};

type AdminSoloGanadoresApiResponse =
  | {
      ok: true;
      events: SoloEvent[];
      posts: SoloPost[];
      media: SoloMedia[];
    }
  | {
      ok: false;
      error?: string;
    };

type AdminSaveResource = "event" | "post" | "media";

type AdminSaveResponse =
  | {
      ok: true;
      id: string;
    }
  | {
      ok: false;
      error?: string;
    };

type AdminCreateAssets =
  | {
      main_image_url: string | null;
      promo_video_url: string | null;
    }
  | {
      photo_url: string | null;
      video_url: string | null;
    }
  | {
      media_url: string | null;
    };

type AdminImagePurpose =
  | "event_main_image"
  | "post_photo"
  | "media_image";

type AdminPendingAsset = {
  assetId: string;
  path: string;
  url: string;
  purpose:
    | "event_main_image"
    | "event_promo_video"
    | "post_photo"
    | "post_video"
    | "media_image"
    | "media_video";
};

type AdminImageUploadResponse =
  | {
      ok: true;
      assetId: string;
      url: string;
      path: string;
    }
  | {
      ok: false;
      error?: string;
    };

type AdminVideoPurpose =
  | "event_promo_video"
  | "post_video"
  | "media_video";

type AdminVideoAuthorizationResponse =
  | {
      ok: true;
      assetId: string;
      token: string;
      path: string;
      url: string;
      endpoint: string;
      maxBytes: number;
    }
  | {
      ok: false;
      error?: string;
    };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ADMIN_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const VIDEO_MIME = "video/mp4";

const emptyEvent = {
  id: "",
  title: "",
  semester: "",
  event_date: "",
  location_name: "",
  address: "",
  city: "",
  description: "",
  recognitions: "",
  main_image_url: "",
  promo_video_url: "",
  status: "anunciado",
  published: false,
  featured: false,
};

const emptyPost = {
  id: "",
  source_module: "manual",
  source_winner_id: "",
  winner_name: "",
  winner_alias: "",
  title: "",
  prize_name: "",
  description: "",
  photo_url: "",
  video_url: "",
  interview_url: "",
  event_date: "",
  published: false,
  featured: false,
};

const emptyMedia = {
  id: "",
  title: "",
  media_type: "foto",
  media_url: "",
  description: "",
  related_winner_id: "",
  published: false,
  featured: false,
};

function cleanNullable(value: string) {
  const v = String(value || "").trim();
  return v ? v : null;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("es-PE");
  } catch {
    return value;
  }
}

function getLastExtension(fileName: string) {
  const clean = fileName.trim().toLowerCase();
  const lastDot = clean.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === clean.length - 1) return null;

  return clean.slice(lastDot + 1);
}

function expectedMediaPurpose(mediaType: string) {
  if (mediaType === "video") return "media_video";
  if (
    mediaType === "foto" ||
    mediaType === "ambiente" ||
    mediaType === "entrega" ||
    mediaType === "reconocimiento"
  ) {
    return "media_image";
  }

  return null;
}

function isDirectVideoUrl(url: string) {
  const u = String(url || "").toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov");
}

function isImageUrl(url: string) {
  const u = String(url || "").toLowerCase();
  return (
    u.endsWith(".jpg") ||
    u.endsWith(".jpeg") ||
    u.endsWith(".png") ||
    u.endsWith(".webp") ||
    u.endsWith(".gif") ||
    u.includes("/storage/v1/object/public/")
  );
}

function youtubeEmbedUrl(url: string) {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const u = new URL(raw);

    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }

    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}

  return "";
}

function errorText(err: any) {
  return (
    err?.message ||
    err?.details ||
    err?.hint ||
    err?.code ||
    JSON.stringify(err) ||
    "Error desconocido"
  );
}

export default function AdminSoloGanadoresPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("evento");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);

  const [events, setEvents] = useState<SoloEvent[]>([]);
  const [posts, setPosts] = useState<SoloPost[]>([]);
  const [media, setMedia] = useState<SoloMedia[]>([]);

  const [eventForm, setEventForm] = useState(emptyEvent);
  const [postForm, setPostForm] = useState(emptyPost);
  const [mediaForm, setMediaForm] = useState(emptyMedia);
  const [eventMainImageAsset, setEventMainImageAsset] =
    useState<AdminPendingAsset | null>(null);
  const [eventPromoVideoAsset, setEventPromoVideoAsset] =
    useState<AdminPendingAsset | null>(null);
  const [postPhotoAsset, setPostPhotoAsset] = useState<AdminPendingAsset | null>(null);
  const [postVideoAsset, setPostVideoAsset] = useState<AdminPendingAsset | null>(null);
  const [mediaAsset, setMediaAsset] = useState<AdminPendingAsset | null>(null);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/admin");
  }

  async function uploadAdminImage(file: File, purpose: AdminImagePurpose) {
    setUploading(true);
    setMessage(null);

    try {
      if (
        file.size <= 0 ||
        file.size > MAX_IMAGE_BYTES ||
        !ADMIN_IMAGE_MIME_TYPES.has(file.type)
      ) {
        throw new Error("Solicitud inválida");
      }

      const body = new FormData();
      body.append("purpose", purpose);
      body.append("file", file);

      const res = await fetch("/api/admin/solo-ganadores/upload", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        body,
      });

      const result = (await res
        .json()
        .catch(() => null)) as AdminImageUploadResponse | null;

      if (!res.ok || !result) {
        throw new Error("No disponible");
      }

      if (result.ok !== true) {
        throw new Error(result.error || "No disponible");
      }

      if (!result.assetId || !result.url || !result.path) {
        throw new Error("No disponible");
      }

      setMessage({ type: "success", text: "✅ Archivo subido correctamente." });
      return {
        assetId: result.assetId,
        path: result.path,
        url: result.url,
        purpose,
      };
    } catch (err) {
      const text = errorText(err);
      setMessage({ type: "error", text: "Error al subir archivo: " + text });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function hasInitialFtyp(file: File) {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    return (
      bytes.byteLength >= 8 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    );
  }

  async function requestVideoUploadAuthorization(
    file: File,
    purpose: AdminVideoPurpose
  ) {
    const res = await fetch("/api/admin/solo-ganadores/video-upload-url", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        purpose,
        fileName: file.name,
        mime: file.type,
        size: file.size,
      }),
    });

    const result = (await res
      .json()
      .catch(() => null)) as AdminVideoAuthorizationResponse | null;

    if (!res.ok || !result) {
      throw new Error("No disponible");
    }

    if (result.ok !== true) {
      throw new Error(result.error || "No disponible");
    }

    if (
      !result.assetId ||
      !result.token ||
      !result.path ||
      !result.url ||
      !result.endpoint ||
      result.maxBytes !== MAX_VIDEO_BYTES
    ) {
      throw new Error("No disponible");
    }

    return result;
  }

  async function uploadAdminVideo(file: File, purpose: AdminVideoPurpose) {
    setUploading(true);
    setMessage(null);
    setVideoUploadProgress(0);

    try {
      if (
        file.size <= 0 ||
        file.size > MAX_VIDEO_BYTES ||
        file.type !== VIDEO_MIME ||
        getLastExtension(file.name) !== "mp4"
      ) {
        throw new Error("Solicitud inválida");
      }

      const hasFtyp = await hasInitialFtyp(file);
      if (!hasFtyp) {
        throw new Error("Solicitud inválida");
      }

      const authorization = await requestVideoUploadAuthorization(file, purpose);
      let lastProgress = -1;

      const asset = await new Promise<AdminPendingAsset>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: authorization.endpoint,
          headers: {
            "x-signature": authorization.token,
          },
          retryDelays: [0, 3000, 5000, 10000, 20000],
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: "solo-ganadores",
            objectName: authorization.path,
            contentType: VIDEO_MIME,
            cacheControl: "3600",
          },
          onError: () => {
            reject(new Error("No disponible"));
          },
          onProgress: (bytesSent, bytesTotal) => {
            if (bytesTotal <= 0) return;

            const progress = Math.max(
              0,
              Math.min(100, Math.round((bytesSent / bytesTotal) * 100))
            );

            if (progress !== lastProgress) {
              lastProgress = progress;
              setVideoUploadProgress(progress);
            }
          },
          onSuccess: () => {
            if (!authorization.url) {
              reject(new Error("No disponible"));
              return;
            }

            resolve({
              assetId: authorization.assetId,
              path: authorization.path,
              url: authorization.url,
              purpose,
            });
          },
        });

        upload.start();
      });

      setMessage({ type: "success", text: "✅ Archivo subido correctamente." });
      return asset;
    } catch (err) {
      const text = errorText(err);
      setMessage({ type: "error", text: "Error al subir archivo: " + text });
      return null;
    } finally {
      setVideoUploadProgress(null);
      setUploading(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/solo-ganadores", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      const data = (await res.json().catch(() => null)) as
        | AdminSoloGanadoresApiResponse
        | null;

      if (!res.ok || !data) {
        throw new Error("No disponible");
      }

      if (data.ok !== true) {
        throw new Error(data.error || "No disponible");
      }

      setEvents(data.events);
      setPosts(data.posts);
      setMedia(data.media);
    } catch (err) {
      const text = errorText(err);
      console.error("Error al cargar datos:", err);
      setEvents([]);
      setPosts([]);
      setMedia([]);
      setMessage({ type: "error", text: "Error al cargar datos: " + text });
    } finally {
      setLoading(false);
    }
  }

  async function saveAdminResource(
    resource: AdminSaveResource,
    id: string,
    data: Record<string, string | boolean | null>,
    assets?: AdminCreateAssets
  ) {
    const isUpdate = Boolean(id);
    const res = await fetch("/api/admin/solo-ganadores", {
      method: isUpdate ? "PATCH" : "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        isUpdate
          ? {
              resource,
              id,
              data,
            }
          : {
              resource,
              data,
              assets,
            }
      ),
    });

    const result = (await res.json().catch(() => null)) as AdminSaveResponse | null;

    if (!res.ok || !result) {
      throw new Error("No disponible");
    }

    if (result.ok !== true) {
      throw new Error(result.error || "No disponible");
    }

    return result.id;
  }

  async function deleteAdminResource(resource: AdminSaveResource, id: string) {
    const res = await fetch("/api/admin/solo-ganadores", {
      method: "DELETE",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resource,
        id,
      }),
    });

    const result = (await res.json().catch(() => null)) as AdminSaveResponse | null;

    if (!res.ok || !result) {
      throw new Error("No disponible");
    }

    if (result.ok !== true) {
      throw new Error(result.error || "No disponible");
    }

    return result.id;
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        if (!data?.session) {
          router.replace("/admin/login");
          return;
        }

        await loadAll();
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase.auth]);

  async function saveEvent() {
    if (!eventForm.title.trim()) {
      setMessage({ type: "error", text: "El evento necesita un título." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        title: eventForm.title.trim(),
        semester: cleanNullable(eventForm.semester),
        event_date: cleanNullable(eventForm.event_date),
        location_name: cleanNullable(eventForm.location_name),
        address: cleanNullable(eventForm.address),
        city: cleanNullable(eventForm.city),
        description: cleanNullable(eventForm.description),
        recognitions: cleanNullable(eventForm.recognitions),
        main_image_url: cleanNullable(eventForm.main_image_url),
        promo_video_url: cleanNullable(eventForm.promo_video_url),
        status: eventForm.status || "anunciado",
        published: Boolean(eventForm.published),
        featured: Boolean(eventForm.featured),
      };

      await saveAdminResource("event", eventForm.id, payload, {
        main_image_url: eventMainImageAsset?.assetId ?? null,
        promo_video_url: eventPromoVideoAsset?.assetId ?? null,
      });

      setEventForm(emptyEvent);
      setEventMainImageAsset(null);
      setEventPromoVideoAsset(null);
      setMessage({ type: "success", text: "✅ Evento guardado correctamente." });
      await loadAll();
    } catch (err: any) {
      const text = errorText(err);
      console.error("Error al guardar evento:", err);
      setMessage({ type: "error", text: "Error al guardar evento: " + text });
    } finally {
      setSaving(false);
    }
  }

  async function savePost() {
    if (!postForm.title.trim()) {
      setMessage({ type: "error", text: "El ganador necesita un título." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        source_module: postForm.source_module || "manual",
        source_winner_id: cleanNullable(postForm.source_winner_id),
        winner_name: cleanNullable(postForm.winner_name),
        winner_alias: cleanNullable(postForm.winner_alias),
        title: postForm.title.trim(),
        prize_name: cleanNullable(postForm.prize_name),
        description: cleanNullable(postForm.description),
        photo_url: cleanNullable(postForm.photo_url),
        video_url: cleanNullable(postForm.video_url),
        interview_url: cleanNullable(postForm.interview_url),
        event_date: cleanNullable(postForm.event_date),
        published: Boolean(postForm.published),
        featured: Boolean(postForm.featured),
      };

      await saveAdminResource("post", postForm.id, payload, {
        photo_url: postPhotoAsset?.assetId ?? null,
        video_url: postVideoAsset?.assetId ?? null,
      });

      setPostForm(emptyPost);
      setPostPhotoAsset(null);
      setPostVideoAsset(null);
      setMessage({ type: "success", text: "✅ Ganador guardado correctamente." });
      await loadAll();
    } catch (err: any) {
      const text = errorText(err);
      console.error("Error al guardar ganador:", err);
      setMessage({ type: "error", text: "Error al guardar ganador: " + text });
    } finally {
      setSaving(false);
    }
  }

  async function saveMedia() {
    if (!mediaForm.title.trim()) {
      setMessage({ type: "error", text: "El contenido necesita un título." });
      return;
    }

    if (!mediaForm.media_url.trim()) {
      setMessage({ type: "error", text: "Debes colocar la URL del archivo o video." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        title: mediaForm.title.trim(),
        media_type: mediaForm.media_type || "foto",
        media_url: mediaForm.media_url.trim(),
        description: cleanNullable(mediaForm.description),
        related_winner_id: cleanNullable(mediaForm.related_winner_id),
        published: Boolean(mediaForm.published),
        featured: Boolean(mediaForm.featured),
      };

      await saveAdminResource("media", mediaForm.id, payload, {
        media_url: mediaAsset?.assetId ?? null,
      });

      setMediaForm(emptyMedia);
      setMediaAsset(null);
      setMessage({ type: "success", text: "✅ Contenido guardado correctamente." });
      await loadAll();
    } catch (err: any) {
      const text = errorText(err);
      console.error("Error al guardar contenido:", err);
      setMessage({ type: "error", text: "Error al guardar contenido: " + text });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(resource: AdminSaveResource, id: string) {
    if (!confirm("¿Seguro que deseas eliminar este registro?")) return;

    setSaving(true);
    setMessage(null);

    try {
      await deleteAdminResource(resource, id);

      setMessage({ type: "success", text: "✅ Registro eliminado." });
      await loadAll();
    } catch (err: any) {
      const text = errorText(err);
      console.error("Error al eliminar:", err);
      setMessage({ type: "error", text: "Error al eliminar: " + text });
    } finally {
      setSaving(false);
    }
  }

  const wrap =
    "min-h-screen px-4 sm:px-6 py-8 max-w-6xl mx-auto bg-gradient-to-b from-green-50 via-white to-green-100";
  const sectionWrap =
    "mt-4 rounded-2xl border-4 border-red-700 bg-green-50/70 p-4 shadow-sm";
  const inner = "rounded-2xl border-2 border-red-600 bg-white/85 p-4";
  const card = "rounded-2xl border-2 border-red-600 bg-white/90 p-4 shadow-sm";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-sm font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const btnSm =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 " +
    "border-2 border-red-600 bg-green-800 text-white text-xs font-extrabold " +
    "hover:bg-green-900 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const input =
    "w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700";
  const label = "block text-xs font-extrabold text-slate-700 mb-1";
  const fileInput =
    "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700";

  function MediaPreview({ url, labelText }: { url: string; labelText: string }) {
    const clean = String(url || "").trim();
    if (!clean) return null;

    const embed = youtubeEmbedUrl(clean);

    return (
      <div className="mt-3 rounded-xl border border-slate-300 bg-white p-2">
        <div className="mb-2 text-xs font-extrabold text-slate-700">{labelText}</div>

        {embed ? (
          <iframe
            src={embed}
            title={labelText}
            className="h-56 w-full rounded-lg bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : isDirectVideoUrl(clean) ? (
          <video src={clean} controls className="max-h-56 w-full rounded-lg bg-black" />
        ) : isImageUrl(clean) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clean}
            alt={labelText}
            className="max-h-48 w-full rounded-lg object-contain bg-slate-50"
          />
        ) : (
          <a
            href={clean}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-extrabold text-green-800 underline break-all"
          >
            Abrir enlace
          </a>
        )}
      </div>
    );
  }

  if (checking) {
    return (
      <main className={wrap}>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
          Admin Solo para ganadores
        </h1>

        <section className={sectionWrap}>
          <div className={inner}>
            <div className="text-sm font-extrabold text-slate-900">Cargando…</div>
            <div className="mt-2 text-sm font-semibold text-slate-700">
              Verificando sesión de administrador.
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={wrap}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            Admin Solo para ganadores
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            Gestiona evento del semestre, ganadores, fotos, videos, entrevistas y reconocimientos.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link href="/solo-para-ganadores" className={btnSm}>
            🏆 Ver ventana pública
          </Link>
          <Link href="/admin" className={btnSm}>
            ⚙️ Admin Central
          </Link>
          <button type="button" onClick={goBack} className={btnSm}>
            ← Volver
          </button>
        </div>
      </div>

      {message ? (
        <div
          className={[
            "mt-4 rounded-xl border p-3 text-sm font-bold",
            message.type === "success"
              ? "bg-green-100 border-green-500 text-green-800"
              : "bg-red-100 border-red-500 text-red-800",
          ].join(" ")}
        >
          {message.text}
        </div>
      ) : null}

      {uploading ? (
        <div className="mt-4 rounded-xl border border-blue-400 bg-blue-50 p-3 text-sm font-bold text-blue-800">
          Subiendo archivo… espera unos segundos antes de guardar.
          {videoUploadProgress !== null ? (
            <div className="mt-1">Subiendo video: {videoUploadProgress}%</div>
          ) : null}
        </div>
      ) : null}

      <section className={sectionWrap}>
        <div className={inner}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("evento")}
              className={
                tab === "evento"
                  ? btnSm
                  : btnSm.replace("bg-green-800 text-white", "bg-white text-slate-900")
              }
            >
              🗓️ Evento
            </button>

            <button
              type="button"
              onClick={() => setTab("ganadores")}
              className={
                tab === "ganadores"
                  ? btnSm
                  : btnSm.replace("bg-green-800 text-white", "bg-white text-slate-900")
              }
            >
              🏅 Ganadores
            </button>

            <button
              type="button"
              onClick={() => setTab("media")}
              className={
                tab === "media"
                  ? btnSm
                  : btnSm.replace("bg-green-800 text-white", "bg-white text-slate-900")
              }
            >
              📸 Galería
            </button>

            <button type="button" onClick={loadAll} className={btnSm + " ml-auto"} disabled={loading}>
              {loading ? "Cargando…" : "↻ Refrescar"}
            </button>
          </div>
        </div>
      </section>

      {tab === "evento" ? (
        <section className={sectionWrap}>
          <div className={inner}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-extrabold text-slate-900">
                  🗓️ Evento del semestre
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  Publica lugar, fecha, ambiente, reconocimientos, imagen y video del evento.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEventForm(emptyEvent);
                  setEventMainImageAsset(null);
                  setEventPromoVideoAsset(null);
                }}
                className={btnSm}
              >
                + Nuevo evento
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-extrabold text-slate-900">
                  1. Datos principales del evento
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Título del evento *</label>
                    <input
                      className={input}
                      value={eventForm.title}
                      onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Evento de reconocimiento ciudadano"
                    />
                  </div>

                  <div>
                    <label className={label}>Semestre</label>
                    <input
                      className={input}
                      value={eventForm.semester}
                      onChange={(e) => setEventForm((p) => ({ ...p, semester: e.target.value }))}
                      placeholder="2026-I"
                    />
                  </div>

                  <div>
                    <label className={label}>Fecha</label>
                    <input
                      type="date"
                      className={input}
                      value={eventForm.event_date}
                      onChange={(e) => setEventForm((p) => ({ ...p, event_date: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className={label}>Estado</label>
                    <select
                      className={input}
                      value={eventForm.status}
                      onChange={(e) => setEventForm((p) => ({ ...p, status: e.target.value }))}
                    >
                      <option value="anunciado">Anunciado</option>
                      <option value="activo">Activo</option>
                      <option value="finalizado">Finalizado</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-extrabold text-slate-900">
                  2. Lugar y ubicación
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Lugar / ambiente</label>
                    <input
                      className={input}
                      value={eventForm.location_name}
                      onChange={(e) =>
                        setEventForm((p) => ({ ...p, location_name: e.target.value }))
                      }
                      placeholder="Auditorio principal"
                    />
                  </div>

                  <div>
                    <label className={label}>Ciudad</label>
                    <input
                      className={input}
                      value={eventForm.city}
                      onChange={(e) => setEventForm((p) => ({ ...p, city: e.target.value }))}
                      placeholder="Lima"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={label}>Dirección</label>
                    <input
                      className={input}
                      value={eventForm.address}
                      onChange={(e) => setEventForm((p) => ({ ...p, address: e.target.value }))}
                      placeholder="Dirección del evento"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-extrabold text-slate-900">
                  3. Descripción y reconocimientos
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={label}>Descripción del evento</label>
                    <textarea
                      className={input + " min-h-24"}
                      value={eventForm.description}
                      onChange={(e) =>
                        setEventForm((p) => ({ ...p, description: e.target.value }))
                      }
                      placeholder="Describe el evento, los ambientes, invitados y finalidad."
                    />
                  </div>

                  <div>
                    <label className={label}>Reconocimientos</label>
                    <textarea
                      className={input + " min-h-24"}
                      value={eventForm.recognitions}
                      onChange={(e) =>
                        setEventForm((p) => ({ ...p, recognitions: e.target.value }))
                      }
                      placeholder="Reconocimientos, premios, menciones especiales."
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-extrabold text-slate-900">
                  4. Imagen, video y publicación
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>URL imagen principal</label>
                    <input
                      className={input}
                      value={eventForm.main_image_url}
                      onChange={(e) => {
                        if (eventMainImageAsset) setEventMainImageAsset(null);
                        setEventForm((p) => ({ ...p, main_image_url: e.target.value }));
                      }}
                      placeholder="URL de imagen"
                    />

                    <input
                      type="file"
                      accept="image/*"
                      className={fileInput}
                      disabled={uploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const asset = await uploadAdminImage(file, "event_main_image");
                        if (asset) {
                          setEventMainImageAsset(asset);
                          setEventForm((p) => ({ ...p, main_image_url: asset.url }));
                        }
                        e.currentTarget.value = "";
                      }}
                    />

                    <MediaPreview url={eventForm.main_image_url} labelText="Vista previa de imagen" />
                  </div>

                  <div>
                    <label className={label}>URL video promocional</label>
                    <input
                      className={input}
                      value={eventForm.promo_video_url}
                      onChange={(e) => {
                        if (eventPromoVideoAsset) setEventPromoVideoAsset(null);
                        setEventForm((p) => ({ ...p, promo_video_url: e.target.value }));
                      }}
                      placeholder="URL de video o YouTube"
                    />

                    <input
                      type="file"
                      accept="video/*"
                      className={fileInput}
                      disabled={uploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const asset = await uploadAdminVideo(file, "event_promo_video");
                        if (asset) {
                          setEventPromoVideoAsset(asset);
                          setEventForm((p) => ({ ...p, promo_video_url: asset.url }));
                        }
                        e.currentTarget.value = "";
                      }}
                    />

                    <MediaPreview url={eventForm.promo_video_url} labelText="Vista previa de video" />
                  </div>

                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={eventForm.published}
                      onChange={(e) =>
                        setEventForm((p) => ({ ...p, published: e.target.checked }))
                      }
                    />
                    Publicado
                  </label>

                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={eventForm.featured}
                      onChange={(e) =>
                        setEventForm((p) => ({ ...p, featured: e.target.checked }))
                      }
                    />
                    Destacado
                  </label>
                </div>
              </div>
            </div>

            <button type="button" onClick={saveEvent} className={btn + " mt-5"} disabled={saving}>
              {saving
                ? "Guardando…"
                : eventForm.id
                  ? "Guardar evento del semestre"
                  : "Crear evento del semestre"}
            </button>

            <div className="mt-6 grid grid-cols-1 gap-3">
              {events.map((ev) => (
                <div key={ev.id} className={card}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{ev.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {ev.semester || "Sin semestre"} • {formatDate(ev.event_date)} • {ev.status}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {ev.published ? "Publicado" : "Borrador"}{" "}
                        {ev.featured ? "• Destacado" : ""}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className={btnSm}
                        onClick={() => {
                          setEventForm({
                            id: ev.id,
                            title: ev.title || "",
                            semester: ev.semester || "",
                            event_date: ev.event_date || "",
                            location_name: ev.location_name || "",
                            address: ev.address || "",
                            city: ev.city || "",
                            description: ev.description || "",
                            recognitions: ev.recognitions || "",
                            main_image_url: ev.main_image_url || "",
                            promo_video_url: ev.promo_video_url || "",
                            status: ev.status || "anunciado",
                            published: !!ev.published,
                            featured: !!ev.featured,
                          });
                          setEventMainImageAsset(null);
                          setEventPromoVideoAsset(null);
                        }}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className={btnSm + " bg-red-700 hover:bg-red-800"}
                        onClick={() => deleteRow("event", ev.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "ganadores" ? (
        <section className={sectionWrap}>
          <div className={inner}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-extrabold text-slate-900">🏅 Ganadores</div>
                <p className="mt-1 text-sm text-slate-700">
                  Publica ganadores de distintas dinámicas y conecta fotos, videos o entrevistas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPostForm(emptyPost);
                  setPostPhotoAsset(null);
                  setPostVideoAsset(null);
                }}
                className={btnSm}
              >
                + Nuevo ganador
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={label}>Título *</label>
                <input
                  className={input}
                  value={postForm.title}
                  onChange={(e) => setPostForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ganador destacado de Voto Claro"
                />
              </div>

              <div>
                <label className={label}>Ventana de origen</label>
                <select
                  className={input}
                  value={postForm.source_module}
                  onChange={(e) => setPostForm((p) => ({ ...p, source_module: e.target.value }))}
                >
                  <option value="manual">Manual / Otro</option>
                  <option value="reto_ciudadano">Reto Ciudadano</option>
                  <option value="comentarios_ciudadanos">Comentarios Ciudadanos</option>
                  <option value="proyecto_ciudadano">Proyecto Ciudadano</option>
                  <option value="espacio_emprendedor">Espacio Emprendedor</option>
                  <option value="intencion_de_voto">Intención de voto</option>
                </select>
              </div>

              <div>
                <label className={label}>Nombre del ganador</label>
                <input
                  className={input}
                  value={postForm.winner_name}
                  onChange={(e) => setPostForm((p) => ({ ...p, winner_name: e.target.value }))}
                  placeholder="Nombre completo"
                />
              </div>

              <div>
                <label className={label}>Alias visible</label>
                <input
                  className={input}
                  value={postForm.winner_alias}
                  onChange={(e) => setPostForm((p) => ({ ...p, winner_alias: e.target.value }))}
                  placeholder="Ciudadano destacado"
                />
              </div>

              <div>
                <label className={label}>Premio / reconocimiento</label>
                <input
                  className={input}
                  value={postForm.prize_name}
                  onChange={(e) => setPostForm((p) => ({ ...p, prize_name: e.target.value }))}
                  placeholder="Reconocimiento ciudadano"
                />
              </div>

              <div>
                <label className={label}>Fecha</label>
                <input
                  type="date"
                  className={input}
                  value={postForm.event_date}
                  onChange={(e) => setPostForm((p) => ({ ...p, event_date: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <label className={label}>Descripción</label>
                <textarea
                  className={input + " min-h-24"}
                  value={postForm.description}
                  onChange={(e) =>
                    setPostForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Cuenta brevemente por qué se reconoce a este ganador."
                />
              </div>

              <div>
                <label className={label}>URL foto</label>
                <input
                  className={input}
                  value={postForm.photo_url}
                  onChange={(e) => {
                    if (postPhotoAsset) setPostPhotoAsset(null);
                    setPostForm((p) => ({ ...p, photo_url: e.target.value }));
                  }}
                  placeholder="URL de foto"
                />

                <input
                  type="file"
                  accept="image/*"
                  className={fileInput}
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const asset = await uploadAdminImage(file, "post_photo");
                    if (asset) {
                      setPostPhotoAsset(asset);
                      setPostForm((p) => ({ ...p, photo_url: asset.url }));
                    }
                    e.currentTarget.value = "";
                  }}
                />

                <MediaPreview url={postForm.photo_url} labelText="Vista previa de foto" />
              </div>

              <div>
                <label className={label}>URL video</label>
                <input
                  className={input}
                  value={postForm.video_url}
                  onChange={(e) => {
                    if (postVideoAsset) setPostVideoAsset(null);
                    setPostForm((p) => ({ ...p, video_url: e.target.value }));
                  }}
                  placeholder="URL de video o YouTube"
                />

                <input
                  type="file"
                  accept="video/*"
                  className={fileInput}
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const asset = await uploadAdminVideo(file, "post_video");
                    if (asset) {
                      setPostVideoAsset(asset);
                      setPostForm((p) => ({ ...p, video_url: asset.url }));
                    }
                    e.currentTarget.value = "";
                  }}
                />

                <MediaPreview url={postForm.video_url} labelText="Vista previa de video" />
              </div>

              <div>
                <label className={label}>URL entrevista</label>
                <input
                  className={input}
                  value={postForm.interview_url}
                  onChange={(e) =>
                    setPostForm((p) => ({ ...p, interview_url: e.target.value }))
                  }
                  placeholder="Enlace de entrevista"
                />
              </div>

              <div>
                <label className={label}>ID ganador origen opcional</label>
                <input
                  className={input}
                  value={postForm.source_winner_id}
                  onChange={(e) =>
                    setPostForm((p) => ({ ...p, source_winner_id: e.target.value }))
                  }
                  placeholder="ID de tabla técnica, si aplica"
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={postForm.published}
                  onChange={(e) => setPostForm((p) => ({ ...p, published: e.target.checked }))}
                />
                Publicado
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={postForm.featured}
                  onChange={(e) => setPostForm((p) => ({ ...p, featured: e.target.checked }))}
                />
                Destacado
              </label>
            </div>

            <button type="button" onClick={savePost} className={btn + " mt-5"} disabled={saving}>
              {saving ? "Guardando…" : postForm.id ? "Guardar ganador" : "Crear ganador"}
            </button>

            <div className="mt-6 grid grid-cols-1 gap-3">
              {posts.map((p) => (
                <div key={p.id} className={card}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{p.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {p.winner_alias || p.winner_name || "Sin nombre visible"} • {p.source_module}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {p.published ? "Publicado" : "Borrador"}{" "}
                        {p.featured ? "• Destacado" : ""}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className={btnSm}
                        onClick={() => {
                          setPostForm({
                            id: p.id,
                            source_module: p.source_module || "manual",
                            source_winner_id: p.source_winner_id || "",
                            winner_name: p.winner_name || "",
                            winner_alias: p.winner_alias || "",
                            title: p.title || "",
                            prize_name: p.prize_name || "",
                            description: p.description || "",
                            photo_url: p.photo_url || "",
                            video_url: p.video_url || "",
                            interview_url: p.interview_url || "",
                            event_date: p.event_date || "",
                            published: !!p.published,
                            featured: !!p.featured,
                          });
                          setPostPhotoAsset(null);
                          setPostVideoAsset(null);
                        }}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className={btnSm + " bg-red-700 hover:bg-red-800"}
                        onClick={() => deleteRow("post", p.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "media" ? (
        <section className={sectionWrap}>
          <div className={inner}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-extrabold text-slate-900">📸 Galería</div>
                <p className="mt-1 text-sm text-slate-700">
                  Publica fotos, videos, entrevistas, ambientes, entregas y reconocimientos.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMediaForm(emptyMedia);
                  setMediaAsset(null);
                }}
                className={btnSm}
              >
                + Nuevo contenido
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={label}>Título *</label>
                <input
                  className={input}
                  value={mediaForm.title}
                  onChange={(e) => setMediaForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Registro del evento"
                />
              </div>

              <div>
                <label className={label}>Tipo</label>
                <select
                  className={input}
                  value={mediaForm.media_type}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    const expectedPurpose = expectedMediaPurpose(nextType);
                    if (!expectedPurpose || mediaAsset?.purpose !== expectedPurpose) {
                      setMediaAsset(null);
                    }
                    setMediaForm((p) => ({ ...p, media_type: nextType }));
                  }}
                >
                  <option value="foto">Foto</option>
                  <option value="video">Video</option>
                  <option value="entrevista">Entrevista</option>
                  <option value="ambiente">Ambiente</option>
                  <option value="entrega">Entrega de premio</option>
                  <option value="reconocimiento">Reconocimiento</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={label}>URL archivo / video *</label>
                <input
                  className={input}
                  value={mediaForm.media_url}
                  onChange={(e) => {
                    if (mediaAsset) setMediaAsset(null);
                    setMediaForm((p) => ({ ...p, media_url: e.target.value }));
                  }}
                  placeholder="URL de archivo, imagen, video o YouTube"
                />

                <input
                  type="file"
                  accept="image/*,video/*"
                  className={fileInput}
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    let asset: AdminPendingAsset | null = null;
                    const expectedPurpose = expectedMediaPurpose(mediaForm.media_type);

                    if (expectedPurpose === "media_image" && file.type.startsWith("image/")) {
                      asset = await uploadAdminImage(file, expectedPurpose);
                    } else if (
                      expectedPurpose === "media_video" &&
                      file.type.startsWith("video/")
                    ) {
                      asset = await uploadAdminVideo(file, expectedPurpose);
                    } else {
                      setMessage({
                        type: "error",
                        text: "Error al subir archivo: Solicitud inválida",
                      });
                    }

                    if (asset) {
                      setMediaAsset(asset);
                      setMediaForm((p) => ({ ...p, media_url: asset.url }));
                    }
                    e.currentTarget.value = "";
                  }}
                />

                <MediaPreview url={mediaForm.media_url} labelText="Vista previa del contenido" />
              </div>

              <div className="md:col-span-2">
                <label className={label}>Descripción</label>
                <textarea
                  className={input + " min-h-24"}
                  value={mediaForm.description}
                  onChange={(e) =>
                    setMediaForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Describe el contenido publicado."
                />
              </div>

              <div className="md:col-span-2">
                <label className={label}>Relacionar con ganador opcional</label>
                <select
                  className={input}
                  value={mediaForm.related_winner_id}
                  onChange={(e) =>
                    setMediaForm((p) => ({ ...p, related_winner_id: e.target.value }))
                  }
                >
                  <option value="">Sin relación</option>
                  {posts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {p.winner_alias || p.winner_name || "Ganador"}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={mediaForm.published}
                  onChange={(e) =>
                    setMediaForm((p) => ({ ...p, published: e.target.checked }))
                  }
                />
                Publicado
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={mediaForm.featured}
                  onChange={(e) =>
                    setMediaForm((p) => ({ ...p, featured: e.target.checked }))
                  }
                />
                Destacado
              </label>
            </div>

            <button type="button" onClick={saveMedia} className={btn + " mt-5"} disabled={saving}>
              {saving ? "Guardando…" : mediaForm.id ? "Guardar contenido" : "Crear contenido"}
            </button>

            <div className="mt-6 grid grid-cols-1 gap-3">
              {media.map((m) => (
                <div key={m.id} className={card}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{m.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {m.media_type} • {m.published ? "Publicado" : "Borrador"}{" "}
                        {m.featured ? "• Destacado" : ""}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 break-all">{m.media_url}</div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className={btnSm}
                        onClick={() => {
                          setMediaForm({
                            id: m.id,
                            title: m.title || "",
                            media_type: m.media_type || "foto",
                            media_url: m.media_url || "",
                            description: m.description || "",
                            related_winner_id: m.related_winner_id || "",
                            published: !!m.published,
                            featured: !!m.featured,
                          });
                          setMediaAsset(null);
                        }}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className={btnSm + " bg-red-700 hover:bg-red-800"}
                        onClick={() => deleteRow("media", m.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

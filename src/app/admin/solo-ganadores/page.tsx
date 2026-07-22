// src/app/admin/solo-ganadores/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";

type Tab = "evento" | "ganadores" | "media";

type AdminAssetState =
  | "confirmed"
  | "legacy_own_url"
  | "external"
  | "youtube"
  | "empty"
  | "inconsistent";

type AdminAssetMetadata = {
  state: AdminAssetState;
  assetId: string | null;
  status: "confirmed" | null;
  purpose: string | null;
  mediaKind: "image" | "video" | null;
};

type AdminAssetSeverity = "ok" | "info" | "warning" | "danger" | "neutral";

type AdminAssetPresentation = {
  label: string;
  description: string;
  severity: AdminAssetSeverity;
};

type PatchBuildFailureReason =
  | "not_editing"
  | "missing_snapshot"
  | "missing_updated_at"
  | "invalid_current_asset"
  | "invalid_pending_asset"
  | "invalid_media_change"
  | "unsupported_clear"
  | "inconsistent_asset";

type AdminEditBlockReason = PatchBuildFailureReason;

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
  updated_at: string | null;
  main_image_asset: AdminAssetMetadata;
  promo_video_asset: AdminAssetMetadata;
};

type SoloPost = {
  id: string;
  event_id: string | null;
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
  updated_at: string | null;
  photo_asset: AdminAssetMetadata;
  video_asset: AdminAssetMetadata;
};

type SoloMedia = {
  id: string;
  event_id: string | null;
  title: string;
  media_type: string;
  media_url: string;
  description: string | null;
  related_winner_id: string | null;
  published: boolean;
  featured: boolean;
  created_at: string | null;
  updated_at: string | null;
  media_asset: AdminAssetMetadata;
};

type AdminEditAssetSnapshot = {
  originalUrl: string;
  metadata: AdminAssetMetadata;
  currentAssetId: string | null;
};

type EventEditSnapshot = {
  updatedAt: string | null;
  mainImage: AdminEditAssetSnapshot;
  promoVideo: AdminEditAssetSnapshot;
};

type PostEditSnapshot = {
  updatedAt: string | null;
  originalEventId: string | null;
  photo: AdminEditAssetSnapshot;
  video: AdminEditAssetSnapshot;
};

type MediaEditSnapshot = {
  updatedAt: string | null;
  originalEventId: string | null;
  originalMediaType: string;
  media: AdminEditAssetSnapshot;
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
      code?: string;
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

type AdminAssetAction =
  | "keep"
  | "replace"
  | "manual"
  | "clear";

type MediaTypeCategory = "image" | "video" | "interview" | "unknown";

type AdminPatchAssetAction = {
  action: AdminAssetAction;
  currentAssetId: string | null;
  newAssetId: string | null;
};

type EventFormData = {
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
};

type PostFormData = {
  event_id: string;
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
};

type MediaFormData = {
  event_id: string;
  title: string;
  media_type: string;
  media_url: string;
  description: string | null;
  related_winner_id: string | null;
  published: boolean;
  featured: boolean;
};

type EventPatchAssets = {
  main_image_url: AdminPatchAssetAction;
  promo_video_url: AdminPatchAssetAction;
};

type PostPatchAssets = {
  photo_url: AdminPatchAssetAction;
  video_url: AdminPatchAssetAction;
};

type MediaPatchAssets = {
  media_url: AdminPatchAssetAction;
};

type EventPatchPayload = {
  resource: "event";
  id: string;
  expectedUpdatedAt: string;
  data: EventFormData;
  assets: EventPatchAssets;
};

type PostPatchPayload = {
  resource: "post";
  id: string;
  expectedUpdatedAt: string;
  data: PostFormData;
  assets: PostPatchAssets;
};

type MediaPatchPayload = {
  resource: "media";
  id: string;
  expectedUpdatedAt: string;
  data: MediaFormData;
  assets: MediaPatchAssets;
};

type AdminPatchPayload = EventPatchPayload | PostPatchPayload | MediaPatchPayload;

type PatchBuildResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      reason: PatchBuildFailureReason;
    };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ADMIN_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const VIDEO_MIME = "video/mp4";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  event_id: "",
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
  event_id: "",
  title: "",
  media_type: "foto",
  media_url: "",
  description: "",
  related_winner_id: "",
  published: false,
  featured: false,
};

class AdminRequestError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "AdminRequestError";
    this.status = status;
    this.code = code;
  }
}

function cleanNullable(value: string) {
  const v = String(value || "").trim();
  return v ? v : null;
}

function fallbackAssetMetadata(): AdminAssetMetadata {
  return {
    state: "inconsistent",
    assetId: null,
    status: null,
    purpose: null,
    mediaKind: null,
  };
}

function buildEditAssetSnapshot(
  url: string | null | undefined,
  metadata: AdminAssetMetadata | null | undefined
): AdminEditAssetSnapshot {
  const safeMetadata = metadata ?? fallbackAssetMetadata();

  return {
    originalUrl: normalizedEditUrl(url),
    metadata: safeMetadata,
    currentAssetId: safeMetadata.assetId,
  };
}

function normalizedEditUrl(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedMediaType(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function mediaTypeCategory(value: string | null | undefined): MediaTypeCategory {
  const mediaType = normalizedMediaType(value);

  if (
    mediaType === "foto" ||
    mediaType === "ambiente" ||
    mediaType === "entrega" ||
    mediaType === "reconocimiento"
  ) {
    return "image";
  }

  if (mediaType === "video") return "video";
  if (mediaType === "entrevista") return "interview";

  return "unknown";
}

function normalizedAssetId(value: string | null | undefined) {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean : null;
}

function isValidAssetUuid(value: string) {
  return UUID_V4_PATTERN.test(value);
}

function isValidUuid(value: string) {
  return UUID_PATTERN.test(value.trim());
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function assetStatePresentation(metadata: AdminAssetMetadata): AdminAssetPresentation {
  switch (metadata.state) {
    case "confirmed":
      return {
        label: "Archivo confirmado",
        description: "El archivo está registrado y asociado correctamente a este campo.",
        severity: "ok",
      };
    case "legacy_own_url":
      return {
        label: "Archivo heredado",
        description:
          "La URL pertenece al almacenamiento propio, pero no tiene un registro de asset confirmado. No se asumirá su propiedad ni se eliminará automáticamente.",
        severity: "warning",
      };
    case "external":
      return {
        label: "URL externa",
        description:
          "Este campo utiliza una URL externa y no tiene un asset administrado por Voto Claro.",
        severity: "info",
      };
    case "youtube":
      return {
        label: "Enlace de YouTube",
        description:
          "Este campo utiliza un enlace de YouTube y no tiene un asset administrado por Voto Claro.",
        severity: "info",
      };
    case "empty":
      return {
        label: "Sin contenido",
        description: "Este campo no tiene actualmente una URL ni un asset asociado.",
        severity: "neutral",
      };
    case "inconsistent":
      return {
        label: "Revisión obligatoria",
        description:
          "La URL y la metadata del asset no son coherentes. Solo se permitirá guardar si reemplazas, limpias o corriges este campo de forma segura.",
        severity: "danger",
      };
  }
}

function isMissingSnapshotUpdatedAt(updatedAt: string | null) {
  return !String(updatedAt || "").trim();
}

function eventEditBlockReason(
  formId: string,
  snapshot: EventEditSnapshot | null
): AdminEditBlockReason | null {
  if (!formId) return null;
  if (!snapshot) return "missing_snapshot";
  if (isMissingSnapshotUpdatedAt(snapshot.updatedAt)) return "missing_updated_at";
  return null;
}

function postEditBlockReason(
  formId: string,
  snapshot: PostEditSnapshot | null
): AdminEditBlockReason | null {
  if (!formId) return null;
  if (!snapshot) return "missing_snapshot";
  if (isMissingSnapshotUpdatedAt(snapshot.updatedAt)) return "missing_updated_at";
  return null;
}

function mediaEditBlockReason(
  formId: string,
  snapshot: MediaEditSnapshot | null
): AdminEditBlockReason | null {
  if (!formId) return null;
  if (!snapshot) return "missing_snapshot";
  if (isMissingSnapshotUpdatedAt(snapshot.updatedAt)) return "missing_updated_at";
  return null;
}

function blockedSaveMessage(reason: AdminEditBlockReason) {
  if (
    reason === "not_editing" ||
    reason === "missing_snapshot" ||
    reason === "missing_updated_at"
  ) {
    return "Actualiza la lista y vuelve a pulsar Editar sobre el registro antes de guardar.";
  }

  return "No se puede guardar esta edición con los cambios multimedia actuales. Revisa el contenido seleccionado.";
}

function validatedCurrentAssetId(
  snapshot: AdminEditAssetSnapshot
): PatchBuildResult<string | null> {
  const currentAssetId = normalizedAssetId(snapshot.currentAssetId);

  if (snapshot.metadata.state === "confirmed") {
    if (!currentAssetId || !isValidAssetUuid(currentAssetId)) {
      return { ok: false, reason: "invalid_current_asset" };
    }

    return { ok: true, value: currentAssetId };
  }

  if (snapshot.metadata.state === "inconsistent") {
    if (currentAssetId && !isValidAssetUuid(currentAssetId)) {
      return { ok: false, reason: "invalid_current_asset" };
    }

    return { ok: true, value: currentAssetId };
  }

  if (currentAssetId) {
    return { ok: false, reason: "invalid_current_asset" };
  }

  return { ok: true, value: null };
}

function buildPatchAssetAction({
  currentUrl,
  snapshot,
  pendingAsset,
  allowClear,
  expectedPurpose,
}: {
  currentUrl: string | null | undefined;
  snapshot: AdminEditAssetSnapshot;
  pendingAsset: AdminPendingAsset | null;
  allowClear: boolean;
  expectedPurpose: AdminPendingAsset["purpose"] | null;
}): PatchBuildResult<AdminPatchAssetAction> {
  const currentAssetIdResult = validatedCurrentAssetId(snapshot);
  if (!currentAssetIdResult.ok) return currentAssetIdResult;

  const currentAssetId = currentAssetIdResult.value;
  const cleanCurrentUrl = normalizedEditUrl(currentUrl);
  const isInconsistent = snapshot.metadata.state === "inconsistent";

  if (pendingAsset) {
    const newAssetId = normalizedAssetId(pendingAsset.assetId);
    if (
      !newAssetId ||
      !isValidAssetUuid(newAssetId) ||
      !expectedPurpose ||
      pendingAsset.purpose !== expectedPurpose
    ) {
      return { ok: false, reason: "invalid_pending_asset" };
    }

    if (normalizedEditUrl(pendingAsset.url) !== cleanCurrentUrl) {
      return { ok: false, reason: "invalid_media_change" };
    }

    return {
      ok: true,
      value: {
        action: "replace",
        currentAssetId,
        newAssetId,
      },
    };
  }

  if (!isInconsistent && cleanCurrentUrl === snapshot.originalUrl) {
    return {
      ok: true,
      value: {
        action: "keep",
        currentAssetId,
        newAssetId: null,
      },
    };
  }

  if (isInconsistent && cleanCurrentUrl === snapshot.originalUrl) {
    return { ok: false, reason: "inconsistent_asset" };
  }

  if (!cleanCurrentUrl) {
    if (!allowClear) return { ok: false, reason: "unsupported_clear" };

    if (!snapshot.originalUrl && !isInconsistent) {
      return {
        ok: true,
        value: {
          action: "keep",
          currentAssetId,
          newAssetId: null,
        },
      };
    }

    return {
      ok: true,
      value: {
        action: "clear",
        currentAssetId,
        newAssetId: null,
      },
    };
  }

  if (cleanCurrentUrl !== snapshot.originalUrl) {
    if (!isValidHttpUrl(cleanCurrentUrl)) {
      return { ok: false, reason: "invalid_media_change" };
    }

    return {
      ok: true,
      value: {
        action: "manual",
        currentAssetId,
        newAssetId: null,
      },
    };
  }

  if (isInconsistent) {
    return { ok: false, reason: "inconsistent_asset" };
  }

  return { ok: false, reason: "invalid_media_change" };
}

function eventDataFromForm(form: typeof emptyEvent): EventFormData {
  return {
    title: form.title.trim(),
    semester: cleanNullable(form.semester),
    event_date: cleanNullable(form.event_date),
    location_name: cleanNullable(form.location_name),
    address: cleanNullable(form.address),
    city: cleanNullable(form.city),
    description: cleanNullable(form.description),
    recognitions: cleanNullable(form.recognitions),
    main_image_url: cleanNullable(form.main_image_url),
    promo_video_url: cleanNullable(form.promo_video_url),
    status: form.status || "anunciado",
    published: Boolean(form.published),
    featured: Boolean(form.featured),
  };
}

function postDataFromForm(form: typeof emptyPost): PostFormData {
  return {
    event_id: form.event_id.trim(),
    source_module: form.source_module || "manual",
    source_winner_id: cleanNullable(form.source_winner_id),
    winner_name: cleanNullable(form.winner_name),
    winner_alias: cleanNullable(form.winner_alias),
    title: form.title.trim(),
    prize_name: cleanNullable(form.prize_name),
    description: cleanNullable(form.description),
    photo_url: cleanNullable(form.photo_url),
    video_url: cleanNullable(form.video_url),
    interview_url: cleanNullable(form.interview_url),
    event_date: cleanNullable(form.event_date),
    published: Boolean(form.published),
    featured: Boolean(form.featured),
  };
}

function mediaDataFromForm(form: typeof emptyMedia): MediaFormData {
  return {
    event_id: form.event_id.trim(),
    title: form.title.trim(),
    media_type: form.media_type || "foto",
    media_url: form.media_url.trim(),
    description: cleanNullable(form.description),
    related_winner_id: cleanNullable(form.related_winner_id),
    published: Boolean(form.published),
    featured: Boolean(form.featured),
  };
}

function validateMediaTypeChangeForPatch(
  originalMediaType: string,
  currentMediaType: string,
  action: AdminAssetAction
): PatchBuildResult<true> {
  const originalType = normalizedMediaType(originalMediaType);
  const currentType = normalizedMediaType(currentMediaType);
  const originalCategory = mediaTypeCategory(originalType);
  const currentCategory = mediaTypeCategory(currentType);

  if (originalCategory === "unknown" || currentCategory === "unknown") {
    return { ok: false, reason: "invalid_media_change" };
  }

  if (action === "clear") {
    return { ok: false, reason: "unsupported_clear" };
  }

  if (action === "replace" || action === "manual") {
    return { ok: true, value: true };
  }

  if (
    action === "keep" &&
    (originalType === currentType ||
      (originalCategory === "image" && currentCategory === "image"))
  ) {
    return { ok: true, value: true };
  }

  return { ok: false, reason: "invalid_media_change" };
}

function buildEventPatchPayload(
  form: typeof emptyEvent,
  snapshot: EventEditSnapshot | null,
  mainImagePendingAsset: AdminPendingAsset | null,
  promoVideoPendingAsset: AdminPendingAsset | null
): PatchBuildResult<EventPatchPayload> {
  const id = normalizedAssetId(form.id);
  if (!id) return { ok: false, reason: "not_editing" };
  if (!snapshot) return { ok: false, reason: "missing_snapshot" };
  if (isMissingSnapshotUpdatedAt(snapshot.updatedAt)) {
    return { ok: false, reason: "missing_updated_at" };
  }
  const expectedUpdatedAt = normalizedEditUrl(snapshot.updatedAt);

  const mainImageAction = buildPatchAssetAction({
    currentUrl: form.main_image_url,
    snapshot: snapshot.mainImage,
    pendingAsset: mainImagePendingAsset,
    allowClear: true,
    expectedPurpose: "event_main_image",
  });
  if (!mainImageAction.ok) return mainImageAction;

  const promoVideoAction = buildPatchAssetAction({
    currentUrl: form.promo_video_url,
    snapshot: snapshot.promoVideo,
    pendingAsset: promoVideoPendingAsset,
    allowClear: true,
    expectedPurpose: "event_promo_video",
  });
  if (!promoVideoAction.ok) return promoVideoAction;

  return {
    ok: true,
    value: {
      resource: "event",
      id,
      expectedUpdatedAt,
      data: eventDataFromForm(form),
      assets: {
        main_image_url: mainImageAction.value,
        promo_video_url: promoVideoAction.value,
      },
    },
  };
}

function buildPostPatchPayload(
  form: typeof emptyPost,
  snapshot: PostEditSnapshot | null,
  photoPendingAsset: AdminPendingAsset | null,
  videoPendingAsset: AdminPendingAsset | null
): PatchBuildResult<PostPatchPayload> {
  const id = normalizedAssetId(form.id);
  if (!id) return { ok: false, reason: "not_editing" };
  if (!snapshot) return { ok: false, reason: "missing_snapshot" };
  if (isMissingSnapshotUpdatedAt(snapshot.updatedAt)) {
    return { ok: false, reason: "missing_updated_at" };
  }
  const expectedUpdatedAt = normalizedEditUrl(snapshot.updatedAt);

  const photoAction = buildPatchAssetAction({
    currentUrl: form.photo_url,
    snapshot: snapshot.photo,
    pendingAsset: photoPendingAsset,
    allowClear: true,
    expectedPurpose: "post_photo",
  });
  if (!photoAction.ok) return photoAction;

  const videoAction = buildPatchAssetAction({
    currentUrl: form.video_url,
    snapshot: snapshot.video,
    pendingAsset: videoPendingAsset,
    allowClear: true,
    expectedPurpose: "post_video",
  });
  if (!videoAction.ok) return videoAction;

  return {
    ok: true,
    value: {
      resource: "post",
      id,
      expectedUpdatedAt,
      data: postDataFromForm(form),
      assets: {
        photo_url: photoAction.value,
        video_url: videoAction.value,
      },
    },
  };
}

function buildMediaPatchPayload(
  form: typeof emptyMedia,
  snapshot: MediaEditSnapshot | null,
  pendingAsset: AdminPendingAsset | null
): PatchBuildResult<MediaPatchPayload> {
  const id = normalizedAssetId(form.id);
  if (!id) return { ok: false, reason: "not_editing" };
  if (!snapshot) return { ok: false, reason: "missing_snapshot" };
  if (isMissingSnapshotUpdatedAt(snapshot.updatedAt)) {
    return { ok: false, reason: "missing_updated_at" };
  }
  const expectedUpdatedAt = normalizedEditUrl(snapshot.updatedAt);

  const data = mediaDataFromForm(form);
  if (!data.media_url) return { ok: false, reason: "unsupported_clear" };

  const expectedPurpose = expectedMediaPurpose(data.media_type);
  if (!expectedPurpose && data.media_type !== "entrevista") {
    return { ok: false, reason: "invalid_media_change" };
  }

  if (pendingAsset && !expectedPurpose) {
    return { ok: false, reason: "invalid_pending_asset" };
  }

  const mediaAction = buildPatchAssetAction({
    currentUrl: data.media_url,
    snapshot: snapshot.media,
    pendingAsset,
    allowClear: false,
    expectedPurpose,
  });
  if (!mediaAction.ok) return mediaAction;

  const mediaTypeChange = validateMediaTypeChangeForPatch(
    snapshot.originalMediaType,
    data.media_type,
    mediaAction.value.action
  );
  if (!mediaTypeChange.ok) return mediaTypeChange;

  return {
    ok: true,
    value: {
      resource: "media",
      id,
      expectedUpdatedAt,
      data,
      assets: {
        media_url: mediaAction.value,
      },
    },
  };
}

function patchBuildFailure<T>(
  result: PatchBuildResult<T> | null
): AdminEditBlockReason | null {
  return result && !result.ok ? result.reason : null;
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

function errorText(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    for (const key of ["message", "details", "hint", "code"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return "Error desconocido";
}

function safeRequestLog(err: unknown) {
  if (err instanceof AdminRequestError) {
    return { status: err.status, code: err.code ?? "NONE" };
  }

  return { status: "UNKNOWN", code: "UNKNOWN" };
}

function saveRequestErrorMessage(err: unknown) {
  if (err instanceof AdminRequestError) {
    if (err.code === "STALE_RESOURCE") {
      return "El registro fue modificado en otra sesiÃ³n. Actualiza la lista y vuelve a pulsar Editar antes de guardar nuevamente.";
    }
    if (err.message && err.message !== "No disponible") return err.message;
    if (err.status === 409) {
      return "El registro fue modificado en otra sesión. Actualiza la lista y vuelve a pulsar Editar antes de guardar nuevamente.";
    }
    if (err.status === 400) return err.message || "Solicitud inválida.";
    if (err.status === 404) return "El registro ya no está disponible.";

    return "No se pudo guardar. Inténtalo nuevamente.";
  }

  return "No se pudo guardar. Inténtalo nuevamente.";
}


function deleteRequestErrorMessage(err: unknown) {
  if (err instanceof AdminRequestError) {
    if (err.code === "STALE_RESOURCE") {
      return "El registro fue modificado en otra sesi\u00f3n. Actualiza la lista antes de eliminarlo.";
    }
    if (err.message && err.message !== "No disponible") return err.message;
    if (err.status === 409) {
      return "El registro fue modificado en otra sesi\u00f3n. Actualiza la lista antes de eliminarlo.";
    }
    if (err.status === 404) return "El registro ya no est\u00e1 disponible.";
    if (err.status === 400) return "Solicitud inv\u00e1lida.";

    return "No se pudo eliminar. Int\u00e9ntalo nuevamente.";
  }

  return "No se pudo eliminar. Int\u00e9ntalo nuevamente.";
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
  const [eventEditSnapshot, setEventEditSnapshot] =
    useState<EventEditSnapshot | null>(null);
  const [postEditSnapshot, setPostEditSnapshot] = useState<PostEditSnapshot | null>(null);
  const [mediaEditSnapshot, setMediaEditSnapshot] = useState<MediaEditSnapshot | null>(null);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const eventSnapshotBlockReason = eventEditBlockReason(
    eventForm.id,
    eventEditSnapshot
  );
  const postSnapshotBlockReason = postEditBlockReason(postForm.id, postEditSnapshot);
  const mediaSnapshotBlockReason = mediaEditBlockReason(mediaForm.id, mediaEditSnapshot);
  const eventPatchBuildResult =
    eventForm.id && !eventSnapshotBlockReason
      ? buildEventPatchPayload(
          eventForm,
          eventEditSnapshot,
          eventMainImageAsset,
          eventPromoVideoAsset
        )
      : null;
  const postPatchBuildResult =
    postForm.id && !postSnapshotBlockReason
      ? buildPostPatchPayload(postForm, postEditSnapshot, postPhotoAsset, postVideoAsset)
      : null;
  const mediaPatchBuildResult =
    mediaForm.id && !mediaSnapshotBlockReason
      ? buildMediaPatchPayload(mediaForm, mediaEditSnapshot, mediaAsset)
      : null;
  const eventEditBlockReasonValue =
    eventSnapshotBlockReason ?? patchBuildFailure(eventPatchBuildResult);
  const postEditBlockReasonValue =
    postSnapshotBlockReason ?? patchBuildFailure(postPatchBuildResult);
  const mediaEditBlockReasonValue =
    mediaSnapshotBlockReason ?? patchBuildFailure(mediaPatchBuildResult);
  const eventEditBlocked = eventEditBlockReasonValue !== null;
  const postEditBlocked = postEditBlockReasonValue !== null;
  const mediaEditBlocked = mediaEditBlockReasonValue !== null;
  const hasEvents = events.length > 0;
  const eventsById = useMemo(() => {
    const map = new Map<string, SoloEvent>();
    for (const event of events) {
      map.set(event.id, event);
    }
    return map;
  }, [events]);
  const mediaWinnerOptions = useMemo(() => {
    if (!mediaForm.event_id) return [];
    return posts.filter((post) => post.event_id === mediaForm.event_id);
  }, [mediaForm.event_id, posts]);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key);
  }, []);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/admin");
  }

  function eventOptionLabel(event: SoloEvent) {
    return event.event_date
      ? `${event.title} - ${formatDate(event.event_date)}`
      : event.title;
  }

  function eventLabel(eventId: string | null) {
    if (!eventId) return "Sin evento clasificado";

    return eventsById.get(eventId)?.title || "Evento no disponible";
  }

  function validateSelectedEvent(eventId: string) {
    const clean = eventId.trim();
    return Boolean(clean && isValidUuid(clean) && eventsById.has(clean));
  }

  function requireSelectedEvent(eventId: string) {
    if (!hasEvents) {
      setMessage({
        type: "error",
        text: "Crea primero un evento antes de registrar ganadores o contenido de galer\u00eda.",
      });
      return false;
    }

    if (!validateSelectedEvent(eventId)) {
      setMessage({ type: "error", text: "Selecciona un evento." });
      return false;
    }

    return true;
  }

  function updateMediaEvent(nextEventId: string) {
    setMediaForm((current) => {
      const shouldKeepWinner =
        nextEventId &&
        current.related_winner_id &&
        posts.some(
          (post) => post.id === current.related_winner_id && post.event_id === nextEventId
        );

      return {
        ...current,
        event_id: nextEventId,
        related_winner_id: shouldKeepWinner ? current.related_winner_id : "",
      };
    });
  }

  function confirmPostHistoricalEventChange() {
    const postEventId = postForm.event_id.trim();
    return !(
      postForm.id &&
      postEditSnapshot?.originalEventId &&
      postEditSnapshot.originalEventId !== postEventId
    )
      ? true
      : confirm("Est\u00e1s cambiando el evento hist\u00f3rico de este ganador. \u00bfDeseas continuar?");
  }

  function confirmMediaHistoricalEventChange() {
    const mediaEventId = mediaForm.event_id.trim();
    return !(
      mediaForm.id &&
      mediaEditSnapshot?.originalEventId &&
      mediaEditSnapshot.originalEventId !== mediaEventId
    )
      ? true
      : confirm("Est\u00e1s cambiando el evento hist\u00f3rico de este contenido. \u00bfDeseas continuar?");
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

  async function createAdminResource(
    resource: AdminSaveResource,
    data: Record<string, string | boolean | null>,
    assets?: AdminCreateAssets
  ) {
    const res = await fetch("/api/admin/solo-ganadores", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resource,
        data,
        assets,
      }),
    });

    const result = (await res.json().catch(() => null)) as AdminSaveResponse | null;

    if (!res.ok || !result) {
      throw new AdminRequestError(res.status, "No disponible");
    }

    if (result.ok !== true) {
      throw new AdminRequestError(res.status, result.error || "No disponible", result.code ?? null);
    }

    return result.id;
  }

  async function updateAdminResource(payload: AdminPatchPayload) {
    const res = await fetch("/api/admin/solo-ganadores", {
      method: "PATCH",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await res.json().catch(() => null)) as AdminSaveResponse | null;

    if (!res.ok || !result) {
      throw new AdminRequestError(res.status, "No disponible");
    }

    if (result.ok !== true) {
      throw new AdminRequestError(res.status, result.error || "No disponible", result.code ?? null);
    }

    return result.id;
  }

  async function deleteAdminResource(
    resource: AdminSaveResource,
    id: string,
    expectedUpdatedAt: string
  ) {
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
        expectedUpdatedAt,
      }),
    });

    const result = (await res.json().catch(() => null)) as AdminSaveResponse | null;

    if (!res.ok || !result) {
      throw new AdminRequestError(res.status, "No disponible");
    }

    if (result.ok !== true) {
      throw new AdminRequestError(res.status, result.error || "No disponible", result.code ?? null);
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
    if (eventEditBlockReasonValue) {
      setMessage({
        type: "error",
        text: blockedSaveMessage(eventEditBlockReasonValue),
      });
      return;
    }

    if (!eventForm.title.trim()) {
      setMessage({ type: "error", text: "El evento necesita un título." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (eventForm.id) {
        const patch = eventPatchBuildResult;
        if (!patch?.ok) {
          setMessage({
            type: "error",
            text: blockedSaveMessage(patch?.reason ?? "missing_snapshot"),
          });
          return;
        }

        await updateAdminResource(patch.value);
      } else {
        await createAdminResource("event", eventDataFromForm(eventForm), {
          main_image_url: eventMainImageAsset?.assetId ?? null,
          promo_video_url: eventPromoVideoAsset?.assetId ?? null,
        });
      }

      setEventForm(emptyEvent);
      setEventMainImageAsset(null);
      setEventPromoVideoAsset(null);
      setEventEditSnapshot(null);
      setMessage({ type: "success", text: "✅ Evento guardado correctamente." });
      await loadAll();
    } catch (err: unknown) {
      console.error("Error al guardar evento:", safeRequestLog(err));
      setMessage({ type: "error", text: saveRequestErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function savePost() {
    if (!requireSelectedEvent(postForm.event_id)) {
      return;
    }

    if (postEditBlockReasonValue) {
      setMessage({
        type: "error",
        text: blockedSaveMessage(postEditBlockReasonValue),
      });
      return;
    }

    if (!postForm.title.trim()) {
      setMessage({ type: "error", text: "El ganador necesita un título." });
      return;
    }

    if (!confirmPostHistoricalEventChange()) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (postForm.id) {
        const patch = postPatchBuildResult;
        if (!patch?.ok) {
          setMessage({
            type: "error",
            text: blockedSaveMessage(patch?.reason ?? "missing_snapshot"),
          });
          return;
        }

        await updateAdminResource(patch.value);
      } else {
        await createAdminResource("post", postDataFromForm(postForm), {
          photo_url: postPhotoAsset?.assetId ?? null,
          video_url: postVideoAsset?.assetId ?? null,
        });
      }

      setPostForm(emptyPost);
      setPostPhotoAsset(null);
      setPostVideoAsset(null);
      setPostEditSnapshot(null);
      setMessage({ type: "success", text: "✅ Ganador guardado correctamente." });
      await loadAll();
    } catch (err: unknown) {
      console.error("Error al guardar ganador:", safeRequestLog(err));
      setMessage({ type: "error", text: saveRequestErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function saveMedia() {
    if (!requireSelectedEvent(mediaForm.event_id)) {
      return;
    }

    if (mediaEditBlockReasonValue) {
      setMessage({
        type: "error",
        text: blockedSaveMessage(mediaEditBlockReasonValue),
      });
      return;
    }

    if (!mediaForm.title.trim()) {
      setMessage({ type: "error", text: "El contenido necesita un título." });
      return;
    }

    if (!mediaForm.media_url.trim()) {
      setMessage({ type: "error", text: "Debes colocar la URL del archivo o video." });
      return;
    }

    if (!confirmMediaHistoricalEventChange()) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (mediaForm.id) {
        const patch = mediaPatchBuildResult;
        if (!patch?.ok) {
          setMessage({
            type: "error",
            text: blockedSaveMessage(patch?.reason ?? "missing_snapshot"),
          });
          return;
        }

        await updateAdminResource(patch.value);
      } else {
        await createAdminResource("media", mediaDataFromForm(mediaForm), {
          media_url: mediaAsset?.assetId ?? null,
        });
      }

      setMediaForm(emptyMedia);
      setMediaAsset(null);
      setMediaEditSnapshot(null);
      setMessage({ type: "success", text: "✅ Contenido guardado correctamente." });
      await loadAll();
    } catch (err: unknown) {
      console.error("Error al guardar contenido:", safeRequestLog(err));
      setMessage({ type: "error", text: saveRequestErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(
    resource: AdminSaveResource,
    id: string,
    expectedUpdatedAt: string | null | undefined
  ) {
    if (saving) return;
    if (!id || !String(expectedUpdatedAt || "").trim()) {
      setMessage({
        type: "error",
        text: "Actualiza la lista antes de eliminar este registro.",
      });
      return;
    }

    if (!confirm("¿Seguro que deseas eliminar este registro?")) return;

    setSaving(true);
    setMessage(null);

    try {
      await deleteAdminResource(resource, id, String(expectedUpdatedAt).trim());

      if (resource === "event" && eventForm.id === id) {
        setEventForm(emptyEvent);
        setEventMainImageAsset(null);
        setEventPromoVideoAsset(null);
        setEventEditSnapshot(null);
      }

      if (resource === "post" && postForm.id === id) {
        setPostForm(emptyPost);
        setPostPhotoAsset(null);
        setPostVideoAsset(null);
        setPostEditSnapshot(null);
      }

      if (resource === "media" && mediaForm.id === id) {
        setMediaForm(emptyMedia);
        setMediaAsset(null);
        setMediaEditSnapshot(null);
      }

      setMessage({ type: "success", text: "✅ Registro eliminado." });
      await loadAll();
    } catch (err: unknown) {
      console.error("Error al eliminar:", safeRequestLog(err));
      setMessage({ type: "error", text: deleteRequestErrorMessage(err) });
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

  function AssetStateNotice({
    metadata,
    pendingAsset,
  }: {
    metadata: AdminAssetMetadata;
    pendingAsset?: AdminPendingAsset | null;
  }) {
    const presentation = assetStatePresentation(metadata);
    const severityClass: Record<AdminAssetSeverity, string> = {
      ok: "border-green-700 bg-green-50 text-green-950",
      info: "border-sky-700 bg-sky-50 text-sky-950",
      warning: "border-amber-700 bg-amber-50 text-amber-950",
      danger: "border-red-700 bg-red-50 text-red-950",
      neutral: "border-slate-400 bg-slate-50 text-slate-800",
    };

    return (
      <div
        className={
          "mt-2 rounded-xl border px-3 py-2 text-xs font-semibold " +
          severityClass[presentation.severity]
        }
        role={metadata.state === "inconsistent" ? "alert" : "status"}
      >
        <div className="font-extrabold">Estado original: {presentation.label}</div>
        <div className="mt-1 leading-relaxed">{presentation.description}</div>

        {pendingAsset ? (
          <div className="mt-2 border-t border-current/20 pt-2">
            <div className="font-extrabold">Nuevo archivo pendiente de confirmación</div>
            <div className="mt-1 leading-relaxed">
              Se confirmará de forma atómica cuando guardes esta edición.
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function EditBlockedNotice({ reason }: { reason: AdminEditBlockReason }) {
    const needsRefresh =
      reason === "not_editing" ||
      reason === "missing_snapshot" ||
      reason === "missing_updated_at";

    return (
      <div
        className="mt-4 rounded-xl border border-red-700 bg-red-50 px-3 py-2 text-sm font-semibold text-red-950"
        role="alert"
      >
        <div className="font-extrabold">
          {needsRefresh
            ? "No se puede guardar esta edición de forma segura."
            : "Revisa los cambios multimedia."}
        </div>
        <div className="mt-1">
          {needsRefresh
            ? "Actualiza la lista y vuelve a pulsar Editar sobre el registro antes de intentarlo nuevamente."
            : "No se puede guardar esta edición con los cambios multimedia actuales. Revisa el contenido seleccionado."}
        </div>
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
                  setEventEditSnapshot(null);
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

                    {eventForm.id && eventEditSnapshot ? (
                      <AssetStateNotice
                        metadata={eventEditSnapshot.mainImage.metadata}
                        pendingAsset={eventMainImageAsset}
                      />
                    ) : null}

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

                    {eventForm.id && eventEditSnapshot ? (
                      <AssetStateNotice
                        metadata={eventEditSnapshot.promoVideo.metadata}
                        pendingAsset={eventPromoVideoAsset}
                      />
                    ) : null}

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

            {eventEditBlockReasonValue ? (
              <EditBlockedNotice reason={eventEditBlockReasonValue} />
            ) : null}

            <button
              type="button"
              onClick={saveEvent}
              className={btn + " mt-5"}
              disabled={saving || eventEditBlocked}
            >
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
                          setEventEditSnapshot({
                            updatedAt: ev.updated_at,
                            mainImage: buildEditAssetSnapshot(
                              ev.main_image_url,
                              ev.main_image_asset
                            ),
                            promoVideo: buildEditAssetSnapshot(
                              ev.promo_video_url,
                              ev.promo_video_asset
                            ),
                          });
                        }}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className={btnSm + " bg-red-700 hover:bg-red-800"}
                        onClick={() => deleteRow("event", ev.id, ev.updated_at)}
                        disabled={saving}
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
                  setPostEditSnapshot(null);
                }}
                className={btnSm}
              >
                + Nuevo ganador
              </button>
            </div>

            {!hasEvents ? (
              <div className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                Crea primero un evento antes de registrar ganadores o contenido de galer\u00eda.
              </div>
            ) : null}

            {postForm.id && !postForm.event_id ? (
              <div className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                Este registro debe asignarse a un evento antes de guardar.
              </div>
            ) : null}

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
                <label className={label}>Evento *</label>
                <select
                  className={input}
                  value={postForm.event_id}
                  onChange={(e) => setPostForm((p) => ({ ...p, event_id: e.target.value }))}
                >
                  <option value="">Selecciona un evento</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {eventOptionLabel(event)}
                    </option>
                  ))}
                </select>
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
                    if (!requireSelectedEvent(postForm.event_id)) {
                      e.currentTarget.value = "";
                      return;
                    }
                    if (!confirmPostHistoricalEventChange()) {
                      e.currentTarget.value = "";
                      return;
                    }
                    const asset = await uploadAdminImage(file, "post_photo");
                    if (asset) {
                      setPostPhotoAsset(asset);
                      setPostForm((p) => ({ ...p, photo_url: asset.url }));
                    }
                    e.currentTarget.value = "";
                  }}
                />

                {postForm.id && postEditSnapshot ? (
                  <AssetStateNotice
                    metadata={postEditSnapshot.photo.metadata}
                    pendingAsset={postPhotoAsset}
                  />
                ) : null}

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
                    if (!requireSelectedEvent(postForm.event_id)) {
                      e.currentTarget.value = "";
                      return;
                    }
                    if (!confirmPostHistoricalEventChange()) {
                      e.currentTarget.value = "";
                      return;
                    }
                    const asset = await uploadAdminVideo(file, "post_video");
                    if (asset) {
                      setPostVideoAsset(asset);
                      setPostForm((p) => ({ ...p, video_url: asset.url }));
                    }
                    e.currentTarget.value = "";
                  }}
                />

                {postForm.id && postEditSnapshot ? (
                  <AssetStateNotice
                    metadata={postEditSnapshot.video.metadata}
                    pendingAsset={postVideoAsset}
                  />
                ) : null}

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

            {postEditBlockReasonValue ? (
              <EditBlockedNotice reason={postEditBlockReasonValue} />
            ) : null}

            <button
              type="button"
              onClick={savePost}
              className={btn + " mt-5"}
              disabled={saving || postEditBlocked}
            >
              {saving ? "Guardando…" : postForm.id ? "Guardar ganador" : "Crear ganador"}
            </button>

            <div className="mt-6 grid grid-cols-1 gap-3">
              {posts.map((p) => (
                <div key={p.id} className={card}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{p.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Evento: {eventLabel(p.event_id)}
                      </div>
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
                            event_id: p.event_id ?? "",
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
                          setPostEditSnapshot({
                            updatedAt: p.updated_at,
                            originalEventId: p.event_id,
                            photo: buildEditAssetSnapshot(p.photo_url, p.photo_asset),
                            video: buildEditAssetSnapshot(p.video_url, p.video_asset),
                          });
                        }}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className={btnSm + " bg-red-700 hover:bg-red-800"}
                        onClick={() => deleteRow("post", p.id, p.updated_at)}
                        disabled={saving}
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
                  setMediaEditSnapshot(null);
                }}
                className={btnSm}
              >
                + Nuevo contenido
              </button>
            </div>

            {!hasEvents ? (
              <div className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                Crea primero un evento antes de registrar ganadores o contenido de galer\u00eda.
              </div>
            ) : null}

            {mediaForm.id && !mediaForm.event_id ? (
              <div className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                Este registro debe asignarse a un evento antes de guardar.
              </div>
            ) : null}

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
                    if (!requireSelectedEvent(mediaForm.event_id)) {
                      e.currentTarget.value = "";
                      return;
                    }
                    if (!confirmMediaHistoricalEventChange()) {
                      e.currentTarget.value = "";
                      return;
                    }
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

                {mediaForm.id && mediaEditSnapshot ? (
                  <AssetStateNotice
                    metadata={mediaEditSnapshot.media.metadata}
                    pendingAsset={mediaAsset}
                  />
                ) : null}

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
                <label className={label}>Evento *</label>
                <select
                  className={input}
                  value={mediaForm.event_id}
                  onChange={(e) => updateMediaEvent(e.target.value)}
                >
                  <option value="">Selecciona un evento</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {eventOptionLabel(event)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={label}>Relacionar con ganador opcional</label>
                <select
                  className={input}
                  value={mediaForm.event_id ? mediaForm.related_winner_id : ""}
                  disabled={!mediaForm.event_id}
                  onChange={(e) =>
                    setMediaForm((p) => ({ ...p, related_winner_id: e.target.value }))
                  }
                >
                  <option value="">
                    {mediaForm.event_id ? "Sin relación" : "Selecciona primero un evento"}
                  </option>
                  {mediaWinnerOptions.map((p) => (
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

            {mediaEditBlockReasonValue ? (
              <EditBlockedNotice reason={mediaEditBlockReasonValue} />
            ) : null}

            <button
              type="button"
              onClick={saveMedia}
              className={btn + " mt-5"}
              disabled={saving || mediaEditBlocked}
            >
              {saving ? "Guardando…" : mediaForm.id ? "Guardar contenido" : "Crear contenido"}
            </button>

            <div className="mt-6 grid grid-cols-1 gap-3">
              {media.map((m) => (
                <div key={m.id} className={card}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">{m.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Evento: {eventLabel(m.event_id)}
                      </div>
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
                            event_id: m.event_id ?? "",
                            title: m.title || "",
                            media_type: m.media_type || "foto",
                            media_url: m.media_url || "",
                            description: m.description || "",
                            related_winner_id: m.related_winner_id || "",
                            published: !!m.published,
                            featured: !!m.featured,
                          });
                          setMediaAsset(null);
                          setMediaEditSnapshot({
                            updatedAt: m.updated_at,
                            originalEventId: m.event_id,
                            originalMediaType: normalizedMediaType(m.media_type),
                            media: buildEditAssetSnapshot(m.media_url, m.media_asset),
                          });
                        }}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        className={btnSm + " bg-red-700 hover:bg-red-800"}
                        onClick={() => deleteRow("media", m.id, m.updated_at)}
                        disabled={saving}
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

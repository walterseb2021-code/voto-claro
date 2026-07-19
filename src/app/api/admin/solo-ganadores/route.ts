import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventDbRow = {
  id: string;
  title: string | null;
  semester: string | null;
  event_date: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  description: string | null;
  recognitions: string | null;
  main_image_url: string | null;
  promo_video_url: string | null;
  status: string | null;
  published: boolean | null;
  featured: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type PostDbRow = {
  id: string;
  source_module: string | null;
  source_winner_id: string | null;
  winner_name: string | null;
  winner_alias: string | null;
  title: string | null;
  prize_name: string | null;
  description: string | null;
  photo_url: string | null;
  video_url: string | null;
  interview_url: string | null;
  event_date: string | null;
  published: boolean | null;
  featured: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type MediaDbRow = {
  id: string;
  title: string | null;
  media_type: string | null;
  media_url: string | null;
  description: string | null;
  related_winner_id: string | null;
  published: boolean | null;
  featured: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

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

type AdminEvent = {
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

type AdminPost = {
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
  updated_at: string | null;
  photo_asset: AdminAssetMetadata;
  video_asset: AdminAssetMetadata;
};

type AdminMedia = {
  id: string;
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

type Resource = "event" | "post" | "media";

type EventMutationPayload = {
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
  updated_at: string;
};

type PostMutationPayload = {
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
  updated_at: string;
};

type MediaMutationPayload = {
  title: string;
  media_type: string;
  media_url: string;
  description: string | null;
  related_winner_id: string | null;
  published: boolean;
  featured: boolean;
  updated_at: string;
};

type MutationPayload =
  | EventMutationPayload
  | PostMutationPayload
  | MediaMutationPayload;

type AssetPurpose =
  | "event_main_image"
  | "event_promo_video"
  | "post_photo"
  | "post_video"
  | "media_image"
  | "media_video";

type AssetKind = "image" | "video";

type AssetField =
  | "main_image_url"
  | "promo_video_url"
  | "photo_url"
  | "video_url"
  | "media_url";

type MutationAssets =
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

type PatchAssetAction = "keep" | "replace" | "manual" | "clear";

type PatchAssetInstruction = {
  action: PatchAssetAction;
  currentAssetId: string | null;
  newAssetId: string | null;
};

type EventPatchData = Omit<EventMutationPayload, "updated_at">;
type PostPatchData = Omit<PostMutationPayload, "updated_at">;
type MediaPatchData = Omit<MediaMutationPayload, "updated_at">;
type PatchData = EventPatchData | PostPatchData | MediaPatchData;

type EventPatchAssets = {
  main_image_url: PatchAssetInstruction;
  promo_video_url: PatchAssetInstruction;
};

type PostPatchAssets = {
  photo_url: PatchAssetInstruction;
  video_url: PatchAssetInstruction;
};

type MediaPatchAssets = {
  media_url: PatchAssetInstruction;
};

type PatchAssets = EventPatchAssets | PostPatchAssets | MediaPatchAssets;

type PatchMutation = {
  resource: Resource;
  id: string;
  expectedUpdatedAt: string;
  data: PatchData;
  assets: PatchAssets;
};

type RpcUpdateResult =
  | { ok: true; value: string }
  | { ok: false; reason: "rpc_error"; error: unknown }
  | { ok: false; reason: "invalid_result" };

type AssetSpec = {
  field: AssetField;
  assetId: string;
  purpose: AssetPurpose;
  mediaKind: AssetKind;
};

type AssetDbRow = {
  id: string | null;
  bucket: string | null;
  object_path: string | null;
  public_url: string | null;
  media_kind: string | null;
  purpose: string | null;
  status: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_field: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  expires_at: string | null;
  deleting_at: string | null;
  deleted_at: string | null;
};

type ConfirmedAssetRow = {
  id: string | null;
  public_url: string | null;
  media_kind: string | null;
  purpose: string | null;
  status: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_field: string | null;
};

type StorageInfo = {
  size?: number;
  contentType?: string;
  metadata?: Record<string, unknown> | null;
};

type IdRow = {
  id: string | null;
};

type DeleteInput = {
  resource: Resource;
  id: string;
};

type SanitizeStats = {
  excludedEvents: number;
  excludedPosts: number;
  excludedMedia: number;
  invalidRelations: number;
};

type ValidationResult<T> = { ok: true; value: T } | { ok: false };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUCKET = "solo-ganadores";
const ASSET_TABLE = "solo_ganadores_assets";
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const VIDEO_MIME = "video/mp4";
const MAX_BODY_BYTES = 65536;
const ASSET_LOOKUP_BATCH_SIZE = 100;
const ISO_TIMESTAMP_WITH_TIMEZONE_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const EVENT_STATUSES = new Set(["anunciado", "activo", "finalizado"]);
const SOURCE_MODULES = new Set([
  "manual",
  "reto_ciudadano",
  "comentarios_ciudadanos",
  "proyecto_ciudadano",
  "espacio_emprendedor",
  "intencion_de_voto",
]);
const MEDIA_TYPES = new Set([
  "foto",
  "video",
  "entrevista",
  "ambiente",
  "entrega",
  "reconocimiento",
]);
const IMAGE_MEDIA_TYPES = new Set(["foto", "ambiente", "entrega", "reconocimiento"]);
const CONTROLLED_RPC_ERRORS = new Set([
  "INVALID_PAYLOAD",
  "RESOURCE_NOT_FOUND",
  "STALE_RESOURCE",
  "INVALID_ASSET_ACTION",
  "STALE_ASSET_STATE",
  "ASSET_DUPLICATE",
  "ASSET_NOT_FOUND",
  "ASSET_INVALID_STATUS",
  "ASSET_ALREADY_OWNED",
  "ASSET_EXPIRED",
  "ASSET_PURPOSE_MISMATCH",
  "ASSET_KIND_MISMATCH",
  "ASSET_URL_MISMATCH",
  "ASSET_RELEASE_FAILED",
  "ASSET_CONFIRM_FAILED",
  "CREATE_FAILED",
  "UPDATE_FAILED",
]);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function withAuthCookies(response: NextResponse, gate: Awaited<ReturnType<typeof requireAdmin>>) {
  for (const { name, value, options } of gate.cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  return response;
}

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("Missing Supabase URL configuration");
  }

  return url;
}

function getSupabaseAdmin(url = getSupabaseUrl()) {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceKey) {
    throw new Error("Missing Supabase admin configuration");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getRequestOrigin(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  return new URL(req.url).origin;
}

function isLocalOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isAllowedOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  if (process.env.NODE_ENV !== "production" && isLocalOrigin(origin)) {
    return true;
  }

  try {
    return new URL(origin).origin === getRequestOrigin(req);
  } catch {
    return false;
  }
}

function isAllowedMutationOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  if (process.env.NODE_ENV !== "production" && isLocalOrigin(origin)) {
    return true;
  }

  try {
    return new URL(origin).origin === getRequestOrigin(req);
  } catch {
    return false;
  }
}

function nullableString(value: string | null) {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean : null;
}

function requiredString(value: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalUuid(value: string | null, stats: SanitizeStats) {
  const clean = nullableString(value);
  if (!clean) return null;

  if (!UUID_RE.test(clean)) {
    stats.invalidRelations += 1;
    return null;
  }

  return clean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOwnKey(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function validateContentHeaders(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return false;
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    if (!/^\d+$/.test(contentLength)) return false;
    const size = Number(contentLength);
    if (!Number.isSafeInteger(size) || size > MAX_BODY_BYTES) return false;
  }

  return true;
}

async function readLimitedJson(
  req: NextRequest
): Promise<ValidationResult<unknown>> {
  try {
    const raw = await req.text();

    if (!raw || Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return { ok: false };
    }

    const value: unknown = JSON.parse(raw);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function requiredText(
  value: unknown,
  maxLength: number
): ValidationResult<string> {
  if (typeof value !== "string") return { ok: false };

  const clean = value.trim();
  if (!clean || clean.length > maxLength) return { ok: false };

  return { ok: true, value: clean };
}

function optionalText(
  value: unknown,
  maxLength: number
): ValidationResult<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };

  const clean = value.trim();
  if (!clean) return { ok: true, value: null };
  if (clean.length > maxLength) return { ok: false };

  return { ok: true, value: clean };
}

function requiredBoolean(value: unknown): ValidationResult<boolean> {
  if (typeof value !== "boolean") return { ok: false };
  return { ok: true, value };
}

function optionalDate(value: unknown): ValidationResult<string | null> {
  const text = optionalText(value, 10);
  if (!text.ok || text.value === null) return text;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text.value)) return { ok: false };

  return text;
}

function optionalUrl(value: unknown): ValidationResult<string | null> {
  const text = optionalText(value, 2048);
  if (!text.ok || text.value === null) return text;

  try {
    const url = new URL(text.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false };
    }

    return text;
  } catch {
    return { ok: false };
  }
}

function requiredUrl(value: unknown): ValidationResult<string> {
  const text = requiredText(value, 2048);
  if (!text.ok) return text;

  try {
    const url = new URL(text.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false };
    }

    return text;
  } catch {
    return { ok: false };
  }
}

function enumText(value: unknown, allowed: Set<string>): ValidationResult<string> {
  const text = requiredText(value, 100);
  if (!text.ok || !allowed.has(text.value)) return { ok: false };

  return text;
}

function optionalUuidInput(value: unknown): ValidationResult<string | null> {
  const text = optionalText(value, 36);
  if (!text.ok || text.value === null) return text;
  if (!UUID_RE.test(text.value)) return { ok: false };

  return text;
}

function assetIdInput(value: unknown): ValidationResult<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  if (!UUID_RE.test(value)) return { ok: false };

  return { ok: true, value };
}

function validateResource(value: unknown): ValidationResult<Resource> {
  if (value === "event" || value === "post" || value === "media") {
    return { ok: true, value };
  }

  return { ok: false };
}

function defaultAssets(resource: Resource): MutationAssets {
  if (resource === "event") {
    return {
      main_image_url: null,
      promo_video_url: null,
    };
  }

  if (resource === "post") {
    return {
      photo_url: null,
      video_url: null,
    };
  }

  return {
    media_url: null,
  };
}

function assetKeysForResource(resource: Resource) {
  if (resource === "event") return ["main_image_url", "promo_video_url"];
  if (resource === "post") return ["photo_url", "video_url"];
  return ["media_url"];
}

function validateMutationAssets(
  resource: Resource,
  value: unknown
): ValidationResult<MutationAssets> {
  const defaults = defaultAssets(resource);
  if (value === undefined) return { ok: true, value: defaults };
  if (!isRecord(value)) return { ok: false };

  const allowedKeys = assetKeysForResource(resource);
  const actualKeys = Object.keys(value);
  if (actualKeys.some((key) => !allowedKeys.includes(key))) return { ok: false };

  const normalized: Record<string, string | null> = {};
  for (const key of allowedKeys) {
    if (!hasOwnKey(value, key)) {
      normalized[key] = null;
      continue;
    }

    const assetId = assetIdInput(value[key]);
    if (!assetId.ok) return { ok: false };
    normalized[key] = assetId.value;
  }

  if (resource === "event") {
    return {
      ok: true,
      value: {
        main_image_url: normalized.main_image_url,
        promo_video_url: normalized.promo_video_url,
      },
    };
  }

  if (resource === "post") {
    return {
      ok: true,
      value: {
        photo_url: normalized.photo_url,
        video_url: normalized.video_url,
      },
    };
  }

  return {
    ok: true,
    value: {
      media_url: normalized.media_url,
    },
  };
}

function validateEventPayload(
  data: Record<string, unknown>
): ValidationResult<EventMutationPayload> {
  if (
    !hasExactKeys(data, [
      "title",
      "semester",
      "event_date",
      "location_name",
      "address",
      "city",
      "description",
      "recognitions",
      "main_image_url",
      "promo_video_url",
      "status",
      "published",
      "featured",
    ])
  ) {
    return { ok: false };
  }

  const title = requiredText(data.title, 200);
  const semester = optionalText(data.semester, 50);
  const eventDate = optionalDate(data.event_date);
  const locationName = optionalText(data.location_name, 200);
  const address = optionalText(data.address, 300);
  const city = optionalText(data.city, 120);
  const description = optionalText(data.description, 10000);
  const recognitions = optionalText(data.recognitions, 10000);
  const mainImageUrl = optionalUrl(data.main_image_url);
  const promoVideoUrl = optionalUrl(data.promo_video_url);
  const status = enumText(data.status, EVENT_STATUSES);
  const published = requiredBoolean(data.published);
  const featured = requiredBoolean(data.featured);

  if (
    !title.ok ||
    !semester.ok ||
    !eventDate.ok ||
    !locationName.ok ||
    !address.ok ||
    !city.ok ||
    !description.ok ||
    !recognitions.ok ||
    !mainImageUrl.ok ||
    !promoVideoUrl.ok ||
    !status.ok ||
    !published.ok ||
    !featured.ok
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      semester: semester.value,
      event_date: eventDate.value,
      location_name: locationName.value,
      address: address.value,
      city: city.value,
      description: description.value,
      recognitions: recognitions.value,
      main_image_url: mainImageUrl.value,
      promo_video_url: promoVideoUrl.value,
      status: status.value,
      published: published.value,
      featured: featured.value,
      updated_at: new Date().toISOString(),
    },
  };
}

function validatePostPayload(
  data: Record<string, unknown>
): ValidationResult<PostMutationPayload> {
  if (
    !hasExactKeys(data, [
      "source_module",
      "source_winner_id",
      "winner_name",
      "winner_alias",
      "title",
      "prize_name",
      "description",
      "photo_url",
      "video_url",
      "interview_url",
      "event_date",
      "published",
      "featured",
    ])
  ) {
    return { ok: false };
  }

  const sourceModule = enumText(data.source_module, SOURCE_MODULES);
  const sourceWinnerId = optionalText(data.source_winner_id, 300);
  const winnerName = optionalText(data.winner_name, 200);
  const winnerAlias = optionalText(data.winner_alias, 200);
  const title = requiredText(data.title, 300);
  const prizeName = optionalText(data.prize_name, 300);
  const description = optionalText(data.description, 10000);
  const photoUrl = optionalUrl(data.photo_url);
  const videoUrl = optionalUrl(data.video_url);
  const interviewUrl = optionalUrl(data.interview_url);
  const eventDate = optionalDate(data.event_date);
  const published = requiredBoolean(data.published);
  const featured = requiredBoolean(data.featured);

  if (
    !sourceModule.ok ||
    !sourceWinnerId.ok ||
    !winnerName.ok ||
    !winnerAlias.ok ||
    !title.ok ||
    !prizeName.ok ||
    !description.ok ||
    !photoUrl.ok ||
    !videoUrl.ok ||
    !interviewUrl.ok ||
    !eventDate.ok ||
    !published.ok ||
    !featured.ok
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      source_module: sourceModule.value,
      source_winner_id: sourceWinnerId.value,
      winner_name: winnerName.value,
      winner_alias: winnerAlias.value,
      title: title.value,
      prize_name: prizeName.value,
      description: description.value,
      photo_url: photoUrl.value,
      video_url: videoUrl.value,
      interview_url: interviewUrl.value,
      event_date: eventDate.value,
      published: published.value,
      featured: featured.value,
      updated_at: new Date().toISOString(),
    },
  };
}

function validateMediaPayload(
  data: Record<string, unknown>
): ValidationResult<MediaMutationPayload> {
  if (
    !hasExactKeys(data, [
      "title",
      "media_type",
      "media_url",
      "description",
      "related_winner_id",
      "published",
      "featured",
    ])
  ) {
    return { ok: false };
  }

  const title = requiredText(data.title, 300);
  const mediaType = enumText(data.media_type, MEDIA_TYPES);
  const mediaUrl = requiredUrl(data.media_url);
  const description = optionalText(data.description, 10000);
  const relatedWinnerId = optionalUuidInput(data.related_winner_id);
  const published = requiredBoolean(data.published);
  const featured = requiredBoolean(data.featured);

  if (
    !title.ok ||
    !mediaType.ok ||
    !mediaUrl.ok ||
    !description.ok ||
    !relatedWinnerId.ok ||
    !published.ok ||
    !featured.ok
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      media_type: mediaType.value,
      media_url: mediaUrl.value,
      description: description.value,
      related_winner_id: relatedWinnerId.value,
      published: published.value,
      featured: featured.value,
      updated_at: new Date().toISOString(),
    },
  };
}

function validatePayload(
  resource: Resource,
  data: Record<string, unknown>
): ValidationResult<MutationPayload> {
  if (resource === "event") return validateEventPayload(data);
  if (resource === "post") return validatePostPayload(data);
  return validateMediaPayload(data);
}

function validateEventPatchData(
  data: Record<string, unknown>
): ValidationResult<EventPatchData> {
  if (
    !hasExactKeys(data, [
      "title",
      "semester",
      "event_date",
      "location_name",
      "address",
      "city",
      "description",
      "recognitions",
      "main_image_url",
      "promo_video_url",
      "status",
      "published",
      "featured",
    ])
  ) {
    return { ok: false };
  }

  const title = requiredText(data.title, 200);
  const semester = optionalText(data.semester, 50);
  const eventDate = optionalDate(data.event_date);
  const locationName = optionalText(data.location_name, 200);
  const address = optionalText(data.address, 300);
  const city = optionalText(data.city, 120);
  const description = optionalText(data.description, 10000);
  const recognitions = optionalText(data.recognitions, 10000);
  const mainImageUrl = optionalUrl(data.main_image_url);
  const promoVideoUrl = optionalUrl(data.promo_video_url);
  const status = enumText(data.status, EVENT_STATUSES);
  const published = requiredBoolean(data.published);
  const featured = requiredBoolean(data.featured);

  if (
    !title.ok ||
    !semester.ok ||
    !eventDate.ok ||
    !locationName.ok ||
    !address.ok ||
    !city.ok ||
    !description.ok ||
    !recognitions.ok ||
    !mainImageUrl.ok ||
    !promoVideoUrl.ok ||
    !status.ok ||
    !published.ok ||
    !featured.ok
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      semester: semester.value,
      event_date: eventDate.value,
      location_name: locationName.value,
      address: address.value,
      city: city.value,
      description: description.value,
      recognitions: recognitions.value,
      main_image_url: mainImageUrl.value,
      promo_video_url: promoVideoUrl.value,
      status: status.value,
      published: published.value,
      featured: featured.value,
    },
  };
}

function validatePostPatchData(
  data: Record<string, unknown>
): ValidationResult<PostPatchData> {
  if (
    !hasExactKeys(data, [
      "source_module",
      "source_winner_id",
      "winner_name",
      "winner_alias",
      "title",
      "prize_name",
      "description",
      "photo_url",
      "video_url",
      "interview_url",
      "event_date",
      "published",
      "featured",
    ])
  ) {
    return { ok: false };
  }

  const sourceModule = enumText(data.source_module, SOURCE_MODULES);
  const sourceWinnerId = optionalText(data.source_winner_id, 300);
  const winnerName = optionalText(data.winner_name, 200);
  const winnerAlias = optionalText(data.winner_alias, 200);
  const title = requiredText(data.title, 300);
  const prizeName = optionalText(data.prize_name, 300);
  const description = optionalText(data.description, 10000);
  const photoUrl = optionalUrl(data.photo_url);
  const videoUrl = optionalUrl(data.video_url);
  const interviewUrl = optionalUrl(data.interview_url);
  const eventDate = optionalDate(data.event_date);
  const published = requiredBoolean(data.published);
  const featured = requiredBoolean(data.featured);

  if (
    !sourceModule.ok ||
    !sourceWinnerId.ok ||
    !winnerName.ok ||
    !winnerAlias.ok ||
    !title.ok ||
    !prizeName.ok ||
    !description.ok ||
    !photoUrl.ok ||
    !videoUrl.ok ||
    !interviewUrl.ok ||
    !eventDate.ok ||
    !published.ok ||
    !featured.ok
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      source_module: sourceModule.value,
      source_winner_id: sourceWinnerId.value,
      winner_name: winnerName.value,
      winner_alias: winnerAlias.value,
      title: title.value,
      prize_name: prizeName.value,
      description: description.value,
      photo_url: photoUrl.value,
      video_url: videoUrl.value,
      interview_url: interviewUrl.value,
      event_date: eventDate.value,
      published: published.value,
      featured: featured.value,
    },
  };
}

function validateMediaPatchData(
  data: Record<string, unknown>
): ValidationResult<MediaPatchData> {
  if (
    !hasExactKeys(data, [
      "title",
      "media_type",
      "media_url",
      "description",
      "related_winner_id",
      "published",
      "featured",
    ])
  ) {
    return { ok: false };
  }

  const title = requiredText(data.title, 300);
  const mediaType = enumText(data.media_type, MEDIA_TYPES);
  const mediaUrl = requiredUrl(data.media_url);
  const description = optionalText(data.description, 10000);
  const relatedWinnerId = optionalUuidInput(data.related_winner_id);
  const published = requiredBoolean(data.published);
  const featured = requiredBoolean(data.featured);

  if (
    !title.ok ||
    !mediaType.ok ||
    !mediaUrl.ok ||
    !description.ok ||
    !relatedWinnerId.ok ||
    !published.ok ||
    !featured.ok
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      media_type: mediaType.value,
      media_url: mediaUrl.value,
      description: description.value,
      related_winner_id: relatedWinnerId.value,
      published: published.value,
      featured: featured.value,
    },
  };
}

function validatePatchData(
  resource: Resource,
  data: Record<string, unknown>
): ValidationResult<PatchData> {
  if (resource === "event") return validateEventPatchData(data);
  if (resource === "post") return validatePostPatchData(data);
  return validateMediaPatchData(data);
}

function validateExpectedUpdatedAt(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return { ok: false };

  const clean = value.trim();
  const match = ISO_TIMESTAMP_WITH_TIMEZONE_RE.exec(clean);
  if (!match) return { ok: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] ? Number(match[8]) : null;
  const offsetMinute = match[9] ? Number(match[9]) : null;

  if (
    !Number.isInteger(year) ||
    year < 1 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    !Number.isInteger(hour) ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute > 59 ||
    !Number.isInteger(second) ||
    second > 59 ||
    (offsetHour !== null && (!Number.isInteger(offsetHour) || offsetHour > 23)) ||
    (offsetMinute !== null && (!Number.isInteger(offsetMinute) || offsetMinute > 59))
  ) {
    return { ok: false };
  }

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > maxDay) return { ok: false };
  if (!Number.isFinite(Date.parse(clean))) return { ok: false };

  return { ok: true, value: clean };
}

function validatePatchAssetInstruction(
  value: unknown,
  fieldUrl: string | null,
  allowClear: boolean
): ValidationResult<PatchAssetInstruction> {
  if (!isRecord(value)) return { ok: false };
  if (!hasExactKeys(value, ["action", "currentAssetId", "newAssetId"])) {
    return { ok: false };
  }

  const action = value.action;
  if (
    action !== "keep" &&
    action !== "replace" &&
    action !== "manual" &&
    action !== "clear"
  ) {
    return { ok: false };
  }

  const currentAssetId = assetIdInput(value.currentAssetId);
  const newAssetId = assetIdInput(value.newAssetId);
  if (!currentAssetId.ok || !newAssetId.ok) return { ok: false };

  if (action === "replace") {
    if (!newAssetId.value) return { ok: false };
    if (currentAssetId.value && currentAssetId.value === newAssetId.value) {
      return { ok: false };
    }
    if (!fieldUrl || !isValidHttpUrl(fieldUrl)) return { ok: false };
  } else if (newAssetId.value !== null) {
    return { ok: false };
  }

  if (action === "manual" && (!fieldUrl || !isValidHttpUrl(fieldUrl))) {
    return { ok: false };
  }

  if (action === "clear") {
    if (!allowClear || fieldUrl !== null) return { ok: false };
  }

  return {
    ok: true,
    value: {
      action,
      currentAssetId: currentAssetId.value,
      newAssetId: newAssetId.value,
    },
  };
}

function validateEventPatchAssets(
  value: unknown,
  data: EventPatchData
): ValidationResult<EventPatchAssets> {
  if (!isRecord(value)) return { ok: false };
  if (!hasExactKeys(value, ["main_image_url", "promo_video_url"])) {
    return { ok: false };
  }

  const mainImage = validatePatchAssetInstruction(
    value.main_image_url,
    data.main_image_url,
    true
  );
  const promoVideo = validatePatchAssetInstruction(
    value.promo_video_url,
    data.promo_video_url,
    true
  );
  if (!mainImage.ok || !promoVideo.ok) return { ok: false };

  if (
    mainImage.value.action === "replace" &&
    promoVideo.value.action === "replace" &&
    mainImage.value.newAssetId === promoVideo.value.newAssetId
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      main_image_url: mainImage.value,
      promo_video_url: promoVideo.value,
    },
  };
}

function validatePostPatchAssets(
  value: unknown,
  data: PostPatchData
): ValidationResult<PostPatchAssets> {
  if (!isRecord(value)) return { ok: false };
  if (!hasExactKeys(value, ["photo_url", "video_url"])) return { ok: false };

  const photo = validatePatchAssetInstruction(value.photo_url, data.photo_url, true);
  const video = validatePatchAssetInstruction(value.video_url, data.video_url, true);
  if (!photo.ok || !video.ok) return { ok: false };

  if (
    photo.value.action === "replace" &&
    video.value.action === "replace" &&
    photo.value.newAssetId === video.value.newAssetId
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      photo_url: photo.value,
      video_url: video.value,
    },
  };
}

function validateMediaPatchAssets(
  value: unknown,
  data: MediaPatchData
): ValidationResult<MediaPatchAssets> {
  if (!isRecord(value)) return { ok: false };
  if (!hasExactKeys(value, ["media_url"])) return { ok: false };

  const media = validatePatchAssetInstruction(value.media_url, data.media_url, false);
  if (!media.ok) return { ok: false };
  if (data.media_type === "entrevista" && media.value.action === "replace") {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      media_url: media.value,
    },
  };
}

function validatePatchAssets(
  resource: Resource,
  value: unknown,
  data: PatchData
): ValidationResult<PatchAssets> {
  if (resource === "event") {
    return validateEventPatchAssets(value, data as EventPatchData);
  }
  if (resource === "post") {
    return validatePostPatchAssets(value, data as PostPatchData);
  }
  return validateMediaPatchAssets(value, data as MediaPatchData);
}

function validatePatchMutationBody(body: unknown): ValidationResult<PatchMutation> {
  if (!isRecord(body)) return { ok: false };
  if (!hasExactKeys(body, ["resource", "id", "expectedUpdatedAt", "data", "assets"])) {
    return { ok: false };
  }

  const resource = validateResource(body.resource);
  if (!resource.ok) return { ok: false };
  if (typeof body.id !== "string" || !UUID_RE.test(body.id)) return { ok: false };

  const expectedUpdatedAt = validateExpectedUpdatedAt(body.expectedUpdatedAt);
  if (!expectedUpdatedAt.ok) return { ok: false };

  if (!isRecord(body.data)) return { ok: false };
  const data = validatePatchData(resource.value, body.data);
  if (!data.ok) return { ok: false };

  const assets = validatePatchAssets(resource.value, body.assets, data.value);
  if (!assets.ok) return { ok: false };

  return {
    ok: true,
    value: {
      resource: resource.value,
      id: body.id,
      expectedUpdatedAt: expectedUpdatedAt.value,
      data: data.value,
      assets: assets.value,
    },
  };
}

function assetSpecsForMutation(
  resource: Resource,
  payload: MutationPayload,
  assets: MutationAssets
): ValidationResult<AssetSpec[]> {
  const specs: AssetSpec[] = [];

  if (resource === "event") {
    const eventAssets = assets as Extract<
      MutationAssets,
      { main_image_url: string | null }
    >;

    if (
      eventAssets.main_image_url &&
      eventAssets.main_image_url === eventAssets.promo_video_url
    ) {
      return { ok: false };
    }

    if (eventAssets.main_image_url) {
      specs.push({
        field: "main_image_url",
        assetId: eventAssets.main_image_url,
        purpose: "event_main_image",
        mediaKind: "image",
      });
    }

    if (eventAssets.promo_video_url) {
      specs.push({
        field: "promo_video_url",
        assetId: eventAssets.promo_video_url,
        purpose: "event_promo_video",
        mediaKind: "video",
      });
    }

    return { ok: true, value: specs };
  }

  if (resource === "post") {
    const postAssets = assets as Extract<MutationAssets, { photo_url: string | null }>;

    if (postAssets.photo_url && postAssets.photo_url === postAssets.video_url) {
      return { ok: false };
    }

    if (postAssets.photo_url) {
      specs.push({
        field: "photo_url",
        assetId: postAssets.photo_url,
        purpose: "post_photo",
        mediaKind: "image",
      });
    }

    if (postAssets.video_url) {
      specs.push({
        field: "video_url",
        assetId: postAssets.video_url,
        purpose: "post_video",
        mediaKind: "video",
      });
    }

    return { ok: true, value: specs };
  }

  const mediaPayload = payload as MediaMutationPayload;
  const mediaAssets = assets as Extract<MutationAssets, { media_url: string | null }>;
  if (!mediaAssets.media_url) return { ok: true, value: specs };

  if (mediaPayload.media_type === "video") {
    specs.push({
      field: "media_url",
      assetId: mediaAssets.media_url,
      purpose: "media_video",
      mediaKind: "video",
    });
    return { ok: true, value: specs };
  }

  if (IMAGE_MEDIA_TYPES.has(mediaPayload.media_type)) {
    specs.push({
      field: "media_url",
      assetId: mediaAssets.media_url,
      purpose: "media_image",
      mediaKind: "image",
    });
    return { ok: true, value: specs };
  }

  return { ok: false };
}

function getUrlFieldValue(payload: MutationPayload, field: AssetField) {
  if (field === "main_image_url") return (payload as EventMutationPayload).main_image_url;
  if (field === "promo_video_url") return (payload as EventMutationPayload).promo_video_url;
  if (field === "photo_url") return (payload as PostMutationPayload).photo_url;
  if (field === "video_url") return (payload as PostMutationPayload).video_url;
  return (payload as MediaMutationPayload).media_url;
}

function isOwnBucketPublicUrl(value: string | null, supabaseUrl: string) {
  if (!value) return false;

  try {
    const input = new URL(value);
    const configured = new URL(supabaseUrl);
    const publicPrefix = `/storage/v1/object/public/${BUCKET}/`;

    return (
      input.origin === configured.origin &&
      input.pathname.startsWith(publicPrefix) &&
      input.pathname.length > publicPrefix.length
    );
  } catch {
    return false;
  }
}

function hasOwnBucketUrlWithoutAsset(
  resource: Resource,
  payload: MutationPayload,
  assets: MutationAssets,
  supabaseUrl: string
) {
  const specs = assetKeysForResource(resource);
  for (const field of specs) {
    const assetId = (assets as Record<string, string | null>)[field] ?? null;
    const url = getUrlFieldValue(payload, field as AssetField);

    if (!assetId && isOwnBucketPublicUrl(url, supabaseUrl)) {
      return true;
    }
  }

  return false;
}

function isValidHttpUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecognizedYouTubeUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const host = url.hostname.toLowerCase();

    if (host === "youtube.com" || host === "www.youtube.com") {
      const watchId = url.pathname === "/watch" ? url.searchParams.get("v") : null;
      if (watchId?.trim()) return true;

      if (url.pathname.startsWith("/embed/")) {
        return Boolean(url.pathname.replace("/embed/", "").split("/")[0]?.trim());
      }

      if (url.pathname.startsWith("/shorts/")) {
        return Boolean(url.pathname.replace("/shorts/", "").split("/")[0]?.trim());
      }

      return false;
    }

    if (host === "youtu.be") {
      return Boolean(url.pathname.replace("/", "").split("/")[0]?.trim());
    }

    return false;
  } catch {
    return false;
  }
}

function ownershipKey(resource: Resource, resourceId: string, field: AssetField) {
  return `${resource}:${resourceId}:${field}`;
}

function isResource(value: string | null): value is Resource {
  return value === "event" || value === "post" || value === "media";
}

function isAssetField(value: string | null): value is AssetField {
  return (
    value === "main_image_url" ||
    value === "promo_video_url" ||
    value === "photo_url" ||
    value === "video_url" ||
    value === "media_url"
  );
}

function isValidOwnershipPair(resource: Resource, field: AssetField) {
  if (resource === "event") {
    return field === "main_image_url" || field === "promo_video_url";
  }

  if (resource === "post") {
    return field === "photo_url" || field === "video_url";
  }

  return field === "media_url";
}

function mediaKind(value: string | null): AssetKind | null {
  if (value === "image" || value === "video") return value;
  return null;
}

function expectedAdminAsset(
  resource: Resource,
  field: AssetField,
  mediaType?: string
): { purpose: AssetPurpose; mediaKind: AssetKind } | null {
  if (resource === "event" && field === "main_image_url") {
    return { purpose: "event_main_image", mediaKind: "image" };
  }

  if (resource === "event" && field === "promo_video_url") {
    return { purpose: "event_promo_video", mediaKind: "video" };
  }

  if (resource === "post" && field === "photo_url") {
    return { purpose: "post_photo", mediaKind: "image" };
  }

  if (resource === "post" && field === "video_url") {
    return { purpose: "post_video", mediaKind: "video" };
  }

  if (resource === "media" && field === "media_url") {
    if (mediaType === "video") {
      return { purpose: "media_video", mediaKind: "video" };
    }

    if (IMAGE_MEDIA_TYPES.has(mediaType ?? "")) {
      return { purpose: "media_image", mediaKind: "image" };
    }
  }

  return null;
}

function emptyAdminAssetMetadata(state: AdminAssetState): AdminAssetMetadata {
  return {
    state,
    assetId: null,
    status: null,
    purpose: null,
    mediaKind: null,
  };
}

function classifyAdminAsset(
  value: string | null,
  asset: ConfirmedAssetRow | undefined,
  expected: { purpose: AssetPurpose; mediaKind: AssetKind } | null,
  supabaseUrl: string
): AdminAssetMetadata {
  const clean = nullableString(value);

  if (asset) {
    const assetKind = mediaKind(asset.media_kind);
    const metadata: AdminAssetMetadata = {
      state: "inconsistent",
      assetId: typeof asset.id === "string" && asset.id.trim() ? asset.id : null,
      status: asset.status === "confirmed" ? "confirmed" : null,
      purpose:
        typeof asset.purpose === "string" && asset.purpose.trim()
          ? asset.purpose
          : null,
      mediaKind: assetKind,
    };

    if (
      clean &&
      expected &&
      metadata.assetId !== null &&
      asset.status === "confirmed" &&
      asset.public_url === clean &&
      asset.purpose === expected.purpose &&
      assetKind === expected.mediaKind
    ) {
      return {
        ...metadata,
        state: "confirmed",
      };
    }

    return metadata;
  }

  if (!clean) return emptyAdminAssetMetadata("empty");
  if (isOwnBucketPublicUrl(clean, supabaseUrl)) {
    return emptyAdminAssetMetadata("legacy_own_url");
  }
  if (isRecognizedYouTubeUrl(clean)) return emptyAdminAssetMetadata("youtube");
  if (isValidHttpUrl(clean)) return emptyAdminAssetMetadata("external");

  return emptyAdminAssetMetadata("inconsistent");
}

function buildOwnershipAssetMap(
  rows: ConfirmedAssetRow[]
): ValidationResult<Map<string, ConfirmedAssetRow>> {
  const map = new Map<string, ConfirmedAssetRow>();

  for (const row of rows) {
    if (
      !isResource(row.resource_type) ||
      !isAssetField(row.resource_field) ||
      typeof row.resource_id !== "string" ||
      !UUID_RE.test(row.resource_id) ||
      row.status !== "confirmed" ||
      typeof row.id !== "string" ||
      !UUID_RE.test(row.id) ||
      !isValidOwnershipPair(row.resource_type, row.resource_field)
    ) {
      console.error("[admin/solo-ganadores] invalid confirmed asset ownership", {
        resource: row.resource_type ?? "UNKNOWN",
        field: row.resource_field ?? "UNKNOWN",
      });
      return { ok: false };
    }

    const key = ownershipKey(row.resource_type, row.resource_id, row.resource_field);
    if (map.has(key)) {
      console.error("[admin/solo-ganadores] duplicate confirmed asset ownership", {
        resource: row.resource_type,
        field: row.resource_field,
      });
      return { ok: false };
    }

    map.set(key, row);
  }

  return { ok: true, value: map };
}

function chunkArray<T>(values: T[], maxSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += maxSize) {
    chunks.push(values.slice(index, index + maxSize));
  }

  return chunks;
}

async function fetchConfirmedAssetsForResource(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  resource: Resource,
  resourceIds: string[]
): Promise<ValidationResult<ConfirmedAssetRow[]>> {
  const uniqueIds = Array.from(new Set(resourceIds.filter((id) => UUID_RE.test(id))));
  if (uniqueIds.length === 0) return { ok: true, value: [] };

  const batches = chunkArray(uniqueIds, ASSET_LOOKUP_BATCH_SIZE);
  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from(ASSET_TABLE)
        .select(
          "id,public_url,media_kind,purpose,status,resource_type,resource_id,resource_field"
        )
        .eq("status", "confirmed")
        .eq("resource_type", resource)
        .in("resource_id", batch)
    )
  );

  const rows: ConfirmedAssetRow[] = [];
  for (const result of results) {
    if (result.error) {
      console.error("[admin/solo-ganadores] confirmed assets batch lookup failed", {
        resource,
        code: getSafeErrorCode(result.error),
      });
      return { ok: false };
    }

    rows.push(...((result.data ?? []) as ConfirmedAssetRow[]));
  }

  return { ok: true, value: rows };
}

function getSafeErrorCode(error: unknown) {
  if (!isRecord(error)) return "UNKNOWN";

  for (const key of ["code", "statusCode", "name"]) {
    const value = error[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 80);
    }
  }

  return "UNKNOWN";
}

function getControlledRpcError(error: unknown) {
  if (!isRecord(error)) return null;

  const message = error.message;
  if (typeof message === "string" && CONTROLLED_RPC_ERRORS.has(message)) {
    return message;
  }

  return null;
}

function patchRpcErrorStatus(code: string | null) {
  if (
    code === "INVALID_PAYLOAD" ||
    code === "INVALID_ASSET_ACTION" ||
    code === "ASSET_PURPOSE_MISMATCH" ||
    code === "ASSET_KIND_MISMATCH"
  ) {
    return 400;
  }

  if (code === "RESOURCE_NOT_FOUND") return 404;

  if (
    code === "STALE_RESOURCE" ||
    code === "STALE_ASSET_STATE" ||
    code === "ASSET_DUPLICATE" ||
    code === "ASSET_NOT_FOUND" ||
    code === "ASSET_INVALID_STATUS" ||
    code === "ASSET_ALREADY_OWNED" ||
    code === "ASSET_EXPIRED" ||
    code === "ASSET_URL_MISMATCH"
  ) {
    return 409;
  }

  return 500;
}

function patchRpcErrorBody(status: number, code: string | null) {
  if (status === 400) return { ok: false, error: "Solicitud inv\u00e1lida" };
  if (status === 404) return { ok: false, error: "No encontrado" };
  if (status === 409) {
    return code === "STALE_RESOURCE"
      ? { ok: false, error: "Conflicto de edici\u00f3n", code }
      : { ok: false, error: "Conflicto de edici\u00f3n" };
  }

  return { ok: false, error: "No disponible" };
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function storageMime(info: StorageInfo) {
  if (typeof info.contentType === "string" && info.contentType.trim()) {
    return info.contentType.trim();
  }

  return (
    metadataString(info.metadata, "mimetype") ??
    metadataString(info.metadata, "mimeType") ??
    metadataString(info.metadata, "contentType") ??
    metadataString(info.metadata, "content_type")
  );
}

async function validatePendingAsset(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  spec: AssetSpec
): Promise<ValidationResult<AssetDbRow>> {
  const result = await supabase
    .from(ASSET_TABLE)
    .select(
      "id,bucket,object_path,public_url,media_kind,purpose,status,resource_type,resource_id,resource_field,mime_type,size_bytes,expires_at,deleting_at,deleted_at"
    )
    .eq("id", spec.assetId)
    .maybeSingle();

  if (result.error) {
    console.error("[admin/solo-ganadores] asset lookup failed", {
      field: spec.field,
      code: getSafeErrorCode(result.error),
    });
    return { ok: false };
  }

  const row = result.data as AssetDbRow | null;
  if (!row) return { ok: false };

  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  const hasValidSize =
    row.size_bytes === null ||
    (Number.isSafeInteger(row.size_bytes) && row.size_bytes > 0);

  if (
    row.id !== spec.assetId ||
    row.bucket !== BUCKET ||
    !row.object_path ||
    !row.public_url ||
    !isValidHttpUrl(row.public_url) ||
    row.media_kind !== spec.mediaKind ||
    row.purpose !== spec.purpose ||
    row.status !== "pending" ||
    row.resource_type !== null ||
    row.resource_id !== null ||
    row.resource_field !== null ||
    row.deleting_at !== null ||
    row.deleted_at !== null ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    !hasValidSize
  ) {
    return { ok: false };
  }

  return { ok: true, value: row };
}

async function verifyVideoAssetObject(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  asset: AssetDbRow,
  spec: AssetSpec
): Promise<"ok" | "invalid" | "unavailable"> {
  if (!asset.object_path) return "invalid";

  const infoResult = await supabase.storage.from(BUCKET).info(asset.object_path);
  if (infoResult.error) {
    console.error("[admin/solo-ganadores] video storage info failed", {
      field: spec.field,
      code: getSafeErrorCode(infoResult.error),
    });
    return "unavailable";
  }

  if (!infoResult.data) return "invalid";

  const info = infoResult.data as StorageInfo;
  const size = info.size;
  const mime = storageMime(info);

  if (
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_VIDEO_BYTES ||
    (mime !== null && mime !== VIDEO_MIME) ||
    (asset.size_bytes !== null && asset.size_bytes !== size)
  ) {
    return "invalid";
  }

  return "ok";
}

function tableForResource(resource: Resource) {
  if (resource === "event") return "solo_ganadores_events";
  if (resource === "post") return "solo_ganadores_posts";
  return "solo_ganadores_media";
}

function mutationBadRequest(gate: Awaited<ReturnType<typeof requireAdmin>>) {
  return withAuthCookies(json(400, { ok: false, error: "Solicitud inv\u00e1lida" }), gate);
}

function toAdminEvent(
  row: EventDbRow,
  stats: SanitizeStats,
  assets: Map<string, ConfirmedAssetRow>,
  supabaseUrl: string
): AdminEvent | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedEvents += 1;
    return null;
  }

  const mainImageAsset = assets.get(ownershipKey("event", row.id, "main_image_url"));
  const promoVideoAsset = assets.get(
    ownershipKey("event", row.id, "promo_video_url")
  );

  return {
    id: row.id,
    title: requiredString(row.title),
    semester: nullableString(row.semester),
    event_date: nullableString(row.event_date),
    location_name: nullableString(row.location_name),
    address: nullableString(row.address),
    city: nullableString(row.city),
    description: nullableString(row.description),
    recognitions: nullableString(row.recognitions),
    main_image_url: nullableString(row.main_image_url),
    promo_video_url: nullableString(row.promo_video_url),
    status: requiredString(row.status),
    published: row.published === true,
    featured: row.featured === true,
    created_at: nullableString(row.created_at),
    updated_at: nullableString(row.updated_at),
    main_image_asset: classifyAdminAsset(
      row.main_image_url,
      mainImageAsset,
      expectedAdminAsset("event", "main_image_url"),
      supabaseUrl
    ),
    promo_video_asset: classifyAdminAsset(
      row.promo_video_url,
      promoVideoAsset,
      expectedAdminAsset("event", "promo_video_url"),
      supabaseUrl
    ),
  };
}

function toAdminPost(
  row: PostDbRow,
  stats: SanitizeStats,
  assets: Map<string, ConfirmedAssetRow>,
  supabaseUrl: string
): AdminPost | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedPosts += 1;
    return null;
  }

  const photoAsset = assets.get(ownershipKey("post", row.id, "photo_url"));
  const videoAsset = assets.get(ownershipKey("post", row.id, "video_url"));

  return {
    id: row.id,
    source_module: requiredString(row.source_module),
    source_winner_id: nullableString(row.source_winner_id),
    winner_name: nullableString(row.winner_name),
    winner_alias: nullableString(row.winner_alias),
    title: requiredString(row.title),
    prize_name: nullableString(row.prize_name),
    description: nullableString(row.description),
    photo_url: nullableString(row.photo_url),
    video_url: nullableString(row.video_url),
    interview_url: nullableString(row.interview_url),
    event_date: nullableString(row.event_date),
    published: row.published === true,
    featured: row.featured === true,
    created_at: nullableString(row.created_at),
    updated_at: nullableString(row.updated_at),
    photo_asset: classifyAdminAsset(
      row.photo_url,
      photoAsset,
      expectedAdminAsset("post", "photo_url"),
      supabaseUrl
    ),
    video_asset: classifyAdminAsset(
      row.video_url,
      videoAsset,
      expectedAdminAsset("post", "video_url"),
      supabaseUrl
    ),
  };
}

function toAdminMedia(
  row: MediaDbRow,
  stats: SanitizeStats,
  assets: Map<string, ConfirmedAssetRow>,
  supabaseUrl: string
): AdminMedia | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedMedia += 1;
    return null;
  }

  const mediaType = requiredString(row.media_type);
  const mediaAsset = assets.get(ownershipKey("media", row.id, "media_url"));

  return {
    id: row.id,
    title: requiredString(row.title),
    media_type: mediaType,
    media_url: requiredString(row.media_url),
    description: nullableString(row.description),
    related_winner_id: optionalUuid(row.related_winner_id, stats),
    published: row.published === true,
    featured: row.featured === true,
    created_at: nullableString(row.created_at),
    updated_at: nullableString(row.updated_at),
    media_asset: classifyAdminAsset(
      row.media_url,
      mediaAsset,
      expectedAdminAsset("media", "media_url", mediaType),
      supabaseUrl
    ),
  };
}

function warnIfSanitized(stats: SanitizeStats) {
  if (
    stats.excludedEvents === 0 &&
    stats.excludedPosts === 0 &&
    stats.excludedMedia === 0 &&
    stats.invalidRelations === 0
  ) {
    return;
  }

  console.warn("[admin/solo-ganadores] sanitized admin rows", {
    events: stats.excludedEvents,
    posts: stats.excludedPosts,
    media: stats.excludedMedia,
    relations: stats.invalidRelations,
  });
}

function validateMutationBody(
  body: unknown,
  operation: "insert" | "update"
): ValidationResult<{
  resource: Resource;
  id: string | null;
  payload: MutationPayload;
  assets: MutationAssets;
}> {
  if (!isRecord(body)) return { ok: false };

  if (operation === "insert") {
    const hasAssets = hasOwnKey(body, "assets");
    const expectedKeys = hasAssets ? ["resource", "data", "assets"] : ["resource", "data"];
    if (!hasExactKeys(body, expectedKeys)) return { ok: false };
  } else if (!hasExactKeys(body, ["resource", "id", "data"])) {
    return { ok: false };
  }

  const resource = validateResource(body.resource);
  if (!resource.ok) return { ok: false };

  let id: string | null = null;
  if (operation === "update") {
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return { ok: false };
    }

    id = body.id;
  }

  if (!isRecord(body.data)) return { ok: false };

  const payload = validatePayload(resource.value, body.data);
  if (!payload.ok) return { ok: false };

  const assets =
    operation === "insert"
      ? validateMutationAssets(
          resource.value,
          hasOwnKey(body, "assets") ? body.assets : undefined
        )
      : ({ ok: true, value: defaultAssets(resource.value) } as const);

  if (!assets.ok) return { ok: false };

  return {
    ok: true,
    value: {
      resource: resource.value,
      id,
      payload: payload.value,
      assets: assets.value,
    },
  };
}

function validateDeleteBody(value: unknown): ValidationResult<DeleteInput> {
  if (!isRecord(value)) return { ok: false };
  if (!hasExactKeys(value, ["resource", "id"])) return { ok: false };

  const resource = validateResource(value.resource);
  if (!resource.ok) return { ok: false };

  const id = requiredText(value.id, 36);
  if (!id.ok || !UUID_RE.test(id.value)) return { ok: false };

  return {
    ok: true,
    value: {
      resource: resource.value,
      id: id.value,
    },
  };
}

async function validateAssetsForCreate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  specs: AssetSpec[]
): Promise<"ok" | "invalid" | "unavailable"> {
  const seen = new Set<string>();

  for (const spec of specs) {
    if (seen.has(spec.assetId)) return "invalid";
    seen.add(spec.assetId);

    const asset = await validatePendingAsset(supabase, spec);
    if (!asset.ok) return "invalid";

    if (spec.mediaKind === "video") {
      const video = await verifyVideoAssetObject(supabase, asset.value, spec);
      if (video !== "ok") return video;
    }
  }

  return "ok";
}

function videoAssetSpecsForPatch(
  resource: Resource,
  data: PatchData,
  assets: PatchAssets
): AssetSpec[] {
  const specs: AssetSpec[] = [];

  if (resource === "event") {
    const eventAssets = assets as EventPatchAssets;
    if (eventAssets.promo_video_url.action === "replace") {
      specs.push({
        field: "promo_video_url",
        assetId: eventAssets.promo_video_url.newAssetId as string,
        purpose: "event_promo_video",
        mediaKind: "video",
      });
    }
    return specs;
  }

  if (resource === "post") {
    const postAssets = assets as PostPatchAssets;
    if (postAssets.video_url.action === "replace") {
      specs.push({
        field: "video_url",
        assetId: postAssets.video_url.newAssetId as string,
        purpose: "post_video",
        mediaKind: "video",
      });
    }
    return specs;
  }

  const mediaData = data as MediaPatchData;
  const mediaAssets = assets as MediaPatchAssets;
  if (mediaData.media_type === "video" && mediaAssets.media_url.action === "replace") {
    specs.push({
      field: "media_url",
      assetId: mediaAssets.media_url.newAssetId as string,
      purpose: "media_video",
      mediaKind: "video",
    });
  }

  return specs;
}

async function createResourceWithRpc(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  resource: Resource,
  payload: MutationPayload,
  assets: MutationAssets
): Promise<ValidationResult<string>> {
  if (resource === "event") {
    const eventAssets = assets as Extract<
      MutationAssets,
      { main_image_url: string | null }
    >;
    const result = await supabase.rpc("create_solo_ganadores_event", {
      p_data: payload,
      p_main_image_asset_id: eventAssets.main_image_url,
      p_promo_video_asset_id: eventAssets.promo_video_url,
    });

    if (result.error) {
      console.error("[admin/solo-ganadores] create event rpc failed", {
        resource,
        code: getSafeErrorCode(result.error),
        rpc: getControlledRpcError(result.error) ?? "UNCONTROLLED",
      });
      return { ok: false };
    }

    return typeof result.data === "string" && UUID_RE.test(result.data)
      ? { ok: true, value: result.data }
      : { ok: false };
  }

  if (resource === "post") {
    const postAssets = assets as Extract<MutationAssets, { photo_url: string | null }>;
    const result = await supabase.rpc("create_solo_ganadores_post", {
      p_data: payload,
      p_photo_asset_id: postAssets.photo_url,
      p_video_asset_id: postAssets.video_url,
    });

    if (result.error) {
      console.error("[admin/solo-ganadores] create post rpc failed", {
        resource,
        code: getSafeErrorCode(result.error),
        rpc: getControlledRpcError(result.error) ?? "UNCONTROLLED",
      });
      return { ok: false };
    }

    return typeof result.data === "string" && UUID_RE.test(result.data)
      ? { ok: true, value: result.data }
      : { ok: false };
  }

  const mediaAssets = assets as Extract<MutationAssets, { media_url: string | null }>;
  const result = await supabase.rpc("create_solo_ganadores_media", {
    p_data: payload,
    p_media_asset_id: mediaAssets.media_url,
  });

  if (result.error) {
    console.error("[admin/solo-ganadores] create media rpc failed", {
      resource,
      code: getSafeErrorCode(result.error),
      rpc: getControlledRpcError(result.error) ?? "UNCONTROLLED",
    });
    return { ok: false };
  }

  return typeof result.data === "string" && UUID_RE.test(result.data)
    ? { ok: true, value: result.data }
    : { ok: false };
}

async function updateResourceWithRpc(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  mutation: PatchMutation
): Promise<RpcUpdateResult> {
  const { resource, id, expectedUpdatedAt, data, assets } = mutation;

  if (resource === "event") {
    const eventAssets = assets as EventPatchAssets;
    const result = await supabase.rpc("update_solo_ganadores_event", {
      p_id: id,
      p_data: data,
      p_expected_updated_at: expectedUpdatedAt,
      p_main_image_action: eventAssets.main_image_url.action,
      p_main_image_current_asset_id: eventAssets.main_image_url.currentAssetId,
      p_main_image_new_asset_id: eventAssets.main_image_url.newAssetId,
      p_promo_video_action: eventAssets.promo_video_url.action,
      p_promo_video_current_asset_id: eventAssets.promo_video_url.currentAssetId,
      p_promo_video_new_asset_id: eventAssets.promo_video_url.newAssetId,
    });

    if (result.error) return { ok: false, reason: "rpc_error", error: result.error };
    return typeof result.data === "string" && UUID_RE.test(result.data)
      ? { ok: true, value: result.data }
      : { ok: false, reason: "invalid_result" };
  }

  if (resource === "post") {
    const postAssets = assets as PostPatchAssets;
    const result = await supabase.rpc("update_solo_ganadores_post", {
      p_id: id,
      p_data: data,
      p_expected_updated_at: expectedUpdatedAt,
      p_photo_action: postAssets.photo_url.action,
      p_photo_current_asset_id: postAssets.photo_url.currentAssetId,
      p_photo_new_asset_id: postAssets.photo_url.newAssetId,
      p_video_action: postAssets.video_url.action,
      p_video_current_asset_id: postAssets.video_url.currentAssetId,
      p_video_new_asset_id: postAssets.video_url.newAssetId,
    });

    if (result.error) return { ok: false, reason: "rpc_error", error: result.error };
    return typeof result.data === "string" && UUID_RE.test(result.data)
      ? { ok: true, value: result.data }
      : { ok: false, reason: "invalid_result" };
  }

  const mediaAssets = assets as MediaPatchAssets;
  const result = await supabase.rpc("update_solo_ganadores_media", {
    p_id: id,
    p_data: data,
    p_expected_updated_at: expectedUpdatedAt,
    p_media_action: mediaAssets.media_url.action,
    p_media_current_asset_id: mediaAssets.media_url.currentAssetId,
    p_media_new_asset_id: mediaAssets.media_url.newAssetId,
  });

  if (result.error) return { ok: false, reason: "rpc_error", error: result.error };
  return typeof result.data === "string" && UUID_RE.test(result.data)
    ? { ok: true, value: result.data }
    : { ok: false, reason: "invalid_result" };
}

async function handleMutation(req: NextRequest, operation: "insert" | "update") {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return withAuthCookies(
      json(gate.status, {
        ok: false,
        error: gate.error,
      }),
      gate
    );
  }

  try {
    if (!isAllowedMutationOrigin(req)) {
      return withAuthCookies(json(403, { ok: false, error: "No autorizado" }), gate);
    }

    const { searchParams } = new URL(req.url);
    if (Array.from(searchParams.keys()).length > 0) {
      return mutationBadRequest(gate);
    }

    if (!validateContentHeaders(req)) {
      return mutationBadRequest(gate);
    }

    const jsonBody = await readLimitedJson(req);
    if (!jsonBody.ok) {
      return mutationBadRequest(gate);
    }

    const mutation = validateMutationBody(jsonBody.value, operation);
    if (!mutation.ok) {
      return mutationBadRequest(gate);
    }

    const { resource, payload, assets } = mutation.value;
    const supabaseUrl = getSupabaseUrl();
    const supabase = getSupabaseAdmin(supabaseUrl);

    if (operation === "insert") {
      if (hasOwnBucketUrlWithoutAsset(resource, payload, assets, supabaseUrl)) {
        return mutationBadRequest(gate);
      }

      const assetSpecs = assetSpecsForMutation(resource, payload, assets);
      if (!assetSpecs.ok) {
        return mutationBadRequest(gate);
      }

      const assetsReady = await validateAssetsForCreate(supabase, assetSpecs.value);
      if (assetsReady === "invalid") {
        return mutationBadRequest(gate);
      }

      if (assetsReady === "unavailable") {
        return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
      }

      const created = await createResourceWithRpc(supabase, resource, payload, assets);
      if (!created.ok) {
        console.error("[admin/solo-ganadores] create rpc returned invalid result", {
          resource,
        });
        return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
      }

      return withAuthCookies(json(201, { ok: true, id: created.value }), gate);
    }

    return mutationBadRequest(gate);
  } catch {
    console.error("[admin/solo-ganadores] mutation unexpected error", { operation });
    return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
  }
}

async function handlePatchMutation(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return withAuthCookies(
      json(gate.status, {
        ok: false,
        error: gate.error,
      }),
      gate
    );
  }

  try {
    if (!isAllowedMutationOrigin(req)) {
      return withAuthCookies(json(403, { ok: false, error: "No autorizado" }), gate);
    }

    const { searchParams } = new URL(req.url);
    if (Array.from(searchParams.keys()).length > 0) {
      return mutationBadRequest(gate);
    }

    if (!validateContentHeaders(req)) {
      return mutationBadRequest(gate);
    }

    const jsonBody = await readLimitedJson(req);
    if (!jsonBody.ok) {
      return mutationBadRequest(gate);
    }

    const mutation = validatePatchMutationBody(jsonBody.value);
    if (!mutation.ok) {
      return mutationBadRequest(gate);
    }

    const supabase = getSupabaseAdmin();
    const videoSpecs = videoAssetSpecsForPatch(
      mutation.value.resource,
      mutation.value.data,
      mutation.value.assets
    );
    const videosReady = await validateAssetsForCreate(supabase, videoSpecs);
    if (videosReady === "invalid") {
      return mutationBadRequest(gate);
    }
    if (videosReady === "unavailable") {
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const updated = await updateResourceWithRpc(supabase, mutation.value);
    if (!updated.ok) {
      if (updated.reason === "invalid_result") {
        console.error("[admin/solo-ganadores] update rpc returned invalid result", {
          resource: mutation.value.resource,
        });
        return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
      }

      const rpc = getControlledRpcError(updated.error);
      const status = patchRpcErrorStatus(rpc);
      console.error("[admin/solo-ganadores] update rpc failed", {
        resource: mutation.value.resource,
        code: getSafeErrorCode(updated.error),
        rpc: rpc ?? "UNCONTROLLED",
      });
      return withAuthCookies(json(status, patchRpcErrorBody(status, rpc)), gate);
    }

    return withAuthCookies(json(200, { ok: true, id: updated.value }), gate);
  } catch {
    console.error("[admin/solo-ganadores] patch unexpected error");
    return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return withAuthCookies(
      json(gate.status, {
        ok: false,
        error: gate.error,
      }),
      gate
    );
  }

  try {
    if (!isAllowedMutationOrigin(req)) {
      return withAuthCookies(json(403, { ok: false, error: "No autorizado" }), gate);
    }

    const { searchParams } = new URL(req.url);
    if (Array.from(searchParams.keys()).length > 0) {
      return mutationBadRequest(gate);
    }

    if (!validateContentHeaders(req)) {
      return mutationBadRequest(gate);
    }

    const jsonBody = await readLimitedJson(req);
    if (!jsonBody.ok) {
      return mutationBadRequest(gate);
    }

    const input = validateDeleteBody(jsonBody.value);
    if (!input.ok) {
      return mutationBadRequest(gate);
    }

    const { resource, id } = input.value;
    const supabase = getSupabaseAdmin();
    const table = tableForResource(resource);

    const result = await supabase
      .from(table)
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (result.error) {
      console.error("[admin/solo-ganadores] delete failed", {
        resource,
        code: result.error.code,
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const row = result.data as IdRow | null;
    if (!row) {
      return withAuthCookies(json(404, { ok: false, error: "No encontrado" }), gate);
    }

    if (!row.id || !UUID_RE.test(row.id)) {
      console.error("[admin/solo-ganadores] delete returned invalid id", {
        resource,
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    return withAuthCookies(json(200, { ok: true, id: row.id }), gate);
  } catch {
    console.error("[admin/solo-ganadores] unexpected delete error");
    return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return withAuthCookies(
      json(gate.status, {
        ok: false,
        error: gate.error,
      }),
      gate
    );
  }

  try {
    if (!isAllowedOrigin(req)) {
      return withAuthCookies(json(403, { ok: false, error: "No autorizado" }), gate);
    }

    const { searchParams } = new URL(req.url);
    if (Array.from(searchParams.keys()).length > 0) {
      return withAuthCookies(
        json(400, { ok: false, error: "Solicitud inv\u00e1lida" }),
        gate
      );
    }

    const supabaseUrl = getSupabaseUrl();
    const supabase = getSupabaseAdmin(supabaseUrl);

    const [eventsResult, postsResult, mediaResult] = await Promise.all([
      supabase
        .from("solo_ganadores_events")
        .select(
          "id,title,semester,event_date,location_name,address,city,description,recognitions,main_image_url,promo_video_url,status,published,featured,created_at,updated_at"
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("solo_ganadores_posts")
        .select(
          "id,source_module,source_winner_id,winner_name,winner_alias,title,prize_name,description,photo_url,video_url,interview_url,event_date,published,featured,created_at,updated_at"
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("solo_ganadores_media")
        .select(
          "id,title,media_type,media_url,description,related_winner_id,published,featured,created_at,updated_at"
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(300),
    ]);

    if (eventsResult.error) {
      console.error("[admin/solo-ganadores] events lookup failed", {
        code: getSafeErrorCode(eventsResult.error),
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    if (postsResult.error) {
      console.error("[admin/solo-ganadores] posts lookup failed", {
        code: getSafeErrorCode(postsResult.error),
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    if (mediaResult.error) {
      console.error("[admin/solo-ganadores] media lookup failed", {
        code: getSafeErrorCode(mediaResult.error),
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const stats: SanitizeStats = {
      excludedEvents: 0,
      excludedPosts: 0,
      excludedMedia: 0,
      invalidRelations: 0,
    };

    const eventRows = (eventsResult.data ?? []) as EventDbRow[];
    const postRows = (postsResult.data ?? []) as PostDbRow[];
    const mediaRows = (mediaResult.data ?? []) as MediaDbRow[];
    const [eventAssets, postAssets, mediaAssets] = await Promise.all([
      fetchConfirmedAssetsForResource(
        supabase,
        "event",
        eventRows.map((row) => row.id)
      ),
      fetchConfirmedAssetsForResource(
        supabase,
        "post",
        postRows.map((row) => row.id)
      ),
      fetchConfirmedAssetsForResource(
        supabase,
        "media",
        mediaRows.map((row) => row.id)
      ),
    ]);

    if (!eventAssets.ok || !postAssets.ok || !mediaAssets.ok) {
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const mappedAssets = buildOwnershipAssetMap([
      ...eventAssets.value,
      ...postAssets.value,
      ...mediaAssets.value,
    ]);
    if (!mappedAssets.ok) {
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const assetMap = mappedAssets.value;

    const events = eventRows
      .map((row) => toAdminEvent(row, stats, assetMap, supabaseUrl))
      .filter((event): event is AdminEvent => event !== null);

    const posts = postRows
      .map((row) => toAdminPost(row, stats, assetMap, supabaseUrl))
      .filter((post): post is AdminPost => post !== null);

    const media = mediaRows
      .map((row) => toAdminMedia(row, stats, assetMap, supabaseUrl))
      .filter((item): item is AdminMedia => item !== null);

    warnIfSanitized(stats);

    return withAuthCookies(
      json(200, {
        ok: true,
        events,
        posts,
        media,
      }),
      gate
    );
  } catch {
    console.error("[admin/solo-ganadores] unexpected error");
    return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
  }
}

export async function POST(req: NextRequest) {
  return handleMutation(req, "insert");
}

export async function PATCH(req: NextRequest) {
  return handlePatchMutation(req);
}

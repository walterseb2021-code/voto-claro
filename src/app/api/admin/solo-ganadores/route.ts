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

const MAX_BODY_BYTES = 65536;

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

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function withAuthCookies(response: NextResponse, gate: Awaited<ReturnType<typeof requireAdmin>>) {
  for (const { name, value, options } of gate.cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  return response;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
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

function validateResource(value: unknown): ValidationResult<Resource> {
  if (value === "event" || value === "post" || value === "media") {
    return { ok: true, value };
  }

  return { ok: false };
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

function tableForResource(resource: Resource) {
  if (resource === "event") return "solo_ganadores_events";
  if (resource === "post") return "solo_ganadores_posts";
  return "solo_ganadores_media";
}

function mutationBadRequest(gate: Awaited<ReturnType<typeof requireAdmin>>) {
  return withAuthCookies(json(400, { ok: false, error: "Solicitud inválida" }), gate);
}

function toAdminEvent(row: EventDbRow, stats: SanitizeStats): AdminEvent | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedEvents += 1;
    return null;
  }

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
  };
}

function toAdminPost(row: PostDbRow, stats: SanitizeStats): AdminPost | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedPosts += 1;
    return null;
  }

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
  };
}

function toAdminMedia(row: MediaDbRow, stats: SanitizeStats): AdminMedia | null {
  if (!UUID_RE.test(row.id)) {
    stats.excludedMedia += 1;
    return null;
  }

  return {
    id: row.id,
    title: requiredString(row.title),
    media_type: requiredString(row.media_type),
    media_url: requiredString(row.media_url),
    description: nullableString(row.description),
    related_winner_id: optionalUuid(row.related_winner_id, stats),
    published: row.published === true,
    featured: row.featured === true,
    created_at: nullableString(row.created_at),
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
}> {
  if (!isRecord(body)) return { ok: false };

  const expectedKeys =
    operation === "insert" ? ["resource", "data"] : ["resource", "id", "data"];

  if (!hasExactKeys(body, expectedKeys)) return { ok: false };

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

  return {
    ok: true,
    value: {
      resource: resource.value,
      id,
      payload: payload.value,
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

    const { resource, id, payload } = mutation.value;
    const supabase = getSupabaseAdmin();
    const table = tableForResource(resource);

    if (operation === "insert") {
      const result = await supabase
        .from(table)
        .insert(payload)
        .select("id")
        .single();

      if (result.error) {
        console.error("[admin/solo-ganadores] insert failed", {
          resource,
          code: result.error.code,
        });
        return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
      }

      const row = result.data as IdRow | null;
      if (!row?.id || !UUID_RE.test(row.id)) {
        console.error("[admin/solo-ganadores] insert returned invalid id", {
          resource,
        });
        return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
      }

      return withAuthCookies(json(201, { ok: true, id: row.id }), gate);
    }

    if (!id) {
      return mutationBadRequest(gate);
    }

    const result = await supabase
      .from(table)
      .update(payload)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (result.error) {
      console.error("[admin/solo-ganadores] update failed", {
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
      console.error("[admin/solo-ganadores] update returned invalid id", {
        resource,
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    return withAuthCookies(json(200, { ok: true, id: row.id }), gate);
  } catch {
    console.error("[admin/solo-ganadores] mutation unexpected error", { operation });
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
        json(400, { ok: false, error: "Solicitud inválida" }),
        gate
      );
    }

    const supabase = getSupabaseAdmin();

    const [eventsResult, postsResult, mediaResult] = await Promise.all([
      supabase
        .from("solo_ganadores_events")
        .select(
          "id,title,semester,event_date,location_name,address,city,description,recognitions,main_image_url,promo_video_url,status,published,featured,created_at"
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("solo_ganadores_posts")
        .select(
          "id,source_module,source_winner_id,winner_name,winner_alias,title,prize_name,description,photo_url,video_url,interview_url,event_date,published,featured,created_at"
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("solo_ganadores_media")
        .select(
          "id,title,media_type,media_url,description,related_winner_id,published,featured,created_at"
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(300),
    ]);

    if (eventsResult.error) {
      console.error("[admin/solo-ganadores] events lookup failed", eventsResult.error);
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    if (postsResult.error) {
      console.error("[admin/solo-ganadores] posts lookup failed", postsResult.error);
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    if (mediaResult.error) {
      console.error("[admin/solo-ganadores] media lookup failed", mediaResult.error);
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

    const events = eventRows
      .map((row) => toAdminEvent(row, stats))
      .filter((event): event is AdminEvent => event !== null);

    const posts = postRows
      .map((row) => toAdminPost(row, stats))
      .filter((post): post is AdminPost => post !== null);

    const media = mediaRows
      .map((row) => toAdminMedia(row, stats))
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
  } catch (error) {
    console.error("[admin/solo-ganadores] unexpected error", error);
    return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
  }
}

export async function POST(req: NextRequest) {
  return handleMutation(req, "insert");
}

export async function PATCH(req: NextRequest) {
  return handleMutation(req, "update");
}

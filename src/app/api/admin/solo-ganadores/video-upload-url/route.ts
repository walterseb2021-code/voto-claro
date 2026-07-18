import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VideoPurpose = "event_promo_video" | "post_video" | "media_video";

type VideoUploadRequest = {
  purpose: VideoPurpose;
  fileName: string;
  mime: "video/mp4";
  size: number;
};

type ValidationResult<T> = { ok: true; value: T } | { ok: false };

const BUCKET = "solo-ganadores";
const MAX_JSON_BYTES = 4096;
// Politica interna de VOTO CLARO para videos administrativos.
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const VIDEO_MIME = "video/mp4";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function withAuthCookies(response: NextResponse, gate: Awaited<ReturnType<typeof requireAdmin>>) {
  for (const { name, value, options } of gate.cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  return response;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase video upload configuration");
  }

  return { url, serviceKey };
}

function getSupabaseAdmin(url: string, serviceKey: string) {
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

function hasNoQueryParams(req: NextRequest) {
  return Array.from(new URL(req.url).searchParams.keys()).length === 0;
}

function hasValidJsonContentType(req: NextRequest) {
  const contentType = req.headers.get("content-type");
  if (!contentType) return false;

  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

async function readLimitedJson(req: NextRequest): Promise<ValidationResult<unknown>> {
  try {
    const raw = await req.text();

    if (!raw || Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) {
      return { ok: false };
    }

    const value: unknown = JSON.parse(raw);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
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

function validatePurpose(value: unknown): ValidationResult<VideoPurpose> {
  if (
    value === "event_promo_video" ||
    value === "post_video" ||
    value === "media_video"
  ) {
    return { ok: true, value };
  }

  return { ok: false };
}

function folderForPurpose(purpose: VideoPurpose) {
  if (purpose === "event_promo_video") return "eventos";
  if (purpose === "post_video") return "ganadores";
  return "galeria";
}

function getLastExtension(fileName: string) {
  const clean = fileName.trim().toLowerCase();
  const lastDot = clean.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === clean.length - 1) return null;

  return clean.slice(lastDot + 1);
}

function validateVideoBody(value: unknown): ValidationResult<VideoUploadRequest> {
  if (!isRecord(value)) return { ok: false };
  if (!hasExactKeys(value, ["purpose", "fileName", "mime", "size"])) {
    return { ok: false };
  }

  const purpose = validatePurpose(value.purpose);
  if (!purpose.ok) return { ok: false };

  if (typeof value.fileName !== "string") return { ok: false };
  const fileName = value.fileName.trim();
  if (!fileName || fileName.length > 255) return { ok: false };

  const extension = getLastExtension(fileName);
  if (extension !== "mp4") return { ok: false };

  if (value.mime !== VIDEO_MIME) return { ok: false };

  if (
    typeof value.size !== "number" ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    value.size > MAX_VIDEO_BYTES
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      purpose: purpose.value,
      fileName,
      mime: VIDEO_MIME,
      size: value.size,
    },
  };
}

function buildTusEndpoint(supabaseUrl: string) {
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:") {
      return null;
    }

    if (
      url.username ||
      url.password ||
      url.port ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    const suffix = ".supabase.co";
    if (!url.hostname.endsWith(suffix)) {
      return null;
    }

    const projectRef = url.hostname.slice(0, -suffix.length);
    if (!projectRef || projectRef.includes(".")) {
      return null;
    }

    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  } catch {
    return null;
  }
}

function validatePublicUrl(value: unknown) {
  if (typeof value !== "string") return null;

  const clean = value.trim();
  if (!clean) return null;

  try {
    const url = new URL(clean);
    return url.protocol === "http:" || url.protocol === "https:" ? clean : null;
  } catch {
    return null;
  }
}

function getSafeErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function badRequest(gate: Awaited<ReturnType<typeof requireAdmin>>) {
  return withAuthCookies(json(400, { ok: false, error: "Solicitud inválida" }), gate);
}

export async function POST(req: NextRequest) {
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

    if (!hasNoQueryParams(req) || !hasValidJsonContentType(req)) {
      return badRequest(gate);
    }

    const jsonBody = await readLimitedJson(req);
    if (!jsonBody.ok) {
      return badRequest(gate);
    }

    const input = validateVideoBody(jsonBody.value);
    if (!input.ok) {
      return badRequest(gate);
    }

    const { purpose } = input.value;
    const folder = folderForPurpose(purpose);
    const path = `${folder}/${crypto.randomUUID()}.mp4`;
    const config = getSupabaseConfig();
    const endpoint = buildTusEndpoint(config.url);

    if (!endpoint) {
      console.error("[admin/solo-ganadores/video-upload-url] endpoint unavailable", {
        purpose,
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const supabase = getSupabaseAdmin(config.url, config.serviceKey);

    const signed = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, {
      upsert: false,
    });

    if (signed.error) {
      console.error("[admin/solo-ganadores/video-upload-url] signed upload failed", {
        purpose,
        code: getSafeErrorCode(signed.error),
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    if (!signed.data) {
      console.error("[admin/solo-ganadores/video-upload-url] invalid signed upload data", {
        purpose,
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const token =
      typeof signed.data.token === "string" ? signed.data.token.trim() : "";
    const signedPath =
      typeof signed.data.path === "string" ? signed.data.path.trim() : "";

    if (!token || signedPath !== path) {
      console.error("[admin/solo-ganadores/video-upload-url] invalid signed upload data", {
        purpose,
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = validatePublicUrl(data.publicUrl);

    if (!publicUrl) {
      console.error("[admin/solo-ganadores/video-upload-url] public url unavailable", {
        purpose,
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    return withAuthCookies(
      json(201, {
        ok: true,
        token,
        path,
        url: publicUrl,
        endpoint,
        maxBytes: MAX_VIDEO_BYTES,
      }),
      gate
    );
  } catch {
    console.error("[admin/solo-ganadores/video-upload-url] unexpected error");
    return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
  }
}

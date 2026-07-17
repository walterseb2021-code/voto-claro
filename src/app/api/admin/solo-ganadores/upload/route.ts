import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImagePurpose = "event_main_image" | "post_photo" | "media_image";
type AllowedImageMime = "image/jpeg" | "image/png" | "image/webp";
type DetectedImage = {
  mime: AllowedImageMime;
  extension: "jpg" | "png" | "webp";
};

type ValidationResult<T> = { ok: true; value: T } | { ok: false };

const BUCKET = "solo-ganadores";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

const PURPOSES = new Set<ImagePurpose>([
  "event_main_image",
  "post_photo",
  "media_image",
]);

const MIME_EXTENSIONS: Record<AllowedImageMime, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

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
    throw new Error("Missing Supabase admin upload configuration");
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

function hasValidMultipartContentType(req: NextRequest) {
  const contentType = req.headers.get("content-type");
  if (!contentType) return false;

  const parts = contentType.split(";").map((part) => part.trim());
  const mediaType = parts.shift()?.toLowerCase();

  if (mediaType !== "multipart/form-data") {
    return false;
  }

  let boundary: string | null = null;

  for (const parameter of parts) {
    const separator = parameter.indexOf("=");
    if (separator <= 0) continue;

    const name = parameter.slice(0, separator).trim().toLowerCase();
    if (name !== "boundary") continue;

    if (boundary !== null) {
      return false;
    }

    let value = parameter.slice(separator + 1).trim();

    if (value.startsWith('"') || value.endsWith('"')) {
      if (
        value.length < 2 ||
        !value.startsWith('"') ||
        !value.endsWith('"')
      ) {
        return false;
      }

      value = value.slice(1, -1).trim();
    }

    if (!value) {
      return false;
    }

    boundary = value;
  }

  return boundary !== null;
}

function hasValidContentLength(req: NextRequest) {
  const contentLength = req.headers.get("content-length");
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;

  const size = Number(contentLength);
  return (
    Number.isSafeInteger(size) &&
    size > 0 &&
    size <= MAX_MULTIPART_BYTES
  );
}

function validatePurpose(value: unknown): ValidationResult<ImagePurpose> {
  if (typeof value !== "string" || !PURPOSES.has(value as ImagePurpose)) {
    return { ok: false };
  }

  return { ok: true, value: value as ImagePurpose };
}

function folderForPurpose(purpose: ImagePurpose) {
  if (purpose === "event_main_image") return "eventos";
  if (purpose === "post_photo") return "ganadores";
  return "galeria";
}

function getLastExtension(fileName: string) {
  const clean = fileName.trim().toLowerCase();
  const lastDot = clean.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === clean.length - 1) return null;

  return clean.slice(lastDot + 1);
}

function isAllowedMime(value: string): value is AllowedImageMime {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function detectImage(bytes: Uint8Array): DetectedImage | null {
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", extension: "png" };
  }

  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", extension: "webp" };
  }

  return null;
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

async function validateFormData(req: NextRequest): Promise<
  ValidationResult<{
    purpose: ImagePurpose;
    file: File;
  }>
> {
  let formData: FormData;

  try {
    formData = await req.formData();
  } catch {
    return { ok: false };
  }

  const keys = Array.from(formData.keys());
  if (
    keys.length !== 2 ||
    !keys.includes("purpose") ||
    !keys.includes("file")
  ) {
    return { ok: false };
  }

  const purposes = formData.getAll("purpose");
  const files = formData.getAll("file");

  if (purposes.length !== 1 || files.length !== 1) {
    return { ok: false };
  }

  const purposeResult = validatePurpose(purposes[0]);
  const file = files[0];

  if (!purposeResult.ok || !(file instanceof File)) {
    return { ok: false };
  }

  if (!file.name.trim() || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return { ok: false };
  }

  return { ok: true, value: { purpose: purposeResult.value, file } };
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

    if (
      !hasNoQueryParams(req) ||
      !hasValidMultipartContentType(req) ||
      !hasValidContentLength(req)
    ) {
      return withAuthCookies(
        json(400, { ok: false, error: "Solicitud inválida" }),
        gate
      );
    }

    const input = await validateFormData(req);
    if (!input.ok) {
      return withAuthCookies(
        json(400, { ok: false, error: "Solicitud inválida" }),
        gate
      );
    }

    const { purpose, file } = input.value;
    const extension = getLastExtension(file.name);

    if (!extension || !isAllowedMime(file.type)) {
      return withAuthCookies(
        json(400, { ok: false, error: "Solicitud inválida" }),
        gate
      );
    }

    if (!MIME_EXTENSIONS[file.type].includes(extension)) {
      return withAuthCookies(
        json(400, { ok: false, error: "Solicitud inválida" }),
        gate
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      return withAuthCookies(
        json(400, { ok: false, error: "Solicitud inválida" }),
        gate
      );
    }

    const detected = detectImage(bytes);

    if (
      !detected ||
      detected.mime !== file.type ||
      !MIME_EXTENSIONS[detected.mime].includes(extension)
    ) {
      return withAuthCookies(
        json(400, { ok: false, error: "Solicitud inválida" }),
        gate
      );
    }

    const folder = folderForPurpose(purpose);
    const path = `${folder}/${crypto.randomUUID()}.${detected.extension}`;
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
      cacheControl: "3600",
      contentType: detected.mime,
      upsert: false,
    });

    if (error) {
      console.error("[admin/solo-ganadores/upload] upload failed", {
        purpose,
        code: getSafeErrorCode(error),
      });
      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = validatePublicUrl(data.publicUrl);

    if (!publicUrl) {
      console.error("[admin/solo-ganadores/upload] public url unavailable", {
        purpose,
      });

      const cleanup = await supabase.storage.from(BUCKET).remove([path]);
      if (cleanup.error) {
        console.error("[admin/solo-ganadores/upload] cleanup failed", {
          purpose,
          code: getSafeErrorCode(cleanup.error),
        });
      }

      return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
    }

    return withAuthCookies(
      json(201, {
        ok: true,
        url: publicUrl,
        path,
      }),
      gate
    );
  } catch {
    console.error("[admin/solo-ganadores/upload] unexpected upload error");
    return withAuthCookies(json(500, { ok: false, error: "No disponible" }), gate);
  }
}

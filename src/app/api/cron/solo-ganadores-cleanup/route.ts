import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CleanupAsset = {
  asset_id: string;
  cleanup_token: string;
  bucket: string;
  object_path: string;
  public_url: string;
  resource_type: ResourceType;
  resource_id: string;
  resource_field: ResourceField;
  purpose: AssetPurpose;
  media_kind: AssetKind;
};

type CleanupClaimIdentity = {
  asset_id: string;
  cleanup_token: string;
};

type ResourceType = "event" | "post" | "media";

type ResourceField =
  | "main_image_url"
  | "promo_video_url"
  | "photo_url"
  | "video_url"
  | "media_url";

type AssetPurpose =
  | "event_main_image"
  | "event_promo_video"
  | "post_photo"
  | "post_video"
  | "media_image"
  | "media_video";

type AssetKind = "image" | "video";

type RetryableCleanupFailure = {
  errorCode: "STORAGE_ERROR" | "STORAGE_NOT_FOUND_CHECK_FAILED" | "UNKNOWN_ERROR";
  retryable: true;
};

type PermanentCleanupFailure = {
  errorCode: "REFERENCE_CONFLICT" | "INVALID_BUCKET" | "INVALID_PATH";
  retryable: false;
};

type CleanupFailure = RetryableCleanupFailure | PermanentCleanupFailure;

type CleanupStats = {
  claimed: number;
  deleted: number;
  failed: number;
  skipped: number;
};

type ValidationResult<T> = { ok: true; value: T } | { ok: false };

const BUCKET = "solo-ganadores";
const CLAIM_LIMIT = 1;
const GRACE_SECONDS = 86400;
const CLAIM_TTL_SECONDS = 900;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_PATH_RE =
  /^(eventos|ganadores|galeria)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$/;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function cleanupErrorResponse() {
  return json(500, { ok: false, error: "CLEANUP_FAILED" });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getSafeErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function getControlledRpcError(error: unknown) {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return null;
  }

  const message = (error as { message?: unknown }).message;
  return message === "CLAIM_NOT_FOUND" ? message : null;
}

function isAuthorizedCronRequest(req: NextRequest): ValidationResult<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    throw new Error("MISSING_CRON_SECRET");
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;

  const providedBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return { ok: false };
  }

  return timingSafeEqual(providedBuffer, expectedBuffer)
    ? { ok: true, value: undefined }
    : { ok: false };
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("MISSING_SUPABASE_CONFIG");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function validateClaimIdentity(value: unknown): ValidationResult<CleanupClaimIdentity> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false };
  }

  const row = value as Record<string, unknown>;

  if (
    !isNonEmptyString(row.asset_id) ||
    !isNonEmptyString(row.cleanup_token) ||
    !UUID_RE.test(row.asset_id) ||
    !UUID_RE.test(row.cleanup_token)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      asset_id: row.asset_id,
      cleanup_token: row.cleanup_token,
    },
  };
}

function isValidResourceType(value: unknown): value is ResourceType {
  return value === "event" || value === "post" || value === "media";
}

function isValidResourceField(value: unknown): value is ResourceField {
  return (
    value === "main_image_url" ||
    value === "promo_video_url" ||
    value === "photo_url" ||
    value === "video_url" ||
    value === "media_url"
  );
}

function isValidAssetPurpose(value: unknown): value is AssetPurpose {
  return (
    value === "event_main_image" ||
    value === "event_promo_video" ||
    value === "post_photo" ||
    value === "post_video" ||
    value === "media_image" ||
    value === "media_video"
  );
}

function isValidAssetKind(value: unknown): value is AssetKind {
  return value === "image" || value === "video";
}

function isValidOwnershipTuple(
  resourceType: ResourceType,
  resourceField: ResourceField,
  purpose: AssetPurpose,
  mediaKind: AssetKind
) {
  return (
    (
      resourceType === "event" &&
      resourceField === "main_image_url" &&
      purpose === "event_main_image" &&
      mediaKind === "image"
    ) ||
    (
      resourceType === "event" &&
      resourceField === "promo_video_url" &&
      purpose === "event_promo_video" &&
      mediaKind === "video"
    ) ||
    (
      resourceType === "post" &&
      resourceField === "photo_url" &&
      purpose === "post_photo" &&
      mediaKind === "image"
    ) ||
    (
      resourceType === "post" &&
      resourceField === "video_url" &&
      purpose === "post_video" &&
      mediaKind === "video"
    ) ||
    (
      resourceType === "media" &&
      resourceField === "media_url" &&
      purpose === "media_image" &&
      mediaKind === "image"
    ) ||
    (
      resourceType === "media" &&
      resourceField === "media_url" &&
      purpose === "media_video" &&
      mediaKind === "video"
    )
  );
}

function validateClaimedAsset(value: unknown): ValidationResult<CleanupAsset> {
  const identity = validateClaimIdentity(value);
  if (!identity.ok) {
    return { ok: false };
  }

  const row = value as Record<string, unknown>;

  if (
    !isNonEmptyString(row.bucket) ||
    !isNonEmptyString(row.object_path) ||
    !isNonEmptyString(row.public_url)
  ) {
    return { ok: false };
  }

  if (
    !isValidResourceType(row.resource_type) ||
    !isNonEmptyString(row.resource_id) ||
    !UUID_RE.test(row.resource_id) ||
    !isValidResourceField(row.resource_field) ||
    !isValidAssetPurpose(row.purpose) ||
    !isValidAssetKind(row.media_kind)
  ) {
    return { ok: false };
  }

  if (
    !isValidOwnershipTuple(
      row.resource_type,
      row.resource_field,
      row.purpose,
      row.media_kind
    )
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      asset_id: identity.value.asset_id,
      cleanup_token: identity.value.cleanup_token,
      bucket: row.bucket,
      object_path: row.object_path,
      public_url: row.public_url,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      resource_field: row.resource_field,
      purpose: row.purpose,
      media_kind: row.media_kind,
    },
  };
}

function isValidObjectPath(path: string) {
  return OBJECT_PATH_RE.test(path);
}

function isImageObjectPath(path: string) {
  return (
    path.endsWith(".jpg") ||
    path.endsWith(".png") ||
    path.endsWith(".webp")
  );
}

function isObjectPathCompatibleWithAsset(asset: CleanupAsset) {
  if (asset.resource_type === "event" && !asset.object_path.startsWith("eventos/")) {
    return false;
  }

  if (asset.resource_type === "post" && !asset.object_path.startsWith("ganadores/")) {
    return false;
  }

  if (asset.resource_type === "media" && !asset.object_path.startsWith("galeria/")) {
    return false;
  }

  if (asset.media_kind === "image") {
    return isImageObjectPath(asset.object_path);
  }

  return asset.object_path.endsWith(".mp4");
}

async function failCleanupClaim(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  asset: CleanupClaimIdentity,
  failure: CleanupFailure
) {
  const result = await supabase.rpc("fail_solo_ganadores_asset_cleanup", {
    p_asset_id: asset.asset_id,
    p_cleanup_token: asset.cleanup_token,
    p_error_code: failure.errorCode,
    p_retryable: failure.retryable,
  });

  if (result.error) {
    console.warn("[cron/solo-ganadores-cleanup] failure rpc failed", {
      code: getSafeErrorCode(result.error),
      rpc: getControlledRpcError(result.error) ?? "UNCONTROLLED",
    });
    return false;
  }

  return typeof result.data === "string" && UUID_RE.test(result.data);
}

async function completeCleanupClaim(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  asset: CleanupAsset
) {
  const result = await supabase.rpc("complete_solo_ganadores_asset_cleanup", {
    p_asset_id: asset.asset_id,
    p_cleanup_token: asset.cleanup_token,
  });

  if (result.error) {
    console.warn("[cron/solo-ganadores-cleanup] complete rpc failed", {
      code: getSafeErrorCode(result.error),
      rpc: getControlledRpcError(result.error) ?? "UNCONTROLLED",
    });
    return false;
  }

  return typeof result.data === "string" && UUID_RE.test(result.data);
}

async function hasReferenceInTable(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  fields: string[],
  publicUrl: string
): Promise<"referenced" | "clear" | "error"> {
  for (const field of fields) {
    const result = await supabase
      .from(table)
      .select("id")
      .eq(field, publicUrl)
      .limit(1);

    if (result.error) {
      console.warn("[cron/solo-ganadores-cleanup] reference lookup failed", {
        table,
        field,
        code: getSafeErrorCode(result.error),
      });
      return "error";
    }

    if ((result.data ?? []).length > 0) {
      return "referenced";
    }
  }

  return "clear";
}

async function hasActiveReference(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  publicUrl: string
): Promise<"referenced" | "clear" | "error"> {
  const checks: Array<{ table: string; fields: string[] }> = [
    {
      table: "solo_ganadores_events",
      fields: ["main_image_url", "promo_video_url"],
    },
    {
      table: "solo_ganadores_posts",
      fields: ["photo_url", "video_url", "interview_url"],
    },
    {
      table: "solo_ganadores_media",
      fields: ["media_url"],
    },
  ];

  for (const check of checks) {
    const result = await hasReferenceInTable(
      supabase,
      check.table,
      check.fields,
      publicUrl
    );

    if (result !== "clear") return result;
  }

  return "clear";
}

async function objectExistsAfterRemoveError(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  asset: CleanupAsset
): Promise<"exists" | "missing" | "unknown"> {
  try {
    const result = await supabase.storage.from(asset.bucket).exists(asset.object_path);
    if (result.error) {
      return "unknown";
    }

    if (result.data === true) {
      return "exists";
    }

    if (result.data === false) {
      return "missing";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

async function processClaimedAsset(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  asset: CleanupAsset,
  stats: CleanupStats
) {
  if (asset.bucket !== BUCKET) {
    const failed = await failCleanupClaim(supabase, asset, {
      errorCode: "INVALID_BUCKET",
      retryable: false,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  if (!isValidObjectPath(asset.object_path)) {
    const failed = await failCleanupClaim(supabase, asset, {
      errorCode: "INVALID_PATH",
      retryable: false,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  if (!isObjectPathCompatibleWithAsset(asset)) {
    const failed = await failCleanupClaim(supabase, asset, {
      errorCode: "INVALID_PATH",
      retryable: false,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  const reference = await hasActiveReference(supabase, asset.public_url);
  if (reference === "referenced") {
    const failed = await failCleanupClaim(supabase, asset, {
      errorCode: "REFERENCE_CONFLICT",
      retryable: false,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  if (reference === "error") {
    const failed = await failCleanupClaim(supabase, asset, {
      errorCode: "UNKNOWN_ERROR",
      retryable: true,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  const removed = await supabase.storage
    .from(asset.bucket)
    .remove([asset.object_path]);

  if (removed.error) {
    const existence = await objectExistsAfterRemoveError(supabase, asset);
    if (existence === "missing") {
      const completed = await completeCleanupClaim(supabase, asset);
      stats[completed ? "deleted" : "failed"] += 1;
      return;
    }

    const failed = await failCleanupClaim(supabase, asset, {
      errorCode:
        existence === "unknown"
          ? "STORAGE_NOT_FOUND_CHECK_FAILED"
          : "STORAGE_ERROR",
      retryable: true,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  const completed = await completeCleanupClaim(supabase, asset);
  stats[completed ? "deleted" : "failed"] += 1;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (Array.from(searchParams.keys()).length > 0) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }

    const auth = isAuthorizedCronRequest(req);
    if (!auth.ok) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }

    const supabase = getSupabaseAdmin();

    console.info("[cron/solo-ganadores-cleanup] cleanup started");

    const claimed = await supabase.rpc("claim_solo_ganadores_assets_for_cleanup", {
      p_limit: CLAIM_LIMIT,
      p_grace_seconds: GRACE_SECONDS,
      p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
    });

    if (claimed.error || !Array.isArray(claimed.data)) {
      console.error("[cron/solo-ganadores-cleanup] claim rpc failed", {
        code: getSafeErrorCode(claimed.error),
      });
      return cleanupErrorResponse();
    }

    const stats: CleanupStats = {
      claimed: claimed.data.length,
      deleted: 0,
      failed: 0,
      skipped: 0,
    };

    console.info("[cron/solo-ganadores-cleanup] assets claimed", {
      claimed: stats.claimed,
    });

    if (claimed.data.length === 0) {
      return json(200, { ok: true, ...stats });
    }

    for (const row of claimed.data) {
      const identity = validateClaimIdentity(row);
      if (!identity.ok) {
        console.error("[cron/solo-ganadores-cleanup] invalid claimed asset identity");
        stats.skipped += 1;
        continue;
      }

      const asset = validateClaimedAsset(row);
      if (!asset.ok) {
        console.warn("[cron/solo-ganadores-cleanup] invalid claimed asset metadata");
        const failed = await failCleanupClaim(supabase, identity.value, {
          errorCode: "REFERENCE_CONFLICT",
          retryable: false,
        });
        stats[failed ? "failed" : "skipped"] += 1;
        continue;
      }

      await processClaimedAsset(supabase, asset.value, stats);
    }

    console.info("[cron/solo-ganadores-cleanup] cleanup finished", stats);

    return json(200, { ok: true, ...stats });
  } catch (error) {
    const reason =
      error instanceof Error && error.message === "MISSING_CRON_SECRET"
        ? "missing-cron-secret"
        : "unexpected";

    console.error("[cron/solo-ganadores-cleanup] cleanup failed", { reason });
    return cleanupErrorResponse();
  }
}

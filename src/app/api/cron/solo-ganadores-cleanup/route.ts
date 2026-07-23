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
  resource_type: ResourceType | null;
  resource_id: string | null;
  resource_field: ResourceField | null;
  purpose: AssetPurpose;
  media_kind: AssetKind;
  status: "deleting";
  cleanup_origin: CleanupOrigin;
  deleting_at: string;
  deleted_at: null;
  cleanup_claimed_at: string;
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

type CleanupOrigin = "expired_pending" | null;

type OwnershipState = "complete" | "null" | "partial";

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

type ClaimedAssetLoadResult =
  | { status: "loaded"; asset: CleanupAsset }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "error" };

const BUCKET = "solo-ganadores";
const CLAIM_LIMIT = 1;
const GRACE_SECONDS = 86400;
const CLAIM_TTL_SECONDS = 900;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_PATH_RE =
  /^(eventos|ganadores|galeria)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$/;
const TIMEZONE_RE = /(Z|[+-][0-9]{2}:[0-9]{2})$/;

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

function isValidTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const trimmed = value.trim();
  return TIMEZONE_RE.test(trimmed) && Number.isFinite(Date.parse(trimmed));
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

function getSupabaseOrigin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("MISSING_SUPABASE_CONFIG");
  }

  return new URL(url).origin;
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

function isValidCleanupOrigin(value: unknown): value is CleanupOrigin {
  return value === null || value === "expired_pending";
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

function classifyOwnership(row: Record<string, unknown>): OwnershipState {
  if (
    isValidResourceType(row.resource_type) &&
    isNonEmptyString(row.resource_id) &&
    UUID_RE.test(row.resource_id) &&
    isValidResourceField(row.resource_field)
  ) {
    return "complete";
  }

  if (
    row.resource_type === null &&
    row.resource_id === null &&
    row.resource_field === null
  ) {
    return "null";
  }

  return "partial";
}

function validateLoadedCleanupAsset(
  value: unknown,
  identity: CleanupClaimIdentity
): ValidationResult<CleanupAsset> {
  const row = value as Record<string, unknown>;

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    row.id !== identity.asset_id ||
    row.cleanup_token !== identity.cleanup_token ||
    !isNonEmptyString(row.bucket) ||
    !isNonEmptyString(row.object_path) ||
    !isNonEmptyString(row.public_url) ||
    row.status !== "deleting" ||
    !isValidCleanupOrigin(row.cleanup_origin) ||
    !isValidTimestamp(row.deleting_at) ||
    row.deleted_at !== null ||
    !isValidTimestamp(row.cleanup_claimed_at) ||
    !isValidAssetPurpose(row.purpose) ||
    !isValidAssetKind(row.media_kind)
  ) {
    return { ok: false };
  }

  const ownership = classifyOwnership(row);
  if (ownership === "partial") {
    return { ok: false };
  }

  if (ownership === "complete" && row.cleanup_origin !== null) {
    return { ok: false };
  }

  if (ownership === "null" && row.cleanup_origin !== "expired_pending") {
    return { ok: false };
  }

  if (
    ownership === "complete" &&
    !isValidOwnershipTuple(
      row.resource_type as ResourceType,
      row.resource_field as ResourceField,
      row.purpose,
      row.media_kind
    )
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      asset_id: identity.asset_id,
      cleanup_token: identity.cleanup_token,
      bucket: row.bucket,
      object_path: row.object_path,
      public_url: row.public_url,
      resource_type: ownership === "complete" ? (row.resource_type as ResourceType) : null,
      resource_id: ownership === "complete" ? (row.resource_id as string) : null,
      resource_field: ownership === "complete" ? (row.resource_field as ResourceField) : null,
      purpose: row.purpose,
      media_kind: row.media_kind,
      status: "deleting",
      cleanup_origin: row.cleanup_origin,
      deleting_at: row.deleting_at,
      deleted_at: null,
      cleanup_claimed_at: row.cleanup_claimed_at,
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
  if (asset.resource_type === null) {
    return false;
  }

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

function isExpiredPendingObjectPathCompatible(asset: CleanupAsset) {
  const assetId = asset.asset_id.toLowerCase();

  if (asset.purpose === "event_main_image" && asset.media_kind === "image") {
    return new RegExp(`^eventos/${assetId}\\.(jpg|png|webp)$`).test(
      asset.object_path
    );
  }

  if (asset.purpose === "event_promo_video" && asset.media_kind === "video") {
    return asset.object_path === `eventos/${assetId}.mp4`;
  }

  if (asset.purpose === "post_photo" && asset.media_kind === "image") {
    return new RegExp(`^ganadores/${assetId}\\.(jpg|png|webp)$`).test(
      asset.object_path
    );
  }

  if (asset.purpose === "post_video" && asset.media_kind === "video") {
    return asset.object_path === `ganadores/${assetId}.mp4`;
  }

  if (asset.purpose === "media_image" && asset.media_kind === "image") {
    return new RegExp(`^galeria/${assetId}\\.(jpg|png|webp)$`).test(
      asset.object_path
    );
  }

  if (asset.purpose === "media_video" && asset.media_kind === "video") {
    return asset.object_path === `galeria/${assetId}.mp4`;
  }

  return false;
}

function isAuthorizedLegacyCleanupAsset(asset: CleanupAsset) {
  return (
    (
      asset.asset_id === "7c4f2a9e-8b6d-4a30-9c6f-2e1d5a0b3c41" &&
      asset.resource_type === "event" &&
      asset.resource_id === "34ee17ef-f619-412a-9b2f-6cbbf9d19e84" &&
      asset.resource_field === "main_image_url" &&
      asset.purpose === "event_main_image" &&
      asset.media_kind === "image" &&
      asset.object_path === "eventos/1777247882007-1.jpg" &&
      asset.cleanup_origin === null
    ) ||
    (
      asset.asset_id === "9f2d6a1b-3c84-4e92-8f51-7a6c0d2b5e13" &&
      asset.resource_type === "post" &&
      asset.resource_id === "3515459c-d423-4675-9ce8-26d67e0f3ae1" &&
      asset.resource_field === "photo_url" &&
      asset.purpose === "post_photo" &&
      asset.media_kind === "image" &&
      asset.object_path === "ganadores/1777250755974-camones-2-300x200.jpg" &&
      asset.cleanup_origin === null
    ) ||
    (
      asset.asset_id === "2e8c7f41-6d95-4b3a-a2f7-0c9e1d8b6a52" &&
      asset.resource_type === "media" &&
      asset.resource_id === "75439f96-ac27-4497-8c24-b7af747378f1" &&
      asset.resource_field === "media_url" &&
      asset.purpose === "media_image" &&
      asset.media_kind === "image" &&
      asset.object_path === "galeria/1777232612501-camones-2-300x200.jpg" &&
      asset.cleanup_origin === null
    )
  );
}

function isCleanupObjectPathValid(asset: CleanupAsset) {
  if (asset.cleanup_origin === "expired_pending") {
    return isExpiredPendingObjectPathCompatible(asset);
  }

  if (asset.cleanup_origin !== null) {
    return false;
  }

  if (isAuthorizedLegacyCleanupAsset(asset)) {
    return true;
  }

  return isValidObjectPath(asset.object_path) && isObjectPathCompatibleWithAsset(asset);
}

function isCanonicalPublicUrl(asset: CleanupAsset, supabaseOrigin: string) {
  try {
    const url = new URL(asset.public_url);
    const expectedPath = `/storage/v1/object/public/${BUCKET}/${asset.object_path}`;

    return (
      url.protocol === "https:" &&
      url.origin === supabaseOrigin &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === expectedPath &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
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

async function loadClaimedAsset(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  identity: CleanupClaimIdentity
): Promise<ClaimedAssetLoadResult> {
  const result = await supabase
    .from("solo_ganadores_assets")
    .select(
      [
        "id",
        "bucket",
        "object_path",
        "public_url",
        "resource_type",
        "resource_id",
        "resource_field",
        "purpose",
        "media_kind",
        "status",
        "cleanup_origin",
        "deleting_at",
        "deleted_at",
        "cleanup_token",
        "cleanup_claimed_at",
      ].join(",")
    )
    .eq("id", identity.asset_id)
    .eq("cleanup_token", identity.cleanup_token)
    .eq("status", "deleting")
    .is("deleted_at", null)
    .not("cleanup_claimed_at", "is", null)
    .limit(2);

  if (result.error) {
    console.warn("[cron/solo-ganadores-cleanup] claimed asset reload failed", {
      code: getSafeErrorCode(result.error),
    });
    return { status: "error" };
  }

  const rows = result.data ?? [];
  if (rows.length === 0) {
    return { status: "missing" };
  }

  if (rows.length > 1) {
    console.warn("[cron/solo-ganadores-cleanup] claimed asset reload duplicated");
    return { status: "invalid" };
  }

  const validated = validateLoadedCleanupAsset(rows[0], identity);
  if (!validated.ok) {
    console.warn("[cron/solo-ganadores-cleanup] claimed asset reload invalid");
    return { status: "invalid" };
  }

  return { status: "loaded", asset: validated.value };
}

async function hasActiveReference(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  publicUrl: string
): Promise<"referenced" | "clear" | "error"> {
  const result = await supabase.rpc("solo_ganadores_asset_has_active_reference", {
    p_public_url: publicUrl,
  });

  if (result.error) {
    console.warn("[cron/solo-ganadores-cleanup] reference rpc failed", {
      code: getSafeErrorCode(result.error),
    });
    return "error";
  }

  if (result.data === true) {
    return "referenced";
  }

  if (result.data === false) {
    return "clear";
  }

  console.warn("[cron/solo-ganadores-cleanup] reference rpc invalid response");
  return "error";
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
  supabaseOrigin: string,
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

  if (!isCleanupObjectPathValid(asset)) {
    const failed = await failCleanupClaim(supabase, asset, {
      errorCode: "INVALID_PATH",
      retryable: false,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  if (!isCanonicalPublicUrl(asset, supabaseOrigin)) {
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

  const secondReference = await hasActiveReference(supabase, asset.public_url);
  if (secondReference === "referenced") {
    const failed = await failCleanupClaim(supabase, asset, {
      errorCode: "REFERENCE_CONFLICT",
      retryable: false,
    });
    stats[failed ? "failed" : "skipped"] += 1;
    return;
  }

  if (secondReference === "error") {
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
    const supabaseOrigin = getSupabaseOrigin();

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

      const loaded = await loadClaimedAsset(supabase, identity.value);
      if (loaded.status === "missing") {
        console.warn("[cron/solo-ganadores-cleanup] claimed asset no longer current");
        stats.skipped += 1;
        continue;
      }

      if (loaded.status === "error") {
        const failed = await failCleanupClaim(supabase, identity.value, {
          errorCode: "UNKNOWN_ERROR",
          retryable: true,
        });
        stats[failed ? "failed" : "skipped"] += 1;
        continue;
      }

      if (loaded.status === "invalid") {
        const failed = await failCleanupClaim(supabase, identity.value, {
          errorCode: "INVALID_PATH",
          retryable: false,
        });
        stats[failed ? "failed" : "skipped"] += 1;
        continue;
      }

      await processClaimedAsset(supabase, loaded.asset, supabaseOrigin, stats);
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

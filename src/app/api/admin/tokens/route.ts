import { randomBytes } from "node:crypto";
import { type NextRequest } from "next/server";

import {
  createRetoAdminRequestId,
  getRetoAdminSupabase,
  hasExactKeys,
  isAllowedRetoAdminMutationOrigin,
  isUuid,
  normalizeOptionalText,
  parseNullableTimestamp,
  readRetoAdminJsonObject,
  requireRetoAdmin,
  retoAdminJson,
  withRetoAdminAuthCookies,
} from "@/lib/retoAdminApi";

export const runtime = "nodejs";

const PITCH_GROUPS = [
  "GRUPOA",
  "GRUPOB",
  "GRUPOC",
  "GRUPOD",
  "GRUPOE",
] as const;

type PitchGroup = (typeof PITCH_GROUPS)[number];

const CREATE_KEYS = [
  "group_code",
  "expires_at",
  "note",
] as const;

const UPDATE_KEYS = [
  "id",
  "is_active",
  "expires_at",
  "note",
] as const;

function parsePitchGroup(value: unknown): PitchGroup | null {
  if (typeof value !== "string") return null;

  return (PITCH_GROUPS as readonly string[]).includes(value)
    ? (value as PitchGroup)
    : null;
}

function parseCreateRpcResult(data: unknown) {
  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    !data[0] ||
    typeof data[0] !== "object" ||
    Array.isArray(data[0])
  ) {
    return null;
  }

  const row = data[0] as Record<string, unknown>;

  const id =
    typeof row.result_link_id === "string"
      ? row.result_link_id.trim()
      : "";

  const group =
    typeof row.result_group_code === "string"
      ? row.result_group_code
      : "";

  const isActive = row.result_is_active;

  const expiresAt =
    row.result_expires_at === null ||
    typeof row.result_expires_at === "string"
      ? row.result_expires_at
      : undefined;

  const createdAt =
    typeof row.result_created_at === "string"
      ? row.result_created_at
      : "";

  if (
    !isUuid(id) ||
    !parsePitchGroup(group) ||
    isActive !== true ||
    expiresAt === undefined ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,
    group_code: group as PitchGroup,
    is_active: true,
    expires_at: expiresAt,
    created_at: createdAt,
  };
}

function parseStateRpcResult(data: unknown) {
  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    !data[0] ||
    typeof data[0] !== "object" ||
    Array.isArray(data[0])
  ) {
    return null;
  }

  const row = data[0] as Record<string, unknown>;

  const id =
    typeof row.result_link_id === "string"
      ? row.result_link_id.trim()
      : "";

  const group =
    typeof row.result_group_code === "string"
      ? row.result_group_code
      : "";

  const isActive = row.result_is_active;

  const expiresAt =
    row.result_expires_at === null ||
    typeof row.result_expires_at === "string"
      ? row.result_expires_at
      : undefined;

  if (
    !isUuid(id) ||
    !parsePitchGroup(group) ||
    typeof isActive !== "boolean" ||
    expiresAt === undefined
  ) {
    return null;
  }

  return {
    id,
    group_code: group as PitchGroup,
    is_active: isActive,
    expires_at: expiresAt,
  };
}

function mapPitchRpcError(error: { message?: string | null } | null | undefined) {
  const message = String(error?.message ?? "");

  if (
    message.includes("PITCH_TOKEN_ADMIN_ACTIVE_LIMIT") ||
    message.includes("PITCH_TOKEN_ADMIN_CREATE_CONFLICT") ||
    message.includes("PITCH_TOKEN_ADMIN_REQUEST_CONFLICT")
  ) {
    return {
      status: 409,
      error: "CONFLICT",
    } as const;
  }

  if (message.includes("PITCH_TOKEN_ADMIN_NOT_FOUND")) {
    return {
      status: 404,
      error: "NOT_FOUND",
    } as const;
  }

  if (message.includes("PITCH_TOKEN_ADMIN_STATE_INVALID")) {
    return {
      status: 409,
      error: "STATE_INVALID",
    } as const;
  }

  if (message.includes("PITCH_TOKEN_ADMIN_INVALID_INPUT")) {
    return {
      status: 400,
      error: "INVALID_INPUT",
    } as const;
  }

  return {
    status: 500,
    error: "RPC_ERROR",
  } as const;
}

function invalidInput() {
  return retoAdminJson(400, {
    ok: false,
    error: "INVALID_INPUT",
  });
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireRetoAdmin(req);

    if (!gate.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(gate.status, {
          ok: false,
          error: gate.error,
        }),
        gate
      );
    }

    if (Array.from(req.nextUrl.searchParams.keys()).length !== 0) {
      return withRetoAdminAuthCookies(
        retoAdminJson(400, {
          ok: false,
          error: "INVALID_QUERY",
        }),
        gate
      );
    }

    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase
      .from("votoclaro_public_links")
      .select(
        "id,token,route,is_active,expires_at,note,created_at"
      )
      .eq("route", "/pitch")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(200);

    if (error) {
      return withRetoAdminAuthCookies(
        retoAdminJson(500, {
          ok: false,
          error: "READ_ERROR",
        }),
        gate
      );
    }

    return withRetoAdminAuthCookies(
      retoAdminJson(200, {
        ok: true,
        tokens: data ?? [],
      }),
      gate
    );
  } catch {
    return retoAdminJson(500, {
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedRetoAdminMutationOrigin(req)) {
      return retoAdminJson(403, {
        ok: false,
        error: "ORIGIN_FORBIDDEN",
      });
    }

    const gate = await requireRetoAdmin(req);

    if (!gate.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(gate.status, {
          ok: false,
          error: gate.error,
        }),
        gate
      );
    }

    const parsed = await readRetoAdminJsonObject(
      req,
      16 * 1024
    );

    if (!parsed.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(parsed.status, {
          ok: false,
          error: parsed.error,
        }),
        gate
      );
    }

    const body = parsed.value;

    if (!hasExactKeys(body, CREATE_KEYS)) {
      return withRetoAdminAuthCookies(
        invalidInput(),
        gate
      );
    }

    const groupCode = parsePitchGroup(body.group_code);
    const expiresAt = parseNullableTimestamp(body.expires_at);
    const note = normalizeOptionalText(body.note, 500);

    if (
      !groupCode ||
      expiresAt === undefined ||
      note === undefined
    ) {
      return withRetoAdminAuthCookies(
        invalidInput(),
        gate
      );
    }

    if (
      expiresAt !== null &&
      new Date(expiresAt).getTime() <= Date.now()
    ) {
      return withRetoAdminAuthCookies(
        invalidInput(),
        gate
      );
    }

    const token =
      `${groupCode}-${randomBytes(32).toString("base64url")}`;

    const requestId = createRetoAdminRequestId();
    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase.rpc(
      "create_pitch_access_token_admin",
      {
        p_group_code: groupCode,
        p_token: token,
        p_expires_at: expiresAt,
        p_note: note,
        p_actor_email: gate.email,
        p_request_id: requestId,
      }
    );

    if (error) {
      const mapped = mapPitchRpcError(error);

      return withRetoAdminAuthCookies(
        retoAdminJson(mapped.status, {
          ok: false,
          error: mapped.error,
        }),
        gate
      );
    }

    const created = parseCreateRpcResult(data);

    if (!created) {
      return withRetoAdminAuthCookies(
        retoAdminJson(500, {
          ok: false,
          error: "RPC_RESULT_INVALID",
        }),
        gate
      );
    }

    return withRetoAdminAuthCookies(
      retoAdminJson(201, {
        ok: true,
        token,
        link: created,
        request_id: requestId,
      }),
      gate
    );
  } catch {
    return retoAdminJson(500, {
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isAllowedRetoAdminMutationOrigin(req)) {
      return retoAdminJson(403, {
        ok: false,
        error: "ORIGIN_FORBIDDEN",
      });
    }

    const gate = await requireRetoAdmin(req);

    if (!gate.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(gate.status, {
          ok: false,
          error: gate.error,
        }),
        gate
      );
    }

    const parsed = await readRetoAdminJsonObject(
      req,
      16 * 1024
    );

    if (!parsed.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(parsed.status, {
          ok: false,
          error: parsed.error,
        }),
        gate
      );
    }

    const body = parsed.value;

    if (!hasExactKeys(body, UPDATE_KEYS)) {
      return withRetoAdminAuthCookies(
        invalidInput(),
        gate
      );
    }

    const id =
      typeof body.id === "string"
        ? body.id.trim()
        : "";

    const isActive = body.is_active;
    const expiresAt = parseNullableTimestamp(body.expires_at);
    const note = normalizeOptionalText(body.note, 500);

    if (
      !isUuid(id) ||
      typeof isActive !== "boolean" ||
      expiresAt === undefined ||
      note === undefined
    ) {
      return withRetoAdminAuthCookies(
        invalidInput(),
        gate
      );
    }

    if (
      isActive &&
      expiresAt !== null &&
      new Date(expiresAt).getTime() <= Date.now()
    ) {
      return withRetoAdminAuthCookies(
        invalidInput(),
        gate
      );
    }

    const requestId = createRetoAdminRequestId();
    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase.rpc(
      "set_pitch_access_token_state_admin",
      {
        p_link_id: id,
        p_is_active: isActive,
        p_expires_at: expiresAt,
        p_note: note,
        p_actor_email: gate.email,
        p_request_id: requestId,
      }
    );

    if (error) {
      const mapped = mapPitchRpcError(error);

      return withRetoAdminAuthCookies(
        retoAdminJson(mapped.status, {
          ok: false,
          error: mapped.error,
        }),
        gate
      );
    }

    const updated = parseStateRpcResult(data);

    if (!updated) {
      return withRetoAdminAuthCookies(
        retoAdminJson(500, {
          ok: false,
          error: "RPC_RESULT_INVALID",
        }),
        gate
      );
    }

    return withRetoAdminAuthCookies(
      retoAdminJson(200, {
        ok: true,
        link: updated,
        request_id: requestId,
      }),
      gate
    );
  } catch {
    return retoAdminJson(500, {
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
}
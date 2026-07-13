import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

const DEFAULT_GROUP_CODE = "GENERAL";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
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

function getRequestOrigin(req: Request) {
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

function isAllowedOrigin(req: Request) {
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

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function isValidDeviceId(value: string) {
  return value.length > 0 && value.length <= 120;
}

function toSafeForumAlias(input: unknown) {
  const base = cleanText(input, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (base.length >= 3) return base.slice(0, 20);

  return `Usuario_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeGroupCode(value: unknown) {
  const group = cleanText(value, 40);
  return group || DEFAULT_GROUP_CODE;
}

function isValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  return !value || /^[0-9+()\-\s]{6,30}$/.test(value);
}

async function findParticipant(supabase: ReturnType<typeof getSupabaseAdmin>, deviceId: string) {
  const { data, error } = await supabase
    .from("project_participants")
    .select("id, alias, full_name, email, phone")
    .eq("device_id", deviceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/access] participant lookup failed", error);
    throw new Error("participant lookup failed");
  }

  return data;
}

async function findAccessBy(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  column: "device_id" | "email" | "celular",
  value: string
) {
  if (!value) return null;

  const { data, error } = await supabase
    .from("comment_access_participants")
    .select("id, forum_alias, group_code")
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/access] access lookup failed", { column, error });
    throw new Error("access lookup failed");
  }

  return data;
}

async function ensureAccess(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  deviceId: string,
  fallbackGroupCode: string
) {
  const participant = await findParticipant(supabase, deviceId);
  if (!participant?.id) {
    return { error: "NO_PARTICIPANT" as const };
  }

  const email = cleanText((participant as any).email, 160);
  const phone = cleanText((participant as any).phone, 30);
  const groupCode = normalizeGroupCode(fallbackGroupCode);
  const forumAlias = toSafeForumAlias((participant as any).alias || (participant as any).full_name);

  if (!isValidEmail(email) || !isValidPhone(phone)) {
    return { error: "INVALID_PARTICIPANT_DATA" as const };
  }

  const existingByDevice = await findAccessBy(supabase, "device_id", deviceId);
  if (existingByDevice?.id) {
    return {
      access: {
        id: existingByDevice.id,
        forum_alias: existingByDevice.forum_alias || forumAlias,
        group_code: existingByDevice.group_code || groupCode,
      },
    };
  }

  const existingByEmail = await findAccessBy(supabase, "email", email);
  if (existingByEmail?.id) {
    const { error } = await supabase
      .from("comment_access_participants")
      .update({ device_id: deviceId, forum_alias: forumAlias, group_code: groupCode })
      .eq("id", existingByEmail.id);

    if (error) {
      console.error("[comments/access] access update by email failed", error);
      throw new Error("access update failed");
    }

    return {
      access: { id: existingByEmail.id, forum_alias: forumAlias, group_code: groupCode },
    };
  }

  const existingByPhone = await findAccessBy(supabase, "celular", phone);
  if (existingByPhone?.id) {
    const { error } = await supabase
      .from("comment_access_participants")
      .update({ device_id: deviceId, forum_alias: forumAlias, group_code: groupCode })
      .eq("id", existingByPhone.id);

    if (error) {
      console.error("[comments/access] access update by phone failed", error);
      throw new Error("access update failed");
    }

    return {
      access: { id: existingByPhone.id, forum_alias: forumAlias, group_code: groupCode },
    };
  }

  const payload: Record<string, unknown> = {
    device_id: deviceId,
    group_code: groupCode,
    forum_alias: forumAlias,
  };

  if (email) payload.email = email;
  if (phone) payload.celular = phone;

  const { data: inserted, error } = await supabase
    .from("comment_access_participants")
    .insert(payload)
    .select("id, forum_alias, group_code")
    .single();

  if (error) {
    console.error("[comments/access] access insert failed", error);
    throw new Error("access insert failed");
  }

  return { access: inserted };
}

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";
    const cookieGroup = getCookieValue(cookieHeader, "vc_group") ?? DEFAULT_GROUP_CODE;

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const body = await req.json().catch(() => null);
    const deviceId = cleanText(body?.device_id, 120);

    if (!isValidDeviceId(deviceId)) {
      return json(400, { ok: false, error: "Solicitud invalida" });
    }

    const supabase = getSupabaseAdmin();
    const result = await ensureAccess(supabase, deviceId, cookieGroup);

    if ("error" in result) {
      return json(403, { ok: false, error: "No autorizado", status: result.error });
    }

    return json(200, {
      ok: true,
      access: {
        id: result.access.id,
        forum_alias: result.access.forum_alias,
        group_code: result.access.group_code,
      },
    });
  } catch (e) {
    console.error("[comments/access] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

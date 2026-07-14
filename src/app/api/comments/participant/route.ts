import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

const DEFAULT_GROUP_CODE = "GENERAL";

type ParticipantRow = {
  id: string;
  alias: string | null;
  full_name: string | null;
};

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

function normalizeGroupCode(value: unknown) {
  const group = cleanText(value, 40);
  return group || DEFAULT_GROUP_CODE;
}

function isValidDeviceId(value: string) {
  return value.length > 0 && value.length <= 120;
}

function isValidAccessCode(value: string) {
  return value.length >= 4 && value.length <= 80 && /^[A-Z0-9_-]+$/.test(value);
}

function toSafeParticipant(row: ParticipantRow | null) {
  if (!row?.id) return null;

  const alias = cleanText(row.alias, 80) || null;
  const fullName = cleanText(row.full_name, 120) || null;

  return {
    id: row.id,
    alias,
    display_name: alias || fullName,
  };
}

function participantResponse(row: ParticipantRow | null, groupCode: string) {
  const participant = toSafeParticipant(row);

  return {
    ok: true,
    hasData: Boolean(participant),
    participant,
    group_code: groupCode,
  };
}

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";
    const cookieGroup = getCookieValue(cookieHeader, "vc_group") ?? DEFAULT_GROUP_CODE;
    const groupCode = normalizeGroupCode(cookieGroup);

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const body = await req.json().catch(() => null);
    const action = cleanText(body?.action, 40);
    const deviceId = cleanText(body?.device_id, 120);

    if (!isValidDeviceId(deviceId)) {
      return json(400, { ok: false, error: "Solicitud invalida" });
    }

    const supabase = getSupabaseAdmin();

    if (action === "lookup") {
      const { data, error } = await supabase
        .from("project_participants")
        .select("id, alias, full_name")
        .eq("device_id", deviceId)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[comments/participant] lookup failed", error);
        return json(500, { ok: false, error: "No disponible" });
      }

      return json(200, participantResponse((data as ParticipantRow | null) ?? null, groupCode));
    }

    if (action === "login-code") {
      const code = cleanText(body?.codigo_acceso, 80).toUpperCase();

      if (!isValidAccessCode(code)) {
        return json(400, { ok: false, error: "Solicitud invalida" });
      }

      const { data, error } = await supabase
        .from("project_participants")
        .select("id, alias, full_name")
        .eq("codigo_acceso", code)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[comments/participant] login lookup failed", error);
        return json(500, { ok: false, error: "No disponible" });
      }

      if (!data?.id) {
        return json(404, { ok: false, error: "Codigo de acceso no valido" });
      }

      const { error: updateError } = await supabase
        .from("project_participants")
        .update({ device_id: deviceId })
        .eq("id", data.id);

      if (updateError) {
        console.error("[comments/participant] device update failed", updateError);
        return json(500, { ok: false, error: "No disponible" });
      }

      return json(200, participantResponse(data as ParticipantRow, groupCode));
    }

    return json(400, { ok: false, error: "Solicitud invalida" });
  } catch (e) {
    console.error("[comments/participant] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

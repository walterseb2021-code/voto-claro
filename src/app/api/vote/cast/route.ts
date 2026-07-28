// src/app/api/vote/cast/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PARTY_SLUG_RE = /^[a-z0-9-]{2,80}$/;
const GROUP_RE = /^GRUPO[A-Z]$/;

function tokenToGroup(token: string) {
  const m = token.match(/^(GRUPO[A-Z])-/);
  return m ? m[1] : null;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_KEY) en variables de entorno."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function json(status: number, body: Record<string, unknown>) {
  return jsonNoStore(body, { status });
}

function logOperationFailed() {
  console.error("[vote-cast] operation failed");
}

function isJsonRequest(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  return contentType.split(";")[0].trim().toLowerCase() === "application/json";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function getRequestOrigin(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

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

async function validatePitchToken(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string,
  group: string
) {
  const tokenGroup = tokenToGroup(token);
  if (!tokenGroup || tokenGroup !== group) {
    return false;
  }

  const { data, error } = await supabase
    .from("votoclaro_public_links")
    .select("token, route, is_active, expires_at")
    .eq("token", token)
    .eq("route", "/pitch")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    logOperationFailed();
    return false;
  }

  if (!data) return false;

  if (data.expires_at) {
    const expiresAt = data.expires_at;
    const exp =
      typeof expiresAt === "string" || typeof expiresAt === "number"
        ? new Date(expiresAt).getTime()
        : NaN;
    if (Number.isFinite(exp) && Date.now() > exp) {
      return false;
    }
  }

  return true;
}

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";
    const group = (getCookieValue(cookieHeader, "vc_group") ?? "").trim();
    const pitchToken = (getCookieValue(cookieHeader, "vc_pitch_token") ?? "").trim();

    if (legalAccepted !== "true" || !group || !GROUP_RE.test(group) || !pitchToken) {
      return json(401, { error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { error: "No autorizado" });
    }

    if (!isJsonRequest(req)) {
      return json(415, { error: "Solicitud invalida" });
    }

    const payload = await req.json().catch(() => null);
    if (!isPlainObject(payload) || !hasExactKeys(payload, ["device_id", "party_slug"])) {
      return json(400, { error: "Solicitud invalida" });
    }

    if (typeof payload.device_id !== "string" || typeof payload.party_slug !== "string") {
      return json(400, { error: "Solicitud invalida" });
    }

    const device_id = payload.device_id.trim();
    const party_slug = payload.party_slug.trim();

    if (
      device_id !== payload.device_id ||
      !UUID_RE.test(device_id) ||
      !PARTY_SLUG_RE.test(party_slug)
    ) {
      return json(400, { error: "Solicitud invalida" });
    }

    const supabase = getSupabaseAdmin();

    const tokenOk = await validatePitchToken(supabase, pitchToken, group);
    if (!tokenOk) {
      return json(401, { error: "No autorizado" });
    }

    // round_id from the body is intentionally ignored. The active round is server-selected.
    const { data: round, error: roundErr } = await supabase
      .from("vote_rounds")
      .select("id,name,is_active,created_at,group_code")
      .eq("is_active", true)
      .eq("group_code", group)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roundErr) {
      logOperationFailed();
      return json(500, { error: "No disponible" });
    }

    if (!round) return json(404, { error: "No disponible" });

    const { data: party, error: partyErr } = await supabase
      .from("vote_parties")
      .select("id,slug,enabled")
      .eq("round_id", round.id)
      .eq("slug", party_slug)
      .eq("group_code", group)
      .limit(1)
      .maybeSingle();

    if (partyErr) {
      logOperationFailed();
      return json(500, { error: "No disponible" });
    }

    if (!party || !party.enabled) return json(404, { error: "No disponible" });

    const { error: castErr } = await supabase
      .from("vote_casts")
      .insert({
        round_id: round.id,
        party_id: party.id,
        device_id,
        group_code: group,
      });

    if (castErr) {
      const code = (castErr as any).code;
      if (code === "23505") {
        return json(409, { error: "No se pudo registrar" });
      }

      logOperationFailed();
      return json(500, { error: "No se pudo registrar" });
    }

    return json(200, {
      ok: true,
    });
  } catch {
    logOperationFailed();
    return json(500, { error: "No se pudo registrar" });
  }
}

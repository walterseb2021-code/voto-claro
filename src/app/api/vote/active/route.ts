import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

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
  console.error("[vote-active] operation failed");
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

export async function GET(req: Request) {
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

    const supabase = getSupabaseAdmin();

    const tokenOk = await validatePitchToken(supabase, pitchToken, group);
    if (!tokenOk) {
      return json(401, { error: "No autorizado" });
    }

    const { data: round, error: roundErr } = await supabase
      .from("vote_rounds")
      .select("id,name,is_active")
      .eq("is_active", true)
      .eq("group_code", group)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roundErr) {
      logOperationFailed();
      return json(500, { error: "No disponible" });
    }

    if (!round) {
      return json(404, { error: "No disponible" });
    }

    const { data: parties, error: partiesErr } = await supabase
      .from("vote_parties")
      .select("id,slug,name,enabled,position")
      .eq("group_code", group)
      .eq("enabled", true)
      .order("position", { ascending: true });

    if (partiesErr) {
      logOperationFailed();
      return json(500, { error: "No disponible" });
    }

    const { data: tallies, error: tallyErr } = await supabase
      .from("vote_tally")
      .select("party_id,total_votes")
      .eq("round_id", round.id)
      .eq("group_code", group);

    if (tallyErr) {
      logOperationFailed();
      return json(500, { error: "No disponible" });
    }

    const tallyMap = new Map<string, number>();
    (tallies ?? []).forEach((t) =>
      tallyMap.set(t.party_id, Number(t.total_votes ?? 0))
    );

    const options = (parties ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      enabled: p.enabled,
      position: p.position,
      total_votes: tallyMap.get(p.id) ?? 0,
    }));

    return json(200, {
      round: {
        id: round.id,
        name: round.name,
        is_active: round.is_active,
      },
      options,
      meta: {
        options_total: options.length,
        enabled_total: options.filter((o) => o.enabled).length,
      },
    });
  } catch {
    logOperationFailed();
    return json(500, { error: "No disponible" });
  }
}

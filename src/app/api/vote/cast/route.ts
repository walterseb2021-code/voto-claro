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

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
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
    console.error("[vote/cast] pitch token validation failed", error);
    return false;
  }

  if (!data) return false;

  if (data.expires_at) {
    const exp = new Date(String(data.expires_at)).getTime();
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

    const payload = await req.json().catch(() => null);
    const device_id = (payload?.device_id ?? "").toString().trim();
    const party_slug = (payload?.party_slug ?? "").toString().trim();

    if (!UUID_RE.test(device_id) || !PARTY_SLUG_RE.test(party_slug)) {
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
      console.error("[vote/cast] active round lookup failed", roundErr);
      return json(500, { error: "No disponible" });
    }

    if (!round) return json(404, { error: "No disponible" });

    const { data: party, error: partyErr } = await supabase
      .from("vote_parties")
      .select("id,round_id,slug,name,enabled,position,group_code")
      .eq("round_id", round.id)
      .eq("slug", party_slug)
      .eq("group_code", group)
      .limit(1)
      .maybeSingle();

    if (partyErr) {
      console.error("[vote/cast] party lookup failed", partyErr);
      return json(500, { error: "No disponible" });
    }

    if (!party || !party.enabled) return json(404, { error: "No disponible" });

    const { data: cast, error: castErr } = await supabase
      .from("vote_casts")
      .insert({
        round_id: round.id,
        party_id: party.id,
        device_id,
        group_code: group,
      })
      .select("id,round_id,party_id,device_id,group_code,created_at")
      .maybeSingle();

    if (castErr) {
      const code = (castErr as any).code;
      if (code === "23505") {
        return json(409, { error: "No se pudo registrar" });
      }

      console.error("[vote/cast] vote insert failed", castErr);
      return json(500, { error: "No se pudo registrar" });
    }

    const { data: tally, error: tallyErr } = await supabase
      .from("vote_tally")
      .select("total_votes,group_code")
      .eq("round_id", round.id)
      .eq("party_id", party.id)
      .eq("group_code", group)
      .limit(1)
      .maybeSingle();

    if (tallyErr) {
      console.error("[vote/cast] tally lookup failed", tallyErr);
      return json(200, {
        ok: true,
        round,
        party,
        cast,
        total_votes: null,
      });
    }

    return json(200, {
      ok: true,
      round,
      party,
      cast,
      total_votes: Number(tally?.total_votes ?? 0),
    });
  } catch (e: any) {
    console.error("[vote/cast] unexpected error", e);
    return json(500, { error: "No se pudo registrar" });
  }
}

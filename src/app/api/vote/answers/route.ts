import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^GRUPO[A-Z]$/;
const MAX_ANSWER_LENGTH = 1000;

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
    console.error("[vote/answers] pitch token validation failed", error);
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

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0]/g, "o")
    .replace(/[1]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9\s]/g, " ");
}

function hasSoeces(text: string) {
  const t = normalizeText(text);
  const words = t.split(/\s+/).filter(Boolean);
  const banned = new Set([
    "porqueria",
    "basura",
    "asco",
    "mierda",
    "carajo",
    "puta",
    "puto",
    "culo",
    "verga",
    "cabron",
    "cabrona",
    "joder",
    "maldito",
    "maldita",
    "idiota",
    "imbecil",
    "pendejo",
    "pendeja",
    "cojudo",
    "cojuda",
  ]);

  return words.some((w) => banned.has(w));
}

function hasLinks(text: string) {
  return /https?:\/\/|www\./i.test(text);
}

function normalizeAnswer(value: unknown) {
  return String(value ?? "").trim();
}

function isValidAnswer(text: string) {
  return (
    text.length >= 10 &&
    text.length <= MAX_ANSWER_LENGTH &&
    !hasSoeces(text) &&
    !hasLinks(text)
  );
}

async function getActiveQuestions(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_active_questions");

  if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData[0];
  }

  if (rpcErr) {
    console.error("[vote/answers] active questions rpc failed", rpcErr);
  }

  const { data, error } = await supabase
    .from("vote_intention_questions")
    .select("id, question_1, question_2, question_3")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[vote/answers] active questions lookup failed", error);
    return null;
  }

  return data?.[0] ?? null;
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

    const { searchParams } = new URL(req.url);
    const deviceId = String(searchParams.get("device_id") ?? "").trim();

    if (!UUID_RE.test(deviceId)) {
      return json(400, { error: "Solicitud invalida" });
    }

    const supabase = getSupabaseAdmin();

    const tokenOk = await validatePitchToken(supabase, pitchToken, group);
    if (!tokenOk) {
      return json(401, { error: "No autorizado" });
    }

    const { data: round, error: roundErr } = await supabase
      .from("vote_rounds")
      .select("id")
      .eq("is_active", true)
      .eq("group_code", group)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roundErr) {
      console.error("[vote/answers] GET active round lookup failed", roundErr);
      return json(500, { error: "No disponible" });
    }

    if (!round?.id) {
      return json(404, { error: "No disponible" });
    }

    const { data: cast, error: castErr } = await supabase
      .from("vote_casts")
      .select("party_id")
      .eq("round_id", round.id)
      .eq("device_id", deviceId)
      .eq("group_code", group)
      .limit(1)
      .maybeSingle();

    if (castErr) {
      console.error("[vote/answers] GET vote lookup failed", castErr);
      return json(500, { error: "No disponible" });
    }

    if (!cast?.party_id) {
      return json(200, { answered: false });
    }

    const { data: existing, error: existingErr } = await supabase
      .from("vote_intention_answers")
      .select("id")
      .eq("device_id", deviceId)
      .eq("round_id", round.id)
      .eq("party_id", cast.party_id)
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.error("[vote/answers] GET answer lookup failed", existingErr);
      return json(500, { error: "No disponible" });
    }

    return json(200, { answered: !!existing });
  } catch (e: any) {
    console.error("[vote/answers] GET unexpected error", e);
    return json(500, { error: "No disponible" });
  }
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
    const deviceId = String(payload?.device_id ?? "").trim();
    const answer1 = normalizeAnswer(payload?.answer_1);
    const answer2 = normalizeAnswer(payload?.answer_2);
    const answer3 = normalizeAnswer(payload?.answer_3);

    if (
      !UUID_RE.test(deviceId) ||
      !isValidAnswer(answer1) ||
      !isValidAnswer(answer2) ||
      !isValidAnswer(answer3)
    ) {
      return json(400, { error: "Solicitud invalida" });
    }

    const supabase = getSupabaseAdmin();

    const tokenOk = await validatePitchToken(supabase, pitchToken, group);
    if (!tokenOk) {
      return json(401, { error: "No autorizado" });
    }

    const { data: round, error: roundErr } = await supabase
      .from("vote_rounds")
      .select("id")
      .eq("is_active", true)
      .eq("group_code", group)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roundErr) {
      console.error("[vote/answers] active round lookup failed", roundErr);
      return json(500, { error: "No disponible" });
    }

    if (!round?.id) {
      return json(404, { error: "No disponible" });
    }

    const { data: cast, error: castErr } = await supabase
      .from("vote_casts")
      .select("party_id")
      .eq("round_id", round.id)
      .eq("device_id", deviceId)
      .eq("group_code", group)
      .limit(1)
      .maybeSingle();

    if (castErr) {
      console.error("[vote/answers] vote lookup failed", castErr);
      return json(500, { error: "No disponible" });
    }

    if (!cast?.party_id) {
      return json(401, { error: "No autorizado" });
    }

    const { data: party, error: partyErr } = await supabase
      .from("vote_parties")
      .select("id,slug")
      .eq("id", cast.party_id)
      .eq("round_id", round.id)
      .eq("group_code", group)
      .limit(1)
      .maybeSingle();

    if (partyErr) {
      console.error("[vote/answers] party lookup failed", partyErr);
      return json(500, { error: "No disponible" });
    }

    if (!party?.id || !party?.slug) {
      return json(404, { error: "No disponible" });
    }

    const questions = await getActiveQuestions(supabase);

    const { data: existing, error: existingErr } = await supabase
      .from("vote_intention_answers")
      .select("id")
      .eq("device_id", deviceId)
      .eq("round_id", round.id)
      .eq("party_id", party.id)
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.error("[vote/answers] duplicate lookup failed", existingErr);
      return json(500, { error: "No disponible" });
    }

    if (existing) {
      return json(200, { ok: true, message: "Respuestas guardadas" });
    }

    const { error: insertErr } = await supabase.from("vote_intention_answers").insert({
      device_id: deviceId,
      round_id: round.id,
      party_id: party.id,
      party_slug: party.slug,
      questions_id: questions?.id ? questions.id : null,
      answer_1: answer1,
      answer_2: answer2,
      answer_3: answer3,
      user_agent: req.headers.get("user-agent"),
    });

    if (insertErr) {
      if ((insertErr as any).code === "23505") {
        return json(200, { ok: true, message: "Respuestas guardadas" });
      }

      console.error("[vote/answers] answer insert failed", insertErr);
      return json(500, { error: "No se pudo guardar" });
    }

    return json(200, { ok: true, message: "Respuestas guardadas" });
  } catch (e: any) {
    console.error("[vote/answers] unexpected error", e);
    return json(500, { error: "No disponible" });
  }
}

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

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function json(status: number, body: Record<string, unknown>) {
  return jsonNoStore(body, { status });
}

function logOperationFailed() {
  console.error("[vote-answers] operation failed");
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

function isValidAnswer(text: string) {
  if (text.length === 0) return true;

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
    logOperationFailed();
  }

  const { data, error } = await supabase
    .from("vote_intention_questions")
    .select("id, question_1, question_2, question_3")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    logOperationFailed();
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
    const deviceIdParam = searchParams.get("device_id");

    if (typeof deviceIdParam !== "string") {
      return json(400, { error: "Solicitud invalida" });
    }

    const deviceId = deviceIdParam.trim();

    if (deviceId !== deviceIdParam || !UUID_RE.test(deviceId)) {
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
      logOperationFailed();
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
      logOperationFailed();
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
      logOperationFailed();
      return json(500, { error: "No disponible" });
    }

    return json(200, { answered: !!existing });
  } catch {
    logOperationFailed();
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

    if (!isJsonRequest(req)) {
      return json(415, { error: "Solicitud invalida" });
    }

    const payload = await req.json().catch(() => null);
    if (
      !isPlainObject(payload) ||
      !hasExactKeys(payload, ["device_id", "answer_1", "answer_2", "answer_3"])
    ) {
      return json(400, { error: "Solicitud invalida" });
    }

    if (
      typeof payload.device_id !== "string" ||
      typeof payload.answer_1 !== "string" ||
      typeof payload.answer_2 !== "string" ||
      typeof payload.answer_3 !== "string"
    ) {
      return json(400, { error: "Solicitud invalida" });
    }

    const deviceId = payload.device_id.trim();
    const answer1 = payload.answer_1.trim();
    const answer2 = payload.answer_2.trim();
    const answer3 = payload.answer_3.trim();
    const hasAtLeastOneAnswer = [answer1, answer2, answer3].some(
      (answer) => answer.length > 0
    );

    if (
      deviceId !== payload.device_id ||
      !UUID_RE.test(deviceId) ||
      !hasAtLeastOneAnswer ||
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
      logOperationFailed();
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
      logOperationFailed();
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
      logOperationFailed();
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
      logOperationFailed();
      return json(500, { error: "No disponible" });
    }

    if (existing) {
      return json(200, { ok: true });
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
        return json(200, { ok: true });
      }

      logOperationFailed();
      return json(500, { error: "No se pudo guardar" });
    }

    return json(200, { ok: true });
  } catch {
    logOperationFailed();
    return json(500, { error: "No disponible" });
  }
}

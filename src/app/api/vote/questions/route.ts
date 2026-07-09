import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

const GROUP_RE = /^GRUPO[A-Z]$/;

const DEFAULT_QUESTIONS = {
  id: "default",
  question_1: "\u00bfCu\u00e1l es la principal raz\u00f3n por la que elegiste este partido?",
  question_2: "\u00bfQu\u00e9 propuesta o idea de este partido te parece m\u00e1s importante?",
  question_3: "\u00bfQu\u00e9 valores o principios de este partido se alinean con tu forma de pensar?",
};

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
    console.error("[vote/questions] pitch token validation failed", error);
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

async function getActiveQuestions(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_active_questions");

  if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData[0];
  }

  if (rpcErr) {
    console.error("[vote/questions] active questions rpc failed", rpcErr);
  }

  const { data, error } = await supabase
    .from("vote_intention_questions")
    .select("id, question_1, question_2, question_3")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[vote/questions] active questions lookup failed", error);
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

    const supabase = getSupabaseAdmin();

    const tokenOk = await validatePitchToken(supabase, pitchToken, group);
    if (!tokenOk) {
      return json(401, { error: "No autorizado" });
    }

    const questions = await getActiveQuestions(supabase);

    return NextResponse.json({
      questions: questions ?? DEFAULT_QUESTIONS,
    });
  } catch (e: any) {
    console.error("[vote/questions] unexpected error", e);
    return json(500, { error: "No disponible" });
  }
}

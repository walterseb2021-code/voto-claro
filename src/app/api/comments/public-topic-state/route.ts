import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActiveTopicRow = {
  id: string;
  topic: string | null;
  question: string | null;
  created_at: string | null;
};

type VotingTopicRow = {
  id: string;
  created_at: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
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

function toPublicActiveTopic(row: ActiveTopicRow | null) {
  if (!row) return null;

  if (!UUID_RE.test(row.id)) {
    console.warn("[comments/public-topic-state] invalid active topic id");
    return null;
  }

  return {
    id: row.id,
    topic: row.topic ?? "",
    question: row.question ?? "",
  };
}

function toPublicVotingTopic(row: VotingTopicRow | null) {
  if (!row) return null;

  if (!UUID_RE.test(row.id)) {
    console.warn("[comments/public-topic-state] invalid voting topic id");
    return null;
  }

  return {
    id: row.id,
  };
}

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const { searchParams } = new URL(req.url);
    if (Array.from(searchParams.keys()).length > 0) {
      return json(400, { ok: false, error: "Solicitud inválida" });
    }

    const supabase = getSupabaseAdmin();

    const [activeResult, votingResult] = await Promise.all([
      supabase
        .from("weekly_topics")
        .select("id, topic, question, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(2),
      supabase
        .from("weekly_topics")
        .select("id, created_at")
        .eq("status", "voting")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(2),
    ]);

    if (activeResult.error) {
      console.error("[comments/public-topic-state] active topic lookup failed", activeResult.error);
      return json(500, { ok: false, error: "No disponible" });
    }

    if (votingResult.error) {
      console.error("[comments/public-topic-state] voting topic lookup failed", votingResult.error);
      return json(500, { ok: false, error: "No disponible" });
    }

    const activeRows = (activeResult.data ?? []) as ActiveTopicRow[];
    const votingRows = (votingResult.data ?? []) as VotingTopicRow[];

    if (activeRows.length > 1) {
      console.warn("[comments/public-topic-state] multiple active topics found");
    }

    if (votingRows.length > 1) {
      console.warn("[comments/public-topic-state] multiple voting topics found");
    }

    return json(200, {
      ok: true,
      activeTopic: toPublicActiveTopic(activeRows[0] ?? null),
      votingTopic: toPublicVotingTopic(votingRows[0] ?? null),
    });
  } catch (e) {
    console.error("[comments/public-topic-state] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

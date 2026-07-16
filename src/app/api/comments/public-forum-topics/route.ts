import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ForumTopicRow = {
  id: string;
  topic: string | null;
  question: string | null;
  winner_published_at: string | null;
  ends_at: string | null;
};

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

function toPublicTopic(row: ForumTopicRow) {
  return {
    id: row.id,
    topic: row.topic ?? "",
    question: row.question ?? "",
    winner_published_at: row.winner_published_at ?? null,
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

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("weekly_topics")
      .select("id, topic, question, winner_published_at, ends_at")
      .eq("status", "archived")
      .order("winner_published_at", { ascending: false })
      .order("ends_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[comments/public-forum-topics] topics lookup failed", error);
      return json(500, { ok: false, error: "No disponible" });
    }

    const topicRows = (data ?? []) as ForumTopicRow[];

    return json(200, {
      ok: true,
      topics: topicRows.map(toPublicTopic),
    });
  } catch (e) {
    console.error("[comments/public-forum-topics] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

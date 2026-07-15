import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WinnerTopicRow = {
  id: string;
  topic: string | null;
  question: string | null;
  winner_video_entry_id: string | null;
  winner_votes: number | null;
  winner_published_at: string | null;
};

type WinnerVideoRow = {
  id: string;
  created_at: string;
  weekly_topic_id: string;
  group_code: string | null;
  platform: string | null;
  video_url: string | null;
  title: string | null;
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

function toPublicWinner(topic: WinnerTopicRow, video: WinnerVideoRow | null) {
  return {
    topicId: topic.id,
    topic: topic.topic ?? "",
    question: topic.question ?? "",
    winnerVideoEntryId: topic.winner_video_entry_id,
    winnerVotes: Number(topic.winner_votes ?? 0),
    winnerPublishedAt: topic.winner_published_at ?? null,
    video: video
      ? {
          id: video.id,
          created_at: video.created_at,
          weekly_topic_id: video.weekly_topic_id,
          group_code: video.group_code ?? "",
          platform: video.platform ?? "",
          video_url: video.video_url ?? "",
          title: video.title ?? null,
        }
      : null,
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

    const { data: topicData, error: topicError } = await supabase
      .from("weekly_topics")
      .select("id, topic, question, winner_video_entry_id, winner_votes, winner_published_at")
      .eq("status", "archived")
      .not("winner_video_entry_id", "is", null)
      .order("winner_published_at", { ascending: false })
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (topicError) {
      console.error("[comments/public-winner] winner topic lookup failed", topicError);
      return json(500, { ok: false, error: "No disponible" });
    }

    const topic = topicData as WinnerTopicRow | null;

    if (!topic?.winner_video_entry_id) {
      return json(200, { ok: true, hasWinner: false, winner: null });
    }

    const { data: videoData, error: videoError } = await supabase
      .from("weekly_video_entries")
      .select("id, created_at, weekly_topic_id, group_code, platform, video_url, title")
      .eq("id", topic.winner_video_entry_id)
      .limit(1)
      .maybeSingle();

    if (videoError) {
      console.error("[comments/public-winner] winner video lookup failed", videoError);
      return json(500, { ok: false, error: "No disponible" });
    }

    const video = videoData as WinnerVideoRow | null;

    return json(200, {
      ok: true,
      hasWinner: true,
      winner: toPublicWinner(topic, video),
    });
  } catch (e) {
    console.error("[comments/public-winner] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

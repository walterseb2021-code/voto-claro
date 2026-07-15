import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_VIDEO_STATUSES = new Set(["reviewed", "archived"]);

type WinnerTopicRow = {
  id: string;
  topic: string | null;
  question: string | null;
  ends_at: string | null;
  winner_video_entry_id: string | null;
  winner_votes: number | null;
  winner_published_at: string | null;
};

type WinnerVideoRow = {
  id: string;
  weekly_topic_id: string | null;
  group_code: string | null;
  platform: string | null;
  video_url: string | null;
  title: string | null;
  status: string | null;
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

function toPublicVideo(topic: WinnerTopicRow, video: WinnerVideoRow | null) {
  if (!topic.winner_video_entry_id || !video) return null;

  const videoUrl = typeof video.video_url === "string" ? video.video_url.trim() : "";
  const status = video.status ?? "";

  if (video.id !== topic.winner_video_entry_id) return null;

  if (video.weekly_topic_id !== topic.id) {
    console.warn("[comments/public-winner-history] topic-video mismatch", {
      topicId: topic.id,
      videoId: video.id,
    });
    return null;
  }

  if (!ALLOWED_VIDEO_STATUSES.has(status)) return null;
  if (!videoUrl) return null;

  return {
    group_code: video.group_code ?? "",
    platform: video.platform ?? "",
    video_url: videoUrl,
    title: video.title ?? null,
  };
}

function toPublicItem(row: WinnerTopicRow, videosMap: Record<string, WinnerVideoRow>) {
  const video = row.winner_video_entry_id ? videosMap[row.winner_video_entry_id] ?? null : null;

  return {
    id: row.id,
    topic: row.topic ?? "",
    question: row.question ?? "",
    winner_votes: Number(row.winner_votes ?? 0),
    winner_published_at: row.winner_published_at ?? null,
    video: toPublicVideo(row, video),
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

    const { data: topicsData, error: topicsError } = await supabase
      .from("weekly_topics")
      .select("id, topic, question, ends_at, winner_video_entry_id, winner_votes, winner_published_at")
      .eq("status", "archived")
      .order("winner_published_at", { ascending: false })
      .order("ends_at", { ascending: false })
      .limit(12);

    if (topicsError) {
      console.error("[comments/public-winner-history] topics lookup failed", topicsError);
      return json(500, { ok: false, error: "No disponible" });
    }

    const topicRows = (topicsData ?? []) as WinnerTopicRow[];
    const winnerIds = [
      ...new Set(topicRows.map((row) => row.winner_video_entry_id).filter(Boolean) as string[]),
    ];

    let videosMap: Record<string, WinnerVideoRow> = {};

    if (winnerIds.length > 0) {
      const { data: videosData, error: videosError } = await supabase
        .from("weekly_video_entries")
        .select("id, weekly_topic_id, group_code, platform, video_url, title, status")
        .in("id", winnerIds)
        .in("status", ["reviewed", "archived"]);

      if (videosError) {
        console.error("[comments/public-winner-history] videos lookup failed", videosError);
        return json(500, { ok: false, error: "No disponible" });
      }

      videosMap = Object.fromEntries(
        ((videosData ?? []) as WinnerVideoRow[]).map((row) => [row.id, row])
      );
    }

    return json(200, {
      ok: true,
      items: topicRows.map((row) => toPublicItem(row, videosMap)),
    });
  } catch (e) {
    console.error("[comments/public-winner-history] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

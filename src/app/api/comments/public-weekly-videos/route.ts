import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Scope = "active" | "voting";

type TopicRow = {
  id: string;
  created_at: string | null;
};

type ActiveVideoDbRow = {
  id: string;
  created_at: string | null;
  group_code: string | null;
  platform: string | null;
  video_url: string | null;
  title: string | null;
};

type VotingVideoDbRow = {
  id: string;
  created_at: string | null;
  platform: string | null;
  video_url: string | null;
  title: string | null;
};

const SCOPES = new Set<Scope>(["active", "voting"]);
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

function parseScope(req: Request): Scope | null {
  const url = new URL(req.url);
  const keys = Array.from(url.searchParams.keys());
  const scopeValues = url.searchParams.getAll("scope");

  if (keys.length !== scopeValues.length || scopeValues.length !== 1) {
    return null;
  }

  const scope = scopeValues[0];
  return SCOPES.has(scope as Scope) ? (scope as Scope) : null;
}

function isValidDate(value: string | null): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function getValidVideoUrl(value: string | null) {
  const videoUrl = typeof value === "string" ? value.trim() : "";
  if (!videoUrl) return null;

  try {
    const url = new URL(videoUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return videoUrl;
  } catch {
    return null;
  }
}

function toPublicActiveVideo(row: ActiveVideoDbRow) {
  if (!UUID_RE.test(row.id)) return null;
  if (!isValidDate(row.created_at)) return null;

  const videoUrl = getValidVideoUrl(row.video_url);
  if (!videoUrl) return null;

  return {
    id: row.id,
    created_at: row.created_at,
    group_code: row.group_code ?? "",
    platform: row.platform ?? "",
    video_url: videoUrl,
    title: row.title ?? null,
  };
}

function toPublicVotingVideo(row: VotingVideoDbRow) {
  if (!UUID_RE.test(row.id)) return null;
  if (!isValidDate(row.created_at)) return null;

  const videoUrl = getValidVideoUrl(row.video_url);
  if (!videoUrl) return null;

  return {
    id: row.id,
    created_at: row.created_at,
    platform: row.platform ?? "",
    video_url: videoUrl,
    title: row.title ?? null,
  };
}

function filterPublicActiveVideos(rows: ActiveVideoDbRow[]) {
  const mappedVideos = rows.map(toPublicActiveVideo);
  const videos = mappedVideos.filter(
    (video): video is NonNullable<typeof video> => video !== null
  );
  const excludedCount = mappedVideos.length - videos.length;

  if (excludedCount > 0) {
    console.warn("[comments/public-weekly-videos] excluded invalid active videos", {
      count: excludedCount,
    });
  }

  return videos;
}

function filterPublicVotingVideos(rows: VotingVideoDbRow[]) {
  const mappedVideos = rows.map(toPublicVotingVideo);
  const videos = mappedVideos.filter(
    (video): video is NonNullable<typeof video> => video !== null
  );
  const excludedCount = mappedVideos.length - videos.length;

  if (excludedCount > 0) {
    console.warn("[comments/public-weekly-videos] excluded invalid voting videos", {
      count: excludedCount,
    });
  }

  return videos;
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

    const scope = parseScope(req);
    if (!scope) {
      return json(400, { ok: false, error: "Solicitud inválida" });
    }

    const supabase = getSupabaseAdmin();

    const { data: topicData, error: topicError } = await supabase
      .from("weekly_topics")
      .select("id, created_at")
      .eq("status", scope)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(2);

    if (topicError) {
      console.error("[comments/public-weekly-videos] topic lookup failed", topicError);
      return json(500, { ok: false, error: "No disponible" });
    }

    const topicRows = (topicData ?? []) as TopicRow[];
    if (topicRows.length > 1) {
      console.warn(`[comments/public-weekly-videos] multiple ${scope} topics found`);
    }

    const topic = topicRows[0] ?? null;
    if (!topic) {
      return json(200, { ok: true, videos: [] });
    }

    if (!UUID_RE.test(topic.id)) {
      console.warn("[comments/public-weekly-videos] invalid topic id");
      return json(200, { ok: true, videos: [] });
    }

    if (scope === "active") {
      const { data, error } = await supabase
        .from("weekly_video_entries")
        .select("id,created_at,group_code,platform,video_url,title")
        .eq("weekly_topic_id", topic.id)
        .eq("status", "reviewed")
        .order("created_at", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(20);

      if (error) {
        console.error("[comments/public-weekly-videos] active videos lookup failed", error);
        return json(500, { ok: false, error: "No disponible" });
      }

      return json(200, {
        ok: true,
        videos: filterPublicActiveVideos((data ?? []) as ActiveVideoDbRow[]),
      });
    }

    const { data, error } = await supabase
      .from("weekly_video_entries")
      .select("id,created_at,platform,video_url,title")
      .eq("weekly_topic_id", topic.id)
      .eq("status", "reviewed")
      .order("created_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(20);

    if (error) {
      console.error("[comments/public-weekly-videos] voting videos lookup failed", error);
      return json(500, { ok: false, error: "No disponible" });
    }

    return json(200, {
      ok: true,
      videos: filterPublicVotingVideos((data ?? []) as VotingVideoDbRow[]),
    });
  } catch (e) {
    console.error("[comments/public-weekly-videos] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

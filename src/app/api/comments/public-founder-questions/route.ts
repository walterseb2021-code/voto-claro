import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FounderQuestionRow = {
  id: string;
  created_at: string;
  weekly_topic_id: string | null;
  weekly_video_entry_id: string | null;
  group_code: string | null;
  question_text: string | null;
  founder_answer_text: string | null;
  founder_answer_video_url: string | null;
  founder_answered_at: string | null;
};

type TopicRow = {
  id: string;
  topic: string | null;
};

type VideoRow = {
  id: string;
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

function toPublicQuestion(
  row: FounderQuestionRow,
  topicsMap: Record<string, string | null>,
  videosMap: Record<string, string | null>
) {
  return {
    id: row.id,
    group_code: row.group_code ?? "",
    question_text: row.question_text ?? "",
    founder_answer_text: row.founder_answer_text ?? null,
    founder_answer_video_url: row.founder_answer_video_url ?? null,
    published_at: row.founder_answered_at ?? null,
    topic_title: row.weekly_topic_id ? topicsMap[row.weekly_topic_id] ?? null : null,
    video_title: row.weekly_video_entry_id ? videosMap[row.weekly_video_entry_id] ?? null : null,
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

    const { data: questionsData, error: questionsError } = await supabase
      .from("weekly_founder_questions")
      .select(
        "id, created_at, weekly_topic_id, weekly_video_entry_id, group_code, question_text, founder_answer_text, founder_answer_video_url, founder_answered_at"
      )
      .eq("published", true)
      .order("founder_answered_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (questionsError) {
      console.error("[comments/public-founder-questions] questions lookup failed", questionsError);
      return json(500, { ok: false, error: "No disponible" });
    }

    const questionRows = (questionsData ?? []) as FounderQuestionRow[];
    const topicIds = [
      ...new Set(questionRows.map((row) => row.weekly_topic_id).filter(Boolean) as string[]),
    ];
    const videoIds = [
      ...new Set(questionRows.map((row) => row.weekly_video_entry_id).filter(Boolean) as string[]),
    ];

    let topicsMap: Record<string, string | null> = {};
    let videosMap: Record<string, string | null> = {};

    if (topicIds.length > 0) {
      const { data: topicsData, error: topicsError } = await supabase
        .from("weekly_topics")
        .select("id, topic")
        .in("id", topicIds);

      if (topicsError) {
        console.error("[comments/public-founder-questions] topics lookup failed", topicsError);
        return json(500, { ok: false, error: "No disponible" });
      }

      topicsMap = Object.fromEntries(
        ((topicsData ?? []) as TopicRow[]).map((row) => [row.id, row.topic ?? null])
      );
    }

    if (videoIds.length > 0) {
      const { data: videosData, error: videosError } = await supabase
        .from("weekly_video_entries")
        .select("id, title")
        .in("id", videoIds);

      if (videosError) {
        console.error("[comments/public-founder-questions] videos lookup failed", videosError);
        return json(500, { ok: false, error: "No disponible" });
      }

      videosMap = Object.fromEntries(
        ((videosData ?? []) as VideoRow[]).map((row) => [row.id, row.title ?? null])
      );
    }

    return json(200, {
      ok: true,
      questions: questionRows.map((row) => toPublicQuestion(row, topicsMap, videosMap)),
    });
  } catch (e) {
    console.error("[comments/public-founder-questions] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

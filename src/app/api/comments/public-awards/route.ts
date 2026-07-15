import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AwardRow = {
  id: string;
  user_comment_id: string | null;
  group_code: string | null;
  award_year: number | null;
  award_quarter: number | null;
  award_title: string | null;
  award_note: string | null;
  includes_companion: boolean | null;
  published_at: string | null;
};

type CommentRow = {
  id: string;
  message: string | null;
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

function toPublicAward(row: AwardRow, commentsMap: Record<string, string | null>) {
  return {
    id: row.id,
    group_code: row.group_code ?? "",
    award_year: Number(row.award_year ?? 0),
    award_quarter: Number(row.award_quarter ?? 0),
    award_title: row.award_title ?? null,
    award_note: row.award_note ?? null,
    includes_companion: Boolean(row.includes_companion),
    published_at: row.published_at ?? null,
    commentMessage: row.user_comment_id ? commentsMap[row.user_comment_id] ?? null : null,
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

    const { data: awardsData, error: awardsError } = await supabase
      .from("comment_awards")
      .select(
        "id, user_comment_id, group_code, award_year, award_quarter, award_title, award_note, includes_companion, published_at"
      )
      .eq("published", true)
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);

    if (awardsError) {
      console.error("[comments/public-awards] awards lookup failed", awardsError);
      return json(500, { ok: false, error: "No disponible" });
    }

    const awardRows = (awardsData ?? []) as AwardRow[];
    const commentIds = [
      ...new Set(awardRows.map((row) => row.user_comment_id).filter(Boolean) as string[]),
    ];

    let commentsMap: Record<string, string | null> = {};

    if (commentIds.length > 0) {
      const { data: commentsData, error: commentsError } = await supabase
        .from("user_comments")
        .select("id, message")
        .in("id", commentIds)
        .eq("status", "published");

      if (commentsError) {
        console.error("[comments/public-awards] comments lookup failed", commentsError);
        return json(500, { ok: false, error: "No disponible" });
      }

      commentsMap = Object.fromEntries(
        ((commentsData ?? []) as CommentRow[]).map((row) => [row.id, row.message ?? null])
      );
    }

    return json(200, {
      ok: true,
      awards: awardRows.map((row) => toPublicAward(row, commentsMap)),
    });
  } catch (e) {
    console.error("[comments/public-awards] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

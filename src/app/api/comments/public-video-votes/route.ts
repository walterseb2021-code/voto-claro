import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";
import {
  isAllowedParticipantMutationOrigin,
  readBoundedJsonObject,
} from "@/lib/participantApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VIDEO_IDS = 50;
const MAX_BODY_BYTES = 4 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VoteCountItem = {
  weekly_video_entry_id: string;
  vote_count: number;
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


function parseVideoIds(input: unknown) {
  if (!Array.isArray(input)) return null;
  if (!input.every((item) => typeof item === "string")) return null;

  const uniqueIds = Array.from(new Set(input.map((item) => item.trim())));

  if (uniqueIds.length > MAX_VIDEO_IDS) return null;
  if (uniqueIds.some((id) => !UUID_RE.test(id))) return null;

  return uniqueIds;
}

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedParticipantMutationOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);
    const requestedIds = parseVideoIds(body?.weekly_video_entry_ids);

    if (!requestedIds) {
      return json(400, { ok: false, error: "Solicitud inválida" });
    }

    if (requestedIds.length === 0) {
      return json(200, { ok: true, counts: [] });
    }

    const supabase = getSupabaseAdmin();

    const { data: reviewedVideos, error: reviewedError } = await supabase
      .from("weekly_video_entries")
      .select("id")
      .in("id", requestedIds)
      .eq("status", "reviewed");

    if (reviewedError) {
      console.error("[comments/public-video-votes] reviewed videos lookup failed", reviewedError);
      return json(500, { ok: false, error: "No disponible" });
    }

    const validIds = (reviewedVideos ?? [])
      .map((row: { id: string }) => row.id)
      .filter((id) => requestedIds.includes(id));
    const validIdSet = new Set(validIds);

    const countPairs = await Promise.all(
      validIds.map(async (videoId): Promise<VoteCountItem> => {
        const { count, error } = await supabase
          .from("weekly_video_votes")
          .select("id", { count: "exact", head: true })
          .eq("weekly_video_entry_id", videoId);

        if (error) {
          console.error("[comments/public-video-votes] vote count failed", {
            videoId,
            error,
          });
          throw new Error("vote count failed");
        }

        return {
          weekly_video_entry_id: videoId,
          vote_count: count ?? 0,
        };
      })
    );

    const counts = requestedIds
      .filter((id) => validIdSet.has(id))
      .map((id) => countPairs.find((item) => item.weekly_video_entry_id === id))
      .filter((item): item is VoteCountItem => Boolean(item));

    return json(200, { ok: true, counts });
  } catch (e) {
    console.error("[comments/public-video-votes] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

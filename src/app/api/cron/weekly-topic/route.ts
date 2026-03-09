import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
}

function isAuthorizedCronRequest(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    throw new Error("Missing CRON_SECRET");
  }

  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }

    const supabase = supabaseAdmin();
    const now = new Date().toISOString();

    // 1) Buscar tema activo
    const { data: active, error: activeError } = await supabase
      .from("weekly_topics")
      .select("*")
      .eq("status", "active")
      .maybeSingle();

    if (activeError) {
      return json({ error: activeError.message }, 500);
    }

    if (!active) {
      return json({ ok: true, message: "No active topic." });
    }

    // 2) Si todavía no venció, no hacemos nada
    if (active.ends_at && active.ends_at > now) {
      return json({ ok: true, message: "Active topic still valid." });
    }

    // 3) Buscar videos aprobados del tema que se cierra
    const { data: reviewedVideos, error: reviewedVideosError } = await supabase
      .from("weekly_video_entries")
      .select("id,created_at,title,video_url,platform,status")
      .eq("weekly_topic_id", active.id)
      .eq("status", "reviewed");

    if (reviewedVideosError) {
      return json({ error: reviewedVideosError.message }, 500);
    }

    // 4) Buscar votos del tema que se cierra
    const { data: voteRows, error: voteRowsError } = await supabase
      .from("weekly_video_votes")
      .select("weekly_video_entry_id")
      .eq("weekly_topic_id", active.id);

    if (voteRowsError) {
      return json({ error: voteRowsError.message }, 500);
    }

    // 5) Contar votos por video
    const counts: Record<string, number> = {};
    for (const row of voteRows ?? []) {
      const id = String((row as any).weekly_video_entry_id ?? "");
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
    }

    // 6) Elegir ganador del tema
    let winnerVideoEntryId: string | null = null;
    let winnerVotes: number | null = null;

    if ((reviewedVideos ?? []).length > 0) {
      const sorted = [...(reviewedVideos ?? [])].sort((a: any, b: any) => {
        const votesA = counts[String(a.id)] ?? 0;
        const votesB = counts[String(b.id)] ?? 0;

        if (votesB !== votesA) return votesB - votesA;

        // Desempate: el más antiguo primero
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateA - dateB;
      });

      const top = sorted[0];
      if (top) {
        winnerVideoEntryId = String(top.id);
        winnerVotes = counts[String(top.id)] ?? 0;
      }
    }

    // 7) Archivar tema actual guardando ganador oficial
    const { error: archiveError } = await supabase
      .from("weekly_topics")
      .update({
        status: "archived",
        winner_video_entry_id: winnerVideoEntryId,
        winner_votes: winnerVotes,
        winner_published_at: now,
      })
      .eq("id", active.id);

    if (archiveError) {
      return json({ error: archiveError.message }, 500);
    }

    // 8) Buscar siguiente tema queued
    const { data: next, error: nextError } = await supabase
      .from("weekly_topics")
      .select("*")
      .eq("status", "queued")
      .lte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextError) {
      return json({ error: nextError.message }, 500);
    }

    if (!next) {
      return json({
        ok: true,
        archived: active.topic,
        activated: null,
        winner_video_entry_id: winnerVideoEntryId,
        winner_votes: winnerVotes,
        message: "Archived active topic, but no queued topics available.",
      });
    }

    // 9) Activar siguiente tema
    const { error: activateError } = await supabase
      .from("weekly_topics")
      .update({ status: "active" })
      .eq("id", next.id);

    if (activateError) {
      return json({ error: activateError.message }, 500);
    }

    return json({
      ok: true,
      archived: active.topic,
      activated: next.topic,
      winner_video_entry_id: winnerVideoEntryId,
      winner_votes: winnerVotes,
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
}
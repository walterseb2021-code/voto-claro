import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
}

async function requireAdminUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!adminEmail) throw new Error("Missing ADMIN_EMAIL");

  const cookieStore = await cookies();

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // En route handler no necesitamos setear cookies aquí
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false as const, reason: "NO_SESSION" as const };
  const email = data?.user?.email ?? null;

  if (!email) return { ok: false as const, reason: "NO_EMAIL" as const };
  if (email.toLowerCase() !== adminEmail.toLowerCase()) {
    return { ok: false as const, reason: "NOT_ADMIN" as const };
  }

  return { ok: true as const, email };
}

// GET: lista comentarios + videos + temas + preguntas fundador + premios trimestrales
export async function GET(req: Request) {
  try {
    const auth = await requireAdminUser();
    if (!auth.ok) return json({ error: "UNAUTHORIZED", reason: auth.reason }, 401);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10) || 200, 500);

    const supabase = supabaseAdmin();

    let q = supabase
      .from("user_comments")
      .select("id,created_at,group_code,device_id,page,message,status")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return json({ error: "SUPABASE_ERROR", detail: error.message }, 500);

    const { data: topicRow, error: topicError } = await supabase
      .from("weekly_topics")
      .select(
        "id,topic,question,status,starts_at,ends_at,winner_video_entry_id,winner_votes,winner_published_at"
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (topicError) {
      return json({ error: "SUPABASE_ERROR", detail: topicError.message }, 500);
    }

    const { data: archivedTopics, error: archivedTopicsError } = await supabase
      .from("weekly_topics")
      .select(
        "id,topic,question,status,starts_at,ends_at,winner_video_entry_id,winner_votes,winner_published_at"
      )
      .eq("status", "archived")
      .order("winner_published_at", { ascending: false })
      .limit(10);

    if (archivedTopicsError) {
      return json({ error: "SUPABASE_ERROR", detail: archivedTopicsError.message }, 500);
    }

    const { data: videoRows, error: videoError } = await supabase
      .from("weekly_video_entries")
      .select("id,created_at,weekly_topic_id,device_id,group_code,platform,video_url,title,status")
      .order("created_at", { ascending: false })
      .limit(100);

    if (videoError) {
      return json({ error: "SUPABASE_ERROR", detail: videoError.message }, 500);
    }

    const { data: founderQuestions, error: founderQuestionsError } = await supabase
      .from("weekly_founder_questions")
      .select(
        "id,created_at,weekly_topic_id,weekly_video_entry_id,device_id,group_code,question_text,question_status,founder_answer_text,founder_answer_video_url,founder_answered_at,published"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (founderQuestionsError) {
      return json({ error: "SUPABASE_ERROR", detail: founderQuestionsError.message }, 500);
    }

    const { data: commentAwards, error: commentAwardsError } = await supabase
      .from("comment_awards")
      .select(
        "id,created_at,user_comment_id,device_id,group_code,award_year,award_quarter,award_title,award_note,contact_status,logistics_note,includes_companion,published,published_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (commentAwardsError) {
      return json({ error: "SUPABASE_ERROR", detail: commentAwardsError.message }, 500);
    }

    return json({
      ok: true,
      items: data ?? [],
      weeklyTopic: topicRow ?? null,
      archivedTopics: archivedTopics ?? [],
      videoItems: videoRows ?? [],
      founderQuestions: founderQuestions ?? [],
      commentAwards: commentAwards ?? [],
    });
  } catch (e: any) {
    return json({ error: "SERVER_ERROR", detail: e?.message ?? String(e) }, 500);
  }
}

// POST: cambia status / ejecuta acciones admin / responde fundador / crea premio trimestral
export async function POST(req: Request) {
  try {
    const auth = await requireAdminUser();
    if (!auth.ok) return json({ error: "UNAUTHORIZED", reason: auth.reason }, 401);

    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? "").trim();
    const supabase = supabaseAdmin();

    if (action === "run_weekly_rotation") {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return json({ error: "MISSING_CRON_SECRET" }, 500);
      }

      const origin = new URL(req.url).origin;

      const res = await fetch(`${origin}/api/cron/weekly-topic`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
        cache: "no-store",
      });

      const result = await res.json().catch(() => null);

      if (!res.ok) {
        return json(
          {
            error: result?.error ?? "CRON_EXECUTION_FAILED",
            detail: result?.detail ?? result?.message ?? "No se pudo ejecutar la rotación semanal.",
          },
          res.status
        );
      }

      return json(result ?? { ok: true });
    }

    if (action === "answer_founder_question") {
      const id = String(body?.id ?? "").trim();
      const founderAnswerText = String(body?.founder_answer_text ?? "").trim();
      const founderAnswerVideoUrl = String(body?.founder_answer_video_url ?? "").trim();
      const published = Boolean(body?.published ?? false);

      if (!id) return json({ error: "MISSING_ID" }, 400);
      if (!founderAnswerText && !founderAnswerVideoUrl) {
        return json({ error: "MISSING_FOUNDER_ANSWER" }, 400);
      }

      const payload: Record<string, any> = {
        founder_answer_text: founderAnswerText || null,
        founder_answer_video_url: founderAnswerVideoUrl || null,
        founder_answered_at: new Date().toISOString(),
        question_status: "answered",
        published,
      };

      const { error } = await supabase
        .from("weekly_founder_questions")
        .update(payload)
        .eq("id", id);

      if (error) return json({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return json({ ok: true });
    }

    if (action === "set_founder_question_publish") {
      const id = String(body?.id ?? "").trim();
      const published = Boolean(body?.published ?? false);

      if (!id) return json({ error: "MISSING_ID" }, 400);

      const { error } = await supabase
        .from("weekly_founder_questions")
        .update({ published })
        .eq("id", id);

      if (error) return json({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return json({ ok: true });
    }

    if (action === "create_comment_award") {
      const userCommentId = String(body?.user_comment_id ?? "").trim();
      const deviceId = body?.device_id ? String(body.device_id).trim() : null;
      const groupCode = String(body?.group_code ?? "GENERAL").trim() || "GENERAL";
      const awardYear = Number(body?.award_year ?? 0);
      const awardQuarter = Number(body?.award_quarter ?? 0);
      const awardTitle = String(body?.award_title ?? "").trim();
      const awardNote = String(body?.award_note ?? "").trim();
      const contactStatus = String(body?.contact_status ?? "pending").trim() || "pending";
      const logisticsNote = String(body?.logistics_note ?? "").trim();
      const includesCompanion = body?.includes_companion !== false;
      const published = Boolean(body?.published ?? false);

      if (!userCommentId) return json({ error: "MISSING_USER_COMMENT_ID" }, 400);
      if (!awardYear) return json({ error: "MISSING_AWARD_YEAR" }, 400);
      if (![1, 2, 3, 4].includes(awardQuarter)) {
        return json({ error: "INVALID_AWARD_QUARTER" }, 400);
      }

      const payload = {
        user_comment_id: userCommentId,
        device_id: deviceId,
        group_code: groupCode,
        award_year: awardYear,
        award_quarter: awardQuarter,
        award_title: awardTitle || null,
        award_note: awardNote || null,
        contact_status: contactStatus,
        logistics_note: logisticsNote || null,
        includes_companion: includesCompanion,
        published,
        published_at: published ? new Date().toISOString() : null,
      };

      const { error } = await supabase.from("comment_awards").insert(payload);

      if (error) return json({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return json({ ok: true });
    }

    if (action === "update_comment_award") {
      const id = String(body?.id ?? "").trim();
      const awardTitle = String(body?.award_title ?? "").trim();
      const awardNote = String(body?.award_note ?? "").trim();
      const contactStatus = String(body?.contact_status ?? "").trim();
      const logisticsNote = String(body?.logistics_note ?? "").trim();
      const includesCompanion = body?.includes_companion !== false;
      const published = Boolean(body?.published ?? false);

      if (!id) return json({ error: "MISSING_ID" }, 400);

      const payload: Record<string, any> = {
        award_title: awardTitle || null,
        award_note: awardNote || null,
        includes_companion: includesCompanion,
        published,
      };

      if (contactStatus) payload.contact_status = contactStatus;
      payload.logistics_note = logisticsNote || null;
      payload.published_at = published ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("comment_awards")
        .update(payload)
        .eq("id", id);

      if (error) return json({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return json({ ok: true });
    }

    const id = body?.id;
    const status = body?.status;
    const target = String(body?.target ?? "comment");

    if (!id) return json({ error: "MISSING_ID" }, 400);
    if (!status) return json({ error: "MISSING_STATUS" }, 400);

    const allowed = new Set(["reviewed", "archived"]);
    if (!allowed.has(status)) return json({ error: "STATUS_NOT_ALLOWED" }, 400);

    const tableName = target === "video" ? "weekly_video_entries" : "user_comments";

    const { error } = await supabase
      .from(tableName)
      .update({ status })
      .eq("id", id);

    if (error) return json({ error: "SUPABASE_ERROR", detail: error.message }, 500);

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: "SERVER_ERROR", detail: e?.message ?? String(e) }, 500);
  }
}

// PATCH: actualizar tema semanal activo desde admin
export async function PATCH(req: Request) {
  try {
    const auth = await requireAdminUser();
    if (!auth.ok) return json({ error: "UNAUTHORIZED", reason: auth.reason }, 401);

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? "").trim();
    const topic = String(body?.topic ?? "").trim();
    const question = String(body?.question ?? "").trim();

    if (!id) return json({ error: "MISSING_ID" }, 400);
    if (!topic) return json({ error: "MISSING_TOPIC" }, 400);
    if (!question) return json({ error: "MISSING_QUESTION" }, 400);

    const supabase = supabaseAdmin();

    const { error } = await supabase
      .from("weekly_topics")
      .update({
        topic,
        question,
      })
      .eq("id", id);

    if (error) return json({ error: "SUPABASE_ERROR", detail: error.message }, 500);

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: "SERVER_ERROR", detail: e?.message ?? String(e) }, 500);
  }
}
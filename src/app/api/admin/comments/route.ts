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
  if (email.toLowerCase() !== adminEmail.toLowerCase())
    return { ok: false as const, reason: "NOT_ADMIN" as const };

  return { ok: true as const, email };
}

// GET: lista comentarios (para admin)
export async function GET(req: Request) {
  try {
    const auth = await requireAdminUser();
    if (!auth.ok) return json({ error: "UNAUTHORIZED", reason: auth.reason }, 401);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // optional: new/reviewed/archived/blocked
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
  .select("id,topic,question,status,starts_at,ends_at,winner_video_entry_id,winner_votes,winner_published_at")
  .eq("status", "active")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (topicError) {
  return json({ error: "SUPABASE_ERROR", detail: topicError.message }, 500);
}
const { data: archivedTopics, error: archivedTopicsError } = await supabase
  .from("weekly_topics")
  .select("id,topic,question,status,starts_at,ends_at,winner_video_entry_id,winner_votes,winner_published_at")
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

return json({
  ok: true,
  items: data ?? [],
  weeklyTopic: topicRow ?? null,
  archivedTopics: archivedTopics ?? [],
  videoItems: videoRows ?? [],
});

  } catch (e: any) {
    return json({ error: "SERVER_ERROR", detail: e?.message ?? String(e) }, 500);
  }
}

// POST: cambia status (reviewed / archived) desde admin
export async function POST(req: Request) {
  try {
    const auth = await requireAdminUser();
    if (!auth.ok) return json({ error: "UNAUTHORIZED", reason: auth.reason }, 401);

    const body = await req.json().catch(() => null);
    const id = body?.id;
    const status = body?.status;
    const target = String(body?.target ?? "comment");
    if (!id) return json({ error: "MISSING_ID" }, 400);
    if (!status) return json({ error: "MISSING_STATUS" }, 400);

    // Solo permitimos cambios desde admin a estos estados
    const allowed = new Set(["reviewed", "archived"]);
    if (!allowed.has(status)) return json({ error: "STATUS_NOT_ALLOWED" }, 400);

    const supabase = supabaseAdmin();

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
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

export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const now = new Date().toISOString();

    // 1️⃣ buscar tema activo
    const { data: active } = await supabase
      .from("weekly_topics")
      .select("*")
      .eq("status", "active")
      .maybeSingle();

    if (!active) {
      return json({ ok: true, message: "No active topic." });
    }

    // 2️⃣ si aún no venció, no hacemos nada
    if (active.ends_at && active.ends_at > now) {
      return json({ ok: true, message: "Active topic still valid." });
    }

    // 3️⃣ archivar tema actual
    await supabase
      .from("weekly_topics")
      .update({ status: "archived" })
      .eq("id", active.id);

    // 4️⃣ buscar siguiente queued
    const { data: next } = await supabase
      .from("weekly_topics")
      .select("*")
      .eq("status", "queued")
      .lte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!next) {
      return json({ ok: true, message: "No queued topics available." });
    }

    // 5️⃣ activar siguiente
    await supabase
      .from("weekly_topics")
      .update({ status: "active" })
      .eq("id", next.id);

    return json({
      ok: true,
      archived: active.topic,
      activated: next.topic,
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
}
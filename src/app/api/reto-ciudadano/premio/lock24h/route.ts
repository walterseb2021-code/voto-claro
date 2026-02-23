import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const celular = String(body?.celular ?? "").trim();

    if (!celular) {
      return NextResponse.json({ error: "CELULAR_REQUIRED" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("reto_premio_participants")
      .update({ locked_until: until })
      .eq("celular", celular)
      .select("celular, locked_until, prize_locked_until")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, until: data.locked_until }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
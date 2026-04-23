import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const dni = String(body?.dni ?? "").trim();
    const celular = String(body?.celular ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const device_id = String(body?.device_id ?? "").trim();
    const group_code = String(body?.group_code ?? "").trim();

    if (!dni || !celular || !email || !group_code) {
      return NextResponse.json(
        { error: "DATOS_INCOMPLETOS" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Buscar si ya existe ese celular
    const { data: existing } = await supabase
      .from("reto_premio_participants")
      .select("*")
      .eq("celular", celular)
      .maybeSingle();

    const now = new Date();

    if (existing) {
      // Si tiene bloqueo por premio (1 mes)
      if (existing.prize_locked_until && new Date(existing.prize_locked_until) > now) {
        return NextResponse.json(
          {
            error: "BLOQUEO_PREMIO",
            until: existing.prize_locked_until,
          },
          { status: 403 }
        );
      }

      // Si tiene bloqueo normal (24h)
      if (existing.locked_until && new Date(existing.locked_until) > now) {
        return NextResponse.json(
          {
            error: "BLOQUEO_24H",
            until: existing.locked_until,
          },
          { status: 403 }
        );
      }

      // Si no está bloqueado → permitir jugar
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Si no existe → registrar nuevo participante
    const { error: insertErr } = await supabase
      .from("reto_premio_participants")
      .insert({
        dni,
        celular,
        email,
        device_id,
        group_code,
      });

    if (insertErr) {
      return NextResponse.json(
        { error: "INSERT_ERROR", detail: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (e: any) {
    return NextResponse.json(
      { error: "EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
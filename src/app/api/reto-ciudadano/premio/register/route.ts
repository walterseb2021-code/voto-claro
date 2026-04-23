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

    // Seguimos pidiendo estos datos para poder sincronizar con el flujo de premio.
    // Ya no es un "registro aparte", sino una validación/sincronización.
    if (!dni || !celular || !email || !group_code) {
      return NextResponse.json(
        { error: "DATOS_INCOMPLETOS" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Buscar si ya existe ese celular en la tabla del flujo de premio
    const { data: existing, error: existingErr } = await supabase
      .from("reto_premio_participants")
      .select("*")
      .eq("celular", celular)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json(
        { error: "LOOKUP_ERROR", detail: existingErr.message },
        { status: 500 }
      );
    }

    const now = new Date();

    if (existing) {
      // Si tiene bloqueo por premio (1 mes)
      if (
        existing.prize_locked_until &&
        new Date(existing.prize_locked_until) > now
      ) {
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

      // Si ya existe y no está bloqueado, sincronizamos datos básicos por si cambiaron
      const updatePayload: Record<string, string> = {
        dni,
        celular,
        email,
        group_code,
      };

      if (device_id) {
        updatePayload.device_id = device_id;
      }

      const { error: updateErr } = await supabase
        .from("reto_premio_participants")
        .update(updatePayload)
        .eq("celular", celular);

      if (updateErr) {
        return NextResponse.json(
          { error: "UPDATE_ERROR", detail: updateErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          synced: true,
          exists: true,
        },
        { status: 200 }
      );
    }

    // Si no existe, NO es un "registro nuevo" del módulo.
    // Es una sincronización del participante ya autenticado del app
    // hacia la tabla específica del flujo con premio.
    const insertPayload: Record<string, string> = {
      dni,
      celular,
      email,
      group_code,
    };

    if (device_id) {
      insertPayload.device_id = device_id;
    }

    const { error: insertErr } = await supabase
      .from("reto_premio_participants")
      .insert(insertPayload);

    if (insertErr) {
      return NextResponse.json(
        { error: "INSERT_ERROR", detail: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        synced: true,
        exists: false,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
}

function yearMonthNowUTC() {
  // YYYY-MM (UTC)
  return new Date().toISOString().slice(0, 7);
}

/**
 * POST /api/reto-ciudadano/premio/lockPrizeMonth
 * body: { celular: string, prize_segment: 2|6, prize_note?: string|null }
 *
 * - Bloquea 30 días (prize_locked_until)
 * - Inserta ganador en public.reto_premio_winners
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const celular = String(body?.celular ?? "").trim();
    const prize_segment = Number(body?.prize_segment ?? 0);
    const prize_note =
      body?.prize_note === null || typeof body?.prize_note === "string"
        ? body.prize_note
        : null;

    if (!celular) {
      return NextResponse.json({ error: "CELULAR_REQUIRED" }, { status: 400 });
    }
    if (!(prize_segment === 2 || prize_segment === 6)) {
      return NextResponse.json(
        { error: "PRIZE_SEGMENT_REQUIRED", detail: "prize_segment debe ser 2 o 6" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // 1) Traer participante (para obtener dni/email/group_code)
    const { data: participant, error: pErr } = await supabase
      .from("reto_premio_participants")
      .select("dni, celular, email, device_id, group_code, locked_until, prize_locked_until")
      .eq("celular", celular)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: pErr.message },
        { status: 500 }
      );
    }
    if (!participant) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // 2) Bloqueo 30 días (1 mes “operativo”)
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: updated, error: uErr } = await supabase
      .from("reto_premio_participants")
      .update({ prize_locked_until: until })
      .eq("celular", celular)
      .select("celular, locked_until, prize_locked_until")
      .maybeSingle();

    if (uErr) {
      return NextResponse.json(
        { error: "SUPABASE_ERROR", detail: uErr.message },
        { status: 500 }
      );
    }

    // 3) Insertar ganador (si ya existe en ese mes, no rompemos)
    const winnerPayload = {
      group_code: participant.group_code,
      dni: participant.dni,
      celular: participant.celular,
      email: participant.email,
      device_id: participant.device_id,
      prize_segment,
      prize_note: prize_note ?? null,
      year_month: yearMonthNowUTC(),
      status: "pendiente",
    };

    const { error: wErr } = await supabase.from("reto_premio_winners").insert(winnerPayload);

    if (wErr) {
      // Si choca con el unique (celular, year_month) lo consideramos OK
      const code = (wErr as any)?.code;
      if (code !== "23505") {
        return NextResponse.json(
          { error: "WINNER_INSERT_ERROR", detail: wErr.message, code },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { ok: true, until: updated?.prize_locked_until ?? until },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "EXCEPTION", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
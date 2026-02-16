// src/app/api/vote/status/route.ts

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const device_id = searchParams.get("device_id");

  if (!device_id) {
    return NextResponse.json({ error: "device_id requerido" }, { status: 400 });
  }

  // Obtener ronda activa
  const { data: round } = await supabase
    .from("vote_rounds")
    .select("*")
    .eq("is_active", true)
    .single();

  if (!round) {
    return NextResponse.json({ error: "No hay ronda activa" }, { status: 404 });
  }

  // Verificar si el dispositivo ya votó
  const { data: cast } = await supabase
    .from("vote_casts")
    .select("party_id")
    .eq("round_id", round.id)
    .eq("device_id", device_id)
    .maybeSingle();

  return NextResponse.json({
    voted: !!cast,
    party_id: cast?.party_id ?? null,
  });
}

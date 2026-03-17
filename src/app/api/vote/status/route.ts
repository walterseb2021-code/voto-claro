import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const device_id = searchParams.get("device_id");
  const round_id = searchParams.get("round_id"); // ← NUEVO: recibir round_id

  if (!device_id) {
    return NextResponse.json({ error: "device_id requerido" }, { status: 400 });
  }

  // Si no viene round_id, obtener la ronda activa global
  let targetRoundId = round_id;
  
  if (!targetRoundId) {
    const { data: round } = await supabase
      .from("vote_rounds")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!round) {
      return NextResponse.json({ error: "No hay ronda activa" }, { status: 404 });
    }
    
    targetRoundId = round.id;
  }

  // Verificar si el dispositivo ya votó en la ronda específica
  const { data: cast } = await supabase
    .from("vote_casts")
    .select("party_id")
    .eq("round_id", targetRoundId)
    .eq("device_id", device_id)
    .maybeSingle();

  return NextResponse.json({
    voted: !!cast,
    party_id: cast?.party_id ?? null,
    round_id: targetRoundId,
  });
}
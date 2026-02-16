// src/app/api/vote/cast/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_KEY) en variables de entorno."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    const payload = await req.json().catch(() => null);
    const device_id = (payload?.device_id ?? "").toString().trim();
    const party_slug = (payload?.party_slug ?? "").toString().trim();

    if (!device_id || device_id.length < 6) {
      return json(400, { error: "device_id inválido" });
    }
    if (!party_slug) {
      return json(400, { error: "party_slug requerido" });
    }

    // 1) Ronda activa
    const { data: round, error: roundErr } = await supabase
      .from("vote_rounds")
      .select("id,name,is_active,created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roundErr) return json(500, { error: "Error leyendo vote_rounds", detail: roundErr.message });
    if (!round) return json(404, { error: "No hay ronda activa" });

    // 2) Partido (por slug) dentro de esa ronda y enabled
    const { data: party, error: partyErr } = await supabase
      .from("vote_parties")
      .select("id,round_id,slug,name,enabled,position")
      .eq("round_id", round.id)
      .eq("slug", party_slug)
      .limit(1)
      .maybeSingle();

    if (partyErr) return json(500, { error: "Error leyendo vote_parties", detail: partyErr.message });
    if (!party) return json(404, { error: "Partido no encontrado en la ronda activa" });
    if (!party.enabled) return json(403, { error: "Partido deshabilitado" });

    // 3) Insertar voto (si ya votó en la ronda, UNIQUE lo bloquea)
    const { data: cast, error: castErr } = await supabase
      .from("vote_casts")
      .insert({
        round_id: round.id,
        party_id: party.id,
        device_id,
      })
      .select("id,round_id,party_id,device_id,created_at")
      .maybeSingle();

    if (castErr) {
      // Postgres UNIQUE violation: 23505
      const code = (castErr as any).code;
      if (code === "23505") {
        return json(409, {
          error: "Ya existe un voto para este dispositivo en la ronda activa",
          hint: "UNIQUE(device_id, round_id)",
        });
      }
      return json(500, { error: "Error insertando voto", detail: castErr.message, code });
    }

    // 4) (Opcional) devolver tally actualizado para ese partido
    const { data: tally, error: tallyErr } = await supabase
      .from("vote_tally")
      .select("total_votes")
      .eq("round_id", round.id)
      .eq("party_id", party.id)
      .limit(1)
      .maybeSingle();

    if (tallyErr) {
      // no bloqueamos, solo devolvemos sin tally
      return json(200, {
        ok: true,
        round,
        party,
        cast,
        total_votes: null,
      });
    }

    return json(200, {
      ok: true,
      round,
      party,
      cast,
      total_votes: Number(tally?.total_votes ?? 0),
    });
  } catch (e: any) {
    return json(500, { error: "Error interno", detail: e?.message ?? String(e) });
  }
}

// src/app/api/vote/active/route.ts
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

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // 1) Ronda activa
    const { data: round, error: roundErr } = await supabase
      .from("vote_rounds")
      .select("id,name,is_active,created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roundErr) {
      return NextResponse.json(
        { error: "Error leyendo vote_rounds", detail: roundErr.message },
        { status: 500 }
      );
    }

    if (!round) {
      return NextResponse.json(
        { error: "No hay ronda activa (vote_rounds.is_active=true)." },
        { status: 404 }
      );
    }

    // 2) Partidos de la ronda activa (ordenados por position)
    const { data: parties, error: partiesErr } = await supabase
      .from("vote_parties")
      .select("id,round_id,slug,name,enabled,position,created_at")
      .eq("round_id", round.id)
      .order("position", { ascending: true });

    if (partiesErr) {
      return NextResponse.json(
        { error: "Error leyendo vote_parties", detail: partiesErr.message },
        { status: 500 }
      );
    }

    // 3) Conteo (vote_tally)
    const { data: tallies, error: tallyErr } = await supabase
      .from("vote_tally")
      .select("party_id,total_votes")
      .eq("round_id", round.id);

    if (tallyErr) {
      return NextResponse.json(
        { error: "Error leyendo vote_tally", detail: tallyErr.message },
        { status: 500 }
      );
    }

    const tallyMap = new Map<string, number>();
    (tallies ?? []).forEach((t) => tallyMap.set(t.party_id, Number(t.total_votes ?? 0)));

    const options = (parties ?? []).map((p) => ({
      id: p.id,
      round_id: p.round_id,
      slug: p.slug,
      name: p.name,
      enabled: p.enabled,
      position: p.position,
      total_votes: tallyMap.get(p.id) ?? 0,
    }));

    return NextResponse.json({
      round,
      options,
      meta: {
        options_total: options.length,
        enabled_total: options.filter((o) => o.enabled).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Error interno", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

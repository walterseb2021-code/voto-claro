// src/app/api/reto-ciudadano/parties/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PartyAggRow = {
  party_id: string | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Por defecto: Nivel 2
    const levelRaw = searchParams.get("level") ?? "2";
    const level = Number(levelRaw);
    if (![1, 2].includes(level)) {
      return NextResponse.json(
        { error: "Parámetro inválido: level debe ser 1 o 2." },
        { status: 400 }
      );
    }

    // Opcional: idioma (tu tabla tiene lang)
    const lang = (searchParams.get("lang") ?? "es").trim();

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !KEY) {
      return NextResponse.json(
        {
          error:
            "Faltan variables de entorno Supabase (NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY).",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, KEY, {
      auth: { persistSession: false },
    });

    // Traemos party_id para nivel/lang activos y lo reducimos a únicos en server
    // (evita depender de GROUP BY / RPC / distinct si no quieres complicarte)
    let query = supabase
      .from("reto_questions")
      .select("party_id")
      .eq("level", level)
      .eq("lang", lang)
      .eq("is_active", true)
      .limit(1000);

    // Para nivel 1, party_id suele ser null. Igual devolvemos lista vacía.
    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hint: "¿RLS bloqueando SELECT? Usa SERVICE_ROLE o crea policy.",
        },
        { status: 500 }
      );
    }

    const rows: PartyAggRow[] = Array.isArray(data) ? (data as any) : [];

    const ids = Array.from(
      new Set(
        rows
          .map((r) => (r.party_id ?? "").toString().trim())
          .filter((x) => x.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "es"));

    return NextResponse.json(
      {
        level,
        lang,
        count: ids.length,
        partyIds: ids,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}

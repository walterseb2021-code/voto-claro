// src/app/api/reto-ciudadano/questions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RetoQuestionRow = {
  id: string;
  level: number;
  lang: string;
  party_id: string | null;
  question: string;
  answer: boolean;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const levelRaw = searchParams.get("level") ?? "1";
    const level = Number(levelRaw);

   if (![1, 2, 3].includes(level)) {
  return NextResponse.json(
    { error: "Parámetro inválido: level debe ser 1, 2 o 3." },
    { status: 400 }
  );
}

    // opcional: para nivel 2, permitir filtrar por partido
    const partyId = searchParams.get("partyId"); // puede ser null

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

    // Traemos un lote grande y barajamos en server para simular random real.
    // (Evita depender de ORDER BY random() / RPC por ahora)
    let query = supabase
      .from("reto_questions")
      .select(
        "id,level,lang,party_id,question,answer,note,is_active,created_at"
      )
      .eq("level", level)
      .eq("is_active", true)
      .limit(500);

   if ((level === 2 || level === 3) && partyId) {
  query = query.eq("party_id", partyId);
}

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message, hint: "¿RLS bloqueando SELECT? Usa SERVICE_ROLE o crea policy." },
        { status: 500 }
      );
    }

    const rows: RetoQuestionRow[] = Array.isArray(data) ? (data as any) : [];
    if (rows.length === 0) {
      return NextResponse.json(
        { level, count: 0, questions: [] },
        { status: 200 }
      );
    }

    shuffleInPlace(rows);

   const picked = rows.slice(0, 25).map((r) => ({
  id: r.id,
  q: (r.question ?? "").toString(),
  a: !!r.answer,
  note: r.note ? (r.note ?? "").toString() : undefined,
}));

 return NextResponse.json(
  {
    level,
    count: picked.length,
    source: "supabase",
     partyId: (level === 2 || level === 3) ? partyId ?? null : null,
    questions: picked,
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

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LANG_RE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

type PartyAggRow = {
  party_id: string | null;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0, private",
      Pragma: "no-cache",
    },
  });
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !service) {
    throw new Error("RETO_PARTIES_SERVER_CONFIG_MISSING");
  }

  return createClient(url, service, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const level = Number(searchParams.get("level") ?? "2");
    if (![1, 2].includes(level)) {
      return json(
        {
          ok: false,
          code: "RETO_PARTIES_LEVEL_INVALID",
          error: "Parametro invalido: level debe ser 1 o 2.",
        },
        400
      );
    }

    const lang = String(searchParams.get("lang") ?? "es").trim();
    if (!LANG_RE.test(lang)) {
      return json(
        {
          ok: false,
          code: "RETO_PARTIES_LANG_INVALID",
          error: "Parametro de idioma invalido.",
        },
        400
      );
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("reto_questions")
      .select("party_id")
      .eq("level", level)
      .eq("lang", lang)
      .eq("is_active", true)
      .limit(1000);

    if (error) {
      console.error("[reto-parties] lookup failed");
      return json(
        {
          ok: false,
          code: "RETO_PARTIES_UNAVAILABLE",
          error: "No se pudo cargar la lista de partidos.",
        },
        503
      );
    }

    const rows: PartyAggRow[] = Array.isArray(data)
      ? (data as PartyAggRow[])
      : [];

    const partyIds = Array.from(
      new Set(
        rows
          .map((row) => String(row.party_id ?? "").trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "es"));

    return json({
      ok: true,
      level,
      lang,
      count: partyIds.length,
      partyIds,
    });
  } catch {
    console.error("[reto-parties] unexpected failure");
    return json(
      {
        ok: false,
        code: "RETO_PARTIES_UNAVAILABLE",
        error: "No se pudo cargar la lista de partidos.",
      },
      503
    );
  }
}
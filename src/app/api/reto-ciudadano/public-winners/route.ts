import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GameCode = "principal" | "camino";
type PublicFilter = "HOY" | "AYER" | "SEMANA" | "MES" | "TRIMESTRE" | "TODOS";

type ParticipantAliasRelation =
  | { alias: string | null }
  | { alias: string | null }[]
  | null;

type PrincipalDbRow = {
  created_at: string | null;
  prize_segment: number | null;
  participant: ParticipantAliasRelation;
};

type CaminoDbRow = {
  qualified_at: string | null;
  participant: ParticipantAliasRelation;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Reto public winners dependency unavailable.");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getRequestOrigin(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(req.url).origin;
}

function isLocalOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  if (process.env.NODE_ENV !== "production" && isLocalOrigin(origin)) {
    return true;
  }

  try {
    return new URL(origin).origin === getRequestOrigin(req);
  } catch {
    return false;
  }
}

function safeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function getParticipantAlias(value: ParticipantAliasRelation) {
  const participant = Array.isArray(value) ? value[0] : value;
  if (!participant || typeof participant !== "object") return null;

  const alias = safeText(participant.alias, 80);
  return alias || null;
}

function validIso(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
}

function peruCalendarStartUtc(
  year: number,
  monthZeroBased: number,
  day: number
) {
  return new Date(
    Date.UTC(year, monthZeroBased, day, 5, 0, 0, 0)
  ).toISOString();
}

function getTimeWindow(filter: PublicFilter) {
  if (filter === "TODOS") return null;

  const now = new Date();

  if (filter === "SEMANA") {
    return {
      gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lt: null,
    };
  }

  if (filter === "MES") {
    return {
      gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      lt: null,
    };
  }

  const peruNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const year = peruNow.getUTCFullYear();
  const month = peruNow.getUTCMonth();
  const day = peruNow.getUTCDate();

  if (filter === "HOY") {
    return {
      gte: peruCalendarStartUtc(year, month, day),
      lt: peruCalendarStartUtc(year, month, day + 1),
    };
  }

  if (filter === "AYER") {
    return {
      gte: peruCalendarStartUtc(year, month, day - 1),
      lt: peruCalendarStartUtc(year, month, day),
    };
  }

  if (filter === "TRIMESTRE") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return {
      gte: peruCalendarStartUtc(year, quarterStartMonth, 1),
      lt: peruCalendarStartUtc(year, quarterStartMonth + 3, 1),
    };
  }

  return null;
}

function parseRequest(req: Request) {
  const { searchParams } = new URL(req.url);
  const keys = Array.from(searchParams.keys());

  if (
    keys.some((key) => key !== "game" && key !== "filter") ||
    searchParams.getAll("game").length !== 1 ||
    searchParams.getAll("filter").length !== 1
  ) {
    return null;
  }

  const game = searchParams.get("game");
  const filter = searchParams.get("filter");

  if (game !== "principal" && game !== "camino") {
    return null;
  }

  const principalFilters = new Set(["HOY", "AYER", "SEMANA", "MES", "TODOS"]);
  const caminoFilters = new Set(["TRIMESTRE", "HOY", "SEMANA", "MES", "TODOS"]);

  if (
    typeof filter !== "string" ||
    !(game === "principal"
      ? principalFilters.has(filter)
      : caminoFilters.has(filter))
  ) {
    return null;
  }

  return {
    game: game as GameCode,
    filter: filter as PublicFilter,
  };
}

async function loadPrincipalWinners(filter: PublicFilter) {
  const supabase = getSupabaseAdmin();
  const window = getTimeWindow(filter);

  let query = supabase
    .from("reto_premio_winners")
    .select(
      "created_at,prize_segment,participant:project_participants!participant_id(alias)"
    )
    .not("game_session_id", "is", null)
    .in("status", ["pendiente", "contactado", "entregado"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (window?.gte) query = query.gte("created_at", window.gte);
  if (window?.lt) query = query.lt("created_at", window.lt);

  const { data, error } = await query.returns<PrincipalDbRow[]>();

  if (error) {
    console.error("[reto-public-winners] principal lookup failed");
    throw new Error("principal_lookup_failed");
  }

  return (data ?? []).flatMap((row) => {
    const alias = getParticipantAlias(row.participant);
    const createdAt = validIso(row.created_at);
    const segment = Number(row.prize_segment);

    if (
      !alias ||
      !createdAt ||
      !Number.isInteger(segment) ||
      segment < 1 ||
      segment > 8
    ) {
      return [];
    }

    return [
      {
        alias,
        created_at: createdAt,
        segmento: segment,
        premio: "Premio ruleta",
      },
    ];
  });
}

async function loadCaminoWinners(filter: PublicFilter) {
  const supabase = getSupabaseAdmin();
  const window = getTimeWindow(filter);

  let query = supabase
    .from("reto_camino_qualifiers")
    .select(
      "qualified_at,participant:project_participants!participant_id(alias)"
    )
    .in("status", ["eligible", "selected", "not_selected"])
    .order("qualified_at", { ascending: false })
    .limit(500);

  if (window?.gte) query = query.gte("qualified_at", window.gte);
  if (window?.lt) query = query.lt("qualified_at", window.lt);

  const { data, error } = await query.returns<CaminoDbRow[]>();

  if (error) {
    console.error("[reto-public-winners] camino lookup failed");
    throw new Error("camino_lookup_failed");
  }

  return (data ?? []).flatMap((row) => {
    const alias = getParticipantAlias(row.participant);
    const qualifiedAt = validIso(row.qualified_at);

    if (!alias || !qualifiedAt) {
      return [];
    }

    return [
      {
        alias,
        created_at: qualifiedAt,
        premio: "Clasificado para seleccion trimestral",
      },
    ];
  });
}

export async function GET(req: Request) {
  try {
    if (!isAllowedOrigin(req)) {
      return json(403, {
        ok: false,
        error: "No autorizado",
      });
    }

    const parsed = parseRequest(req);
    if (!parsed) {
      return json(400, {
        ok: false,
        error: "Solicitud invalida",
      });
    }

    const winners =
      parsed.game === "principal"
        ? await loadPrincipalWinners(parsed.filter)
        : await loadCaminoWinners(parsed.filter);

    return json(200, {
      ok: true,
      game: parsed.game,
      filter: parsed.filter,
      winners,
    });
  } catch {
    console.error("[reto-public-winners] unexpected failure");
    return json(503, {
      ok: false,
      error: "winners_unavailable",
    });
  }
}
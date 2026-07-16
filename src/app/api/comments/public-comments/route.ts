import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TimeFilter = "TODAY" | "D7" | "D30" | "ALL";

type PublicCommentDbRow = {
  id: string;
  created_at: string;
  group_code: string | null;
  message: string | null;
};

const ALLOWED_FILTERS = new Set<TimeFilter>(["TODAY", "D7", "D30", "ALL"]);
const DEFAULT_FILTER: TimeFilter = "D7";
const DEFAULT_TZ_OFFSET_MINUTES = 300;
const MAX_TZ_OFFSET_MINUTES = 840;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function json(httpStatus: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status: httpStatus });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase admin configuration");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getRequestOrigin(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  return new URL(req.url).origin;
}

function isLocalOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
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

function parseFilter(searchParams: URLSearchParams): TimeFilter | null {
  const values = searchParams.getAll("filter");
  if (values.length === 0) return DEFAULT_FILTER;
  if (values.length > 1) return null;

  const value = values[0];
  return ALLOWED_FILTERS.has(value as TimeFilter) ? (value as TimeFilter) : null;
}

function parseTimezoneOffset(searchParams: URLSearchParams): number | null {
  const values = searchParams.getAll("tz_offset_minutes");
  if (values.length === 0) return DEFAULT_TZ_OFFSET_MINUTES;
  if (values.length > 1) return null;

  const value = values[0];
  if (!/^-?\d+$/.test(value)) return null;

  const offset = Number(value);
  if (!Number.isInteger(offset)) return null;
  if (offset < -MAX_TZ_OFFSET_MINUTES || offset > MAX_TZ_OFFSET_MINUTES) return null;

  return offset;
}

function hasOnlyAllowedParams(searchParams: URLSearchParams) {
  const allowed = new Set(["filter", "tz_offset_minutes"]);
  return Array.from(searchParams.keys()).every((key) => allowed.has(key));
}

function getSinceIso(filter: TimeFilter, tzOffsetMinutes: number) {
  const now = new Date();

  if (filter === "ALL") return null;

  if (filter === "TODAY") {
    const localNow = new Date(now.getTime() - tzOffsetMinutes * MS_PER_MINUTE);
    const localMidnightUtcMs = Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
      0,
      0,
      0,
      0
    );

    return new Date(localMidnightUtcMs + tzOffsetMinutes * MS_PER_MINUTE).toISOString();
  }

  const days = filter === "D7" ? 7 : 30;
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

function toPublicComment(row: PublicCommentDbRow) {
  return {
    id: row.id,
    created_at: row.created_at,
    group_code: row.group_code ?? "",
    message: row.message ?? "",
  };
}

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const url = new URL(req.url);

    if (!hasOnlyAllowedParams(url.searchParams)) {
      return json(400, { ok: false, error: "Solicitud inválida" });
    }

    const filter = parseFilter(url.searchParams);
    const tzOffsetMinutes = parseTimezoneOffset(url.searchParams);

    if (!filter || tzOffsetMinutes === null) {
      return json(400, { ok: false, error: "Solicitud inválida" });
    }

    const sinceIso = getSinceIso(filter, tzOffsetMinutes);
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("user_comments")
      .select("id, created_at, group_code, message")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50);

    if (sinceIso) {
      query = query.gte("created_at", sinceIso);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[comments/public-comments] comments lookup failed", error);
      return json(500, { ok: false, error: "No disponible" });
    }

    const commentRows = (data ?? []) as PublicCommentDbRow[];

    return json(200, {
      ok: true,
      comments: commentRows.map(toPublicComment),
    });
  } catch (e) {
    console.error("[comments/public-comments] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

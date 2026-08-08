import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VC_PITCH_COOKIE = "vc_pitch_token";
const VC_GROUP_COOKIE = "vc_group";
const MAX_PITCH_TOKEN_LENGTH = 2048;
const noStoreHeaders = {
  "Cache-Control": "no-store",
};

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

function invalidAccess(status = 401) {
  return jsonNoStore(
    { error: "No se pudo validar el acceso.", code: "PITCH_ACCESS_INVALID" },
    status
  );
}

function unavailable() {
  return jsonNoStore(
    { error: "No se pudo validar el acceso.", code: "PITCH_ACCESS_UNAVAILABLE" },
    503
  );
}

function clearPitchCookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(VC_PITCH_COOKIE, "", options);
  response.cookies.set(VC_GROUP_COOKIE, "", options);
  return response;
}

function tokenToGroup(token: string) {
  // GRUPOA-2026-01 -> GRUPOA
  const m = token.match(/^(GRUPO[A-Z])-/);
  return m ? m[1] : null;
}

function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name) continue;

    const rawValue = rawValueParts.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}
function getSupabaseAdmin() {
  // ✅ IMPORTANTÍSIMO: en tu .env.local tienes NEXT_PUBLIC_SUPABASE_URL, NO SUPABASE_URL
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
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

function isJsonContentType(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  return contentType.toLowerCase().split(";")[0].trim() === "application/json";
}

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const token = (readCookieValue(cookieHeader, VC_PITCH_COOKIE) ?? "").trim();
    const group = (readCookieValue(cookieHeader, VC_GROUP_COOKIE) ?? "").trim();

    if (!token || !group || tokenToGroup(token) !== group) {
      return clearPitchCookies(invalidAccess());
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("votoclaro_public_links")
      .select("expires_at")
      .eq("token", token)
      .eq("route", "/pitch")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[pitch-gate] access validation failed");
      return unavailable();
    }

    if (!data) {
      return clearPitchCookies(invalidAccess());
    }

    if (data.expires_at) {
      const exp = new Date(String(data.expires_at)).getTime();
      if (Number.isFinite(exp) && Date.now() > exp) {
        return clearPitchCookies(invalidAccess());
      }
    }

    return jsonNoStore({ ok: true, group }, 200);
  } catch {
    console.error("[pitch-gate] access validation failed");
    return unavailable();
  }
}
export async function POST(req: Request) {
  let shouldClearPitchCookies = false;

  try {
    if (!isAllowedOrigin(req)) {
      return invalidAccess(403);
    }

    if (!isJsonContentType(req)) {
      return invalidAccess(400);
    }

    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidAccess(400);
    }

    const rawToken = (body as { token?: unknown }).token;
    shouldClearPitchCookies =
      typeof rawToken === "string" && Boolean(rawToken.trim());

    if (Object.keys(body).some((key) => key !== "token")) {
      return shouldClearPitchCookies
        ? clearPitchCookies(invalidAccess(400))
        : invalidAccess(400);
    }

    if (typeof rawToken !== "string") {
      return invalidAccess(400);
    }

    const token = rawToken.trim();

    if (!token || token.length > MAX_PITCH_TOKEN_LENGTH) {
      return shouldClearPitchCookies
        ? clearPitchCookies(invalidAccess())
        : invalidAccess();
    }

    const group = tokenToGroup(token);
    if (!group) {
      return clearPitchCookies(invalidAccess());
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("votoclaro_public_links")
      .select("route, is_active, expires_at")
      .eq("token", token)
      .eq("route", "/pitch")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[pitch-gate] access validation failed");
      return clearPitchCookies(unavailable());
    }

    if (!data) {
      return clearPitchCookies(invalidAccess());
    }

    if (data.expires_at) {
      const exp = new Date(String(data.expires_at)).getTime();
      if (Number.isFinite(exp) && Date.now() > exp) {
        return clearPitchCookies(invalidAccess());
      }
    }

    const res = jsonNoStore({ ok: true }, 200);

    // ✅ Cookie HttpOnly: gate fuerte para middleware
    res.cookies.set(VC_PITCH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });

    // ✅ Cookie grupo para filtrar Supabase luego
    res.cookies.set(VC_GROUP_COOKIE, group, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return res;
  } catch {
    console.error("[pitch-gate] access validation failed");
    const response = unavailable();
    return shouldClearPitchCookies ? clearPitchCookies(response) : response;
  }
}

import { NextResponse } from "next/server";
import {
  MAX_PITCH_TOKEN_LENGTH,
  VC_GROUP_COOKIE,
  VC_PITCH_COOKIE,
  resolvePitchAccess,
  validatePitchToken,
} from "@/lib/pitchAccessAuth";

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

function isJsonContentType(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  return contentType.toLowerCase().split(";")[0].trim() === "application/json";
}

export async function GET(req: Request) {
  try {
    const access = await resolvePitchAccess(req);

    if (!access.ok) {
      return access.reason === "invalid"
        ? clearPitchCookies(invalidAccess())
        : unavailable();
    }

    return jsonNoStore({ ok: true, group: access.group }, 200);
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

    const access = await validatePitchToken(token);

    if (!access.ok) {
      const response =
        access.reason === "invalid" ? invalidAccess() : unavailable();
      return clearPitchCookies(response);
    }

    const res = jsonNoStore({ ok: true }, 200);

    res.cookies.set(VC_PITCH_COOKIE, access.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    res.cookies.set(VC_GROUP_COOKIE, access.group, {
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

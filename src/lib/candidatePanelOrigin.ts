import { type NextRequest } from "next/server";

const PRODUCTION_ORIGIN = "https://voto-claro.vercel.app";

function normalizeOrigin(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(`https://${raw}`);

    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function allowedOrigins() {
  const origins = new Set<string>([PRODUCTION_ORIGIN]);

  for (const value of [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.APP_URL,
  ]) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }

  return origins;
}

export function isAllowedCandidatePanelMutationOrigin(req: NextRequest) {
  const origin = normalizeOrigin(req.headers.get("origin"));
  if (!origin) return false;

  if (process.env.NODE_ENV !== "production" && isLocalOrigin(origin)) {
    return true;
  }

  return allowedOrigins().has(origin);
}

export function isJsonContentType(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("application/json");
}

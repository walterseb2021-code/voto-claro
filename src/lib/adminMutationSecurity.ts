import "server-only";

import { type NextRequest } from "next/server";

export function isAllowedAdminMutationOrigin(req: NextRequest) {
  const rawOrigin = req.headers.get("origin");
  if (!rawOrigin) return false;

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return false;
  }

  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    return false;
  }

  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    return false;
  }

  return origin.origin === req.nextUrl.origin;
}

export async function readAdminJsonObject(
  req: NextRequest,
  maxBytes: number
): Promise<Record<string, unknown> | null> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return null;

  const rawLength = req.headers.get("content-length");
  if (rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
      return null;
    }
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

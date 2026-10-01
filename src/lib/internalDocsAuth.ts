import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const INTERNAL_DOCS_SECRET_MIN_LENGTH = 32;
const DEV_INTERNAL_DOCS_SECRET = "development-only-internal-docs-plan-secret";

export const INTERNAL_DOCS_PLAN_HEADER = "x-vc-internal-docs-token";

function getInternalDocsSecret() {
  const configured =
    process.env.PARTICIPANT_RATE_LIMIT_SECRET ||
    process.env.CANDIDATE_PANEL_RATE_LIMIT_SECRET;

  if (
    configured &&
    configured.length >= INTERNAL_DOCS_SECRET_MIN_LENGTH
  ) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_INTERNAL_DOCS_SECRET;
  }

  return null;
}

export function getInternalDocsPlanToken(id: string) {
  const secret = getInternalDocsSecret();
  if (!secret) return null;

  return createHmac("sha256", secret)
    .update(`docs-plan:${id}`, "utf8")
    .digest("hex");
}

export function isValidInternalDocsPlanToken(
  id: string,
  provided: string | null
) {
  if (!provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;

  const expected = getInternalDocsPlanToken(id);
  if (!expected) return false;

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

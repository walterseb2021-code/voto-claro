import "server-only";

import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { getParticipantSupabaseAdmin } from "@/lib/participantApi";

const AI_RATE_LIMIT_SECRET_MIN_LENGTH = 32;
const DEV_AI_RATE_LIMIT_SECRET =
  "development-only-ai-answer-rate-limit-secret";

export type AiAnswerRateLimitResult =
  | {
      ok: true;
      allowed: boolean;
      retryAfterSeconds: number;
    }
  | { ok: false };

function getAiRateLimitSecret() {
  const configured =
    process.env.PARTICIPANT_RATE_LIMIT_SECRET ||
    process.env.CANDIDATE_PANEL_RATE_LIMIT_SECRET;

  if (
    configured &&
    configured.length >= AI_RATE_LIMIT_SECRET_MIN_LENGTH
  ) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_AI_RATE_LIMIT_SECRET;
  }

  return null;
}

export function getAiAnswerIpFingerprint(req: NextRequest) {
  const secret = getAiRateLimitSecret();
  if (!secret) return { ok: false as const };

  let rawIp = "local-development";

  if (process.env.NODE_ENV === "production") {
    const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
    const candidateIp = forwardedFor.split(",")[0]?.trim() ?? "";

    rawIp =
      candidateIp &&
      candidateIp.length <= 128 &&
      !/[\u0000-\u001f]/.test(candidateIp)
        ? candidateIp
        : "unknown-production-origin";
  }

  const value = createHmac("sha256", secret)
    .update(`ai-answer-ip:${rawIp}`, "utf8")
    .digest("hex");

  return { ok: true as const, value };
}

export async function consumeAiAnswerRateLimit(
  ipFingerprint: string
): Promise<AiAnswerRateLimitResult> {
  try {
    const supabase = getParticipantSupabaseAdmin();

    const { data, error } = await supabase.rpc(
      "consume_ai_answer_rate_limit",
      {
        p_ip_fingerprint: ipFingerprint,
      }
    );

    if (error) {
      console.error("[ai-answer] rate limit RPC failed");
      return { ok: false };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") {
      console.error("[ai-answer] invalid rate limit RPC result");
      return { ok: false };
    }

    const rawRetry = Number(row.retry_after_seconds ?? 0);
    const retryAfterSeconds = Number.isFinite(rawRetry)
      ? Math.max(0, Math.min(3600, Math.trunc(rawRetry)))
      : 0;

    return {
      ok: true,
      allowed: row.allowed,
      retryAfterSeconds,
    };
  } catch {
    console.error("[ai-answer] rate limit unavailable");
    return { ok: false };
  }
}

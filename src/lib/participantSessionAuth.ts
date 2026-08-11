import "server-only";

import { type NextRequest } from "next/server";
import {
  hashParticipantSessionToken,
  readParticipantSessionToken,
} from "@/lib/participantSession";
import {
  getParticipantSupabaseAdmin,
  toSafeParticipant,
  type SafeParticipant,
} from "@/lib/participantApi";

type ResolvedParticipantSession =
  | {
      ok: true;
      participant: SafeParticipant;
      supabase: ReturnType<typeof getParticipantSupabaseAdmin>;
    }
  | {
      ok: false;
      reason: "unauthenticated" | "unavailable";
    };

function parseSessionDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function resolveParticipantSession(
  req: NextRequest
): Promise<ResolvedParticipantSession> {
  const token = readParticipantSessionToken(req);
  if (!token) {
    return { ok: false, reason: "unauthenticated" };
  }

  const supabase = getParticipantSupabaseAdmin();
  const tokenHash = hashParticipantSessionToken(token);

  const { data: session, error: sessionError } = await supabase
    .from("project_participant_sessions")
    .select("participant_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    console.error("[participant-session-auth] session lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  const expiresAt = parseSessionDate(session?.expires_at);
  const validSession =
    typeof session?.participant_id === "string" &&
    session.participant_id.length > 0 &&
    session?.revoked_at === null &&
    Boolean(expiresAt) &&
    expiresAt!.getTime() > Date.now();

  if (!validSession) {
    return { ok: false, reason: "unauthenticated" };
  }

  const { data: participant, error: participantError } = await supabase
    .from("project_participants")
    .select("id,alias,full_name")
    .eq("id", session!.participant_id)
    .limit(1)
    .maybeSingle();

  if (participantError) {
    console.error("[participant-session-auth] participant lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  const safeParticipant = toSafeParticipant(participant ?? null);
  if (!safeParticipant) {
    return { ok: false, reason: "unauthenticated" };
  }

  return {
    ok: true,
    participant: safeParticipant,
    supabase,
  };
}
import { type NextRequest } from "next/server";
import {
  clearParticipantSessionCookie,
  hashParticipantSessionToken,
  readParticipantSessionToken,
} from "@/lib/participantSession";
import {
  getParticipantSupabaseAdmin,
  participantJson,
  toSafeParticipant,
} from "@/lib/participantApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionRow = {
  participant_id: string;
  expires_at: string;
  revoked_at: string | null;
};

function parseDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function unauthenticated() {
  return participantJson(200, {
    ok: true,
    authenticated: false,
    participant: null,
  });
}

export async function GET(req: NextRequest) {
  try {
    const token = readParticipantSessionToken(req);
    if (!token) return unauthenticated();

    const supabase = getParticipantSupabaseAdmin();
    const tokenHash = hashParticipantSessionToken(token);

    const { data: session, error: sessionError } = await supabase
      .from("project_participant_sessions")
      .select("participant_id,expires_at,revoked_at")
      .eq("token_hash", tokenHash)
      .limit(1)
      .maybeSingle<SessionRow>();

    if (sessionError) {
      console.error("[participant-session] session lookup failed");
      return participantJson(503, {
        ok: false,
        error: "session_unavailable",
      });
    }

    const expiresAt = parseDate(session?.expires_at);
    const validSession =
      Boolean(session?.participant_id) &&
      session?.revoked_at === null &&
      Boolean(expiresAt) &&
      expiresAt!.getTime() > Date.now();

    if (!validSession) {
      const response = unauthenticated();
      return clearParticipantSessionCookie(response);
    }

    const { data: participant, error: participantError } = await supabase
      .from("project_participants")
      .select("id,alias,full_name,created_at,codigo_acceso")
      .eq("id", session!.participant_id)
      .limit(1)
      .maybeSingle();

    if (participantError) {
      console.error("[participant-session] participant lookup failed");
      return participantJson(503, {
        ok: false,
        error: "session_unavailable",
      });
    }

    const safeParticipant = toSafeParticipant(participant ?? null);

    if (!safeParticipant) {
      const response = unauthenticated();
      return clearParticipantSessionCookie(response);
    }

    const fullName =
      typeof participant?.full_name === "string"
        ? participant.full_name.trim().replace(/\s+/g, " ").slice(0, 120) || null
        : null;

    const createdAt =
      typeof participant?.created_at === "string" &&
      Number.isFinite(new Date(participant.created_at).getTime())
        ? participant.created_at
        : null;

    const hasAccessCode =
      typeof participant?.codigo_acceso === "string" &&
      participant.codigo_acceso.trim().length > 0;

    return participantJson(200, {
      ok: true,
      authenticated: true,
      participant: {
        ...safeParticipant,
        full_name: fullName,
        created_at: createdAt,
        has_access_code: hasAccessCode,
      },
    });
  } catch {
    console.error("[participant-session] unexpected failure");
    return participantJson(503, {
      ok: false,
      error: "session_unavailable",
    });
  }
}
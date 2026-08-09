import { type NextRequest } from "next/server";
import {
  clearParticipantSessionCookie,
  hashParticipantSessionToken,
  readParticipantSessionToken,
} from "@/lib/participantSession";
import {
  getParticipantSupabaseAdmin,
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
} from "@/lib/participantApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

    const token = readParticipantSessionToken(req);

    if (token) {
      const supabase = getParticipantSupabaseAdmin();
      const tokenHash = hashParticipantSessionToken(token);

      const { error: revokeError } = await supabase
        .from("project_participant_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", tokenHash)
        .is("revoked_at", null);

      if (revokeError) {
        console.error("[participant-logout] session revoke failed");
      }
    }

    const response = participantJson(200, {
      ok: true,
      authenticated: false,
    });

    return clearParticipantSessionCookie(response);
  } catch {
    console.error("[participant-logout] unexpected failure");

    const response = participantJson(200, {
      ok: true,
      authenticated: false,
    });

    return clearParticipantSessionCookie(response);
  }
}
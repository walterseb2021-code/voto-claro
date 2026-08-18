import { type NextRequest } from "next/server";
import {
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import { resolveEntrepreneurAffiliate } from "@/lib/entrepreneurProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveParticipantSession(req);

    if (!auth.ok) {
      return participantError(
        auth.reason === "unauthenticated" ? 401 : 503,
        auth.reason === "unauthenticated"
          ? "participant_session_required"
          : "entrepreneur_profile_unavailable"
      );
    }

    const affiliateResult = await resolveEntrepreneurAffiliate(
      auth.supabase,
      auth.participant.id
    );

    if (!affiliateResult.ok) {
      return participantError(503, "entrepreneur_profile_unavailable");
    }

    return participantJson(200, {
      ok: true,
      authenticated: true,
      participant: auth.participant,
      affiliate:
        affiliateResult.status === "verified"
          ? affiliateResult.affiliate
          : null,
      affiliate_status: affiliateResult.status,
      can_publish: affiliateResult.status === "verified",
    });
  } catch {
    console.error("[entrepreneur-me] unexpected failure");
    return participantError(503, "entrepreneur_profile_unavailable");
  }
}
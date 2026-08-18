import { type NextRequest } from "next/server";
import {
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

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

    const { data, error } = await auth.supabase
      .from("espacio_afiliados")
      .select("id,is_active,verified_at,created_at")
      .eq("participant_id", auth.participant.id)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      console.error("[entrepreneur-me] affiliate lookup failed");
      return participantError(503, "entrepreneur_profile_unavailable");
    }

    if ((data?.length ?? 0) > 1) {
      console.error("[entrepreneur-me] duplicate participant affiliations");
      return participantError(503, "entrepreneur_profile_unavailable");
    }

    const affiliate = data?.[0] ?? null;

    return participantJson(200, {
      ok: true,
      authenticated: true,
      participant: auth.participant,
      affiliate: affiliate
        ? {
            id: affiliate.id,
            is_active: affiliate.is_active === true,
            verified_at:
              typeof affiliate.verified_at === "string"
                ? affiliate.verified_at
                : null,
          }
        : null,
      can_publish: Boolean(affiliate?.is_active),
    });
  } catch {
    console.error("[entrepreneur-me] unexpected failure");
    return participantError(503, "entrepreneur_profile_unavailable");
  }
}
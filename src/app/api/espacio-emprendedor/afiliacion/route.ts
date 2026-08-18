import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import { resolveEntrepreneurAffiliate } from "@/lib/entrepreneurProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapClaimError(code: string, message: string) {
  if (code === "22023") {
    return participantError(400, "affiliate_claim_invalid");
  }

  if (code === "P0002") {
    return participantError(404, "participant_not_found");
  }

  if (code === "40001") {
    return participantError(409, "affiliate_claim_conflict");
  }

  if (
    code === "P0001" &&
    (message.includes("affiliate is inactive") ||
      message.includes("affiliate DNI does not match"))
  ) {
    return participantError(403, "affiliate_claim_not_allowed");
  }

  return participantError(503, "affiliate_claim_unavailable");
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

    const auth = await resolveParticipantSession(req);

    if (!auth.ok) {
      return participantError(
        auth.reason === "unauthenticated" ? 401 : 503,
        auth.reason === "unauthenticated"
          ? "participant_session_required"
          : "affiliate_claim_unavailable"
      );
    }

    const { data, error } = await auth.supabase.rpc(
      "claim_espacio_afiliacion_secure",
      {
        p_participant_id: auth.participant.id,
      }
    );

    if (error) {
      console.error("[entrepreneur-affiliate-claim] secure RPC failed");
      return mapClaimError(
        String(error.code ?? ""),
        String(error.message ?? "")
      );
    }

    const affiliateId =
      typeof data === "string" ? data.trim() : "";

    if (!affiliateId) {
      return participantError(404, "affiliate_not_found");
    }

    const affiliateResult = await resolveEntrepreneurAffiliate(
      auth.supabase,
      auth.participant.id
    );

    if (!affiliateResult.ok) {
      console.error("[entrepreneur-affiliate-claim] result verification failed");
      return participantError(503, "affiliate_claim_unavailable");
    }

    if (affiliateResult.status === "missing") {
      return participantError(404, "affiliate_not_found");
    }

    if (affiliateResult.status === "inactive") {
      return participantError(403, "affiliate_claim_not_allowed");
    }

    if (affiliateResult.status === "identity_mismatch") {
      return participantError(403, "affiliate_claim_not_allowed");
    }

    const affiliate = affiliateResult.affiliate;

    if (!affiliate || affiliate.id !== affiliateId) {
      console.error("[entrepreneur-affiliate-claim] RPC result mismatch");
      return participantError(409, "affiliate_claim_conflict");
    }

    return participantJson(200, {
      ok: true,
      affiliate,
    });
  } catch {
    console.error("[entrepreneur-affiliate-claim] unexpected failure");
    return participantError(503, "affiliate_claim_unavailable");
  }
}
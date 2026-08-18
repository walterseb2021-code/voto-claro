import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

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

    const { data: affiliate, error: affiliateError } = await auth.supabase
      .from("espacio_afiliados")
      .select("id,is_active,verified_at")
      .eq("id", affiliateId)
      .eq("participant_id", auth.participant.id)
      .limit(1)
      .maybeSingle();

    if (affiliateError) {
      console.error("[entrepreneur-affiliate-claim] result lookup failed");
      return participantError(503, "affiliate_claim_unavailable");
    }

    if (!affiliate || affiliate.is_active !== true) {
      console.error("[entrepreneur-affiliate-claim] invalid RPC result");
      return participantError(503, "affiliate_claim_unavailable");
    }

    return participantJson(200, {
      ok: true,
      affiliate: {
        id: affiliate.id,
        is_active: true,
        verified_at:
          typeof affiliate.verified_at === "string"
            ? affiliate.verified_at
            : null,
      },
    });
  } catch {
    console.error("[entrepreneur-affiliate-claim] unexpected failure");
    return participantError(503, "affiliate_claim_unavailable");
  }
}
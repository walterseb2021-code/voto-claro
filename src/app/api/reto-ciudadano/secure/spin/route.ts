import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  finalizePrincipalSpinAtomic,
  isRetoSessionExpired,
  loadActiveRetoSession,
  parsePrincipalPrizeState,
} from "@/lib/retoSecureGame";
import {
  parseRetoStateVersion,
  parseRetoUuid,
  publicRetoSession,
  resolveRetoPrizeMutation,
  retoConflict,
  retoUnavailable,
} from "@/lib/retoSecureApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const prelude = await resolveRetoPrizeMutation(req, [
      "session_id",
      "state_version",
    ]);
    if (!prelude.ok) return prelude.response;

    const sessionId = parseRetoUuid(prelude.body.session_id);
    const stateVersion = parseRetoStateVersion(prelude.body.state_version);

    if (!sessionId || !stateVersion) {
      return participantJson(400, {
        ok: false,
        code: "RETO_REQUEST_INVALID",
        error: "Solicitud invÃ¡lida.",
      });
    }

    const { context } = prelude;
    const active = await loadActiveRetoSession(
      context.supabase,
      context.participant.id,
      context.group,
      "principal"
    );

    if (!active.ok) {
      return active.reason === "unavailable"
        ? retoUnavailable("RETO_SESSION_LOOKUP_FAILED")
        : retoConflict("RETO_SESSION_INVALID");
    }

    const session = active.session;
    if (!session) return retoConflict("RETO_SESSION_NOT_ACTIVE");

    if (
      session.id !== sessionId ||
      session.state_version !== stateVersion
    ) {
      return retoConflict();
    }

    if (isRetoSessionExpired(session)) {
      return participantJson(410, {
        ok: false,
        code: "RETO_SESSION_EXPIRED",
        error: "La sesiÃ³n de juego venciÃ³.",
      });
    }

    const state = parsePrincipalPrizeState(session.state);
    if (
      !state ||
      state.phase !== "roulette" ||
      !state.level1_passed ||
      !state.level2_passed ||
      state.roulette_used
    ) {
      return participantJson(409, {
        ok: false,
        code: "RETO_SPIN_NOT_ALLOWED",
        error: "No corresponde girar la ruleta en esta fase.",
      });
    }

    const finalized = await finalizePrincipalSpinAtomic(
      context.supabase,
      session
    );

    if (!finalized.ok) {
      if (finalized.reason === "expired") {
        return participantJson(410, {
          ok: false,
          code: "RETO_SESSION_EXPIRED",
          error: "La sesiÃ³n de juego venciÃ³.",
        });
      }

      return finalized.reason === "unavailable"
        ? retoUnavailable("RETO_SPIN_FINALIZE_FAILED")
        : retoConflict();
    }

    return participantJson(200, {
      ok: true,
      session: publicRetoSession(finalized.session),
      spin: {
        segment: finalized.segment,
        is_prize: finalized.isPrize,
        awarded: finalized.awarded,
        prize_locked_until: finalized.prizeLockedUntil,
      },
    });
  } catch {
    console.error("[reto-secure-spin] unexpected failure");
    return retoUnavailable();
  }
}
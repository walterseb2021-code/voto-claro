import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  isRetoSessionExpired,
  loadActiveRetoSession,
  parsePrincipalPrizeState,
  secureRandomRouletteSegment,
} from "@/lib/retoSecureGame";
import { finalizeRetoPrizeSpinAtomic } from "@/lib/retoPrizeSpinEngine";
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
        error: "Solicitud inválida.",
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
        error: "La sesión de juego venció.",
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

    const segment = secureRandomRouletteSegment();
    const finalized = await finalizeRetoPrizeSpinAtomic(context.supabase, {
      sessionId: session.id,
      participantId: session.participant_id,
      groupCode: session.group_code,
      expectedStateVersion: session.state_version,
      segment,
    });

    if (!finalized.ok) {
      if (finalized.reason === "expired") {
        return participantJson(410, {
          ok: false,
          code: "RETO_SESSION_EXPIRED",
          error: "La sesión de juego venció.",
        });
      }

      return finalized.reason === "unavailable"
        ? retoUnavailable("RETO_SPIN_FINALIZE_FAILED")
        : retoConflict();
    }

    const result = finalized.result;
    const completedState = parsePrincipalPrizeState(result.sessionState);

    if (
      !completedState ||
      completedState.phase !== "completed" ||
      !completedState.level1_passed ||
      !completedState.level2_passed ||
      !completedState.roulette_used ||
      completedState.roulette_result !== result.segment
    ) {
      return retoConflict("RETO_SPIN_RESULT_INVALID");
    }

    const finalizedSession = {
      ...session,
      status: result.sessionStatus,
      state_version: result.stateVersion,
      state: result.sessionState,
      updated_at: result.finishedAt,
      finished_at: result.finishedAt,
    };

    return participantJson(200, {
      ok: true,
      session: publicRetoSession(finalizedSession),
      spin: {
        segment: result.segment,
        is_prize: result.isPrize,
        awarded: result.awarded,
        prize_locked_until: result.prizeLockedUntil,
      },
    });
  } catch {
    console.error("[reto-secure-spin] unexpected failure");
    return retoUnavailable();
  }
}
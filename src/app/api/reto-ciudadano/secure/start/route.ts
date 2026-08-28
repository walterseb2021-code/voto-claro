import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  buildInitialCaminoPrizeState,
  buildInitialPrincipalPrizeState,
  parseCaminoPrizeState,
  parsePrincipalPrizeState,
  type RetoSessionRow,
} from "@/lib/retoSecureGame";
import { startRetoPrizeSessionAuthoritative } from "@/lib/retoPrizeStartEngine";
import {
  parseRetoGameCode,
  publicRetoSession,
  resolveRetoPrizeMutation,
  retoConflict,
  retoUnavailable,
} from "@/lib/retoSecureApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicStartProgress(session: RetoSessionRow) {
  if (session.game_code === "principal") {
    const state = parsePrincipalPrizeState(session.state);
    if (!state) return null;

    return {
      game_code: "principal" as const,
      phase: state.phase,
      level: state.level,
      question_index: state.question_index,
      good: state.good,
      bad: state.bad,
      skipped: state.skipped,
      level1_passed: state.level1_passed,
      level2_passed: state.level2_passed,
      party_id: state.party_id,
      pool_deadline: state.pool_deadline,
    };
  }

  const state = parseCaminoPrizeState(session.state);
  if (!state) return null;

  return {
    game_code: "camino" as const,
    position: state.position,
    turns_left: state.turns_left,
    won: state.won,
  };
}

export async function POST(req: NextRequest) {
  try {
    const prelude = await resolveRetoPrizeMutation(req, ["game_code"]);
    if (!prelude.ok) return prelude.response;

    const gameCode = parseRetoGameCode(prelude.body.game_code);
    if (!gameCode) {
      return participantJson(400, {
        ok: false,
        code: "RETO_GAME_INVALID",
        error: "Juego inválido.",
      });
    }

    const { context } = prelude;

    const initialState =
      gameCode === "principal"
        ? buildInitialPrincipalPrizeState()
        : buildInitialCaminoPrizeState();

    const started = await startRetoPrizeSessionAuthoritative(context.supabase, {
      participantId: context.participant.id,
      groupCode: context.group,
      gameCode,
      initialState,
    });

    if (!started.ok) {
      if (started.reason === "unavailable") {
        return retoUnavailable("RETO_SESSION_START_FAILED");
      }

      if (started.reason === "group_mismatch") {
        return retoConflict("RETO_SESSION_GROUP_MISMATCH");
      }

      if (started.reason === "invalid_state") {
        return retoConflict("RETO_STATE_INVALID");
      }

      return retoConflict();
    }

    const result = started.result;

    if (result.outcome === "locked") {
      return participantJson(423, {
        ok: false,
        code: "RETO_PRINCIPAL_LOCKED",
        error: "Debes esperar antes de iniciar un nuevo intento con premio.",
        locked_until: result.lockedUntil,
      });
    }

    const progress = publicStartProgress(result.session);
    if (!progress) return retoConflict("RETO_STATE_INVALID");

    return participantJson(result.outcome === "created" ? 201 : 200, {
      ok: true,
      resumed: result.outcome === "resumed",
      session: publicRetoSession(result.session),
      progress,
    });
  } catch {
    console.error("[reto-secure-start] unexpected failure");
    return retoUnavailable();
  }
}
import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  isRetoSessionExpired,
  loadActiveRetoSession,
  loadSecureRetoQuestionById,
  parseCaminoPrizeState,
  parsePrincipalPrizeState,
  secureRandomDieRoll,
  selectSecureRetoQuestion,
  toPublicRetoQuestion,
  updateRetoSessionState,
} from "@/lib/retoSecureGame";
import {
  RETO_CAMINO_RULES,
  RETO_LEVEL2_PARTY_ID,
  RETO_PRINCIPAL_RULES,
} from "@/lib/retoGameRules";
import {
  parseRetoGameCode,
  parseRetoStateVersion,
  parseRetoUuid,
  publicRetoSession,
  resolveRetoPrizeMutation,
  retoConflict,
  retoUnavailable,
} from "@/lib/retoSecureApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deadlineAfter(seconds: number, maxDeadline?: string | null) {
  const now = Date.now();
  const requested = now + seconds * 1000;

  if (!maxDeadline) return new Date(requested).toISOString();

  const max = new Date(maxDeadline).getTime();
  return new Date(Math.min(requested, max)).toISOString();
}

function principalPublicProgress(state: ReturnType<typeof parsePrincipalPrizeState>) {
  if (!state) return null;

  return {
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

function caminoPublicProgress(state: ReturnType<typeof parseCaminoPrizeState>) {
  if (!state) return null;

  return {
    position: state.position,
    turns_left: state.turns_left,
    won: state.won,
  };
}

export async function POST(req: NextRequest) {
  try {
    const prelude = await resolveRetoPrizeMutation(req, [
      "game_code",
      "session_id",
      "state_version",
    ]);
    if (!prelude.ok) return prelude.response;

    const gameCode = parseRetoGameCode(prelude.body.game_code);
    const sessionId = parseRetoUuid(prelude.body.session_id);
    const stateVersion = parseRetoStateVersion(prelude.body.state_version);

    if (!gameCode || !sessionId || !stateVersion) {
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
      gameCode
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

    if (gameCode === "principal") {
      const state = parsePrincipalPrizeState(session.state);
      if (!state) return retoConflict("RETO_STATE_INVALID");

      if (state.phase !== "level1" && state.phase !== "level2") {
        return participantJson(409, {
          ok: false,
          code: "RETO_QUESTION_NOT_ALLOWED",
          error: "No corresponde solicitar una pregunta en esta fase.",
        });
      }

      if (
        state.phase === "level2" &&
        state.party_id !== RETO_LEVEL2_PARTY_ID
      ) {
        return retoConflict("RETO_STATE_INVALID");
      }

      const source =
        state.phase === "level1"
          ? "principal_level1"
          : "principal_level2";

      if (state.current_question_id) {
        const current = await loadSecureRetoQuestionById(
          context.supabase,
          source,
          state.current_question_id
        );

        if (!current.ok) {
          return current.reason === "unavailable"
            ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
            : retoConflict("RETO_QUESTION_STATE_INVALID");
        }

        if (!current.question) {
          return retoConflict("RETO_QUESTION_NOT_FOUND");
        }

        return participantJson(200, {
          ok: true,
          resumed_question: true,
          session: publicRetoSession(session),
          progress: principalPublicProgress(state),
          question: toPublicRetoQuestion(current.question),
          question_deadline: state.question_deadline,
        });
      }

      const rules =
        state.phase === "level1"
          ? RETO_PRINCIPAL_RULES.level1
          : RETO_PRINCIPAL_RULES.level2;

      const now = Date.now();
      const existingPoolDeadline = state.pool_deadline
        ? new Date(state.pool_deadline).getTime()
        : null;

      if (
        existingPoolDeadline !== null &&
        (!Number.isFinite(existingPoolDeadline) ||
          existingPoolDeadline <= now)
      ) {
        const passed = state.good >= rules.passScore;

        if (state.phase === "level1" && passed) {
          const nextState = {
            ...state,
            phase: "level2" as const,
            level: 2 as const,
            question_index: 0,
            current_question_id: null,
            question_deadline: null,
            pool_deadline: null,
            good: 0,
            bad: 0,
            skipped: 0,
            party_id: RETO_LEVEL2_PARTY_ID,
            level1_passed: true,
          };

          const updated = await updateRetoSessionState(
            context.supabase,
            session,
            nextState
          );

          if (!updated.ok) {
            return updated.reason === "unavailable"
              ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
              : retoConflict();
          }

          return participantJson(200, {
            ok: true,
            level_finished: true,
            passed: true,
            session: publicRetoSession(updated.session),
            progress: principalPublicProgress(nextState),
          });
        }

        if (state.phase === "level2" && passed) {
          const nextState = {
            ...state,
            phase: "roulette" as const,
            level: 3 as const,
            current_question_id: null,
            question_deadline: null,
            pool_deadline: null,
            level2_passed: true,
          };

          const updated = await updateRetoSessionState(
            context.supabase,
            session,
            nextState
          );

          if (!updated.ok) {
            return updated.reason === "unavailable"
              ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
              : retoConflict();
          }

          return participantJson(200, {
            ok: true,
            level_finished: true,
            passed: true,
            session: publicRetoSession(updated.session),
            progress: principalPublicProgress(nextState),
          });
        }

        const failedState = {
          ...state,
          phase: "failed" as const,
          current_question_id: null,
          question_deadline: null,
          pool_deadline: null,
        };

        const updated = await updateRetoSessionState(
          context.supabase,
          session,
          failedState,
          { status: "failed", finish: true }
        );

        if (!updated.ok) {
          return updated.reason === "unavailable"
            ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
            : retoConflict();
        }

        return participantJson(200, {
          ok: true,
          level_finished: true,
          passed: false,
          session: publicRetoSession(updated.session),
          progress: principalPublicProgress(failedState),
        });
      }

      const selected = await selectSecureRetoQuestion(
        context.supabase,
        source,
        state.answered_question_ids
      );

      if (!selected.ok) {
        return selected.reason === "unavailable"
          ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
          : retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      if (!selected.question) {
        return retoUnavailable("RETO_QUESTION_POOL_EXHAUSTED");
      }

      const poolDeadline =
        state.pool_deadline ??
        new Date(now + rules.poolTotalSec * 1000).toISOString();

      const nextState = {
        ...state,
        pool_deadline: poolDeadline,
        current_question_id: selected.question.id,
        question_deadline: deadlineAfter(
          rules.perQuestionMaxSec,
          poolDeadline
        ),
      };

      const updated = await updateRetoSessionState(
        context.supabase,
        session,
        nextState
      );

      if (!updated.ok) {
        return updated.reason === "unavailable"
          ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
          : retoConflict();
      }

      return participantJson(200, {
        ok: true,
        resumed_question: false,
        session: publicRetoSession(updated.session),
        progress: principalPublicProgress(nextState),
        question: toPublicRetoQuestion(selected.question),
        question_deadline: nextState.question_deadline,
      });
    }

    const state = parseCaminoPrizeState(session.state);
    if (!state) return retoConflict("RETO_STATE_INVALID");

    if (state.won || state.turns_left <= 0) {
      return participantJson(409, {
        ok: false,
        code: "RETO_CAMINO_FINISHED",
        error: "La partida de Camino Ciudadano ya terminó.",
      });
    }

    if (state.current_question_id) {
      if (state.pending_roll === null) {
        return retoConflict("RETO_STATE_INVALID");
      }

      const current = await loadSecureRetoQuestionById(
        context.supabase,
        "camino",
        state.current_question_id
      );

      if (!current.ok) {
        return current.reason === "unavailable"
          ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
          : retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      if (!current.question) {
        return retoConflict("RETO_QUESTION_NOT_FOUND");
      }

      return participantJson(200, {
        ok: true,
        resumed_question: true,
        session: publicRetoSession(session),
        progress: caminoPublicProgress(state),
        roll: state.pending_roll,
        question: toPublicRetoQuestion(current.question),
        question_deadline: state.question_deadline,
      });
    }

    if (state.pending_roll !== null) {
      return retoConflict("RETO_STATE_INVALID");
    }

    const selected = await selectSecureRetoQuestion(
      context.supabase,
      "camino",
      state.answered_question_ids
    );

    if (!selected.ok) {
      return selected.reason === "unavailable"
        ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
        : retoConflict("RETO_QUESTION_STATE_INVALID");
    }

    if (!selected.question) {
      return retoUnavailable("RETO_QUESTION_POOL_EXHAUSTED");
    }

    const roll = secureRandomDieRoll();
    const nextState = {
      ...state,
      pending_roll: roll,
      current_question_id: selected.question.id,
      question_deadline: deadlineAfter(RETO_CAMINO_RULES.perQuestionMaxSec),
    };

    const updated = await updateRetoSessionState(
      context.supabase,
      session,
      nextState
    );

    if (!updated.ok) {
      return updated.reason === "unavailable"
        ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
        : retoConflict();
    }

    return participantJson(200, {
      ok: true,
      resumed_question: false,
      session: publicRetoSession(updated.session),
      progress: caminoPublicProgress(nextState),
      roll,
      question: toPublicRetoQuestion(selected.question),
      question_deadline: nextState.question_deadline,
    });
  } catch {
    console.error("[reto-secure-question] unexpected failure");
    return retoUnavailable();
  }
}

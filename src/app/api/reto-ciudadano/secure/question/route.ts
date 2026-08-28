import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  isRetoSessionExpired,
  loadActiveRetoSession,
  parseCaminoPrizeState,
  parsePrincipalPrizeState,
  secureRandomDieRoll,
} from "@/lib/retoSecureGame";
import {
  generateAndIssueRetoPrizeQuestion,
  loadStoredRetoPrizeQuestion,
  toPublicRetoPrizeQuestion,
} from "@/lib/retoPrizeQuestionEngine";
import { finalizeRetoPrincipalPoolTimeoutAtomic } from "@/lib/retoPrizePoolTimeoutEngine";
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

function sameInstant(left: string | null, right: string | null) {
  if (left === null || right === null) return left === right;

  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  return (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime === rightTime
  );
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
        const current = await loadStoredRetoPrizeQuestion(context.supabase, {
          sessionId: session.id,
          instanceId: state.current_question_id,
          source,
          expectedStateVersion: session.state_version,
        });

        if (!current.ok) {
          return current.reason === "unavailable"
            ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
            : retoConflict("RETO_QUESTION_STATE_INVALID");
        }

        if (
          !current.question ||
          !sameInstant(current.question.expiresAt, state.question_deadline)
        ) {
          return retoConflict("RETO_QUESTION_STATE_INVALID");
        }

        return participantJson(200, {
          ok: true,
          resumed_question: true,
          session: publicRetoSession(session),
          progress: principalPublicProgress(state),
          question: toPublicRetoPrizeQuestion(current.question),
          question_deadline: state.question_deadline,
        });
      }

      const rules =
        state.phase === "level1"
          ? RETO_PRINCIPAL_RULES.level1
          : RETO_PRINCIPAL_RULES.level2;

      if (state.pool_deadline !== null) {
        const finalized = await finalizeRetoPrincipalPoolTimeoutAtomic(
          context.supabase,
          {
            sessionId: session.id,
            participantId: session.participant_id,
            groupCode: session.group_code,
            expectedStateVersion: session.state_version,
          }
        );

        if (finalized.ok) {
          const result = finalized.result;
          const nextState = parsePrincipalPrizeState(result.sessionState);
          const answeredIdsUnchanged =
            nextState !== null &&
            nextState.answered_question_ids.length ===
              state.answered_question_ids.length &&
            nextState.answered_question_ids.every(
              (id, index) => id === state.answered_question_ids[index]
            );

          if (
            !nextState ||
            !answeredIdsUnchanged ||
            nextState.current_question_id !== null ||
            nextState.question_deadline !== null ||
            nextState.pool_deadline !== null
          ) {
            return retoConflict("RETO_QUESTION_STATE_INVALID");
          }

          if (state.phase === "level1") {
            if (result.passed) {
              if (
                result.sessionStatus !== "active" ||
                nextState.phase !== "level2" ||
                nextState.level !== 2 ||
                nextState.question_index !== 0 ||
                nextState.good !== 0 ||
                nextState.bad !== 0 ||
                nextState.skipped !== 0 ||
                nextState.party_id !== RETO_LEVEL2_PARTY_ID ||
                !nextState.level1_passed ||
                nextState.level2_passed
              ) {
                return retoConflict("RETO_QUESTION_STATE_INVALID");
              }
            } else if (
              result.sessionStatus !== "failed" ||
              nextState.phase !== "failed" ||
              nextState.level !== state.level ||
              nextState.question_index !== state.question_index ||
              nextState.good !== state.good ||
              nextState.bad !== state.bad ||
              nextState.skipped !== state.skipped ||
              nextState.party_id !== state.party_id ||
              nextState.level1_passed !== state.level1_passed ||
              nextState.level2_passed !== state.level2_passed
            ) {
              return retoConflict("RETO_QUESTION_STATE_INVALID");
            }
          } else if (result.passed) {
            if (
              result.sessionStatus !== "active" ||
              nextState.phase !== "roulette" ||
              nextState.level !== 3 ||
              nextState.question_index !== state.question_index ||
              nextState.good !== state.good ||
              nextState.bad !== state.bad ||
              nextState.skipped !== state.skipped ||
              nextState.party_id !== state.party_id ||
              !nextState.level1_passed ||
              !nextState.level2_passed
            ) {
              return retoConflict("RETO_QUESTION_STATE_INVALID");
            }
          } else if (
            result.sessionStatus !== "failed" ||
            nextState.phase !== "failed" ||
            nextState.level !== state.level ||
            nextState.question_index !== state.question_index ||
            nextState.good !== state.good ||
            nextState.bad !== state.bad ||
            nextState.skipped !== state.skipped ||
            nextState.party_id !== state.party_id ||
            nextState.level1_passed !== state.level1_passed ||
            nextState.level2_passed !== state.level2_passed
          ) {
            return retoConflict("RETO_QUESTION_STATE_INVALID");
          }

          const finalizedSession = {
            ...session,
            status: result.sessionStatus,
            state_version: result.stateVersion,
            state: result.sessionState,
            finished_at: result.finishedAt,
          };

          return participantJson(200, {
            ok: true,
            level_finished: true,
            passed: result.passed,
            session: publicRetoSession(finalizedSession),
            progress: principalPublicProgress(nextState),
          });
        }

        if (finalized.reason === "expired") {
          return participantJson(410, {
            ok: false,
            code: "RETO_SESSION_EXPIRED",
            error: "La sesión de juego venció.",
          });
        }

        if (finalized.reason !== "not_expired") {
          return finalized.reason === "unavailable"
            ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
            : finalized.reason === "conflict"
              ? retoConflict()
              : retoConflict("RETO_QUESTION_STATE_INVALID");
        }
      }

      const now = Date.now();
      const poolDeadline =
        state.pool_deadline ??
        new Date(now + rules.poolTotalSec * 1000).toISOString();
      const questionDeadline = deadlineAfter(
        rules.perQuestionMaxSec,
        poolDeadline
      );

      const issued = await generateAndIssueRetoPrizeQuestion(
        context.supabase,
        {
          sessionId: session.id,
          participantId: session.participant_id,
          groupCode: session.group_code,
          expectedStateVersion: session.state_version,
          source,
          questionDeadline,
          poolDeadline: state.pool_deadline === null ? poolDeadline : null,
          pendingRoll: null,
        }
      );

      if (!issued.ok) {
        if (issued.reason === "expired") {
          return participantJson(410, {
            ok: false,
            code: "RETO_SESSION_EXPIRED",
            error: "La sesión de juego venció.",
          });
        }

        if (issued.reason === "pool_exhausted") {
          return retoUnavailable("RETO_QUESTION_POOL_EXHAUSTED");
        }

        return issued.reason === "unavailable"
          ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
          : retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      if (
        issued.pendingRoll !== null ||
        !issued.poolDeadline ||
        issued.question.issuedStateVersion !== issued.stateVersion ||
        !sameInstant(issued.question.expiresAt, questionDeadline)
      ) {
        return retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      if (
        state.pool_deadline !== null &&
        !sameInstant(issued.poolDeadline, state.pool_deadline)
      ) {
        return retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      const issuedState = {
        ...state,
        pool_deadline: issued.poolDeadline,
        current_question_id: issued.question.id,
        question_deadline: issued.question.expiresAt,
      };

      return participantJson(200, {
        ok: true,
        resumed_question: false,
        session: publicRetoSession({
          ...session,
          state_version: issued.stateVersion,
        }),
        progress: principalPublicProgress(issuedState),
        question: toPublicRetoPrizeQuestion(issued.question),
        question_deadline: issuedState.question_deadline,
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

      const current = await loadStoredRetoPrizeQuestion(context.supabase, {
        sessionId: session.id,
        instanceId: state.current_question_id,
        source: "camino",
        expectedStateVersion: session.state_version,
      });

      if (!current.ok) {
        return current.reason === "unavailable"
          ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
          : retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      if (
        !current.question ||
        !sameInstant(current.question.expiresAt, state.question_deadline)
      ) {
        return retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      return participantJson(200, {
        ok: true,
        resumed_question: true,
        session: publicRetoSession(session),
        progress: caminoPublicProgress(state),
        roll: state.pending_roll,
        question: toPublicRetoPrizeQuestion(current.question),
        question_deadline: state.question_deadline,
      });
    }

    if (state.pending_roll !== null) {
      return retoConflict("RETO_STATE_INVALID");
    }

    const roll = secureRandomDieRoll();
    const questionDeadline = deadlineAfter(
      RETO_CAMINO_RULES.perQuestionMaxSec
    );

    const issued = await generateAndIssueRetoPrizeQuestion(
      context.supabase,
      {
        sessionId: session.id,
        participantId: session.participant_id,
        groupCode: session.group_code,
        expectedStateVersion: session.state_version,
        source: "camino",
        questionDeadline,
        poolDeadline: null,
        pendingRoll: roll,
      }
    );

    if (!issued.ok) {
      if (issued.reason === "expired") {
        return participantJson(410, {
          ok: false,
          code: "RETO_SESSION_EXPIRED",
          error: "La sesión de juego venció.",
        });
      }

      if (issued.reason === "pool_exhausted") {
        return retoUnavailable("RETO_QUESTION_POOL_EXHAUSTED");
      }

      return issued.reason === "unavailable"
        ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
        : retoConflict("RETO_QUESTION_STATE_INVALID");
    }

    if (
      issued.poolDeadline !== null ||
      issued.pendingRoll !== roll ||
      issued.question.issuedStateVersion !== issued.stateVersion ||
      !sameInstant(issued.question.expiresAt, questionDeadline)
    ) {
      return retoConflict("RETO_QUESTION_STATE_INVALID");
    }

    const issuedState = {
      ...state,
      pending_roll: roll,
      current_question_id: issued.question.id,
      question_deadline: issued.question.expiresAt,
    };

    return participantJson(200, {
      ok: true,
      resumed_question: false,
      session: publicRetoSession({
        ...session,
        state_version: issued.stateVersion,
      }),
      progress: caminoPublicProgress(issuedState),
      roll,
      question: toPublicRetoPrizeQuestion(issued.question),
      question_deadline: issuedState.question_deadline,
    });
  } catch {
    console.error("[reto-secure-question] unexpected failure");
    return retoUnavailable();
  }
}

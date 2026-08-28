import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  isRetoSessionExpired,
  loadActiveRetoSession,
  parseCaminoPrizeState,
  parsePrincipalPrizeState,
} from "@/lib/retoSecureGame";
import { commitRetoPrizeAnswerAtomic } from "@/lib/retoPrizeAnswerEngine";
import {
  RETO_CAMINO_RULES,
  RETO_LEVEL2_PARTY_ID,
  RETO_PRINCIPAL_RULES,
} from "@/lib/retoGameRules";
import {
  parseRetoAnswer,
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


export async function POST(req: NextRequest) {
  try {
    const prelude = await resolveRetoPrizeMutation(req, [
      "game_code",
      "session_id",
      "state_version",
      "question_id",
      "answer",
    ]);
    if (!prelude.ok) return prelude.response;

    const gameCode = parseRetoGameCode(prelude.body.game_code);
    const sessionId = parseRetoUuid(prelude.body.session_id);
    const stateVersion = parseRetoStateVersion(prelude.body.state_version);
    const questionId = parseRetoUuid(prelude.body.question_id);
    const answer = parseRetoAnswer(prelude.body.answer);

    if (
      !gameCode ||
      !sessionId ||
      !stateVersion ||
      !questionId ||
      answer === undefined
    ) {
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
          code: "RETO_ANSWER_NOT_ALLOWED",
          error: "No corresponde responder una pregunta en esta fase.",
        });
      }

      if (
        !state.current_question_id ||
        state.current_question_id !== questionId
      ) {
        return retoConflict("RETO_QUESTION_MISMATCH");
      }

      if (
        state.phase === "level2" &&
        state.party_id !== RETO_LEVEL2_PARTY_ID
      ) {
        return retoConflict("RETO_STATE_INVALID");
      }

      const committed = await commitRetoPrizeAnswerAtomic(
        context.supabase,
        {
          sessionId: session.id,
          participantId: session.participant_id,
          groupCode: session.group_code,
          expectedStateVersion: session.state_version,
          questionInstanceId: questionId,
          answer,
        }
      );

      if (!committed.ok) {
        if (committed.reason === "expired") {
          return participantJson(410, {
            ok: false,
            code: "RETO_SESSION_EXPIRED",
            error: "La sesión de juego venció.",
          });
        }

        if (committed.reason === "unavailable") {
          return retoUnavailable("RETO_SESSION_UPDATE_FAILED");
        }

        return committed.reason === "conflict"
          ? retoConflict()
          : retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      const result = committed.result;
      const nextState = parsePrincipalPrizeState(result.sessionState);

      if (
        !nextState ||
        nextState.current_question_id !== null ||
        nextState.question_deadline !== null ||
        !nextState.answered_question_ids.includes(questionId) ||
        result.sessionStatus === "completed"
      ) {
        return retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      const rules =
        state.phase === "level1"
          ? RETO_PRINCIPAL_RULES.level1
          : RETO_PRINCIPAL_RULES.level2;

      const correct = result.wasCorrect;
      const timedOut = result.answerOutcome === "timed_out";
      const skipped =
        result.answerOutcome === "skipped" || timedOut;
      const wrong = result.answerOutcome === "wrong";

      const expectedGood = state.good + (correct ? 1 : 0);
      const expectedBad = state.bad + (wrong ? 1 : 0);
      const expectedSkipped = state.skipped + (skipped ? 1 : 0);
      const expectedIndex = state.question_index + 1;
      const levelFinished = nextState.phase !== state.phase;
      const passed = levelFinished
        ? expectedGood >= rules.passScore
        : null;

      if (!levelFinished) {
        if (
          result.sessionStatus !== "active" ||
          nextState.level !== state.level ||
          nextState.question_index !== expectedIndex ||
          nextState.good !== expectedGood ||
          nextState.bad !== expectedBad ||
          nextState.skipped !== expectedSkipped ||
          nextState.pool_deadline !== state.pool_deadline
        ) {
          return retoConflict("RETO_QUESTION_STATE_INVALID");
        }
      } else if (state.phase === "level1") {
        if (passed) {
          if (
            result.sessionStatus !== "active" ||
            nextState.phase !== "level2" ||
            nextState.level !== 2 ||
            nextState.question_index !== 0 ||
            nextState.pool_deadline !== null ||
            nextState.good !== 0 ||
            nextState.bad !== 0 ||
            nextState.skipped !== 0 ||
            nextState.party_id !== RETO_LEVEL2_PARTY_ID ||
            !nextState.level1_passed
          ) {
            return retoConflict("RETO_QUESTION_STATE_INVALID");
          }
        } else if (
          result.sessionStatus !== "failed" ||
          nextState.phase !== "failed" ||
          nextState.question_index !== expectedIndex ||
          nextState.pool_deadline !== null ||
          nextState.good !== expectedGood ||
          nextState.bad !== expectedBad ||
          nextState.skipped !== expectedSkipped
        ) {
          return retoConflict("RETO_QUESTION_STATE_INVALID");
        }
      } else if (passed) {
        if (
          result.sessionStatus !== "active" ||
          nextState.phase !== "roulette" ||
          nextState.level !== 3 ||
          nextState.question_index !== expectedIndex ||
          nextState.pool_deadline !== null ||
          nextState.good !== expectedGood ||
          nextState.bad !== expectedBad ||
          nextState.skipped !== expectedSkipped ||
          !nextState.level2_passed
        ) {
          return retoConflict("RETO_QUESTION_STATE_INVALID");
        }
      } else if (
        result.sessionStatus !== "failed" ||
        nextState.phase !== "failed" ||
        nextState.question_index !== expectedIndex ||
        nextState.pool_deadline !== null ||
        nextState.good !== expectedGood ||
        nextState.bad !== expectedBad ||
        nextState.skipped !== expectedSkipped
      ) {
        return retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      const committedSession = {
        ...session,
        status: result.sessionStatus,
        state_version: result.stateVersion,
        state: result.sessionState,
        finished_at: result.finishedAt,
      };

      return participantJson(200, {
        ok: true,
        correct,
        timed_out: timedOut,
        skipped,
        level_finished: levelFinished,
        passed,
        session: publicRetoSession(committedSession),
        progress: {
          phase: nextState.phase,
          level: nextState.level,
          question_index: nextState.question_index,
          good: nextState.good,
          bad: nextState.bad,
          skipped: nextState.skipped,
          level1_passed: nextState.level1_passed,
          level2_passed: nextState.level2_passed,
          party_id: nextState.party_id,
          pool_deadline: nextState.pool_deadline,
        },
      });
    }

    const state = parseCaminoPrizeState(session.state);
    if (!state) return retoConflict("RETO_STATE_INVALID");

    if (
      !state.current_question_id ||
      state.current_question_id !== questionId ||
      state.pending_roll === null
    ) {
      return retoConflict("RETO_QUESTION_MISMATCH");
    }

    const roll = state.pending_roll;
    const committed = await commitRetoPrizeAnswerAtomic(
      context.supabase,
      {
        sessionId: session.id,
        participantId: session.participant_id,
        groupCode: session.group_code,
        expectedStateVersion: session.state_version,
        questionInstanceId: questionId,
        answer,
      }
    );

    if (!committed.ok) {
      if (committed.reason === "expired") {
        return participantJson(410, {
          ok: false,
          code: "RETO_SESSION_EXPIRED",
          error: "La sesión de juego venció.",
        });
      }

      if (committed.reason === "unavailable") {
        return retoUnavailable("RETO_SESSION_UPDATE_FAILED");
      }

      return committed.reason === "conflict"
        ? retoConflict()
        : retoConflict("RETO_QUESTION_STATE_INVALID");
    }

    const result = committed.result;
    const nextState = parseCaminoPrizeState(result.sessionState);

    const correct = result.wasCorrect;
    const timedOut = result.answerOutcome === "timed_out";
    const skipped =
      result.answerOutcome === "skipped" || timedOut;

    const expectedPosition = correct
      ? Math.min(
          state.position + roll,
          RETO_CAMINO_RULES.totalSquares
        )
      : Math.max(state.position - roll, 0);
    const expectedTurns = Math.max(0, state.turns_left - 1);
    const expectedWon =
      expectedPosition === RETO_CAMINO_RULES.totalSquares;
    const gameOver = expectedWon || expectedTurns === 0;
    const expectedStatus = expectedWon
      ? "completed"
      : gameOver
        ? "failed"
        : "active";

    if (
      !nextState ||
      nextState.current_question_id !== null ||
      nextState.question_deadline !== null ||
      nextState.pending_roll !== null ||
      !nextState.answered_question_ids.includes(questionId) ||
      nextState.position !== expectedPosition ||
      nextState.turns_left !== expectedTurns ||
      nextState.won !== expectedWon ||
      result.sessionStatus !== expectedStatus
    ) {
      return retoConflict("RETO_QUESTION_STATE_INVALID");
    }

    const committedSession = {
      ...session,
      status: result.sessionStatus,
      state_version: result.stateVersion,
      state: result.sessionState,
      finished_at: result.finishedAt,
    };

    return participantJson(200, {
      ok: true,
      correct,
      timed_out: timedOut,
      skipped,
      roll,
      position: nextState.position,
      turns_left: nextState.turns_left,
      won: nextState.won,
      game_over: gameOver,
      session: publicRetoSession(committedSession),
    });
  } catch {
    console.error("[reto-secure-answer] unexpected failure");
    return retoUnavailable();
  }
}

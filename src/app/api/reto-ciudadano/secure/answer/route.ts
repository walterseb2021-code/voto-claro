import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  finalizeCaminoWinAtomic,
  isRetoSessionExpired,
  loadActiveRetoSession,
  loadSecureRetoQuestionById,
  parseCaminoPrizeState,
  parsePrincipalPrizeState,
  updateRetoSessionState,
} from "@/lib/retoSecureGame";
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

function expired(value: string | null, now: number) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return !Number.isFinite(time) || time <= now;
}

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

    const now = Date.now();

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

      const source =
        state.phase === "level1"
          ? "principal_level1"
          : "principal_level2";

      const question = await loadSecureRetoQuestionById(
        context.supabase,
        source,
        questionId
      );

      if (!question.ok) {
        return question.reason === "unavailable"
          ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
          : retoConflict("RETO_QUESTION_STATE_INVALID");
      }

      if (!question.question) {
        return retoConflict("RETO_QUESTION_NOT_FOUND");
      }

      const rules =
        state.phase === "level1"
          ? RETO_PRINCIPAL_RULES.level1
          : RETO_PRINCIPAL_RULES.level2;

      const questionTimedOut = expired(state.question_deadline, now);
      const poolTimedOut = expired(state.pool_deadline, now);
      const skipped = answer === null || questionTimedOut || poolTimedOut;
      const correct = !skipped && answer === question.question.answer;
      const wrong = !skipped && !correct;

      const nextGood = state.good + (correct ? 1 : 0);
      const nextBad = state.bad + (wrong ? 1 : 0);
      const nextSkipped = state.skipped + (skipped ? 1 : 0);
      const nextIndex = state.question_index + 1;
      const answeredIds = state.answered_question_ids.includes(questionId)
        ? state.answered_question_ids
        : [...state.answered_question_ids, questionId];

      const levelFinished =
        nextIndex >= rules.totalQuestions || poolTimedOut;
      const passed = levelFinished && nextGood >= rules.passScore;

      let nextState = {
        ...state,
        question_index: nextIndex,
        current_question_id: null,
        question_deadline: null,
        answered_question_ids: answeredIds,
        good: nextGood,
        bad: nextBad,
        skipped: nextSkipped,
      };

      let nextStatus: "active" | "failed" = "active";
      let finish = false;

      if (levelFinished && state.phase === "level1") {
        if (passed) {
          nextState = {
            ...nextState,
            phase: "level2",
            level: 2,
            question_index: 0,
            pool_deadline: null,
            good: 0,
            bad: 0,
            skipped: 0,
            party_id: RETO_LEVEL2_PARTY_ID,
            level1_passed: true,
          };
        } else {
          nextState = {
            ...nextState,
            phase: "failed",
            pool_deadline: null,
          };
          nextStatus = "failed";
          finish = true;
        }
      } else if (levelFinished && state.phase === "level2") {
        if (passed) {
          nextState = {
            ...nextState,
            phase: "roulette",
            level: 3,
            pool_deadline: null,
            level2_passed: true,
          };
        } else {
          nextState = {
            ...nextState,
            phase: "failed",
            pool_deadline: null,
          };
          nextStatus = "failed";
          finish = true;
        }
      }

      const updated = await updateRetoSessionState(
        context.supabase,
        session,
        nextState,
        { status: nextStatus, finish }
      );

      if (!updated.ok) {
        return updated.reason === "unavailable"
          ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
          : retoConflict();
      }

      return participantJson(200, {
        ok: true,
        correct,
        timed_out: questionTimedOut || poolTimedOut,
        skipped,
        level_finished: levelFinished,
        passed: levelFinished ? passed : null,
        session: publicRetoSession(updated.session),
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

    const question = await loadSecureRetoQuestionById(
      context.supabase,
      "camino",
      questionId
    );

    if (!question.ok) {
      return question.reason === "unavailable"
        ? retoUnavailable("RETO_QUESTION_LOOKUP_FAILED")
        : retoConflict("RETO_QUESTION_STATE_INVALID");
    }

    if (!question.question) {
      return retoConflict("RETO_QUESTION_NOT_FOUND");
    }

    const questionTimedOut = expired(state.question_deadline, now);
    const skipped = answer === null || questionTimedOut;
    const correct = !skipped && answer === question.question.answer;
    const roll = state.pending_roll;

    const nextPosition = correct
      ? Math.min(state.position + roll, RETO_CAMINO_RULES.totalSquares)
      : Math.max(state.position - roll, 0);

    const nextTurns = Math.max(0, state.turns_left - 1);
    const won = nextPosition === RETO_CAMINO_RULES.totalSquares;
    const gameOver = won || nextTurns === 0;

    const nextState = {
      ...state,
      position: nextPosition,
      turns_left: nextTurns,
      current_question_id: null,
      question_deadline: null,
      answered_question_ids: state.answered_question_ids.includes(questionId)
        ? state.answered_question_ids
        : [...state.answered_question_ids, questionId],
      pending_roll: null,
      won,
    };

    const updated = won
      ? await finalizeCaminoWinAtomic(
          context.supabase,
          session,
          nextState
        )
      : await updateRetoSessionState(
          context.supabase,
          session,
          nextState,
          gameOver
            ? {
                status: "failed",
                finish: true,
              }
            : undefined
        );

    if (!updated.ok) {
      if (updated.reason === "expired") {
        return participantJson(410, {
          ok: false,
          code: "RETO_SESSION_EXPIRED",
          error: "La sesiÃ³n de juego venciÃ³.",
        });
      }

      return updated.reason === "unavailable"
        ? retoUnavailable("RETO_SESSION_UPDATE_FAILED")
        : retoConflict();
    }

    return participantJson(200, {
      ok: true,
      correct,
      timed_out: questionTimedOut,
      skipped,
      roll,
      position: nextPosition,
      turns_left: nextTurns,
      won,
      game_over: gameOver,
      session: publicRetoSession(updated.session),
    });
  } catch {
    console.error("[reto-secure-answer] unexpected failure");
    return retoUnavailable();
  }
}

import { useState, useCallback, useRef, useEffect } from "react";

import { GameState, GameMode, Question } from "./types";

const TOTAL_SQUARES = 30;
const INITIAL_TURNS = 10;
const QUESTION_TIME_SEC = 10;

type QuestionsResponse = {
  ok?: boolean;
  questions?: Array<{ id?: unknown; q?: unknown }>;
};

type VerifyResponse = {
  ok?: boolean;
  correct?: unknown;
};

function guideSay(text: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("votoclaro:guide", {
      detail: {
        action: "SAY",
        text,
        speak: true,
      },
    })
  );
}

async function verifyPracticeAnswer(
  questionId: string,
  answer: boolean
): Promise<boolean | null> {
  try {
    const res = await fetch("/api/reto-ciudadano/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        question_id: questionId,
        level: 2,
        party_id: "app",
        answer,
      }),
    });

    const data = (await res.json().catch(() => null)) as VerifyResponse | null;

    if (!res.ok || data?.ok !== true || typeof data.correct !== "boolean") {
      return null;
    }

    return data.correct;
  } catch {
    return null;
  }
}

export function useCaminoCiudadano(mode: GameMode, onWin?: () => void) {
  const [state, setState] = useState<GameState>({
    position: 0,
    turnsLeft: INITIAL_TURNS,
    answeredQuestions: [],
    currentRoll: null,
    pendingRoll: null,
    showQuestion: false,
    currentQuestion: null,
    timeLeft: QUESTION_TIME_SEC,
    gameOver: false,
    won: false,
    locked: false,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const answeringRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchRandomQuestion = useCallback(async (excludeIds: string[]) => {
    try {
      const res = await fetch(
        "/api/reto-ciudadano/questions?level=2&partyId=app",
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      const payload = (await res.json().catch(() => null)) as
        | QuestionsResponse
        | null;

      if (!res.ok || payload?.ok !== true || !Array.isArray(payload.questions)) {
        return null;
      }

      const questions: Question[] = payload.questions.flatMap((item) => {
        const id = String(item?.id ?? "").trim();
        const question = String(item?.q ?? "").trim();
        if (!id || !question) return [];
        return [{ id, question }];
      });

      if (questions.length === 0) return null;

      const available = questions.filter(
        (question) => !excludeIds.includes(question.id)
      );

      const pool = available.length > 0 ? available : questions;
      const index = Math.floor(Math.random() * pool.length);
      return pool[index] ?? null;
    } catch {
      console.error("[camino-practice] question fetch failed");
      return null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.timeLeft > 1) {
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        }

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const roll = prev.pendingRoll ?? 0;
        const newPosition = Math.max(prev.position - roll, 0);
        const newTurnsLeft = Math.max(0, prev.turnsLeft - 1);
        const noTurnsLeft = newTurnsLeft <= 0;

        return {
          ...prev,
          position: newPosition,
          turnsLeft: newTurnsLeft,
          answeredQuestions: prev.currentQuestion
            ? [...prev.answeredQuestions, prev.currentQuestion.id]
            : prev.answeredQuestions,
          pendingRoll: null,
          showQuestion: false,
          currentQuestion: null,
          timeLeft: QUESTION_TIME_SEC,
          gameOver: noTurnsLeft,
          won: false,
        };
      });
    }, 1000);
  }, []);

  const handleAnswer = useCallback(
    async (answer: boolean) => {
      if (mode === "con_premio") {
        console.error(
          "[camino-practice] prize mode must use the secure server flow"
        );
        return;
      }

      if (
        !state.currentQuestion ||
        state.pendingRoll === null ||
        answeringRef.current
      ) {
        return;
      }

      answeringRef.current = true;

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;

      const generation = generationRef.current;
      const questionId = state.currentQuestion.id;
      const roll = state.pendingRoll;

      const correct = await verifyPracticeAnswer(questionId, answer);

      if (generation !== generationRef.current) {
        answeringRef.current = false;
        return;
      }

      if (correct === null) {
        console.error("[camino-practice] answer verification failed");
        setState((prev) => ({
          ...prev,
          timeLeft: QUESTION_TIME_SEC,
        }));
        answeringRef.current = false;
        startTimer();
        return;
      }

      const newPosition = correct
        ? Math.min(state.position + roll, TOTAL_SQUARES)
        : Math.max(state.position - roll, 0);

      const newTurnsLeft = Math.max(0, state.turnsLeft - 1);
      const reachedEnd = newPosition === TOTAL_SQUARES;
      const noTurnsLeft = newTurnsLeft === 0;
      const gameFinished = reachedEnd || noTurnsLeft;

      setState((prev) => ({
        ...prev,
        position: newPosition,
        turnsLeft: newTurnsLeft,
        answeredQuestions: prev.answeredQuestions.includes(questionId)
          ? prev.answeredQuestions
          : [...prev.answeredQuestions, questionId],
        pendingRoll: null,
        showQuestion: false,
        currentQuestion: null,
        timeLeft: QUESTION_TIME_SEC,
        gameOver: gameFinished && !reachedEnd,
        won: reachedEnd,
      }));

      answeringRef.current = false;

      if (reachedEnd) {
        guideSay(
          "Felicitaciones. Llegaste a la meta de Camino Ciudadano en modo practica."
        );
      } else if (noTurnsLeft) {
        guideSay(
          "Se acabaron los turnos. No llegaste a la meta en esta partida. Puedes reiniciar el juego e intentarlo nuevamente."
        );
      }

    },
    [mode, onWin, startTimer, state]
  );

  const rollDice = useCallback(async () => {
    if (mode === "con_premio") {
      console.error(
        "[camino-practice] prize mode must use the secure server flow"
      );
      return;
    }

    if (
      state.gameOver ||
      state.won ||
      state.showQuestion ||
      state.turnsLeft === 0 ||
      answeringRef.current
    ) {
      return;
    }

    const generation = generationRef.current;
    const roll = Math.floor(Math.random() * 6) + 1;
    const question = await fetchRandomQuestion(state.answeredQuestions);

    if (generation !== generationRef.current) return;

    if (!question) {
      setState((prev) => ({ ...prev, gameOver: true }));
      return;
    }

    setState((prev) => ({
      ...prev,
      currentRoll: roll,
      pendingRoll: roll,
      showQuestion: true,
      currentQuestion: question,
      timeLeft: QUESTION_TIME_SEC,
    }));

    guideSay(question.question);
    startTimer();
  }, [mode, state, fetchRandomQuestion, startTimer]);

  const resetGame = useCallback(() => {
    generationRef.current += 1;
    answeringRef.current = false;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setState({
      position: 0,
      turnsLeft: INITIAL_TURNS,
      answeredQuestions: [],
      currentRoll: null,
      pendingRoll: null,
      showQuestion: false,
      currentQuestion: null,
      timeLeft: QUESTION_TIME_SEC,
      gameOver: false,
      won: false,
      locked: false,
    });
  }, []);

  return {
    state,
    rollDice,
    handleAnswer,
    resetGame,
  };
}
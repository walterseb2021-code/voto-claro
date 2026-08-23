"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  answerSecureRetoQuestion,
  requestSecureRetoQuestion,
  RetoSecureClientError,
  startSecureReto,
  type RetoCaminoAnswerResponse,
  type RetoCaminoProgress,
  type RetoCaminoQuestionResponse,
  type RetoSecureQuestion,
  type RetoSecureSession,
} from "@/lib/retoSecureClient";

import {
  type CaminoCiudadanoRuntimeState,
} from "../components/CaminoCiudadano";
import Dice3D from "../components/CaminoCiudadano/Dice3D";
import GameBoard from "../components/CaminoCiudadano/GameBoard";
import QuestionPopup from "../components/CaminoCiudadano/QuestionPopup";

const QUESTION_SECONDS = 10;
const TOTAL_SQUARES = 30;

type Props = {
  onStateChange?: (state: CaminoCiudadanoRuntimeState) => void;
};

function isCaminoProgress(
  value: RetoCaminoProgress | { phase: string }
): value is RetoCaminoProgress {
  return "position" in value && "turns_left" in value && "won" in value;
}

function isIntegerInRange(value: unknown, min: number, max: number) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function asCaminoQuestion(
  value: Awaited<ReturnType<typeof requestSecureRetoQuestion>>
): RetoCaminoQuestionResponse {
  const candidate = value as Partial<RetoCaminoQuestionResponse>;

  if (
    !candidate.progress ||
    !isIntegerInRange(candidate.progress.position, 0, TOTAL_SQUARES) ||
    !isIntegerInRange(candidate.progress.turns_left, 0, 10) ||
    typeof candidate.progress.won !== "boolean" ||
    typeof candidate.resumed_question !== "boolean" ||
    !isIntegerInRange(candidate.roll, 1, 6) ||
    !candidate.question ||
    typeof candidate.question.id !== "string" ||
    !candidate.question.id.trim() ||
    typeof candidate.question.q !== "string" ||
    !candidate.question.q.trim() ||
    !(
      candidate.question_deadline === null ||
      typeof candidate.question_deadline === "string"
    )
  ) {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolvió una pregunta de Camino incompatible."
    );
  }

  return candidate as RetoCaminoQuestionResponse;
}

function asCaminoAnswer(
  value: Awaited<ReturnType<typeof answerSecureRetoQuestion>>
): RetoCaminoAnswerResponse {
  const candidate = value as Partial<RetoCaminoAnswerResponse>;

  if (
    typeof candidate.correct !== "boolean" ||
    typeof candidate.timed_out !== "boolean" ||
    typeof candidate.skipped !== "boolean" ||
    !isIntegerInRange(candidate.roll, 1, 6) ||
    !isIntegerInRange(candidate.position, 0, TOTAL_SQUARES) ||
    !isIntegerInRange(candidate.turns_left, 0, 10) ||
    typeof candidate.won !== "boolean" ||
    typeof candidate.game_over !== "boolean"
  ) {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolvió un avance de Camino incompatible."
    );
  }

  return candidate as RetoCaminoAnswerResponse;
}

function errorMessage(error: unknown) {
  if (error instanceof RetoSecureClientError) {
    if (error.code === "RETO_PRIZES_DISABLED") {
      return "La modalidad con premio continúa deshabilitada por seguridad.";
    }

    if (error.code === "RETO_SESSION_EXPIRED") {
      return "La sesión segura de Camino venció. Vuelve a iniciar cuando el sistema lo permita.";
    }

    if (error.code === "RETO_STATE_CONFLICT") {
      return "El estado seguro de Camino cambió. Recarga la página antes de continuar.";
    }

    return error.message;
  }

  return "No se pudo continuar con Camino Ciudadano seguro.";
}

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

function secondsUntil(deadline: string | null) {
  if (!deadline) return 0;

  const target = new Date(deadline).getTime();
  if (!Number.isFinite(target)) return 0;

  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

export default function CaminoSecurePrizeFlow({ onStateChange }: Props) {
  const [session, setSession] = useState<RetoSecureSession | null>(null);
  const [progress, setProgress] = useState<RetoCaminoProgress | null>(null);
  const [question, setQuestion] = useState<RetoSecureQuestion | null>(null);
  const [questionDeadline, setQuestionDeadline] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [currentRoll, setCurrentRoll] = useState<number | null>(null);
  const [diceRolling, setDiceRolling] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answeringRef = useRef(false);

  useEffect(() => {
    return () => {
      answeringRef.current = false;
    };
  }, []);

  useEffect(() => {
    onStateChange?.({
      position: progress?.position ?? 0,
      turnsLeft: progress?.turns_left ?? 10,
      currentRoll,
      showQuestion,
      hasQuestion: !!question,
      timeLeft,
      gameOver,
      won: progress?.won ?? false,
    });
  }, [
    currentRoll,
    gameOver,
    onStateChange,
    progress,
    question,
    showQuestion,
    timeLeft,
  ]);

  const begin = useCallback(async () => {
    if (loading || answering) return;

    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await startSecureReto("camino");

      if (!isCaminoProgress(response.progress)) {
        throw new RetoSecureClientError(
          502,
          "RETO_CLIENT_RESPONSE_INVALID",
          "El servidor devolvió un progreso de Camino incompatible."
        );
      }

      setSession(response.session);
      setProgress(response.progress);
      setCurrentRoll(null);
      setDiceRolling(false);
      setQuestion(null);
      setQuestionDeadline(null);
      setShowQuestion(false);
      setTimeLeft(QUESTION_SECONDS);

      const finished =
        response.progress.won ||
        response.progress.turns_left === 0 ||
        response.session.status === "failed" ||
        response.session.status === "completed";

      setGameOver(finished && !response.progress.won);

      if (response.progress.won) {
        setFeedback(
          "Esta partida segura ya llegó a la meta y quedó finalizada por el servidor."
        );
      } else if (finished) {
        setFeedback("Esta partida segura ya está finalizada.");
      } else {
        setFeedback(
          response.resumed
            ? "Partida segura reanudada. Pulsa el dado para continuar."
            : "Partida segura iniciada. Pulsa el dado para solicitar el siguiente turno."
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [answering, loading]);

  const requestTurn = useCallback(async () => {
    if (
      !session ||
      !progress ||
      loading ||
      answering ||
      answeringRef.current ||
      showQuestion ||
      progress.won ||
      gameOver ||
      progress.turns_left <= 0
    ) {
      return;
    }

    setLoading(true);
    setDiceRolling(true);
    setError(null);
    setFeedback(null);

    try {
      const raw = await requestSecureRetoQuestion(session);
      const response = asCaminoQuestion(raw);

      setSession(response.session);
      setProgress(response.progress);
      setCurrentRoll(response.roll);
      setQuestion(response.question);
      setQuestionDeadline(response.question_deadline);
      setTimeLeft(secondsUntil(response.question_deadline));
      setShowQuestion(true);

      guideSay(response.question.q);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDiceRolling(false);
      setLoading(false);
    }
  }, [
    answering,
    gameOver,
    loading,
    progress,
    session,
    showQuestion,
  ]);

  const submitAnswer = useCallback(
    async (answer: boolean | null) => {
      if (
        !session ||
        !question ||
        !showQuestion ||
        loading ||
        answeringRef.current
      ) {
        return;
      }

      answeringRef.current = true;
      setAnswering(true);
      setError(null);
      setFeedback(null);

      try {
        const raw = await answerSecureRetoQuestion(
          session,
          question.id,
          answer
        );
        const response = asCaminoAnswer(raw);

        const nextProgress: RetoCaminoProgress = {
          game_code: "camino",
          position: response.position,
          turns_left: response.turns_left,
          won: response.won,
        };

        setSession(response.session);
        setProgress(nextProgress);
        setCurrentRoll(response.roll);
        setQuestion(null);
        setQuestionDeadline(null);
        setShowQuestion(false);
        setTimeLeft(QUESTION_SECONDS);
        setGameOver(response.game_over && !response.won);

        if (response.won) {
          setFeedback(
            "Llegaste a la meta. El servidor finalizó y registró de forma atómica esta clasificación de Camino Ciudadano."
          );
          guideSay(
            "Felicitaciones. Llegaste a la meta de Camino Ciudadano y el servidor registró de forma segura tu clasificación."
          );
        } else if (response.game_over) {
          setFeedback(
            "La partida terminó porque se agotaron los turnos antes de llegar a la meta."
          );
          guideSay(
            "Se acabaron los turnos. La partida segura de Camino Ciudadano terminó sin llegar a la meta."
          );
        } else if (response.skipped || response.timed_out) {
          setFeedback(
            `Tiempo agotado. El servidor aplicó el resultado y tu posición segura es ${response.position}.`
          );
        } else {
          setFeedback(
            response.correct
              ? `Respuesta correcta. El servidor avanzó tu ficha hasta la casilla ${response.position}.`
              : `Respuesta incorrecta. El servidor ajustó tu ficha hasta la casilla ${response.position}.`
          );
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        answeringRef.current = false;
        setAnswering(false);
      }
    },
    [loading, question, session, showQuestion]
  );

  useEffect(() => {
    if (!question || !questionDeadline || !showQuestion || answeringRef.current) {
      return;
    }

    const updateCountdown = () => {
      setTimeLeft(secondsUntil(questionDeadline));
    };

    updateCountdown();

    const interval = window.setInterval(updateCountdown, 250);
    const deadlineMs = new Date(questionDeadline).getTime();
    const delay = Number.isFinite(deadlineMs)
      ? Math.max(0, deadlineMs - Date.now() + 75)
      : 0;

    const timeout = window.setTimeout(() => {
      void submitAnswer(null);
    }, delay);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [question, questionDeadline, showQuestion, submitAnswer]);

  const won = progress?.won ?? false;
  const turnsLeft = progress?.turns_left ?? 10;
  const position = progress?.position ?? 0;
  const canRoll =
    !!session &&
    !loading &&
    !answering &&
    !showQuestion &&
    !won &&
    !gameOver &&
    turnsLeft > 0;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">
            Camino Ciudadano con premio — flujo seguro
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            El servidor decide el dado, la pregunta, el avance, los turnos y la
            llegada a la meta.
          </p>
        </div>

        <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-800">
          Casilla {position}/{TOTAL_SQUARES} · Turnos {turnsLeft}
        </span>
      </div>

      {!session ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void begin()}
            disabled={loading}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Validando partida segura..."
              : "Comenzar o reanudar Camino seguro"}
          </button>
          <p className="mt-2 text-xs text-slate-600">
            La partida solo existe cuando el servidor acepta este inicio.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <GameBoard position={position} totalSquares={TOTAL_SQUARES}>
            <Dice3D
              rolling={diceRolling}
              result={currentRoll}
              onClick={() => void requestTurn()}
              disabled={!canRoll}
            />
          </GameBoard>

          <div className="mt-3 text-center text-xs font-semibold text-slate-600">
            {loading
              ? "Solicitando turno seguro..."
              : canRoll
              ? "Pulsa el dado. El número será decidido por el servidor."
              : showQuestion
              ? "Responde la pregunta dentro del tiempo indicado."
              : won
              ? "Partida ganada y finalizada por el servidor."
              : gameOver
              ? "Partida finalizada."
              : "Esperando estado seguro."}
          </div>
        </div>
      )}

      <QuestionPopup
        question={
          question
            ? {
                id: question.id,
                question: question.q,
              }
            : null
        }
        timeLeft={timeLeft}
        onAnswer={(answer) => void submitAnswer(answer)}
        visible={showQuestion}
        diceResult={currentRoll}
      />

      {won ? (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          🎉 Meta alcanzada. La clasificación fue finalizada por el servidor.
        </div>
      ) : null}

      {gameOver ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          La partida segura terminó sin llegar a la meta.
        </div>
      ) : null}

      {feedback ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">
          {feedback}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}

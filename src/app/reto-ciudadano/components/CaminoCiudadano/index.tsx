// src/app/reto-ciudadano/components/CaminoCiudadano/index.tsx
"use client";

import { useEffect } from "react";
import { useCaminoCiudadano } from "./useCaminoCiudadano";
import GameBoard from "./GameBoard";
import Dice3D from "./Dice3D";
import QuestionPopup from "./QuestionPopup";
import { GameMode } from "./types";

export type CaminoCiudadanoRuntimeState = {
  position: number;
  turnsLeft: number;
  currentRoll: number | null;
  showQuestion: boolean;
  hasQuestion: boolean;
  timeLeft: number;
  gameOver: boolean;
  won: boolean;
};

interface CaminoCiudadanoProps {
  mode: GameMode;
  onGameWin?: () => void;
  onStateChange?: (state: CaminoCiudadanoRuntimeState) => void;
}

export default function CaminoCiudadano({
  mode,
  onGameWin,
  onStateChange,
}: CaminoCiudadanoProps) {
  const { state, rollDice, handleAnswer, resetGame } = useCaminoCiudadano(
    mode,
    onGameWin
  );

  useEffect(() => {
    onStateChange?.({
      position: state.position,
      turnsLeft: state.turnsLeft,
      currentRoll: state.currentRoll,
      showQuestion: state.showQuestion,
      hasQuestion: !!state.currentQuestion,
      timeLeft: state.timeLeft,
      gameOver: state.gameOver,
      won: state.won,
    });
  }, [
    onStateChange,
    state.position,
    state.turnsLeft,
    state.currentRoll,
    state.showQuestion,
    state.currentQuestion,
    state.timeLeft,
    state.gameOver,
    state.won,
  ]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-slate-800">
          Camino Ciudadano
        </h2>
        <div className="flex gap-4">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Turnos:</span> {state.turnsLeft}
          </div>
          <div className="text-sm text-slate-600">
            <span className="font-medium">Casilla:</span> {state.position}/30
          </div>
        </div>
      </div>

      <GameBoard position={state.position} totalSquares={30}>
        <Dice3D
          rolling={state.currentRoll !== null && !state.showQuestion}
          result={state.currentRoll}
          onClick={rollDice}
          disabled={state.gameOver || state.won || state.showQuestion}
        />
      </GameBoard>

      <div className="mt-6 text-center">
        {(state.gameOver || state.won || state.turnsLeft === 0) && (
          <div
            className={`mb-3 text-sm ${
              state.won ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {state.gameOver && "❌ Has perdido. Reinicia para intentarlo."}
            {state.won && "🎉 ¡Felicidades! Has llegado a la meta."}
            {!state.gameOver &&
              !state.won &&
              state.turnsLeft === 0 &&
              "⏰ Sin turnos. Reinicia el juego."}
          </div>
        )}

        <button
          onClick={resetGame}
          className="px-5 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
        >
          Reiniciar juego
        </button>
      </div>

      <QuestionPopup
        question={state.currentQuestion}
        timeLeft={state.timeLeft}
        onAnswer={handleAnswer}
        visible={state.showQuestion}
        diceResult={state.currentRoll}
      />
    </div>
  );
}
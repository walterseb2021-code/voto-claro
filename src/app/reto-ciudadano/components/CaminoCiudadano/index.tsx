// src/app/reto-ciudadano/components/CaminoCiudadano/index.tsx
"use client";

import { useEffect, useMemo } from "react";
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
     const confetti = useMemo(() => {
  return Array.from({ length: 34 }, (_, i) => ({
    id: i,
    left: Math.round(Math.random() * 100),
    delay: Math.random() * 0.35,
    duration: 1.9 + Math.random() * 0.8,
    size: 6 + Math.round(Math.random() * 8),
    rot: Math.round(Math.random() * 360),
  }));
}, []);
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
  {state.won && (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {confetti.map((p) => (
        <span
          key={p.id}
          className="vc-camino-confetti"
          style={{
            left: `${p.left}vw`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  )}

  {(state.gameOver || state.won || state.turnsLeft === 0) && (
    <div
      className={`mb-4 rounded-2xl border px-4 py-4 text-sm font-semibold shadow-sm ${
        state.won
          ? "vc-camino-win-card border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {state.gameOver && "❌ Has perdido. Reinicia para intentarlo."}

      {state.won && (
        <div>
          <div className="text-lg font-extrabold">
            🎉 ¡Felicidades! Has llegado a la meta.
          </div>
          <div className="mt-1 text-xs font-semibold">
            {mode === "con_premio"
              ? "Si tus datos están completos, quedarás registrado para la selección trimestral de Camino Ciudadano."
              : "Completaste Camino Ciudadano en modo práctica."}
          </div>
        </div>
      )}

      {!state.gameOver && !state.won && state.turnsLeft === 0 && (
        "⏰ Sin turnos. Reinicia el juego."
      )}
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
        <style>{`
  .vc-camino-win-card {
    animation: vcCaminoWinPop 850ms ease-out both, vcCaminoWinGlow 2.8s ease-in-out infinite;
  }

  @keyframes vcCaminoWinPop {
    0% {
      opacity: 0;
      transform: translateY(12px) scale(0.94);
    }
    65% {
      opacity: 1;
      transform: translateY(-2px) scale(1.02);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes vcCaminoWinGlow {
    0%, 100% {
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.18);
    }
    50% {
      box-shadow: 0 10px 32px rgba(16, 185, 129, 0.38);
    }
  }

  .vc-camino-confetti {
    position: absolute;
    top: -18px;
    border-radius: 4px;
    background: rgba(16, 185, 129, 0.95);
    box-shadow: 0 6px 18px rgba(0,0,0,.15);
    animation-name: vcCaminoConfettiFall;
    animation-timing-function: ease-in;
    animation-fill-mode: both;
  }

  .vc-camino-confetti:nth-child(3n) {
    background: rgba(59, 130, 246, 0.95);
  }

  .vc-camino-confetti:nth-child(4n) {
    background: rgba(245, 158, 11, 0.95);
  }

  .vc-camino-confetti:nth-child(5n) {
    background: rgba(168, 85, 247, 0.95);
  }

  @keyframes vcCaminoConfettiFall {
    0% {
      transform: translateY(-10px) rotate(0deg);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    100% {
      transform: translateY(105vh) rotate(420deg);
      opacity: 0;
    }
  }
`}</style>

    </div>
  );
}
// src/app/reto-ciudadano/components/CaminoCiudadano/index.tsx
'use client';
import { useCaminoCiudadano } from './useCaminoCiudadano';
import GameBoard from './GameBoard';
import Dice3D from './Dice3D';
import QuestionPopup from './QuestionPopup';
import { GameMode } from './types';

interface CaminoCiudadanoProps {
  mode: GameMode;
  onGameWin?: () => void;
}

export default function CaminoCiudadano({ mode, onGameWin }: CaminoCiudadanoProps) {
  const { state, rollDice, handleAnswer, resetGame } = useCaminoCiudadano(mode, onGameWin);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
          <span className="text-indigo-500">🏆</span> Camino Ciudadano
        </h2>
        <div className="flex gap-4 text-sm text-slate-600">
          <div className="bg-slate-100 px-3 py-1 rounded-full shadow-sm">
            <span className="font-medium">🎲 Turnos:</span> {state.turnsLeft}
          </div>
          <div className="bg-slate-100 px-3 py-1 rounded-full shadow-sm">
            <span className="font-medium">📍 Casilla:</span> {state.position}/30
          </div>
        </div>
      </div>

      <GameBoard position={state.position} totalSquares={30} />

      <div className="flex justify-center mt-8">
        <Dice3D
          rolling={state.currentRoll !== null && !state.showQuestion}
          result={state.currentRoll}
          onClick={rollDice}
          disabled={state.gameOver || state.won || state.showQuestion}
        />
      </div>

      <div className="mt-6 text-center">
        {(state.gameOver || state.won || state.turnsLeft === 0) && (
          <div className={`mb-3 text-sm font-medium ${state.won ? 'text-emerald-600' : 'text-rose-600'}`}>
            {state.gameOver && '❌ Has perdido. Reinicia para intentarlo.'}
            {state.won && '🎉 ¡Felicidades! Has llegado a la meta.'}
            {!state.gameOver && !state.won && state.turnsLeft === 0 && '⏰ Sin turnos. Reinicia el juego.'}
          </div>
        )}
        <button
          onClick={resetGame}
          className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium shadow-md hover:bg-indigo-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
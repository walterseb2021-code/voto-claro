'use client';
import { useCaminoCiudadano } from './useCaminoCiudadano';
import GameBoard3D from './GameBoard3D';
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
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl p-6 text-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span className="text-amber-400">🏛️</span> Camino Ciudadano
        </h2>
        <div className="flex gap-4 text-sm bg-slate-700/50 px-3 py-1 rounded-full">
          <span>🎲 Turnos: {state.turnsLeft}</span>
          <span>📍 Casilla: {state.position}/30</span>
        </div>
      </div>

      {/* Tablero 3D */}
      <div className="my-4">
        <GameBoard3D position={state.position} totalSquares={30} />
      </div>

      {/* Dado 3D */}
      <div className="flex justify-center my-4">
        <Dice3D
          rolling={state.currentRoll !== null && !state.showQuestion}
          result={state.currentRoll}
          onClick={rollDice}
          disabled={state.gameOver || state.won || state.showQuestion}
        />
      </div>

      {/* Botones y mensajes */}
      <div className="text-center mt-4">
        {(state.gameOver || state.won || state.turnsLeft === 0) && (
          <div className={`mb-3 text-sm font-medium ${state.won ? 'text-green-400' : 'text-rose-400'}`}>
            {state.gameOver && '❌ Has perdido. Reinicia para intentarlo.'}
            {state.won && '🎉 ¡Felicidades! Has llegado a la meta.'}
            {!state.gameOver && !state.won && state.turnsLeft === 0 && '⏰ Sin turnos. Reinicia el juego.'}
          </div>
        )}
        <button
          onClick={resetGame}
          className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium shadow-lg transition"
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
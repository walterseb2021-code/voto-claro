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
    <div className="relative bg-gradient-to-br from-amber-50 to-yellow-100 p-6 rounded-3xl border-4 border-amber-800 shadow-2xl">
      {/* Fondo decorativo sutil */}
      <div className="absolute inset-0 bg-[url('/images/board-texture.png')] bg-repeat opacity-5 rounded-3xl pointer-events-none" />
      
      <div className="relative z-10">
        {/* Cabecera con estilo Monopoly */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-extrabold text-amber-900 drop-shadow-md">
            🏆 Camino Ciudadano
          </h3>
          <div className="flex gap-3">
            <div className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-amber-600 shadow">
              <span className="text-sm font-bold">🎲 Turnos: {state.turnsLeft}</span>
            </div>
            <div className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-amber-600 shadow">
              <span className="text-sm font-bold">📍 Casilla: {state.position}/30</span>
            </div>
          </div>
        </div>

        {/* Tablero */}
        <GameBoard position={state.position} totalSquares={30} />

        {/* Dado */}
        <div className="flex justify-center mt-6">
          <Dice3D
            rolling={state.currentRoll !== null && state.showQuestion === false}
            result={state.currentRoll}
            onClick={rollDice}
            disabled={state.gameOver || state.won || state.showQuestion}
          />
        </div>

        {/* Mensajes y botón de reinicio */}
        <div className="mt-4 text-center text-sm text-slate-600">
          {state.gameOver && (
            <div className="text-red-600 font-bold mb-2">¡Has perdido! Reinicia para intentarlo.</div>
          )}
          {state.won && (
            <div className="text-green-600 font-bold animate-pulse mb-2">¡Ganaste! Llegaste a la meta.</div>
          )}
          {!state.gameOver && !state.won && state.turnsLeft === 0 && (
            <div className="text-red-600 font-bold mb-2">¡Sin turnos! Reinicia para intentarlo.</div>
          )}

          <button
            onClick={resetGame}
            className="mt-2 px-4 py-2 bg-amber-700 text-white rounded-xl text-sm font-bold hover:bg-amber-800 transition shadow-md"
          >
            Reiniciar juego
          </button>
        </div>

        {/* Modal de pregunta */}
        <QuestionPopup
          question={state.currentQuestion}
          timeLeft={state.timeLeft}
          onAnswer={handleAnswer}
          visible={state.showQuestion}
          diceResult={state.currentRoll}
        />
      </div>
    </div>
  );
}
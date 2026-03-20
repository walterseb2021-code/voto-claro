// src/app/reto-ciudadano/components/CaminoCiudadano/index.tsx
'use client';
import { useState, useEffect } from 'react';
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
    <div className="bg-gradient-to-b from-green-50 to-white p-4 rounded-2xl border-4 border-red-600 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-slate-900">Camino Ciudadano</h3>
        <div className="flex gap-2">
          <div className="bg-white px-3 py-1 rounded-full border border-red-600">
            <span className="text-sm font-bold">Turnos: {state.turnsLeft}</span>
          </div>
          <div className="bg-white px-3 py-1 rounded-full border border-red-600">
            <span className="text-sm font-bold">Casilla: {state.position}/30</span>
          </div>
        </div>
      </div>

      <GameBoard position={state.position} totalSquares={30} />

      <div className="flex justify-center mt-6">
        <Dice3D
          rolling={state.currentRoll !== null && state.showQuestion === false}
          result={state.currentRoll}
          onClick={rollDice}
          disabled={state.gameOver || state.won || state.showQuestion}
        />
      </div>

      <div className="mt-4 text-center text-sm text-slate-600">
        {state.gameOver && (
          <div className="text-red-600 font-bold">¡Has perdido! Reinicia para intentarlo.</div>
        )}
        {state.won && (
          <div className="text-green-600 font-bold animate-pulse">¡Ganaste! Llegaste a la meta.</div>
        )}
        {!state.gameOver && !state.won && state.turnsLeft === 0 && (
          <div className="text-red-600 font-bold">¡Sin turnos! Reinicia.</div>
        )}
        {!state.gameOver && !state.won && state.turnsLeft > 0 && (
          <button
            onClick={resetGame}
            className="mt-2 px-4 py-2 bg-slate-200 rounded-xl text-sm font-bold hover:bg-slate-300"
          >
            Reiniciar juego
          </button>
        )}
      </div>

      <QuestionPopup
        question={state.currentQuestion}
        timeLeft={state.timeLeft}
        onAnswer={handleAnswer}
        visible={state.showQuestion}
      />
    </div>
  );
}

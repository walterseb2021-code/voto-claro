// src/app/reto-ciudadano/components/CaminoCiudadano/QuestionPopup.tsx
'use client';
import { Question } from './types';

interface QuestionPopupProps {
  question: Question | null;
  timeLeft: number;
  onAnswer: (correct: boolean) => void;
  visible: boolean;
  diceResult?: number | null;
}

export default function QuestionPopup({ question, timeLeft, onAnswer, visible, diceResult }: QuestionPopupProps) {
  if (!visible || !question) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-indigo-100 max-w-md w-full p-6 transform transition-all scale-100 animate-fade-in">
        <div className="text-center">
          {diceResult && (
            <div className="inline-block bg-indigo-100 text-indigo-800 rounded-full px-4 py-1 text-sm font-semibold mb-3">
              🎲 Número: {diceResult}
            </div>
          )}
          <div className="text-sm text-slate-500 mb-2">
            ⏱️ Tiempo restante: <span className="font-mono font-bold">{timeLeft}s</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 leading-relaxed">{question.question}</h3>
        </div>

        <div className="flex justify-center gap-6 mt-8">
          <button
            onClick={() => onAnswer(question.answer === true)}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium shadow-md hover:bg-emerald-700 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            Sí
          </button>
          <button
            onClick={() => onAnswer(question.answer === false)}
            className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-medium shadow-md hover:bg-rose-700 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
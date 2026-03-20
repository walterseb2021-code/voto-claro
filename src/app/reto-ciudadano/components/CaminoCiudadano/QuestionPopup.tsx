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

  const correctAnswer = question.answer;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-white to-amber-50 rounded-2xl border-4 border-amber-600 max-w-md w-full p-6 shadow-2xl transform transition-all">
        <div className="text-center">
          {diceResult && (
            <div className="inline-block bg-amber-100 rounded-full px-4 py-1 mb-3 text-amber-800 font-bold">
              🎲 Número: {diceResult}
            </div>
          )}
          <div className="text-sm font-mono text-slate-500 bg-slate-100 inline-block px-3 py-1 rounded-full">
            ⏱️ Tiempo: {timeLeft}s
          </div>
          <div className="mt-4 text-xl font-bold text-slate-900 leading-relaxed">{question.question}</div>
        </div>

        <div className="flex justify-center gap-6 mt-8">
          <button
            onClick={() => onAnswer(correctAnswer === true)}
            className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold text-lg shadow-md hover:bg-green-700 transition transform hover:scale-105"
          >
            Sí ✅
          </button>
          <button
            onClick={() => onAnswer(correctAnswer === false)}
            className="px-8 py-3 bg-red-600 text-white rounded-xl font-bold text-lg shadow-md hover:bg-red-700 transition transform hover:scale-105"
          >
            No ❌
          </button>
        </div>
      </div>
    </div>
  );
}
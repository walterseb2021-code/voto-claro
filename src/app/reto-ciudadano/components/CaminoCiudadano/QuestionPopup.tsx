// src/app/reto-ciudadano/components/CaminoCiudadano/QuestionPopup.tsx
'use client';
import { useEffect } from 'react';
import { Question } from './types';

interface QuestionPopupProps {
  question: Question | null;
  timeLeft: number;
  onAnswer: (correct: boolean) => void;
  visible: boolean;
}

export default function QuestionPopup({ question, timeLeft, onAnswer, visible }: QuestionPopupProps) {
  if (!visible || !question) return null;

  const correctAnswer = question.answer;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border-4 border-red-600 max-w-md w-full p-6 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-sm font-mono text-slate-500">Tiempo restante: {timeLeft}s</div>
          <div className="mt-2 text-xl font-bold text-slate-900">{question.question}</div>
        </div>

        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => onAnswer(correctAnswer === true)}
            className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition"
          >
            Sí
          </button>
          <button
            onClick={() => onAnswer(correctAnswer === false)}
            className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}

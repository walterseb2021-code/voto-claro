"use client";

import { Question } from "./types";

interface QuestionPopupProps {
  question: Question | null;
  timeLeft: number;
  onAnswer: (answer: boolean) => void;
  visible: boolean;
  diceResult?: number | null;
}

export default function QuestionPopup({
  question,
  timeLeft,
  onAnswer,
  visible,
  diceResult,
}: QuestionPopupProps) {
  if (!visible || !question) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
        <div className="text-center">
          {diceResult && (
            <div className="inline-block bg-slate-100 rounded-full px-3 py-1 text-sm text-slate-600 mb-3">
              Dado: {diceResult}
            </div>
          )}
          <div className="text-sm text-slate-500 mb-2">
            Tiempo restante:{" "}
            <span className="font-mono font-bold">{timeLeft}s</span>
          </div>
          <p className="text-lg font-medium text-slate-800 leading-relaxed">
            {question.question}
          </p>
        </div>

        <div className="flex justify-center gap-4 mt-6">
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition"
          >
            Si
          </button>
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="px-6 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
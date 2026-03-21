// src/app/reto-ciudadano/components/CaminoCiudadano/Dice3D.tsx
'use client';
import { useState, useEffect } from 'react';

interface Dice3DProps {
  rolling: boolean;
  result: number | null;
  onClick: () => void;
  disabled: boolean;
}

const dicePoints: Record<number, string> = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
};

export default function Dice3D({ rolling, result, onClick, disabled }: Dice3DProps) {
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (rolling) {
      setSpinning(true);
      const timer = setTimeout(() => setSpinning(false), 400);
      return () => clearTimeout(timer);
    }
  }, [rolling]);

  const display = result !== null ? dicePoints[result] : '?';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-20 h-20 bg-white rounded-xl shadow-md border-2 border-slate-300
        flex items-center justify-center text-4xl font-mono text-slate-700
        transition-all duration-200
        ${spinning ? 'scale-110 rotate-12' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-lg cursor-pointer'}
      `}
    >
      {display}
    </button>
  );
}
// src/app/reto-ciudadano/components/CaminoCiudadano/Dice3D.tsx
'use client';
import { useState, useEffect } from 'react';

interface Dice3DProps {
  rolling: boolean;
  result: number | null;
  onClick: () => void;
  disabled: boolean;
}

const diceFaces: Record<number, string> = {
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

  const display = result !== null ? diceFaces[result] : '?';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative w-24 h-24 bg-gradient-to-br from-slate-50 to-slate-200 rounded-2xl shadow-xl
        flex items-center justify-center text-5xl font-bold text-slate-700
        transition-all duration-200
        ${spinning ? 'animate-spin-slow' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105 hover:shadow-2xl cursor-pointer'}
      `}
      style={{
        boxShadow: '0 12px 24px -8px rgba(0,0,0,0.2)',
        transformStyle: 'preserve-3d',
      }}
    >
      {display}
    </button>
  );
}
// src/app/reto-ciudadano/components/CaminoCiudadano/Dice3D.tsx
'use client';
import { useState, useEffect } from 'react';

interface Dice3DProps {
  rolling: boolean;
  result: number | null;
  onClick: () => void;
  disabled: boolean;
}

export default function Dice3D({ rolling, result, onClick, disabled }: Dice3DProps) {
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    if (rolling) {
      setIsSpinning(true);
      const timer = setTimeout(() => setIsSpinning(false), 500);
      return () => clearTimeout(timer);
    }
  }, [rolling]);

  // Mapeo de números a puntos para el dado (opcional)
  const dotsMap: Record<number, string> = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅',
  };

  const display = result !== null ? (dotsMap[result] || result.toString()) : '?';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-24 h-24 bg-white rounded-2xl shadow-2xl border-4 border-red-600
        flex items-center justify-center text-5xl font-black text-slate-900
        transition-all duration-200
        ${isSpinning ? 'animate-spin-slow scale-110' : 'hover:scale-105'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{ boxShadow: '0 10px 20px rgba(0,0,0,0.2)' }}
    >
      {display}
    </button>
  );
}
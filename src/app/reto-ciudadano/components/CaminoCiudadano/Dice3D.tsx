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
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (rolling) {
      setIsRolling(true);
      const timer = setTimeout(() => setIsRolling(false), 600);
      return () => clearTimeout(timer);
    }
  }, [rolling]);

  const getFace = () => {
    if (result === null) return '?';
    return result;
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || rolling}
      className={`
        w-20 h-20 bg-white rounded-xl shadow-xl border-2 border-red-600
        flex items-center justify-center text-3xl font-black text-slate-900
        transition-transform duration-150 hover:scale-105 active:scale-95
        ${isRolling ? 'animate-spin' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {getFace()}
    </button>
  );
}

// src/app/reto-ciudadano/components/CaminoCiudadano/Dice3D.tsx
'use client';
import { useState, useEffect } from 'react';

interface Dice3DProps {
  rolling: boolean;      // si se está animando (aún no usado realmente)
  result: number | null;
  onClick: () => void;
  disabled: boolean;
}

export default function Dice3D({ rolling, result, onClick, disabled }: Dice3DProps) {
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    if (rolling) {
      setSpin(true);
      const timer = setTimeout(() => setSpin(false), 400);
      return () => clearTimeout(timer);
    }
  }, [rolling]);

  const getFace = () => {
    if (result !== null) return result;
    return '?';
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-20 h-20 bg-white rounded-xl shadow-xl border-2 border-red-600
        flex items-center justify-center text-3xl font-black text-slate-900
        transition-all duration-200
        ${spin ? 'scale-110 rotate-12' : 'scale-100 rotate-0'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
      `}
    >
      {getFace()}
    </button>
  );
}
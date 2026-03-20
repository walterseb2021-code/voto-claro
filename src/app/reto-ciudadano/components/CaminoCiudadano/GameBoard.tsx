// src/app/reto-ciudadano/components/CaminoCiudadano/GameBoard.tsx
'use client';

interface GameBoardProps {
  position: number;
  totalSquares: number;
}

// Iconos minimalistas (emoji en gris suave)
const getIcon = (num: number): string => {
  if (num === 1) return '🏁';
  if (num === 30) return '🏆';
  if (num % 5 === 0) return '🏛️';
  if (num % 3 === 0) return '🗳️';
  if (num % 2 === 0) return '📊';
  return '✨';
};

// Colores suaves y profesionales
const getColor = (num: number): string => {
  if (num === 1) return 'bg-slate-100';
  if (num === 30) return 'bg-indigo-100';
  if (num % 5 === 0) return 'bg-blue-50';
  if (num % 3 === 0) return 'bg-emerald-50';
  if (num % 2 === 0) return 'bg-amber-50';
  return 'bg-white';
};

export default function GameBoard({ position, totalSquares }: GameBoardProps) {
  const squares = Array.from({ length: totalSquares }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-6 gap-2 p-4 bg-white/60 rounded-2xl shadow-inner border border-slate-200">
      {squares.map((num) => {
        const isCurrent = position === num;
        const bgColor = getColor(num);
        const icon = getIcon(num);

        return (
          <div
            key={num}
            className={`
              relative aspect-square rounded-xl flex flex-col items-center justify-center
              ${bgColor} border border-slate-200 shadow-sm transition-all duration-200
              ${isCurrent ? 'ring-2 ring-indigo-400 ring-offset-2 scale-105 shadow-md' : 'hover:shadow-md hover:scale-95'}
            `}
          >
            <span className="text-sm font-medium text-slate-600">{num}</span>
            <span className="text-xl mt-1 opacity-70">{icon}</span>
            {isCurrent && (
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-indigo-500 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-sm">
                👤
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
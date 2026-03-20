// src/app/reto-ciudadano/components/CaminoCiudadano/GameBoard.tsx
'use client';

interface GameBoardProps {
  position: number;
  totalSquares: number;
}

export default function GameBoard({ position, totalSquares }: GameBoardProps) {
  const squares = Array.from({ length: totalSquares }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-6 gap-2 p-4 bg-green-100 rounded-xl border-2 border-red-600">
      {squares.map((num) => (
        <div
          key={num}
          className={`
            relative aspect-square rounded-lg flex items-center justify-center text-sm font-bold
            ${position === num ? 'bg-yellow-400 border-4 border-red-500 scale-105 shadow-lg' : 'bg-white border'}
            transition-all duration-300
          `}
        >
          {num}
          {position === num && (
            <div className="absolute -top-3 -right-3 w-6 h-6 bg-green-600 rounded-full border-2 border-white animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
}

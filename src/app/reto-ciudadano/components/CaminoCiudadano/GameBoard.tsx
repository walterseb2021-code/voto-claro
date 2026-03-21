// src/app/reto-ciudadano/components/CaminoCiudadano/GameBoard.tsx
'use client';

interface GameBoardProps {
  position: number;
  totalSquares: number;
}

export default function GameBoard({ position, totalSquares }: GameBoardProps) {
  const squares = Array.from({ length: totalSquares }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-6 gap-2 p-4 bg-white rounded-xl shadow-md border border-slate-200">
      {squares.map((num) => {
        const isCurrent = position === num;
        return (
          <div
            key={num}
            className={`
              relative aspect-square rounded-lg flex items-center justify-center text-sm font-medium
              ${isCurrent ? 'bg-indigo-100 ring-2 ring-indigo-500 shadow-md' : 'bg-slate-50 hover:bg-slate-100'}
              border border-slate-200 transition-all duration-200
            `}
          >
            <span className="text-slate-700">{num}</span>
            {isCurrent && (
              <div className="absolute -top-2 -right-2 w-5 h-5 bg-indigo-500 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-sm">
                ●
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
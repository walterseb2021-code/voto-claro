// src/app/reto-ciudadano/components/CaminoCiudadano/GameBoard.tsx
'use client';

interface GameBoardProps {
  position: number;
  totalSquares: number;
}

// Íconos temáticos para cada tipo de casilla (puedes cambiarlos según prefieras)
const getSquareIcon = (num: number): string => {
  if (num === 1) return '🏁'; // Salida
  if (num === 30) return '🏆'; // Meta
  if (num % 5 === 0) return '🏛️'; // Instituciones
  if (num % 3 === 0) return '🗳️'; // Voto
  if (num % 2 === 0) return '📊'; // Datos
  return '⭐'; // Genérico
};

// Colores de fondo según el tipo de casilla
const getSquareColor = (num: number): string => {
  if (num === 1) return 'bg-yellow-200';
  if (num === 30) return 'bg-purple-200';
  if (num % 5 === 0) return 'bg-blue-200';
  if (num % 3 === 0) return 'bg-green-200';
  if (num % 2 === 0) return 'bg-orange-200';
  return 'bg-gray-100';
};

export default function GameBoard({ position, totalSquares }: GameBoardProps) {
  const squares = Array.from({ length: totalSquares }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-6 gap-2 p-4 bg-amber-100 rounded-xl border-4 border-amber-800 shadow-inner">
      {squares.map((num) => {
        const isCurrent = position === num;
        const bgColor = getSquareColor(num);
        const icon = getSquareIcon(num);

        return (
          <div
            key={num}
            className={`
              relative aspect-square rounded-lg flex flex-col items-center justify-center text-center
              ${bgColor} border-2 border-amber-700 shadow-md transition-all duration-300
              ${isCurrent ? 'ring-4 ring-yellow-500 scale-105 shadow-xl' : ''}
            `}
          >
            <span className="text-lg font-bold text-gray-800">{num}</span>
            <span className="text-2xl mt-1">{icon}</span>
            {isCurrent && (
              <div className="absolute -top-3 -right-3 w-8 h-8 bg-green-600 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold animate-pulse">
                🧑
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
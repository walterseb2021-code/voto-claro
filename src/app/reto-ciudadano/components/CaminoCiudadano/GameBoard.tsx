// src/app/reto-ciudadano/components/CaminoCiudadano/GameBoard.tsx
'use client';
import { ReactNode } from 'react';

interface GameBoardProps {
  position: number;
  totalSquares: number;
  children?: ReactNode;
}

// Definimos las coordenadas (fila, columna) para cada casilla según la espiral descrita.
// Grilla de 7x7 (filas 0-6, columnas 0-6)
const squarePositions: Record<number, { row: number; col: number; segment: string }> = {
  1:  { row: 0, col: 0, segment: 'A' }, // inicio
  2:  { row: 0, col: 1, segment: 'A' },
  3:  { row: 0, col: 2, segment: 'A' },
  4:  { row: 0, col: 3, segment: 'A' },
  5:  { row: 0, col: 4, segment: 'A' },
  6:  { row: 1, col: 4, segment: 'B' },
  7:  { row: 2, col: 4, segment: 'B' },
  8:  { row: 3, col: 4, segment: 'B' },
  9:  { row: 4, col: 4, segment: 'B' },
  10: { row: 5, col: 4, segment: 'B' },
  11: { row: 5, col: 3, segment: 'C' },
  12: { row: 5, col: 2, segment: 'C' },
  13: { row: 5, col: 1, segment: 'C' },
  14: { row: 5, col: 0, segment: 'C' }, // esquina inferior izquierda
  15: { row: 4, col: 0, segment: 'D' },
  16: { row: 3, col: 0, segment: 'D' },
  17: { row: 2, col: 0, segment: 'D' },
  18: { row: 1, col: 0, segment: 'D' }, // debajo del inicio
  19: { row: 1, col: 1, segment: 'E' },
  20: { row: 1, col: 2, segment: 'E' },
  21: { row: 1, col: 3, segment: 'E' }, // debajo del 4 y al lado del 6
  22: { row: 2, col: 3, segment: 'F' }, // ajuste vertical (desde el 22 hacia abajo)
  23: { row: 3, col: 3, segment: 'F' },
  24: { row: 4, col: 3, segment: 'F' },
  25: { row: 4, col: 2, segment: 'G' },
  26: { row: 4, col: 1, segment: 'G' }, // encima del 11 y al costado del 9
  27: { row: 3, col: 1, segment: 'H' },
  28: { row: 2, col: 1, segment: 'H' },
  29: { row: 2, col: 2, segment: 'I' }, // encima del 14 y al lado del 16
  30: { row: 1, col: 2, segment: 'J' }, // fin (ajustado para que termine cerca del centro)
};

// Segmentos con colores profesionales
const segmentColors: Record<string, string> = {
  A: 'bg-slate-100 hover:bg-slate-200',
  B: 'bg-blue-50 hover:bg-blue-100',
  C: 'bg-emerald-50 hover:bg-emerald-100',
  D: 'bg-amber-50 hover:bg-amber-100',
  E: 'bg-indigo-50 hover:bg-indigo-100',
  F: 'bg-rose-50 hover:bg-rose-100',
  G: 'bg-purple-50 hover:bg-purple-100',
  H: 'bg-cyan-50 hover:bg-cyan-100',
  I: 'bg-lime-50 hover:bg-lime-100',
  J: 'bg-orange-50 hover:bg-orange-100',
};

export default function GameBoard({ position, totalSquares, children }: GameBoardProps) {
  const rows = 6;   // usamos filas 0..5 (porque la última casilla está en fila 1, col 2)
  const cols = 5;   // columnas 0..4

  // Crear una matriz vacía 6x5
  const cells: (null | { num: number; segment: string })[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(null)
  );

  // Llenar la matriz con las posiciones definidas
  for (let num = 1; num <= totalSquares; num++) {
    const pos = squarePositions[num];
    if (pos) {
      cells[pos.row][pos.col] = { num, segment: pos.segment };
    }
  }

  return (
    <div className="relative w-full bg-white rounded-xl shadow-md border border-slate-200 p-4">
      <div
        className="grid gap-2"
        style={{
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          aspectRatio: `${cols} / ${rows}`,
        }}
      >
        {cells.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            if (!cell) {
              return <div key={`${rowIdx}-${colIdx}`} className="p-1" />;
            }
            const { num, segment } = cell;
            const isCurrent = position === num;
            const baseColor = segmentColors[segment] || 'bg-slate-50';

            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={`
                  flex items-center justify-center text-sm font-medium rounded-lg transition-all
                  ${baseColor} border border-slate-300
                  ${isCurrent ? 'ring-2 ring-indigo-500 shadow-md bg-indigo-50' : ''}
                `}
                style={{ aspectRatio: '1 / 1' }}
              >
                <span className={isCurrent ? 'font-bold text-indigo-700' : 'text-slate-700'}>
                  {num}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Área central para el dado */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">{children}</div>
      </div>
    </div>
  );
}
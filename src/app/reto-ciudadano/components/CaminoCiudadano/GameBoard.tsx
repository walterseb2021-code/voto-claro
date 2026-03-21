// src/app/reto-ciudadano/components/CaminoCiudadano/GameBoard.tsx
'use client';
import { ReactNode } from 'react';

interface GameBoardProps {
  position: number;
  totalSquares: number;
  children?: ReactNode; // para colocar el dado en el centro
}

// Mapeo de número de casilla a coordenadas (fila, columna) en una grilla 9x7
const squarePositions: Record<number, { row: number; col: number; segment: string }> = {
  // Fila superior (horizontal) – segmento A
  1: { row: 0, col: 0, segment: 'A' },
  2: { row: 0, col: 1, segment: 'A' },
  3: { row: 0, col: 2, segment: 'A' },
  4: { row: 0, col: 3, segment: 'A' },
  5: { row: 0, col: 4, segment: 'A' },

  // Columna derecha (vertical) – segmento B
  6: { row: 1, col: 4, segment: 'B' },
  7: { row: 2, col: 4, segment: 'B' },
  8: { row: 3, col: 4, segment: 'B' },
  9: { row: 4, col: 4, segment: 'B' },
  10: { row: 5, col: 4, segment: 'B' },
  11: { row: 6, col: 4, segment: 'B' },
  12: { row: 7, col: 4, segment: 'B' },
  13: { row: 8, col: 4, segment: 'B' },

  // Fila inferior (horizontal izquierda) – segmento C
  14: { row: 8, col: 3, segment: 'C' },
  15: { row: 8, col: 2, segment: 'C' },
  16: { row: 8, col: 1, segment: 'C' },
  17: { row: 8, col: 0, segment: 'C' },
  18: { row: 7, col: 0, segment: 'C' },

  // Columna izquierda (vertical ascendente) – segmento D
  19: { row: 6, col: 0, segment: 'D' },
  20: { row: 5, col: 0, segment: 'D' },
  21: { row: 4, col: 0, segment: 'D' },
  22: { row: 3, col: 0, segment: 'D' },
  23: { row: 2, col: 0, segment: 'D' },
  24: { row: 1, col: 0, segment: 'D' },

  // Fila interior derecha – segmento E
  25: { row: 1, col: 1, segment: 'E' },
  26: { row: 1, col: 2, segment: 'E' },
  27: { row: 1, col: 3, segment: 'E' },
  28: { row: 1, col: 4, segment: 'E' },
  29: { row: 1, col: 5, segment: 'E' },
  30: { row: 1, col: 6, segment: 'E' },
};

// Colores por segmento (profesionales, tonos sobrios)
const segmentColors: Record<string, string> = {
  A: 'bg-slate-100 hover:bg-slate-200',
  B: 'bg-blue-50 hover:bg-blue-100',
  C: 'bg-emerald-50 hover:bg-emerald-100',
  D: 'bg-amber-50 hover:bg-amber-100',
  E: 'bg-indigo-50 hover:bg-indigo-100',
};

export default function GameBoard({ position, totalSquares, children }: GameBoardProps) {
  // Generar todas las celdas vacías para la grilla 9x7 (filas 0-8, columnas 0-6)
  const rows = 9;
  const cols = 7;

  // Crear una matriz de celdas vacías
  const cells = Array.from({ length: rows }, () => Array(cols).fill(null));

  // Colocar cada casilla en su celda
  for (let num = 1; num <= totalSquares; num++) {
    const pos = squarePositions[num];
    if (pos) {
      cells[pos.row][pos.col] = { num, segment: pos.segment };
    }
  }

  return (
    <div className="relative w-full bg-white rounded-xl shadow-md border border-slate-200 p-4">
      {/* Grilla contenedora */}
      <div
        className="grid"
        style={{
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          aspectRatio: `${cols} / ${rows}`,
        }}
      >
        {cells.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            if (!cell) {
              // Celda vacía
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

      {/* Área central para el dado (posicionamiento absoluto) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">{children}</div>
      </div>
    </div>
  );
}
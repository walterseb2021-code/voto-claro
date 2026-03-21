// src/app/reto-ciudadano/components/CaminoCiudadano/GameBoard.tsx
'use client';
import { ReactNode } from 'react';

interface GameBoardProps {
  position: number;
  totalSquares: number;
  children?: ReactNode;
}

type Cell = {
  type: 'number' | 'special';
  label: string;      // texto a mostrar (número como string, o 'INICIO', 'FIN', 'DADO')
  num?: number;       // solo para type='number', guarda el número
  segment?: string;   // opcional para colorear por tramos
};

// Espiral exacta según descripción: 6x6, numeración 1-30 con inicio y fin, centro 2x2 para dado
// Usamos una matriz de 6x6 (filas 0..5, columnas 0..5)
const buildGrid = (): Cell[][] => {
  // Inicializar todas las celdas como vacías (null)
  const grid: (Cell | null)[][] = Array.from({ length: 6 }, () => Array(6).fill(null));

  // ---- Primera vuelta (exterior) ----
  // Fila superior (fila 0): INICIO + 1..5
  grid[0][0] = { type: 'special', label: 'INICIO' };
  grid[0][1] = { type: 'number', label: '1', num: 1, segment: 'A' };
  grid[0][2] = { type: 'number', label: '2', num: 2, segment: 'A' };
  grid[0][3] = { type: 'number', label: '3', num: 3, segment: 'A' };
  grid[0][4] = { type: 'number', label: '4', num: 4, segment: 'A' };
  grid[0][5] = { type: 'number', label: '5', num: 5, segment: 'A' };

  // Columna derecha (columna 5): 6..10
  grid[1][5] = { type: 'number', label: '6', num: 6, segment: 'B' };
  grid[2][5] = { type: 'number', label: '7', num: 7, segment: 'B' };
  grid[3][5] = { type: 'number', label: '8', num: 8, segment: 'B' };
  grid[4][5] = { type: 'number', label: '9', num: 9, segment: 'B' };
  grid[5][5] = { type: 'number', label: '10', num: 10, segment: 'B' };

  // Fila inferior (fila 5): 11..15 (de derecha a izquierda)
  grid[5][4] = { type: 'number', label: '11', num: 11, segment: 'C' };
  grid[5][3] = { type: 'number', label: '12', num: 12, segment: 'C' };
  grid[5][2] = { type: 'number', label: '13', num: 13, segment: 'C' };
  grid[5][1] = { type: 'number', label: '14', num: 14, segment: 'C' };
  grid[5][0] = { type: 'number', label: '15', num: 15, segment: 'C' };

  // Columna izquierda (columna 0): 16..19 (de abajo hacia arriba)
  grid[4][0] = { type: 'number', label: '16', num: 16, segment: 'D' };
  grid[3][0] = { type: 'number', label: '17', num: 17, segment: 'D' };
  grid[2][0] = { type: 'number', label: '18', num: 18, segment: 'D' };
  grid[1][0] = { type: 'number', label: '19', num: 19, segment: 'D' };

  // ---- Segunda vuelta (interior) ----
  // Fila superior interior (fila 1, columnas 1..4)
  grid[1][1] = { type: 'number', label: '20', num: 20, segment: 'E' };
  grid[1][2] = { type: 'number', label: '21', num: 21, segment: 'E' };
  grid[1][3] = { type: 'number', label: '22', num: 22, segment: 'E' };
  grid[1][4] = { type: 'number', label: '23', num: 23, segment: 'E' };

  // Columna derecha interior (columna 4, filas 2..4)
  grid[2][4] = { type: 'number', label: '24', num: 24, segment: 'F' };
  grid[3][4] = { type: 'number', label: '25', num: 25, segment: 'F' };
  grid[4][4] = { type: 'number', label: '26', num: 26, segment: 'F' };

  // Fila inferior interior (fila 4, columnas 3..1) (de derecha a izquierda)
  grid[4][3] = { type: 'number', label: '27', num: 27, segment: 'G' };
  grid[4][2] = { type: 'number', label: '28', num: 28, segment: 'G' };
  grid[4][1] = { type: 'number', label: '29', num: 29, segment: 'G' };

  // Columna izquierda interior (columna 1, fila 3) – la celda adyacente al centro
  // Esta es la celda FIN (30)
  grid[3][1] = { type: 'special', label: 'FIN', num: 30, segment: 'H' };

  // ---- Centro: bloque 2x2 para el dado ----
  // Dejamos estas celdas como null; en el renderizado se mostrará el dado flotante (children)
  // Las posiciones centrales son: filas 2-3, columnas 2-3
  // ya están vacías (null)

  // Aseguramos que ninguna otra celda quede nula (rellenar con objeto vacío para render)
  // Pero lo manejaremos en el render: si es null, pintamos espacio vacío.
  return grid as Cell[][];
};

// Mapear segmentos a colores (profesionales)
const segmentColors: Record<string, string> = {
  A: 'bg-slate-100 hover:bg-slate-200',
  B: 'bg-blue-50 hover:bg-blue-100',
  C: 'bg-emerald-50 hover:bg-emerald-100',
  D: 'bg-amber-50 hover:bg-amber-100',
  E: 'bg-indigo-50 hover:bg-indigo-100',
  F: 'bg-rose-50 hover:bg-rose-100',
  G: 'bg-purple-50 hover:bg-purple-100',
  H: 'bg-orange-50 hover:bg-orange-100',
};

export default function GameBoard({ position, totalSquares, children }: GameBoardProps) {
  const grid = buildGrid();

  // Filas y columnas fijas 6x6
  const rows = 6;
  const cols = 6;

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
        {grid.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            if (!cell) {
              // Celda vacía (parte del centro 2x2)
              return <div key={`${rowIdx}-${colIdx}`} className="p-1" />;
            }

            const isCurrent = cell.type === 'number' && cell.num === position;
            const baseColor =
              cell.type === 'number' && cell.segment
                ? segmentColors[cell.segment] || 'bg-slate-50'
                : 'bg-white';

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
                <span
                  className={
                    isCurrent
                      ? 'font-bold text-indigo-700'
                      : cell.type === 'special'
                      ? 'text-xs font-semibold text-slate-600'
                      : 'text-slate-700'
                  }
                >
                  {cell.label}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Área central para el dado (sobre el bloque 2x2 vacío) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">{children}</div>
      </div>
    </div>
  );
}
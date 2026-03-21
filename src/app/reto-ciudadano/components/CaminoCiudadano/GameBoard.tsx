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
  label: string;      // texto a mostrar (número como string, o 'INICIO', 'FIN')
  num?: number;       // solo para type='number', guarda el número
};

// Espiral exacta según la tabla proporcionada (6x6)
const buildGrid = (): (Cell | null)[][] => {
  // Inicializar todas las celdas como null (vacías)
  const grid: (Cell | null)[][] = Array.from({ length: 6 }, () => Array(6).fill(null));

  // Fila 0 (superior)
  grid[0][0] = { type: 'special', label: 'INICIO' };
  grid[0][1] = { type: 'number', label: '1', num: 1 };
  grid[0][2] = { type: 'number', label: '2', num: 2 };
  grid[0][3] = { type: 'number', label: '3', num: 3 };
  grid[0][4] = { type: 'number', label: '4', num: 4 };
  grid[0][5] = { type: 'number', label: '5', num: 5 };

  // Fila 1
  grid[1][0] = { type: 'number', label: '19', num: 19 };
  grid[1][1] = { type: 'number', label: '20', num: 20 };
  grid[1][2] = { type: 'number', label: '21', num: 21 };
  grid[1][3] = { type: 'number', label: '22', num: 22 };
  grid[1][4] = { type: 'number', label: '23', num: 23 };
  grid[1][5] = { type: 'number', label: '6', num: 6 };

  // Fila 2
  grid[2][0] = { type: 'number', label: '18', num: 18 };
  grid[2][1] = { type: 'special', label: 'FIN' }; // FIN
  // centro 2x2: grid[2][2], grid[2][3] quedarán null (DADO)
  grid[2][2] = null;
  grid[2][3] = null;
  grid[2][4] = { type: 'number', label: '24', num: 24 };
  grid[2][5] = { type: 'number', label: '7', num: 7 };

  // Fila 3
  grid[3][0] = { type: 'number', label: '17', num: 17 };
  grid[3][1] = { type: 'number', label: '30', num: 30 };
  grid[3][2] = null; // centro
  grid[3][3] = null; // centro
  grid[3][4] = { type: 'number', label: '25', num: 25 };
  grid[3][5] = { type: 'number', label: '8', num: 8 };

  // Fila 4
  grid[4][0] = { type: 'number', label: '16', num: 16 };
  grid[4][1] = { type: 'number', label: '29', num: 29 };
  grid[4][2] = { type: 'number', label: '28', num: 28 };
  grid[4][3] = { type: 'number', label: '27', num: 27 };
  grid[4][4] = { type: 'number', label: '26', num: 26 };
  grid[4][5] = { type: 'number', label: '9', num: 9 };

  // Fila 5 (inferior)
  grid[5][0] = { type: 'number', label: '15', num: 15 };
  grid[5][1] = { type: 'number', label: '14', num: 14 };
  grid[5][2] = { type: 'number', label: '13', num: 13 };
  grid[5][3] = { type: 'number', label: '12', num: 12 };
  grid[5][4] = { type: 'number', label: '11', num: 11 };
  grid[5][5] = { type: 'number', label: '10', num: 10 };

  return grid;
};

export default function GameBoard({ position, totalSquares, children }: GameBoardProps) {
  const grid = buildGrid();

  return (
    <div className="relative w-full bg-white rounded-xl shadow-md border border-slate-200 p-4">
      <div
        className="grid gap-2"
        style={{
          gridTemplateRows: 'repeat(6, minmax(0, 1fr))',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          aspectRatio: '6 / 6',
        }}
      >
        {grid.map((row, rowIdx) =>
          row.map((cell, colIdx) => {
            if (!cell) {
              // Celda vacía (parte del centro 2x2)
              return <div key={`${rowIdx}-${colIdx}`} className="p-1" />;
            }

            const isCurrent = cell.type === 'number' && cell.num === position;
            const isSpecial = cell.type === 'special';

            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={`
                  flex items-center justify-center text-sm font-medium rounded-lg transition-all
                  border border-slate-300
                  ${isCurrent ? 'ring-2 ring-indigo-500 shadow-md bg-indigo-50' : 'bg-white'}
                  ${isSpecial ? 'text-xs font-semibold text-slate-600' : ''}
                `}
                style={{ aspectRatio: '1 / 1' }}
              >
                <span className={isCurrent ? 'font-bold text-indigo-700' : 'text-slate-700'}>
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
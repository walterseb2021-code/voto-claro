// src/app/reto-ciudadano/components/CaminoCiudadano/types.ts
export type GameMode = 'sin_premio' | 'con_premio';

export type Question = {
  id: string;
  question: string;
  answer: boolean; // true = Sí, false = No
};

export type GameState = {
  position: number;              // casilla actual (0 a 30)
  turnsLeft: number;
  answeredQuestions: string[];
  currentRoll: number | null;
  pendingRoll: number | null;
  showQuestion: boolean;
  currentQuestion: Question | null;
  timeLeft: number;
  gameOver: boolean;
  won: boolean;
  locked: boolean;
};


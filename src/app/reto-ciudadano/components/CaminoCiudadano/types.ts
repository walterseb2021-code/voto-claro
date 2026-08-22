export type GameMode = "sin_premio" | "con_premio";

export type Question = {
  id: string;
  question: string;
};

export type GameState = {
  position: number;
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
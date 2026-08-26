import "server-only";

export { RETO_PRIZES_ENABLED } from "@/lib/retoPrizeMode";

export const RETO_LEVEL2_PARTY_ID = "app";

export const RETO_PRINCIPAL_RULES = {
  level1: {
    totalQuestions: 25,
    passScore: 23,
    perQuestionMaxSec: 10,
    poolTotalSec: 280,
  },
  level2: {
    totalQuestions: 25,
    passScore: 23,
    perQuestionMaxSec: 10,
    poolTotalSec: 280,
    partyId: RETO_LEVEL2_PARTY_ID,
  },
  level3: {
    segments: 8,
    winningSegments: [2, 6] as const,
    maxPrizeSpins: 1,
  },
  prizeAttempt: {
    maxAttempts: 1,
    lockSec: 24 * 60 * 60,
  },
} as const;

export const RETO_CAMINO_RULES = {
  totalSquares: 30,
  initialTurns: 10,
  perQuestionMaxSec: 10,
  questionLevel: 2,
  questionPartyId: RETO_LEVEL2_PARTY_ID,
} as const;

export const RETO_ACTIVE_SESSION_TTL_SEC = 60 * 60;

export type RetoGameCode = "principal" | "camino";
export type RetoGameMode = "con_premio";

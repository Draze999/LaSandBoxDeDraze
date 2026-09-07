import type { ScrambledEggsCategory } from "./constants.js";

export type ScrambledEggsGuess = {
  id: string;
  authorId: string;
  text: string;
  correct: boolean;
};

export type ScrambledEggsState = {
  category: ScrambledEggsCategory;
  original: string;
  scrambled: string;
  spaceCount: number;
  phase: "playing" | "between" | "finished";
  endsAt: number | null;
  guesses: ScrambledEggsGuess[];
  proposalCounts: Record<string, number>;
  winnerId: string | null;
  winnerScore: number;
  roundNumber: number;
  totalRounds: number;
  timeLimit: number;
  cumulativeScores: Record<string, number>;
};

export type ScrambledEggsSnapshot = Omit<ScrambledEggsState, "original"> & {
  original: string | null;
  canGuess: boolean;
  playerId: string;
};

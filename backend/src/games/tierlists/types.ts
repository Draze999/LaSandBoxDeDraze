import type { TierlistCategory, TierlistTier } from "./constants.js";
export type TierlistItem = { id: number; name: string; imageUrl: string | null; category: TierlistCategory };
export type TierPlacement = { itemId: number; tier: TierlistTier | null };
export type TierlistBoard = { playerId: string; placements: Record<string, TierlistTier | null>; validated: boolean };
export type TierlistGuess = { id: string; authorId: string; targetPlayerId: string; text: string; accepted: boolean | null };
export type TierlistPhase = "sorting" | "guessing" | "judging" | "finished";
export type TierlistState = {
  category: TierlistCategory; items: TierlistItem[]; themes: Record<string, string>;
  boards: Record<string, TierlistBoard>; phase: TierlistPhase;
  currentPlayerIndex: number; turnOrder: string[]; guesses: TierlistGuess[];
  roundScores: Record<string, number>; cumulativeScores: Record<string, number>;
  roundNumber: number; endsAt: number; result: null | { correctGuesses: number };
};
export type TierlistSnapshot = {
  category: TierlistCategory; items: TierlistItem[]; theme: string | null;
  boards: Record<string, TierlistBoard>; phase: TierlistPhase;
  currentPlayerId: string | null; currentPlayerIndex: number; reviewTotal: number;
  guesses: TierlistGuess[]; roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>; roundNumber: number;
  endsAt: number; result: TierlistState["result"];
};

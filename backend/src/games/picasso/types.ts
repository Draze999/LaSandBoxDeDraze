export type PicassoCategory = "anime" | "character";

export type PicassoSnapshot = {
  category: PicassoCategory;
  imageDataUrl: string;
  original: string | null;
  phase: "playing" | "between" | "finished";
  endsAt: number | null;
  winnerId: string | null;
  winnerScore: number;
  abandonedIds: string[];
  playerId: string;
  roundNumber: number;
  totalRounds: number;
  cumulativeScores: Record<string, number>;
};

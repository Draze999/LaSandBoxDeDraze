export type PicassoCategory = "anime" | "character";

export type PicassoSnapshot = {
  category: PicassoCategory;
  imageDataUrl: string;
  original: string | null;
  phase: "playing" | "finished";
  endsAt: number | null;
  winnerId: string | null;
  winnerScore: number;
  abandonedIds: string[];
  playerId: string;
};

export type SynopsisEclataxState = {
  synopsis: string;
  original: string;
  phase: "playing" | "between" | "finished";
  endsAt: number | null;
  roundNumber: number;
  totalRounds: number;
  playerIds: Set<string>;
  foundIds: Set<string>;
  roundWinnerIds: string[];
  cumulativeScores: Record<string, number>;
};

export type SynopsisEclataxSnapshot = {
  synopsis: string;
  original: string | null;
  phase: "playing" | "between" | "finished";
  endsAt: number | null;
  roundNumber: number;
  totalRounds: number;
  foundIds: string[];
  roundWinnerIds: string[];
  cumulativeScores: Record<string, number>;
  playerId: string;
};

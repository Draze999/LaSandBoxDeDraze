import type { PetitBacCategory, PetitBacTimeLimit } from "./constants.js";

export type PetitBacPhase = "playing" | "reviewing" | "finished";

export type PetitBacVote = "accept" | "reject";

export type PetitBacAnswerMap = Record<PetitBacCategory, string>;

export type PetitBacCategoryResult = {
  accepted: boolean;
  acceptedVotes: number;
  rejectedVotes: number;
};

export type PetitBacPlayerState = {
  playerId: string;
  answers: PetitBacAnswerMap;
  votes: Record<PetitBacCategory, Record<string, PetitBacVote>>;
  results: Partial<Record<PetitBacCategory, PetitBacCategoryResult>>;
};

export type PetitBacState = {
  letter: string;
  timeLimit: PetitBacTimeLimit;
  phase: PetitBacPhase;
  startedAt: number;
  endsAt: number;
  reviewIndex: number;
  reviewOrder: string[];
  answers: Map<string, PetitBacPlayerState>;
  scores: Record<string, number>;
  advancing: boolean;
  submittedPlayers: Record<string, boolean>;
};

export type PetitBacSnapshot = {
  letter: string;
  timeLimit: PetitBacTimeLimit;
  phase: PetitBacPhase;
  startedAt: number;
  endsAt: number;
  reviewIndex: number;
  reviewTotal: number;
  currentPlayerId: string | null;
  currentPlayerAnswers: PetitBacAnswerMap | null;
  currentResults: Partial<Record<PetitBacCategory, PetitBacCategoryResult>>;
  scores: Record<string, number>;
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  submittedPlayers: Record<string, boolean>;
};

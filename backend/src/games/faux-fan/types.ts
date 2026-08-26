import type { FauxFanCategory } from "./constants.js";

export type FauxFanPhase = "questioning" | "voting" | "guessing" | "finished";

export type FauxFanQuestion = {
  id: string;
  authorId: string;
  targetId: string;
  text: string;
  answer: string | null;
  createdAt: number;
};

export type FauxFanVote = {
  voterId: string;
  targetId: string;
};

export type FauxFanGuessVote = {
  voterId: string;
  accepted: boolean;
};

export type FauxFanState = {
  category: FauxFanCategory;
  intruderId: string;
  secret: {
    id: number;
    name: string;
    imageUrl?: string | null;
    animeName?: string | null;
  };
  phase: FauxFanPhase;
  questions: FauxFanQuestion[];
  questionCounts: Record<string, number>;
  turnOrder: string[];
  turnIndex: number;
  waitingForAnswerId: string | null;
  votes: FauxFanVote[];
  guess: string | null;
  guessVotes: FauxFanGuessVote[];
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  roundNumber: number;
  result: {
    intruderWon: boolean;
    intruderVotedMajority: boolean;
    correctGuess: boolean | null;
  } | null;
};

export type FauxFanPlayerView = {
  id: string;
  pseudo: string;
};

export type FauxFanSnapshot = {
  category: FauxFanCategory;
  phase: FauxFanPhase;
  isIntruder: boolean;
  secret: { name: string; imageUrl?: string | null; animeName?: string | null } | null;
  intruderId: string | null;
  questions: FauxFanQuestion[];
  questionCounts: Record<string, number>;
  turnPlayerId: string | null;
  waitingForAnswerId: string | null;
  votes: FauxFanVote[];
  myVote: string | null;
  guess: string | null;
  guessVotes: FauxFanGuessVote[];
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  roundNumber: number;
  result: FauxFanState["result"];
};

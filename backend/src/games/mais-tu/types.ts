export type MaisTuCharacter = {
  id: number;
  name: string;
  image_url: string | null;
  image_small_url: string | null;
};

export type MaisTuAnswer = { id: string; text: string; playerId: string };
export type MaisTuState = {
  phase: "writing" | "voting" | "results" | "finished";
  character: MaisTuCharacter;
  endsAt: number | null;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  submissions: Record<string, string>;
  answerIds: Record<string, string>;
  votes: Record<string, string>;
  roundVotes: Record<string, number>;
  bonusIds: string[];
  cumulativeScores: Record<string, number>;
  usedCharacterIds: number[];
};

export type MaisTuSnapshot = {
  phase: MaisTuState["phase"];
  character: MaisTuCharacter;
  endsAt: number | null;
  roundNumber: number;
  totalRounds: number;
  submittedPlayerIds: string[];
  ownSubmission: string | null;
  ownAnswerId: string | null;
  answers: Array<{ id: string; text: string; playerId?: string }>;
  ownVoteId: string | null;
  voteCount: number;
  roundVotes: Record<string, number> | null;
  bonusIds: string[];
  cumulativeScores: Record<string, number>;
  playerId: string;
};

export type ALaSuiteAnswer = {
  id: string;
  authorId: string;
  text: string;
  acceptedVotes: number;
  rejectedVotes: number;
  finalized: boolean;
  accepted: boolean | null;
};

export type ALaSuitePlayer = {
  id: string;
  theme: string;
  answers: ALaSuiteAnswer[];
};

export type ALaSuiteState = {
  phase: "playing" | "judging" | "finished";
  endsAt: number | null;
  players: Record<string, ALaSuitePlayer>;
  answerOrder: string[];
  currentJudgePlayerIndex: number;
  currentJudgeAnswerIndex: number;
  roundScores: Record<string, number>;
  result: Record<string, number> | null;
};
export type ALaSuiteSnapshot = {
  phase: ALaSuiteState["phase"];
  endsAt: number | null;
  theme: string;
  ownAnswers: ALaSuiteAnswer[];
  visibleAnswers: Record<string, ALaSuiteAnswer[]>;
  currentJudgePlayerId: string | null;
  currentJudgeAnswerId: string | null;
  roundScores: Record<string, number>;
  result: Record<string, number> | null;
  playerId: string;
  myVotedAnswerIds: string[];
  themes: Record<string,string>;
};

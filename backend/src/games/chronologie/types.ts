export type ChronologieAnime = {
  id: number;
  name: string;
  season: string;
  image_url: string | null;
  image_small_url: string | null;
};

export type ChronologieProposal = {
  playerId: string;
  order: number[];
  score: number | null;
};

export type ChronologieState = {
  phase: "playing" | "finished";
  endsAt: number | null;
  anime: ChronologieAnime[];
  trueOrder: number[];
  proposals: Record<string, ChronologieProposal>;
};

export type ChronologieSnapshot = {
  phase: ChronologieState["phase"];
  endsAt: number | null;
  anime: ChronologieAnime[];
  trueOrder: number[] | null;
  ownOrder: number[];
  proposals: Record<string, ChronologieProposal> | null;
  playerId: string;
};

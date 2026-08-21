export const PETIT_BAC_CATEGORIES = [
  ["anime", "Animé"],
  ["maleCharacter", "Personnage masculin"],
  ["femaleCharacter", "Personnage féminin"],
  ["childlikeCharacter", "Personnage au physique enfantin"],
  ["powerOrTrait", "Pouvoir ou Trait de caractère spécifique"],
  ["jobOrOccupation", "Métier ou Occupation d'un des personnage"],
  ["groupOrOrganization", "Groupe ou Organisation"],
  ["specificObject", "Objet spécifique"],
  ["place", "Lieu"],
  ["tagOrGenre", "Tag/Genre"],
  ["openingOrArtist", "Opening ou Artiste de l'Opening"],
  ["endingOrArtist", "Ending ou Artiste de l'Ending"],
] as const;

export const PETIT_BAC_TIME_LIMITS = [20, 30, 40, 50, 60] as const;

export type PetitBacCategory = typeof PETIT_BAC_CATEGORIES[number][0];
export type PetitBacAnswers = Partial<Record<PetitBacCategory, string>>;

export type PetitBacResult = {
  accepted: boolean;
  acceptedVotes: number;
  rejectedVotes: number;
};

export type PetitBacSnapshot = {
  letter: string;
  timeLimit: number;
  phase: "playing" | "reviewing" | "finished";
  startedAt: number;
  endsAt: number;
  reviewIndex: number;
  reviewTotal: number;
  currentPlayerId: string | null;
  currentPlayerAnswers: Record<PetitBacCategory, string> | null;
  currentResults: Partial<Record<PetitBacCategory, PetitBacResult>>;
  scores: Record<string, number>;
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
};

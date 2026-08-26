export const PETIT_BAC_CATEGORIES = [
  { id: "anime", label: "Animé" },
  { id: "maleCharacter", label: "Personnage masculin" },
  { id: "femaleCharacter", label: "Personnage féminin" },
  { id: "childlikeCharacter", label: "Personnage au physique enfantin ou Animal" },
  { id: "powerOrTrait", label: "Pouvoir ou Trait de caractère spécifique" },
  { id: "jobOrOccupation", label: "Métier ou Occupation d'un des personnage" },
  { id: "groupOrOrganization", label: "Groupe ou Organisation" },
  { id: "specificObject", label: "Objet spécifique" },
  { id: "place", label: "Lieu" },
  { id: "tagOrGenre", label: "Tag/Genre" },
  { id: "openingOrArtist", label: "Opening ou Artiste de l'Opening" },
  { id: "endingOrArtist", label: "Ending ou Artiste de l'Ending" },
] as const;

export type PetitBacCategory = typeof PETIT_BAC_CATEGORIES[number]["id"];
export const PETIT_BAC_CATEGORY_IDS = PETIT_BAC_CATEGORIES.map((category) => category.id);

export const PETIT_BAC_LETTERS = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
] as const;

export type PetitBacTimeLimit = number;

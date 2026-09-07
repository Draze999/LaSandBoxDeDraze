export const TIERLIST_TIERS = [
  { id: "S", label: "S" }, { id: "A", label: "A" }, { id: "B", label: "B" },
  { id: "C", label: "C" }, { id: "D", label: "D" },
] as const;
export type TierlistTier = typeof TIERLIST_TIERS[number]["id"];
export type TierlistCategory = "anime" | "character";
export const TIERLIST_ITEM_COUNTS = [10, 15, 20, 25, 30] as const;
export type TierlistItemCount = typeof TIERLIST_ITEM_COUNTS[number];
export const TIERLIST_ANIME_THEMES = [
  "Le meilleur scénario","Le meilleur Worldbuilding","La meilleure ambiance","Les meilleures musiques",
  "Le meilleur opening","Le meilleur ending","Le meilleur style visuel","Le meilleur humour",
  "Le meilleur développement de personnage","La meilleure romance","La meilleure amitié","Le meilleur combat",
  "Les plus sous-côtés","À revoir encore une fois sans hésiter","Recommandations à quelqu'un qui débute les animés",
  "Pour une soirée tranquille","À regarder avec des amis","Le meilleur potentiel de crossover","Mérite une suite",
  "Mérite un spin-off","Le plus de potentiel inexploité","Le potentiel de mème","Les animés avec le meilleur premier épisode",
  "Les animés avec la meilleure fin","Les animés qui vieillissent le mieux","Les animés que tu recommanderais à tout le monde",
  "Les animés les plus marquants","Les animés qui méritent plus de reconnaissance",
] as const;

export const TIERLIST_CHARACTER_THEMES = [
  "Le meilleur protagoniste","Le meilleur antagoniste","Le meilleur deutéragoniste","Le meilleur professeur",
  "Le meilleur chef d'équipe","Le meilleur compagnon de voyage","Le meilleur allié","Le meilleur ennemi",
  "Le meilleur charisme","La meilleure évolution","Le meilleur style","Le meilleur humour",
  "Le personnage le plus dangereux","Le personnage le plus intelligent","Le personnage le plus attachant",
  "Le personnage que tu voudrais comme ami","Le personnage que tu voudrais comme voisin",
  "Le personnage avec le meilleur design","Le personnage avec le meilleur développement",
  "Le personnage le plus sous-côté","Le personnage le plus mémorable","Le meilleur potentiel de mème",
  "Qui survivrait le mieux dans le monde réel","Qui serait le plus dangereux dans la vraie vie",
  "Celui qui te manque le plus","Tes préférés",
] as const;

export const TIERLIST_THEMES = [...TIERLIST_ANIME_THEMES, ...TIERLIST_CHARACTER_THEMES] as const;

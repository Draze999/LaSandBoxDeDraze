export const THE_OU_CAFE_CATEGORIES = [
  { id: "anime", label: "Animé" },
  { id: "character", label: "Personnage" },
] as const;

export type TheOuCafeCategory = typeof THE_OU_CAFE_CATEGORIES[number]["id"];

export const THE_OU_CAFE_CATEGORY_IDS = THE_OU_CAFE_CATEGORIES.map((c) => c.id);

export const THE_OU_CAFE_MIN_POINTS = 20;
export const THE_OU_CAFE_MAX_POINTS = 100;
export const THE_OU_CAFE_TARGET_NO_FIND_POINTS = 25;

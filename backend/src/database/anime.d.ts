export type Anime = {
  id: number;
  name: string;
  image_url: string | null;
  image_small_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Character = {
  id: number;
  mal_id: number | null;
  name: string;
  image_url: string | null;
  image_small_url: string | null;
  role: string | null;
  mal_favorites: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CharacterGameData = {
  id: number;
  mal_id: number | null;
  name: string;
  image_url: string | null;
  image_small_url: string | null;
  role: string | null;
  anime_id: number;
  anime_name: string;
  anime_image_url: string | null;
  anime_image_small_url: string | null;
};

export function getAnime(id: number | string): Promise<Anime | null>;

export function getAnimeByMalId(
  malId: number | string,
): Promise<Anime | null>;

export function getAllAnime(): Promise<Anime[]>;

export function getRandomAnime(): Promise<Anime | null>;

export function getCharacter(id: number | string): Promise<Character | null>;

export function getCharacterByMalId(
  malId: number | string,
): Promise<Character | null>;

export function getCharactersByAnime(
  animeId: number | string,
): Promise<CharacterGameData[]>;

export function getAllCharacters(): Promise<Character[]>;

export function getRandomCharacter(): Promise<Character | null>;

export function getRandomCharacters(count: number): Promise<Character[]>;

export function getCharacterGameData(
  id: number | string,
): Promise<CharacterGameData | null>;

export function searchCharacters(name: string): Promise<Character[]>;

export function searchAnime(name: string): Promise<Anime[]>;
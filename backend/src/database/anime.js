import { supabase } from "./supabase.js";

// =========================================================
// ANIME
// =========================================================

/**
 * Récupère un anime grâce à son ID interne Supabase.
 *
 * @param {number|string} id
 * @returns {object|null}
 */
export async function getAnime(id) {
  const { data, error } = await supabase

    .from("anime")

    .select(
      `
      id,
      name,
      image_url,
      image_small_url,
      created_at,
      updated_at
    `,
    )

    .eq("id", id)

    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Récupère un anime grâce à un ID MAL.
 *
 * Exemple :
 *
 * getAnimeByMalId(16498)
 *
 * → Shingeki no Kyojin
 *
 * @param {number|string} malId
 * @returns {object|null}
 */
export async function getAnimeByMalId(malId) {
  const { data, error } = await supabase

    .from("anime_sources")

    .select(
      `
      mal_id,

      anime:anime_id (
        id,
        name,
        image_url,
        image_small_url,
        created_at,
        updated_at
      )
    `,
    )

    .eq("mal_id", malId)

    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.anime ?? null;
}

/**
 * Récupère tous les animés.
 *
 * @returns {Array}
 */
export async function getAllAnime() {
  const { data, error } = await supabase

    .from("anime")

    .select(
      `
      id,
      name,
      image_url,
      image_small_url,
      created_at,
      updated_at
    `,
    )

    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Récupère un anime aléatoire.
 *
 * @returns {object|null}
 */
export async function getRandomAnime() {
  const { data, error } = await supabase.rpc("get_random_anime");

  if (error) {
    // Fallback si la fonction SQL
    // n'existe pas encore.

    const anime = await getAllAnime();

    if (!anime.length) {
      return null;
    }

    const index = Math.floor(Math.random() * anime.length);

    return anime[index];
  }

  return data?.[0] ?? null;
}

// =========================================================
// PERSONNAGES
// =========================================================

/**
 * Récupère un personnage grâce
 * à son ID interne Supabase.
 *
 * @param {number|string} id
 * @returns {object|null}
 */
export async function getCharacter(id) {
  const { data, error } = await supabase

    .from("characters")

    .select(
      `
      id,
      mal_id,
      name,
      image_url,
      image_small_url,
      role,
      mal_favorites,
      created_at,
      updated_at
    `,
    )

    .eq("id", id)

    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Récupère un personnage grâce
 * à son ID MAL.
 *
 * @param {number|string} malId
 * @returns {object|null}
 */
export async function getCharacterByMalId(malId) {
  const { data, error } = await supabase

    .from("characters")

    .select(
      `
      id,
      mal_id,
      name,
      image_url,
      image_small_url,
      role,
      mal_favorites,
      created_at,
      updated_at
    `,
    )

    .eq("mal_id", malId)

    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Récupère les personnages
 * associés à un anime.
 *
 * @param {number|string} animeId
 * @returns {Array}
 */
export async function getCharactersByAnime(animeId) {
  const { data, error } = await supabase

    .from("character_catalog")

    .select(
      `
      id,
      mal_id,
      name,
      image_url,
      image_small_url,
      role,
      mal_favorites,
      anime_id,
      anime_name,
      anime_image_url,
      anime_image_small_url
    `,
    )

    .eq("anime_id", animeId)

    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Récupère tous les personnages.
 *
 * @returns {Array}
 */
export async function getAllCharacters() {
  const { data, error } = await supabase

    .from("characters")

    .select(
      `
      id,
      mal_id,
      name,
      image_url,
      image_small_url,
      role,
      mal_favorites,
      created_at,
      updated_at
    `,
    )

    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Récupère un personnage aléatoire.
 *
 * @returns {object|null}
 */
export async function getRandomCharacter() {
  const { data, error } = await supabase.rpc("get_random_character");

  if (error) {
    const characters = await getAllCharacters();

    if (!characters.length) {
      return null;
    }

    const index = Math.floor(Math.random() * characters.length);

    return characters[index];
  }

  return data?.[0] ?? null;
}

/**
 * Récupère plusieurs personnages aléatoires.
 *
 * @param {number} count
 * @returns {Array}
 */
export async function getRandomCharacters(count) {
  const amount = Math.max(1, Math.floor(Number(count) || 1));

  const { data, error } = await supabase.rpc("get_random_characters", {
    requested_count: amount,
  });

  if (!error) {
    return data ?? [];
  }

  // Fallback JS
  const characters = await getAllCharacters();

  // Fisher-Yates
  for (let i = characters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [characters[i], characters[j]] = [characters[j], characters[i]];
  }

  return characters.slice(0, amount);
}

// =========================================================
// RECHERCHE
// =========================================================

/**
 * Recherche des personnages
 * par leur nom.
 *
 * @param {string} name
 * @returns {Array}
 */
export async function searchCharacters(name) {
  const search = String(name ?? "").trim();

  if (!search) {
    return [];
  }

  const { data, error } = await supabase

    .from("characters")

    .select(
      `
      id,
      mal_id,
      name,
      image_url,
      image_small_url,
      role,
      mal_favorites
    `,
    )

    .ilike("name", `%${search}%`)

    .order("name", {
      ascending: true,
    })

    .limit(50);

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Recherche des animés
 * par leur nom.
 *
 * @param {string} name
 * @returns {Array}
 */
export async function searchAnime(name) {
  const search = String(name ?? "").trim();

  if (!search) {
    return [];
  }

  const { data, error } = await supabase

    .from("anime")

    .select(
      `
      id,
      name,
      image_url,
      image_small_url
    `,
    )

    .ilike("name", `%${search}%`)

    .order("name", {
      ascending: true,
    })

    .limit(50);

  if (error) {
    throw error;
  }

  return data ?? [];
}

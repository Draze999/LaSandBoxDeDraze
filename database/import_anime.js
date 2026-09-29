import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ANIME } from "./anime-list.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =========================================================
// TENRAI
// =========================================================

const TENRAI_BASE = "https://api.tenrai.org/v1";

// =========================================================
// CONFIGURATION
// =========================================================

const MIN_CHARACTERS_PER_ANIME = 2;
const MAX_CHARACTERS_PER_ANIME = 15;

// Franchises suffisamment connues pour toujours conserver
// un groupe plus large, même si les statistiques MAL évoluent.
const ICONIC_ANIME = new Set(
  [
    "One Piece",
    "Naruto",
    "Bleach",
    "Dragon Ball",
    "Detective Conan",
    "Pokémon",
    "Attack on Titan",
    "Demon Slayer",
    "Jujutsu Kaisen",
    "My Hero Academia",
    "Hunter x Hunter",
    "Death Note",
    "Fullmetal Alchemist",
    "One Punch Man",
    "Sword Art Online",
  ].map((name) => name.toLowerCase()),
);

// =========================================================
// UTILITAIRES
// =========================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getCharacterLimit(animeName, animeSourcesData) {
  if (ICONIC_ANIME.has(animeName.toLowerCase())) {
    return MAX_CHARACTERS_PER_ANIME;
  }

  const maxMembers = Math.max(
    0,
    ...animeSourcesData.map((source) => Number(source?.members || 0)),
  );

  // La limite reste volontairement comprise entre 2 et 15.
  // On se base sur le nombre de membres MAL, plus stable que le
  // nombre de favoris d'une seule saison.
  if (maxMembers >= 2_000_000) return 15;
  if (maxMembers >= 1_000_000) return 12;
  if (maxMembers >= 500_000) return 10;
  if (maxMembers >= 250_000) return 8;
  if (maxMembers >= 100_000) return 6;
  if (maxMembers >= 50_000) return 4;

  return MIN_CHARACTERS_PER_ANIME;
}

function getImageUrls(images) {
  return {
    image_url:
      images?.webp?.large_image_url ||
      images?.jpg?.large_image_url ||
      images?.webp?.image_url ||
      images?.jpg?.image_url ||
      null,

    image_small_url:
      images?.webp?.small_image_url ||
      images?.jpg?.small_image_url ||
      images?.webp?.image_url ||
      images?.jpg?.image_url ||
      null,
  };
}

// =========================================================
// TENRAI REQUEST
// =========================================================

async function getTenrai(path, attempt = 1) {
  const MAX_ATTEMPTS = 5;

  try {
    const response = await fetch(`${TENRAI_BASE}${path}`);

    if (response.ok) {
      return response.json();
    }

    const text = await response.text();

    if (response.status === 429) {
      if (attempt < MAX_ATTEMPTS) {
        const wait = attempt * 3000;

        console.log(
          `⏳ Tenrai limite les requêtes. ` +
            `Nouvelle tentative dans ${wait / 1000}s...`,
        );

        await sleep(wait);

        return getTenrai(path, attempt + 1);
      }
    }

    if (
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      if (attempt < MAX_ATTEMPTS) {
        const wait = attempt * 3000;

        console.log(
          `⚠️ Tenrai ${response.status}. ` +
            `Nouvelle tentative ${attempt}/${MAX_ATTEMPTS} ` +
            `dans ${wait / 1000}s...`,
        );

        await sleep(wait);

        return getTenrai(path, attempt + 1);
      }
    }

    throw new Error(`Tenrai ${response.status} sur ${path}: ${text}`);
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw error;
    }

    const wait = attempt * 3000;

    console.log(
      `⚠️ Erreur réseau. ` +
        `Nouvelle tentative ${attempt}/${MAX_ATTEMPTS} ` +
        `dans ${wait / 1000}s...`,
    );

    await sleep(wait);

    return getTenrai(path, attempt + 1);
  }
}

// =========================================================
// IMPORT D'UN ANIME LOGIQUE
// =========================================================

async function importAnime(animeConfig) {
  console.log("");
  console.log("=================================");
  console.log(`📺 ${animeConfig.name}`);
  console.log("=================================");

  // -------------------------------------------------------
  // Création / récupération de l'anime logique
  // -------------------------------------------------------

  const { data: animeRow, error: animeError } = await supabase
    .from("anime")
    .upsert(
      {
        name: animeConfig.name,
        alt_name: Array.isArray(animeConfig.alt_name)
          ? animeConfig.alt_name
          : [],
        season: animeConfig.season || "Unknown",
      },
      {
        onConflict: "name",
      },
    )
    .select("id, name, alt_name, season, image_url, image_small_url")
    .single();

  if (animeError) {
    throw animeError;
  }

  console.log(`✅ Anime logique : ${animeRow.name}`);
  console.log(`🏷️ Saison : ${animeConfig.season || "Unknown"}`);
  console.log(
    `🔤 Noms alternatifs : ${
      animeConfig.alt_name?.length
        ? animeConfig.alt_name.join(", ")
        : "aucun"
    }`,
  );

  let animeImageUrl = animeRow.image_url || null;
  let animeSmallImageUrl = animeRow.image_small_url || null;

  // On conserve tous les personnages de toutes les sources dans cette
  // collection, puis on déduplique avant d'appliquer la limite globale.
  const charactersByMalId = new Map();
  const animeSourcesData = [];

  // -------------------------------------------------------
  // Chaque ID MAL/Tenrai
  // -------------------------------------------------------

  for (const malId of animeConfig.mal_ids) {
    console.log("");
    console.log(`🔎 Source MAL/Tenrai : ${malId}`);

    let animeData;

    try {
      animeData = (await getTenrai(`/anime/${malId}/full`)).data;
    } catch (error) {
      console.error(`❌ Impossible de récupérer l'anime ${malId}`);
      console.error(error);
      continue;
    }

    animeSourcesData.push(animeData);

    // -----------------------------------------------------
    // Image de l'anime
    // -----------------------------------------------------

    const animeImages = getImageUrls(animeData.images);

    if (!animeImageUrl) {
      animeImageUrl = animeImages.image_url;
    }

    if (!animeSmallImageUrl) {
      animeSmallImageUrl = animeImages.image_small_url;
    }

    // -----------------------------------------------------
    // Enregistrement de la source
    // -----------------------------------------------------

    const { error: sourceError } = await supabase
      .from("anime_sources")
      .upsert(
        {
          anime_id: animeRow.id,
          mal_id: malId,
        },
        {
          onConflict: "anime_id,mal_id",
        },
      );

    if (sourceError) {
      throw sourceError;
    }

    console.log(`✅ Source ${malId} enregistrée`);

    // -----------------------------------------------------
    // Personnages de la source
    // -----------------------------------------------------

    console.log("👥 Récupération des personnages...");

    let charactersData;

    try {
      charactersData = (await getTenrai(`/anime/${malId}/characters`)).data;
    } catch (error) {
      console.error(
        `❌ Impossible de récupérer les personnages de ${malId}`,
      );
      console.error(error);
      continue;
    }

    if (!Array.isArray(charactersData)) {
      console.log("⚠️ Aucun personnage trouvé.");
      continue;
    }

    for (const item of charactersData) {
      const character = item.character || {};

      if (!character.mal_id || !character.name) {
        continue;
      }

      const malCharacterId = Number(character.mal_id);
      const current = charactersByMalId.get(malCharacterId);

      const candidate = {
        character,
        role: item.role || null,
        favorites: Number(item.favorites || 0),
      };

      // Un personnage peut apparaître dans plusieurs saisons.
      // On garde la version qui possède le plus de favoris MAL.
      if (!current || candidate.favorites > current.favorites) {
        charactersByMalId.set(malCharacterId, candidate);
      }
    }

    console.log(`📊 ${charactersData.length} personnages trouvés`);

    await sleep(1500);
  }

  // -------------------------------------------------------
  // Sélection globale des personnages
  // -------------------------------------------------------

  const characterLimit = getCharacterLimit(
    animeConfig.name,
    animeSourcesData,
  );

  const selectedCharacters = [...charactersByMalId.values()]
    .sort((a, b) => b.favorites - a.favorites)
    .slice(0, characterLimit);

  console.log("");
  console.log(
    `🎯 Limite personnages pour ${animeConfig.name} : ` +
      `${characterLimit}/${MAX_CHARACTERS_PER_ANIME}`,
  );
  console.log(
    `👥 ${charactersByMalId.size} personnages uniques trouvés, ` +
      `${selectedCharacters.length} sélectionnés`,
  );

  // -------------------------------------------------------
  // Nettoyage des anciennes relations
  // -------------------------------------------------------
  //
  // Important : si le script est relancé, on veut que la nouvelle
  // limite 2–15 soit réellement respectée. Les personnages eux-mêmes
  // restent en BDD et peuvent être liés à d'autres animés.
  const { error: deleteRelationsError } = await supabase
    .from("anime_characters")
    .delete()
    .eq("anime_id", animeRow.id);

  if (deleteRelationsError) {
    throw deleteRelationsError;
  }

  // -------------------------------------------------------
  // Import des personnages sélectionnés
  // -------------------------------------------------------

  let imported = 0;

  for (const item of selectedCharacters) {
    const character = item.character;
    const images = getImageUrls(character.images);

    const { data: characterRow, error: characterError } = await supabase
      .from("characters")
      .upsert(
        {
          mal_id: character.mal_id,
          name: character.name,
          image_url: images.image_url,
          image_small_url: images.image_small_url,
          role: item.role,
          mal_favorites: item.favorites,
        },
        {
          onConflict: "mal_id",
        },
      )
      .select("id")
      .single();

    if (characterError) {
      throw characterError;
    }

    const { error: relationError } = await supabase
      .from("anime_characters")
      .upsert(
        {
          anime_id: animeRow.id,
          character_id: characterRow.id,
        },
        {
          onConflict: "anime_id,character_id",
        },
      );

    if (relationError) {
      throw relationError;
    }

    imported++;
  }

  console.log(`✅ ${imported} personnages importés`);

  // -------------------------------------------------------
  // Mise à jour de l'image de l'anime
  // -------------------------------------------------------

  if (animeImageUrl || animeSmallImageUrl) {
    const { error } = await supabase
      .from("anime")
      .update({
        image_url: animeImageUrl,
        image_small_url: animeSmallImageUrl,
      })
      .eq("id", animeRow.id);

    if (error) {
      throw error;
    }
  }

  console.log("");
  console.log(`🎉 ${animeConfig.name} terminé`);
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log("");
  console.log("=================================");
  console.log("🚀 IMPORT ROOMHUB");
  console.log("=================================");
  console.log(
    `Personnages par anime : ${MIN_CHARACTERS_PER_ANIME} à ${MAX_CHARACTERS_PER_ANIME}`,
  );

  for (const anime of ANIME) {
    try {
      await importAnime(anime);
    } catch (error) {
      console.error("");
      console.error(`❌ Erreur avec ${anime.name}`);
      console.error(error);
      console.error("➡️ Passage à l'anime suivant.");
    }
  }

  console.log("");
  console.log("=================================");
  console.log("🎉 IMPORT TERMINÉ");
  console.log("=================================");
}

main();

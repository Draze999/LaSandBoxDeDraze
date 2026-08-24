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

const LIMIT_PER_SOURCE = Number(process.env.LIMIT_PER_ANIME || 20);

// =========================================================
// UTILITAIRES
// =========================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    // Rate limit
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

    // Erreurs temporaires
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

    throw new Error(`Tenrai ${response.status} ` + `sur ${path}: ${text}`);
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
// IMAGES
// =========================================================

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

  let animeImageUrl = null;
  let animeSmallImageUrl = null;

  const { data: animeRow, error: animeError } = await supabase

    .from("anime")

    .upsert(
      {
        name: animeConfig.name,
      },
      {
        onConflict: "name",
      },
    )

    .select("id, name, image_url, image_small_url")

    .single();

  if (animeError) {
    throw animeError;
  }

  console.log(`✅ Anime logique : ${animeRow.name}`);

  // -------------------------------------------------------
  // Chaque ID MAL/Tenrai
  // -------------------------------------------------------

  for (const malId of animeConfig.mal_ids) {
    console.log("");
    console.log(`🔎 Source MAL/Tenrai : ${malId}`);

    // -----------------------------------------------------
    // Récupération de l'anime
    // -----------------------------------------------------

    let animeData;

    try {
      animeData = (await getTenrai(`/anime/${malId}/full`)).data;
    } catch (error) {
      console.error(`❌ Impossible de récupérer l'anime ${malId}`);

      console.error(error);

      continue;
    }

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
    // Personnages
    // -----------------------------------------------------

    console.log("👥 Récupération des personnages...");

    let charactersData;

    try {
      charactersData = (await getTenrai(`/anime/${malId}/characters`)).data;
    } catch (error) {
      console.error(
        `❌ Impossible de récupérer ` + `les personnages de ${malId}`,
      );

      console.error(error);

      continue;
    }

    if (!Array.isArray(charactersData)) {
      console.log("⚠️ Aucun personnage trouvé.");

      continue;
    }

    // -----------------------------------------------------
    // Tri par popularité
    // -----------------------------------------------------

    charactersData.sort((a, b) => (b.favorites || 0) - (a.favorites || 0));

    // -----------------------------------------------------
    // Limite par source
    // -----------------------------------------------------

    const selectedCharacters = charactersData.slice(0, LIMIT_PER_SOURCE);

    // -----------------------------------------------------
    // Import
    // -----------------------------------------------------

    let imported = 0;

    for (const item of selectedCharacters) {
      const character = item.character || {};

      if (!character.mal_id || !character.name) {
        continue;
      }

      const images = getImageUrls(character.images);

      // ---------------------------------------------------
      // Personnage
      // ---------------------------------------------------

      const { data: characterRow, error: characterError } = await supabase

        .from("characters")

        .upsert(
          {
            mal_id: character.mal_id,

            name: character.name,

            image_url: images.image_url,

            image_small_url: images.image_small_url,

            role: item.role || null,

            mal_favorites: Number(item.favorites || 0),
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

      // ---------------------------------------------------
      // Relation anime ↔ personnage
      // ---------------------------------------------------

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

    console.log(`✅ ${imported} personnages traités`);

    console.log(`📊 ${charactersData.length} personnages trouvés`);

    // -----------------------------------------------------
    // Petite pause
    // -----------------------------------------------------

    await sleep(1500);
  }

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

  console.log(`Personnages par source : ${LIMIT_PER_SOURCE}`);

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

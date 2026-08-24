const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const JIKAN = "https://api.jikan.moe/v4";
const ANIME = [
  { mal_id: 21, name: "One Piece" },
  { mal_id: 223, name: "Dragon Ball" },
  { mal_id: 269, name: "Bleach" },
  { mal_id: 20, name: "Naruto" },
];
const LIMIT = Number(process.env.LIMIT_PER_ANIME || 50);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJikan(path) {
  const r = await fetch(JIKAN + path);
  if (r.status === 429) {
    await sleep(2500);
    return getJikan(path);
  }
  if (!r.ok) throw new Error(`Jikan ${r.status} on ${path}`);
  return r.json();
}

function urls(images = {}) {
  return {
    image_url:
      images?.webp?.large_image_url ||
      images?.jpg?.large_image_url ||
      images?.webp?.image_url ||
      images?.jpg?.image_url || null,
    image_small_url:
      images?.webp?.small_image_url ||
      images?.jpg?.small_image_url ||
      images?.webp?.image_url ||
      images?.jpg?.image_url || null
  };
}

async function importOne(config) {
  console.log(`\n=== ${config.name} ===`);

  const anime = (await getJikan(`/anime/${config.mal_id}/full`)).data;
  const ai = urls(anime.images);

  const { data: animeRow, error: animeError } = await supabase
    .from("anime")
    .upsert({
      mal_id: anime.mal_id,
      name: anime.title || config.name,
      image_url: ai.image_url,
      image_small_url: ai.image_small_url
    }, { onConflict: "mal_id" })
    .select("id,name")
    .single();

  if (animeError) throw animeError;

  const result = await getJikan(`/anime/${config.mal_id}/characters`);
  const list = Array.isArray(result.data) ? result.data : [];

  list.sort((a, b) => (b.favorites || 0) - (a.favorites || 0));

  const rows = list.slice(0, LIMIT).map(item => {
    const c = item.character || {};
    const ci = urls(c.images);
    if (!c.mal_id || !c.name) return null;
    return {
      mal_id: c.mal_id,
      anime_id: animeRow.id,
      name: c.name,
      image_url: ci.image_url,
      image_small_url: ci.image_small_url,
      role: item.role || null,
      mal_favorites: Number(item.favorites || 0)
    };
  }).filter(Boolean);

  if (rows.length) {
    const { error } = await supabase
      .from("characters")
      .upsert(rows, { onConflict: "mal_id" });
    if (error) throw error;
  }

  console.log(`${animeRow.name}: ${rows.length} personnages importés.`);
  await sleep(1000);
}

(async () => {
  for (const anime of ANIME) {
    try { await importOne(anime); }
    catch (e) { console.error(`Erreur ${anime.name}:`, e.message || e); }
  }
  console.log("\nImport terminé.");
})();

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase
    .from("anime")
    .select("id")
    .limit(1);

  if (error) {
    console.error("❌ Erreur Supabase :");
    console.error(error);
    process.exit(1);
  }

  console.log("✅ Connexion à Supabase réussie !");
  console.log("Données actuelles :", data);
}

test();
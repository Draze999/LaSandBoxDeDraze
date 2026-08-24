# RoomHub — base Supabase

## 1. Installer le schéma

Dans Supabase → SQL Editor, colle `database/schema.sql` puis exécute-le.

Tables créées :
- `anime`
- `characters`

Vue pratique :
- `character_catalog`

Les tables sont lisibles publiquement mais les écritures doivent rester côté backend/admin.

## 2. Importer One Piece, Dragon Ball, Bleach et Naruto

Node.js 18+ est requis.

```bash
npm install @supabase/supabase-js
```

PowerShell :

```powershell
$env:SUPABASE_URL="https://TON-PROJET.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="TA_SERVICE_ROLE_KEY"
node database/import-anime.js
```

Par défaut, 50 personnages par anime sont importés, classés par popularité/favoris MAL.

Pour en importer 100 :

```powershell
$env:LIMIT_PER_ANIME="100"
node database/import-anime.js
```

## 3. Sécurité

Ne mets JAMAIS `SUPABASE_SERVICE_ROLE_KEY` dans le frontend ou dans GitHub.

Le script utilise l'API Jikan pour récupérer les données, les IDs MAL et les URLs d'images. Vérifie les conditions d'utilisation applicables avant une diffusion publique des images.

## 4. Ajouter un anime

Dans `database/import-anime.js`, ajoute par exemple :

```js
{ mal_id: 1535, name: "Death Note" },
```

Puis relance le script.

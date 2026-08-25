# Jeu 1 — Thé ou Café

Cette version ajoute le Jeu 1 à partir du projet fourni.

## Nouveaux fichiers

### Backend
- `backend/src/games/the-ou-cafe/constants.ts`
- `backend/src/games/the-ou-cafe/types.ts`
- `backend/src/games/the-ou-cafe/engine.ts`
- `backend/src/database/anime.d.ts`

### Frontend
- `frontend/src/games/the-ou-cafe/TheOuCafe.tsx`
- `frontend/src/games/the-ou-cafe/TheOuCafe.css`

## Fichiers existants modifiés

- `backend/src/types.ts`
  - Ajout du paramètre `theOuCafeCategory`.

- `backend/src/server.ts`
  - Enregistrement du moteur Thé ou Café.
  - Démarrage du Jeu 1.
  - Synchronisation temps réel.
  - Événements `game1:*`.
  - Paramètre Animé / Personnage.

- `frontend/src/App.tsx`
  - Ajout du composant Jeu 1.
  - Affichage du Jeu 1 lorsqu'une partie est lancée.
  - Ajout du menu déroulant Animé / Personnage dans les paramètres.

## Événements Socket.IO du Jeu 1

- `game1:start`
- `game1:state`
- `game1:request-state`
- `game1:question`
- `game1:choose`
- `game1:answer`
- `game1:judge`
- `game1:no-find`

## Scores

La formule utilisée pour le joueur qui trouve est :

`max(20, round(100 / sqrt(nombre de questions)))`

Le joueur cible reçoit 25 points si personne ne trouve et utilise « Personne n'a trouvé ».

Les scores cumulés restent en mémoire tant que la room existe, comme pour le Petit Bac.

## Vérification

Le backend compile avec `npm run build`.

Le build frontend n'a pas pu être exécuté dans cet environnement à cause d'une permission sur le binaire Vite présent dans `node_modules`; aucune dépendance n'a été modifiée.

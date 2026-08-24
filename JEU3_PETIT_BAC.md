# Jeu 3 — Petit Bac

Le Jeu 3 est maintenant isolé dans son propre module.

## Frontend

```text
frontend/src/games/petit-bac/
├── PetitBac.tsx
├── PetitBac.css
└── constants.ts
```

`App.tsx` ne fait que charger le module lorsque `gameId === "game-3"` et que la partie démarre.

## Backend

```text
backend/src/games/petit-bac/
├── engine.ts
├── constants.ts
└── types.ts
```

`server.ts` ne gère que les événements Socket.IO et délègue toute la logique métier à `PetitBacEngine`.

## Fonctionnement

1. L'hôte choisit 20, 30, 40, 50 ou 60 secondes dans les paramètres de la room.
2. Au lancement, le serveur tire une lettre aléatoire.
3. La lettre et l'heure de fin sont envoyées à tous les joueurs.
4. Chaque joueur remplit les 11 catégories.
5. À la fin du temps, le serveur passe en correction.
6. Les joueurs sont présentés dans l'ordre de la room.
7. Le joueur dont la grille est affichée ne peut pas voter pour ses propres réponses.
8. Pour chaque réponse non vide, les autres joueurs votent `accept` ou `reject`.
9. Si le nombre de votes pour et contre est égal, la réponse est acceptée.
10. Une réponse acceptée vaut 1 point.
11. Les réponses vides ne donnent pas de point et ne nécessitent pas de vote.
12. Quand toutes les réponses ont été évaluées, le joueur suivant est affiché automatiquement.
13. À la fin, le classement est calculé par le serveur.

## Confidentialité des réponses

Pendant la phase de jeu, les réponses restent dans le moteur serveur et ne sont pas diffusées aux autres joueurs.

Pendant la correction, seul le joueur actuellement corrigé est exposé aux clients.

## Événements Socket.IO du Jeu 3

### Serveur → clients

- `game3:start`
- `game3:state`
- `game3:category-result`

### Client → serveur

- `game3:submit`
- `game3:vote`

Le passage au joueur suivant est volontairement automatique : il n'y a pas de bouton d'hôte supplémentaire à gérer.

## Installer le projet

Les `node_modules` ne sont pas inclus dans l'archive finale.

Depuis la racine :

```bash
npm install
npm run install:all
npm run dev
```

Si tu avais déjà une installation du projet précédent, tu peux simplement supprimer `frontend/node_modules` et `backend/node_modules`, puis relancer les commandes d'installation.

# RoomHub — projet complet

## 1. Prérequis
Installe Node.js 20+.

## 2. Installation
Depuis ce dossier :

```bash
npm install
npm run install:all
```

## 3. Lancement
```bash
npm run dev
```

Cela lance automatiquement :
- frontend : http://localhost:5173
- backend : http://localhost:3001

Ouvre http://localhost:5173 dans deux fenêtres pour tester une vraie room.

## 4. Fonctionnalités
- création réelle de rooms
- code unique de 5 caractères
- rejoindre une room
- joueurs synchronisés en temps réel
- transfert automatique de l'hôte
- paramètres modifiables par l'hôte
- lancement de partie (événement temps réel)
- fond animé et interface sombre

## 5. Limitation actuelle
Les rooms sont conservées en mémoire et sont perdues au redémarrage du backend.
La prochaine étape de production sera d'ajouter une base de données/Redis, puis de déployer le backend et le frontend.


## Jeu 3 — Petit Bac

Le Jeu 3 est organisé en module indépendant :

- `frontend/src/games/petit-bac/`
- `backend/src/games/petit-bac/`

Voir `JEU3_PETIT_BAC.md` pour le fonctionnement et les événements réseau.

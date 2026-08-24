# Jeu 3 — Petit Bac — v3

Corrections :
- À l'expiration du temps, les réponses actuellement saisies sont automatiquement envoyées au serveur avant l'ouverture de la correction.
- Une petite marge serveur évite la course entre le timer navigateur et le timer serveur.
- Le bouton « Joueur précédent » utilise le même style que « Joueur suivant ».
- Les scores cumulés persistent entre plusieurs parties dans la même room.
- Le classement affiche le score cumulé et le gain de la partie précédente : `8 (+3)`.
- Le classement est trié sur le score cumulé.
- Le score cumulé est supprimé lorsque la room disparaît.
\n\n# v4 — corrections\n\n- Chaque client sauvegarde automatiquement ses réponses juste avant la fin du chrono; une seconde tentative est faite à 0 seconde. Le serveur laisse une marge de 1200 ms avant d'ouvrir la correction.\n- Le classement final utilise le score cumulé de la room et est diffusé à tous les clients.\n- Le gain de manche est toujours affiché sous la forme `(+X)`, avec la même taille/police que le score total et une couleur allant du rouge au vert selon X/11.\n
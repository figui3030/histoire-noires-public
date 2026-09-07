# Histoires Noires — Version mobile (PWA)

Version web du jeu, pensée pour s'installer sur téléphone (Android/iPhone)
comme une vraie application, sans passer par un store.

## Ce que contient ce dossier

- `index.html`, `style.css`, `app.js` : l'interface, adaptée pour petit
  écran (onglets Indices/Suspects au lieu de panneaux côte à côte, gros
  boutons tactiles)
- `game.js`, `data/stories.js` : le même moteur de jeu et les mêmes
  histoires que la version PC (Le Contrat, Sang & Soie)
- `manifest.json` : décrit l'app pour qu'Android/Chrome propose
  "Installer l'application"
- `service-worker.js` : permet au jeu de fonctionner hors connexion une
  fois installé
- `icon-192.png` / `icon-512.png` : icônes de l'app (emblème dague + rose)

## Prochaine étape : mise en ligne

Pour qu'un téléphone puisse "installer" cette app, les fichiers doivent
être accessibles via une adresse web en HTTPS (ça ne marche pas en
ouvrant juste le fichier `index.html` en local sur le téléphone).

L'option la plus simple et gratuite : **GitHub Pages**. On verra cette
étape ensemble quand tu seras prêt — il suffira d'envoyer ce dossier sur
un dépôt GitHub et d'activer Pages dans les réglages du dépôt.

## Test en local sur PC (optionnel, pour vérifier avant la mise en ligne)

Si tu as Node.js installé (comme pour la version PC), tu peux prévisualiser
dans un navigateur :

```
npx serve .
```

Puis ouvrir l'adresse affichée (ex: http://localhost:3000) dans Chrome.

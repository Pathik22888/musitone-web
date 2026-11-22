# Architecture

L'appli reste **un seul fichier HTML** une fois construite (c'est ce qui permet de la servir
telle quelle sur Cloudflare et dans l'artifact Claude). Le code source, lui, est découpé en
petits fichiers dans `src/`, assemblés par `tools/build.py`.

## Comment les fichiers s'assemblent

```
src/template.html          squelette : <head>, balisage, emplacements <!--CSS--> <!--MX--> <!--JS-->
src/css/*.css              concaténés dans l'ordre des numéros  ->  <style>
src/js/*.js                concaténés dans l'ordre des numéros  ->  <script>{ ... }</script>
src/mx/*                   lecteur vertical MusiTone (inséré à <!--MX-->)
src/assets/sample.png      partition d'exemple (encodée en base64)
src/web/head.html          balises PWA (site web uniquement)
src/test/hooks.js          crochets window.__mt (version de test uniquement)
```

**Important :** les fichiers `src/js/*.js` ne sont pas des modules ES indépendants. Ce sont des
morceaux d'un même bloc `{ ... }`. Une fonction déclarée dans `04-staves.js` est donc visible
dans `20-staff-step.js`. L'ordre des numéros compte pour les `const`/`let` de haut niveau :
une variable doit être déclarée dans un fichier dont le numéro est inférieur à celui des
fichiers qui l'utilisent au chargement.

## Carte des modules JS

| Fichier | Rôle |
|---|---|
| 00-config | constantes, couleurs MusiTone, noms de notes |
| 01-state | état global (pages, page courante, modes) |
| 02-image | chargement, niveaux de gris, binarisation |
| 03-dewarp | redressement des photos (portées courbes) |
| 04-staves | détection des portées |
| 05-clefs-key | clés et armure |
| 06-analyze | analyse d'une page complète |
| 07-pages | gestion multipage |
| 08-accidentals | dièses, bémols, bécarres |
| 09-rhythm | durées, mesures, temps |
| 10-render | peinture des notes colorées |
| 11-navigation | écrans, `show()`, barre d'étapes, libération mémoire iOS |
| 12-overlay | repères, grille, zoom |
| 13-edit | annuler / rétablir |
| 14-reanalyze | ré-analyse après correction |
| 15-note-detection | détection des têtes de notes |
| 16-note-model | modèle de note (hauteur, lettre) |
| 17-correction-ui | menu Corriger, tap sur la partition (lecture et « Jouer ») |
| 18-home | accueil, fermeture des panneaux |
| 19-crop | étape recadrage |
| 20-staff-step | étape 1 : portées (sélection, coins, loupe, ajout/suppression) |
| 21-projects | sauvegarde des projets (IndexedDB) |
| 22-midi-import | import MIDI |
| 23-open-file | ouverture d'image / PDF |
| 24-musicxml | import MusicXML |
| 25-export | export PNG / PDF, kit d'étiquettes |
| 26-key-step | étape 2 : gamme (menu des armures) |
| 27-song | construction de la suite de notes, curseur |
| 28-piano | son du piano (échantillons, réverbération) |
| 29-playback | lecture continue sur toutes les pages |
| 30-view-switch | bascule partition classique ↔ vue MusiTone |
| 31-musitone-view | vue verticale MusiTone |
| 32-keybar-png | image du clavier coloré |
| 33-practice | onglet « Jouer » (micro) |

Pour modifier une fonction : `grep -n "function nomDeLaFonction" src/js/*.js`, puis ne toucher
que ce fichier.

## Trois sorties

| Commande | Fichier | Différence |
|---|---|---|
| `python3 tools/build.py web` | `public/index.html` | balises PWA, onglet « Jouer » actif |
| `python3 tools/build.py artifact` | `dist/artifact.html` | « Jouer » masqué (pas de micro dans l'artifact) |
| `python3 tools/build.py test` | `dist/test.html` | crochets `window.__mt` pour les tests |

`build.py` refuse de produire une version web ou artifact qui contiendrait les crochets de test.

## Tests (`tests/`)

- `golden.py` — 12 partitions de référence : portées, armure, notes et suite jouée doivent
  rester identiques aux fichiers `tests/golden/*.json`. `--update` pour accepter un changement
  voulu.
- `e2e.py` — 9 parcours utilisateur sur écran tactile de téléphone (étapes, retour, portées,
  correction, clé, lecture, pages, export PDF, « Jouer » avec micro simulé).
- `visual.py A.html B.html` — compare deux versions écran par écran au pixel près.

Prérequis : `pip install playwright pillow` et Google Chrome (`/usr/bin/google-chrome`).

## Outils (`tools/`)

- `build.py` — assemblage.
- `fmt.mjs` — mise en forme Prettier (réglages dans `.prettierrc.json`).
- `astcmp.mjs`, `csscmp.mjs` — prouvent qu'un remaniement ne change pas le code (comparaison
  d'arbres syntaxiques JS et de règles CSS). `cd tools && npm install` avant usage.

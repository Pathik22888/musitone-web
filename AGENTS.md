# Consignes pour les agents de code (Codex, Claude…)

## Le projet
MusiTone Coloriseur : appli web mobile (une seule page, en français) qui prend une partition en photo
(ou un PDF, MIDI, MusicXML), colore chaque note avec sa couleur MusiTone, la joue au piano, l'affiche
en vue verticale MusiTone, l'exporte, et propose l'onglet « Jouer » (l'élève joue sur son vrai piano,
le micro reconnaît la note). Objectif : un produit prêt à vendre, simple, avec peu de menus.

Propriétaire : Patrick (inventeur de MusiTone). Il teste sur iPhone. Répondez-lui en français, en le vouvoyant,
directement et honnêtement (risques et limites compris).

## Règles d'interface
- Textes en français ; noms de notes américains (C D E F G A B, avec octave : C4).
- Couleurs MusiTone : `PAL` dans `src/js/00-config.js`. Ne jamais les changer sans demande.
- Mobile d'abord (écran ~428×926, tactile). Pas de nouveaux menus si on peut l'éviter.

## Où modifier
- **Uniquement dans `src/`.** `public/index.html` est généré : ne jamais l'éditer à la main.
- Carte des fichiers : `ARCHITECTURE.md`. Pour trouver une fonction : `grep -n "function nom" src/js/*.js`.
- Attention : les fichiers `src/js/*.js` sont des morceaux d'un **même bloc** `{ ... }` concaténés
  dans l'ordre des numéros (pas des modules ES). Pas d'`import`/`export`. Une `const` de haut niveau
  doit être déclarée dans un fichier de numéro inférieur à ceux qui l'utilisent au chargement.
- Style : Prettier (`.prettierrc.json`, largeur 120).

## Construire et tester (obligatoire avant chaque commit)
```bash
python3 tools/build.py all     # -> public/index.html (site), dist/artifact.html, dist/test.html
python3 tests/golden.py        # 12 partitions de référence (portées, armure, notes, suite jouée)
python3 tests/e2e.py           # 10 parcours sur téléphone (Playwright + Chrome)
node tests/pitch.mjs           # reconnaissance des notes au micro (vrais sons de piano2/)
```
Prérequis : `pip install playwright pillow`, Google Chrome (`/usr/bin/google-chrome`, chemin dans
`tests/common.py`), `ffmpeg`, Node 18+.
Si un changement voulu modifie les résultats de référence : `python3 tests/golden.py --update`,
et le dire dans le message de commit.

## Mettre en ligne
Push sur `main` → Cloudflare Pages publie automatiquement le dossier `public/`
(https://musitone-web.pages.dev, réglé par `wrangler.toml`). Aucune commande de build côté Cloudflare :
il faut donc **commiter `public/index.html` reconstruit**.

## Pièges connus
- iPhone : mémoire des canvas limitée → `freePg()` et le jeton de `show()` (11-navigation.js) évitent
  les écrans noirs en changeant de page. Ne pas garder de grands canvas en mémoire.
- Les crochets de test `window.__mt` (src/test/hooks.js) ne doivent exister que dans `dist/test.html`
  (build.py le vérifie).
- Le micro ne marche pas dans l'artifact Claude (l'onglet « Jouer » y est masqué) ; il marche sur le site.
- Sons du piano : `public/piano2/` (Salamander, CC BY 3.0), deux couches de vélocité (v6, v13).
- Reconnaissance micro (`34-pitch.js`) : fonctions pures, réglages dans `PITCH`. Toute modification
  doit garder `node tests/pitch.mjs` à OK.

## Dernier état (22/11/2026)
- Code découpé en modules, équivalence prouvée avec l'ancienne version.
- « Jouer » : note entendue affichée avec octave exacte ; note tenue stable ; il faut la bonne octave
  pour avancer (pastille en pointillés = bonne couleur, mauvaise octave). Plage reconnue E1–C7.
- À valider par Patrick sur son vrai piano.

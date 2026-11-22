# MusiTone — version web

Prenez une partition en photo : chaque note prend sa couleur MusiTone.

Tout le traitement se fait dans le téléphone ou l'ordinateur : aucun serveur n'est nécessaire.

## Organisation
- `src/` — le code source, découpé en petits fichiers (voir [ARCHITECTURE.md](ARCHITECTURE.md))
- `public/` — **le site publié** : `index.html` construit + sons, icônes, kit
- `tools/build.py` — assemble `src/` en un seul fichier HTML
- `tests/` — tests de non-régression

## Modifier l'appli
```bash
# 1. modifier un fichier dans src/
python3 tools/build.py all        # 2. reconstruire site + artifact + version de test
python3 tests/golden.py           # 3. vérifier : 12 partitions de référence
python3 tests/e2e.py              #    9 parcours utilisateur
git commit -am "…" && git push    # 4. publier
```

## Contenu de `public/`
- `index.html` — l'appli complète (généré, ne pas modifier à la main)
- `piano2/` — sons du piano (Salamander Grand Piano, Alexander Holm, licence CC BY 3.0)
- `kit-musitone.pdf`, `kitp-*.jpg` — kit d'étiquettes pour le piano
- `manifest.webmanifest`, `icons/` — installation sur l'écran d'accueil
- `_headers` — règles de cache pour Cloudflare Pages

## Hébergement (Cloudflare Pages)
- Framework : aucun
- Commande de build : (vide)
- Dossier de sortie : `public` (fixé aussi par `wrangler.toml`)

Chaque envoi sur la branche `main` met le site à jour automatiquement.


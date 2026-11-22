# MusiTone — version web

Prenez une partition en photo : chaque note prend sa couleur MusiTone.

L'appli tient dans `index.html` (HTML + JavaScript). Tout le traitement se fait dans le téléphone ou l'ordinateur : aucun serveur n'est nécessaire.

## Contenu
- `index.html` — l'appli complète
- `piano2/` — sons du piano (Salamander Grand Piano, Alexander Holm, licence CC BY 3.0)
- `kit-musitone.pdf`, `kitp-*.jpg` — kit d'étiquettes pour le piano
- `manifest.webmanifest`, `icons/` — installation sur l'écran d'accueil
- `_headers` — règles de cache pour Cloudflare Pages

## Hébergement (Cloudflare Pages)
- Framework : aucun
- Commande de build : (vide)
- Dossier de sortie : `/`

Chaque envoi sur la branche `main` met le site à jour automatiquement.

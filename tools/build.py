#!/usr/bin/env python3
"""Assemble l'appli MusiTone en un seul fichier HTML.

    python3 tools/build.py            # site en ligne  -> public/index.html
    python3 tools/build.py artifact   # artifact Claude -> dist/artifact.html
    python3 tools/build.py test       # version de test (crochets __mt) -> dist/test.html
    python3 tools/build.py all        # les trois

Le code source est dans src/ :
    template.html   le squelette HTML (balises <!--CSS-->, <!--JS-->, <!--MX-->)
    css/*.css       les styles, assemblés dans l'ordre des numéros
    js/*.js         le code, assemblé dans l'ordre des numéros, dans un seul bloc { ... }
                    (les fichiers partagent les mêmes variables : ce sont des morceaux d'un même script)
    mx/             le lecteur MusiTone vertical (ui.html + 4 scripts)
    web/head.html   balises propres au site (icône, écran d'accueil)
    test/hooks.js   crochets de test, seulement dans la version de test
"""
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# règle propre à l'artifact : le micro y est bloqué, donc « Jouer » est caché
ARTIFACT_CSS = "#dPrac{display:none!important}"


def read(p):
    return Path(p).read_text(encoding="utf-8")


def assemble(target):
    html = read(SRC / "template.html")
    css = "".join(read(f) for f in sorted((SRC / "css").glob("*.css")))
    if target == "artifact":
        css += ARTIFACT_CSS + "\n"
    js = "".join(read(f) for f in sorted((SRC / "js").glob("*.js")))
    if target == "test":
        js = read(SRC / "test" / "hooks.js") + js
    mx = (read(SRC / "mx" / "ui.html") + "\n<script>"
          + "\n".join(read(SRC / "mx" / n) for n in ("assets.js", "engine.js", "vertical.js", "ui.js"))
          + "\n</script>")
    sample = "data:image/png;base64," + base64.b64encode((SRC / "assets" / "sample.png").read_bytes()).decode()
    for mark in ("<!--CSS-->", "<!--JS-->", "<!--MX-->"):
        assert html.count(mark) == 1, mark
    html = html.replace("<!--CSS-->", css).replace("<!--JS-->", js).replace("<!--MX-->", mx)
    assert html.count("__SAMPLE__") == 1
    html = html.replace("__SAMPLE__", sample)
    if target == "web":
        vp = '<meta name="viewport" content="width=device-width, initial-scale=1">'
        assert html.count(vp) == 1
        html = html.replace(vp, read(SRC / "web" / "head.html").strip(), 1)
    if target != "test":
        assert "window.__mt" not in html
    return html


OUT = {"web": ROOT / "public" / "index.html",
       "artifact": ROOT / "dist" / "artifact.html",
       "test": ROOT / "dist" / "test.html"}


def main():
    targets = sys.argv[1:] or ["web"]
    if targets == ["all"]:
        targets = list(OUT)
    for t in targets:
        if t not in OUT:
            sys.exit(f"cible inconnue : {t} (web, artifact, test, all)")
        out = OUT[t]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(assemble(t), encoding="utf-8")
        print(f"{t:9} -> {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()

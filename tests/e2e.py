#!/usr/bin/env python3
"""Parcours d'utilisateur de bout en bout, sur un téléphone simulé (428×926, tactile).

    python3 tests/e2e.py              # tous les parcours
    python3 tests/e2e.py pages jouer  # seulement certains

Chaque parcours vérifie ce qu'un utilisateur verrait, puis qu'aucune erreur JavaScript n'est apparue.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, browser, new_page, open_score, serve  # noqa: E402

HTML = ROOT / "dist" / "test.html"


def is_on(pg, sel, cls="on"):
    return pg.evaluate(f"document.querySelector({sel!r}).classList.contains({cls!r})")


def body_has(pg, cls):
    return pg.evaluate(f"document.body.classList.contains({cls!r})")


# ---------- parcours ----------

def etapes(b, url):
    """Ouverture : étape 1 (portées) puis étape 2 (gamme), puis la partition."""
    pg = new_page(b)
    pg.goto(url + "?staff")
    pg.set_input_files("#file", str(ROOT / "tests/images/bj.png"))
    pg.wait_for_selector("#sf.on", timeout=60000)
    assert "Étape 1" in pg.text_content("#sfTitle")
    pg.click("#sfNext")
    pg.wait_for_selector("#kmDone", state="visible", timeout=60000)
    assert pg.text_content("#kmStep") == "Étape 2 · La gamme"
    assert pg.is_visible("#keyBar"), "le clavier du morceau doit s'afficher à l'étape 2"
    pg.click("#kmDone")
    pg.wait_for_timeout(600)
    assert pg.is_visible("#steps3") and not pg.is_visible("#keyBar")
    return pg


def retour(b, url):
    """Le bouton ‹ de l'étape 1 ramène à l'accueil sans garder la partition."""
    pg = new_page(b)
    pg.goto(url + "?staff")
    pg.set_input_files("#file", str(ROOT / "tests/images/bj.png"))
    pg.wait_for_selector("#sf.on", timeout=60000)
    pg.click("#sfBack")
    pg.wait_for_timeout(800)
    assert body_has(pg, "home")
    return pg


def portees(b, url):
    """Étape 1 : sélection d'une portée par son numéro, suppression (✕), ajout au toucher."""
    pg = new_page(b)
    pg.goto(url + "?staff")
    pg.set_input_files("#file", str(ROOT / "tests/images/bj.png"))
    pg.wait_for_selector("#sf.on", timeout=60000)
    pg.wait_for_timeout(600)
    bb = pg.locator("#sfCv").bounding_box()
    # repère le premier numéro de portée (pastille gris-bleu #3A4360) sur une capture
    from PIL import Image
    pg.screenshot(path="/tmp/mt-portees.png")
    im = Image.open("/tmp/mt-portees.png").convert("RGB")
    x = int(bb["x"] + 16)
    ys = [y for y in range(int(bb["y"]), int(bb["y"] + bb["height"]))
          if all(abs(a - c) < 14 for a, c in zip(im.getpixel((x, y)), (58, 67, 96)))]
    assert ys, "aucun numéro de portée trouvé"
    y = (ys[0] + next((ys[i] for i in range(len(ys) - 1) if ys[i + 1] - ys[i] > 3), ys[-1])) / 2
    pg.mouse.click(x, y)
    pg.wait_for_timeout(200)
    assert pg.text_content("#sfTitle").startswith("Portée 1 sur"), pg.text_content("#sfTitle")
    n0 = int(pg.text_content("#sfTitle").split("sur")[1])
    pg.wait_for_timeout(500)
    pg.mouse.click(x, y)              # le ✕
    pg.wait_for_timeout(500)
    assert "Étape 1" in pg.text_content("#sfTitle"), "la portée doit être supprimée"
    pg.click("#sfPrev")               # « ＋ Ajouter »
    pg.wait_for_timeout(200)
    pg.mouse.click(bb["x"] + bb["width"] * 0.6, y + 5)
    pg.wait_for_timeout(400)
    t = pg.text_content("#sfTitle")
    assert t == f"Portée 1 sur {n0}", t
    return pg


def correction(b, url):
    """Corriger une note, puis changer d'écran : le panneau se ferme."""
    pg = new_page(b)
    open_score(pg, url, "bj.png")
    vb = pg.locator("#view").bounding_box()
    for k in range(30):
        pg.mouse.click(vb["x"] + 100 + k * 7, vb["y"] + 180 + k * 3)
        pg.wait_for_timeout(150)
        if is_on(pg, "#pal"):
            break
    assert is_on(pg, "#pal"), "le panneau de correction doit s'ouvrir"
    pg.click("#pLeg")
    assert body_has(pg, "showLeg")
    pg.click("#vsw [data-v=m]", force=True)
    pg.wait_for_timeout(800)
    assert not is_on(pg, "#pal") and not body_has(pg, "showLeg")
    return pg


def cle(b, url):
    """Changement de clé depuis le menu Corriger : le mode reste actif jusqu'à un autre bouton."""
    pg = new_page(b)
    open_score(pg, url, "bj.png")
    pg.click("#dFix")
    pg.click("#cClef")
    assert body_has(pg, "clefmode")
    vb = pg.locator("#view").bounding_box()
    pg.mouse.click(vb["x"] + 260, vb["y"] + 120)
    pg.wait_for_timeout(300)
    assert body_has(pg, "clefmode"), "le mode doit rester actif après un changement"
    pg.click("#dPlay")
    pg.wait_for_timeout(300)
    assert not body_has(pg, "clefmode")
    return pg


def lecture(b, url):
    """Écoute, puis toucher la partition fait repartir la lecture à cet endroit."""
    pg = new_page(b)
    open_score(pg, url, "bj.png")
    pg.click("#dPlay")
    pg.wait_for_timeout(2500)
    p0 = pg.evaluate("__mt.pl()")
    assert p0 and p0["b"] > 0.5, p0
    vb = pg.locator("#view").bounding_box()
    # au début de l'écoute la vue est en haut de la page : le milieu de l'écran est une ligne plus loin
    # (le panneau de lecture couvre le bas de l'écran)
    pg.touchscreen.tap(vb["x"] + vb["width"] * 0.5, vb["y"] + vb["height"] * 0.5)
    pg.wait_for_timeout(600)
    p1 = pg.evaluate("__mt.pl()")
    assert p1["b"] > p0["b"] + 6, (p0, p1)
    return pg


def pages(b, url):
    """Plusieurs photos : étape 1 pour chaque page, puis étape 2 ; lecture enchaînée sans pause."""
    pg = new_page(b)
    pg.goto(url + "?staff")
    pg.set_input_files("#file", [str(ROOT / "tests/images" / f) for f in ("t2.png", "arp.png", "t2.png")])
    for i in range(3):
        pg.wait_for_selector("#sf.on", timeout=60000)
        pg.wait_for_timeout(400)
        assert f"Page {i + 1} sur 3" in pg.text_content("#sfTitle"), pg.text_content("#sfTitle")
        pg.click("#sfNext")
        pg.wait_for_timeout(1200)
    pg.wait_for_selector("#kmDone", state="visible", timeout=30000)
    assert pg.text_content("#pageLbl").startswith("1")
    pg.click("#kmDone")
    pg.wait_for_timeout(800)
    pg.evaluate("__mt.setBpm(240)")
    pg.evaluate("__mt.ps(0)")
    seen = set()
    for _ in range(40):
        pg.wait_for_timeout(500)
        if not pg.evaluate("!!__mt.pl()"):
            break
        seen.add(pg.text_content("#pageLbl"))
    assert {"1/3", "2/3", "3/3"} <= seen, seen
    return pg


def export_pdf(b, url):
    pg = new_page(b, downloads=True)
    open_score(pg, url, "bj.png")
    pg.click("#expPng")
    with pg.expect_download(timeout=60000) as d:
        pg.click("#expPop [data-a=pdf]")
    assert d.value.suggested_filename.endswith(".pdf")
    return pg


def jouer(b, url):
    """« Jouer » avec un micro simulé : écoute, avance avec Passer, toucher la partition déplace l'élève."""
    pg = new_page(b)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    pg.wait_for_timeout(1500)
    assert pg.text_content("#prMicT") == "J'écoute votre piano"
    pos = lambda: int(pg.text_content("#prPos").split("/")[0])
    k0 = pos()
    pg.click("#prSkip")
    # le micro simulé émet un bip qui peut lui aussi faire avancer : on vérifie seulement que ça avance
    assert pos() > k0, "Passer doit avancer"
    assert pg.inner_html("#prHeardN").strip(), "la note entendue doit s'afficher"
    vb = pg.locator("#view").bounding_box()
    pg.mouse.click(vb["x"] + 300, vb["y"] + 100)
    pg.wait_for_timeout(300)
    assert not is_on(pg, "#pal"), "« Jouer » ne doit pas ouvrir la correction"
    pg.click("#prX")
    assert not body_has(pg, "practice")
    return pg


ALL = [etapes, retour, portees, correction, cle, lecture, pages, export_pdf, jouer]


def main():
    wanted = sys.argv[1:]
    todo = [f for f in ALL if not wanted or f.__name__ in wanted]
    failed = 0
    with serve(HTML.parent) as base:
        url = f"{base}/{HTML.name}"
        for f in todo:
            with browser(mic=(f is jouer)) as b:
                try:
                    pg = f(b, url)
                    assert not pg.errors, pg.errors
                    print(f"  OK      {f.__name__:12} {f.__doc__.strip().splitlines()[0] if f.__doc__ else ''}")
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    print(f"  ÉCHEC   {f.__name__:12} {type(e).__name__}: {str(e)[:300]}")
    if failed:
        sys.exit(f"{failed} parcours en échec")


if __name__ == "__main__":
    main()

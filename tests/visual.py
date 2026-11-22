#!/usr/bin/env python3
"""Compare deux versions de l'appli écran par écran (captures + écart de pixels).

    python3 tests/visual.py ANCIEN.html NOUVEAU.html

Utile après un remaniement du code : les deux versions doivent afficher la même chose.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

sys.path.insert(0, str(Path(__file__).parent))
from common import browser, new_page, open_score, serve  # noqa: E402

OUT = Path("/tmp/musitone-visual")


def screens(url, tag):
    shots = []
    with browser() as b:
        pg = new_page(b)
        pg.emulate_media(reduced_motion="reduce")

        def shot(name):
            pg.wait_for_timeout(900)
            p = OUT / f"{name}-{tag}.png"
            pg.screenshot(path=str(p))
            shots.append((name, p))

        pg.goto(url)
        shot("1-accueil")
        pg.goto(url + "?staff")
        pg.set_input_files("#file", str(Path(__file__).parent / "images" / "bj.png"))
        pg.wait_for_selector("#sf.on", timeout=60000)
        shot("2-etape1")
        pg.click("#sfNext")
        pg.wait_for_selector("#kmDone", state="visible", timeout=60000)
        shot("3-etape2")
        pg.click("#kmDone")
        pg.wait_for_timeout(800)
        if pg.is_visible("#cOk"):
            pg.click("#cOk")
        shot("4-partition")
        pg.click("#dFix")
        shot("5-menu-corriger")
        pg.click("#cOk")
        pg.click("#expPng")
        shot("6-exporter")
        pg.click("#expPng")
        pg.click("#vsw [data-v=m]", force=True)
        shot("7-vue-musitone")
        errors = list(pg.errors)
    return shots, errors


def main():
    a, b = (Path(x).resolve() for x in sys.argv[1:3])
    OUT.mkdir(exist_ok=True)
    with serve(a.parent) as ua, serve(b.parent) as ub:
        sa, ea = screens(f"{ua}/{a.name}", "a")
        sb, eb = screens(f"{ub}/{b.name}", "b")
    worst = 0
    for (name, pa), (_, pb) in zip(sa, sb):
        ia, ib = Image.open(pa).convert("RGB"), Image.open(pb).convert("RGB")
        d = ImageChops.difference(ia, ib).convert("L")
        changed = sum(d.histogram()[25:]) / (d.width * d.height)
        worst = max(worst, changed)
        print(f"  {'OK ' if changed < 0.002 else 'ÉCART'}  {name:18} {changed * 100:.3f} % de pixels différents")
    print("erreurs JS :", ea, eb)
    if worst >= 0.002 or ea or eb:
        sys.exit("les deux versions n'affichent pas la même chose")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Test de non-régression de la lecture : pour chaque partition de tests/images,
on relève ce que l'appli a lu (portées, clés, notes, gamme, morceau joué) et on le compare
à la référence enregistrée dans tests/golden/.

    python3 tests/golden.py            # compare à la référence
    python3 tests/golden.py --update   # enregistre la version actuelle comme référence
    python3 tests/golden.py --html chemin/vers/test.html   # teste un autre fichier
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, browser, new_page, open_score, serve  # noqa: E402

GOLDEN = ROOT / "tests" / "golden"
CASES = ["bj.png", "t2.png", "arp.png", "low.png", "low2.png", "photo_table.jpg", "rot_b.jpg",
         "fifre_sys.png", "curved.png", "t6.png", "t10.png", "vb_t4.jpg"]

READ = """() => {
  const r = v => Math.round(v * 10) / 10;
  return __mt.pages().map(pg => ({
    W: pg.W, H: pg.H,
    staves: (pg.staves || []).map(s => [r(s.top), r(s.bot), r(s.x0), r(s.x1), (s.clefs || []).map(c => c.c).join("")]),
    ksig: pg.ksig ? [pg.ksig.n, !!pg.ksig.flat] : null,
    notes: (pg.notes || []).map(n => [r(n.x), r(n.y), __mt.letterOf(n), n.kind || "", n.dur || ""]),
  }));
}"""
SONG = """() => { const S = __mt.song(); const r = v => Math.round(v * 1000) / 1000;
  return {len: r(S.len), ev: S.ev.map(e => [r(e.t), e.m, r(e.dur), e.hand ? 1 : 0])}; }"""


def snapshot(url, case):
    with browser() as b:
        pg = new_page(b)
        open_score(pg, url, case)
        pg.wait_for_timeout(500)
        data = {"pages": pg.evaluate(READ), "song": pg.evaluate(SONG), "key": pg.text_content("#kbT"),
                "errors": pg.errors}
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--html", default=str(ROOT / "dist" / "test.html"))
    ap.add_argument("cases", nargs="*")
    a = ap.parse_args()
    html = Path(a.html).resolve()
    GOLDEN.mkdir(parents=True, exist_ok=True)
    failed = 0
    with serve(html.parent) as base:
        for case in a.cases or CASES:
            data = snapshot(f"{base}/{html.name}", case)
            ref = GOLDEN / (case + ".json")
            if a.update:
                ref.write_text(json.dumps(data, ensure_ascii=False, indent=0))
                print(f"  enregistré  {case}: {sum(len(p['notes']) for p in data['pages'])} notes, {data['key']}")
                continue
            want = json.loads(ref.read_text())
            if data == want:
                print(f"  OK          {case}")
            else:
                failed += 1
                diff = [k for k in data if data[k] != want.get(k)]
                print(f"  DIFFÉRENT   {case}: {', '.join(diff)}")
    if failed:
        sys.exit(f"{failed} partition(s) lue(s) différemment")


if __name__ == "__main__":
    main()

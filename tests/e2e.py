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
    assert pg.inner_text("#staffSteps [aria-current=step]").strip().endswith("Portées")
    pg.click("#sfNext")
    pg.wait_for_selector("#kmDone", state="visible", timeout=60000)
    assert pg.text_content("#kmStep") == "Étape 2 · La gamme"
    assert pg.is_visible('#steps3 [data-s="2"][aria-current=step]')
    assert pg.is_visible("#keyBar"), "le clavier du morceau doit s'afficher à l'étape 2"
    pg.click("#kmDone")
    pg.wait_for_timeout(600)
    assert pg.is_visible('#steps3 [data-s="3"][aria-current=step]') and not pg.is_visible("#keyBar")
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
    pg.wait_for_function("() => (__mt.pl()?.b ?? 0) > 0.5", timeout=20000)
    p0 = pg.evaluate("__mt.pl()")
    vb = pg.locator("#view").bounding_box()
    # au début de l'écoute la vue est en haut de la page : le milieu de l'écran est une ligne plus loin
    # (le panneau de lecture couvre le bas de l'écran)
    pg.touchscreen.tap(vb["x"] + vb["width"] * 0.5, vb["y"] + vb["height"] * 0.5)
    pg.wait_for_function("beat => (__mt.pl()?.b ?? 0) > beat + 6", arg=p0["b"], timeout=3000)
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


def jouer_ligne(b, url):
    """En zoom, Jouer revient à gauche et descend jusqu'à la ligne suivante."""
    pg = new_page(b)
    open_score(pg, url, "arp.png")
    pg.evaluate("""() => {
        for (let i = 0; i < 3; i++) document.querySelector("#zin").click();
    }""")
    steps = pg.evaluate("""() => {
        const song = __mt.sn();
        const beats = [...new Set(song.ev.map(e => e.t))];
        const first = beats.findIndex(t => t >= (song.sys[1]?.t0 ?? Infinity));
        if (first < 1) return null;
        const before = song.ev.find(e => e.t === beats[first - 1]).n;
        const after = song.ev.filter(e => e.t === beats[first]).map(e => e.n);
        return {first, before: {x: before.x, y: before.y}, after: after.map(n => ({x: n.x, y: n.y}))};
    }""")
    assert steps
    pg.click("#dPrac")
    pg.evaluate("""({first, before}) => {
        const skip = document.querySelector("#prSkip");
        for (let i = 1; i < first; i++) skip.click();
        const view = document.querySelector("#view");
        const canvas = document.querySelector("#cv");
        const page = __mt.pages()[0];
        view.scrollTo({left: before.x * canvas.clientWidth / page.W - 80,
                       top: before.y * canvas.clientHeight / page.H - 60, behavior: "instant"});
    }""", steps)
    pg.wait_for_timeout(550)
    before = pg.evaluate("() => [document.querySelector('#view').scrollLeft, document.querySelector('#view').scrollTop]")
    pg.click("#prSkip")
    pg.wait_for_function("""({after, before}) => {
        const view = document.querySelector("#view");
        const r = document.querySelector("#cv").getBoundingClientRect();
        const v = view.getBoundingClientRect();
        const page = __mt.pages()[0];
        const bottom = Math.min(v.bottom, document.querySelector("#prPanel").getBoundingClientRect().top);
        return view.scrollLeft < before[0] && view.scrollTop > before[1] && after.every(n => {
            const x = r.left + n.x * r.width / page.W, y = r.top + n.y * r.height / page.H;
            return x >= v.left && x <= v.right && y >= v.top && y <= bottom;
        });
    }""", arg={"after": steps["after"], "before": before}, timeout=2500)
    assert pg.inner_text("#prPos").startswith(f"{steps['first'] + 1} /")
    return pg


def structure(b, url):
    """Les trois panneaux se ferment de la même façon sur un écran étroit."""
    pg = new_page(b)
    pg.set_viewport_size({"width": 360, "height": 800})
    open_score(pg, url, "bj.png")

    assert pg.evaluate("""() => Array.from(document.querySelectorAll('#dock button')).every(button => {
        const label = button.querySelector('span').getBoundingClientRect();
        const bounds = button.getBoundingClientRect();
        return label.left >= bounds.left && label.right <= bounds.right;
    })""")
    pg.click('#steps3 [data-s="2"]')
    assert pg.is_visible('#steps3 [data-s="2"][aria-current=step]')
    pg.click('#steps3 [data-s="3"]')
    assert pg.is_visible('#steps3 [data-s="3"][aria-current=step]')

    def finish(panel, title, done):
        region = pg.get_by_role("region", name=title, exact=True)
        assert region.is_visible()
        button = region.get_by_role("button", name="Terminé", exact=True)
        bounds = button.bounding_box()
        head = pg.locator(panel + " .modeHead").bounding_box()
        assert bounds["height"] >= 44 and bounds["x"] + bounds["width"] <= 360
        assert abs(bounds["y"] - head["y"]) <= 1
        pg.click(done)
        pg.wait_for_selector(panel, state="hidden")
        assert pg.is_visible('#steps3 [data-s="3"][aria-current=step]')

    pg.click("#dPlay")
    pg.wait_for_selector("#plBar")
    pg.click("#plPause")
    finish("#plBar", "Lecture", "#plStop")

    pg.click("#dPrac")
    finish("#prPanel", "Jouer", "#prX")

    pg.click("#dFix")
    assert pg.inner_text("#coach .modeHead b") == "Correction"
    pg.click("#cOk")
    point = pg.evaluate("""() => {
        const r = document.querySelector('#cv').getBoundingClientRect();
        const visible = document.querySelector('#view').getBoundingClientRect();
        const page = __mt.pages()[0];
        return page.notes.map(n => [r.left + n.x * r.width / page.W, r.top + n.y * r.height / page.H])
          .find(([x, y]) => x > 45 && x < visible.right - 65 && y > visible.top + 30 && y < visible.bottom - 110);
    }""")
    assert point
    pg.touchscreen.tap(*point)
    pg.wait_for_selector("#pal.on")
    finish("#pal", "Correction", "#pX")
    return pg


def micro_wav():
    """Faux micro : E4 (à 2 s), puis A2 (faux, à 4 s), puis C5 (à 7 s), avec les vrais sons de piano."""
    import subprocess, tempfile
    out = Path(tempfile.gettempdir()) / "musitone_micro.wav"
    p2 = ROOT / "public" / "piano2"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", p2 / "Ds4v13.mp3", "-i", p2 / "A2v13.mp3", "-i", p2 / "C5v13.mp3",
                    "-filter_complex", "[0]asetrate=44100*1.059463,aresample=48000,adelay=2000|2000[a];[1]adelay=4000|4000[b];"
                    "[2]adelay=7000|7000[c];[a][b][c]amix=inputs=3:normalize=0,volume=0.6,afade=t=out:st=9:d=1,apad=whole_dur=11",
                    "-ac", "1", "-ar", "48000", "-t", "11", out], check=True)
    return str(out)


def jouer_micro(b, url):
    """« Jouer » avec un vrai son de piano au micro : la note juste fait avancer, une fausse non ; la note s'affiche avec son octave."""
    pg = new_page(b)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    pg.evaluate("""() => { window.__log = []; let last = '';
      setInterval(() => { const t = document.getElementById('prHeardN').innerText.replace(/\\s+/g, ' ') + ' @ ' + document.getElementById('prPos').innerText;
        if (t !== last) { last = t; window.__log.push(t); } }, 50); }""")
    pg.wait_for_timeout(300)
    pg.click("#prSkip")  # 2e note de la partition : E4
    assert pg.inner_text("#prNeed").split() == ["E4"]
    pg.wait_for_timeout(9500)
    log = pg.evaluate("window.__log")
    assert any(l.startswith("E4 @ 3 /") for l in log), log  # E4 entendu, on passe à la note 3
    assert any(l.startswith("A2 @ 3 /") for l in log), log  # A2 entendu mais faux : on reste
    assert any(l.startswith("C5 @ 3 /") for l in log), log  # C5 n'est pas demandé : on reste
    assert not any(l.split(" @ ")[0] not in ("—", "E4", "A2", "C5") for l in log), log  # aucune note fantôme
    return pg


def jouer_micro_relance(b, url):
    """Un micro coupé affiche son état et un nouveau flux valide la note."""
    pg = new_page(b)
    pg.add_init_script("""(() => {
        const devices = navigator.mediaDevices;
        const capture = devices.getUserMedia.bind(devices);
        window.testTracks = [];
        devices.getUserMedia = async options => {
            const stream = await capture(options);
            window.testTracks.push(stream.getAudioTracks()[0]);
            return stream;
        };
    })();""")
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    pg.wait_for_selector("#prMic.live")
    pg.evaluate("""() => {
        const track = window.testTracks[0];
        Object.defineProperty(track, "muted", {value: true, configurable: true});
        track.dispatchEvent(new Event("mute"));
    }""")
    assert "en pause" in pg.inner_text("#prMicT")
    pg.evaluate("""() => {
        const track = window.testTracks[0];
        delete track.muted;
        track.dispatchEvent(new Event("unmute"));
    }""")
    pg.wait_for_selector("#prMic.live")
    pg.evaluate("""() => {
        const track = window.testTracks[0];
        track.stop();
        track.dispatchEvent(new Event("ended"));
    }""")
    assert "arrêté" in pg.inner_text("#prMicT")
    pg.click("#prSkip")
    assert pg.inner_text("#prNeed").split() == ["E4"]
    pg.click("#prMic")
    pg.wait_for_selector("#prMic.live")
    assert pg.evaluate("testTracks.map(t => t.readyState)") == ["ended", "live"]
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('3 /')", timeout=6000)
    assert pg.inner_text("#prHeardN").split() == ["E4"]
    pg.click("#prX")
    assert pg.evaluate("testTracks.every(t => t.readyState === 'ended')")
    return pg


def justesse_wav(octave=4):
    note = f"E{octave}"
    cents = 22
    return chords_wav(
        f"musitone_justesse_{octave}.wav",
        {note: (f"Ds{octave}", 1 + cents / 100, 0.4)},
        [(2000, [note])],
    )


def verifier_justesse(b, url, note):
    pg = new_page(b)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    pg.click("#prSkip")
    assert pg.inner_text("#prNeed").split() == ["E4"]
    pg.wait_for_function("document.querySelector('#prTuneValue').textContent.includes('Trop aigu')", timeout=6000)
    text = pg.inner_text("#prTuneValue")
    assert text.startswith(note) and "(+" in text, text
    assert 50 < float(pg.locator("#prTuneMark").evaluate("marker => parseFloat(marker.style.left)")) < 90
    assert pg.locator("#prHeardN span.ok").inner_text() == note
    assert pg.inner_text("#prPos").startswith("3 /")
    return pg


def jouer_justesse(b, url):
    """Un E4 aigu affiche une valeur positive et un repère à droite."""
    return verifier_justesse(b, url, "E4")


def jouer_octave_libre(b, url):
    """Le Mi3 valide un Mi4 demandé et la jauge évalue la justesse du Mi3."""
    return verifier_justesse(b, url, "E3")


def rapide_wav():
    notes = ["C4", "Ds4", "Fs4", "A4", "C5"]
    return chords_wav(
        "musitone_rapide.wav",
        {note: (note, 0, 0.4) for note in notes},
        [(2000 + i * 180, [note]) for i, note in enumerate(notes)],
    )


def jouer_rapide(b, url):
    """Cinq notes espacées de 180 ms avancent de cinq positions."""
    pg = new_page(b)

    def excerpt(route):
        response = route.fetch()
        html = response.text()
        start = html.index("function prGroups()")
        end = html.index("const prName", start)
        body = html[start:end]
        body = body.replace(".map(([k, evs]) => {", ".map(([k, evs], i) => {")
        body = body.replace("const ms = [...new Set", "const ms = i < 5 ? [[60, 63, 66, 69, 72][i]] : [...new Set")
        route.fulfill(response=response, body=html[:start] + body + html[end:])

    pg.route("**/test.html", excerpt)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    assert pg.inner_text("#prNeed").split() == ["C4"]
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('6 /')", timeout=6500)
    assert pg.inner_text("#prHeardN").split() == ["C5"]
    return pg


def jouer_micro_bref(b, url):
    """Une note reconnue sur plusieurs images fait avancer malgré une fin de signal incertaine."""
    pg = new_page(b)

    def inject_pitch_frames(route):
        response = route.fetch()
        html = response.text()
        marker = "function pitchTracker(sr, n) {"
        assert html.count(marker) == 1
        html = html.replace(
            marker,
            "let pitchTestFrames = 0;\n"
            "pitchDetect = () => ++pitchTestFrames <= 2 ? [{m: 64}] : [];\n" + marker,
            1,
        )
        route.fulfill(response=response, body=html)

    pg.route("**/test.html", inject_pitch_frames)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    pg.click("#prSkip")
    assert pg.inner_text("#prNeed").split() == ["E4"]
    pg.wait_for_function("document.querySelector('#prHeardN').textContent === 'E4'", timeout=5000)
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('3 /')", timeout=5000)
    assert pg.inner_text("#prHeardN").split() == ["E4"]
    return pg


def chords_wav(name, samples, attempts, echo=False):
    import subprocess
    import tempfile

    out = Path(tempfile.gettempdir()) / name
    p2 = ROOT / "public" / "piano2"
    cmd = ["ffmpeg", "-loglevel", "error", "-y"]
    filters = []
    for delay, notes in attempts:
        for note in notes:
            sample, semitones, gain = samples[note]
            i = len(filters)
            cmd += ["-i", str(p2 / f"{sample}v13.mp3")]
            filters.append(
                f"[{i}]asetrate=44100*{2 ** (semitones / 12):.8f},aresample=48000,"
                f"atrim=duration=1.2,afade=t=out:st=0.9:d=0.3,volume={gain},adelay={delay}[n{i}]"
            )
    inputs = "".join(f"[n{i}]" for i in range(len(filters)))
    room = ",aecho=0.8:0.85:31|67|103|149:0.35|0.24|0.19|0.16" if echo else ""
    filters.append(f"{inputs}amix=inputs={len(filters)}:normalize=0{room},apad=whole_dur=9")
    subprocess.run(cmd + ["-filter_complex", ";".join(filters), "-ac", "1", "-ar", "48000", str(out)], check=True)
    return str(out)


def accord_wav():
    return chords_wav(
        "musitone_accord.wav",
        {"E4": ("Ds4", 1, 0.4), "A4": ("A4", 0, 0.32), "F5": ("Ds5", 2, 0.32), "B4": ("A4", 2, 0.32)},
        [(2000, ["E4", "A4"]), (4200, ["E4", "A4", "F5", "B4"]), (6500, ["E4", "A4", "F5"])],
    )


def deux_mains_wav():
    return chords_wav(
        "musitone_deux_mains.wav",
        {"D3": ("C3", 2, 0.4), "G3": ("Fs3", 1, 0.18), "B3": ("A3", 2, 0.32),
         "F4": ("Ds4", 2, 0.32), "G4": ("Fs4", 1, 0.32)},
        [(2000, ["D3", "B3", "F4"]), (4200, ["D3", "G4", "B3", "F4"])],
    )


def jouer_deux_mains(b, url):
    """L'accord incomplet est refusé et un Sol à une autre octave valide l'accord complet."""
    pg = new_page(b)
    open_score(pg, url, "low.png")
    assert pg.evaluate("new Set(__mt.sn().ev.filter(e => e.t === 0).map(e => !!e.hand)).size") == 2
    pg.click("#dPrac")
    assert pg.inner_text("#prNeed").split() == ["D3", "G3", "B3", "F4"]
    pg.wait_for_function("document.querySelectorAll('#prHeardN span').length === 3", timeout=9000)
    assert sorted(pg.locator("#prHeardN span").all_text_contents()) == ["B3", "D3", "F4"]
    assert pg.inner_text("#prPos").startswith("1 /")
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('2 /')", timeout=9000)
    assert sorted(pg.locator("#prHeardN span.ok").all_text_contents()) == ["B3", "D3", "F4", "G4"]
    return pg


def octave_mains_wav():
    return chords_wav(
        "musitone_octave_mains.wav",
        {"C3": ("C3", 0, 0.4), "E3": ("Ds3", 1, 0.32), "C4": ("C4", 0, 0.32)},
        [(2000, ["C3", "E3"]), (6500, ["C3", "E3", "C4"])],
    )


def jouer_octave_mains(b, url):
    """Un seul Do ne suffit pas quand deux Do sont écrits dans le même accord."""
    pg = new_page(b)

    def excerpt(route):
        response = route.fetch()
        html = response.text()
        start = html.index("function prGroups()")
        marker = "  for (const e of S.ev) {"
        i = html.index(marker, start) + len(marker)
        # Le premier accord de t2.png contient aussi G3. Reprendre les trois notes de la capture.
        route.fulfill(response=response, body=html[:i] + "\n    if (e.t === 0 && e.m === 55) continue;" + html[i:])

    pg.route("**/test.html", excerpt)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    assert pg.inner_text("#prNeed").split() == ["C3", "E3", "C4"]
    pg.wait_for_timeout(5400)  # Accord incomplet passé, avant le C4 à 6,5 s.
    assert pg.inner_text("#prPos").startswith("1 /")
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('2 /')", timeout=6500)
    assert sorted(pg.locator("#prHeardN span").all_text_contents()) == ["C3", "C4", "E3"]
    return pg


def allegretto_wav():
    return chords_wav(
        "musitone_allegretto.wav",
        {"G3": ("Fs3", 1, 0.5), "B4": ("A4", 2, 0.4), "G4": ("Fs4", 1, 0.325)},
        [(2000, ["G3", "B4"]),
         (6500, ["G3", "B4"]), (6520, ["G4"])],
    )


def jouer_allegretto(b, url):
    pg = new_page(b)

    def excerpt(route):
        response = route.fetch()
        html = response.text()
        start = html.index("function prGroups()")
        marker = "  for (const e of S.ev) {"
        i = html.index(marker, start) + len(marker)
        # Transpose les trois notes du premier accord de t2.png vers celles de l'Allegretto.
        injected = "\n    if (e.t === 0 && e.m === 55) continue;\n    if (e.t === 0) e.m = ({48: 55, 52: 71, 60: 67})[e.m] ?? e.m;"
        route.fulfill(response=response, body=html[:i] + injected + html[i:])

    pg.route("**/test.html", excerpt)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    assert pg.inner_text("#prNeed").split() == ["G3", "G4", "B4"]
    pg.wait_for_timeout(5400)
    assert pg.inner_text("#prPos").startswith("1 /")
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('2 /')", timeout=6500)
    assert sorted(pg.locator("#prHeardN span").all_text_contents()) == ["B4", "G3", "G4"]
    return pg


def deux_notes_wav():
    return chords_wav(
        "musitone_deux_notes.wav",
        {"C3": ("C3", 0, 0.5), "G3": ("Fs3", 1, 0.25), "Gs3": ("Fs3", 2, 0.25)},
        [(2000, ["C3"]), (4200, ["C3", "Gs3"]), (6500, ["C3"]), (6525, ["G3"])],
    )


def jouer_deux_notes(b, url):
    """Do et Sol doux font avancer. Do seul et Do + Sol dièse sont refusés."""
    pg = new_page(b)

    def excerpt(route):
        response = route.fetch()
        html = response.text()
        start = html.index("function prGroups()")
        marker = "  for (const e of S.ev) {"
        i = html.index(marker, start) + len(marker)
        # Garde Do3 et Sol3 dans le premier accord de t2.png.
        injected = "\n    if (e.t === 0 && e.m !== 48 && e.m !== 55) continue;"
        route.fulfill(response=response, body=html[:i] + injected + html[i:])

    pg.route("**/test.html", excerpt)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    assert pg.inner_text("#prNeed").split() == ["C3", "G3"]
    pg.wait_for_function("document.querySelector('#prHeardN').textContent === 'C3'", timeout=5000)
    pg.wait_for_timeout(3200)
    assert pg.inner_text("#prPos").startswith("1 /")
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('2 /')", timeout=6500)
    assert sorted(pg.locator("#prHeardN span.ok").all_text_contents()) == ["C3", "G3"]
    return pg


def accord_resonant_wav():
    return chords_wav(
        "musitone_accord_resonant.wav",
        {"C4": ("C4", 0, 0.33), "G3": ("Fs3", 1, 0.38),
         "B3": ("A3", 2, 0.13), "D4": ("C4", 2, 0.38)},
        [(2000, ["C4"]), (2340, ["G3"]), (2357, ["D4"]),
         (6150, ["C4"]), (6490, ["G3"]), (6498, ["B3"]), (6507, ["D4"])],
        echo=True,
    )


def jouer_accord_resonant(b, url):
    """Un accord de Sol complet avance malgré l'écho du Do précédent."""
    pg = new_page(b)

    def excerpt(route):
        response = route.fetch()
        html = response.text()
        start = html.index("function prGroups()")
        marker = "  for (const e of S.ev) {"
        i = html.index(marker, start) + len(marker)
        injected = """
    if (e.t === 0) {
      if (e.m === 55) continue;
      e.m = ({48: 55, 52: 59, 60: 62})[e.m] ?? e.m;
    }"""
        route.fulfill(response=response, body=html[:i] + injected + html[i:])

    pg.route("**/test.html", excerpt)
    open_score(pg, url, "t2.png")
    pg.click("#dPrac")
    assert pg.inner_text("#prNeed").split() == ["G3", "B3", "D4"]
    pg.wait_for_timeout(4600)
    assert pg.inner_text("#prPos").startswith("1 /")
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('2 /')", timeout=6000)
    assert sorted(pg.locator("#prHeardN span.ok").all_text_contents()) == ["B3", "D4", "G3"]
    return pg


def jouer_accord(b, url):
    """Le micro valide seulement l'accord complet, sans note en trop."""
    pg = new_page(b)
    open_score(pg, url, "arp.png")
    pg.click("#dPrac")
    for _ in range(4):
        pg.click("#prSkip")
    assert pg.inner_text("#prNeed").split() == ["E4", "A4", "F5"]
    assert pg.inner_text("#prPos").startswith("5 /")
    for notes in [["E4", "A4"], ["E4", "A4", "B4", "F5"]]:
        pg.wait_for_function(
            """expected => {
                const notes = Array.from(document.querySelectorAll('#prHeardN span'), n => n.textContent).sort();
                return JSON.stringify(notes) === JSON.stringify(expected);
            }""",
            arg=sorted(notes),
        )
        pg.wait_for_timeout(350)
        assert pg.inner_text("#prPos").startswith("5 /"), pg.inner_text("#prHeardN")
    pg.wait_for_function("document.querySelector('#prPos').textContent.startsWith('6 /')")
    assert sorted(n.replace(" ", "") for n in pg.locator("#prHeardN span").all_text_contents()) == ["A4", "E4", "F5"]
    return pg


jouer_allegretto.mic = allegretto_wav
jouer_accord.mic = accord_wav
jouer_accord_resonant.mic = accord_resonant_wav
jouer_deux_mains.mic = deux_mains_wav
jouer_octave_mains.mic = octave_mains_wav
jouer_deux_notes.mic = deux_notes_wav

jouer_rapide.mic = rapide_wav
jouer_justesse.mic = justesse_wav
jouer_octave_libre.mic = lambda: justesse_wav(3)
jouer_micro.mic = micro_wav
jouer_micro_relance.mic = micro_wav
jouer_micro_bref.mic = micro_wav
ALL = [etapes, retour, portees, correction, cle, lecture, pages, export_pdf, jouer, jouer_micro, jouer_micro_relance, jouer_micro_bref, jouer_justesse, jouer_octave_libre, jouer_rapide, jouer_accord, jouer_deux_mains, jouer_octave_mains, jouer_allegretto, jouer_deux_notes, jouer_ligne, jouer_accord_resonant, structure]


def main():
    wanted = sys.argv[1:]
    todo = [f for f in ALL if not wanted or f.__name__ in wanted]
    failed = 0
    with serve(HTML.parent) as base:
        url = f"{base}/{HTML.name}"
        for f in todo:
            with browser(mic=(f.mic() if hasattr(f, "mic") else f in (jouer, structure))) as b:
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

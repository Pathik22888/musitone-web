"""Outils partagés par les tests : serveur local, navigateur, ouverture d'une partition."""
import contextlib
import http.server
import socketserver
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "tests" / "images"
CHROME = "/usr/bin/google-chrome"
VIEWPORT = {"width": 428, "height": 926}


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@contextlib.contextmanager
def serve(directory, port=0):
    """Sert un dossier en local ; renvoie l'adresse de base."""
    handler = partial(_Quiet, directory=str(directory))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), handler) as httpd:
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        try:
            yield f"http://127.0.0.1:{httpd.server_address[1]}"
        finally:
            httpd.shutdown()


@contextlib.contextmanager
def browser(mic=False):
    args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
    if mic:
        args += ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=args)
        try:
            yield b
        finally:
            b.close()


def new_page(b, touch=True, scale=1, downloads=False):
    pg = b.new_page(viewport=VIEWPORT, has_touch=touch, is_mobile=touch,
                    device_scale_factor=scale, accept_downloads=downloads)
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    return pg


def open_score(pg, url, files, steps=True, timeout=60000):
    """Ouvre une ou plusieurs images, passe le recadrage, l'étape 1 et l'étape 2 sans rien changer."""
    pg.goto(url)
    pg.set_input_files("#file", [str(IMAGES / f) for f in ([files] if isinstance(files, str) else files)])
    if not steps:
        return
    idle = 0
    for _ in range(timeout // 500):
        if pg.is_visible("#kmDone"):
            pg.wait_for_timeout(300)
            pg.click("#kmDone")
            pg.wait_for_timeout(600)
            break
        if pg.is_visible("#crOk"):
            pg.click("#crOk")
        elif pg.evaluate("document.getElementById('sf').classList.contains('on')"):
            pg.click("#sfNext")
        # pas d'étape 2 (aucune note lue, par exemple) : on s'arrête quand l'écran de travail est prêt et calme
        busy = pg.evaluate("document.getElementById('busy').classList.contains('on')||document.body.classList.contains('home')")
        idle = 0 if busy else idle + 1
        if idle >= 12:
            break
        pg.wait_for_timeout(500)
    if pg.is_visible("#cOk"):
        pg.click("#cOk")

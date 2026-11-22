/* iPhone : la mémoire des images est limitée ; avec plusieurs pages, on ne garde en grand que la page affichée (les autres sont refaites à la demande) */
function freePg(pg, force) {
  if (!pg || pg._busy || (!force && pg === pages[cur])) return;
  if (pg.cv) {
    try {
      pg.cv.width = pg.cv.height = 0;
    } catch (e) {}
  }
  pg.cv = null;
  pg.baseData = null;
}
async function show(i, o) {
  const tok = (show.tok = (show.tok || 0) + 1);
  closeTransient();
  if (!(o && o.keepPlay))
    try {
      playStop();
    } catch (e) {}
  closeSheet();
  const prev = pages[cur];
  if (prev && prev !== pages[i]) freePg(prev, true);
  cur = i;
  const pg = pages[i];
  $("busy").classList.add("on");
  await tick();
  pg._busy = true;
  try {
    await readyOnce(pg);
    if (!pg.cv) await ensureBase(pg);
  } catch (e) {
    pg._busy = false;
    if (tok !== show.tok) return;
    $("busy").classList.remove("on");
    fail(e.message || String(e));
    return;
  }
  pg._busy = false;
  /* on a changé de page pendant la lecture de celle-ci : on s'arrête, la nouvelle page s'affiche */
  if (tok !== show.tok || pages[cur] !== pg) return;
  const cv = $("cv");
  cv.width = pg.W;
  cv.height = pg.H;
  $("ov").width = pg.W;
  $("ov").height = pg.H;
  paint(pg, cv.getContext("2d"));
  $("busy").classList.remove("on");
  setTimeout(() => {
    try {
      updKeyBar();
    } catch (e) {}
  }, 0);
  setTimeout(cachePng, 0);
  $("pageLbl").textContent = `${i + 1}/${pages.length}`;
  $("pager").style.display = pages.length > 1 ? "" : "none";
  $("prev").disabled = i === 0;
  $("next").disabled = i === pages.length - 1;
  if (!pg.revealed) {
    pg.revealed = true;
    if (i === 0) reveal(pg);
  }
  hist = [];
  $("undo").disabled = true;
  {
    const vw = $("view").clientWidth - 2,
      b = Math.min(1, vw / pg.W),
      d = pg.staves[0]?.d || 0;
    zoom = d && d * b < 7 ? Math.min(4, 7 / (d * b)) : 1;
  }
  applyZoom();
  drawMarks();
  chips();
  stat();
  if (!pg.notes.length) {
    pg.keyAsked = true;
    setTimeout(
      () =>
        toast(
          pg.staves && pg.staves.length
            ? "Aucune note lue sur cette page. Touchez « Corriger » pour en ajouter."
            : "Aucune portée trouvée. Reprenez la photo bien à plat et de face, ou utilisez « … » → « Corriger les portées »."
        ),
      400
    );
  }
  /* étape 1 « Les portées et les clés » à chaque nouvelle page (sauf l'exemple), puis, sur la 1re page, étape 2 « La gamme » */
  const isDemo = pg.name === "exemple.png" || window.__MT_NOSTAFF === true;
  if (!pg.staffAsked && !(PROJ && PROJ.restored) && pg.notes.length && !isDemo && !(i === 0 && pg.keyAsked)) {
    pg.staffAsked = true;
    if (i === 0 && !pg.keyAsked) {
      pg.keyAsked = true;
      STEPQ = {key: true};
    }
    $("kmStep").textContent = "Étape 2 · La gamme";
    setTimeout(() => staffFit({step: true, page: i + 1, done: () => stepNext(i)}), 350);
  } else if (STEPQ && !pg.staffAsked) {
    pg.staffAsked = true;
    stepNext(i);
  } else if (i === 0 && !pg.keyAsked && !(PROJ && PROJ.restored)) {
    pg.keyAsked = true;
    $("kmStep").textContent = "Étape 2 · La gamme";
    setTimeout(() => {
      try {
        keyMode(true, true);
      } catch (e) {
        coach(false);
      }
    }, 350);
  }
}
/* plusieurs pages : l'étape 1 pour toutes les pages, l'une après l'autre ; puis l'étape 2 (la gamme) une seule fois, sur la page 1 */
let STEPQ = null;
function stepNext(i) {
  const nx = pages.findIndex((p, j) => j > i && !p.staffAsked);
  if (nx >= 0) {
    setTimeout(() => show(nx), 200);
    return;
  }
  const q = STEPQ;
  STEPQ = null;
  if (!q || !q.key) return;
  const go = () =>
    setTimeout(() => {
      try {
        keyMode(true, true);
      } catch (e) {
        coach(false);
      }
    }, 250);
  if (cur !== 0) show(0).then(go);
  else go();
}
function stat() {
  setTimeout(() => {
    try {
      updKeyBar();
    } catch (e) {
      console.error("KB", e && e.message);
    }
  }, 0);
  $("ttl").textContent = (pages[0]?.name || "Ma partition")
    .replace(/\.[^.]+$/, "")
    .replace(/^exemple$/, "Exemple")
    .replace(/^(IMG|DSC|PXL|Screenshot|Capture|image|photo|scan)[_ -]?[\d_ -]*.*$/i, "Ma partition")
    .replace(/[_]+/g, " ")
    .replace(/^./, c => c.toUpperCase());
  {
    const p0 = pages[cur];
    const v = document.getElementById("verInfo");
    if (v && p0)
      v.textContent =
        "Version 20 nov. 02h00 · image " +
        (p0.img ? p0.img.naturalWidth + "×" + p0.img.naturalHeight : "pdf") +
        " · analyse " +
        p0.W +
        "×" +
        p0.H +
        " · interligne " +
        (p0.staves && p0.staves[0] ? p0.staves[0].d.toFixed(1) : "?");
  }
  const pg = pages[cur],
    k = (pg.sus || []).length;
  $("revBtn").hidden = !k;
  $("revBtn").textContent = `Vérifier (${k})`;
  $("stat").innerHTML = (
    pg.staves.length
      ? `${pg.notes.length} notes · ${pg.staves.length} portées${pg.auto > 0 ? ` · ${pg.auto} retrouvée${pg.auto > 1 ? "s" : ""} en zoomant` : ""}${pg.rhAdded ? ` · ${pg.rhAdded} ajoutée${pg.rhAdded > 1 ? "s" : ""} par le compte des temps` : ""}`
      : "Aucune portée trouvée"
  )
    .split(" · ")
    .map((t, i) => `<span class="${/vérifier|revoir/.test(t) ? "warn" : i ? "" : "main"}">${t}</span>`)
    .join("");
}
function chips() {
  const pg = pages[cur];
  $("chips").innerHTML = pg.staves
    .flatMap((s, i) =>
      s.clefs.map(
        (k, j) =>
          `<button class="clef ${k.c === "G" ? "cG" : "cF"}" data-s="${i}" data-k="${j}" aria-label="Clé de ${k.c === "G" ? "sol" : "fa"}, toucher pour changer" style="left:${(Math.max(s.x0, k.x) / pg.W) * 100}%;top:${((s.top - 0.4 * s.d) / pg.H) * 100}%;pointer-events:auto"><i>${k.c === "G" ? "𝄞" : "𝄢"}</i>${j ? "→ " : ""}${k.c === "G" ? "Sol" : "Fa"}</button>`
      )
    )
    .join("");
}

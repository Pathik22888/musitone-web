/* ---------- projets : chaque partition ouverte est gardée dans « Mes partitions » avec ses corrections ----------
 On garde l'image (déjà recadrée) ou le PDF, puis seulement ce que la personne a changé par rapport à la lecture automatique :
 à la réouverture, la lecture refait le même travail sur les mêmes pixels et on réapplique les changements. */
let PROJ = null;
const NP = ["ov", "accOv", "hollow", "ronde"];
function projNew(f) {
  PROJ = {id: "p" + Date.now().toString(36), date: Date.now(), title: null};
  projT = 0;
}
const nKey = (pg, n) => [pg.staves.indexOf(n.s), Math.round(n.x), Math.round(n.y)];
const nProps = n => NP.map(k => (n[k] === undefined ? null : n[k]));
function projBase(pg) {
  pg.base0 = pg.notes.map(n => ({k: nKey(pg, n), p: nProps(n), n}));
  pg.clef0 = JSON.stringify(pg.staves.map(s => s.clefs.map(c => [Math.round(c.x), c.c])));
  pg.acc0 = (pg.acc || []).map(a => ({a, p: [a.Lov === undefined ? null : a.Lov, !!a.skip, !!a.del]}));
}
function projDiff(pg) {
  if (!pg.base0) return pg.savedDiff || null;
  const cur = new Set(pg.notes),
    D = {ch: [], add: [], del: [], clefs: null, acc: []};
  for (const b of pg.base0) {
    if (!cur.has(b.n)) {
      D.del.push(b.k);
      continue;
    }
    const p = nProps(b.n);
    if (JSON.stringify(p) !== JSON.stringify(b.p)) D.ch.push([b.k, p]);
  }
  const bs = new Set(pg.base0.map(b => b.n));
  for (const n of pg.notes) if (!bs.has(n)) D.add.push([nKey(pg, n), nProps(n)]);
  const cl = JSON.stringify(pg.staves.map(s => s.clefs.map(c => [Math.round(c.x), c.c])));
  if (cl !== pg.clef0) D.clefs = JSON.parse(cl);
  for (const b of pg.acc0 || []) {
    const a = b.a,
      p = [a.Lov === undefined ? null : a.Lov, !!a.skip, !!a.del];
    if (JSON.stringify(p) !== JSON.stringify(b.p)) D.acc.push([Math.round(a.x), Math.round(a.y), p]);
  }
  return D;
}
function projApply(pg, D) {
  const near = k => {
    let best = null,
      bd = 1e9;
    for (const n of pg.notes) {
      const si = pg.staves.indexOf(n.s);
      if (si !== k[0]) continue;
      const dd = Math.hypot(n.x - k[1], n.y - k[2]);
      if (dd < bd) {
        bd = dd;
        best = n;
      }
    }
    const d = pg.staves[k[0]] ? pg.staves[k[0]].d : 10;
    return bd <= 0.35 * d ? best : null;
  };
  const set = (n, p) =>
    NP.forEach((k, i) => {
      if (p[i] === null) delete n[k];
      else n[k] = p[i];
    });
  for (const [k, p] of D.ch || []) {
    const n = near(k);
    if (n) set(n, p);
  }
  const del = new Set();
  for (const k of D.del || []) {
    const n = near(k);
    if (n) del.add(n);
  }
  if (del.size) pg.notes = pg.notes.filter(n => !del.has(n));
  for (const [k, p] of D.add || []) {
    const st = pg.staves[k[0]];
    if (!st) continue;
    try {
      const n = makeNote(pg, {x: k[1], y: k[2], s: st, hollow: !!p[2]});
      if (n) {
        set(n, p);
        pg.notes.push(n);
      }
    } catch (e) {}
  }
  if (D.clefs && D.clefs.length === pg.staves.length)
    pg.staves.forEach((s, i) => {
      const L = D.clefs[i];
      s.clefs = L.map(([x, c], j) => {
        const o = s.clefs.find(q => Math.abs(Math.round(q.x) - x) <= 2) || (j === 0 ? s.clefs[0] : null);
        return o ? Object.assign(o, {c}) : {x, c};
      });
    });
  for (const [x, y, p] of D.acc || []) {
    const a = (pg.acc || []).find(q => Math.abs(q.x - x) <= 3 && Math.abs(q.y - y) <= 3);
    if (a) {
      a.Lov = p[0];
      a.skip = p[1];
      a.del = p[2];
    }
  }
}
let projT = 0;
function projSoon() {
  if (!PROJ) return;
  clearTimeout(projT);
  projT = setTimeout(() => projSave().catch(e => console.warn("projet", e)), 1500);
}
async function projSave() {
  if (!PROJ || !pages.length || !pages[0].base0 || !window.MXUI) return;
  if (!PROJ.src) {
    /* sources : une image par page (déjà recadrée), ou le PDF d'origine */ PROJ.src = pages.map(pg =>
      pg.kind === "pdf" ? {pdf: true, num: pg.num} : {blob: pg.img && pg.img._blob}
    );
  } else
    pages.forEach((pg, i) => {
      if (pg.kind === "img" && pg.img && pg.img._blob && (!PROJ.src[i] || PROJ.src[i].blob !== pg.img._blob))
        PROJ.src[i] = {blob: pg.img._blob};
    });
  if (pdfDoc && pdfDoc._blob) PROJ.pdf = pdfDoc._blob;
  let thumb = PROJ.thumb || null;
  try {
    const c = $("cv"),
      k = Math.min(1, 320 / c.width),
      t = document.createElement("canvas");
    t.width = Math.round(c.width * k);
    t.height = Math.round(Math.min(c.height, c.width * 1.4) * k);
    t.getContext("2d").drawImage(c, 0, 0, c.width, t.height / k, 0, 0, t.width, t.height);
    thumb = await new Promise(r => t.toBlob(r, "image/jpeg", 0.8));
  } catch (e) {}
  const it = {
    id: PROJ.id,
    kind: "proj",
    fmt: "proj",
    title: $("ttl").textContent || "Ma partition",
    name: pages[0].name,
    date: Date.now(),
    created: PROJ.date,
    key: KEYOV ? JSON.parse(JSON.stringify(KEYOV)) : null,
    ts: PHOTO_TS,
    bpm,
    notes: pages.reduce((a, pg) => a + (pg.notes ? pg.notes.length : 0), 0),
    src: PROJ.src,
    pdf: PROJ.pdf || null,
    thumb,
    pages: [thumb].filter(Boolean),
    st: pages.map(pg => ({diff: projDiff(pg), force: pg.forceStaves || null, keyAsked: !!pg.keyAsked}))
  };
  PROJ.thumb = thumb;
  await MXUI.save(it);
  if (!PROJ.toldSaved && !document.body.classList.contains("keymode") && !$("sf").classList.contains("on")) {
    PROJ.toldSaved = 1;
    if (!PROJ.restored) toast("Enregistrée automatiquement dans « Mes partitions »");
  }
}
async function openProject(it) {
  try {
    playStop();
  } catch (e) {}
  setView && setView("c");
  $("err").style.display = "none";
  pages = [];
  pdfDoc = null;
  zoom = 1;
  $("empty").hidden = true;
  $("work").hidden = false;
  $("bar").hidden = false;
  document.body.classList.add("working");
  document.body.classList.remove("home");
  $("busy").classList.add("on");
  try {
    if (it.pdf) {
      await loadScript(PDFJS);
      await loadScript(PDFW);
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFW;
      pdfDoc = await pdfjsLib.getDocument({data: new Uint8Array(await it.pdf.arrayBuffer())}).promise;
      pdfDoc._blob = it.pdf;
    }
    for (let i = 0; i < it.src.length; i++) {
      const sr = it.src[i],
        st = (it.st && it.st[i]) || {};
      let pg;
      if (sr.pdf) pg = {kind: "pdf", num: sr.num, name: it.name};
      else {
        const img = new Image();
        img._blob = sr.blob;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error("Image introuvable"));
          img.src = URL.createObjectURL(sr.blob);
        });
        pg = {kind: "img", img, name: it.name};
      }
      if (st.force) {
        pg.forceStaves = st.force;
        pg.angle = 0;
        pg.ks = null;
        pg.ks2 = null;
      }
      pg.restore = st.diff;
      pg.savedDiff = st.diff;
      pg.keyAsked = true;
      pages.push(pg);
    }
    KEYOV = it.key || null;
    PHOTO_TS = it.ts || null;
    if (it.bpm) {
      bpm = it.bpm;
      try {
        $("plTempo").textContent = bpm;
      } catch (e) {}
    }
    PROJ = {
      id: it.id,
      date: it.created || it.date,
      src: it.src,
      pdf: it.pdf || null,
      thumb: it.thumb,
      restored: true
    };
    await show(0);
  } catch (e) {
    fail(e.message || String(e));
  }
}
window.openProject = openProject;

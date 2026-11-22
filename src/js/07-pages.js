/* ---------- pages ---------- */
function fitCanvas(w, h, up) {
  let k = Math.min(1, Math.sqrt(BASEPX / (w * h))) * (up || 1);
  k = Math.min(k, Math.sqrt(MAXPX / (w * h)));
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  return cv;
}
async function ensureBase(pg) {
  if (pg.cv) return;
  if (pg.kind === "img") {
    const cv = fitCanvas(pg.img.naturalWidth, pg.img.naturalHeight, pg.up),
      c = cv.getContext("2d");
    c.imageSmoothingQuality = "high";
    c.fillStyle = "#fff";
    c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(pg.img, 0, 0, cv.width, cv.height);
    pg.cv = cv;
  } else {
    const p = await pdfDoc.getPage(pg.num),
      v1 = p.getViewport({scale: 1}),
      a = v1.width * v1.height;
    let sc = Math.min(4, Math.sqrt(BASEPX / a)) * (pg.up || 1);
    sc = Math.min(sc, Math.sqrt(MAXPX / a));
    const vp = p.getViewport({scale: sc});
    const cv = document.createElement("canvas");
    cv.width = Math.round(vp.width);
    cv.height = Math.round(vp.height);
    const c = cv.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, cv.width, cv.height);
    await p.render({canvasContext: c, viewport: vp}).promise;
    pg.cv = cv;
    pg.pt = [v1.width, v1.height];
  }
  if (pg.angle) rotateCanvas({...pg, W: pg.cv.width, H: pg.cv.height});
  if (pg.ks) applyKS(pg);
  if (pg.dw) {
    pg.dw.sc = pg.cv.width / pg.dw.W0;
    applyDW(pg);
  }
  if (pg.ks2) applyKS2(pg);
  pg.W = pg.cv.width;
  pg.H = pg.cv.height;
}
async function ready(pg) {
  const M = t => {
    const e = $("ldMsg");
    if (e) e.textContent = t;
  };
  if (!pg.notes) M("Lecture de la partition…");
  await ensureBase(pg);
  if (!pg.notes) {
    M("Repérage des portées et des notes…");
    await tick();
    await analyze(pg);
    staffOwn(pg);
    M("Vérification de chaque note…");
    await tick();
    pg.auto = autoCheck(pg);
    M("Mise en couleurs…");
    await tick();
  }
  if (!pg.baseData) pg.baseData = pg.cv.getContext("2d").getImageData(0, 0, pg.W, pg.H);
  if (!pg.acc)
    try {
      pg.acc = findAcc(pg);
    } catch (e) {
      pg.acc = [];
    }
  if (!pg.rh)
    try {
      rhythmPrep(pg);
    } catch (e) {
      console.error(e);
      pg.rh = [];
      pg.rests = [];
    }
  try {
    rhythmCheck(pg);
  } catch (e) {
    console.error(e);
    pg.badMeas = [];
  } /* un changement de clé lu avant la 1re note de la portée est un faux signal (armure, chiffrage) : sinon la clé affichée au début ne commande plus les notes */
  for (const st of pg.staves || []) {
    if (!st.clefs || st.clefs.length < 2) continue;
    const xs = pg.notes.filter(n => n.s === st).map(n => n.x),
      fx = xs.length ? Math.min(...xs) : 1e9;
    st.clefs = st.clefs.filter((c, i) => i === 0 || c.x > fx - 0.5 * st.d);
    st.clefs = st.clefs.filter((c, i) => i === 0 || c.c !== st.clefs[i - 1].c);
  }
  if (!pg.base0) {
    projBase(pg);
    projSoon();
    if (pg.restore) {
      try {
        projApply(pg, pg.restore);
      } catch (e) {
        console.error("restore", e);
      }
      pg.restore = null;
      try {
        rhythmCheck(pg);
      } catch (e) {}
    }
  }
}

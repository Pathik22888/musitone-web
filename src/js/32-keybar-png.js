async function toMusiTone() {
  const S = await songAll(PHOTO_TS || undefined);
  if (!S.ev.length) {
    toast("Aucune note à convertir");
    return;
  }
  if (PLAY) playStop();
  const name = ((pages[0] && pages[0].name) || "partition").replace(/\.[^.]+$/, ""),
    b = midiFile(S, bpm);
  try {
    document.querySelector("details.adv").open = false;
  } catch (e) {}
  const ab = x => x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength);

  if (window.MXUI)
    MXUI.fromBytes(ab(b), name + ".mid", ($("ttl").textContent || name).trim(), "Partition colorée", {
      ts: S.ts || [S.M, 4],
      confirmed: !!PHOTO_TS,
      hints: hintsOf(S),
      rebuild: async ts => {
        PHOTO_TS = {q: (ts[0] * 4) / ts[1], ts};
        const T = await songAll(PHOTO_TS);
        return {buf: ab(midiFile(T, bpm)), hints: hintsOf(T)};
      }
    });
}
$("plMx").onclick = toMusiTone;
$("toMx").onclick = toMusiTone;
$("toMid").onclick = () => {
  try {
    document.querySelector("details.adv").open = false;
  } catch (e) {}
  saveMidi();
};
$("plSlow").onclick = () => {
  bpm = Math.max(40, bpm - 10);
  if (PLAY) {
    playStop(true);
    playStart(POS);
  }
  $("plTempo").textContent = bpm;
};
$("plFast").onclick = () => {
  bpm = Math.min(200, bpm + 10);
  if (PLAY) {
    playStop(true);
    playStart(POS);
  }
  $("plTempo").textContent = bpm;
};
$("mClose").onclick = () => $("modal").classList.remove("on");
/* image prête à l'avance : sur iPhone le partage doit partir tout de suite après le toucher */
/* image partagée : la partition + une fine bande signée MusiTone (on peut la retirer dans les options) */
function shade(h, f) {
  const n = parseInt(h.slice(1), 16);
  return "rgb(" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * f)).join(",") + ")";
}
function drawKeys(x, kx, ky, kh, K) {
  /* une octave réglée sur la gamme : touches jouées en couleur, les autres blanches */
  const kw = kh * 0.36,
    KW = kw * 7,
    bw = kw * 0.6,
    bh = kh * 0.6,
    moved = new Set(K.letters),
    rr = (X, Y, w2, h2, r) => {
      x.beginPath();
      x.roundRect ? x.roundRect(X, Y, w2, h2, r) : x.rect(X, Y, w2, h2);
    };
  x.fillStyle = "#d9dce8";
  rr(kx - kw * 0.06, ky - kw * 0.06, KW + kw * 0.12, kh + kw * 0.12, kw * 0.18);
  x.fill();
  for (let i = 0; i < 7; i++) {
    const X = kx + i * kw + kw * 0.03,
      w2 = kw * 0.94,
      on = !moved.has(i);
    x.fillStyle = on ? PAL[i][1] : "#ffffff";
    rr(X, ky, w2, kh, kw * 0.12);
    x.fill();
    if (on) {
      x.fillStyle = shade(PAL[i][1], 0.82);
      x.fillRect(X, ky + kh * 0.9, w2, kh * 0.1);
      x.fillStyle = "#fff";
      x.font = `800 ${Math.round(kw * 0.42)}px Figtree, sans-serif`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(PAL[i][0], X + w2 / 2, ky + kh * 0.76);
      x.textAlign = "left";
    }
  }
  for (const i of [0, 1, 3, 4, 5]) {
    const bx = kx + (i + 1) * kw - bw / 2;
    let L = null;
    for (const q of K.letters) {
      if ((K.flat ? q : q + 1) === i + 1) L = q;
    }
    x.fillStyle = L == null ? "#1d1f2a" : PAL[L][1];
    rr(bx, ky, bw, bh, bw * 0.16);
    x.fill();
    if (L != null) {
      x.fillStyle = shade(PAL[L][1], 0.78);
      x.fillRect(bx, ky + bh * 0.86, bw, bh * 0.14);
      x.fillStyle = "#fff";
      x.font = `800 ${Math.round(bw * 0.36)}px Figtree, sans-serif`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(PAL[L][0] + (K.flat ? "♭" : "♯"), bx + bw / 2, ky + bh * 0.62);
      x.textAlign = "left";
    }
  }
}
const KMAJ = {s: ["C", "G", "D", "A", "E", "B", "F♯", "C♯"], b: ["C", "F", "B♭", "E♭", "A♭", "D♭", "G♭", "C♭"]},
  KMIN = {s: ["A", "E", "B", "F♯", "C♯", "G♯", "D♯", "A♯"], b: ["A", "D", "G", "C", "F", "B♭", "E♭", "A♭"]};
function keyName(K) {
  if (!kpIsStd(K)) return {maj: "Gamme personnalisée", min: ""};
  const t = K.flat ? "b" : "s";
  return {maj: KMAJ[t][K.n] + " majeur", min: KMIN[t][K.n] + " mineur"};
}
function updKeyBar() {
  const pg = pages[cur];
  if (!$("kbC")) return;
  const ok = !!(pg && pg.notes && !$("busy").classList.contains("on"));
  $("keyBar").classList.toggle("ready", ok);
  if (!ok) return;
  const K = keyOf(pg),
    nm = keyName(K),
    c = $("kbC"),
    r = window.devicePixelRatio || 1,
    H = 40,
    Wd = Math.round(H * 0.36 * 7 + 6);
  c.width = Wd * r;
  c.height = (H + 6) * r;
  c.style.width = Wd + "px";
  c.style.height = H + 6 + "px";
  const x = c.getContext("2d");
  x.setTransform(r, 0, 0, r, 0, 0);
  x.clearRect(0, 0, Wd, H + 6);
  drawKeys(x, 3, 3, H, K);
  $("kbT").textContent = nm.maj;
  $("kbS").textContent =
    (nm.min ? "ou " + nm.min : "") +
    (K.n ? " · " + K.letters.map(L => PAL[L][0] + (K.flat ? "♭" : "♯")).join(" ") : " · touches blanches");
}
function keyOf(pg) {
  return KEYOV || {n: 0, flat: false, letters: [], src: "vide"};
  const kv = $("keySel") && $("keySel").value;
  if (kv && kv !== "auto") {
    const n = parseInt(kv),
      flat = kv.endsWith("b");
    return {n, flat, letters: (flat ? [6, 2, 5, 1, 4, 0, 3] : [3, 0, 4, 1, 5, 2, 6]).slice(0, n), src: "choix"};
  }
  /* armure : on réunit ce qui a été lu sur toutes les portées (une altération manquée sur une portée est souvent vue sur une autre),
   puis on garde le début de l'ordre des dièses (F C G D A E B) ou des bémols (B E A D G C F) */
  const st = pg.staves || [],
    sig = (pg.acc || []).filter(a => !a.note && !a.skip && !a.del && a.L != null && a.s && st.includes(a.s));
  const SO = [3, 0, 4, 1, 5, 2, 6],
    FO = [6, 2, 5, 1, 4, 0, 3],
    prefix = (order, set) => {
      let n = 0;
      while (n < 7 && set.has(order[n])) n++;
      return n;
    };
  if (sig.length) {
    const fl = sig.filter(a => a.type === "b").length,
      flat = fl * 2 > sig.length,
      seen = new Map();
    for (const a of sig) {
      if ((a.type === "b") !== flat) continue;
      if (!seen.has(a.L)) seen.set(a.L, new Set());
      seen.get(a.L).add(a.s);
    }
    const withSig = new Set(sig.map(a => a.s)).size,
      need = withSig >= 3 ? 2 : 1,
      set = new Set([...seen].filter(([L, ss]) => ss.size >= need).map(([L]) => L));
    const n = prefix(flat ? FO : SO, set);
    if (n) return {n, flat, letters: (flat ? FO : SO).slice(0, n), src: "armure"};
  }
  /* pas d'armure lue : on regarde les altérations écrites devant les notes (une note toujours diésée appartient à la gamme) */
  const cnt = {s: new Map(), b: new Map()};
  for (const a of pg.acc || []) {
    if (!a.note || a.del || a.skip) continue;
    const L = a.Lov != null ? a.Lov : letterOf(a.note);
    const t = a.type === "b" ? "b" : a.type === "sn" ? "s" : null;
    if (!t) continue;
    cnt[t].set(L, (cnt[t].get(L) || 0) + 1);
  }
  const ns = prefix(SO, new Set([...cnt.s].filter(([L, c]) => c >= 3).map(([L]) => L))),
    nb = prefix(FO, new Set([...cnt.b].filter(([L, c]) => c >= 3).map(([L]) => L)));
  if (ns || nb) {
    const flat = nb > ns,
      n = Math.max(ns, nb);
    return {n, flat, letters: (flat ? FO : SO).slice(0, n), src: "notes"};
  }
  return {n: 0, flat: false, letters: [], src: "aucune"};
}
function exportCanvas() {
  const c = $("cv");
  if (!$("sigT") || !$("sigT").checked) return c;
  const W = c.width,
    h = Math.max(96, Math.round(W * 0.12)),
    o = document.createElement("canvas");
  o.width = W;
  o.height = c.height + h;
  const x = o.getContext("2d");
  x.drawImage(c, 0, 0);
  x.fillStyle = "#ffffff";
  x.fillRect(0, c.height, W, h);
  x.fillStyle = "#e4e6ef";
  x.fillRect(0, c.height, W, Math.max(1, h * 0.012));
  const K = keyOf(pages[cur]),
    top = c.height,
    pad = h * 0.16,
    INK = "#151a3b";
  /* logo : octave MusiTone + nom */
  const lw = h * 0.5,
    lh = (lw * 13) / 28,
    lx = pad,
    ly = top + h / 2 - lh / 2,
    kw0 = lw / 7;
  x.save();
  x.beginPath();
  x.roundRect ? x.roundRect(lx, ly, lw, lh, lh * 0.22) : x.rect(lx, ly, lw, lh);
  x.clip();
  PAL.forEach((p, i) => {
    x.fillStyle = p[1];
    x.fillRect(lx + i * kw0 - 0.5, ly, kw0 + 1, lh);
  });
  x.fillStyle = "#0a0b12";
  [1, 2, 4, 5, 6].forEach(i => x.fillRect(lx + i * kw0 - (lw * 1.3) / 28, ly, (lw * 2.6) / 28, lh * 0.58));
  x.restore();
  x.fillStyle = INK;
  x.textBaseline = "middle";
  x.font = `700 ${Math.round(h * 0.2)}px Fredoka, Figtree, sans-serif`;
  x.fillText("MusiTone", lx + lw + h * 0.12, top + h / 2 + 1);
  const kh = h * 0.74,
    kw = kh * 0.36,
    KW = kw * 7,
    kx = W - pad - KW,
    ky = top + (h - kh) / 2;
  drawKeys(x, kx, ky, kh, K);
  /* tonalité */
  const MAJ = K.flat ? KMAJ.b : KMAJ.s,
    MIN = K.flat ? KMIN.b : KMIN.s;
  const tx = kx - h * 0.32;
  x.textAlign = "right";
  x.fillStyle = "#7a7f98";
  x.font = `700 ${Math.round(h * 0.1)}px Figtree, sans-serif`;
  x.fillText("TONALITÉ", tx, top + h * 0.3);
  x.fillStyle = INK;
  x.font = `800 ${Math.round(h * 0.19)}px Figtree, sans-serif`;
  const NM = keyName(K);
  x.fillText(NM.maj, tx, top + h * 0.5);
  x.fillStyle = "#7a7f98";
  x.font = `500 ${Math.round(h * 0.105)}px Figtree, sans-serif`;
  x.fillText(
    (NM.min ? `ou ${NM.min} · ` : "") +
      (K.n ? K.letters.map(L => PAL[L][0] + (K.flat ? "♭" : "♯")).join(" ") : "que des touches blanches"),
    tx,
    top + h * 0.69
  );
  x.textAlign = "left";
  return o;
}
let pngCache = null,
  pngT = 0;
function cachePng() {
  clearTimeout(pngT);
  pngCache = null;
  pngT = setTimeout(() => {
    if (!$("cv").width) return;
    const c = exportCanvas();
    const k = cur;
    c.toBlob(b => {
      if (b && k === cur)
        pngCache = new File([b], base() + "-musitone" + (pages.length > 1 ? "-p" + (cur + 1) : "") + ".png", {
          type: "image/png"
        });
    }, "image/png");
  }, 500);
}
$("expPng").onclick = async () => {
  const btn = $("expPng");
  const mobile = matchMedia("(pointer:coarse)").matches;
  if (mobile && pngCache && navigator.canShare && navigator.canShare({files: [pngCache]})) {
    try {
      await navigator.share({files: [pngCache]});
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  btn.disabled = true;
  try {
    const blob = await new Promise(r => exportCanvas().toBlob(r, "image/png")),
      name = base() + "-musitone" + (pages.length > 1 ? "-p" + (cur + 1) : "") + ".png";
    /* téléphone : menu de partage du système (Enregistrer l'image → Photos) */
    if (mobile && dl) {
      try {
        await dl.save({filename: name, data: blob});
        return;
      } catch (e) {
        if (e && e.code === "declined") return;
      }
    }
    if (mobile) {
      $("mImg").src = await new Promise(r => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(blob);
      });
      $("modal").classList.add("on");
      return;
    }
    await save(name, blob);
  } finally {
    btn.disabled = false;
  }
};
$("expPdf").onclick = async () => {
  const btn = $("expPdf");
  btn.disabled = true;
  const lbl = btn.textContent;
  try {
    const out = [];
    const tmp = document.createElement("canvas");
    for (let i = 0; i < pages.length; i++) {
      btn.textContent = `PDF ${i + 1}/${pages.length}`;
      const pg = pages[i];
      await ready(pg);
      tmp.width = pg.W;
      tmp.height = pg.H;
      paint(pg, tmp.getContext("2d"));
      let [w, h] = pg.pt || [0, 0];
      if (!w) {
        /* photo : page A4 à la largeur de l'image */ w = 595.28;
        h = (w * pg.H) / pg.W;
      }
      const blob = await new Promise(r => tmp.toBlob(r, "image/jpeg", 0.92));
      out.push({blob, w: pg.W, h: pg.H, dpi: (pg.W / w) * 72});
      if (i !== cur) freePg(pg);
      await tick();
    }
    await save(base() + "-musitone.pdf", await MXE.makePdf(out));
  } catch (e) {
    $("stat").textContent = "Export PDF impossible : " + (e.message || e);
  }
  btn.textContent = lbl;
  btn.disabled = false;
};

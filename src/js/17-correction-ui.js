/* ---------- correction directement sur la partition ---------- */
const order = (pg, arr) => arr.slice().sort((a, b) => pg.staves.indexOf(a.s) - pg.staves.indexOf(b.s) || a.x - b.x);
function list() {
  const pg = pages[cur];
  return order(pg, reviewing ? pg.sus || [] : pg.notes);
}
let addType = 0;
/* altérations : toucher un signe (coloré ou non) pour le corriger ; ou colorer un signe oublié à l'endroit touché */
function accAt(pg, x, y, tol) {
  let best = null,
    bd = 1e9;
  for (const a of pg.acc || []) {
    if (a.del) continue;
    const d = a.s.d,
      m = Math.max(0.15 * d, tol * 0.5),
      [x0, y0, x1, y1] = a.box;
    if (x < x0 - m || x > x1 + m || y < y0 - m || y > y1 + m) continue;
    const dd = Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
    if (dd < bd) {
      bd = dd;
      best = a;
    }
  }
  return best;
}
function accFromInk(pg, s, X, Y) {
  const d = s.d,
    W = pg.W,
    bd = pg.baseData.data,
    P = pg.paper || 235,
    ink = Math.min(s.ink == null ? 60 : s.ink, P - 20),
    thr = (P + ink) / 2,
    lw = Math.max(1, s.lw || 2);
  const x0 = Math.max(0, Math.round(X - 1.6 * d)),
    x1 = Math.min(W - 1, Math.round(X + 1.6 * d)),
    y0 = Math.max(0, Math.round(Y - 2.6 * d)),
    y1 = Math.min(pg.H - 1, Math.round(Y + 2.6 * d)),
    w = x1 - x0 + 1,
    h = y1 - y0 + 1;
  const D = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((y + y0) * W + x + x0) * 4;
      D[y * w + x] = (bd[o] * 77 + bd[o + 1] * 150 + bd[o + 2] * 29) / 256 < thr ? 1 : 0;
    }
  /* on enlève les lignes de portée (traits horizontaux fins) */ const rows = s.ys.slice();
  for (let q = 1; q <= 4; q++) rows.push(s.top - q * d, s.bot + q * d);
  const keep = D.slice();
  for (const r0 of rows) {
    const r = Math.round(r0 - y0);
    for (let x = 0; x < w; x++)
      for (let q = -lw - 1; q <= lw + 1; q++) {
        const y = r + q;
        if (y < 0 || y >= h || !D[y * w + x]) continue;
        let a = y,
          b = y;
        while (a > 0 && D[(a - 1) * w + x]) a--;
        while (b < h - 1 && D[(b + 1) * w + x]) b++;
        if (b - a + 1 <= lw + 2) for (let t = a; t <= b; t++) keep[t * w + x] = 0;
        break;
      }
  }
  /* morceau d'encre le plus proche du doigt, puis les morceaux voisins (un signe coupé par les lignes) */
  let st = -1,
    sd = 1e9;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (keep[y * w + x]) {
        const dd = Math.hypot(x + x0 - X, y + y0 - Y);
        if (dd < sd) {
          sd = dd;
          st = y * w + x;
        }
      }
  if (st < 0 || sd > 0.9 * d) return null;
  const seen = new Uint8Array(w * h),
    q = [st];
  seen[st] = 1;
  const R = Math.max(2, lw + 2);
  let bx0 = 1e9,
    by0 = 1e9,
    bx1 = -1,
    by1 = -1;
  while (q.length) {
    const k = q.pop(),
      x = k % w,
      y = (k / w) | 0;
    bx0 = Math.min(bx0, x);
    bx1 = Math.max(bx1, x);
    by0 = Math.min(by0, y);
    by1 = Math.max(by1, y);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const kk = yy * w + xx;
        if (seen[kk] || !keep[kk]) continue;
        if (Math.abs(dy) > 1 && dx) continue;
        seen[kk] = 1;
        q.push(kk);
      }
  }
  if (bx1 - bx0 > 1.8 * d || by1 - by0 > 4 * d) return null;
  /* on rend aussi les pixels de ligne qui touchent le signe, pour un coloriage net */
  const px = [];
  for (let y = Math.max(0, by0 - 1); y <= Math.min(h - 1, by1 + 1); y++)
    for (let x = bx0; x <= bx1; x++) {
      const k = y * w + x;
      if (seen[k] || (D[k] && !keep[k])) px.push((y + y0) * W + x + x0);
    }
  const nt =
    pg.notes.filter(n => n.s === s && n.x > x0 + bx1 && n.x < x0 + bx1 + 3 * d).sort((a, b) => a.x - b.x)[0] || null;
  return {
    s,
    note: nt,
    x: x0 + (bx0 + bx1) / 2,
    y: snapY(s, y0 + (by0 + by1) / 2),
    type: "man",
    px: Int32Array.from(px),
    box: [x0 + bx0, y0 + by0, x0 + bx1, y0 + by1],
    man: true
  };
}
function typeOf(n) {
  if (!n.hollow) return 0;
  if (n.ronde != null) return n.ronde ? 2 : 1;
  return n._tip === null || n._tip === false ? 2 : 1;
}
function curType() {
  return sel && sel.kind === "note" ? (sel.pendT != null ? sel.pendT : typeOf(sel.n)) : addType;
}
new ResizeObserver(() =>
  document.documentElement.style.setProperty("--sheetH", $("pal").offsetHeight + "px")
).observe($("pal"));
/* aide à la correction : carte en bas de la partition + cercle « Touchez » sur une note, la 1re fois (ou bouton ?) */
let coachSeen = false;
try {
  coachSeen = localStorage.getItem("mtCoach") === "1";
} catch (e) {}
function hideHint() {
  document.querySelectorAll(".tapHint").forEach(e => e.remove());
}
function coach(force) {
  const pg = pages[cur];
  if (!pg || !pg.notes || !pg.notes.length) {
    $("coach").hidden = true;
    return;
  }
  if (coachSeen && !force) return;
  const k = (pg.sus || []).length;
  $("cRev").hidden = !k;
  $("cRev").textContent = `À vérifier (${k})`;
  $("coach").hidden = false;
  /* cercle sur une note visible, dans le haut de l'écran */ hideHint();
  const v = $("view"),
    vr = v.getBoundingClientRect(),
    r = $("cv").getBoundingClientRect();
  let best = null,
    bd = 1e9;
  for (const n of pg.notes) {
    const sx = r.left + (n.x / pg.W) * r.width,
      sy = r.top + (n.y / pg.H) * r.height;
    if (sx < vr.left + 30 || sx > vr.right - 90 || sy < vr.top + 40 || sy > vr.bottom - 180) continue;
    const dd = Math.hypot(sx - (vr.left + vr.width / 2), sy - (vr.top + vr.height * 0.35));
    if (dd < bd) {
      bd = dd;
      best = n;
    }
  }
  if (!best) best = pg.notes.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const h = document.createElement("div");
  h.className = "tapHint";
  h.style.left = (best.x / pg.W) * 100 + "%";
  h.style.top = (best.y / pg.H) * 100 + "%";
  $("stage").appendChild(h);
  if (bd === 1e9) {
    const sc = r.width / pg.W;
    v.scrollTop = best.y * sc - vr.height * 0.35;
    v.scrollLeft = best.x * sc - vr.width / 2;
  }
}
function coachDone() {
  coachSeen = true;
  try {
    localStorage.setItem("mtCoach", "1");
  } catch (e) {}
  $("coach").hidden = true;
  hideHint();
}
$("cOk").onclick = coachDone;
$("sigT").onchange = cachePng;
$("cRev").onclick = () => {
  coachDone();
  $("revBtn").click();
};
$("fzhelp").onclick = e => {
  e.stopPropagation();
  coach(true);
};
/* le moment « waouh » : la partition d'origine se colore de gauche à droite sous une ligne de lumière */
function reveal(pg) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c0 = $("cv0"),
    cv = $("cv"),
    sc = $("scan");
  const st = $("stage"),
    r = cv.getBoundingClientRect(),
    sr = $("view").getBoundingClientRect();
  c0.width = pg.W;
  c0.height = pg.H;
  c0.getContext("2d").putImageData(pg.baseData, 0, 0);
  st.appendChild(c0);
  c0.style.display = "block";
  cv.style.clipPath = "inset(0 100% 0 0)";
  sc.style.display = "block";
  st.appendChild(sc);
  const t0 = performance.now(),
    D = 1300;
  const step = t => {
    const k = Math.min(1, (t - t0) / D),
      e = 1 - Math.pow(1 - k, 3);
    cv.style.clipPath = `inset(0 ${(1 - e) * 100}% 0 0)`;
    sc.style.left = e * 100 + "%";
    if (k < 1) requestAnimationFrame(step);
    else {
      cv.style.clipPath = "";
      sc.style.display = "none";
      c0.style.display = "none";
      c0.width = 1;
      c0.height = 1;
    }
  };
  requestAnimationFrame(step);
}
$("dFix").onclick = () => {
  if (CLEFMODE) clefMode(false);
  coach(true);
};
$("cClef").onclick = e => {
  e.stopPropagation();
  coachDone();
  clefMode(true);
};
function closeSheet() {
  setTimeout(kmShow, 0);
  try {
    if (document.body.classList.contains("showLeg")) legSet(false);
  } catch (e) {}
  const ed = document.body.classList.contains("editing"),
    an = ed
      ? sel && sel.s
        ? anchorGet(
            sel.kind === "note" || sel.kind === "sus" ? sel.n.x : sel.x,
            sel.kind === "note" || sel.kind === "sus" ? sel.n.y : sel.y
          )
        : viewCenterAnchor()
      : null;
  sel = null;
  props = null;
  reviewing = false;
  document.body.classList.remove("reviewing");
  {
    const v = $("view"),
      tl = v.scrollLeft - AUTOSC.x,
      tt = v.scrollTop - AUTOSC.y;
    $("pal").classList.remove("on", "more");
    document.body.classList.remove("editing");
    if (ed) {
      v.scrollLeft = tl;
      v.scrollTop = tt;
    } else anchorSet(an);
  }
  AUTOSC = {x: 0, y: 0};
  if (pages[cur] && pages[cur].staves) drawMarks();
}
/* garder la partition immobile à l'écran quand le panneau s'ouvre ou se ferme */
function anchorGet(x, y) {
  const pg = pages[cur],
    r = $("cv").getBoundingClientRect();
  return {x, y, sx: r.left + (x / pg.W) * r.width, sy: r.top + (y / pg.H) * r.height};
}
function anchorSet(a) {
  if (!a) return;
  const pg = pages[cur],
    v = $("view"),
    r = $("cv").getBoundingClientRect();
  v.scrollLeft += r.left + (a.x / pg.W) * r.width - a.sx;
  v.scrollTop += r.top + (a.y / pg.H) * r.height - a.sy;
}
function viewCenterAnchor() {
  const pg = pages[cur],
    v = $("view"),
    vr = v.getBoundingClientRect(),
    r = $("cv").getBoundingClientRect();
  if (!r.width) return null;
  const sx = vr.left + vr.width / 2,
    sy = vr.top + Math.min(vr.height, innerHeight - vr.top) / 2;
  return {x: ((sx - r.left) / r.width) * pg.W, y: ((sy - r.top) / r.height) * pg.H, sx, sy};
}
/* la note touchée reste où elle est ; on ne bouge que si le panneau la cache */
/* note sélectionnée : au centre de la partie visible, entre le haut de la partition et le haut du correcteur */
function centerVisible(x, y) {
  const pg = pages[cur],
    v = $("view"),
    vr = v.getBoundingClientRect(),
    r = $("cv").getBoundingClientRect();
  if (!r.width) return;
  const sx = r.left + (x / pg.W) * r.width,
    sy = r.top + (y / pg.H) * r.height,
    pt = $("pal").classList.contains("on") ? $("pal").getBoundingClientRect().top : vr.bottom,
    cyT = (Math.max(vr.top, 0) + Math.min(vr.bottom, pt)) / 2,
    cxT = (vr.left + vr.right) / 2;
  v.scrollTop += sy - cyT;
  v.scrollLeft += sx - cxT;
}
/* l'écran ne bouge pas quand on corrige : on ne défile que si la note est cachée (par le panneau ou hors de l'écran), du strict nécessaire, et on revient à la même place en fermant */
let AUTOSC = {x: 0, y: 0};
function ensureVisible(x, y, st) {
  const pg = pages[cur],
    v = $("view"),
    vr = v.getBoundingClientRect(),
    r = $("cv").getBoundingClientRect();
  if (!r.width) return;
  const sc = r.width / pg.W,
    dd = (st ? st.d : 12) * sc,
    sx = r.left + x * sc,
    sy = r.top + y * sc,
    palTop = $("pal").classList.contains("on") ? $("pal").getBoundingClientRect().top : innerHeight,
    top = Math.max(vr.top, 0) + 1.2 * dd,
    bot = Math.min(vr.bottom, palTop) - 1.6 * dd,
    lft = vr.left + dd,
    rgt = vr.right - dd;
  let dy = 0,
    dx = 0;
  if (sy > bot) dy = sy - bot;
  else if (sy < top) dy = sy - top;
  if (sx > rgt) dx = sx - rgt;
  else if (sx < lft) dx = sx - lft;
  const t0 = v.scrollTop,
    l0 = v.scrollLeft;
  v.scrollTop += dy;
  v.scrollLeft += dx;
  AUTOSC.y += v.scrollTop - t0;
  AUTOSC.x += v.scrollLeft - l0;
}
function focusOn(x, y, s, keep) {
  const pg = pages[cur],
    v = $("view"),
    vr = v.getBoundingClientRect(),
    r = $("cv").getBoundingClientRect(),
    sc = r.width / pg.W,
    d = s.d * sc;
  if (!keep && d < 14) {
    zoomAt((zoom * 24) / d, r.left + x * sc, r.top + y * sc);
  }
  const r2 = $("cv").getBoundingClientRect(),
    sx = r2.left + (x / pg.W) * r2.width,
    sy = r2.top + (y / pg.H) * r2.height,
    dd = (s.d * r2.width) / pg.W;
  const palTop = $("pal").classList.contains("on") ? $("pal").getBoundingClientRect().top : innerHeight,
    top = Math.max(vr.top, 0) + 1.5 * dd,
    bot = Math.min(vr.bottom, palTop) - 1.8 * dd,
    lft = vr.left + dd,
    rgt = vr.right - dd;
  if (sy > bot) v.scrollTop += sy - bot;
  else if (sy < top) v.scrollTop -= top - sy;
  if (sx > rgt) v.scrollLeft += sx - rgt;
  else if (sx < lft) v.scrollLeft -= lft - sx;
}
function select(kind, n, x, y, extra) {
  $("kmPal").classList.remove("on");
  const pg = pages[cur];
  if (kind === "note" || kind === "sus") {
    x = n.x;
    y = n.y;
  }
  if (kind === "acc") {
    x = (n.box[0] + n.box[2]) / 2;
    y = (n.box[1] + n.box[3]) / 2;
    extra = Object.assign({abox: n.box}, extra || {});
  }
  const s = kind === "note" || kind === "sus" || kind === "acc" ? n.s : nearestStaff(pg, x, y);
  if (!s) return closeSheet();
  if (kind === "ghost" || kind === "sus") addType = 0;
  const wasEd = document.body.classList.contains("editing"),
    an = wasEd ? null : anchorGet(x, y);
  sel = {kind, n, x, y, s, ...(extra || {})};
  $("pal").classList.add("on");
  updPal();
  document.documentElement.style.setProperty("--sheetH", $("pal").offsetHeight + "px");
  document.body.classList.add("editing");
  anchorSet(an);
  if (!wasEd) AUTOSC = {x: 0, y: 0};
  ensureVisible(x, y, s);
  drawMarks();
}
function curLetter() {
  if (!sel || sel.kind === "zone") return 0;
  if (sel.pend != null) return sel.pend;
  if (sel.kind === "key") return sel.kL;
  if (sel.kind === "acc") {
    const a = sel.n,
      pg = pages[cur];
    return a.Lov != null
      ? a.Lov
      : a.note && pg.notes.includes(a.note)
        ? letterOf(a.note)
        : a.L != null
          ? a.L
          : letterOf({s: a.s, x: a.x, y: a.y, ov: null});
  }
  return sel.kind === "note" ? letterOf(sel.n) : letterOf({s: sel.s, x: sel.x, y: sel.y, ov: null});
}
function updPal() {
  if (!sel) return;
  if (sel.kind !== "key") $("pPrev").style.visibility = $("pNext").style.visibility = "";
  $("pKT").style.display = sel.kind === "key" ? "" : "none";
  $("p7").style.display = sel.kind === "zone" ? "none" : "";
  if (sel.kind === "zone") {
    const k = props ? props.length : 0;
    $("pT").textContent = `Zone revérifiée${sel.added ? ` · ${sel.added} ajoutée${sel.added > 1 ? "s" : ""}` : ""}`;
    $("pDot").style.background = "transparent";
    $("pDot").classList.add("ghost");
    $("pS").textContent = k
      ? `${k} autre${k > 1 ? "s" : ""} possible${k > 1 ? "s" : ""} en bleu · touchez pour ajouter`
      : "Rien d’autre à ajouter ici";
    $("pDel").style.display = "none";
    $("pAll").hidden = !k;
    if (k) $("pAll").textContent = `Tout ajouter (${k})`;
    $("pClose").hidden = !!k;
    $("pUndo").disabled = !hist.length;
    return;
  }
  $("pOk").hidden = sel.kind === "zone";
  $("pAcc").style.display = sel.kind === "ghost" || sel.kind === "note" ? "" : "none";
  if (sel.kind === "ghost" || sel.kind === "note") {
    const st = sel.kind === "note" ? sel.n.s : sel.s,
      x = sel.kind === "note" ? sel.n.x : sel.x,
      k = clefNear(st, x),
      o = clefAt(st, x) === "G" ? "fa" : "sol";
    $("pClef").style.display = "";
    $("pClef").textContent = k ? "Retirer ce changement de clé" : `Clé de ${o} à partir d’ici`;
    $("pClefAll").style.display = "";
    $("pClefAll").textContent = `Toute la ligne en clé de ${o}`;
  } else {
    $("pClef").style.display = "none";
    $("pClefAll").style.display = "none";
  }
  {
    const b = $("pStaff");
    b.style.display = "none";
    if (sel.kind === "note") {
      const n = sel.n,
        pg = pages[cur],
        dist = (st, y) => (y < st.top ? st.top - y : y > st.bot ? y - st.bot : 0);
      if (dist(n.s, n.y) > 0.4 * n.s.d) {
        let o = null,
          bd = 1e9;
        for (const st of pg.staves) {
          if (st === n.s || n.x < st.x0 - st.d || n.x > st.x1 + st.d) continue;
          const dd = dist(st, n.y);
          if (dd < bd && dd < 8 * st.d) {
            bd = dd;
            o = st;
          }
        }
        if (o) {
          b.style.display = "";
          b.dataset.o = pg.staves.indexOf(o);
          b.textContent = `Lire cette note avec la portée du ${o.top < n.s.top ? "dessus" : "dessous"} (clé de ${clefAt(o, n.x) === "G" ? "sol" : "fa"})`;
        }
      }
    }
  }
  $("pAcc").textContent = sel.kind === "note" ? "♯ ♭ Signe devant" : "♯ ♭ Signe ici";
  $("pKT").style.display = sel.kind === "key" ? "" : "none";
  if (sel.kind === "key") {
    const L = curLetter(),
      sy = sel.kflat ? "♭" : "♯",
      K = KEYOV || {n: 0, letters: []};
    $("pT").textContent = sel.kIdx >= 0 ? `Signe ${PAL[L][0]}${sy}` : `Ajouter ${PAL[L][0]}${sy} ?`;
    $("pS").textContent =
      K.n && !!K.flat !== !!sel.kflat
        ? `Les autres signes deviendront des ${sy}`
        : "Choisissez la couleur, puis OK · il sera mis sur toutes les portées";
    $("pType").style.display = "none";
    $("pAlt").style.display = "none";
    $("pAcc").style.display = "none";
    $("pClef").style.display = "none";
    $("pOk").hidden = false;
    $("pPrev").style.visibility = $("pNext").style.visibility = "hidden";
    $("pAll").hidden = true;
    $("pClose").hidden = true;
    $("pKT")
      .querySelectorAll("button")
      .forEach(b => b.classList.toggle("cur", (b.dataset.k === "b") === !!sel.kflat));
    $("pDot").style.background = PAL[L][1];
    $("pDot").classList.remove("ghost");
    $("p7").innerHTML =
      PAL.map(
        (p, k) =>
          `<button data-l="${k}" class="${k === L ? "cur" : ""}" style="--c:${p[1]}"><i></i>${p[0]}${sy}</button>`
      ).join("") + BLK;
    {
      const c = $("p7").querySelector("button.cur");
      if (c)
        c.insertAdjacentHTML(
          "beforeend",
          `<em class="okb" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></em>`
        );
    }
    $("pDel").textContent = "Supprimer";
    $("pDel").style.display = sel.kIdx >= 0 ? "" : "none";
    return;
  }
  if (sel.kind === "acc") {
    const L = curLetter(),
      on = !(sel.n.skip && sel.n.Lov == null);
    $("pT").textContent = on ? `Signe ♯ ♭ ♮ : ${PAL[L][0]}` : "Signe non coloré";
    $("pS").textContent = "Touchez la couleur de sa note";
    $("pType").style.display = "none";
    $("pAlt").style.display = "none";
    $("pDot").style.background = on ? PAL[L][1] : "transparent";
    $("pDot").classList.toggle("ghost", !on);
    $("p7").innerHTML =
      PAL.map(
        (p, k) =>
          `<button data-l="${k}" class="${on && k === L ? "cur" : ""}" style="--c:${p[1]}"><i></i>${p[0]}</button>`
      ).join("") + BLK;
    $("pDel").textContent = on ? "Ne pas colorer" : "Laisser noir";
    $("pDel").style.display = "";
    $("pAll").hidden = true;
    $("pClose").hidden = true;
    return;
  }
  const L = curLetter(),
    it = list(),
    i = sel.kind === "note" || sel.kind === "sus" ? it.indexOf(sel.n) : -1;
  $("pT").textContent =
    sel.kind === "note"
      ? `Cette note est un ${PAL[L][0]}`
      : sel.kind === "sus"
        ? `Note oubliée ? ${PAL[L][0]}`
        : `Ajouter un ${PAL[L][0]} ici ?`;
  $("pS").textContent =
    props && props.length
      ? `${props.length} en bleu · touchez pour ajouter`
      : props
        ? "Rien trouvé ici"
        : sel.kind === "note"
          ? "Choisissez la couleur, puis OK"
          : sel.kind === "sus"
            ? (reviewing ? `À vérifier ${i + 1} / ${it.length} · ` : "") + "Choisissez la couleur, puis OK"
            : "Choisissez la couleur, puis OK";
  $("pType").style.display = sel.kind === "zone" ? "none" : "";
  {
    const t = curType();
    $("pType")
      .querySelectorAll("button")
      .forEach(b => b.classList.toggle("cur", +b.dataset.t === t));
  }
  {
    const on = sel.kind === "note" || sel.kind === "sus" || sel.kind === "ghost";
    $("pAlt").style.display = on ? "" : "none";
    if (on) {
      const a = sel.pendA !== undefined ? sel.pendA : sel.n && sel.n.accOv != null ? sel.n.accOv : null;
      $("pAlt")
        .querySelectorAll("button")
        .forEach(b => b.classList.toggle("cur", (b.dataset.a === "n" ? null : +b.dataset.a) === a));
    }
  }
  $("p7").innerHTML =
    PAL.map(
      (p, k) => `<button data-l="${k}" class="${k === L ? "cur" : ""}" style="--c:${p[1]}"><i></i>${p[0]}</button>`
    ).join("") + BLK;
  $("pDot").style.background = PAL[L][1];
  {
    const c = $("p7").querySelector("button.cur");
    if (c)
      c.insertAdjacentHTML(
        "beforeend",
        `<em class="okb" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.6 8.4 6.6 11.2 12.4 4.9"/></svg></em>`
      );
  }
  $("pDot").classList.remove("ghost");
  $("pDel").textContent = sel.kind === "sus" ? "Pas une note" : "Supprimer";
  $("pDel").style.display = sel.kind === "ghost" ? "none" : "";
  const k = props ? props.length : 0;
  $("pAll").hidden = !k;
  if (k) $("pAll").textContent = `Tout ajouter (${k})`;
  $("pClose").hidden = true;
  $("pUndo").disabled = !hist.length;
}
function done() {
  closeSheet();
  $("stat").insertAdjacentHTML("beforeend", "<span>Vérification terminée</span>");
}
function step(dir) {
  const pg = pages[cur],
    it = list();
  if (!it.length) {
    if (reviewing) done();
    return;
  }
  let i = sel && (sel.kind === "note" || sel.kind === "sus") ? it.indexOf(sel.n) : -1,
    j;
  if (i >= 0) j = (i + dir + it.length) % it.length;
  else {
    const si = sel ? pg.staves.indexOf(sel.s) : -1,
      nx = it.findIndex(q => pg.staves.indexOf(q.s) > si || (sel && q.s === sel.s && q.x > sel.x));
    j = dir > 0 ? (nx < 0 ? 0 : nx) : ((nx < 0 ? it.length : nx) - 1 + it.length) % it.length;
  }
  props = null;
  select(reviewing ? "sus" : "note", it[j], null, null, {nav: 1});
}
$("pZi").onclick = () => {
  if (!sel) return;
  zoom = Math.min(14, zoom * 1.35);
  applyZoom();
  focusOn(sel.kind === "note" ? sel.n.x : sel.x, sel.kind === "note" ? sel.n.y : sel.y, sel.s, true);
};
$("pZo").onclick = () => {
  if (!sel) return;
  zoom = Math.max(0.5, zoom / 1.35);
  applyZoom();
  focusOn(sel.kind === "note" ? sel.n.x : sel.x, sel.kind === "note" ? sel.n.y : sel.y, sel.s, true);
};
$("pType").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || !sel) return;
  const t = +b.dataset.t;
  if (sel.kind === "note") {
    sel.pendT = t;
    updPal();
    drawMarks();
    return;
  }
  addType = t;
  updPal();
  drawMarks();
});
$("pAlt").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || !sel) return;
  sel.pendA = b.dataset.a === "n" ? null : +b.dataset.a;
  updPal();
  drawMarks();
});
$("pKT").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || !sel || sel.kind !== "key") return;
  sel.kflat = b.dataset.k === "b";
  updPal();
  drawMarks();
});
$("pPrev").onclick = () => step(-1);
$("pNext").onclick = () => step(1);
$("p7").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || !sel) return;
  const L = +b.dataset.l,
    pg = pages[cur];
  /* une touche choisit la couleur ; c’est OK qui valide */
  if (!b.dataset.ok) {
    sel.pend = L;
    updPal();
    drawMarks();
    return;
  }
  if (sel.kind === "note") {
    snap();
    const auto = letterOf({...sel.n, ov: null});
    sel.n.ov = L === auto ? null : L;
    if (sel.pendA !== undefined) sel.n.accOv = sel.pendA;
    if (sel.pendT != null && sel.pendT !== typeOf(sel.n)) {
      sel.n.hollow = sel.pendT > 0;
      sel.n.ronde = sel.pendT === 2 ? true : sel.pendT === 1 ? false : null;
      if (!$("crisp").checked) $("crisp").checked = true;
    }
    refresh();
    closeSheet();
    return;
  }
  if (sel.kind === "key") {
    const K = KEYOV ? {...KEYOV, items: (KEYOV.items || []).slice()} : {n: 0, flat: false, letters: [], items: []},
      it = {...sel.kIt};
    if (L !== it.L) {
      let best = it.p,
        bd = 99;
      for (let q = it.p - 7; q <= it.p + 7; q++)
        if ((((2 + q) % 7) + 7) % 7 === L && Math.abs(q - it.p) < bd) {
          bd = Math.abs(q - it.p);
          best = q;
        }
      it.p = best;
      it.L = L;
    }
    K.items = K.items.filter(q => q.L !== sel.kL && q.L !== L);
    K.items.push(it);
    K.flat = !!sel.kflat;
    const o = K.flat ? KFO : KSO;
    K.letters = K.items.map(q => q.L).sort((a, b) => o.indexOf(a) - o.indexOf(b));
    K.n = K.letters.length;
    K.src = "choix";
    KEYOV = K;
    refresh();
    closeSheet();
    hideHint();
    if (keyGuide) $("kmS").textContent = "Un autre ? Touchez-le. Sinon, touchez « Terminé ».";
    return;
  }
  if (sel.kind === "acc") {
    snap();
    sel.n.Lov = L;
    sel.n.skip = false;
    sel.n.del = false;
    $("accT").checked = true;
    refresh();
    closeSheet();
    return;
  }
  const was = sel,
    n = addNote(sel.x, sel.y, L, !!addType);
  if (n && addType) {
    n.ronde = addType === 2;
    refresh();
  }
  if (n && was.pendA !== undefined && was.pendA !== null) {
    n.accOv = was.pendA;
    refresh();
  }
  if (was.kind === "sus") {
    pg.sus = pg.sus.filter(u => u !== was.n);
    refresh();
  }
  props = null;
  closeSheet();
});
$("pDel").onclick = () => {
  if (!sel || sel.kind === "ghost") return;
  if (sel.kind === "key") {
    if (KEYOV && sel.kIdx >= 0) {
      const L = KEYOV.letters[sel.kIdx];
      KEYOV.items = (KEYOV.items || []).filter(q => q.L !== L);
      KEYOV.letters.splice(sel.kIdx, 1);
      KEYOV.n = KEYOV.letters.length;
    }
    refresh();
    closeSheet();
    return;
  }
  if (sel.kind === "acc") {
    snap();
    const a = sel.n;
    if (a.man) pages[cur].acc = pages[cur].acc.filter(q => q !== a);
    else {
      a.Lov = null;
      a.skip = true;
    }
    refresh();
    closeSheet();
    return;
  }
  const pg = pages[cur],
    it = list(),
    i = it.indexOf(sel.n);
  snap();
  if (sel.kind === "sus") pg.sus = pg.sus.filter(u => u !== sel.n);
  else pg.notes = pg.notes.filter(n => n !== sel.n);
  refresh();
  closeSheet();
};
$("pFind").onclick = () => {
  if (!sel) return;
  const pg = pages[cur],
    cy = sel.kind === "note" ? sel.n.y : sel.y;
  props = reanalyze(pg, sel.s, sel.x, cy).map(p => ({...p, s: sel.s}));
  updPal();
  drawMarks();
};
$("pAll").onclick = () => {
  if (!props || !props.length) return;
  const pg = pages[cur];
  snap();
  let last = null;
  for (const p of props) {
    last = addNote(p.x, p.y, letterOf({s: p.s, x: p.x, y: p.y, ov: null}), p.hollow, true);
    pg.sus = (pg.sus || []).filter(u => Math.hypot(u.x - p.x, u.y - p.y) > 0.6 * u.s.d);
  }
  props = null;
  refresh();
  if (last) select("note", last);
};
$("pUndo").onclick = () => {
  $("undo").click();
  const pg = pages[cur];
  if (
    sel &&
    ((sel.kind === "note" && !pg.notes.includes(sel.n)) || (sel.kind === "sus" && !(pg.sus || []).includes(sel.n)))
  )
    closeSheet();
  else updPal();
};
$("pAcc").onclick = () => {
  if (!sel || (sel.kind !== "ghost" && sel.kind !== "note")) return;
  const pg = pages[cur];
  let a = null;
  if (sel.kind === "note") {
    const n = sel.n,
      d = n.s.d,
      tx = sel.tx != null && sel.tx < n.box[0] ? sel.tx : n.box[0] - 0.9 * d;
    for (const dx of [0, -0.3 * d, 0.3 * d, -0.6 * d])
      for (const dy of [0, -0.5 * d, 0.5 * d]) {
        if (a) break;
        const c = accFromInk(pg, n.s, tx + dx, n.y + dy);
        if (c && c.box[2] < n.box[0] + 0.1 * d) a = c;
      }
    if (a) a.note = n;
  } else a = accFromInk(pg, sel.s, sel.x, sel.y);
  if (
    a &&
    (pg.acc || []).some(q => !q.del && Math.abs(q.box[0] - a.box[0]) < 3 && Math.abs(q.box[1] - a.box[1]) < 3)
  ) {
    const q = pg.acc.find(q => !q.del && Math.abs(q.box[0] - a.box[0]) < 3 && Math.abs(q.box[1] - a.box[1]) < 3);
    return select("acc", q);
  }
  if (!a) {
    $("pS").textContent = "Aucun signe trouvé ici : touchez pile sur le ♯ ou le ♭";
    return;
  }
  pg.acc = pg.acc || [];
  pg.acc.push(a);
  a.skip = true;
  select("acc", a);
};
function clefNear(s, x) {
  return s.clefs.find((k, i) => i > 0 && Math.abs(k.x - x) < 2.5 * s.d);
}
$("pClef").onclick = () => {
  if (!sel || (sel.kind !== "ghost" && sel.kind !== "note")) return;
  const s = sel.kind === "note" ? sel.n.s : sel.s,
    X = sel.kind === "note" ? sel.n.x - 0.6 * s.d : sel.x - 0.5 * s.d,
    k = clefNear(s, X);
  snap();
  if (k) s.clefs = s.clefs.filter(q => q !== k);
  else {
    s.clefs.push({x: X, c: clefAt(s, X + 1) === "G" ? "F" : "G", man: true});
    s.clefs.sort((a, b) => a.x - b.x);
  }
  refresh();
  closeSheet();
};
/* toute la portée dans l'autre clé : on enlève aussi les changements en cours de ligne */
$("pClefAll").onclick = () => {
  if (!sel || (sel.kind !== "ghost" && sel.kind !== "note")) return;
  const s = sel.kind === "note" ? sel.n.s : sel.s,
    x = sel.kind === "note" ? sel.n.x : sel.x,
    c = clefAt(s, x) === "G" ? "F" : "G";
  snap();
  s.clefs = [Object.assign(s.clefs[0], {c})];
  refresh();
  closeSheet();
  toast("Toute la ligne en clé de " + (c === "F" ? "fa" : "sol"));
};
$("pOk").onclick = () => {
  const b = $("p7").querySelector("button.cur") || $("p7").querySelector("button[data-l]");
  if (b) {
    b.dataset.ok = 1;
    b.click();
  } else closeSheet();
};
$("fzclef").onclick = e => {
  e.stopPropagation();
  clefMode(!CLEFMODE);
};
$("pStaff").onclick = () => {
  if (!sel || sel.kind !== "note") return;
  const pg = pages[cur],
    o = pg.staves[+$("pStaff").dataset.o];
  if (!o) return;
  snap();
  sel.n.s = o;
  refresh();
  updPal();
  toast("Note lue avec la clé de " + (clefAt(o, sel.n.x) === "G" ? "sol" : "fa"));
};
$("pMore").onclick = () => {
  $("pal").classList.toggle("more");
  const n = sel && sel.kind === "note" ? sel.n : null;
  if (n) ensureVisible(n.x, n.y, n.s);
};
$("pClose").onclick = closeSheet;
/* « Exporter » : un seul bouton, trois formats (les projets sont, eux, enregistrés tout seuls) */
setTimeout(() => {
  const b = $("expPng"),
    png = b.onclick;
  if (!png || b._wrapped) return;
  b._wrapped = 1;
  b.onclick = e => {
    e.stopPropagation();
    let m = $("expPop");
    if (!m) {
      m = document.createElement("div");
      m.id = "expPop";
      m.className = "clefPop expPop";
      document.body.appendChild(m);
    }
    const N = pages.length;
    m.innerHTML =
      N > 1
        ? `<b class="epT">Exporter les ${N} pages</b><button data-a="pdf">PDF<small>les ${N} pages dans un seul fichier</small></button><button data-a="mid">MIDI<small>les ${N} pages à la suite</small></button><button data-a="png">Image<small>seulement la page ${cur + 1}</small></button>`
        : `<b class="epT">Exporter la partition</b><button data-a="png">Image<small>pour l'envoyer ou l'imprimer</small></button><button data-a="pdf">PDF<small>pour imprimer</small></button><button data-a="mid">MIDI<small>pour un logiciel de musique</small></button>`;
    const r = b.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - 258, r.right - 250)) + "px";
    document.querySelector("details.adv").open = false;
    m.style.bottom = "auto";
    m.hidden = false;
    m.style.top = Math.max(8, Math.min(r.bottom + 8, innerHeight - m.offsetHeight - 8)) + "px";
    m.onclick = ev => {
      const x = ev.target.closest("button");
      if (!x) return;
      m.hidden = true;
      if (x.dataset.a === "png") png.call(b, ev);
      else if (x.dataset.a === "pdf") {
        toast(pages.length > 1 ? "Préparation du PDF des " + pages.length + " pages…" : "Préparation du PDF…");
        $("expPdf").click();
      } else $("toMid").click();
    };
    setTimeout(
      () =>
        document.addEventListener(
          "pointerdown",
          function f(ev) {
            if (!m.contains(ev.target)) {
              m.hidden = true;
              document.removeEventListener("pointerdown", f, true);
            }
          },
          true
        ),
      0
    );
  };
}, 0);
$("pX").onclick = closeSheet;
$("zoneBtn").onclick = () => {
  closeSheet();
  document.body.classList.add("zoning");
};
$("pZone").onclick = () => {
  closeSheet();
  document.body.classList.add("zoning");
};
/* une action du menu ⋯ le referme, pour voir la partition (les cases à cocher le laissent ouvert) */
document.querySelector(".adv .advIn").addEventListener("click", e => {
  if (e.target.closest("button")) document.querySelector(".adv").open = false;
});
document.addEventListener("click", e => {
  const a = document.querySelector(".adv");
  if (a.open && !a.contains(e.target)) a.open = false;
});
{
  let z0 = null;
  const st = $("stage"),
    pt = e => {
      const pg = pages[cur],
        r = $("cv").getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * pg.W, ((e.clientY - r.top) / r.height) * pg.H];
    };
  st.addEventListener("pointerdown", e => {
    if (!document.body.classList.contains("zoning")) return;
    e.preventDefault();
    st.setPointerCapture(e.pointerId);
    z0 = pt(e);
  });
  st.addEventListener("pointermove", e => {
    if (!z0) return;
    const [x, y] = pt(e),
      c = $("ov").getContext("2d");
    drawMarks();
    c.save();
    c.setLineDash([12, 8]);
    c.lineWidth = Math.max(2, pages[cur].W / 600);
    c.strokeStyle = "#2F80FF";
    c.fillStyle = "rgba(47,128,255,.08)";
    c.fillRect(Math.min(x, z0[0]), Math.min(y, z0[1]), Math.abs(x - z0[0]), Math.abs(y - z0[1]));
    c.strokeRect(Math.min(x, z0[0]), Math.min(y, z0[1]), Math.abs(x - z0[0]), Math.abs(y - z0[1]));
    c.restore();
  });
  st.addEventListener("pointerup", e => {
    if (!z0) return;
    const pg = pages[cur],
      [x, y] = pt(e),
      a = z0;
    z0 = null;
    document.body.classList.remove("zoning");
    lastPinch = Date.now();
    let bx0 = Math.min(x, a[0]),
      by0 = Math.min(y, a[1]),
      bx1 = Math.max(x, a[0]),
      by1 = Math.max(y, a[1]);
    const s0 = nearestStaff(pg, (bx0 + bx1) / 2, (by0 + by1) / 2) || pg.staves[0];
    if (!s0) return;
    if (bx1 - bx0 < s0.d) {
      bx0 -= 3 * s0.d;
      bx1 += 3 * s0.d;
    }
    if (by1 - by0 < s0.d) {
      by0 -= 4 * s0.d;
      by1 += 4 * s0.d;
    }
    const found = reanalyzeBox(pg, bx0, by0, bx1, by1);
    let added = 0;
    snap();
    for (const p of found)
      if (!p.hollow && p.ledOK && p.dark >= 0.85 && ((p.stem && pg.tmpl && p.corr >= 0.65) || (p.ncc || 0) >= 0.8)) {
        const n = makeNote(pg, p);
        if (n) {
          pg.notes.push(n);
          added++;
          p.done = true;
        }
      }
    props = found.filter(p => !p.done);
    pg.sus = (pg.sus || []).filter(u => !(u.x >= bx0 && u.x <= bx1 && u.y >= by0 && u.y <= by1));
    refresh();
    select("zone", null, (bx0 + bx1) / 2, (by0 + by1) / 2, {box: [bx0, by0, bx1, by1], added});
    lastPinch = Date.now();
  });
  st.addEventListener("pointercancel", () => {
    z0 = null;
  });
}
$("revBtn").onclick = () => {
  reviewing = true;
  document.body.classList.add("reviewing");
  const it = list();
  if (it.length) select("sus", it[0], null, null, {nav: 1});
};
$("undo").onclick = () => {
  const h = hist.pop();
  if (!h) return;
  const pg = pages[cur];
  pg.notes = h.notes;
  pg.sus = h.sus;
  h.notes.forEach((n, i) => {
    n.ov = h.ov[i];
    if (h.ns && h.ns[i]) n.s = h.ns[i];
    const o = h.np && h.np[i];
    if (o) {
      for (const k in n) {
        const v = n[k];
        if ((v === null || (typeof v !== "object" && typeof v !== "function")) && !(k in o)) delete n[k];
      }
      Object.assign(n, o);
    }
  });
  pg.staves.forEach((s, i) => {
    if (h.clefs) s.clefs = h.clefs[i];
    s.clefs = h.clef[i].map(k => Object.assign({}, k));
  });
  if (h.acc) {
    pg.acc = h.acc;
    h.acc.forEach((a, i) => {
      [a.Lov, a.skip, a.del] = h.accS[i];
    });
  }
  $("undo").disabled = !hist.length;
  refresh();
  if (sel) updPal();
};
/* temps (en battements) de la page affichée qui correspond à un point de l'écran, ou null hors des portées */
function beatAtPoint(clientX, clientY, ahead = 0) {
  const pg = pages[cur],
    S = songNow();
  if (!pg || !S || !S.sys || !S.sys.length) return null;
  const r = $("cv").getBoundingClientRect(),
    x = ((clientX - r.left) / r.width) * pg.W,
    y = ((clientY - r.top) / r.height) * pg.H;
  let ys = null,
    bd = 1e9;
  for (const q of S.sys) {
    const dd = y < q.top ? q.top - y : y > q.bot ? y - q.bot : 0;
    if (dd < bd) {
      bd = dd;
      ys = q;
    }
  }
  if (!ys || bd >= 6 * (ys.d || 12)) return null;
  const k = ys.keys;
  let t = k[0][0];
  for (let i = 0; i < k.length; i++) {
    if (k[i][1] <= x + ahead * (ys.d || 12)) t = k[i][0];
    else break;
  }
  return Math.max(0, t);
}
/* pendant l'écoute ou « Jouer », toucher la partition sert à se placer, jamais à corriger */
function tapMode(e) {
  if (typeof PR !== "undefined" && PR.on) return true;
  return (PLAY || document.body.classList.contains("plOpen")) && !CLEFMODE && !(e && e.target.closest && e.target.closest(".clef"));
}
function stageTap(clientX, clientY) {
  stageTap.done = Date.now();
  if (typeof PR !== "undefined" && PR.on) {
    const t = beatAtPoint(clientX, clientY, 1);
    if (t == null || !PR.G.length) return;
    let j = PR.G.findIndex(g => g.t >= t - 1e-6);
    if (j < 0) j = PR.G.length - 1;
    PR.k = j;
    PR.tap = null;
    prShow();
    return;
  }
  const t = beatAtPoint(clientX, clientY);
  if (t == null) return;
  try {
    playStop(true);
  } catch (x) {}
  POS = t;
  playStart(POS);
}
stageTap.done = 0;
/* sur téléphone, un toucher pendant que la partition défile toute seule peut ne pas produire de « click » :
   on reconnaît donc le toucher dès le lâcher du doigt (court et sans déplacement) */
{
  let d0 = null;
  $("stage").addEventListener("pointerdown", e => {
    d0 = tapMode(e) ? {x: e.clientX, y: e.clientY, t: Date.now()} : null;
  });
  $("stage").addEventListener("pointerup", e => {
    const d = d0;
    d0 = null;
    if (!d || !tapMode(e) || Date.now() - lastPinch < 450) return;
    if (Date.now() - d.t < 500 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) stageTap(e.clientX, e.clientY);
  });
}
$("stage").addEventListener("click", e => {
  if (Date.now() - lastPinch < 450) return;
  if (!$("coach").hidden) coachDone();
  /* écoute ou « Jouer » : le toucher est traité par stageTap (plus bas), pas comme une correction */
  if (tapMode(e)) {
    e.stopPropagation();
    e.preventDefault();
    if (Date.now() - stageTap.done > 600) stageTap(e.clientX, e.clientY);
    return;
  }
  if (CLEFMODE && !e.target.closest(".clef")) {
    const pg = pages[cur],
      r = $("cv").getBoundingClientRect(),
      x = ((e.clientX - r.left) / r.width) * pg.W,
      y = ((e.clientY - r.top) / r.height) * pg.H,
      st = nearestStaff(pg, x, y);
    if (!st || y < st.top - 4 * st.d || y > st.bot + 4 * st.d) {
      toast("Touchez une portée");
      return;
    }
    if (x < st.x0 + 3 * st.d) {
      toast("Pour le début de la ligne, touchez la puce « Clé de … »");
      return;
    }
    const k = clefNear(st, x);
    snap();
    if (k) {
      st.clefs = st.clefs.filter(q => q !== k);
      refresh();
      toast("Changement de clé retiré");
      return;
    }
    const c = clefAt(st, x) === "G" ? "F" : "G";
    st.clefs.push({x, c, man: true});
    st.clefs.sort((a, b) => a.x - b.x);
    refresh();
    toast("À partir d'ici : clé de " + (c === "F" ? "fa" : "sol"));
    return;
  }
  const cb = e.target.closest(".clef");
  if (cb && +cb.dataset.k > 0) {
    clefPop(cb);
    return;
  }
  const pg = pages[cur];
  if (cb) {
    snap();
    const st = pg.staves[+cb.dataset.s],
      j = +cb.dataset.k,
      k = st.clefs[j];
    k.c = k.c === "G" ? "F" : "G";
    if (j === 0) st.clefs = st.clefs.filter((q, i) => i === 0 || q.man);
    refresh();
    return;
  }
  const r = $("cv").getBoundingClientRect(),
    x = ((e.clientX - r.left) / r.width) * pg.W,
    y = ((e.clientY - r.top) / r.height) * pg.H;
  const sc = r.width / pg.W,
    dOn = (pg.staves[0] ? pg.staves[0].d : 12) * sc;
  /* notes trop petites à l'écran pour un doigt : le premier toucher zoome sur l'endroit */
  if (document.body.classList.contains("keymode")) {
    const st = nearestStaff(pg, x, y);
    if (!st) return closeSheet();
    props = null;
    const K = KEYOV || {n: 0, flat: false, letters: [], items: []};
    let idx = -1,
      bd = 1e9;
    K.letters.forEach((L, i) => {
      const q = keySlot(pg, st, L, K.flat, i),
        yy = q.y - (K.flat ? 0.4 * st.d : 0),
        dd = Math.hypot(q.x - x, yy - y);
      if (Math.abs(q.x - x) < 0.6 * st.d && Math.abs(yy - y) < 0.8 * st.d && dd < bd) {
        bd = dd;
        idx = i;
      }
    });
    let fl = K.n ? K.flat : false,
      px = x,
      py = y;
    if (idx < 0) {
      try {
        const m = 0.35 * st.d,
          ins = a => a && x >= a.box[0] - m && x <= a.box[2] + m && y >= a.box[1] - m && y <= a.box[3] + m;
        let a = (pg.acc || [])
          .filter(q => q.s === st && !q.del && ins(q))
          .sort((p, q) => Math.abs((p.box[0] + p.box[2]) / 2 - x) - Math.abs((q.box[0] + q.box[2]) / 2 - x))[0];
        if (!a) {
          a = accFromInk(pg, st, x, y);
          if (!ins(a)) a = null;
        }
        if (a && a.type) fl = a.type === "b";
      } catch (e) {}
    }
    const sy = snapY(st, py),
      p = Math.round((st.bot - sy) / (st.d / 2)) + (keyIsF(st) ? 2 : 0),
      L = idx >= 0 ? K.letters[idx] : letterOf({s: st, x: px, y: sy, ov: null});
    /* étape « la gamme » : pas de clavier ; on coche directement le signe dans le menu de la portée en dessous */
    closeSheet();
    if (!K.n) kmFlat = !!fl;
    const nm = PAL[L][0] + (kmFlat ? "♭" : "♯");
    if (K.letters.includes(L)) {
      kmShow();
      toast(nm + " est déjà coché en dessous");
      return;
    }
    kmToggle(L);
    toast(nm + " ajouté");
    return;
  }
  const tol = 26 / sc;
  let hit = null,
    hd = 1e9;
  for (const n of pg.notes) {
    const m = Math.max(n.s.d * 0.35, tol - (n.box[2] - n.box[0]) / 2),
      [a, b, c, d] = n.box;
    if (x >= a - m && x <= c + m && y >= b - m && y <= d + m) {
      const dd = Math.hypot(x - n.x, y - n.y);
      if (dd < hd) {
        hd = dd;
        hit = n;
      }
    }
  }
  if (props && props.length) {
    let bp = null,
      bd = 1e9;
    for (const p of props) {
      const dd = Math.hypot(x - p.x, y - p.y);
      if (dd < Math.max(p.s.d, tol) && dd < bd) {
        bd = dd;
        bp = p;
      }
    }
    if (bp) {
      const L = letterOf({s: bp.s, x: bp.x, y: bp.y, ov: null}),
        n = addNote(bp.x, bp.y, L, bp.hollow);
      props = props.filter(p => p !== bp);
      pg.sus = (pg.sus || []).filter(u => Math.hypot(u.x - bp.x, u.y - bp.y) > 0.6 * u.s.d);
      refresh();
      if (n) select("note", n);
      return;
    }
  }
  {
    const ac = accAt(pg, x, y, tol);
    if (ac) {
      const inBox = x >= ac.box[0] - 0.15 * ac.s.d && x <= ac.box[2] + 0.15 * ac.s.d;
      if (
        !hit ||
        (inBox &&
          Math.hypot(x - (ac.box[0] + ac.box[2]) / 2, y - (ac.box[1] + ac.box[3]) / 2) <
            Math.hypot(x - hit.x, y - hit.y))
      ) {
        props = null;
        return select("acc", ac);
      }
    }
  }
  if (hit) {
    props = null;
    return select("note", hit, null, null, {tx: x, ty: y});
  }
  {
    let su = null,
      sd = 1e9;
    for (const u of pg.sus || []) {
      const dd = Math.hypot(x - u.x, y - u.y);
      if (dd < Math.max(u.s.d * 1.1, tol) && dd < sd) {
        sd = dd;
        su = u;
      }
    }
    if (su) {
      props = null;
      return select("sus", su);
    }
  }
  if (nearestStaff(pg, x, y)) {
    props = null;
    select("ghost", null, x, y);
  } else closeSheet();
});
$("accT").onchange = refresh;
$("outline").onchange = refresh;
$("susT").onchange = drawMarks;
$("gridT").onchange = drawMarks;
$("crisp").onchange = refresh;
$("marks").onchange = () => {
  document.body.classList.toggle("showMarks", $("marks").checked);
  drawMarks();
};
function zoomAt(z, cx, cy) {
  const v = $("view"),
    st = $("stage"),
    vr = v.getBoundingClientRect();
  if (cx == null) {
    cx = vr.left + vr.width / 2;
    cy = vr.top + Math.min(vr.height, st.offsetHeight) / 2;
  }
  const r = st.getBoundingClientRect(),
    fx = (cx - r.left) / r.width,
    fy = (cy - r.top) / r.height;
  zoom = Math.max(0.5, Math.min(14, z));
  applyZoom();
  const r2 = st.getBoundingClientRect();
  v.scrollLeft += r2.left + fx * r2.width - cx;
  v.scrollTop += r2.top + fy * r2.height - cy;
}
$("zin").onclick = () => zoomAt(zoom * 1.4);
$("zout").onclick = () => zoomAt(zoom / 1.4);
/* boutons « à maintenir » : l'effet dure tant que le doigt reste appuyé */
function holdBtn(b, onDown, onUp) {
  let on = false;
  const down = e => {
    e.preventDefault();
    e.stopPropagation();
    if (on) return;
    if (onDown() === false) return;
    on = true;
    b.classList.add("on");
  };
  const up = () => {
    if (!on) return;
    on = false;
    b.classList.remove("on");
    onUp();
  };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("pointerleave", up);
  b.addEventListener("lostpointercapture", up);
  b.addEventListener("contextmenu", e => e.preventDefault());
  b.addEventListener("click", e => e.stopPropagation());
  b.addEventListener("keydown", e => {
    if (e.key === " " || e.key === "Enter") down(e);
  });
  b.addEventListener("keyup", up);
}
const origOn = () => {
    if (!pages[cur] || !pages[cur].baseData) return false;
    document.body.classList.add("showOrig");
    $("cv").getContext("2d").putImageData(pages[cur].baseData, 0, 0);
    updHi();
  },
  origOff = () => {
    document.body.classList.remove("showOrig");
    paint(pages[cur], $("cv").getContext("2d"));
  };
holdBtn($("fzorig"), origOn, origOff);
holdBtn($("pOrig"), origOn, origOff);
/* le repère tient dans la partie visible au-dessus du panneau de correction */
function legFit() {
  const vw = document.querySelector(".viewWrap");
  if (!vw) return;
  const vr = vw.getBoundingClientRect(),
    p = $("pal"),
    pt = p.classList.contains("on") ? p.getBoundingClientRect().top : vr.bottom,
    top = Math.max(vr.top, 0),
    h = Math.max(120, Math.min(vr.bottom, pt) - top);
  document.querySelectorAll(".legOv").forEach(o => {
    o.style.bottom = "auto";
    o.style.top = top - vr.top + "px";
    o.style.height = h + "px";
    o.style.background = "none";
    const sv = o.querySelector("svg");
    if (!sv) return;
    const vb = (sv.getAttribute("viewBox") || "0 0 640 345").split(/\s+/).map(Number),
      ar = vb[2] / vb[3],
      w = Math.min(vr.width - 40, (h - 36) * ar);
    sv.style.width = w + "px";
    sv.style.height = w / ar + "px";
    sv.style.maxHeight = "none";
    sv.style.maxWidth = "none";
    const c = o.querySelector(".legCard");
    if (c) c.style.width = "auto";
  });
}
/* repère des notes : un toucher l'affiche, un autre le cache (on garde les mains libres pour corriger) */
function legSet(on) {
  const b = $("pLeg");
  if (on) {
    if (document.body.classList.contains("keymode")) keyLeg(!!(sel && sel.kflat));
    document.body.classList.add("showLeg");
    legFit();
  } else document.body.classList.remove("showLeg");
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", on);
}
$("pLeg").onclick = e => {
  e.preventDefault();
  e.stopPropagation();
  legSet(!document.body.classList.contains("showLeg"));
};
/* repère des ♯ / ♭ pour débutants : clé de sol en grand, chaque hauteur avec son signe et sa couleur */
function keyLeg(flat, inline) {
  let d = inline ? $("kmLeg") : document.querySelector(".legKey");
  if (!d) {
    d = document.createElement("div");
    d.className = "legOv legKey";
    document.querySelector(".viewWrap").appendChild(d);
  }
  const g = 22,
    W = 560,
    top = 70,
    bot = top + 4 * g,
    from = -1,
    to = 9,
    n = to - from + 1,
    dx = (W - 150) / (n - 1),
    t = flat ? "♭" : "♯";
  let o = "";
  for (let i = 0; i < 5; i++) o += `<path d="M20 ${top + i * g}H${W - 14}" stroke="#151a3b" stroke-width="2"/>`;
  o += `<text x="22" y="${top + 3.55 * g}" font-size="${5.3 * g}" font-family="serif" fill="#151a3b">𝄞</text>`;
  o += `<text x="20" y="28" fill="#5b6184" font-size="17" font-weight="800" font-family="Figtree,sans-serif">Repère : chaque ${flat ? "bémol ♭" : "dièse ♯"} et sa couleur (clé de sol)</text>`;
  for (let st = from; st <= to; st++) {
    const x = 130 + (st - from) * dx,
      y = bot - (st * g) / 2,
      L = (((2 + st) % 7) + 7) % 7,
      c = PAL[L][1];
    if (st <= -2) o += `<path d="M${x - 14} ${bot + g}H${x + 14}" stroke="#151a3b" stroke-width="2"/>`;
    o += `<text x="${x}" y="${y + (flat ? 0.15 * g : 0.42 * g)}" text-anchor="middle" font-size="${flat ? 2.3 * g : 1.95 * g}" font-weight="700" fill="${c}" stroke="#151a3b" stroke-width="1.2" paint-order="stroke" font-family="'Segoe UI Symbol','Apple Symbols','DejaVu Sans',sans-serif">${t}</text>`;
    o += `<text x="${x}" y="${bot + 2.6 * g}" text-anchor="middle" font-size="17" font-weight="800" font-family="Figtree,sans-serif" fill="${L === 4 ? "#9a8a00" : c}">${PAL[L][0]}${t}</text>`;
  }
  d.innerHTML =
    (inline ? "" : '<div class="legCard">') +
    `<svg viewBox="0 0 ${W} ${bot + 3.3 * g}" role="img" aria-label="Repère des dièses et bémols en couleurs">${o}</svg>` +
    (inline ? "" : "</div>");
}
/* repère pour débutants : toutes les notes de la clé de sol et de la clé de fa, chacune dans sa couleur */
{
  const g = 14,
    W = 560,
    staff = (top, clef, from, to, label) => {
      let o = "";
      const bot = top + 4 * g;
      for (let i = 0; i < 5; i++) o += `<path d="M70 ${top + i * g}H${W - 14}" stroke="#151a3b" stroke-width="1.6"/>`;
      o +=
        clef === "G"
          ? `<text x="14" y="${top + 3.55 * g}" font-size="${5.3 * g}" font-family="serif" fill="#151a3b">𝄞</text>`
          : `<text x="16" y="${top + 2.9 * g}" font-size="${3.6 * g}" font-family="serif" fill="#151a3b">𝄢</text>`;
      o += `<text x="14" y="${top - 2.2 * g}" text-anchor="start" fill="#5b6184" font-size="13" font-weight="700" font-family="Figtree,sans-serif">${label}</text>`;
      const n = to - from + 1,
        dx = (W - 110) / (n - 1),
        base = clef === "G" ? 2 : 4; /* pas 0 = ligne du bas : Mi (sol) / Sol (fa) */
      for (let st = from; st <= to; st++) {
        const x = 96 + (st - from) * dx,
          y = bot - (st * g) / 2,
          L = (((base + st) % 7) + 7) % 7;
        for (let l = -2; l >= st; l -= 2)
          o += `<path d="M${x - 12} ${bot - (l * g) / 2}H${x + 12}" stroke="#151a3b" stroke-width="1.6"/>`;
        for (let l = 10; l <= st; l += 2)
          o += `<path d="M${x - 12} ${bot - (l * g) / 2}H${x + 12}" stroke="#151a3b" stroke-width="1.6"/>`;
        o += `<ellipse cx="${x}" cy="${y}" rx="8.6" ry="6.4" transform="rotate(-20 ${x} ${y})" fill="${PAL[L][1]}" stroke="#151a3b" stroke-width="1.4"/>`;
        o += `<text x="${x}" y="${bot + 3.4 * g}" text-anchor="middle" font-size="11.5" font-weight="800" font-family="Figtree,sans-serif" fill="${L === 4 ? "#9a8a00" : PAL[L][1]}">${PAL[L][0]}</text>`;
      }
      return o;
    };
  const svg = `<svg viewBox="0 0 ${W} 345" role="img" aria-label="Repère des notes en couleurs">${staff(58, "G", -2, 10, "Clé de sol · main droite")}${staff(228, "F", -2, 10, "Clé de fa · main gauche")}</svg>`;
  const d = document.createElement("div");
  d.className = "legOv";
  d.innerHTML = `<div class="legCard">${svg}</div>`;
  document.querySelector(".viewWrap").appendChild(d);
}
$("fzin").onclick = e => {
  e.stopPropagation();
  zoomAt(zoom * 1.6);
};
$("fzout").onclick = e => {
  e.stopPropagation();
  zoomAt(zoom / 1.6);
};
$("fzfit").onclick = e => {
  e.stopPropagation();
  zoomAt(1);
};
{
  let lt = 0,
    lx = 0,
    ly = 0;
  $("view").addEventListener("pointerup", e => {
    if (e.pointerType === "mouse") return;
    const t = Date.now();
    if (t - lastPinch < 450) {
      lt = 0;
      return;
    }
    if (t - lt < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 30) {
      zoomAt(zoom < 3 ? zoom * 2 : 1, e.clientX, e.clientY);
      lastPinch = t;
      lt = 0;
      return;
    }
    lt = t;
    lx = e.clientX;
    ly = e.clientY;
  });
}
{
  const P = new Map();
  let pin = null;
  const v = $("view"),
    st = $("stage");
  /* zoom à deux doigts fluide : pendant le geste on agrandit l'image par transformation (instantané), et on ne recalcule la mise en page qu'au lâcher */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    mid = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
  const finish = () => {
    if (!pin) return;
    const p = pin;
    pin = null;
    st.style.transform = "";
    st.style.transformOrigin = "";
    st.style.willChange = "";
    const z = Math.max(0.5, Math.min(14, p.z * p.k));
    zoom = z;
    applyZoom();
    const r2 = st.getBoundingClientRect();
    v.scrollLeft += r2.left + p.fx * r2.width - p.c.x;
    v.scrollTop += r2.top + p.fy * r2.height - p.c.y;
    lastPinch = Date.now();
  };
  /* gestes tactiles (fiables sur iPhone/Android) : un doigt = défilement normal, deux doigts = zoom */
  const tp = t => ({x: t.clientX, y: t.clientY});
  const start = (a, b) => {
    const r = st.getBoundingClientRect(),
      c = mid(a, b);
    pin = {
      d: Math.max(10, dist(a, b)),
      z: zoom,
      k: 1,
      r,
      c,
      px: c.x - r.left,
      py: c.y - r.top,
      fx: (c.x - r.left) / r.width,
      fy: (c.y - r.top) / r.height
    };
    st.style.transformOrigin = "0 0";
    st.style.willChange = "transform";
  };
  const move = (a, b) => {
    const c = mid(a, b);
    let k = dist(a, b) / pin.d;
    k = Math.max(0.5 / pin.z, Math.min(14 / pin.z, k));
    pin.k = k;
    pin.c = c;
    /* le point de la partition qui était sous les doigts suit leur milieu */
    const tx = c.x - pin.r.left - pin.px * k,
      ty = c.y - pin.r.top - pin.py * k;
    st.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
    lastPinch = Date.now();
  };
  v.addEventListener(
    "touchstart",
    e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        start(tp(e.touches[0]), tp(e.touches[1]));
      }
    },
    {passive: false}
  );
  v.addEventListener(
    "touchmove",
    e => {
      if (pin && e.touches.length >= 2) {
        e.preventDefault();
        move(tp(e.touches[0]), tp(e.touches[1]));
      }
    },
    {passive: false}
  );
  const tend = e => {
    if (pin && e.touches.length < 2) {
      finish();
      lastPinch = Date.now();
    }
  };
  v.addEventListener("touchend", tend);
  v.addEventListener("touchcancel", tend);
  /* sans écran tactile (stylet, Windows) : mêmes gestes avec les pointeurs */
  if (!("ontouchstart" in window)) {
    v.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return;
      P.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (P.size === 2) {
        const [a, b] = [...P.values()];
        start(a, b);
      }
    });
    v.addEventListener("pointermove", e => {
      if (!P.has(e.pointerId)) return;
      P.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pin && P.size === 2) {
        const [a, b] = [...P.values()];
        move(a, b);
      }
    });
    const up = e => {
      P.delete(e.pointerId);
      if (P.size < 2) finish();
    };
    v.addEventListener("pointerup", up);
    v.addEventListener("pointercancel", up);
  }
  v.addEventListener(
    "wheel",
    e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    },
    {passive: false}
  );
}
const goPage = i => {
  if (i < 0 || i >= pages.length || i === cur || $("busy").classList.contains("on")) return;
  try {
    playStop();
  } catch (e) {}
  POS = 0;
  show(i);
};
$("prev").onclick = () => goPage(cur - 1);
$("next").onclick = () => goPage(cur + 1);
new ResizeObserver(() => pages.length && applyZoom()).observe($("view"));

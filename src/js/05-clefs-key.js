function clefOf(R, W, s) {
  const d = s.d,
    full = x => {
      let k = 0;
      for (let i = 0; i < 4; i++) if (R[Math.round((s.ys[i] + s.ys[i + 1]) / 2) * W + x]) k++;
      return k >= 4;
    };
  const empty = x => {
    for (let y = Math.round(s.top); y <= s.bot; y++) if (R[y * W + x]) return false;
    return true;
  };
  let x0 = Math.round(s.x0);
  const lim = x0 + 2.5 * d;
  let fb = -1;
  for (let x = x0; x < lim; x++)
    if (full(x)) fb = x;
    else if (fb >= 0) break;
  if (fb >= 0) {
    x0 = fb + 1;
    while (x0 < lim && empty(x0)) x0++;
  }
  s.cx0 = x0;
  const xa = Math.round(x0 + 0.1 * d),
    xb = Math.round(x0 + 2.9 * d);
  let ink = 0,
    n = 0;
  const zones = [
    [s.top - 1.9 * d, s.top - 0.5 * d],
    [s.bot + 0.5 * d, s.bot + 1.6 * d]
  ];
  /* la clé peut commencer un peu plus loin (accolade, photo) : on regarde aussi une fenêtre décalée et on garde la mieux remplie */
  const zrw = (xa, xb) =>
    zones.map(([a, b]) => {
      let k = 0,
        m = 0;
      for (let y = Math.round(a); y <= Math.round(b); y++)
        for (let x = xa; x <= xb; x++) {
          m++;
          if (y >= 0 && y * W < R.length && R[y * W + x]) k++;
        }
      return k / m;
    });
  const z1 = zrw(xa, xb),
    z2 = zrw(Math.round(x0 + 0.8 * d), Math.round(x0 + 3.6 * d)),
    zr = z1[0] + z1[1] >= z2[0] + z2[1] ? z1 : z2;
  const H = R.length / W,
    box = [
      Math.round(x0 + 0.8 * d),
      Math.max(0, Math.round(s.top - 0.2 * d)),
      Math.min(W - 1, Math.round(s.x0 + 4.5 * d)),
      Math.min(H - 1, Math.round(s.top + 2.2 * d))
    ];
  const {comps} = label(R, W, H, 1, true, box),
    dl = comps.filter(c => {
      const w = c.x1 - c.x0 + 1,
        h = c.y1 - c.y0 + 1;
      return !c.edge && w >= 0.18 * d && w <= 0.6 * d && h >= 0.18 * d && h <= 0.6 * d && c.n >= 0.5 * w * h;
    });
  const up = dl.find(c => Math.abs(c.cy - (s.top + 0.5 * d)) < 0.28 * d),
    lo = up && dl.find(c => Math.abs(c.cy - (s.top + 1.5 * d)) < 0.28 * d && Math.abs(c.cx - up.cx) < 0.4 * d);
  {
    /* la queue de la clé de sol : sous la portée, dans la première moitié de la clé. Une clé de fa n'a rien là (son corps reste dans le haut de la portée) */
    const fr = (xa, xb, ya, yb) => {
      let k = 0,
        m = 0;
      for (let y = Math.max(0, Math.round(ya)); y <= Math.min(H - 1, Math.round(yb)); y++) {
        if (s.ys.some(l => Math.abs(y - l) <= Math.max(1, 0.1 * d))) continue;
        for (let x = Math.round(xa); x <= Math.round(xb); x++) {
          m++;
          if (R[y * W + x]) k++;
        }
      }
      return m ? k / m : 0;
    };
    s._tail = [
      fr(x0 + 0.1 * d, x0 + 1.1 * d, s.bot + 0.45 * d, s.bot + 1.6 * d),
      fr(x0 + 0.1 * d, x0 + 1.1 * d, s.top, s.top + 2 * d),
      fr(x0 + 0.1 * d, x0 + 1.1 * d, s.top - 1.8 * d, s.top - 0.45 * d)
    ];
    if (s._tail[0] < 0.02 && s._tail[1] > 0.2) return "F";
    if (s._tail[0] >= 0.05 && s._tail[1] > 0.06) return "G";
  }
  if (up && lo) return "F";
  /* forme de la clé elle-même (morceaux d'encre qui commencent au début de la portée, armure exclue) :
   une clé de sol dépasse largement en haut et en bas (plus de 5 interlignes), une clé de fa reste dans le haut de la portée */
  {
    const bx = [
        Math.max(0, Math.round(x0 - 0.3 * d)),
        Math.max(0, Math.round(s.top - 3 * d)),
        Math.min(W - 1, Math.round(x0 + 3 * d)),
        Math.min(H - 1, Math.round(s.bot + 3 * d))
      ],
      {comps: cc} = label(R, W, H, 1, true, bx);
    let y0 = 1e9,
      y1 = -1e9,
      nk = 0;
    for (const c of cc) {
      if (c.x0 > x0 + 1.3 * d || c.x1 < x0 - 0.2 * d || c.n < 0.08 * d * d) continue;
      const w = c.x1 - c.x0 + 1;
      if (w < 0.3 * d && c.y1 - c.y0 > 4 * d) continue;
      /* barre ou accolade */ y0 = Math.min(y0, c.y0);
      y1 = Math.max(y1, c.y1);
      nk += c.n;
    }
    if (nk > 0.6 * d * d) {
      const hgt = (y1 - y0) / d;
      if (hgt >= 5 && y0 <= s.top - 0.8 * d && y1 >= s.bot + 0.6 * d) return "G";
      if (hgt >= 2.2 && hgt <= 4.3 && y0 >= s.top - 0.9 * d && y1 <= s.bot - 0.2 * d) return "F";
    }
  }
  /* la clé de sol descend nettement sous la portée (≈1 interligne d'encre) ; la clé de fa presque pas */
  s.cWeak = true;
  return (zr[0] > 0.04 && zr[1] > 0.05) || (zr[0] > 0.015 && zr[1] > 0.2) ? "G" : "F";
}
/* système de piano relié au début (trait vertical entre les deux portées) : si la portée du bas n'a qu'un indice faible de clé de sol, c'est une clé de fa */
/* armure lue sur la 1re portée : les signes serrés entre la clé et le chiffrage.
 Le 1er signe dit s'il s'agit de dièses (sur la ligne du haut en clé de sol) ou de bémols (sur la ligne du milieu). */
function keySigGuess(B, W, H, staves) {
  const out = [];
  for (const s of staves.slice(0, 4)) {
    const g = keySig1(B, W, H, s);
    if (g) out.push(g);
  }
  if (!out.length) return null;
  const cnt = {};
  for (const g of out) {
    const k = g.n + (g.flat ? "b" : "s");
    cnt[k] = (cnt[k] || 0) + 1;
  }
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (best[1] < Math.min(2, out.length)) return null;
  return {n: parseInt(best[0]), flat: best[0].endsWith("b"), votes: best[1], of: out.length};
}
function keySig1(B, W, H, s) {
  const d = s.d,
    lw = Math.max(1, Math.round((s.lw || d * 0.12) * 0.8)),
    y0 = Math.max(0, Math.round(s.top - 2.2 * d)),
    y1 = Math.min(H - 1, Math.round(s.bot + 1.6 * d));
  const onLine = y => s.ys.some(l => Math.abs(y - l) <= lw);
  const rows = [];
  for (let y = y0; y <= y1; y++) if (!onLine(y)) rows.push(y);
  const col = x => {
    if (x < 0 || x >= W) return 0;
    let k = 0;
    for (const y of rows) if (B[y * W + x]) k++;
    return k;
  };
  const th = Math.max(2, 0.22 * d);
  const cx = Math.round(s.cx0 || s.x0);
  let x = cx + Math.round(1.6 * d);
  const lim = cx + Math.round(4.2 * d);
  /* fin de la clé : premier vide après le corps de la clé (les deux points d'une clé de fa sont sautés) */
  while (x < lim && col(x) >= th) x++;
  if (x >= lim) return null;
  const segs = [];
  let a = -1,
    gap = 0;
  const xe = Math.min(W - 1, s.tsc && s.tsc.length && s.tsc[0][0] > x ? s.tsc[0][0] - 1 : x + Math.round(9 * d));
  for (let X = x; X <= xe; X++) {
    const c = col(X);
    if (c >= th) {
      if (a < 0) a = X;
      gap = 0;
    } else if (a >= 0) {
      segs.push([a, X - 1]);
      a = -1;
    } else {
      gap++;
      if (segs.length && gap > 1.3 * d) break;
      if (!segs.length && gap > 2.2 * d) break;
    }
  }
  if (a >= 0) segs.push([a, xe]);
  const bb = ([p, q]) => {
    let t = 1e9,
      b = -1,
      n = 0;
    for (let X = p; X <= q; X++)
      for (const y of rows)
        if (B[y * W + X]) {
          n++;
          if (y < t) t = y;
          if (y > b) b = y;
        }
    return {p, q, t, b, n, c: (t + b) / 2, w: q - p + 1, h: b - t + 1};
  };
  let G = segs.map(bb).filter(o => o.w >= 0.12 * d);
  /* les deux points de la clé de fa : petits, dans le haut de la portée */
  if (s.clefs && s.clefs[0] && s.clefs[0].c === "F")
    G = G.filter(o => !(o.h < 0.75 * d && o.w < 0.6 * d && o.c < s.top + 2 * d && o.p < cx + 3.4 * d));
  const ok = o => o.w >= 0.4 * d && o.w <= 1.45 * d && o.h >= 1.9 * d && o.h <= 3.9 * d;
  const sig = [];
  for (const o of G) {
    if (!ok(o)) break;
    if (sig.length && o.p - sig[sig.length - 1].q > 1.2 * d) break;
    sig.push(o);
    if (sig.length >= 7) break;
  }
  if (!sig.length) return {n: 0, flat: false};
  const F = s.clefs && s.clefs[0] && s.clefs[0].c === "F" ? d : 0,
    hs = d / 2;
  /* hauteur attendue (en demi-interlignes sous la ligne du haut) du centre de chaque signe */
  const SH = [0, 3, -1, 2, 5, 1, 4],
    FL = [4, 1, 5, 2, 6, 3, 7];
  const cS = o => o.c,
    cF = o => o.b - 0.55 * d;
  const fit = (arr, cf, ex) => {
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = s.top + F + ex[i] * hs;
      if (Math.abs(cf(arr[i]) - e) <= 1.05 * hs) n++;
      else break;
    }
    return n;
  };
  const nS = fit(sig, cS, SH),
    nF = fit(sig, cF, FL);
  if (!nS && !nF) return null;
  return nS >= nF ? {n: nS, flat: false} : {n: nF, flat: true};
}
/* chaque note appartient à la portée la plus proche : une note entre deux portées (lignes supplémentaires) ne doit pas être lue avec la clé de l'autre portée */
function staffOwn(pg) {
  const S = pg.staves || [];
  if (S.length < 2) return;
  const dist = (st, y) => (y < st.top ? st.top - y : y > st.bot ? y - st.bot : 0);
  let moved = 0;
  for (const n of pg.notes || []) {
    if (!n.s) continue;
    const own = dist(n.s, n.y);
    if (own <= 1.5 * n.s.d) continue;
    let best = n.s,
      bd = own;
    for (const st of S) {
      if (st === n.s || n.x < st.x0 - st.d || n.x > st.x1 + st.d) continue;
      const dd = dist(st, n.y);
      if (dd < bd - 0.5 * st.d && (dd <= 0.5 * st.d || (own > 4 * n.s.d && dd < own - 2 * st.d))) {
        bd = dd;
        best = st;
      }
    }
    if (best !== n.s) {
      n.s = best;
      moved++;
    }
  }
  /* une note reliée par sa hampe à une note posée dans une portée appartient à cette portée (accord qui descend sous la clé de sol, ou monte au-dessus de la clé de fa) */
  try {
    const W = pg.W,
      H = pg.H,
      G = pg.cv.getContext("2d").getImageData(0, 0, W, H).data,
      dark = (x, y) => x >= 0 && x < W && y >= 0 && y < H && G[(y * W + x) * 4] < 150;
    const stemOK = (a, b, d) => {
      const y0 = Math.round(Math.min(a.y, b.y)),
        y1 = Math.round(Math.max(a.y, b.y));
      if (y1 - y0 < d) return false;
      for (const side of [-1, 1])
        for (let k = 0.35; k <= 0.75; k += 0.1) {
          const x = Math.round(a.x + side * k * d);
          let n = 0,
            t = 0;
          for (let y = y0; y <= y1; y++) {
            t++;
            if (dark(x, y) || dark(x + 1, y) || dark(x - 1, y)) n++;
          }
          if (n >= 0.88 * t) return true;
        }
      return false;
    };
    for (const st of S) {
      const ins = pg.notes.filter(n => n.s === st && n.y >= st.top - 0.6 * st.d && n.y <= st.bot + 0.6 * st.d);
      for (const b of pg.notes) {
        if (b.s === st) continue;
        const d = st.d;
        if (b.y > st.top - 0.6 * d && b.y < st.bot + 0.6 * d) continue;
        if (Math.min(Math.abs(b.y - st.top), Math.abs(b.y - st.bot)) > 7 * d) continue;
        const a = ins.find(q => Math.abs(q.x - b.x) < 0.9 * d && stemOK(q, b, d));
        if (a) {
          b.s = st;
          moved++;
        }
      }
    }
  } catch (e) {
    console.warn("hampes", e);
  }
  if (moved) console.log("notes rattachées à la bonne portée :", moved);
}
/* outil « changement de clé » : le bouton 𝄢 puis un toucher sur la portée ; une puce de changement ouvre un petit menu */
let CLEFMODE = false;
function clefMode(on) {
  CLEFMODE = on;
  document.body.classList.toggle("clefmode", on);
  $("fzclef").classList.toggle("on", on);
  let b = $("clefBan");
  if (on) {
    closeSheet();
    if (!b) {
      b = document.createElement("div");
      b.id = "clefBan";
      b.className = "clefBan";
      b.innerHTML =
        '<span><b>Changement de clé</b><small>Touchez la portée là où la clé change. Touchez un rond 𝄞/𝄢 pour l\'enlever.</small></span><button type="button" id="clefBanX">Terminé</button>';
      document.body.appendChild(b);
      $("clefBanX").onclick = e => {
        e.stopPropagation();
        clefMode(false);
      };
    }
    b.hidden = false;
  } else if (b) b.hidden = true;
}
/* le mode reste actif tant qu'on ne touche pas autre chose que la partition */
document.addEventListener(
  "pointerdown",
  e => {
    if (!CLEFMODE) return;
    const t = e.target;
    if (t.closest("#stage") || t.closest("#clefBan") || t.closest("#clefPop")) return;
    if (t.closest("button,a,label,input,select,.chip")) clefMode(false);
  },
  true
);
function clefPop(cb) {
  const pg = pages[cur],
    st = pg.staves[+cb.dataset.s],
    j = +cb.dataset.k,
    k = st.clefs[j];
  let m = $("clefPop");
  if (!m) {
    m = document.createElement("div");
    m.id = "clefPop";
    m.className = "clefPop";
    document.body.appendChild(m);
  }
  const o = k.c === "G" ? "fa" : "sol",
    r = cb.getBoundingClientRect();
  m.innerHTML = `<button data-a="t">Mettre une clé de ${o}</button><button data-a="d">Supprimer ce changement</button><button data-a="x">Annuler</button>`;
  m.style.left = Math.max(8, Math.min(innerWidth - 238, r.left)) + "px";
  m.style.top = Math.min(innerHeight - 170, r.bottom + 6) + "px";
  m.hidden = false;
  m.onclick = ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    m.hidden = true;
    if (b.dataset.a === "x") return;
    snap();
    if (b.dataset.a === "t") k.c = k.c === "G" ? "F" : "G";
    else st.clefs = st.clefs.filter(q => q !== k);
    st.clefs = st.clefs.filter((q, i) => i === 0 || q.c !== st.clefs[i - 1].c);
    refresh();
    toast(b.dataset.a === "t" ? "Clé changée, notes recalculées" : "Changement retiré, notes recalculées");
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
}
function clefPairFix(R, W, staves) {
  for (let i = 0; i + 1 < staves.length; i++) {
    const a = staves[i],
      b = staves[i + 1];
    const up = a.c0 === "F" && a.cWeak && b.c0 === "F",
      down = a.c0 === "G" && b.c0 === "G" && b.cWeak;
    if (!up && !down) continue;
    const d = (a.d + b.d) / 2;
    if (b.top - a.bot > 9 * d) continue;
    const xs = Math.round(Math.min(a.x0, b.x0) - 1.2 * d),
      xe = Math.round(Math.max(a.x0, b.x0) + 0.6 * d),
      y0 = Math.round(a.bot + 0.3 * d),
      y1 = Math.round(b.top - 0.3 * d);
    if (y1 <= y0) continue;
    let ok = false;
    for (let x = Math.max(0, xs); x <= xe && !ok; x++) {
      let k = 0;
      for (let y = y0; y <= y1; y++) if (R[y * W + x] || R[y * W + x + 1] || (x > 0 && R[y * W + x - 1])) k++;
      if (k >= 0.9 * (y1 - y0 + 1)) ok = true;
    }
    if (ok) {
      if (down) b.c0 = "F";
      else a.c0 = "G";
    }
  }
}

let pageClefRefs = null;
const clefLike = (L, c, kind) => {
  if (!pageClefRefs || !pageClefRefs.refs[kind].length) return 0;
  const v = pageClefRefs.sig(L, c);
  let best = -1;
  for (const r of pageClefRefs.refs[kind]) {
    let ma = 0,
      mb = 0;
    for (let i = 0; i < v.length; i++) {
      ma += v[i];
      mb += r[i];
    }
    ma /= v.length;
    mb /= v.length;
    let n = 0,
      da = 0,
      db = 0;
    for (let i = 0; i < v.length; i++) {
      const p = v[i] - ma,
        q = r[i] - mb;
      n += p * q;
      da += p * p;
      db += q * q;
    }
    const c2 = da && db ? n / Math.sqrt(da * db) : 0;
    if (c2 > best) best = c2;
  }
  return best;
};
function clefChanges(R, W, H, s) {
  s.excl = [];
  s.tsc = [];
  s.exclH = [];
  const d = s.d,
    box = [
      Math.round((s.cx0 || s.x0) + 1 * d),
      Math.max(0, Math.round(s.top - 2.6 * d)),
      Math.min(W - 1, Math.round(s.x1 + 2 * d)),
      Math.min(H - 1, Math.round(s.bot + 2.6 * d))
    ];
  if (box[2] <= box[0]) return [];
  const {L, comps} = label(R, W, H, 1, true, box),
    out = [];
  /* barre de mesure proche : colonne d'encre de la 1re à la 5e ligne */
  const barAt = x => {
    x = Math.round(x);
    if (x < 0 || x >= W) return false;
    let k = 0,
      t = 0;
    for (let y = Math.round(s.top); y <= Math.round(s.bot); y++) {
      t++;
      if (R[y * W + x] || (x > 0 && R[y * W + x - 1]) || (x < W - 1 && R[y * W + x + 1])) k++;
    }
    return k >= 0.97 * t;
  };
  const barNear = (x0, x1, dl, dr) => {
    for (let x = x0 - dl; x <= x0; x++) if (barAt(x)) return true;
    for (let x = x1; x <= x1 + dr; x++) if (barAt(x)) return true;
    return false;
  };
  s.barNear = barNear;
  const span = (c, y) => {
    let a = 1e9,
      b = -1;
    const r = Math.round(y);
    for (let x = c.x0; x <= c.x1; x++)
      if (L[r * W + x] === c.id) {
        if (x < a) a = x;
        if (x > b) b = x;
      }
    return b - a;
  };
  const holeArea = c => {
    const w = c.x1 - c.x0 + 3,
      h = c.y1 - c.y0 + 3,
      V = new Uint8Array(w * h),
      st = [];
    const inC = (x, y) => {
      const X = x + c.x0 - 1,
        Y = y + c.y0 - 1;
      return X >= 0 && Y >= 0 && X < W && Y < H && L[Y * W + X] === c.id;
    };
    for (let x = 0; x < w; x++) {
      st.push(x, 0, x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      st.push(0, y, w - 1, y);
    }
    while (st.length) {
      const y = st.pop(),
        x = st.pop();
      if (x < 0 || y < 0 || x >= w || y >= h || V[y * w + x] || inC(x, y)) continue;
      V[y * w + x] = 1;
      st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    let a = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!V[y * w + x] && !inC(x, y)) a++;
    /* plus grand trou d'un seul tenant : la grande boucle d'une clé de sol est bien plus grande que le trou d'une blanche */
    let mx = 0;
    const S = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (V[y * w + x] || inC(x, y) || S[y * w + x]) continue;
        let n = 0;
        const st2 = [x, y];
        S[y * w + x] = 1;
        while (st2.length) {
          const yy = st2.pop(),
            xx = st2.pop();
          n++;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
          ]) {
            const X = xx + dx,
              Y = yy + dy;
            if (X < 0 || Y < 0 || X >= w || Y >= h || V[Y * w + X] || inC(X, Y) || S[Y * w + X]) continue;
            S[Y * w + X] = 1;
            st2.push(X, Y);
          }
        }
        if (n > mx) mx = n;
      }
    c.maxHole = mx;
    return a;
  };
  for (const c of comps) {
    const w = c.x1 - c.x0 + 1,
      h = c.y1 - c.y0 + 1;

    if (
      h >= 3.8 * d &&
      c.y0 <= s.top - 0.2 * d &&
      c.y1 >= s.bot + 0.5 * d &&
      w >= 1.6 * d &&
      w <= 3.2 * d &&
      Math.max(span(c, s.ys[1]), span(c, s.ys[2]), span(c, s.ys[3])) >= 1.2 * d &&
      holeArea(c) >= 0.12 * d * d
    ) {
      /* changement de clé en cours de portée : près d'une barre, vraie boucle, assez large (sinon c'est un accord) */ if (
        c.x0 >
        (s.cx0 || s.x0) + 2.5 * d
      ) {
        const cl = clefLike(L, c, "G"),
          up = (s.top - c.y0) / d,
          dn = (c.y1 - s.bot) / d;
        if (window.__CL3) __CL3.push([c.x0, c.y0, cl]);
        /* clé de sol de changement (petite taille) : dépasse peu au-dessus, ≈1 interligne dessous, près d'une barre */
        if (!(
          cl >= 0.6 ||
          (barNear(c.x0, c.x1, 3 * d, 3 * d) &&
            up >= 0.1 &&
            up <= 0.45 &&
            dn >= 0.8 &&
            dn <= 1.3 &&
            w >= 1.7 * d &&
            w <= 2.3 * d &&
            c.maxHole >= 0.2 * d * d)
        ))
          continue;
      }
      out.push({x: c.x0, c: "G", box: [c.x0, c.y0, c.x1, c.y1]});
    }
  }
  const dots = comps.filter(c => {
    const w = c.x1 - c.x0 + 1,
      h = c.y1 - c.y0 + 1;
    return w >= 0.15 * d && w <= 0.65 * d && h >= 0.15 * d && h <= 0.65 * d && c.n >= 0.55 * w * h;
  });
  for (const a of dots) {
    if (Math.abs(a.cy - (s.top + 0.5 * s.d)) > 0.3 * d) continue;
    const b = dots.find(q => Math.abs(q.cx - a.cx) <= 0.35 * d && Math.abs(q.cy - (s.top + 1.5 * d)) <= 0.3 * d);
    if (!b) continue;
    const g = comps.find(
      q =>
        q !== a &&
        q !== b &&
        q.x1 < a.x0 &&
        q.x1 >= a.x0 - 1.4 * d &&
        q.y1 - q.y0 >= 2 * d &&
        q.y0 <= s.top + 0.3 * d &&
        q.x1 - q.x0 >= 1 * d &&
        !stemRun(R, W, H, q.x0, q.x1, q.y0, q.y1, 2.6 * d)
    );
    if (g) out.push({x: g.x0, c: "F", box: [g.x0, Math.min(g.y0, a.y0), b.x1, Math.max(g.y1, b.y1)]});
  }
  const mid = s.ys[2],
    tall = comps.filter(c => {
      const w = c.x1 - c.x0 + 1,
        h = c.y1 - c.y0 + 1;
      return h >= 1.5 * d && h <= 2.4 * d && w >= 0.7 * d && w <= 2 * d;
    });
  for (const a of tall) {
    if (Math.abs(a.y0 - s.top) > 0.35 * d || Math.abs(a.y1 - mid) > 0.35 * d) continue;
    const b = tall.find(
      q =>
        q !== a &&
        Math.abs(q.cx - a.cx) < 0.5 * d &&
        Math.abs(q.y0 - mid) < 0.35 * d &&
        Math.abs(q.y1 - s.bot) < 0.35 * d
    );
    if (b) s.excl.push([Math.min(a.x0, b.x0) - 2, a.y0 - 2, Math.max(a.x1, b.x1) + 2, b.y1 + 2]);
  }
  /* chiffrage collé en un seul bloc (image peu nette) : bloc de la 1re à la 5e ligne, sans hampe qui dépasse */
  for (const c of comps) {
    const w = c.x1 - c.x0 + 1,
      h = c.y1 - c.y0 + 1;
    if (h < 3.7 * d || h > 4.5 * d || w < 0.7 * d || w > 2 * d) continue;
    if (Math.abs(c.y0 - s.top) > 0.4 * d || Math.abs(c.y1 - s.bot) > 0.4 * d) continue;
    if (c.n < 0.25 * w * h || c.n > 0.75 * w * h) continue;
    s.tsc.push([c.x0 - 2, c.y0 - 2, c.x1 + 2, c.y1 + 2]);
  }
  return out.filter(k => k.x > (s.cx0 || s.x0) + 2.5 * d).sort((p, q) => p.x - q.x);
}

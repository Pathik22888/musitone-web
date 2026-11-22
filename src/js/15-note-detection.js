/* têtes blanches serrées sur une même hampe : on teste chaque hauteur possible.
 Une vraie tête blanche = un anneau d'encre autour d'un trou vide (une fois les lignes de portée retirées). */
function ringScan(pg, s, X, Y0, Y1) {
  const d = s.d,
    ctx = pg.cv.getContext("2d"),
    x0 = Math.max(0, Math.round(X - 1.8 * d)),
    y0 = Math.max(0, Math.round(Y0 - 1.2 * d)),
    w = Math.min(pg.W - x0, Math.round(3.6 * d)),
    h = Math.min(pg.H - y0, Math.round(Y1 - Y0 + 2.4 * d));
  if (w < 4 || h < 4) return [];
  const id = ctx.getImageData(x0, y0, w, h).data,
    bg = pg.paper || 230,
    ink = Math.min(s.ink == null ? 60 : s.ink, bg - 20),
    th = (bg + ink) / 2,
    B = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < B.length; i++, j += 4)
    B[i] = (id[j] * 77 + id[j + 1] * 150 + id[j + 2] * 29) >> 8 < th ? 1 : 0;
  const lw = Math.max(1, Math.round(s.lw || 2)),
    rows = s.ys.slice();
  for (let q = 1; q <= 6; q++) rows.push(s.top - q * d, s.bot + q * d);
  for (const yy of rows) {
    const r = Math.round(yy - y0);
    if (r < -lw - 1 || r >= h + lw + 1) continue;
    for (let x = 0; x < w; x++)
      for (let q = -lw - 1; q <= lw + 1; q++) {
        const y = r + q;
        if (y < 0 || y >= h || !B[y * w + x]) continue;
        let a = y,
          b = y;
        while (a > 0 && B[(a - 1) * w + x]) a--;
        while (b < h - 1 && B[(b + 1) * w + x]) b++;
        if (b - a + 1 <= lw + 2) for (let t = a; t <= b; t++) B[t * w + x] = 0;
        break;
      }
  }
  const onL = yy => rows.some(r => Math.abs(r - yy) <= Math.max(1, lw / 2));
  const th0 = -0.45,
    co = Math.cos(th0),
    si = Math.sin(th0),
    A = 0.66 * d,
    Bv = 0.48 * d,
    ca = 0.36 * d,
    cb = 0.2 * d,
    out = [];
  const score = (cx, cy) => {
    let ci = 0,
      cn = 0,
      ri = 0,
      rn = 0;
    const R = Math.ceil(A) + 1;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const X2 = Math.round(cx + dx),
          Y2 = Math.round(cy + dy);
        if (X2 < 0 || Y2 < 0 || X2 >= w || Y2 >= h) continue;
        const u = dx * co + dy * si,
          v = -dx * si + dy * co,
          e = (u / A) ** 2 + (v / Bv) ** 2,
          b = B[Y2 * w + X2];
        if ((u / ca) ** 2 + (v / cb) ** 2 <= 1) {
          if (!onL(Y2 + y0)) {
            cn++;
            ci += b;
          }
        } else if (e >= 0.5 && e <= 1) {
          rn++;
          ri += b;
        }
      }
    return {core: cn ? ci / cn : 1, ring: rn ? ri / rn : 0};
  };
  for (let y = snapY(s, Y0); y <= Y1 + 0.01; y += d / 2) {
    let best = null;
    for (let dx = -0.5 * d; dx <= 0.5 * d; dx += 1) {
      const r = score(X - x0 + dx, y - y0);
      const v = r.ring - r.core;
      if (!best || v > best.v) best = {x: X + dx, y, v, core: r.core, ring: r.ring};
    }
    out.push(best);
  }
  return out;
}
function grayRing(pg, s, X, Y0, Y1) {
  const d = s.d,
    ctx = pg.cv.getContext("2d"),
    xa = Math.max(0, Math.round(X - 2 * d)),
    ya = Math.max(0, Math.round(Y0 - 1.6 * d)),
    w = Math.min(pg.W - xa, Math.round(4 * d)),
    h = Math.min(pg.H - ya, Math.round(Y1 - Y0 + 3.2 * d));
  if (w < 4 || h < 4) return [];
  const id = ctx.getImageData(xa, ya, w, h).data,
    g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (id[j] * 77 + id[j + 1] * 150 + id[j + 2] * 29) / 256;
  const lw = Math.max(1, s.lw || 2),
    rows = s.ys.slice();
  for (let q = 1; q <= 6; q++) rows.push(s.top - q * d, s.bot + q * d);
  const onL = yy => rows.some(r => Math.abs(r - yy) <= lw * 0.75 + 0.5);
  const mk = (A, B, ang, ha, hb, hang) => {
    const R = Math.ceil(d),
      pts = [];
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const u = dx * Math.cos(ang) + dy * Math.sin(ang),
          v = -dx * Math.sin(ang) + dy * Math.cos(ang),
          e = (u / A) ** 2 + (v / B) ** 2;
        const hu = dx * Math.cos(hang) + dy * Math.sin(hang),
          hv = -dx * Math.sin(hang) + dy * Math.cos(hang);
        if (e > 1.35 * 1.35) continue;
        pts.push([dx, dy, e <= 1 && (hu / ha) ** 2 + (hv / hb) ** 2 > 1 ? 1 : 0]);
      }
    return pts;
  };
  const Ts = [
      mk(0.64 * d, 0.47 * d, -0.38, 0.4 * d, 0.17 * d, -0.6),
      mk(0.82 * d, 0.5 * d, 0, 0.4 * d, 0.3 * d, 0.55)
    ],
    out = [];
  for (let y = snapY(s, Y0); y <= Y1 + 0.01; y += d / 2) {
    const ly = Math.round(y - ya);
    let best = {v: -1, x: X, y};
    for (const T of Ts) {
      const pts = T.filter(p => !onL(y + p[1]) && ly + p[1] >= 0 && ly + p[1] < h),
        n = pts.length;
      if (n < 10) continue;
      let mt = 0;
      for (const p of pts) mt += p[2];
      mt /= n;
      let vt = 0;
      for (const p of pts) vt += (p[2] - mt) ** 2;
      if (!vt) continue;
      for (let x = Math.round(X - xa - 0.45 * d); x <= Math.round(X - xa + 0.45 * d); x++) {
        if (x - Math.ceil(d) < 0 || x + Math.ceil(d) >= w) continue;
        let mg = 0;
        for (const p of pts) mg += g[(ly + p[1]) * w + x + p[0]];
        mg /= n;
        let cov = 0,
          vg = 0;
        for (const p of pts) {
          const q = g[(ly + p[1]) * w + x + p[0]] - mg;
          cov += -q * (p[2] - mt);
          vg += q * q;
        }
        const v = vg ? cov / Math.sqrt(vg * vt) : 0;
        if (v > best.v) best = {v, x: xa + x, y};
      }
    }
    out.push(best);
  }
  return out;
}
/* bords haut/bas d'une pile de têtes blanches, en niveaux de gris : la tête du bas est à ½ interligne au-dessus du bord bas */
function stackEdges(pg, s, X, Ytop, Ybot) {
  const d = s.d,
    ctx = pg.cv.getContext("2d"),
    xa = Math.max(0, Math.round(X - 0.45 * d)),
    w = Math.max(2, Math.round(0.9 * d)),
    ya = Math.max(0, Math.round(Ytop - 2.5 * d)),
    h = Math.min(pg.H - ya, Math.round(Ybot - Ytop + 5 * d));
  const id = ctx.getImageData(xa, ya, Math.min(w, pg.W - xa), h).data,
    ww = Math.min(w, pg.W - xa),
    g = new Float32Array(ww * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (id[j] * 77 + id[j + 1] * 150 + id[j + 2] * 29) / 256;
  let lo = 255,
    hi = 0;
  for (const v of g) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 40) return null;
  const thr = (hi + lo) / 2;
  const lw = Math.max(1, s.lw || 2),
    rows = s.ys.slice();
  for (let q = 1; q <= 6; q++) rows.push(s.top - q * d, s.bot + q * d);
  const onL = yy => rows.some(r => Math.abs(r - yy) <= lw * 0.75 + 1);
  const f = y => {
    const r = Math.round(y - ya);
    if (r < 0 || r >= h) return 0;
    let c = 0;
    for (let x = 0; x < ww; x++) if (g[r * ww + x] < thr) c++;
    return c / ww;
  };
  const walk = (y, dir) => {
    let last = y,
      gap = 0;
    for (let k = 0; k < 3 * d; k++) {
      const yy = y + dir * k;
      if (onL(yy)) continue;
      if (f(yy) >= 0.3) {
        last = yy;
        gap = 0;
      } else if (++gap > 1) break;
    }
    return last;
  };
  return {top: walk(Ytop, -1), bot: walk(Ybot, 1)};
}
/* « toutes les têtes noires d'une même partition se ressemblent » : on apprend la forme exacte des têtes
 déjà trouvées (une version sur une ligne, une entre deux lignes), puis on passe toute la portée au peigne fin. */
/* Complétion autour des notes trouvées : dans un accord, une note a souvent une voisine collée
 (seconde : décalée d'une tête sur le côté, ½ interligne plus haut/bas ; tierce : juste au-dessus/dessous).
 On compare chaque place voisine au modèle de tête appris sur la page, en ignorant les pixels des têtes déjà trouvées. */
/* piles de blanches sur la même verticale : on mesure la hauteur réelle d'encre de la pile ;
 n têtes empilées en tierces = hauteur d'une tête + (n-1) interlignes. Les centres en découlent exactement. */
function stackFix(pg) {
  const W = pg.W,
    H = pg.H,
    ctx = pg.cv.getContext("2d"),
    hol = pg.notes.filter(n => n.hollow);
  if (!hol.length) return 0;
  const all = ctx.getImageData(0, 0, W, H).data,
    G = (x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return 255;
      const o = (y * W + x) * 4;
      return (all[o] * 77 + all[o + 1] * 150 + all[o + 2] * 29) / 256;
    };
  const paper = pg.paper || 240;
  let ch = 0;
  const extent = (s, X, y0, y1) => {
    const d = s.d,
      lw = Math.max(1, s.lw || 2),
      rows = s.ys.slice();
    for (let q = 1; q <= 6; q++) rows.push(s.top - q * d, s.bot + q * d);
    const onL = yy => rows.some(r => Math.abs(r - yy) <= lw * 0.75 + 1);
    const ink = Math.min(s.ink == null ? 60 : s.ink, paper - 20),
      thr = (paper + ink) / 2,
      hw = Math.round(0.3 * d);
    const f = y => {
      let c = 0,
        n = 0;
      for (let x = -hw; x <= hw; x++) {
        n++;
        if (G(X + x, y) < thr) c++;
      }
      return c / n;
    };
    const walk = (y, dir) => {
      let last = y,
        gap = 0;
      for (let k = 0; k < 4 * d; k++) {
        const yy = Math.round(y + dir * k);
        if (onL(yy)) continue;
        if (f(yy) >= 0.2) {
          last = yy;
          gap = 0;
        } else if (++gap > 1) break;
      }
      return last;
    };
    return [walk(y0, -1), walk(y1, 1)];
  };
  /* hauteur d'une tête blanche seule sur cette page */
  const hs = [];
  for (const n of hol) {
    if (pg.notes.some(q => q !== n && Math.abs(q.x - n.x) < 1.6 * n.s.d && Math.abs(q.y - n.y) < 1.6 * n.s.d))
      continue;
    const [a, b] = extent(n.s, n.x, n.y, n.y);
    hs.push((b - a + 1) / n.s.d);
  }
  hs.sort((a, b) => a - b);
  const hh = hs.length ? hs[hs.length >> 1] : 1.0;
  if (hh < 0.7 || hh > 1.3) return 0;
  const done = new Set();
  for (const n of hol) {
    if (done.has(n)) continue;
    const s = n.s,
      d = s.d,
      grp = pg.notes.filter(q => q.hollow && q.s === s && Math.abs(q.x - n.x) < 0.45 * d);
    grp.forEach(q => done.add(q));
    const X = grp.reduce((a, q) => a + q.x, 0) / grp.length,
      ys = grp.map(q => q.y),
      [top, bot] = extent(s, X, Math.min(...ys), Math.max(...ys)),
      span = (bot - top + 1) / d;
    const k = Math.round(span - hh) + 1;
    if (k < 1 || k > 5 || Math.abs(span - (hh + (k - 1))) > 0.3) continue;
    const want = [];
    for (let i = 0; i < k; i++) want.push(snapY(s, top + (hh * d) / 2 + i * d));
    const cur = grp.map(q => snapY(s, q.y)).sort((a, b) => a - b);
    if (cur.length === want.length && cur.every((v, i) => Math.abs(v - want[i]) < 0.1 * d)) continue;
    pg.notes = pg.notes.filter(q => !grp.includes(q));
    for (const y of want) {
      const nn = makeNote(pg, {x: X, y, s, hollow: true});
      if (nn) {
        nn.hollow = true;
        pg.notes.push(nn);
      }
    }
    ch++;
  }
  return ch;
}
function neighborFill(pg) {
  const W = pg.W,
    H = pg.H,
    ctx = pg.cv.getContext("2d");
  if (!pg.notes.length) return 0;
  const all = ctx.getImageData(0, 0, W, H).data,
    G = (x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return 255;
      const o = (y * W + x) * 4;
      return (all[o] * 77 + all[o + 1] * 150 + all[o + 2] * 29) / 256;
    };
  const d = pg.notes.map(n => n.s.d).sort((a, b) => a - b)[pg.notes.length >> 1],
    RX = Math.round(0.85 * d),
    RY = Math.round(0.6 * d),
    NP = (2 * RX + 1) * (2 * RY + 1);
  const lineRows = new Uint8Array(H);
  for (const s of pg.staves) {
    const lw = Math.max(1, s.lw || 2),
      rows = s.ys.slice();
    for (let q = 1; q <= 6; q++) rows.push(s.top - q * s.d, s.bot + q * s.d);
    for (const r of rows)
      for (let y = Math.floor(r - lw * 0.75 - 0.5); y <= Math.ceil(r + lw * 0.75 + 0.5); y++)
        if (y >= 0 && y < H) lineRows[y] = 1;
  }
  const inHead = (n, x, y, sc) => ((x - n.x) / (0.66 * d * sc)) ** 2 + ((y - n.y) / (0.5 * d * sc)) ** 2 <= 1;
  /* un modèle par type (noire / blanche), lignes de portée exclues */
  const T = [new Float32Array(NP), new Float32Array(NP)],
    TC = [new Float32Array(NP), new Float32Array(NP)],
    C = [0, 0];
  for (const n of pg.notes) {
    const y = Math.round(snapY(n.s, n.y)),
      k = n.hollow ? 1 : 0;
    const near = pg.notes.filter(q => q !== n && Math.abs(q.x - n.x) < 2 * d && Math.abs(q.y - n.y) < 1.6 * d);
    let i = 0;
    for (let dy = -RY; dy <= RY; dy++)
      for (let dx = -RX; dx <= RX; dx++, i++) {
        const X = Math.round(n.x) + dx,
          Y = y + dy;
        if (Y < 0 || Y >= H || lineRows[Y] || near.some(q => inHead(q, X, Y, 1.05))) continue;
        T[k][i] += G(X, Y);
        TC[k][i]++;
      }
    C[k]++;
  }
  for (let k = 0; k < 2; k++) for (let i = 0; i < NP; i++) T[k][i] = TC[k][i] ? T[k][i] / TC[k][i] : -1;
  const score = (x, y, k, skip) => {
    if (C[k] < 2) return -1;
    const t = T[k];
    let i = 0,
      n = 0,
      sa = 0,
      sb = 0,
      saa = 0,
      sbb = 0,
      sab = 0;
    x = Math.round(x);
    y = Math.round(y);
    const near = pg.notes.filter(q => q !== skip && Math.abs(q.x - x) < 2.2 * d && Math.abs(q.y - y) < 2 * d);
    for (let dy = -RY; dy <= RY; dy++)
      for (let dx = -RX; dx <= RX; dx++, i++) {
        const X = x + dx,
          Y = y + dy;
        if (t[i] < 0 || Y < 0 || Y >= H || lineRows[Y] || near.some(q => inHead(q, X, Y, 1.05))) continue;
        const a = G(X, Y),
          b = t[i];
        n++;
        sa += a;
        sb += b;
        saa += a * a;
        sbb += b * b;
        sab += a * b;
      }
    if (n < (k ? 0.15 : 0.38) * NP) return -1;
    const va = saa - (sa * sa) / n,
      vb = sbb - (sb * sb) / n;
    return va > 0 && vb > 0 ? (sab - (sa * sb) / n) / Math.sqrt(va * vb) : -1;
  };
  pg.nfs = score;
  pg.noteScore = n => score(n.x, snapY(n.s, n.y), n.hollow ? 1 : 0, n);
  /* conflits : deux têtes au même endroit à ½ interligne près, c'est impossible (une seconde est toujours décalée sur le côté) */
  const resolve = () => {
    let rm = 0;
    for (let pass = 0; pass < 4; pass++) {
      let ch = false;
      const ns = pg.notes.slice().sort((a, b) => a.y - b.y);
      for (let i = 0; i < ns.length && !ch; i++)
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i],
            b = ns[j];
          if (b.y - a.y > 0.8 * d) break;
          if (Math.abs(a.x - b.x) > 0.45 * d || a.hollow !== b.hollow) continue;
          const c = ns.find(
            q =>
              q !== a &&
              q !== b &&
              q.hollow === a.hollow &&
              Math.abs(q.x - a.x) < 0.45 * d &&
              q.y > b.y &&
              q.y - b.y < 0.8 * d
          );
          if (a.hollow) continue;
          let kill;
          if (c) kill = b;
          else {
            const sa = score(a.x, snapY(a.s, a.y), 0, b),
              sb = score(b.x, snapY(b.s, b.y), 0, a);
            kill = sa >= sb ? b : a;
          }
          pg.notes = pg.notes.filter(q => q !== kill);
          rm++;
          ch = true;
          break;
        }
      if (!ch) break;
    }
    return rm;
  };
  /* trois blanches empilées à ½ interligne d'écart sur la même verticale : celle du milieu est le creux entre deux vraies têtes */
  const chain = () => {
    let rm = 0;
    for (const b of pg.notes.slice()) {
      if (!b.hollow) continue;
      const d2 = b.s.d;
      if (
        pg.notes.some(q => q !== b && !q.hollow && Math.abs(q.x - b.x) < 0.6 * d2 && Math.abs(q.y - b.y) < 0.45 * d2)
      ) {
        pg.notes = pg.notes.filter(q => q !== b);
        rm++;
        continue;
      }
      const up = pg.notes.find(
          q => q !== b && Math.abs(q.x - b.x) < 0.45 * d2 && b.y - q.y > 0.3 * d2 && b.y - q.y < 0.75 * d2
        ),
        dn = pg.notes.find(
          q => q !== b && Math.abs(q.x - b.x) < 0.45 * d2 && q.y - b.y > 0.3 * d2 && q.y - b.y < 0.75 * d2
        );
      if (up && dn) {
        pg.notes = pg.notes.filter(q => q !== b);
        rm++;
      }
    }
    return rm;
  };
  chain();
  /* deux têtes noires sur la même verticale à ½ interligne : impossible, on garde celle qui ressemble le plus au modèle */
  for (let it = 0; it < 20; it++) {
    let hit = null;
    for (const a of pg.notes) {
      if (a.hollow) continue;
      for (const b of pg.notes) {
        if (b === a || b.hollow || Math.abs(a.x - b.x) > 0.45 * d || Math.abs(a.y - b.y) > 0.75 * d || b.y <= a.y)
          continue;
        hit = [a, b];
        break;
      }
      if (hit) break;
    }
    if (!hit) break;
    const [a, b] = hit,
      sa = score(a.x, snapY(a.s, a.y), 0, a),
      sb = score(b.x, snapY(b.s, b.y), 0, b);
    pg.notes = pg.notes.filter(q => q !== (sa >= sb ? b : a));
  }
  const ref = [];
  for (const n of pg.notes) {
    const v = score(n.x, snapY(n.s, n.y), n.hollow ? 1 : 0, n);
    if (v > -1) ref.push(v);
  }
  ref.sort((a, b) => a - b);
  const thr = Math.max(0.6, Math.min(0.8, (ref[Math.floor(ref.length * 0.05)] || 0.75) - 0.05));
  pg.nthr = thr;
  const paper = pg.paper || 240;
  let added = 0;
  for (let pass = 0; pass < 4; pass++) {
    let got = 0;
    for (const n of pg.notes.slice()) {
      const s = n.s,
        sd = s.d,
        ny = snapY(s, n.y),
        hol = n.hollow ? 1 : 0;
      const cands = [];
      for (const dir of [-1, 1]) {
        cands.push({y: ny + (dir * sd) / 2, xs: [n.x - 1.45 * sd, n.x - 0.85 * sd]});
        cands.push({y: ny + (dir * sd) / 2, xs: [n.x + 0.85 * sd, n.x + 1.45 * sd]});
        cands.push({y: ny + dir * sd, xs: [n.x - 0.35 * sd, n.x + 0.35 * sd]});
        for (const m of [1.5, 2, 2.5, 3, 3.5])
          cands.push({y: ny + dir * m * sd, xs: [n.x - 0.35 * sd, n.x + 0.35 * sd], far: m, from: ny});
      }
      for (const c of cands) {
        if (c.y < s.top - 6 * sd || c.y > s.bot + 6 * sd) continue;
        if (
          pg.notes.some(q => Math.abs(q.y - c.y) < 0.3 * sd && q.x >= c.xs[0] - 0.6 * sd && q.x <= c.xs[1] + 0.6 * sd)
        )
          continue;
        if (c.far) {
          /* plus loin qu'une tierce : seulement si la même hampe relie les deux têtes */
          const ink0 = Math.min(s.ink == null ? 60 : s.ink, paper - 20),
            m0 = (paper + ink0) / 2,
            ya = Math.min(c.y, c.from),
            yb = Math.max(c.y, c.from);
          const col = sx => {
            for (let y = Math.round(ya); y <= yb; y++) {
              let dk = false;
              for (let i = -1; i <= 1; i++) if (G(sx + i, y) < m0) dk = true;
              if (!dk) return false;
            }
            return true;
          };
          let okS = false,
            sx0 = 0;
          for (const off of [0.55, 0.6, 0.65, 0.7]) {
            if (col(n.x + off * sd)) {
              okS = true;
              sx0 = n.x + off * sd;
              break;
            }
            if (col(n.x - off * sd)) {
              okS = true;
              sx0 = n.x - off * sd;
              break;
            }
          }
          if (!okS) continue;
          /* la hampe doit continuer au-delà d'une des deux têtes (sinon c'est le bout de la hampe : crochet ou poutre) */
          const dirc = Math.sign(c.y - c.from),
            beyond = (y0, dir) => {
              let k = 0,
                t = 0;
              for (let o = 0.6 * sd; o <= 2.4 * sd; o += 1) {
                const yy = y0 + dir * o;
                t++;
                let dk = false;
                for (let i = -1; i <= 1; i++) if (G(sx0 + i, yy) < m0) dk = true;
                if (dk) k++;
              }
              return k / t;
            };
          if (beyond(c.from, -dirc) < 0.85 && beyond(c.y, dirc) < 0.85) continue;
        }
        let best = -1,
          bx = 0;
        for (let x = Math.round(c.xs[0]); x <= c.xs[1]; x++) {
          const v = score(x, c.y, hol, null);
          if (v > best) {
            best = v;
            bx = x;
          }
        }
        if (best < thr) continue;
        /* deux têtes sur la même verticale sont au moins à un interligne l'une de l'autre */
        if (pg.notes.some(q => Math.abs(q.x - bx) < 0.5 * sd && Math.abs(q.y - c.y) < 0.9 * sd)) continue;
        const ink = Math.min(s.ink == null ? 60 : s.ink, paper - 20),
          mid = (paper + ink) / 2,
          cy = lineRows[Math.round(c.y)] ? [c.y - 0.22 * sd, c.y + 0.22 * sd] : [c.y];
        const core = Math.max(...cy.map(yy => (G(bx, yy) + G(bx - 0.15 * sd, yy) + G(bx + 0.15 * sd, yy)) / 3));
        if (!hol && core > mid) continue;
        if (!hol && c.far) {
          const side = sg => {
            let k = 0,
              t = 0;
            for (let o = 0.85; o <= 1.6; o += 0.05) {
              const X = bx + sg * o * sd;
              if (pg.notes.some(q => ((X - q.x) / (0.7 * sd)) ** 2 + ((c.y - q.y) / (0.55 * sd)) ** 2 <= 1)) continue;
              t++;
              if (Math.min(G(X, c.y), G(X, c.y - 0.15 * sd), G(X, c.y + 0.15 * sd)) < mid) k++;
            }
            return t ? k / t : 0;
          };
          if (side(1) > 0.7 || side(-1) > 0.7) continue;
        }
        if (hol) {
          const rim = Math.min(G(bx - 0.58 * sd, c.y), G(bx + 0.58 * sd, c.y));
          if (!(rim < mid && core > rim + 15)) continue;
        }
        if (pg.excl && 0) continue;
        const nn = makeNote(pg, {x: bx, y: c.y, s, hollow: !!hol});
        if (nn) {
          nn.hollow = !!hol;
          nn.nb = true;
          nn.src = "nb" + (c.far ? "f" : "") + (hol ? "h" : "");
          pg.notes.push(nn);
          got++;
        }
      }
    }
    added += got;
    if (!got) break;
  }
  added -= chain();
  return added;
}
function filledSweep(pg) {
  const W = pg.W,
    H = pg.H,
    ctx = pg.cv.getContext("2d"),
    fil = pg.notes.filter(n => !n.hollow);
  if (fil.length < 6) return [];
  const all = ctx.getImageData(0, 0, W, H).data,
    G = (x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return 255;
      const o = (y * W + x) * 4;
      return (all[o] * 77 + all[o + 1] * 150 + all[o + 2] * 29) / 256;
    };
  const d = fil.map(n => n.s.d).sort((a, b) => a - b)[fil.length >> 1],
    RX = Math.round(0.9 * d),
    RY = Math.round(0.65 * d),
    N = (2 * RX + 1) * (2 * RY + 1);
  const onLine = (s, y) => Math.abs(((s.bot - y) / (s.d / 2)) % 2) < 0.01;
  const patch = (x, y, ref) => {
    const v = new Float32Array(N);
    let i = 0;
    for (let dy = -RY; dy <= RY; dy++)
      for (let dx = -RX; dx <= RX; dx++) v[i++] = G(x + (dx * ref.s.d) / d, y + (dy * ref.s.d) / d);
    return v;
  };
  const T = [new Float32Array(N), new Float32Array(N)],
    cnt = [0, 0];
  for (const n of fil) {
    const y = snapY(n.s, n.y),
      k = onLine(n.s, y) ? 1 : 0,
      v = patch(n.x, y, n);
    for (let i = 0; i < N; i++) T[k][i] += v[i];
    cnt[k]++;
  }
  for (let k = 0; k < 2; k++) if (cnt[k]) for (let i = 0; i < N; i++) T[k][i] /= cnt[k];
  const norm = t => {
    let m = 0;
    for (const v of t) m += v;
    m /= t.length;
    let q = 0;
    const o = new Float32Array(t.length);
    for (let i = 0; i < t.length; i++) {
      o[i] = t[i] - m;
      q += o[i] * o[i];
    }
    q = Math.sqrt(q);
    for (let i = 0; i < t.length; i++) o[i] /= q || 1;
    return o;
  };
  const TN = [cnt[0] >= 3 ? norm(T[0]) : null, cnt[1] >= 3 ? norm(T[1]) : null];
  const ncc = (v, t) => {
    let m = 0;
    for (const a of v) m += a;
    m /= v.length;
    let c = 0,
      q = 0;
    for (let i = 0; i < v.length; i++) {
      const a = v[i] - m;
      c += a * t[i];
      q += a * a;
    }
    return q ? c / Math.sqrt(q) : 0;
  };
  /* seuil appris : comment les vraies têtes de la page ressemblent au modèle */
  const sc = [];
  for (const n of fil) {
    const y = snapY(n.s, n.y),
      t = TN[onLine(n.s, y) ? 1 : 0];
    if (t) sc.push(ncc(patch(n.x, y, n), t));
  }
  sc.sort((a, b) => a - b);
  const thr = Math.min(0.85, Math.max(0.72, (sc[Math.floor(sc.length * 0.1)] || 0.8) - 0.05)),
    out = [];
  for (const s of pg.staves) {
    const sd = s.d,
      x0 = Math.max(RX, Math.round((s.cx0 || s.x0) + 3 * sd)),
      x1 = Math.min(W - RX - 1, Math.round(s.x1 - 0.5 * sd));
    let lo = 255,
      hi = 0;
    for (let x = x0; x < x1; x += 7) {
      const v = G(x, s.top + 0.5 * sd);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const mid = pg.paper ? (pg.paper + (s.ink == null ? 60 : s.ink)) / 2 : 128;
    for (let y = snapY(s, s.top - 4 * sd); y <= s.bot + 4 * sd + 0.01; y += sd / 2) {
      const t = TN[onLine(s, y) ? 1 : 0];
      if (!t) continue;
      const row = new Float32Array(x1 + 1);
      for (let x = x0; x < x1; x++) {
        if (G(x, y) > mid || G(x - 0.3 * sd, y) > mid || G(x + 0.3 * sd, y) > mid) continue;
        row[x] = ncc(patch(x, y, {s}), t);
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        const v = row[x];
        if (v < thr || v < row[x - 1] || v < row[x + 1]) continue;
        if (nearestStaff(pg, x, y) !== s) continue;
        out.push({x, y, s, sc: v});
      }
    }
  }
  out.sort((a, b) => b.sc - a.sc);
  const keep = [];
  for (const o of out) {
    if (keep.some(k => k.s === o.s && Math.abs(k.x - o.x) < 0.9 * o.s.d && Math.abs(k.y - o.y) < 0.6 * o.s.d))
      continue;
    keep.push(o);
  }
  pg.fthr = thr;
  return keep;
}
function hollowStacks(pg) {
  let ch = 0;
  const done = new Set();
  for (const n of pg.notes.filter(q => q.hollow)) {
    if (done.has(n)) continue;
    const s = n.s,
      d = s.d,
      col = pg.notes.filter(q => q.hollow && q.s === s && Math.abs(q.x - n.x) < 0.6 * d);
    col.forEach(q => done.add(q));
    const X = col.reduce((a, q) => a + q.x, 0) / col.length,
      ya = Math.min(...col.map(q => q.y)) - 1.2 * d,
      yb = Math.max(...col.map(q => q.y)) + 1.2 * d,
      sc = ringScan(pg, s, X, ya, yb);
    if (!sc.length) continue;
    const v = sc.map(o => o.ring - o.core),
      ok = sc.filter(
        (o, i) =>
          o.ring >= 0.7 && o.core <= 0.6 && (i === 0 || v[i] >= v[i - 1]) && (i === sc.length - 1 || v[i] >= v[i + 1])
      );
    const good = y => ok.some(o => Math.abs(o.y - y) < 0.26 * d);
    for (const q of col) {
      const o = sc.find(o => Math.abs(o.y - snapY(s, q.y)) < 0.26 * d);
      if (
        !good(snapY(s, q.y)) &&
        o &&
        (o.ring < 0.7 || o.core > 0.6) &&
        ok.some(k => Math.abs(k.y - q.y) < 0.8 * d)
      ) {
        pg.notes = pg.notes.filter(z => z !== q);
        ch++;
      }
    }
    if (!ok.length) {
      const cs = pg.notes.filter(q => q.hollow && q.s === s && Math.abs(q.x - X) < 0.6 * d).sort((p, q) => p.y - q.y);
      if (cs.length >= 1) {
        const E = stackEdges(pg, s, X, cs[0].y, cs[cs.length - 1].y);
        if (E) {
          const fix = (q, yy) => {
            const t = snapY(s, yy),
              cur = snapY(s, q.y),
              raw = q.ry == null ? q.y : q.ry;
            if (
              Math.abs(Math.abs(t - cur) - d / 2) < 0.1 * d &&
              Math.abs(raw - cur) > 0.12 * d &&
              Math.sign(raw - cur) === Math.sign(t - cur) &&
              !pg.notes.some(
                z => z !== q && z.s === s && Math.abs(z.x - q.x) < 0.8 * d && Math.abs(snapY(s, z.y) - t) < 0.26 * d
              )
            ) {
              const nn = makeNote(pg, {x: q.x, y: t, s, hollow: true});
              if (nn) {
                nn.hollow = true;
                pg.notes = pg.notes.filter(z => z !== q);
                pg.notes.push(nn);
                ch++;
              }
            }
          };
          fix(cs[cs.length - 1], E.bot - 0.47 * d);
          fix(
            pg.notes.filter(q => q.hollow && q.s === s && Math.abs(q.x - X) < 0.6 * d).sort((p, q) => p.y - q.y)[0],
            E.top + 0.47 * d
          );
        }
      }
    }
    for (const o of ok) {
      if (
        col.length < 2 &&
        !(o.ring >= 0.8 && o.core <= 0.3 && col.some(q => Math.abs(Math.abs(snapY(s, q.y) - o.y) - d) < 0.15 * d))
      )
        continue;
      if (pg.notes.some(z => z.s === s && Math.abs(z.x - o.x) < 0.8 * d && Math.abs(snapY(s, z.y) - o.y) < 0.26 * d))
        continue;
      const nn = makeNote(pg, {x: o.x, y: o.y, s, hollow: true});
      if (nn) {
        nn.hollow = true;
        pg.notes.push(nn);
        ch++;
      }
    }
  }
  return ch;
}
/* recherche des blanches/rondes en niveaux de gris (photos floues : le trou blanc n'apparaît plus en noir et blanc).
 On compare chaque endroit possible à un anneau d'ellipse modèle, en ignorant les lignes de portée. */
function hollowSweep(pg) {
  const W = pg.W,
    H = pg.H,
    ctx = pg.cv.getContext("2d"),
    found = [];
  for (const s of pg.staves) {
    const d = s.d,
      lw = Math.max(1, s.lw || 2),
      xa = Math.max(0, Math.round((s.cx0 || s.x0) + 3 * d)),
      xb = Math.min(W - 1, Math.round(s.x1 - 0.5 * d)),
      ya = Math.max(0, Math.round(s.top - 5.5 * d)),
      yb = Math.min(H - 1, Math.round(s.bot + 5.5 * d));
    if (xb - xa < 4 || yb - ya < 4) continue;
    const w = xb - xa + 1,
      h = yb - ya + 1,
      id = ctx.getImageData(xa, ya, w, h).data,
      g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (id[j] * 77 + id[j + 1] * 150 + id[j + 2] * 29) / 256;
    const rows = s.ys.slice();
    for (let q = 1; q <= 5; q++) rows.push(s.top - q * d, s.bot + q * d);
    const onL = yy => rows.some(r => Math.abs(r - yy) <= lw * 0.75 + 0.5);
    /* modèles : blanche (penchée) et ronde (plus large) */
    const mk = (A, B, ang, ha, hb, hang) => {
      const R = Math.ceil(1.0 * d),
        pts = [];
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const u = dx * Math.cos(ang) + dy * Math.sin(ang),
            v = -dx * Math.sin(ang) + dy * Math.cos(ang),
            e = (u / A) ** 2 + (v / B) ** 2;
          const hu = dx * Math.cos(hang) + dy * Math.sin(hang),
            hv = -dx * Math.sin(hang) + dy * Math.cos(hang),
            hole = (hu / ha) ** 2 + (hv / hb) ** 2 <= 1;
          if (e > 1.35 * 1.35) continue;
          pts.push([dx, dy, e <= 1 && !hole ? 1 : 0]);
        }
      return pts;
    };
    const TH = mk(0.64 * d, 0.47 * d, -0.38, 0.4 * d, 0.17 * d, -0.6),
      TW = mk(0.82 * d, 0.5 * d, 0, 0.4 * d, 0.3 * d, 0.55);
    for (let y = snapY(s, ya + d); y <= yb - d; y += d / 2) {
      const ly = Math.round(y - ya);
      for (const [T, kind] of [
        [TH, 0],
        [TW, 1]
      ]) {
        const pts = T.filter(p => !onL(y + p[1])),
          n = pts.length;
        let mt = 0;
        for (const p of pts) mt += p[2];
        mt /= n;
        let vt = 0;
        for (const p of pts) vt += (p[2] - mt) ** 2;
        if (!vt) continue;
        let prev = -1,
          px = 0;
        const sc = new Float32Array(w);
        for (let x = Math.ceil(d); x < w - Math.ceil(d); x++) {
          /* filtre rapide : centre plus clair que les deux bouts de l'anneau */
          const oy = Math.round(0.2 * d),
            c = onL(y) ? Math.max(g[(ly - oy) * w + x], g[(ly + oy) * w + x]) : g[ly * w + x],
            L = g[ly * w + x - Math.round(0.55 * d)],
            Rr = g[ly * w + x + Math.round(0.55 * d)];
          if (!(c > L + 12 && c > Rr + 12)) continue;
          let mg = 0;
          for (const p of pts) mg += g[(ly + p[1]) * w + x + p[0]];
          mg /= n;
          let cov = 0,
            vg = 0;
          for (const p of pts) {
            const q = g[(ly + p[1]) * w + x + p[0]] - mg;
            cov += -q * (p[2] - mt);
            vg += q * q;
          }
          sc[x] = vg ? cov / Math.sqrt(vg * vt) : 0;
        }
        for (let x = 1; x < w - 1; x++) {
          if (sc[x] < (kind ? 0.55 : 0.33) || sc[x] < sc[x - 1] || sc[x] < sc[x + 1]) continue;
          if (nearestStaff(pg, xa + x, y) !== s) continue;
          /* hampe : trait vertical sombre qui part du bord droit vers le haut ou du bord gauche vers le bas */
          let lo = 255,
            hi = 0;
          for (let j = -Math.round(d); j <= Math.round(d); j++)
            for (let i = -Math.round(1.2 * d); i <= Math.round(1.2 * d); i += 2) {
              const v = g[(ly + j) * w + x + i];
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          const thr = hi - 0.3 * (hi - lo),
            run = (sx, dir) => {
              let ok = 0,
                tot = 0;
              for (let j = Math.round(0.3 * d); j <= Math.round(3.2 * d); j++) {
                const yy = ly + dir * j;
                if (yy < 0 || yy >= h) return 0;
                tot++;
                let m = 255;
                for (let i = -1; i <= 2; i++) {
                  const xx = x + sx + i;
                  if (xx >= 0 && xx < w) m = Math.min(m, g[yy * w + xx]);
                }
                if (m < thr) ok++;
              }
              return tot ? ok / tot : 0;
            };
          const isBar = sx => {
              /* barre de mesure : sombre de la 1re à la 5e ligne, rien au-delà */ const X = x + sx,
                tt = Math.round(s.top - ya),
                bb = Math.round(s.bot - ya);
              if (tt < 1 || bb >= h - 1) return false;
              let k = 0,
                t = 0;
              for (let yy = tt; yy <= bb; yy++) {
                t++;
                let m = 255;
                for (let i = -1; i <= 2; i++) {
                  const xx = X + i;
                  if (xx >= 0 && xx < w) m = Math.min(m, g[yy * w + xx]);
                }
                if (m < thr) k++;
              }
              if (k < 0.95 * t) return false;
              const out = yy => {
                let m = 255;
                for (let i = -1; i <= 2; i++) {
                  const xx = X + i;
                  if (xx >= 0 && xx < w && yy >= 0 && yy < h) m = Math.min(m, g[yy * w + xx]);
                }
                return m >= thr;
              };
              return out(tt - Math.round(0.6 * d)) && out(bb + Math.round(0.6 * d));
            },
            side = sx => {
              const u = run(sx, -1),
                dn = run(sx, 1);
              if (u < 0.8 && dn < 0.8) return 0;
              return isBar(sx) ? 0 : 1;
            } /* une barre de mesure monte ET descend : ce n'est pas une hampe */,
            stem = Math.max(side(Math.round(0.6 * d)), side(-Math.round(0.68 * d) - 1));
          if (!kind && stem < 0.8) continue;
          if (kind && stem >= 0.8) continue;
          /* contraste anneau / trou (lignes de portée ignorées) */
          let rs = 0,
            rn = 0,
            hs = 0,
            hn = 0;
          for (let j = -Math.round(0.6 * d); j <= Math.round(0.6 * d); j++) {
            if (onL(y + j)) continue;
            for (let i = -Math.round(0.9 * d); i <= Math.round(0.9 * d); i++) {
              const e = (i / (0.72 * d)) ** 2 + (j / (0.48 * d)) ** 2,
                v = g[(ly + j) * w + x + i];
              if (e <= 0.25) {
                hs += v;
                hn++;
              } else if (e >= 0.6 && e <= 1) {
                rs += v;
                rn++;
              }
            }
          }
          const rc = hn && rn ? (hs / hn - rs / rn) / Math.max(30, hi - lo) : 0;
          if (kind && sc[x] < 0.75 && rc < 0.4) continue;
          if (!kind && sc[x] < 0.6) {
            /* blanche : trou fin et penché au centre */ let a1 = 0,
              n1 = 0;
            const ca = Math.cos(-0.6),
              sa = Math.sin(-0.6);
            for (let j = -Math.round(0.3 * d); j <= Math.round(0.3 * d); j++) {
              if (onL(y + j)) continue;
              for (let i = -Math.round(0.4 * d); i <= Math.round(0.4 * d); i++) {
                const u = i * ca + j * sa,
                  v = -i * sa + j * ca;
                if ((u / (0.3 * d)) ** 2 + (v / (0.1 * d)) ** 2 <= 1) {
                  a1 += g[(ly + j) * w + x + i];
                  n1++;
                }
              }
            }
            if (n1 < 3) {
              a1 = 0;
              n1 = 0;
              for (let j = -Math.round(0.35 * d); j <= Math.round(0.35 * d); j++) {
                if (onL(y + j)) continue;
                for (let i = -Math.round(0.45 * d); i <= Math.round(0.45 * d); i++) {
                  const u = i * ca + j * sa,
                    v = -i * sa + j * ca;
                  if ((u / (0.32 * d)) ** 2 + (v / (0.17 * d)) ** 2 <= 1) {
                    a1 += g[(ly + j) * w + x + i];
                    n1++;
                  }
                }
              }
            }
            if (!(n1 >= 3 && rn && (a1 / n1 - rs / rn) / Math.max(30, hi - lo) >= 0.38)) continue;
          }
          /* l'anneau doit être fermé : sombre tout autour (un crochet de croche ou une barre ne le sont pas) */
          {
            const ang = kind ? 0 : -0.38,
              A = (kind ? 0.78 : 0.62) * d,
              B = (kind ? 0.46 : 0.44) * d,
              ca = Math.cos(ang),
              sa = Math.sin(ang),
              thrR = hi - 0.45 * (hi - lo);
            let dk = 0;
            for (let t = 0; t < 16; t++) {
              const th = (t * Math.PI) / 8;
              let best = 255;
              for (const f of [0.85, 1, 1.12]) {
                const u = A * f * Math.cos(th),
                  v = B * f * Math.sin(th),
                  X = Math.round(x + u * ca - v * sa),
                  Y = Math.round(ly + u * sa + v * ca);
                if (X >= 0 && X < w && Y >= 0 && Y < h) best = Math.min(best, g[Y * w + X]);
              }
              if (best < thrR) dk++;
            }
            if (dk < 14) continue;
          }
          found.push({x: xa + x, y, s, sc: sc[x], kind, stem, rc, weak: !kind && sc[x] < 0.45});
        }
      }
    }
  }
  /* candidats faibles (têtes très grasses) : gardés seulement par paires empilées à un interligne, sur la même hampe */
  {
    const strong = found.filter(f => !f.weak),
      weak = found.filter(f => f.weak);
    const ok = weak.filter(f => {
      const d = f.s.d;
      return weak
        .concat(strong)
        .some(
          g =>
            g !== f &&
            g.s === f.s &&
            !g.kind &&
            Math.abs(g.x - f.x) < 0.35 * d &&
            Math.abs(Math.abs(g.y - f.y) - d) < 0.15 * d
        );
    });
    found.length = 0;
    found.push(...strong, ...ok);
  }
  /* garder le meilleur dans chaque voisinage */
  found.sort((a, b) => b.sc - a.sc);
  const keep = [];
  for (const f of found) {
    if (keep.some(k => k.s === f.s && Math.abs(k.x - f.x) < 0.9 * f.s.d && Math.abs(k.y - f.y) < 0.6 * f.s.d))
      continue;
    keep.push(f);
  }
  return keep;
}

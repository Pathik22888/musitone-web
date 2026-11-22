function makeNote(pg, p) {
  const s = p.s,
    d = s.d,
    W0 = pg.W,
    ctx = pg.cv.getContext("2d"),
    x0 = Math.max(0, Math.round(p.x - d)),
    y0 = Math.max(0, Math.round(p.y - d)),
    w = Math.min(W0 - x0, Math.round(2 * d)),
    h = Math.min(pg.H - y0, Math.round(2 * d));
  if (w < 2 || h < 2) return null;
  const im = ctx.getImageData(x0, y0, w, h).data,
    ids = [],
    g = new Uint8Array(pg.W * 0),
    M = null;
  const ra = 0.72 * d,
    rb = 0.55 * d,
    yy = snapY(s, p.y);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const X = x0 + i,
        Y = y0 + j;
      if (((X - p.x) / ra) ** 2 + ((Y - yy) / rb) ** 2 > 1) continue;
      const q = (j * w + i) * 4,
        v = (im[q] * 77 + im[q + 1] * 150 + im[q + 2] * 29) >> 8;
      if (v < (pg.paper || 230) * 0.6) ids.push(Y * W0 + X);
    }
  if (!ids.length) ids.push(Math.round(yy) * W0 + Math.round(p.x));
  const idx = new Int32Array(ids),
    kind = new Uint8Array(ids.length),
    t = new Uint8Array(ids.length).fill(255);
  return {
    id: "a" + Math.random().toString(36).slice(2),
    x: p.x,
    y: yy,
    s,
    hollow: !!p.hollow,
    box: [p.x - 0.7 * d, yy - 0.55 * d, p.x + 0.7 * d, yy + 0.55 * d],
    idx,
    kind,
    t,
    ov: null,
    auto2: true
  };
}

function snapY(s, y) {
  return s.bot - (Math.round((s.bot - y) / (s.d / 2)) * s.d) / 2;
}
function nearestStaff(pg, x, y) {
  let b = null,
    bd = 1e9;
  for (const s of pg.staves) {
    if (x < s.x0 || x > s.x1) continue;
    const dd = y < s.top ? s.top - y : y > s.bot ? y - s.bot : 0;
    if (dd <= 6.5 * s.d && dd < bd) {
      bd = dd;
      b = s;
    }
  }
  return b;
}
function autoLetter(pg, x, y) {
  const s = nearestStaff(pg, x, y);
  return letterOf({s, y: s.bot - (Math.round((s.bot - y) / (s.d / 2)) * s.d) / 2, ov: null});
}
function addNote(x, y, L, hollow, noSnap) {
  const pg = pages[cur],
    s = nearestStaff(pg, x, y),
    d = s.d,
    yy = s.bot - (Math.round((s.bot - y) / (d / 2)) * d) / 2,
    ctx = pg.cv.getContext("2d");
  const g = gray(ctx, pg.W, pg.H);
  const ra = 0.75 * d,
    rb = 0.6 * d,
    ids = [];
  const M = new Uint8Array(g.length).fill(0);
  for (let j = Math.floor(yy - rb); j <= Math.ceil(yy + rb); j++)
    for (let i = Math.floor(x - ra); i <= Math.ceil(x + ra); i++) {
      if (i < 0 || j < 0 || i >= pg.W || j >= pg.H) continue;
      if (((i - x) / ra) ** 2 + ((j - yy) / rb) ** 2 > 1) continue;
      const k = j * pg.W + i;
      let m = 0,
        c = 0;
      for (let q = -6; q <= 6; q += 3)
        for (let r = -6; r <= 6; r += 3) {
          const kk = k + q * pg.W + r;
          if (kk >= 0 && kk < g.length) {
            m = Math.max(m, g[kk]);
            c++;
          }
        }
      M[k] = m;
      if (g[k] < m * 0.75) ids.push(k);
    }
  if (!ids.length) ids.push(Math.round(yy) * pg.W + Math.round(x));
  const n = buildNote(
    pg,
    g,
    M,
    {x, y: yy, s, ids, hollow: false, x0: x - ra, x1: x + ra, y0: yy - rb, y1: yy + rb},
    Date.now()
  );
  n.ov = L;
  n.hollow = !!hollow;
  if (!noSnap) snap();
  pg.notes.push(n);
  refresh();
  return n;
}

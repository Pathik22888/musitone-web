/* ---------- traitement d'image ---------- */
function gray(ctx, W, H) {
  const d = ctx.getImageData(0, 0, W, H).data,
    g = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  return g;
}
function binarize(g, W, H) {
  const I = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) {
      s += g[y * W + x];
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s;
    }
  }
  const r = Math.max(12, Math.round(Math.max(W, H) / 60)),
    B = new Uint8Array(W * H),
    M = new Uint8Array(W * H),
    B2 = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r),
      y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r),
        x1 = Math.min(W, x + r + 1);
      const s = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0],
        n = (y1 - y0) * (x1 - x0),
        m = s / n,
        v = g[y * W + x];
      M[y * W + x] = m;
      B[y * W + x] = (v < m * 0.8 && v < 215) || v < 70 ? 1 : 0;
      B2[y * W + x] = v < m * 0.9 && v < 230 ? 1 : 0;
    }
  }
  return {B, M, B2};
}
function skew(B, W, H) {
  const f = 4,
    w = (W / f) | 0,
    h = (H / f) | 0,
    pts = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let k = 0;
      for (let a = 0; a < f && !k; a++)
        for (let b = 0; b < f; b++)
          if (B[(y * f + a) * W + x * f + b]) {
            k = 1;
            break;
          }
      if (k) pts.push(x, y);
    }
  let best = 0,
    bs = -1;
  const off = w,
    hist = new Int32Array(h + 2 * w + 2);
  for (let a = -5; a <= 5.001; a += 0.2) {
    const t = Math.tan((a * Math.PI) / 180);
    hist.fill(0);
    for (let i = 0; i < pts.length; i += 2) {
      hist[Math.round(pts[i + 1] - pts[i] * t) + off]++;
    }
    let s = 0;
    for (const v of hist) s += v * v;
    if (s > bs) {
      bs = s;
      best = a;
    }
  }
  return best;
}
/* photo prise de biais : les lignes ne sont pas toutes penchées pareil en haut et en bas de la page.
 On mesure la pente dans des bandes horizontales et on redresse ligne par ligne. */
function keystone(B, W, H) {
  if (H < 800 || W < 600) return null;
  const f = 2,
    w = (W / f) | 0,
    nb = 10,
    bands = [];
  for (let b = 0; b < nb; b++) {
    const ya = Math.floor((b * H) / nb),
      yb = Math.floor(((b + 1) * H) / nb),
      pts = [];
    for (let y = Math.max(ya, 4); y < Math.min(yb, H - 4); y += 1)
      for (let x = 0; x < W; x += f)
        if (B[y * W + x] && !B[(y - 4) * W + x] && !B[(y + 4) * W + x]) pts.push(x, y - ya);
    if (pts.length < 200) continue;
    const hh = yb - ya,
      off = W,
      hist = new Int32Array(hh + 2 * W + 2);
    let best = 0,
      bs = -1,
      base = 0;
    for (let a = -2; a <= 2.0001; a += 0.05) {
      const t = Math.tan((a * Math.PI) / 180);
      hist.fill(0);
      for (let i = 0; i < pts.length; i += 2) hist[Math.round(pts[i + 1] - (pts[i] - W / 2) * t) + off]++;
      let s = 0;
      for (const v of hist) s += v * v;
      if (Math.abs(a) < 0.001) base = s;
      if (s > bs) {
        bs = s;
        best = a;
      }
    }
    if (bs < base * 1.08 && Math.abs(best) > 0.001) {
    }
    bands.push({y: (ya + yb) / 2, a: best, w: bs / Math.max(1, base)});
  }
  /* seules les bandes qui contiennent vraiment des lignes horizontales comptent (poids) */
  const wb = bands.map(b => ({...b, q: Math.max(0, Math.min(1.5, b.w - 1.08))})).filter(b => b.q > 0);
  if (wb.length < 3) return null;
  const as = wb.map(b => b.a);
  if (Math.max(...as) - Math.min(...as) < 0.3) return null;
  let sw = 0,
    sy = 0,
    sa = 0,
    syy = 0,
    sya = 0;
  for (const b of wb) {
    const w = b.q;
    sw += w;
    sy += w * b.y;
    sa += w * b.a;
    syy += w * b.y * b.y;
    sya += w * b.y * b.a;
  }
  const den = sw * syy - sy * sy;
  if (!den) return null;
  const k = (sw * sya - sy * sa) / den,
    c = (sa - k * sy) / sw;
  let res = 0,
    rw = 0;
  for (const b of wb) {
    res += b.q * Math.abs(b.a - (c + k * b.y));
    rw += b.q;
  }
  if (res / rw > 0.2 || Math.abs(k * H) < 0.3) return null;
  return {c, k: k * H};
}
function applyKS(pg) {
  const {cv} = pg,
    W = cv.width,
    H = cv.height,
    ctx = cv.getContext("2d"),
    src = ctx.getImageData(0, 0, W, H),
    dst = ctx.createImageData(W, H),
    S = src.data,
    D = dst.data,
    {c, k} = pg.ks;
  for (let y = 0; y < H; y++) {
    const t = Math.tan(((c + (k * y) / H) * Math.PI) / 180);
    for (let x = 0; x < W; x++) {
      const ys = y + (x - W / 2) * t,
        y0 = Math.floor(ys),
        fy = ys - y0,
        o = (y * W + x) * 4;
      if (y0 < 0 || y0 >= H - 1) {
        D[o] = D[o + 1] = D[o + 2] = 255;
        D[o + 3] = 255;
        continue;
      }
      const p = (y0 * W + x) * 4,
        q = p + W * 4;
      for (let ch = 0; ch < 3; ch++) D[o + ch] = S[p + ch] * (1 - fy) + S[q + ch] * fy;
      D[o + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
}
/* correction fine portée par portée (page courbée, photo de biais) : angle mesuré sur chaque portée, interpolé entre elles */
function staffAngles(B, W, H, staves) {
  const out = [];
  for (const s of staves) {
    const d = s.d,
      xa = Math.round(s.x0 + 0.05 * (s.x1 - s.x0)),
      xb = Math.round(s.x1 - 0.05 * (s.x1 - s.x0));
    const segs = [[], []];
    for (let x = xa; x <= xb; x += 3) {
      const seg = x < (xa + xb) / 2 ? 0 : 1;
      for (const y0 of s.ys) {
        const yc = Math.round(y0);
        let best = null;
        for (let q = -Math.round(0.4 * d); q <= Math.round(0.4 * d); q++) {
          const y = yc + q;
          if (y < 1 || y >= H - 1 || !B[y * W + x]) continue;
          let a = y,
            b = y;
          while (a > 0 && B[(a - 1) * W + x]) a--;
          while (b < H - 1 && B[(b + 1) * W + x]) b++;
          if (b - a + 1 > 0.35 * d) continue;
          const c = (a + b) / 2 - y0;
          if (best === null || Math.abs(c) < Math.abs(best)) best = c;
        }
        if (best !== null) segs[seg].push(best);
      }
    }
    if (segs[0].length < 20 || segs[1].length < 20) continue;
    const md = a => {
      a.sort((p, q) => p - q);
      return a[a.length >> 1];
    };
    const dy = md(segs[1]) - md(segs[0]),
      dx = (xb - xa) / 2;
    out.push({y: (s.top + s.bot) / 2, a: (Math.atan2(dy, dx) * 180) / Math.PI});
  }
  return out;
}

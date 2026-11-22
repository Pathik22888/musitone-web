/* ---------- page courbée (livre, feuille pas à plat) : on suit les lignes de portée bande par bande et on redresse ---------- */
function estimateWarp(B, W, H, lt, sp) {
  const d = lt + sp,
    ws = Math.max(12, Math.round(3.5 * d)),
    N = Math.floor(W / ws);
  if (N < 6) return null;
  /* masque des traits horizontaux longs (lignes de portée) */
  const Lm = new Uint8Array(W * H),
    minRun = Math.round(1.2 * d);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!B[y * W + x]) {
        x++;
        continue;
      }
      const a = x;
      while (x < W && B[y * W + x]) x++;
      if (x - a >= minRun) for (let k = a; k < x; k++) Lm[y * W + k] = 1;
    }
  }
  const prof = [];
  for (let i = 0; i < N; i++) {
    const p = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let c = 0;
      const o = y * W + i * ws;
      for (let k = 0; k < ws; k++) c += Lm[o + k];
      p[y] = c;
    }
    const q = new Float32Array(H);
    for (let y = 1; y < H - 1; y++) q[y] = 0.25 * p[y - 1] + 0.5 * p[y] + 0.25 * p[y + 1];
    prof.push(q);
  }
  const step = Math.round(1.5 * d),
    half = Math.round(2.6 * d),
    bands = [];
  for (let y = half; y < H - half; y += step) bands.push(y);
  if (!bands.length) return null;
  const rng = Math.max(2, Math.round(0.45 * sp)),
    c = N >> 1,
    K = bands.length;
  /* Y[i][k] : hauteur, dans la bande i, de la rangée k de la bande centrale */
  const Y = Array.from({length: N}, () => new Float32Array(K)),
    okA = Array.from({length: N}, () => new Uint8Array(K));
  for (let k = 0; k < K; k++) {
    Y[c][k] = bands[k];
    okA[c][k] = 1;
  }
  const shiftAt = (pa, pb, yc, pred) => {
    let best = -1e9,
      bs = 0,
      sc = [];
    const y0 = Math.round(yc - half),
      y1 = Math.round(yc + half);
    let ea = 0,
      eb = 0;
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= H) continue;
      ea += pa[y] * pa[y];
    }
    for (let s = Math.round(pred) - rng; s <= Math.round(pred) + rng; s++) {
      let v = 0;
      for (let y = y0; y <= y1; y++) {
        const yb = y + s;
        if (y < 0 || y >= H || yb < 0 || yb >= H) continue;
        v += pa[y] * pb[yb];
      }
      sc.push(v);
      if (v > best) {
        best = v;
        bs = s;
      }
    }
    for (let y = y0 + bs; y <= y1 + bs; y++) if (y >= 0 && y < H) eb += pb[y] * pb[y];
    const j = bs - (Math.round(pred) - rng),
      l = sc[j - 1],
      r = sc[j + 1];
    let f = 0;
    if (l != null && r != null) {
      const den = l - 2 * best + r;
      if (den < 0) f = (0.5 * (l - r)) / den;
    }
    const conf = ea > 0 && eb > 0 ? best / Math.sqrt(ea * eb) : 0;
    return {s: bs + f, conf, energy: ea, edge: j === 0 || j === sc.length - 1};
  };
  const minE = Math.pow(0.5 * ws, 2) * 3,
    xm = i => ((i + 1) * ws) / W - 0.5; /* milieu entre la bande i et i+1, normalisé */
  /* pente (décalage entre bandes voisines) lissée : polynôme de degré 2 en x par rangée, robuste aux erreurs de suivi */
  const fit2 = pts => {
    let use = pts.slice(),
      c = null;
    for (let it = 0; it < 4; it++) {
      if (use.length < 4) return c;
      let S = [0, 0, 0, 0, 0],
        T = [0, 0, 0];
      for (const [x, y] of use) {
        let p = 1;
        for (let e = 0; e < 5; e++) {
          S[e] += p;
          if (e < 3) T[e] += p * y;
          p *= x;
        }
      }
      const M = [
          [S[0], S[1], S[2]],
          [S[1], S[2], S[3]],
          [S[2], S[3], S[4]]
        ],
        det = m =>
          m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
          m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
          m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]),
        D0 = det(M);
      if (Math.abs(D0) < 1e-9) return c;
      c = [0, 1, 2].map(q => det(M.map((r, ri) => r.map((v, ci) => (ci === q ? T[ri] : v)))) / D0);
      const res = use.map(([x, y]) => Math.abs(y - (c[0] + c[1] * x + c[2] * x * x))),
        md = res.slice().sort((a, b) => a - b)[res.length >> 1];
      const lim = Math.max(0.6, 3 * md);
      const nu = use.filter((p, q) => res[q] <= lim);
      if (nu.length === use.length) break;
      use = nu;
    }
    return c;
  };
  const ev = (c, x) => c[0] + c[1] * x + c[2] * x * x;
  let model = null; /* model[k] = coefficients de la pente pour la rangée k */
  for (let pass = 0; pass < 2; pass++) {
    const raw = Array.from({length: K}, () => []);
    for (const dir of [1, -1]) {
      let prevS = new Float32Array(K);
      for (let i = c; i + dir >= 0 && i + dir < N; i += dir) {
        const ni = i + dir,
          sh = new Float32Array(K),
          ok = new Uint8Array(K),
          pi = Math.min(i, ni);
        for (let k = 0; k < K; k++) {
          const pred = model && model[k] ? dir * ev(model[k], xm(pi)) : prevS[k];
          const r = shiftAt(prof[i], prof[ni], Y[i][k], pred);
          if (r.energy > minE && r.conf > 0.55 && !r.edge && (!model || Math.abs(r.s - pred) < 0.3 * sp)) {
            sh[k] = r.s;
            ok[k] = 1;
            raw[k].push([xm(pi), dir * r.s]);
          }
        }
        const idx = [];
        for (let k = 0; k < K; k++) if (ok[k]) idx.push(k);
        for (let k = 0; k < K; k++) {
          if (ok[k]) continue;
          if (model && model[k]) {
            sh[k] = dir * ev(model[k], xm(pi));
            continue;
          }
          if (!idx.length) {
            sh[k] = prevS[k];
            continue;
          }
          let a = -1,
            b = -1;
          for (const q of idx) {
            if (q < k) a = q;
            else {
              b = q;
              break;
            }
          }
          sh[k] = a < 0 ? sh[b] : b < 0 ? sh[a] : sh[a] + ((sh[b] - sh[a]) * (k - a)) / (b - a);
        }
        for (let k = 0; k < K; k++) {
          Y[ni][k] = Y[i][k] + sh[k];
          okA[ni][k] = ok[k];
        }
        prevS = sh;
      }
    }
    /* ajustement par rangée, puis rangées sans données comblées par leurs voisines, puis lissage vertical */
    let C = raw.map(p => (p.length >= Math.max(4, 0.3 * (N - 1)) ? fit2(p) : null));
    const known = [];
    C.forEach((v, k) => {
      if (v) known.push(k);
    });
    if (!known.length) break;
    C = C.map((v, k) => {
      if (v) return v;
      let a = -1,
        b = -1;
      for (const q of known) {
        if (q < k) a = q;
        else {
          b = q;
          break;
        }
      }
      if (a < 0) return C[b].slice();
      if (b < 0) return C[a].slice();
      const t = (k - a) / (b - a);
      return C[a].map((u, e) => u * (1 - t) + C[b][e] * t);
    });
    model = C.map((v, k) => {
      const nb = [C[k - 1], v, C[k + 1]].filter(Boolean);
      return [0, 1, 2].map(e => {
        const a = nb.map(q => q[e]).sort((p, q) => p - q);
        return a[a.length >> 1];
      });
    });
    /* positions recalculées à partir du modèle lissé */
    for (let k = 0; k < K; k++) {
      Y[c][k] = bands[k];
      for (let i = c; i < N - 1; i++) Y[i + 1][k] = Y[i][k] + ev(model[k], xm(i));
      for (let i = c; i > 0; i--) Y[i - 1][k] = Y[i][k] - ev(model[k], xm(i - 1));
    }
  }
  /* il faut une vraie courbure ou une inclinaison qui change : sinon on ne touche à rien */
  let dev = 0;
  for (let i = 0; i < N; i++)
    for (let k = 0; k < K; k++) if (okA[i][k]) dev = Math.max(dev, Math.abs(Y[i][k] - bands[k]));
  /* décision sur la médiane des rangées bien suivies : une vraie courbure touche toutes les portées, une erreur de suivi seulement quelques-unes */
  {
    const mk = [];
    for (let k = 0; k < K; k++) {
      let n = 0,
        m = 0;
      for (let i = 0; i < N; i++)
        if (okA[i][k]) {
          n++;
          m = Math.max(m, Math.abs(Y[i][k] - bands[k]));
        }
      if (n >= 0.5 * N) mk.push(m);
    }
    if (mk.length < 3) return null;
    mk.sort((a, b) => a - b);
    var MED = mk[mk.length >> 1];
    if (mk[mk.length >> 1] < Math.max(2.5, 0.22 * sp)) return null;
  }
  return {N, ws, bands, med: MED, Y: Y.map(a => Array.from(a))};
}
function applyDW(pg) {
  const {cv} = pg,
    W = cv.width,
    H = cv.height,
    ctx = cv.getContext("2d"),
    src = ctx.getImageData(0, 0, W, H),
    dst = ctx.createImageData(W, H),
    S = src.data,
    D = dst.data,
    {N, ws, bands, Y} = pg.dw,
    K = bands.length,
    sc = pg.dw.sc || 1,
    yk = new Float32Array(K);
  for (let x = 0; x < W; x++) {
    const xs = x / sc,
      t = (xs - ws / 2) / ws,
      i0 = Math.max(0, Math.min(N - 2, Math.floor(t))),
      f = t - i0;
    for (let k = 0; k < K; k++) yk[k] = (Y[i0][k] * (1 - f) + Y[i0 + 1][k] * f) * sc;
    let k = 0;
    for (let y = 0; y < H; y++) {
      const yt = y / sc;
      while (k < K - 2 && bands[k + 1] < yt) k++;
      const g = (yt - bands[k]) / (bands[k + 1] - bands[k]);
      let ys = yk[k] + (yk[k + 1] - yk[k]) * g;
      if (yt < bands[0]) ys = y + (yk[0] - bands[0] * sc);
      else if (yt > bands[K - 1]) ys = y + (yk[K - 1] - bands[K - 1] * sc);
      const y0 = Math.floor(ys),
        fy = ys - y0,
        o = (y * W + x) * 4;
      if (y0 < 0 || y0 >= H - 1) {
        D[o] = D[o + 1] = D[o + 2] = 245;
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
function applyKS2(pg) {
  const {cv} = pg,
    W = cv.width,
    H = cv.height,
    ctx = cv.getContext("2d"),
    src = ctx.getImageData(0, 0, W, H),
    dst = ctx.createImageData(W, H),
    S = src.data,
    D = dst.data,
    P = pg.ks2;
  const ang = y => {
    if (y <= P[0].y) return P[0].a;
    if (y >= P[P.length - 1].y) return P[P.length - 1].a;
    for (let i = 1; i < P.length; i++)
      if (y <= P[i].y) {
        const t = (y - P[i - 1].y) / (P[i].y - P[i - 1].y);
        return P[i - 1].a * (1 - t) + P[i].a * t;
      }
    return 0;
  };
  for (let y = 0; y < H; y++) {
    const t = Math.tan((ang(y) * Math.PI) / 180);
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

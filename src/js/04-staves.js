function runStats(B, W, H) {
  const bh = new Int32Array(80),
    wh = new Int32Array(300);
  for (let x = 0; x < W; x += 2) {
    let y = 0;
    while (y < H) {
      const v = B[y * W + x],
        s = y;
      while (y < H && B[y * W + x] === v) y++;
      const L = y - s;
      if (v) {
        if (L < 80) bh[L]++;
      } else if (s > 0 && y < H && L < 300) wh[L]++;
    }
  }
  let lt = 1;
  for (let i = 1; i < 80; i++) if (bh[i] > bh[lt]) lt = i;
  let sp = Math.max(4, 2 * lt);
  for (let i = sp; i < 300; i++) if (wh[i] > wh[sp]) sp = i;
  return {lt, sp};
}
function findStaves(B, W, H, lt, sp, g) {
  let dL = lt + sp;
  const d0 = lt + sp,
    Lmin = Math.max(W * 0.08, 5 * d0),
    gap = Math.max(3, Math.round(0.45 * d0)),
    rows = [];
  /* masque des traits fins : écarte les barres de croches et autres aplats épais */
  let bh = new Int32Array(40);
  for (let x = 0; x < W; x += 3) {
    let y = 0;
    while (y < H) {
      if (!B[y * W + x]) {
        y++;
        continue;
      }
      const s0 = y;
      while (y < H && B[y * W + x]) y++;
      if (y - s0 < 40) bh[y - s0]++;
    }
  }
  let lt2 = 1;
  for (let i = 1; i < 40; i++) if (bh[i] > bh[lt2]) lt2 = i;
  const thin = Math.max(3, 2 * lt2 + 1),
    T = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!B[y * W + x]) {
        y++;
        continue;
      }
      const s0 = y;
      while (y < H && B[y * W + x]) y++;
      if (y - s0 <= thin) for (let k = s0; k < y; k++) T[k * W + x] = 1;
    }
  }
  const gT = Math.round(1.8 * d0);
  for (let y = 1; y < H - 1; y++) {
    let st = -1,
      last = -99,
      best = 0,
      bs = 0,
      be = 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (T[i] || T[i - W] || T[i + W]) {
        if (x - last > gT) st = x;
        last = x;
        if (x - st + 1 > best) {
          best = x - st + 1;
          bs = st;
          be = x;
        }
      }
    }
    if (best >= Lmin) rows.push([y, bs, be]);
  }
  const lines = [];
  for (const r of rows) {
    const L = lines[lines.length - 1];
    if (L && r[0] - L.y1 <= 1) {
      L.y1 = r[0];
      L.sy += r[0];
      L.n++;
      L.xs.push(r[1]);
      L.xe.push(r[2]);
    } else lines.push({y0: r[0], y1: r[0], sy: r[0], n: 1, xs: [r[1]], xe: [r[2]]});
  }
  lines.forEach(l => {
    l.y = l.sy / l.n;
    l.th = Math.max(1, l.y1 - l.y0 - 1);
    l.x0 = Math.min(...l.xs);
    l.x1 = Math.max(...l.xe);
  });
  /* écart entre lignes : valeur la plus fréquente entre lignes candidates voisines */
  {
    const hd = new Map();
    for (let i = 1; i < lines.length; i++) {
      const df = Math.round(lines[i].y - lines[i - 1].y);
      if (df >= 3 && df < 200) hd.set(df, (hd.get(df) || 0) + 1 + (hd.get(df - 1) || 0) * 0 + 0);
    }
    let best = 0,
      bv = 0;
    for (const [k, v] of hd) {
      const sc = v + (hd.get(k - 1) || 0) * 0.5 + (hd.get(k + 1) || 0) * 0.5;
      if (sc > bv) {
        bv = sc;
        best = k;
      }
    }
    if (best) dL = best;
  }
  const sameSpan = g => {
    const L = g.map(k => lines[k]),
      a = L.map(l => l.x0).sort((p, q) => p - q)[L.length >> 1],
      b = L.map(l => l.x1).sort((p, q) => p - q)[L.length >> 1];
    if (b - a < 10) return false;
    const o = Math.max(3, Math.round((0.4 * (L[L.length - 1].y - L[0].y)) / (L.length - 1)));
    return L.every(l => {
      const r = Math.round(l.y);
      if (r - o < 0 || r + o >= H) return true;
      let k = 0,
        n = 0;
      for (let x = a; x <= b; x += 2) {
        n++;
        if (B[(r - 2) * W + x] || B[(r - 1) * W + x] || B[r * W + x] || B[(r + 1) * W + x] || B[(r + 2) * W + x]) {
          k++;
          continue;
        }
        const mn = Math.min(
            g[(r - 2) * W + x],
            g[(r - 1) * W + x],
            g[r * W + x],
            g[(r + 1) * W + x],
            g[(r + 2) * W + x]
          ),
          bg = Math.max(g[(r - o) * W + x], g[(r + o) * W + x]);
        if (mn < bg * 0.9) k++;
      }
      return k >= 0.45 * n;
    });
  };
  const push = (ys, gl) => {
    const md = a => a.sort((p, q) => p - q)[a.length >> 1],
      x0 = md(gl.map(l => l.x0)),
      x1 = md(gl.map(l => l.x1));
    const dd = (ys[4] - ys[0]) / 4,
      o = Math.max(3, Math.round(0.4 * dd));
    const has = x => {
      let c = 0,
        sp = 0;
      for (let k = 0; k < 5; k++) {
        const r = Math.round(ys[k]);
        let mn = 255;
        for (let q = -2; q <= 2; q++) mn = Math.min(mn, g[(r + q) * W + x]);
        const bg = Math.max(g[(r - o) * W + x], g[(r + o) * W + x]);
        if (mn < bg * 0.85) c++;
        if (k < 4) {
          const m = Math.round((ys[k] + ys[k + 1]) / 2);
          if (B[m * W + x]) sp++;
        }
      }
      return c >= 3 ? (sp <= 2 ? 1 : 2) : 0;
    };
    const tol = Math.round(1.2 * d0);
    /* on suit les lignes vers la gauche ; une clé ou une armure remplit les interlignes sur quelques interlignes de large, sans que les lignes s'arrêtent */
    let a = x0,
      miss = 0,
      fill = 0;
    for (let x = x0 - 1; x >= 0 && miss <= tol && fill <= 6 * d0; x--) {
      const h = has(x);
      if (h === 1) {
        a = x;
        miss = 0;
        fill = 0;
      } else if (h === 2) {
        fill++;
        miss = 0;
      } else miss++;
    }
    let b = x1;
    miss = 0;
    fill = 0;
    for (let x = x1 + 1; x < W && miss <= tol && fill <= 6 * d0; x++) {
      const h = has(x);
      if (h === 1) {
        b = x;
        miss = 0;
        fill = 0;
      } else if (h === 2) {
        fill++;
        miss = 0;
      } else miss++;
    }
    st.push({ys, top: ys[0], bot: ys[4], d: (ys[4] - ys[0]) / 4, x0: a, x1: b, th: Math.max(...gl.map(l => l.th))});
  };
  const st = [],
    used = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    let found = null;
    for (let j = i + 1; j < lines.length && !found; j++) {
      const sp1 = lines[j].y - lines[i].y;
      if (sp1 < 0.72 * dL) continue;
      if (sp1 > 1.4 * dL) break;
      const g = [i, j];
      for (let k = 2; k < 5; k++) {
        const last = lines[g[g.length - 1]].y,
          want = last + (last - lines[i].y) / (k - 1);
        let bj = -1,
          bd = 0.25 * sp1;
        for (let q = g[g.length - 1] + 1; q < lines.length; q++) {
          const dd = Math.abs(lines[q].y - want);
          if (dd < bd) {
            bd = dd;
            bj = q;
          }
          if (lines[q].y > want + bd) break;
        }
        if (bj < 0) break;
        g.push(bj);
      }
      if (g.length === 5 && sameSpan(g)) found = g;
    }
    if (!found) continue;
    found.forEach(k => (used[k] = 1));
    const gl = found.map(k => lines[k]);
    push(
      gl.map(l => l.y),
      gl
    );
  }
  /* 2e passe : portées dont 1 ou 2 lignes sont masquées par des barres de croches collées dessus */
  const bRun = y => {
    let best = 0;
    const r = Math.round(y);
    for (let q = -1; q <= 1; q++) {
      const yy = r + q;
      if (yy < 1 || yy >= H - 1) continue;
      let st0 = -1,
        last = -99;
      for (let x = 0; x < W; x++) {
        if (B[yy * W + x]) {
          if (x - last > gap) st0 = x;
          last = x;
          if (x - st0 + 1 > best) best = x - st0 + 1;
        }
      }
    }
    return best;
  };
  const taken = y => st.some(p => y > p.top - 0.6 * p.d && y < p.bot + 0.6 * p.d);
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (used[j]) continue;
      const sp1 = lines[j].y - lines[i].y;
      if (sp1 < 0.72 * dL) continue;
      if (sp1 > 1.4 * dL) break;
      const g = [i, j];
      for (let k = 2; k < 4; k++) {
        const last = lines[g[g.length - 1]].y,
          want = last + sp1;
        let bj = -1,
          bd = 0.25 * sp1;
        for (let q = g[g.length - 1] + 1; q < lines.length; q++) {
          if (used[q]) continue;
          const dd = Math.abs(lines[q].y - want);
          if (dd < bd) {
            bd = dd;
            bj = q;
          }
          if (lines[q].y > want + bd) break;
        }
        if (bj < 0) break;
        g.push(bj);
      }
      if (g.length < 3 || !sameSpan(g)) continue;
      const sp = (lines[g[g.length - 1]].y - lines[g[0]].y) / (g.length - 1);
      let ys = g.map(k => lines[k].y);
      while (ys.length < 5) {
        const up = ys[0] - sp,
          dn = ys[ys.length - 1] + sp,
          ru = taken(up) ? 0 : bRun(up),
          rd = taken(dn) ? 0 : bRun(dn);
        if (Math.max(ru, rd) < Lmin) break;
        if (ru >= rd) ys.unshift(up);
        else ys.push(dn);
      }
      if (ys.length < 5) continue;
      g.forEach(k => (used[k] = 1));
      push(
        ys,
        g.map(k => lines[k])
      );
      break;
    }
  }
  st.sort((p, q) => p.top - q.top);
  /* analyse globale de la page : toutes les portées ont le même écart entre lignes */
  if (st.length >= 2) {
    const dm = st.map(q => q.d).sort((a, b) => a - b)[st.length >> 1];
    for (let i = st.length - 1; i >= 0; i--) if (Math.abs(st[i].d - dm) > 0.2 * dm) st.splice(i, 1);
    /* portée présente sur toute sa largeur : chaque ligne doit être visible sur l'étendue de la portée */
    const lineOK = (y, a, b, dd) => {
      const r = Math.round(y),
        o = Math.max(4, Math.round(0.4 * dd));
      if (r - o < 2 || r + o >= H - 2) return false;
      let k = 0,
        n = 0;
      for (let x = Math.round(a); x <= b; x += 2) {
        n++;
        if (B[(r - 2) * W + x] || B[(r - 1) * W + x] || B[r * W + x] || B[(r + 1) * W + x] || B[(r + 2) * W + x]) {
          k++;
          continue;
        }
        const mn = Math.min(
            g[(r - 2) * W + x],
            g[(r - 1) * W + x],
            g[r * W + x],
            g[(r + 1) * W + x],
            g[(r + 2) * W + x]
          ),
          bg = Math.max(g[(r - o) * W + x], g[(r + o) * W + x]);
        if (mn < bg * 0.9) k++;
      }
      return n && k >= 0.6 * n;
    };
    /* systèmes piano : si les portées vont par deux, retrouver la partenaire manquante à l'écart habituel */
    if (st.length >= 3) {
      const gaps = [];
      for (let i = 0; i + 1 < st.length; i++) gaps.push(st[i + 1].top - st[i].bot);
      const gs = gaps.slice().sort((a, b) => a - b),
        gin = gs[0];
      const pairGap = gaps.filter(v => v < gin * 1.35).sort((a, b) => a - b)[0];
      if (pairGap && gaps.filter(v => v < pairGap * 1.35).length >= 1) {
        const add = [];
        for (let i = 0; i < st.length; i++) {
          const p = st[i],
            up = i > 0 ? p.top - st[i - 1].bot : 1e9,
            dn = i + 1 < st.length ? st[i + 1].top - p.bot : 1e9;
          if (up < pairGap * 1.35 || dn < pairGap * 1.35) continue;
          for (const dir of [1, -1]) {
            const top = dir > 0 ? p.bot + pairGap : p.top - pairGap - 4 * p.d,
              ys = [0, 1, 2, 3, 4].map(k => top + k * p.d);
            if (ys[0] < 2 || ys[4] > H - 3) continue;
            if (st.some(q => Math.abs(q.top - top) < 3 * p.d) || add.some(q => Math.abs(q.top - top) < 3 * p.d))
              continue;
            let ok = 0;
            const fit = ys.map(y => {
              let best = y,
                bv = -1;
              for (let q = -Math.round(0.25 * p.d); q <= Math.round(0.25 * p.d); q++) {
                let k = 0;
                const r = Math.round(y + q);
                for (let x = Math.round(p.x0); x <= p.x1; x += 3) if (B[r * W + x]) k++;
                if (k > bv) {
                  bv = k;
                  best = y + q;
                }
              }
              return best;
            });
            fit.forEach(y => {
              if (lineOK(y, p.x0, p.x1, p.d)) ok++;
            });
            if (ok >= 4) {
              add.push({ys: fit, top: fit[0], bot: fit[4], d: (fit[4] - fit[0]) / 4, x0: p.x0, x1: p.x1, th: p.th});
              break;
            }
          }
        }
        st.push(...add);
        st.sort((p, q) => p.top - q.top);
      }
    }
  }
  /* portée isolée sans voisine proche : chercher une partenaire au-dessus ou au-dessous (systèmes piano) */
  if (st.length && st.length < 3) {
    const lineOK2 = (y, a, b, dd) => {
      const r = Math.round(y),
        o = Math.max(4, Math.round(0.4 * dd));
      if (r - o < 2 || r + o >= H - 2) return false;
      let k = 0,
        n = 0;
      for (let x = Math.round(a); x <= b; x += 2) {
        n++;
        if (B[(r - 1) * W + x] || B[r * W + x] || B[(r + 1) * W + x]) {
          k++;
          continue;
        }
        const mn = Math.min(g[(r - 1) * W + x], g[r * W + x], g[(r + 1) * W + x]),
          bg = Math.max(g[(r - o) * W + x], g[(r + o) * W + x]);
        if (mn < bg * 0.9) k++;
      }
      return n && k >= 0.6 * n;
    };
    const add = [];
    for (const p of st) {
      if (st.some(q => q !== p && Math.abs(q.top - p.top) < 15 * p.d)) continue;
      let best = null;
      for (const dir of [1, -1])
        for (let gp = 1.5 * p.d; gp <= 7 * p.d; gp += 0.25 * p.d) {
          const top = dir > 0 ? p.bot + gp : p.top - gp - 4 * p.d,
            ys = [0, 1, 2, 3, 4].map(k => top + k * p.d);
          if (ys[0] < 3 || ys[4] > H - 4) continue;
          if (st.some(q => ys[4] > q.top - 1.5 * q.d && ys[0] < q.bot + 1.5 * q.d)) continue;
          let ok = 0;
          for (const y of ys) if (lineOK2(y, p.x0, p.x1, p.d)) ok++;
          if (ok >= 4 && (!best || ok > best.ok)) best = {ok, ys};
        }
      if (best) add.push({ys: best.ys, top: best.ys[0], bot: best.ys[4], d: p.d, x0: p.x0, x1: p.x1, th: p.th});
    }
    st.push(...add);
    st.sort((p, q) => p.top - q.top);
  }
  return st;
}
function eraseThin(R, W, H, yc, x0, x1, band, maxRun) {
  const a = Math.max(0, Math.round(yc - band)),
    b = Math.min(H - 1, Math.round(yc + band));
  for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
    let y = a;
    while (y <= b) {
      if (R[y * W + x]) {
        let s = y,
          e = y;
        while (s > 0 && R[(s - 1) * W + x]) s--;
        while (e < H - 1 && R[(e + 1) * W + x]) e++;
        if (e - s + 1 <= maxRun) for (let k = s; k <= e; k++) R[k * W + x] = 0;
        y = e + 1;
      } else y++;
    }
  }
}
function eraseLedger(B, R, W, H, yc, s, lt, mr) {
  const d = s.d,
    a = Math.max(0, Math.round(yc - lt - 1)),
    b = Math.min(H - 1, Math.round(yc + lt + 1));
  for (let y = a; y <= b; y++) {
    let st = -1;
    for (let x = Math.max(0, s.x0); x <= Math.min(W, s.x1 + 1); x++) {
      const v = x < W && x <= s.x1 && B[y * W + x];
      if (v && st < 0) st = x;
      if (!v && st >= 0) {
        const L = x - st;
        if (L >= 1.3 * d && L <= 4.2 * d)
          for (let k = st; k < x; k++) {
            if (!R[y * W + k]) continue;
            let s0 = y,
              e0 = y;
            while (s0 > 0 && R[(s0 - 1) * W + k]) s0--;
            while (e0 < H - 1 && R[(e0 + 1) * W + k]) e0++;
            if (e0 - s0 + 1 <= mr) for (let q = s0; q <= e0; q++) R[q * W + k] = 0;
          }
        st = -1;
      }
    }
  }
}
function dist(M, W, H) {
  const D = new Int32Array(W * H),
    INF = 1 << 28;
  for (let i = 0; i < D.length; i++) D[i] = M[i] ? INF : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!D[i]) continue;
      let v = D[i];
      v = Math.min(
        v,
        x > 0 ? D[i - 1] + 3 : 3,
        y > 0 ? D[i - W] + 3 : 3,
        x > 0 && y > 0 ? D[i - W - 1] + 4 : 4,
        x < W - 1 && y > 0 ? D[i - W + 1] + 4 : 4
      );
      D[i] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!D[i]) continue;
      let v = D[i];
      v = Math.min(
        v,
        x < W - 1 ? D[i + 1] + 3 : 3,
        y < H - 1 ? D[i + W] + 3 : 3,
        x < W - 1 && y < H - 1 ? D[i + W + 1] + 4 : 4,
        x > 0 && y < H - 1 ? D[i + W - 1] + 4 : 4
      );
      D[i] = v;
    }
  return D;
}
function label(M, W, H, want, conn8, box) {
  const L = new Int32Array(W * H),
    comps = [],
    stack = new Int32Array(W * H);
  const [bx0, by0, bx1, by1] = box || [0, 0, W - 1, H - 1];
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const i = y * W + x;
      if (L[i] || M[i] !== want) continue;
      const id = comps.length + 1;
      let sp = 0,
        n = 0,
        X0 = x,
        X1 = x,
        Y0 = y,
        Y1 = y,
        sx = 0,
        sy = 0,
        edge = false;
      stack[sp++] = i;
      L[i] = id;
      while (sp) {
        const j = stack[--sp],
          cx = j % W,
          cy = (j - cx) / W;
        n++;
        sx += cx;
        sy += cy;
        if (cx < X0) X0 = cx;
        if (cx > X1) X1 = cx;
        if (cy < Y0) Y0 = cy;
        if (cy > Y1) Y1 = cy;
        if (cx === bx0 || cx === bx1 || cy === by0 || cy === by1) edge = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!conn8 && dx && dy) continue;
            const nx = cx + dx,
              ny = cy + dy;
            if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue;
            const k = ny * W + nx;
            if (!L[k] && M[k] === want) {
              L[k] = id;
              stack[sp++] = k;
            }
          }
      }
      comps.push({id, n, x0: X0, x1: X1, y0: Y0, y1: Y1, cx: sx / n, cy: sy / n, edge});
    }
  return {L, comps};
}
function stemRun(R, W, H, xa, xb, y0, y1, need, gap) {
  gap = gap || 0;
  const ink = (x, y) => R[y * W + x] || (x > 0 && R[y * W + x - 1]) || (x < W - 1 && R[y * W + x + 1]);
  for (let x = Math.max(0, xa); x <= Math.min(W - 1, xb); x++)
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
      if (!R[y * W + x]) continue;
      let s = y,
        e = y,
        g = 0;
      for (let k = y - 1; k >= 0 && g <= gap; k--) {
        if (gap ? ink(x, k) : R[k * W + x]) {
          s = k;
          g = 0;
        } else g++;
      }
      g = 0;
      for (let k = y + 1; k < H && g <= gap; k++) {
        if (gap ? ink(x, k) : R[k * W + x]) {
          e = k;
          g = 0;
        } else g++;
      }
      if (e - s + 1 >= need) {
        if (!gap) return true;
        const mw = Math.max(4, Math.round(need * 0.1)),
          ws = [];
        for (const t of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
          let yy = Math.round(s + (e - s) * t);
          if (yy >= y0 && yy <= y1) continue;
          let a = x,
            b = x;
          if (!R[yy * W + x]) continue;
          while (a > 0 && R[yy * W + a - 1]) a--;
          while (b < W - 1 && R[yy * W + b + 1]) b++;
          ws.push(b - a + 1);
        }
        if (!ws.length || Math.min(...ws) <= mw) return true;
      }
      y = Math.max(y, e);
    }
  return false;
}

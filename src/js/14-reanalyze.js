/* ---------- relecture d'une zone, image agrandie, réglages souples ---------- */
const TGW = 24,
  TGH = 18;
function tcorr(a, b) {
  let ma = 0,
    mb = 0;
  for (let i = 0; i < a.length; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= a.length;
  mb /= b.length;
  let n = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i] - ma,
      q = b[i] - mb;
    n += p * q;
    da += p * p;
    db += q * q;
  }
  return da && db ? n / Math.sqrt(da * db) : 0;
}
function reanalyzeBox(pg, bx0, by0, bx1, by1) {
  const sts = pg.staves.filter(s => s.bot + 6 * s.d > by0 && s.top - 6 * s.d < by1 && s.x1 > bx0 && s.x0 < bx1);
  if (!sts.length) return [];
  const d0 = sts.map(s => s.d).sort((a, b) => a - b)[sts.length >> 1],
    k = d0 < 20 ? Math.min(3, 24 / d0) : 1;
  const x0 = Math.max(0, Math.floor(bx0)),
    y0 = Math.max(0, Math.floor(by0)),
    x1 = Math.min(pg.W - 1, Math.ceil(bx1)),
    y1 = Math.min(pg.H - 1, Math.ceil(by1));
  if (x1 - x0 < 4 || y1 - y0 < 4) return [];
  const w = Math.round((x1 - x0 + 1) * k),
    h = Math.round((y1 - y0 + 1) * k),
    cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext("2d");
  cx.imageSmoothingQuality = "high";
  cx.drawImage(pg.cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, w, h);
  const id = cx.getImageData(0, 0, w, h).data,
    g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (id[j] * 77 + id[j + 1] * 150 + id[j + 2] * 29) >> 8;
  const hist = new Float64Array(256);
  for (const v of g) hist[v]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sb = 0,
    wb = 0,
    best = 0,
    th = 128;
  for (let i = 0; i < 256; i++) {
    wb += hist[i];
    if (!wb) continue;
    const wf = g.length - wb;
    if (!wf) break;
    sb += i * hist[i];
    const mb = sb / wb,
      mf = (sum - sb) / wf,
      v = wb * wf * (mb - mf) ** 2;
    if (v > best) {
      best = v;
      th = i;
    }
  }
  const B = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) B[i] = g[i] <= th ? 1 : 0;
  const R = B.slice();
  const toL = (X, Y) => [(X - x0) * k, (Y - y0) * k];
  for (const s of sts) {
    const lw = Math.max(1, Math.round((s.lw || 2) * k)),
      mr = lw + 2,
      rows = s.ys.slice();
    for (let q = 1; q <= 6; q++) rows.push(s.top - q * s.d, s.bot + q * s.d);
    for (const yy of rows) {
      const r = Math.round((yy - y0) * k);
      if (r < 0 || r >= h) continue;
      for (let x = 0; x < w; x++)
        for (let q = -lw - 1; q <= lw + 1; q++) {
          const y = r + q;
          if (y < 0 || y >= h || !R[y * w + x]) continue;
          let a = y,
            b = y;
          while (a > 0 && R[(a - 1) * w + x]) a--;
          while (b < h - 1 && R[(b + 1) * w + x]) b++;
          if (b - a + 1 <= mr) for (let t = a; t <= b; t++) R[t * w + x] = 0;
          break;
        }
    }
  }
  const d = d0 * k,
    out = [];
  const near = (X, Y, s) =>
    pg.notes.some(n => Math.abs(n.x - X) < 0.7 * s.d && Math.abs(n.y - Y) < 0.45 * s.d) ||
    out.some(o => Math.abs(o.x - X) < 0.7 * s.d && Math.abs(o.y - Y) < 0.45 * s.d);
  const stem = (ax, bx, ay, by) => {
    const need = 2.2 * d,
      gap = Math.round(0.4 * d);
    for (let x = Math.max(0, ax); x <= Math.min(w - 1, bx); x++) {
      let run = 0,
        miss = 0,
        best = 0;
      for (let y = Math.max(0, Math.round(ay - 4 * d)); y <= Math.min(h - 1, Math.round(by + 4 * d)); y++) {
        if (B[y * w + x] || (x > 0 && B[y * w + x - 1]) || (x < w - 1 && B[y * w + x + 1])) {
          run += 1 + miss;
          miss = 0;
          best = Math.max(best, run);
        } else if (run && miss < gap) miss++;
        else {
          run = 0;
          miss = 0;
        }
      }
      if (best >= need) return true;
    }
    return false;
  };
  const dark = (lx, ly, s) => {
    const r = Math.max(1, Math.round(0.18 * d));
    let t = 0,
      n = 0;
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const X = Math.round(lx) + i,
          Y = Math.round(ly) + j;
        if (X >= 0 && Y >= 0 && X < w && Y < h) {
          t += g[Y * w + X];
          n++;
        }
      }
    const c = t / n,
      bg = pg.paper || 230,
      ink = Math.min(s.ink == null ? 60 : s.ink, bg - 20);
    return (bg - c) / (bg - ink);
  };
  const crop = (lx, ly) => {
    const v = new Float32Array(TGW * TGH);
    for (let j = 0; j < TGH; j++)
      for (let i = 0; i < TGW; i++) {
        const X = Math.round(lx + (i / (TGW - 1) - 0.5) * 2.2 * d),
          Y = Math.round(ly + (j / (TGH - 1) - 0.5) * 1.6 * d);
        v[j * TGW + i] = X >= 0 && Y >= 0 && X < w && Y < h ? R[Y * w + X] : 0;
      }
    return v;
  };
  const ledOK = (X, Y, s) => {
    const dd = Y < s.top ? s.top - Y : Y > s.bot ? Y - s.bot : 0;
    if (dd <= 1.2 * s.d) return true;
    const dir = Y < s.top ? -1 : 1,
      p = (dir < 0 ? s.top : s.bot) + dir * s.d,
      r = Math.round((p - y0) * k),
      lx = (X - x0) * k;
    for (let q = -3; q <= 3; q++) {
      const yy = r + q;
      if (yy < 0 || yy >= h) continue;
      let run = 0;
      for (let x = Math.max(0, Math.round(lx - 1.3 * d)); x <= Math.min(w - 1, Math.round(lx + 1.3 * d)); x++) {
        run = B[yy * w + x] ? run + 1 : 0;
        if (run >= 0.9 * d) return true;
      }
    }
    return false;
  };
  const push = (lx, ly, hollow, info) => {
    const X = x0 + lx / k,
      Y = y0 + ly / k,
      s = nearestStaff(pg, X, Y);
    if (!s || X < (s.cx0 || s.x0) + 3 * s.d || near(X, Y, s)) return;
    if (hollow && pg.notes.some(n => Math.abs(n.x - X) < 0.9 * s.d && Math.abs(n.y - Y) < 0.9 * s.d)) return;
    if (s.excl && s.excl.some(b => X >= b[0] && X <= b[2] && Y >= b[1] && Y <= b[3])) return;
    if (hollow && (s.exclH || []).some(b => X >= b[0] && X <= b[2] && Y >= b[1] && Y <= b[3])) return;
    out.push({x: X, y: Y, hollow, s, ledOK: ledOK(X, Y, s), ...info});
  };
  /* têtes noires */
  const D1 = dist(R, w, h),
    rr = 0.27 * d,
    E = new Uint8Array(w * h);
  for (let i = 0; i < E.length; i++) E[i] = D1[i] > rr * 3 ? 0 : 1;
  const D2 = dist(E, w, h),
    O = new Uint8Array(w * h);
  for (let i = 0; i < O.length; i++) O[i] = R[i] && D2[i] <= rr * 3 + 2 ? 1 : 0;
  const {comps} = label(O, w, h, 1, true);
  for (const c of comps) {
    const cw = c.x1 - c.x0 + 1,
      ch = c.y1 - c.y0 + 1;
    if (cw < 0.75 * d || cw > 2.6 * d || ch < 0.6 * d || ch > 6 * d || c.n / (cw * ch) < 0.4) continue;
    if (cw <= 1.7 * d && ch < 1.3 * d && cw / ch > 2.2) continue;
    const st =
      stem(c.x0 - 3, c.x0 + 4, c.y0, c.y1) ||
      stem(c.x1 - 4, c.x1 + 3, c.y0, c.y1) ||
      (cw > 1.7 * d && stem(Math.round(c.x0 + 0.3 * cw), Math.round(c.x1 - 0.3 * cw), c.y0, c.y1));
    const parts =
      cw > 1.7 * d
        ? [
            [c.x0, Math.round((c.x0 + c.x1) / 2)],
            [Math.round((c.x0 + c.x1) / 2) + 1, c.x1]
          ]
        : [[c.x0, c.x1]];
    for (const [a, b] of parts) {
      const n = Math.max(1, Math.round(ch / d));
      for (let q = 0; q < n; q++) {
        const lx = (a + b) / 2,
          ly = c.y0 + (ch * (q + 0.5)) / n,
          X = x0 + lx / k,
          Y = y0 + ly / k,
          s = nearestStaff(pg, X, Y);
        if (!s) continue;
        push(lx, ly, false, {stem: st, dark: dark(lx, ly, s), corr: pg.tmpl ? tcorr(crop(lx, ly), pg.tmpl) : 0});
      }
    }
  }
  /* têtes blanches */
  const {comps: hs} = label(R, w, h, 0, false);
  for (const c of hs) {
    if (c.edge) continue;
    const hw = c.x1 - c.x0 + 1,
      hh = c.y1 - c.y0 + 1;
    if (
      hw < 0.2 * d ||
      hw > 1.3 * d ||
      hh < 0.15 * d ||
      hh > 0.95 * d ||
      c.n < 4 ||
      c.n > 0.85 * d * d ||
      hw > 2.4 * hh
    )
      continue;
    const ccx = Math.round(c.cx),
      ccy = Math.round(c.cy),
      cap = Math.round(0.45 * d);
    const sc = (dx, dy) => {
      let x = ccx,
        y = ccy,
        q = 0;
      while (q < 2 * d && x >= 0 && y >= 0 && x < w && y < h && !R[y * w + x]) {
        x += dx;
        y += dy;
        q++;
      }
      const i0 = q;
      let r = 0;
      while (q < 2 * d && x >= 0 && y >= 0 && x < w && y < h && R[y * w + x] && r < cap) {
        x += dx;
        y += dy;
        q++;
        r++;
      }
      return [i0, r];
    };
    const [l1, l2] = sc(-1, 0),
      [r1, r2] = sc(1, 0),
      [u1, u2] = sc(0, -1),
      [d1, d2] = sc(0, 1);
    if (l2 < 1 || r2 < 1 || u2 < 1 || d2 < 1) continue;
    const ow = l1 + l2 + r1 + r2,
      oh = u1 + u2 + d1 + d2;
    if (ow < 0.9 * d || ow > 2.3 * d || oh < 0.6 * d || oh > 1.7 * d) continue;
    const lx = ccx + (r1 + r2 - l1 - l2) / 2,
      ly = ccy + (d1 + d2 - u1 - u2) / 2,
      ox0 = ccx - l1 - l2,
      ox1 = ccx + r1 + r2;
    push(lx, ly, true, {
      stem: stem(ox0 - 3, ox0 + 4, ly - 0.5 * d, ly + 0.5 * d) || stem(ox1 - 4, ox1 + 3, ly - 0.5 * d, ly + 0.5 * d),
      wide: ow >= 1.4 * d,
      dark: 1,
      corr: 0
    });
  }
  /* recherche par ressemblance : la forme moyenne des notes de la page, aux hauteurs possibles (lignes et interlignes) */
  if (pg.gt) {
    const ctx = pg.cv.getContext("2d"),
      rx0 = Math.max(0, Math.floor(bx0)),
      ry0 = Math.max(0, Math.floor(by0)),
      rw = Math.min(pg.W, Math.ceil(bx1)) - rx0,
      rh = Math.min(pg.H, Math.ceil(by1)) - ry0;
    if (rw > 4 && rh > 4) {
      const im = ctx.getImageData(rx0, ry0, rw, rh).data,
        G = new Float32Array(rw * rh);
      for (let i = 0, j = 0; i < G.length; i++, j += 4) G[i] = (im[j] * 77 + im[j + 1] * 150 + im[j + 2] * 29) / 256;
      const at = (X, Y) => {
        const x = Math.round(X) - rx0,
          y = Math.round(Y) - ry0;
        return x >= 0 && y >= 0 && x < rw && y < rh ? G[y * rw + x] : 255;
      };
      for (const s of sts) {
        const dd = s.d,
          hits = [];
        for (let st = -14; st <= 22; st++) {
          const Y = s.bot - (st * dd) / 2;
          if (Y < by0 + 0.5 * dd || Y > by1 - 0.5 * dd) continue;
          const row = [];
          for (
            let X = Math.max(bx0 + 1.1 * dd, (s.cx0 || s.x0) + 2.5 * dd);
            X <= bx1 - 1.1 * dd;
            X += Math.max(1, dd / 10)
          ) {
            let mu = 0;
            const v = new Float32Array(TGW * TGH);
            for (let j = 0; j < TGH; j++)
              for (let i = 0; i < TGW; i++) {
                const q = at(X + (i / (TGW - 1) - 0.5) * 2.2 * dd, Y + (j / (TGH - 1) - 0.5) * 1.6 * dd);
                v[j * TGW + i] = q;
                mu += q;
              }
            mu /= v.length;
            let sd = 0;
            for (const q of v) sd += (q - mu) ** 2;
            sd = Math.sqrt(sd / v.length);
            if (sd < 8) {
              row.push([X, 0]);
              continue;
            }
            let n = 0;
            for (let i = 0; i < v.length; i++) n += ((v[i] - mu) / sd) * pg.gt[i];
            row.push([X, n / v.length]);
          }
          for (let i = 0; i < row.length; i++) {
            const [X, sc] = row[i];
            if (sc < 0.62) continue;
            let isMax = true;
            for (let q = i - 6; q <= i + 6; q++)
              if (q >= 0 && q < row.length && q !== i && row[q][1] > sc) {
                isMax = false;
                break;
              }
            if (isMax) hits.push({X, Y, sc});
          }
        }
        hits.sort((a, b) => b.sc - a.sc);
        const keep = [];
        for (const h0 of hits) {
          if (keep.some(q => Math.abs(q.X - h0.X) < 0.8 * dd && Math.abs(q.Y - h0.Y) < 0.8 * dd)) continue;
          keep.push(h0);
        }
        for (const h0 of keep) {
          if (nearestStaff(pg, h0.X, h0.Y) !== s || h0.X < (s.cx0 || s.x0) + 3 * dd) continue;
          if (pg.notes.some(n => Math.abs(n.x - h0.X) < 0.7 * dd && Math.abs(n.y - h0.Y) < 0.45 * dd)) continue;
          const ex = out.find(o => Math.abs(o.x - h0.X) < 0.8 * dd && Math.abs(o.y - h0.Y) < 0.6 * dd);
          if (ex) {
            if (!ex.hollow) ex.ncc = Math.max(ex.ncc || 0, h0.sc);
            continue;
          }
          const c0 = at(h0.X, h0.Y),
            bg = pg.paper || 230,
            ink = Math.min(s.ink == null ? 60 : s.ink, bg - 20);
          out.push({
            x: h0.X,
            y: h0.Y,
            hollow: false,
            s,
            ncc: h0.sc,
            stem: false,
            dark: (bg - c0) / (bg - ink),
            corr: 0,
            ledOK: ledOK(h0.X, h0.Y, s)
          });
        }
      }
    }
  }
  return out.filter(p => {
    const st = p.s,
      xs = pg.notes.filter(n => n.s === st).map(n => n.x),
      fx = xs.length ? Math.min(...xs) : 1e9;
    if (
      p.x < fx - 0.5 * st.d &&
      p.x < (st.cx0 || st.x0) + 10 * st.d &&
      !(!p.hollow && p.stem && ((p.ncc || 0) >= 0.75 || (p.corr || 0) >= 0.6))
    )
      return false;
    if (p.hollow && !p.stem && !p.wide) return false;
    return true;
  });
}
function reanalyze(pg, s, cx, cy) {
  return reanalyzeBox(pg, cx - 3.2 * s.d, cy - 4.5 * s.d, cx + 3.2 * s.d, cy + 4.5 * s.d);
}
/* revérification automatique des zones douteuses, après la première lecture */
function autoCheck(pg) {
  if (!pg.staves.length) return 0;
  const boxes = [];
  /* une blanche a un vrai trou blanc au centre. Entre deux noires collées, le « trou » n'est qu'un mince filet blanc :
   si le centre est surtout noir, ce n'est pas une blanche → on l'enlève et on cherchera les noires autour */
  const FKT = 0.68;
  const fakeHollow = n => {
    const s = n.s,
      d = s.d,
      lw = Math.max(1, s.lw || 2),
      rows = s.ys.slice();
    for (let q = 1; q <= 6; q++) rows.push(s.top - q * d, s.bot + q * d);
    const onL = yy => rows.some(r => Math.abs(r - yy) <= lw * 0.75 + 0.5);
    const c = pg.cv.getContext("2d"),
      x0 = Math.round(n.x - d),
      y0 = Math.round(n.y - d),
      w = Math.round(2 * d),
      h = Math.round(2 * d),
      im = c.getImageData(x0, y0, w, h).data,
      G = (x, y) => {
        const X = Math.round(x) - x0,
          Y = Math.round(y) - y0;
        if (X < 0 || Y < 0 || X >= w || Y >= h) return 255;
        const o = (Y * w + X) * 4;
        return (im[o] * 77 + im[o + 1] * 150 + im[o + 2] * 29) / 256;
      };
    const P = pg.paper || 240,
      I = Math.min(s.ink == null ? 60 : s.ink, P - 20),
      mid = (P + I) / 2;
    let best = 1;
    for (const [A, B, ang] of [
      [0.34 * d, 0.13 * d, -0.6],
      [0.3 * d, 0.2 * d, 0.5]
    ])
      for (const ox of [-0.1, 0, 0.1])
        for (const oy of [-0.08, 0, 0.08]) {
          let k = 0,
            t = 0;
          const ca = Math.cos(ang),
            sa = Math.sin(ang);
          for (let dy = -Math.ceil(A); dy <= Math.ceil(A); dy++) {
            const Y = n.y + oy * d + dy;
            if (onL(Y)) continue;
            for (let dx = -Math.ceil(A); dx <= Math.ceil(A); dx++) {
              const u = dx * ca + dy * sa,
                v = -dx * sa + dy * ca;
              if ((u / A) ** 2 + (v / B) ** 2 > 1) continue;
              t++;
              if (G(n.x + ox * d + dx, Y) < mid) k++;
            }
          }
          if (t >= 4) best = Math.min(best, k / t);
        }
    if (best > 0.5) return true;
    /* blanc pris entre deux noires collées : au-dessus ET au-dessous du « trou », l'encre continue sur une tête entière (une vraie blanche n'a qu'un bord fin) */
    const run = (x, dir) => {
      let y = n.y,
        k = 0;
      while (k < 0.35 * d && G(x, y) >= mid) {
        y += dir;
        k++;
      }
      let r = 0;
      while (r < 1.3 * d && G(x, y) < mid) {
        y += dir;
        r++;
      }
      return r;
    };
    let votes = 0,
      rr = [];
    for (const ox of [-0.12, 0, 0.12]) {
      const x = n.x + ox * d;
      const m = Math.min(run(x, -1), run(x, 1)) / d;
      rr.push(m);
      if (m >= FKT) votes++;
    }
    if (window.__FK) __FK.push([n.x, n.y, rr]);
    return votes >= 2;
  };
  pg.fakeHollow = fakeHollow;
  {
    const fk = pg.notes.filter(n => n.hollow && fakeHollow(n));
    if (fk.length) {
      pg.notes = pg.notes.filter(n => !fk.includes(n));
      for (const n of fk) {
        const d = n.s.d;
        boxes.push([n.x - 2.2 * d, n.y - 2.6 * d, n.x + 2.2 * d, n.y + 2.6 * d, null]);
      }
    }
  }
  /* chiffres de mesure pris pour des blanches/rondes en début de portée : ils vont par deux (en haut et en bas de la portée) */
  {
    const cx = pg.cv.getContext("2d");
    pg.notes = pg.notes.filter(n => {
      if (!n.hollow) return true;
      const st = n.s,
        dd = st.d,
        xs = pg.notes.filter(q => q.s === st && q !== n).map(q => q.x),
        fx = xs.length ? Math.min(...xs) : 1e9;
      if (!(n.x < fx - 0.5 * dd && n.x < (st.cx0 || st.x0) + 10 * dd)) return true;
      const r = (n.y - st.top) / dd;
      if (!(Math.abs(r - 1) < 0.45 || Math.abs(r - 3) < 0.45)) return true;
      const my = st.top + (r < 2 ? 3 : 1) * dd,
        q = cx.getImageData(
          Math.round(n.x - 0.5 * dd),
          Math.round(my - 0.5 * dd),
          Math.round(dd),
          Math.round(dd)
        ).data;
      let k = 0,
        t = 0;
      const mid = ((pg.paper || 240) + Math.min(st.ink == null ? 60 : st.ink, (pg.paper || 240) - 20)) / 2;
      for (let i = 0; i < q.length; i += 4) {
        t++;
        if ((q[i] * 77 + q[i + 1] * 150 + q[i + 2] * 29) / 256 < mid) k++;
      }
      return k / t <= 0.25;
    });
  }
  for (const u of pg.sus || []) {
    const d = u.s.d;
    boxes.push([u.x - 2.2 * d, u.y - 2.6 * d, u.x + 2.2 * d, u.y + 2.6 * d, u]);
  }
  const byS = new Map();
  for (const n of pg.notes) {
    if (!byS.has(n.s)) byS.set(n.s, []);
    byS.get(n.s).push(n);
  }
  for (const [s, ns] of byS) {
    const d = s.d;
    ns.sort((a, b) => a.x - b.x);
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length && ns[j].x - ns[i].x < 0.6 * d; j++) {
        const dy = Math.abs(ns[j].y - ns[i].y);
        if (dy > 1.7 * d && dy < 3.4 * d) {
          const mx = (ns[i].x + ns[j].x) / 2,
            my = (ns[i].y + ns[j].y) / 2;
          boxes.push([mx - 1.6 * d, my - dy / 2 - 0.3 * d, mx + 1.6 * d, my + dy / 2 + 0.3 * d, null]);
        }
      }
  }
  /* balayage complet de chaque portée, fenêtre par fenêtre, pour ne rien oublier */
  let added = 0;
  const newSus = [];
  for (const [a, b, c, e, u] of boxes) {
    const props = reanalyzeBox(pg, a, b, c, e);
    let took = false;
    for (const p of props) {
      const atSus = !!u && Math.abs(p.x - u.x) < 0.6 * p.s.d && Math.abs(p.y - u.y) < 0.6 * p.s.d;
      /* seconde : la note de gauche est toujours la plus grave des deux, juste un cran sous sa voisine de droite */
      if (atSus) {
        const dd = p.s.d;
        let bestY = null,
          bd = 1e9;
        for (const nb of pg.notes) {
          if (
            nb.s !== p.s ||
            Math.abs(nb.y - p.y) >= 1.2 * dd ||
            Math.abs(nb.x - p.x) <= 0.6 * dd ||
            Math.abs(nb.x - p.x) >= 1.6 * dd
          )
            continue;
          const ty = nb.x > p.x ? nb.y + 0.5 * dd : nb.y - 0.5 * dd,
            ry = u ? u.y : p.y;
          if (Math.abs(ty - ry) < bd) {
            bd = Math.abs(ty - ry);
            bestY = ty;
          }
        }
        if (bestY != null && bd < 0.4 * dd) {
          p.y = bestY;
          const q = pg.cv
            .getContext("2d")
            .getImageData(
              Math.round(p.x - 0.2 * dd),
              Math.round(p.y - 0.15 * dd),
              Math.max(1, Math.round(0.4 * dd)),
              Math.max(1, Math.round(0.3 * dd))
            ).data;
          let t = 0,
            n2 = 0;
          for (let i = 0; i < q.length; i += 4) {
            t += (q[i] * 77 + q[i + 1] * 150 + q[i + 2] * 29) / 256;
            n2++;
          }
          const bg = pg.paper || 230,
            ink = Math.min(p.s.ink == null ? 60 : p.s.ink, bg - 20);
          p.secondFix = (bg - t / n2) / (bg - ink) >= 0.85;
        }
      }
      /* tête bien noire collée à une voisine (seconde) : la forme ressemble moins au modèle, mais c'est une note */
      if (
        !p.hollow &&
        p.ledOK &&
        ((p.dark >= 0.85 && ((p.stem && pg.tmpl && p.corr >= 0.65) || (p.ncc || 0) >= 0.8)) ||
          (atSus &&
            p.stem &&
            p.dark >= 1 &&
            (p.corr >= 0.3 ||
              p.secondFix ||
              (p.corr >= 0.05 &&
                pg.notes.some(
                  n =>
                    n.s === p.s &&
                    Math.abs(n.x - p.x) > 0.6 * p.s.d &&
                    Math.abs(n.x - p.x) < 1.6 * p.s.d &&
                    Math.abs(n.y - p.y) < 0.75 * p.s.d
                ))))) &&
        !pg.notes.some(
          n => Math.abs(n.x - p.x) < 0.5 * p.s.d && Math.abs(snapY(n.s, n.y) - snapY(p.s, p.y)) < 0.8 * p.s.d
        )
      ) {
        const n = makeNote(pg, p);
        if (n) {
          pg.notes.push(n);
          added++;
          took = true;
        }
      } else if (
        u !== 0 &&
        !(pg.sus || []).some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.6 * p.s.d) &&
        !newSus.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.6 * p.s.d) &&
        p.ledOK &&
        (p.hollow ? p.stem : p.dark >= 0.7 && ((p.ncc || 0) >= 0.7 || (p.stem && p.corr >= 0.5)))
      )
        newSus.push({x: p.x, y: p.y, s: p.s, c: null});
    }
    if (u && took) u.done = true;
  }
  /* têtes noires : balayage avec le modèle appris sur la page */
  const addFilled = () => {
    let k = 0;
    for (const f of filledSweep(pg)) {
      const st = f.s,
        dd = st.d;
      if (pg.notes.some(n => Math.abs(n.x - f.x) < 0.9 * dd && Math.abs(n.y - f.y) < 0.7 * dd)) continue;
      if (
        st.excl.some(b => f.x >= b[0] - 2 && f.x <= b[2] + 2 && f.y >= b[1] && f.y <= b[3]) ||
        st.clefs.some(k => k.box && f.x >= k.box[0] - 2 && f.x <= k.box[2] + 2)
      )
        continue;
      const xs = pg.notes.filter(n => n.s === st).map(n => n.x),
        fx = xs.length ? Math.min(...xs) : 1e9;
      if (f.x < fx - 0.5 * dd && f.x < (st.cx0 || st.x0) + 10 * dd && !(f.sc >= (pg.fthr || 0.8) + 0.05)) continue;
      const nn = makeNote(pg, {x: f.x, y: f.y, s: st});
      if (nn) {
        nn.src = "fs";
        pg.notes.push(nn);
        k++;
      }
    }
    return k;
  };
  added += addFilled();
  /* blanches et rondes qu'on ne voit qu'en niveaux de gris (photos) */
  for (const f of hollowSweep(pg)) {
    const st = f.s,
      dd = st.d;
    if (pg.notes.some(n => Math.abs(n.x - f.x) < 0.9 * dd && Math.abs(n.y - f.y) < 0.7 * dd)) continue;
    if (
      st.excl.some(b => f.x >= b[0] - 2 && f.x <= b[2] + 2 && f.y >= b[1] && f.y <= b[3]) ||
      (st.exclH || []).some(b => f.x >= b[0] - 2 && f.x <= b[2] + 2 && f.y >= b[1] && f.y <= b[3]) ||
      st.clefs.some(k => k.box && f.x >= k.box[0] - 2 && f.x <= k.box[2] + 2)
    )
      continue;
    const xs = pg.notes.filter(n => n.s === st).map(n => n.x),
      fx = xs.length ? Math.min(...xs) : 1e9;
    if (f.x < fx - 0.5 * dd && f.x < (st.cx0 || st.x0) + 10 * dd && !(f.sc >= 0.65 && f.rc >= 0.75) && f.kind !== 0)
      continue;
    /* début de portée : un chiffre de mesure (2, 3, 6, 8, 9…) ressemble à une ronde ; les chiffres vont par deux, l'un au-dessus de l'autre */
    if (f.kind === 1 && f.x < fx - 0.5 * dd && f.x < (st.cx0 || st.x0) + 10 * dd) {
      const r = (f.y - st.top) / dd;
      if (Math.abs(r - 1) < 0.35 || Math.abs(r - 3) < 0.35) {
        const my = st.top + (r < 2 ? 3 : 1) * dd,
          cx = pg.cv.getContext("2d"),
          q = cx.getImageData(
            Math.round(f.x - 0.5 * dd),
            Math.round(my - 0.5 * dd),
            Math.round(dd),
            Math.round(dd)
          ).data;
        let k = 0,
          t = 0;
        const mid = ((pg.paper || 240) + Math.min(st.ink == null ? 60 : st.ink, (pg.paper || 240) - 20)) / 2;
        for (let i = 0; i < q.length; i += 4) {
          t++;
          if ((q[i] * 77 + q[i + 1] * 150 + q[i + 2] * 29) / 256 < mid) k++;
        }
        if (k / t > 0.25) continue;
      }
    }
    const nn = makeNote(pg, {x: f.x, y: f.y, s: st, hollow: true});
    if (nn) {
      nn.hollow = true;
      nn.src = "hs" + (f.sc < 0.6 ? "r" : "");
      pg.notes.push(nn);
      added++;
    }
  }
  added += hollowStacks(pg);
  /* netteté de l'image : proportion de gris intermédiaires autour de l'encre (photo floue ≫ capture nette) */
  {
    const c = pg.cv.getContext("2d");
    let mid = 0,
      dark = 0;
    for (const s of pg.staves) {
      const x0 = Math.max(0, Math.round(s.x0)),
        w = Math.max(1, Math.min(pg.W - x0, Math.round(s.x1 - s.x0))),
        y0 = Math.max(0, Math.round(s.top - s.d)),
        h = Math.max(1, Math.min(pg.H - y0, Math.round(s.bot - s.top + 2 * s.d)));
      const im = c.getImageData(x0, y0, w, h).data,
        P = pg.paper || 240,
        I = Math.min(s.ink == null ? 60 : s.ink, P - 20);
      for (let i = 0; i < im.length; i += 8) {
        const v = (im[i] * 77 + im[i + 1] * 150 + im[i + 2] * 29) >> 8,
          t = (P - v) / (P - I);
        if (t > 0.75) dark++;
        else if (t > 0.25) mid++;
      }
    }
    pg.blur = mid / (dark + 1);
  }
  if (pg.blur < 1) {
    added += neighborFill(pg);
    added += hollowStacks(pg);
  }
  /* blanches encore manquantes : balayage avec le modèle de blanche appris sur la page (têtes collées en pile) */
  if (pg.blur < 1 && pg.nfs && pg.notes.filter(n => n.hollow).length >= 5) {
    const cx = pg.cv.getContext("2d"),
      al = cx.getImageData(0, 0, pg.W, pg.H).data,
      G = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= pg.W || y >= pg.H) return 255;
        const o = (y * pg.W + x) * 4;
        return (al[o] * 77 + al[o + 1] * 150 + al[o + 2] * 29) / 256;
      };
    for (let pass = 0; pass < 2; pass++) {
      const got = [];
      for (const s of pg.staves) {
        const d = s.d,
          lw = Math.max(1, s.lw || 2),
          rows = s.ys.slice();
        for (let q = 1; q <= 5; q++) rows.push(s.top - q * d, s.bot + q * d);
        const onL = yy => rows.some(r => Math.abs(r - yy) <= lw * 0.75 + 0.5);
        const xs = pg.notes.filter(n => n.s === s).map(n => n.x),
          fx = xs.length ? Math.min(...xs) : 1e9;
        for (let y = snapY(s, s.top - 4 * d); y <= s.bot + 4 * d + 0.01; y += d / 2) {
          const cyy = onL(y) ? [y - 0.22 * d, y + 0.22 * d] : [y];
          for (let x = Math.round(Math.max(fx - 0.5 * d, (s.cx0 || s.x0) + 3 * d)); x < s.x1 - 0.5 * d; x++) {
            const c = Math.max(...cyy.map(yy => G(x, yy)));
            if (!(c > G(x - 0.55 * d, y) + 25 && c > G(x + 0.55 * d, y) + 25)) continue;
            if (
              pg.notes.some(n => Math.abs(n.x - x) < 0.9 * d && Math.abs(n.y - y) < 0.75 * d) ||
              got.some(g => Math.abs(g.x - x) < 0.9 * d && Math.abs(g.y - y) < 0.75 * d)
            )
              continue;
            const v = pg.nfs(x, y, 1, null);
            if (v < 0.5) continue;
            /* garder le meilleur x proche */ let bx = x,
              bv = v;
            for (let xx = x + 1; xx < x + 0.4 * d; xx++) {
              const w = pg.nfs(xx, y, 1, null);
              if (w > bv) {
                bv = w;
                bx = xx;
              }
            }
            /* anneau fermé autour (crochets et hampes ne le sont pas) */
            {
              const P = pg.paper || 240,
                I = Math.min(s.ink == null ? 60 : s.ink, P - 20),
                thr = P - 0.5 * (P - I);
              let best = 0;
              for (const [A, B, ang] of [
                [0.62, 0.44, -0.38],
                [0.78, 0.46, 0]
              ]) {
                let dk = 0;
                const ca = Math.cos(ang),
                  sa = Math.sin(ang);
                for (let t = 0; t < 16; t++) {
                  const th = (t * Math.PI) / 8;
                  let m = 255;
                  for (const f of [0.85, 1, 1.12]) {
                    const u = A * d * f * Math.cos(th),
                      v = B * d * f * Math.sin(th);
                    m = Math.min(m, G(bx + u * ca - v * sa, y + u * sa + v * ca));
                  }
                  if (m < thr) dk++;
                }
                best = Math.max(best, dk);
              }
              if (window.__LH) __LH.push([bx, y, bv, best]);
              if (best < 15) continue;
            }
            got.push({x: bx, y, s, v: bv});
          }
        }
      }
      /* seulement les têtes collées en pile : il faut une voisine (blanche) juste au-dessus ou au-dessous, à un interligne */
      const pair = g => {
        const d = g.s.d;
        return (
          got.some(
            h =>
              h !== g &&
              h.v >= Math.max(0.72, pg.nthr - 0.06) &&
              h.s === g.s &&
              Math.abs(h.x - g.x) < 0.4 * d &&
              Math.abs(Math.abs(h.y - g.y) - d) < 0.15 * d
          ) ||
          pg.notes.some(
            n =>
              n.hollow &&
              n.s === g.s &&
              Math.abs(n.x - g.x) < 0.4 * d &&
              [1, 1.5, 2].some(m => Math.abs(Math.abs(snapY(n.s, n.y) - g.y) - m * d) < 0.15 * d)
          )
        );
      };
      const TH = Math.max(0.72, pg.nthr - 0.06),
        strongP = g => {
          const d = g.s.d;
          return (
            got.some(
              h =>
                h !== g &&
                h.s === g.s &&
                Math.abs(h.x - g.x) < 0.4 * d &&
                Math.abs(Math.abs(h.y - g.y) - d) < 0.15 * d &&
                h.v + g.v >= 1.25
            ) &&
            pg.blur < 0.7 &&
            (pg.up || 1) <= 1.2
          );
        };
      const half = g => {
        const d = g.s.d;
        return got.some(
          h =>
            h !== g &&
            h.s === g.s &&
            Math.abs(h.x - g.x) < 0.4 * d &&
            Math.abs(Math.abs(h.y - g.y) - 0.5 * d) < 0.15 * d
        );
      };
      const keep = got.filter(g => !half(g) && ((g.v >= TH && pair(g)) || strongP(g)));
      got.length = 0;
      got.push(...keep);
      for (const g of got) {
        const nn = makeNote(pg, {x: g.x, y: g.y, s: g.s, hollow: true});
        if (nn) {
          nn.hollow = true;
          nn.src = "lhs";
          pg.notes.push(nn);
          added++;
        }
      }
      if (!got.length) break;
    }
  }
  /* dernière vérification : chaque note doit ressembler au modèle de tête appris sur la page */
  /* début de portée : chiffres de mesure et bémols de l'armure pris pour des notes */
  {
    const cx = pg.cv.getContext("2d"),
      al = cx.getImageData(0, 0, pg.W, pg.H).data,
      G = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= pg.W || y >= pg.H) return 255;
        const o = (y * pg.W + x) * 4;
        return (al[o] * 77 + al[o + 1] * 150 + al[o + 2] * 29) / 256;
      };
    const colDark = (x, ya, yb, mid) => {
      let k = 0,
        t = 0;
      for (let y = Math.round(Math.min(ya, yb)); y <= Math.max(ya, yb); y++) {
        t++;
        if (Math.min(G(x - 1, y), G(x, y), G(x + 1, y)) < mid) k++;
      }
      return t ? k / t : 0;
    };
    const rm = new Set();
    for (const n of pg.notes) {
      const st = n.s,
        dd = st.d,
        mid = ((pg.paper || 240) + Math.min(st.ink == null ? 60 : st.ink, (pg.paper || 240) - 20)) / 2;
      const others = pg.notes.filter(q => q.s === st && q !== n && Math.abs(q.x - n.x) > 0.6 * dd).map(q => q.x),
        fx = others.length ? Math.min(...others) : 1e9;
      if (!(n.x < fx - 0.5 * dd && n.x < (st.cx0 || st.x0) + 10 * dd)) continue;
      /* en début de portée (armure, chiffrage) : une vraie note a une hampe, à droite vers le haut ou à gauche vers le bas ;
       un bémol a son trait à gauche vers le haut, un chiffre n'a pas de hampe */
      const up = [0.5, 0.6, 0.7].some(
          off =>
            colDark(n.x + off * dd, n.y - 0.3 * dd, n.y - 2.5 * dd, mid) > 0.9 &&
            colDark(n.x + off * dd, n.y + 0.5 * dd, n.y + 1.5 * dd, mid) < 0.5
        ),
        down = [0.5, 0.6, 0.7].some(
          off =>
            colDark(n.x - off * dd, n.y + 0.3 * dd, n.y + 2.5 * dd, mid) > 0.9 &&
            colDark(n.x - off * dd, n.y - 0.5 * dd, n.y - 1.5 * dd, mid) < 0.5
        );
      const flat = [0.4, 0.5, 0.6, 0.7].some(
        off => colDark(n.x - off * dd, n.y - 0.3 * dd, n.y - 1.8 * dd, mid) > 0.9
      );
      const chordMate = pg.notes.some(
        q =>
          q !== n &&
          Math.abs(q.x - n.x) < 1.6 * dd &&
          Math.abs(q.y - n.y) < 3 * dd &&
          (Math.abs(q.x - n.x) > 0.6 * dd || Math.abs(q.y - n.y) > 0.8 * dd)
      );
      if (n.whole) continue;
      if (!(up || down) && !chordMate && !n.hollow) {
        rm.add(n);
        continue;
      }
      if (!(up || down) && n.hollow && !chordMate) {
        const r = (n.y - st.top) / dd;
        if (Math.abs(r - 1) < 0.45 || Math.abs(r - 3) < 0.45) {
          const my = st.top + (r < 2 ? 3 : 1) * dd;
          let k = 0,
            t = 0;
          for (let y = my - 0.5 * dd; y <= my + 0.5 * dd; y++)
            for (let x = n.x - 0.5 * dd; x <= n.x + 0.5 * dd; x++) {
              t++;
              if (G(x, y) < mid) k++;
            }
          if (k / t > 0.25) {
            rm.add(n);
            continue;
          }
        }
      }
      if (flat && !up && !down && !chordMate) rm.add(n);
    }
    if (rm.size) {
      pg.notes = pg.notes.filter(n => !rm.has(n));
      added -= rm.size;
    }
  }
  /* une « blanche » collée à l'horizontale contre une noire, à la même hauteur : c'est le blanc enfermé entre deux noires et une hampe */
  {
    const side = (n, sg) =>
      pg.notes.some(
        q =>
          !q.hollow &&
          q.s === n.s &&
          sg * (q.x - n.x) > 0 &&
          Math.abs(q.x - n.x) < 1.3 * n.s.d &&
          Math.abs(q.y - n.y) < 0.4 * n.s.d
      );
    const fk = pg.notes.filter(
      n =>
        n.hollow &&
        (pg.notes.some(
          q => !q.hollow && q.s === n.s && Math.abs(q.x - n.x) < 0.9 * n.s.d && Math.abs(q.y - n.y) < 0.4 * n.s.d
        ) ||
          (side(n, 1) && side(n, -1)))
    );
    if (fk.length) {
      pg.notes = pg.notes.filter(n => !fk.includes(n));
      added -= fk.length;
    }
  }
  if (pg.blur < 1) {
    const fk = pg.notes.filter(n => n.hollow && fakeHollow(n));
    if (fk.length) {
      pg.notes = pg.notes.filter(n => !fk.includes(n));
      added -= fk.length;
      /* les fausses blanches occupaient la place des vraies noires : on les cherche à nouveau */
      added += addFilled();
      added += neighborFill(pg);
      const fk2 = pg.notes.filter(n => n.hollow && fakeHollow(n));
      if (fk2.length) {
        pg.notes = pg.notes.filter(n => !fk2.includes(n));
        added -= fk2.length;
      }
    }
  }
  /* accords répétés : un accord bien reconnu sert de modèle pour retrouver le même accord ailleurs sur la page
   (même hauteur dans la portée, même forme), même si ses têtes sont trop serrées pour être lues une par une */
  const chordCopy = rep => {
    const cx = pg.cv.getContext("2d"),
      al = cx.getImageData(0, 0, pg.W, pg.H).data,
      W = pg.W,
      H = pg.H,
      G = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return 255;
        const o = (y * W + x) * 4;
        return (al[o] * 77 + al[o + 1] * 150 + al[o + 2] * 29) / 256;
      };
    const pats = new Map();
    for (const s of pg.staves) {
      const ns = pg.notes.filter(n => n.s === s).sort((a, b) => a.x - b.x),
        used = new Set();
      for (const n of ns) {
        if (used.has(n)) continue;
        const col = ns.filter(q => Math.abs(q.x - n.x) < 0.6 * s.d);
        col.forEach(q => used.add(q));
        if (col.length < 2) continue;
        const rel = col
            .map(q => [Math.round(((snapY(s, q.y) - s.top) / s.d) * 2), q.hollow ? 1 : 0])
            .sort((a, b) => a[0] - b[0]),
          key = s.c0 + ":" + rel.map(r => r.join(",")).join(";");
        if (pats.has(key)) {
          pats.get(key).n++;
          continue;
        }
        const X = col.reduce((a, q) => a + q.x, 0) / col.length,
          ya = Math.min(...col.map(q => q.y)) - 0.8 * s.d,
          yb = Math.max(...col.map(q => q.y)) + 0.8 * s.d,
          hx = Math.round(1.0 * s.d);
        const v = [];
        for (let y = Math.round(ya); y <= yb; y++) for (let x = -hx; x <= hx; x++) v.push(G(X + x, y));
        let m = 0;
        for (const a of v) m += a;
        m /= v.length;
        let q = 0;
        const t = v.map(a => {
          const b = a - m;
          q += b * b;
          return b;
        });
        q = Math.sqrt(q) || 1;
        pats.set(key, {
          rel,
          c0: s.c0,
          t: t.map(a => a / q),
          d: s.d,
          dy0: (ya - s.top) / s.d,
          rows: Math.round(yb) - Math.round(ya) + 1,
          hx,
          n: 1
        });
      }
    }
    let add = 0;
    for (const P of pats.values())
      if (P.n >= 2)
        for (const s of pg.staves) {
          if (s.c0 !== P.c0 || Math.abs(s.d - P.d) > 0.15 * P.d) continue;
          const y0 = Math.round(s.top + P.dy0 * s.d);
          const sc = new Float32Array(W);
          for (let X = Math.round((s.cx0 || s.x0) + 4 * s.d); X < s.x1 - P.hx; X++) {
            let i = 0,
              sm = 0,
              sq = 0,
              c = 0;
            const vv = [];
            for (let r = 0; r < P.rows; r++)
              for (let x = -P.hx; x <= P.hx; x++) {
                const a = G(X + x, y0 + r);
                sm += a;
                sq += a * a;
                c += a * P.t[i++];
              }
            const n = P.t.length,
              va = sq - (sm * sm) / n;
            sc[X] = va > 0 ? c / Math.sqrt(va) : 0;
          }
          for (let X = 3; X < W - 3; X++) {
            if (sc[X] < 0.78 || sc[X] < sc[X - 1] || sc[X] < sc[X + 1] || sc[X] < sc[X - 2] || sc[X] < sc[X + 2])
              continue;
            const ys = P.rel.map(r => s.top + (r[0] * s.d) / 2);
            if (rep) {
              const ex = pg.notes.filter(
                q =>
                  q.s === s &&
                  Math.abs(q.x - X) < 0.9 * s.d &&
                  q.y > ys[0] - 1.2 * s.d &&
                  q.y < ys[ys.length - 1] + 1.2 * s.d
              );
              if (
                sc[X] < 0.88 ||
                !ex.length ||
                ex.length > P.rel.length ||
                ex.every(q => ys.some(y => Math.abs(snapY(s, q.y) - y) < 0.3 * s.d))
              )
                continue;
              /* accord identique à un modèle sûr, mais une tête lue un cran à côté : on reprend le modèle */
              pg.notes = pg.notes.filter(q => !ex.includes(q));
              add -= ex.length;
              P.rel.forEach((r, k) => {
                const nn = makeNote(pg, {x: X, y: ys[k], s, hollow: !!r[1]});
                nn.hollow = !!r[1];
                nn.src = "chord";
                pg.notes.push(nn);
                add++;
              });
              continue;
            }
            if (
              pg.notes.some(
                q =>
                  q.s === s &&
                  Math.abs(q.x - X) < 0.8 * s.d &&
                  q.y > ys[0] - 0.6 * s.d &&
                  q.y < ys[ys.length - 1] + 0.6 * s.d &&
                  !pg.notes.filter(z => z.s === s && Math.abs(z.x - X) < 0.8 * s.d).every(() => false)
              )
            ) {
              /* accord partiellement trouvé : on complète seulement les hauteurs manquantes */
              P.rel.forEach((r, k) => {
                const y = ys[k];
                if (pg.notes.some(q => Math.abs(q.x - X) < 0.8 * s.d && Math.abs(snapY(q.s, q.y) - y) < 0.3 * s.d))
                  return;
                const nn = makeNote(pg, {x: X, y, s, hollow: !!r[1]});
                if (nn) {
                  nn.hollow = !!r[1];
                  nn.src = "chord";
                  pg.notes.push(nn);
                  add++;
                }
              });
              continue;
            }
            P.rel.forEach((r, k) => {
              const nn = makeNote(pg, {x: X, y: ys[k], s, hollow: !!r[1]});
              if (nn) {
                nn.hollow = !!r[1];
                nn.src = "chord";
                pg.notes.push(nn);
                add++;
              }
            });
          }
        }
    return add;
  };
  /* (copie d'accords désactivée : trop de faux positifs sur les pages chargées) */
  /* accords serrés : têtes empilées en tierces qui se touchent et forment un bloc d'encre (impression grasse) →
   on mesure la hauteur du bloc et on le découpe en têtes espacées d'un interligne */
  {
    const cx = pg.cv.getContext("2d"),
      al = cx.getImageData(0, 0, pg.W, pg.H).data,
      W = pg.W,
      H = pg.H,
      G = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return 255;
        const o = (y * W + x) * 4;
        return (al[o] * 77 + al[o + 1] * 150 + al[o + 2] * 29) / 256;
      };
    const multi = [];
    for (const s of pg.staves) {
      const ns = pg.notes.filter(n => n.s === s);
      for (const n of ns) {
        if (ns.some(q => q !== n && Math.abs(q.x - n.x) < 0.6 * s.d)) multi.push(n);
      }
    }
    const hol = multi.length ? multi.filter(n => n.hollow).length / multi.length > 0.5 : true;
    let add = 0;
    const blks = [];
    /* seulement pour les pages où les accords sont des blanches/rondes : des noires serrées sont déjà bien lues une par une */
    if (hol)
      for (const s of pg.staves) {
        const d = s.d,
          mid = ((pg.paper || 240) + Math.min(s.ink == null ? 60 : s.ink, (pg.paper || 240) - 20)) / 2,
          yA = Math.max(0, Math.round(s.top - 4 * d)),
          yB = Math.min(H - 1, Math.round(s.bot + 4 * d));
        const xs = Math.round((s.cx0 || s.x0) + 4 * d),
          xe = Math.round(s.x1 - 0.5 * d),
          L = new Float32Array(W),
          T = new Float32Array(W),
          B = new Float32Array(W);
        for (let x = xs; x < xe; x++) {
          let best = 0,
            bt = 0,
            run = 0,
            st = 0;
          const gp = Math.max(2, Math.round(0.3 * d));
          let gap = 0;
          for (let y = yA; y <= yB; y++) {
            if (G(x, y) < mid) {
              if (!run) st = y;
              run += gap + 1;
              gap = 0;
              if (run > best) {
                best = run;
                bt = st;
              }
            } else if (run && gap < gp) gap++;
            else {
              run = 0;
              gap = 0;
            }
          }
          L[x] = best;
          T[x] = bt;
          B[x] = bt + best - 1;
        }
        let x = xs;
        while (x < xe) {
          if (L[x] < 1.8 * d) {
            x++;
            continue;
          }
          let e = x;
          while (e + 1 < xe && L[e + 1] >= 1.8 * d) e++;
          const a = x;
          x = e + 1;
          const w = e - a + 1;
          if (w < 0.8 * d || w > 1.9 * d) continue;
          const cols = [];
          for (let k = a; k <= e; k++) cols.push(k);
          const core = cols.filter(k => L[k] < Math.max(...cols.map(c => L[c])) - 0.5 * d || true);
          /* hauteur du bloc : médiane des colonnes de tête (on écarte la hampe, plus longue) */
          const ls = cols.map(k => L[k]).sort((p, q) => p - q),
            hm = ls[Math.floor(ls.length * 0.4)];
          const hc = cols.filter(k => Math.abs(L[k] - hm) < 0.35 * d);
          if (hc.length < 0.5 * d) continue;
          const tops = hc.map(k => T[k]).sort((p, q) => p - q),
            bots = hc.map(k => B[k]).sort((p, q) => p - q),
            top = tops[tops.length >> 1],
            bot = bots[bots.length >> 1],
            h = bot - top + 1;
          if (Math.max(...cols.map(c => L[c])) < h + 1.1 * d) continue; /* il faut une hampe */
          /* hampe fine, au bord du bloc : à droite elle monte, à gauche elle descend (un chiffrage n'a rien de tel) */
          {
            const sc = cols.filter(c => L[c] >= h + 1.1 * d);
            if (sc.length > 0.45 * d) continue;
            const sx = sc.reduce((p, q) => p + q, 0) / sc.length;
            const right = sx > e - 0.4 * d,
              left = sx < a + 0.4 * d;
            if (
              !(right && T[Math.round(sx)] < top - 0.8 * d) &&
              !(left && B[Math.round(sx)] > bot + 0.8 * d) &&
              !(right && B[Math.round(sx)] > bot + 0.8 * d && 0)
            ) {
              /* tolérance : certaines gravures mettent la hampe d'un accord à gauche vers le haut */
              if (!((right || left) && (T[Math.round(sx)] < top - 0.8 * d || B[Math.round(sx)] > bot + 0.8 * d)))
                continue;
            }
          }
          const X = hc.reduce((p, q) => p + q, 0) / hc.length;
          blks.push({s, d, X, top, h, ex: pg.notes.filter(q => q.s === s && Math.abs(q.x - X) < 0.9 * d)});
        }
      }
    /* hauteur d'une tête dans un bloc : apprise sur les accords déjà lus */
    const o1 = [],
      o2 = [];
    for (const b of blks) {
      if (b.ex.length < 2) continue;
      const yy = b.ex.map(q => snapY(b.s, q.y)),
        a = (Math.min(...yy) - b.top) / b.d,
        c = (b.top + b.h - Math.max(...yy)) / b.d;
      if (a < 0.2 || c < 0.2 || a > 1.5 || c > 1.5) continue;
      o1.push(a);
      o2.push(c);
    }
    o1.sort((p, q) => p - q);
    o2.sort((p, q) => p - q);
    if (o1.length >= 2) {
      const A = o1[o1.length >> 1],
        C = o2[o2.length >> 1];
      for (const b of blks) {
        const d = b.d,
          s = b.s,
          k = Math.round((b.h - (A + C) * d) / d) + 1;
        if (k < 2 || k > 4) continue;
        const r = (b.h - (A + C) * d) / (k - 1);
        if (Math.abs(r - d) > 0.25 * d) continue;
        const ys = [];
        for (let i = 0; i < k; i++) ys.push(snapY(s, b.top + A * d + i * r));
        if (b.ex.some(q => !ys.some(y => Math.abs(snapY(s, q.y) - y) < 0.3 * d))) {
          /* bloc pris pour des noires mal placées : on remplace seulement si la page est en blanches et que tout ce qui a été lu ici est noir */
          if (!(hol && b.ex.every(q => !q.hollow) && b.ex.length < k)) continue;
          pg.notes = pg.notes.filter(q => !b.ex.includes(q));
          added -= b.ex.length;
          b.ex = [];
        }
        for (const y of ys) {
          if (b.ex.some(q => Math.abs(snapY(s, q.y) - y) < 0.3 * d)) continue;
          const nn = makeNote(pg, {x: b.X, y, s, hollow: hol});
          if (nn) {
            nn.hollow = hol;
            nn.src = "bloc";
            pg.notes.push(nn);
            add++;
          }
        }
        b.ok = true;
      }
    }
    /* bloc resté vide : on le compare (à cet endroit seulement) aux accords sûrs de la même clé */
    {
      const win = (s, X) => {
        const d = s.d,
          v = [];
        for (let y = Math.round(s.top - 1.5 * d); y <= s.bot + 1.5 * d; y++)
          for (let x = -Math.round(0.9 * d); x <= 0.9 * d; x++) v.push(G(X + x, y));
        let m = 0;
        for (const a of v) m += a;
        m /= v.length;
        let q = 0;
        const t = v.map(a => a - m);
        for (const a of t) q += a * a;
        q = Math.sqrt(q) || 1;
        return t.map(a => a / q);
      };
      const ref = [];
      for (const s of pg.staves) {
        const ns = pg.notes.filter(n => n.s === s),
          seen = new Set();
        for (const n of ns) {
          if (seen.has(n)) continue;
          const col = ns.filter(q => Math.abs(q.x - n.x) < 0.6 * s.d);
          col.forEach(q => seen.add(q));
          if (col.length < 3) continue;
          const X = col.reduce((p, q) => p + q.x, 0) / col.length;
          ref.push({
            s,
            X,
            rel: col.map(q => Math.round(((snapY(s, q.y) - s.top) / s.d) * 2)),
            hol: col.every(q => q.hollow),
            t: win(s, X)
          });
        }
      }
      for (const b of blks) {
        if (b.ok || b.ex.length) continue;
        const s = b.s;
        let best = null,
          bv = 0.8,
          bx = 0;
        for (let dx = -3; dx <= 3; dx++) {
          const t = win(s, b.X + dx);
          for (const r of ref) {
            if (r.s.c0 !== s.c0 || Math.abs(r.s.d - s.d) > 0.12 * s.d || r.t.length !== t.length) continue;
            let c = 0;
            for (let i = 0; i < t.length; i++) c += t[i] * r.t[i];
            if (c > bv) {
              bv = c;
              best = r;
              bx = dx;
            }
          }
        }
        if (!best) continue;
        for (const p of best.rel) {
          const nn = makeNote(pg, {x: b.X + bx, y: s.top + (p * s.d) / 2, s, hollow: best.hol});
          nn.hollow = best.hol;
          nn.src = "bloc2";
          pg.notes.push(nn);
          add++;
        }
      }
    }
    added += add;
  }
  /* silences (pause, demi-pause) : petit rectangle plein accroché à une ligne, sans hampe → ce n'est pas une note */
  {
    const cx = pg.cv.getContext("2d"),
      al = cx.getImageData(0, 0, pg.W, pg.H).data,
      G = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= pg.W || y >= pg.H) return 255;
        const o = (y * pg.W + x) * 4;
        return (al[o] * 77 + al[o + 1] * 150 + al[o + 2] * 29) / 256;
      };
    const isRest = n => {
      if (n.hollow) return false;
      const s = n.s,
        d = s.d,
        mid = ((pg.paper || 240) + Math.min(s.ink == null ? 60 : s.ink, (pg.paper || 240) - 20)) / 2;
      const col = (x, ya, yb) => {
        let k = 0,
          t = 0;
        for (let y = Math.round(ya); y <= yb; y++) {
          t++;
          if (Math.min(G(x - 1, y), G(x, y), G(x + 1, y)) < mid) k++;
        }
        return t ? k / t : 0;
      };
      if (
        [-0.75, -0.65, -0.55, 0.55, 0.65, 0.75].some(
          o =>
            col(n.x + o * d, n.y - 2.6 * d, n.y - 0.6 * d) > 0.85 ||
            col(n.x + o * d, n.y + 0.6 * d, n.y + 2.6 * d) > 0.85
        )
      )
        return false;
      /* profil : largeur d'encre rangée par rangée autour du centre */
      const wid = y => {
        let a = n.x,
          b = n.x;
        if (G(n.x, y) >= mid) return 0;
        while (a > n.x - 1.5 * d && G(a - 1, y) < mid) a--;
        while (b < n.x + 1.5 * d && G(b + 1, y) < mid) b++;
        return b - a + 1;
      };
      const rows = [];
      for (let y = Math.round(n.y - 0.6 * d); y <= n.y + 0.6 * d; y++) {
        const w = wid(y);
        if (w > 0) rows.push(w);
      }
      if (rows.length < 3) return false;
      const core = rows.filter(w => w < 1.6 * d);
      if (core.length < 3) return false;
      const mx = Math.max(...core),
        mn = Math.min(...(core.slice(1, -1).length ? core.slice(1, -1) : core));
      const h = core.length;
      return h <= 0.75 * d && mx >= 0.9 * d && mx <= 1.6 * d && mn >= 0.82 * mx;
    };
    /* barre de mesure épaisse (double barre finale) lue comme une pile de noires : colonne de ≥ 4 « têtes » au même x,
     et une encre de largeur constante, plus étroite qu'une tête, sur toute la hauteur de la portée */
    {
      const bad = [];
      for (const s of pg.staves) {
        const d = s.d,
          mid = ((pg.paper || 240) + Math.min(s.ink == null ? 60 : s.ink, (pg.paper || 240) - 20)) / 2,
          lw = Math.max(1, s.lw || 2);
        const ns = pg.notes.filter(n => n.s === s && !n.hollow && !bad.includes(n));
        for (const n of ns) {
          const col = ns.filter(q => Math.abs(q.x - n.x) < 0.45 * d);
          if (col.length < 4) continue;
          const X = col.reduce((a, q) => a + q.x, 0) / col.length,
            ws = [];
          for (let y = Math.round(s.top); y <= s.bot; y += 2) {
            if (s.ys.some(v => Math.abs(v - y) <= lw + 1)) continue;
            let a = Math.round(X),
              b = a;
            if (G(a, y) >= mid) {
              let f = -1;
              for (let k = 1; k <= 0.6 * d; k++) {
                if (G(a - k, y) < mid) {
                  f = a - k;
                  break;
                }
                if (G(a + k, y) < mid) {
                  f = a + k;
                  break;
                }
              }
              if (f < 0) {
                ws.push(0);
                continue;
              }
              a = b = f;
            }
            while (a > X - 1.6 * d && G(a - 1, y) < mid) a--;
            while (b < X + 1.6 * d && G(b + 1, y) < mid) b++;
            ws.push(b - a + 1);
          }
          const okw = ws.filter(w => w >= 0.25 * d && w <= 0.95 * d),
            sw = okw.slice().sort((p, q) => p - q);
          if (
            ws.length >= 4 &&
            okw.length >= 0.8 * ws.length &&
            sw[Math.floor(sw.length * 0.9)] - sw[Math.floor(sw.length * 0.1)] <= 0.2 * d
          )
            col.forEach(q => {
              if (!bad.includes(q)) bad.push(q);
            });
        }
      }
      if (bad.length) {
        pg.notes = pg.notes.filter(n => !bad.includes(n));
        added -= bad.length;
      }
    }
    const rm = pg.notes.filter(isRest);
    if (rm.length) {
      pg.notes = pg.notes.filter(n => !rm.includes(n));
      added -= rm.length;
    }
    pg.sus = (pg.sus || []).filter(u => !isRest({x: u.x, y: u.y, s: u.s, hollow: false}));
  }
  if (pg.blur < 1 && pg.noteScore) {
    const nh = pg.notes.filter(n => n.hollow).length,
      nf = pg.notes.length - nh;
    pg.notes = pg.notes.filter(n => {
      if (!n.hollow || nh < 8 || n.src === "bloc") return true;
      const v = pg.noteScore(n);
      return v === -1 || v >= 0.25;
    });
  }
  /* seconde : deux têtes côte à côte ne peuvent pas être à la même hauteur ; celle de droite est un cran plus haut */
  {
    const cx2 = pg.cv.getContext("2d"),
      al2 = cx2.getImageData(0, 0, pg.W, pg.H).data,
      G2 = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= pg.W || y >= pg.H) return 255;
        const o = (y * pg.W + x) * 4;
        return (al2[o] * 77 + al2[o + 1] * 150 + al2[o + 2] * 29) / 256;
      };
    pg.__stemBetween = (a, b) => {
      const d = a.s.d,
        mid = ((pg.paper || 240) + Math.min(a.s.ink == null ? 60 : a.s.ink, (pg.paper || 240) - 20)) / 2;
      for (let X = Math.round(a.x + 0.3 * d); X <= b.x - 0.3 * d; X++) {
        let k = 0,
          t = 0;
        for (let y = Math.round(a.y - 1.2 * d); y <= a.y + 1.2 * d; y++) {
          t++;
          if (Math.min(G2(X, y), G2(X + 1, y)) < mid) k++;
        }
        if (k >= 0.9 * t) return true;
      }
      return false;
    };
  }
  for (const a of pg.notes.slice()) {
    for (const b of pg.notes.slice()) {
      if (a === b || a.s !== b.s || a.hollow !== b.hollow) continue;
      const d = a.s.d,
        dx = b.x - a.x;
      if (
        dx < 0.7 * d ||
        dx > 1.35 * d ||
        Math.abs(snapY(a.s, a.y) - snapY(b.s, b.y)) > 0.1 * d ||
        !pg.__stemBetween(a, b)
      )
        continue;
      const ty = snapY(b.s, b.y) - d / 2;
      if (pg.notes.some(q => q !== b && Math.abs(q.x - b.x) < 0.6 * d && Math.abs(snapY(q.s, q.y) - ty) < 0.1 * d))
        continue;
      const nn = makeNote(pg, {x: b.x, y: ty, s: b.s, hollow: b.hollow});
      if (nn) {
        nn.hollow = b.hollow;
        nn.src = b.src;
        pg.notes = pg.notes.filter(q => q !== b);
        pg.notes.push(nn);
      }
    }
  }
  /* nettoyage : une « note » noire qui se prolonge en barre épaisse horizontale est un bout de poutre */
  if (pg.blur < 1) {
    const cx = pg.cv.getContext("2d"),
      all = cx.getImageData(0, 0, pg.W, pg.H).data,
      G = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= pg.W || y >= pg.H) return 255;
        const o = (y * pg.W + x) * 4;
        return (all[o] * 77 + all[o + 1] * 150 + all[o + 2] * 29) / 256;
      };
    const rm = [];
    for (const n of pg.notes) {
      if (n.hollow) continue;
      const s = n.s,
        d = s.d,
        lw = Math.max(1, s.lw || 2),
        rows = s.ys.slice();
      for (let q = 1; q <= 6; q++) rows.push(s.top - q * d, s.bot + q * d);
      const onL = yy => rows.some(r => Math.abs(r - yy) <= lw);
      const mid = ((pg.paper || 240) + Math.min(s.ink == null ? 60 : s.ink, (pg.paper || 240) - 20)) / 2;
      const ys = [n.y - 0.2 * d, n.y, n.y + 0.2 * d].filter(y => !onL(y));
      if (ys.length < 2) continue;
      const side = sg => {
        let k = 0,
          t = 0;
        for (let o = 0.75; o <= 1.9; o += 0.05) {
          const X = n.x + sg * o * d;
          if (pg.notes.some(q => q !== n && ((X - q.x) / (0.7 * d)) ** 2 + ((n.y - q.y) / (0.6 * d)) ** 2 <= 1))
            continue;
          t++;
          if (ys.every(y => G(X, y) < mid)) k++;
        }
        return t >= 10 ? k / t : 0;
      };
      if (side(1) >= 0.85 || side(-1) >= 0.85) {
        rm.push(n);
        continue;
      }
      /* largeur d'encre continue sur la rangée de la tête (hors lignes, arrêt sur une autre note) : une tête fait ≈1,3 interligne, une poutre bien plus */
      const run = (y, sg) => {
        let k = 0;
        for (let o = 0; o <= 3 * d; o++) {
          const X = n.x + sg * o;
          if (
            o > 0.5 * d &&
            pg.notes.some(q => q !== n && ((X - q.x) / (0.66 * d)) ** 2 + ((y - q.y) / (0.5 * d)) ** 2 <= 1)
          )
            return k;
          if (G(X, y) < mid) k = o;
          else if (o - k > 1) return k;
        }
        return k;
      };
      const widths = ys.map(y => run(y, 1) + run(y, -1));
      if (Math.min(...widths) > 2.1 * d) rm.push(n);
    }
    if (rm.length) {
      pg.notes = pg.notes.filter(n => !rm.includes(n));
      added -= rm.length;
    }
  }
  /* impression grasse (blanches presque noires) : une vraie tête remplit l'ovale ; un chiffre de doigté ou un bout de tête voisine, non.
   On en profite pour retrouver la 2e tête d'une seconde collée de l'autre côté de la hampe */
  {
    const cx = pg.cv.getContext("2d"),
      al = cx.getImageData(0, 0, pg.W, pg.H).data,
      G = (x, y) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || y < 0 || x >= pg.W || y >= pg.H) return 255;
        const o = (y * pg.W + x) * 4;
        return (al[o] * 77 + al[o + 1] * 150 + al[o + 2] * 29) / 256;
      };
    const LR = (s, yy) => {
      const lw = Math.max(1, s.lw || 2);
      for (const r of s.ys) if (Math.abs(r - yy) <= lw * 0.75 + 0.5) return true;
      for (let q = 1; q <= 6; q++)
        if (Math.abs(s.top - q * s.d - yy) <= lw * 0.75 + 0.5 || Math.abs(s.bot + q * s.d - yy) <= lw * 0.75 + 0.5)
          return true;
      return false;
    };
    const fr = (s, x, y, side) => {
      const d = s.d,
        mid = ((pg.paper || 240) + Math.min(s.ink == null ? 60 : s.ink, (pg.paper || 240) - 20)) / 2,
        R = Math.ceil(0.62 * d),
        Q = Math.ceil(0.45 * d);
      let k = 0,
        t = 0;
      for (let dy = -Q; dy <= Q; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if ((dx / (0.62 * d)) ** 2 + (dy / (0.45 * d)) ** 2 > 1) continue;
          if (side && dx * side < 0.15 * d) continue;
          t++;
          if (G(x + dx, y + dy) < mid) k++;
        }
      return t ? k / t : 0;
    };
    const hn = pg.notes.filter(n => n.hollow);
    if (hn.length >= 6) {
      const F = hn.map(n => fr(n.s, n.x, snapY(n.s, n.y))).sort((p, q) => p - q)[hn.length >> 1];
      if (F >= 0.6) {
        const rm = hn.filter(n => fr(n.s, n.x, snapY(n.s, n.y)) < 0.62 * F);
        if (rm.length) {
          pg.notes = pg.notes.filter(n => !rm.includes(n));
          added -= rm.length;
        }
        const stemAt = (s, xa, xb, y) => {
          const d = s.d,
            mid = ((pg.paper || 240) + Math.min(s.ink == null ? 60 : s.ink, (pg.paper || 240) - 20)) / 2;
          for (let X = Math.round(xa); X <= xb; X++) {
            let up = 0,
              dn = 0;
            while (up < 4 * d && G(X, y - up - 1) < mid) up++;
            while (dn < 4 * d && G(X, y + dn + 1) < mid) dn++;
            if (G(X, y) < mid && up + dn >= 2.5 * d) return true;
          }
          return false;
        };
        /* depuis la hampe vers l'extérieur, l'encre doit continuer sur ≥ 0,95 interligne (une tête), sur des rangées hors lignes */
        const solidOut = (s, X0, sg, Y) => {
          const d = s.d,
            mid = ((pg.paper || 240) + Math.min(s.ink == null ? 60 : s.ink, (pg.paper || 240) - 20)) / 2,
            lw = Math.max(1, s.lw || 2),
            rows = s.ys.slice();
          for (let q = 1; q <= 6; q++) rows.push(s.top - q * d, s.bot + q * d);
          const ok = [];
          for (const o of [-0.3, -0.15, 0, 0.15, 0.3]) {
            const yy = Y + o * d;
            if (rows.some(r => Math.abs(r - yy) <= lw + 1)) continue;
            let k = 0,
              gap = 0,
              run = 0;
            for (let i = 0; i < 2 * d; i++) {
              const x = X0 + sg * i;
              if (G(x, yy) < mid) {
                run = i;
                gap = 0;
              } else if (++gap > 2) break;
            }
            ok.push(run);
          }
          return ok.length > 0 && Math.max(...ok) >= 0.95 * d;
        };
        if (F >= 0.68)
          for (const n of pg.notes.filter(q => q.hollow)) {
            const s = n.s,
              d = s.d,
              y = snapY(s, n.y);
            for (const sg of [1, -1]) {
              const X = n.x + sg * 1.1 * d,
                Y = y - (sg * d) / 2;
              if (
                pg.notes.some(q => q.s === s && Math.abs(q.x - X) < 0.7 * d && Math.abs(snapY(s, q.y) - Y) < 0.3 * d)
              )
                continue;
              if (fr(s, X, Y) < 0.9 * F) {
                /* tête de l'autre côté de la hampe trouvée deux crans plus loin : c'est notre tête qui a été lue un cran à côté */
                const Y2 = y - sg * d,
                  Ym = y - (sg * d) / 2;
                if (
                  fr(s, X, Y2) < 0.9 * F ||
                  fr(s, n.x, Ym) < fr(s, n.x, y) - 0.03 ||
                  pg.notes.some(
                    q => q.s === s && q !== n && Math.abs(q.x - X) < 1.0 * d && Math.abs(snapY(s, q.y) - Y2) < 0.8 * d
                  ) ||
                  pg.notes.some(
                    q =>
                      q.s === s && q !== n && Math.abs(q.x - n.x) < 0.7 * d && Math.abs(snapY(s, q.y) - Ym) < 0.3 * d
                  )
                )
                  continue;
                if (!stemAt(s, Math.min(n.x, X) + 0.3 * d, Math.max(n.x, X) - 0.3 * d, (y + Y2) / 2)) continue;
                if (fr(s, X, Y2, sg) < 0.85 * F || fr(s, X, Y2, -sg) < 0.95 * F) continue;
                const mv = makeNote(pg, {x: n.x, y: Ym, s, hollow: true});
                mv.hollow = true;
                mv.src = n.src;
                pg.notes = pg.notes.filter(q => q !== n);
                pg.notes.push(mv);
                const nn = makeNote(pg, {x: X, y: Y2, s, hollow: true});
                nn.hollow = true;
                nn.src = "sec2";
                pg.notes.push(nn);
                added++;
                break;
              }
              if (!stemAt(s, Math.min(n.x, X) + 0.3 * d, Math.max(n.x, X) - 0.3 * d, (y + Y) / 2)) continue;
              if (fr(s, X, Y, sg) < 0.85 * F || fr(s, X, Y, -sg) < 0.95 * F)
                continue; /* les deux moitiés pleines : une tête, pas un chiffre */ /* la moitié loin de la hampe doit être pleine aussi (pas un chiffre de doigté) */
              /* la place doit être libre d'une autre lecture plus proche */
              if (
                pg.notes.some(
                  q => q.s === s && q !== n && Math.abs(q.x - X) < 1.0 * d && Math.abs(snapY(s, q.y) - Y) < 0.8 * d
                )
              )
                continue;
              const nn = makeNote(pg, {x: X, y: Y, s, hollow: true});
              nn.hollow = true;
              nn.src = "sec2";
              pg.notes.push(nn);
              added++;
            }
          }
      }
    }
  }
  pg.sus = (pg.sus || [])
    .filter(u => !u.done && !pg.notes.some(n => n.s === u.s && Math.hypot(n.x - u.x, n.y - u.y) < 0.7 * u.s.d))
    .concat(newSus);
  return added;
}

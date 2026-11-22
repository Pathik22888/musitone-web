/* ---------- comptage des temps : barres de mesure, silences, durées ; une mesure qui ne tombe pas juste est signalée ---------- */
function rhythmPrep(pg) {
  pg.rests = [];
  pg.rh = [];
  if (!pg.staves || !pg.staves.length) return;
  const W = pg.W,
    bd = pg.baseData.data,
    P = pg.paper || 235;
  for (const s of pg.staves) {
    const d = s.d,
      ink = Math.min(s.ink == null ? 60 : s.ink, P - 20),
      thr = (P + ink) / 2,
      lw = Math.max(1, s.lw || 2);
    const x0 = Math.max(0, Math.round((s.cx0 || s.x0) - 0.5 * d)),
      x1 = Math.min(W - 1, Math.round(s.x1 + d)),
      y0 = Math.max(0, Math.round(s.top - 4 * d)),
      y1 = Math.min(pg.H - 1, Math.round(s.bot + 4 * d)),
      w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    const M = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = ((y + y0) * W + x + x0) * 4;
        M[y * w + x] = (bd[o] * 77 + bd[o + 1] * 150 + bd[o + 2] * 29) / 256 < thr ? 1 : 0;
      }
    const rows = s.ys.slice();
    for (let q = 1; q <= 3; q++) rows.push(s.top - q * d, s.bot + q * d);
    const D = M.slice();
    for (const r0 of rows) {
      const r = Math.round(r0 - y0);
      for (let x = 0; x < w; x++)
        for (let q = -lw - 1; q <= lw + 1; q++) {
          const y = r + q;
          if (y < 0 || y >= h || !M[y * w + x]) continue;
          let a = y,
            b = y;
          while (a > 0 && M[(a - 1) * w + x]) a--;
          while (b < h - 1 && M[(b + 1) * w + x]) b++;
          if (b - a + 1 <= lw + 2) for (let t = a; t <= b; t++) D[t * w + x] = 0;
          break;
        }
    }
    const st = {s, x0, y0, w, h, M, D, bars: [], dots: [], beams: []};
    pg.rh.push(st);
    /* barres de mesure : encre continue de la 1re à la 5e ligne, étroite, sans tête de note collée */
    const tt = Math.round(s.top - y0),
      bb = Math.round(s.bot - y0);
    const full = x => {
      let k = 0;
      for (let y = tt; y <= bb; y++) {
        if (M[y * w + x] || (x > 0 && M[y * w + x - 1]) || (x < w - 1 && M[y * w + x + 1])) k++;
      }
      return k >= 0.96 * (bb - tt + 1);
    };
    let run = -1;
    const cand = [];
    for (let x = Math.round((s.cx0 || s.x0) + 2 - x0); x < w; x++) {
      if (full(x)) {
        if (run < 0) run = x;
      } else if (run >= 0) {
        cand.push([run, x - 1]);
        run = -1;
      }
    }
    if (run >= 0) cand.push([run, w - 1]);
    for (const [a, b] of cand) {
      if (b - a + 1 > 0.9 * d) continue;
      const X = x0 + (a + b) / 2;
      if (pg.notes.some(n => n.s === s && Math.abs(n.x - X) < 0.8 * d && n.y > s.top - 4 * d && n.y < s.bot + 4 * d))
        continue;
      /* (une hampe qui traverse toute la portée a sa tête tout près : écartée ci-dessus) */
      if (st.bars.length && X - st.bars[st.bars.length - 1] < 1.2 * d) {
        st.bars[st.bars.length - 1] = X;
        continue;
      }
      st.bars.push(X);
    }
    /* composantes hors lignes : silences, points, poutres */
    const {L, comps} = label(D, w, h, 1, true);
    const vrun = c => {
      let m = 0;
      for (let x = c.x0; x <= c.x1; x++) {
        let r = 0;
        for (let y = c.y0; y <= c.y1; y++) {
          if (L[y * w + x] === c.id) {
            r++;
            if (r > m) m = r;
          } else r = 0;
        }
      }
      return m;
    };
    /* part des rangées très étroites (une hampe) */
    const thin = c => {
      let k = 0;
      for (let y = c.y0; y <= c.y1; y++) {
        let n = 0;
        for (let x = c.x0; x <= c.x1; x++) if (L[y * w + x] === c.id) n++;
        if (n <= 0.3 * d) k++;
      }
      return k / (c.y1 - c.y0 + 1);
    };
    const hrun = c => {
      let m = 0;
      for (let y = c.y0; y <= c.y1; y++) {
        let r = 0;
        for (let x = c.x0; x <= c.x1; x++) {
          if (L[y * w + x] === c.id) {
            r++;
            if (r > m) m = r;
          } else r = 0;
        }
      }
      return m;
    };
    const inAcc = (X, Y) =>
      (pg.acc || []).some(
        a => a.s === s && X >= a.box[0] - 2 && X <= a.box[2] + 2 && Y >= a.box[1] - 2 && Y <= a.box[3] + 2
      ) || (s.tsc || []).some(b => X >= b[0] && X <= b[2] && Y >= b[1] && Y <= b[3]);
    for (const c of comps) {
      const cw = (c.x1 - c.x0 + 1) / d,
        ch = (c.y1 - c.y0 + 1) / d,
        dens = c.n / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)),
        X = x0 + (c.x0 + c.x1) / 2,
        Y = y0 + (c.y0 + c.y1) / 2,
        top = y0 + c.y0,
        bot = y0 + c.y1;
      if (X < (s.cx0 || s.x0) + 3 * d || inAcc(X, Y)) continue;
      /* point : petit rond plein */
      if (cw >= 0.2 && cw <= 0.6 && ch >= 0.2 && ch <= 0.6 && dens > 0.55) {
        /* point de durée : dans un interligne (ou juste au-dessus/au-dessous de la portée) */ const q =
            (s.bot - Y) / (d / 2),
          fr = Math.abs(q - Math.round(q));
        if (Y > s.top - 2.2 * d && Y < s.bot + 2.2 * d && Math.round(q) % 2 !== 0 && fr < 0.35) st.dots.push([X, Y]);
        continue;
      }
      /* poutre de croches : trait épais et long */
      if (cw >= 1.6 && ch >= 0.35) {
        const pts = [];
        let tk = 0,
          nn = 0;
        for (let x = c.x0; x <= c.x1; x += 2) {
          let r = 0,
            m = 0,
            end = 0;
          for (let y = c.y0; y <= c.y1; y++) {
            if (L[y * w + x] === c.id) {
              r++;
              if (r > m) {
                m = r;
                end = y;
              }
            } else r = 0;
          }
          if (m) {
            tk += m;
            nn++;
            if (m >= 0.3 * d) pts.push([x, end - m / 2]);
          }
        }
        /* une poutre est épaisse et droite ; une liaison est fine et courbe */
        if (nn && tk / nn >= 0.4 * d && pts.length >= 0.6 * nn) {
          const n0 = pts.length;
          let sx = 0,
            sy = 0,
            sxx = 0,
            sxy = 0;
          for (const [x, y] of pts) {
            sx += x;
            sy += y;
            sxx += x * x;
            sxy += x * y;
          }
          const den = n0 * sxx - sx * sx,
            k = den ? (n0 * sxy - sx * sy) / den : 0,
            b0 = (sy - k * sx) / n0;
          const dev = Math.max(...pts.map(([x, y]) => Math.abs(y - (k * x + b0))));
          if (dev <= 0.3 * d) st.beams.push([x0 + c.x0, top, x0 + c.x1, bot]);
        }
      }
      const hn = pg.notes.filter(
        n => n.s === s && Math.abs(n.x - X) < 0.9 * d && n.y > top - 0.3 * d && n.y < bot + 0.3 * d
      );
      /* pause / demi-pause : pavé plein contre la 4e / 3e ligne */
      if (
        cw >= 0.6 &&
        cw <= 1.9 &&
        ch >= 0.25 &&
        ch <= 1.0 &&
        dens > 0.75 &&
        Y > s.top - 0.5 * d &&
        Y < s.bot + 0.5 * d &&
        !hn.some(n => n.hollow)
      ) {
        const eW = Math.abs(top - s.ys[1]),
          eH = Math.abs(bot - s.ys[2]);
        if (eW < 0.35 * d && eW < eH) {
          pg.rests.push({s, x: X, y: Y, dur: "bar", box: [x0 + c.x0, top, x0 + c.x1, bot]});
          continue;
        }
        if (eH < 0.35 * d) {
          pg.rests.push({s, x: X, y: Y, dur: 2, box: [x0 + c.x0, top, x0 + c.x1, bot]});
          continue;
        }
      }
      /* soupir : zigzag haut et étroit au milieu de la portée, sans trait vertical droit (≠ hampe, dièse, bécarre) */
      if (
        ch >= 2.0 &&
        ch <= 3.6 &&
        cw >= 0.6 &&
        cw <= 1.15 &&
        dens >= 0.3 &&
        dens <= 0.72 &&
        Y > s.top + 0.6 * d &&
        Y < s.bot - 0.6 * d &&
        thin(c) < 0.55 &&
        hrun(c) < 1.2 * d &&
        !pg.notes.some(n => n.s === s && n.x > X + 0.5 * d && n.x < X + 1.7 * d) &&
        !pg.notes.some(n => n.s === s && n.hollow && Math.abs(n.x - X) < d && n.y > top && n.y < bot)
      ) {
        pg.rests.push({s, x: X, y: Y, dur: 1, box: [x0 + c.x0, top, x0 + c.x1, bot]});
        continue;
      }
      /* demi-soupir : crochet + trait oblique, plus court */
      if (
        ch >= 1.3 &&
        ch < 2.0 &&
        cw >= 0.5 &&
        cw <= 1.25 &&
        dens >= 0.15 &&
        dens <= 0.55 &&
        Y > s.top + 0.3 * d &&
        Y < s.bot - 0.3 * d &&
        vrun(c) < 0.6 * (c.y1 - c.y0 + 1) &&
        !hn.length
      ) {
        /* le crochet (pâté) est en haut à gauche */ let tl = 0,
          tr = 0;
        const mx = (c.x0 + c.x1) / 2,
          my = c.y0 + (c.y1 - c.y0) * 0.4;
        for (let y = c.y0; y <= my; y++)
          for (let x = c.x0; x <= c.x1; x++)
            if (L[y * w + x] === c.id) {
              if (x < mx) tl++;
              else tr++;
            }
        if (tl > tr * 0.9) pg.rests.push({s, x: X, y: Y, dur: 0.5, box: [x0 + c.x0, top, x0 + c.x1, bot]});
      }
    }
  }
  /* une « note » posée sur un silence n'en est pas une */
  const rm = pg.notes.filter(
    n =>
      !n.man &&
      pg.rests.some(
        r =>
          r.s === n.s &&
          (r.dur === 1 || r.dur === 0.5 || !n.hollow) &&
          n.x >= r.box[0] - 0.2 * r.s.d &&
          n.x <= r.box[2] + 0.2 * r.s.d &&
          n.y >= r.box[1] - 0.2 * r.s.d &&
          n.y <= r.box[3] + 0.2 * r.s.d
      )
  );
  if (rm.length) pg.notes = pg.notes.filter(n => !rm.includes(n));
  pg.restRm = rm.length;
}
function stemTip(st, n) {
  if (n._tip !== undefined) return n._tip;
  const s = n.s,
    d = s.d,
    {x0, y0, w, h, M} = st;
  const m = (x, y) => {
    x = Math.round(x - x0);
    y = Math.round(y - y0);
    return x >= 0 && y >= 0 && x < w && y < h && M[y * w + x];
  };
  let stem = 0,
    tip = null;
  for (const sx of [-1, 1])
    for (let k = 0.45; k <= 0.8; k += 0.05) {
      const X = n.x + sx * k * d;
      for (const sg of [-1, 1]) {
        let len = 0,
          gap = 0;
        while (len < 5 * d) {
          const Y = n.y + sg * (len + 1);
          if (m(X, Y) || m(X + 1, Y)) {
            len++;
            gap = 0;
          } else if (gap < 1) {
            gap++;
            len++;
          } else break;
        }
        if (len >= 2.2 * d && len > stem) {
          stem = len;
          tip = [X, n.y + sg * len, sg];
        }
      }
    }
  n._tip = tip;
  return tip;
}
/* durée d'une note : noire 1, blanche 2, ronde 4, croche ½ (reliée par une poutre à une voisine), ×1,5 si pointée */
function noteDur(pg, st, n) {
  const s = n.s,
    d = s.d,
    {x0, y0, w, h, M} = st;
  const m = (x, y) => {
    x = Math.round(x - x0);
    y = Math.round(y - y0);
    return x >= 0 && y >= 0 && x < w && y < h && M[y * w + x];
  };
  const tip = stemTip(st, n);
  let v = n.hollow ? (n.ronde != null ? (n.ronde ? 4 : 2) : tip ? 2 : 4) : 1;
  if (!n.hollow && tip) {
    /* poutre : bande épaisse continue d'un bout de hampe à celui d'une note voisine */
    const beamTo = q => {
      const t2 = stemTip(st, q);
      if (!t2 || t2[2] !== tip[2]) return false;
      const xa = Math.min(tip[0], t2[0]),
        xb = Math.max(tip[0], t2[0]);
      if (xb - xa < 0.8 * d) return false;
      let ok = 0,
        t = 0;
      for (let x = xa + 0.25 * d; x <= xb - 0.25 * d; x += Math.max(1, 0.25 * d)) {
        t++;
        const yc = tip[1] + ((t2[1] - tip[1]) * (x - tip[0])) / (t2[0] - tip[0] || 1);
        let r = 0,
          mr = 0;
        for (let y = Math.round(yc - 0.9 * d); y <= yc + 0.9 * d; y++) {
          if (m(x, y)) {
            r++;
            mr = Math.max(mr, r);
          } else r = 0;
        }
        if (mr >= 0.35 * d) ok++;
      }
      return t > 0 && ok >= 0.85 * t;
    };
    if (
      pg.notes.some(
        q =>
          q !== n &&
          q.s === s &&
          !q.hollow &&
          Math.abs(q.x - n.x) >= 0.9 * d &&
          Math.abs(q.x - n.x) <= 7 * d &&
          beamTo(q)
      )
    )
      v = 0.5;
  }
  /* (les crochets de croches isolées ne sont pas lus : trop de confusions avec les liaisons ; voir la garde plus bas) */
  /* point : petit disque noir isolé à droite de la tête, dans l'interligne */
  {
    const q = Math.round((s.bot - n.y) / (d / 2)),
      ys = (q % 2 ? [n.y] : [n.y - d / 2, n.y + d / 2]).flatMap(y => [y, y - 0.2 * d, y + 0.2 * d]),
      lw = Math.max(1, s.lw || 2),
      onL = y => s.ys.some(v => Math.abs(v - y) <= lw);
    let dot = false;
    for (const Y of ys) {
      if (dot) break;
      for (let X = n.x + 0.85 * d; X <= n.x + 1.8 * d && !dot; X += Math.max(1, 0.08 * d)) {
        if (pg.notes.some(o => o !== n && o.s === s && Math.abs(o.x - X) < 0.8 * d && Math.abs(o.y - Y) < 0.7 * d))
          continue;
        if (
          pg.rests.some(
            r =>
              r.s === s &&
              X >= r.box[0] - 0.4 * d &&
              X <= r.box[2] + 0.4 * d &&
              Y >= r.box[1] - 0.4 * d &&
              Y <= r.box[3] + 0.4 * d
          ) ||
          (pg.acc || []).some(
            r =>
              r.s === s &&
              X >= r.box[0] - 0.3 * d &&
              X <= r.box[2] + 0.3 * d &&
              Y >= r.box[1] - 0.3 * d &&
              Y <= r.box[3] + 0.3 * d
          )
        )
          continue;
        let k = 0,
          t = 0;
        const r = 0.2 * d;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            t++;
            if (m(X + dx, Y + dy)) k++;
          }
        if (k < 0.8 * t) continue;
        {
          let k2 = 0,
            t3 = 0;
          const r2 = 0.26 * d;
          for (let dy = -r2; dy <= r2; dy++)
            for (let dx = -r2; dx <= r2; dx++) {
              if (dx * dx + dy * dy > r2 * r2) continue;
              t3++;
              if (m(X + dx, Y + dy)) k2++;
            }
          if (k2 < 0.62 * t3) continue;
        }
        /* isolé : couronne autour presque blanche (hors lignes de portée) */ let a2 = 0,
          t2 = 0;
        for (let dy = -0.5 * d; dy <= 0.5 * d; dy++)
          for (let dx = -0.5 * d; dx <= 0.5 * d; dx++) {
            const rr = dx * dx + dy * dy;
            if (rr < (0.32 * d) ** 2 || rr > (0.5 * d) ** 2 || onL(Y + dy)) continue;
            t2++;
            if (m(X + dx, Y + dy)) a2++;
          }
        if (t2 && a2 < 0.32 * t2) dot = true;
      }
    }
    if (dot) v *= 1.5;
  }
  return v;
}
function rhythmCheck(pg) {
  pg.badMeas = [];
  if (!pg.rh || !pg.rh.length) return;
  const meas = [];
  /* 1er passage : une « noire » seule dans sa mesure, sans hampe, sur une mesure à silence = une pause mal lue */
  if (!pg.rhFirst) {
    pg.rhFirst = true;
    const rm = [];
    for (const st of pg.rh) {
      const s = st.s,
        xs = [s.cx0 || s.x0].concat(st.bars, [s.x1]);
      for (let i = 0; i + 1 < xs.length; i++) {
        const ns = pg.notes.filter(n => n.s === s && n.x > xs[i] && n.x < xs[i + 1]);
        if (
          ns.length === 1 &&
          !ns[0].hollow &&
          (Math.abs(ns[0].y - s.ys[1] - 0.25 * s.d) < 0.5 * s.d ||
            Math.abs(ns[0].y - s.ys[2] + 0.25 * s.d) < 0.5 * s.d) &&
          !stemTip(st, ns[0]) &&
          !pg.rests.some(r => r.s === s && r.x > xs[i] && r.x < xs[i + 1])
        )
          rm.push(ns[0]);
      }
    }
    if (rm.length) {
      pg.notes = pg.notes.filter(n => !rm.includes(n));
      pg.restRm = (pg.restRm || 0) + rm.length;
      for (const n of rm)
        pg.rests.push({
          s: n.s,
          x: n.x,
          y: n.y,
          dur: "bar",
          box: n.box || [n.x - n.s.d / 2, n.y - n.s.d / 4, n.x + n.s.d / 2, n.y + n.s.d / 4]
        });
    }
  }
  pg.rh.forEach((st, si) => {
    const s = st.s,
      d = s.d,
      xs = [s.cx0 || s.x0].concat(st.bars);
    if (s.x1 - xs[xs.length - 1] > 2 * d) xs.push(s.x1);
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i],
        b = xs[i + 1],
        ns = pg.notes.filter(n => n.s === s && n.x > a && n.x < b).sort((p, q) => p.x - q.x),
        rs = pg.rests.filter(r => r.s === s && r.x > a && r.x < b);
      if (!ns.length && !rs.length) continue;
      /* accords et secondes : une seule « frappe » */
      const slots = [];
      for (const n of ns) {
        const sl = slots.find(t =>
          t.some(
            q => Math.abs(q.x - n.x) < 0.7 * d || (Math.abs(q.x - n.x) < 1.45 * d && Math.abs(q.y - n.y) < 0.8 * d)
          )
        );
        if (sl) sl.push(n);
        else slots.push([n]);
      }
      let tot = 0,
        mixed = false,
        bar = false;
      for (const sl of slots) {
        const ds = sl.map(n => noteDur(pg, st, n));
        if (Math.max(...ds) !== Math.min(...ds)) mixed = true;
        tot += Math.max(...ds);
      }
      for (const r of rs) {
        if (r.dur === "bar") bar = true;
        else tot += r.dur;
      }
      const det = slots
        .map(sl => [Math.round(sl[0].x), sl.length, sl.map(n => noteDur(pg, st, n)).join("/")])
        .concat(rs.map(r => ["R", Math.round(r.x), r.dur]));
      meas.push({det, s, si, a, b, tot, mixed, bar: bar && !ns.length && rs.length === 1, i, n: xs.length - 1});
    }
  });
  const cnt = {};
  for (const m of meas) if (!m.mixed && !m.bar) cnt[m.tot] = (cnt[m.tot] || 0) + 1;
  const ks = Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p]);
  if (!ks.length) return;
  const exp = +ks[0];
  if (cnt[ks[0]] < 3 || cnt[ks[0]] < 0.4 * meas.length) return; /* pas de mesure type claire : on ne signale rien */
  pg.measExp = exp;
  const lastS = Math.max(...meas.map(m => m.si));
  /* barre de mesure manquée ou en trop : deux mesures voisines qui font ensemble le compte (ou le double) sont acceptées */
  for (let i = 0; i < meas.length; i++) {
    const m = meas[i];
    if (m.tot === exp || m.bar || m.mixed) continue;
    if (m.tot === 2 * exp) {
      m.ok = true;
      continue;
    }
    for (const j of [i - 1, i + 1]) {
      const o = meas[j];
      if (!o || o.s !== m.s || o.tot === exp) continue;
      if (o.tot + m.tot === exp) {
        m.ok = o.ok = true;
      }
    }
  }
  for (const m of meas) {
    if (m.bar || m.mixed || m.tot === exp || m.ok) continue;
    /* levée (début) ou mesure finale incomplète : tolérée si plus courte */
    if (m.tot < exp && ((m.si <= 1 && m.i === 0) || (m.si >= lastS - 1 && m.i === m.n - 1))) continue;
    pg.badMeas.push(m);
  }
  /* trop de mesures « fausses » : c'est notre lecture des durées qui ne suit pas (croches à crochet, plusieurs voix…) → on ne signale rien */
  if (pg.badMeas.length > Math.max(2, 0.2 * meas.length)) {
    pg.badMeas = [];
    pg.measOff = true;
  } else pg.measOff = false;
  /* 1re fois : une mesure à qui il manque des temps → on cherche une hampe orpheline (sans tête lue) et on regarde sa tête */
  if (!pg.rhFill && pg.badMeas.length) {
    pg.rhFill = true;
    let add = 0;
    for (const m of pg.badMeas) {
      if (m.tot >= exp) continue;
      const st = pg.rh[m.si];
      add += fillShort(pg, st, m, exp - m.tot);
    }
    if (add) {
      pg.rhAdded = add;
      rhythmCheck(pg);
    }
  }
}
function fillShort(pg, st, m, need) {
  const s = st.s,
    d = s.d,
    {x0, y0, w, h, M} = st;
  const mm = (x, y) => {
    x = Math.round(x - x0);
    y = Math.round(y - y0);
    return x >= 0 && y >= 0 && x < w && y < h && M[y * w + x];
  };
  const lw = Math.max(1, s.lw || 2),
    cands = [];
  for (let X = Math.round(m.a + 0.8 * d); X < m.b - 0.8 * d; X++) {
    if (st.bars.some(b => Math.abs(b - X) < 1.2 * d)) continue;
    /* trait vertical fin le plus long passant par la portée */ let best = null;
    for (let Y = Math.round(s.top - 3 * d); Y <= s.bot + 3 * d; Y++) {
      if (!mm(X, Y)) continue;
      let e = Y;
      while (e < s.bot + 5 * d && (mm(X, e + 1) || mm(X, e + 2))) e++;
      const len = e - Y;
      if (len >= 2.6 * d && (!best || len > best[1] - best[0])) {
        /* fin : pas plus large que 0,3 interligne au milieu */ const ym = Math.round((Y + e) / 2);
        let a = X,
          b = X;
        while (a > X - d && mm(a - 1, ym)) a--;
        while (b < X + d && mm(b + 1, ym)) b++;
        if (b - a + 1 <= 0.3 * d) best = [Y, e];
      }
      Y = e;
    }
    if (!best) continue;
    if (cands.length && X - cands[cands.length - 1].X < 0.5 * d) continue;
    cands.push({X, top: best[0], bot: best[1]});
  }
  const onL0 = yy =>
      s.ys.concat([1, 2, 3].flatMap(q => [s.top - q * d, s.bot + q * d])).some(v => Math.abs(v - yy) <= lw),
    avg = a => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
  const ctrOf = (hx, y) => {
    let c = 0,
      t = 0;
    for (let dy = -0.5 * d; dy <= 0.5 * d; dy++)
      for (let dx = -0.7 * d; dx <= 0.7 * d; dx++) {
        const e = (dx / (0.66 * d)) ** 2 + (dy / (0.46 * d)) ** 2;
        if (e > 0.45 || onL0(y + dy)) continue;
        t++;
        if (mm(hx + dx, y + dy)) c++;
      }
    return t ? c / t : 0;
  };
  /* une blanche lue comme une noire : si basculer UNE seule note en blanche fait tomber le compte juste, on le fait */
  {
    const ns = pg.notes.filter(n => n.s === s && n.x > m.a && n.x < m.b && !n.hollow);
    const ok = ns.filter(n => {
      const t = Object.assign({}, n, {hollow: true});
      return (
        Math.abs(noteDur(pg, st, t) - noteDur(pg, st, n) - need) < 1e-6 &&
        !ns.some(q => q !== n && Math.abs(q.x - n.x) < 0.7 * d)
      );
    });
    if (ok.length === 1) {
      ok[0].hollow = true;
      ok[0].src = (ok[0].src || "") + "+temps";
      return 1;
    }
  }
  let added = 0,
    left = need;
  for (const c of cands) {
    if (left <= 0) break;
    /* tête en bas à gauche (hampe montante) ou en haut à droite (hampe descendante) */
    for (const [hx, hy] of [
      [c.X - 0.6 * d, c.bot - 0.3 * d],
      [c.X + 0.6 * d, c.top + 0.3 * d]
    ]) {
      const y = snapY(s, hy);
      if (pg.notes.some(n => n.s === s && Math.abs(n.x - hx) < 1.0 * d && Math.abs(n.y - y) < 1.2 * d)) continue;
      /* anneau d'encre autour, centre clair ou sombre (hors lignes) */ let ring = 0,
        rt = 0,
        ctr = 0,
        ct = 0;
      const onL = yy =>
        s.ys.concat([1, 2, 3].flatMap(q => [s.top - q * d, s.bot + q * d])).some(v => Math.abs(v - yy) <= lw);
      for (let dy = -0.5 * d; dy <= 0.5 * d; dy++)
        for (let dx = -0.7 * d; dx <= 0.7 * d; dx++) {
          const e = (dx / (0.66 * d)) ** 2 + (dy / (0.46 * d)) ** 2;
          if (e > 1 || onL(y + dy)) continue;
          if (e > 0.45) {
            rt++;
            if (mm(hx + dx, y + dy)) ring++;
          } else {
            ct++;
            if (mm(hx + dx, y + dy)) ctr++;
          }
        }
      if (!rt || !ct || ring / rt < 0.45) continue;
      /* noire ou blanche : on compare le centre à celui des notes déjà lues sur la page */
      const cf = pg.notes
          .filter(n => n.s.d === d || Math.abs(n.s.d - d) < 0.15 * d)
          .map(n => [n.hollow, ctrOf(n.x, snapY(n.s, n.y))]),
        mf = avg(cf.filter(q => !q[0]).map(q => q[1])),
        mh = avg(cf.filter(q => q[0]).map(q => q[1]));
      const cv = ctr / ct,
        hol = mh != null && mf != null ? Math.abs(cv - mh) < Math.abs(cv - mf) : cv < 0.45,
        dur = hol ? 2 : 1;
      if (dur > left) continue;
      const n = makeNote(pg, {x: hx, y, s, hollow: hol});
      n.hollow = hol;
      n.src = "temps";
      pg.notes.push(n);
      added++;
      left -= dur;
      break;
    }
  }
  return added;
}

/* ---------- dièses, bémols, bécarres : même couleur que la note qu'ils modifient ---------- */
function findAcc(pg) {
  const out = [];
  if (!pg.staves || !pg.staves.length) return out;
  const W = pg.W,
    bd = pg.baseData.data,
    P = pg.paper || 235;
  for (const s of pg.staves) {
    const d = s.d,
      ink = Math.min(s.ink == null ? 60 : s.ink, P - 20),
      thr = (P + ink) / 2,
      lw = Math.max(1, s.lw || 2);
    const x0 = Math.max(0, Math.round(s.x0 - d)),
      x1 = Math.min(W - 1, Math.round(s.x1)),
      y0 = Math.max(0, Math.round(s.top - 3.5 * d)),
      y1 = Math.min(pg.H - 1, Math.round(s.bot + 3.5 * d)),
      w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    const M = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = ((y + y0) * W + x + x0) * 4;
        M[y * w + x] = (bd[o] * 77 + bd[o + 1] * 150 + bd[o + 2] * 29) / 256 < thr ? 1 : 0;
      }
    /* on retire les lignes de portée (et les petites lignes) : runs verticaux courts sur ces rangées */
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
    const {L, comps} = label(D, w, h, 1, true);
    /* altérations d'armure collées entre elles ou à la clé par un bout de ligne épaisse : on coupe aux colonnes presque vides */
    {
      let nid = comps.reduce((m, c) => Math.max(m, c.id), 0) + 1;
      const fx0 = pg.notes.filter(n => n.s === s).reduce((m, n) => Math.min(m, n.x), 1e9) - x0;
      for (const c of comps.slice()) {
        const cw = c.x1 - c.x0 + 1,
          ch = c.y1 - c.y0 + 1;
        if (cw < 1.5 * d || cw > 6 * d || ch < 2 * d || ch > 4.8 * d || c.x1 > fx0) continue;
        const cnt = [];
        for (let x = c.x0; x <= c.x1; x++) {
          let k = 0;
          for (let y = c.y0; y <= c.y1; y++) if (L[y * w + x] === c.id) k++;
          cnt.push(k);
        }
        const mx = Math.max(...cnt),
          t = Math.max(2 * lw + 2, 0.22 * mx),
          segs = [];
        cnt.forEach((v, i) => {
          if (v > t) {
            if (segs.length && i - segs[segs.length - 1].e === 1) segs[segs.length - 1].e = i;
            else segs.push({b: i, e: i});
          }
        });
        if (segs.length < 2) continue;
        const ps = segs.map((g, q) => ({id: q ? nid++ : c.id, x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0, g}));
        for (let y = c.y0; y <= c.y1; y++)
          for (let x = c.x0; x <= c.x1; x++) {
            const k = y * w + x;
            if (L[k] !== c.id) continue;
            const i = x - c.x0,
              p = ps.find(p => i >= p.g.b && i <= p.g.e);
            if (!p) {
              L[k] = 0;
              continue;
            }
            L[k] = p.id;
            p.n++;
            p.x0 = Math.min(p.x0, x);
            p.x1 = Math.max(p.x1, x);
            p.y0 = Math.min(p.y0, y);
            p.y1 = Math.max(p.y1, y);
          }
        ps.forEach((p, q) => {
          if (!p.n) return;
          const o = {id: p.id, n: p.n, x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, cut: c.id};
          if (!q) Object.assign(c, o);
          else comps.push(Object.assign({}, c, o));
        });
      }
    }
    const notes = pg.notes.filter(n => n.s === s),
      fx = notes.length ? Math.min(...notes.map(n => n.x)) : 1e9;
    /* morceaux d'un même signe coupés par les lignes de portée : on les réunit */
    const small = comps.filter(c => c.x1 - c.x0 < 1.5 * d && c.y1 - c.y0 < 3.7 * d),
      par = new Map(small.map(c => [c.id, c.id])),
      fnd = i => {
        while (par.get(i) !== i) i = par.get(i);
        return i;
      };
    for (let i = 0; i < small.length; i++)
      for (let j = i + 1; j < small.length; j++) {
        const a = small[i],
          b = small[j],
          g = Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
        if (g > lw + 2 || (a.cut && a.cut === b.cut)) continue;
        const ux0 = Math.min(a.x0, b.x0),
          ux1 = Math.max(a.x1, b.x1),
          uy0 = Math.min(a.y0, b.y0),
          uy1 = Math.max(a.y1, b.y1);
        if (ux1 - ux0 > 1.45 * d || uy1 - uy0 > 3.6 * d) continue;
        par.set(fnd(a.id), fnd(b.id));
      }
    const U = new Map();
    for (const c of small) {
      const r = fnd(c.id);
      if (!U.has(r)) U.set(r, {ids: new Set(), n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1});
      const u = U.get(r);
      u.ids.add(c.id);
      u.n += c.n;
      u.x0 = Math.min(u.x0, c.x0);
      u.y0 = Math.min(u.y0, c.y0);
      u.x1 = Math.max(u.x1, c.x1);
      u.y1 = Math.max(u.y1, c.y1);
    }
    for (const c of U.values()) {
      const cw = c.x1 - c.x0 + 1,
        ch = c.y1 - c.y0 + 1,
        X0 = c.x0 + x0,
        X1 = c.x1 + x0,
        Y0 = c.y0 + y0,
        Y1 = c.y1 + y0,
        IN = k => c.ids.has(L[k]);
      if (ch < 1.5 * d || ch > 3.6 * d || cw < 0.4 * d || cw > 1.45 * d) continue;
      const dens = c.n / (cw * ch);
      if (dens < 0.12 || dens > 0.62) continue;
      if (notes.some(n => n.x > X0 - 0.3 * d && n.x < X1 + 0.3 * d && n.y > Y0 && n.y < Y1)) continue;
      if ((s.clefs || []).some(k => k.box && X1 >= k.box[0] && X0 <= k.box[2])) continue;
      if ((s.excl || []).some(b => X1 >= b[0] && X0 <= b[2] && Y1 >= b[1] && Y0 <= b[3])) continue;
      if (X0 < (s.cx0 || s.x0) + (s.c0 === "F" ? 1.2 : 2.0) * d) continue;
      /* signe plus proche d'une autre portée (clé ou armure de la portée voisine) : pas pour celle-ci */
      {
        const yc = (Y0 + Y1) / 2,
          dist = t => (yc < t.top ? t.top - yc : yc > t.bot ? yc - t.bot : 0),
          me = dist(s);
        if (pg.staves.some(t => t !== s && X0 >= t.x0 - d && X0 <= t.x1 && dist(t) < me)) continue;
      }
      /* traits verticaux longs : 2 pour ♯ et ♮, 1 à gauche pour ♭ */
      const col = [];
      for (let x = c.x0; x <= c.x1; x++) {
        let run = 0,
          best = 0;
        for (let y = c.y0; y <= c.y1; y++) {
          if (IN(y * w + x) || (M[y * w + x] && run > 0)) {
            run++;
            if (run > best) best = run;
          } else run = 0;
        }
        col.push(best);
      }
      const grp = [];
      col.forEach((v, i) => {
        if (v >= 1.25 * d) {
          if (grp.length && i - grp[grp.length - 1].e <= 1) grp[grp.length - 1].e = i;
          else grp.push({b: i, e: i});
        }
      });
      let type = null;
      const gmax = g => Math.max(...col.slice(g.b, g.e + 1));
      if (
        grp.length === 2 &&
        grp[1].b - grp[0].e >= 0.15 * d &&
        Math.min(gmax(grp[0]), gmax(grp[1])) >= 0.72 * Math.max(gmax(grp[0]), gmax(grp[1]))
      )
        type = "sn";
      else if (grp.length === 2 && gmax(grp[0]) > gmax(grp[1]) && ch <= 3 * d) grp.splice(1, 1);
      else if (grp.length === 1 && (grp[0].b + grp[0].e) / 2 < 0.4 * cw && ch <= 3 * d) {
        /* bémol : la panse est en bas */
        const wr = y => {
          let a = -1,
            b = -1;
          for (let x = c.x0; x <= c.x1; x++)
            if (IN(y * w + x)) {
              if (a < 0) a = x;
              b = x;
            }
          return a < 0 ? 0 : b - a + 1;
        };
        let top = 0,
          bot = 0;
        for (let y = c.y0; y < c.y0 + ch * 0.4; y++) top += wr(y);
        for (let y = Math.round(c.y1 - ch * 0.4); y <= c.y1; y++) bot += wr(y);
        if (bot > 1.6 * top) type = "b";
      }
      if (!type && grp.length >= 1 && grp.length <= 2) type = "?";
      if (!type) continue;
      let cy = (Y0 + Y1) / 2;
      if (type === "b") {
        /* centre de la panse : rangées larges du bas */ let sw = 0,
          sy = 0;
        for (let y = Math.round(c.y0 + ch * 0.45); y <= c.y1; y++) {
          let a = -1,
            b = -1;
          for (let x = c.x0; x <= c.x1; x++)
            if (IN(y * w + x)) {
              if (a < 0) a = x;
              b = x;
            }
          const wd = a < 0 ? 0 : b - a + 1;
          if (wd > 0.45 * cw) {
            sw += wd;
            sy += wd * y;
          }
        }
        cy = (sw ? sy / sw : c.y1 - 0.5 * d) + y0;
      }
      /* rattaché à la note qui suit, sinon armure (début de portée) */
      let nt = null,
        bdist = 1e9;
      for (const n of notes) {
        const dx = n.x - X1;
        if (dx < 0.1 * d || dx > 2.2 * d) continue;
        if (Math.abs(n.y - cy) > 0.35 * d) continue;
        if (dx < bdist) {
          bdist = dx;
          nt = n;
        }
      }
      if (!nt && !(X1 < fx - 0.3 * d)) continue;
      if (type === "?" && nt) continue;
      const px = [];
      for (let y = Math.max(0, c.y0 - 2); y <= Math.min(h - 1, c.y1 + 2); y++)
        for (let x = Math.max(0, c.x0 - 2); x <= Math.min(w - 1, c.x1 + 2); x++) {
          if (!M[y * w + x]) continue;
          let ok = false;
          for (let q = -2; q <= 2 && !ok; q++)
            for (let r = -2; r <= 2; r++) {
              const yy = y + q,
                xx = x + r;
              if (yy >= 0 && yy < h && xx >= 0 && xx < w && IN(yy * w + xx)) {
                ok = true;
                break;
              }
            }
          if (ok) px.push((y + y0) * W + x + x0);
        }
      out.push({
        s,
        note: nt,
        y: snapY(s, cy),
        x: (X0 + X1) / 2,
        type,
        px: Int32Array.from(px),
        box: [X0, Y0, X1, Y1]
      });
    }
  }
  /* armure : l'ordre des altérations est toujours le même (♭ : Si Mi La Ré Sol Do Fa ; ♯ : Fa Do Sol Ré La Mi Si).
   On s'appuie sur cet ordre plutôt que sur la hauteur mesurée, peu précise sur une petite image. */
  for (const s of pg.staves) {
    const ks = out.filter(a => a.s === s && !a.note).sort((a, b) => a.x - b.x);
    if (!ks.length) continue;
    const hh = a => a.box[3] - a.box[1],
      typed = ks.filter(a => a.type !== "?");
    if (!typed.length) {
      ks.forEach(a => (a.skip = true));
      continue;
    }
    const t0 = typed[0],
      grp = [t0];
    for (let i = ks.indexOf(t0) + 1; i < ks.length; i++) {
      const a = ks[i];
      if (a.x - grp[grp.length - 1].x > 1.6 * s.d) break;
      if (a.type === "?" && Math.abs(hh(a) - hh(t0)) > 0.45 * s.d) break;
      grp.push(a);
    }
    for (const a of ks) if (!grp.includes(a)) a.skip = true;
    const nb = grp.filter(a => a.type === "b").length,
      isFlat = nb * 2 > grp.length || (nb * 2 === grp.length && grp[0].type === "b");
    grp.forEach(a => (a.type = isFlat ? "b" : "sn"));
    const seq = isFlat ? [6, 2, 5, 1, 4, 0, 3] : [3, 0, 4, 1, 5, 2, 6];
    grp.forEach((a, i) => {
      if (i < 7) a.L = seq[i];
    });
  }
  return out;
}

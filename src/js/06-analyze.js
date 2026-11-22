async function analyze(pg) {
  const {cv, W, H} = pg,
    ctx = cv.getContext("2d");
  let g = gray(ctx, W, H),
    {B, M, B2} = binarize(g, W, H);
  if (pg.angle == null) {
    pg.angle = skew(B, W, H);
    if (Math.abs(pg.angle) < 0.15) pg.angle = 0;
    if (pg.angle) {
      rotateCanvas(pg);
      g = gray(ctx, W, H);
      ({B, M, B2} = binarize(g, W, H));
    }
  }
  if (pg.ks === undefined) {
    pg.ks = keystone(B, W, H);
    if (pg.ks) {
      applyKS(pg);
      g = gray(ctx, W, H);
      ({B, M, B2} = binarize(g, W, H));
    }
  }
  await tick();
  const {lt, sp} = runStats(B, W, H);
  if (pg.up == null) {
    const st0 = findStaves(B2, W, H, lt, sp, g);
    const ds = st0.map(q => q.d).sort((a, b) => a - b),
      dm = ds.length ? ds[ds.length >> 1] : 0,
      d0 = dm && Math.abs(Math.log((lt + sp) / dm)) > 0.4 ? dm : lt + sp;
    let k = d0 < 12.5 || d0 > 20 ? Math.max(0.3, Math.min(3, 15 / d0)) : 1;
    if (!ds.length && (Math.abs(k - 1) <= 0.15 || k < 1)) k = 2;
    k = Math.min(k, Math.sqrt(MAXPX / (W * H)));
    pg.up = 1;
    if (Math.abs(k - 1) > 0.15) {
      pg.up = k;
      pg.cv = null;
      pg.baseData = null;
      await ensureBase(pg);
      return analyze(pg);
    }
  }
  if (pg.dw === undefined) {
    pg.dw = null;
    let w = null;
    try {
      w = estimateWarp(B, W, H, lt, sp);
    } catch (e) {
      console.error(e);
    }
    /* qualité de la lecture actuelle : les 5 lignes de chaque portée sont-elles bien sous la grille, d'un bout à l'autre ? */
    if (w) {
      const st = findStaves(B2, W, H, lt, sp, g);
      let hit = 0,
        tot = 0;
      const r = Math.max(1, lt);
      for (const q of st)
        for (let x = Math.round(q.x0 + q.d); x < q.x1 - q.d; x += 3)
          for (const y0 of q.ys) {
            tot++;
            const yc = Math.round(y0);
            for (let k = -r; k <= r; k++) {
              const y = yc + k;
              if (y >= 0 && y < H && B[y * W + x]) {
                hit++;
                break;
              }
            }
          }
      const cov = tot ? hit / tot : 0;
      w.cov = cov;
      w.ns = st.length;
      /* lecture déjà bonne et courbure modérée : on garde l'image telle quelle (le redressement la rééchantillonne) */
      if (cov >= 0.96 && w.med < 0.6 * sp) w = null;
    }
    if (w) {
      w.W0 = W;
      pg.dw = w;
      pg.cv = null;
      pg.baseData = null;
      await ensureBase(pg);
      return analyze(pg);
    }
  }
  let staves = findStaves(B2, W, H, lt, sp, g);
  /* portées placées à la main (« Ajuster les portées ») : on les prend telles quelles */
  if (pg.forceStaves && pg.forceStaves.list.length) {
    const f = W / pg.forceStaves.W,
      th0 = staves.length
        ? staves.map(q => q.th).sort((a, b) => a - b)[staves.length >> 1]
        : Math.max(1, Math.round(lt));
    staves = pg.forceStaves.list
      .map(q => {
        const top = q.top * f,
          bot = q.bot * f,
          d = (bot - top) / 4;
        return {
          ys: [0, 1, 2, 3, 4].map(i => top + i * d),
          top,
          bot,
          d,
          x0: q.x0 * f,
          x1: q.x1 * f,
          th: th0,
          forced: true
        };
      })
      .sort((a, b) => a.top - b.top);
  }
  /* une ligne supplémentaire (petites lignes répétées sur toute la mesure) peut être prise pour la 1re ligne :
   on vérifie que les 5 lignes retenues sont bien les plus continues, sinon on décale la portée d'une ligne */
  if (!pg.forceStaves) {
    const cov = (q, y) => {
      let k = 0,
        t = 0;
      const yy = Math.round(y);
      for (let x = Math.round(q.x0); x <= q.x1; x += 2) {
        t++;
        for (let r = -1; r <= 1; r++) {
          const Y = yy + r;
          if (Y >= 0 && Y < H && B[Y * W + x]) {
            k++;
            break;
          }
        }
      }
      return t ? k / t : 0;
    };
    for (const q of staves) {
      for (let it = 0; it < 2; it++) {
        const d = q.d,
          cT = cov(q, q.top),
          cB = cov(q, q.bot),
          cU = cov(q, q.top - d),
          cD = cov(q, q.bot + d);
        let sh = 0;
        if (cD > 0.85 && cT < 0.75 * cD && cD > cT + 0.15) sh = 1;
        else if (cU > 0.85 && cB < 0.75 * cU && cU > cB + 0.15) sh = -1;
        if (!sh) break;
        q.ys = q.ys.map(y => y + sh * d);
        q.top += sh * d;
        q.bot += sh * d;
        if (q.mid != null) q.mid += sh * d;
      }
    }
  }
  /* portées trop courtes par rapport aux autres (dessin, illustration) : on les écarte */
  if (staves.length >= 3) {
    const ws = staves.map(q => q.x1 - q.x0).sort((a, b) => a - b),
      mw = ws[ws.length >> 1];
    staves = staves.filter(
      q => q.x1 - q.x0 >= 0.5 * mw || staves.some(o => o !== q && Math.abs(o.top - q.top) < 14 * q.d)
    );
  }
  if (pg.ks2 === undefined && staves.length) {
    const A = staffAngles(B, W, H, staves);
    pg.ks2 = null;
    if (A.length && A.some(q => Math.abs(q.a) > 0.12)) {
      pg.ks2 = A;
      pg.ks2old = staves.map(q => (q.top + q.bot) / 2);
      pg.ks2try = 0;
      applyKS2(pg);
      return analyze(pg);
    }
  } else if (pg.ks2 && pg.ks2old) {
    /* la correction ne doit faire perdre aucune portée ; sinon on retire le point fautif, puis on abandonne */
    const lost = pg.ks2old.filter(y => !staves.some(q => Math.abs((q.top + q.bot) / 2 - y) < 3 * q.d));
    if (lost.length) {
      pg.ks2try++;
      const keep = pg.ks2.filter(p => !lost.some(y => Math.abs(p.y - y) < 60));
      pg.ks2 = pg.ks2try < 2 && keep.length && keep.some(q => Math.abs(q.a) > 0.12) ? keep : null;
      if (!pg.ks2) pg.ks2old = null;
      pg.cv = null;
      pg.baseData = null;
      await ensureBase(pg);
      return analyze(pg);
    }
    pg.ks2old = null;
  }
  /* photo prise de côté ou à l'envers : aucune portée lue → on tourne d'un quart de tour ; portées lues mais clés à droite → demi-tour */
  if (pg.kind === "img" && pg.img && !pg.forceStaves && (pg.autoRot || 0) < 2) {
    let rot = 0;
    if (!staves.length && !pg.autoRot) rot = -90;
    else if (staves.length && !pg.flipChk) {
      pg.flipChk = 1;
      let L = 0,
        Rr = 0;
      for (const q of staves) {
        const d = q.d;
        for (let y = Math.round(q.top); y <= q.bot; y++) {
          for (let x = Math.round(q.x0); x < q.x0 + 5 * d; x++) L += B[y * W + x];
          for (let x = Math.round(q.x1 - 5 * d); x < q.x1; x++) Rr += B[y * W + x];
        }
      }
      if (Rr > 1.3 * L) rot = 180;
    }
    if (rot) {
      pg.autoRot = (pg.autoRot || 0) + 1;
      if (!pg.img0) pg.img0 = pg.img;
      pg.rotA = ((pg.rotA || 0) + rot + 360) % 360;
      rot = pg.rotA;
      const im = pg.img0,
        w = im.naturalWidth,
        h = im.naturalHeight,
        c = document.createElement("canvas"),
        q90 = rot === 90 || rot === 270;
      c.width = q90 ? h : w;
      c.height = q90 ? w : h;
      const x = c.getContext("2d");
      x.translate(c.width / 2, c.height / 2);
      x.rotate((rot * Math.PI) / 180);
      x.drawImage(im, -w / 2, -h / 2);
      pg.img = await canvasImg(c);
      for (const k of ["angle", "ks", "up", "dw", "ks2", "ks2old", "ks2try", "cv", "baseData"]) delete pg[k];
      await ensureBase(pg);
      return analyze(pg);
    }
    if (staves.length) pg.autoRot = 2;
  }
  pg.staves = staves;
  pg.notes = [];
  if (!staves.length) return;
  const R = B.slice();
  for (const s of staves) {
    const runs = [];
    for (const y of s.ys) {
      const yc = Math.round(y);
      for (let x = s.x0; x <= s.x1; x += 4) {
        let k = -1;
        for (let q = -1; q <= 1; q++)
          if (B[(yc + q) * W + x]) {
            k = yc + q;
            break;
          }
        if (k < 0) continue;
        let a = k,
          b = k;
        while (a > 0 && B[(a - 1) * W + x]) a--;
        while (b < H - 1 && B[(b + 1) * W + x]) b++;
        if (b - a + 1 < 0.4 * s.d) runs.push(b - a + 1);
      }
    }
    runs.sort((a, b) => a - b);
    s.lw = runs.length ? runs[runs.length >> 1] : lt;
    const mr = s.lw + Math.max(1, Math.round(s.lw * 0.5));
    for (const y of s.ys) eraseThin(R, W, H, y, s.x0, s.x1, Math.ceil(s.lw / 2) + 1, mr);
    for (let k = 1; k <= 6; k++) {
      eraseLedger(B, R, W, H, s.top - k * s.d, s, s.lw, mr);
      eraseLedger(B, R, W, H, s.bot + k * s.d, s, s.lw, mr);
    }
  }
  await tick();
  const dmed = staves.map(s => s.d).sort((a, b) => a - b)[staves.length >> 1],
    r = Math.max(2, 0.36 * dmed);
  const D1 = dist(R, W, H),
    E = new Uint8Array(W * H);
  for (let i = 0; i < E.length; i++) E[i] = D1[i] > r * 3 ? 0 : 1;
  const D2 = dist(E, W, H),
    O = new Uint8Array(W * H);
  for (let i = 0; i < O.length; i++) O[i] = R[i] && D2[i] <= r * 3 + 2 ? 1 : 0;
  await tick();
  const ledgerOK = (s, x, y) => {
    const d = s.d,
      dir = y < s.top ? -1 : 1,
      from = dir < 0 ? s.top : s.bot,
      need = Math.round(d * 0.9);
    let tot = 0,
      got = 0;
    for (let p = from + dir * d; dir < 0 ? p > y + 0.35 * d : p < y - 0.35 * d; p += dir * d) {
      tot++;
      let ok = false;
      for (let yy = Math.round(p - lt - 2); yy <= Math.round(p + lt + 2) && !ok; yy++) {
        let run = 0;
        for (let xx = Math.round(x - 1.2 * d); xx <= Math.round(x + 1.2 * d); xx++) {
          run = B[yy * W + xx] || B2[yy * W + xx] ? run + 1 : 0;
          if (run >= need) {
            ok = true;
            break;
          }
        }
      }
      if (ok) got++;
    }
    return tot ? got / tot : 1;
  };
  const staffNear = (x, y) => {
    let b = null,
      bd = 1e9;
    for (const s of staves) {
      if (x < s.x0 - s.d || x > s.x1 + s.d) continue;
      const dd = y < s.top ? s.top - y : y > s.bot ? y - s.bot : 0;
      if (dd <= 6 * s.d && dd < bd) {
        bd = dd;
        b = s;
      }
    }
    return b;
  };
  /* noirceur de référence : traits de portée et blanc du papier */
  {
    const gs = [];
    for (let i = 0; i < g.length; i += 97) gs.push(g[i]);
    gs.sort((a, b) => a - b);
    pg.paper = gs[Math.floor(gs.length * 0.85)];
    for (const s of staves) {
      const v = [];
      for (const y of s.ys) {
        const r = Math.round(y);
        for (let x = Math.round(s.x0); x <= s.x1; x += 3) {
          let m = 255;
          for (let q = -1; q <= 1; q++) m = Math.min(m, g[(r + q) * W + x]);
          v.push(m);
        }
      }
      v.sort((a, b) => a - b);
      s.ink = v[Math.floor(v.length * 0.5)];
    }
  }
  const darkOK = (x, y, d, s) => {
    const r = Math.max(1, Math.round(0.18 * d));
    let t = 0,
      n = 0;
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const xx = Math.round(x) + i,
          yy = Math.round(y) + j;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
          t += g[yy * W + xx];
          n++;
        }
      }
    const c = t / n,
      bg = pg.paper,
      ink = Math.min(s.ink, bg - 20);
    return (bg - c) / (bg - ink) >= 0.9;
  };
  const sus = [],
    headLike = (c, d) => {
      const w = c.x1 - c.x0 + 1,
        h = c.y1 - c.y0 + 1;
      return w >= 0.9 * d && w <= 1.9 * d && h >= 0.7 * d && h <= 1.4 * d && c.n / (w * h) >= 0.55;
    };
  const staffFor = (x, y) => {
    let b = null,
      bd = 1e9;
    for (const s of staves) {
      if (x < s.x0 - s.d || x > s.x1 + s.d) continue;
      const dd = y < s.top ? s.top - y : y > s.bot ? y - s.bot : 0;
      if (dd > 6 * s.d) continue;
      const lr = dd <= 0.8 * s.d ? 1 : ledgerOK(s, x, y),
        lok = lr >= 0.5;
      if (!lok && dd > 1.2 * s.d) continue;
      const sc = dd + (lok ? (1 - lr) * 8 * s.d : 20 * s.d);
      if (sc < bd) {
        bd = sc;
        b = s;
      }
    }
    return b;
  };
  /* signatures de forme des clés de début de portée : un changement de clé doit leur ressembler */
  {
    const sig = (L, c) => {
      const v = new Float32Array(12 * 30);
      for (let j = 0; j < 30; j++)
        for (let i = 0; i < 12; i++) {
          const X = Math.round(c.x0 + ((i + 0.5) * (c.x1 - c.x0 + 1)) / 12),
            Y = Math.round(c.y0 + ((j + 0.5) * (c.y1 - c.y0 + 1)) / 30);
          v[j * 12 + i] = R[Y * W + X] ? 1 : 0;
        }
      return v;
    };
    staves.forEach(s => {
      s.c0 = clefOf(R, W, s);
    });
    clefPairFix(R, W, staves);
    const refs = {G: [], F: []};
    staves.forEach(s => {
      const d = s.d,
        b2 = [
          Math.max(0, Math.round((s.cx0 || s.x0) - 0.5 * d)),
          Math.max(0, Math.round(s.top - 3 * d)),
          Math.min(W - 1, Math.round((s.cx0 || s.x0) + 3.2 * d)),
          Math.min(H - 1, Math.round(s.bot + 3 * d))
        ];
      const {L, comps} = label(R, W, H, 1, true, b2);
      const G0 = s.c0 !== "F";
      const cx = s.cx0 || s.x0;
      let u = null;
      /* boîte de la clé : réunion des morceaux d'encre de la zone de clé (la suppression des lignes peut la couper en plusieurs) */
      for (const c of comps) {
        const w = c.x1 - c.x0 + 1,
          h = c.y1 - c.y0 + 1;
        if (c.x0 < cx - 0.6 * d || c.x1 > cx + (G0 ? 3.2 : 3.4) * d || w < 0.25 * d || c.n < 0.1 * d * d) continue;
        if (h > 9 * d) continue;
        if (G0 === false && c.cy > s.top + 2.2 * d && w < 0.7 * d) continue;
        u = u
          ? {x0: Math.min(u.x0, c.x0), y0: Math.min(u.y0, c.y0), x1: Math.max(u.x1, c.x1), y1: Math.max(u.y1, c.y1)}
          : {x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1};
      }
      if (u && u.y1 - u.y0 >= (G0 ? 3.8 : 2.2) * d) refs[G0 ? "G" : "F"].push(sig(L, u));
    });
    pageClefRefs = {refs, sig};
  }
  staves.forEach(s => {
    s.clefs = [{x: -1e9, c: s.c0}].concat(clefChanges(R, W, H, s));
  });
  try {
    pg.ksig = keySigGuess(B, W, H, staves);
  } catch (e) {
    pg.ksig = null;
  }
  /* un chiffrage se répète sur toutes les portées du système : on ne garde un bloc que s'il a un jumeau à la même place */
  /* un bloc de chiffres est large sur presque toute sa hauteur ; une note avec sa hampe est fine sur une grande partie */
  const wideRows = c => {
    let k = 0,
      t = 0;
    for (let y = c[1] + 2; y <= c[3] - 2; y++) {
      t++;
      let a = -1,
        b = -1;
      for (let x = c[0]; x <= c[2]; x++)
        if (R[y * W + x]) {
          if (a < 0) a = x;
          b = x;
        }
      if (a >= 0 && b - a >= 0.6 * (c[2] - c[0] - 4)) k++;
    }
    return t ? k / t : 0;
  };
  for (const s of staves)
    for (const c of s.tsc) {
      if (c[0] > (s.cx0 || s.x0) + 12 * s.d && !(s.barNear && s.barNear(c[0], c[2], 2.5 * s.d, 0))) continue;
      if (wideRows(c) < 0.2) continue;
      if (
        staves.some(
          t =>
            t !== s &&
            Math.abs(t.top - s.top) < 14 * s.d &&
            (t.tsc.some(q => Math.abs(q[0] - c[0]) < 0.6 * s.d) ||
              t.excl.some(q => Math.abs(q[0] - c[0]) < 0.6 * s.d))
        )
      ) {
        s.exclH.push(c);
        if (c[2] - c[0] - 4 <= 1.65 * s.d) s.excl.push(c);
      }
    }
  const inClef = (s, x, y) =>
    s.clefs.some(k => k.box && x >= k.box[0] - 2 && x <= k.box[2] + 2 && y >= k.box[1] - 2 && y <= k.box[3] + 2) ||
    s.excl.some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  const sg = Math.round(0.5 * dmed);
  const cand = [];
  const {L, comps} = label(O, W, H, 1, true);
  for (const c of comps) {
    let s = staffFor(c.cx, c.cy),
      far = false;
    if (!s) {
      s = staffNear(c.cx, c.cy);
      far = true;
      if (!s) continue;
    }
    const d = s.d,
      w = c.x1 - c.x0 + 1,
      h = c.y1 - c.y0 + 1;
    if (
      c.cx < (s.cx0 || s.x0) + 3 * d ||
      w < 0.8 * d ||
      w > 2.7 * d ||
      h < 0.7 * d ||
      h > 7 * d ||
      c.n / (w * h) < 0.4 ||
      (w <= 1.7 * d && h < 1.4 * d && w / h > 2.1)
    )
      continue;
    if (inClef(s, c.cx, c.cy)) continue;
    {
      const cy = Math.round(c.cy);
      let a = c.x0,
        b = c.x1;
      while (a > 0 && R[cy * W + a - 1]) a--;
      while (b < W - 1 && R[cy * W + b + 1]) b++;
      if ((c.x0 - a > 0.6 * d && b - c.x1 > 0.6 * d) || c.x0 - a > 1.6 * d || b - c.x1 > 1.6 * d) continue;
      const hr = Math.round(0.3 * d),
        thick = (x, y) => {
          let k = 0;
          for (let q = -hr; q <= hr; q++) if (R[(y + q) * W + x]) k++;
          return k >= 0.35 * d;
        };
      let beam = false;
      for (const r of [cy - hr, cy, cy + hr]) {
        let e = 0;
        for (let x = c.x0 - 1; x > 0 && R[r * W + x] && thick(x, r); x--) e++;
        let f = 0;
        for (let x = c.x1 + 1; x < W && R[r * W + x] && thick(x, r); x++) f++;
        if (e > 1.2 * d || f > 1.2 * d) {
          beam = true;
          break;
        }
      }
      if (beam) {
        if (headLike(c, d)) sus.push({x: c.cx, y: c.cy, s, c});
        continue;
      }
    }
    if (!darkOK(c.cx, c.cy, d, s)) continue;
    if (far) {
      if (headLike(c, d)) sus.push({x: c.cx, y: c.cy, s, c, far: true});
      continue;
    }
    if (
      !stemRun(B2, W, H, c.x0 - 2, c.x0 + 3, c.y0, c.y1, 2.6 * d, sg) &&
      !stemRun(B2, W, H, c.x1 - 3, c.x1 + 2, c.y0, c.y1, 2.6 * d, sg) &&
      !(
        w > 1.7 * d &&
        stemRun(B2, W, H, Math.round(c.x0 + 0.3 * w), Math.round(c.x1 - 0.3 * w), c.y0, c.y1, 2.6 * d, sg)
      )
    ) {
      if (headLike(c, d)) sus.push({x: c.cx, y: c.cy, s, c});
      continue;
    }
    let parts = [[c.x0, c.x1]];
    if (w > 1.7 * d) {
      let bx = -1,
        bv = 1e9;
      for (let x = Math.round(c.x0 + 0.35 * w); x <= c.x0 + 0.65 * w; x++) {
        let v = 0;
        for (let y = c.y0; y <= c.y1; y++) if (L[y * W + x] === c.id) v++;
        if (v < bv) {
          bv = v;
          bx = x;
        }
      }
      parts = [
        [c.x0, bx],
        [bx + 1, c.x1]
      ];
      const pinfo = parts.map(([xa, xb]) => {
        let n = 0,
          sy = 0;
        for (let y = c.y0; y <= c.y1; y++)
          for (let x = xa; x <= xb; x++)
            if (L[y * W + x] === c.id) {
              n++;
              sy += y;
            }
        return {n, y: n ? sy / n : 0};
      });
      if (Math.abs(pinfo[0].y - pinfo[1].y) < 0.3 * d && c.y1 - c.y0 < 1.4 * d)
        parts = [pinfo[0].n >= pinfo[1].n ? parts[0] : parts[1]];
    }
    for (const [xa, xb] of parts) {
      let ya = 1e9,
        yb = -1;
      for (let y = c.y0; y <= c.y1; y++)
        for (let x = xa; x <= xb; x++)
          if (L[y * W + x] === c.id) {
            if (y < ya) ya = y;
            if (y > yb) yb = y;
          }
      if (yb < 0) continue;
      const ph = yb - ya + 1,
        n = Math.max(1, Math.round((ph - lt) / d));
      const cs = [];
      for (let k = 0; k < n; k++) cs.push(ya + (ph * (k + 0.5)) / n);
      const px = [],
        own = [];
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++)
          if (L[y * W + x] === c.id) {
            px.push(y * W + x);
            let bk = 0;
            for (let k = 1; k < n; k++) if (Math.abs(y - cs[k]) < Math.abs(y - cs[bk])) bk = k;
            own.push(bk);
          }
      for (let k = 0; k < n; k++) {
        const ids = px.filter((_, q) => own[q] === k);
        cand.push({
          x: (xa + xb) / 2,
          y: cs[k],
          s,
          ids,
          hollow: false,
          x0: xa,
          x1: xb,
          y0: cs[k] - ph / n / 2,
          y1: cs[k] + ph / n / 2
        });
      }
    }
  }
  await tick();
  const holes = (Q, s, d, box, minH, side) => {
    const {L: HL, comps: hs} = label(Q, W, H, 0, false, box),
      cap = Math.max(2, Math.round(0.42 * d)),
      lim = 2 * d;
    for (const c of hs) {
      if (c.edge) continue;
      const hw = c.x1 - c.x0 + 1,
        hh = c.y1 - c.y0 + 1;
      if (
        hw < 0.2 * d ||
        hw > 1.25 * d ||
        hh < minH * d ||
        hh > 0.9 * d ||
        c.n < Math.max(4, 0.03 * d * d) ||
        c.n > 0.8 * d * d
      )
        continue;
      if (staffFor(c.cx, c.cy) !== s) continue;
      const cx = Math.round(c.cx),
        cy = Math.round(c.cy);
      const scan = (dx, dy) => {
        let x = cx,
          y = cy,
          k = 0;
        while (k < lim && !Q[y * W + x]) {
          x += dx;
          y += dy;
          k++;
        }
        const inn = k;
        let r = 0;
        while (k < lim && Q[y * W + x] && r < cap) {
          x += dx;
          y += dy;
          k++;
          r++;
        }
        return [inn, r];
      };
      const [l1, l2] = scan(-1, 0),
        [r1, r2] = scan(1, 0),
        [u1, u2] = scan(0, -1),
        [d1, d2] = scan(0, 1);

      if (hw > 2 * hh && Math.min(u2, d2) > s.lw + 1) continue;
      if (l2 < side || r2 < side || u2 < 2 || d2 < 2 || c.n / (hw * hh) > 0.88) continue;
      const ox0 = cx - l1 - l2,
        ox1 = cx + r1 + r2,
        oy0 = cy - u1 - u2,
        oy1 = cy + d1 + d2,
        ow = ox1 - ox0,
        oh = oy1 - oy0;

      if (c.n / (hw * hh) > 0.8 && hh > hw && ow < 1.4 * d) continue;
      if (minH > 0.4 && ow < 1.4 * d) {
        const ln = yy => s.ys.some(v => Math.abs(v - yy) <= s.lw + 1);
        if ((ln(cy - u1 - 1) && u2 <= s.lw + 1) || (ln(cy + d1 + 1) && d2 <= s.lw + 1)) continue;
      }
      if (ow < 0.95 * d || ow > 2.2 * d || oh < 0.65 * d || oh > 1.65 * d || oh > ow * 1.25) continue;
      const stem =
        stemRun(B2, W, H, ox0 - 2, ox0 + 3, oy0, oy1, 2.6 * d, sg) ||
        stemRun(B2, W, H, ox1 - 3, ox1 + 2, oy0, oy1, 2.6 * d, sg);
      if (!stem && ow < 1.4 * d) continue;
      const mx = (ox0 + ox1) / 2,
        my = (oy0 + oy1) / 2;
      if (inClef(s, mx, my) || (s.exclH || []).some(b => mx >= b[0] && mx <= b[2] && my >= b[1] && my <= b[3]))
        continue;
      if (cand.some(q => Math.abs(q.x - mx) < 0.95 * d && Math.abs(q.y - my) < 0.5 * d)) continue;
      const ids = [],
        inner = [],
        ra = ow / 2 + 1.5,
        rb = oh / 2 + 1.5;
      for (let yy = Math.floor(my - rb); yy <= Math.ceil(my + rb); yy++)
        for (let xx = Math.floor(mx - ra); xx <= Math.ceil(mx + ra); xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const e = ((xx - mx) / ra) ** 2 + ((yy - my) / rb) ** 2;
          if (e > 1) continue;
          const k = yy * W + xx;
          if (R[k]) ids.push(k);
          else if (HL[k] === c.id) inner.push(k);
        }
      cand.push({x: mx, y: my, s, ids, inner, hollow: true, x0: ox0, x1: ox1, y0: oy0, y1: oy1});
    }
  };
  for (const s of staves) {
    const d = s.d,
      box = [
        Math.max(0, Math.round((s.cx0 || s.x0) + 3 * d)),
        Math.max(0, Math.round(s.top - 5.5 * d)),
        Math.min(W - 1, Math.round(s.x1)),
        Math.min(H - 1, Math.round(s.bot + 5.5 * d))
      ];
    holes(R, s, d, box, 0.15, Math.max(2, Math.round(0.15 * d)));
    holes(B, s, d, box, 0.45, Math.max(2, Math.round(0.2 * d)));
  }
  /* apprentissage : forme moyenne des têtes validées, puis promotion des formes douteuses qui lui ressemblent */
  {
    const GW = 24,
      GH = 18,
      crop = (x, y, d) => {
        const v = new Float32Array(GW * GH);
        for (let j = 0; j < GH; j++)
          for (let i = 0; i < GW; i++) {
            const xx = Math.round(x + (i / (GW - 1) - 0.5) * 2.2 * d),
              yy = Math.round(y + (j / (GH - 1) - 0.5) * 1.6 * d);
            v[j * GW + i] = xx >= 0 && yy >= 0 && xx < W && yy < H ? R[yy * W + xx] : 0;
          }
        return v;
      };
    const corr = (a, b) => {
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
    };
    const fil = cand.filter(c => !c.hollow && c.ids.length);
    if (fil.length >= 5) {
      const T = new Float32Array(GW * GH);
      for (const c of fil) {
        const v = crop(c.x, c.y, c.s.d);
        for (let i = 0; i < T.length; i++) T[i] += v[i] / fil.length;
      }
      pg.tmpl = T;
      {
        const G = new Float32Array(TGW * TGH);
        let m = 0;
        for (const c of fil) {
          const d = c.s.d,
            cy = snapY(c.s, c.y),
            v = new Float32Array(TGW * TGH);
          let mu = 0;
          for (let j = 0; j < TGH; j++)
            for (let i = 0; i < TGW; i++) {
              const X = Math.round(c.x + (i / (TGW - 1) - 0.5) * 2.2 * d),
                Y = Math.round(cy + (j / (TGH - 1) - 0.5) * 1.6 * d);
              const val = X >= 0 && Y >= 0 && X < W && Y < H ? g[Y * W + X] : 255;
              v[j * TGW + i] = val;
              mu += val;
            }
          mu /= v.length;
          let sd = 0;
          for (const q of v) sd += (q - mu) ** 2;
          sd = Math.sqrt(sd / v.length) || 1;
          for (let i = 0; i < v.length; i++) G[i] += (v[i] - mu) / sd;
          m++;
        }
        for (let i = 0; i < G.length; i++) G[i] /= m;
        pg.gt = G;
      }
      for (let i = cand.length - 1; i >= 0; i--) {
        const c = cand[i];
        if (c.hollow || c.prom) continue;
        if (corr(crop(c.x, c.y, c.s.d), T) < 0.4) {
          cand.splice(i, 1);
          sus.push({x: c.x, y: c.y, s: c.s, c: null});
        }
      }
      for (const u of sus) {
        if (!u.c) continue;
        if (
          cand.some(
            q =>
              (Math.abs(q.x - u.x) < 0.8 * u.s.d && Math.abs(q.y - u.y) < 0.6 * u.s.d) ||
              (Math.abs(q.x - u.x) < 1.6 * u.s.d && Math.abs(q.y - u.y) < 0.3 * u.s.d)
          )
        )
          continue;
        if (u.far) {
          const st = u.s,
            dd = st.d,
            dir = u.y < st.top ? -1 : 1,
            p = Math.round((dir < 0 ? st.top : st.bot) + dir * dd);
          let ok = false;
          for (let yy = p - lt - 2; yy <= p + lt + 2 && !ok; yy++) {
            let run = 0;
            for (let xx = Math.round(u.x - 1.2 * dd); xx <= Math.round(u.x + 1.2 * dd); xx++) {
              run = B[yy * W + xx] || B2[yy * W + xx] ? run + 1 : 0;
              if (run >= 0.9 * dd) {
                ok = true;
                break;
              }
            }
          }
          if (!ok) continue;
        }
        if (corr(crop(u.x, u.y, u.s.d), T) >= 0.72) {
          const c = u.c,
            ids = [];
          for (let y = c.y0; y <= c.y1; y++)
            for (let x = c.x0; x <= c.x1; x++) if (L[y * W + x] === c.id) ids.push(y * W + x);
          cand.push({x: u.x, y: u.y, s: u.s, ids, hollow: false, prom: true, x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1});
          u.done = true;
        }
      }
    }
    for (let i = sus.length - 1; i >= 0; i--) if (sus[i].done) sus.splice(i, 1);
  }
  /* deux têtes à la même hauteur et collées = une seule note */
  for (let i = cand.length - 1; i >= 0; i--) {
    const a = cand[i],
      d = a.s.d;
    const j = cand.findIndex(
      (b, k) => k !== i && b.s === a.s && Math.abs(b.y - a.y) < 0.3 * d && Math.abs(b.x - a.x) < 1.3 * d
    );
    if (j >= 0) {
      const b = cand[j],
        keepB = b.hollow && !a.hollow ? true : a.hollow && !b.hollow ? false : b.ids.length >= a.ids.length;
      cand.splice(keepB ? i : j, 1);
      if (!keepB && j < i) i--;
    }
  }
  pg.notes = cand.map((c, i) => buildNote(pg, g, M, c, i));
  pg.sus = sus.filter(u => {
    const st = u.s,
      fx = Math.min(...cand.filter(q => q.s === st).map(q => q.x));
    if (u.x < fx - 0.5 * st.d && u.x < (st.cx0 || st.x0) + 7 * st.d) return false;
    return !cand.some(q => Math.abs(q.x - u.x) < 0.8 * st.d && Math.abs(q.y - u.y) < 0.6 * st.d);
  });
  pg.lt = lt;
}
function buildNote(pg, g, M, c, id) {
  const {W} = pg,
    set = new Map();
  for (const k of c.ids) set.set(k, 0);
  if (c.inner) for (const k of c.inner) set.set(k, 2);
  for (const k of [...set.keys()]) {
    if (set.get(k) === 2) continue;
    for (const o of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) {
      const j = k + o;
      if (!set.has(j) && j >= 0 && j < g.length && g[j] < M[j] * 0.97) set.set(j, 0);
    }
  }
  const cw = Math.max(1, Math.round(c.s.d * 0.09)),
    idx = new Int32Array(set.size),
    kind = new Uint8Array(set.size),
    t = new Uint8Array(set.size);
  let q = 0;
  for (const [k, v] of set) {
    idx[q] = k;
    let e = 0;
    if (v !== 2) {
      for (let dy = -cw; dy <= cw && !e; dy++)
        for (let dx = -cw; dx <= cw; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > cw) continue;
          if (!set.has(k + dy * W + dx)) {
            e = 1;
            break;
          }
        }
    }
    kind[q] = v === 2 ? 2 : e;
    const m = Math.max(60, M[k]);
    t[q] = Math.round(255 * Math.max(0, Math.min(1, (m - g[k]) / (m * 0.55))));
    q++;
  }
  return {id, x: c.x, y: c.y, s: c.s, hollow: c.hollow, box: [c.x0, c.y0, c.x1, c.y1], idx, kind, t, ov: null};
}
const clefAt = (s, x) => {
  let c = s.clefs[0].c;
  for (const k of s.clefs) if (k.x <= x) c = k.c;
  return c;
};
const letterOf = n => {
  if (n.ov != null) return n.ov;
  const s = n.s,
    step = Math.round((s.bot - n.y) / (s.d / 2));
  return ((((clefAt(s, n.x) === "G" ? 2 : 4) + step) % 7) + 7) % 7;
};

function rotateCanvas(pg) {
  const {cv, W, H} = pg,
    tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  const t = tmp.getContext("2d");
  t.fillStyle = "#fff";
  t.fillRect(0, 0, W, H);
  t.translate(W / 2, H / 2);
  t.rotate((-pg.angle * Math.PI) / 180);
  t.drawImage(cv, -W / 2, -H / 2);
  cv.getContext("2d").drawImage(tmp, 0, 0);
}

/* ---------- ajuster les portées : les 5 lignes en transparence, on pose les coins (gauche puis droite) ---------- */
/* portée courbée (photo d'un livre) : un point au milieu de la ligne du haut (mt) et du bas (mb) ; la ligne passe par les deux bouts et ce point */
function sfBump(f, k, t) {
  if (!f.mt) return 0;
  const tt = Math.max(0, Math.min(1, t)),
    bt = f.mt[1] - (f.tl[1] + f.tr[1]) / 2,
    bb = f.mb[1] - (f.bl[1] + f.br[1]) / 2;
  return 4 * tt * (1 - tt) * (bt + ((bb - bt) * k) / 4);
}
function sfWarp(pg, fits) {
  /* redresse chaque portée : décalage vertical par colonne, interpolé entre les portées */
  const W = pg.W,
    H = pg.H,
    src = pg.cv.getContext("2d").getImageData(0, 0, W, H).data,
    dc = document.createElement("canvas");
  dc.width = W;
  dc.height = H;
  const dx = dc.getContext("2d"),
    O = dx.createImageData(W, H),
    o = O.data;
  const L = (a, b, x) => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
  const dst = fits.map(f => {
    const t = (f.tl[1] + f.tr[1]) / 2,
      h = (f.bl[1] - f.tl[1] + (f.br[1] - f.tr[1])) / 2;
    return [t, t + h];
  });
  const cs = new Float64Array(fits.length * 2),
    cd = new Float64Array(fits.length * 2),
    ord = fits.map((f, i) => i).sort((a, b) => dst[a][0] - dst[b][0]);
  for (let x = 0; x < W; x++) {
    let k = 0;
    for (const i of ord) {
      const f = fits[i];
      cs[k] = L(f.tl, f.tr, x) + sfBump(f, 0, (x - f.tl[0]) / (f.tr[0] - f.tl[0] || 1));
      cd[k++] = dst[i][0];
      cs[k] = L(f.bl, f.br, x) + sfBump(f, 4, (x - f.bl[0]) / (f.br[0] - f.bl[0] || 1));
      cd[k++] = dst[i][1];
    }
    let j = 0;
    for (let y = 0; y < H; y++) {
      while (j < k - 1 && y > cd[j + 1]) j++;
      let sy;
      if (y <= cd[0]) sy = y + cs[0] - cd[0];
      else if (y >= cd[k - 1]) sy = y + cs[k - 1] - cd[k - 1];
      else {
        const t = (y - cd[j]) / (cd[j + 1] - cd[j] || 1);
        sy = cs[j] + (cs[j + 1] - cs[j]) * t;
      }
      const p = (y * W + x) * 4;
      if (sy < 0 || sy > H - 1) {
        o[p] = o[p + 1] = o[p + 2] = 255;
        o[p + 3] = 255;
        continue;
      }
      const y0 = sy | 0,
        fy = sy - y0,
        a = (y0 * W + x) * 4,
        b = a + W * 4;
      for (let c = 0; c < 3; c++) o[p + c] = src[a + c] * (1 - fy) + src[b + c] * fy;
      o[p + 3] = 255;
    }
  }
  dx.putImageData(O, 0, 0);
  return dc;
}
/* diagnostic des portées : bien posées sur les lignes ? une portée de clé de fa ou de sol manque-t-elle à un système ? */
function staffDiag(pg, fits) {
  const G = pg.baseData.data,
    W = pg.W,
    H = pg.H,
    paper = pg.paper || 235,
    thr = Math.min(200, paper - 35);
  const lineY = (f, k, t) => {
      const a = f.tl[1] + ((f.bl[1] - f.tl[1]) * k) / 4,
        b = f.tr[1] + ((f.br[1] - f.tr[1]) * k) / 4;
      return a + (b - a) * t + sfBump(f, k, t);
    },
    lineX = (f, k, t) => {
      const a = f.tl[0] + ((f.bl[0] - f.tl[0]) * k) / 4,
        b = f.tr[0] + ((f.br[0] - f.tr[0]) * k) / 4;
      return a + (b - a) * t;
    };
  const score = f => {
    let hit = 0,
      n = 0;
    const r = Math.max(1, Math.round(f.d * 0.14));
    for (let i = 1; i <= 40; i++) {
      const t = 0.04 + (0.92 * i) / 41;
      for (let k = 0; k < 5; k++) {
        const x = Math.round(lineX(f, k, t)),
          y = Math.round(lineY(f, k, t));
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        n++;
        let m = 255;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          const v = G[(yy * W + x) * 4];
          if (v < m) m = v;
        }
        if (m < thr) hit++;
      }
    }
    return n ? hit / n : 0;
  };
  const cl = f => (f.s && f.s.clefs && f.s.clefs[0] ? f.s.clefs[0].c : f.clef || null);
  for (const f of fits) {
    f.sc = score(f);
    f.nn = f.s ? pg.notes.filter(n => n.s === f.s).length : null;
    f.bad = f.fixed ? null : f.sc < 0.4 ? "pas bien posée sur les lignes" : f.nn === 0 ? "aucune note lue" : null;
  }
  const props = [],
    isPair = (a, b) => cl(a) === "G" && cl(b) === "F" && b.tl[1] - a.bl[1] < 16 * a.d,
    gaps = [];
  for (let i = 0; i + 1 < fits.length; i++)
    if (isPair(fits[i], fits[i + 1])) gaps.push(fits[i + 1].tl[1] - fits[i].bl[1]);
  if (gaps.length) {
    gaps.sort((x, y) => x - y);
    const gap = gaps[gaps.length >> 1],
      paired = new Set();
    for (let i = 0; i + 1 < fits.length; i++)
      if (isPair(fits[i], fits[i + 1])) {
        paired.add(fits[i]);
        paired.add(fits[i + 1]);
      }
    for (const f of fits) {
      if (paired.has(f) || f.added) continue;
      const c = cl(f),
        h = f.bl[1] - f.tl[1];
      let dy = 0;
      if (c === "G") dy = gap + h;
      else if (c === "F") dy = -(gap + h);
      else continue;
      const mv = (q, o) => ({
        tl: [q.tl[0], q.tl[1] + o],
        tr: [q.tr[0], q.tr[1] + o],
        bl: [q.bl[0], q.bl[1] + o],
        br: [q.br[0], q.br[1] + o],
        d: f.d
      });
      let bs = -1,
        bo = 0;
      for (let o = -3 * f.d; o <= 3 * f.d; o += Math.max(1, f.d / 6)) {
        const sc = score(mv(f, dy + o));
        if (sc > bs) {
          bs = sc;
          bo = o;
        }
      }
      const nf = Object.assign(mv(f, dy + bo), {added: true, prop: true, near: f, clef: c === "G" ? "F" : "G"});
      if (nf.tl[1] < 0 || nf.bl[1] > H) continue;
      if (fits.some(g => Math.abs(g.tl[1] - nf.tl[1]) < 3 * f.d)) continue;
      if (bs > 0.45) props.push(nf);
    }
  }
  return {props, score, lineX, lineY, cl};
}
function staffNeedsCheck(pg) {
  try {
    if (!pg.staves || !pg.staves.length) return true;
    const fits = pg.staves.map(s => ({
      tl: [s.x0, s.top],
      tr: [s.x1, s.top],
      bl: [s.x0, s.bot],
      br: [s.x1, s.bot],
      d: s.d,
      s
    }));
    const D = staffDiag(pg, fits);
    return D.props.length > 0 || fits.some(f => f.bad);
  } catch (e) {
    return false;
  }
}
/* étape « Les portées » : vue d'ensemble numérotée, puis chaque portée l'une après l'autre (ses deux bouts affichés en même temps) */
function staffFit(opt = {}) {
  closeTransient();
  const pg = pages[cur];
  if (!pg || !pg.cv) {
    toast("Ouvrez d'abord une partition");
    return;
  }
  try {
    playStop();
  } catch (e) {}
  const R = $("sf"),
    cv = $("sfCv"),
    ctx = cv.getContext("2d"),
    fits = (pg.staves || []).map(s => ({
      tl: [s.x0, s.top],
      tr: [s.x1, s.top],
      bl: [s.x0, s.bot],
      br: [s.x1, s.bot],
      d: s.d,
      s,
      clef: s.clefs && s.clefs[0] ? s.clefs[0].c : "G",
      chg: (s.clefs || []).slice(1).map(c => ({x: c.x, c: c.c}))
    }));
  const snapF = f => ({tl: f.tl.slice(), tr: f.tr.slice(), bl: f.bl.slice(), br: f.br.slice(), d: f.d});
  for (const f of fits) f.orig = snapF(f);
  const midP = (f, k) =>
      k === "mt"
        ? f.mt || [(f.tl[0] + f.tr[0]) / 2, (f.tl[1] + f.tr[1]) / 2]
        : f.mb || [(f.bl[0] + f.br[0]) / 2, (f.bl[1] + f.br[1]) / 2],
    PT = (f, k) => (k[0] === "m" ? midP(f, k) : f[k]),
    HK = ["tl", "bl", "tr", "br", "mt", "mb"];
  let chgOn = false,
    sel = -1,
    addOn = false;
  const resort = () => {
    const cur = fits[sel];
    fits.sort((p, q) => p.tl[1] + p.bl[1] + p.tr[1] + p.br[1] - (q.tl[1] + q.bl[1] + q.tr[1] + q.br[1]));
    if (cur) {
      sel = fits.indexOf(cur);
      ed = sel;
    }
  };
  const ptrs = new Map(),
    OFF = 22,
    hp = (b, f, k) => {
      const p = S(b, PT(f, k)),
        up = k === "tl" || k === "tr" || k === "mt";
      return [Math.max(b.x + 15, Math.min(b.x + b.w - 15, p[0])), p[1] + (up ? -OFF : OFF)];
    };
  const LC = ["#FF4B4B", "#FF922E", "#FF70C8", "#FFE94A", "#35D66B"],
    W = pg.W,
    H = pg.H;
  let mode = "ov",
    ed = 0,
    drag = null,
    boxes = [],
    props = [],
    D = null,
    ovY = 0,
    ovMax = 0,
    chX = 0,
    ovZ = 1,
    ovX = 0,
    ovXM = 0;
  const diag = () => {
    D = staffDiag(pg, fits);
    props = D.props;
  };
  diag();
  const num = f => fits.indexOf(f) + 1;
  /* ---- vue : une seule vue (ensemble) ou deux fenêtres (bout gauche en haut, bout droit en bas) ---- */
  const view = () => {
    const r = $("sfStage").getBoundingClientRect(),
      dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = r.width * dpr;
    cv.height = r.height * dpr;
    cv.style.width = r.width + "px";
    cv.style.height = r.height + "px";
    if (mode === "cl") {
      boxes = [];
      boxes.dpr = dpr;
      return;
    }
    if (mode === "ch") {
      const f = fits[ed],
        d = f.d,
        s = Math.min(r.width / (18 * d), r.height / (14 * d)),
        cy = (f.tl[1] + f.bl[1] + f.tr[1] + f.br[1]) / 4,
        x0 = Math.min(f.tl[0], f.bl[0]),
        x1 = Math.max(f.tr[0], f.br[0]),
        vw = r.width / s;
      chX = Math.max(x0 - d, Math.min(x1 + d - vw, chX));
      boxes = [{s, ox: -chX * s, oy: r.height / 2 - cy * s, x: 0, y: 0, w: r.width, h: r.height, ch: 1}];
      boxes.dpr = dpr;
      return;
    }
    if (mode === "ov") {
      /* marge à gauche pour les numéros et les clés : rien ne cache la partition */ const md = fits.length
          ? fits.map(f => f.d).sort((p, q) => p - q)[fits.length >> 1]
          : W / 100,
        bx0 = fits.length ? Math.max(0, Math.min(...fits.map(f => Math.min(f.tl[0], f.bl[0]))) - 2 * md) : 0,
        bx1 = fits.length ? Math.min(W, Math.max(...fits.map(f => Math.max(f.tr[0], f.br[0]))) + md) : W,
        by0 = fits.length ? Math.max(0, Math.min(...fits.map(f => f.tl[1])) - 6 * md) : 0,
        by1 = fits.length ? Math.min(H, Math.max(...fits.map(f => f.bl[1])) + 6 * md) : H;
      const M = 80,
        s = ((r.width - M - 4) / (bx1 - bx0)) * ovZ,
        cw = (bx1 - bx0) * s,
        ch = (by1 - by0) * s;
      ovMax = Math.max(0, ch - r.height + 12);
      const PAD = Math.min(110, r.width * 0.25);
      ovY = Math.max(-PAD, Math.min(ovMax + PAD, ovY));
      ovXM = Math.max(0, cw - (r.width - M - 4));
      ovX = Math.max(-PAD, Math.min(ovXM + PAD, ovX));
      boxes = [
        {
          s,
          ox: M - bx0 * s - ovX,
          oy: (ch <= r.height ? (r.height - ch) / 2 - ovY : 6 - ovY) - by0 * s,
          x: 0,
          y: 0,
          w: r.width,
          h: r.height,
          ov: 1
        }
      ];
    } else {
      const f = fits[ed],
        d = f.d,
        fx0 = Math.min(f.tl[0], f.bl[0]) - d,
        fx1 = Math.max(f.tr[0], f.br[0]) + d,
        fy0 = Math.min(f.tl[1], f.tr[1]),
        fy1 = Math.max(f.bl[1], f.br[1]),
        sF = (r.width - 8) / (fx1 - fx0),
        hf = Math.round(Math.max(78, Math.min(r.height * 0.3, (fy1 - fy0 + 9 * d) * sF))),
        top = hf + 8,
        hh = (r.height - top - 8) / 2;
      const full = {
        full: 1,
        s: sF,
        ox: 4 - fx0 * sF,
        oy: hf / 2 - ((fy0 + fy1) / 2) * sF,
        x: 0,
        y: 0,
        w: r.width,
        h: hf
      };
      boxes = ["l", "r"].map((sd, k) => {
        const p = f["pan" + sd] || [0, 0],
          cx = (sd === "l" ? (f.tl[0] + f.bl[0]) / 2 + 3.5 * d : (f.tr[0] + f.br[0]) / 2 - 3.5 * d) + p[0],
          cy = (sd === "l" ? (f.tl[1] + f.bl[1]) / 2 : (f.tr[1] + f.br[1]) / 2) + p[1],
          s = Math.min(r.width / (13 * d), hh / (9 * d)),
          y = top + k * (hh + 8);
        return {side: sd, s, ox: r.width / 2 - cx * s, oy: y + hh / 2 - cy * s, x: 0, y, w: r.width, h: hh};
      });
      boxes.unshift(full);
    }
    boxes.dpr = dpr;
  };
  const S = (b, p) => [b.ox + p[0] * b.s, b.oy + p[1] * b.s],
    I = (b, x, y) => [(x - b.ox) / b.s, (y - b.oy) / b.s];
  const lines = (b, f, col, lw, dash) => {
    ctx.setLineDash(dash || []);
    const N = f.mt ? 28 : 1;
    for (let k = 0; k < 5; k++) {
      ctx.strokeStyle = typeof col === "string" ? col : col[k];
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const t = j / N,
          p = S(b, [D.lineX(f, k, t), D.lineY(f, k, t)]);
        j ? ctx.lineTo(...p) : ctx.moveTo(...p);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };
  const badge = (b, f, txt, bg) => {
    const p = S(b, [Math.min(f.tl[0], f.bl[0]), (f.tl[1] + f.bl[1]) / 2]),
      r = 13,
      x = b.ov ? 16 : Math.max(r + 3, p[0] - r - 6);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.4)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, p[1], r, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = "800 13px Figtree,system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, x, p[1] + 0.5);
  };
  /* la clé lue, à côté du numéro : on la touche pour passer de sol à fa */
  let pills = [];
  const pill = (b, f) => {
    const p = S(b, [Math.min(f.tl[0], f.bl[0]), (f.tl[1] + f.bl[1]) / 2]),
      x = 34,
      y = p[1],
      lab = f.clef === "F" ? "Fa" : "Sol",
      w = 34,
      h = 22;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = f.clef === "F" ? "#FF3B30" : "#F2B705";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y - h / 2, w, h, 11) : ctx.rect(x, y - h / 2, w, h);
    ctx.fill();
    ctx.restore();
    if (f.clefCh) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y - h / 2, w, h, 11) : ctx.rect(x, y - h / 2, w, h);
      ctx.stroke();
    }
    ctx.fillStyle = f.clef === "F" ? "#fff" : "#2a1d00";
    ctx.font = "800 12px Figtree,system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lab, x + w / 2, y + 0.5);
    pills.push({f, x: x - 6, y: y - h / 2 - 6, w: w + 12, h: h + 12});
  };
  const draw = () => {
    const dp = boxes.dpr;
    ctx.setTransform(dp, 0, 0, dp, 0, 0);
    ctx.fillStyle = "#05070F";
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const b of boxes) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.fillStyle = b.ov ? "#0B1124" : "#fff";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.drawImage(pg.cv, b.ox, b.oy, W * b.s, H * b.s);
      if (mode === "ov") {
        pills = [];
        const CC = f => (f.clef === "F" ? "#FF3B30" : "#F2B705");
        /* le territoire de chaque portée : ses lignes imaginaires (pointillés légers) jusqu'à mi-chemin de la portée voisine, dans la couleur de sa clé */
        const zone = (f, i, col) => {
          const d = f.d,
            up = i > 0 ? Math.min(5 * d, (f.tl[1] - fits[i - 1].bl[1]) / 2) : 5 * d,
            dn = i < fits.length - 1 ? Math.min(5 * d, (fits[i + 1].tl[1] - f.bl[1]) / 2) : 5 * d;
          const zt = S(b, [0, f.tl[1] - up])[1],
            zb = S(b, [0, f.bl[1] + dn])[1],
            xa = S(b, [Math.min(f.tl[0], f.bl[0]), 0])[0],
            xb = S(b, [Math.max(f.tr[0], f.br[0]), 0])[0];
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = col;
          ctx.fillRect(xa, zt, xb - xa, zb - zt);
          if (d * b.s < 4.5) {
            ctx.globalAlpha = 1;
            return;
          }
          ctx.globalAlpha = 0.75;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.7;
          ctx.setLineDash([5, 5]);
          for (let k = 1; k * d <= up + 0.01; k++) {
            const y = S(b, [0, f.tl[1] - k * d])[1];
            ctx.beginPath();
            ctx.moveTo(xa, y);
            ctx.lineTo(xb, y);
            ctx.stroke();
          }
          for (let k = 1; k * d <= dn + 0.01; k++) {
            const y = S(b, [0, f.bl[1] + k * d])[1];
            ctx.beginPath();
            ctx.moveTo(xa, y);
            ctx.lineTo(xb, y);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        };
        const segs = f => {
          const ch = (f.chg || []).slice().sort((p, q) => p.x - q.x),
            out = [];
          let xa = -1e9,
            c = f.clef || "G";
          for (const k of ch) {
            out.push([xa, k.x, c]);
            xa = k.x;
            c = k.c;
          }
          out.push([xa, 1e9, c]);
          return out;
        };
        const inSeg = (f, fn) => {
          for (const [sa, sb, c] of segs(f)) {
            const X0 = Math.max(b.x, S(b, [sa, 0])[0]),
              X1 = Math.min(b.x + b.w, S(b, [sb, 0])[0]);
            if (X1 <= X0) continue;
            ctx.save();
            ctx.beginPath();
            ctx.rect(X0, b.y, X1 - X0, b.h);
            ctx.clip();
            fn(c === "F" ? "#FF3B30" : "#F2B705");
            ctx.restore();
          }
        };
        fits.forEach((f, i) => inSeg(f, col => zone(f, i, col)));
        for (const f of fits) {
          inSeg(f, col => {
            ctx.globalAlpha = 0.85;
            lines(b, f, col, Math.max(1.6, f.d * b.s * 0.16));
            ctx.globalAlpha = 1;
          });
          fits[sel] === f ? badge(b, f, "✕", "#E5484D") : badge(b, f, String(num(f)), f.bad ? "#E8770F" : "#3A4360");
          pill(b, f);
          if (f.bad) {
            const p = S(b, [Math.max(f.tr[0], f.br[0]), (f.tl[1] + f.bl[1] + f.tr[1] + f.br[1]) / 4]);
            ctx.fillStyle = "#E8770F";
            ctx.beginPath();
            ctx.arc(Math.min(p[0], b.w - 14), p[1], 10, 0, 7);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "900 13px Figtree,system-ui,sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("!", Math.min(p[0], b.w - 14), p[1] + 0.5);
          }
        }
        for (const f of fits)
          for (const k of f.chg || []) {
            const p1 = S(b, [k.x, Math.min(f.tl[1], f.tr[1]) - f.d]),
              p2 = S(b, [k.x, Math.max(f.bl[1], f.br[1]) + f.d]);
            const cc = k.c === "F" ? "#FF3B30" : "#F2B705";
            ctx.strokeStyle = cc;
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(...p1);
            ctx.lineTo(...p2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,.4)";
            ctx.shadowBlur = 6;
            ctx.fillStyle = cc;
            ctx.beginPath();
            ctx.arc(p1[0], p1[1] - 11, 12, 0, 7);
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = "#fff";
            ctx.font = "900 15px serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(k.c === "F" ? "𝄢" : "𝄞", p1[0], p1[1] - 10);
          }
        for (const f of props) {
          ctx.globalAlpha = 0.85;
          lines(b, f, "#2F80FF", Math.max(2, f.d * b.s * 0.3), [6, 5]);
          ctx.globalAlpha = 1;
          badge(b, f, "+", "#2F80FF");
        }
        if (sel >= 0 && fits[sel]) {
          const f = fits[sel],
            xa = S(b, [Math.min(f.tl[0], f.bl[0]), 0])[0],
            xb = S(b, [Math.max(f.tr[0], f.br[0]), 0])[0],
            ya = S(b, [0, Math.min(f.tl[1], f.tr[1])])[1],
            yb = S(b, [0, Math.max(f.bl[1], f.br[1])])[1];
          lines(b, f, LC, Math.max(2, f.d * b.s * 0.22));
          for (const k of HK) {
            const p = S(b, PT(f, k)),
              h = hp(b, f, k),
              act = drag && drag.k === k,
              col = k === "tl" || k === "tr" || k === "mt" ? "#FF4B4B" : "#35D66B";
            ctx.strokeStyle = col;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(h[0], h[1]);
            ctx.stroke();
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,.5)";
            ctx.shadowBlur = 8;
            const R0 = k[0] === "m" ? (act ? 13 : 9) : act ? 15 : 12;
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(h[0], h[1], R0, 0, 7);
            ctx.fill();
            ctx.restore();
            ctx.lineWidth = k[0] === "m" ? 3 : 4;
            ctx.beginPath();
            ctx.arc(h[0], h[1], R0, 0, 7);
            ctx.stroke();
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(p[0], p[1], 3, 0, 7);
            ctx.fill();
          }
        }
      } else if (mode === "ch") {
        const f = fits[ed];
        lines(b, f, f.clef === "F" ? "#FF3B3066" : "#F2B70566", Math.max(2, f.d * b.s * 0.18));
        const yT = S(b, [0, Math.min(f.tl[1], f.tr[1]) - 1.6 * f.d])[1],
          yB = S(b, [0, Math.max(f.bl[1], f.br[1]) + 1.6 * f.d])[1];
        const mark = (x, txt, col) => {
          const X = S(b, [x, 0])[0];
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.setLineDash([7, 5]);
          ctx.beginPath();
          ctx.moveTo(X, yT);
          ctx.lineTo(X, yB);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "800 13px Figtree,system-ui,sans-serif";
          const tw = ctx.measureText(txt).width + 18;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(X - tw / 2, yT - 28, tw, 24, 12) : ctx.rect(X - tw / 2, yT - 28, tw, 24);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, X, yT - 15.5);
        };
        mark(Math.min(f.tl[0], f.bl[0]) + 0.2 * f.d, "Début : " + (f.clef === "F" ? "fa" : "sol"), "#3A4360");
        for (const c of f.chg)
          mark(c.x, "→ Clé de " + (c.c === "F" ? "fa" : "sol"), c.c === "F" ? "#FF3B30" : "#F2B705");
      } else if (b.full) {
        const f = fits[ed],
          col = f.clef === "F" ? "#FF3B30" : "#F2B705";
        for (const g of fits) {
          if (g === f) continue;
          ctx.globalAlpha = 0.25;
          lines(b, g, g.clef === "F" ? "#FF3B30" : "#F2B705", 1.2);
          ctx.globalAlpha = 1;
        }
        const xa = S(b, [Math.min(f.tl[0], f.bl[0]), 0])[0],
          xb = S(b, [Math.max(f.tr[0], f.br[0]), 0])[0],
          ya = S(b, [0, Math.min(f.tl[1], f.tr[1])])[1],
          yb = S(b, [0, Math.max(f.bl[1], f.br[1])])[1];
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = col;
        ctx.fillRect(xa, ya - 4, xb - xa, yb - ya + 8);
        ctx.globalAlpha = 1;
        lines(b, f, col, 2);
        /* où se trouvent les deux loupes du dessous */
        for (const q of boxes.filter(q => q.side)) {
          const [p0x, p0y] = I(q, q.x, q.y),
            [p1x, p1y] = I(q, q.x + q.w, q.y + q.h),
            A = S(b, [p0x, p0y]),
            B = S(b, [p1x, p1y]);
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(A[0], A[1], B[0] - A[0], B[1] - A[1]);
          ctx.setLineDash([]);
        }
        ctx.fillStyle = "rgba(5,7,15,.78)";
        const lab = "Portée " + (ed + 1) + " entière";
        ctx.font = "800 11.5px Figtree,system-ui,sans-serif";
        const tw = ctx.measureText(lab).width,
          lx = b.x + b.w - tw - 22;
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(lx, b.y + b.h - 26, tw + 14, 20, 10)
          : ctx.rect(lx, b.y + b.h - 26, tw + 14, 20);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(lab, lx + 7, b.y + b.h - 15.5);
      } else {
        const f = fits[ed];
        for (const g of fits) {
          if (g === f) continue;
          ctx.globalAlpha = 0.22;
          lines(b, g, g.clef === "F" ? "#FF3B30" : "#F2B705", 2);
          ctx.globalAlpha = 1;
        }
        lines(
          b,
          f,
          LC.map(c => c + "A0"),
          Math.max(3, f.d * b.s * 0.2)
        );
        for (const [k, lab] of b.side === "l"
          ? [
              ["tl", "haut"],
              ["bl", "bas"]
            ]
          : [
              ["tr", "haut"],
              ["br", "bas"]
            ]) {
          const p = S(b, f[k]);
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,.45)";
          ctx.shadowBlur = 10;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(p[0], p[1], drag && drag.k === k ? 19 : 15, 0, 7);
          ctx.fill();
          ctx.restore();
          ctx.lineWidth = 4;
          ctx.strokeStyle = k[0] === "t" ? "#FF4B4B" : "#35D66B";
          ctx.beginPath();
          ctx.arc(p[0], p[1], drag && drag.k === k ? 19 : 15, 0, 7);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(5,7,15,.78)";
        const lab = b.side === "l" ? "Début de la portée" : "Fin de la portée";
        ctx.font = "800 12.5px Figtree,system-ui,sans-serif";
        const tw = ctx.measureText(lab).width;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(b.x + 8, b.y + 8, tw + 16, 24, 12) : ctx.rect(b.x + 8, b.y + 8, tw + 16, 24);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(lab, b.x + 16, b.y + 20.5);
      }
      ctx.restore();
    }
    /* loupe façon appli de scan : le coin qu'on déplace, agrandi au-dessus du doigt */
    if ((mode === "ed" || mode === "ov") && drag && drag.k) {
      const f = fits[ed],
        b = drag.b,
        p = S(b, PT(f, drag.k)),
        RR = 62,
        cw = cv.width / boxes.dpr;
      let lx = Math.max(RR + 6, Math.min(cw - RR - 6, p[0])),
        ly = p[1] - RR - 46;
      if (ly - RR < 4) {
        ly = Math.max(RR + 6, p[1]);
        lx = p[0] + RR + 56 + RR < cw ? p[0] + RR + 56 : p[0] - RR - 56;
      }
      const s2 = Math.max(b.s * 2.4, 13 / f.d),
        P0 = PT(f, drag.k),
        L = {s: s2, ox: lx - P0[0] * s2, oy: ly - P0[1] * s2};
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, RR, 0, 7);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(lx - RR, ly - RR, 2 * RR, 2 * RR);
      ctx.drawImage(pg.cv, L.ox, L.oy, W * s2, H * s2);
      lines(
        L,
        f,
        LC.map(c => c + "B0"),
        2.5
      );
      ctx.strokeStyle = "rgba(0,0,0,.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lx - 14, ly);
      ctx.lineTo(lx + 14, ly);
      ctx.moveTo(lx, ly - 14);
      ctx.lineTo(lx, ly + 14);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.5)";
      ctx.shadowBlur = 14;
      ctx.lineWidth = 4;
      ctx.strokeStyle = drag.k === "tl" || drag.k === "tr" || drag.k === "mt" ? "#FF4B4B" : "#35D66B";
      ctx.beginPath();
      ctx.arc(lx, ly, RR, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  };
  /* ---- textes, numéros et boutons ---- */
  const chips = () =>
    fits
      .map(
        (f, i) =>
          `<button data-go="${i}" class="${i === ed && mode === "ed" ? "on " : ""}${f.bad ? "bad" : f.fixed || f.added ? "ok" : ""}">${i + 1}</button>`
      )
      .join("");
  const clefCards = () => {
    const out = [];
    for (let i = 0; i < fits.length; i++) {
      const f = fits[i],
        d = f.d,
        x0 = Math.max(0, Math.min(f.tl[0], f.bl[0]) - 0.4 * d),
        y0 = Math.max(0, f.tl[1] - 2.6 * d),
        w = Math.min(W - x0, 6.5 * d),
        h = Math.min(H - y0, f.bl[1] - f.tl[1] + 5.2 * d),
        c = document.createElement("canvas"),
        k = 96 / h;
      c.width = Math.round(w * k);
      c.height = 96;
      c.getContext("2d").drawImage(pg.cv, x0, y0, w, h, 0, 0, c.width, c.height);
      out.push(
        `<div class="clc"><b class="sfN ${f.clefCh ? "g" : "n"}">${i + 1}</b><img alt="Clé de la portée ${i + 1}" src="${c.toDataURL("image/jpeg", 0.85)}"><div class="clSeg" data-i="${i}"><button data-c="G" class="${f.clef === "G" ? "on" : ""}">Sol</button><button data-c="F" class="${f.clef === "F" ? "on" : ""}">Fa</button></div></div>`
      );
    }
    return out.join("");
  };
  const ui = () => {
    const ov = mode === "ov",
      cm = mode === "cl";
    $("sfBack").hidden = ov && !opt.step;
    R.classList.toggle("sfOv", ov);
    R.classList.toggle("sfCm", cm);
    R.classList.toggle("sfCh", mode === "ch");
    $("sfCl").hidden = !cm;
    if (mode === "ch") {
      const f = fits[ed];
      $("sfTitle").textContent = `Portée ${ed + 1} · changements de clé`;
      $("sfHelp").textContent =
        "Faites glisser la portée de gauche à droite. Touchez l'endroit où une nouvelle clé apparaît ; touchez un repère pour l'enlever.";
      $("sfStep").textContent = f.chg.length
        ? `${f.chg.length} changement${f.chg.length > 1 ? "s" : ""} de clé`
        : "Aucun changement de clé sur cette portée";
      $("sfChips").hidden = true;
      $("sfList").hidden = true;
      $("sfDel").hidden = true;
      $("sfClef").hidden = true;
      $("sfChg").hidden = true;
      $("sfOvB").hidden = true;
      $("sfRst").hidden = true;
      $("sfPrev").textContent = "‹ Retour";
      $("sfPrev").disabled = false;
      $("sfNext").textContent = "Valider";
      return;
    }
    if (cm) {
      $("sfTitle").textContent = opt.step ? "Étape 1 · Les clés" : "Les clés";
      $("sfHelp").textContent = "Voici la clé lue au début de chaque portée. Si elle est fausse, touchez la bonne.";
      $("sfStep").textContent = "";
      $("sfCl").innerHTML = clefCards();
      $("sfRst").hidden = true;
      $("sfChips").hidden = true;
      $("sfList").hidden = true;
      $("sfDel").hidden = true;
      $("sfClef").hidden = true;
      $("sfChg").hidden = true;
      $("sfOvB").hidden = false;
      $("sfPrev").textContent = "‹ Portées";
      $("sfPrev").disabled = false;
      $("sfNext").textContent = opt.step ? "C'est bon, continuer" : "Terminer";
      return;
    }
    $("sfChips").innerHTML = ov ? "" : chips();
    $("sfChips").hidden = ov;
    const stepLab =
      opt.step || opt.re
        ? pages.length > 1
          ? `Étape 1 · Page ${cur + 1} sur ${pages.length}`
          : "Étape 1 · Les portées"
        : "Les portées";
    if (ov) {
      const bad = fits.filter(f => f.bad);
      $("sfTitle").textContent = stepLab;
      $("sfHelp").innerHTML = !fits.length
        ? "Aucune portée trouvée : touchez « Ajouter »."
        : `<span class="sfAl"><span class="ok"><svg viewBox="0 0 44 26" width="58" height="34" aria-hidden="true"><rect width="44" height="26" rx="4" fill="#fff"/><line x1="3" x2="41" y1="5" y2="5" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="9" y2="9" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="13" y2="13" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="17" y2="17" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="21" y2="21" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="5" y2="5" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="9" y2="9" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="13" y2="13" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="17" y2="17" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="21" y2="21" stroke="#F2B705" stroke-width="1.6" opacity=".9"/></svg><i>✓ pile dessus</i></span><span class="ko"><svg viewBox="0 0 44 26" width="58" height="34" aria-hidden="true"><rect width="44" height="26" rx="4" fill="#fff"/><line x1="3" x2="41" y1="5" y2="5" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="9" y2="9" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="13" y2="13" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="17" y2="17" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="21" y2="21" stroke="#222" stroke-width="1.1"/><line x1="3" x2="41" y1="7.2" y2="7.2" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="11.2" y2="11.2" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="15.2" y2="15.2" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="19.2" y2="19.2" stroke="#F2B705" stroke-width="1.6" opacity=".9"/><line x1="3" x2="41" y1="23.2" y2="23.2" stroke="#F2B705" stroke-width="1.6" opacity=".9"/></svg><i>✗ décalé</i></span></span><span>Les lignes de couleur doivent tomber <span class="sfEm">pile sur les 5 lignes noires</span>, du début à la fin de chaque portée. Sinon, touchez la portée pour la régler. Touchez <span class="lgG">𝄞 Sol</span> / <span class="lgF">𝄢 Fa</span> pour changer la clé.</span>${bad.length ? " Les portées marquées <b class=lgW>!</b> sont à vérifier." : ""}${props.length ? " Le <b class=lgP>+</b> bleu propose une portée oubliée." : ""}`;
      $("sfStep").textContent = ovMax > 0 ? "↕ Faites glisser la page pour voir la suite" : "";
      $("sfList").innerHTML = "";
      $("sfList").hidden = true;
      $("sfPrev").textContent = addOn ? "Annuler l'ajout" : "＋ Ajouter";
      $("sfPrev").classList.toggle("on", addOn);
      $("sfNext").textContent = opt.step ? "C'est bon, continuer" : "Terminer";
      $("sfDel").hidden = sel < 0;
      $("sfOvB").hidden = true;
      $("sfClef").hidden = true;
      $("sfRst").hidden = sel < 0;
      $("sfCurve").hidden = sel < 0;
      $("sfChg").hidden = !fits.length || sel >= 0;
      $("sfChg").classList.toggle("on", chgOn);
      $("sfChg").innerHTML = chgOn ? "✓ Terminé" : "𝄞 ⇄ 𝄢 &nbsp;La clé change en cours de ligne ?";
      $("sfPrev").disabled = false;
      if (addOn) {
        $("sfHelp").innerHTML =
          'Touchez la partition <span style="font-weight:800">sur la portée oubliée</span> : elle sera ajoutée et calée sur ses lignes.';
        $("sfChg").hidden = true;
      }
      if (sel >= 0) {
        $("sfTitle").textContent = `Portée ${sel + 1} sur ${fits.length}`;
        $("sfHelp").innerHTML =
          'Faites glisser les ronds <span style="color:#FF6B6B;font-weight:800">rouges</span> sur la ligne du haut, les <span style="color:#35D66B;font-weight:800">verts</span> sur celle du bas. Lignes courbées ? Les petits ronds du milieu les plient. Le ✕ rouge à gauche supprime la portée.';
        $("sfStep").textContent = "";
      }
      if (chgOn)
        $("sfHelp").innerHTML =
          "Touchez la portée <span style=font-weight:800>à l'endroit où la nouvelle clé apparaît</span> : la couleur change à partir de là. Touchez un rond 𝄞/𝄢 pour l'enlever.";
    } else {
      const f = fits[ed];
      $("sfTitle").textContent = `Portée ${ed + 1} sur ${fits.length}${f.added ? " · nouvelle" : ""}`;
      $("sfHelp").textContent =
        "Posez le rond rouge sur la ligne du haut et le vert sur la ligne du bas, au début (en haut) et à la fin (en bas).";
      $("sfStep").textContent = f.bad ? "À vérifier : " + f.bad : "";
      $("sfList").hidden = true;
      $("sfDel").hidden = false;
      $("sfOvB").hidden = false;
      $("sfClef").hidden = false;
      $("sfChg").hidden = true;
      $("sfCurve").hidden = true;
      $("sfRst").hidden = !f.orig;
      $("sfChg").textContent = f.chg.length
        ? `Changements de clé sur la ligne (${f.chg.length})`
        : "＋ Changement de clé sur la ligne";
      $("sfClef").innerHTML = `Clé lue : <b>${f.clef === "F" ? "fa" : "sol"}</b> · changer`;
      $("sfPrev").textContent = "‹ Précédente";
      $("sfPrev").disabled = ed === 0;
      $("sfNext").textContent = ed < fits.length - 1 ? "Portée suivante ›" : "Voir l'ensemble";
    }
  };
  const render = () => {
    zBtns();
    view();
    draw();
    ui();
    zBtns();
    /* la liste sous l'image change la place disponible */ view();
    draw();
    if (mode === "ov") $("sfStep").textContent = ovMax > 0 ? "↕ Faites glisser la page pour voir la suite" : "";
  };
  const toOv = () => {
    mode = "ov";
    sel = -1;
    diag();
    render();
  };
  const edit = i => {
    if (!fits.length) return toOv();
    mode = "ed";
    chgOn = false;
    if (fits[Math.max(0, Math.min(fits.length - 1, i))] && !fits[Math.max(0, Math.min(fits.length - 1, i))].orig) {
      const g = fits[Math.max(0, Math.min(fits.length - 1, i))];
      g.orig = snapF(g);
    }
    ed = Math.max(0, Math.min(fits.length - 1, i));
    for (const f of fits) if (!f.chg) f.chg = [];
    if (!fits[ed].clef) fits[ed].clef = "G";
    render();
  };
  /* ---- gestes ---- */
  const boxAt = y => boxes.find(b => y >= b.y && y <= b.y + b.h) || boxes[0];
  const down = e => {
    const r = cv.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top,
      b = boxAt(y);
    if (mode === "ov" && sel >= 0 && fits[sel] && !ptrs.size) {
      const f = fits[sel];
      let k = null,
        bd = 30;
      for (const q of HK) {
        const h = hp(b, f, q),
          dd = Math.hypot(h[0] - x, h[1] - y);
        if (dd < bd) {
          bd = dd;
          k = q;
        }
      }
      if (k) {
        cv.setPointerCapture(e.pointerId);
        e.preventDefault();
        ed = sel;
        const p = S(b, PT(f, k));
        drag = {k, b, dx: p[0] - x, dy: p[1] - y};
        draw();
        return;
      }
    }
    if (mode === "ov") {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [x, y]);
      if (ptrs.size >= 2) {
        const [p, q] = [...ptrs.values()],
          m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        drag = {pinch: {d0: Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, z0: ovZ, P: I(boxes[0], m[0], m[1])}};
        return;
      }
      drag = {ov: [x, y, ovY, ovX], moved: false};
      return;
    }
    if (mode === "ch") {
      cv.setPointerCapture(e.pointerId);
      drag = {ch: [x, y, chX], moved: false};
      return;
    }
    if (0) {
      const pl = pills.find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
      if (pl) {
        pl.f.clef = pl.f.clef === "F" ? "G" : "F";
        pl.f.clefCh = true;
        draw();
        ui();
        return;
      }
      const [px, py] = I(b, x, y);
      const pi = props.findIndex(f => py > f.tl[1] - f.d && py < f.bl[1] + f.d);
      if (pi >= 0) {
        addProp(pi);
        return;
      }
      let best = -1,
        bd = 1e9;
      fits.forEach((f, i) => {
        const t = Math.min(f.tl[1], f.tr[1]),
          bb = Math.max(f.bl[1], f.br[1]),
          dd = py < t ? t - py : py > bb ? py - bb : 0;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      if (best >= 0 && bd < 3 * fits[best].d) edit(best);
      return;
    }
    if (b.full) return;
    const f = fits[ed];
    let k = null,
      bd = 42;
    for (const q of b.side === "l" ? ["tl", "bl"] : ["tr", "br"]) {
      const p = S(b, f[q]),
        dd = Math.hypot(p[0] - x, p[1] - y);
      if (dd < bd) {
        bd = dd;
        k = q;
      }
    }
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    drag = k ? {k, b} : {pan: [x, y, (f["pan" + b.side] || [0, 0]).slice()], b};
    draw();
  };
  /* clé en vigueur à la position x de la portée f (début + changements) */
  const clefAtF = (f, x) => {
    let c = f.clef;
    for (const k of f.chg.slice().sort((a, b) => a.x - b.x)) if (k.x <= x) c = k.c;
    return c;
  };
  const chTap = (x, y) => {
    const b = boxes[0],
      f = fits[ed],
      [px] = I(b, x, y),
      d = f.d,
      x0 = Math.min(f.tl[0], f.bl[0]),
      x1 = Math.max(f.tr[0], f.br[0]);
    const hit = f.chg.findIndex(c => Math.abs(c.x - px) < 1.4 * d);
    if (hit >= 0) {
      f.chg.splice(hit, 1);
      f.chgCh = true;
      toast("Changement de clé enlevé");
      draw();
      ui();
      return;
    }
    if (px < x0 + 3 * d || px > x1) {
      toast("Touchez plus loin sur la portée, après la clé du début");
      return;
    }
    const c = clefAtF(f, px) === "F" ? "G" : "F";
    f.chg.push({x: px, c});
    f.chg.sort((a, b) => a.x - b.x);
    f.chgCh = true;
    toast("À partir d'ici : clé de " + (c === "F" ? "fa" : "sol"));
    draw();
    ui();
  };
  const ovTap = (x, y) => {
    const b = boxes[0];
    const [px, py] = I(b, x, y);
    if (addOn) {
      addOn = false;
      placeAt(py);
      return;
    }
    /* le numéro à gauche : un toucher sélectionne la portée, et sur la portée choisie le ✕ la supprime */
    {
      let bi = -1,
        bd = 18;
      fits.forEach((f, i) => {
        const yy = S(b, [0, (f.tl[1] + f.bl[1]) / 2])[1],
          dd = Math.hypot(x - 16, y - yy);
        if (dd < bd) {
          bd = dd;
          bi = i;
        }
      });
      if (bi >= 0) {
        if (bi === sel) {
          delStaff(bi);
          return;
        }
        selS(bi);
        return;
      }
    }
    const pl = pills.find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (pl) {
      pl.f.clef = pl.f.clef === "F" ? "G" : "F";
      pl.f.clefCh = true;
      draw();
      ui();
      return;
    }
    if (chgOn) {
      let bi = -1,
        bd = 1e9;
      fits.forEach((f, i) => {
        const t = Math.min(f.tl[1], f.tr[1]),
          bb = Math.max(f.bl[1], f.br[1]),
          dd = py < t ? t - py : py > bb ? py - bb : 0;
        if (dd < bd) {
          bd = dd;
          bi = i;
        }
      });
      if (bi < 0 || bd > 3 * fits[bi].d) {
        toast("Touchez directement une portée");
        return;
      }
      const f = fits[bi];
      if (!f.chg) f.chg = [];
      const d = f.d,
        tol = Math.max(1.4 * d, 16 / b.s),
        x0 = Math.min(f.tl[0], f.bl[0]),
        x1 = Math.max(f.tr[0], f.br[0]);
      const hit = f.chg.findIndex(c => Math.abs(c.x - px) < tol);
      if (hit >= 0) {
        f.chg.splice(hit, 1);
        f.chgCh = true;
        toast("Changement de clé enlevé");
        draw();
        ui();
        return;
      }
      if (px < x0 + 3 * d || px > x1) {
        toast("Touchez plus loin sur la portée, après la clé du début");
        return;
      }
      const c = clefAtF(f, px) === "F" ? "G" : "F";
      f.chg.push({x: px, c});
      f.chg.sort((p, q) => p.x - q.x);
      f.chgCh = true;
      toast(`Portée ${bi + 1} : clé de ${c === "F" ? "fa" : "sol"} à partir d'ici`);
      draw();
      ui();
      return;
    }
    const pi = props.findIndex(f => py > f.tl[1] - f.d && py < f.bl[1] + f.d);
    if (pi >= 0) {
      addProp(pi);
      return;
    }
    let best = -1,
      bd = 1e9;
    fits.forEach((f, i) => {
      const t = Math.min(f.tl[1], f.tr[1]),
        bb = Math.max(f.bl[1], f.br[1]),
        dd = py < t ? t - py : py > bb ? py - bb : 0;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    if (best >= 0 && bd < 3 * fits[best].d) {
      selS(sel === best ? -1 : best);
    } else selS(-1);
  };
  const selS = i => {
    if (sel >= 0 && i < 0) diag();
    // les boutons du bas changent de hauteur quand on (dé)sélectionne : on garde la portée touchée
    // au même endroit de l'écran, pour que le ✕ reste sous le doigt
    const anchor = fits[i >= 0 ? i : sel];
    const screenY = () => {
      if (!anchor || !boxes[0]) return null;
      return cv.getBoundingClientRect().top + S(boxes[0], [0, (anchor.tl[1] + anchor.bl[1]) / 2])[1];
    };
    const y0 = screenY();
    sel = i;
    if (i >= 0) {
      ed = i;
      chgOn = false;
      const f = fits[i];
      if (!f.orig) f.orig = snapF(f);
      if (!f.chg) f.chg = [];
      if (!f.clef) f.clef = "G";
    }
    render();
    const y1 = screenY();
    if (y0 != null && y1 != null && Math.abs(y1 - y0) > 1) {
      ovY += y1 - y0;
      view();
      draw();
      zBtns();
    }
  };
  const move = e => {
    if (mode === "ov" && ptrs.has(e.pointerId)) {
      const r = cv.getBoundingClientRect();
      ptrs.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
    }
    if (drag && drag.pinch) {
      if (ptrs.size < 2) return;
      const [p, q] = [...ptrs.values()],
        m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
        z = Math.max(1, Math.min(6, (drag.pinch.z0 * Math.hypot(p[0] - q[0], p[1] - q[1])) / drag.pinch.d0));
      ovZ = z;
      view();
      const n = S(boxes[0], drag.pinch.P);
      ovX += n[0] - m[0];
      ovY += n[1] - m[1];
      view();
      draw();
      zBtns();
      return;
    }
    if (drag && drag.ch) {
      const r = cv.getBoundingClientRect(),
        x = e.clientX - r.left,
        dx = x - drag.ch[0];
      if (Math.abs(dx) > 8) drag.moved = true;
      if (drag.moved) {
        chX = drag.ch[2] - dx / boxes[0].s;
        view();
        draw();
      }
      return;
    }
    if (drag && drag.ov) {
      const r = cv.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top,
        dy = y - drag.ov[1],
        dx = x - drag.ov[0];
      if (Math.abs(dy) > 8 || Math.abs(dx) > 8) drag.moved = true;
      if (drag.moved) {
        ovY = drag.ov[2] - dy;
        ovX = drag.ov[3] - dx;
        view();
        draw();
        zBtns();
      }
      return;
    }
    if (!drag || (mode === "ov" && !drag.k)) return;
    const r = cv.getBoundingClientRect(),
      x = e.clientX - r.left + (drag.dx || 0),
      y = e.clientY - r.top + (drag.dy || 0),
      f = fits[ed],
      b = drag.b;
    if (drag.pan) {
      f["pan" + b.side] = [drag.pan[2][0] - (x - drag.pan[0]) / b.s, drag.pan[2][1] - (y - drag.pan[1]) / b.s];
      view();
      draw();
      return;
    }
    if (drag.k[0] === "m") {
      const q = I(b, x, y),
        m = midP(f, drag.k);
      if (!f.mt) {
        f.mt = midP(f, "mt").slice();
        f.mb = midP(f, "mb").slice();
      }
      f[drag.k] = [m[0], q[1]];
      const gap = f.mb[1] - f.mt[1];
      if (gap < 1.5 * f.d) {
        if (drag.k === "mt") f.mt[1] = f.mb[1] - 1.5 * f.d;
        else f.mb[1] = f.mt[1] + 1.5 * f.d;
      }
      draw();
      return;
    }
    f[drag.k] = I(b, x, y);
    const other = {tl: "bl", bl: "tl", tr: "br", br: "tr"}[drag.k];
    if (Math.abs(f[drag.k][1] - f[other][1]) < f.d * 1.5)
      f[drag.k][1] = f[other][1] + (drag.k[0] === "t" ? -1.5 : 1.5) * f.d;
    draw();
  };
  const up = e => {
    ptrs.delete(e.pointerId);
    if (drag && drag.pinch) {
      if (!ptrs.size) drag = null;
      return;
    }
    if (drag && drag.ch) {
      const d0 = drag;
      drag = null;
      if (!d0.moved) chTap(d0.ch[0], d0.ch[1]);
      return;
    }
    if (drag && drag.ov) {
      const d0 = drag;
      drag = null;
      if (!d0.moved) ovTap(d0.ov[0], d0.ov[1]);
      return;
    }
    if (!drag) return;
    const f = fits[ed];
    if (drag.k && f) {
      f.d = (f.bl[1] - f.tl[1] + (f.br[1] - f.tr[1])) / 8;
      f.fixed = true;
      f.bad = null;
      if (mode === "ov") {
        resort();
        ui();
      }
      $("sfChips").innerHTML = chips();
      $("sfStep").textContent = "";
    }
    drag = null;
    draw();
  };
  cv.onpointerdown = down;
  cv.onpointermove = move;
  cv.onpointerup = up;
  cv.onpointercancel = e => {
    ptrs.delete(e.pointerId);
    drag = null;
  };
  cv.onwheel = e => {
    if (mode !== "ov") return;
    e.preventDefault();
    ovY += e.deltaY;
    view();
    draw();
  };
  const addProp = i => {
    const f = props.splice(i, 1)[0];
    delete f.prop;
    fits.push(f);
    fits.sort((a, b) => a.tl[1] - b.tl[1]);
    f.chg = f.chg || [];
    selS(fits.indexOf(f));
  };
  $("sfList").onclick = e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.clefs) {
      mode = "cl";
      render();
      return;
    }
    if (b.dataset.fix != null) edit(+b.dataset.fix);
    else if (b.dataset.prop != null) addProp(+b.dataset.prop);
  };
  $("sfChips").onclick = e => {
    const b = e.target.closest("button");
    if (b) edit(+b.dataset.go);
  };
  $("sfOvB").onclick = () => toOv();
  const zBtns = () => {
    $("sfZr").hidden = !(mode === "ov" && (ovZ > 1.01 || Math.abs(ovX) > 2 || Math.abs(ovY) > 2));
    R.classList.toggle("sfSel", mode === "ov" && sel >= 0);
  };
  const zoomOv = k => {
    const r = cv.getBoundingClientRect(),
      cx = (r.width - 80) / 2 + ovX,
      cy = r.height / 2 + ovY,
      nz = Math.max(1, Math.min(6, ovZ * k)),
      f = nz / ovZ;
    ovZ = nz;
    ovX = cx * f - (r.width - 80) / 2;
    ovY = cy * f - r.height / 2;
    render();
  };
  $("sfZr").onclick = () => {
    ovZ = 1;
    ovX = 0;
    ovY = 0;
    render();
  };
  $("sfZi").onclick = () => zoomOv(1.6);
  $("sfZo").onclick = () => zoomOv(1 / 1.6);
  $("sfChg").onclick = () => {
    if (mode === "ov") {
      chgOn = !chgOn;
      sel = -1;
      for (const f of fits) if (!f.chg) f.chg = [];
      ui();
      return;
    }
    if (mode !== "ed") return;
    mode = "ch";
    chX = -1e9;
    render();
  };
  $("sfCurve").onclick = () => {
    if (sel < 0) return;
    const f = fits[sel],
      d = f.d;
    delete f.mt;
    delete f.mb;
    const m0 = midP(f, "mt").slice(),
      m1 = midP(f, "mb").slice(),
      s0 = D.score(f);
    /* on cherche la courbure où les 5 lignes tombent le mieux sur l'encre : d'abord haut et bas ensemble, puis chacun affiné */
    const sc = (bt, bb) => {
      f.mt = [m0[0], m0[1] + bt];
      f.mb = [m1[0], m1[1] + bb];
      return D.score(f);
    };
    let bt = 0,
      bb = 0,
      bs = -1;
    for (let o = -3 * d; o <= 3 * d; o += d / 8) {
      const v = sc(o, o);
      if (v > bs) {
        bs = v;
        bt = o;
        bb = o;
      }
    }
    for (let it = 0; it < 2; it++) {
      let t0 = bt,
        b0 = bb;
      for (let o = -d; o <= d; o += d / 16) {
        let v = sc(t0 + o, bb);
        if (v > bs) {
          bs = v;
          bt = t0 + o;
        }
        v = sc(bt, b0 + o);
        if (v > bs) {
          bs = v;
          bb = b0 + o;
        }
      }
    }
    if (bs > s0 + 0.03 && (Math.abs(bt) > 0.15 * d || Math.abs(bb) > 0.15 * d)) {
      f.mt = [m0[0], m0[1] + bt];
      f.mb = [m1[0], m1[1] + bb];
      f.fixed = true;
      f.bad = null;
      toast("Courbe suivie : la partition sera redressée");
    } else {
      delete f.mt;
      delete f.mb;
      toast("Cette portée est droite");
    }
    draw();
    ui();
  };
  $("sfRst").onclick = () => {
    if (mode !== "ed" && sel < 0) return;
    const f = fits[mode === "ov" ? sel : ed];
    if (!f.orig) return;
    Object.assign(f, {
      tl: f.orig.tl.slice(),
      tr: f.orig.tr.slice(),
      bl: f.orig.bl.slice(),
      br: f.orig.br.slice(),
      d: f.orig.d
    });
    delete f.panl;
    delete f.panr;
    delete f.mt;
    delete f.mb;
    f.fixed = false;
    render();
    toast("Portée réinitialisée");
  };
  $("sfCl").onclick = e => {
    const b = e.target.closest(".clSeg button");
    if (!b) return;
    const f = fits[+b.parentNode.dataset.i];
    if (f.clef !== b.dataset.c) {
      f.clef = b.dataset.c;
      f.clefCh = true;
    }
    ui();
  };
  $("sfClef").onclick = () => {
    if (mode !== "ed") return;
    const f = fits[ed];
    f.clef = f.clef === "F" ? "G" : "F";
    f.clefCh = true;
    ui();
  };
  const delStaff = i => {
    fits.splice(i, 1);
    sel = -1;
    diag();
    toast("Portée supprimée · les numéros sont recalculés");
    render();
  };
  /* ajouter : on touche l'endroit, l'appli cale la portée sur les lignes les plus proches */
  const placeAt = py => {
    const ds = fits.map(f => f.d).sort((a, b) => a - b),
      d0 = ds.length ? ds[ds.length >> 1] : W / 120,
      x0s = fits.map(f => Math.min(f.tl[0], f.bl[0])).sort((a, b) => a - b),
      x1s = fits.map(f => Math.max(f.tr[0], f.br[0])).sort((a, b) => a - b),
      x0 = x0s.length ? x0s[x0s.length >> 1] : W * 0.06,
      x1 = x1s.length ? x1s[x1s.length >> 1] : W * 0.94;
    const mk = (cy, d) => ({
      tl: [x0, cy - 2 * d],
      bl: [x0, cy + 2 * d],
      tr: [x1, cy - 2 * d],
      br: [x1, cy + 2 * d],
      d
    });
    let best = mk(py, d0),
      bs = -1;
    for (const k of [0.8, 0.9, 1, 1.1, 1.25])
      for (let o = -3 * d0; o <= 3 * d0; o += d0 / 6) {
        const t = mk(py + o, d0 * k),
          v = D.score(t);
        if (v > bs) {
          bs = v;
          best = t;
        }
      }
    const nf = Object.assign(best, {added: true, chg: [], clef: "G"});
    fits.push(nf);
    sel = fits.length - 1;
    resort();
    diag();
    selS(sel);
    toast(bs > 0.5 ? "Portée ajoutée et calée sur les lignes" : "Portée ajoutée : placez ses ronds sur les lignes");
  };
  $("sfDel").onclick = () => {
    if (mode === "ov" && sel >= 0) {
      delStaff(sel);
      return;
    }
    if (mode !== "ed") return;
    const n = ed + 1;
    fits.splice(ed, 1);
    toast(`Portée ${n} supprimée`);
    if (fits.length) edit(Math.min(ed, fits.length - 1));
    else toOv();
  };
  $("sfPrev").onclick = () => {
    if (mode === "ch") {
      mode = "ed";
      return render();
    }
    if (mode === "cl") return toOv();
    if (mode === "ov") {
      addOn = !addOn;
      sel = -1;
      chgOn = false;
      render();
      return;
    }
    edit(ed - 1);
  };
  $("sfNext").onclick = () => {
    if (mode === "ch") {
      mode = "ed";
      return render();
    }
    if (mode === "cl") return finish();
    if (mode === "ed") {
      if (ed < fits.length - 1) edit(ed + 1);
      else toOv();
      return;
    }
    finish();
  };
  $("sfClose").textContent = opt.step ? "Passer cette étape" : "Annuler";
  $("sfBack").onclick = () => {
    if (mode === "ch") {
      mode = "ed";
      return render();
    }
    if (mode !== "ov") return toOv();
    if (!opt.step) return;
    R.classList.remove("on");
    window.removeEventListener("resize", rs);
    cancelOpen();
  };
  $("sfClose").onclick = () => {
    R.classList.remove("on");
    window.removeEventListener("resize", rs);
    if (opt.step && opt.done) opt.done();
  };
  const rs = () => render();
  window.addEventListener("resize", rs);
  const finish = async () => {
    const b = $("sfNext");
    b.disabled = true;
    b.textContent = "Redressement…";
    await new Promise(r => setTimeout(r, 30));
    try {
      const moved =
        fits.length !== pg.staves.length ||
        fits.some(f => f.mt && Math.abs(sfBump(f, 0, 0.5)) + Math.abs(sfBump(f, 4, 0.5)) > 0.3 * f.d) ||
        fits.some((f, i) => {
          const s = pg.staves[i];
          return (
            f.added ||
            Math.abs(f.tl[1] - s.top) > 0.3 * s.d ||
            Math.abs(f.tr[1] - s.top) > 0.3 * s.d ||
            Math.abs(f.bl[1] - s.bot) > 0.3 * s.d ||
            Math.abs(f.br[1] - s.bot) > 0.3 * s.d
          );
        });
      R.classList.remove("on");
      window.removeEventListener("resize", rs);
      const clefCh = fits.some(f => f.s && f.s.clefs && f.s.clefs[0] && (f.clef !== f.s.clefs[0].c || f.chgCh));
      if (!moved) {
        if (clefCh) {
          snap();
          for (const f of fits)
            if (f.s && f.s.clefs && f.s.clefs[0]) {
              f.s.clefs[0].c = f.clef;
              if (f.chgCh) f.s.clefs = [f.s.clefs[0]].concat(f.chg.map(c => ({x: c.x, c: c.c, man: true})));
            }
          refresh();
          toast("Clés mises à jour");
        }
        if (opt.step) opt.done && opt.done();
        else if (!clefCh) toast("Les portées étaient déjà bien placées");
        return;
      }
      const img = await canvasImg(sfWarp(pg, fits));
      /* les lignes posées à la main deviennent les portées de la page : plus de détection automatique pour elles */
      const list = fits.map(f => {
        const t = (f.tl[1] + f.tr[1]) / 2,
          h = (f.bl[1] - f.tl[1] + (f.br[1] - f.tr[1])) / 2;
        return {top: t, bot: t + h, x0: Math.min(f.tl[0], f.bl[0]), x1: Math.max(f.tr[0], f.br[0])};
      });
      pages[cur] = {
        kind: "img",
        img,
        name: pg.name,
        angle: 0,
        ks: null,
        ks2: null,
        forceStaves: {W: pg.W, list},
        keyAsked: true,
        revealed: true,
        staffAsked: true
      };
      await show(cur);
      {
        const np = pages[cur];
        if (np.staves && np.staves.length === fits.length && fits.some(f => f.clefCh || f.added || f.chgCh)) {
          np.staves.forEach((st, i) => {
            if ((fits[i].clefCh || fits[i].added) && st.clefs && st.clefs[0]) st.clefs[0].c = fits[i].clef;
            if (fits[i].chgCh && st.clefs)
              st.clefs = [st.clefs[0]].concat(fits[i].chg.map(c => ({x: c.x, c: c.c, man: true})));
          });
          refresh();
        }
      }
      toast("Portées appliquées, partition relue");
      if (opt.step && opt.done) setTimeout(opt.done, 600);
    } catch (e) {
      console.error(e);
      toast("Le redressement a échoué");
    } finally {
      b.disabled = false;
    }
  };
  R.classList.add("on");
  requestAnimationFrame(() => render());
}
/* image numérique (export, capture d'une partition propre) : fond blanc pur, pas besoin de recadrer */

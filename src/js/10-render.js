function paintAcc(pg, ctx) {
  if (!$("accT").checked || !pg.acc || !pg.acc.length) return;
  const W = pg.W;
  for (const a of pg.acc) {
    if (a.del || (a.skip && a.Lov == null)) continue;
    if (!a.man && a.Lov == null) continue;
    const L =
        a.Lov != null
          ? a.Lov
          : a.note && pg.notes.includes(a.note)
            ? letterOf(a.note)
            : a.L != null
              ? a.L
              : letterOf({s: a.s, x: a.x, y: a.y, ov: null}),
      c = RGB[L];
    const [x0, y0, x1, y1] = a.box.map(Math.round),
      bx0 = Math.max(0, x0 - 3),
      by0 = Math.max(0, y0 - 3),
      bw = Math.min(W - 1, x1 + 3) - bx0 + 1,
      bh = Math.min(pg.H - 1, y1 + 3) - by0 + 1;
    const im = ctx.getImageData(bx0, by0, bw, bh),
      o = im.data;
    for (const k of a.px) {
      const x = (k % W) - bx0,
        y = ((k / W) | 0) - by0;
      if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
      const p = (y * bw + x) * 4;
      const v = (o[p] * 77 + o[p + 1] * 150 + o[p + 2] * 29) / 256,
        t = Math.max(0, Math.min(1, (255 - v) / 160));
      for (let z = 0; z < 3; z++) o[p + z] = Math.round(255 - (255 - c[z] * 0.82) * t);
    }
    ctx.putImageData(im, bx0, by0);
  }
}
const KSPOS = {3: 8, 0: 5, 4: 9, 1: 6, 5: 3, 2: 7, 6: 4},
  KFPOS = {6: 4, 2: 7, 5: 3, 1: 6, 4: 2, 0: 5, 3: 1},
  KSO = [3, 0, 4, 1, 5, 2, 6],
  KFO = [6, 2, 5, 1, 4, 0, 3];
function keyX0(pg, s) {
  const k = (pg.acc || []).filter(a => a.s === s && !a.note && !a.del);
  if (k.length) return Math.min(...k.map(a => a.x));
  return (s.cx0 || s.x0) + 3.1 * s.d;
}
function keyIsF(s) {
  return clefAt(s, (s.cx0 || s.x0) + s.d) === "F";
}
function keyPt(s, it) {
  const d = s.d;
  return {x: (s.cx0 || s.x0) + it.dx * d, y: s.bot - ((it.p - (keyIsF(s) ? 2 : 0)) * d) / 2};
}
function keySlot(pg, s, L, flat, i) {
  const it = ((KEYOV && KEYOV.items) || []).find(q => q.L === L);
  if (it && !it.auto) return keyPt(s, it);
  const d = s.d,
    p = (flat ? KFPOS : KSPOS)[L] - (keyIsF(s) ? 2 : 0);
  return {x: keyX0(pg, s) + i * 0.95 * d, y: s.bot - (p * d) / 2};
}
function keyGlyph(c, x, y, d, L, flat, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.font = `700 ${Math.round(2.6 * d)}px "Segoe UI Symbol","Apple Symbols","DejaVu Sans",sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const t = flat ? "♭" : "♯",
    dy = flat ? -0.45 * d : 0.2 * d;
  c.lineWidth = Math.max(2, 0.28 * d);
  c.strokeStyle = "#151a3b";
  c.strokeText(t, x, y + dy);
  c.fillStyle = PAL[L][1];
  c.fillText(t, x, y + dy);
  c.restore();
}
function paintKey(pg, c) {
  const K = KEYOV;
  if (!K || !K.n) return;
  for (const s of pg.staves || [])
    K.letters.forEach((L, i) => {
      const q = keySlot(pg, s, L, K.flat, i);
      keyGlyph(c, q.x, q.y, s.d, L, K.flat, 1);
    });
}
/* affichage net au zoom : on agrandit la partition 2 à 3 fois et on redessine des bords francs (le noir et le blanc sont « resserrés », les couleurs restent intactes) */
let hiT = 0;
function updHi() {
  return;
  clearTimeout(hiT);
  hiT = setTimeout(() => {
    const cv = $("cv"),
      hi = $("hi");
    if (!cv.width) {
      hi.classList.remove("on");
      return;
    }
    const W = cv.width,
      H = cv.height,
      f = Math.min(3, Math.sqrt(11e6 / (W * H)));
    if (f < 1.4) {
      hi.classList.remove("on");
      return;
    }
    const w = Math.round(W * f),
      h = Math.round(H * f);
    if (hi.width !== w || hi.height !== h) {
      hi.width = w;
      hi.height = h;
    }
    const c = hi.getContext("2d");
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(cv, 0, 0, w, h);
    try {
      const im = c.getImageData(0, 0, w, h),
        D = im.data;
      for (let i = 0; i < D.length; i += 4) {
        const r = D[i],
          g = D[i + 1],
          b = D[i + 2],
          mx = r > g ? (r > b ? r : b) : g > b ? g : b,
          mn = r < g ? (r < b ? r : b) : g < b ? g : b;
        if (mx - mn > 48) continue;
        let t = ((r + g + b) / 3 - 120) / 125;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        t = t * t * (3 - 2 * t);
        const v = Math.round(t * 255);
        D[i] = D[i + 1] = D[i + 2] = v;
      }
      c.putImageData(im, 0, 0);
      hi.classList.add("on");
    } catch (e) {
      hi.classList.remove("on");
    }
  }, 40);
}
function paint(pg, ctx) {
  paint0(pg, ctx);
  paintAcc(pg, ctx);
  paintKey(pg, ctx);
  if (ctx.canvas === $("cv")) updHi();
}
function paint0(pg, ctx) {
  const ol = $("outline").checked;
  if (!$("crisp").checked) {
    const out = new ImageData(new Uint8ClampedArray(pg.baseData.data), pg.W, pg.H),
      o = out.data,
      bd = pg.baseData.data;
    for (const n of pg.notes) {
      const c = RGB[letterOf(n)];
      for (let q = 0; q < n.idx.length; q++) {
        const p = n.idx[q] * 4,
          k = n.kind[q];
        if (k === 1 && ol) continue;
        const a = k === 2 ? 0.5 : n.t[q] / 255;
        if (!a) continue;
        for (let z = 0; z < 3; z++) o[p + z] = bd[p + z] * (1 - a) + c[z] * a;
      }
    }
    ctx.putImageData(out, 0, 0);
    return;
  }
  ctx.putImageData(pg.baseData, 0, 0);
  for (const n of pg.notes) {
    const s = n.s,
      d = s.d,
      L = letterOf(n),
      step = Math.round((s.bot - n.y) / (d / 2)),
      y = Math.abs(s.bot - (step * d) / 2 - n.y) < 0.3 * d ? s.bot - (step * d) / 2 : n.y;
    const ty = typeOf(n),
      rx = (ty === 2 ? 0.82 : 0.7) * d,
      ry = (ty === 2 ? 0.56 : 0.5) * d;
    ctx.save();
    ctx.translate(n.x, y);
    ctx.rotate(ty === 2 ? 0 : -0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = PAL[L][1];
    ctx.fill();
    if (ol) {
      ctx.lineWidth = Math.max(1.2, 0.1 * d);
      ctx.strokeStyle = "#1b1d2a";
      ctx.stroke();
    }
    if (n.hollow) {
      ctx.beginPath();
      if (ty === 2) ctx.ellipse(0, 0, rx * 0.42, ry * 0.62, 0.9, 0, Math.PI * 2);
      else ctx.ellipse(0, 0, rx * 0.5, ry * 0.36, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      if (ol) {
        ctx.lineWidth = Math.max(0.8, 0.05 * d);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

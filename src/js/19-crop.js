/* ---------- recadrage : 4 coins posés sur la page, puis remise à plat (perspective) avant l'analyse ---------- */
function cropDetect(img) {
  /* repère la page claire sur un fond plus sombre ; sinon, toute la photo */
  const S = 360,
    k = S / Math.max(img.naturalWidth, img.naturalHeight),
    w = Math.max(8, Math.round(img.naturalWidth * k)),
    h = Math.max(8, Math.round(img.naturalHeight * k)),
    c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, w, h);
  const D = x.getImageData(0, 0, w, h).data,
    g = new Float32Array(w * h),
    hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i++) {
    const v = D[i * 4] * 0.3 + D[i * 4 + 1] * 0.59 + D[i * 4 + 2] * 0.11;
    g[i] = v;
    hist[v | 0]++;
  }
  let sum = 0,
    sB = 0,
    wB = 0,
    best = 0,
    th = 128;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = w * h - wB;
    if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB,
      mF = (sum - sB) / wF,
      v = wB * wF * (mB - mF) ** 2;
    if (v > best) {
      best = v;
      th = t;
    }
  }
  /* la page : plus grande zone claire reliée au centre, après lissage */
  const m = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let X = 1; X < w - 1; X++) {
      let s = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += g[(y + a) * w + X + b];
      m[y * w + X] = s / 9 > th ? 1 : 0;
    }
  const lab = new Int32Array(w * h).fill(-1),
    sizes = [];
  let L = 0;
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    let n = 0;
    const st = [i];
    lab[i] = L;
    while (st.length) {
      const p = st.pop();
      n++;
      const px = p % w,
        py = (p / w) | 0;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        const qx = q % w;
        if (Math.abs(qx - px) > 1) continue;
        if (m[q] && lab[q] < 0) {
          lab[q] = L;
          st.push(q);
        }
      }
    }
    sizes.push(n);
    L++;
  }
  if (!sizes.length) return null;
  const big = sizes.indexOf(Math.max(...sizes));
  if (sizes[big] < w * h * 0.08) return null;
  let tl = null,
    tr = null,
    br = null,
    bl = null,
    fill = 0;
  for (let y = 0; y < h; y++)
    for (let X = 0; X < w; X++) {
      if (lab[y * w + X] !== big) continue;
      fill++;
      if (!tl || X + y < tl[0] + tl[1]) tl = [X, y];
      if (!br || X + y > br[0] + br[1]) br = [X, y];
      if (!tr || X - y > tr[0] - tr[1]) tr = [X, y];
      if (!bl || y - X > bl[1] - bl[0]) bl = [X, y];
    }
  const q = [tl, tr, br, bl].map(([X, y]) => [X / k, y / k]),
    area =
      Math.abs(
        q.reduce((s, p, i) => {
          const r = q[(i + 1) % 4];
          return s + p[0] * r[1] - r[0] * p[1];
        }, 0)
      ) / 2,
    full = img.naturalWidth * img.naturalHeight;
  /* une page doit occuper une bonne part de la photo et ressembler à un quadrilatère plein */
  if (area < full * 0.12 || fill / (w * h) < (area / full) * 0.8) return null;
  return q;
}
function cropAspect(q, w, h) {
  const u0 = w / 2,
    v0 = h / 2,
    P = p => [p[0], p[1], 1],
    m1 = P(q[0]),
    m2 = P(q[1]),
    m4 = P(q[2]),
    m3 = P(q[3]);
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const k2 = dt(cr(m1, m4), m3) / dt(cr(m2, m4), m3),
    k3 = dt(cr(m1, m4), m2) / dt(cr(m3, m4), m2);
  const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]],
    n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  if (Math.abs(n2[2]) < 1e-9 || Math.abs(n3[2]) < 1e-9) return null;
  const f2 =
    -(
      n2[0] * n3[0] -
      (n2[0] * n3[2] + n2[2] * n3[0]) * u0 +
      n2[2] * n3[2] * u0 * u0 +
      (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + n2[2] * n3[2] * v0 * v0)
    ) /
    (n2[2] * n3[2]);
  /* photo presque de face : la focale n'est pas mesurable, les proportions mesurées suffisent */
  if (!(f2 > 0)) return null;
  const f = Math.sqrt(f2),
    Q = n => {
      const x = (n[0] - u0 * n[2]) / f,
        y = (n[1] - v0 * n[2]) / f;
      return x * x + y * y + n[2] * n[2];
    };
  return Math.sqrt(Q(n2) / Q(n3));
}
function cropWarp(img, q) {
  /* remise à plat par homographie, rééchantillonnage bilinéaire */
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.max(dist(q[0], q[1]), dist(q[3], q[2])),
    H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  /* vraies proportions de la page : une photo prise en biais raccourcit la page dans le sens de l'inclinaison.
   Méthode de Zhang & He (2006) : à partir des 4 coins, on retrouve la focale puis le rapport largeur/hauteur réel. */
  {
    let r = cropAspect(q, img.naturalWidth, img.naturalHeight);
    const wm = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2,
      hm = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2,
      m = wm / hm;
    /* presque de face (côtés opposés de même longueur) : la mesure est instable, on garde les proportions vues ; sinon la correction reste raisonnable (±25 %) */
    const par = Math.max(
      Math.abs(dist(q[0], q[1]) - dist(q[3], q[2])) / wm,
      Math.abs(dist(q[0], q[3]) - dist(q[1], q[2])) / hm
    );
    if (r && isFinite(r)) {
      if (par < 0.1) r = m;
      else r = Math.max(m * 0.9, Math.min(m * 1.12, r));
    }
    if (r && isFinite(r) && r > 0.2 && r < 5) {
      if (wm / hm > r) {
        W = Math.max(W, wm);
        H = W / r;
      } else {
        H = Math.max(H, hm);
        W = H * r;
      }
    }
  }
  const cap = 3400 / Math.max(W, H);
  if (cap < 1) {
    W *= cap;
    H *= cap;
  } else {
    const up = Math.min(2, 2600 / Math.max(W, H));
    if (up > 1) {
      W *= up;
      H *= up;
    }
  }
  W = Math.round(W);
  H = Math.round(H);
  const sw = img.naturalWidth,
    sh = img.naturalHeight,
    sc = document.createElement("canvas");
  sc.width = sw;
  sc.height = sh;
  const sx = sc.getContext("2d");
  sx.drawImage(img, 0, 0);
  const S = sx.getImageData(0, 0, sw, sh).data;
  /* homographie rectangle (0..W,0..H) → quadrilatère source */
  const P = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H]
    ],
    A = [],
    B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = P[i],
      [X, Y] = q[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    B.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    B.push(Y);
  }
  for (let i = 0; i < 8; i++) {
    let p = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [B[i], B[p]] = [B[p], B[i]];
    for (let r = 0; r < 8; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      B[r] -= f * B[i];
    }
  }
  const h = B.map((v, i) => v / A[i][i]),
    dc = document.createElement("canvas");
  dc.width = W;
  dc.height = H;
  const dx = dc.getContext("2d"),
    O = dx.createImageData(W, H),
    o = O.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = h[6] * x + h[7] * y + 1,
        X = (h[0] * x + h[1] * y + h[2]) / z,
        Y = (h[3] * x + h[4] * y + h[5]) / z,
        k = (y * W + x) * 4;
      if (X < 0 || Y < 0 || X >= sw - 1 || Y >= sh - 1) {
        o[k] = o[k + 1] = o[k + 2] = 255;
        o[k + 3] = 255;
        continue;
      }
      const x0 = X | 0,
        y0 = Y | 0,
        fx = X - x0,
        fy = Y - y0,
        i00 = (y0 * sw + x0) * 4,
        i10 = i00 + 4,
        i01 = i00 + sw * 4,
        i11 = i01 + 4;
      for (let c = 0; c < 3; c++)
        o[k + c] =
          (S[i00 + c] * (1 - fx) + S[i10 + c] * fx) * (1 - fy) + (S[i01 + c] * (1 - fx) + S[i11 + c] * fx) * fy;
      o[k + 3] = 255;
    }
  }
  dx.putImageData(O, 0, 0);
  return dc;
}
function cropRotate(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalHeight;
  c.height = img.naturalWidth;
  const x = c.getContext("2d");
  x.translate(c.width, 0);
  x.rotate(Math.PI / 2);
  x.drawImage(img, 0, 0);
  return canvasImg(c);
}
function canvasImg(c) {
  return new Promise((res, rej) =>
    c.toBlob(
      b => {
        if (!b) return rej(new Error("Image illisible"));
        const i = new Image();
        i._blob = b;
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = URL.createObjectURL(b);
      },
      "image/jpeg",
      0.95
    )
  );
}
function cropUI(img0) {
  return new Promise(resolve => {
    const R = $("crop"),
      cv = $("crCv"),
      ctx = cv.getContext("2d"),
      lp = $("crLoupe"),
      lx = lp.getContext("2d");
    let img = img0,
      q,
      auto,
      drag = -1,
      box;
    const setQ = () => {
      auto = cropDetect(img);
      const w = img.naturalWidth,
        h = img.naturalHeight,
        m = 0.04;
      q = auto || [
        [w * m, h * m],
        [w * (1 - m), h * m],
        [w * (1 - m), h * (1 - m)],
        [w * m, h * (1 - m)]
      ];
      $("crSub").textContent = auto
        ? "Les coins sont posés sur la page. Ajustez-les si besoin."
        : "Faites glisser les 4 coins sur les bords de la page.";
    };
    const fit = () => {
      const r = $("crStage").getBoundingClientRect(),
        dpr = Math.min(2, devicePixelRatio || 1),
        s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      box = {
        s,
        ox: (r.width - img.naturalWidth * s) / 2,
        oy: (r.height - img.naturalHeight * s) / 2,
        w: r.width,
        h: r.height,
        dpr
      };
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      cv.style.width = r.width + "px";
      cv.style.height = r.height + "px";
      draw();
    };
    const toS = p => [box.ox + p[0] * box.s, box.oy + p[1] * box.s],
      toI = (x, y) => [(x - box.ox) / box.s, (y - box.oy) / box.s];
    const draw = () => {
      const d = box.dpr;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, box.w, box.h);
      ctx.drawImage(img, box.ox, box.oy, img.naturalWidth * box.s, img.naturalHeight * box.s);
      const P = q.map(toS);
      ctx.save();
      ctx.fillStyle = "rgba(4,6,14,.62)";
      ctx.beginPath();
      ctx.rect(0, 0, box.w, box.h);
      ctx.moveTo(...P[0]);
      for (const p of [P[3], P[2], P[1]]) ctx.lineTo(...p);
      ctx.closePath();
      ctx.fill("evenodd");
      ctx.restore();
      const gr = ctx.createLinearGradient(P[0][0], P[0][1], P[2][0], P[2][1]);
      ["#2F80FF", "#FF922E", "#35D66B", "#FF4B4B", "#FFE94A", "#A66CFF", "#FF70C8"].forEach((c, i) =>
        gr.addColorStop(i / 6, c)
      );
      ctx.strokeStyle = gr;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...P[0]);
      for (const p of [P[1], P[2], P[3]]) ctx.lineTo(...p);
      ctx.closePath();
      ctx.stroke();
      /* repères des tiers, pour aligner les portées */
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.lineWidth = 1;
      for (const t of [1 / 3, 2 / 3]) {
        const a = [P[0][0] + (P[3][0] - P[0][0]) * t, P[0][1] + (P[3][1] - P[0][1]) * t],
          b = [P[1][0] + (P[2][0] - P[1][0]) * t, P[1][1] + (P[2][1] - P[1][1]) * t];
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      }
      P.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], drag === i ? 17 : 14, 0, 7);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "rgba(0,0,0,.5)";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 4;
        ctx.strokeStyle = ["#2F80FF", "#35D66B", "#FFE94A", "#FF70C8"][i];
        ctx.stroke();
      });
    };
    const loupe = i => {
      if (i < 0) {
        lp.classList.remove("on");
        return;
      }
      const p = toS(q[i]),
        Z = 3,
        L = 120,
        d = box.dpr;
      lp.width = L * d;
      lp.height = L * d;
      lx.setTransform(d, 0, 0, d, 0, 0);
      lx.fillStyle = "#000";
      lx.fillRect(0, 0, L, L);
      const sx = q[i][0] - L / (2 * Z * box.s),
        sy = q[i][1] - L / (2 * Z * box.s),
        sz = L / (Z * box.s);
      lx.drawImage(img, sx, sy, sz, sz, 0, 0, L, L);
      lx.strokeStyle = "#fff";
      lx.lineWidth = 1.5;
      lx.beginPath();
      lx.moveTo(L / 2, L / 2 - 14);
      lx.lineTo(L / 2, L / 2 + 14);
      lx.moveTo(L / 2 - 14, L / 2);
      lx.lineTo(L / 2 + 14, L / 2);
      lx.stroke();
      lp.style.left = (p[0] < box.w / 2 ? box.w - L - 14 : 14) + "px";
      lp.style.top = (p[1] < box.h / 2 ? box.h - L - 14 : 14) + "px";
      lp.classList.add("on");
    };
    const down = e => {
      const r = cv.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top;
      let bi = -1,
        bd = 48;
      q.forEach((p, i) => {
        const s = toS(p),
          d = Math.hypot(s[0] - x, s[1] - y);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      if (bi < 0) return;
      drag = bi;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
      loupe(bi);
      draw();
    };
    const move = e => {
      if (drag < 0) return;
      const r = cv.getBoundingClientRect(),
        p = toI(e.clientX - r.left, e.clientY - r.top);
      q[drag] = [Math.max(0, Math.min(img.naturalWidth, p[0])), Math.max(0, Math.min(img.naturalHeight, p[1]))];
      loupe(drag);
      draw();
    };
    const up = () => {
      if (drag < 0) return;
      drag = -1;
      loupe(-1);
      draw();
    };
    cv.onpointerdown = down;
    cv.onpointermove = move;
    cv.onpointerup = up;
    cv.onpointercancel = up;
    const done = async res => {
      R.classList.remove("on");
      window.removeEventListener("resize", fit);
      resolve(res);
    };
    $("crRot").onclick = async () => {
      img = await cropRotate(img);
      setQ();
      fit();
    };
    $("crAll").onclick = () => {
      const w = img.naturalWidth,
        h = img.naturalHeight;
      q = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h]
      ];
      draw();
    };
    $("crSkip").onclick = () => done(img);
    $("crBack").onclick = () => done(null);
    $("crOk").onclick = async () => {
      const b = $("crOk");
      b.disabled = true;
      b.textContent = "Mise à plat…";
      await new Promise(r => setTimeout(r, 30));
      try {
        const w = img.naturalWidth,
          h = img.naturalHeight,
          isFull = q.every(
            (p, i) => Math.hypot(p[0] - [0, w, w, 0][i], p[1] - [0, 0, h, h][i]) < Math.max(w, h) * 0.005
          );
        done(isFull ? img : await canvasImg(cropWarp(img, q)));
      } catch (e) {
        done(img);
      } finally {
        b.disabled = false;
        b.textContent = "Valider";
      }
    };
    setQ();
    R.classList.add("on");
    requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
  });
}

/* ---------- vue MusiTone : une page à l'écran, lecture façon karaoké ---------- */
function mxqGeo(p) {
  const s = MXQ.item.sys[p],
    top = 186,
    bot = (MXQ.item.H || 1920) - 324,
    pxT = (bot - top - 14) / (s.window_end - s.window_start);
  return {s, Y: t => bot - (t - s.window_start) * pxT};
}
function mxqPH() {
  const st = $("mxqStage");
  if (!st) return 1920;
  const r = st.getBoundingClientRect();
  if (!r.width || !r.height) return 1920;
  return Math.round(Math.max(1300, Math.min(2600, (1080 * r.height) / r.width)) / 20) * 20;
}
function mxqFit() {
  const st = $("mxqStage"),
    c = $("mxqC");
  if (!st || !c) return null;
  const r = st.getBoundingClientRect(),
    PH = (MXQ.item && MXQ.item.H) || 1920,
    k = Math.min(r.width / 1080, r.height / PH),
    w = 1080 * k,
    h = PH * k,
    dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  c.style.width = w + "px";
  c.style.height = h + "px";
  c.style.left = (r.width - w) / 2 + "px";
  c.style.top = (r.height - h) / 2 + "px";
  {
    const hi = $("mxqHi");
    if (hi) {
      if (hi.width !== c.width || hi.height !== c.height) {
        hi.width = c.width;
        hi.height = c.height;
      }
      hi.style.width = c.style.width;
      hi.style.height = c.style.height;
      hi.style.left = c.style.left;
      hi.style.top = c.style.top;
    }
  }
  return (MXQ.fit = {k, ox: (r.width - w) / 2, oy: (r.height - h) / 2, dpr});
}
/* page p affichée ; les k premières mesures déjà jouées sont remplacées par celles de la page suivante */
function mxqRender(p, k) {
  const it = MXQ.item;
  if (!it || !MXQ.imgs || !MXQ.imgs[p]) return;
  const F = mxqFit();
  if (!F) return;
  const c = $("mxqC").getContext("2d");
  c.setTransform(F.k * F.dpr, 0, 0, F.k * F.dpr, 0, 0);
  c.drawImage(MXQ.imgs[p], 0, 0, 1080, MXQ.item.H || 1920);
  const g = mxqGeo(p);
  for (let j = 0; j < k && j < g.s.meas.length; j++) {
    const m = g.s.meas[j],
      yt = g.Y(m.start + m.len),
      yb = g.Y(m.start);
    if (MXQ.imgs[p + 1]) {
      const g2 = mxqGeo(p + 1),
        m2 = g2.s.meas[j];
      if (m2) {
        const y2t = g2.Y(m2.start + m2.len),
          y2b = g2.Y(m2.start);
        c.drawImage(MXQ.imgs[p + 1], 0, y2t, 1080, y2b - y2t, 0, yt, 1080, yb - yt);
        continue;
      }
    }
    c.fillStyle = "#080D1C";
    c.fillRect(0, yt, 1080, yb - yt);
  }
  MXQ.shown = [p, k];
  $("mxqDots").textContent = `${p + 1} / ${it.pages.length}`;
  $("mxqPrevP").disabled = p <= 0;
  $("mxqNextP").disabled = p >= it.pages.length - 1;
}
function mxqGo(p) {
  const it = MXQ.item;
  if (!it) return;
  MXQ.view = Math.max(0, Math.min(it.pages.length - 1, p));
  mxqRender(MXQ.view, 0);
}
function mxqCursor(b, idle) {
  const it = MXQ.item,
    k = $("mxqCur"),
    pb = $("mxqPlay");
  if (pb) pb.classList.toggle("on", !idle);
  if (!it || !k || !MXQ.imgs || !document.body.classList.contains("mxv")) {
    if (k) k.classList.remove("on");
    return;
  }
  const T = ((MIDI ? 0 : it.pageStart[cur] || 0) + b) * (it.ppq || 480),
    p = it.sys.findIndex(s => T >= s.window_start && T < s.window_end);
  if (p < 0) {
    k.classList.remove("on");
    return;
  }
  const g = mxqGeo(p),
    j = g.s.meas.findIndex(m => T >= m.start && T < m.start + m.len);
  if (!MXQ.shown || MXQ.shown[0] !== p || MXQ.shown[1] !== j) mxqRender(p, Math.max(0, j));
  MXQ.view = p;
  const F = MXQ.fit || mxqFit();
  k.style.top = F.oy + g.Y(T) * F.k + "px";
  k.style.left = F.ox + "px";
  k.style.width = 1080 * F.k + "px";
  k.classList.add("on");
  /* blocs en train de sonner : contour lumineux turquoise (main droite) ou fuchsia (main gauche) */
  const hc = $("mxqHi");
  if (hc) {
    const x = hc.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, hc.width, hc.height);
    if (!idle) {
      x.setTransform(F.k * F.dpr, 0, 0, F.k * F.dpr, 0, 0);
      for (const q of g.s._rects || []) {
        if (T < q.a || T >= q.b) continue;
        const col = q.hand === "right" ? "#00E5D4" : "#FF2FB3";
        x.save();
        x.shadowColor = col;
        x.shadowBlur = 22;
        x.strokeStyle = col;
        x.lineWidth = 5;
        x.beginPath();
        if (x.roundRect) x.roundRect(q.x - 2, q.y - 2, q.w + 4, q.h + 4, q.rad + 2);
        else x.rect(q.x - 2, q.y - 2, q.w + 4, q.h + 4);
        x.stroke();
        x.shadowBlur = 0;
        x.lineWidth = 2;
        x.strokeStyle = "#fff";
        x.globalAlpha = 0.7;
        x.stroke();
        x.restore();
      }
      /* touches enfoncées : la touche s'allume dans la couleur de la note, avec une étincelle sur la ligne de jeu */
      const KS = g.s._keys;
      if (KS) {
        const on = new Map();
        for (const q of g.s._rects || []) if (T >= q.a && T < q.b && KS.K[q.p]) on.set(q.p, q);
        const draw1 = (q, blk) => {
          const kk = KS.K[q.p];
          if (kk.black !== blk) return;
          const hc2 = q.hand === "right" ? "#00E5D4" : "#FF2FB3";
          x.save();
          const gr = x.createLinearGradient(0, KS.pTop, 0, KS.pTop + kk.h);
          gr.addColorStop(0, q.col);
          gr.addColorStop(0.7, q.col);
          gr.addColorStop(1, blk ? q.col : "rgba(255,255,255,.55)");
          x.globalAlpha = blk ? 0.95 : 0.9;
          x.fillStyle = gr;
          x.beginPath();
          if (blk) {
            x.roundRect
              ? x.roundRect(kk.x, KS.pTop + 2, kk.w, kk.h - 2, 6)
              : x.rect(kk.x, KS.pTop + 2, kk.w, kk.h - 2);
          } else {
            const L = KS.K[q.p - 1] && KS.K[q.p - 1].black ? KS.K[q.p - 1].x + KS.K[q.p - 1].w - kk.x + 2 : 0,
              R = KS.K[q.p + 1] && KS.K[q.p + 1].black ? kk.x + kk.w - KS.K[q.p + 1].x + 2 : 0,
              y0 = KS.pTop + 2,
              yb = KS.pTop + KS.bh + 2,
              y1 = KS.pTop + kk.h,
              X0 = kk.x,
              X1 = kk.x + kk.w;
            x.moveTo(X0 + L, y0);
            x.lineTo(X1 - R, y0);
            x.lineTo(X1 - R, yb);
            x.lineTo(X1, yb);
            x.lineTo(X1, y1 - 8);
            x.quadraticCurveTo(X1, y1, X1 - 8, y1);
            x.lineTo(X0 + 8, y1);
            x.quadraticCurveTo(X0, y1, X0, y1 - 8);
            x.lineTo(X0, yb);
            x.lineTo(X0 + L, yb);
            x.closePath();
          }
          x.fill();
          x.globalAlpha = 1;
          x.shadowColor = hc2;
          x.shadowBlur = 18;
          x.strokeStyle = hc2;
          x.lineWidth = 3;
          x.stroke();
          x.restore();
          const cx = kk.x + kk.w / 2,
            rg = x.createRadialGradient(cx, KS.pTop - 3, 0, cx, KS.pTop - 3, kk.w * 1.1);
          rg.addColorStop(0, "rgba(255,255,255,.95)");
          rg.addColorStop(0.25, q.col);
          rg.addColorStop(1, "rgba(0,0,0,0)");
          x.save();
          x.globalCompositeOperation = "lighter";
          x.fillStyle = rg;
          x.fillRect(cx - kk.w * 1.2, KS.pTop - 3 - kk.w * 1.1, kk.w * 2.4, kk.w * 2.2);
          x.restore();
        };
        for (const q of on.values()) draw1(q, false);
        for (const q of on.values()) draw1(q, true);
      }
    }
  }
}
function mxqIdle() {
  const k = $("mxqCur"),
    pb = $("mxqPlay");
  {
    const hc = $("mxqHi");
    if (hc) {
      const x = hc.getContext("2d");
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, hc.width, hc.height);
    }
  }
  if (pb) pb.classList.remove("on");
  if (POS > 0 && MXQ.item) {
    MXQ.shown = null;
    mxqCursor(POS, true);
    return;
  }
  if (k) k.classList.remove("on");
  if (MXQ.item) mxqRender(MXQ.view || 0, 0);
}
for (const [sk, bk, fk] of [
  ["mxqSeek", "mxqBack", "mxqFwd"],
  ["plSeek", "plBack", "plFwd"]
]) {
  const el = $(sk);
  el.addEventListener("pointerdown", () => {
    el.dragging = 1;
  });
  el.addEventListener("input", () => {
    const S = songNow();
    if (!S) return;
    if (!PLAY) {
      POS = (S.len * el.value) / 1000;
      seekUI();
      try {
        mxqIdle();
      } catch (e) {}
    }
  });
  el.addEventListener("change", () => {
    el.dragging = 0;
    const S = songNow();
    if (S) seekTo((S.len * el.value) / 1000);
  });
  $(bk).onclick = () => measStep(-1);
  $(fk).onclick = () => measStep(1);
}
$("plPause").onclick = () => playPause();
/* réglages MusiTone : panneau flottant au-dessus de la partition (la page ne bouge pas et n'est pas redessinée) */
$("mxqOpt").onclick = e => {
  e.stopPropagation();
  const b = document.querySelector(".mxqBar"),
    on = !b.classList.contains("open");
  b.classList.toggle("open", on);
  $("mxqOpt").classList.toggle("on", on);
  if (on) {
    const r = $("vsw").getBoundingClientRect();
    b.style.top = Math.round(r.bottom + 8) + "px";
    setTimeout(
      () =>
        document.addEventListener(
          "pointerdown",
          function f(ev) {
            if (!b.contains(ev.target) && ev.target !== $("mxqOpt") && !$("mxqOpt").contains(ev.target)) {
              b.classList.remove("open");
              $("mxqOpt").classList.remove("on");
            }
            document.removeEventListener("pointerdown", f, true);
          },
          true
        ),
      0
    );
  }
};
$("mxqSlow").onclick = () => {
  $("plSlow").click();
  $("mxqBpm").textContent = bpm;
};
$("mxqFast").onclick = () => {
  $("plFast").click();
  $("mxqBpm").textContent = bpm;
};
$("mxqPrevP").onclick = () => mxqGo((MXQ.view || 0) - 1);
$("mxqNextP").onclick = () => mxqGo((MXQ.view || 0) + 1);
{
  let sx = null;
  const st = $("mxqStage");
  st.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    sx = e.clientX;
  });
  st.addEventListener("pointerup", e => {
    if (sx == null || PLAY) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) mxqGo((MXQ.view || 0) + (dx < 0 ? 1 : -1));
  });
}
window.addEventListener("resize", () => {
  if (document.body.classList.contains("mxv") && MXQ.item && !PLAY) mxqRender(MXQ.view || 0, 0);
});
$("mxqPlay").onclick = () => playPause();
for (const ev of ["touchstart", "pointerdown", "wheel"])
  $("mxq").addEventListener(
    ev,
    () => {
      MXQ.touch = 1;
      clearTimeout(MXQ.tt);
      MXQ.tt = setTimeout(() => {
        MXQ.touch = 0;
      }, 2500);
    },
    {passive: true}
  );

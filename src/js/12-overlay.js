function drawMarks() {
  const pg = pages[cur];
  if (!pg || !pg.W) return;
  const c = $("ov").getContext("2d");
  c.clearRect(0, 0, pg.W, pg.H);
  /* changements de clé sur la ligne : trait pointillé sur toute la portée + petite clé dessinée */
  for (const st of pg.staves || [])
    (st.clefs || []).forEach((k, j) => {
      if (!j) return;
      const d = st.d,
        col = k.c === "F" ? "#7B4DFF" : "#2F80FF";
      c.save();
      c.globalAlpha = 0.9;
      c.strokeStyle = col;
      c.lineWidth = Math.max(2, 0.2 * d);
      c.setLineDash([0.55 * d, 0.4 * d]);
      c.beginPath();
      c.moveTo(k.x, st.top - 1.2 * d);
      c.lineTo(k.x, st.bot + 1.2 * d);
      c.stroke();
      c.setLineDash([]);
      const r = 1.15 * d,
        cy = st.bot + 2.6 * d;
      c.fillStyle = col;
      c.beginPath();
      c.arc(k.x, cy, r, 0, 7);
      c.fill();
      c.fillStyle = "#fff";
      c.font = `bold ${1.75 * d}px 'Apple Symbols','Segoe UI Symbol','Noto Music','DejaVu Sans',serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(k.c === "F" ? "𝄢" : "𝄞", k.x, cy + (k.c === "F" ? 0.05 * d : 0.1 * d));
      c.restore();
    });
  /* altérations ajoutées à la main (exceptions) : petit signe devant la note */
  for (const n of pg.notes || []) {
    if (n.accOv == null) continue;
    const d = n.s.d,
      t = n.accOv > 0 ? "♯" : n.accOv < 0 ? "♭" : "♮";
    c.save();
    c.font = `bold ${1.9 * d}px 'Apple Symbols','Segoe UI Symbol','DejaVu Sans',serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = Math.max(2, 0.22 * d);
    c.strokeStyle = "#fff";
    c.strokeText(t, n.x - 1.7 * d, n.y + (n.accOv < 0 ? -0.25 * d : 0));
    c.fillStyle = PAL[letterOf(n)][1];
    c.fillText(t, n.x - 1.7 * d, n.y + (n.accOv < 0 ? -0.25 * d : 0));
    c.restore();
  }
  if ($("susT").checked && pg.sus)
    for (const u of pg.sus) {
      const d = u.s.d;
      c.save();
      c.setLineDash([d * 0.35, d * 0.25]);
      c.lineWidth = Math.max(2, 0.16 * d);
      c.strokeStyle = "#e8590c";
      c.beginPath();
      c.ellipse(u.x, u.y, d * 1.05, d * 0.85, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  if (sel && sel.box) {
    const [a, b, c2, e] = sel.box;
    c.save();
    c.setLineDash([12, 8]);
    c.lineWidth = Math.max(2, pg.W / 600);
    c.strokeStyle = "#2F80FF";
    c.strokeRect(a, b, c2 - a, e - b);
    c.restore();
  }
  if (sel && sel.kind === "key") {
    const L = curLetter(),
      d = sel.s.d,
      it = {...sel.kIt};
    if (L !== it.L) {
      let best = it.p,
        bd = 99;
      for (let q = it.p - 7; q <= it.p + 7; q++)
        if ((((2 + q) % 7) + 7) % 7 === L && Math.abs(q - it.p) < bd) {
          bd = Math.abs(q - it.p);
          best = q;
        }
      it.p = best;
    }
    const q = keyPt(sel.s, it);
    keyGlyph(c, q.x, q.y, d, L, sel.kflat, 0.6);
    c.save();
    c.lineWidth = Math.max(3, 0.22 * d);
    c.strokeStyle = "#fff";
    c.beginPath();
    c.ellipse(q.x, q.y - (sel.kflat ? 0.4 * d : 0), d * 0.95, d * 1.5, 0, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = Math.max(2, 0.13 * d);
    c.strokeStyle = "#1b1d2a";
    c.stroke();
    c.restore();
  } else if (sel && sel.kind === "acc") {
    const [a, b, c2, e] = sel.n.box,
      d = sel.s.d,
      m = 0.3 * d;
    c.save();
    c.lineWidth = Math.max(3, 0.22 * d);
    c.strokeStyle = "#fff";
    c.strokeRect(a - m, b - m, c2 - a + 2 * m, e - b + 2 * m);
    c.lineWidth = Math.max(2, 0.13 * d);
    c.strokeStyle = "#1b1d2a";
    c.strokeRect(a - m, b - m, c2 - a + 2 * m, e - b + 2 * m);
    c.restore();
  } else if (sel && sel.s && sel.kind !== "zone") {
    const hasN = (sel.kind === "note" || sel.kind === "sus") && sel.n,
      d = sel.s.d,
      x = hasN ? sel.n.x : sel.x,
      y = snapY(sel.s, hasN ? sel.n.y : sel.y);
    /* « note oubliée ? » : on montre aussi la couleur choisie, en transparence, comme pour une note ajoutée */
    if (
      sel.kind === "ghost" ||
      sel.kind === "sus" ||
      (sel.kind === "note" && (sel.pend != null || sel.pendT != null))
    ) {
      c.save();
      c.translate(x, y);
      c.rotate(-0.35);
      c.globalAlpha = sel.kind === "note" ? 0.92 : 0.6;
      c.fillStyle = PAL[curLetter()][1];
      c.beginPath();
      c.ellipse(0, 0, 0.7 * d, 0.5 * d, 0, 0, Math.PI * 2);
      /* blanche / ronde : une tête évidée (anneau coloré, centre transparent) */
      const gt = curType();
      if (gt === 2) {
        c.rotate(0.35);
        c.beginPath();
        c.ellipse(0, 0, 0.82 * d, 0.56 * d, 0, 0, Math.PI * 2);
        c.ellipse(0, 0, 0.34 * d, 0.35 * d, 0.9, 0, Math.PI * 2, true);
        c.fill("evenodd");
      } else if (gt === 1) {
        c.ellipse(0, 0, 0.42 * d, 0.22 * d, 0, 0, Math.PI * 2, true);
        c.fill("evenodd");
      } else c.fill();
      c.restore();
    }
    c.save();
    c.lineWidth = Math.max(3, 0.22 * d);
    c.strokeStyle = "#fff";
    c.beginPath();
    c.ellipse(x, y, d * 1.15, d * 0.9, 0, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = Math.max(2, 0.13 * d);
    c.strokeStyle = "#1b1d2a";
    c.stroke();
    c.restore();
  }
  if (props)
    for (const p of props) {
      const d = p.s.d,
        y = snapY(p.s, p.y);
      c.save();
      c.translate(p.x, y);
      c.rotate(-0.35);
      c.beginPath();
      c.ellipse(0, 0, 0.7 * d, 0.5 * d, 0, 0, Math.PI * 2);
      c.globalAlpha = 0.5;
      c.fillStyle = PAL[letterOf({s: p.s, x: p.x, y: p.y, ov: null})][1];
      c.fill();
      c.globalAlpha = 1;
      c.setLineDash([d * 0.3, d * 0.2]);
      c.lineWidth = Math.max(2, 0.12 * d);
      c.strokeStyle = "#2F80FF";
      c.stroke();
      c.restore();
    }
  if ($("gridT").checked) drawGrid(pg, c);
  if ($("susT").checked && pg.badMeas)
    for (const m of pg.badMeas) {
      const s = m.s,
        d = s.d;
      c.save();
      c.setLineDash([d * 0.5, d * 0.3]);
      c.lineWidth = Math.max(2, 0.14 * d);
      c.strokeStyle = "#e8590c";
      c.strokeRect(m.a + 0.2 * d, s.top - 2.2 * d, m.b - m.a - 0.4 * d, s.bot - s.top + 4.4 * d);
      c.setLineDash([]);
      c.font = `700 ${Math.round(0.9 * d)}px Nunito,sans-serif`;
      c.fillStyle = "#e8590c";
      c.textAlign = "left";
      c.fillText(
        `${String(m.tot).replace(".", ",")} temps au lieu de ${String(pg.measExp).replace(".", ",")} ?`,
        m.a + 0.4 * d,
        s.top - 2.5 * d
      );
      c.restore();
    }
  if (!$("marks").checked) return;
  c.lineWidth = Math.max(1, pg.W / 1200);
  c.strokeStyle = "rgba(47,128,255,.8)";
  for (const s of pg.staves)
    for (const y of s.ys) {
      c.beginPath();
      c.moveTo(s.x0, y);
      c.lineTo(s.x1, y);
      c.stroke();
    }
  c.font = `700 ${Math.round(pg.staves[0]?.d * 0.9 || 14)}px Nunito,sans-serif`;
  c.textAlign = "center";
  for (const n of pg.notes) {
    const [a, b, x, y] = n.box;
    c.strokeStyle = "#1b1d2a";
    c.lineWidth = Math.max(1.5, pg.W / 900);
    c.strokeRect(a - 2, b - 2, x - a + 4, y - b + 4);
    c.fillStyle = "#1b1d2a";
    c.fillText(PAL[letterOf(n)][0], n.x, b - 6);
  }
}
/* grille : chaque ligne de portée et chaque interligne (plus 3 lignes supplémentaires dessus/dessous) dans la couleur de la note qui s'y place */
function drawGrid(pg, c) {
  for (const s of pg.staves) {
    const d = s.d,
      ks = (s.clefs && s.clefs.length ? s.clefs : [{x: s.x0, c: s.c0}]).slice().sort((a, b) => a.x - b.x);
    ks.forEach((k, i) => {
      const xa = i ? Math.max(s.x0, k.x) : s.x0,
        xb = i < ks.length - 1 ? Math.max(s.x0, ks[i + 1].x) : s.x1,
        base = k.c === "G" ? 2 : 4;
      for (let st = -6; st <= 14; st++) {
        const y = s.bot - (st * d) / 2,
          L = (((base + st) % 7) + 7) % 7,
          line = st % 2 === 0,
          inStaff = st >= 0 && st <= 8;
        c.save();
        c.strokeStyle = PAL[L][1];
        c.globalAlpha = inStaff ? (line ? 0.95 : 0.6) : 0.4;
        c.lineWidth = line ? Math.max(2, 0.16 * d) : Math.max(1, 0.08 * d);
        if (!line || !inStaff) c.setLineDash(line ? [0.6 * d, 0.3 * d] : [0.25 * d, 0.25 * d]);
        c.beginPath();
        c.moveTo(xa, y);
        c.lineTo(xb, y);
        c.stroke();
        c.restore();
      }
    });
  }
}
function applyZoom() {
  const pg = pages[cur],
    vw = $("view").clientWidth - 2,
    base = Math.min(1, vw / pg.W);
  $("stage").style.width = Math.round(pg.W * base * zoom) + "px";
  $("zlab").textContent = Math.round(zoom * 100) + " %";
}

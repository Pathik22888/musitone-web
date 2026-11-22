function kpKey() {
  const L = [...new Set(KP.items.map(i => i.L))],
    SO = [3, 0, 4, 1, 5, 2, 6],
    FO = [6, 2, 5, 1, 4, 0, 3],
    o = KP.flat ? FO : SO;
  L.sort((a, b) => o.indexOf(a) - o.indexOf(b));
  return {n: L.length, flat: KP.flat, letters: L};
}
function kpIsStd(K) {
  const o = K.flat ? [6, 2, 5, 1, 4, 0, 3] : [3, 0, 4, 1, 5, 2, 6];
  return K.letters.every((L, i) => L === o[i]);
}
function kpDraw() {
  const K = kpKey(),
    COLS = PAL.map(p => p[1]);
  let g = `<rect x="0" y="0" width="300" height="110" fill="transparent"/>`;
  for (let i = 0; i < 5; i++)
    g += `<line x1="10" x2="290" y1="${kpY(i * 2)}" y2="${kpY(i * 2)}" stroke="#151a3b" stroke-width="1.3"/>`;
  g += `<text x="16" y="${kpY(2) + 21}" font-size="62" font-family="serif" fill="#151a3b">𝄞</text>`;
  KP.items.forEach((it, i) => {
    const Y = kpY(it.p),
      fl = KP.flat,
      c = COLS[it.L];
    if (i === KP.sel)
      g += `<rect x="${it.x - 15}" y="${Y - 22}" width="30" height="40" rx="8" fill="none" stroke="#151a3b" stroke-width="2" stroke-dasharray="4 3"/>`;
    g += `<text x="${it.x}" y="${Y + (fl ? 6 : 10)}" text-anchor="middle" font-size="${fl ? 36 : 32}" font-weight="700" fill="${c}" stroke="${c}" stroke-width=".7">${fl ? "♭" : "♯"}</text>`;
  });
  if (!KP.items.length)
    g += `<text x="175" y="${kpY(4) + 5}" text-anchor="middle" font-size="13" fill="#7a7f98" font-family="Figtree,sans-serif">Rien après la clé ? Laisse vide.</text>`;
  $("kpStaff").innerHTML = g;
  document
    .querySelectorAll("#kpSeg button")
    .forEach(b => b.classList.toggle("on", (b.dataset.t === "b") === KP.flat));
  const it = KP.items[KP.sel];
  $("kpDel").disabled = !it;
  $("kpPal").classList.toggle("on", !!it);
  $("kpPal").innerHTML = PAL.map(
    (p, k) =>
      `<button data-l="${k}" class="${it && it.L === k ? "cur" : ""}" style="background:${p[1]}">${p[0]}${KP.flat ? "♭" : "♯"}</button>`
  ).join("");
  $("kpHelp").textContent = it
    ? "Mauvaise couleur ? Choisissez la bonne note ci-dessous."
    : "Touchez la portée à la même hauteur que sur votre partition pour poser le signe.";
  const c = $("kpC"),
    r = window.devicePixelRatio || 1,
    H = 44,
    Wd = Math.round(H * 0.36 * 7 + 6);
  c.width = Wd * r;
  c.height = (H + 6) * r;
  c.style.width = Wd + "px";
  c.style.height = H + 6 + "px";
  const x = c.getContext("2d");
  x.setTransform(r, 0, 0, r, 0, 0);
  x.clearRect(0, 0, Wd, H + 6);
  drawKeys(x, 3, 3, H, K);
  if (kpIsStd(K)) {
    const nm = keyName(K);
    $("kpT").textContent = nm.maj;
    $("kpS").textContent =
      "ou " +
      nm.min +
      (K.n ? " · " + K.letters.map(L => PAL[L][0] + (K.flat ? "♭" : "♯")).join(" ") : " · que des touches blanches");
  } else {
    $("kpT").textContent = "Gamme personnalisée";
    $("kpS").textContent = K.letters.map(L => PAL[L][0] + (K.flat ? "♭" : "♯")).join(" ");
  }
}
function kpOrig() {
  const pg = pages[cur],
    c = $("kpO"),
    src = $("cv");
  const s = pg && pg.staves && pg.staves[0];
  if (!s || !src.width) {
    c.parentNode.style.display = "none";
    return;
  }
  c.parentNode.style.display = "";
  const d = s.d,
    x0 = Math.max(0, Math.round((s.cx0 || s.x0) - 1.2 * d)),
    w = Math.min(src.width - x0, Math.round(14 * d)),
    y0 = Math.max(0, Math.round(s.top - 3 * d)),
    h = Math.min(src.height - y0, Math.round(s.bot - s.top + 6 * d));
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(src, x0, y0, w, h, 0, 0, w, h);
  c.style.maxHeight = "110px";
  c.style.width = "auto";
  c.style.maxWidth = "100%";
}
function kpOpen() {
  const K = keyOf(pages[cur]);
  KP.flat = !!K.flat;
  KP.items = K.letters.map((L, i) => ({L, p: (K.flat ? KP_FP : KP_SP)[L], x: 72 + i * 28}));
  KP.sel = -1;
  kpOrig();
  kpDraw();
  $("kp").hidden = false;
}
$("keyBar").onclick = kpOpen;
$("keyBar").onkeydown = e => {
  if (e.key === "Enter" || e.key === " ") kpOpen();
};
$("kpStaff").onclick = e => {
  const sv = $("kpStaff"),
    r = sv.getBoundingClientRect(),
    X = ((e.clientX - r.left) * 300) / r.width,
    Y = ((e.clientY - r.top) * 110) / r.height;
  const hit = KP.items.findIndex(it => Math.abs(it.x - X) < 16 && Math.abs(kpY(it.p) - Y) < 22);
  if (hit >= 0) {
    KP.sel = hit === KP.sel ? -1 : hit;
    kpDraw();
    return;
  }
  if (X < 58) return;
  const p = Math.max(-2, Math.min(11, Math.round((KBASE - Y) / (KSP / 2)))),
    L = kpL(p);
  const ex = KP.items.findIndex(it => it.L === L);
  if (ex >= 0) {
    KP.sel = ex;
    kpDraw();
    return;
  }
  const nx = KP.items.length ? Math.max(...KP.items.map(i => i.x)) + 28 : 72;
  KP.items.push({L, p, x: Math.min(nx, 280)});
  KP.sel = KP.items.length - 1;
  kpDraw();
};
document.querySelectorAll("#kpSeg button").forEach(
  b =>
    (b.onclick = () => {
      KP.flat = b.dataset.t === "b";
      kpDraw();
    })
);
$("kpPal").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  const it = KP.items[KP.sel];
  if (!it) return;
  const L = +b.dataset.l;
  if (KP.items.some((o, i) => i !== KP.sel && o.L === L)) return;
  it.L = L;
  let p = it.p;
  while (kpL(p) !== L) p++;
  if (p > 11) p -= 7;
  it.p = p;
  kpDraw();
};
$("kpDel").onclick = () => {
  if (KP.sel < 0) return;
  KP.items.splice(KP.sel, 1);
  KP.items.forEach((it, i) => (it.x = 72 + i * 28));
  KP.sel = -1;
  kpDraw();
};
$("kpX").onclick = () => {
  $("kp").hidden = true;
};
$("kp").onclick = e => {
  if (e.target === $("kp")) $("kp").hidden = true;
};
$("kpAuto").onclick = () => {
  KEYOV = null;
  $("keySel").value = "auto";
  $("kp").hidden = true;
  try {
    cachePng();
    updKeyBar();
  } catch (e) {}
};
$("kpOk").onclick = () => {
  const K = kpKey();
  KEYOV = {n: K.n, flat: K.flat, letters: K.letters, src: "choix"};
  $("kp").hidden = true;
  try {
    cachePng();
    updKeyBar();
  } catch (e) {}
};
let keyGuide = false;
function keyMode(on, guide) {
  if (on && typeof setView === "function") setView("c");
  document.body.classList.toggle("keymode", on);
  closeSheet();
  hideHint();
  if (!on) {
    $("kmPal").classList.remove("on");
    document.body.classList.remove("editing");
  }
  if (on) {
    keyMode.z0 = {z: zoom, l: $("view").scrollLeft, t: $("view").scrollTop};
    keyGuide = !!guide;
    {
      const g = pages[cur] && pages[cur].ksig;
      if (guide && !KEYOV && g && g.n > 0) {
        const o = g.flat ? KFO : KSO,
          L = o.slice(0, g.n);
        KEYOV = {
          n: g.n,
          flat: g.flat,
          letters: L,
          items: L.map(l => ({L: l, p: (g.flat ? KFPOS : KSPOS)[l], auto: true})),
          src: "auto"
        };
        kmFlat = g.flat;
        try {
          refresh();
        } catch (e) {}
      }
    }
    $("kmStep").hidden = !keyGuide;
    $("kmT").textContent = keyGuide ? "Les ♯ ou ♭ de votre partition" : "Les ♯ et ♭ du début";
    $("kmS").textContent = "Ils sont juste après la clé, ci-dessous.";
    const pg = pages[cur],
      s = pg.staves[0];
    if (s) {
      setTimeout(() => {
        try {
          keyFrame(pg);
        } catch (e) {}
      }, 60);
      setTimeout(() => {
        try {
          keyFrame(pg);
        } catch (e) {}
      }, 420);
      if (false) {
        const h = document.createElement("div");
        h.className = "tapHint";
        h.style.left = ((keyX0(pg, s) + 0.6 * s.d) / pg.W) * 100 + "%";
        h.style.top = ((s.top + 0.8 * s.d) / pg.H) * 100 + "%";
        $("stage").appendChild(h);
      }
    }
  } else {
    const z0 = keyMode.z0;
    if (z0) {
      keyMode.z0 = null;
      zoom = z0.z;
      applyZoom();
      const v = $("view");
      v.scrollLeft = z0.l;
      v.scrollTop = z0.t;
    }
    if (keyGuide) {
      keyGuide = false;
      setTimeout(() => coach(false), 250);
    }
  }
}

/* étape 2 : le début de la première ligne (clé + ♯/♭, les deux mains) est cadré en entier, au centre de la partie visible au-dessus du panneau */
function keyFrame(pg) {
  if (!document.body.classList.contains("keymode") || !pg || pages[cur] !== pg) return;
  const st = pg.staves,
    s = st[0];
  if (!s) return;
  const d = s.d;
  let last = s;
  if (st[1] && st[1].top - s.bot < 7 * d) last = st[1];
  const kx = Math.max(keyX0(pg, s), last !== s ? keyX0(pg, last) : 0),
    x0 = Math.max(0, s.x0 - 1.2 * d),
    x1 = Math.min(pg.W, kx + 8.5 * d),
    y0 = Math.max(0, s.top - 3.2 * d),
    y1 = Math.min(pg.H, last.bot + 3.2 * d);
  const v = $("view"),
    vr = v.getBoundingClientRect(),
    P = $("kmPal"),
    pt = P.classList.contains("on") ? P.getBoundingClientRect().top : vr.bottom,
    top = Math.max(vr.top, 0),
    bot = Math.min(vr.bottom, pt) - 8,
    aw = vr.width - 16,
    ah = Math.max(80, bot - top);
  let r = $("cv").getBoundingClientRect();
  const k = Math.min(aw / (((x1 - x0) / pg.W) * r.width), ah / (((y1 - y0) / pg.H) * r.height));
  let z = zoom * k;
  z = Math.min(z, zoom * (46 / ((d * r.width) / pg.W)));
  if (Math.abs(z / zoom - 1) > 0.03) zoomAt(z, r.left, r.top);
  r = $("cv").getBoundingClientRect();
  const cx = r.left + ((x0 + x1) / 2 / pg.W) * r.width,
    cy = r.top + ((y0 + y1) / 2 / pg.H) * r.height;
  v.scrollLeft += cx - (vr.left + vr.width / 2);
  v.scrollTop += cy - (top + ah / 2);
}
let kmFlat = false;
function kmRender() {
  const K = KEYOV || {n: 0, flat: kmFlat, letters: []};
  if (K.n) kmFlat = !!K.flat;
  const t = kmFlat ? "♭" : "♯",
    ord = kmFlat ? KFO : KSO,
    pos = kmFlat ? KFPOS : KSPOS;
  $("kmKT")
    .querySelectorAll("button")
    .forEach(b => b.classList.toggle("cur", (b.dataset.k === "b") === kmFlat));
  const g = 26,
    top = 60,
    bot = top + 4 * g,
    X0 = 116,
    dx = 62;
  let o = "";
  /* signes dessinés (et non des caractères de police) : même taille et même position sur tous les téléphones */
  const sharp = (x, y, f, st) => {
    const v = 0.27 * g,
      h = 1.42 * g,
      bt = 0.3 * g,
      sl = 0.17 * g,
      w = 0.62 * g,
      bar = yy =>
        `<path d="M${x - w} ${yy + sl - bt / 2}L${x + w} ${yy - sl - bt / 2}V${yy - sl + bt / 2}L${x - w} ${yy + sl + bt / 2}Z"/>`;
    return `<g fill="${f}" stroke="${st}" stroke-width="${st === "none" ? 0 : 1.8}" paint-order="stroke"><rect x="${x - v - 1.7}" y="${y - h + 0.12 * g}" width="3.4" height="${2 * h}" rx="1.4"/><rect x="${x + v - 1.7}" y="${y - h - 0.12 * g}" width="3.4" height="${2 * h}" rx="1.4"/>${bar(y - 0.42 * g)}${bar(y + 0.42 * g)}</g>`;
  };
  const flat = (x, y, f, st) => {
    const sx = x - 0.32 * g;
    return (
      `<g fill="${f}" stroke="${st}" stroke-width="${st === "none" ? 0 : 1.8}" paint-order="stroke"><rect x="${sx - 1.8}" y="${y - 2.25 * g}" width="3.6" height="${2.78 * g}" rx="1.4"/>` +
      `<path fill-rule="evenodd" d="M${sx} ${y + 0.52 * g}C${sx + 0.25 * g} ${y + 0.32 * g} ${x + 0.78 * g} ${y - 0.02 * g} ${x + 0.52 * g} ${y - 0.42 * g}C${x + 0.3 * g} ${y - 0.72 * g} ${sx + 0.12 * g} ${y - 0.42 * g} ${sx} ${y - 0.2 * g}Z M${sx + 0.06 * g} ${y + 0.26 * g}C${sx + 0.25 * g} ${y + 0.08 * g} ${x + 0.36 * g} ${y - 0.14 * g} ${x + 0.3 * g} ${y - 0.34 * g}C${x + 0.22 * g} ${y - 0.5 * g} ${sx + 0.12 * g} ${y - 0.24 * g} ${sx + 0.06 * g} ${y - 0.06 * g}Z"/></g>`
    );
  };
  for (let i = 0; i < 5; i++) o += `<path d="M10 ${top + i * g}H550" stroke="#151a3b" stroke-width="2"/>`;
  o += `<text x="14" y="${top + 3.6 * g}" font-size="${5.4 * g}" font-family="serif" fill="#151a3b">𝄞</text>`;
  ord.forEach((L, i) => {
    const on = K.letters.includes(L),
      x = X0 + i * dx,
      y = bot - (pos[L] * g) / 2,
      c = PAL[L][1],
      nm = PAL[L][0];
    o += `<g data-l="${L}" style="cursor:pointer"><rect x="${x - dx / 2 + 3}" y="2" width="${dx - 6}" height="284" rx="16" fill="${on ? c + "26" : "rgba(0,0,0,0)"}" stroke="${on ? c : "#dfe3ee"}" stroke-width="${on ? 3 : 1.4}" ${on ? "" : 'stroke-dasharray="5 5"'}/>`;
    /* petite ligne guide qui montre la ligne ou l'interligne visé */
    o += `<path d="M${x - dx / 2 + 8} ${y}H${x + dx / 2 - 8}" stroke="${on ? c : "#c9cede"}" stroke-width="${on ? 3 : 2}" stroke-linecap="round" opacity="${on ? 0.9 : 0.6}"/>`;
    o += kmFlat
      ? flat(x, y, on ? c : "#9aa0b6", on ? "#151a3b" : "none")
      : sharp(x, y, on ? c : "#9aa0b6", on ? "#151a3b" : "none");
    o += `<text x="${x}" y="${bot + 1.75 * g}" text-anchor="middle" font-size="26" font-weight="800" font-family="Figtree,sans-serif" fill="${on ? (L === 4 ? "#8c7d00" : c) : "#8f95ab"}">${nm}${t}</text>`;
    o += on
      ? `<circle cx="${x}" cy="${bot + 3.25 * g}" r="15" fill="${c}"/><path d="M${x - 7} ${bot + 3.25 * g}l5 5 10-10.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle cx="${x}" cy="${bot + 3.25 * g}" r="15" fill="none" stroke="#cfd3e0" stroke-width="2.4"/>`;
    o += `</g>`;
  });
  $("kmSv").innerHTML = o;
  $("kmHint").innerHTML = K.n
    ? `${K.src === "auto" ? "L’appli a lu " : ""}<b>${K.n} ${kmFlat ? "bémol" : "dièse"}${K.n > 1 ? "s" : ""}</b> → ${keyName(K).maj}. Pareil que sur votre partition ? Touchez <b>Terminé</b>.`
    : `Regardez juste après la clé sur votre partition, puis touchez les mêmes signes ici. Aucun ? Touchez <b>Aucun</b>.`;
}
function kmShow() {
  const on = document.body.classList.contains("keymode") && !sel;
  $("kmPal").classList.toggle("on", on);
  if (on) {
    kmRender();
    document.body.classList.add("editing");
    document.documentElement.style.setProperty("--sheetH", $("kmPal").offsetHeight + "px");
  } else if (!document.body.classList.contains("keymode")) $("kmPal").classList.remove("on");
}
$("kmKT").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const f = b.dataset.k === "b";
  if (f === kmFlat) return;
  kmFlat = f;
  if (KEYOV && KEYOV.n) {
    KEYOV = null;
    refresh();
  }
  kmRender();
});
$("kmSv").addEventListener("click", e => {
  const g = e.target.closest("[data-l]");
  if (!g) return;
  kmToggle(+g.dataset.l);
});
function kmToggle(L) {
  let K = KEYOV
    ? {...KEYOV, items: (KEYOV.items || []).slice(), letters: KEYOV.letters.slice()}
    : {n: 0, flat: kmFlat, letters: [], items: []};
  if (K.letters.includes(L)) {
    K.letters = K.letters.filter(q => q !== L);
    K.items = K.items.filter(q => q.L !== L);
  } else {
    K.letters.push(L);
    K.items.push({L, p: (kmFlat ? KFPOS : KSPOS)[L], auto: true});
  }
  K.flat = kmFlat;
  const o = kmFlat ? KFO : KSO;
  K.letters.sort((a, b) => o.indexOf(a) - o.indexOf(b));
  K.n = K.letters.length;
  K.src = "choix";
  KEYOV = K.n ? K : null;
  hideHint();
  refresh();
  kmRender();
  kmShow();
}
$("keyBar").onclick = () => {};
$("kmDone").onclick = () => keyMode(false);
$("kmNone").onclick = () => {
  KEYOV = null;
  refresh();
  keyMode(false);
};

/* ===== JOUER : l'appli attend que l'élève joue la bonne note sur son piano (micro), ou sur le clavier de l'écran ===== */
const PR = {
  on: false,
  G: [],
  k: 0,
  hand: "both",
  mic: null,
  an: null,
  st: null,
  raf: 0,
  ok: 0,
  lastOn: 0,
  fl: [],
  win: 0,
  acc: null
};
const PCN = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"],
  PCL = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function prGroups() {
  const S = songNow();
  if (!S) return [];
  const by = new Map();
  for (const e of S.ev) {
    if (PR.hand === "r" && e.hand) continue;
    if (PR.hand === "l" && !e.hand) continue;
    const k = Math.round(e.t * 1000);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, evs]) => ({t: k / 1000, evs, pcs: [...new Set(evs.map(e => ((e.m % 12) + 12) % 12))]}));
}
function prColor(pc) {
  return PAL[PCL[pc]][1];
}
function prOpen() {
  if (!pages[cur] || !pages[cur].notes) {
    toast("Ouvrez d'abord une partition");
    return;
  }
  closeTransient();
  try {
    playStop();
  } catch (e) {}
  try {
    if (document.body.classList.contains("mxv")) setView("c");
  } catch (e) {}
  PR.on = true;
  document.body.classList.add("practice");
  PR.G = prGroups();
  PR.k = 0;
  PR.ok = 0;
  if (!PR.G.length) {
    toast("Aucune note à jouer");
    prClose();
    return;
  }
  let P = $("prPanel");
  if (!P) {
    P = document.createElement("div");
    P.id = "prPanel";
    P.className = "prPanel";
    P.innerHTML = `<div class="prTop"><span class="prMic" id="prMic"><i></i><b id="prMicT">Micro…</b></span><span class="prPos" id="prPos"></span><button type="button" id="prX" class="prX">Terminé</button></div>
    <div class="prNow"><small>Jouez</small><div id="prNeed" class="prNeed"></div></div>
    <div class="prHands" id="prHands"><button data-h="both" class="cur">Les deux mains</button><button data-h="r">Main droite</button><button data-h="l">Main gauche</button></div>
    <div class="prNav"><button type="button" id="prPrev" aria-label="Note précédente">‹ Revenir</button><button type="button" id="prSkip" aria-label="Passer cette note">Passer ›</button></div>`;
    document.body.appendChild(P);

    $("prX").onclick = prClose;
    $("prMic").onclick = () => {
      if (!PR.an) prMicStart();
    };
    $("prPrev").onclick = () => {
      PR.k = Math.max(0, PR.k - 1);
      PR.tap = null;
      prShow();
    };
    $("prSkip").onclick = () => prNext(false);
    $("prHands").onclick = e => {
      const b = e.target.closest("[data-h]");
      if (!b) return;
      PR.hand = b.dataset.h;
      $("prHands")
        .querySelectorAll("button")
        .forEach(x => x.classList.toggle("cur", x === b));
      const t = PR.G[PR.k] ? PR.G[PR.k].t : 0;
      PR.G = prGroups();
      PR.k = Math.max(
        0,
        PR.G.findIndex(g => g.t >= t - 1e-6)
      );
      prShow();
    };
  }
  P.hidden = false;
  prShow();
  prMicStart();
}
function prClose() {
  PR.on = false;
  document.body.classList.remove("practice");
  const P = $("prPanel");
  if (P) P.hidden = true;
  cancelAnimationFrame(PR.raf);
  try {
    PR.st && PR.st.getTracks().forEach(t => t.stop());
  } catch (e) {}
  PR.st = null;
  PR.an = null;
  try {
    drawMarks();
  } catch (e) {}
}
function prTap(pc) {
  const g = PR.G[PR.k];
  if (!g) return;
  PR.tap = PR.tap || new Set();
  if (!g.pcs.includes(pc)) {
    prWrong();
    return;
  }
  PR.tap.add(pc);
  if (g.pcs.every(p => PR.tap.has(p))) prNext(true);
  else prShow();
}
function prWrong() {
  const n = $("prNeed");
  if (n) {
    n.classList.remove("no");
    void n.offsetWidth;
    n.classList.add("no");
  }
}
async function prNext(good) {
  if (good) PR.ok++;
  PR.tap = null;
  PR.k++;
  if (PR.k >= PR.G.length) {
    if (cur < pages.length - 1) {
      toast("Page suivante");
      PR.turning = true;
      try {
        await show(cur + 1);
      } finally {
        PR.turning = false;
      }
      if (!PR.on) return;
      document.body.classList.add("practice");
      $("prPanel").hidden = false;
      PR.G = prGroups();
      PR.k = 0;
      prShow();
      return;
    }
    toast(`Bravo ! Morceau terminé (${PR.ok} sur ${PR.G.length} du premier coup)`);
    PR.k = 0;
    PR.ok = 0;
  }
  prShow();
}
function prShow() {
  const g = PR.G[PR.k];
  if (!g) return;
  $("prPos").textContent = `${PR.k + 1} / ${PR.G.length}` + (pages.length > 1 ? ` · page ${cur + 1}` : "");
  $("prNeed").innerHTML = g.pcs
    .map(pc => `<span class="${PR.tap && PR.tap.has(pc) ? "done" : ""}" style="--c:${prColor(pc)}">${PCN[pc]}</span>`)
    .join("");
  try {
    drawMarks();
    const c = $("ov").getContext("2d"),
      pg = pages[cur];
    for (const e of g.evs) {
      const n = e.n;
      if (!n || !n.s) continue;
      const d = n.s.d;
      c.save();
      c.lineWidth = Math.max(4, 0.34 * d);
      c.strokeStyle = PAL[letterOf(n)][1];
      c.shadowColor = PAL[letterOf(n)][1];
      c.shadowBlur = 1.4 * d;
      c.beginPath();
      c.ellipse(n.x, n.y, 1.35 * d, 1.05 * d, -0.35, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    const S = songNow(),
      cu = cursorAt(S, g.t);
    if (cu) {
      c.save();
      c.fillStyle = "rgba(0,200,224,.12)";
      c.fillRect(cu.x - 1.6 * cu.y.d, cu.y.top, 3.2 * cu.y.d, cu.y.bot - cu.y.top);
      c.restore();
      const r = $("cv").getBoundingClientRect(),
        v = $("view"),
        vr = v.getBoundingClientRect(),
        sx = r.left + (cu.x / pg.W) * r.width,
        y0 = r.top + (cu.y.top / pg.H) * r.height,
        y1 = r.top + (cu.y.bot / pg.H) * r.height,
        pb = $("prPanel").getBoundingClientRect().top;
      if (sx < vr.left + 30 || sx > vr.right - 40)
        v.scrollBy({left: sx - vr.left - vr.width * 0.3, behavior: "smooth"});
      if (y0 < vr.top + 10 || y1 > Math.min(vr.bottom, pb) - 20)
        v.scrollBy({top: y0 - vr.top - 40, behavior: "smooth"});
    }
  } catch (e) {}
}
/* micro : on écoute le piano, on repère chaque nouvelle attaque, puis on regarde quelles notes (do, ré, mi…) sonnent */
async function prMicStart() {
  const set = (t, cl) => {
    $("prMicT").textContent = t;
    $("prMic").className = "prMic " + (cl || "");
  };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    set("Micro indisponible sur cet appareil", "off");
    return;
  }
  set("Autorisez le micro…");
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    await AC.resume();
    const st = await navigator.mediaDevices.getUserMedia({
      audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}
    });
    if (!PR.on) {
      st.getTracks().forEach(t => t.stop());
      return;
    }
    PR.st = st;
    const src = AC.createMediaStreamSource(st),
      an = AC.createAnalyser();
    an.fftSize = 8192;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    PR.an = an;
    PR.fb = new Float32Array(an.frequencyBinCount);
    PR.tb = new Float32Array(an.fftSize);
    PR.rh = [];
    PR.acc = null;
    set("J'écoute votre piano", "live");
    prLoop();
  } catch (e) {
    set(
      e && e.name === "NotAllowedError"
        ? "Micro refusé · touchez ici pour réessayer"
        : "Micro indisponible · touchez ici pour réessayer",
      "off"
    );
  }
}
function prLoop() {
  if (!PR.on || !PR.an) return;
  PR.raf = requestAnimationFrame(prLoop);
  const an = PR.an;
  an.getFloatTimeDomainData(PR.tb);
  let s = 0;
  for (let i = 0; i < PR.tb.length; i += 4) s += PR.tb[i] * PR.tb[i];
  const rms = Math.sqrt(s / (PR.tb.length / 4));
  const h = PR.rh;
  h.push(rms);
  if (h.length > 12) h.shift();
  const lo = Math.min(...h.slice(0, -2));
  PR.floor = PR.floor == null ? rms : Math.min(PR.floor * 1.002 + 1e-5, Math.max(rms, PR.floor * 0.98));
  const now = performance.now(),
    gate = Math.max(0.006, PR.floor * 3);
  if (rms > gate && rms > lo * 1.35 && now - PR.lastOn > 140) {
    PR.lastOn = now;
    PR.acc = new Float32Array(12);
    PR.win = 9;
  }
  if (PR.win > 0 && PR.acc) {
    PR.win--;
    an.getFloatFrequencyData(PR.fb);
    const sr = AC.sampleRate,
      bw = sr / an.fftSize,
      b0 = Math.floor(60 / bw),
      b1 = Math.ceil(2200 / bw),
      fb = PR.fb;
    for (let i = b0 + 1; i < b1; i++) {
      const v = fb[i];
      if (v < -85 || v < fb[i - 1] || v < fb[i + 1]) continue;
      const f = i * bw,
        m = 69 + 12 * Math.log2(f / 440),
        r = Math.round(m),
        dv = Math.abs(m - r);
      if (dv > 0.35) continue;
      const a = Math.pow(10, v / 20) * (1 - dv) * (f < 300 ? 1.6 : f > 1200 ? 0.6 : 1);
      PR.acc[((r % 12) + 12) % 12] += a;
    }
    prJudge();
  }
}
function prJudge() {
  const g = PR.G[PR.k];
  if (!g || !PR.acc) return;
  const a = PR.acc,
    mx = Math.max(...a);
  if (mx <= 0) return;
  const need = g.pcs;
  const ok = need.length === 1 ? a[need[0]] >= 0.7 * mx : need.every(p => a[p] >= 0.3 * mx);
  if (ok) {
    PR.acc = null;
    PR.win = 0;
    prNext(true);
  }
}

$("dPrac").onclick = () => (PR.on ? prClose() : prOpen());

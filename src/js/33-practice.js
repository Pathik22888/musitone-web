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
  tr: null,
  target: null
};
const PCN = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"],
  PCL = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const prPitchClasses = notes => notes.map(m => m % 12).sort((a, b) => a - b);
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
    .map(([k, evs]) => {
      const ms = [...new Set(evs.map(e => e.m))].sort((a, b) => a - b);
      return {t: k / 1000, evs, ms, pcs: prPitchClasses(ms)};
    });
}
const prName = m => PCN[((m % 12) + 12) % 12] + `<sub>${Math.floor(m / 12) - 1}</sub>`;
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
    P.className = "prPanel modePanel";
    P.setAttribute("role", "region");
    P.setAttribute("aria-labelledby", "prTitle");
    P.innerHTML = `<div class="modeHead"><b id="prTitle">Jouer</b><button type="button" id="prX" class="modeDone">Terminé</button></div>
    <div class="prTop"><span class="prMic" id="prMic"><i></i><b id="prMicT">Micro…</b></span><span class="prPos" id="prPos"></span></div>
    <div class="prNow"><small>Jouez</small><div id="prNeed" class="prNeed"></div><div class="prHeard" id="prHeard"><small>J'entends</small><div id="prHeardN" class="prHeardN"><em>—</em></div></div></div>
    <div id="prTune" class="prTune">
      <div class="prTuneInfo"><small>Hauteur</small><span id="prTuneValue">—</span></div>
      <div class="prTuneScale" aria-hidden="true"><i></i><b id="prTuneMark" hidden></b></div>
      <div class="prTuneLabels" aria-hidden="true"><span>Grave</span><span>Juste</span><span>Aigu</span></div>
    </div>
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
  PR.onset = null;
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
  $("prNeed").innerHTML = g.ms
    .map(m => {
      const pc = ((m % 12) + 12) % 12;
      return `<span class="${PR.tap && PR.tap.has(pc) ? "done" : ""}" style="--c:${prColor(pc)}">${prName(m)}</span>`;
    })
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
/* micro : on écoute le piano ; la reconnaissance des notes est dans 34-pitch.js */
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
    const onset = AC.createAnalyser();
    onset.fftSize = 2048;
    onset.smoothingTimeConstant = 0;
    src.connect(an);
    src.connect(onset);
    PR.onset = onset;
    PR.onsetBins = new Float32Array(onset.frequencyBinCount);
    PR.an = an;
    PR.fb = new Float32Array(an.frequencyBinCount);
    PR.tb = new Float32Array(an.fftSize);
    PR.tr = pitchTracker(AC.sampleRate, an.fftSize);
    PR.target = null;
    PR.tune = null;
    prTuning(null);
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
  an.getFloatFrequencyData(PR.fb);
  PR.onset.getFloatFrequencyData(PR.onsetBins);
  const now = performance.now();
  const expected = PR.G[PR.k]?.ms;
  const r = PR.tr.feed(PR.fb, rms, now, expected, PR.onsetBins);
  if (r.finished?.length && PR.target === PR.G[PR.k]) {
    const heard = r.finished[0];
    PR.tune = {heard, until: now + 2500};
    prTuning(null);
    prHeard(r.finished);
    if (prJudge(r.finished)) prNext(true);
    else prWrong();
  }
  if (r.hit) PR.target = PR.G[PR.k];
  const tune = PR.tune;
  if (tune && now >= tune.until) {
    PR.tune = null;
    prTuning(null);
  } else if (tune && rms > r.gate) {
    const cents = pitchOffset(PR.fb, AC.sampleRate, an.fftSize, tune.heard, tune.heard);
    if (cents !== null) prTuning(cents, tune.heard);
  }
}
/* Affiche la note entendue et son octave. La couleur confirme le nom de la note. */
function prHeard(notes) {
  const box = $("prHeardN");
  if (!box) return;
  const pcs = PR.G[PR.k]?.pcs ?? [];
  box.innerHTML = notes
    .map(m => {
      const pc = ((m % 12) + 12) % 12,
        cl = pcs.includes(pc) ? "ok" : "no";
      return `<span class="${cl}" style="--c:${prColor(pc)}">${prName(m)}</span>`;
    })
    .join("");
  const h = $("prHeard");
  h.classList.add("on");
  clearTimeout(PR.heardT);
  PR.heardT = setTimeout(() => h.classList.remove("on"), 2500);
}
function prTuning(cents, heard) {
  const marker = $("prTuneMark"),
    value = $("prTuneValue");
  if (cents === null) {
    value.textContent = "—";
    marker.hidden = true;
    return;
  }
  const rounded = Math.round(cents);
  const label = Math.abs(rounded) <= 5 ? "Juste" : rounded < 0 ? "Trop grave" : "Trop aigu";
  const note = PCN[heard % 12] + (Math.floor(heard / 12) - 1);
  const offset = rounded > 0 ? "+" + rounded : String(rounded);
  const text = `${note} · ${label} (${offset} ¢)`;
  if (value.textContent !== text) value.textContent = text;
  marker.style.left = Math.max(0, Math.min(100, 50 + cents)) + "%";
  marker.classList.toggle("centered", Math.abs(rounded) <= 5);
  marker.hidden = false;
}
/* Compare les noms de notes, en comptant les doublures d'un accord. */
function prJudge(notes) {
  const expected = PR.G[PR.k]?.pcs;
  return expected?.length === notes.length && prPitchClasses(notes).every((pc, i) => pc === expected[i]);
}

$("dPrac").onclick = () => (PR.on ? prClose() : prOpen());

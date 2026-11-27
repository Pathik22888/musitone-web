/* ===== JOUER : l'appli attend que l'élève joue la bonne note sur son piano (micro), ou sur le clavier de l'écran ===== */
const PR = {
  on: false,
  G: [],
  k: 0,
  hand: "both",
  mic: null,
  an: null,
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
  PR.follow = null;
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
    <div class="prTop"><button type="button" class="prMic" id="prMic" title="Relancer le micro"><i></i><b id="prMicT" aria-live="polite">Micro…</b></button><span class="prPos" id="prPos"></span></div>
    <div class="prNow"><div id="prNeed" class="prNeed" aria-label="Notes à jouer"></div><small id="prExtra"></small></div>
    <div id="prDetails" class="prDiagnostics">
      <div class="prHeard" id="prHeard"><small>J’entends</small><div id="prHeardN" class="prHeardN"><em>—</em></div></div>
      <div id="prTune" class="prTune">
        <div class="prTuneInfo"><small>Hauteur</small><span id="prTuneValue">—</span></div>
        <div class="prTuneScale" aria-hidden="true"><i></i><b id="prTuneMark" hidden></b></div>
        <div class="prTuneLabels" aria-hidden="true"><span>Grave</span><span>Juste</span><span>Aigu</span></div>
      </div>
    </div>
    <div class="prNav">
      <button type="button" id="prPrev" aria-label="Note précédente">‹ Revenir</button>
      <select id="prHands" aria-label="Main à travailler"><option value="both">Les deux mains</option><option value="r">Main droite</option><option value="l">Main gauche</option></select>
      <button type="button" id="prSkip" aria-label="Passer cette note">Passer ›</button>
    </div>`;
    $("work").appendChild(P);

    $("prX").onclick = prClose;
    $("prMic").onclick = prMicStart;
    $("prPrev").onclick = () => {
      PR.k = Math.max(0, PR.k - 1);
      PR.tap = null;
      prShow();
    };
    $("prSkip").onclick = () => prNext(false);
    $("prHands").onchange = e => {
      PR.hand = e.target.value;
      PR.tap = null;
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
  $("prHands").value = PR.hand;
  prShow();
  prMicStart();
}
function prClose() {
  PR.on = false;
  document.body.classList.remove("practice");
  const P = $("prPanel");
  if (P) P.hidden = true;
  prMicStop();
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
  if (!PR.on || PR.turning) return;
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
  $("prExtra").textContent = "";
  const groups = {r: [], l: [], both: []};
  for (const m of g.ms) {
    const pc = m % 12;
    const right = g.evs.some(e => e.m === m && !e.hand);
    const left = g.evs.some(e => e.m === m && e.hand);
    const hand = left ? (right ? "both" : "l") : "r";
    groups[hand].push(`<span data-note="${m}" class="${PR.tap?.has(pc) ? "done" : ""}" style="--c:${prColor(pc)}">${prName(m)}</span>`);
  }
  $("prNeed").innerHTML = [
    ["r", "Main droite"], ["l", "Main gauche"], ["both", "Note commune"]
  ].filter(([hand]) => groups[hand].length).map(([hand, label]) =>
    `<div class="prHand" data-hand="${hand}"><small>${label}</small><div>${groups[hand].join("")}</div></div>`
  ).join("");
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
    const cu = cursorAt(songNow(), g.t);
    if (cu) {
      // En mode Jouer, la cible est la note imprimée au temps courant.
      // L'interpolation de la lecture peut encore pointer vers la barre précédente.
      const xs = g.evs.filter(e => e.n?.s).map(e => e.n.x);
      const x = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : cu.x;
      c.save();
      c.fillStyle = "rgba(0,200,224,.12)";
      c.fillRect(x - 1.6 * cu.y.d, cu.y.top, 3.2 * cu.y.d, cu.y.bot - cu.y.top);
      c.restore();
      prFollow(pg, cu.y, x, g.evs);
    }
  } catch (e) {}
}
function prFollow(pg, line, x, events) {
  const v = $("view"),
    vr = v.getBoundingClientRect(),
    r = $("cv").getBoundingClientRect(),
    height = vr.height;
  if (height <= 0) return;

  const now = performance.now();
  const pending = PR.follow?.view === v && PR.follow.page === pg &&
    PR.follow.width === r.width && now < PR.follow.until ? PR.follow : null;
  const baseLeft = pending?.left ?? v.scrollLeft,
    baseTop = pending?.top ?? v.scrollTop;
  const sx = r.left - vr.left + v.scrollLeft + (x / pg.W) * r.width;
  const sheetTop = r.top - vr.top + v.scrollTop;
  const scale = r.height / pg.H;
  const y0 = sheetTop + line.top * scale;
  const y1 = sheetTop + line.bot * scale;
  const ys = events.filter(e => e.n?.s).map(e => e.n.y);
  const middle = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : (line.top + line.bot) / 2;
  const focusY = sheetTop + middle * scale;
  const newLine = PR.follow?.line !== line || PR.follow?.page !== pg;

  let left = baseLeft, top = baseTop;
  if (sx < baseLeft + 30 || sx > baseLeft + vr.width - 40)
    left = sx - vr.width * 0.28;
  if (y1 - y0 <= height - 28) {
    if (y0 < baseTop + 10 || y1 > baseTop + height - 18) top = y0 - Math.min(32, (height - (y1 - y0)) / 2);
  } else if (newLine || focusY < baseTop + 20 || focusY > baseTop + height - 30) {
    top = focusY - height * 0.40;
  }
  left = Math.max(0, Math.min(left, v.scrollWidth - v.clientWidth));
  top = Math.max(0, Math.min(top, v.scrollHeight - v.clientHeight));
  const move = Math.abs(left - baseLeft) >= 1 || Math.abs(top - baseTop) >= 1;
  PR.follow = {view: v, page: pg, line, width: r.width, left, top, until: move ? now + 500 : pending?.until ?? now};
  if (move) {
    const instant = (newLine && pending) || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = instant ? "instant" : "smooth";
    v.scrollTo({left, top, behavior});
  }
}
/* micro : on écoute le piano ; la reconnaissance des notes est dans 34-pitch.js */
function prMicStatus(text, state = "") {
  $("prMicT").textContent = text;
  $("prMic").className = "prMic " + state;
}
function prMicStop() {
  const mic = PR.mic;
  PR.mic = null;
  cancelAnimationFrame(PR.raf);
  PR.raf = 0;
  mic?.cleanup?.();
  mic?.stream?.getTracks().forEach(track => track.stop());
  PR.an = null;
  PR.onset = null;
  PR.target = null;
  PR.tune = null;
}
async function prMicStart() {
  if (!PR.on || (PR.mic && !PR.an)) return;
  prMicStop();
  const panel = $("prHeard");
  clearTimeout(PR.heardT);
  panel.classList.remove("on");
  $("prHeardN").innerHTML = "<em>—</em>";
  prMarkHeard([]);
  prTuning(null);
  if (!navigator.mediaDevices?.getUserMedia) {
    prMicStatus("Micro indisponible sur cet appareil", "off");
    return;
  }
  const mic = {};
  PR.mic = mic;
  prMicStatus("Autorisez le micro…");
  try {
    if (!AC || AC.state === "closed") AC = new (window.AudioContext || window.webkitAudioContext)();
    const context = AC;
    // Demander le micro pendant le geste, même si la reprise audio reste en attente.
    context.resume().catch(() => {});
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}
    });
    if (PR.mic !== mic) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    mic.stream = stream;
    const [track] = stream.getAudioTracks();
    if (!track || track.readyState === "ended") throw new Error("Micro arrêté");
    const src = context.createMediaStreamSource(stream),
      an = context.createAnalyser(),
      onset = context.createAnalyser();
    an.fftSize = 8192;
    onset.fftSize = 2048;
    an.smoothingTimeConstant = onset.smoothingTimeConstant = 0;
    src.connect(an);
    src.connect(onset);
    PR.onset = onset;
    PR.onsetBins = new Float32Array(onset.frequencyBinCount);
    PR.an = an;
    PR.fb = new Float32Array(an.frequencyBinCount);
    PR.tb = new Float32Array(an.fftSize);

    const ended = () => {
      if (PR.mic !== mic) return;
      prMicStop();
      prMicStatus("Micro arrêté · touchez pour relancer", "off");
    };
    const sync = () => {
      if (PR.mic !== mic) return;
      if (context.state === "closed" || track.readyState === "ended") {
        ended();
      } else if (document.hidden || context.state !== "running" || track.muted) {
        cancelAnimationFrame(PR.raf);
        PR.raf = 0;
        PR.target = null;
        PR.tune = null;
        prTuning(null);
        prMicStatus("Micro en pause · touchez pour relancer", "off");
      } else if (!PR.raf) {
        mic.silentSince = null;
        mic.silent = false;
        mic.accepted = false;
        PR.tr = pitchTracker(context.sampleRate, an.fftSize);
        prMicStatus("J'écoute votre piano", "live");
        prLoop();
      }
    };
    const visible = () => {
      sync();
      if (PR.mic === mic && !document.hidden && context.state !== "running") context.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", visible);
    context.addEventListener("statechange", sync);
    track.addEventListener("mute", sync);
    track.addEventListener("unmute", sync);
    track.addEventListener("ended", ended);
    mic.cleanup = () => {
      document.removeEventListener("visibilitychange", visible);
      context.removeEventListener("statechange", sync);
      track.removeEventListener("mute", sync);
      track.removeEventListener("unmute", sync);
      track.removeEventListener("ended", ended);
      src.disconnect();
    };
    visible();
  } catch (e) {
    if (PR.mic !== mic) return;
    prMicStop();
    prMicStatus(
      e?.name === "NotAllowedError"
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
  const mic = PR.mic;
  if (rms === 0) {
    mic.silentSince ??= now;
    if (!mic.silent && now - mic.silentSince >= 3000) {
      mic.silent = true;
      prMicStatus("Aucun signal · touchez pour relancer", "off");
    }
  } else {
    mic.silentSince = null;
    if (mic.silent) {
      mic.silent = false;
      prMicStatus("J'écoute votre piano", "live");
    }
  }
  const expected = PR.G[PR.k]?.ms;
  const r = PR.tr.feed(PR.fb, rms, now, expected, PR.onsetBins, mic.accepted);
  if (r.finished?.length && PR.target === PR.G[PR.k]) {
    const heard = r.finished[0];
    PR.tune = {heard, until: now + 2500};
    prTuning(null);
    prHeard(r.finished);
    mic.accepted = prJudge(r.finished);
    if (mic.accepted) prNext(true);
    else prWrong();
  }
  if (r.hit) {
    PR.target = PR.G[PR.k];
    mic.preview = "";
  }
  if (r.live && r.notes?.length && PR.target === PR.G[PR.k]) {
    const preview = r.notes.join(",");
    if (preview !== mic.preview) {
      mic.preview = preview;
      prHeard(r.notes);
    }
  }
  const tune = PR.tune;
  if (tune && now >= tune.until) {
    PR.tune = null;
    prTuning(null);
  } else if (tune && rms > r.gate) {
    const cents = pitchOffset(PR.fb, AC.sampleRate, an.fftSize, tune.heard, tune.heard);
    if (cents !== null) prTuning(cents, tune.heard);
  }
}
/* Chaque note entendue valide une seule pastille. Donner la priorité à l'octave exacte. */
function prMarkHeard(notes) {
  const chips = [...$("prNeed").querySelectorAll("[data-note]")];
  const remaining = [...notes];
  const matched = new Set();
  for (const same of [(a, b) => a === b, (a, b) => a % 12 === b % 12]) {
    for (const chip of chips) {
      if (matched.has(chip)) continue;
      const i = remaining.findIndex(m => same(m, Number(chip.dataset.note)));
      if (i < 0) continue;
      matched.add(chip);
      remaining.splice(i, 1);
    }
  }
  for (const chip of chips) {
    chip.classList.toggle("matched", matched.has(chip));
    chip.setAttribute("aria-label", chip.textContent + (matched.has(chip) ? " reconnue" : " à jouer"));
  }
  const extra = remaining.length;
  $("prExtra").textContent = extra ? (extra === 1 ? "1 note en trop" : extra + " notes en trop") : "";
}

function prHeard(notes) {
  const box = $("prHeardN");
  if (!box) return;
  prMarkHeard(notes);
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

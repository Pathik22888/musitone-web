function curB() {
  return PLAY ? (AC.currentTime - PLAY.t0) / PLAY.sp : POS;
}
function songNow() {
  if (MIDI) return MIDI.S;
  const pg = pages[cur];
  if (!pg || !pg.notes) return null;
  const k = cur + "|" + mxqSig();
  if (songNow.k !== k) {
    songNow.k = k;
    songNow.S = songOf(pg, PHOTO_TS || undefined);
  }
  return songNow.S;
}
function readyOnce(pg) {
  if (!pg._rd)
    pg._rd = ready(pg).finally(() => {
      pg._rd = null;
    });
  return pg._rd;
}
/* pendant qu'une page joue, on lit déjà la suivante (si ce n'est pas fait) pour enchaîner sans pause */
function playPreload() {
  const nx = cur + 1,
    p = pages[nx];
  if (!p || p.notes) return;
  setTimeout(() => {
    if (!PLAY || p.notes) return;
    p._busy = true;
    readyOnce(p)
      .catch(() => {})
      .finally(() => {
        p._busy = false;
        if (pages[cur] !== p) freePg(p);
      });
  }, 400);
}
function playSched() {
  const P = PLAY,
    nx = cur + 1,
    S2 = songOf(pages[nx], PHOTO_TS || undefined),
    _h = pianoHuman(S2),
    t0n = P.t0 + P.S.len * P.sp,
    sp = P.sp;
  P.next = {nx, S2, t0n};
  for (const e of S2.ev) {
    const t = t0n + e.t * sp;
    if (PIANO.ready) grandNote(AC, P.out, t + (e._dt || 0), e.m, e.dur * sp, e._v || (e.hand ? 0.5 : 0.66));
    else pianoNote(AC, P.out, t, e.m, e.dur * sp, e.hand ? 0.22 : 0.28);
  }
}
function playTurn() {
  const P = PLAY,
    N = P.next;
  P.turn = 1;
  show(N.nx, {keepPlay: 1})
    .then(() => {
      if (PLAY !== P) return;
      P.S = N.S2;
      P.t0 = N.t0n;
      P.next = null;
      P.turn = 0;
      P.last = null;
      playPreload();
    })
    .catch(() => {
      if (PLAY === P) {
        P.turn = 0;
        P.next = null;
      }
    });
}
function playStop(keep) {
  if (!PLAY) {
    if (!keep) {
      POS = 0;
      document.body.classList.remove("plOpen");
      seekUI();
      drawMarks();
      try {
        mxqIdle();
      } catch (e) {}
    }
    return;
  }
  if (keep) POS = Math.max(0, curB());
  else POS = 0;
  try {
    PLAY.out.disconnect();
  } catch (e) {}
  cancelAnimationFrame(PLAY.raf);
  PLAY = null;
  document.body.classList.remove("playing");
  if (!keep) document.body.classList.remove("plOpen");
  dPlayLab();
  drawMarks();
  try {
    mxqIdle();
  } catch (e) {}
  seekUI();
}
function dPlayLab() {
  const e = document.querySelector("#dPlay span");
  if (e) e.textContent = PLAY ? "Pause" : "Écouter";
}
function playPause() {
  if (PLAY) playStop(true);
  else playStart(POS);
}
function seekTo(b) {
  const S = songNow();
  if (!S) return;
  b = Math.max(0, Math.min(S.len - 0.01, b));
  if (PLAY) {
    playStop(true);
    playStart(b);
  } else {
    POS = b;
    seekUI();
    try {
      mxqIdle();
    } catch (e) {}
  }
}
function measStep(k) {
  const S = songNow();
  if (!S || !S.mb || !S.mb.length) return;
  const b = curB();
  let i = S.mb.findIndex(([t, l]) => b >= t - 1e-6 && b < t + l);
  if (i < 0) i = b <= 0 ? 0 : S.mb.length - 1;
  /* reculer : si on est déjà loin dans la mesure, on revient d'abord à son début */
  if (k < 0 && b - S.mb[i][0] > 0.6) k = 0;
  const j = Math.max(0, Math.min(S.mb.length - 1, i + k));
  seekTo(S.mb[j][0]);
}
function seekUI() {
  const S = songNow();
  if (!S) return;
  const b = curB(),
    mb = S.mb || [];
  let i = mb.findIndex(([t, l]) => b >= t - 1e-6 && b < t + l);
  if (i < 0) i = b <= 0 ? 0 : mb.length - 1;
  for (const id of ["mxqSeek", "plSeek"]) {
    const el = $(id);
    if (el && !el.dragging) el.value = Math.round((1000 * b) / Math.max(0.01, S.len));
  }
  for (const id of ["mxqPos", "plPos"]) {
    const el = $(id);
    if (el) el.textContent = `Mesure ${Math.max(1, i + 1)} / ${mb.length}`;
  }
}
async function playStart(from) {
  if (playStart.busy) return;
  const pg = pages[cur];
  if (!MIDI && (!pg || !pg.notes)) return;
  const S = songNow();
  if (!S || !S.ev.length) {
    toast("Aucune note à jouer");
    return;
  }
  if (from == null || from >= S.len - 0.01) from = from == null ? POS : 0;
  if (from >= S.len - 0.01) from = 0;
  AC = AC || new (window.AudioContext || window.webkitAudioContext)();
  AC.resume();
  if (!PIANO.ready) {
    const b = $("dPlay");
    b.classList.add("loading");
    toast("Chargement du piano…");
    playStart.busy = 1;
    try {
      await Promise.race([pianoLoad(), new Promise((_, ko) => setTimeout(() => ko(new Error("délai")), 15000))]);
    } catch (e) {
      console.warn("piano échantillonné indisponible", e);
    }
    playStart.busy = 0;
    b.classList.remove("loading");
    if (PLAY) return;
  }
  pianoHuman(S);
  let out;
  const sp = 60 / bpm,
    t0 = AC.currentTime + 0.2 - from * sp,
    evs = S.ev.filter(e => e.t >= from - 1e-6);
  if (PIANO.ready) {
    out = pianoChain(AC);
    for (const e of evs)
      grandNote(AC, out, t0 + e.t * sp + (e._dt || 0), e.m, e.dur * sp, e._v || (e.hand ? 0.5 : 0.66));
  } else {
    out = AC.createGain();
    out.gain.value = 0.5;
    const comp = AC.createDynamicsCompressor();
    out.connect(comp).connect(AC.destination);
    for (const e of evs) pianoNote(AC, out, t0 + e.t * sp, e.m, e.dur * sp, e.hand ? 0.22 : 0.28);
  }
  PLAY = {out, t0, sp, S, raf: 0, last: null};
  playPreload();
  document.body.classList.add("playing", "plOpen");
  dPlayLab();
  $("plTempo").textContent = bpm;
  const loop = () => {
    if (!PLAY) return;
    const S = PLAY.S,
      b = (AC.currentTime - PLAY.t0) / PLAY.sp;
    /* fin de la page : la suite est jouée sans pause, et la page suivante s'affiche */
    if (!MIDI && !PLAY.next && b > S.len - 1.5 && cur < pages.length - 1 && pages[cur + 1].notes) playSched();
    if (PLAY.next && !PLAY.turn && b >= S.len) {
      playTurn();
      PLAY.raf = requestAnimationFrame(loop);
      return;
    }
    if (PLAY.turn) {
      PLAY.raf = requestAnimationFrame(loop);
      return;
    }
    if (!MIDI && b > S.len + 0.3 && cur < pages.length - 1 && !pages[cur + 1].notes) {
      const nx = cur + 1;
      playStop();
      show(nx).then(() => playStart(0));
      return;
    }
    if (b > S.len + 1) {
      playStop();
      return;
    }
    try {
      mxqCursor(b);
    } catch (e) {}
    if ((PLAY.fr = (PLAY.fr || 0) + 1) % 3 === 0) seekUI();
    if (MIDI) {
      PLAY.raf = requestAnimationFrame(loop);
      return;
    }
    const on = S.ev.filter(e => b >= e.t && b < e.t + Math.max(e.dur, 0.25));
    drawMarks();
    const c = $("ov").getContext("2d");
    const cu = cursorAt(S, b);
    if (cu) {
      const {y, x} = cu,
        d = y.d;
      c.save();
      const g = c.createLinearGradient(0, y.top, 0, y.bot);
      g.addColorStop(0, "rgba(0,200,224,0)");
      g.addColorStop(0.12, "rgba(0,200,224,.95)");
      g.addColorStop(0.88, "rgba(0,200,224,.95)");
      g.addColorStop(1, "rgba(0,200,224,0)");
      c.fillStyle = "rgba(0,200,224,.10)";
      c.fillRect(x - 1.6 * d, y.top, 1.6 * d, y.bot - y.top);
      c.strokeStyle = g;
      c.lineWidth = Math.max(3, 0.28 * d);
      c.shadowColor = "#00C8E0";
      c.shadowBlur = 1.2 * d;
      c.beginPath();
      c.moveTo(x, y.top);
      c.lineTo(x, y.bot);
      c.stroke();
      c.restore();
    }
    for (const e of on) {
      const n = e.n,
        d = n.s.d;
      c.save();
      c.lineWidth = Math.max(3, 0.3 * d);
      c.strokeStyle = PAL[letterOf(n)][1];
      c.shadowColor = PAL[letterOf(n)][1];
      c.shadowBlur = d;
      c.beginPath();
      c.ellipse(n.x, n.y, 1.25 * d, 0.95 * d, -0.35, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    if (cu) {
      try {
        const r = $("cv").getBoundingClientRect(),
          v = $("view"),
          vr = v.getBoundingClientRect(),
          sx = r.left + (cu.x / pages[cur].W) * r.width;
        if ((sx < vr.left + 30 || sx > vr.right - 70) && !PLAY.hs) {
          PLAY.hs = 1;
          v.scrollBy({left: sx - vr.left - vr.width * 0.25, behavior: "smooth"});
          setTimeout(() => {
            if (PLAY) PLAY.hs = 0;
          }, 450);
        }
      } catch (e) {}
    }
    if (cu && PLAY.last !== cu.y) {
      PLAY.last = cu.y;
      try {
        const r = $("cv").getBoundingClientRect(),
          v = $("view"),
          vr = v.getBoundingClientRect(),
          y0 = r.top + (cu.y.top / pages[cur].H) * r.height,
          y1 = r.top + (cu.y.bot / pages[cur].H) * r.height;
        if (y0 < vr.top + 20 || y1 > vr.bottom - 40)
          v.scrollBy({top: y0 - vr.top - vr.height * 0.22, behavior: "smooth"});
      } catch (e) {}
    }
    PLAY.raf = requestAnimationFrame(loop);
  };
  loop();
}
let PHOTO_TS = null;
async function songAll(force) {
  const out = {ev: [], len: 0, M: 4, K: null, pick: 0, ts: null};
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    try {
      if (!pg.notes && typeof ready === "function") {
        pg._busy = true;
        try {
          await ready(pg);
        } finally {
          pg._busy = false;
        }
        if (i !== cur) freePg(pg);
      }
    } catch (e) {}
    const S = songOf(pg, force);
    if (!S.ev.length && !S.len) continue;
    if (!out.K) {
      out.K = S.K;
      out.M = S.M;
      out.ts = S.ts;
      /* levée : on la place à la fin de la première mesure, comme sur la partition */
      out.pick = S.pick && S.pick < S.M ? S.M - S.pick : 0;
      out.len = out.pick;
    }
    out.meters = out.meters || [];
    for (const [t, q] of S.meters || [[0, S.M]]) {
      const gt = out.meters.length ? out.len + t : 0,
        last = out.meters[out.meters.length - 1];
      if (!last || last[1] !== q) out.meters.push([gt, q]);
    }
    (out.pageStart = out.pageStart || [])[i] = out.len;
    for (const e of S.ev) out.ev.push({...e, t: e.t + out.len});
    out.len += S.len;
  }
  return out;
}
function midiFile(S, tempo) {
  const PPQ = 480,
    v = [];
  const vlq = n => {
    let b = [n & 127];
    n >>= 7;
    while (n) {
      b.unshift((n & 127) | 128);
      n >>= 7;
    }
    return b;
  };
  const trk = evs => {
    evs.sort((a, b) => a.t - b.t || a.k - b.k);
    const out = [];
    let last = 0;
    for (const e of evs) {
      out.push(...vlq(e.t - last), ...e.b);
      last = e.t;
    }
    out.push(0, 0xff, 0x2f, 0);
    return [
      0x4d,
      0x54,
      0x72,
      0x6b,
      (out.length >>> 24) & 255,
      (out.length >> 16) & 255,
      (out.length >> 8) & 255,
      out.length & 255,
      ...out
    ];
  };
  const us = Math.round(6e7 / tempo),
    meta = trk(
      [
        {t: 0, k: 0, b: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]},
        ...(() => {
          const TS = q => (Number.isInteger(q) ? [q, 2] : [Math.round(q * 2), 3]),
            L = [];
          const ms = S.meters && S.meters.length ? S.meters : [[0, S.M || 4]];
          ms.forEach(([t, q], i) => {
            const v = i === 0 && S.ts ? [S.ts[0], Math.round(Math.log2(S.ts[1]))] : TS(q);
            L.push({t: Math.round(t * PPQ), k: 0, b: [0xff, 0x58, 4, v[0], v[1], 24, 8]});
          });
          return L;
        })()
      ].concat(
        (() => {
          const K = S.K;
          if (!K || !K.letters) return [];
          const L = K.letters,
            ord = K.flat ? [6, 2, 5, 1, 4, 0, 3] : [3, 0, 4, 1, 5, 2, 6];
          if (L.length > 7 || !L.every(x => ord.slice(0, L.length).includes(x))) return [];
          const sf = (K.flat ? -1 : 1) * L.length;
          return [{t: 0, k: 0, b: [0xff, 0x59, 2, sf & 255, 0]}];
        })()
      )
    );
  const tr = h => {
    const evs = [
      {
        t: 0,
        k: 0,
        b: [
          0xff,
          0x03,
          ...[...(h ? "Main gauche" : "Main droite")]
            .map(c => c.charCodeAt(0) & 127)
            .reduce((a, c, i, arr) => (i ? a.concat(c) : [arr.length, c]), [])
        ]
      },
      {t: 0, k: 0, b: [0xc0 | h, 0]}
    ];
    for (const e of S.ev)
      if (e.hand === h) {
        const a = Math.round(e.t * PPQ),
          b = Math.round((e.t + e.dur) * PPQ) - 1;
        evs.push({t: a, k: 1, b: [0x90 | h, e.m, h ? 70 : 85]}, {t: Math.max(a + 1, b), k: 0, b: [0x80 | h, e.m, 0]});
      }
    return trk(evs);
  };
  const tracks = [meta, tr(0), tr(1)];
  return new Uint8Array([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    1,
    0,
    tracks.length,
    (PPQ >> 8) & 255,
    PPQ & 255,
    ...tracks.flat()
  ]);
}
async function saveMidi() {
  const S = await songAll(PHOTO_TS || undefined);
  if (!S.ev.length) {
    toast("Aucune note à exporter");
    return;
  }
  const b = new Blob([midiFile(S, bpm)], {type: "audio/midi"}),
    name = ((pages[0] && pages[0].name) || "partition").replace(/\.[^.]+$/, "") + ".mid";
  if (dl) {
    try {
      await dl.save({filename: name, data: b});
      return;
    } catch (x) {
      if (x && x.code === "declined") return;
    }
  }
  const u = URL.createObjectURL(b),
    t = document.createElement("a");
  t.href = u;
  t.download = name;
  document.body.appendChild(t);
  t.click();
  t.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
$("dPlay").onclick = () => playPause();
$("plStop").onclick = () => playStop();
$("plMid").onclick = saveMidi;

function pianoNote(ac, out, t, m, dur, vel) {
  const f = 440 * Math.pow(2, (m - 69) / 12),
    g = ac.createGain(),
    o1 = ac.createOscillator(),
    o2 = ac.createOscillator(),
    o3 = ac.createOscillator(),
    g2 = ac.createGain(),
    g3 = ac.createGain(),
    lp = ac.createBiquadFilter();
  o1.type = "triangle";
  o2.type = "sine";
  o3.type = "sine";
  o1.frequency.value = f;
  o2.frequency.value = f * 2;
  o3.frequency.value = f * 3;
  g2.gain.value = 0.35;
  g3.gain.value = 0.12;
  lp.type = "lowpass";
  lp.frequency.value = Math.min(9000, f * 7);
  o1.connect(g);
  o2.connect(g2).connect(g);
  o3.connect(g3).connect(g);
  g.connect(lp).connect(out);
  const end = t + Math.max(0.25, dur) + 0.35;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.008);
  g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.35);
  g.gain.exponentialRampToValueAtTime(vel * 0.12, t + Math.max(0.3, dur));
  g.gain.exponentialRampToValueAtTime(0.0005, end);
  for (const o of [o1, o2, o3]) {
    o.start(t);
    o.stop(end + 0.05);
  }
}
/* piano à queue échantillonné (Salamander Grand Piano, Yamaha C5) : une note enregistrée toutes les tierces mineures,
 les autres sont accordées depuis la plus proche ; repli sur le piano synthétique si le chargement échoue */
const PIANO = {buf: {}, ready: false, loading: null, rev: null};
const PSAMP = [
  "A0",
  "C1",
  "Ds1",
  "Fs1",
  "A1",
  "C2",
  "Ds2",
  "Fs2",
  "A2",
  "C3",
  "Ds3",
  "Fs3",
  "A3",
  "C4",
  "Ds4",
  "Fs4",
  "A4",
  "C5",
  "Ds5",
  "Fs5",
  "A5",
  "C6",
  "Ds6",
  "Fs6",
  "A6",
  "C7",
  "Ds7",
  "Fs7",
  "A7",
  "C8"
];
const psMidi = n => {
  const L = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11}[n[0]] + (n[1] === "s" ? 1 : 0);
  return 12 * (+n.slice(-1) + 1) + L;
};
/* deux nuances enregistrées par note (douce, forte), mélangées selon la force du jeu */
function pianoLoad() {
  if (PIANO.ready) return Promise.resolve();
  if (PIANO.loading) return PIANO.loading;
  const dec = ab =>
    new Promise((ok, ko) => {
      const p = AC.decodeAudioData(ab, ok, ko);
      if (p && p.then) p.then(ok, ko);
    });
  PIANO.loading = Promise.all(
    PSAMP.flatMap(n =>
      ["6", "13"].map(async v => {
        const r = await fetch("piano2/" + n + "v" + v + ".mp3");
        if (!r.ok) throw new Error("piano " + n);
        const buf = await dec(await r.arrayBuffer());
        const m = psMidi(n);
        (PIANO.buf[m] = PIANO.buf[m] || {})[v === "6" ? "p" : "f"] = buf;
      })
    )
  )
    .then(() => {
      PIANO.ready = true;
    })
    .catch(e => {
      PIANO.loading = null;
      throw e;
    });
  return PIANO.loading;
}
/* réverbération de salle : premières réflexions puis queue diffuse, les aigus s'éteignent plus vite que les graves */
function pianoReverb(ac) {
  if (PIANO.rev && PIANO.rev.ac === ac) return PIANO.rev.buf;
  const sr = ac.sampleRate,
    len = Math.floor(sr * 3.2),
    b = ac.createBuffer(2, len, sr),
    pre = Math.floor(sr * 0.018);
  const ER = [
    [0.007, 0.5],
    [0.013, 0.42],
    [0.021, 0.36],
    [0.029, 0.3],
    [0.037, 0.26],
    [0.048, 0.2],
    [0.061, 0.16],
    [0.077, 0.12]
  ];
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0,
      lp2 = 0;
    for (const [t, g] of ER) {
      const i = pre + Math.floor((t + (ch ? 0.0027 : 0)) * sr);
      if (i < len) d[i] += g * (ch ? -1 : 1) * (0.8 + Math.random() * 0.4);
    }
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr,
        n = Math.random() * 2 - 1,
        k = 0.2 + 0.7 * Math.min(1, t / 2.2);
      lp = lp * k + n * (1 - k);
      lp2 = lp2 * 0.5 + lp * 0.5;
      const env = Math.exp(-t * 2.1) * (t < 0.06 ? t / 0.06 : 1);
      d[i] += lp2 * env * 0.55;
    }
  }
  PIANO.rev = {ac, buf: b};
  return b;
}
function pianoChain(ac) {
  const out = ac.createGain();
  out.gain.value = 0.9;
  const dry = ac.createGain();
  dry.gain.value = 0.82;
  const wet = ac.createGain();
  wet.gain.value = 0.34;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 170;
  const cv = ac.createConvolver();
  cv.buffer = pianoReverb(ac);
  /* un peu de chaleur dans le grave, un peu d'air dans l'aigu */
  const lo = ac.createBiquadFilter();
  lo.type = "lowshelf";
  lo.frequency.value = 120;
  lo.gain.value = 1.5;
  const hi = ac.createBiquadFilter();
  hi.type = "highshelf";
  hi.frequency.value = 8500;
  hi.gain.value = 2;
  const bus = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -1.5;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.1;
  const master = ac.createGain();
  master.gain.value = 1.0;
  out.connect(dry).connect(bus);
  out.connect(hp).connect(cv).connect(wet).connect(bus);
  bus.connect(lo).connect(hi).connect(comp).connect(master).connect(lim).connect(ac.destination);
  PIANO.voices = new Map();
  return out;
}
/* jeu humain : la mélodie (note la plus haute d'un accord) un peu plus forte, de très légers écarts de force et de temps */
function pianoHuman(S) {
  if (S._hum) return;
  S._hum = 1;
  const by = new Map();
  for (const e of S.ev) {
    const k = Math.round(e.t * 1000) + (e.hand ? "L" : "R");
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  for (const g of by.values()) {
    const top = Math.max(...g.map(e => e.m));
    for (const e of g) {
      let v = e.hand ? 0.5 : 0.66;
      if (!e.hand && e.m === top && g.length > 1) v += 0.1;
      if (e.hand && g.length > 1 && e.m === Math.min(...g.map(x => x.m))) v += 0.04;
      e._v = Math.max(0.2, Math.min(0.95, v + (Math.random() - 0.5) * 0.08));
      e._dt = (Math.random() - 0.5) * 0.012;
    }
  }
}
function grandNote(ac, out, t, m, dur, vel) {
  let best = null,
    bd = 99;
  for (const k in PIANO.buf) {
    const d = Math.abs(m - k);
    if (d < bd) {
      bd = d;
      best = +k;
    }
  }
  if (best == null) return;
  const B = PIANO.buf[best],
    rate = Math.pow(2, (m - best) / 12),
    mix = Math.max(0, Math.min(1, (vel - 0.4) / 0.4)),
    hold = Math.max(0.2, dur * 1.08 + 0.05),
    rel = m < 48 ? 0.8 : m < 72 ? 0.55 : 0.38,
    end = t + hold + rel * 3;
  const g = ac.createGain(),
    lvl = 0.5 + 0.75 * vel;
  g.gain.setValueAtTime(lvl, t);
  g.gain.setValueAtTime(lvl, t + hold);
  g.gain.setTargetAtTime(0, t + hold, rel / 3);
  /* jeu doux = un peu moins brillant */ const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2500 + vel * 12000;
  lp.Q.value = 0.2;
  lp.connect(g).connect(out);
  for (const [k, w] of [
    ["p", Math.cos((mix * Math.PI) / 2)],
    ["f", Math.sin((mix * Math.PI) / 2)]
  ]) {
    if (w < 0.02 || !B[k]) continue;
    const src = ac.createBufferSource();
    src.buffer = B[k];
    src.playbackRate.value = rate;
    const wg = ac.createGain();
    wg.gain.value = w * (k === "p" ? 1.35 : 1);
    src.connect(wg).connect(lp);
    src.start(t);
    src.stop(end);
  }
  /* même touche rejouée : l'ancienne note s'étouffe, comme sur un vrai piano */
  const V = PIANO.voices;
  if (V) {
    const o = V.get(m);
    if (o && o.end > t) {
      try {
        o.g.gain.cancelScheduledValues(t);
        o.g.gain.setTargetAtTime(0, t, 0.05);
      } catch (e) {}
    }
    V.set(m, {g, end});
  }
}
let POS = 0;

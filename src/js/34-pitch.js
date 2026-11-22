/* ===== Hauteur des notes captées par le micro =====
   Fonctions pures (aucun accès à la page) : testées hors navigateur par tests/pitch.mjs
   avec les vrais sons de piano de piano2/. */
/* plage reconnue : E1 à C7 (les touches extrêmes du piano ne sont pas fiables au micro d'un téléphone) */
const PITCH = {lo: 28, hi: 96, fmin: 30, fmax: 6000, H: 14, B: 3e-4, P: 1.25, keep: 0.4, flux: 2.5, miss: 0.15, abs: 0.4, expl: 0.45};

/* pics du spectre (en dB, comme AnalyserNode) : fréquence affinée + amplitude relative au plus fort */
function pitchPeaks(db, sr, n) {
  const bw = sr / n,
    i0 = Math.max(2, Math.floor(PITCH.fmin / bw)),
    i1 = Math.min(db.length - 2, Math.ceil(PITCH.fmax / bw));
  let mx = -Infinity;
  for (let i = i0; i < i1; i++) if (db[i] > mx) mx = db[i];
  const lim = Math.max(-100, mx - 45),
    pk = [];
  for (let i = i0; i < i1; i++) {
    const b = db[i];
    if (b < lim || b <= db[i - 1] || b < db[i + 1]) continue;
    const a = db[i - 1],
      c = db[i + 1],
      den = a - 2 * b + c,
      p = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    const amp = Math.pow(10, (b - 0.25 * (a - c) * p - mx) / 20);
    pk.push({f: (i + p) * bw, a: amp, a0: amp});
  }
  return pk;
}

/* score d'une note candidate : somme des harmoniques présentes (corde de piano légèrement inharmonique) */
function pitchScore(pk, m) {
  const f0 = 440 * Math.pow(2, (m - 69) / 12);
  let s = 0,
    hits = 0,
    low = 0;
  const used = [];
  for (let h = 1; h <= PITCH.H; h++) {
    const fh = f0 * h * Math.sqrt(1 + PITCH.B * h * h);
    if (fh > PITCH.fmax) break;
    const tol = 0.022 + 0.003 * h;
    let bj = -1,
      ba = 0;
    for (let j = 0; j < pk.length; j++) {
      const d = Math.abs(Math.log2(pk[j].f / fh));
      if (d < tol && pk[j].a0 > ba) {
        ba = pk[j].a0;
        bj = j;
      }
    }
    if (bj >= 0) {
      s += Math.pow(pk[bj].a, PITCH.P) * Math.pow(h, -0.3); // ce qui n'est pas déjà expliqué par une note trouvée
      hits++;
      if (h <= 3 && ba >= 0.05) low++;
      used.push(bj);
    }
    /* une vraie note a des harmoniques basses bien présentes : sinon c'est un accord qui « ressemble » à une note grave */
    if (h <= 4 && ba < 0.05) s -= h === 1 && f0 < 110 ? 0.03 : PITCH.miss;
  }
  const ok = low > 0 && (hits >= 2 || f0 > 1500);
  return {m, s: ok ? s : -1, used};
}

/* notes entendues (numéros MIDI, la plus forte d'abord), au plus `max` notes */
function pitchDetect(db, sr, n, max = 3) {
  const pk = pitchPeaks(db, sr, n);
  const out = [];
  let first = 0;
  for (let it = 0; it < max && pk.length; it++) {
    let best = null;
    for (let m = PITCH.lo; m <= PITCH.hi; m++) {
      if (out.some(o => Math.abs(o.m - m) % 12 === 0 || Math.abs(o.m - m) === 19)) continue;
      const c = pitchScore(pk, m);
      if (!best || c.s > best.s) best = c;
    }
    if (!best || best.s <= 0) break;
    if (it === 0) first = best.s;
    else if (best.s < Math.min(PITCH.keep * first, PITCH.abs)) break;
    out.push({m: best.m, s: best.s});
    for (const j of best.used) pk[j].a *= 0.15;
  }
  /* un bruit (coup, voix, claquement) a un spectre sans harmoniques : les notes trouvées n'en expliquent qu'une petite part */
  let all = 0,
    left = 0;
  for (const p of pk) {
    all += Math.pow(p.a0, PITCH.P);
    left += Math.pow(p.a, PITCH.P);
  }
  if (out.length && 1 - left / all < PITCH.expl) return [];
  return out;
}

/* Suivi en continu : repère chaque nouvelle attaque (énergie qui apparaît sur de nouvelles fréquences),
   puis reconnaît la note sur ce qui vient d'apparaître seulement. Une note tenue ne relance rien,
   et la note précédente qui résonne encore n'est pas reprise. Indépendant de la cadence d'images (60 ou 120 Hz). */
function pitchTracker(sr, n) {
  const bw = sr / n,
    i0 = Math.max(2, Math.floor(PITCH.fmin / bw)),
    i1 = Math.min(n / 2 - 2, Math.ceil(PITCH.fmax / bw)),
    L = i1 - i0,
    hist = [],
    out = new Float32Array(n / 2).fill(-200);
  let floor = null,
    last = -1e9,
    ev = null;
  return {
    feed(db, rms, now) {
      const lin = new Float32Array(L);
      let tot = 1e-12;
      for (let k = 0; k < L; k++) tot += lin[k] = Math.pow(10, db[i0 + k] / 20);
      floor = floor == null ? rms : Math.min(floor * 1.002 + 1e-5, Math.max(rms, floor * 0.98));
      const gate = Math.max(0.004, floor * 3),
        old = hist.filter(h => h.t <= now - 30 && h.t >= now - 150);
      let flux = 0;
      if (old.length) {
        for (let k = 0; k < L; k++) {
          let r = 1e-12;
          for (const h of old) if (h.lin[k] > r) r = h.lin[k];
          const d = 20 * Math.log10(lin[k] / r) - 3;
          if (d > 0) flux += lin[k] * d;
        }
        flux /= tot;
      }
      const hit = rms > gate && flux > PITCH.flux && now - last > 220;
      if (hit) {
        const ref = new Float32Array(L);
        for (const h of old) for (let k = 0; k < L; k++) if (h.lin[k] > ref[k]) ref[k] = h.lin[k];
        ev = {t: now, ref, acc: new Float32Array(L), c: 0, notes: []};
        last = now;
      }
      hist.push({t: now, lin});
      while (hist.length && hist[0].t < now - 200) hist.shift();
      if (ev && now - ev.t >= 45 && now - ev.t <= 260) {
        ev.c++;
        for (let k = 0; k < L; k++) ev.acc[k] += Math.max(0, lin[k] - ev.ref[k]);
        for (let k = 0; k < L; k++) out[i0 + k] = 20 * Math.log10(ev.acc[k] / ev.c + 1e-12);
        if (ev.c >= 2) ev.notes = pitchDetect(out, sr, n).map(p => p.m);
      }
      return {hit, notes: ev ? ev.notes : null, live: !!ev && now - ev.t <= 260, gate, flux};
    }
  };
}

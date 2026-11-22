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
    low = 0,
    lowPartial = 0,
    fundamental = null,
    independent = 0;
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
      if (h <= 2) lowPartial = Math.max(lowPartial, pk[bj].a0);
      if (h === 1) fundamental = pk[bj];
      if (pk[bj].a >= 0.07 && pk[bj].a === pk[bj].a0 && !used.includes(bj)) independent++;
      hits++;
      if (h <= 3 && ba >= 0.05) low++;
      used.push(bj);
    }
    /* une vraie note a des harmoniques basses bien présentes : sinon c'est un accord qui « ressemble » à une note grave */
    if (h <= 4 && ba < 0.05) s -= h === 1 && f0 < 110 ? 0.03 : PITCH.miss;
  }
  const ok = low > 0 && (hits >= 2 || f0 > 1500);
  // Une fondamentale manquante est courante dans le grave. Plus haut, plusieurs
  // notes d'un accord peuvent fabriquer les harmoniques d'une basse absente.
  if (lowPartial < 0.05 || (m >= 48 && (fundamental?.a0 ?? 0) < 0.05)) s *= 0.45;
  return {m, s: ok ? s : -1, used, fundamental: fundamental?.a ?? 0, independent};
}

/* notes entendues (numéros MIDI, la plus forte d'abord), au plus `max` notes */
function pitchDetect(db, sr, n, max = 8, expected = []) {
  const pk = pitchPeaks(db, sr, n);
  // Un claquement répartit son énergie sur beaucoup de pics. Sans ce filtre,
  // plusieurs candidats peuvent finir par expliquer assez de bruit pour passer.
  const power = pk.map(p => Math.pow(p.a0, PITCH.P)).sort((a, b) => b - a);
  const all = power.reduce((sum, value) => sum + value, 0);
  const strongest = power.slice(0, 12).reduce((sum, value) => sum + value, 0);
  if (strongest < all * 0.45) return [];

  const out = [];
  let first = 0;
  for (let it = 0; it < max && pk.length; it++) {
    let best = null,
      fallback = null;
    for (let m = PITCH.lo; m <= PITCH.hi; m++) {
      if (out.some(o => o.m === m)) continue;
      const related = out.some(o => Math.abs(o.m - m) % 12 === 0 || Math.abs(o.m - m) === 19);
      const c = pitchScore(pk, m);
      if (!related && (!best || c.s > best.s)) best = c;
      // Un candidat faible ou apparenté doit avoir sa propre fondamentale et
      // d'autres pics qui n'ont pas déjà servi à expliquer les notes retenues.
      if (it && c.s >= 0.08 && c.fundamental >= 0.25 && c.independent >= 2 && (!fallback || c.s > fallback.s))
        fallback = c;
    }
    if (it && (!best || best.s < Math.min(PITCH.keep * first, PITCH.abs))) best = fallback;
    if (!best || best.s <= 0) break;
    // Une harmonique forte peut masquer la basse. La partition départage les
    // octaves si la note attendue possède aussi une fondamentale mesurable.
    if (!expected.includes(best.m) && expected.includes(best.m - 12) && !out.some(o => o.m === best.m - 12)) {
      const lower = pitchScore(pk, best.m - 12);
      if (lower.fundamental >= 0.065 && lower.s >= best.s * 0.6) best = lower;
    }
    if (it === 0) first = best.s;
    out.push({m: best.m, s: best.s});
    for (const j of best.used) pk[j].a *= 0.15;
  }
  /* un bruit (coup, voix, claquement) a un spectre sans harmoniques : les notes trouvées n'en expliquent qu'une petite part */
  const left = pk.reduce((sum, p) => sum + Math.pow(p.a, PITCH.P), 0);
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
    feed(db, rms, now, expected) {
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
      let finished = null;
      if (ev && !ev.done && (hit || now - ev.t > 260)) {
        ev.done = true;
        if (ev.previous.length) ev.notes = ev.previous;
        finished = ev.notes;
      }
      if (hit) {
        const ref = new Float32Array(L);
        for (const h of old) for (let k = 0; k < L; k++) if (h.lin[k] > ref[k]) ref[k] = h.lin[k];
        ev = {t: now, ref, acc: new Float32Array(L), c: 0, previous: [], notes: [], done: false};
        last = now;
      }
      hist.push({t: now, lin});
      while (hist.length && hist[0].t < now - 200) hist.shift();
      if (ev && now - ev.t >= 45 && now - ev.t <= 260) {
        ev.c++;
        for (let k = 0; k < L; k++) ev.acc[k] += Math.max(0, lin[k] - ev.ref[k]);
        for (let k = 0; k < L; k++) out[i0 + k] = 20 * Math.log10(ev.acc[k] / ev.c + 1e-12);
        if (ev.c >= 2) {
          const notes = pitchDetect(out, sr, n, 8, expected).map(p => p.m);
          // Garder la dernière estimation confirmée sur deux analyses
          // pour les attaques dont la fin devient indétectable.
          if (notes.length && notes.length === ev.previous.length && notes.every(m => ev.previous.includes(m))) {
            ev.notes = notes;
          }
          ev.previous = notes;
        }
      }
      return {hit, notes: ev ? ev.notes : null, live: !!ev && !ev.done, finished, gate, flux};
    }
  };
}

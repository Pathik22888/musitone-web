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

// L’octave et la douzième renforcent certains partiels de la basse.
function harmonicIntervalEvidence(peaks, lower, other, bw, strict = true, interval = 12) {
  const f = 440 * 2 ** ((lower - 69) / 12);
  const multiple = interval === 12 ? 2 : 3;
  const upper = f * 2 ** (interval / 12);
  const harmonic = (base, h) => base * h * Math.sqrt(1 + PITCH.B * h * h);
  const otherBases = other.map(m => 440 * 2 ** ((m - 69) / 12));
  const amplitude = (frequency, rejectOther) => {
    const tolerance = Math.max(bw * 0.8, frequency * 0.012);
    let value = 0;
    for (const p of peaks) {
      if (Math.abs(p.f - frequency) > tolerance) continue;
      if (rejectOther && otherBases.some(base => {
        const h = Math.round(p.f / base);
        return h > 0 && Math.abs(p.f - harmonic(base, h)) <= Math.max(bw, p.f * 0.015);
      })) continue;
      value = Math.max(value, p.a0);
    }
    return value;
  };
  let evidence = 0, strong = false, odd = false, third = false, fourth = false, fifth = false;
  for (let h = 2; h <= 5; h++) {
    const amp = amplitude(harmonic(upper, h), true);
    const neighbours = Math.max(
      amplitude(harmonic(f, h * multiple - 1), !strict),
      amplitude(harmonic(f, h * multiple + 1), !strict)
    );
    // Deux partiels concordants aident quand le partiel dominant est masqué.
    if (h === 3) third = amp >= Math.max(0.20, 0.58 * neighbours);
    if (h === 4) fourth = amp >= Math.max(0.09, 0.30 * neighbours);
    if (h === 5) fifth = amp >= Math.max(0.11, 0.8 * neighbours);
    // Une harmonique impaire de l'octave haute aide à écarter un son joué deux octaves au-dessus.
    if (h % 2 && amp >= Math.max(0.07, 0.36 * neighbours)) odd = true;
    if (amp >= Math.max(0.045, 0.75 * neighbours)) {
      evidence++;
      if (amp >= Math.max(0.26, 1.7 * neighbours) && h <= 3) strong = true;
    }
  }
  return (strong && (!strict || (odd && evidence >= 2))) ||
    (strict && fourth && (third || (interval === 12 && fifth)));
}

/* Confirme une note avec sa fondamentale et des partiels que les autres touches n'expliquent pas. */
function quietNoteEvidence(pk, m, other, bw, allowWeak = false) {
  const root = 440 * 2 ** ((m - 69) / 12);
  const bases = other.map(n => 440 * 2 ** ((n - 69) / 12));
  const peak = (h, min) => {
    const f = root * h * Math.sqrt(1 + PITCH.B * h * h);
    return pk.some(p => p.a0 >= min && Math.abs(p.f - f) <= Math.max(bw * 0.85, f * 0.023) &&
      !bases.some(base => {
        const k = Math.round(p.f / base);
        return k > 0 && Math.abs(p.f - base * k * Math.sqrt(1 + PITCH.B * k * k)) <= Math.max(bw, p.f * 0.019);
      }));
  };
  return peak(1, 0.036) && (peak(2, 0.12) || peak(3, 0.12) || peak(4, 0.12) ||
    (allowWeak && (
      [2, 3, 4, 5, 6].filter(h => peak(h, 0.041)).length >= 2 ||
      (peak(1, 0.09) && [2, 3, 4, 5].some(h => peak(h, 0.06)))
    )));
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
      // Un sous-harmonique peut capter les partiels des deux octaves.
      // Sa fondamentale et ses partiels impairs doivent alors l'appuyer.
      if (c.fundamental < 0.30 && expected.includes(m + 12) && expected.includes(m + 24) &&
          pitchScore(pk, m + 12).fundamental >= 0.06) {
        const root = 440 * 2 ** ((m - 69) / 12);
        const hasOddPartial = [3, 5].some(h => {
          const f = root * h * Math.sqrt(1 + PITCH.B * h * h);
          return pk.some(p => p.a0 >= 0.06 && Math.abs(p.f - f) < Math.max(sr / n * 0.72, f * 0.012) &&
            !expected.some(note => {
              const base = 440 * 2 ** ((note - 69) / 12);
              const order = Math.round(p.f / base);
              return order > 0 && Math.abs(p.f - base * order) < Math.max(sr / n, p.f * 0.016);
            }));
        });
        if (!hasOddPartial) continue;
      }
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
  // Récupère une seule note masquée, sans effacer une vraie note surnuméraire.
  if (expected.length > 1) {
    const missing = expected.filter(m => !out.some(note => note.m === m));
    const extras = out.filter(note => !expected.includes(note.m));
    if (missing.length === 2 && extras.length === 1 && out.length > extras.length &&
        missing.every(m => m >= PITCH.lo && m <= PITCH.hi)) {
      const extra = extras[0];
      const shadowed = missing.find(m => m - 12 === extra.m);
      // Un sous-harmonique peut prendre la place de deux notes de l'accord.
      // Il doit manquer d'appui propre et les deux notes attendues doivent en avoir.
      if (shadowed !== undefined && !quietNoteEvidence(pk, extra.m, expected, sr / n) &&
          missing.every(m => quietNoteEvidence(pk, m, expected.filter(n => n !== m), sr / n)) &&
          out.length + 1 <= max) {
        extra.m = shadowed;
        out.push({m: missing.find(m => m !== shadowed), s: 0});
      }
    }
    if (missing.length === 1 && extras.length <= 1) {
      const m = missing[0];
      const extra = extras[0];
      const other = out.filter(note => note !== extra).map(note => note.m);
      const allowWeak = (expected.length === 2 && other.length === 1 && other[0] === m + 12) ||
        (expected.length === 3 && !extra);
      if (m >= PITCH.lo && m <= PITCH.hi && (!extra || Math.abs(extra.m - m) === 12) &&
          quietNoteEvidence(pk, m, other, sr / n, allowWeak) &&
          (!extra || extra.m < m || !harmonicIntervalEvidence(pk, m, other, sr / n, false))) {
        if (extra) extra.m = m;
        else if (out.length < max) out.push({m, s: 0});
      }
    }
  }
  if (expected.length === 2 && out.length === 1 && max >= 2) {
    // La note douce doit avoir ses propres partiels, même si la première
    // a capté l’essentiel de l’énergie du spectre.
    const heard = out[0].m;
    const heardClass = heard % 12;
    const wanted = expected.find(m => m % 12 !== heardClass);
    if (wanted >= PITCH.lo && wanted <= PITCH.hi && expected.some(m => m % 12 === heardClass)) {
      if (quietNoteEvidence(pk, wanted, [heard], sr / n, true)) out.push({m: wanted, s: 0});
      else if (wanted === heard + 19 && harmonicIntervalEvidence(pk, heard, [], sr / n, true, 19)) {
        out.push({m: wanted, s: 0});
      }
    }
  }
  if (out.length && out.every(note => expected.includes(note.m))) {
    const heard = out.map(note => note.m);
    for (const m of expected) {
      const lower = m - 12;
      if (out.length >= max || m > PITCH.hi || heard.includes(m) || !heard.includes(lower)) continue;
      const other = heard.filter(note => note !== lower);
      if (harmonicIntervalEvidence(pk, lower, other, sr / n)) out.push({m, s: 0});
    }
  }
  return out;
}

/* Suivi en continu : repère chaque nouvelle attaque (énergie qui apparaît sur de nouvelles fréquences),
   puis reconnaît la note sur ce qui vient d'apparaître seulement. Une note tenue ne relance rien,
   et la note précédente qui résonne encore n'est pas reprise. Indépendant de la cadence d'images (60 ou 120 Hz). */
function fastAttackDetector() {
  const history = [];
  let ready = true, last = -1e9;
  return (db, now, allowed) => {
    const bins = new Float32Array(Math.min(db.length, 256));
    for (let i = 2; i < bins.length; i++) bins[i] = Math.pow(10, db[i] / 20);
    const previous = history.filter(frame => frame.t <= now - 18);
    let flux = 0, total = 1e-12, attack = false;
    if (previous.length) {
      for (let i = 2; i < bins.length; i++) {
        let base = 1e-12;
        for (const frame of previous) base = Math.max(base, frame.bins[i]);
        total += bins[i];
        flux += Math.max(0, bins[i] - base * 1.45);
      }
      flux /= total;
      if (flux < 0.1) ready = true;
      const delay = now - last;
      const threshold = last >= 0 && delay > 135 ? 0.155 : 0.20;
      attack = allowed && ready && flux > threshold && delay > 90;
      if (attack) { last = now; ready = false; }
    }
    history.push({t: now, bins});
    while (history.length && history[0].t < now - 65) history.shift();
    return attack;
  };
}

/* Estimation de la fondamentale par interpolation du pic spectral. */
function pitchOffset(db, sr, n, midi, reference) {
  const bw = sr / n;
  const target = 440 * 2 ** ((midi - 69) / 12);
  const first = Math.max(2, Math.floor(target * 2 ** (-65 / 1200) / bw));
  const last = Math.min(db.length - 2, Math.ceil(target * 2 ** (65 / 1200) / bw));
  let peak = -1;
  for (let i = first; i <= last; i++) {
    if (db[i] >= -80 && db[i] >= db[i - 1] && db[i] > db[i + 1] && (peak < 0 || db[i] > db[peak])) peak = i;
  }
  if (peak < 0) return null;
  const left = db[peak - 1], mid = db[peak], right = db[peak + 1];
  const curve = left - 2 * mid + right;
  const shift = Number.isFinite(curve) && curve < 0 ? (0.5 * (left - right)) / curve : 0;
  const f = (peak + Math.max(-0.5, Math.min(0.5, shift))) * bw;
  const cents = 1200 * Math.log2(f / target);
  return Math.abs(cents) <= 65 ? cents + (midi - reference) * 100 : null;
}

function pitchTracker(sr, n) {
  const fastAttack = fastAttackDetector();
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
    feed(db, rms, now, expected, short) {
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
      // Les notes sous E2 ont besoin d'une fenêtre plus longue.
      const fast = expected?.length === 1 && expected[0] >= 40 && !!short;
      const quickHit = short && fastAttack(short, now, fast && rms > gate);
      const hit = (quickHit && now - last > 90) || (rms > gate && flux > PITCH.flux && now - last > 220);
      const fastDone = ev?.fast && ev.notes.length === 1 && ev.notes[0] === expected?.[0] &&
        ev.previous.length === 1 && ev.previous[0] === ev.notes[0] && now - ev.t >= 95;
      let finished = null;
      if (ev && !ev.done && (hit || fastDone || now - ev.t > 260)) {
        ev.done = true;
        // Une note d'un accord peut s'éteindre avant les autres. Une estimation
        // momentanée sur la fin peut aussi confondre un partiel avec une touche.
        if (ev.chord && (ev.previous.every(m => ev.chord.includes(m)) ||
            (ev.chord.length >= 3 && now - ev.previousAt < 24 &&
             ev.previous.filter(m => ev.chord.includes(m)).length >= 2))) {
          ev.notes = ev.chord;
        } else if (ev.previous.length) ev.notes = ev.previous;
        finished = ev.notes;
      }
      if (hit) {
        const ref = new Float32Array(L);
        for (const h of old) for (let k = 0; k < L; k++) if (h.lin[k] > ref[k]) ref[k] = h.lin[k];
        ev = {t: now, fast, ref, acc: new Float32Array(L), c: 0,
          previous: [], previousAt: now, notes: [], chord: null, weight: 0, spectrumAt: now, done: false};
        last = now;
      }
      hist.push({t: now, lin});
      while (hist.length && hist[0].t < now - 200) hist.shift();
      if (ev && !ev.done && now - ev.t >= (ev.fast ? 55 : 45)) {
        ev.c++;
        // Pour des touches espacées, les analyses récentes rendent plus visible
        // une attaque légèrement retardée et réduisent le poids de l'attaque
        // précédente. Garder toute la fenêtre pour les intervalles serrés.
        const spacedChord = expected?.length >= 2 && expected.every((m, i) => !i || m - expected[i - 1] >= 3);
        const decay = spacedChord ? Math.exp((ev.spectrumAt - now) / 103) : 1;
        ev.spectrumAt = now;
        ev.weight = decay * ev.weight + 1;
        for (let k = 0; k < L; k++) ev.acc[k] = decay * ev.acc[k] + Math.max(0, lin[k] - ev.ref[k]);
        for (let k = 0; k < L; k++) out[i0 + k] = 20 * Math.log10(ev.acc[k] / ev.weight + 1e-12);
        if (ev.c >= 2) {
          const found = pitchDetect(out, sr, n, 8, expected);
          // La soustraction d'un son précédent peut laisser des pics aigus
          // isolés. Vérifier ceux-ci aussi dans le spectre reçu.
          const peaks = ev.fast && found.length > 1 ? pitchPeaks(db, sr, n) : null;
          const main = found[0]?.m;
          const notes = found.filter(p => !peaks || p.m < 84 || p.m < main + 12 ||
            quietNoteEvidence(peaks, p.m, [main], bw) ||
            (p.m === main + 12 && harmonicIntervalEvidence(peaks, main, [], bw, false))
          ).map(p => p.m);
          // Garder la dernière estimation confirmée sur deux analyses
          // pour les attaques dont la fin devient indétectable.
          const same = notes.length === ev.previous.length && notes.every(m => ev.previous.includes(m));
          if (!same) ev.previousAt = now;
          if (notes.length && same) {
            ev.notes = notes;
            // Exiger aussi un intervalle de temps entre les mesures, y compris à 120 Hz.
            if (expected?.length >= 2 && notes.length === expected.length && now - ev.previousAt >= 24 &&
                notes.map(m => m % 12).sort().join() === expected.map(m => m % 12).sort().join()) {
              ev.chord = notes;
            }
          }
          ev.previous = notes;
        }
      }
      return {hit, notes: ev ? ev.notes : null, live: !!ev && !ev.done, finished, gate, flux};
    }
  };
}

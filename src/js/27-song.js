/* ---------- lecture audio et export MIDI à partir des notes lues ---------- */
function diOf(n) {
  const s = n.s,
    step = Math.round((s.bot - n.y) / (s.d / 2)),
    G = clefAt(s, n.x) === "G";
  let di = (G ? 30 : 18) + step; /* index diatonique, C0 = 0 */
  if (n.ov != null) {
    const L0 = ((di % 7) + 7) % 7;
    let best = di,
      bd = 9;
    for (let k = -3; k <= 3; k++) {
      if ((((L0 + k) % 7) + 7) % 7 === n.ov && Math.abs(k) < bd) {
        bd = Math.abs(k);
        best = di + k;
      }
    }
    di = best;
  }
  return di;
}
function midiOf(n, K, alt) {
  const di = diOf(n),
    L = ((di % 7) + 7) % 7,
    oct = Math.floor(di / 7),
    SEM = [0, 2, 4, 5, 7, 9, 11];
  let m = 12 * (oct + 1) + SEM[L];
  if (alt != null) m += alt;
  else if (K && K.letters.includes(L)) m += K.flat ? -1 : 1;
  return m;
}
/* altérations écrites devant une note : valables jusqu'à la barre de mesure, pour la même ligne de la portée */
function accDelta(pg, K) {
  const M = new Map();
  for (const a of pg.acc || []) {
    if (!a.note || a.del || a.skip || !pg.notes.includes(a.note)) continue;
    if (a.type === "b" || a.type === "sn") M.set(a.note, a.type);
  }
  return M;
}
/* systèmes piano : deux portées liées. La main gauche peut être en clé de sol (passage aigu) :
 on se fie à l'écart entre portées, plus serré à l'intérieur d'un système qu'entre deux systèmes. */
/* deux portées d'un même système sont reliées par un trait vertical au début (et à la fin) de la ligne.
 On suit ce trait pixel par pixel, même légèrement penché sur une photo mal cadrée. */
function staffJoined(pg, a, b) {
  try {
    const cv = pg.cv,
      W = cv.width,
      H = cv.height;
    if (!pg._jd || pg._jd.w !== W || pg._jd.h !== H) {
      const D = cv.getContext("2d").getImageData(0, 0, W, H).data,
        L = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) L[i] = D[i * 4] * 0.3 + D[i * 4 + 1] * 0.59 + D[i * 4 + 2] * 0.11 < 120 ? 1 : 0;
      pg._jd = {w: W, h: H, L};
    }
    const {L} = pg._jd,
      d = a.d,
      ya = Math.round(a.bot + 1),
      yb = Math.round(b.top - 1),
      span = yb - ya;
    if (span < d) return true;
    if (span > 18 * d) return false;
    const dark = (x, y) => x >= 0 && x < W && y >= 0 && y < H && L[y * W + x];
    const follow = x0 => {
      let x = x0,
        gap = 0;
      for (let y = ya; y <= yb; y++) {
        let best = null;
        for (let k = 0; k <= 3 && best == null; k++) {
          if (dark(x - k, y)) best = x - k;
          else if (dark(x + k, y)) best = x + k;
        }
        if (best == null) {
          if (++gap > span * 0.1 + 3) return false;
        } else {
          x = best;
        }
      }
      return true;
    };
    for (const [from, to] of [
      [Math.min(a.x0, b.x0) - 1.5 * d, Math.min(a.x0, b.x0) + 2.5 * d],
      [Math.max(a.x1, b.x1) - 2.5 * d, Math.max(a.x1, b.x1) + 1.5 * d]
    ]) {
      for (let x = Math.max(0, Math.round(from)); x <= Math.min(W - 1, Math.round(to)); x++) {
        if (dark(x, ya) && !dark(x - 1, ya) && follow(x)) return true;
      }
    }
    return false;
  } catch (e) {
    return null;
  }
}
function pianoSystems(pg) {
  const S = pg.staves,
    n = S.length,
    cl = s => clefAt(s, s.x0 + s.d),
    gap = i => S[i + 1].top - S[i].bot,
    g = [];
  for (let i = 0; i + 1 < n; i++) g.push(gap(i));
  const gf = [];
  for (let i = 0; i + 1 < n; i++) if (cl(S[i]) === "G" && cl(S[i + 1]) === "F") gf.push(g[i]);
  gf.sort((a, b) => a - b);
  const Gi = gf.length ? gf[gf.length >> 1] : null;
  /* priorité au trait qui relie les portées ; l'écart entre portées ne sert que si aucun trait n'est trouvé sur la page */
  const J = [];
  for (let i = 0; i + 1 < n; i++) J.push(staffJoined(pg, S[i], S[i + 1]));
  pg._joins = J;
  if (J.some(v => v === true)) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (i + 1 < n && J[i] === true && !(cl(S[i]) === "F" && cl(S[i + 1]) === "G")) {
        out.push([S[i], S[i + 1]]);
        i++;
      } else out.push([S[i]]);
    }
    /* un trait manqué sur la photo : une clé de sol seule suivie de près d'une clé de fa seule forment un système */
    for (let k = 0; k + 1 < out.length; k++) {
      const A = out[k],
        Bq = out[k + 1];
      if (
        A.length === 1 &&
        Bq.length === 1 &&
        cl(A[0]) === "G" &&
        cl(Bq[0]) === "F" &&
        Bq[0].top - A[0].bot < 16 * A[0].d
      ) {
        out.splice(k, 2, [A[0], Bq[0]]);
      }
    }
    return out;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = S[i],
      b = S[i + 1];
    if (!b) {
      out.push([a]);
      break;
    }
    const d = a.d,
      gi = g[i];
    let pair = false;
    if (gi < 16 * d) {
      if (cl(b) === "F" && cl(a) !== "F") pair = true;
      else if (Gi != null && Math.abs(gi - Gi) < 0.35 * Gi && (i + 1 >= n - 1 || g[i + 1] > gi * 1.15)) pair = true;
      else if ((i === 0 || g[i - 1] > gi * 1.2) && (i + 1 >= n - 1 || g[i + 1] > gi * 1.2) && n >= 3) pair = true;
    }
    if (pair) {
      out.push([a, b]);
      i++;
    } else out.push([a]);
  }
  return out;
}
function songOf(pg, force) {
  const K = keyOf(pg),
    ev = [],
    SY = [];
  let AD = new Map(),
    PICK = 0;
  if (!pg.rh || !pg.rh.length) {
    try {
      if (!pg.baseData && pg.cv) pg.baseData = pg.cv.getContext("2d").getImageData(0, 0, pg.W, pg.H);
      rhythmPrep(pg);
    } catch (e) {
      console.error("rhythm", e);
    }
  }
  if (!pg.rh || !pg.rh.length) return {ev, len: 0, sys: SY};
  /* Lecture synchronisée : les deux mains d'une même ligne partagent les mêmes barres de mesure
   et les notes alignées verticalement sont jouées ensemble, comme un curseur qui défile. */
  const rhOf = s => pg.rh.find(r => r.s === s),
    slotsOf = (st, a, b) => {
      const s = st.s,
        d = s.d,
        ns = pg.notes.filter(n => n.s === s && n.x > a && n.x < b).sort((p, q) => p.x - q.x),
        rs = pg.rests.filter(r => r.s === s && r.x > a && r.x < b),
        sl = [];
      for (const n of ns) {
        const t = sl.find(
          t =>
            t.items &&
            t.items.some(
              q => Math.abs(q.x - n.x) < 0.7 * d || (Math.abs(q.x - n.x) < 1.45 * d && Math.abs(q.y - n.y) < 0.8 * d)
            )
        );
        if (t) {
          t.items.push(n);
          t.x = Math.min(t.x, n.x);
        } else sl.push({x: n.x, items: [n]});
      }
      for (const r of rs) if (r.dur !== "bar") sl.push({x: r.x, rest: r.dur});
      sl.sort((p, q) => p.x - q.x);
      for (const t of sl) t.dur = t.rest != null ? t.rest : Math.max(...t.items.map(n => noteDur(pg, st, n)));
      return sl;
    };
  try {
    AD = accDelta(pg, K);
  } catch (e) {}
  const sys = pianoSystems(pg);
  /* barres communes aux deux portées (une vraie barre traverse le système) */
  const UB = new Map();
  for (const grp of sys) {
    const d = grp[0].d,
      sts = grp.map(rhOf);
    if (sts.some(x => !x)) continue;
    const x0 = Math.min(...grp.map(s => s.cx0 || s.x0)),
      x1 = Math.max(...grp.map(s => s.x1)),
      raw = [];
    if (sts.length > 1) {
      for (const x of sts[0].bars) if (sts[1].bars.some(y => Math.abs(y - x) < 1.5 * d)) raw.push(x);
    } else raw.push(...sts[0].bars);
    raw.sort((p, q) => p - q);
    /* rien ne peut tenir avant la 1re note du système, juste après la clé : un trait vertical à cet endroit vient de l'armure ou du chiffrage */
    {
      const fx = Math.min(...pg.notes.filter(n => grp.includes(n.s)).map(n => n.x), 1e9);
      for (let i = raw.length - 1; i >= 0; i--) if (raw[i] < fx - 0.5 * d && raw[i] < x0 + 12 * d) raw.splice(i, 1);
    }
    const bars = [x0];
    for (const x of raw) {
      if (x - bars[bars.length - 1] > 1.5 * d) bars.push(x);
    }
    if (x1 - bars[bars.length - 1] > 2 * d) bars.push(x1);
    UB.set(grp, bars);
  }
  /* mesure type */
  const cnt = {},
    widths = [];
  for (const grp of sys) {
    const bars = UB.get(grp);
    if (!bars) continue;
    const sts = grp.map(rhOf);
    const d = grp[0].d;
    for (let i = 0; i + 1 < bars.length; i++) {
      const P = sts.map(st => slotsOf(st, bars[i], bars[i + 1])),
        fx = Math.min(
          ...P.flat()
            .map(t => t.x)
            .concat([bars[i + 1]])
        );
      widths.push(bars[i + 1] - (i === 0 ? Math.max(bars[i], fx - 1.2 * d) : bars[i]));
      for (const p of P) {
        const tot = p.reduce((a, t) => a + t.dur, 0);
        if (tot > 0) cnt[tot] = (cnt[tot] || 0) + 1;
      }
    }
  }
  let M0 = +(Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p])[0] || 4);
  if (!(M0 >= 2 && M0 <= 6 && Math.abs(M0 * 2 - Math.round(M0 * 2)) < 1e-6)) M0 = 4;
  const M = force ? force.q : M0,
    mw = widths.length ? widths.slice().sort((p, q) => p - q)[widths.length >> 1] : 1;
  let T = 0,
    CM = M;
  const METER = [[0, M]],
    MB = [];
  for (const grp of sys) {
    const d = grp[0].d,
      sts = grp.map(rhOf);
    if (sts.some(x => !x)) continue;
    const HN = grp.map(s => (clefAt(s, s.x0 + s.d) === "F" ? 1 : 0));
    if (grp.length === 2) {
      HN[0] = 0;
      HN[1] = 1;
    }
    const bars = UB.get(grp);
    const keys = [],
      t0 = T;
    for (let i = 0; i + 1 < bars.length; i++) {
      const a = bars[i],
        b = bars[i + 1],
        per = sts.map(st => slotsOf(st, a, b)),
        tots = per.map(p => p.reduce((x, t) => x + t.dur, 0));
      /* tempo régulier : chaque mesure dure exactement sa valeur (sauf une levée en tout début de morceau) */
      const fx = Math.min(
          ...per
            .flat()
            .map(t => t.x)
            .concat([b])
        ),
        tsHere = grp.some(st => (st.tsc || []).some(bx => bx[0] > a - 1.2 * d && bx[0] < Math.max(a + 5 * d, fx))),
        ca = i === 0 || tsHere ? Math.max(a, fx - 1.2 * d) : a + 0.8 * d,
        cb = b - 0.3 * d,
        nm = Math.max(1, Math.round((b - (i === 0 || tsHere ? ca : a)) / mw));
      /* changement de mesure : chiffres juste après une barre ; la nouvelle mesure est donnée par le contenu de la mesure */
      /* fausse mesure vide coincée entre la clé et une barre de début */
      if (!per.some(p => p.length) && b - a < (i === 0 ? 0.6 : 0.55) * mw) continue;
      if (
        !(T === 0 && i === 0) &&
        grp.some(st =>
          (st.tsc || []).some(
            bx =>
              bx[0] > a - 1.2 * d &&
              bx[0] < Math.max(a + 5 * d, fx) &&
              !(SY.length === 0 && bx[0] < (st.cx0 || st.x0) + 9 * d)
          )
        )
      ) {
        const ok = tots.filter(t => t > 0);
        if (ok.length) {
          const c = Math.round(Math.max(...ok) * 2) / 2;
          if (c >= 1.5 && c <= 7 && c !== CM) {
            CM = c;
            METER.push([T, CM]);
          }
        }
      }
      const target = CM * nm,
        mx = Math.max(...tots),
        pick = T === 0 && i === 0 && mx > 0 && mx < M - 0.01 && nm <= 1,
        len = pick ? Math.round(mx * 4) / 4 : target;
      if (pick) PICK = len;
      /* une portée dont les durées lues remplissent exactement la mesure garde son rythme ; sinon on place les attaques d'après leur position, sur une grille de croches */
      per.forEach(p => {
        const carry = new Map();
        for (const sl of p)
          if (sl.items)
            for (const nn of sl.items.slice().sort((u, v) => u.x - v.x)) {
              const di = diOf(nn),
                L = ((di % 7) + 7) % 7;
              if (nn.accOv != null) {
                carry.set(di, nn.accOv);
              } else if (AD.has(nn)) {
                const ty = AD.get(nn),
                  prev = carry.has(di) ? carry.get(di) : K && K.letters.includes(L) ? (K.flat ? -1 : 1) : 0;
                /* ♯ et ♮ se ressemblent : si la note était déjà altérée, c'est un bécarre */ carry.set(
                  di,
                  ty === "b" ? -1 : prev !== 0 ? 0 : 1
                );
              }
              nn._alt = carry.has(di) ? carry.get(di) : null;
            }
      });
      const cols = [];
      per.forEach((p, h) => {
        const ok = Math.abs(tots[h] - len) < 0.01;
        let t = 0;
        p.forEach(sl => {
          if (ok) {
            sl.t = t;
            sl.d2 = sl.dur;
            t += sl.dur;
          }
        });
        if (!ok && p.length) {
          /* rythme : on cherche, sur une grille de doubles-croches, les attaques qui respectent au mieux à la fois
           les durées lues (noire, croche…) et la position des notes dans la mesure ; la mesure reste exactement pleine */
          const gg = 0.25,
            Gn = Math.round(len / gg),
            n = p.length,
            du = p.map(t => t.dur),
            odd = t => (t % 2 ? 0.35 : 0),
            xp = p.map(t => Math.max(0, Math.min(len, ((t.x - ca) / Math.max(1, cb - ca)) * len)));
          if (n <= Gn) {
            const INF = 1e18,
              C = [],
              B = [];
            for (let i = 0; i < n; i++) {
              C.push(new Float64Array(Gn).fill(INF));
              B.push(new Int16Array(Gn).fill(-1));
            }
            for (let t = 0; t < Gn; t++) C[0][t] = 1.2 * (t * gg - xp[0]) ** 2 + (t ? 0.6 : 0) + odd(t);
            for (let i = 1; i < n; i++)
              for (let t = i; t < Gn; t++) {
                let bc = INF,
                  bj = -1;
                for (let u = i - 1; u < t; u++) {
                  if (C[i - 1][u] >= INF) continue;
                  const c = C[i - 1][u] + 2 * ((t - u) * gg - du[i - 1]) ** 2;
                  if (c < bc) {
                    bc = c;
                    bj = u;
                  }
                }
                if (bj >= 0) {
                  C[i][t] = bc + 1.2 * (t * gg - xp[i]) ** 2 + odd(t);
                  B[i][t] = bj;
                }
              }
            let bt = -1,
              bc = INF;
            for (let t = n - 1; t < Gn; t++) {
              const c =
                C[n - 1][t] +
                0.6 * Math.max(0, len - t * gg - du[n - 1]) ** 2 +
                2 * Math.max(0, du[n - 1] - (len - t * gg)) ** 2;
              if (c < bc) {
                bc = c;
                bt = t;
              }
            }
            if (bt >= 0) {
              for (let i = n - 1; i >= 0; i--) {
                p[i].t = bt * gg;
                bt = B[i][bt];
              }
            } else {
              const st = len / n;
              p.forEach((sl, j) => {
                sl.t = j * st;
              });
            }
          } else {
            const st = len / n;
            p.forEach((sl, j) => {
              sl.t = j * st;
            });
          }
          p.forEach((sl, j) => {
            sl.d2 = (j + 1 < p.length ? p[j + 1].t : len) - sl.t;
          });
        }
        for (const sl of p) if (sl.items) cols.push({x: sl.x, t: sl.t, h, sl, n: ok ? 100 + p.length : p.length});
      });
      /* les attaques à la même position horizontale sonnent ensemble : la portée la plus détaillée donne le temps */
      cols.sort((p, q) => p.x - q.x);
      for (let j = 0; j < cols.length; j++)
        for (let k = j + 1; k < cols.length && cols[k].x - cols[j].x < 0.9 * d; k++)
          if (cols[k].h !== cols[j].h) {
            const m = cols[j].n >= cols[k].n ? cols[j] : cols[k];
            cols[j].t = cols[k].t = m.t;
          }
      /* le temps doit avancer de gauche à droite, sinon on interpole selon la position */
      for (let j = 1; j < cols.length; j++)
        if (cols[j].t < cols[j - 1].t - 1e-6) {
          const nx = cols.slice(j + 1).find(c => c.t >= cols[j - 1].t),
            xa = cols[j - 1].x,
            ta = cols[j - 1].t,
            xb = nx ? nx.x : b,
            tb = nx ? nx.t : len;
          cols[j].t = ta + (tb - ta) * Math.max(0, Math.min(1, (cols[j].x - xa) / Math.max(1, xb - xa)));
        }
      const Q = v => {
        const p = Math.round(v * 4) / 4,
          r = Math.round(v * 3) / 3;
        return Math.abs(r - v) < 0.03 && Math.abs(p - v) > 0.06 ? r : p;
      };
      for (const c of cols) {
        c.t = Math.min(Math.max(0, Q(c.t)), len - 0.125);
      }
      keys.push([T, i === 0 || tsHere ? Math.min(ca + 0.6 * d, fx) : a]);
      for (const c of cols) {
        keys.push([T + c.t, c.x]);
        const end = Math.min(len, Math.max(c.t + 0.25, Q(c.t + c.sl.d2)));
        for (const n of c.sl.items)
          ev.push({t: T + c.t, dur: Math.max(0.12, end - c.t), m: midiOf(n, K, n._alt), hand: HN[c.h], n});
      }
      MB.push([T, len]);
      T += len;
    }
    keys.push([T, bars[bars.length - 1]]);
    keys.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    SY.push({t0, t1: T, top: grp[0].top - 1.2 * d, bot: grp[grp.length - 1].bot + 1.2 * d, d, keys, s: grp[0]});
  }
  ev.sort((a, b) => a.t - b.t);
  return {ev, len: T, M, sys: SY, K, pick: PICK, ts: force ? force.ts : [M, 4], meters: METER, mb: MB};
}
function cursorAt(S, b) {
  // avant le premier temps (la lecture démarre avec 0,2 s d'avance) : première ligne, pas la dernière
  const y = S.sys.find(y => b >= y.t0 && b < y.t1) || (S.sys.length && b < S.sys[0].t0 ? S.sys[0] : S.sys[S.sys.length - 1]);
  if (!y) return null;
  const k = y.keys;
  let x = k[0][1];
  for (let i = 0; i + 1 < k.length; i++) {
    if (b >= k[i][0] && b <= k[i + 1][0]) {
      const dt = k[i + 1][0] - k[i][0];
      x = dt > 1e-6 ? k[i][1] + ((k[i + 1][1] - k[i][1]) * (b - k[i][0])) / dt : k[i + 1][1];
      break;
    }
    if (b > k[i + 1][0]) x = k[i + 1][1];
  }
  return {y, x};
}
let AC = null,
  PLAY = null,
  bpm = 80;
function toast(t) {
  document.querySelectorAll(".mtToast").forEach(x => x.remove());
  const e = document.createElement("div");
  e.className = "mtToast";
  e.textContent = t;
  e.style.cssText =
    "position:fixed;left:50%;top:40%;transform:translateX(-50%);background:#151a3b;color:#fff;padding:12px 18px;border-radius:14px;z-index:60;font-weight:700;max-width:86vw;text-align:center;line-height:1.35;box-shadow:0 10px 30px rgba(0,0,0,.35)";
  document.body.appendChild(e);
  setTimeout(() => e.remove(), Math.max(1800, t.length * 55));
}

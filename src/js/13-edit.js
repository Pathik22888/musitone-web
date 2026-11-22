/* ---------- édition ---------- */
function snap() {
  const pg = pages[cur];
  hist.push({
    notes: pg.notes.slice(),
    sus: (pg.sus || []).slice(),
    ov: pg.notes.map(n => n.ov),
    ns: pg.notes.map(n => n.s),
    np: pg.notes.map(n => {
      const o = {};
      for (const k in n) {
        const v = n[k];
        if (v === null || (typeof v !== "object" && typeof v !== "function")) o[k] = v;
      }
      return o;
    }),
    clef: pg.staves.map(s => s.clefs.map(k => Object.assign({}, k))),
    clefs: pg.staves.map(s => s.clefs.slice()),
    acc: (pg.acc || []).slice(),
    accS: (pg.acc || []).map(a => [a.Lov, a.skip, a.del])
  });
  if (hist.length > 60) hist.shift();
  $("undo").disabled = false;
}
function refresh() {
  const pg = pages[cur];
  projSoon();
  setTimeout(() => {
    try {
      updKeyBar();
    } catch (e) {
      console.error("KB", e && e.message);
    }
  }, 0);
  setTimeout(cachePng, 0);
  try {
    rhythmCheck(pg);
  } catch (e) {
    pg.badMeas = [];
  }
  paint(pg, $("cv").getContext("2d"));
  drawMarks();
  chips();
  stat();
}
let zf = 1,
  zpx = 0,
  zpy = 0,
  reviewing = false,
  props = null,
  pcur = -1;
/* réanalyse locale, réglages souples : pas de hampe exigée, accords serrés, blanches */

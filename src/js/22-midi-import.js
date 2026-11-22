/* ---------- fichier MIDI : même lecteur MusiTone que pour une photo (sans la partition d'origine) ---------- */
let MIDI = null;
function midiSong(doc, hands) {
  const q = doc.ppq,
    ev = [];
  for (const n of doc.notes) {
    const h = hands[n.source_track];
    if (!h || h === "none") continue;
    const hand = h === "left" ? 1 : h === "right" ? 0 : n.note < 60 ? 1 : 0;
    ev.push({t: n.start_tick / q, dur: Math.max(0.05, (n.end_tick - n.start_tick) / q), m: n.note, hand});
  }
  ev.sort((a, b) => a.t - b.t || a.m - b.m);
  const end = ev.reduce((a, e) => Math.max(a, e.t + e.dur), 0),
    tl = doc.timeline,
    mb = [];
  let t = 0,
    i = 0;
  while (t < end - 1e-6 || !mb.length) {
    while (i + 1 < tl.length && tl[i + 1][0] / q <= t + 1e-6) i++;
    const l = (tl[i][1] * 4) / tl[i][2];
    mb.push([t, l]);
    t += l;
    if (mb.length > 5000) break;
  }
  return {ev, len: t, M: mb[0][1], mb, ts: [tl[0][1], tl[0][2]], pick: 0};
}
function openMidiPlayer(o) {
  try {
    playStop();
  } catch (e) {}
  pages = [];
  PROJ = null;
  PHOTO_TS = null;
  KEYOV = null;
  MIDI = {
    doc: o.doc,
    hands: o.hands,
    key: o.key,
    title: o.title || "Ma partition",
    S: midiSong(o.doc, o.hands),
    id: Date.now()
  };
  if (o.doc.bpm) {
    bpm = Math.max(30, Math.min(220, o.doc.bpm));
    try {
      $("plTempo").textContent = bpm;
    } catch (e) {}
  }
  $("empty").hidden = true;
  $("work").hidden = false;
  $("bar").hidden = false;
  $("err").style.display = "none";
  document.body.classList.add("working", "midiOnly");
  document.body.classList.remove("home");
  $("ttl").textContent = MIDI.title;
  MXQ.sig = null;
  MXQ.item = null;
  MXQ.view = 0;
  POS = 0;
  setView("m");
}
window.openMidiPlayer = openMidiPlayer;

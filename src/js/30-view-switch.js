/* ---------- un geste : partition classique ↔ partition MusiTone ---------- */
function hintsOf(T) {
  const H = new Map();
  for (const e of T.ev) {
    const a = Math.round(e.t * 480);
    H.set((e.hand ? "left" : "right") + "|" + a + "|" + e.m, "CDEFGAB"[((diOf(e.n) % 7) + 7) % 7]);
  }
  return H;
}
const MXQ = {
  sig: null,
  item: null,
  urls: [],
  busy: false,
  ts: null,
  mpp: (() => {
    try {
      return +localStorage.getItem("mt-mpp") || 4;
    } catch (e) {
      return 4;
    }
  })()
};
function mxqSig() {
  return JSON.stringify([
    MIDI ? MIDI.id : 0,
    pages.map(pg =>
      (pg.notes || []).map(n => [
        n.x | 0,
        n.y | 0,
        n.ov,
        n.hollow,
        n.ronde,
        n._tip,
        n.s ? letterOf(n) : 0,
        n.accOv,
        n.s && n.s.clefs ? n.s.clefs.map(c => c.c).join("") : ""
      ])
    ),
    pages.map(pg => (pg.acc || []).map(a => [a.Lov, a.skip ? 1 : 0, a.del ? 1 : 0].join(""))),
    pages.map(pg => (pg.rests || []).length),
    KEYOV,
    PHOTO_TS,
    MXQ.mpp,
    mxqPH()
  ]);
}
function mxqMpp() {
  $("mxqMpp").innerHTML =
    `<span>Mesures / page</span>` +
    [2, 3, 4, 6, 8]
      .map(n => `<button type="button" data-mpp="${n}" class="${n === MXQ.mpp ? "on" : ""}">${n}</button>`)
      .join("");
}
$("mxqMpp").onclick = e => {
  const b = e.target.closest("button[data-mpp]");
  if (!b || MXQ.busy) return;
  MXQ.mpp = +b.dataset.mpp;
  try {
    localStorage.setItem("mt-mpp", MXQ.mpp);
  } catch (x) {}
  mxqShow();
};
function mxqTs() {
  mxqMpp();
  try {
    $("mxqBpm").textContent = bpm;
  } catch (e) {}
  const el = $("mxqTs"),
    cur = (PHOTO_TS ? PHOTO_TS.ts : MXQ.ts || [4, 4]).join("/"),
    opts = ["2/4", "3/4", "4/4", "6/8"];
  el.innerHTML =
    `<span>Chiffrage</span>` +
    opts.map(o => `<button type="button" data-ts="${o}" class="${o === cur ? "on" : ""}">${o}</button>`).join("");
}
$("mxqTs").onclick = e => {
  const b = e.target.closest("button[data-ts]");
  if (!b || MXQ.busy) return;
  const ts = b.dataset.ts.split("/").map(Number);
  PHOTO_TS = {q: (ts[0] * 4) / ts[1], ts};
  mxqShow();
};
async function mxqBuild() {
  if (MIDI) {
    MXQ.ts = MIDI.S.ts;
    return {
      doc: MIDI.doc,
      hands: MIDI.hands,
      key: MIDI.key,
      title: MIDI.title,
      hints: null,
      pageStart: [0],
      ppq: MIDI.doc.ppq
    };
  }
  const S = await songAll(PHOTO_TS || undefined);
  if (!S.ev.length) throw new Error("Aucune note à convertir sur cette partition.");
  MXQ.ts = S.ts;
  const b = midiFile(S, bpm),
    doc = MXE.read(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "partition.mid"),
    ki = MXE.keyInfo(doc),
    key = ki.source === "midi" ? ki.key : ki.estimate || "C";
  const hands = {};
  for (const t of doc.tracks) hands[t.index] = t.hand;
  const title = ($("ttl").textContent || "Ma partition").trim();
  return {doc, hands, key, title, hints: hintsOf(S), pageStart: S.pageStart || [0]};
}
async function mxqShow() {
  const P = $("mxqPages"),
    M = $("mxqMsg");
  mxqTs();
  const sig = mxqSig(),
    PH0 = mxqPH();
  if (MXQ.sig === sig && MXQ.item) {
    M.textContent = "";
    requestAnimationFrame(() => {
      if (!PLAY) mxqRender(MXQ.view || 0, 0);
    });
    return;
  }
  if (MXQ.busy) return;
  MXQ.busy = true;
  for (const u of MXQ.urls) URL.revokeObjectURL(u);
  MXQ.urls = [];
  MXQ.imgs = null;
  {
    const c = $("mxqC"),
      x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
  }
  M.innerHTML = `<span id="mxqTxt">Préparation de la partition MusiTone…</span><div class="bar"><i id="mxqBarI"></i></div>`;
  try {
    const B = await mxqBuild();
    mxqTs();
    const PH = PH0,
      r = await MXE.generate(
        B.doc,
        B.hands,
        B.key,
        B.title,
        "png",
        (v, m) => {
          const i = $("mxqBarI"),
            t = $("mxqTxt");
          if (i) i.style.width = v + "%";
          if (t) t.textContent = m;
        },
        B.hints,
        {mpp: MXQ.mpp, H: PH}
      );
    MXQ.item = {
      ...B,
      pages: r.pages.map(p => p.blob),
      notes: r.notes,
      measures: r.measures,
      sys: r.systems,
      mpp: MXQ.mpp,
      H: PH
    };
    MXQ.sig = sig;
    M.textContent = "";
    MXQ.imgs = await Promise.all(
      MXQ.item.pages.map(
        bl =>
          new Promise(res => {
            const u = URL.createObjectURL(bl);
            MXQ.urls.push(u);
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => res(null);
            im.src = u;
          })
      )
    );
    MXQ.view = Math.min(MXQ.view || 0, MXQ.item.pages.length - 1);
    if (!PLAY) mxqRender(MXQ.view, 0);
  } catch (x) {
    M.innerHTML = `<b>${String(x.message || x).replace(/</g, "&lt;")}</b>`;
  }
  MXQ.busy = false;
  if (document.body.classList.contains("mxv") && mxqSig() !== MXQ.sig) mxqShow();
}
function setView(v) {
  if (MIDI && v !== "m") {
    goHome();
    return;
  }
  const m = v === "m";
  closeTransient();
  document.body.classList.toggle("mxv", m);
  $("mxq").hidden = !m;
  for (const b of $("vsw").children) {
    const on = (b.dataset.v === "m") === m;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on);
  }
  if (m) {
    mxqShow();
    requestAnimationFrame(() => {
      if (MXQ.item && !PLAY) mxqRender(MXQ.view || 0, 0);
    });
  } else if (pages[cur]) {
    const pg = pages[cur];
    if (!pg.cv) show(cur);
    else
      requestAnimationFrame(() => {
        try {
          refresh();
        } catch (e) {}
      });
  }
}
$("steps3").onclick = e => {
  const b = e.target.closest("button");
  if (!b || b.hasAttribute("aria-current")) return;
  const k = b.dataset.s;
  if (document.body.classList.contains("keymode")) keyMode(false);
  if (k === "1") staffFit({re: true});
  else if (k === "2") {
    keyMode(true);
    $("kmStep").hidden = false;
    $("kmStep").textContent = "Étape 2 · La gamme";
    $("kmT").textContent = "Les ♯ ou ♭ de votre partition";
  }
};
$("sfBtn").onclick = () => {
  try {
    document.querySelector("details.adv").open = false;
  } catch (e) {}
  staffFit();
};
$("vsw").onclick = e => {
  const b = e.target.closest("button[data-v]");
  if (b) setView(b.dataset.v);
};
$("goHome").addEventListener("click", () => setView("c"));
$("mxqPdf").onclick = async () => {
  const btn = $("mxqPdf");
  if (MXQ.busy) return;
  btn.disabled = true;
  const t = btn.textContent;
  try {
    const B = await mxqBuild();
    const r = await MXE.generate(
      B.doc,
      B.hands,
      B.key,
      B.title,
      "pdf",
      v => {
        btn.textContent = Math.round(v) + " %";
      },
      B.hints
    );
    const name = (B.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "partition") + " - MusiTone.pdf";
    let done = false;
    if (dl) {
      try {
        await dl.save({filename: name, data: r.pdf});
        done = true;
      } catch (x) {
        if (x && x.code === "declined") done = true;
      }
    }
    if (!done) {
      const u = URL.createObjectURL(r.pdf),
        a = document.createElement("a");
      a.href = u;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    }
  } catch (x) {
    toast(x.message || "Échec du PDF");
  }
  btn.textContent = t;
  btn.disabled = false;
};
$("mxqSave").onclick = async () => {
  const it = MXQ.item;
  if (!it || !window.MXUI) return;
  const ok = await MXUI.save({
    id: Date.now().toString(36),
    title: it.title,
    fmt: "png",
    key: it.key,
    date: Date.now(),
    notes: it.notes,
    measures: it.measures,
    meter: (MXQ.ts || [4, 4]).join("/"),
    pages: it.pages,
    pdf: null,
    source: "Partition colorée"
  });
  toast(ok ? "Enregistrée dans Mes partitions" : "Enregistrée pour cette session");
};

/* curseur de lecture sur la partition MusiTone verticale : même horloge que la partition classique */

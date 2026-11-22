/* ---------- export ---------- */
const base = () => (pages[0]?.name || "partition").replace(/\.[^.]+$/, "");
async function save(name, blob) {
  if (dl) {
    try {
      await dl.save({filename: name, data: blob});
      return;
    } catch (e) {
      if (e && e.code === "declined") return;
    }
  }
  /* hors de Claude, sur téléphone : la feuille de partage (Enregistrer dans Fichiers, Photos, envoyer…) */
  try {
    if (!dl && matchMedia("(pointer:coarse)").matches && navigator.canShare) {
      const f = new File([blob], name, {type: blob.type || "application/octet-stream"});
      if (navigator.canShare({files: [f]})) {
        await navigator.share({files: [f], title: name});
        return;
      }
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  try {
    const u = URL.createObjectURL(blob),
      t = document.createElement("a");
    t.href = u;
    t.download = name;
    document.body.appendChild(t);
    t.click();
    t.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
    toast("Fichier enregistré : " + name);
    return;
  } catch (e) {}
  if (/\.png$/.test(name)) {
    $("mImg").src = URL.createObjectURL(blob);
    $("modal").classList.add("on");
  } else toast("Export impossible ici");
}

$("kitDl").onclick = e => {
  e.preventDefault();
  openKit();
};
function openKit() {
  let K = $("kitV");
  if (!K) {
    K = document.createElement("div");
    K.id = "kitV";
    K.className = "kitV";
    K.innerHTML =
      '<div class="kvTop"><button class="ovBack" id="kvBack" aria-label="Retour">‹</button><b>Kit d’étiquettes</b><small>Imprimez, découpez, collez au-dessus des touches</small></div><div class="kvPages">' +
      [1, 2, 3].map(i => '<img loading="lazy" alt="Page ' + i + '" src="kitp-' + i + '.jpg">').join("") +
      '</div><div class="kvBar"><button class="cta" id="kvDl">Télécharger le PDF</button></div>';
    document.body.appendChild(K);
    $("kvBack").onclick = () => {
      K.classList.remove("on");
      try {
        history.state && history.state.kit && history.back();
      } catch (e) {}
    };
    $("kvDl").onclick = kitSave;
  }
  K.querySelector(".kvPages").scrollTop = 0;
  K.classList.add("on");
}
async function kitSave() {
  const a = $("kvDl");
  a.style.opacity = 0.6;
  a.style.opacity = 0.6;
  try {
    const r = await fetch("kit-musitone.pdf");
    if (!r.ok) throw 0;
    const b = await r.blob();
    if (dl) {
      try {
        await dl.save({filename: "MusiTone-kit-etiquettes.pdf", data: b});
        return;
      } catch (x) {
        if (x && x.code === "declined") return;
      }
    }
    const u = URL.createObjectURL(b);
    const t = document.createElement("a");
    t.href = u;
    t.download = "MusiTone-kit-etiquettes.pdf";
    document.body.appendChild(t);
    t.click();
    t.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  } catch (x) {
    location.href = "kit-musitone.pdf";
  } finally {
    a.style.opacity = "";
  }
}
$("keySel").onchange = () => {
  KEYOV = null;
  try {
    cachePng();
    updKeyBar();
  } catch (e) {}
};

/* armure : on recopie les ♯ / ♭ du début comme on ajoute une note : on touche la portée, l'appli trouve la note et pose le signe à sa couleur */
let KEYOV = null;
const KP = {flat: false, items: [], sel: -1};
const KP_SP = {3: 8, 0: 5, 4: 9, 1: 6, 5: 3, 2: 7, 6: 4},
  KP_FP = {6: 4, 2: 7, 5: 3, 1: 6, 4: 2, 0: 5, 3: 1},
  KSP = 12,
  KBASE = 86,
  kpY = p => KBASE - (p * KSP) / 2,
  kpL = p => (((2 + p) % 7) + 7) % 7;

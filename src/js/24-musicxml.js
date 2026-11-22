/* ---------- MusicXML (sans erreur) ---------- */
const OSMD_URL = "https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.0/build/opensheetmusicdisplay.min.js";
let osmd = null,
  xz = 1,
  xname = "partition";
const isXml = f => /\.(musicxml|xml|mxl)$/i.test(f.name);
async function openXml(f) {
  $("err").style.display = "none";
  $("empty").hidden = true;
  $("work").hidden = true;
  $("bar").hidden = true;
  document.body.classList.remove("working");
  document.body.classList.remove("home");
  $("xml").hidden = false;
  $("xbusy").classList.add("on");
  $("osmd").innerHTML = "";
  xname = f.name.replace(/\.[^.]+$/, "");
  try {
    if (!window.opensheetmusicdisplay) await loadScript(OSMD_URL);
    let data;
    if (/\.mxl$/i.test(f.name)) {
      const u = new Uint8Array(await f.arrayBuffer());
      let b = "";
      for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      data = b;
    } else data = await f.text();
    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay($("osmd"), {
      backend: "svg",
      autoResize: true,
      pageFormat: "Endless",
      drawPartNames: false,
      drawingParameters: "default",
      coloringMode: 2,
      coloringSetCustom: PAL.map(p => p[1]).concat(["#000000"]),
      colorStemsLikeNoteheads: false
    });
    await osmd.load(data);
    {
      const w = $("osmd").clientWidth || 800;
      xz = Math.max(0.45, Math.min(1, w / 820));
    }
    osmd.zoom = xz;
    osmd.render();
    let n = 0;
    try {
      const it = osmd.cursor && osmd.cursor.Iterator;
    } catch (e) {}
    $("xstat").textContent = "Couleurs appliquées d’après le fichier";
  } catch (e) {
    $("xml").hidden = true;
    fail("Fichier MusicXML illisible : " + (e.message || e));
  }
  $("xbusy").classList.remove("on");
}
$("xfile").onchange = e => {
  const f = e.target.files[0];
  if (f) {
    if (isXml(f)) openXml(f);
    else
      fail(
        "Ce bouton attend un fichier MusicXML (.musicxml, .xml ou .mxl). Pour une photo ou un PDF, utilisez l’autre bouton."
      );
  }
  e.target.value = "";
};
$("xnew").onclick = () => {
  $("xml").hidden = true;
  $("empty").hidden = false;
  $("osmd").innerHTML = "";
  osmd = null;
};
$("xzin").onclick = () => {
  if (!osmd) return;
  xz = Math.min(3, xz * 1.25);
  osmd.zoom = xz;
  osmd.render();
};
$("xzout").onclick = () => {
  if (!osmd) return;
  xz = Math.max(0.4, xz / 1.25);
  osmd.zoom = xz;
  osmd.render();
};
$("xpdf").onclick = async () => {
  const btn = $("xpdf"),
    box = $("osmd");
  btn.disabled = true;
  try {
    if (!window.jspdf) await loadScript(JSPDF);
    const {jsPDF} = window.jspdf;
    box.style.width = "900px";
    osmd.setOptions({pageFormat: "A4_P", pageBackgroundColor: "#FFFFFF"});
    osmd.zoom = 1;
    osmd.render();
    const svgs = [...box.querySelectorAll("svg")];
    if (!svgs.length) throw new Error("rien à exporter");
    const doc = new jsPDF({unit: "pt", format: "a4"}),
      PW = 595.28,
      PH = 841.89;
    for (let i = 0; i < svgs.length; i++) {
      const sv = svgs[i],
        r = sv.getBoundingClientRect(),
        w = r.width,
        h = r.height;
      const src = new XMLSerializer().serializeToString(sv),
        url = URL.createObjectURL(new Blob([src], {type: "image/svg+xml"}));
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error("image"));
        im.src = url;
      });
      const cv = document.createElement("canvas");
      cv.width = Math.round(w * 2);
      cv.height = Math.round(h * 2);
      const c = cv.getContext("2d");
      c.fillStyle = "#fff";
      c.fillRect(0, 0, cv.width, cv.height);
      c.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      if (i) doc.addPage();
      const k = Math.min(PW / w, PH / h);
      doc.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", (PW - w * k) / 2, 0, w * k, h * k);
    }
    await save(xname + "-musitone.pdf", doc.output("blob"));
  } catch (e) {
    $("xstat").textContent = "Export PDF impossible : " + (e.message || e);
  }
  box.style.width = "";
  osmd.setOptions({pageFormat: "Endless"});
  osmd.zoom = xz;
  osmd.render();
  btn.disabled = false;
};

/* « ‹ » pendant l'ouverture : on s'est trompé de partition → retour à l'accueil, sans la garder dans « Mes partitions » */
function cancelOpen() {
  try {
    clearTimeout(projT);
  } catch (e) {}
  if (PROJ && !PROJ.restored && window.MXUI && MXUI.del) {
    const id = PROJ.id;
    MXUI.del(id).catch(() => {});
    setTimeout(() => MXUI.del(id).catch(() => {}), 1600);
  }
  PROJ = null;
  try {
    keyMode(false);
  } catch (e) {}
  ["crop", "sf"].forEach(k => $(k).classList.remove("on"));
  $("busy").classList.remove("on");
  goHome();
}
function cleanScan(img) {
  try {
    const k = Math.min(1, 240 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)),
      w = Math.max(1, Math.round((img.naturalWidth || img.width) * k)),
      h = Math.max(1, Math.round((img.naturalHeight || img.height) * k)),
      c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, w, h);
    const D = x.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 0; i < D.length; i += 4) if (Math.min(D[i], D[i + 1], D[i + 2]) >= 242) n++;
    return n / (w * h) > 0.62;
  } catch (e) {
    return false;
  }
}
async function openFile(f, opt = {}) {
  if (isXml(f)) return openXml(f);
  $("err").style.display = "none";
  pages = [];
  pdfDoc = null;
  try {
    $("keyBar").classList.remove("ready");
    document.body.classList.remove("keymode");
    KEYOV = null;
    $("keySel").value = "auto";
  } catch (e) {}
  zoom = 1;
  try {
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      $("empty").hidden = true;
      $("work").hidden = false;
      $("bar").hidden = false;
      document.body.classList.add("working");
      document.body.classList.remove("home");
      $("busy").classList.add("on");
      await loadScript(PDFJS);
      await loadScript(PDFW);
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFW;
      pdfDoc = await pdfjsLib.getDocument({data: new Uint8Array(await f.arrayBuffer())}).promise;
      for (let i = 1; i <= Math.min(pdfDoc.numPages, 40); i++) pages.push({kind: "pdf", num: i, name: f.name});
      pdfDoc._blob = f;
    } else {
      const url = URL.createObjectURL(f);
      let img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("Image illisible. Formats acceptés : JPEG, PNG, WebP."));
        img.src = url;
      });
      const n = 1 + (opt.more || []).length;
      if (n > 1) $("crTitle").textContent = "Recadrer la page 1 sur " + n;
      const clean = cleanScan(img);
      if (!opt.noCrop && !clean) {
        img = await cropUI(img);
        if (!img) {
          $("crTitle").textContent = "Recadrer la partition";
          cancelOpen();
          return;
        }
      }
      if (!img._blob) img._blob = f;
      pages.push({kind: "img", img, name: f.name, clean: clean || !!opt.demo});
      for (let i = 0; i < (opt.more || []).length; i++) {
        const pg = await loadPage(opt.more[i], "Recadrer la page " + (i + 2) + " sur " + n);
        if (pg) {
          pg.name = f.name;
          pages.push(pg);
        }
      }
      $("crTitle").textContent = "Recadrer la partition";
    }
    if (opt.demo) PROJ = null;
    else projNew(f);
    $("empty").hidden = true;
    $("work").hidden = false;
    $("bar").hidden = false;
    document.body.classList.add("working");
    document.body.classList.remove("home");
    await show(0);
  } catch (e) {
    fail(e.message || String(e));
  }
}
/* plusieurs photos choisies d'un coup = plusieurs pages, dans l'ordre choisi */
async function loadPage(f, title) {
  try {
    const url = URL.createObjectURL(f);
    let img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    $("crTitle").textContent = title || "Recadrer la page";
    const clean = cleanScan(img);
    if (!clean) {
      const c = await cropUI(img);
      if (!c) return null;
      img = c;
    }
    if (!img._blob) img._blob = f;
    return {kind: "img", img, name: f.name, clean};
  } catch (e) {
    toast("Une image n'a pas pu être lue");
    return null;
  }
}
for (const id of ["file", "file2", "fileCam"])
  $(id).onchange = e => {
    const L = [...e.target.files];
    e.target.value = "";
    if (!L.length) return;
    const imgs = L.filter(f => !(f.type === "application/pdf" || /\.pdf$/i.test(f.name)) && !isXml(f));
    if (L.length > 1 && imgs.length === L.length) openFile(imgs[0], {more: imgs.slice(1)});
    else openFile(L[0]);
  };
$("fileAdd").onchange = async e => {
  const L = [...e.target.files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  e.target.value = "";
  try {
    document.querySelector("details.adv").open = false;
  } catch (x) {}
  if (!L.length || !pages.length) return;
  const first = pages.length;
  for (let i = 0; i < L.length; i++) {
    const pg = await loadPage(L[i], "Recadrer la page " + (pages.length + 1));
    if (pg) {
      pg.name = pages[0].name;
      pages.push(pg);
    }
  }
  $("crTitle").textContent = "Recadrer la partition";
  if (pages.length > first) {
    toast(pages.length - first > 1 ? pages.length - first + " pages ajoutées" : "Page " + pages.length + " ajoutée");
    try {
      projSoon();
    } catch (x) {}
    await show(first);
  }
};
$("demo").onclick = () => {
  const bin = atob(SAMPLE.split(",")[1]),
    u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  openFile(new File([u], "exemple.png", {type: "image/png"}), {noCrop: 1, demo: 1});
};
const em = $("empty");
["dragenter", "dragover"].forEach(t =>
  em.addEventListener(t, e => {
    e.preventDefault();
    em.classList.add("drag");
  })
);
["dragleave", "drop"].forEach(t =>
  em.addEventListener(t, e => {
    e.preventDefault();
    em.classList.remove("drag");
  })
);
em.addEventListener("drop", e => {
  const f = e.dataTransfer.files[0];
  if (f) openFile(f);
});

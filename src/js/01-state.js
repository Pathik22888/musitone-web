/* ---------- état ---------- */
let lastPinch = 0,
  pages = [],
  cur = 0,
  zoom = 1,
  pdfDoc = null,
  dl = null,
  hist = [],
  sel = null;
const tick = () => new Promise(r => setTimeout(r, 20));
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("Chargement impossible : " + src));
    document.head.appendChild(s);
  });
}
if (window.claude && claude.use)
  claude
    .use("downloads")
    .then(d => {
      dl = d;
    })
    .catch(() => {});

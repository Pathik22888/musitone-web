/* ---------- import ---------- */
/* changement d'écran : on ferme tout ce qui est ouvert (panneau de correction, repère, menus, mode clé) pour repartir propre */
function closeTransient() {
  try {
    if (PR.on && !PR.turning) prClose();
  } catch (e) {}
  try {
    closeSheet();
  } catch (e) {}
  try {
    if (document.body.classList.contains("showLeg")) legSet(false);
  } catch (e) {}
  for (const id of ["expPop", "clefPop"]) {
    const m = $(id);
    if (m) m.hidden = true;
  }
  try {
    const d = document.querySelector("details.adv");
    if (d) d.open = false;
  } catch (e) {}
  try {
    const b = document.querySelector(".mxqBar");
    if (b) b.classList.remove("open");
    $("mxqOpt").classList.remove("on");
  } catch (e) {}
  try {
    if (CLEFMODE) clefMode(false);
  } catch (e) {}
  try {
    hideHint();
  } catch (e) {}
}
function goHome() {
  closeTransient();
  try {
    playStop();
  } catch (e) {}
  if (MIDI) {
    MIDI = null;
    document.body.classList.remove("midiOnly");
    MXQ.sig = null;
    MXQ.item = null;
  }
  try {
    if (document.body.classList.contains("mxv")) setView("c");
  } catch (e) {}
  closeSheet();
  $("work").hidden = true;
  $("bar").hidden = true;
  $("empty").hidden = false;
  $("err").style.display = "none";
  document.body.classList.remove("working", "editing", "reviewing", "zoning", "showOrig", "showLeg");
  document.body.classList.add("home");
  $("coach").hidden = true;
  hideHint();
  scrollTo(0, 0);
}
$("goHome").onclick = goHome;
function fail(m) {
  $("err").textContent = m;
  $("err").style.display = "block";
  $("work").hidden = true;
  $("bar").hidden = true;
  $("empty").hidden = false;
  document.body.classList.remove("working");
  document.body.classList.add("home");
}

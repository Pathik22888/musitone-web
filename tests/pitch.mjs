// Test de la détection de hauteur avec les vrais sons de piano (piano2/*.mp3, décodés par ffmpeg).
// Usage : node tests/pitch.mjs              (nécessite ffmpeg)
//         WAV=fichier.wav node tests/pitch.mjs   -> notes reconnues dans un enregistrement
//         node tests/pitch.mjs keep=0.3          -> essayer un autre réglage de PITCH
import fs from "fs";
import path from "path";
import os from "os";
import {execFileSync} from "child_process";
import {fileURLToPath} from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = fs.readFileSync(path.join(ROOT, "src/js/34-pitch.js"), "utf8");
const {pitchTracker, PITCH, pitchPeaks, pitchScore} = new Function(code + "\nreturn {pitchTracker, PITCH, pitchPeaks, pitchScore};")();
for (const a of process.argv.slice(2)) { const [k, v] = a.split("="); if (v) PITCH[k] = +v; }

const SR = 48000, N = 8192, HOP = 800; // 60 images/s comme requestAnimationFrame
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const nm = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pitch-"));
function load(file) {
  const out = path.join(tmp, path.basename(file) + ".raw");
  if (!fs.existsSync(out)) execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", out]);
  const b = fs.readFileSync(out);
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}
// AnalyserNode : fenêtre de Blackman, |X|/N, en dB
const WIN = new Float32Array(N).map((_, i) => 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N));
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], j = i + k + len / 2;
        const vr = re[j] * cr - im[j] * ci, vi = re[j] * ci + im[j] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[j] = ur - vr; im[j] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function spectrum(x, end) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const k = end - N + i; re[i] = (k >= 0 && k < x.length ? x[k] : 0) * WIN[i]; }
  fft(re, im);
  const db = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) db[i] = 20 * Math.log10(Math.hypot(re[i], im[i]) / N + 1e-12);
  return db;
}
function rms(x, end) { let s = 0, c = 0; for (let k = end - N; k < end; k += 4) if (k >= 0 && k < x.length) { s += x[k] * x[k]; c++; } return Math.sqrt(s / Math.max(1, c)); }
const NOTE = {C: 0, Ds: 3, Fs: 6, A: 9};
const midiOf = f => { const [, n, o] = path.basename(f).match(/^([A-Z]s?)(\d)/); return 12 * (+o + 1) + NOTE[n]; };
// léger bruit de pièce, gain de micro de téléphone
let seed = 1; const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2e-3;
function mix(parts, len) {
  const y = new Float32Array(len);
  for (const [x, off, g] of parts) for (let i = 0; i < x.length && i + off < len; i++) y[i + off] += x[i] * g;
  for (let i = 0; i < len; i++) y[i] = y[i] * 0.5 + noise();
  return y;
}
// simule l'appli : détection d'attaque, puis analyse pendant quelques images
function run(y, expected) {
  const tr = pitchTracker(SR, N), events = [];
  for (let end = N; end < y.length; end += HOP) {
    const t = (end / SR) * 1000, o = tr.feed(spectrum(y, end), rms(y, end), t, expected);
    if (o.hit) events.push({t: t / 1000, notes: []});
    if (events.length) { events[events.length - 1].notes = o.notes; }
  }
  return events;
}

if (process.env.WAV) { const x = load(process.env.WAV); console.log(run(x).map(e => e.t.toFixed(2) + ":" + (e.notes||[]).map(nm).join(",")).join(" | ")); process.exit(0); }
const files = fs.readdirSync(path.join(ROOT, "public/piano2")).filter(f => f.endsWith(".mp3")).sort();
let ok = 0, oct = 0, tot = 0, extra = 0, retrig = 0;
const bad = [];
for (const f of files) {
  const m = midiOf(f);
  if (m < PITCH.lo || m > PITCH.hi) continue;
  const x = load(path.join(ROOT, "public/piano2", f));
  const evs = run(mix([[x, SR * 0.4, 1]], x.length + SR * 0.4));
  tot++;
  if (evs.length !== 1) { retrig++; bad.push(`${f}: ${evs.length} attaques (${evs.map(e => e.t.toFixed(2)).join(" ")})`); }
  const got = evs[0] ? evs[0].notes : [];
  if (got[0] === m) ok++;
  else if (got[0] != null && (got[0] - m) % 12 === 0) { oct++; bad.push(`${f}: ${nm(m)} -> ${nm(got[0])} (octave)`); }
  else bad.push(`${f}: ${nm(m)} -> ${got.map(nm).join(",") || "rien"}`);
  if (got.length > 1) extra++;
}
// toutes les notes : échantillons transposés d'un ou deux demi-tons, joués doucement
const shift = (x, k) => { const r = Math.pow(2, k / 12), y = new Float32Array(Math.floor(x.length / r)); for (let i = 0; i < y.length; i++) { const p = i * r, j = Math.floor(p), f = p - j; y[i] = x[j] * (1 - f) + (x[j + 1] || 0) * f; } return y; };
for (const f of files.filter(f => f.includes("v6"))) for (const k of [1, 2]) {
  const m = midiOf(f) + k;
  if (m < PITCH.lo || m > PITCH.hi) continue;
  const y = shift(load(path.join(ROOT, "public/piano2", f)), k);
  const evs = run(mix([[y, SR * 0.4, 0.35]], y.length + SR * 0.4));
  tot++;
  if (evs.length !== 1) { retrig++; bad.push(`${nm(m)} (transposé): ${evs.length} attaques`); }
  const got = evs[0] ? evs[0].notes : [];
  if (got[0] === m) ok++;
  else if (got[0] != null && (got[0] - m) % 12 === 0) { oct++; bad.push(`${nm(m)} (transposé) -> ${nm(got[0])} (octave)`); }
  else bad.push(`${nm(m)} (transposé) -> ${got.map(nm).join(",") || "rien"}`);
  if (got.length > 1) extra++;
}
console.log(`Notes seules : ${ok}/${tot} exactes, ${oct} erreurs d'octave, ${extra} avec notes en trop, ${retrig} relances pendant la note tenue`);
// accords de 3 notes (C, D#, F#, A échantillonnés : on prend des accords dans ces notes)
const by = Object.fromEntries(files.filter(f => f.includes("v13")).map(f => [midiOf(f), load(path.join(ROOT, "public/piano2", f))]));
let cok = 0, ctot = 0;
for (const r of [48, 51, 54, 57, 60, 63, 66, 69, 72]) {
  const ch = [r, r + 3, r + 7].filter(k => by[k]);
  if (ch.length < 3) { const c2 = [r, r + 3, r + 6].filter(k => by[k]); if (c2.length === 3) ch.splice(0, 3, ...c2); else continue; }
  const evs = run(mix(ch.map(k => [by[k], SR * 0.4, 0.6]), SR * 2));
  const got = evs[0] ? evs[0].notes : [];
  ctot++;
  const good = ch.every(k => got.includes(k));
  if (good) cok++; else bad.push(`accord ${ch.map(nm).join("-")} -> ${got.map(nm).join(",")} (${evs.length} attaques)`);
}
console.log(`Accords : ${cok}/${ctot}`);
// Accords usuels : vérifier les octaves et l'absence de notes fantômes.
const chordCases = [
  [60, 64, 67],
  [60, 64, 67, 70],
];
let exactChords = 0;
for (const chord of chordCases) {
  const parts = chord.map((m, i) => {
    const base = m - m % 3;
    const gain = i === 0 ? 1 : i === 1 ? 0.8 : 0.7;
    return [shift(by[base], m - base), SR * 0.4, gain];
  });
  const evs = run(mix(parts, Math.round(SR * 1.1)));
  const got = evs[0]?.notes || [];
  if (evs.length === 1 && got.length === chord.length && chord.every(m => got.includes(m))) exactChords++;
  else bad.push(`accord ${chord.map(nm).join("-")} -> ${got.map(nm).join(",")} (${evs.length} attaques)`);
}
console.log(`Accords usuels, sans note en trop : ${exactChords}/${chordCases.length}`);
// Cas du Tambourineur : C4 doit être joué en plus de C3 et E3.
const octaveTarget = [48, 52, 60];
const seedBeforeOctaves = seed;
let octavesOK = 0;
for (const rightHand of [null, 72, 60]) {
  const parts = [[by[48], SR * 0.4, 1], [shift(by[51], 1), SR * 0.4, 0.8]];
  if (rightHand !== null) parts.push([by[rightHand], SR * 0.4, 0.8]);
  const evs = run(mix(parts, Math.round(SR * 1.1)), octaveTarget);
  const got = evs[0]?.notes || [];
  const matches = got.length === octaveTarget.length && octaveTarget.every(m => got.includes(m));
  if (evs.length === 1 && matches === (rightHand === 60)) octavesOK++;
  else bad.push(`accord à l’octave (${rightHand === null ? "main gauche seule" : nm(rightHand)}) -> ${got.map(nm).join(",")}`);
}
// Les cas de réverbération conservent leur bruit de référence.
seed = seedBeforeOctaves;
console.log(`Accord à l’octave, version exacte et refus : ${octavesOK}/3`);
// Sol naturel sur toutes ses octaves prises en charge, avec une attaque douce.
const seedBeforeG = seed;
let gNotesOK = 0;
for (const m of [31, 43, 55, 67, 79, 91]) {
  const events = run(mix([[shift(by[m - 1], 1), SR * 0.4, 0.18]], Math.round(SR * 1.1)));
  const got = events[0]?.notes || [];
  if (events.length === 1 && got.length === 1 && got[0] === m) gNotesOK++;
  else bad.push(`Sol doux ${nm(m)} -> ${got.map(nm).join(",")}`);
}
console.log(`Sol joué doucement : ${gNotesOK}/6`);

const gTarget = [55, 59, 62];
const gCases = [
  [[55, 59, 62], 1],
  [[55, 59, 62], 0.45],
  [[59, 62], 1],
  [[67, 59, 62], 1],
  [[55, 59, 62, 67], 0.45],
  [[43, 47, 50], 1, [43, 47, 50]],
  [[55, 47, 50], 1, [43, 47, 50]],
];
let gChordsOK = 0;
for (const [played, gain, target = gTarget] of gCases) {
  const parts = played.map(m => [shift(by[m - m % 3], m % 3), SR * 0.35, m === 55 ? gain : 1]);
  const events = run(mix(parts, Math.round(SR * 0.9)), target);
  const got = events[0]?.notes || [];
  const matches = got.length === target.length && target.every(m => got.includes(m));
  const correct = played.length === target.length && target.every(m => played.includes(m));
  if (events.length === 1 && matches === correct) gChordsOK++;
  else bad.push(`Sol en accord ${played.map(nm).join("-")} -> ${got.map(nm).join(",")}`);
}
console.log(`Sol en accord, versions exactes et refus : ${gChordsOK}/${gCases.length}`);
seed = seedBeforeG;
// note tenue puis nouvelle note par-dessus : 2 attaques attendues, la 2e reconnue
let sok = 0, stot = 0;
for (const [a, b] of [[60, 64 - 1], [57, 60], [48, 54], [69, 72], [63, 66], [60, 60], [45, 45], [72, 60], [54, 51]]) {
  if (!by[a] || !by[b]) continue;
  const evs = run(mix([[by[a], SR * 0.4, 1], [by[b], SR * 1.6, 0.8]], SR * 3));
  stot++;
  if (evs.length === 2 && evs[1].notes[0] === b) sok++;
  else bad.push(`enchaînement ${nm(a)} puis ${nm(b)} -> ${evs.map(e => e.t.toFixed(2) + ":" + e.notes.map(nm).join(",")).join(" | ")}`);
}
console.log(`Enchaînements (dont même note rejouée) : ${sok}/${stot}`);
// pièce qui résonne : réverbération ~1 s
const rev = x => { const L = SR * 1.2, y = new Float32Array(x.length + L), ir = new Float32Array(L);
  for (let i = 0; i < L; i += 7) ir[i] = noise() * 60 * Math.exp(-i / (SR * 0.25));
  for (let i = 0; i < x.length; i++) { y[i] += x[i]; if (x[i] === 0) continue; for (let j = 0; j < L; j += 7) y[i + j] += x[i] * ir[j]; }
  return y; };
let rok = 0, rtot = 0;
for (const [a, b] of [[60, 63], [57, 60], [66, 69]]) {
  const y = rev(mix([[by[a], SR * 0.4, 1], [by[b], SR * 1.4, 0.8]], SR * 2.5));
  const evs = run(y);
  rtot++;
  if (evs.length === 2 && evs[0].notes[0] === a && evs[1].notes[0] === b) rok++;
  else bad.push(`réverbération ${nm(a)} puis ${nm(b)} -> ${evs.map(e => e.t.toFixed(2) + ":" + e.notes.map(nm).join(",")).join(" | ")}`);
}
// bruits sans note : claquement, coup sur le meuble, souffle
let nok = 0;
const bursts = [
  ["claquement", i => (i < 300 ? noise() * 400 : 0)],
  ["coup sourd", i => Math.sin(i / 60) * Math.exp(-i / 2000) * 0.5 + noise() * 50 * Math.exp(-i / 500)],
  ["souffle", i => (i < SR * 0.6 ? noise() * 80 : 0)]
];
for (const [name, fn] of bursts) {
  const x = new Float32Array(SR).map((_, i) => fn(i));
  const evs = run(mix([[x, SR * 0.4, 1]], SR * 2));
  const notes = evs.flatMap(e => e.notes || []);
  if (!notes.length) nok++; else bad.push(`${name} -> ${notes.map(nm).join(",")}`);
}
console.log(`Bruits sans note ignorés : ${nok}/${bursts.length}`);
console.log(`Avec réverbération : ${rok}/${rtot}`);
if (process.argv.includes("-v") || bad.length) console.log(bad.join("\n"));
fs.rmSync(tmp, {recursive: true});
const pass = ok + oct >= tot * 0.95 && ok >= tot * 0.9 && retrig === 0 && cok >= ctot - 1 && exactChords === chordCases.length && octavesOK === 3 && gNotesOK === 6 && gChordsOK === gCases.length && sok === stot && rok === rtot && nok === bursts.length;
console.log(pass ? "OK" : "ÉCHEC");
process.exit(pass ? 0 : 1);

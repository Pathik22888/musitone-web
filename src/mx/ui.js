/* MusiTone — studio MIDI : import, mains, gamme, titre, export, bibliothèque */
(()=>{const q=s=>document.getElementById(s),root=q("mx");let doc=null,hands={},key=null,kinfo=null,fmt="pdf",view=null,busy=false,mpp=(()=>{try{return +localStorage.getItem("mt-mpp")||4}catch(e){return 4}})();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const show=id=>{for(const s of root.querySelectorAll(".mx-scr"))s.hidden=s.id!==id;root.scrollTop=0};
const open=id=>{root.hidden=false;document.body.classList.add("mx-on");show(id)};
const close=()=>{if(busy)return;root.hidden=true;document.body.classList.remove("mx-on");clearView()};
/* ---------- bibliothèque (IndexedDB, avec repli en mémoire) ---------- */
let mem=[];const DB=()=>new Promise((res,rej)=>{try{const r=indexedDB.open("musitone-lib",1);r.onupgradeneeded=()=>r.result.createObjectStore("scores",{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}});
async function libAll(){try{const d=await DB();return await new Promise((res,rej)=>{const t=d.transaction("scores").objectStore("scores").getAll();t.onsuccess=()=>res(t.result.sort((a,b)=>b.date-a.date));t.onerror=()=>rej(t.error)})}catch(e){return mem.slice().sort((a,b)=>b.date-a.date)}}
async function libPut(it){try{const d=await DB();await new Promise((res,rej)=>{const t=d.transaction("scores","readwrite");t.objectStore("scores").put(it);t.oncomplete=res;t.onerror=()=>rej(t.error)});return true}catch(e){mem=mem.filter(x=>x.id!==it.id);mem.push(it);return false}}
async function libDel(id){try{const d=await DB();await new Promise((res,rej)=>{const t=d.transaction("scores","readwrite");t.objectStore("scores").delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}catch(e){}mem=mem.filter(x=>x.id!==id)}
/* ---------- import ---------- */
let photo=null;
function load(buf,name,title,origin,ph){if(ph!==undefined)photo=ph;q("mxErr").textContent="";doc=MXE.read(buf,name);
  hands={};for(const t of doc.tracks)hands[t.index]=t.hand;kinfo=MXE.keyInfo(doc);key=kinfo.source==="midi"?kinfo.key:null;if(origin)kinfo.origin=origin;
  q("mxTitle").value=title||name.replace(/\.(mid|midi)$/i,"").replace(/[_-]+/g," ").trim();setup();show("mxSetup")}
q("mxFile").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;q("mxErr").textContent="";
  if(!/\.(mid|midi)$/i.test(f.name)){q("mxErr").textContent="Choisissez un fichier .mid ou .midi.";return}
  try{load(await f.arrayBuffer(),f.name,undefined,undefined,null)}catch(x){q("mxErr").textContent=x.message}};
function fromBytes(buf,name,title,origin,ph){open("mxImport");try{load(buf,name,title,origin,ph||null)}catch(x){q("mxErr").textContent=x.message}}
function setup(){const per=doc.tracks.map(t=>{const lo=Math.min(...doc.notes.filter(n=>n.source_track===t.index).map(n=>n.note)),hi=Math.max(...doc.notes.filter(n=>n.source_track===t.index).map(n=>n.note)),nm=p=>"CCDDEFFGGAAB"[p%12]+(["","#","","#","","","#","","#","","#",""][p%12])+(Math.floor(p/12)-1);
    return`<div class="mx-trk"><div class="mx-tn"><b>${esc(t.name)}</b><span>${t.count} notes · ${nm(lo)} à ${nm(hi)}</span></div><div class="mx-seg" data-t="${t.index}">${[["right","Main droite"],["left","Main gauche"],["split","Partager"],["none","Ignorer"]].map(([v,l])=>`<button type="button" data-v="${v}" class="${hands[t.index]===v?"on":""}">${l}</button>`).join("")}</div></div>`}).join("");
  q("mxTracks").innerHTML=per;q("mxSplitHelp").hidden=!Object.values(hands).includes("split");
  const ms=[...new Set(doc.timeline.map(t=>t[1]+"/"+t[2]))];if(photo){const cur=photo.ts.join("/"),opts=["2/4","3/4","4/4","6/8"];if(!opts.includes(cur))opts.push(cur);
    q("mxMeter").innerHTML=`<b>Mesure : ${cur}</b><span>${photo.confirmed?"Choisie par vous":"Estimée d’après la photo, à vérifier : regardez les deux chiffres au début de la partition."}</span><div class="mx-chips" id="mxTs">${opts.map(o=>`<button type="button" data-ts="${o}" class="${o===cur&&photo.confirmed?"on":""}">${o}</button>`).join("")}</div>`}
  else q("mxMeter").innerHTML=`<b>${doc.timeline.length>1?"Mesures : "+doc.timeline.map(t=>t[1]+"/"+t[2]).join(" → "):"Mesure : "+ms[0]}</b><span>Lue dans le fichier · tempo ${doc.bpm} à la noire</span>`;
  renderKey();renderSum();q("mxWarn").innerHTML=doc.warnings.map(w=>`<p>${esc(w)}</p>`).join("")}
q("mxMeter").onclick=async e=>{const b=e.target.closest("button[data-ts]");if(!b||!photo)return;const ts=b.dataset.ts.split("/").map(Number),t=q("mxTitle").value,hs={...hands},k=key;
  b.textContent="…";try{const R=await photo.rebuild(ts),buf=R.buf;photo.hints=R.hints;photo.ts=ts;photo.confirmed=true;const keep=kinfo.origin;load(buf,doc.name,t,keep);for(const i in hs)if(i in hands)hands[i]=hs[i];if(k)key=k;setup()}catch(x){q("mxWarn").innerHTML=`<p class="mx-err">${esc(x.message)}</p>`}};
q("mxTracks").onclick=e=>{const b=e.target.closest("button[data-v]");if(!b)return;hands[b.parentNode.dataset.t]=b.dataset.v;setup()};
function renderKey(){const k=q("mxKey");let h="";
  if(kinfo.source==="midi")h=`<div class="mx-kst ok"><b>${MXE.keyLabel(key)}</b><span>${kinfo.origin?"Reprise de la gamme choisie sur la partition colorée":"Lue dans le fichier MIDI"}</span></div>`;
  else if(kinfo.source==="multiple")h=`<div class="mx-kst warn"><b>${key?MXE.keyLabel(key):"Plusieurs gammes dans le fichier"}</b><span>${key?"Choisie par vous":"Le MIDI indique "+kinfo.candidates.map(MXE.keyLabel).join(", ")+". Choisissez celle de la partition."}</span></div><div class="mx-chips">${kinfo.candidates.map(c=>`<button type="button" data-k="${c}" class="${key===c?"on":""}">${MXE.keyLabel(c)}</button>`).join("")}</div>`;
  else h=`<div class="mx-kst warn"><b>${key?MXE.keyLabel(key):"Gamme absente du fichier"}</b><span>${key?"Choisie par vous":"Le MIDI n’indique pas de gamme. Choisissez-la : elle décide des couleurs du clavier et des ♯ / ♭."}</span></div>
    <p class="mx-est">Estimation d’après les notes jouées, à confirmer : <b>${MXE.keyLabel(kinfo.estimate)}</b>. Autres possibilités : ${kinfo.alternatives.map(MXE.keyLabel).join(", ")}.</p>
    <div class="mx-chips">${[kinfo.estimate,...kinfo.alternatives].map(c=>`<button type="button" data-k="${c}" class="${key===c?"on":""}">${MXE.keyLabel(c)}${c===kinfo.estimate?" <i>estimée</i>":""}</button>`).join("")}</div>`;
  h+=`<label class="mx-other">Autre gamme <select id="mxKeySel"><option value="">—</option>${MXE.KEYS.map(c=>`<option value="${c}" ${key===c?"selected":""}>${MXE.keyLabel(c)}</option>`).join("")}</select></label>`;
  if(key){const pal=MXE.palette(key),W=[0,2,4,5,7,9,11];h+=`<div class="mx-mini" aria-label="Notes de la gamme">${W.map(pc=>`<i style="background:${pal[pc]?pal[pc].color:"#fff"}">${pal[pc]?pal[pc].label.replace("b","♭"):""}</i>`).join("")}${[[1,1],[3,2],[6,4],[8,5],[10,6]].map(([pc,i])=>`<u style="left:calc(${i}*100%/7 - 4.5%);background:${pal[pc]?pal[pc].color:"#1b1f2c"}">${pal[pc]?pal[pc].label.replace("b","♭"):""}</u>`).join("")}</div>`}
  k.innerHTML=h;q("mxKeySel").onchange=e=>{key=e.target.value||null;renderKey();renderSum()}}
q("mxKey").onclick=e=>{const b=e.target.closest("button[data-k]");if(!b)return;key=b.dataset.k;renderKey();renderSum()};
for(const b of document.querySelectorAll("#mxFmt button"))b.onclick=()=>{fmt=b.dataset.f;for(const x of document.querySelectorAll("#mxFmt button"))x.classList.toggle("on",x===b);renderSum()};
function renderMpp(){const el=q("mxMpp");el.hidden=fmt!=="png";el.innerHTML=`<span>Mesures par page</span><div class="mx-chips">${[2,3,4,6,8].map(n=>`<button type="button" data-mpp="${n}" class="${n===mpp?"on":""}">${n}</button>`).join("")}</div>`}
q("mxMpp").onclick=e=>{const b=e.target.closest("button[data-mpp]");if(!b)return;mpp=+b.dataset.mpp;try{localStorage.setItem("mt-mpp",mpp)}catch(x){}renderMpp()};
function renderSum(){renderMpp();const used=doc.notes.filter(n=>hands[n.source_track]&&hands[n.source_track]!=="none").length,go=q("mxGo");
  let why="";if(!used)why="Sélectionnez au moins une piste.";else if(!key)why="Choisissez la gamme pour continuer.";else if(photo&&!photo.confirmed)why="Confirmez la mesure pour continuer.";
  go.disabled=!!why;q("mxPlay").disabled=!!why;q("mxWhy").textContent=why;go.textContent=fmt==="pdf"?"Créer le PDF A4":"Créer les images smartphone";q("mxCount").textContent=`${used} notes seront dessinées, sans modification de hauteur ni de durée.`}
/* ---------- génération ---------- */
q("mxGo").onclick=async()=>{const title=q("mxTitle").value.trim()||"Ma partition";busy=true;show("mxProg");q("mxPErr").textContent="";q("mxPBack").hidden=true;
  const bar=q("mxBar"),msg=q("mxPMsg");const pr=(v,m)=>{bar.style.width=v.toFixed(1)+"%";q("mxPct").textContent=Math.round(v)+" %";msg.textContent=m};
  try{const r=await MXE.generate(doc,hands,key,title,fmt,pr,photo&&photo.hints,{mpp});const item={id:Date.now().toString(36),title,fmt,key,date:Date.now(),notes:r.notes,measures:r.measures,meter:[...new Set(r.meter)].join(" → "),pages:r.pages.map(p=>p.blob),pdf:r.pdf,source:doc.name};
    window.__mxLast={r,item,hands:{...hands}};const kept=await libPut(item);busy=false;viewItem(item,kept?"Enregistrée dans Mes partitions.":"Votre navigateur ne permet pas d’enregistrer : la partition reste disponible pendant cette session.")}
  catch(x){busy=false;console.error(x);q("mxPErr").textContent=x.message||String(x);q("mxPBack").hidden=false}};
q("mxPBack").onclick=()=>show("mxSetup");
q("mxPlay").onclick=()=>{if(!doc)return;if(!key){q("mxWhy").textContent="Choisissez la gamme pour continuer.";return}const used=doc.notes.filter(n=>hands[n.source_track]&&hands[n.source_track]!=="none").length;if(!used){q("mxWhy").textContent="Sélectionnez au moins une piste.";return}const title=q("mxTitle").value.trim()||"Ma partition";close();if(window.openMidiPlayer)window.openMidiPlayer({doc,hands:{...hands},key,title})};
/* ---------- visionneuse ---------- */
let urls=[];function clearView(){for(const u of urls)URL.revokeObjectURL(u);urls=[];q("mxPages").innerHTML=""}
function viewItem(it,note){clearView();view=it;q("mxVT").textContent=it.title;q("mxVM").textContent=`${it.fmt==="pdf"?"PDF A4":"Images smartphone"} · ${MXE.keyLabel(it.key)} · ${it.measures} mesure${it.measures>1?"s":""} · ${it.notes} note${it.notes>1?"s":""}`;q("mxNote").textContent=note||"";
  q("mxPages").className="mx-pages "+(it.fmt==="pdf"?"a4":"ph");q("mxPages").innerHTML=it.pages.map((b,i)=>{const u=URL.createObjectURL(b);urls.push(u);return`<img src="${u}" alt="Page ${i+1} sur ${it.pages.length}" loading="lazy">`}).join("");
  q("mxSave").textContent=it.fmt==="pdf"?"Télécharger le PDF":it.pages.length>1?`Télécharger les ${it.pages.length} images`:"Télécharger l’image";show("mxView")}
const fname=(t,ext)=>(t.replace(/[\\/:*?"<>|]+/g,"").trim()||"partition")+ext;
async function saveBlob(b,name){if(window.claude&&claude.use){try{const d=await claude.use("downloads");await d.save({filename:name,data:b});return}catch(x){if(x&&x.code==="declined")return}}
  const u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}
q("mxSave").onclick=async()=>{const it=view;if(!it)return;if(it.fmt==="pdf")return saveBlob(it.pdf,fname(it.title,".pdf"));
  const files=it.pages.map((b,i)=>new File([b],fname(it.title,it.pages.length>1?` - ${i+1}.png`:".png"),{type:"image/png"}));
  if(navigator.canShare&&navigator.canShare({files})){try{await navigator.share({files,title:it.title});return}catch(x){if(x&&x.name==="AbortError")return}}
  for(const f of files){await saveBlob(f,f.name);await new Promise(r=>setTimeout(r,350))}};
q("mxVBack").onclick=()=>{clearView();lib()};
q("mxDel").onclick=async()=>{const b=q("mxDel");if(!view)return;if(b.dataset.arm!=="1"){b.dataset.arm="1";const t=b.textContent;b.textContent="Toucher encore pour supprimer";setTimeout(()=>{b.dataset.arm="";b.textContent=t},3000);return}b.dataset.arm="";await libDel(view.id);clearView();lib()};
/* ---------- liste ---------- */
async function lib(){open("mxLib");const all=await libAll(),L=q("mxList");
  if(!all.length){L.innerHTML=`<div class="mx-empty"><b>Aucune partition pour l’instant.</b><span>Chaque partition que vous ouvrez (photo, PDF ou MIDI) est gardée ici, avec vos corrections.</span></div>`;return}
  const kl=it=>it.kind==="proj"?(it.key&&it.key.n?`${it.key.n} ${it.key.flat?"♭":"♯"}`:"sans ♯ ni ♭"):MXE.keyLabel(it.key),np=it=>it.kind==="proj"?(it.src||[]).length:it.pages.length;
  L.innerHTML=all.map(it=>`<button type="button" class="mx-item" data-id="${it.id}"><span class="mx-th ${it.fmt}" data-th="${it.id}"></span><span class="mx-it"><b>${esc(it.title)}</b><span>${it.kind==="proj"?"Partition coloriée":it.fmt==="pdf"?"PDF A4":"Smartphone"} · ${kl(it)} · ${np(it)} page${np(it)>1?"s":""}</span><span>${new Date(it.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</span></span><span class="mx-x" data-del="${it.id}" role="button" aria-label="Supprimer">✕</span></button>`).join("");
  for(const it of all){const im=it.kind==="proj"?it.thumb:it.pages&&it.pages[0];if(!im)continue;const u=URL.createObjectURL(im);urls.push(u);L.querySelector(`[data-th="${it.id}"]`).style.backgroundImage=`url(${u})`}
  L.onclick=async e=>{const del=e.target.closest("[data-del]");if(del){e.stopPropagation();if(del.dataset.arm!=="1"){del.dataset.arm="1";del.textContent="Supprimer ?";setTimeout(()=>{del.dataset.arm="";del.textContent="✕"},3000);return}await libDel(del.dataset.del);lib();return}
    const b=e.target.closest(".mx-item");if(!b)return;const it=all.find(x=>x.id===b.dataset.id);if(it.kind==="proj"){close();if(window.openProject)window.openProject(it);return}viewItem(it)}}
/* ---------- navigation ---------- */
for(const b of root.querySelectorAll("[data-mx-close]"))b.onclick=close;
q("mxNew").onclick=()=>{open("mxImport");q("mxErr").textContent=""};q("mxLibBtn").onclick=lib;q("mxToImp").onclick=()=>{clearView();open("mxImport")};
q("mxBackImp").onclick=()=>kinfo&&kinfo.origin?close():show("mxImport");
window.MXUI={open,lib,fromBytes,save:libPut,del:libDel}})();

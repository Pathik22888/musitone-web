/* MusiTone — MIDI → partition MusiTone. Portage JavaScript du générateur Python
   (midi_import.py, spelling.py, exporter.py, rendering.py, phone_export.py, a4_layout.py).
   Les hauteurs, attaques et durées du MIDI ne sont jamais modifiées. */
const MXE=(()=>{
const LETTERS="CDEFGAB",NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const COLORS={C:"#2F80FF",D:"#FF922E",E:"#35D66B",F:"#FF4B4B",G:"#FFE94A",A:"#A66CFF",B:"#FF70C8"};
const KEYS=["C","G","D","A","E","B","F#","C#","F","Bb","Eb","Ab","Db","Gb","Cb","Am","Em","Bm","F#m","C#m","G#m","D#m","A#m","Dm","Gm","Cm","Fm","Bbm","Ebm","Abm"];
const keyLabel=k=>{const m=k.endsWith("m"),t=(m?k.slice(0,-1):k).replace("#","♯").replace("b","♭");return t+(m?" mineur":" majeur")};
const SF_MAJ={"-7":"Cb","-6":"Gb","-5":"Db","-4":"Ab","-3":"Eb","-2":"Bb","-1":"F","0":"C","1":"G","2":"D","3":"A","4":"E","5":"B","6":"F#","7":"C#"};
const SF_MIN={"-7":"Abm","-6":"Ebm","-5":"Bbm","-4":"Fm","-3":"Cm","-2":"Gm","-1":"Dm","0":"Am","1":"Em","2":"Bm","3":"F#m","4":"C#m","5":"G#m","6":"D#m","7":"A#m"};

/* ---------- lecture du fichier MIDI (SMF 0 et 1) ---------- */
function parse(buf){const u=new Uint8Array(buf);let p=0;const rd=n=>{let v=0;for(let i=0;i<n;i++)v=v*256+u[p++];return v},tag=()=>String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]);
  if(u.length<14||tag()!=="MThd")throw new Error("Ce fichier n’est pas un MIDI valide.");p+=4;const hl=rd(4),fmt=rd(2),nt=rd(2),div=rd(2);p=8+hl;
  if(fmt===2)throw new Error("Ce MIDI contient des séquences indépendantes (type 2). Exportez-le au format MIDI 0 ou 1.");
  if(div&0x8000||div<=0)throw new Error("Le format de temps de ce MIDI n’est pas pris en charge.");
  const tracks=[];for(let t=0;t<nt&&p+8<=u.length;t++){while(p+8<=u.length&&tag()!=="MTrk"){p+=4;const l=rd(4);p+=l}if(p+8>u.length)break;p+=4;const len=rd(4),end=Math.min(u.length,p+len);
    const ev=[];let tick=0,rs=0;const vlq=()=>{let v=0,b;do{b=u[p++];v=v*128+(b&127)}while(b&128&&p<end);return v};
    while(p<end){tick+=vlq();let st=u[p];if(st&0x80)p++;else st=rs;
      if(st===0xFF){const ty=u[p++],l=vlq(),d=u.subarray(p,p+l);p+=l;
        if(ty===0x03)ev.push({tick,type:"name",text:new TextDecoder("latin1").decode(d)});
        else if(ty===0x51)ev.push({tick,type:"tempo",tempo:(d[0]<<16)|(d[1]<<8)|d[2]});
        else if(ty===0x58)ev.push({tick,type:"ts",num:d[0],den:2**d[1]});
        else if(ty===0x59){const sf=(d[0]<<24>>24),mi=d[1];ev.push({tick,type:"key",key:(mi?SF_MIN:SF_MAJ)[sf]})}
        else if(ty===0x2F)break}
      else if(st===0xF0||st===0xF7){const l=vlq();p+=l}
      else{rs=st;const hi=st&0xF0,ch=st&15;if(hi===0xC0||hi===0xD0){p++}else{const a=u[p++],b=u[p++];if(hi===0x90||hi===0x80)ev.push({tick,type:hi===0x90&&b>0?"on":"off",ch,note:a,vel:b})}}}
    p=end;tracks.push(ev)}
  return{ppq:div,tracks}}

/* ---------- document : notes fidèles, pistes, mesures, armures ---------- */
function read(buf,name){const m=parse(buf),notes=[],infos=[],sigs=[],warnings=[],keys=[],tempos=[];let perc=0,orphans=0;
  m.tracks.forEach((tr,ti)=>{const act=new Map(),tn=[];let tname="";
    for(const e of tr){if(e.type==="name"&&!tname)tname=e.text;if(e.type==="ts")sigs.push([e.tick,e.num,e.den]);if(e.type==="key"&&e.key&&!keys.includes(e.key))keys.push(e.key);if(e.type==="tempo")tempos.push([e.tick,e.tempo]);
      if(e.type!=="on"&&e.type!=="off")continue;if(e.ch===9){if(e.type==="on")perc++;continue}
      const id=e.ch*128+e.note;if(!act.has(id))act.set(id,[]);const q=act.get(id);
      if(e.type==="on")q.push([e.tick,e.vel]);else{if(!q.length){orphans++;continue}const[s,v]=q.shift();if(e.tick<=s)throw new Error(`La piste ${ti+1} contient une note de durée nulle. Corrigez le MIDI avant de l’importer.`);tn.push({note:e.note,start_tick:s,end_tick:e.tick,velocity:v,source_track:ti,channel:e.ch})}}
    for(const q of act.values())if(q.length)throw new Error(`La piste ${ti+1} contient une note sans fin. Réexportez le MIDI depuis votre logiciel de musique.`);
    if(tn.length){const avg=tn.reduce((a,n)=>a+n.note,0)/tn.length,nm=tname||`Piste ${ti+1}`,lo=nm.toLowerCase();
      let hand=["left","gauche","bass","lower","accomp"].some(w=>lo.includes(w))?"left":["right","droite","melody","treble","upper"].some(w=>lo.includes(w))?"right":avg<60?"left":"right";
      infos.push({index:ti,name:nm,count:tn.length,average:avg,hand,lname:lo});notes.push(...tn)}});
  if(!notes.length)throw new Error("Ce fichier ne contient aucune note mélodique exploitable.");
  /* détection des mains (même règle que musitone/midi_engine.py) */
  if(infos.length===1)infos[0].hand="right";else{const LW=["left","main gauche","lh","bass","basse","lower","accomp"],RW=["right","main droite","rh","melody","mélodie","treble","upper","vocal"];
    const L=new Set(infos.filter(t=>LW.some(w=>t.lname.includes(w))).map(t=>t.index)),R=new Set(infos.filter(t=>RW.some(w=>t.lname.includes(w))&&!L.has(t.index)).map(t=>t.index));
    const eL=L.size>0,eR=R.size>0,rem=infos.filter(t=>!L.has(t.index)&&!R.has(t.index));
    if(rem.length&&!(eL&&eR)){const o=infos.slice().sort((a,b)=>a.average-b.average),lo=o[0].average,hi=o[o.length-1].average,mid=(lo+hi)/2;if(!L.size)L.add(o[0].index);if(!R.size)R.add(o[o.length-1].index);
      for(const t of rem){if(L.has(t.index)||R.has(t.index))continue;if(Math.abs(t.average-lo)+2<Math.abs(t.average-hi))L.add(t.index);else if(Math.abs(t.average-hi)+2<Math.abs(t.average-lo))R.add(t.index);else if(t.average<mid-3)L.add(t.index);else if(t.average>mid+3)R.add(t.index)}}
    for(const t of infos){if(L.has(t.index))t.hand="left";else if(R.has(t.index))t.hand="right"}}
  sigs.sort((a,b)=>a[0]-b[0]);const tl=[[0,4,4]];
  for(const[t,n,d]of sigs){if(m.ppq*n*4%d)throw new Error("La mesure de ce MIDI dépasse sa résolution temporelle.");const l=tl[tl.length-1];if(l[0]===t)tl[tl.length-1]=[t,n,d];else if(l[1]!==n||l[2]!==d)tl.push([t,n,d])}
  if(perc)warnings.push(`${perc} notes de percussion ignorées (canal batterie).`);if(orphans)warnings.push(`${orphans} fins de notes sans attaque ont été ignorées ; aucune attaque n’a été supprimée.`);
  tempos.sort((a,b)=>a[0]-b[0]);const tempo=tempos.length&&tempos[0][0]===0?tempos[0][1]:500000;
  notes.sort((a,b)=>a.start_tick-b.start_tick||a.source_track-b.source_track||a.note-b.note);
  return{name,ppq:m.ppq,tracks:infos,notes,timeline:tl,numerator:tl[0][1],denominator:tl[0][2],warnings,keys,bpm:Math.round(6e7/tempo)}}
const tpm=(doc,num,den)=>doc.ppq*num*4/den;

/* tonalité : celle du MIDI, sinon une ESTIMATION à confirmer (profils de Krumhansl) */
function keyInfo(doc){if(doc.keys.length===1)return{key:doc.keys[0],source:"midi",candidates:doc.keys};if(doc.keys.length>1)return{key:null,source:"multiple",candidates:doc.keys};
  const w=new Array(12).fill(0);for(const n of doc.notes)w[n.note%12]+=n.end_tick-n.start_tick;
  const MA=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],MI=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  const corr=(a,b)=>{const ma=a.reduce((x,y)=>x+y)/12,mb=b.reduce((x,y)=>x+y)/12;let n=0,da=0,db=0;for(let i=0;i<12;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}return n/Math.sqrt(da*db||1)};
  const MAJ=["C","Db","D","Eb","E","F","F#","G","Ab","A","Bb","B"],MIN=["Cm","C#m","Dm","Ebm","Em","Fm","F#m","Gm","G#m","Am","Bbm","Bm"],sc=[];
  for(let t=0;t<12;t++){const r=i=>w[(i+t)%12];const v=[...Array(12)].map((_,i)=>r(i));sc.push([corr(v,MA),MAJ[t]],[corr(v,MI),MIN[t]])}
  sc.sort((a,b)=>b[0]-a[0]);return{key:null,source:"missing",estimate:sc[0][1],alternatives:sc.slice(1,4).map(x=>x[1]),candidates:[]}}

/* ---------- orthographe : nom de la note et altération selon la gamme ---------- */
function palette(key){const minor=key.endsWith("m"),tonic=minor?key.slice(0,-1):key,tpc=((NAT[tonic[0]]+(tonic.split("#").length-1)-(tonic.split("b").length-1))%12+12)%12,iv=minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],pal={},order=[];
  iv.forEach((x,d)=>{const L=LETTERS[(LETTERS.indexOf(tonic[0])+d)%7],pc=(tpc+x)%12,dl=((pc-NAT[L]+6)%12+12)%12-6,acc=dl>0?"#".repeat(dl):"b".repeat(-dl);pal[pc]={label:L+acc,symbol:acc.replace(/b/g,"♭"),color:COLORS[L]};order.push(pc)});
  pal._order=order;return pal}
function spell(pitch,key,pal){const pc=pitch%12;let L,dl;const degs=pal._order.map(k=>pal[k]);
  if(pal[pc]){const lb=pal[pc].label;L=lb[0];dl=(lb.split("#").length-1)-(lb.split("b").length-1)}
  else{const byL={};for(const d of degs)byL[d.label[0]]=(d.label.split("#").length-1)-(d.label.split("b").length-1);const pf=Object.values(byL).some(v=>v<0),raised={};
    if(key.endsWith("m"))for(const d of degs.slice(5,7)){const nm=d.label,b=(nm.split("#").length-1)-(nm.split("b").length-1);raised[(NAT[nm[0]]+b+1+12)%12]=[nm[0],b+1]}
    if(raised[pc])[L,dl]=raised[pc];else if(Object.values(NAT).includes(pc)){L=Object.keys(NAT).find(k=>NAT[k]===pc);dl=0}
    else{let best=null;for(const c of LETTERS){const off=((pc-NAT[c]+6)%12+12)%12-6;if(Math.abs(off)>1)continue;const s=[Math.abs(off-byL[c]),(off<0)===pf?0:1];if(!best||s[0]<best[0][0]||(s[0]===best[0][0]&&(s[1]<best[0][1]||(s[1]===best[0][1]&&c<best[1]))))best=[s,c,off]}L=best[1];dl=best[2]}}
  const np=pitch-dl,row=(Math.floor(np/12)-1)*7+LETTERS.indexOf(L);let sym="#".repeat(Math.max(0,dl))+"♭".repeat(Math.max(0,-dl));
  if(dl===0&&degs.some(d=>d.label[0]===L&&d.symbol))sym="♮";return{letter:L,row,symbol:sym}}

/* ---------- préparation : systèmes, contrôles de fidélité ---------- */
const SP=0.072,GAP=0.36,DIV=2.4,LAND=[-7,0,7,14,21,28,35,42,49,56,63],MINW=0.35;
function layoutOf(rd){const withC=(lo,hi)=>{if(LAND.some(r=>lo<=r&&r<=hi))return[lo,hi];let n=LAND[0],bd=1e9;for(const r of LAND){const d=Math.max(lo-r,r-hi,0);if(d<bd||(d===bd&&r<n)){bd=d;n=r}}return[Math.min(lo,n),Math.max(hi,n)]};
  const rg={};for(const h of["right","left"]){const rs=rd.filter(r=>r.hand===h).map(r=>r.row);if(rs.length)rg[h]=[Math.min(...rs),Math.max(...rs)]}const pad=.55,ks=Object.keys(rg);
  if(!ks.length)return{mode:"single",hand:null,min:0,max:0};if(ks.length===1){const[lo,hi]=withC(...rg[ks[0]]);return{mode:"single",hand:ks[0],min:lo-pad,max:hi+pad}}
  let[rmin,rmax]=rg.right,[lmin,lmax]=rg.left;if(rmin-lmax>1){[rmin,rmax]=withC(rmin,rmax);[lmin,lmax]=withC(lmin,lmax);return{mode:"split",top:["right",rmin-pad,rmax+pad],bottom:["left",lmin-pad,lmax+pad]}}
  const[lo,hi]=withC(Math.min(rmin,lmin),Math.max(rmax,lmax));return{mode:"single",hand:null,min:lo-pad,max:hi+pad,overlap:true}}
const spanOf=l=>l.mode==="split"?l.top[2]-l.top[1]+l.bottom[2]-l.bottom[1]+DIV:l.max-l.min;
function resolveGap(w,a,b){const t=a+b,mx=w*(1-MINW);if(t>mx&&t>0){const k=mx/t;a*=k;b*=k}return[a,b,w-a-b]}
function prepare(doc,hands,key,perLine,hints){if(!KEYS.includes(key))throw new Error("Choisissez la gamme du morceau avant de générer la partition.");
  const notes=[];for(const s of doc.notes){let h=hands[s.source_track];if(!h||h==="none")continue;if(h==="split")h=s.note<60?"left":"right";notes.push({...s,hand:h})}
  if(!notes.length)throw new Error("Sélectionnez au moins une piste contenant des notes.");
  const pal=palette(key),endT=Math.max(...notes.map(n=>n.end_tick)),systems=[];let number=1;
  doc.timeline.forEach(([start,num,den],i)=>{if(start>=endT)return;const end=Math.min(endT,i+1<doc.timeline.length?doc.timeline[i+1][0]:endT),len=tpm(doc,num,den),count=Math.ceil((end-start)/len);
    for(let f=0;f<count;f+=perLine){const l=Math.min(f+perLine,count),a=start+f*len,b=doc.timeline.length>1?Math.min(end,start+l*len):start+l*len;
      const rd=notes.filter(n=>n.end_tick>a&&n.start_tick<b).map(n=>({...n,clip_start_tick:Math.max(n.start_tick,a),clip_end_tick:Math.min(n.end_tick,b)}));
      systems.push({window_start:a,window_end:b,n_measures:l-f,rendered:rd,first_measure:number+f,last_measure:number+l-1,meter:[num,den],tpm:len,layout:{mode:"single",hand:null,min:0,max:0},span_rows:0})}
    number+=count});
  const measures=number-1;
  for(const s of systems){/* contrôle de conservation : chaque note de la fenêtre est dessinée une fois, avec ses ticks d'origine */
    const k=n=>`${n.note}|${n.hand}|${n.start_tick}|${n.end_tick}`,exp=new Map(),act=new Map();
    for(const n of notes)if(n.start_tick<s.window_end&&n.end_tick>s.window_start)exp.set(k(n),(exp.get(k(n))||0)+1);for(const r of s.rendered)act.set(k(r),(act.get(k(r))||0)+1);
    if(exp.size!==act.size||[...exp].some(([a,b])=>act.get(a)!==b))throw new Error("Le contrôle de conservation des notes a échoué. Aucune partition n’a été créée.");
    for(const r of s.rendered){let sp=spell(r.note,key,pal);
      /* partition colorée : on garde la lettre écrite sur la photo (B♭ reste un B, pas un A♯) */
      const h=hints&&hints.get(r.hand+"|"+r.start_tick+"|"+r.note);if(h&&h!==sp.letter){const dl=((r.note%12-NAT[h]+6)%12+12)%12-6;if(Math.abs(dl)<=2){const np=r.note-dl;let sym="#".repeat(Math.max(0,dl))+"♭".repeat(Math.max(0,-dl));
        if(dl===0&&pal._order.some(k=>pal[k].label[0]===h&&pal[k].symbol))sym="♮";sp={letter:h,row:(Math.floor(np/12)-1)*7+LETTERS.indexOf(h),symbol:sym}}}
      r.letter=sp.letter;r.row=sp.row;r.symbol=sp.symbol;r.color=COLORS[sp.letter]}
    if(s.rendered.length){s.layout=layoutOf(s.rendered);s.span_rows=spanOf(s.layout)}}
  /* notes répétées : petit retrait visuel symétrique (1,2 mm à l'échelle A4), jamais de modification des ticks */
  const target=1.2*(tpm(doc,doc.numerator,doc.denominator)*4/((8.26771653543307-1.1)*25.4));
  for(const s of systems){for(const r of s.rendered){r.lead=0;r.trail=0}const g=new Map();for(const r of s.rendered){const kk=r.hand+"|"+r.note;if(!g.has(kk))g.set(kk,[]);g.get(kk).push(r)}
    for(const grp of g.values()){grp.sort((a,b)=>a.start_tick-b.start_tick);for(let i=0;i+1<grp.length;i++){const gap=grp[i+1].clip_start_tick-grp[i].clip_end_tick,half=Math.max(0,target-Math.max(gap,0))/2;grp[i].trail=half;grp[i+1].lead=half}}}
  const problems=[];
  for(const s of systems){for(const r of s.rendered){const w=r.clip_end_tick-r.clip_start_tick,[a,,wd]=resolveGap(w,r.lead,r.trail),L=r.clip_start_tick+a;if(w<=0||wd<=0||wd<w*MINW-1e-6)problems.push(`Bloc trop réduit : ${r.note}`);if(L<s.window_start-1e-6||L+wd>s.window_end+1e-6)problems.push(`Débordement : ${r.note}`)}
    const rows=new Map();for(const r of s.rendered){const kk=r.hand+"|"+r.row;if(!rows.has(kk))rows.set(kk,[]);rows.get(kk).push(r)}
    for(const grp of rows.values()){grp.sort((a,b)=>a.clip_start_tick-b.clip_start_tick);for(let i=0;i<grp.length;i++)for(let j=i+1;j<grp.length;j++){if(grp[j].clip_start_tick>=grp[i].clip_end_tick)break;if(grp[i].note!==grp[j].note)throw new Error("Deux notes simultanées occupent la même ligne dans ce rendu. Essayez de sélectionner moins de pistes ou de les répartir entre les deux mains.")}}}
  if(problems.length)throw new Error("Certaines notes ne peuvent pas être dessinées clairement. Essayez de sélectionner moins de pistes.\n"+problems.slice(0,3).join("\n"));
  return{notes,systems,measures,pal}}
function paginate(systems,avail){const pages=[];let cur=[],h=0,meter=null;
  for(const s of systems){const need=s.span_rows*SP,mk=s.meter.join("/");if(cur.length&&mk!==meter){pages.push(cur);cur=[];h=0}
    const extra=cur.length?GAP:0;if(cur.length&&h+extra+need>avail){pages.push(cur);cur=[];h=0}cur.push(s);h+=(cur.length>1?GAP:0)+need;meter=mk}
  if(cur.length)pages.push(cur);return pages}

/* ---------- rendu d'une page (canvas) : même géométrie que build_origin_page ---------- */
const IMG={};function img(src){if(!IMG[src]){IMG[src]=new Image();IMG[src].src=src}return IMG[src]}
async function ready(){await Promise.all(Object.values(MXA).map(s=>{const i=img(s);return i.complete?0:new Promise(r=>{i.onload=i.onerror=r})}))}
const GRAD={};function gradTile(color){if(GRAD[color])return GRAD[color];const c=document.createElement("canvas");c.width=160;c.height=48;const x=c.getContext("2d"),d=x.createImageData(160,48),b=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
  for(let j=0;j<48;j++){const yy=1-j/47;for(let i=0;i<160;i++){const xx=-1+2*i/159;let v=.62+.85*Math.pow(yy,.55)+.55*Math.exp(-(((xx+.32)/.55)**2+((yy-.76)/.3)**2))+.3*Math.exp(-(((yy-.965)/.03)**2))-.15*Math.exp(-(((yy-.02)/.16)**2))-.16*Math.pow(Math.abs(xx),1.7);v=Math.min(1.75,Math.max(.55,v));const o=(j*160+i)*4;for(let k=0;k<3;k++)d.data[o+k]=Math.round(Math.min(1,b[k]*v)*255);d.data[o+3]=255}}
  x.putImageData(d,0,0);return GRAD[color]=c}
const lighten=(h,a)=>"#"+[1,3,5].map(i=>Math.round(Math.min(255,parseInt(h.slice(i,i+2),16)*(1-a)+255*a)).toString(16).padStart(2,"0")).join("");
const FONT="'Helvetica Neue',Helvetica,Arial,sans-serif",TFONT="'Trebuchet MS','Avenir Next','Helvetica Neue',Arial,sans-serif";
function rr(c,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h)}
function titleLines(c,title,maxW,S){const words=(title.split(/\s+/).join(" ")||"MA PARTITION"),wid=(t,sz)=>{c.font=`500 ${sz/72*S}px ${FONT}`;return c.measureText(t).width/S};
  if(wid(words,20)<=maxW)return[[words],20];for(const sz of[17.5,17,16.5,16,15.5,15,14.5,14,13.5]){const ls=[];let l="";for(const w of words.split(" ")){const cand=(l+" "+w).trim();if(l&&wid(cand,sz)>maxW){ls.push(l);l=w}else l=cand}if(l)ls.push(l);if(ls.length<=2&&ls.every(x=>wid(x,sz)<=maxW))return[ls,sz]}
  const ls=[];let rem=words;for(let i=0;i<2&&rem;i++){let cand=rem;while(cand&&wid(cand+(i===1?"…":""),13.5)>maxW)cand=cand.slice(0,-1);ls.push(cand.trimEnd()+(i===1&&cand!==rem?"…":""));rem=rem.slice(cand.length).trimStart()}return[ls,13.5]}
function drawPage(sys,doc,title,key,pal,opt,onBlock){
  const a4=opt.a4,S=opt.dpi,W=a4?8.26771653543307:(8.26771653543307-1.1)/2+.7,MAR=a4?.55:.35,SW=a4?W-1.1:(8.26771653543307-1.1)/2,PH=a4?11.692913385826772:W*16/9,FOOT=a4?2.07:1.67,HEAD=1.10;
  const FG=a4?"#162842":"#F5F7FF",ACC=a4?"#246AAB":"#00C8E0",PANEL=a4?"#EDF4FD":"#101F39";
  const content=sys.reduce((a,s)=>a+s.span_rows*SP,0)+GAP*(sys.length-1),H=Math.max(PH,content+HEAD+FOOT);
  const cv=document.createElement("canvas");cv.width=Math.round(W*S);cv.height=Math.round(H*S);const c=cv.getContext("2d"),P=v=>v/72*S;
  c.fillStyle=a4?"#FFFFFF":"#08101F";c.fillRect(0,0,cv.width,cv.height);const bg=img(a4?MXA.a4:MXA.bg);if(bg.naturalWidth)c.drawImage(bg,0,0,cv.width,cv.height);
  /* en-tête : titre en capitales, sur deux lignes au besoin */
  let[lines,size]=titleLines(c,title.toUpperCase(),SW,S);if(lines.length===1&&lines[0].includes(" EN ")){const i=lines[0].lastIndexOf(" EN ");lines=[lines[0].slice(0,i),"EN "+lines[0].slice(i+4)]}
  lines.forEach((l,i)=>{const pts=lines.length===2&&lines[1].startsWith("EN ")?(i===0?24.5:16.8):Math.min(size,24.5);c.font=`500 ${P(pts)}px ${TFONT}`;c.fillStyle=i===0?FG:ACC;c.textAlign="center";c.textBaseline="middle";c.fillText(l,(MAR+SW/2)*S,(HEAD-(.64-i*.29))*S)});
  /* zone de partition : x en ticks sur la largeur utile, y en pouces depuis le bas de la zone */
  const num=sys[0].meter[0],TPM=sys[0].tpm,window=(a4?4:2)*TPM,ax0=MAR*S,axTop=HEAD*S,X=t=>ax0+t/window*SW*S,Y=y=>axTop+(content-y)*S;
  let cursor=content;const pos=[];
  c.save();
  for(const s of sys){const top=cursor;cursor-=s.span_rows*SP;pos.push([cursor,top]);if(!s.rendered.length){cursor-=GAP;continue}
    const L=s.layout;let zones;
    if(L.mode==="split"){const[bh,lo,hi]=L.bottom,[th,ulo,uhi]=L.top;zones=[[bh,lo,hi,cursor,a4?"#F0F5FC":"#071222"],[th,ulo,uhi,cursor+(hi-lo+DIV)*SP,a4?"#F8FBFF":"#081329"]]}
    else zones=["right","left"].map(h=>[h,L.min,L.max,cursor,a4?"#F8FBFF":"#081329"]);
    const act=new Set(s.rendered.map(r=>r.hand)),vis=zones.filter(z=>act.has(z[0]));
    const bRow=Math.min(...vis.map(([,lo,,b])=>b+(Math.ceil(lo)-lo)*SP)),tRow=Math.max(...vis.map(([,lo,hi,b])=>b+(Math.floor(hi)-lo)*SP)),beat=s.tpm/num;
    /* fonds des zones (sous la grille) */
    for(const[,lo,hi,b,fill]of vis){c.fillStyle=fill;c.fillRect(X(0),Y(b-SP/2+(hi-lo+1)*SP),SW*S,(hi-lo+1)*SP*S)}
    /* mesures et temps : traits limités aux lignes extrêmes */
    for(let m=0;m<=s.n_measures;m++){const st=m*s.tpm;c.strokeStyle="#829CB9";c.lineWidth=P(1.1);c.setLineDash([]);c.beginPath();c.moveTo(X(st),Y(bRow));c.lineTo(X(st),Y(tRow));c.stroke();if(m===s.n_measures)break;
      for(let bt=0;bt<num;bt++){c.fillStyle=a4?"#4B6683":"#C3D4EC";c.font=`${P(5.5)}px ${FONT}`;c.textAlign="center";c.textBaseline="middle";c.fillText(String(bt+1),X(st+(bt+.5)*beat),Y(tRow+.076));
        if(bt){c.save();c.globalAlpha=.46;c.strokeStyle=a4?"#748BA6":"#A4BAD5";c.lineWidth=P(.65);c.setLineDash([P(.65*2),P(.65*3)]);c.beginPath();c.moveTo(X(st+bt*beat),Y(bRow));c.lineTo(X(st+bt*beat),Y(tRow));c.stroke();c.restore()}}}
    for(const[hand,lo,hi,b,fill]of vis){
      for(let row=Math.ceil(lo);row<=hi;row++){const y=b+(row-lo)*SP,lt=LETTERS[(row%7+7)%7];c.save();c.globalAlpha=lt==="C"?1:(a4?.43:.62);c.strokeStyle=COLORS[lt];c.lineWidth=P(1.15);c.beginPath();c.moveTo(X(0),Y(y));c.lineTo(X(window),Y(y));c.stroke();c.restore();
        if(LAND.includes(row)){const bx=X(-window*(a4?.028:.05)),lab="C"+(row/7);if(row===28){for(const[d,col]of[[16.5,"#2F80FF"],[13.8,"#FFFFFF"],[11,"#2F80FF"]]){c.fillStyle=col;c.beginPath();c.arc(bx,Y(y),P(d)/2,0,7);c.fill()}c.fillStyle="#FFFFFF";c.font=`bold ${P(6.2)}px ${FONT}`}else{c.fillStyle="#2F80FF";c.font=`${P(7)}px ${FONT}`}c.textAlign="center";c.textBaseline="middle";c.fillText(lab,bx,Y(y))}}
      for(const r of s.rendered){if(r.hand!==hand)continue;const x0=r.clip_start_tick-s.window_start,w=r.clip_end_tick-r.clip_start_tick,[lead,,wd]=resolveGap(w,r.lead,r.trail),yb=b+(r.row-lo)*SP-SP/2;
        const px=X(x0+lead),pw=wd/window*SW*S,py=Y(yb+SP),ph=SP*S,rad=Math.min(ph,pw)*.18*.5*2;
        c.save();c.globalAlpha=hand==="right"?.14:.05;c.fillStyle="#000";rr(c,px+Math.min(pw*.022,P(.8)),py+ph*.09,pw,ph,rad);c.fill();c.restore();
        if(hand==="right"){c.save();rr(c,px,py,pw,ph,rad);c.clip();c.drawImage(gradTile(r.color),px,py,pw,ph);c.restore();
          c.save();c.globalAlpha=.55;c.strokeStyle=lighten(r.color,.35);c.lineWidth=P(.75);rr(c,px,py,pw,ph,rad);c.stroke();c.restore();
          c.save();c.globalAlpha=.18;c.strokeStyle="#FFFFFF";c.lineWidth=P(.45);rr(c,px+pw*.055,py+ph*.055,pw-pw*.11,ph-ph*.11,rad);c.stroke();c.restore()}
        else{c.fillStyle=fill;rr(c,px,py,pw,ph,rad);c.fill();c.save();rr(c,px,py,pw,ph,rad);c.clip();c.globalAlpha=.95;c.strokeStyle=r.color;c.lineWidth=P(1.2);const st=.043*S;c.beginPath();for(let xx=px-ph;xx<px+pw+ph;xx+=st){c.moveTo(xx,py+ph);c.lineTo(xx+ph,py)}c.stroke();c.restore();
          c.strokeStyle=r.color;c.lineWidth=P(1);rr(c,px,py,pw,ph,rad);c.stroke()}
        /* lettre : blanche pour une note naturelle, noire pour une note avec ♯ ou ♭ */
        const lab=r.letter+r.symbol,dark=/[#♯♭]/.test(r.symbol);let fs=P(4.7);c.font=`bold ${fs}px ${FONT}`;const av=pw*.88;let tw=c.measureText(lab).width;
        while(tw>av){const red=Math.min(fs*.95,fs*av/tw);if(red<P(.5)){fs=0;break}fs=red;c.font=`bold ${fs}px ${FONT}`;tw=c.measureText(lab).width}
        if(fs){c.fillStyle=dark?"#000":"#fff";c.textAlign="center";c.textBaseline="middle";c.fillText(lab,px+pw/2,py+ph/2)}
        onBlock&&onBlock()}
      let center=b+(hi-lo)*SP/2;if(L.mode!=="split"&&act.size===2)center+=hand==="right"?.14:-.14;const axp=X(window*(a4?1.022:1.039)),ayp=Y(center);
      c.fillStyle=FG;c.font=`bold ${P(6.5)}px ${FONT}`;c.textAlign="center";c.textBaseline="middle";c.fillText(hand==="right"?"MD":"MG",axp,ayp+P(6));
      const ic=img(hand==="right"?MXA.right:MXA.left),isz=32*.36/72*S;if(ic.naturalWidth)c.drawImage(ic,axp-isz/2,ayp-P(5)-isz/2,isz,isz)}
    cursor-=GAP}
  /* numéros de mesure en filigrane */
  c.save();c.beginPath();c.rect(ax0,axTop,SW*S,content*S);c.clip();c.globalAlpha=.12;c.fillStyle="#AEB3BA";c.font=`bold ${P(65)}px ${FONT}`;c.textAlign="center";c.textBaseline="middle";
  sys.forEach((s,i)=>{const[b,t]=pos[i];for(let m=0;m<s.n_measures;m++)c.fillText(String(s.first_measure+m),X((m+.5)*s.tpm),Y((b+t)/2))});c.restore();c.restore();
  legend(c,S,P,a4,{W,H,MAR,SW,FG,ACC,PANEL},pal,key,`${num}/${sys[0].meter[1]}`,doc.bpm,sys[sys.length-1].last_measure,opt.total);
  return cv}
function piano(c,S,P,x0,y0,w,h,pal){/* x0,y0 = coin bas-gauche en pouces depuis le bas de page (y inversé par l'appelant) */
  const kx=i=>x0+i*w/7,INK="#0A1224",dk=(col,i)=>{const r=[1,3,5].map(k=>parseInt(col.slice(k,k+2),16)/255);return r};
  const key=(x,y,ww,hh,col,black)=>{const g=c.createLinearGradient(0,y+hh,0,y),[r,gg,b]=dk(col);const f=(a,m,o)=>`rgb(${Math.round(Math.min(1,a*m+o)*255)},${Math.round(Math.min(1,gg*m+o)*255)},${Math.round(Math.min(1,b*(m===.55?.59:m)+o)*255)})`;
    g.addColorStop(0,`rgb(${Math.round(r*.55*255)},${Math.round(gg*.55*255)},${Math.round(b*.59*255)})`);g.addColorStop(1,`rgb(${Math.round((r*.87+.13)*255)},${Math.round((gg*.87+.13)*255)},${Math.round((b*.87+.13)*255)})`);
    if(black){c.save();c.globalAlpha=.68;c.fillStyle="#020611";rr(c,x+.05*w/7*S/S*S/S,y+.055*h,ww,hh,.05*w/7);c.fill();c.restore()}
    c.fillStyle=g;rr(c,x,y,ww,hh,(black?.035:.07)*w/7);c.fill();c.strokeStyle=INK;c.lineWidth=P(black?.6:.7);c.stroke();
    const ins=(black?.055:.07)*w/7;c.save();c.globalAlpha=.44;c.fillStyle="#fff";rr(c,x+ins,y+.032*hh/1*1,ww-2*ins,.032*hh,.01*w/7);c.fill();c.globalAlpha=.17;rr(c,x+ins,y+hh-.065*hh,ww-2*ins,.025*hh,.01*w/7);c.fill();c.restore()};
  const WP=[0,2,4,5,7,9,11];WP.forEach((pc,i)=>{const col=pal[pc]?pal[pc].color:"#FFFFFF",x=kx(i+.025),ww=.95*w/7;key(x,y0,ww,h,col,false);if(pal[pc]){c.fillStyle="#193C35";c.font=`bold ${P(6.6)}px ${FONT}`;c.textAlign="center";c.textBaseline="bottom";c.fillText(pal[pc].label.replace("b","♭"),x+ww/2,y0+h*(1-.13))}});
  for(const[pc,prev]of[[1,0],[3,1],[6,3],[8,4],[10,5]]){const cx=kx(prev+1),col=pal[pc]?pal[pc].color:"#171D2B",ww=.56*w/7,hh=.635*h;key(cx-ww/2,y0,ww,hh,col,true);if(pal[pc]){c.fillStyle="#193C35";c.font=`bold ${P(5)}px ${FONT}`;c.textAlign="center";c.textBaseline="middle";c.fillText(pal[pc].label.replace("b","♭"),cx,y0+hh*(1-.385/.635))}}}
function legend(c,S,P,a4,G,pal,key,meter,tempo,last,total){const{H,MAR,SW,FG,ACC,PANEL}=G,w=SW+.2,ph=a4?1.77:1.37,ky=ph/1.15,px=(MAR-.10)*S,pTop=(H-.20-ph)*S;
  const PX=x=>px+x*S,PY=u=>pTop+(1.15-u)*ky*S;
  for(const[sp,op]of[[.085,.10],[.055,.13],[.027,.18]]){c.save();c.globalAlpha=op;c.fillStyle=a4?"#B7CAE1":"#020612";rr(c,PX(-sp/2),PY(1.15+sp/2),(w+sp)*S,(1.15+sp/2+sp)*ky*S,.11*S);c.fill();c.restore()}
  const g=c.createLinearGradient(0,PY(0),0,PY(1.15));g.addColorStop(0,a4?"rgba(248,251,255,.26)":"rgba(9,20,40,.32)");g.addColorStop(1,a4?"rgba(230,240,252,.65)":"rgba(22,39,68,.88)");
  rr(c,PX(0),PY(1.15),w*S,1.15*ky*S,.095*S);c.fillStyle=g;c.fill();c.strokeStyle=a4?"#A7BED8":"#3B5479";c.lineWidth=P(.85);c.stroke();
  c.save();c.globalAlpha=.32;c.strokeStyle="#5E7499";c.lineWidth=P(.45);rr(c,PX(.028),PY(1.123),(w-.056)*S,1.096*ky*S,.076*S);c.stroke();c.restore();
  const line=(x1,y1,x2,y2,col,lw,al)=>{c.save();c.globalAlpha=al||1;c.strokeStyle=col;c.lineWidth=P(lw);c.beginPath();c.moveTo(PX(x1),PY(y1));c.lineTo(PX(x2),PY(y2));c.stroke();c.restore()};
  const txt=(x,y,t,col,sz,bold,al="left")=>{c.fillStyle=col;c.font=`${bold?"bold ":""}${P(sz)}px ${FONT}`;c.textAlign=al;c.textBaseline="middle";c.fillText(t,PX(x),PY(y))};
  line(.15,1.138,w-.15,1.138,"#6986AE",.55,.48);
  const KL=keyLabel(key),vals=[KL,`♩ = ${tempo}`,`${String(last).padStart(2,"0")} / ${String(total).padStart(2,"0")}`],labs=["TONALITÉ","TEMPO","MESURES"];
  if(a4){[w*.57,w*.73,w*.89].forEach((x,i)=>{txt(x,1.02,labs[i],"#48627E",5.1,1,"center");txt(x,.90,vals[i],FG,7.4,1,"center")});line(w*.49,.81,w*.96,.81,"#9EB6CF",.55)}
  else{line(.14,.866,w-.14,.866,"#416084",.55);[w/6,w/2,5*w/6].forEach((x,i)=>{txt(x,1.06,labs[i],"#AAC2DE",5.1,1,"center");txt(x+(i===1?.06:0),.945,vals[i],FG,7.4,1,"center")});for(const x of[w/3,2*w/3])line(x,.915,x,1.09,"#47668D",.55);
    const ti=img(MXA.tempo);if(ti.naturalWidth){const sz=.23*35/72*S;c.drawImage(ti,PX(w/2-.23)-sz/2,PY(.945)-sz*32/35/2,sz,sz*32/35)}}
  const ty=a4?.99:.75;txt(.10,ty,"Clavier MusiTone",FG,7,1);txt(1.04,ty,"(C4 = C du milieu)",a4?"#48627E":"#BBCBE1",4.6,0);
  const kw=SW*(a4?.42:.56);c.fillStyle="#080F20";rr(c,PX(.09),PY(.108+(a4?.782:.588)),(kw+.02)*S,(a4?.782:.588)*ky*S,.04*S);c.fill();c.strokeStyle="#6385AC";c.lineWidth=P(.65);c.stroke();
  /* le clavier occupe la boîte sombre, avec une petite marge */
  const pb=a4?[.365,1.179]:[.345,.665],kx0=(MAR+.01)*S,kTop=(H-pb[0]-pb[1])*S;piano(c,S,P,kx0,kTop+pb[1]*S*.0,kw*S,pb[1]*S*.0+(PY(.108)-PY(.108+(a4?.782:.588))-.06*S),pal);
  const split=SW*(a4?.49:.61);line(split,.08,split,.82,a4?"#A6BCD5":"#405D85",.6);const x=split+.12,fs=a4?7:6;txt(x,a4?.70:.75,"Légende",FG,7,1);
  for(const[y,left,label]of(a4?[[.55,0,"Main droite"],[.41,1,"Main gauche"]]:[[.61,0,"Main droite"],[.45,1,"Main gauche"]])){const bx=PX(x),by=PY(y+.036),bw=.22*S,bh=.072*ky*S;rr(c,bx,by,bw,bh,.032*S);c.fillStyle=left?PANEL:ACC;c.fill();
    if(left){c.save();rr(c,bx,by,bw,bh,.032*S);c.clip();c.strokeStyle=ACC;c.lineWidth=P(1.2);c.beginPath();for(let xx=bx-bh;xx<bx+bw+bh;xx+=.043*S){c.moveTo(xx,by+bh);c.lineTo(xx+bh,by)}c.stroke();c.restore()}
    c.strokeStyle=ACC;c.lineWidth=P(.65);rr(c,bx,by,bw,bh,.032*S);c.stroke();txt(x+.31,y,label,FG,fs,0)}
  for(const[y,mk,label]of(a4?[[.27,"┊",`Temps (${meter})`],[.13,"♯ / ♭","Altérations"]]:[[.29,"┊",`Temps (${meter})`],[.13,"♯ / ♭","Altérations"]])){txt(x,y,mk,FG,fs,0);txt(x+.31,y,label,FG,fs,0)}}

/* ---------- génération complète, avec progression réelle ---------- */
async function generate(doc,hands,key,title,fmt,progress,hints,opts){await ready();progress(0,"Vérification des notes d’origine…");const a4=fmt==="pdf";
  if(!a4)return generateVertical(doc,hands,key,title,progress,hints,(opts&&opts.mpp)||4,(opts&&opts.H)||1920);
  const P=prepare(doc,hands,key,4,hints);let sys=P.systems;
  const avail=11.692913385826772-1.10-2.07,pages=paginate(sys,avail);
  progress(5,"Notes vérifiées. Préparation des pages…");const out=[],totalBlocks=sys.reduce((a,s)=>a+s.rendered.length,0)||1;let done=0;
  for(let i=0;i<pages.length;i++){progress(5+90*done/totalBlocks,`Dessin de la page ${i+1} sur ${pages.length}…`);await new Promise(r=>setTimeout(r,0));
    const cv=drawPage(pages[i],doc,title,key,P.pal,{a4,dpi:200,total:P.measures},()=>{done++});
    progress(5+90*done/totalBlocks,`Enregistrement de la page ${i+1} sur ${pages.length}…`);await new Promise(r=>setTimeout(r,0));
    const blob=await new Promise(r=>cv.toBlob(r,"image/jpeg",.93));out.push({blob,w:cv.width,h:cv.height,dpi:200})}
  progress(96,"Assemblage du PDF…");const pdf=await makePdf(out);progress(100,"Partition prête.");
  return{pages:out,pdf,notes:P.notes.length,measures:P.measures,pageCount:pages.length,meter:doc.timeline.map(t=>t[1]+"/"+t[2]),systems:sys}}
/* format vertical : une page = 4 mesures, même échelle de temps sur toutes les pages */
async function generateVertical(doc,hands,key,title,progress,hints,mpp,PH){const P=prepare(doc,hands,key,1,hints),M=P.systems,rg=MXV.range(M),out=[];
  /* pages de mpp mesures, sans coupure aux changements de mesure ; une note qui traverse une barre reste un seul bloc */
  const pagesV=[];for(let i=0;i<M.length;i+=mpp){const grp=M.slice(i,i+mpp),merged=new Map();
    for(const s of grp)for(const r of s.rendered){const k=r.hand+"|"+r.note+"|"+r.start_tick+"|"+r.end_tick+"|"+r.source_track;const m=merged.get(k);
      if(!m)merged.set(k,{...r});else{if(r.clip_start_tick<m.clip_start_tick){m.clip_start_tick=r.clip_start_tick;m.lead=r.lead}if(r.clip_end_tick>m.clip_end_tick){m.clip_end_tick=r.clip_end_tick;m.trail=r.trail}}}
    /* notes répétées : petit écart visuel (8 px à l'écran), sans toucher aux ticks */
    {const rs=[...merged.values()],tg=8*(grp[grp.length-1].window_end-grp[0].window_start)/Math.max(600,PH-524),G=new Map();for(const r of rs){r.lead=0;r.trail=0;const k=r.hand+"|"+r.note;if(!G.has(k))G.set(k,[]);G.get(k).push(r)}
      for(const g of G.values()){g.sort((a,b)=>a.start_tick-b.start_tick);for(let j=0;j+1<g.length;j++){const half=Math.max(0,tg-Math.max(0,g[j+1].clip_start_tick-g[j].clip_end_tick))/2;g[j].trail=half;g[j+1].lead=half}}}
    pagesV.push({window_start:grp[0].window_start,window_end:grp[grp.length-1].window_end,first_measure:grp[0].first_measure,rendered:[...merged.values()],
      meas:grp.map(s=>({start:s.window_start,len:s.tpm,num:s.meter[0],den:s.meter[1],number:s.first_measure}))})}
  progress(5,"Notes vérifiées. Préparation des pages…");
  for(let i=0;i<pagesV.length;i++){progress(5+90*i/pagesV.length,`Dessin de la page ${i+1} sur ${pagesV.length}…`);await new Promise(r=>setTimeout(r,0));
    const s=pagesV[i],ms=[...new Set(s.meas.map(m=>m.num+"/"+m.den))].join(" → "),cv=MXV.draw(s,{title,keyLabel:keyLabel(key),pal:P.pal,tempo:doc.bpm,page:i+1,pages:pagesV.length,range:rg,meterLabel:ms,H:PH});
    const blob=await new Promise(r=>cv.toBlob(r,"image/png"));out.push({blob,w:cv.width,h:cv.height,dpi:300})}
  progress(100,"Vos images sont prêtes.");return{pages:out,pdf:null,notes:P.notes.length,measures:P.measures,pageCount:pagesV.length,meter:doc.timeline.map(t=>t[1]+"/"+t[2]),systems:pagesV}}
async function makePdf(pages){const enc=new TextEncoder(),parts=[],off=[];let len=0;const push=x=>{const b=typeof x==="string"?enc.encode(x):x;parts.push(b);len+=b.length};
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");const n=pages.length,obj=i=>{off[i]=len};
  obj(1);push("1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n");obj(2);push(`2 0 obj<</Type/Pages/Kids[${pages.map((_,i)=>`${3+i*3} 0 R`).join(" ")}]/Count ${n}>>endobj\n`);
  for(let i=0;i<n;i++){const p=pages[i],d=new Uint8Array(await p.blob.arrayBuffer()),pw=p.w/p.dpi*72,phh=p.h/p.dpi*72,o=3+i*3,cs=`q ${pw.toFixed(2)} 0 0 ${phh.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(o);push(`${o} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pw.toFixed(2)} ${phh.toFixed(2)}]/Resources<</XObject<</Im0 ${o+1} 0 R>>>>/Contents ${o+2} 0 R>>endobj\n`);
    obj(o+1);push(`${o+1} 0 obj<</Type/XObject/Subtype/Image/Width ${p.w}/Height ${p.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${d.length}>>stream\n`);push(d);push("\nendstream endobj\n");
    obj(o+2);push(`${o+2} 0 obj<</Length ${cs.length}>>stream\n${cs}\nendstream endobj\n`)}
  const xref=len,tot=3+n*3;let x=`xref\n0 ${tot}\n0000000000 65535 f \n`;for(let i=1;i<tot;i++)x+=String(off[i]).padStart(10,"0")+" 00000 n \n";push(x+`trailer<</Size ${tot}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts,{type:"application/pdf"})}
return{read,keyInfo,prepare,paginate,generate,drawPage,palette,spell,keyLabel,KEYS,COLORS,makePdf}})();

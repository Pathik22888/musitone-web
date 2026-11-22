/* MusiTone — format vertical (comme les vidéos MusiTone, sans décor) :
   le temps monte du bas vers le haut, chaque note est posée au-dessus de sa touche, 4 mesures par page. */
const MXV=(()=>{const LET="CDEFGAB",NATS={C:0,D:2,E:4,F:5,G:7,A:9,B:11},W=1080,H=1920,FONT="'Helvetica Neue',Helvetica,Arial,sans-serif";
  const BG="#0A1020",INK="#F3F6FF",MUTE="#93A6C4",LINE="#33496A";
  const rr=(c,x,y,w,h,r)=>{r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h)};
  const light=(h,a)=>"#"+[1,3,5].map(i=>Math.round(Math.min(255,parseInt(h.slice(i,i+2),16)*(1-a)+255*a)).toString(16).padStart(2,"0")).join("");
  const dark=(h,a)=>"#"+[1,3,5].map(i=>Math.round(parseInt(h.slice(i,i+2),16)*(1-a)).toString(16).padStart(2,"0")).join("");
  /* étendue du clavier : octaves entières couvrant toutes les notes, au moins deux octaves */
  function range(systems){let lo=1e9,hi=-1e9;for(const s of systems)for(const r of s.rendered){lo=Math.min(lo,r.note);hi=Math.max(hi,r.note)}if(lo>hi){lo=60;hi=72}
    const isW=p=>[0,2,4,5,7,9,11].includes(((p%12)+12)%12);let a=lo-1,b=hi+1;while(!isW(a))a--;while(!isW(b))b++;
    const cnt=()=>{let n=0;for(let p=a;p<=b;p++)if(isW(p))n++;return n};let side=0;while(cnt()<15){if(side++%2){do b++;while(!isW(b))}else{do a--;while(!isW(a))}}return[a,b]}
  function keyGeom(a,b){const whites=[];for(let p=a;p<=b;p++)if([0,2,4,5,7,9,11].includes(((p%12)+12)%12))whites.push(p);const x0=10,x1=W-10,ww=(x1-x0)/whites.length;
    const X=p=>{const pc=p%12;if([0,2,4,5,7,9,11].includes(pc)){const i=whites.indexOf(p);return{c:x0+(i+.5)*ww,w:ww,black:false}}const i=whites.indexOf(p-1);return{c:x0+(i+1)*ww,w:ww*.62,black:true}};
    return{whites,ww,x0,x1,X}}
  const rgba=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;
  function pill(c,x,y,txt,opt={}){const f=opt.f||24;c.font=`${opt.w||700} ${f}px ${FONT}`;const tw=c.measureText(txt).width,px=opt.px||14,h=f+(opt.py||14),w=tw+2*px;
    const X0=opt.align==="right"?x-w:opt.align==="center"?x-w/2:x;rr(c,X0,y-h/2,w,h,h/2);c.fillStyle=opt.bg||"rgba(255,255,255,.07)";c.fill();c.strokeStyle=opt.bd||"rgba(255,255,255,.12)";c.lineWidth=1.5;c.stroke();
    c.fillStyle=opt.fg||INK;c.textAlign="center";c.textBaseline="middle";c.fillText(txt,X0+w/2,y+1);return w}
  function logo(c,x,y,h){const cols=["#2F80FF","#FF922E","#35D66B","#FF4B4B","#FFE94A","#A66CFF","#FF70C8"],kw=h*.42,w=kw*7;c.save();rr(c,x,y,w,h,h*.18);c.clip();cols.forEach((k,i)=>{c.fillStyle=k;c.fillRect(x+i*kw,y,kw+.5,h)});
    c.fillStyle="#0B0F1A";for(const i of[1,2,4,5,6]){c.fillRect(x+i*kw-kw*.28,y,kw*.56,h*.58)}c.restore();return w}
  function draw(s,ctx){const{title,keyLabel,pal,tempo,page,pages,range:[a,b],meterLabel}=ctx,H=Math.round(ctx.H||1920),cv=document.createElement("canvas");cv.width=W;cv.height=H;const c=cv.getContext("2d");
    const bg=c.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#0B1124");bg.addColorStop(.55,"#080D1C");bg.addColorStop(1,"#05070F");c.fillStyle=bg;c.fillRect(0,0,W,H);
    const glow=c.createRadialGradient(W*.5,-200,50,W*.5,-200,1100);glow.addColorStop(0,"rgba(80,110,255,.22)");glow.addColorStop(1,"rgba(80,110,255,0)");c.fillStyle=glow;c.fillRect(0,0,W,700);
    const G=keyGeom(a,b);
    /* en-tête : logo, titre, pastilles d'infos */
    const lw=logo(c,32,40,46);c.fillStyle=INK;c.textAlign="left";c.textBaseline="middle";let fs=50;c.font=`800 ${fs}px ${FONT}`;const T=title;while(c.measureText(T).width>W-32-lw-60&&fs>28){fs-=2;c.font=`800 ${fs}px ${FONT}`}c.fillText(T,32+lw+22,64);
    let px=32;const py=134;for(const t of[keyLabel,`♩ ${tempo}`,meterLabel])px+=pill(c,px,py,t,{f:25,w:700})+10;
    pill(c,W-32,py,`${page} / ${pages}`,{f:25,w:800,align:"right",bg:"rgba(255,255,255,.95)",bd:"rgba(255,255,255,0)",fg:"#0B1124"});
    /* zone des notes : le bas = début de la page */
    const top=186,pTop=H-320,bot=pTop-4,pxT=(bot-top-14)/(s.window_end-s.window_start),Y=t=>bot-(t-s.window_start)*pxT;
    c.save();rr(c,G.x0,top,G.x1-G.x0,bot-top,22);c.clip();c.fillStyle="rgba(255,255,255,.025)";c.fillRect(G.x0,top,G.x1-G.x0,bot-top);
    /* couloirs : chaque touche de la gamme a son couloir teinté, qui s'éclaire vers le clavier */
    for(let p=a;p<=b;p++){const d=pal[p%12],g=G.X(p);if(!d||g.black)continue;const lg=c.createLinearGradient(0,top,0,bot);lg.addColorStop(0,rgba(d.color,0));lg.addColorStop(1,rgba(d.color,.10));c.fillStyle=lg;c.fillRect(g.c-g.w/2+1,top,g.w-2,bot-top)}
    G.whites.forEach((p,i)=>{const x=G.x0+i*G.ww;c.fillStyle=p%12===0?"rgba(47,128,255,.55)":"rgba(160,180,220,.07)";c.fillRect(Math.round(x)-(p%12===0?1:0),top,p%12===0?2:1,bot-top)});
    for(const M of s.meas){const beat=M.len/M.num;for(let k=1;k<M.num;k++){const y=Math.round(Y(M.start+k*beat))+.5;c.strokeStyle="rgba(160,180,220,.16)";c.lineWidth=1.5;c.setLineDash([4,10]);c.beginPath();c.moveTo(G.x0,y);c.lineTo(G.x1,y);c.stroke()}}
    c.setLineDash([]);
    for(const y0 of s.meas.map(M=>M.start).concat([s.window_end])){const y=Math.round(Y(y0));const lg=c.createLinearGradient(G.x0,0,G.x1,0);lg.addColorStop(0,"rgba(150,175,220,.55)");lg.addColorStop(1,"rgba(150,175,220,.18)");c.fillStyle=lg;c.fillRect(G.x0,y-1,G.x1-G.x0,2)}
    /* notes */
    const blocks=s.rendered.map(r=>{const w=r.clip_end_tick-r.clip_start_tick,mn=w*.35;let lead=r.lead||0,trail=r.trail||0;if(lead+trail>w-mn){const k=(w-mn)/(lead+trail||1);lead*=k;trail*=k}
      const t0=r.clip_start_tick+lead,t1=r.clip_end_tick-trail,g=G.X(r.note);return{r,g,y0:Y(t1),y1:Y(t0)}}).sort((p,q)=>(p.g.black?1:0)-(q.g.black?1:0));
    s._rects=[];
    for(const{r,g,y0,y1}of blocks){const bw=g.black?g.w*.95:g.w*.84,x=g.c-bw/2,h=Math.max(8,y1-y0-4),y=y1-h,rad=Math.min(14,bw*.3,h/2),col=r.color;
      s._rects.push({x,y,w:bw,h,rad,hand:r.hand,a:r.clip_start_tick,b:r.clip_end_tick,p:r.note,col});
      if(r.hand==="right"){c.save();c.shadowColor=rgba(col,.55);c.shadowBlur=22;c.fillStyle=col;rr(c,x,y,bw,h,rad);c.fill();c.restore();
        const gr=c.createLinearGradient(x,0,x+bw,0);gr.addColorStop(0,light(col,.28));gr.addColorStop(.45,light(col,.08));gr.addColorStop(1,dark(col,.18));c.fillStyle=gr;rr(c,x,y,bw,h,rad);c.fill();
        c.save();rr(c,x,y,bw,h,rad);c.clip();const hl=c.createLinearGradient(0,y,0,y+Math.min(h,30));hl.addColorStop(0,"rgba(255,255,255,.55)");hl.addColorStop(1,"rgba(255,255,255,0)");c.fillStyle=hl;c.fillRect(x+3,y+2,bw-6,Math.min(h,30));c.restore();
        c.strokeStyle="rgba(255,255,255,.35)";c.lineWidth=1.5;rr(c,x+.75,y+.75,bw-1.5,h-1.5,rad);c.stroke()}
      else{c.fillStyle=rgba(col,.16);rr(c,x,y,bw,h,rad);c.fill();c.save();rr(c,x,y,bw,h,rad);c.clip();c.strokeStyle=rgba(col,.85);c.lineWidth=3.5;c.beginPath();for(let k=y-bw;k<y+h+bw;k+=12){c.moveTo(x,k+bw);c.lineTo(x+bw,k)}c.stroke();c.restore();
        c.save();c.shadowColor=rgba(col,.5);c.shadowBlur=14;c.strokeStyle=col;c.lineWidth=3;rr(c,x+1.5,y+1.5,bw-3,h-3,rad);c.stroke();c.restore()}
      const lab=r.letter+r.symbol.replace("#","♯"),blackTxt=/[#♯♭]/.test(r.symbol);let f=Math.min(30,bw*.52);c.font=`800 ${f}px ${FONT}`;while(c.measureText(lab).width>bw*.92&&f>15){f-=1;c.font=`800 ${f}px ${FONT}`}
      if(h>=f*1.1){const ly=y+h-Math.min(h/2,f*.95);if(r.hand==="left"){const tw=c.measureText(lab).width;c.fillStyle=col;rr(c,g.c-tw/2-6,ly-f*.62,tw+12,f*1.24,f*.62);c.fill()}
        c.fillStyle=blackTxt?"#000":"#fff";c.textAlign="center";c.textBaseline="middle";c.fillText(lab,g.c,ly+1)}}
    /* numéros de mesure, en pastille sur la barre */
    s.meas.forEach((M,i)=>{const y=Math.round(Y(M.start)),ch=i>0&&(M.num!==s.meas[i-1].num||M.den!==s.meas[i-1].den);pill(c,G.x0+10,y-22,String(M.number)+(ch?`  ·  ${M.num}/${M.den}`:""),{f:22,w:800,px:12,py:10,bg:"rgba(12,18,36,.85)",bd:"rgba(150,175,220,.35)"})});
    c.restore();
    /* ligne de jeu au-dessus du clavier */
    const hl=c.createLinearGradient(G.x0,0,G.x1,0);["#2F80FF","#FF922E","#35D66B","#FF4B4B","#FFE94A","#A66CFF","#FF70C8"].forEach((k,i)=>hl.addColorStop(i/6,k));
    c.save();c.shadowColor="rgba(255,255,255,.6)";c.shadowBlur=18;c.fillStyle=hl;c.fillRect(G.x0,pTop-5,G.x1-G.x0,5);c.restore();
    /* clavier */
    const kh=212,bh=132;s._keys={pTop,kh,bh,K:{}};for(let p=a;p<=b;p++){const g=G.X(p);s._keys.K[p]=g.black?{x:g.c-g.w/2,w:g.w,h:bh,black:true}:{x:G.x0+G.whites.indexOf(p)*G.ww+1.5,w:G.ww-3,h:kh,black:false}}c.fillStyle="#020409";c.fillRect(0,pTop,W,kh+8);
    G.whites.forEach((p,i)=>{const x=G.x0+i*G.ww,gw=c.createLinearGradient(0,pTop,0,pTop+kh);gw.addColorStop(0,"#D9DEE8");gw.addColorStop(.08,"#FFFFFF");gw.addColorStop(.85,"#F1F3F8");gw.addColorStop(1,"#C9CFDB");c.fillStyle=gw;rr(c,x+1.5,pTop+2,G.ww-3,kh,8);c.fill();
      const d=pal[p%12];if(d){const tw=Math.min(G.ww*.74,48),tx=x+G.ww/2-tw/2,ty=pTop+kh-tw-12;c.save();c.shadowColor=rgba(d.color,.6);c.shadowBlur=10;c.fillStyle=d.color;rr(c,tx,ty,tw,tw,tw*.28);c.fill();c.restore();
        const sh=c.createLinearGradient(0,ty,0,ty+tw);sh.addColorStop(0,"rgba(255,255,255,.35)");sh.addColorStop(.5,"rgba(255,255,255,0)");c.fillStyle=sh;rr(c,tx,ty,tw,tw,tw*.28);c.fill();
        const lb=d.label.replace("b","♭").replace("#","♯");c.fillStyle=/[♯♭]/.test(lb)?"#000":"#fff";c.font=`800 ${Math.min(22,tw*.46)}px ${FONT}`;c.textAlign="center";c.textBaseline="middle";c.fillText(lb,x+G.ww/2,ty+tw/2+1)}});
    for(let p=a;p<=b;p++)if([1,3,6,8,10].includes(p%12)){const g=G.X(p),x=g.c-g.w/2,gb=c.createLinearGradient(0,pTop,0,pTop+bh);gb.addColorStop(0,"#2A3142");gb.addColorStop(.15,"#141927");gb.addColorStop(1,"#06080E");
      c.save();c.shadowColor="rgba(0,0,0,.6)";c.shadowBlur=8;c.shadowOffsetY=4;c.fillStyle=gb;rr(c,x,pTop,g.w,bh,6);c.fill();c.restore();c.fillStyle="rgba(255,255,255,.08)";rr(c,x+3,pTop+3,g.w-6,bh*.7,4);c.fill();
      const d=pal[p%12];if(d){const tw=Math.min(g.w*.82,38),ty=pTop+bh-tw-10;c.save();c.shadowColor=rgba(d.color,.7);c.shadowBlur=10;c.fillStyle=d.color;rr(c,g.c-tw/2,ty,tw,tw,tw*.28);c.fill();c.restore();const lb=d.label.replace("b","♭").replace("#","♯");c.fillStyle="#000";c.font=`800 ${Math.min(17,tw*.42)}px ${FONT}`;c.textAlign="center";c.textBaseline="middle";c.fillText(lb,g.c,ty+tw/2+1)}}
    const ksh=c.createLinearGradient(0,pTop,0,pTop+18);ksh.addColorStop(0,"rgba(0,0,0,.45)");ksh.addColorStop(1,"rgba(0,0,0,0)");c.fillStyle=ksh;c.fillRect(0,pTop,W,18);
    /* repères d'octave, C4 entouré */
    const oy=pTop+kh+36;G.whites.forEach((p,i)=>{if(p%12)return;const x=G.x0+(i+.5)*G.ww,lab="C"+(p/12-1);if(p===60){c.save();c.shadowColor="rgba(47,128,255,.8)";c.shadowBlur=14;c.fillStyle="#2F80FF";c.beginPath();c.arc(x,oy,22,0,7);c.fill();c.restore();c.strokeStyle="#fff";c.lineWidth=2.5;c.beginPath();c.arc(x,oy,17,0,7);c.stroke();c.fillStyle="#fff";c.font=`800 16px ${FONT}`}else{c.fillStyle="#7FB0FF";c.font=`800 20px ${FONT}`}c.textAlign="center";c.textBaseline="middle";c.fillText(lab,x,oy+1)});
    /* légende */
    const ly=H-34;c.textBaseline="middle";c.textAlign="left";c.font=`700 23px ${FONT}`;
    c.save();c.shadowColor="rgba(47,128,255,.6)";c.shadowBlur=10;c.fillStyle="#2F80FF";rr(c,32,ly-13,40,26,13);c.fill();c.restore();c.fillStyle=INK;c.fillText("Main droite",82,ly);
    c.fillStyle="rgba(47,128,255,.16)";rr(c,256,ly-13,40,26,13);c.fill();c.save();rr(c,256,ly-13,40,26,13);c.clip();c.strokeStyle="rgba(47,128,255,.9)";c.lineWidth=3.5;c.beginPath();for(let k=-40;k<70;k+=12){c.moveTo(256+k,ly+13);c.lineTo(256+k+26,ly-13)}c.stroke();c.restore();c.strokeStyle="#2F80FF";c.lineWidth=2.5;rr(c,257,ly-12,38,24,12);c.stroke();c.fillStyle=INK;c.fillText("Main gauche",306,ly);
    c.textAlign="right";c.fillStyle=MUTE;c.fillText("Lecture de bas en haut ↑",W-32,ly);
    return cv}
  return{draw,range}})();

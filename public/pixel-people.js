/* ============================================================================
 * SHADDAI · pixel-people.js  — LOCKED modular voxel character rig (code-only, $0)
 * ----------------------------------------------------------------------------
 * One rig, infinite data-driven cosmetics. Robot-clean template: head block +
 * one hat/hair block + dot-eyes + tiny mouth.  No AI, no image assets.
 *
 * API:
 *   PixelPeople.draw(ctx, rig, screenX, feetY, scale, t)   // draw one character
 *   PixelPeople.PRESETS        // 100 ready rigs  [{name, rig}]
 *   PixelPeople.randomRig()    // fresh random rig
 *   PixelPeople.cycle(rig, slot, dir)   // change one cosmetic slot (returns new rig)
 * rig fields: skin, hair, cap, shirt|hoodie|suit|jacket|dress, pants, shoe,
 *   shoeStyle(sneaker|boot|dress|heel), glasses, short, hoodUp, mohawk, robot,
 *   led, emblem, logo, tie, watch, anim('idle'|'walk'), __phase
 * optional metadata (ignored by draw(), carried through JSON clone/save so it survives
 * everywhere a rig is persisted — gallery, shaddai.player, /api/operatives):
 *   office('shaddai'|'zerox'|'oracle'|'nexus'|'turtle'|'quill'|'pikadon'|undefined),
 *   jobTint('coder'|'designer'|'writer'|'researcher'|'trader'|'coach'|'builder'|undefined),
 *   classTint('warrior'|'mage'|'rogue'|'cleric'|'ranger'|'bard'|undefined)
 * ==========================================================================*/
window.PixelPeople = (function () {
  'use strict';
  const TW = 84, TH = 42;
  let ctx = null, OX = 0, OY = 0;

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); let r = (n>>16)&255, g = (n>>8)&255, b = n&255;
    const f = amt<0?0:255, t = Math.abs(amt);
    r = Math.round((f-r)*t+r); g = Math.round((f-g)*t+g); b = Math.round((f-b)*t+b);
    return '#' + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }
  function iso(col, row) { return [OX+(col-row)*TW/2, OY+(col+row)*TH/2]; }
  function Pth(p) { ctx.beginPath(); ctx.moveTo(Math.round(p[0][0]),Math.round(p[0][1]));
    for (let i=1;i<p.length;i++) ctx.lineTo(Math.round(p[i][0]),Math.round(p[i][1])); ctx.closePath(); }
  function box(col,row,w,d,h,top,opts){ opts=opts||{};
    const cx=OX+(col-row)*TW/2, cy=OY+(col+row)*TH/2;
    const dx=(dc,dr)=>(dc-dr)*TW/2, dy=(dc,dr)=>(dc+dr)*TH/2, hw=w/2, hd=d/2;
    const back=[cx+dx(-hw,-hd),cy+dy(-hw,-hd)], right=[cx+dx(hw,-hd),cy+dy(hw,-hd)],
          front=[cx+dx(hw,hd),cy+dy(hw,hd)], left=[cx+dx(-hw,hd),cy+dy(-hw,hd)];
    const up=p=>[p[0],p[1]-h], tB=up(back),tR=up(right),tF=up(front),tL=up(left);
    ctx.fillStyle=opts.left||shade(top,-0.17); Pth([left,front,tF,tL]); ctx.fill();
    ctx.fillStyle=opts.right||shade(top,-0.33); Pth([front,right,tR,tF]); ctx.fill();
    ctx.fillStyle=top; Pth([tB,tR,tF,tL]); ctx.fill();
    if(opts.edge){ ctx.strokeStyle='rgba(0,0,0,0.22)'; ctx.lineWidth=1; ctx.lineJoin='round';
      Pth([tB,tR,right,front,left,tL]); ctx.stroke(); }
  }
  function boxL(col,row,w,d,h,color,lift,opts){ const s=OY; OY-=lift; box(col,row,w,d,h,color,opts); OY=s; }
  const E = { edge:true };

  function shoePart(c,r,style,color,L){
    if(style==='boot'){boxL(c,r+0.02,0.17,0.19,8,color,0+L,E);}
    else if(style==='dress'){boxL(c,r+0.05,0.15,0.22,3,color,0+L,E);}
    else if(style==='heel'){boxL(c,r+0.02,0.13,0.15,3,color,0+L,E);boxL(c,r+0.12,0.05,0.05,2,color,0+L);}
    else{ boxL(c,r+0.05,0.17,0.2,1.6,'#eef1f4',0+L); boxL(c,r+0.02,0.16,0.18,4,color,1.6+L,E); }
  }
  function armPart(c,r,sleeve,skinC,L,o){ o=o||{};
    boxL(c,r,0.1,0.1,3,skinC,8+L,E);
    if(o.short){boxL(c,r,0.1,0.1,7,skinC,11+L,E);boxL(c,r,0.11,0.11,7,sleeve,18+L,E);}
    else boxL(c,r,0.1,0.1,13,sleeve,11+L,E);
    if(o.watch){ctx.fillStyle=o.watch;const[wx,wy]=iso(c,r);ctx.fillRect(Math.round(wx)-3,Math.round(wy)-(11+L),6,2);ctx.fillStyle=shade(o.watch,0.4);ctx.fillRect(Math.round(wx)-1,Math.round(wy)-(11+L),2,2);}
  }

  function guy(rig,t,phase){
    const col=0,row=0, tt=t/1000+(phase||0), walk=rig.anim==='walk';
    const L = walk ? Math.abs(Math.cos(tt*7))*1.6 : Math.sin(tt*1.7)*0.4;
    const str = walk ? Math.sin(tt*7)*0.05 : 0;
    const skin=rig.skin||'#f0c199', shirt=rig.shirt||'#e0662e', pants=rig.pants||'#37414f';
    const shoe=rig.shoe||'#2a2a2a', hair=rig.hair||'#3a2a1a', cap=rig.cap;
    const top=rig.suit||rig.hoodie||rig.jacket||shirt, sleeve=top;
    const [cx,cy]=iso(0,0);
    ctx.fillStyle='rgba(0,0,0,0.28)';ctx.beginPath();ctx.ellipse(cx,cy+3,14,6,0,0,7);ctx.fill();
    armPart(col+0.18+str,row-0.18+str,sleeve,skin,L,{short:rig.short,watch:rig.watch});
    if(rig.dress){shoePart(col-0.02,row+0.02,'heel',shoe,L);shoePart(col+0.02,row-0.02,'heel',shoe,L);boxL(col,row,0.5,0.4,13,rig.dress,3+L,E);boxL(col,row,0.36,0.26,12,rig.dress,16+L,E);}
    else{for(const g of [[-0.08,0.08,1],[0.08,-0.08,-1]]){const c=col+g[0]+str*g[2],r=row+g[1]+str*g[2];shoePart(c,r,rig.shoeStyle,shoe,L);boxL(c,r,0.13,0.13,6,pants,4+L,E);}
      boxL(col,row,0.4,0.3,15,top,10+L,E);}
    const T=(o)=>cy-(10+o+L);
    if(rig.hoodie && !rig.hoodUp){
      boxL(col,row-0.13,0.44,0.2,11,shade(rig.hoodie,-0.05),27+L,E);
      boxL(col,row-0.06,0.34,0.12,5,shade(rig.hoodie,-0.2),28+L,E);
      ctx.fillStyle=shade(rig.hoodie,-0.26);ctx.fillRect(Math.round(cx)-6,T(16),12,3);ctx.fillStyle=shade(rig.hoodie,-0.12);ctx.fillRect(Math.round(cx)-5,T(17),10,1);
      ctx.fillStyle='#eef1f4';ctx.fillRect(Math.round(cx)-3,T(12),1,6);ctx.fillRect(Math.round(cx)+2,T(12),1,6);
    }
    if(rig.suit){ ctx.fillStyle=shade(rig.suit,-0.22);
      Pth([[cx-5,T(15)],[cx,T(7)],[cx-1,T(15)]]);ctx.fill();
      Pth([[cx+5,T(15)],[cx,T(7)],[cx+1,T(15)]]);ctx.fill(); }
    if(rig.tie){ctx.fillStyle=rig.tie;ctx.fillRect(Math.round(cx)-1,T(13),2,10);ctx.fillStyle=shade(rig.tie,-0.3);ctx.fillRect(Math.round(cx)-1,T(13),2,2);}
    else if(!rig.suit){ctx.fillStyle=shade(top,0.16);ctx.fillRect(Math.round(cx)-4,T(14),8,2);}
    if(rig.logo){ctx.strokeStyle=rig.logo;ctx.lineWidth=1.6;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(cx-4,T(7));ctx.lineTo(cx-1,T(9));ctx.lineTo(cx+5,T(13));ctx.stroke();}
    if(rig.emblem){ctx.fillStyle=rig.emblem;ctx.fillRect(Math.round(cx)-3,T(8),6,6);}
    armPart(col-0.18-str,row+0.18-str,sleeve,skin,L,{short:rig.short,watch:rig.watch2});
    // HEAD — dead simple
    boxL(col,row,0.46,0.37,15,skin,25+L,E);
    if(rig.robot){boxL(col,row,0.48,0.4,5,rig.cap||'#9aa4ad',39+L,E);boxL(col,row,0.04,0.04,6,'#9aa4ad',44+L,E);ctx.fillStyle=rig.led||'#ff5a4d';const[ax,ay]=iso(0,0);ctx.beginPath();ctx.arc(ax,ay-(50+L),2.5,0,7);ctx.fill();}
    else if(rig.hoodUp){const hc=rig.hoodie||'#555';
      boxL(col,row-0.03,0.62,0.52,20,hc,25+L,E);                                    // hood shell
      const[ox,oy]=iso(0,0), oxr=Math.round(ox), oyr=Math.round(oy);
      ctx.fillStyle=skin; ctx.fillRect(oxr-7,oyr-(38+L),14,15);                     // flat face — BOTH sides open evenly
      ctx.fillStyle=shade(hc,-0.32);                                                // hood rim line framing the face on BOTH sides + top
      ctx.fillRect(oxr-9,oyr-(39+L),2,16); ctx.fillRect(oxr+7,oyr-(39+L),2,16); ctx.fillRect(oxr-9,oyr-(40+L),18,2);}
    else if(cap){boxL(col,row,0.5,0.42,8,cap,38+L,E);}
    else if(rig.mohawk){boxL(col,row,0.12,0.34,11,hair,39+L,E);}
    else{boxL(col,row,0.48,0.4,9,hair,38+L,E);}
    const fx=Math.round(cx), ey=Math.round(cy-(25+L)-8);
    if(rig.robot){ctx.fillStyle=rig.led||'#5fe0ff';ctx.fillRect(fx-6,ey,4,4);ctx.fillRect(fx+3,ey,4,4);}
    else{
      ctx.fillStyle=rig.eye||'#241a12';ctx.fillRect(fx-5,ey,3,4);ctx.fillRect(fx+3,ey,3,4);
      const ns=rig.nose||1; ctx.fillStyle=shade(skin,-0.18);ctx.fillRect(fx,ey+5,ns,ns);   // tiny standalone nose square (rig.nose sets size)
      ctx.fillStyle=shade(skin,-0.34);ctx.fillRect(fx-2,ey+7,4,1);
      if(rig.glasses){ctx.strokeStyle='#0e1116';ctx.lineWidth=1.4;ctx.strokeRect(fx-6,ey-1,5,5);ctx.strokeRect(fx+2,ey-1,5,5);ctx.beginPath();ctx.moveTo(fx-1,ey+1);ctx.lineTo(fx+2,ey+1);ctx.stroke();}
    }
  }

  function draw(_ctx, rig, sx, sy, scale, t) {
    ctx = _ctx; ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(sx), Math.round(sy)); ctx.scale(scale, scale);
    OX = 0; OY = 0; guy(rig, t || 0, rig.__phase || 0); ctx.restore();
  }

  // ---- deterministic 100-preset wardrobe (diverse people + robots) ----
  let SEED = 20260718; function rnd(){ SEED=(SEED*1103515245+12345)&0x7fffffff; return SEED/0x7fffffff; }
  function pick(a){ return a[(rnd()*a.length)|0]; }
  const SKIN=['#ffe0bd','#f2c9a0','#e7b58a','#d19a6a','#b07c4f','#8a5a3a','#6b4423','#4a2f1c'];
  const HAIR=['#2a1c12','#5a3a1a','#111111','#e8a23a','#d8d2c8','#7a5a3a','#c0392b','#e83a3a','#3a5ac0','#7a3ac0','#2aa050','#f2c84a','#b0b0b0'];
  const SHIRT=['#e0662e','#2f6fe8','#3f9e4d','#e8433a','#f2a01e','#8b5cf6','#12b3b3','#eef1f4','#d94f8f','#00a3a3','#7a3ac0'];
  const CAP=['#e8c33a','#e8433a','#2f6fe8','#1a1a1a','#00a3a3','#2aa050','#d94f8f'];
  const SHOE=['#2a2a2a','#111111','#8a2a2a','#e8e8e8','#2a3a5a','#5a3a1a'];
  const SHOES=['sneaker','sneaker','boot','dress'];
  const ROBOT_METAL=['#b8c0c8','#8a9199','#6b7280','#c8a24a','#c46b3a','#e8e8ee','#3a3f47','#9aa4ad'];
  const LED=['#5fe0ff','#ff5a4d','#00ff9c','#f2c84a','#c9a6ff'];
  const ARCH=[
    (s)=>({name:'Suit',      suit:pick(['#1f3a63','#20242c','#2b3a4a','#3a2f2a']),shirt:'#eef1f4',pants:'#20242c',shoeStyle:'dress',shoe:'#20161a',hair:pick(HAIR),skin:s,glasses:rnd()<0.35,tie:rnd()<0.6?'#c0392b':null}),
    (s)=>({name:'Casual',    shirt:pick(SHIRT),pants:pick(['#2b3a4a','#203a5a','#37414f']),shoeStyle:pick(SHOES),shoe:pick(SHOE),cap:rnd()<0.5?pick(CAP):null,hair:pick(HAIR),skin:s}),
    (s)=>({name:'Hoodie',    hoodie:pick(['#6b7280','#2f6fe8','#3f9e4d','#8b5cf6','#e0662e']),logo:rnd()<0.5?'#ffffff':null,pants:pick(['#2b3a4a','#20242c']),shoeStyle:'sneaker',shoe:pick(SHOE),hair:pick(HAIR),skin:s,hoodUp:rnd()<0.35}),
    (s)=>({name:'Athlete',   shirt:pick(['#e8433a','#2f6fe8','#00a3a3','#f2a01e']),short:true,pants:pick(['#20242c','#eef1f4']),shoeStyle:'sneaker',shoe:'#eef1f4',cap:rnd()<0.5?pick(CAP):null,hair:pick(HAIR),skin:s}),
    (s)=>({name:'Punk',      jacket:'#1a1a1a',shirt:pick(['#e83a3a','#8b5cf6','#00ff9c']),pants:'#20242c',shoeStyle:'boot',shoe:'#111',hair:pick(['#e83a3a','#8b5cf6','#2aa050','#f2c84a']),mohawk:true,skin:s}),
    (s)=>({name:'Elder',     shirt:pick(['#3f9e4d','#7a6a9a','#8a6a44']),pants:'#3a3a3a',shoeStyle:'dress',shoe:'#3a2a1a',hair:pick(['#d8d2c8','#e8e8e8','#b0b0b0']),glasses:true,skin:s}),
    (s)=>({name:'Dress',     dress:pick(['#e84f8f','#8b5cf6','#1f3a63','#c0392b','#2aa050','#f2a01e']),shoe:'#20161a',hair:pick(HAIR),watch:rnd()<0.4?'#e8c33a':null,skin:s}),
    (s)=>({name:'Worker',    jacket:pick(['#e8a83a','#3a6ac0','#c46b3a']),shirt:'#d8d2c8',pants:pick(['#2b3a4a','#3a2a1f']),shoeStyle:'boot',shoe:'#3a2a1a',cap:pick(['#e8c33a','#e8433a']),hair:pick(HAIR),skin:s}),
  ];
  // 10 distinct robot color schemes (body / accent / LED)
  const ROBOT_SCHEMES=[
    ['#b8c0c8','#8a9199','#5fe0ff'], ['#c8a24a','#8a6a2a','#f2c84a'], ['#c46b3a','#8a4a24','#ff5a4d'],
    ['#8a9199','#5a6068','#00ff9c'], ['#e8e8ee','#b8c0c8','#c9a6ff'], ['#3a3f47','#22262c','#ff5a4d'],
    ['#6b7280','#454b54','#5fe0ff'], ['#9aa4ad','#6b7280','#00ff9c'], ['#2a3a5a','#1a2740','#5fe0ff'],
    ['#7a3ac0','#4a2080','#f2c84a'],
  ];
  function robotFrom(s){ return {name:'Robot',robot:true,skin:s[0],cap:s[0],shirt:s[1],pants:s[1],shoe:shade(s[1],-0.2),led:s[2],emblem:s[2]}; }
  function robotPreset(){ return robotFrom(pick(ROBOT_SCHEMES)); }
  const PRESETS = [];
  for (let i=0;i<100;i++){
    let rig;
    if (i>=90){ rig=robotFrom(ROBOT_SCHEMES[i-90]); }   // exactly 10 robots, each a different colour
    else { rig=ARCH[i%ARCH.length](SKIN[i%SKIN.length]); }
    rig.__phase = i*0.37;
    PRESETS.push({ name: rig.name || 'Citizen', rig });
  }
  // ── 7 office-lead presets — rig fields copied verbatim from game.html's AGENTS array so the
  // Forge, the Hall, and the 2D world all render the exact same character per agent. ──
  const OFFICE_LEADS = [
    { office:'shaddai', rig:{suit:'#241f44',cap:'#c9a6ff',tie:'#ffd45c',emblem:'#ffd45c',skin:'#f0c199'} },
    { office:'oracle',  rig:{hoodie:'#3a2f5a',hoodUp:true,emblem:'#8b7bf0',skin:'#e7b58a'} },
    { office:'quill',   rig:{suit:'#173a4a',cap:'#5fe0ff',tie:'#5fe0ff',glasses:true,skin:'#f0c199'} },
    { office:'turtle',  rig:{hoodie:'#1f5a44',cap:'#00ff9c',emblem:'#00ff9c',skin:'#caa06f'} },
    { office:'nexus',   rig:{robot:true,skin:'#8a9199',cap:'#e8c45c',shirt:'#6b7280',pants:'#3a3f47',led:'#e8c45c',emblem:'#e8c45c'} },
    { office:'zerox',   rig:{suit:'#3a2a1a',cap:'#ff9a3c',tie:'#ff9a3c',emblem:'#ff9a3c',skin:'#caa06f'} },
    { office:'pikadon', rig:{jacket:'#331616',cap:'#ff5a4d',emblem:'#ff5a4d',shoeStyle:'boot',skin:'#8a5a3a'} },
  ];
  OFFICE_LEADS.forEach(function(o, i){
    const rig = Object.assign({}, o.rig, { office:o.office, __phase:(100+i)*0.37 });
    PRESETS.push({ name:'Council', rig });
  });
  function randomRig(){ SEED=(Date.now?0:0, (SEED*16807+1)&0x7fffffff); const i=(Math.abs(SEED)%PRESETS.length);
    // fresh randoms each call
    const r = rnd()<0.12 ? robotPreset() : ARCH[(rnd()*ARCH.length)|0](pick(SKIN));
    r.__phase = rnd()*6; return r; }

  return { draw, guy: draw, PRESETS, randomRig, shade, TW, TH };
})();

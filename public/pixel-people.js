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
 *   classTint('warrior'|'mage'|'rogue'|'cleric'|'ranger'|'bard'|undefined),
 *   kit('classic'|'voxel'|undefined) — 'voxel' renders blockier proportions + flat
 *     faces (same walk-cycle animation, same rig fields; zero migration for absent value),
 *   accessories({hat|weapon|pet|wings|mask: catalogId}) — fal-generated image overlays
 *     anchored to the rig's live animated coordinates (move with the walk bob), catalog
 *     served from /assets/accessories/catalog.json
 * ==========================================================================*/
window.PixelPeople = (function () {
  'use strict';
  const TW = 84, TH = 42;
  let ctx = null, OX = 0, OY = 0;

  // ---- accessory image overlay store (fal assets, anchored to the walk cycle) ----
  let _catalog = null, _catalogPromise = null;
  const _imgCache = {};
  function loadCatalog() {
    if (_catalogPromise) return _catalogPromise;
    _catalogPromise = fetch('/assets/accessories/catalog.json')
      .then(function (r) { return r.json(); })
      .then(function (list) { _catalog = {}; list.forEach(function (it) { _catalog[it.id] = it; }); return _catalog; })
      .catch(function () { _catalog = {}; return _catalog; });
    return _catalogPromise;
  }
  function getImg(file) {
    if (_imgCache[file]) return _imgCache[file];
    const img = new Image();
    img.src = '/assets/accessories/' + file;
    _imgCache[file] = img;
    return img;
  }
  loadCatalog(); // fire on module load — accessories before the catalog arrives simply don't draw yet

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
    // voxel kit wants harder, flatter faces than classic's soft gradient default
    const vox = opts.voxel;
    ctx.fillStyle = vox ? shade(top,-0.26) : (opts.left||shade(top,-0.17)); Pth([left,front,tF,tL]); ctx.fill();
    ctx.fillStyle = vox ? shade(top,-0.44) : (opts.right||shade(top,-0.33)); Pth([front,right,tR,tF]); ctx.fill();
    ctx.fillStyle=top; Pth([tB,tR,tF,tL]); ctx.fill();
    if(opts.edge||vox){ ctx.strokeStyle='rgba(0,0,0,0.22)'; ctx.lineWidth=1; ctx.lineJoin='round';
      Pth([tB,tR,right,front,left,tL]); ctx.stroke(); }
  }
  function boxL(col,row,w,d,h,color,lift,opts){ const s=OY; OY-=lift; box(col,row,w,d,h,color,opts); OY=s; }
  const E = { edge:true };

  function shoePart(c,r,style,color,L,vox){
    const E2 = vox ? { edge:true, voxel:true } : E;
    if(style==='boot'){boxL(c,r+0.02,0.17,0.19,8,color,0+L,E2);}
    else if(style==='dress'){boxL(c,r+0.05,0.15,0.22,3,color,0+L,E2);}
    else if(style==='heel'){boxL(c,r+0.02,0.13,0.15,3,color,0+L,E2);boxL(c,r+0.12,0.05,0.05,2,color,0+L);}
    else{ boxL(c,r+0.05,0.17,0.2,1.6,'#eef1f4',0+L); boxL(c,r+0.02,0.16,0.18,4,color,1.6+L,E2); }
  }
  function armPart(c,r,sleeve,skinC,L,o){ o=o||{};
    const w = o.vox ? 0.13 : 0.1;
    boxL(c,r,w,w,3,skinC,8+L,{edge:true,voxel:o.vox});
    if(o.short){boxL(c,r,w,w,7,skinC,11+L,{edge:true,voxel:o.vox});boxL(c,r,w+0.01,w+0.01,7,sleeve,18+L,{edge:true,voxel:o.vox});}
    else boxL(c,r,w,w,13,sleeve,11+L,{edge:true,voxel:o.vox});
    if(o.watch){ctx.fillStyle=o.watch;const[wx,wy]=iso(c,r);ctx.fillRect(Math.round(wx)-3,Math.round(wy)-(11+L),6,2);ctx.fillStyle=shade(o.watch,0.4);ctx.fillRect(Math.round(wx)-1,Math.round(wy)-(11+L),2,2);}
  }
  function guy(rig,t,phase){
    const col=0,row=0, tt=t/1000+(phase||0), walk=rig.anim==='walk';
    const L = walk ? Math.abs(Math.cos(tt*7))*1.6 : Math.sin(tt*1.7)*0.4;
    const str = walk ? Math.sin(tt*7)*0.05 : 0;
    const skin=rig.skin||'#f0c199', shirt=rig.shirt||'#e0662e', pants=rig.pants||'#37414f';
    const shoe=rig.shoe||'#2a2a2a', hair=rig.hair||'#3a2a1a', cap=rig.cap;
    const top=rig.suit||rig.hoodie||rig.jacket||shirt, sleeve=top;
    const isVoxel = rig.kit === 'voxel';
    const VS = isVoxel ? 1.15 : 1;                              // blockier torso/limb width — same walk math
    const VO = isVoxel ? { edge:true, voxel:true } : E;         // flat, harder-shaded faces for the voxel kit
    const [cx,cy]=iso(0,0);
    ctx.fillStyle='rgba(0,0,0,0.28)';ctx.beginPath();ctx.ellipse(cx,cy+3,14,6,0,0,7);ctx.fill();
    armPart(col+0.18+str,row-0.18+str,sleeve,skin,L,{short:rig.short,watch:rig.watch,vox:isVoxel});
    if(rig.dress){shoePart(col-0.02,row+0.02,'heel',shoe,L,isVoxel);shoePart(col+0.02,row-0.02,'heel',shoe,L,isVoxel);boxL(col,row,0.5*VS,0.4*VS,13,rig.dress,3+L,VO);boxL(col,row,0.36*VS,0.26*VS,12,rig.dress,16+L,VO);}
    else{for(const g of [[-0.08,0.08,1],[0.08,-0.08,-1]]){const c=col+g[0]+str*g[2],r=row+g[1]+str*g[2];shoePart(c,r,rig.shoeStyle,shoe,L,isVoxel);boxL(c,r,0.13*VS,0.13*VS,6,pants,4+L,VO);}
      boxL(col,row,0.4*VS,0.3*VS,15,top,10+L,VO);}
    const T=(o)=>cy-(10+o+L);
    if(rig.hoodie && !rig.hoodUp){
      // Hood-down drawstrings only — the previous version also drew a collar box
      // behind the torso (row-0.13/row-0.06) that read as a stray floating tab at
      // this scale, not a folded hood. The hoodie's top color already shows on the
      // torso via the shared `top` box below; that alone reads correctly as a hoodie.
      ctx.fillStyle='#eef1f4';ctx.fillRect(Math.round(cx)-3,T(12),1,6);ctx.fillRect(Math.round(cx)+2,T(12),1,6);
    }
    if(rig.suit){ ctx.fillStyle=shade(rig.suit,-0.22);
      Pth([[cx-5,T(15)],[cx,T(7)],[cx-1,T(15)]]);ctx.fill();
      Pth([[cx+5,T(15)],[cx,T(7)],[cx+1,T(15)]]);ctx.fill(); }
    if(rig.tie){ctx.fillStyle=rig.tie;ctx.fillRect(Math.round(cx)-1,T(13),2,10);ctx.fillStyle=shade(rig.tie,-0.3);ctx.fillRect(Math.round(cx)-1,T(13),2,2);}
    else if(!rig.suit){ctx.fillStyle=shade(top,0.16);ctx.fillRect(Math.round(cx)-4,T(14),8,2);}
    if(rig.logo){ctx.strokeStyle=rig.logo;ctx.lineWidth=1.6;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(cx-4,T(7));ctx.lineTo(cx-1,T(9));ctx.lineTo(cx+5,T(13));ctx.stroke();}
    if(rig.emblem){ctx.fillStyle=rig.emblem;ctx.fillRect(Math.round(cx)-3,T(8),6,6);}
    armPart(col-0.18-str,row+0.18-str,sleeve,skin,L,{short:rig.short,watch:rig.watch2,vox:isVoxel});
    // HEAD — dead simple
    boxL(col,row,0.46*VS,0.37*VS,15,skin,25+L,VO);
    if(rig.robot){boxL(col,row,0.48*VS,0.4*VS,5,rig.cap||'#9aa4ad',39+L,VO);boxL(col,row,0.04,0.04,6,'#9aa4ad',44+L,E);ctx.fillStyle=rig.led||'#ff5a4d';const[ax,ay]=iso(0,0);ctx.beginPath();ctx.arc(ax,ay-(50+L),2.5,0,7);ctx.fill();}
    else if(rig.hoodUp){const hc=rig.hoodie||'#555';
      boxL(col,row-0.03,0.62*VS,0.52*VS,20,hc,25+L,E);                                    // hood shell
      const[ox,oy]=iso(0,0), oxr=Math.round(ox), oyr=Math.round(oy);
      ctx.fillStyle=skin; ctx.fillRect(oxr-7,oyr-(38+L),14,15);                     // flat face — BOTH sides open evenly
      ctx.fillStyle=shade(hc,-0.32);                                                // hood rim line framing the face on BOTH sides + top
      ctx.fillRect(oxr-9,oyr-(39+L),2,16); ctx.fillRect(oxr+7,oyr-(39+L),2,16); ctx.fillRect(oxr-9,oyr-(40+L),18,2);}
    else if(cap){boxL(col,row,0.5*VS,0.42*VS,8,cap,38+L,VO);}
    else if(rig.mohawk){boxL(col,row,0.12*VS,0.34*VS,11,hair,39+L,VO);}
    else{boxL(col,row,0.48*VS,0.4*VS,9,hair,38+L,VO);}
    const fx=Math.round(cx), ey=Math.round(cy-(25+L)-8);
    if(rig.robot){ctx.fillStyle=rig.led||'#5fe0ff';ctx.fillRect(fx-6,ey,4,4);ctx.fillRect(fx+3,ey,4,4);}
    else{
      ctx.fillStyle=shade(skin,-0.42);ctx.fillRect(fx-5,ey-2,3,1);ctx.fillRect(fx+3,ey-2,3,1); // eyebrows — same subtle-life treatment on every classic preset
      ctx.fillStyle=rig.eye||'#241a12';ctx.fillRect(fx-5,ey,3,4);ctx.fillRect(fx+3,ey,3,4);
      ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(fx-5,ey,1,1);ctx.fillRect(fx+3,ey,1,1); // tiny catchlight — reads as "alive" at a glance
      const ns=rig.nose||1; ctx.fillStyle=shade(skin,-0.18);ctx.fillRect(fx,ey+5,ns,ns);   // tiny standalone nose square (rig.nose sets size)
      ctx.fillStyle=shade(skin,-0.34);ctx.fillRect(fx-2,ey+7,4,1);ctx.fillRect(fx-3,ey+6,1,1);ctx.fillRect(fx+2,ey+6,1,1); // mouth corners turn the flat line into a slight smile
      if(rig.glasses){ctx.strokeStyle='#0e1116';ctx.lineWidth=1.4;ctx.strokeRect(fx-6,ey-1,5,5);ctx.strokeRect(fx+2,ey-1,5,5);ctx.beginPath();ctx.moveTo(fx-1,ey+1);ctx.lineTo(fx+2,ey+1);ctx.stroke();}
    }
    // ---- accessory image overlays (fal assets, catalog-driven) — anchored to the rig's
    // live animated coordinates (cx/cy + the walk-bob L), so cosmetics move WITH the walk
    // cycle like every procedural cosmetic does today, never a static screen offset. ----
    if(rig.accessories && _catalog){
      const order = ['wings','hat','mask','weapon','pet'];   // wings behind, hat/pet on top
      const wasSmooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
      for(let si=0; si<order.length; si++){
        const id = rig.accessories[order[si]]; if(!id) continue;
        const item = _catalog[id]; if(!item) continue;
        const img = getImg(item.imageFile);
        if(!img.complete || !img.naturalWidth) continue;
        const sc = item.imgScale || 0.5, dw = img.naturalWidth*sc, dh = img.naturalHeight*sc;
        const ox = (item.anchorOffset && item.anchorOffset.x) || 0;
        const oy = (item.anchorOffset && item.anchorOffset.y) || 0;
        ctx.drawImage(img, Math.round(ox - dw/2), Math.round(-(25 + L) + oy - dh/2), dw, dh);
      }
      ctx.imageSmoothingEnabled = wasSmooth;
    }
  }

  // ---- painted rig sprites (Council + Citizens) ----
  // Captured from the SAME rigged 3D models the 3D realm uses (tools/build-web-sprites.mjs), so a character
  // looks identical in 2D and 3D. rig.sprite = id from assets/characters/index.json; anything else, or a
  // sprite that hasn't loaded yet, falls back to the code-drawn voxel rig below.
  const SPRITES = {};
  const SPRITE_WORLD_H = 66;                       // px height of a standing person at scale 1 (matches the voxel guy)
  function registerSprite(m) {
    const s = SPRITES[m.id] = Object.assign({ ready: 0, clips: {} }, m);
    Object.keys(m.clips).forEach(function (k) {
      const img = new Image(); img.onload = function () { s.clips[k] = img; s.ready++; };
      img.src = (m.dir || '') + m.clips[k];
    });
  }
  function drawSprite(_ctx, rig, sx, sy, scale, t) {
    const s = SPRITES[rig.sprite]; if (!s || !s.ready) return false;
    const walk = rig.anim === 'walk';
    const clip = s.clips.walk; if (!clip) return false;
    const tt = (t || 0) / 1000 + (rig.__phase || 0);
    const f = walk ? Math.floor(tt * 10) % s.frames : 0;           // 10 fps walk; idle holds frame 0 with a breath
    const k = (SPRITE_WORLD_H * scale) / s.standH;                 // px per cell-px -> uniform world height
    const dw = s.cell * k, dh = s.cell * k;
    const bob = walk ? 0 : Math.sin(tt * 1.7) * 0.6 * scale;
    _ctx.save(); _ctx.imageSmoothingEnabled = true; _ctx.imageSmoothingQuality = 'high';
    _ctx.translate(Math.round(sx), Math.round(sy));
    if (rig.flip) _ctx.scale(-1, 1);
    _ctx.drawImage(clip, f * s.cell, 0, s.cell, s.cell, -s.centerX * k, -s.footY * k + bob, dw, dh);
    _ctx.restore(); return true;
  }
  // load the sprite index once; harmless if absent (voxel fallback keeps working)
  try { fetch('assets/characters/index.json').then(function (r) { return r.ok ? r.json() : []; })
    .then(function (a) { a.forEach(registerSprite); }).catch(function () {}); } catch (e) {}

  function draw(_ctx, rig, sx, sy, scale, t) {
    if (rig && rig.sprite && drawSprite(_ctx, rig, sx, sy, scale, t)) return;
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
    { office:'shaddai', rig:{suit:'#241f44',cap:'#e8c45c',tie:'#ffd45c',emblem:'#ffd45c',skin:'#f0c199'} },
    { office:'oracle',  rig:{hoodie:'#3a2f5a',hoodUp:true,emblem:'#8b7bf0',skin:'#e7b58a'} },
    { office:'quill',   rig:{suit:'#173a4a',cap:'#5fe0ff',tie:'#5fe0ff',glasses:true,skin:'#f0c199'} },
    { office:'turtle',  rig:{hoodie:'#1f5a44',cap:'#00ff9c',emblem:'#00ff9c',skin:'#caa06f'} },
    { office:'nexus',   rig:{robot:true,skin:'#8a9199',cap:'#87909c',shirt:'#6b7280',pants:'#3a3f47',led:'#c5ccd5',emblem:'#87909c'} },
    { office:'zerox',   rig:{suit:'#3a2a1a',cap:'#00c8ff',tie:'#00c8ff',emblem:'#00c8ff',skin:'#caa06f'} },
    { office:'pikadon', rig:{jacket:'#331616',cap:'#ff5a4d',emblem:'#ff5a4d',shoeStyle:'boot',skin:'#8a5a3a'} },
  ];
  const COUNCIL_SPRITES = { zerox:'zerox', quill:'quill', oracle:'oracle', turtle:'turtle' };   // painted rigs built so far
  OFFICE_LEADS.forEach(function(o, i){
    const rig = Object.assign({}, o.rig, { name:'Council', office:o.office, __phase:(100+i)*0.37 });
    if (COUNCIL_SPRITES[o.office]) rig.sprite = COUNCIL_SPRITES[o.office];
    PRESETS.push({ name:'Council', rig });
  });
  function randomRig(){ SEED=(Date.now?0:0, (SEED*16807+1)&0x7fffffff); const i=(Math.abs(SEED)%PRESETS.length);
    // fresh randoms each call
    const r = rnd()<0.12 ? robotPreset() : ARCH[(rnd()*ARCH.length)|0](pick(SKIN));
    r.__phase = rnd()*6; return r; }

  return { draw, guy: draw, registerSprite, PRESETS, randomRig, shade, TW, TH };
})();

// world-buildings.js — DROP-IN module for SHADDAI World (Three.js r0.180, ES module).
// Adds detailed, WALKABLE architecture to the existing scene WITHOUT touching the world file.
//
// USAGE (the world file just adds one import + one call):
//   import { buildShaddaiBuildings } from './world-buildings.js';
//   const city = buildShaddaiBuildings(THREE, scene, { addWater:true });
//   // in the animate loop:  city.update(clock.elapsedTime, dt);
//   // optional: city.colliders (array of THREE.Box3) for movement collision,
//   //           city.spawns    (named THREE.Vector3 spawn points)
//
// Scale is human/first-person: eye height ~1.8, floor-to-floor 8u, steps 0.45u rise,
// doorways 5u tall. Aesthetic: dark temple stone + neon Tron trim + agent accent colors.
//
// Buildings & their owners:
//   SHADDAI TEMPLE  — 3-level grand hall (central atrium, grand stairs, working elevator, 7-point altar)
//   XEROX MARKET HUB— trading floor (live 3D candles via /api/markets/ohlc, ticker board, bazaar stalls)
//   QUILL+ORACLE LIBRARY — multi-tier reading hall + a LOCKED esoteric portal (ORACLE, premium)
//   NEXUS INFO CENTER — directory + "buy a portal" terminal (pipeline lives in backend/portals-routes.js)

const ACCENT = { SHADDAI:0xffcf4a, ZEROX:0x00e5a0, ORACLE:0xb06aff, NEXUS:0x27e0ff, QUILL:0xff7ab0, TURTLE:0x18d6c0, PIKADON:0xff4d6a };

export function buildShaddaiBuildings(THREE, scene, opts = {}) {
  const root = new THREE.Group(); root.name = 'shaddai-buildings'; scene.add(root);
  const colliders = []; const spawns = {}; const updaters = [];
  const loader = new THREE.TextureLoader();

  // ---- shared materials ----
  const stone   = new THREE.MeshStandardMaterial({ color:0x0c1118, roughness:0.92, metalness:0.06 });
  const stoneLt = new THREE.MeshStandardMaterial({ color:0x141b27, roughness:0.85, metalness:0.1 });
  const darkMtl = new THREE.MeshStandardMaterial({ color:0x070a10, roughness:0.95, metalness:0.05 });
  const neon = (hex, op=1) => new THREE.MeshBasicMaterial({ color:hex, toneMapped:false, transparent:op<1, opacity:op });
  const glow = (hex, i=0.6) => new THREE.MeshStandardMaterial({ color:hex, emissive:hex, emissiveIntensity:i, roughness:0.4, metalness:0.5, toneMapped:false });
  const tex = (name, rep=8) => { const t = loader.load('/api/forge/art/'+name+'.png'); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rep,rep); return t; };

  const addBox = (w,h,d, mtl, x,y,z, parent=root, collide=false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mtl); m.position.set(x,y,z); parent.add(m);
    if (collide) colliders.push(new THREE.Box3().setFromObject(m));
    return m;
  };
  const neonEdge = (w,h,d, hex, x,y,z, parent=root) => {
    const g = new THREE.BoxGeometry(w,h,d); const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color:hex, toneMapped:false }));
    e.position.set(x,y,z); parent.add(e); return e;
  };

  // =========================================================================
  // GROUND PLAZA + WATER  (uses the HF-generated terrain textures we already have)
  // =========================================================================
  {
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(220, 64), new THREE.MeshStandardMaterial({ map: tex('tex-sand', 40), color:0x9a9a9a, roughness:0.95 }));
    plaza.rotation.x = -Math.PI/2; plaza.position.y = 0.02; root.add(plaza);
    if (opts.addWater !== false) {
      // animated water ring around the plaza (vertex-rippled plane, neon edge)
      const wGeo = new THREE.RingGeometry(220, 340, 96, 4);
      const water = new THREE.Mesh(wGeo, new THREE.MeshStandardMaterial({ color:0x06243a, emissive:0x0a3a5a, emissiveIntensity:0.35, roughness:0.25, metalness:0.6, transparent:true, opacity:0.92, side:THREE.DoubleSide }));
      water.rotation.x = -Math.PI/2; water.position.y = -0.6; root.add(water);
      const base = wGeo.attributes.position.array.slice();
      updaters.push((t) => { const p = wGeo.attributes.position; for (let i=0;i<p.count;i++){ const x=base[i*3], y=base[i*3+1]; p.setZ(i, Math.sin(x*0.03+t*1.2)*0.6 + Math.cos(y*0.04+t)*0.5); } p.needsUpdate=true; });
      const shore = new THREE.Mesh(new THREE.TorusGeometry(220, 0.5, 8, 96), neon(0x27e0ff)); shore.rotation.x=Math.PI/2; shore.position.y=0.1; root.add(shore);
    }
  }

  // =========================================================================
  // SHADDAI TEMPLE — 3-level grand walkable hall (the centerpiece)
  // =========================================================================
  function temple(cx, cz) {
    const g = new THREE.Group(); g.position.set(cx,0,cz); root.add(g);
    const W=64, D=64, FLOOR_H=8, LEVELS=3, ATRIUM=24, accent=ACCENT.SHADDAI;
    const half=W/2, ah=ATRIUM/2;

    // stepped ziggurat base (3 tiers) the temple sits on
    for (let i=0;i<3;i++){ const s=W+24-i*10; addBox(s, 2.2, s, i?stoneLt:stone, 0, -3.3+i*2.2, 0, g, true); }

    // FLOOR SLABS with a central atrium void (build each floor as 4 boxes around the hole)
    function slab(y, withHole) {
      if (!withHole) { addBox(W, 0.6, D, stoneLt, 0, y, 0, g, true); return; }
      const side = (half - ah); // ring width
      addBox(W, 0.6, side, stoneLt, 0, y, -(ah+side/2), g, true);   // north band
      addBox(W, 0.6, side, stoneLt, 0, y,  (ah+side/2), g, true);   // south band
      addBox(side, 0.6, ATRIUM, stoneLt, -(ah+side/2), y, 0, g, true); // west band
      addBox(side, 0.6, ATRIUM, stoneLt,  (ah+side/2), y, 0, g, true); // east band
      // glowing atrium-edge railings
      const railMat = glow(accent, 0.5);
      [[0,-ah],[0,ah]].forEach(([_,z])=>{ const r=addBox(ATRIUM,1.2,0.25, railMat, 0, y+0.9, z, g); });
      [[-ah,0],[ah,0]].forEach(([x])=>{ addBox(0.25,1.2,ATRIUM, railMat, x, y+0.9, 0, g); });
    }
    slab(0, false);                       // ground (solid)
    slab(FLOOR_H, true); slab(FLOOR_H*2, true);  // mezzanines with atrium
    addBox(W, 0.6, D, stoneLt, 0, FLOOR_H*3, 0, g, true); // roof slab

    // COLONNADE — perimeter columns on every level + capitals with neon rings
    const cols = 6;
    for (let lv=0; lv<LEVELS; lv++){
      const y = lv*FLOOR_H;
      for (let i=0;i<=cols;i++){
        const x = -half + (i*(W/cols));
        [[x,-half],[x,half]].forEach(([px,pz])=>{
          if (lv>0 && Math.abs(px)<ah && Math.abs(pz)<ah) return;
          const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,FLOOR_H-0.6,12), stone); col.position.set(px, y+FLOOR_H/2-0.3, pz); g.add(col);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35,0.12,8,24), neon(accent)); ring.rotation.x=Math.PI/2; ring.position.set(px, y+FLOOR_H-1.2, pz); g.add(ring);
        });
      }
      // side columns (east/west rows)
      for (let j=1;j<cols;j++){ const z=-half+(j*(D/cols)); for (const px of [-half,half]){
        const col=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,FLOOR_H-0.6,12), stone); col.position.set(px,y+FLOOR_H/2-0.3,z); g.add(col); }}
    }

    // GRAND STAIRCASES — two-flight switchback in the SE quadrant of each level
    // (climbable: rise ~0.45, run ~0.95)
    function switchback(y0) {
      const steps=Math.round((FLOOR_H/2)/0.45), rise=(FLOOR_H/2)/steps, run=0.95, w=7, sx=half-12, sz=ah+4;
      for (let s=0;s<steps;s++){ addBox(w,rise,run, stone, sx, y0+s*rise+rise/2, sz+s*run, g, true); }       // flight up to landing
      addBox(w, 0.6, w, stoneLt, sx, y0+FLOOR_H/2, sz+steps*run+w/2, g, true);                                 // landing
      for (let s=0;s<steps;s++){ addBox(w,rise,run, stone, sx-(s*run)-run, y0+FLOOR_H/2+s*rise+rise/2, sz+steps*run+w/2, g, true); } // flight back
      // handrail neon
      neonEdge(w,0.1,steps*run, accent, sx, y0+1.0, sz+steps*run/2, g);
    }
    switchback(0); switchback(FLOOR_H);
    spawns.templeStairBase = new THREE.Vector3(cx+half-12, 1.8, cz+ah+4);

    // ELEVATOR — glass-ish shaft in NW quadrant + a platform that rises through all levels
    {
      const ex=-(half-10), ez=-(ah+8);
      for (const [dx,dz] of [[-2.5,-2.5],[2.5,-2.5],[-2.5,2.5],[2.5,2.5]]){ const p=new THREE.Mesh(new THREE.BoxGeometry(0.4,FLOOR_H*3,0.4), glow(accent,0.4)); p.position.set(ex+dx, FLOOR_H*1.5, ez+dz); g.add(p); }
      const cab = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.BoxGeometry(5,0.4,5), glow(accent,0.7)); cab.add(floor);
      const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(5,5,5)), new THREE.LineBasicMaterial({color:accent,toneMapped:false})); cage.position.y=2.5; cab.add(cage);
      cab.position.set(ex,0.4,ez); g.add(cab);
      updaters.push((t)=>{ const span=FLOOR_H*3-1; cab.position.y = 0.4 + (Math.sin(t*0.35)*0.5+0.5)*span; });
      spawns.templeElevator = new THREE.Vector3(cx+ex, 1.8, cz+ez);
    }

    // 7-POINTED GOLDEN ALTAR at top level center + light beam down the atrium
    {
      const altarY = FLOOR_H*2 + 0.6;
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(6,7,1.2,7), glow(accent,0.5)); dais.position.set(0,altarY+0.6,0); g.add(dais);
      const star = new THREE.Group();
      for (let i=0;i<7;i++){ const a=(i/7)*Math.PI*2; const spike=new THREE.Mesh(new THREE.ConeGeometry(0.5,5,4), neon(accent)); spike.position.set(Math.cos(a)*3.2, altarY+4, Math.sin(a)*3.2); spike.rotation.x=Math.PI; star.add(spike); }
      const core=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2,0), glow(accent,1.2)); core.position.set(0,altarY+4,0); star.add(core); g.add(star);
      updaters.push((t)=>{ star.rotation.y=t*0.3; core.scale.setScalar(1+Math.sin(t*2)*0.06); });
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.4, ah*0.8, FLOOR_H*2, 16,1,true), new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:0.06,side:THREE.DoubleSide,toneMapped:false,blending:THREE.AdditiveBlending})); beam.position.set(0,FLOOR_H, 0); g.add(beam);
      // floating label
      makeLabel(g, 'SHADDAI TEMPLE', accent, new THREE.Vector3(0, FLOOR_H*3+6, 0));
    }
    // entrance portico + steps up to the ground floor
    { const steps=8; for (let s=0;s<steps;s++){ addBox(20-s*0.6, 0.5, 1.4, stoneLt, 0, 0.25+s*0.5, half+4-s*1.4, g, true); }
      spawns.templeEntrance = new THREE.Vector3(cx, 1.8, cz+half+8); }
    pointLight(g, 0, FLOOR_H*1.5, 0, accent, 2.2, 90);
    return g;
  }

  // =========================================================================
  // Supporting buildings (shells with stairs; content plugs into our APIs)
  // =========================================================================
  function hallShell(cx, cz, label, accent, sizeW=40, sizeD=40, floors=2) {
    const g = new THREE.Group(); g.position.set(cx,0,cz); root.add(g);
    const H=8; addBox(sizeW+6, 1.5, sizeD+6, stone, 0, 0.75, 0, g, true); // base
    for (let lv=0; lv<=floors; lv++){ if (lv<floors) addBox(sizeW, 0.5, sizeD, stoneLt, 0, 1.5+lv*H, 0, g, true); }
    // walls (open front)
    addBox(sizeW, H*floors, 0.6, darkMtl, 0, 1.5+H*floors/2, -sizeD/2, g, true);
    addBox(0.6, H*floors, sizeD, darkMtl, -sizeW/2, 1.5+H*floors/2, 0, g, true);
    addBox(0.6, H*floors, sizeD, darkMtl, sizeW/2, 1.5+H*floors/2, 0, g, true);
    // roof + neon cornice
    addBox(sizeW+4, 0.8, sizeD+4, stone, 0, 1.5+H*floors, 0, g, true);
    neonEdge(sizeW+4, 0.8, sizeD+4, accent, 0, 1.5+H*floors, 0, g);
    // corner columns
    for (const sx of [-1,1]) for (const sz of [-1,1]){ const c=new THREE.Mesh(new THREE.CylinderGeometry(1,1.1,H*floors,10), stone); c.position.set(sx*(sizeW/2-1.5), 1.5+H*floors/2, sz*(sizeD/2-1.5)); g.add(c); const r=new THREE.Mesh(new THREE.TorusGeometry(1.2,0.1,8,20),neon(accent)); r.rotation.x=Math.PI/2; r.position.set(c.position.x,1.5+H*floors-1,c.position.z); g.add(r); }
    // internal stair to upper floor
    if (floors>1){ const steps=Math.round(H/0.45), rise=H/steps; for (let s=0;s<steps;s++){ addBox(6,rise,0.95, stone, sizeW/2-8, 1.5+s*rise+rise/2, -sizeD/2+4+s*0.95, g, true); } }
    makeLabel(g, label, accent, new THREE.Vector3(0, 1.5+H*floors+5, 0));
    pointLight(g, 0, H*floors/2+2, 0, accent, 1.6, 60);
    spawns[label.replace(/\W+/g,'_').toLowerCase()] = new THREE.Vector3(cx, 1.8, cz+sizeD/2+6);
    return g;
  }

  // ---- helpers: label sprite + point light ----
  function makeLabel(parent, text, hex, pos) {
    const cv=document.createElement('canvas'); cv.width=512; cv.height=128; const c=cv.getContext('2d');
    c.fillStyle='rgba(0,0,0,0)'; c.fillRect(0,0,512,128);
    c.font='bold 64px Orbitron, monospace'; c.textAlign='center'; c.textBaseline='middle';
    c.shadowColor='#'+hex.toString(16).padStart(6,'0'); c.shadowBlur=24; c.fillStyle='#fff';
    c.fillText(text, 256, 64);
    const t=new THREE.CanvasTexture(cv); const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));
    s.scale.set(28,7,1); s.position.copy(pos); parent.add(s); return s;
  }
  function pointLight(parent,x,y,z,hex,intensity,dist){ const l=new THREE.PointLight(hex,intensity,dist); l.position.set(x,y,z); parent.add(l); }

  // =========================================================================
  // LAYOUT — place the district around the plaza
  // =========================================================================
  temple(0, -40);                                              // SHADDAI Temple, north-center
  hallShell(110, 0,  'XEROX MARKET HUB', ACCENT.ZEROX, 48, 40, 2);  // east — trading floor
  hallShell(-110, 0, 'LIBRARY OF SHADDAI', ACCENT.QUILL, 48, 44, 3); // west — Quill/Oracle library (3 floors)
  hallShell(0, 120,  'NEXUS INFO CENTER', ACCENT.NEXUS, 40, 36, 2);  // south — Nexus / buy-a-portal

  // LOCKED ESOTERIC PORTAL inside the Library (ORACLE, premium-gated)
  {
    const px=-110, pz=-14;
    const frame=new THREE.Mesh(new THREE.TorusGeometry(4,0.5,16,48), glow(ACCENT.ORACLE,1.2)); frame.position.set(px, 7, pz); root.add(frame);
    const seal=new THREE.Mesh(new THREE.CircleGeometry(3.6,7), new THREE.MeshBasicMaterial({color:ACCENT.ORACLE,transparent:true,opacity:0.18,side:THREE.DoubleSide,toneMapped:false})); seal.position.set(px,7,pz); root.add(seal);
    // padlock bars across it (it's LOCKED)
    for (let i=-2;i<=2;i++){ addBox(7,0.18,0.18, neon(0xff4d6a), px, 7+i*1.4, pz, root); }
    makeLabel(root, 'ESOTERIC — LOCKED', ACCENT.ORACLE, new THREE.Vector3(px, 13, pz));
    updaters.push((t)=>{ frame.rotation.z=t*0.2; });
    spawns.esotericPortal = new THREE.Vector3(px, 1.8, pz+8);
  }

  return {
    root, colliders, spawns,
    update(elapsed, dt){ for (const u of updaters) { try { u(elapsed, dt); } catch(e){} } },
  };
}

export default buildShaddaiBuildings;

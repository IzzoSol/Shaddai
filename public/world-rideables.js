// world-rideables.js — RIDEABLE Meshy voyager vehicles for SHADDAI World (ES module).
//   CRAFT (Slipstream) → flies: WASD horizontal, Space up, Shift down, no ground clamp.
//   ROVER (Arctic)     → drives fast on the terrain.
//   Press G near a parked vehicle to board; G again to dismount (parks where you are).
//
// Integration (the world file does ~5 tiny VEHICLE-HOOK edits):
//   import { initRideables } from './world-rideables.js';
//   const veh = initRideables({ THREE, scene, GLTFLoader, playerPos, keys, getGroundY, setThirdPerson });
//   // in animate movement:  sp = veh.speed(base)*dt;  veh.flyControl(<sp/dt>, dt);
//   //                        const baseY = veh.baseY(groundY);  // camera + avatar y
//   //                        veh.update(dt, fwd);

export function initRideables({ THREE, scene, GLTFLoader, playerPos, keys, getGroundY, setThirdPerson }) {
  const loader = new GLTFLoader();
  const VEHICLES = {
    rover: { url: '/assets/vehicles/rover.glb', name: 'ARCTIC ROVER', size: 7, park: new THREE.Vector3(34, 0, 18), speed: 46, fly: false, model: null, yOff: 0, faceOffset: Math.PI / 2 },
    craft: { url: '/assets/vehicles/craft.glb', name: 'SLIPSTREAM',   size: 9, park: new THREE.Vector3(-34, 0, 22), speed: 72, fly: true,  model: null, yOff: 0, faceOffset: 0 },
  };
  const veh = { mode: null, flyY: 0 };
  const gy = (x, z) => (getGroundY ? getGroundY(x, z) : 0);

  for (const key of Object.keys(VEHICLES)) {
    const v = VEHICLES[key];
    loader.load(v.url, (g) => {
      const m = g.scene;
      m.traverse(o => { if (o.isMesh && o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; });
      const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
      m.scale.multiplyScalar(v.size / Math.max(sz.x, sz.y, sz.z, 0.001));
      v.yOff = -new THREE.Box3().setFromObject(m).min.y;
      m.position.set(v.park.x, gy(v.park.x, v.park.z) + v.yOff, v.park.z);
      scene.add(m); v.model = m;
    }, undefined, (e) => console.warn('[rideables] failed', key, e.message));
  }

  const hint = document.createElement('div');
  hint.style.cssText = "position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:22;font-family:'Orbitron',sans-serif;font-size:12px;letter-spacing:2px;color:#27e0ff;text-shadow:0 0 12px #27e0ff;display:none;pointer-events:none";
  document.body.appendChild(hint);

  const nearestParked = () => {
    let best = null, bd = 13 * 13;
    for (const key of Object.keys(VEHICLES)) { const v = VEHICLES[key]; if (!v.model || veh.mode === key) continue;
      const d = (playerPos.x - v.model.position.x) ** 2 + (playerPos.z - v.model.position.z) ** 2; if (d < bd) { bd = d; best = key; } }
    return best;
  };

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyG') return;
    if (veh.mode) {                                   // dismount → park here
      const v = VEHICLES[veh.mode]; if (v.model) v.model.position.set(playerPos.x, gy(playerPos.x, playerPos.z) + v.yOff, playerPos.z);
      veh.mode = null; setThirdPerson && setThirdPerson(false);
    } else {                                          // board the nearest
      const key = nearestParked(); if (!key) return;
      veh.mode = key; setThirdPerson && setThirdPerson(true);
      if (VEHICLES[key].fly) veh.flyY = gy(playerPos.x, playerPos.z) + 10;
    }
  });

  return {
    get mode() { return veh.mode; },
    get flyY() { return veh.flyY; }, set flyY(y) { veh.flyY = y; },
    speed(base) { return veh.mode ? VEHICLES[veh.mode].speed : base; },           // VEHICLE-HOOK: speed
    flyControl(spPerSec, dt) {                                                     // VEHICLE-HOOK: up/down when flying
      if (veh.mode !== 'craft') return; const s = spPerSec * dt;
      if (keys['Space']) veh.flyY += s;
      if (keys['ShiftLeft'] || keys['ShiftRight']) veh.flyY = Math.max(0, veh.flyY - s);
    },
    baseY(groundY) { return veh.mode === 'craft' ? veh.flyY : groundY; },          // VEHICLE-HOOK: camera/avatar y
    update(dt, fwd) {
      if (veh.mode) {
        const v = VEHICLES[veh.mode];
        if (v.model) { const by = veh.mode === 'craft' ? veh.flyY : gy(playerPos.x, playerPos.z);
          v.model.position.set(playerPos.x, by + v.yOff, playerPos.z); v.model.rotation.y = Math.atan2(fwd.x, fwd.z) + (v.faceOffset || 0); }
        hint.style.display = 'block';
        hint.textContent = '◄ ' + VEHICLES[veh.mode].name + ' ►   [G] dismount' + (v.fly ? '   SPACE/SHIFT = up/down' : '');
      } else {
        const key = nearestParked();
        if (key) { hint.style.display = 'block'; hint.textContent = '[G] board the ' + VEHICLES[key].name; }
        else hint.style.display = 'none';
      }
    },
  };
}

export default initRideables;

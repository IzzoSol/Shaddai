// world-rideables.js — RIDEABLE Meshy voyager vehicles for SHADDAI World (ES module) — v2 polished
//   CRAFT (Slipstream) → flies: WASD horizontal, Space up, Shift down; banks on turns, hover-bobs, cyan trail.
//   ROVER (Arctic)     → drives fast on the terrain with smooth acceleration.
//   Press G near a parked vehicle to board; G again to dismount (parks where you are).
//
// Integration (the world file calls five hooks each frame):
//   import { initRideables } from './world-rideables.js';
//   const veh = initRideables({ THREE, scene, GLTFLoader, playerPos, keys, getGroundY, setThirdPerson });
//   sp = veh.speed(base) * dt;   veh.flyControl(sp/dt, dt);
//   const baseY = veh.baseY(groundY);
//   veh.update(dt, fwd);

export function initRideables({ THREE, scene, GLTFLoader, playerPos, keys, getGroundY, setThirdPerson }) {

  // ─── Vehicle definitions ──────────────────────────────────────────────────
  const VEHICLES = {
    rover: {
      url: '/assets/vehicles/rover.glb', name: 'ARCTIC ROVER',
      size: 7,  park: new THREE.Vector3(34, 0, 18),  speed: 46,
      fly: false, model: null, yOff: 0, faceOffset: Math.PI / 2,
      glowColor: 0x00aaff, glowIntensity: 2.5, glowLight: null,
    },
    craft: {
      url: '/assets/vehicles/craft.glb', name: 'SLIPSTREAM',
      size: 9,  park: new THREE.Vector3(-34, 0, 22), speed: 72,
      fly: true,  model: null, yOff: 0, faceOffset: 0,
      glowColor: 0x27e0ff, glowIntensity: 3.5, glowLight: null,
    },
  };

  // ─── Internal state — all primitives, no per-frame object creation ────────
  const veh = {
    mode: null,
    flyY: 0,
    speedFactor: 0,   // 0→1 smooth acceleration ramp
    bankAngle: 0,     // current roll (craft only, radians)
    bobTime: 0,       // accumulates for sinusoidal hover bob
    lastHeading: 0,   // previous frame yaw for Δheading
    turnRate: 0,      // low-passed angular velocity (rad/s)
  };

  const gy = (x, z) => (getGroundY ? getGroundY(x, z) : 0);

  // ─── Trail — pre-allocated buffers, zero allocations in the hot path ──────
  const TRAIL_LEN   = 28;
  const _trailBuf   = new Float32Array(TRAIL_LEN * 3); // ring-buffer storage
  const _trailOrder = new Float32Array(TRAIL_LEN * 3); // re-ordered for draw
  const trailGeo    = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(_trailOrder, 3));
  const trailMat  = new THREE.LineBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.42, depthWrite: false });
  const trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.frustumCulled = false;
  trailLine.visible = false;
  scene.add(trailLine);
  let _trailHead  = 0;
  let _trailTimer = 0;
  const TRAIL_INTERVAL = 0.055; // seconds between trail samples

  // ─── Shared mount path — used by GLB success AND procedural fallback ─────
  function mount(key, m) {
    const v = VEHICLES[key];
    const box = new THREE.Box3().setFromObject(m);
    const sz  = box.getSize(new THREE.Vector3());
    m.scale.multiplyScalar(v.size / Math.max(sz.x, sz.y, sz.z, 0.001));
    const box2 = new THREE.Box3().setFromObject(m);
    v.yOff = -box2.min.y;
    m.position.set(v.park.x, gy(v.park.x, v.park.z) + v.yOff, v.park.z);

    const glow = new THREE.PointLight(v.glowColor, 0.6, v.size * 4.5);
    glow.position.set(0, v.size * 0.15, -v.size * 0.35);
    m.add(glow);
    v.glowLight = glow;

    scene.add(m);
    v.model = m;
  }

  // ─── Procedural neon fallback models (GLB absent/failed) ─────────────────
  const hullMat  = new THREE.MeshStandardMaterial({ color: 0x0a1a33, roughness: 0.4, metalness: 0.7 });
  const trimMat  = new THREE.MeshStandardMaterial({ color: 0x27e0ff, roughness: 0.25, metalness: 0.5, emissive: 0x27e0ff, emissiveIntensity: 0.55 });
  const lampMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 1.1 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 0.9 });

  function buildFallback(key) {
    const g = new THREE.Group();
    if (key === 'rover') {
      const body   = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.5, 5.2), hullMat);  body.position.set(0, 1.3, 0);
      const cab    = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 2.3), trimMat);   cab.position.set(0, 2.35, -0.3);
      const win    = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.15), lampMat);  win.position.set(0, 2.5, 1.05);
      const tL     = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 5.6), darkMat);   tL.position.set(-2.0, 0.75, 0);
      const tR     = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 5.6), darkMat);   tR.position.set( 2.0, 0.75, 0);
      const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.15), lampMat); lightL.position.set(-0.85, 1.35, 2.65);
      const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.15), lampMat); lightR.position.set( 0.85, 1.35, 2.65);
      g.add(body, cab, win, tL, tR, lightL, lightR);
    } else {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 6.4), hullMat); hull.position.set(0, 1.1, 0);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.0, 4), trimMat);   nose.rotation.y = Math.PI / 4; nose.rotation.x = -Math.PI / 2; nose.position.set(0, 1.1, -4.1);
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.4), trimMat); wingL.position.set(-3.0, 0.9, 1.2);
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.4), trimMat); wingR.position.set( 3.0, 0.9, 1.2);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.8), lampMat); canopy.position.set(0, 1.85, 0.2);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 1.6), trimMat); fin.position.set(0, 1.8, 3.0);
      g.add(hull, nose, wingL, wingR, canopy, fin);
    }
    return g;
  }

  // ─── Load GLB models and attach engine-glow PointLights ──────────────────
  const loader = new GLTFLoader();
  for (const key of Object.keys(VEHICLES)) {
    const v = VEHICLES[key];
    loader.load(v.url, (g) => {
      const m = g.scene;
      m.traverse(o => {
        if (!o.isMesh || !o.material) return;
        if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
        // Gentle emissive lift so the craft reads at night
        if (o.material.emissive !== undefined) {
          o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity || 0, 0.12);
        }
      });
      mount(key, m);
    }, undefined, (e) => {
      console.warn('[rideables] GLB failed, using procedural fallback:', key, e.message);
      mount(key, buildFallback(key));
    });
  }

  // ─── HUD hint element ─────────────────────────────────────────────────────
  const hint = document.createElement('div');
  hint.style.cssText = [
    'position:fixed',
    'bottom:90px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:22',
    "font-family:'Orbitron',sans-serif",
    'font-size:13px',
    'letter-spacing:2.5px',
    'color:#27e0ff',
    'text-shadow:0 0 12px #27e0ff,0 0 30px #0a4880',
    'background:rgba(0,8,24,0.74)',
    'border:1px solid rgba(39,224,255,0.22)',
    'border-radius:7px',
    'padding:7px 20px',
    'display:none',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(hint);
  let _hintLast = null;

  function _setHint(text) {
    if (_hintLast === text) return; // skip DOM write if unchanged
    _hintLast = text;
    if (text) { hint.textContent = text; hint.style.display = 'block'; }
    else       { hint.style.display = 'none'; }
  }

  // ─── Nearest parked vehicle within boarding range ─────────────────────────
  const BOARD_RANGE_SQ = 13 * 13;
  const nearestParked = () => {
    let best = null, bd = BOARD_RANGE_SQ;
    for (const key of Object.keys(VEHICLES)) {
      const v = VEHICLES[key];
      if (!v.model || veh.mode === key) continue;
      const d = (playerPos.x - v.model.position.x) ** 2 + (playerPos.z - v.model.position.z) ** 2;
      if (d < bd) { bd = d; best = key; }
    }
    return best;
  };

  // ─── Board / dismount (G key) ─────────────────────────────────────────────
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyG') return;

    if (veh.mode) {
      // ── Dismount ───────────────────────────────────────────────────────
      const v = VEHICLES[veh.mode];
      if (v.model) {
        v.model.position.set(playerPos.x, gy(playerPos.x, playerPos.z) + v.yOff, playerPos.z);
        v.model.rotation.z = 0;    // clear any residual banking
        if (v.glowLight) v.glowLight.intensity = 0.6;  // idle glow when parked
      }
      trailLine.visible = false;
      veh.speedFactor  = 0;
      veh.bankAngle    = 0;
      veh.turnRate     = 0;
      veh.mode         = null;
      setThirdPerson && setThirdPerson(false);
    } else {
      // ── Board ──────────────────────────────────────────────────────────
      const key = nearestParked();
      if (!key) return;
      veh.mode = key;
      setThirdPerson && setThirdPerson(true);
      if (VEHICLES[key].fly) {
        veh.flyY    = gy(playerPos.x, playerPos.z) + 10;
        veh.bobTime = 0;
      }
      // Seed trail ring-buffer at current position so first draw is clean
      _trailHead  = 0;
      _trailTimer = 0;
      const m = VEHICLES[key].model;
      if (m) {
        for (let i = 0; i < TRAIL_LEN; i++) {
          _trailBuf[i * 3]     = m.position.x;
          _trailBuf[i * 3 + 1] = m.position.y;
          _trailBuf[i * 3 + 2] = m.position.z;
        }
      }
    }
  });

  // ─── Public controller — method names + signatures UNCHANGED ─────────────
  return {
    get mode() { return veh.mode; },
    get flyY() { return veh.flyY; },
    set flyY(y) { veh.flyY = y; },

    /**
     * VEHICLE-HOOK · speed(base)
     * Returns movement speed with smooth acceleration ramp blended in.
     * speedFactor is maintained in update(); at 0 (just boarded) this returns
     * base so the player doesn't teleport, then blends smoothly to full speed.
     */
    speed(base) {
      if (!veh.mode) return base;
      const v = VEHICLES[veh.mode];
      return base + (v.speed - base) * veh.speedFactor;
    },

    /**
     * VEHICLE-HOOK · flyControl(spPerSec, dt)
     * Vertical movement for the flying craft — Space = rise, Shift = descend.
     */
    flyControl(spPerSec, dt) {
      if (veh.mode !== 'craft') return;
      const s = spPerSec * dt;
      if (keys['Space'])                           veh.flyY += s;
      if (keys['ShiftLeft'] || keys['ShiftRight']) veh.flyY = Math.max(0, veh.flyY - s);
    },

    /**
     * VEHICLE-HOOK · baseY(groundY)
     * Returns the Y position the player/camera should use this frame.
     * For the craft adds a hover-bob offset (visual only, veh.flyY stays stable).
     */
    baseY(groundY) {
      if (veh.mode === 'craft') {
        return veh.flyY + Math.sin(veh.bobTime * 1.75) * 0.32;
      }
      return groundY;
    },

    /**
     * VEHICLE-HOOK · update(dt, fwd)
     * Moves the mesh to the player position, applies banking (craft), pulses the
     * engine glow, appends trail points (craft), and updates the HUD hint.
     * dt  — delta-time in seconds
     * fwd — normalised forward direction Vector3 (from the main animate loop)
     */
    update(dt, fwd) {
      // ── No vehicle mounted: idle glow + proximity hint ─────────────────
      if (!veh.mode) {
        trailLine.visible = false;
        for (const key of Object.keys(VEHICLES)) {
          const v = VEHICLES[key];
          if (v.glowLight) v.glowLight.intensity = 0.6;
        }
        const key = nearestParked();
        _setHint(key ? `[G]  BOARD  ${VEHICLES[key].name}` : null);
        return;
      }

      const v = VEHICLES[veh.mode];
      if (!v.model) return;

      // ── Acceleration ramp ──────────────────────────────────────────────
      //    ~0.6 s to reach full speed, ~0.4 s to coast back to 0
      const isMoving = (fwd.x * fwd.x + fwd.z * fwd.z) > 1e-5;
      veh.speedFactor = isMoving
        ? Math.min(1, veh.speedFactor + dt * 1.55)
        : Math.max(0, veh.speedFactor - dt * 2.3);

      // ── Bob timer ─────────────────────────────────────────────────────
      if (v.fly) veh.bobTime += dt;

      // ── Heading delta → smoothed turn-rate ────────────────────────────
      const heading = Math.atan2(fwd.x, fwd.z);
      let dH = heading - veh.lastHeading;
      if (dH >  Math.PI) dH -= Math.PI * 2; // wrap to -π..π
      if (dH < -Math.PI) dH += Math.PI * 2;
      const rawTurn = isMoving ? dH / Math.max(dt, 0.001) : 0;
      veh.turnRate    = veh.turnRate * 0.80 + rawTurn * 0.20; // low-pass
      veh.lastHeading = heading;

      // ── Banking on turns (craft only) ─────────────────────────────────
      //    Clamp roll to ±0.42 rad (~24°); lerp toward target at 5 Hz
      if (v.fly) {
        const targetBank = Math.max(-0.42, Math.min(0.42, -veh.turnRate * 0.26));
        veh.bankAngle   += (targetBank - veh.bankAngle) * Math.min(1, dt * 5.5);
        v.model.rotation.z = veh.bankAngle;
      }

      // ── Seat vehicle to player position ───────────────────────────────
      const modelY = v.fly
        ? veh.flyY + Math.sin(veh.bobTime * 1.75) * 0.32   // bob matches baseY()
        : gy(playerPos.x, playerPos.z);
      v.model.position.set(playerPos.x, modelY + v.yOff, playerPos.z);
      v.model.rotation.y = heading + (v.faceOffset || 0);

      // ── Engine-glow pulse ─────────────────────────────────────────────
      //    Pulses at ~4 Hz, intensity scales with speed so idle looks dim
      if (v.glowLight) {
        const pulse = 1 + Math.sin(veh.bobTime * 4.1) * 0.20;
        v.glowLight.intensity = v.glowIntensity * (0.38 + veh.speedFactor * 0.62) * pulse;
      }

      // ── Trail (craft only) ────────────────────────────────────────────
      if (v.fly) {
        trailLine.visible = veh.speedFactor > 0.08;
        _trailTimer += dt;
        if (_trailTimer >= TRAIL_INTERVAL) {
          _trailTimer = 0;
          // Write newest sample into ring buffer
          const idx = (_trailHead % TRAIL_LEN) * 3;
          _trailBuf[idx]     = v.model.position.x;
          _trailBuf[idx + 1] = v.model.position.y - 0.45; // trail sits below hull
          _trailBuf[idx + 2] = v.model.position.z;
          _trailHead = (_trailHead + 1) % TRAIL_LEN;
          // Re-order ring buffer oldest→newest into pre-allocated draw array
          for (let i = 0; i < TRAIL_LEN; i++) {
            const src = ((_trailHead + i) % TRAIL_LEN) * 3;
            const dst = i * 3;
            _trailOrder[dst]     = _trailBuf[src];
            _trailOrder[dst + 1] = _trailBuf[src + 1];
            _trailOrder[dst + 2] = _trailBuf[src + 2];
          }
          trailGeo.attributes.position.needsUpdate = true;
          trailGeo.setDrawRange(0, TRAIL_LEN);
        }
      } else {
        trailLine.visible = false;
      }

      // ── HUD hint ──────────────────────────────────────────────────────
      const extra = v.fly ? '   SPACE ▲  SHIFT ▼' : '';
      _setHint(`◄  ${v.name}  ►   [G] DISMOUNT${extra}`);
    },
  };
}

export default initRideables;

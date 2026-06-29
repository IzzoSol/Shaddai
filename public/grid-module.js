/* ════════════════════════════════════════════════════════════════════════
   SHADDAI WORLD — GRID MODULE (Slice 1)
   A Tron-styled explorable Grid: void floor, neon grid lines, UnrealBloom glow,
   WASD/arrow movement + mouse-drag look, and 3 agent-district arches whose
   proximity ("press E") opens the existing x402 payment modal in the dashboard.

   Loaded lazily by the GRID controller in the dashboard:  import('./grid-module.js')
   then m.initGrid(canvas).  Imports resolve via the <script type="importmap"> (unpkg, CSP-allowed).
   Exports: initGrid(canvas), pauseGrid(), resumeGrid(), disposeGrid()
   ════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const VOID = 0x020509;
const MOBILE = (navigator.maxTouchPoints || 0) > 0;

// District placeholders for Slice 1 — match the 2D fallback buttons (agent / colour / cost / position).
const DISTRICTS = [
  { agent: 'ZEROX',  color: 0xff7a18, cost: 0.50, x: -16, z: -12 },
  { agent: 'ORACLE', color: 0xb06aff, cost: 1.00, x:   0, z: -22 },
  { agent: 'NEXUS',  color: 0x00e5a0, cost: 0.75, x:  16, z: -12 },
];
const ENTER_RADIUS = 6;

let renderer, scene, camera, composer, clock;
let rafId = null, running = false, inited = false;
const keys = Object.create(null);
let yaw = 0, dragging = false, lastX = 0;
let nearest = null;          // district currently in range
const listeners = [];        // [target, type, fn] for clean disposal

function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); listeners.push([target, type, fn]); }

export function initGrid(canvas) {
  if (inited) { resumeGrid(); return; }
  canvas = canvas || document.getElementById('gridCanvas');
  if (!canvas) { console.warn('[grid] no canvas'); return; }
  inited = true;
  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID);
  scene.fog = new THREE.FogExp2(VOID, MOBILE ? 0.03 : 0.018);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.7, 10);

  // Lights (subtle — the look comes from emissive + bloom)
  scene.add(new THREE.AmbientLight(0x0a1830, 0.6));
  const key = new THREE.PointLight(0x00e5ff, 0.5, 120); key.position.set(0, 40, 0); scene.add(key);

  // Tron floor: coarse bright grid + fine dim grid
  const coarse = new THREE.GridHelper(400, 80, 0x00e5ff, 0x065563);
  coarse.material.transparent = true; coarse.material.opacity = 0.55; scene.add(coarse);
  const fine = new THREE.GridHelper(400, 400, 0x033b46, 0x022730);
  fine.material.transparent = true; fine.material.opacity = 0.25; fine.position.y = -0.01; scene.add(fine);

  // Central SHADDAI marker — a slow-spinning gold octahedron
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff5c0, wireframe: true, toneMapped: false });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), coreMat);
  core.position.set(0, 2.2, 0); core.name = 'core'; scene.add(core);

  // District arches
  DISTRICTS.forEach(d => scene.add(buildArch(d)));

  // Post-processing — bloom only catches bright emissive (threshold high)
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (!MOBILE) {
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.3, 0.5, 0.82);
    composer.addPass(bloom);
  }

  // Input
  on(window, 'keydown', e => { keys[e.code] = true; if (e.code === 'KeyE') tryEnter(); });
  on(window, 'keyup',   e => { keys[e.code] = false; });
  on(canvas, 'mousedown', e => { dragging = true; lastX = e.clientX; });
  on(window, 'mouseup',   () => { dragging = false; });
  on(window, 'mousemove', e => { if (dragging) { yaw -= (e.clientX - lastX) * 0.004; lastX = e.clientX; } });
  on(window, 'resize', onResize);

  running = true;
  loop();
}

function buildArch(d) {
  const g = new THREE.Group();
  g.name = 'district-' + d.agent;
  g.userData = d;
  const mat = new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false });
  const pillar = new THREE.BoxGeometry(0.4, 7, 0.4);
  const beam = new THREE.BoxGeometry(6.4, 0.4, 0.4);
  const L = new THREE.Mesh(pillar, mat); L.position.set(-3, 3.5, 0);
  const R = new THREE.Mesh(pillar, mat); R.position.set(3, 3.5, 0);
  const T = new THREE.Mesh(beam, mat);   T.position.set(0, 7, 0);
  g.add(L, R, T);
  // Floor ring marking the enter zone
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ENTER_RADIUS - 0.25, ENTER_RADIUS, 48),
    new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  g.position.set(d.x, 0, d.z);
  return g;
}

function tryEnter() {
  // Open the dashboard's existing x402 pay modal for the in-range district.
  if (!nearest) return;
  const modal = document.getElementById('gridPayModal');
  if (modal && modal.style.display === 'flex') return; // already open
  if (typeof window.gridEnterDistrict === 'function') {
    window.gridEnterDistrict({ dataset: { agent: nearest.agent, cost: String(nearest.cost) } });
  }
}

function updateMovement(dt) {
  const speed = (keys['ShiftLeft'] || keys['ShiftRight'] ? 26 : 11) * dt;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (keys['KeyW'] || keys['ArrowUp'])    camera.position.addScaledVector(fwd, speed);
  if (keys['KeyS'] || keys['ArrowDown'])  camera.position.addScaledVector(fwd, -speed);
  if (keys['KeyA'] || keys['ArrowLeft'])  camera.position.addScaledVector(right, -speed);
  if (keys['KeyD'] || keys['ArrowRight'])  camera.position.addScaledVector(right, speed);
  camera.position.y = 1.7;
  // Look in the yaw direction
  const look = camera.position.clone().add(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)));
  camera.lookAt(look);
}

function updateProximity() {
  nearest = null;
  let best = ENTER_RADIUS;
  for (const d of DISTRICTS) {
    const dist = Math.hypot(camera.position.x - d.x, camera.position.z - d.z);
    if (dist < best) { best = dist; nearest = d; }
  }
  const hint = document.getElementById('gridHUDHint');
  if (hint) {
    hint.textContent = nearest
      ? '▶ PRESS E TO ENTER ' + nearest.agent + ' — ' + nearest.cost.toFixed(2) + ' USDC'
      : 'WASD / arrows to move · drag to look · approach a district';
    hint.style.color = nearest ? '#00e5ff' : '#049494';
  }
}

function updateHUD() {
  const c = document.getElementById('gridHUDCoords');
  if (c) c.textContent = 'x:' + camera.position.x.toFixed(1) + ' z:' + camera.position.z.toFixed(1);
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function loop() {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  updateMovement(dt);
  updateProximity();
  updateHUD();
  const core = scene.getObjectByName('core');
  if (core) { core.rotation.y += dt * 0.6; core.rotation.x += dt * 0.2; core.position.y = 2.2 + Math.sin(t * 1.5) * 0.15; }
  composer.render();
}

export function pauseGrid() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
export function resumeGrid() { if (!inited) return; if (!running) { running = true; clock.getDelta(); loop(); } }
export function disposeGrid() {
  pauseGrid();
  listeners.forEach(([target, type, fn]) => target.removeEventListener(type, fn));
  listeners.length = 0;
  if (renderer) renderer.dispose();
  inited = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAIN HEAD — "look into an agent's mind" view for brain.html
//
// Composition (from the owner's reference set):
//   · armillary wireframe sphere      — the mind's shell, slow counter-rotation
//   · particle orb core               — the living energy behind the face
//   · agent head                      — Meshy-generated <AGENT>-head.glb when
//                                       present, else the council portrait on a
//                                       billboard so the view always works
//   · diagnostic HUD                  — corner brackets, sweep scanline, callout
//                                       leader-lines with live readouts
//   · genre ring                      — the agent's real topics as orbiting
//                                       nodes; click one to drill into it
//   · voxel burst                     — retrieved chunks materialising as cubes
//
// Perf: registers with window.createGovernor (plain script, loaded first) so
// particle counts and pixel ratio drop before the frame rate does.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TIER_BUDGET = {
  POTATO: { orb: 900,  voxels: 90,  scan: false },
  LOW:    { orb: 1800, voxels: 160, scan: true  },
  MEDIUM: { orb: 3200, voxels: 260, scan: true  },
  HIGH:   { orb: 5000, voxels: 380, scan: true  },
  ULTRA:  { orb: 7000, voxels: 520, scan: true  },
};

export function initBrainHead(container, opts = {}) {
  const onTopic = typeof opts.onTopic === 'function' ? opts.onTopic : () => {};

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  camera.position.set(0, 0.2, 6.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.PointLight(0xffffff, 1.4, 40);
  key.position.set(3, 4, 5);
  scene.add(key);

  let accent = new THREE.Color('#4dd4a0');

  // ── armillary shell ────────────────────────────────────────────────────────
  const shell = new THREE.Group();
  root.add(shell);
  const shellMat = new THREE.LineBasicMaterial({ color: accent.clone(), transparent: true, opacity: 0.32 });
  for (let i = 0; i < 14; i++) {
    const r = 2.5 + (i % 3) * 0.12;
    const pts = [];
    for (let a = 0; a <= 72; a++) {
      const t = (a / 72) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0));
    }
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), shellMat);
    ring.rotation.set((i / 14) * Math.PI, (i * 2.399), 0); // golden-angle spread
    shell.add(ring);
  }

  // ── particle orb core ──────────────────────────────────────────────────────
  const orbGeo = new THREE.BufferGeometry();
  const ORB_MAX = TIER_BUDGET.ULTRA.orb;
  const orbPos = new Float32Array(ORB_MAX * 3);
  const orbSeed = new Float32Array(ORB_MAX * 3);
  for (let i = 0; i < ORB_MAX; i++) {
    // even shell distribution, slight inward jitter so it reads as volume
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u), r = 1.55 + Math.random() * 0.22;
    orbSeed[i * 3] = Math.cos(th) * s * r;
    orbSeed[i * 3 + 1] = u * r;
    orbSeed[i * 3 + 2] = Math.sin(th) * s * r;
  }
  orbPos.set(orbSeed);
  orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPos, 3));
  orbGeo.setDrawRange(0, TIER_BUDGET.MEDIUM.orb);
  const orb = new THREE.Points(orbGeo, new THREE.PointsMaterial({
    color: accent.clone(), size: 0.032, transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  root.add(orb);

  // ── head (GLB if generated, else portrait billboard) ───────────────────────
  const headSlot = new THREE.Group();
  root.add(headSlot);
  const loader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();

  function clearSlot() { while (headSlot.children.length) headSlot.remove(headSlot.children[0]); }

  function fitToBox(obj, target) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = target / Math.max(size.x, size.y, size.z || 1);
    obj.scale.setScalar(scale);
    obj.position.sub(center.multiplyScalar(scale));
  }

  function loadHead(agentId) {
    clearSlot();
    loader.load(
      `assets/council/${agentId}-head.glb`,
      (gltf) => { fitToBox(gltf.scene, 2.1); headSlot.add(gltf.scene); },
      undefined,
      () => {
        // No Meshy head yet — portrait billboard keeps the view whole.
        texLoader.load(`assets/council/${agentId}.png`, (tex) => {
          if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(2.2, 2.2),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.96 }),
          );
          headSlot.add(plane);
        }, undefined, () => {});
      },
    );
  }

  // ── genre ring ─────────────────────────────────────────────────────────────
  const ring = new THREE.Group();
  root.add(ring);
  let genreNodes = [];
  const nodeGeo = new THREE.SphereGeometry(0.075, 12, 12);

  function setGenres(topics) {
    while (ring.children.length) ring.remove(ring.children[0]);
    genreNodes = [];
    const list = (topics || []).slice(0, 12);
    list.forEach(([name, count], i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: accent.clone() }));
      mesh.position.set(Math.cos(a) * 3.05, Math.sin(a) * 0.55, Math.sin(a) * 3.05);
      mesh.userData = { topic: name, count, baseScale: 1 + Math.min(1.1, (count || 0) / 900) };
      mesh.scale.setScalar(mesh.userData.baseScale);
      ring.add(mesh);
      genreNodes.push(mesh);
    });
  }

  // ── voxel burst (retrieved chunks) ─────────────────────────────────────────
  const VOXEL_MAX = TIER_BUDGET.ULTRA.voxels;
  const voxGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const voxMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
  const voxels = new THREE.InstancedMesh(voxGeo, voxMat, VOXEL_MAX);
  voxels.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(VOXEL_MAX * 3), 3);
  voxels.count = 0;
  voxels.frustumCulled = false;
  root.add(voxels);
  const voxState = [];
  const PALETTE = ['#e8c45c', '#4dd4a0', '#5bc8d4', '#b87fdf', '#e87f7f', '#f0a060'];
  const _m = new THREE.Matrix4();
  const _c = new THREE.Color();

  function burstChunks(n) {
    const budget = TIER_BUDGET[tierName]?.voxels ?? 260;
    const count = Math.min(budget, Math.max(1, n | 0));
    voxState.length = 0;
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      voxState.push({ p: dir.clone().multiplyScalar(0.6), v: dir.multiplyScalar(0.9 + Math.random() * 1.5), life: 0 });
      _c.set(PALETTE[i % PALETTE.length]);
      voxels.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    }
    voxels.instanceColor.needsUpdate = true;
    voxels.count = count;
  }

  // ── HUD overlay (2D canvas above the GL canvas) ────────────────────────────
  const hud = document.createElement('canvas');
  Object.assign(hud.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  // Only establish a containing block if the container doesn't already have one.
  // Reading .style.position sees only INLINE styles, so a stylesheet-positioned
  // container looks unset and gets clobbered — collapsing its layout. Ask the
  // computed style instead.
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(hud);
  const hx = hud.getContext('2d');
  let readouts = [];

  function setReadouts(rows) { readouts = rows || []; }

  function drawHud(t) {
    const w = hud.width, h = hud.height, dpr = hud._dpr || 1;
    hx.clearRect(0, 0, w, h);
    hx.save();
    hx.scale(dpr, dpr);
    const W = w / dpr, H = h / dpr;
    const col = `#${accent.getHexString()}`;

    hx.strokeStyle = col; hx.lineWidth = 1.4; hx.globalAlpha = 0.9;
    const b = 18, L = 30;
    [[b, b, 1, 1], [W - b, b, -1, 1], [b, H - b, 1, -1], [W - b, H - b, -1, -1]].forEach(([x, y, sx, sy]) => {
      hx.beginPath();
      hx.moveTo(x, y + sy * L); hx.lineTo(x, y); hx.lineTo(x + sx * L, y);
      hx.stroke();
    });

    if (TIER_BUDGET[tierName]?.scan) {
      const sy = b + ((t * 55) % (H - b * 2));
      const grad = hx.createLinearGradient(0, sy - 12, 0, sy + 12);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      hx.globalAlpha = 0.5; hx.strokeStyle = grad; hx.lineWidth = 2;
      hx.beginPath(); hx.moveTo(b, sy); hx.lineTo(W - b, sy); hx.stroke();
    }

    hx.globalAlpha = 0.92;
    hx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    hx.fillStyle = col;
    readouts.forEach((r, i) => {
      const y = b + 22 + i * 15;
      hx.fillText(r, b + 6, y);
      hx.globalAlpha = 0.28;
      hx.fillRect(b + 6, y + 3, Math.min(96, 24 + r.length * 3), 1);
      hx.globalAlpha = 0.92;
    });

    // leader lines into the head, echoing the diagnostic-scan reference
    hx.globalAlpha = 0.5; hx.lineWidth = 1;
    const cx = W / 2, cy = H / 2;
    [[-1, -0.45], [1, -0.15], [-1, 0.35]].forEach(([sx, oy], i) => {
      const ex = cx + sx * W * 0.09, ey = cy + oy * H * 0.30;
      const tx = cx + sx * W * 0.30, ty = ey;
      hx.beginPath(); hx.moveTo(ex, ey); hx.lineTo(tx, ty); hx.lineTo(tx + sx * 26, ty); hx.stroke();
      hx.beginPath(); hx.arc(ex, ey, 2.4, 0, Math.PI * 2); hx.fillStyle = col; hx.fill();
    });
    hx.restore();
  }

  // ── governor ───────────────────────────────────────────────────────────────
  let tierName = 'MEDIUM';
  const makeGov = (typeof window !== 'undefined' && window.createGovernor) || null;
  const governor = makeGov ? makeGov({
    onTierChange: (_i, tier) => {
      tierName = tier.name;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pr));
      resize();
      orbGeo.setDrawRange(0, TIER_BUDGET[tier.name]?.orb ?? 3200);
    },
  }) : { update() {}, getTier: () => ({ name: 'MEDIUM' }) };

  // ── picking ────────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('click', (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(genreNodes, false)[0];
    if (hit) onTopic(hit.object.userData.topic, hit.object.userData.count);
  });

  let drag = null, spin = 0, spinV = 0.12;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = e.clientX; renderer.domElement.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', () => { drag = null; renderer.domElement.style.cursor = 'grab'; });
  window.addEventListener('pointermove', (e) => {
    if (drag === null) return;
    spinV = (e.clientX - drag) * 0.004;
    spin += spinV; drag = e.clientX;
  });

  function resize() {
    const w = container.clientWidth || 640, h = container.clientHeight || 420;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // updateStyle MUST stay on: with it off, the canvas keeps its intrinsic
    // (pixelRatio-scaled) CSS size and the scene sits off-centre in the stage
    // whenever the governor picks a tier with pr < 1.
    renderer.setSize(w, h);
    hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr);
    hud.style.width = w + 'px'; hud.style.height = h + 'px'; hud._dpr = dpr;
  }
  resize();
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  let t = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    t += dt;
    governor.update(dt);

    if (drag === null) { spinV += (0.12 - spinV) * 0.02; spin += spinV * dt; }
    root.rotation.y = spin;
    shell.rotation.y = -spin * 1.7;
    shell.rotation.x = Math.sin(t * 0.18) * 0.16;
    ring.rotation.y = spin * 0.6;

    const draw = orbGeo.drawRange.count;
    const pos = orbGeo.attributes.position.array;
    for (let i = 0; i < draw; i++) {
      const j = i * 3;
      const puff = 1 + Math.sin(t * 1.6 + orbSeed[j] * 2.2) * 0.045;
      pos[j] = orbSeed[j] * puff;
      pos[j + 1] = orbSeed[j + 1] * puff;
      pos[j + 2] = orbSeed[j + 2] * puff;
    }
    orbGeo.attributes.position.needsUpdate = true;

    genreNodes.forEach((n, i) => {
      n.scale.setScalar(n.userData.baseScale * (1 + Math.sin(t * 2 + i) * 0.09));
    });

    if (voxels.count) {
      let alive = 0;
      for (let i = 0; i < voxels.count; i++) {
        const s = voxState[i];
        if (!s) continue;
        s.life += dt;
        s.p.addScaledVector(s.v, dt);
        s.v.multiplyScalar(0.985);
        if (s.life < 2.6) alive++;
        _m.makeTranslation(s.p.x, s.p.y, s.p.z);
        voxels.setMatrixAt(i, _m);
      }
      voxels.instanceMatrix.needsUpdate = true;
      voxMat.opacity = Math.max(0, 1 - (voxState[0]?.life ?? 0) / 2.6);
      if (!alive) voxels.count = 0;
    }

    renderer.render(scene, camera);
    drawHud(t);
  }
  frame();

  function focusAgent(agent) {
    accent = new THREE.Color(agent.color || '#4dd4a0');
    shellMat.color.copy(accent);
    orb.material.color.copy(accent);
    loadHead(agent.id);
    setGenres(agent.topics);
    genreNodes.forEach((n) => n.material.color.copy(accent));
    setReadouts([
      `AGENT ${agent.id}`,
      `KB kb_${String(agent.id).toLowerCase()}`,
      `DOCS ${agent.docs ?? 0}`,
      `WORDS ${agent.words ?? 0}`,
      `TOPICS ${(agent.topics || []).length}`,
    ]);
  }

  return { focusAgent, burstChunks, setReadouts, scene, camera, renderer };
}

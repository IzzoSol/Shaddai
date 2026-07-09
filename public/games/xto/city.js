/* ═══════════════════════════════════════════════════════════════════════════
   XTO_City — deeply detailed stylized night-neon CITY hub (module 2 of 5)
   Owner: TURTLE.  Contract:
     window.XTO_City = { build(ctx) → { update(dt,t) } }   (build may be async)
   ctx = { THREE, scene, camera, renderer, loader, canvas, hud, keys, input,
           player, time, state, helpers, flags, lights, chosen }

   Ground is FLAT at y=0 (player walks on y=0).  Build order: 2nd (after DayNight).

   Exposes on ctx.city:
     { radius, isSolid(x,z)->bool, starts:{TURTLE,ORACLE,XEROX}, spawn:{x,z}, shaddai:{x,z} }
   isSolid = true inside building footprints (streets/plaza stay open) so the
   player + NPCs can't walk through walls.  Footprint list + cheap distance tests.

   Perf: InstancedMesh for windows / lamps / benches / planters.  Geometry declared
   once, matrices baked at build.  update() only pulses a few neon signs — no
   per-frame allocation.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.XTO_City = {
    build: async function (ctx) {
      const THREE = ctx.THREE;
      const scene = ctx.scene;

      // ── asset roots (graceful: missing files just fall back to procedural) ──
      const TEX = '/assets/xto/';
      const texLoader = new THREE.TextureLoader();

      // group everything so the module is self-contained / removable
      const CITY = new THREE.Group();
      CITY.name = 'XTO_City';
      scene.add(CITY);

      // ── shared reusable helpers ────────────────────────────────────────────
      const rng = (function () { let s = 0x51ed270b; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
      const pick = (arr) => arr[(rng() * arr.length) | 0];

      // neon palette (emissive-friendly)
      const NEON = [0x27e0ff, 0x8a6cff, 0x1fd6c4, 0xff5db1, 0xffd23f, 0x5dff8a, 0xff7a3c];

      // Load a texture with SRGB + tiling; returns null-safe (caller checks map)
      function loadTex(file, repX, repY) {
        try {
          const t = texLoader.load(TEX + file,
            undefined, undefined,
            () => { /* onError: leave map, material falls back to color */ });
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (repX || repY) t.repeat.set(repX || 1, repY || 1);
          t.anisotropy = 4;
          return t;
        } catch (_) { return null; }
      }

      // ── material cache ─────────────────────────────────────────────────────
      const roadTex = loadTex('road.jpg', 40, 40);
      const facadeTex = [loadTex('facade-a.jpg', 2, 4), loadTex('facade-b.jpg', 2, 5), loadTex('facade-c.jpg', 3, 6)];

      // ── COLLISION registry (footprint list; cheap distance checks) ─────────
      // each: {x,z,rx,rz}  → axis-aligned rounded footprint (half-extents rx,rz)
      const solids = [];
      function addSolid(x, z, rx, rz) { solids.push({ x, z, rx, rz }); }

      // ════════════════════════════════════════════════════════════════════════
      // 1. STREET / GROUND — flat walkable plane at y=0
      // ════════════════════════════════════════════════════════════════════════
      const CITY_RADIUS = 300;
      {
        const groundMat = new THREE.MeshStandardMaterial({
          color: roadTex ? 0xffffff : 0x11162a,
          map: roadTex || null,
          roughness: 0.85, metalness: 0.15
        });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY_RADIUS * 2, CITY_RADIUS * 2), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        CITY.add(ground);

        // central circular plaza — glowing inlaid ring so streets read as radiating
        const plazaMat = new THREE.MeshStandardMaterial({ color: 0x0d1430, roughness: 0.4, metalness: 0.3, emissive: 0x0a1f3a, emissiveIntensity: 0.5 });
        const plaza = new THREE.Mesh(new THREE.CircleGeometry(46, 64), plazaMat);
        plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01; plaza.receiveShadow = true;
        CITY.add(plaza);

        const ringGeo = new THREE.RingGeometry(44, 46, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; CITY.add(ring);

        // radiating street strips (emissive centre-lines) — 6 avenues from plaza
        const laneMat = new THREE.MeshBasicMaterial({ color: 0x1a3a66, transparent: true, opacity: 0.5 });
        const laneGeo = new THREE.PlaneGeometry(6, CITY_RADIUS - 40);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const lane = new THREE.Mesh(laneGeo, laneMat);
          lane.rotation.x = -Math.PI / 2; lane.rotation.z = -a;
          const d = 40 + (CITY_RADIUS - 40) / 2;
          lane.position.set(Math.cos(a) * d, 0.015, Math.sin(a) * d);
          CITY.add(lane);
        }
      }

      // ════════════════════════════════════════════════════════════════════════
      // 2. BUILDINGS — varied stylized towers + greeble.  Reuses a shared
      //    building-builder so every tower gets windows / awning / roof details.
      // ════════════════════════════════════════════════════════════════════════

      // -- instanced WINDOW pool: one lit-window quad instanced across all towers
      const MAX_WINDOWS = 6000;
      const winGeo = new THREE.PlaneGeometry(0.7, 0.9);
      const winMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      const windows = new THREE.InstancedMesh(winGeo, winMat, MAX_WINDOWS);
      windows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_WINDOWS * 3), 3);
      let winCount = 0;
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
      const _col = new THREE.Color();
      function addWindow(x, y, z, ry, lit) {
        if (winCount >= MAX_WINDOWS) return;
        _e.set(0, ry, 0); _q.setFromEuler(_e); _p.set(x, y, z);
        _m.compose(_p, _q, _s); windows.setMatrixAt(winCount, _m);
        if (lit) { _col.setHex(pick(NEON)).multiplyScalar(0.9); }
        else { _col.setRGB(0.03, 0.05, 0.09); }
        windows.setColorAt(winCount, _col);
        winCount++;
      }
      CITY.add(windows);

      // reusable box geo (unit) — scaled per instance via mesh.scale
      const unitBox = new THREE.BoxGeometry(1, 1, 1);

      // neon meshes that update() pulses/blinks (declared before makeBuilding)
      const pulses = [];

      // build ONE stylized building at (x,z), footprint w×d, height h, tinted col.
      // greeble: body + darker plinth + roof cap + antenna + awning + neon sign band.
      function makeBuilding(x, z, w, d, h, col, opts) {
        opts = opts || {};
        const g = new THREE.Group();
        g.position.set(x, 0, z);

        // choose a facade texture for this tower (SRGB tiled) — else tinted material
        const fTex = pick(facadeTex);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: fTex ? 0xdedede : col,
          map: fTex || null,
          roughness: 0.7, metalness: 0.25,
          emissive: col, emissiveIntensity: 0.06
        });
        const body = new THREE.Mesh(unitBox, bodyMat);
        body.scale.set(w, h, d); body.position.y = h / 2;
        body.castShadow = true; body.receiveShadow = true;
        g.add(body);

        // darker street-level plinth (reads as a shopfront base)
        const plinthMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.6, metalness: 0.4, emissive: col, emissiveIntensity: 0.15 });
        const plinth = new THREE.Mesh(unitBox, plinthMat);
        plinth.scale.set(w * 1.04, 3.2, d * 1.04); plinth.position.y = 1.6;
        plinth.castShadow = true; g.add(plinth);

        // roof cap + rooftop greeble (vents / box)
        const capMat = new THREE.MeshStandardMaterial({ color: 0x161c30, roughness: 0.5, metalness: 0.6 });
        const cap = new THREE.Mesh(unitBox, capMat);
        cap.scale.set(w * 0.7, 1.4, d * 0.7); cap.position.y = h + 0.7; g.add(cap);
        const vent = new THREE.Mesh(unitBox, capMat);
        vent.scale.set(w * 0.25, 2.2, d * 0.25); vent.position.set(w * 0.2, h + 1.8, -d * 0.15); g.add(vent);

        // antenna (thin) + blinking tip
        if (rng() > 0.35) {
          const antMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, metalness: 0.8, roughness: 0.3 });
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h * 0.35, 6), antMat);
          ant.position.set(0, h + 1.4 + h * 0.175, 0); g.add(ant);
          const tipMat = new THREE.MeshBasicMaterial({ color: 0xff3355, toneMapped: false });
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), tipMat);
          tip.position.set(0, h + 1.4 + h * 0.35, 0); tip.userData.blink = true; g.add(tip);
          pulses.push(tip);
        }

        // awning over the door (front = +z face)
        const awnMat = new THREE.MeshStandardMaterial({ color: pick(NEON), emissive: 0x111111, roughness: 0.5, metalness: 0.2 });
        const awn = new THREE.Mesh(unitBox, awnMat);
        awn.scale.set(w * 0.6, 0.5, 2.2); awn.position.set(0, 3.4, d / 2 + 1.0); awn.castShadow = true; g.add(awn);

        // door (dark recessed)
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.4, metalness: 0.3, emissive: col, emissiveIntensity: 0.25 });
        const door = new THREE.Mesh(unitBox, doorMat);
        door.scale.set(2.0, 3.0, 0.3); door.position.set(0, 1.5, d / 2 + 0.05); g.add(door);

        // neon signage band across the front + a vertical blade sign
        const signMat = new THREE.MeshBasicMaterial({ color: pick(NEON), toneMapped: false, transparent: true, opacity: 0.9 });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 1.1), signMat);
        sign.position.set(0, 5.2, d / 2 + 0.06); g.add(sign);
        sign.userData.glow = true; pulses.push(sign);

        if (rng() > 0.5) {
          const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.0, Math.min(h * 0.5, 10)), new THREE.MeshBasicMaterial({ color: pick(NEON), toneMapped: false, side: THREE.DoubleSide }));
          blade.position.set(w / 2 + 0.6, h * 0.55, d / 2 - 1.0); blade.rotation.y = Math.PI / 2; g.add(blade);
        }

        // balconies + pipes on some towers
        if (rng() > 0.5) {
          const balMat = new THREE.MeshStandardMaterial({ color: 0x1a2136, metalness: 0.7, roughness: 0.4 });
          for (let by = 8; by < h - 3; by += 5) {
            const bal = new THREE.Mesh(unitBox, balMat);
            bal.scale.set(w * 0.9, 0.4, 1.4); bal.position.set(0, by, d / 2 + 0.7); g.add(bal);
          }
        }
        {
          const pipeMat = new THREE.MeshStandardMaterial({ color: 0x24304d, metalness: 0.6, roughness: 0.5 });
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, h * 0.9, 6), pipeMat);
          pipe.position.set(-w / 2 - 0.2, h * 0.45, d / 2 - 1.2); g.add(pipe);
        }

        // WINDOWS — grid on front (+z) and back (−z) faces, instanced.
        const cols = Math.max(2, Math.floor(w / 1.6));
        const rows = Math.max(3, Math.floor((h - 4) / 1.6));
        const x0 = -((cols - 1) * 1.4) / 2;
        const y0 = 5.0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const lit = rng() > 0.35;
            const wx = x + x0 + c * 1.4;
            const wy = y0 + r * 1.6;
            addWindow(wx, wy, z + d / 2 + 0.05, 0, lit);
            addWindow(wx, wy, z - d / 2 - 0.05, Math.PI, rng() > 0.4 && lit);
          }
        }

        CITY.add(g);
        addSolid(x, z, w * 0.6, d * 0.6);
        return g;
      }

      // ---- lay out a RING of buildings around the plaza + blocks along avenues
      const RING_R = 66;
      const RING_N = 12;
      for (let i = 0; i < RING_N; i++) {
        const a = (i / RING_N) * Math.PI * 2 + 0.12;
        const x = Math.cos(a) * RING_R, z = Math.sin(a) * RING_R;
        const w = 8 + rng() * 8, d = 8 + rng() * 8, h = 16 + rng() * 34;
        // face the plaza: rotate group so +z (door/sign) points inward
        const b = makeBuilding(x, z, w, d, h, pick([0x12203a, 0x1a1430, 0x0f2430, 0x241428, 0x102a24]));
        b.rotation.y = Math.atan2(-x, -z);
      }

      // outer blocks along each avenue (two rows of shops/towers per avenue side)
      for (let av = 0; av < 6; av++) {
        const a = (av / 6) * Math.PI * 2;
        const ux = Math.cos(a), uz = Math.sin(a);        // avenue direction
        const px = -uz, pz = ux;                          // perpendicular (sidewalk offset)
        for (let step = 0; step < 5; step++) {
          const along = 100 + step * 40;
          for (const side of [-1, 1]) {
            const off = 26 * side;
            const x = ux * along + px * off;
            const z = uz * along + pz * off;
            if (x * x + z * z > (CITY_RADIUS - 24) * (CITY_RADIUS - 24)) continue;
            const w = 7 + rng() * 9, d = 7 + rng() * 9, h = 12 + rng() * 40;
            const b = makeBuilding(x, z, w, d, h, pick([0x12203a, 0x1a1430, 0x0f2430, 0x241428, 0x102a24, 0x2a2010]));
            b.rotation.y = -a + (side < 0 ? Math.PI : 0); // face the avenue
          }
        }
      }

      windows.instanceMatrix.needsUpdate = true;
      if (windows.instanceColor) windows.instanceColor.needsUpdate = true;

      // ════════════════════════════════════════════════════════════════════════
      // 3. HERO HQ BUILDINGS — TURTLE / ORACLE / XEROX + central SHADDAI hall
      // ════════════════════════════════════════════════════════════════════════
      const starts = {};
      function makeHero(name, x, z, col, h) {
        const w = 16, d = 16;
        const g = makeBuilding(x, z, w, d, h, col);
        g.rotation.y = Math.atan2(-x, -z); // door faces plaza centre

        // glowing banner tower-topper with the hero's neon color
        const bannerMat = new THREE.MeshBasicMaterial({ color: col, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 6), bannerMat);
        banner.position.set(0, h + 5, d / 2 + 0.1); g.add(banner);
        banner.userData.glow = true; pulses.push(banner);

        // big glowing sign ring above the door + light
        const halo = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.28, 8, 24), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
        halo.position.set(0, 7.5, d / 2 + 0.4); g.add(halo);
        const pl = new THREE.PointLight(col, 2.2, 40, 2); pl.position.set(0, 8, d / 2 + 3); g.add(pl);

        // door position in WORLD space (in front of the door face, toward plaza)
        const dir = new THREE.Vector2(-x, -z).normalize();
        starts[name] = { x: x + dir.x * (d / 2 + 3), z: z + dir.y * (d / 2 + 3) };
        return g;
      }
      // three hero HQs at distinct spots/colors on the inner ring
      makeHero('TURTLE', 0, -92, 0x1fd6c4, 40);   // north — emerald/teal
      makeHero('ORACLE', -80, 46, 0x8a6cff, 44);   // sw — violet
      makeHero('XEROX', 80, 46, 0x27e0ff, 42);   // se — cyan (blue katana)

      // central SHADDAI civic hall — golden monument tower at plaza edge (kept
      // OUT of the open plaza centre; sits just past the plaza ring, north-ish)
      let shaddaiPos = { x: 0, z: 0 };
      {
        const hx = 0, hz = 58, hh = 30, hw = 22, hd = 22;
        const g = makeBuilding(hx, hz, hw, hd, hh, 0x2a2410);
        g.rotation.y = Math.PI; // door faces plaza (−z toward centre)
        // golden dome cap
        const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.9, roughness: 0.25, emissive: 0x3a2c05, emissiveIntensity: 0.5 }));
        dome.position.set(0, hh + 1.4, 0); g.add(dome);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false }));
        spire.position.set(0, hh + 13, 0); g.add(spire); pulses.push(spire); spire.userData.glow = true;
        shaddaiPos = { x: hx, z: hz };
      }

      // ════════════════════════════════════════════════════════════════════════
      // 4. HF POSTERS — glowing billboards with neon frames around the plaza
      // ════════════════════════════════════════════════════════════════════════
      function makePoster(file, x, z, ry, w, h) {
        const grp = new THREE.Group();
        grp.position.set(x, 0, z); grp.rotation.y = ry;
        // poster face — HF art mapped SRGB; falls back to neon gradient color
        const pTex = loadTex(file, 1, 1);
        const faceMat = new THREE.MeshBasicMaterial({ color: pTex ? 0xffffff : pick(NEON), map: pTex || null, toneMapped: false });
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
        face.position.set(0, h / 2 + 4, 0); grp.add(face);
        // neon frame (4 thin bars)
        const frameMat = new THREE.MeshBasicMaterial({ color: pick(NEON), toneMapped: false });
        const fb = new THREE.Mesh(unitBox, frameMat);
        const bars = [[w + 0.6, 0.4, 0.3, 0, h / 2], [w + 0.6, 0.4, 0.3, 0, -h / 2], [0.4, h + 0.4, 0.3, -w / 2, 0], [0.4, h + 0.4, 0.3, w / 2, 0]];
        bars.forEach(([bw, bh, bd, bx, by]) => { const m = fb.clone(); m.scale.set(bw, bh, bd); m.position.set(bx, h / 2 + 4 + by, 0.02); grp.add(m); });
        // support posts + backlight
        const postMat = new THREE.MeshStandardMaterial({ color: 0x1a2136, metalness: 0.7, roughness: 0.4 });
        for (const sx of [-w / 2 + 0.6, w / 2 - 0.6]) { const p = new THREE.Mesh(unitBox, postMat); p.scale.set(0.4, 4, 0.4); p.position.set(sx, 2, -0.2); grp.add(p); }
        const bl = new THREE.PointLight(0x66aaff, 1.4, 24, 2); bl.position.set(0, h / 2 + 4, 1.4); grp.add(bl);
        CITY.add(grp);
        addSolid(x, z, w * 0.5, 1.2);
      }
      makePoster('poster-1.jpg', -30, -30, Math.PI * 0.25, 12, 8);
      makePoster('poster-2.jpg', 34, -28, -Math.PI * 0.28, 12, 8);
      makePoster('poster-3.jpg', -2, 40, Math.PI, 14, 9);
      // a couple of smaller wall-ad posters on the ring flank
      makePoster('poster-1.jpg', 52, -52, -Math.PI * 0.75, 7, 5);
      makePoster('poster-2.jpg', -52, -52, Math.PI * 0.75, 7, 5);

      // ════════════════════════════════════════════════════════════════════════
      // 5. PROPS — instanced lamps/benches/planters + fountain, stalls, hologram,
      //    crates, string-lights, and stylized neon cars (NOT cubes)
      // ════════════════════════════════════════════════════════════════════════

      // -- instanced STREET LAMPS (pole + emissive head) : two instanced meshes
      const lampSpots = [];
      for (let av = 0; av < 6; av++) {
        const a = (av / 6) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a), px = -uz, pz = ux;
        for (let s = 1; s <= 6; s++) { const along = 55 + s * 35; for (const side of [-1, 1]) { lampSpots.push([ux * along + px * 12 * side, uz * along + pz * 12 * side]); } }
      }
      // plaza-edge lamps
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; lampSpots.push([Math.cos(a) * 50, Math.sin(a) * 50]); }

      {
        const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 7, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x223052, metalness: 0.8, roughness: 0.4 });
        const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
        const headGeo = new THREE.SphereGeometry(0.5, 10, 10);
        const headMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, toneMapped: false });
        const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
        lampSpots.forEach(([lx, lz], i) => {
          _p.set(lx, 3.5, lz); _q.identity(); _s.set(1, 1, 1); _m.compose(_p, _q, _s); poles.setMatrixAt(i, _m);
          _p.set(lx, 7.1, lz); _m.compose(_p, _q, _s); heads.setMatrixAt(i, _m);
          addSolid(lx, lz, 0.4, 0.4);
        });
        poles.castShadow = true;
        CITY.add(poles); CITY.add(heads);
        // a few real point-lights only near the plaza (perf)
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pl = new THREE.PointLight(0x8fd0ff, 1.1, 30, 2); pl.position.set(Math.cos(a) * 50, 6.5, Math.sin(a) * 50); CITY.add(pl); }
      }

      // -- instanced BENCHES + PLANTERS around the plaza
      {
        const benchGeo = new THREE.BoxGeometry(3.2, 0.5, 1.1);
        const benchMat = new THREE.MeshStandardMaterial({ color: 0x2b2038, roughness: 0.6, metalness: 0.3, emissive: 0x120a20, emissiveIntensity: 0.4 });
        const N = 8; const benches = new THREE.InstancedMesh(benchGeo, benchMat, N);
        for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + 0.4; const bx = Math.cos(a) * 40, bz = Math.sin(a) * 40; _e.set(0, -a, 0); _q.setFromEuler(_e); _p.set(bx, 0.6, bz); _s.set(1, 1, 1); _m.compose(_p, _q, _s); benches.setMatrixAt(i, _m); }
        benches.castShadow = true; CITY.add(benches);

        const planterGeo = new THREE.CylinderGeometry(1.1, 1.3, 1.4, 8);
        const planterMat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7, metalness: 0.2, emissive: 0x0a2a1a, emissiveIntensity: 0.5 });
        const P = 10; const planters = new THREE.InstancedMesh(planterGeo, planterMat, P);
        for (let i = 0; i < P; i++) { const a = (i / P) * Math.PI * 2; const bx = Math.cos(a) * 46, bz = Math.sin(a) * 46; _p.set(bx, 0.7, bz); _q.identity(); _s.set(1, 1, 1); _m.compose(_p, _q, _s); planters.setMatrixAt(i, _m); addSolid(bx, bz, 1.3, 1.3); }
        CITY.add(planters);
        // glowing foliage blobs on planters (instanced)
        const leafGeo = new THREE.IcosahedronGeometry(1.2, 0);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x1fd6c4, emissive: 0x0a5a4a, emissiveIntensity: 0.7, roughness: 0.8 });
        const leaves = new THREE.InstancedMesh(leafGeo, leafMat, P);
        for (let i = 0; i < P; i++) { const a = (i / P) * Math.PI * 2; _p.set(Math.cos(a) * 46, 2.0, Math.sin(a) * 46); _q.identity(); _s.set(1, 1, 1); _m.compose(_p, _q, _s); leaves.setMatrixAt(i, _m); }
        CITY.add(leaves);
      }

      // -- MARKET STALLS (striped canopy + counter) around the plaza
      function makeStall(x, z, ry, col) {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
        const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 2), new THREE.MeshStandardMaterial({ color: 0x2a1c30, roughness: 0.6, metalness: 0.3 }));
        counter.position.y = 0.7; counter.castShadow = true; g.add(counter);
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.5 }));
        canopy.position.y = 3.0; canopy.rotation.z = 0.06; g.add(canopy);
        for (const sx of [-2, 2]) for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), new THREE.MeshStandardMaterial({ color: 0x333, metalness: 0.7 })); post.position.set(sx, 1.5, sz); g.add(post); }
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.4), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); glow.position.set(0, 1.5, 1.01); g.add(glow); pulses.push(glow); glow.userData.glow = true;
        CITY.add(g); addSolid(x, z, 2.4, 1.6);
      }
      makeStall(-16, 8, 0.4, 0xff5db1); makeStall(18, 10, -0.5, 0xffd23f); makeStall(6, -20, 2.7, 0x5dff8a); makeStall(-10, -18, -2.4, 0x27e0ff);

      // -- HOLOGRAPHIC SIGNS (rotating translucent glyph rings) in the plaza
      const holos = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.7; const hx = Math.cos(a) * 22, hz = Math.sin(a) * 22;
        const holo = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: pick(NEON), toneMapped: false, transparent: true, opacity: 0.6 }));
        holo.position.set(hx, 5, hz); holo.rotation.x = Math.PI / 2.4; CITY.add(holo); holos.push(holo);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1a2440, emissive: 0x0a1f3a, emissiveIntensity: 0.6 })); base.position.set(hx, 2, hz); CITY.add(base); addSolid(hx, hz, 0.6, 0.6);
      }

      // -- instanced CRATES scattered near stalls / alleys
      {
        const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a2e1a, roughness: 0.85, metalness: 0.1, emissive: 0x1a1405, emissiveIntensity: 0.3 });
        const spots = [[-22, 4], [-21.4, 5.4], [22, 6], [8, -24], [7, -25.2], [-14, -22], [24, -6], [-26, -4]];
        const crates = new THREE.InstancedMesh(crateGeo, crateMat, spots.length);
        spots.forEach(([cx, cz], i) => { _e.set(0, rng() * 0.6, 0); _q.setFromEuler(_e); _p.set(cx, 0.7, cz); _s.set(1, 1, 1); _m.compose(_p, _q, _s); crates.setMatrixAt(i, _m); addSolid(cx, cz, 0.8, 0.8); });
        crates.castShadow = true; CITY.add(crates);
      }

      // -- FOUNTAIN / MONUMENT at plaza centre (open, walkable-around, is solid)
      {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0x16203a, roughness: 0.5, metalness: 0.4, emissive: 0x0a1f3a, emissiveIntensity: 0.4 }));
        base.position.y = 0.6; base.receiveShadow = true; CITY.add(base);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0x1a6cff, transparent: true, opacity: 0.5, toneMapped: false })); water.position.y = 1.2; CITY.add(water);
        const tier = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 4, 16), new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.4, metalness: 0.5, emissive: 0x102a4a, emissiveIntensity: 0.5 })); tier.position.y = 3; CITY.add(tier);
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshBasicMaterial({ color: 0x27e0ff, toneMapped: false })); orb.position.y = 7; CITY.add(orb); pulses.push(orb); orb.userData.glow = true;
        const ol = new THREE.PointLight(0x27e0ff, 2.5, 40, 2); ol.position.set(0, 8, 0); CITY.add(ol);
        addSolid(0, 0, 8, 8); // fountain footprint solid (plaza stays open around it)
      }

      // -- HANGING STRING-LIGHTS across the plaza (arcs of tiny emissive beads)
      {
        const beadGeo = new THREE.SphereGeometry(0.14, 6, 6);
        const beadMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false });
        const arcs = 6, perArc = 14;
        const beads = new THREE.InstancedMesh(beadGeo, beadMat, arcs * perArc);
        let bi = 0;
        for (let k = 0; k < arcs; k++) {
          const a0 = (k / arcs) * Math.PI * 2, a1 = ((k + 1) / arcs) * Math.PI * 2;
          const x0 = Math.cos(a0) * 40, z0 = Math.sin(a0) * 40, x1 = Math.cos(a1) * 40, z1 = Math.sin(a1) * 40;
          for (let s = 0; s < perArc; s++) {
            const t = s / (perArc - 1);
            const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
            const y = 8 - Math.sin(t * Math.PI) * 2.4; // droop
            _p.set(x, y, z); _q.identity(); _s.set(1, 1, 1); _m.compose(_p, _q, _s); beads.setMatrixAt(bi++, _m);
          }
        }
        CITY.add(beads);
      }

      // -- STYLIZED NEON CARS (sleek low-poly: body wedge + cabin + windshield +
      //    wheels + taillight glow).  NOT cubes.  Parked along avenues.
      function makeCar(x, z, ry, col) {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
        // lower chassis (wide, low)
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.6), new THREE.MeshStandardMaterial({ color: col, metalness: 0.85, roughness: 0.25, emissive: col, emissiveIntensity: 0.12 }));
        chassis.position.y = 0.75; chassis.castShadow = true; g.add(chassis);
        // sloped hood/trunk wedges (tapered) — gives a sleek car silhouette not a box
        const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.6), chassis.material); hood.position.set(0, 1.05, 1.5); hood.rotation.x = -0.12; g.add(hood);
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.4), chassis.material); trunk.position.set(0, 1.05, -1.5); trunk.rotation.x = 0.12; g.add(trunk);
        // cabin (smaller, raised) + tinted windshield
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.0), new THREE.MeshStandardMaterial({ color: 0x0a0f1c, metalness: 0.4, roughness: 0.3 })); cabin.position.set(0, 1.5, 0); g.add(cabin);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.2), new THREE.MeshStandardMaterial({ color: 0x0af, transparent: true, opacity: 0.45, metalness: 0.6, roughness: 0.1, emissive: 0x0a2a4a, emissiveIntensity: 0.4 })); glass.position.set(0, 1.55, 1.02); glass.rotation.x = -0.3; g.add(glass);
        // wheels (4 cylinders)
        const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12); const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.8, metalness: 0.2 });
        for (const wx of [-1.05, 1.05]) for (const wz of [1.4, -1.4]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.5, wz); g.add(w); }
        // taillight + headlight glow strips
        const tail = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.25), new THREE.MeshBasicMaterial({ color: 0xff2244, toneMapped: false })); tail.position.set(0, 0.9, -2.31); tail.rotation.y = Math.PI; g.add(tail);
        const head = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.2), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, toneMapped: false })); head.position.set(0, 0.9, 2.31); g.add(head);
        const under = new THREE.PointLight(col, 0.8, 10, 2); under.position.set(0, 0.3, 0); g.add(under);
        CITY.add(g); addSolid(x, z, 1.4, 2.6);
      }
      // place a handful of parked cars along two avenues + near the plaza
      makeCar(24, 30, 0.5, 0xff5db1); makeCar(-26, 34, -0.4, 0x27e0ff);
      makeCar(30, -34, 2.2, 0x5dff8a); makeCar(-30, -30, 1.0, 0x8a6cff);
      makeCar(72, 26, Math.PI / 2 + 0.1, 0xffd23f); makeCar(-72, 26, -Math.PI / 2, 0x1fd6c4);
      makeCar(40, 62, 0.2, 0xff7a3c);

      // ════════════════════════════════════════════════════════════════════════
      // 6. COLLISION API + spawn.  spawn placed in the open plaza (south lane).
      // ════════════════════════════════════════════════════════════════════════
      const spawn = { x: 0, z: 30 }; // inside plaza, south of the fountain — open
      // safety: make sure spawn isn't inside a solid (nudge if so)
      function solidAt(x, z) {
        for (let i = 0; i < solids.length; i++) {
          const s = solids[i];
          if (Math.abs(x - s.x) <= s.rx && Math.abs(z - s.z) <= s.rz) return true;
        }
        return false;
      }

      ctx.city = {
        radius: CITY_RADIUS,
        isSolid: solidAt,
        starts: starts,
        spawn: spawn,
        shaddai: shaddaiPos,
        group: CITY
      };

      // move the player to spawn if the player module already ran (it runs after us,
      // but be defensive) — otherwise player module can read ctx.city.spawn.
      if (ctx.player && ctx.player.position) {
        ctx.player.position.set(spawn.x, 0, spawn.z);
        if (ctx.player.object3D) ctx.player.object3D.position.set(spawn.x, 0, spawn.z);
      }

      // ════════════════════════════════════════════════════════════════════════
      // update() — cheap neon pulse only.  No allocation.
      // ════════════════════════════════════════════════════════════════════════
      const _pc = new THREE.Color();
      return {
        update: function (dt, t) {
          // pulse a subset of neon signs/banners (skip most frames per item)
          const pulse = 0.7 + 0.3 * Math.sin(t * 2.2);
          for (let i = 0; i < pulses.length; i++) {
            const o = pulses[i];
            if (o.userData.blink) { o.visible = (Math.sin(t * 4 + i) > 0); continue; }
            if (o.material) o.material.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2 + i));
          }
          // slowly spin holographic rings
          for (let i = 0; i < holos.length; i++) holos[i].rotation.z += dt * 0.6;
        }
      };
    }
  };
})();

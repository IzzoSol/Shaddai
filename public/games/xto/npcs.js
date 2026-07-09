/* ═══════════════════════════════════════════════════════════════════════════
   XTO_Npcs — the citizens (module #4)
   OPTION B: 2.5D camera-facing billboard crowd + stylized neon traffic.
   Owner intent: "people walking around ... a FULL city."

   Contract:  window.XTO_Npcs = { build(ctx) -> { update(dt,t) } }
   ctx = { THREE, scene, camera, renderer, loader, canvas, hud, keys, input,
           player:{position?}, time:{dayFrac,night}, state, helpers, flags,
           lights, chosen, city }
   ctx.city (if present) = { radius, isSolid(x,z), starts, spawn }.  Ground is FLAT y=0.

   Design notes:
   - 6 shared textures /assets/xto/npc-1..6.png -> 6 shared materials (loaded once).
     Missing image -> stylized rounded colored silhouette (still a billboard, never a cube).
   - ~14-22 citizens wander street waypoints, pause, separate lightly, dodge buildings.
   - Day = more strollers + calm pace. Night = fewer citizens + hurried pace.
   - A few low-poly neon cars loop the main streets; they slow/stop near the player.
   - Perf: shared plane geometry, 6 shared materials, object pool, O(n<24) update,
     no per-frame allocation (scratch vectors reused).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  window.XTO_Npcs = {
    build(ctx) {
      const THREE = ctx.THREE;
      const scene = ctx.scene;
      const camera = ctx.camera;

      // ── City info (guard if City module absent) ──────────────────────────
      const city = ctx.city || null;
      const RADIUS = (city && +city.radius) || 120;
      const WANDER_R = RADIUS * 0.9;                 // keep citizens inside the ring
      const isSolid = (city && typeof city.isSolid === 'function')
        ? city.isSolid
        : function () { return false; };             // no buildings known -> open ground

      // ── Tunables ─────────────────────────────────────────────────────────
      const MAX_CITIZENS = 22;                       // hard cap (pool size)
      const DAY_CITIZENS = 22;                        // active in daytime
      const NIGHT_CITIZENS = 12;                       // thinned out at night
      const CITIZEN_SPEED_DAY = 2.4;                   // calm stroll
      const CITIZEN_SPEED_NIGHT = 4.0;                 // hurry home
      const MAX_CARS = 5;
      const CAR_SPEED = 9.0;

      const TEX_PATHS = [
        '/assets/xto/npc-1.png', '/assets/xto/npc-2.png', '/assets/xto/npc-3.png',
        '/assets/xto/npc-4.png', '/assets/xto/npc-5.png', '/assets/xto/npc-6.png',
      ];
      // Fallback silhouette palette (used per-slot if its texture is missing).
      const FALLBACK_COLORS = [0x5ad1ff, 0xff7ac2, 0xffd15a, 0x7affa8, 0xb98cff, 0xff9b5a];

      // ── Root group ───────────────────────────────────────────────────────
      const root = new THREE.Group();
      root.name = 'XTO_Npcs';
      scene.add(root);

      // ── Scratch (reused every frame — zero per-frame allocation) ──────────
      const _camPos = new THREE.Vector3();
      const _tmpA = new THREE.Vector3();
      const _tmpB = new THREE.Vector3();
      const _playerPos = new THREE.Vector3();

      // ── Shared geometry (all citizens share ONE plane) ───────────────────
      // Plane is 1x1 with its foot at y=0 (translate up by 0.5 so origin sits at ground).
      const billboardGeo = new THREE.PlaneGeometry(1, 1);
      billboardGeo.translate(0, 0.5, 0);
      const shadowGeo = new THREE.CircleGeometry(0.5, 16);

      // Shared soft ground-shadow material (one instance, reused).
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false,
      });

      // ── Rounded-silhouette fallback texture (canvas, generated once, tinted per-mat) ──
      function makeSilhouetteTexture() {
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 128;
        const g = cv.getContext('2d');
        g.clearRect(0, 0, 64, 128);
        g.fillStyle = '#ffffff';
        // head
        g.beginPath(); g.arc(32, 26, 15, 0, Math.PI * 2); g.fill();
        // body — rounded capsule torso + legs hint
        g.beginPath();
        g.moveTo(14, 52);
        g.quadraticCurveTo(10, 44, 22, 42);
        g.lineTo(42, 42);
        g.quadraticCurveTo(54, 44, 50, 52);
        g.lineTo(46, 116);
        g.quadraticCurveTo(46, 124, 38, 124);
        g.lineTo(34, 124); g.lineTo(34, 92); g.lineTo(30, 92); g.lineTo(30, 124);
        g.lineTo(26, 124);
        g.quadraticCurveTo(18, 124, 18, 116);
        g.closePath(); g.fill();
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }
      const silhouetteTex = makeSilhouetteTexture();

      // ── Build the 6 SHARED materials (image if present, silhouette fallback if not) ──
      // Each material is reused across many citizens => texture loaded once, not per NPC.
      const loaderTex = new THREE.TextureLoader();
      const sharedMats = TEX_PATHS.map(function (path, i) {
        // Start each material on the tinted-silhouette fallback so the crowd is
        // never empty; upgrade to the real portrait the moment it loads.
        const mat = new THREE.MeshBasicMaterial({
          map: silhouetteTex,
          color: new THREE.Color(FALLBACK_COLORS[i]),
          transparent: true,
          alphaTest: 0.35,
          depthWrite: true,
          side: THREE.DoubleSide,
        });
        loaderTex.load(
          path,
          function (tex) {                 // success -> use HF art, drop the tint
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.LinearFilter;
            mat.map = tex;
            mat.color.setHex(0xffffff);
            mat.needsUpdate = true;
          },
          undefined,
          function () { /* keep silhouette fallback silently */ }
        );
        return mat;
      });

      // ── Waypoint helper: a random reachable point on the streets ──────────
      function randomWaypoint(out) {
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * WANDER_R;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (!isSolid(x, z)) { out.set(x, 0, z); return out; }
        }
        out.set(0, 0, 0); return out;          // fallback: plaza centre
      }

      // ── Citizen pool ──────────────────────────────────────────────────────
      const citizens = [];
      const _wp = new THREE.Vector3();
      for (let i = 0; i < MAX_CITIZENS; i++) {
        const grp = new THREE.Group();
        const matIdx = i % sharedMats.length;

        const bb = new THREE.Mesh(billboardGeo, sharedMats[matIdx]);
        const scale = 1.7 + Math.random() * 0.7;         // vary height 1.7–2.4
        bb.scale.setScalar(scale);
        grp.add(bb);

        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        shadow.scale.setScalar(scale * 0.55);
        grp.add(shadow);

        // spawn position
        const start = new THREE.Vector3();
        randomWaypoint(start);
        grp.position.copy(start);
        root.add(grp);

        const target = new THREE.Vector3();
        randomWaypoint(target);

        citizens.push({
          grp: grp,
          billboard: bb,
          baseScale: scale,
          target: target,
          pauseT: 0,                                   // >0 = standing still
          bobPhase: Math.random() * Math.PI * 2,
          active: true,
        });
      }

      // ── Traffic: stylized low-poly neon cars (NOT cubes) ─────────────────
      // Shared child geometries; each car is its own small group so it can drive.
      const bodyGeo = new THREE.BoxGeometry(1.9, 0.55, 3.6);
      const cabinGeo = new THREE.BoxGeometry(1.5, 0.5, 1.7);
      const windshieldGeo = new THREE.BoxGeometry(1.45, 0.42, 0.12);
      const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
      const lightGeo = new THREE.SphereGeometry(0.14, 8, 8);

      const CAR_COLORS = [0xff2d6f, 0x22d3ff, 0xa855f7, 0x34e37a, 0xffb020];
      const cars = [];

      function makeCar(colorHex) {
        const car = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({
          color: colorHex, metalness: 0.6, roughness: 0.35,
          emissive: colorHex, emissiveIntensity: 0.25,
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.55; car.add(body);

        const cabin = new THREE.Mesh(cabinGeo, bodyMat);
        cabin.position.set(0, 1.0, -0.2); car.add(cabin);

        const glassMat = new THREE.MeshStandardMaterial({
          color: 0x081018, metalness: 0.9, roughness: 0.1,
          emissive: 0x0a2233, emissiveIntensity: 0.6,
        });
        const windshield = new THREE.Mesh(windshieldGeo, glassMat);
        windshield.position.set(0, 1.0, 0.65); car.add(windshield);

        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        const wheelOffX = 1.0, wheelOffZ = 1.15;
        [[-wheelOffX, wheelOffZ], [wheelOffX, wheelOffZ],
         [-wheelOffX, -wheelOffZ], [wheelOffX, -wheelOffZ]].forEach(function (p) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(p[0], 0.42, p[1]); car.add(w);
        });

        // taillight glow (rear, emissive red)
        const tailMat = new THREE.MeshStandardMaterial({
          color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.6,
        });
        [[-0.6, -1.85], [0.6, -1.85]].forEach(function (p) {
          const tl = new THREE.Mesh(lightGeo, tailMat);
          tl.position.set(p[0], 0.6, p[1]); car.add(tl);
        });

        root.add(car);
        return car;
      }

      for (let i = 0; i < MAX_CARS; i++) {
        const car = makeCar(CAR_COLORS[i % CAR_COLORS.length]);
        // Cars drive rectangular loops on "avenues" at fixed lane offsets.
        const lane = (0.35 + 0.5 * (i / MAX_CARS)) * WANDER_R;
        const loopRadius = Math.min(lane, WANDER_R - 8);
        const dir = (i % 2 === 0) ? 1 : -1;
        const startAng = (i / MAX_CARS) * Math.PI * 2;
        car.position.set(Math.cos(startAng) * loopRadius, 0, Math.sin(startAng) * loopRadius);
        cars.push({
          car: car,
          angle: startAng,
          radius: loopRadius,
          dir: dir,
          speedMul: 1,                                 // eased toward target each frame
        });
      }

      // ── Per-frame state ──────────────────────────────────────────────────
      const REPOINT_DIST = 1.4;                          // reached-target threshold
      const SEP_DIST = 2.2;                              // separation radius
      const SEP_DIST2 = SEP_DIST * SEP_DIST;

      function getPlayerPos(out) {
        const p = ctx.player;
        if (p) {
          if (p.position && p.position.isVector3) return out.copy(p.position);
          if (p.object3D && p.object3D.position) return out.copy(p.object3D.position);
        }
        return out.set(0, 0, 0);
      }

      // ── UPDATE ────────────────────────────────────────────────────────────
      function update(dt, t) {
        const night = !!(ctx.time && ctx.time.night);
        const activeCount = night ? NIGHT_CITIZENS : DAY_CITIZENS;
        const speed = night ? CITIZEN_SPEED_NIGHT : CITIZEN_SPEED_DAY;

        camera.getWorldPosition(_camPos);
        getPlayerPos(_playerPos);

        // ── Citizens ──
        for (let i = 0; i < citizens.length; i++) {
          const c = citizens[i];

          // Day/night thinning: extra citizens simply hide (cheap toggle).
          const shouldBeActive = i < activeCount;
          if (c.active !== shouldBeActive) {
            c.active = shouldBeActive;
            c.grp.visible = shouldBeActive;
          }
          if (!shouldBeActive) continue;

          const pos = c.grp.position;

          if (c.pauseT > 0) {
            c.pauseT -= dt;                              // standing still (idle)
          } else {
            // Vector toward current target (flat, y ignored).
            _tmpA.set(c.target.x - pos.x, 0, c.target.z - pos.z);
            const dist = _tmpA.length();
            if (dist < REPOINT_DIST) {
              // arrived -> maybe pause, then pick a fresh waypoint
              randomWaypoint(c.target);
              if (Math.random() < 0.35) c.pauseT = 0.8 + Math.random() * 2.5;
            } else {
              _tmpA.multiplyScalar(1 / dist);            // normalized heading

              // light separation: nudge away from close neighbours
              for (let j = 0; j < citizens.length; j++) {
                if (j === i || !citizens[j].active) continue;
                const op = citizens[j].grp.position;
                const dx = pos.x - op.x, dz = pos.z - op.z;
                const d2 = dx * dx + dz * dz;
                if (d2 > 0.0001 && d2 < SEP_DIST2) {
                  const inv = 1 / Math.sqrt(d2);
                  _tmpA.x += dx * inv * 0.5;
                  _tmpA.z += dz * inv * 0.5;
                }
              }
              // renormalize after separation
              const hl = Math.hypot(_tmpA.x, _tmpA.z) || 1;
              _tmpA.x /= hl; _tmpA.z /= hl;

              const step = speed * dt;
              const nx = pos.x + _tmpA.x * step;
              const nz = pos.z + _tmpA.z * step;

              // revert step if it enters a building or leaves the ring
              const inRing = (nx * nx + nz * nz) < (WANDER_R * WANDER_R);
              if (inRing && !isSolid(nx, nz)) {
                pos.x = nx; pos.z = nz;
              } else {
                randomWaypoint(c.target);                // blocked -> new goal
              }
            }
          }

          // gentle idle/walk bob on the billboard
          c.bobPhase += dt * (c.pauseT > 0 ? 2.2 : 6.0);
          const bob = Math.sin(c.bobPhase) * 0.04;
          c.billboard.scale.y = c.baseScale * (1 + bob);

          // Billboard face-camera: yaw only (keep upright, foot planted on flat ground).
          _tmpB.set(_camPos.x - pos.x, 0, _camPos.z - pos.z);
          c.grp.rotation.y = Math.atan2(_tmpB.x, _tmpB.z);
        }

        // ── Traffic ──
        for (let i = 0; i < cars.length; i++) {
          const cc = cars[i];

          // slow / stop when the player is near the car's path
          _tmpA.copy(cc.car.position); _tmpA.y = 0;
          const distToPlayer = _tmpA.distanceTo(_playerPos);
          let targetMul = 1;
          if (distToPlayer < 6) targetMul = 0;            // full stop
          else if (distToPlayer < 12) targetMul = 0.35;    // crawl
          if (night) targetMul *= 1.15;                    // slightly brisker at night
          // ease the speed multiplier (smooth stop/go, no jerk)
          cc.speedMul += (targetMul - cc.speedMul) * Math.min(1, dt * 4);

          const angStep = (CAR_SPEED / Math.max(6, cc.radius)) * dt * cc.dir * cc.speedMul;
          cc.angle += angStep;

          const px = Math.cos(cc.angle) * cc.radius;
          const pz = Math.sin(cc.angle) * cc.radius;
          cc.car.position.set(px, 0, pz);

          // heading = tangent to the loop (drive forward along the circle)
          const heading = cc.angle + (cc.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          cc.car.rotation.y = heading;
        }
      }

      // Expose a little info for other modules / debugging.
      return {
        update: update,
        root: root,
        citizenCount: citizens.length,
        carCount: cars.length,
      };
    },
  };
})();

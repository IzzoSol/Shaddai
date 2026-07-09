/* ═══════════════════════════════════════════════════════════════════════════
   XTO — Player module  (window.XTO_Player)
   Option-A stylized 3D hero + camera-relative movement + sprint(stamina)+jump
   + building collision (slide) + 3rd-person follow camera.
   Built LAST: City + Mechanics already exist on ctx (guarded if absent).
   Owner: NEXUS.  Contract per xto.html shell.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.XTO_Player = {
    build: async function (ctx) {
      const THREE = ctx.THREE;
      const scene = ctx.scene;
      const camera = ctx.camera;
      const loader = ctx.loader;
      const chosen = (ctx.chosen || 'TURTLE').toUpperCase();

      // ── Tunables ─────────────────────────────────────────────────────────
      const TARGET_HEIGHT = 1.9;      // metres, feet at y=0
      const WALK_SPEED    = 3.2;      // m/s
      const RUN_SPEED     = 6.6;      // m/s
      const ACCEL         = 22.0;     // m/s^2 approach to target vel
      const DECEL         = 26.0;     // m/s^2 when releasing
      const TURN_LERP     = 12.0;     // heading smoothing (per-sec factor)
      const GRAVITY       = -22.0;    // m/s^2
      const JUMP_VEL      = 8.0;      // m/s initial jump
      const STAM_RATE     = 26.0;     // stamina drained per second while sprinting
      const STAM_MIN      = 5.0;      // below this we cannot start/keep sprinting
      const CAM_DIST      = 8.5;      // follow distance behind hero
      const CAM_HEIGHT     = 4.2;     // follow height above hero
      const CAM_LERP      = 6.0;      // camera position smoothing
      const MOVE_EPS      = 0.06;     // move-intent deadzone

      // ── Resolve GLB candidates for the chosen hero ───────────────────────
      const CANDIDATES = {
        TURTLE: ['/assets/agents/TURTLE.glb', '/assets/characters/TURTLE.glb'],
        ORACLE: ['/assets/agents/ORACLE.glb'],
        XEROX:  ['/assets/characters/XEROX.glb', '/assets/agents/ZEROX.glb', '/assets/agents/XEROX.glb'],
        // common alias
        ZEROX:  ['/assets/characters/XEROX.glb', '/assets/agents/ZEROX.glb'],
      };
      const urls = CANDIDATES[chosen] || ['/assets/agents/' + chosen + '.glb'];

      // ── The rig: a root group we own; hero mesh parented inside ──────────
      const rig = new THREE.Group();
      rig.name = 'xto-player';
      scene.add(rig);

      let mixer = null;
      const clips = { idle: null, walk: null, run: null, jump: null };
      let curAction = null;

      // ── Load helper (promisified single-URL load) ────────────────────────
      function loadOne(url) {
        return new Promise(function (resolve, reject) {
          try { loader.load(url, resolve, undefined, reject); }
          catch (e) { reject(e); }
        });
      }

      // Normalize a loaded scene: scale to TARGET_HEIGHT, drop feet to y=0, center xz, shadows.
      function fitHero(obj) {
        obj.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        const h = size.y > 1e-4 ? size.y : 1;
        const s = TARGET_HEIGHT / h;
        obj.scale.setScalar(s);
        // recompute after scaling
        obj.updateWorldMatrix(true, true);
        const box2 = new THREE.Box3().setFromObject(obj);
        const center = new THREE.Vector3();
        box2.getCenter(center);
        // feet to y=0, center on x/z
        obj.position.x -= center.x;
        obj.position.z -= center.z;
        obj.position.y -= box2.min.y;
        obj.traverse(function (n) {
          if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; }
        });
      }

      // Categorize animation clips by name.
      function classifyClips(animations) {
        if (!animations || !animations.length) return;
        for (let i = 0; i < animations.length; i++) {
          const c = animations[i];
          const nm = (c.name || '').toLowerCase();
          if (!clips.run && /run|sprint|jog/.test(nm)) clips.run = c;
          else if (!clips.walk && /walk|move/.test(nm)) clips.walk = c;
          else if (!clips.jump && /jump|leap/.test(nm)) clips.jump = c;
          else if (!clips.idle && /idle|stand|breath/.test(nm)) clips.idle = c;
        }
        // Fallbacks: if nothing matched, use first clip as idle; derive walk/run.
        if (!clips.idle) clips.idle = animations[0] || null;
        if (!clips.walk) clips.walk = clips.run || clips.idle;
        if (!clips.run)  clips.run  = clips.walk || clips.idle;
      }

      // Neat fallback: capsule body + head + glowing visor (never a plain box).
      function buildFallbackHero() {
        const g = new THREE.Group();
        const accent = 0x27e0ff;
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.55, metalness: 0.25 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b2138, roughness: 0.7, metalness: 0.15 });
        const visorMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.1 });

        // Capsule torso (radius 0.42, cylinder height ~1.0 → total ~1.84 w/ caps)
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 8, 16), bodyMat);
        body.position.y = 1.0;
        g.add(body);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), trimMat);
        head.position.y = 1.78;
        g.add(head);

        // Visor band (glowing) on the head, facing +Z (forward)
        const visor = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.055, 10, 24, Math.PI), visorMat);
        visor.rotation.x = Math.PI / 2;
        visor.rotation.z = Math.PI;      // open side faces forward
        visor.position.set(0, 1.80, 0.06);
        g.add(visor);

        // Little chest core light
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), visorMat);
        core.position.set(0, 1.15, 0.40);
        g.add(core);

        g.traverse(function (n) { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        return g;
      }

      // ── Try each candidate URL; fall back to capsule+visor ───────────────
      let hero = null;
      let loadedFrom = null;
      for (let i = 0; i < urls.length; i++) {
        try {
          const gltf = await loadOne(urls[i]);
          hero = gltf.scene || (gltf.scenes && gltf.scenes[0]);
          if (!hero) continue;
          fitHero(hero);
          if (gltf.animations && gltf.animations.length) {
            mixer = new THREE.AnimationMixer(hero);
            classifyClips(gltf.animations);
          }
          loadedFrom = urls[i];
          break;
        } catch (e) {
          hero = null; // try next
        }
      }
      let usedFallback = false;
      if (!hero) {
        hero = buildFallbackHero();
        usedFallback = true;
        loadedFrom = 'fallback:capsule+visor';
      }
      rig.add(hero);

      // Cache actions
      const actions = { idle: null, walk: null, run: null, jump: null };
      if (mixer) {
        if (clips.idle) actions.idle = mixer.clipAction(clips.idle);
        if (clips.walk) actions.walk = mixer.clipAction(clips.walk);
        if (clips.run)  actions.run  = mixer.clipAction(clips.run);
        if (clips.jump) { actions.jump = mixer.clipAction(clips.jump); actions.jump.setLoop(THREE.LoopOnce, 1); actions.jump.clampWhenFinished = true; }
        if (actions.idle) { actions.idle.play(); curAction = actions.idle; }
      }
      function crossTo(next) {
        if (!next || next === curAction) return;
        next.reset().play();
        next.enabled = true;
        next.setEffectiveWeight(1);
        if (curAction) curAction.crossFadeTo(next, 0.18, false);
        curAction = next;
      }

      // ── Spawn position (from City, guarded) ──────────────────────────────
      const city = ctx.city || null;
      const cityRadius = (city && typeof city.radius === 'number') ? city.radius : 380;
      const HERO_RADIUS = 0.5; // for collision probing
      const pos = new THREE.Vector3(0, 0, 0);
      if (city && city.spawn) {
        pos.set(city.spawn.x || 0, 0, city.spawn.z || 0);
      }
      rig.position.copy(pos);

      // ── State exposed to other modules ───────────────────────────────────
      let heading = 0;                 // radians, 0 = facing +Z... we use atan2 travel dir
      let isSprinting = false;
      const velocity = new THREE.Vector3(0, 0, 0); // world-space (x,z planar + y for jump)
      let yVel = 0;
      let grounded = true;

      ctx.player = {
        object3D: rig,
        position: pos,               // kept in sync each frame (same Vector3 instance)
        heading: heading,
        isSprinting: false,
        velocity: velocity,
      };

      // ── Camera orbit (optional right-drag / mouse) ───────────────────────
      // camOrbitYaw = the actual yaw the camera sits at (radians, world). It eases
      // to trail behind the hero, plus a user drag offset. Movement basis + camera
      // position both derive from this single value so controls stay consistent.
      let camOrbitYaw = heading + Math.PI; // start behind hero
      let camUserOffset = 0;               // added by right/left drag
      let camPitch = 0.18;                 // downward tilt baked into height
      let dragging = false;
      let lastX = 0, lastY = 0;
      const canvas = ctx.canvas;
      if (canvas) {
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        canvas.addEventListener('pointerdown', function (e) {
          if (e.button === 2 || e.button === 0) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
        });
        window.addEventListener('pointerup', function () { dragging = false; });
        window.addEventListener('pointermove', function (e) {
          if (!dragging) return;
          const dx = e.clientX - lastX; const dy = e.clientY - lastY;
          lastX = e.clientX; lastY = e.clientY;
          camUserOffset -= dx * 0.005;
          camPitch = Math.max(-0.35, Math.min(0.75, camPitch + dy * 0.003));
        });
      }
      // Place camera behind hero initially
      camera.position.set(pos.x, pos.y + CAM_HEIGHT, pos.z + CAM_DIST);

      // ── Controls hint HUD panel (neon accent) ────────────────────────────
      if (ctx.hud) {
        const hint = document.createElement('div');
        hint.className = 'panel';
        hint.style.cssText = [
          'position:absolute', 'left:14px', 'bottom:14px',
          'padding:8px 12px', 'border-radius:10px',
          'background:rgba(8,14,30,.72)', 'border:1px solid rgba(39,224,255,.35)',
          'box-shadow:0 0 18px rgba(39,224,255,.15)',
          'font:12px/1.4 "IBM Plex Mono",monospace', 'letter-spacing:.06em',
          'color:#bfe6ff', 'backdrop-filter:blur(6px)'
        ].join(';');
        hint.innerHTML = '<span style="color:#27e0ff">WASD</span> move &nbsp;·&nbsp; ' +
                         '<span style="color:#27e0ff">Shift</span> run &nbsp;·&nbsp; ' +
                         '<span style="color:#27e0ff">Space</span> jump';
        ctx.hud.appendChild(hint);
      }

      // ── Reusable temporaries (no per-frame allocation) ───────────────────
      const _fwd = new THREE.Vector3();
      const _right = new THREE.Vector3();
      const _wish = new THREE.Vector3();
      const _targetVel = new THREE.Vector3();
      const _camDesired = new THREE.Vector3();
      const _lookAt = new THREE.Vector3();
      const UP = new THREE.Vector3(0, 1, 0);

      // Helpers from Mechanics (guarded)
      const helpers = ctx.helpers || {};
      function canRun() {
        if (typeof helpers.canRun === 'function') { try { return !!helpers.canRun(); } catch (_) {} }
        const st = ctx.state || {};
        return (typeof st.stamina === 'number') ? st.stamina > STAM_MIN : true;
      }
      function consumeStamina(amount) {
        if (typeof helpers.tryConsumeStamina === 'function') {
          try { return !!helpers.tryConsumeStamina(amount); } catch (_) {}
        }
        // graceful local drain if Mechanics didn't register a helper
        const st = ctx.state;
        if (st && typeof st.stamina === 'number') {
          if (st.stamina < amount) return false;
          st.stamina = Math.max(0, st.stamina - amount);
          return true;
        }
        return true;
      }

      // City collision probe (guarded). Returns true if (x,z) is inside a building.
      function isSolid(x, z) {
        if (city && typeof city.isSolid === 'function') {
          try { return !!city.isSolid(x, z, HERO_RADIUS); } catch (_) { return false; }
        }
        return false;
      }

      let wasJumpDown = false;

      // ── Per-frame update ─────────────────────────────────────────────────
      function update(dt, t) {
        if (mixer) mixer.update(dt);

        // 1) Read movement intent. Prefer ctx.input (may be set by mobile/other),
        //    else derive from keys (WASD + arrows).
        let mx = 0, mz = 0;
        const inp = ctx.input;
        if (inp && (Math.abs(inp.moveX) > MOVE_EPS || Math.abs(inp.moveZ) > MOVE_EPS)) {
          mx = inp.moveX; mz = inp.moveZ;
        } else {
          const k = ctx.keys || {};
          if (k.KeyW || k.ArrowUp)    mz -= 1;
          if (k.KeyS || k.ArrowDown)  mz += 1;
          if (k.KeyA || k.ArrowLeft)  mx -= 1;
          if (k.KeyD || k.ArrowRight) mx += 1;
        }
        const wantRun = !!((ctx.keys && (ctx.keys.ShiftLeft || ctx.keys.ShiftRight)) || (inp && inp.run));

        const hasMove = (mx * mx + mz * mz) > (MOVE_EPS * MOVE_EPS);

        // 2) Camera-yaw-relative basis (flatten to ground plane). Forward =
        //    horizontal direction from camera toward hero; right = forward × up.
        _fwd.set(pos.x - camera.position.x, 0, pos.z - camera.position.z);
        if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1); // degenerate first frame
        _fwd.normalize();
        _right.crossVectors(_fwd, UP).normalize(); // points to camera-right

        // 3) Build wish direction in world space.
        //    mz<0 = W (forward), mx>0 = D (right).
        _wish.set(0, 0, 0);
        if (hasMove) {
          _wish.addScaledVector(_fwd, -mz);
          _wish.addScaledVector(_right, mx);
          if (_wish.lengthSq() > 1e-6) _wish.normalize();
        }

        // 4) Sprint gating by stamina.
        isSprinting = false;
        if (wantRun && hasMove && grounded) {
          if (canRun()) {
            if (consumeStamina(STAM_RATE * dt)) {
              isSprinting = true;
            }
          }
        }
        const targetSpeed = hasMove ? (isSprinting ? RUN_SPEED : WALK_SPEED) : 0;

        // 5) Accelerate / decelerate planar velocity toward target.
        _targetVel.copy(_wish).multiplyScalar(targetSpeed);
        const rate = (targetSpeed > 0 ? ACCEL : DECEL) * dt;
        velocity.x += (_targetVel.x - velocity.x) * Math.min(1, rate);
        velocity.z += (_targetVel.z - velocity.z) * Math.min(1, rate);

        // 6) Jump (edge-triggered) + gravity.
        const jumpDown = !!(ctx.keys && ctx.keys.Space);
        if (jumpDown && !wasJumpDown && grounded) {
          yVel = JUMP_VEL;
          grounded = false;
          if (actions.jump) { actions.jump.reset().play(); }
        }
        wasJumpDown = jumpDown;

        if (!grounded) {
          yVel += GRAVITY * dt;
        }

        // 7) Integrate with per-axis collision (slide along walls).
        // X axis
        let nx = pos.x + velocity.x * dt;
        if (isSolid(nx, pos.z)) { velocity.x = 0; nx = pos.x; }
        // Z axis
        let nz = pos.z + velocity.z * dt;
        if (isSolid(nx, nz)) { velocity.z = 0; nz = pos.z; }
        pos.x = nx; pos.z = nz;

        // Radius clamp (stay inside city).
        const distSq = pos.x * pos.x + pos.z * pos.z;
        const maxR = cityRadius - HERO_RADIUS;
        if (distSq > maxR * maxR) {
          const d = Math.sqrt(distSq) || 1;
          pos.x = (pos.x / d) * maxR;
          pos.z = (pos.z / d) * maxR;
        }

        // Vertical (jump arc). Ground is flat y=0.
        pos.y += yVel * dt;
        if (pos.y <= 0) { pos.y = 0; yVel = 0; if (!grounded) grounded = true; }

        rig.position.copy(pos);

        // 8) Face travel direction (smooth). Only when moving.
        const planarSpeedSq = velocity.x * velocity.x + velocity.z * velocity.z;
        if (planarSpeedSq > 0.02) {
          const targetHeading = Math.atan2(velocity.x, velocity.z); // face +vel
          heading = lerpAngle(heading, targetHeading, Math.min(1, TURN_LERP * dt));
          rig.rotation.y = heading;
        }

        // 9) Animation state machine.
        if (mixer) {
          if (!grounded && actions.jump) {
            // jump action already one-shot; keep locomotion underneath if desired
          }
          if (planarSpeedSq > 0.05) {
            crossTo(isSprinting && actions.run ? actions.run : actions.walk);
          } else {
            crossTo(actions.idle);
          }
        }

        // 10) 3rd-person follow camera.
        //     camOrbitYaw eases to sit behind the hero (heading+PI), plus the
        //     user's drag offset. Position is that yaw at CAM_DIST/CAM_HEIGHT.
        const behind = heading + Math.PI;
        camOrbitYaw = lerpAngle(camOrbitYaw, behind, Math.min(1, 2.5 * dt));
        const camAng = camOrbitYaw + camUserOffset;
        const horiz = CAM_DIST * Math.cos(camPitch);
        _camDesired.set(
          pos.x + Math.sin(camAng) * horiz,
          pos.y + CAM_HEIGHT + Math.sin(camPitch) * CAM_DIST,
          pos.z + Math.cos(camAng) * horiz
        );
        const cl = Math.min(1, CAM_LERP * dt);
        camera.position.lerp(_camDesired, cl);
        _lookAt.set(pos.x, pos.y + 1.2, pos.z);
        camera.lookAt(_lookAt);

        // 11) Publish player state.
        ctx.player.heading = heading;
        ctx.player.isSprinting = isSprinting;
        // position & velocity are the same instances → already in sync
      }

      function lerpAngle(a, b, tt) {
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return a + d * tt;
      }

      // Expose a small info blob for debugging / other modules.
      return {
        update: update,
        info: { loadedFrom: loadedFrom, usedFallback: usedFallback, chosen: chosen },
        get object3D() { return rig; },
      };
    }
  };
})();

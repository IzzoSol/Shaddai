/* world-colosseum-floors.js — interchangeable Colosseum floors (docs/COLOSSEUM-PLAN, phases 3+4).
 *   window.ColosseumFloors.attach(THREE, arena)     (called by world-colosseum.js once the arena api exists)
 *   arena.setField('water')  -> flooded arena + NAVAL BATTLE (2 fleets of 3 galleys: cannons, splashes, fire, sinking, victory, auto-rematch)
 *   arena.setField('lava')   -> molten floor, obsidian islands, fire plumes
 *   arena.setField('void')   -> crumbling hex platforms over a pit (crumble/respawn cycle)
 *   arena.setField('grass'|'ice') -> painted floors
 * All geometry is authored in METRES in arena.root (root.scale = U). Everything is code-built (no GLBs), pooled, and only ticks while its mode is active.
 * Naval events: ColosseumFloors.onBattleEvent = function(ev){ ev.type: 'fire'|'hit'|'sink'|'win'|'round' }.
 */
(function () {
  'use strict';
  var MODES = ['water', 'lava', 'void', 'grass', 'ice'];
  var WATER_Y = 0.7;

  function attach(THREE, arena) {
    var root = arena.root, A = arena.dims.A, B = arena.dims.B;
    var grp = new THREE.Group(); grp.name = 'colosseum-floors'; root.add(grp);
    var time = 0, mode = null, hooks = [];
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    var API = { autoBattle: true, modes: MODES, state: { mode: null, round: 0, score: { A: 0, B: 0 } }, onBattleEvent: null };
    function evt(e) { if (API.onBattleEvent) try { API.onBattleEvent(e); } catch (x) { } if (window.Navi && window.Navi.toast && e.msg) window.Navi.toast(e.msg); }

    /* ---------- shared particle pool (fire, smoke, splash spray, sparks, fireworks) ---------- */
    var N = 900, pp = new Float32Array(N * 3), pc = new Float32Array(N * 3), ps = new Float32Array(N), pv = new Float32Array(N * 3), pl = new Float32Array(N), pm = new Float32Array(N), pg = new Float32Array(N), pi = 0;
    var pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pgeo.setAttribute('color', new THREE.BufferAttribute(pc, 3)); pgeo.setAttribute('size', new THREE.BufferAttribute(ps, 1));
    var pmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC=color; if(size<0.02){ gl_PointSize=0.; gl_Position=vec4(2.,2.,2.,1.); return; } vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*(300./-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(vC*(1.-d*1.6),1.); }'
    });
    var pts = new THREE.Points(pgeo, pmat); pts.frustumCulled = false; grp.add(pts);
    function emit(x, y, z, vx, vy, vz, life, r, g, b, size, grav) {
      var i = pi++ % N; pp[i * 3] = x; pp[i * 3 + 1] = y; pp[i * 3 + 2] = z; pv[i * 3] = vx; pv[i * 3 + 1] = vy; pv[i * 3 + 2] = vz;
      pl[i] = life; pm[i] = life; pc[i * 3] = r; pc[i * 3 + 1] = g; pc[i * 3 + 2] = b; ps[i] = size; pg[i] = grav || 0;
    }
    function tickParticles(dt) {
      for (var i = 0; i < N; i++) {
        if (pl[i] <= 0) { ps[i] = 0; continue; }
        pl[i] -= dt; var k = Math.max(0, pl[i] / pm[i]);
        pv[i * 3 + 1] -= pg[i] * dt; pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
        ps[i] = ps[i] * (0.985) + 0; pc[i * 3] *= 0.985 + k * 0.01; pc[i * 3 + 1] *= 0.975 + k * 0.02; pc[i * 3 + 2] *= 0.97 + k * 0.02;
        if (pl[i] <= 0) ps[i] = 0;
      }
      pgeo.attributes.position.needsUpdate = pgeo.attributes.color.needsUpdate = pgeo.attributes.size.needsUpdate = true;
    }
    function splash(x, z, big) { for (var i = 0; i < (big ? 26 : 12); i++) { var a = Math.random() * 6.283, s = rnd(2, big ? 9 : 5); emit(x, WATER_Y, z, Math.cos(a) * s * 0.6, rnd(4, big ? 12 : 8), Math.sin(a) * s * 0.6, rnd(0.6, 1.1), 0.7, 0.9, 1, rnd(0.6, 1.4), 22); } ringFx(x, z, big ? 7 : 4); }
    function fireBurst(x, y, z, n) { for (var i = 0; i < n; i++) emit(x + rnd(-.4, .4), y, z + rnd(-.4, .4), rnd(-2, 2), rnd(1, 5), rnd(-2, 2), rnd(0.5, 1.2), 1, rnd(0.4, 0.75), 0.1, rnd(1.2, 2.6), -2); }
    function smoke(x, y, z) { emit(x + rnd(-.3, .3), y, z + rnd(-.3, .3), rnd(-.4, .4), rnd(1.2, 2.5), rnd(-.4, .4), rnd(1.2, 2.2), 0.28, 0.27, 0.3, rnd(2, 3.4), -0.3); }

    /* ---------- splash rings ---------- */
    var rings = [], rgeo = new THREE.RingGeometry(0.8, 1, 32); rgeo.rotateX(-Math.PI / 2);
    for (var ri = 0; ri < 14; ri++) { var rm = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xcdf2ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); rm.visible = false; rm.userData.t = 1; grp.add(rm); rings.push(rm); }
    var ringI = 0;
    function ringFx(x, z, size) { var r = rings[ringI++ % rings.length]; r.position.set(x, WATER_Y + 0.05, z); r.userData.t = 0; r.userData.size = size; r.visible = true; }
    function tickRings(dt) { rings.forEach(function (r) { if (!r.visible) return; r.userData.t += dt / 0.9; var t = r.userData.t; if (t >= 1) { r.visible = false; return; } r.scale.setScalar(0.5 + t * r.userData.size); r.material.opacity = (1 - t) * 0.8; }); }

    /* ---------- water ---------- */
    var wU = { uT: { value: 0 } };
    var waterMat = new THREE.ShaderMaterial({
      uniforms: wU, transparent: true, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uT; varying vec2 vP; void main(){ float n=sin(vP.x*.35+uT)*sin(vP.y*.3+uT*1.3)+.5*sin((vP.x+vP.y)*.6-uT*2.)+.25*sin(vP.x*1.3-uT*3.)*sin(vP.y*1.1+uT*2.4); vec3 deep=vec3(.02,.16,.24), shal=vec3(.08,.5,.6); vec3 c=mix(deep,shal,.5+.5*n*.6); c+=smoothstep(.95,1.5,n)*vec3(.8,.95,1.); gl_FragColor=vec4(c,.93); }'
    });
    var water = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), waterMat); water.scale.set(A - 0.5, 1, B - 0.5); water.position.y = WATER_Y; water.visible = false; grp.add(water);

    /* ---------- lava ---------- */
    var lU = { uT: { value: 0 } };
    var lavaMat = new THREE.ShaderMaterial({
      uniforms: lU, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uT; varying vec2 vP; float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } float nz(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); } void main(){ vec2 p=vP*.09; float a=nz(p*3.+vec2(uT*.15,0.))+.5*nz(p*7.-vec2(0.,uT*.22)); float b=nz(p*5.+a*1.6+uT*.1); float v=a*.65+b*.55; float vein=smoothstep(.8,1.02,v); vec3 crust=vec3(.06,.025,.02)+.05*b, hot=mix(vec3(.85,.1,0.),vec3(1.,.7,.1),b); gl_FragColor=vec4(mix(crust,hot,vein)+vec3(.35,.05,0.)*smoothstep(.55,.8,v)*(1.-vein),1.); }'
    });
    var lava = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), lavaMat); lava.scale.set(A - 0.5, 1, B - 0.5); lava.position.y = 0.35; lava.visible = false; grp.add(lava);
    var lavaProps = new THREE.Group(); lavaProps.visible = false; grp.add(lavaProps);
    var obs = new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.6, metalness: 0.3, emissive: 0x3a0a00, emissiveIntensity: 0.5 });
    for (var li = 0; li < 9; li++) { var a0 = li / 9 * 6.283, rr = li === 0 ? 0 : 0.5; var isl = new THREE.Mesh(new THREE.CylinderGeometry(li === 0 ? 7 : 3.4, li === 0 ? 8 : 4, 1.2, 7), obs); isl.position.set(Math.cos(a0) * A * rr * 0.75 * (li ? 1 : 0), 0.5, Math.sin(a0) * B * rr * 0.75 * (li ? 1 : 0)); lavaProps.add(isl); }

    /* ---------- void platforms ---------- */
    var voidG = new THREE.Group(); voidG.visible = false; grp.add(voidG);
    var pit = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x03020a })); pit.scale.set(A - 0.5, 1, B - 0.5); pit.position.y = 0.3; voidG.add(pit);
    var platMat = new THREE.MeshStandardMaterial({ color: 0x2b2450, emissive: 0x6a2cff, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.6 });
    var plats = [];
    for (var vi = 0; vi < 22; vi++) {
      var ang = vi * 2.399, rad = Math.sqrt((vi + 0.5) / 22), pm2 = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.8, 6), platMat.clone());
      pm2.position.set(Math.cos(ang) * (A - 9) * rad, 1.1, Math.sin(ang) * (B - 9) * rad); pm2.userData = { y0: 1.1, state: 'up', t: rnd(2, 9) }; voidG.add(pm2); plats.push(pm2);
    }
    function tickVoid(dt) {
      plats.forEach(function (p) {
        var u = p.userData; u.t -= dt;
        if (u.state === 'up' && u.t <= 0) { u.state = 'shake'; u.t = 1.1; }
        else if (u.state === 'shake') { p.position.x += Math.sin(time * 90) * 0.02; p.material.emissive.setHex(0xff3a2a); if (u.t <= 0) { u.state = 'fall'; u.t = 2.4; u.vy = 0; } }
        else if (u.state === 'fall') { u.vy -= 26 * dt; p.position.y += u.vy * dt; if (u.t <= 0) { u.state = 'gone'; u.t = rnd(2, 4); p.visible = false; } }
        else if (u.state === 'gone' && u.t <= 0) { u.state = 'rise'; u.t = 1.4; p.visible = true; p.position.y = -6; p.material.emissive.setHex(0x6a2cff); }
        else if (u.state === 'rise') { p.position.y += (u.y0 - p.position.y) * Math.min(1, dt * 4); if (u.t <= 0) { u.state = 'up'; u.t = rnd(4, 10); p.position.y = u.y0; } }
      });
    }

    /* ---------- galleys ---------- */
    var woodM = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.85 }), deckM = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.9 }),
      sailBase = new THREE.MeshStandardMaterial({ color: 0xf1e6cc, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x554d3a }), ironM = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5, metalness: 0.7 });
    var hullShape = (function () { var s = new THREE.Shape(), L = 14, W = 4.6; s.moveTo(0, L / 2 + 1.5); s.lineTo(W / 2 * 0.85, L / 4); s.lineTo(W / 2, -L / 6); s.lineTo(W / 2 * 0.8, -L / 2); s.lineTo(-W / 2 * 0.8, -L / 2); s.lineTo(-W / 2, -L / 6); s.lineTo(-W / 2 * 0.85, L / 4); s.lineTo(0, L / 2 + 1.5); return s; })();
    var hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 2.4, bevelEnabled: false }); hullGeo.rotateX(Math.PI / 2);
    var deckGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 0.1, bevelEnabled: false }); deckGeo.rotateX(Math.PI / 2); deckGeo.scale(0.88, 1, 0.9);
    var sailGeo = new THREE.PlaneGeometry(4.4, 5.2, 8, 8); (function () { var p = sailGeo.attributes.position; for (var i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / 4.4 + 0.5) * Math.PI) * 0.7); sailGeo.computeVertexNormals(); })();
    var mastGeo = new THREE.CylinderGeometry(0.14, 0.2, 9, 8), cannonGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.3, 8).rotateZ(Math.PI / 2);
    var oarGeo = (function () { var parts = [], g; for (var i = 0; i < 8; i++) { g = new THREE.BoxGeometry(2.4, 0.06, 0.16); g.translate(1.3, 0, -5 + i * 1.3); parts.push(g); } var m = parts[0].clone(); var pos = [], idx = []; parts.forEach(function (p, j) { var pa = p.attributes.position; for (var k = 0; k < pa.count; k++) pos.push(pa.getX(k), pa.getY(k), pa.getZ(k)); var ia = p.index.array; for (var k2 = 0; k2 < ia.length; k2++) idx.push(ia[k2] + j * pa.count); }); var mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx); mg.computeVertexNormals(); return mg; })();
    var ships = [], shipGroup = new THREE.Group(); shipGroup.visible = false; grp.add(shipGroup);
    function makeShip(team, color) {
      var g = new THREE.Group(), hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 })); hull.position.y = 1.7; g.add(hull);
      var trim = new THREE.Mesh(hullGeo, woodM); trim.scale.set(1.02, 0.18, 1.02); trim.position.y = 1.72; g.add(trim);
      var deck = new THREE.Mesh(deckGeo, deckM); deck.position.y = 1.62; g.add(deck);
      var castle = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 3), woodM); castle.position.set(0, 2.3, -5.2); g.add(castle);
      var ram = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 6), ironM); ram.rotation.x = Math.PI / 2; ram.position.set(0, 0.7, 8.4); g.add(ram);
      [[0, 4.7, 2.2], [0, 4.7, -2.4]].forEach(function (mp, i) {
        var m = new THREE.Mesh(mastGeo, woodM); m.position.set(mp[0], mp[1], mp[2]); g.add(m);
        var sm = sailBase.clone(); sm.color.set(new THREE.Color(color).lerp(new THREE.Color(0xf1e6cc), 0.55)); var s = new THREE.Mesh(sailGeo, sm); s.position.set(0, 6.0, mp[2] + 0.2); s.userData.sail = true; g.add(s);
      });
      var flagM = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }); var flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), flagM); flag.position.set(0.9, 9.4, 2.2); g.add(flag);
      var lan = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a })); lan.position.set(0, 3.6, -6.4); g.add(lan);
      var cannons = []; [-1, 1].forEach(function (side) { for (var c = 0; c < 3; c++) { var cn = new THREE.Mesh(cannonGeo, ironM); cn.position.set(side * 2.55, 2.0, -2.6 + c * 2.6); g.add(cn); cannons.push({ m: cn, side: side, z: -2.6 + c * 2.6, cd: rnd(0, 3) }); } });
      var oars = [-1, 1].map(function (side) { var o = new THREE.Mesh(oarGeo, woodM); o.position.set(side * 2.3, 1.2, 0); if (side < 0) o.scale.x = -1; g.add(o); return o; });
      g.userData = { team: team, hp: 100, x: 0, z: 0, h: 0, sp: 0, state: 'sail', sink: 0, oars: oars, cannons: cannons, id: ships.length, flag: flag, phase: rnd(0, 6) };
      shipGroup.add(g); ships.push(g); return g;
    }
    var TEAM = { A: 0x18b8d8, B: 0xc4302e };
    for (var si = 0; si < 3; si++) { makeShip('A', TEAM.A); makeShip('B', TEAM.B); }
    var balls = []; var ballGeo = new THREE.SphereGeometry(0.32, 8, 8), ballMat = new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.8, roughness: 0.4 });
    for (var bi = 0; bi < 30; bi++) { var bm = new THREE.Mesh(ballGeo, ballMat); bm.visible = false; bm.userData = { live: false, vx: 0, vy: 0, vz: 0, team: '' }; shipGroup.add(bm); balls.push(bm); }
    var battle = { over: true, t: 0, rematch: 0 };
    function resetBattle() {
      var a = 0, b = 0; API.state.round++;
      ships.forEach(function (s) {
        var u = s.userData, side = u.team === 'A' ? -1 : 1, i = u.team === 'A' ? a++ : b++;
        u.x = side * (A * 0.62); u.z = (i - 1) * 16; u.h = side < 0 ? Math.PI / 2 : -Math.PI / 2; u.sp = 0; u.hp = 100; u.state = 'sail'; u.sink = 0; s.visible = true; s.rotation.set(0, u.h, 0); u.cannons.forEach(function (c) { c.cd = rnd(1, 4); });
      });
      battle.over = false; battle.t = 0; evt({ type: 'round', round: API.state.round, msg: 'NAVAL BATTLE — round ' + API.state.round });
      if (arena.setCrowdMood) arena.setCrowdMood(0.6);
    }
    function fireCannon(s, c, target) {
      var u = s.userData, ball = balls.filter(function (b) { return !b.userData.live; })[0]; if (!ball) return;
      var cos = Math.cos(u.h), sin = Math.sin(u.h), lx = c.side * 2.55, lz = c.z;   // ship local -> world (heading h: forward = (sin h, cos h))
      var wx = u.x + lx * cos + lz * sin, wz = u.z - lx * sin + lz * cos, tx = target.userData.x + rnd(-2.5, 2.5), tz = target.userData.z + rnd(-2.5, 2.5), dx = tx - wx, dz = tz - wz, d = Math.hypot(dx, dz), T = Math.max(0.6, d / 32);
      ball.position.set(wx, 2.3, wz); ball.userData = { live: true, vx: dx / T, vz: dz / T, vy: (0 - 2.3) / T + 0.5 * 18 * T, team: u.team, from: u.id }; ball.visible = true;
      fireBurst(wx, 2.3, wz, 10); smoke(wx, 2.4, wz); smoke(wx, 2.4, wz); evt({ type: 'fire', team: u.team });
    }
    function damage(s, dmg, x, z) {
      var u = s.userData; if (u.state !== 'sail') return; u.hp -= dmg; fireBurst(x, 2.5, z, 16); smoke(x, 2.8, z); evt({ type: 'hit', team: u.team, hp: u.hp });
      if (u.hp <= 0) { u.state = 'sink'; u.sink = 0; evt({ type: 'sink', team: u.team, msg: (u.team === 'A' ? 'CYAN' : 'CRIMSON') + ' GALLEY SUNK' }); for (var i = 0; i < 40; i++) fireBurst(x + rnd(-3, 3), rnd(1, 4), z + rnd(-4, 4), 1); }
    }
    function tickNaval(dt) {
      var alive = { A: 0, B: 0 };
      ships.forEach(function (s) {
        var u = s.userData; if (u.state === 'sink') {
          u.sink += dt; s.position.y = WATER_Y + 0.1 - u.sink * 0.9; s.rotation.z = Math.min(0.9, u.sink * 0.3); s.rotation.x = Math.min(0.5, u.sink * 0.15); if (u.sink > 1.5 && Math.random() < 0.3) splash(u.x + rnd(-3, 3), u.z + rnd(-3, 3), false); if (u.sink > 5) { s.visible = false; u.state = 'dead'; } return;
        }
        if (u.state !== 'sail') return; alive[u.team]++;
        var foe = null, fd = 1e9; ships.forEach(function (o) { if (o.userData.team !== u.team && o.userData.state === 'sail') { var d = Math.hypot(o.userData.x - u.x, o.userData.z - u.z); if (d < fd) { fd = d; foe = o; } } });
        if (foe) {
          var f = foe.userData, ang = Math.atan2(f.x - u.x, f.z - u.z), want = ang + (fd > 30 ? 0 : (u.id % 2 ? 1 : -1) * Math.PI / 2);   // close in, then present a broadside
          var da = Math.atan2(Math.sin(want - u.h), Math.cos(want - u.h)); u.h += Math.max(-0.5 * dt, Math.min(0.5 * dt, da));
          u.sp += ((fd > 22 ? 5.5 : 2.5) - u.sp) * dt * 0.8;
        }
        ships.forEach(function (o) { if (o !== s && o.userData.state === 'sail') { var dx = u.x - o.userData.x, dz = u.z - o.userData.z, d = Math.hypot(dx, dz); if (d < 12 && d > 0.01) { u.x += dx / d * (12 - d) * dt * 1.2; u.z += dz / d * (12 - d) * dt * 1.2; } } });
        var ex = u.x / (A - 10), ez = u.z / (B - 10), e = ex * ex + ez * ez; if (e > 1) { u.h += 0.9 * dt * (Math.sin(Math.atan2(-u.x, -u.z) - u.h) > 0 ? 1 : -1); u.sp = Math.min(u.sp, 2.5); }
        u.x += Math.sin(u.h) * u.sp * dt; u.z += Math.cos(u.h) * u.sp * dt;
        var bob = Math.sin(time * 1.6 + u.phase);
        s.position.set(u.x, WATER_Y + 0.1 + bob * 0.12, u.z); s.rotation.set(Math.sin(time * 1.2 + u.phase) * 0.03, u.h, Math.sin(time * 1.4 + u.phase) * 0.05 + (u.hp < 40 ? 0.12 : 0));
        u.oars.forEach(function (o, i) { o.rotation.y = Math.sin(time * 4 + i * 2.1) * 0.35 * (u.sp / 5.5 + 0.2); });
        u.flag.rotation.y = Math.sin(time * 6 + u.phase) * 0.4;
        if (u.sp > 1 && Math.random() < 0.5) { emit(u.x - Math.sin(u.h) * 7.5 + rnd(-1.6, 1.6), WATER_Y + 0.1, u.z - Math.cos(u.h) * 7.5 + rnd(-1.6, 1.6), rnd(-.2, .2), rnd(.3, .9), rnd(-.2, .2), rnd(.7, 1.3), 0.75, 0.9, 1, rnd(1, 1.8), 0); }
        if (u.hp < 55 && Math.random() < 0.25) { smoke(u.x + rnd(-2, 2), 4, u.z + rnd(-3, 3)); if (u.hp < 30) fireBurst(u.x + rnd(-2, 2), 3, u.z + rnd(-3, 3), 1); }
        if (foe && fd < 46) u.cannons.forEach(function (c) {
          c.cd -= dt; if (c.cd > 0) return; var toFoe = Math.atan2(foe.userData.x - u.x, foe.userData.z - u.z), rel = Math.atan2(Math.sin(toFoe - u.h), Math.cos(toFoe - u.h)), sideAng = c.side * Math.PI / 2;   // gun fires out its own side
          if (Math.abs(Math.atan2(Math.sin(rel - sideAng * -1), Math.cos(rel - sideAng * -1))) < 0.9 || Math.abs(rel) > 0.2 && Math.sign(rel) === Math.sign(c.side) * -1 && Math.abs(rel) > 0.7) { fireCannon(s, c, foe); c.cd = rnd(3, 6); } else c.cd = 0.4;
        });
      });
      balls.forEach(function (b) {
        var d = b.userData; if (!d.live) return; d.vy -= 18 * dt; b.position.x += d.vx * dt; b.position.y += d.vy * dt; b.position.z += d.vz * dt;
        if (Math.random() < 0.6) smoke(b.position.x, b.position.y, b.position.z);
        for (var i = 0; i < ships.length; i++) { var o = ships[i], ou = o.userData; if (ou.team === d.team || ou.state !== 'sail') continue; if (Math.hypot(b.position.x - ou.x, b.position.z - ou.z) < 4.2 && b.position.y < 5) { damage(o, 12 + Math.random() * 8, b.position.x, b.position.z); d.live = false; b.visible = false; return; } }
        if (b.position.y < WATER_Y) { splash(b.position.x, b.position.z, true); d.live = false; b.visible = false; }
      });
      if (!battle.over && (alive.A === 0 || alive.B === 0)) {
        battle.over = true; battle.rematch = 9; var w = alive.A ? 'A' : (alive.B ? 'B' : null);
        if (w) { API.state.score[w]++; evt({ type: 'win', team: w, msg: (w === 'A' ? 'CYAN' : 'CRIMSON') + ' FLEET WINS  ' + API.state.score.A + ' – ' + API.state.score.B }); if (arena.setCrowdMood) arena.setCrowdMood(1); }
      }
      if (battle.over) { battle.rematch -= dt; if (Math.random() < 0.5 && battle.rematch > 3) { var fa = rnd(0, 6.283), fr = rnd(8, 20), fc = Math.random() < 0.5 ? [1, 0.3, 0.2] : [0.3, 0.8, 1]; for (var q = 0; q < 24; q++) { var qa = q / 24 * 6.283; emit(Math.cos(fa) * fr, rnd(14, 24), Math.sin(fa) * fr, Math.cos(qa) * 7, Math.sin(qa) * 7 + 2, Math.sin(qa * 3) * 4, rnd(1, 1.6), fc[0], fc[1], fc[2], 2.6, 6); } } if (battle.rematch <= 0) resetBattle(); }
    }

    /* ---------- lava plumes ---------- */
    function tickLava(dt) { if (Math.random() < 0.35) { var x = rnd(-A * 0.85, A * 0.85), z = rnd(-B * 0.85, B * 0.85); if ((x / A) * (x / A) + (z / B) * (z / B) < 0.8) for (var i = 0; i < 10; i++) emit(x, 0.5, z, rnd(-2, 2), rnd(6, 15), rnd(-2, 2), rnd(0.8, 1.6), 1, rnd(0.3, 0.6), 0.05, rnd(1.4, 2.8), 14); if (Math.random() < 0.5) smoke(x, 4, z); } }

    /* ---------- mode switching ---------- */
    function hideAll() { water.visible = lava.visible = false; lavaProps.visible = voidG.visible = shipGroup.visible = false; balls.forEach(function (b) { b.visible = false; b.userData.live = false; }); for (var i = 0; i < N; i++) { pl[i] = 0; ps[i] = 0; } }
    function apply(name) {
      hideAll(); mode = name; API.state.mode = name; arena.floorMesh.visible = true;
      if (name === 'water') { arena.floorMesh.visible = true; water.visible = true; shipGroup.visible = API.autoBattle !== false; if (API.autoBattle !== false) resetBattle(); }
      else if (name === 'lava') { lava.visible = true; lavaProps.visible = true; }
      else if (name === 'void') { voidG.visible = true; plats.forEach(function (p) { p.visible = true; p.position.y = p.userData.y0; p.userData.state = 'up'; p.userData.t = rnd(2, 9); p.material.emissive.setHex(0x6a2cff); }); }
      else if (name === 'grass' || name === 'ice') { paint(name); }
    }
    function paint(name) {
      var mat = arena.floorMesh.material, fc = document.createElement('canvas'); fc.width = 512; fc.height = Math.round(512 * B / A); var x = fc.getContext('2d');
      x.fillStyle = name === 'grass' ? '#2c7a34' : '#bfe6f5'; x.fillRect(0, 0, fc.width, fc.height);
      for (var i = 0; i < 6000; i++) { x.fillStyle = name === 'grass' ? 'rgba(' + (20 + Math.random() * 40) + ',' + (110 + Math.random() * 70) + ',40,.35)' : 'rgba(255,255,255,' + Math.random() * .25 + ')'; x.fillRect(Math.random() * fc.width, Math.random() * fc.height, 3, 3); }
      var t = new THREE.CanvasTexture(fc); t.colorSpace = THREE.SRGBColorSpace; arena.__floorTexBackup = arena.__floorTexBackup || mat.map; mat.map = t; mat.needsUpdate = true;
    }
    function clear() { if (mode) { hideAll(); mode = null; API.state.mode = null; if (arena.__floorTexBackup) { arena.floorMesh.material.map = arena.__floorTexBackup; arena.floorMesh.material.needsUpdate = true; } } }
    API.apply = apply; API.clear = clear; API.handles = function (m) { return MODES.indexOf(m) >= 0; };
    API.tick = function (dt) {
      if (!mode || !root.parent || !root.parent.visible) return; time += dt; wU.uT.value = time; lU.uT.value = time;
      if (mode === 'water') { if (API.autoBattle !== false) tickNaval(dt); } else if (mode === 'lava') tickLava(dt); else if (mode === 'void') tickVoid(dt);
      tickParticles(dt); tickRings(dt);
    };
    arena.floors = API; arena.__floorHook = API.tick;
    return API;
  }
  window.ColosseumFloors = { attach: attach, modes: MODES };
})();

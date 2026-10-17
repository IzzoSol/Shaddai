/* world-colosseum-hoverleague.js — HOVER LEAGUE in the Colosseum (owner 2026-10-15): a field mode like the naval battle. Rules live in
 * world-hoverleague-core.js (pure, tested); this file builds the look in arena.root (METRES, root.scale = U) and glues the player's board.
 *   var hl = HoverLeague.create({ THREE, GLTFLoader, getArena, getHover, getPlayerPos, enter, makeBotRider? })
 *   makeBotRider(i, team) -> Promise<{ hover, avatar }>: a full world-hoverboard instance + a rigged agent (host-built) so bots ride with
 *   the same rider IK, moves and actions as the player; without it bots use code placeholders.
 *   hl.open()              -> picker (mode League/Paint · ball Regular/Plasma/Inferno/Void/Solar · 1v1/2v2/3v3) then the match
 *   hl.start({mode, ball, size})   hl.stop()   hl.active()
 *   hl.update(dt)          every frame (host): reads the board, steps the rules, drives the view + HUD
 *   hl.heightAtWorld(x,z)  rim quarter-pipe height (WORLD units) for the board while a match runs (NaN outside the field)
 *   hl.worldWalls()        rim faces (WORLD units) for world-hoverboard-wallride
 * Controls in a match: ride as usual (WASD, Shift boost, Space jump); ATTACK = F or left mouse: shoot the ball you hold, else fire a bolt.
 * Look: obsidian quarter-pipe rim with team neon lanes, faint hex energy barrier, Cyon (east, cyan) vs Magma (west, magenta) floor halves,
 * Blender K26 goals/pads/pedestals/dais (shaddai_hover_league_v01.glb), energy-ball shader (refs: solar gold+blue lightning, void purple
 * crackle + crystal shards, plasma cyan lightning). ?hl=0 disables.
 */
(function (root) {
  'use strict';
  var Core = root.HoverLeagueCore;
  var TEAM = { cyon: 0x27E0FF, magma: 0xFF3FA4 };
  var BALL_LOOK = {
    shaddai: { a: 0x06261A, b: 0x00FF9C, core: 0xFFF6D8, energy: true, gold: true },   // our own: obsidian core, emerald lightning, gold rim
    regular: { a: 0xDDE6EE, b: 0x9FD8FF, core: 0xFFFFFF, energy: false },
    plasma: { a: 0x0FA9D6, b: 0x7DF4FF, core: 0xF2FFFF, energy: true },
    inferno: { a: 0xD8360A, b: 0xFFB15A, core: 0xFFF2C8, energy: true },
    void: { a: 0x3B0F8A, b: 0xE04BFF, core: 0xF0C8FF, energy: true, shards: true },
    solar: { a: 0xF0A818, b: 0x8FD8FF, core: 0xFFFBE8, energy: true }
  };
  var NOISE = 'vec3 h3(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453)*2.-1.;}' +
    'float n3(vec3 p){vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(mix(dot(h3(i),f),dot(h3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(h3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(h3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),' +
    'mix(mix(dot(h3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(h3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(h3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(h3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);}';

  function create(o) {
    var THREE = o.THREE, L = null, layoutP = null, kitP = null, KIT = {};
    var G = null, arena = null, game = null, human = null, active = false, view = null, hud = null, attackQ = false, opts = { mode: 'league', ball: 'shaddai', size: 2 };
    var savedWalls = null, U = 7 / 1.8, t = 0, paintT = 0;

    function getLayout() { if (!layoutP) layoutP = fetch('/assets/world/hoverleague-layout.json').then(function (r) { return r.json(); }).then(function (j) { L = j; return j; }); return layoutP; }
    function getKit() {
      if (kitP) return kitP;
      kitP = new Promise(function (res) {
        if (!o.GLTFLoader) return res(KIT);
        new o.GLTFLoader().load('/assets/kits/shaddai_hover_league_v01.glb', function (gl) { gl.scene.traverse(function (c) { if (/^hl_[a-z_]+$/.test(c.name) && !KIT[c.name]) KIT[c.name] = c; }); res(KIT); }, undefined, function () { console.warn('[hoverleague] K26 kit missing, code props'); res(KIT); });
      });
      return kitP;
    }

    // ───────────── view ─────────────
    function mat(c, e, extra) { var m = new THREE.MeshStandardMaterial(Object.assign({ color: c, emissive: e != null ? e : 0, emissiveIntensity: e != null ? 1 : 0, metalness: 0.7, roughness: 0.35 }, extra || {})); return m; }
    function rimMesh() {
      var S = 192, NP = 14, A = L.A, B = L.B, QW = L.QP_W, QH = L.QP_H, pos = [], col = [], idx = [];
      function rimH(d) { var u = (QW - d) / QW; return QH * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
      for (var i = 0; i <= S; i++) {
        var a = 2 * Math.PI * i / S, x0 = Math.cos(a), z0 = Math.sin(a), team = x0 >= 0 ? TEAM.cyon : TEAM.magma, tc = new THREE.Color(team);
        for (var j = 0; j <= NP; j++) {
          var d = QW * (1 - j / NP), x = (A - d) * x0, z = (B - d) * z0, inTun = L.tunnelHalf && Math.abs(x) < L.tunnelHalf && z > 0;
          pos.push(x, inTun ? 0.02 : rimH(d), z);
          var lane = (j === 4 || j === 9) && (i % 6) < 4, edge = j === NP;     // dashed team lanes + gold lip (Ironreach ref)
          var c = edge ? new THREE.Color(0xE8C45C).multiplyScalar(2.2) : lane ? tc.clone().multiplyScalar(2.4) : new THREE.Color(0x0d1117);
          col.push(c.r, c.g, c.b);
        }
      }
      for (i = 0; i < S; i++) for (j = 0; j < NP; j++) { var p0 = i * (NP + 1) + j, p1 = (i + 1) * (NP + 1) + j; idx.push(p0, p1, p1 + 1, p0, p1 + 1, p0 + 1); }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      var m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.32, side: THREE.DoubleSide });
      m.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += max(vColor.rgb - 1.0, 0.0) * 1.6;'); };
      return new THREE.Mesh(g, m);
    }
    function barrierMesh() {
      var S = 160, A = L.A, B = L.B, y0 = L.QP_H, y1 = L.QP_H + L.BAR_H, pos = [], uv = [], idx = [];
      for (var i = 0; i <= S; i++) { var a = 2 * Math.PI * i / S; pos.push(A * Math.cos(a), y0, B * Math.sin(a), A * Math.cos(a), y1, B * Math.sin(a)); uv.push(i / S, 0, i / S, 1); }
      for (i = 0; i < S; i++) { var k = i * 2; idx.push(k, k + 2, k + 3, k, k + 3, k + 1); }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      var m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 }, cA: { value: new THREE.Color(TEAM.cyon) }, cB: { value: new THREE.Color(TEAM.magma) } },
        vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform float uT; uniform vec3 cA,cB; varying vec2 vUv; varying vec3 vP; void main(){ vec2 p=vec2(vUv.x*220., vUv.y*7.); vec2 q=vec2(p.x+mod(floor(p.y),2.)*.5,p.y); vec2 f=abs(fract(q)-.5);' +
          'float hex=smoothstep(.46,.5,max(f.x,f.y)); float scan=smoothstep(.97,1.,fract(vUv.y*2.-uT*.25)); float edge=smoothstep(.0,.06,vUv.y)*smoothstep(1.,.85,vUv.y); vec3 c=vP.x>0.?cA:cB;' +
          'float a=(hex*.18+scan*.35+(1.-smoothstep(.0,.08,vUv.y))*.6+smoothstep(.93,1.,vUv.y)*.7)*edge+.025; gl_FragColor=vec4(c*a,1.); }' });
      return new THREE.Mesh(g, m);
    }
    function floorCanvas() {
      var W = 1024, H = Math.round(1024 * L.B / L.A), cv = document.createElement('canvas'); cv.width = W; cv.height = H; var x = cv.getContext('2d');
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      function px(m) { return (m + L.A) / (2 * L.A) * W; } function pz(m) { return (m + L.B) / (2 * L.B) * H; }
      function base() {
        x.fillStyle = '#05070b'; x.fillRect(0, 0, W, H);
        x.fillStyle = 'rgba(39,224,255,0.10)'; x.fillRect(W / 2, 0, W / 2, H); x.fillStyle = 'rgba(255,63,164,0.10)'; x.fillRect(0, 0, W / 2, H);
        x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 1; for (var g = -L.A; g <= L.A; g += 4) { x.beginPath(); x.moveTo(px(g), 0); x.lineTo(px(g), H); x.stroke(); } for (g = -L.B; g <= L.B; g += 4) { x.beginPath(); x.moveTo(0, pz(g)); x.lineTo(W, pz(g)); x.stroke(); }
        x.strokeStyle = '#E8C45C'; x.lineWidth = 3; x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
        x.beginPath(); x.arc(W / 2, H / 2, (12 / (2 * L.A)) * W, 0, 6.283); x.stroke();
        [[1, '#27E0FF'], [-1, '#FF3FA4']].forEach(function (s) { x.strokeStyle = s[1]; x.lineWidth = 4; x.beginPath(); x.arc(px(s[0] * 52), H / 2, (14 / (2 * L.A)) * W, s[0] > 0 ? Math.PI / 2 : -Math.PI / 2, s[0] > 0 ? Math.PI * 1.5 : Math.PI / 2); x.stroke(); });
        x.font = '900 52px "Chakra Petch",system-ui,sans-serif'; x.textAlign = 'center'; x.globalAlpha = 0.5;
        x.fillStyle = '#27E0FF'; x.fillText('CYON', px(26), pz(4)); x.fillStyle = '#FF3FA4'; x.fillText('MAGMA', px(-26), pz(4)); x.globalAlpha = 1;
        tex.needsUpdate = true;
      }
      function paintCells(pg, cells) {
        var cw = pg.cell / (2 * L.A) * W, ch = pg.cell / (2 * L.B) * H;
        for (var k = 0; k < cells.length; k++) { var c = cells[k], i = c % pg.GX, j = (c / pg.GX) | 0, v = pg.grid[c]; x.fillStyle = v === 1 ? 'rgba(39,224,255,0.55)' : 'rgba(255,63,164,0.55)'; x.fillRect(i * cw + 0.5, j * ch + 0.5, cw - 1, ch - 1); }
        tex.needsUpdate = true;
      }
      base(); return { tex: tex, base: base, paintCells: paintCells };
    }
    function ballMesh(kind) {
      var look = BALL_LOOK[kind] || BALL_LOOK.regular, r = (L.ball && L.ball.r) || 1.3, g = new THREE.Group(); g.name = 'hl-ball';
      if (!look.energy) {
        var src = KIT.hl_ball;
        var shell = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), mat(0xC9D3DC, null, { metalness: 1, roughness: 0.16 }));
        g.add(shell); [0, 1, 2].forEach(function (k) { var bd = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, 0.06, 6, 64), new THREE.MeshBasicMaterial({ color: look.b, toneMapped: false })); if (k === 1) bd.rotation.x = Math.PI / 2; if (k === 2) bd.rotation.y = Math.PI / 2; g.add(bd); });
        var cap = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); cap.position.y = r * 0.84; cap.rotation.x = Math.PI / 2; g.add(cap);
        void src; g.userData.tick = function () { }; return g;
      }
      var U_ = { uT: { value: 0 }, cA: { value: new THREE.Color(look.a) }, cB: { value: new THREE.Color(look.b) }, cC: { value: new THREE.Color(look.core) }, uK: { value: kind === 'void' ? 1 : 0 } };
      var core = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.ShaderMaterial({ uniforms: U_, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vN,vV,vP; void main(){ vP=position; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
        fragmentShader: 'uniform float uT,uK; uniform vec3 cA,cB,cC; varying vec3 vN,vV,vP; ' + NOISE +
          'void main(){ float ndv=clamp(dot(vN,vV),0.,1.); float rim=pow(1.-ndv,2.2); float center=pow(ndv,6.);' +
          'vec3 p=normalize(vP)*2.2; float n1=n3(p+vec3(0.,uT*.9,0.)), n2=n3(p*2.1-vec3(uT*.7,0.,uT*.4));' +
          'float vein=pow(1.-abs(n1),18.)+.6*pow(1.-abs(n2),22.); float spark=step(.985,fract(sin(dot(floor(p*9.+uT*3.),vec3(12.9,78.2,37.7)))*43758.5));' +
          'vec3 body=mix(cA*.55,cA,ndv)*mix(.75,.35,uK); vec3 c=body+cB*vein*2.4+cC*center*2.6+cB*rim*1.4+cC*spark*.8;' +
          'gl_FragColor=vec4(c,1.); }' }));
      g.add(core);
      var halo = new THREE.Mesh(new THREE.SphereGeometry(r * 1.55, 32, 20), new THREE.ShaderMaterial({ uniforms: U_, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 vN,vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
        fragmentShader: 'uniform vec3 cA,cB; uniform float uT; varying vec3 vN,vV; void main(){ float f=pow(clamp(-dot(vN,vV),0.,1.),2.6); gl_FragColor=vec4(mix(cA,cB,.4)*f*(1.1+.25*sin(uT*9.)),1.); }' }));
      g.add(halo);
      if (look.gold) { var gr = new THREE.Mesh(new THREE.TorusGeometry(r * 1.32, 0.05, 6, 64), new THREE.MeshBasicMaterial({ color: 0xE8C45C, toneMapped: false })); gr.rotation.x = Math.PI / 2.4; g.add(gr); var gr2 = gr.clone(); gr2.rotation.set(Math.PI / 2, 0.7, 0); g.add(gr2); }
      var arcs = [];   // crackle arcs: short jagged lines re-rolled every few frames
      var arcMat = new THREE.LineBasicMaterial({ color: look.b, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false });
      for (var ai = 0; ai < 5; ai++) { var ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3)); var ln = new THREE.Line(ag, arcMat); g.add(ln); arcs.push(ln); }
      var shards = null;
      if (look.shards) {
        shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0).scale(0.45, 2.2, 0.45), new THREE.MeshBasicMaterial({ color: 0xB98CFF, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, toneMapped: false }), 18);
        shards.userData.dirs = []; for (var si = 0; si < 18; si++) { var v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); shards.userData.dirs.push({ v: v, s: Math.random() * 6.28 }); }
        g.add(shards);
      }
      var dm = new THREE.Object3D(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      g.userData.tick = function (dt, T) {
        U_.uT.value = T; g.rotation.y += dt * 0.8; g.rotation.x += dt * 0.35;
        if (((T * 30) | 0) % 3 === 0) arcs.forEach(function (ln) {
          var a = ln.geometry.attributes.position.array, d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), side = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(d).normalize();
          for (var k = 0; k < 8; k++) { var tt = k / 7, rr = r * (1.0 + 0.45 * Math.sin(tt * Math.PI)), p = d.clone().applyAxisAngle(side, (tt - 0.5) * 1.1).multiplyScalar(rr); p.addScaledVector(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.18); a[k * 3] = p.x; a[k * 3 + 1] = p.y; a[k * 3 + 2] = p.z; }
          ln.geometry.attributes.position.needsUpdate = true; ln.visible = Math.random() < 0.8;
        });
        if (shards) for (var k = 0; k < 18; k++) { var sd = shards.userData.dirs[k], pulse = r * (1.25 + 0.35 * (0.5 + 0.5 * Math.sin(T * 3 + sd.s))); dm.position.copy(sd.v).multiplyScalar(pulse); q.setFromUnitVectors(up, sd.v); dm.quaternion.copy(q); dm.updateMatrix(); shards.setMatrixAt(k, dm.matrix); }
        if (shards) shards.instanceMatrix.needsUpdate = true;
      };
      return g;
    }
    function riderMesh(team) {   // placeholder rider until the rider rig pass (owner order: rig characters on the board next)
      var g = new THREE.Group(), m = mat(0x111820, TEAM[team], { emissiveIntensity: 0.35 }), body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10), m); body.position.y = 1.05; g.add(body);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10), mat(0x1a222c, TEAM[team], { emissiveIntensity: 0.6 })); head.position.y = 1.85; g.add(head);
      var visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: TEAM[team], toneMapped: false })); visor.position.set(0, 1.87, 0.2); g.add(visor);
      return g;
    }
    function prop(name, fallback) { var k = KIT[name]; if (k) { var c = k.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); return c; } return fallback(); }
    function tint(obj, color) { obj.traverse(function (c) { if (!c.isMesh) return; var ms = Array.isArray(c.material) ? c.material : [c.material]; ms = ms.map(function (m) { if (!m || !/hl_team|hl_net/.test(m.name)) return m; var n = m.clone(); n.color && n.color.setHex(color); if (n.emissive) n.emissive.setHex(color); return n; }); c.material = Array.isArray(c.material) ? ms : ms[0]; }); }

    function buildView() {
      var V = { group: new THREE.Group(), pads: [], ups: [], bots: {}, riders: {}, bolts: [] }; V.group.name = 'hover-league';
      V.group.add(rimMesh()); V.barrier = barrierMesh(); V.group.add(V.barrier);
      V.floor = floorCanvas();
      var fl = new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.MeshStandardMaterial({ map: V.floor.tex, metalness: 0.55, roughness: 0.3, emissive: 0xffffff, emissiveMap: V.floor.tex, emissiveIntensity: 0.55 }));
      fl.rotation.x = -Math.PI / 2; fl.scale.set(L.A - L.QP_W + 0.2, L.B - L.QP_W + 0.2, 1); fl.position.y = 0.03; V.group.add(fl);
      fl.geometry.attributes.uv.array.forEach(function (_, i, arr) { if (i % 2 === 0) { var px = fl.geometry.attributes.position.array[(i / 2) * 3], py = fl.geometry.attributes.position.array[(i / 2) * 3 + 1]; arr[i] = (px * (L.A - L.QP_W + 0.2) + L.A) / (2 * L.A); arr[i + 1] = 1 - ((-py * (L.B - L.QP_W + 0.2)) + L.B) / (2 * L.B); } });
      fl.geometry.attributes.uv.needsUpdate = true;
      L.goals.forEach(function (gd) {
        var g = prop('hl_goal_hoop', function () { var h = new THREE.Group(); var ring = new THREE.Mesh(new THREE.TorusGeometry(gd.r, 0.32, 10, 48), new THREE.MeshBasicMaterial({ color: TEAM[gd.team], toneMapped: false })); ring.rotation.y = Math.PI / 2; ring.position.y = gd.y; h.add(ring); return h; });
        tint(g, TEAM[gd.team]); g.position.set(gd.x, 0, gd.z); g.rotation.y = gd.x > 0 ? 0 : Math.PI; V.group.add(g);
      });
      game.state.pads.forEach(function (pd) {
        var g = prop(pd.big ? 'hl_boost_big' : 'hl_boost_small', function () { return new THREE.Mesh(new THREE.CylinderGeometry(pd.big ? 2 : 0.9, pd.big ? 2 : 0.9, 0.2, 16), new THREE.MeshBasicMaterial({ color: 0xE8C45C })); });
        g.position.set(pd.x, 0, pd.z); g.rotation.y = Math.random() * 6.28; V.group.add(g); V.pads.push({ g: g, orb: g.getObjectByName ? (g.children.filter(function (c) { return /orb/.test(c.name); })[0] || null) : null });
      });
      game.state.ups.forEach(function (u) {
        var g = prop('hl_powerup', function () { return new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0x222831 })); });
        g.position.set(u.x, 0, u.z); V.group.add(g); V.ups.push({ g: g, cube: g.children.filter(function (c) { return /cube/.test(c.name); })[0] || null });
      });
      var dais = prop('hl_dais', function () { return new THREE.Mesh(new THREE.CylinderGeometry(5, 4.7, 0.25, 48), new THREE.MeshBasicMaterial({ color: 0x0b0e13 })); }); dais.position.set(L.dais.x, 0, L.dais.z); V.group.add(dais);
      V.ball = ballMesh(opts.ball); V.group.add(V.ball);
      V.light = new THREE.PointLight(new THREE.Color((BALL_LOOK[opts.ball] || BALL_LOOK.regular).b), 2.2, 18, 2); V.group.add(V.light);
      game.state.players.forEach(function (p) {
        if (!p.bot) return; var g = new THREE.Group();
        var kitB = root.HoverboardKit ? root.HoverboardKit.build(THREE, ['bluejet', 'racer', 'redline', 'sunburst', 'batwing', 'obsidian'][Object.keys(V.bots).length % 6], { glow: TEAM[p.team], trim: TEAM[p.team] }) : new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 1.8), mat(0x222, TEAM[p.team]));
        kitB.position.y = 0.3; g.add(kitB); var rd = riderMesh(p.team); rd.position.y = 0.42; g.add(rd); g.userData.rider = rd; V.group.add(g); V.bots[p.id] = g;
        if (o.makeBotRider) {
          var idx = Object.keys(V.bots).length - 1;
          Promise.resolve(o.makeBotRider(idx, p.team)).then(function (r) {
            if (!r || !r.hover || view !== V) { if (r && r.hover && view !== V) { r.hover.dispose(); if (r.avatar && r.avatar.parent) r.avatar.parent.remove(r.avatar); } return; }
            try { if (r.hover.setStyle) r.hover.setStyle(['bluejet', 'racer', 'redline', 'sunburst', 'batwing', 'obsidian'][idx % 6], { glow: TEAM[p.team], trim: TEAM[p.team], accent: TEAM[p.team] }); } catch (_) { }
            var w = toWorld(p.x, p.y, p.z); r.hover.mount(r.avatar, { yaw: p.psi }); var hs = r.hover.state(); hs.x = w.x; hs.z = w.z; hs.y = w.y + 0.35 * U;
            V.riders[p.id] = r; g.visible = false; g.userData.real = true;
          }).catch(function (e) { console.warn('[hoverleague] bot rider failed', e && e.message); });
        }
      });
      var saveL = L.ball; L.ball = Object.assign({}, L.ball, { r: 0.42 });             // attack orbs: mini energy balls (owner refs) - cyon plasma, magma void
      for (var bi = 0; bi < 16; bi++) { var bm = ballMesh(bi % 2 ? 'void' : 'plasma'); bm.userData.kind = bi % 2 ? 'magma' : 'cyon'; bm.visible = false; V.group.add(bm); V.bolts.push(bm); }
      L.ball = saveL;
      V.fx = []; return V;
    }
    function burst(x, y, z, color, n, speed) {   // tiny pooled spark burst (goals, demos, hits)
      var geo = new THREE.BufferGeometry(), N = n || 60, p = new Float32Array(N * 3), v = [];
      for (var i = 0; i < N; i++) { p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar((speed || 12) * (0.4 + Math.random()))); }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: color, size: 0.45, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      view.group.add(pts); view.fx.push({ pts: pts, v: v, t: 1.1 });
    }

    // ───────────── HUD ─────────────
    function css(el, s) { el.style.cssText = s; return el; }
    function buildHud() {
      var h = css(document.createElement('div'), 'position:fixed;inset:0;pointer-events:none;z-index:9990;font-family:"Chakra Petch",system-ui,sans-serif;color:#e8f6ff');
      h.innerHTML = '<div data-k="board" style="position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:18px;background:rgba(6,8,14,.82);border:1px solid #2a3442;border-radius:14px;padding:8px 22px;box-shadow:0 0 24px rgba(39,224,255,.18)">' +
        '<div style="text-align:center"><div style="color:#27E0FF;font-weight:800;letter-spacing:.18em;font-size:13px">CYON</div><div data-k="sc" style="font-size:34px;font-weight:800;color:#27E0FF">0</div></div>' +
        '<div style="text-align:center"><div data-k="clock" style="font-size:22px;font-weight:700">5:00</div><div data-k="sub" style="font-size:11px;opacity:.7;letter-spacing:.14em">HOVER LEAGUE</div></div>' +
        '<div style="text-align:center"><div style="color:#FF3FA4;font-weight:800;letter-spacing:.18em;font-size:13px">MAGMA</div><div data-k="sm" style="font-size:34px;font-weight:800;color:#FF3FA4">0</div></div></div>' +
        '<div data-k="paint" style="position:absolute;top:96px;left:50%;transform:translateX(-50%);width:320px;height:10px;border-radius:6px;background:#1a1f2a;overflow:hidden;display:none"><div data-k="pc" style="height:100%;float:left;background:#27E0FF"></div><div data-k="pm" style="height:100%;float:right;background:#FF3FA4"></div></div>' +
        '<div style="position:absolute;right:26px;bottom:26px;width:118px;height:118px;border-radius:50%;background:conic-gradient(#E8C45C var(--b,0%),#1b2230 0);display:grid;place-items:center" data-k="boostRing"><div style="width:92px;height:92px;border-radius:50%;background:#070a10;display:grid;place-items:center;text-align:center"><div><div data-k="boost" style="font-size:30px;font-weight:800">34</div><div style="font-size:10px;letter-spacing:.2em;opacity:.7">BOOST</div></div></div></div>' +
        '<div data-k="state" style="position:absolute;right:160px;bottom:40px;font-size:14px;letter-spacing:.12em;text-align:right"></div>' +
        '<div data-k="msg" style="position:absolute;top:30%;left:50%;transform:translate(-50%,-50%);font-size:58px;font-weight:900;letter-spacing:.08em;text-shadow:0 0 30px currentColor;opacity:0;transition:opacity .25s"></div>' +
        '<div style="position:absolute;left:20px;bottom:20px;font-size:12px;opacity:.65;line-height:1.6">F / Left click: shoot (holding) · bolt (not holding)<br>Shift: boost · Space: jump · ride the rim walls · Esc: leave</div>';
      document.body.appendChild(h);
      var q = function (k) { return h.querySelector('[data-k="' + k + '"]'); };
      return { el: h, q: q, msgT: 0 };
    }
    function flash(text, color, secs) { if (!hud) return; var m = hud.q('msg'); m.textContent = text; m.style.color = color || '#fff'; m.style.opacity = 1; hud.msgT = secs || 1.6; }
    function picker() {
      var p = css(document.createElement('div'), 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;width:min(560px,92vw);background:rgba(6,8,12,.96);border:1px solid #E8C45C;border-radius:16px;padding:18px 20px;color:#e8f6ff;font-family:"Chakra Petch",system-ui,sans-serif;box-shadow:0 0 40px rgba(39,224,255,.2)');
      function row(label, key, items) { return '<div style="margin:12px 0 6px;letter-spacing:.2em;font-size:11px;color:#E8C45C">' + label + '</div><div style="display:flex;flex-wrap:wrap;gap:8px">' + items.map(function (it) { return '<button data-' + key + '="' + it[0] + '" style="flex:1 1 30%;min-width:96px;cursor:pointer;background:#0d141c;color:#e8f6ff;border:1px solid #2a3442;border-radius:10px;padding:9px 8px;font:600 13px inherit">' + it[1] + (it[2] ? '<br><small style="opacity:.6;font-weight:400">' + it[2] + '</small>' : '') + '</button>'; }).join('') + '</div>'; }
      p.innerHTML = '<div style="font-size:22px;font-weight:800;letter-spacing:.08em">HOVER LEAGUE</div><div style="opacity:.7;font-size:13px">Colosseum field mode · Cyon vs Magma</div>' +
        row('MODE', 'mode', [['league', 'League', 'hold, shoot, score'], ['paint', 'Paint', 'cover the floor']]) +
        row('BALL', 'ball', Object.keys(Core.BALLS).map(function (k) { return [k, Core.BALLS[k].name, { shaddai: 'signature, lively', regular: 'chrome, standard', plasma: 'bouncy', inferno: 'heavy hits', void: 'floaty', solar: 'fast' }[k]]; })) +
        row('TEAMS', 'size', [['1', '1 v 1'], ['2', '2 v 2'], ['3', '3 v 3']]) +
        '<div style="display:flex;gap:10px;margin-top:16px"><button data-go="1" style="flex:2;cursor:pointer;background:#27E0FF;color:#041018;border:0;border-radius:10px;padding:12px;font:800 15px inherit;letter-spacing:.12em">PLAY</button><button data-x="1" style="flex:1;cursor:pointer;background:transparent;color:#e8f6ff;border:1px solid #2a3442;border-radius:10px;padding:12px;font:600 14px inherit">Close</button></div>';
      function mark() { p.querySelectorAll('button[data-mode],button[data-ball],button[data-size]').forEach(function (b) { var on = b.dataset.mode === opts.mode || b.dataset.ball === opts.ball || b.dataset.size === String(opts.size); b.style.borderColor = on ? '#27E0FF' : '#2a3442'; b.style.boxShadow = on ? '0 0 12px rgba(39,224,255,.35)' : 'none'; }); }
      p.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.mode) opts.mode = b.dataset.mode; if (b.dataset.ball) opts.ball = b.dataset.ball; if (b.dataset.size) opts.size = +b.dataset.size;
        if (b.dataset.go) { p.remove(); start(opts); return; } if (b.dataset.x) { p.remove(); return; } mark();
      });
      document.body.appendChild(p); mark(); return p;
    }

    // ───────────── match lifecycle ─────────────
    function toLocal(v) { return arena.root.worldToLocal(v.clone()); }
    function toWorld(x, y, z) { return arena.root.localToWorld(new THREE.Vector3(x, y, z)); }
    function onKey(e) { if (!active) return; if (e.code === 'KeyF' && !e.repeat) attackQ = true; if (e.code === 'Escape') stop(); }
    function onMouse(e) { if (active && e.button === 0) attackQ = true; }

    function start(o2) {
      if (/[?&]hl=0/.test(root.location ? root.location.search : '')) return Promise.resolve(false);
      opts = Object.assign(opts, o2 || {});
      return Promise.all([getLayout(), getKit()]).then(function () {
        arena = o.getArena && o.getArena(); var inside = arena && (!o.isInside || o.isInside());
        if (!inside) { if ((o2 && o2._tries || 0) > 8) return false; if (o.enter) o.enter(); return new Promise(function (res) { setTimeout(function () { res(start(Object.assign({}, o2, { _tries: ((o2 && o2._tries) || 0) + 1 }))); }, 1200); }); }
        stop(true); U = arena.root.scale.x || U;
        var n = Math.max(1, Math.min(3, opts.size | 0));
        game = Core.create(L, { mode: opts.mode, ball: opts.ball, bots: { cyon: n - 1, magma: n }, seed: opts.seed || (Date.now() & 0xffff) || 1 }); human = game.setHuman({ team: 'cyon' });
        if (arena.floors && arena.floors.clear) try { arena.floors.clear(); } catch (_) { }
        view = buildView(); arena.root.add(view.group); hud = buildHud();
        hud.q('sub').textContent = opts.mode === 'paint' ? 'PAINT · ' + Core.BALLS[opts.ball].name.toUpperCase() : Core.BALLS[opts.ball].name.toUpperCase(); hud.q('paint').style.display = opts.mode === 'paint' ? 'block' : 'none';
        if (opts.mode === 'paint') { view.ball.visible = false; view.light.visible = false; }
        var hv = o.getHover && o.getHover();
        if (hv && hv.wallride) { savedWalls = hv.wallride.__walls || null; hv.wallride.setWalls(worldWalls()); }
        var sp = toWorld(L.A - L.QP_W - 10, 0, 6), pp = o.getPlayerPos && o.getPlayerPos(); if (pp) { pp.x = sp.x; pp.z = sp.z; }
        if (root.__rideBoard) root.__rideBoard();
        if (hv && hv.state) { var s = hv.state(); s.x = sp.x; s.z = sp.z; s.psi = -Math.PI / 2; s.v = 0; }
        document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onMouse);
        active = true; t = 0; flash(opts.mode === 'paint' ? 'PAINT!' : 'KICKOFF', '#E8C45C', 1.8);
        return true;
      });
    }
    function stop(silent) {
      if (!active && !view) return;
      active = false; document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onMouse);
      if (view) { Object.keys(view.riders).forEach(function (k) { var r = view.riders[k]; try { r.hover.dismount(); r.hover.dispose(); } catch (_) { } if (r.avatar && r.avatar.parent) r.avatar.parent.remove(r.avatar); }); var hv0 = o.getHover && o.getHover(); if (hv0 && hv0.setAction) hv0.setAction('carry-off'); arena && arena.root.remove(view.group); view.group.traverse(function (c) { if (c.geometry) c.geometry.dispose(); }); view = null; }
      if (hud) { hud.el.remove(); hud = null; }
      var hv = o.getHover && o.getHover(); if (hv && hv.wallride) hv.wallride.setWalls(savedWalls || (root.__parkDress && root.__parkDress.walls) || []);
      if (hv && hv.setModifier) hv.setModifier({ mul: 1, dur: 0.01 });
      if (!silent && root.Navi && root.Navi.toast) root.Navi.toast('Hover League closed');
    }
    function worldWalls() {
      if (!game || !arena) return [];
      return game.walls().map(function (w) { var a = toWorld(w.x0, w.y0, w.z0), b = toWorld(w.x1, w.y1, w.z1); return { x0: a.x, z0: a.z, x1: b.x, z1: b.z, y0: a.y, y1: b.y }; });
    }
    function heightAtWorld(x, z) {
      if (!active || !game) return NaN; var l = toLocal(new THREE.Vector3(x, 0, z));
      if ((l.x * l.x) / (L.A * L.A) + (l.z * l.z) / (L.B * L.B) > 1) return NaN;
      return toWorld(l.x, game.heightAt(l.x, l.z), l.z).y;
    }

    function update(dt) {
      if (!active || !game || !view) return; t += dt;
      var hv = o.getHover && o.getHover(), pp = o.getPlayerPos && o.getPlayerPos(), you = null;
      if (hv && hv.state && pp) {
        var s = hv.state(), l = toLocal(new THREE.Vector3(s.x, s.y, s.z)), vel = hv.velocity();
        you = { x: l.x, y: Math.max(0, l.y - game.heightAt(l.x, l.z)) + game.heightAt(l.x, l.z), z: l.z, vx: vel.x / U, vz: vel.z / U, psi: hv.heading(), air: !!s.air, boosting: !!(hv.modifier && s.thr > 0.9), attack: attackQ };
        if (human.out > 0) you.x = human.x, you.z = human.z;
      }
      attackQ = false;
      var ev = game.step(dt, { you: you }), st = game.state;
      // board modifiers: speed power-up, stun on drop/hit, respawn after a demo
      if (hv && hv.setModifier) { if (human.stun > 0 || human.out > 0) hv.setModifier({ stun: Math.max(human.stun, human.out) }); else hv.setModifier({ mul: human.power === 'speed' ? 1.35 : 1, dur: 0.2 }); }
      ev.forEach(function (e) {
        var actor = e.id === 'you' ? hv : (view.riders[e.id] && view.riders[e.id].hover);   // rider body actions
        if (actor && actor.setAction) {
          if (e.type === 'grab') actor.setAction('carry-on');
          else if (e.type === 'shot') { actor.setAction('carry-off'); actor.setAction('shoot'); }
          else if (e.type === 'bolt') actor.setAction('bolt');
          else if (e.type === 'drop') { actor.setAction('carry-off'); actor.setAction('stun', e.why === 'bolt' ? 0.8 : 0.6); }
          else if (e.type === 'hit' && !e.blocked) actor.setAction('stun', 0.5);
        }
        if (e.type === 'drop' && e.why === 'ram' && e.by) { var rm = e.by === 'you' ? hv : (view.riders[e.by] && view.riders[e.by].hover); if (rm && rm.setAction) rm.setAction('ram'); }
        if (e.type === 'demo') { var vr = e.victim === 'you' ? hv : (view.riders[e.victim] && view.riders[e.victim].hover); if (vr && vr.setAction) { vr.setAction('carry-off'); vr.setAction('stun', 1); } var rr = e.by === 'you' ? hv : (view.riders[e.by] && view.riders[e.by].hover); if (rr && rr.setAction) rr.setAction('ram'); }
        if (e.type === 'kickoff') { if (hv && hv.setAction) hv.setAction('carry-off'); Object.keys(view.riders).forEach(function (k) { view.riders[k].hover.setAction('carry-off'); }); }
        if (e.type === 'goal') { flash('GOAL ' + (e.team === 'cyon' ? 'CYON' : 'MAGMA'), '#' + TEAM[e.team].toString(16).padStart(6, '0'), 2.2); var gl = L.goals.filter(function (g) { return g.team !== e.team; })[0]; burst(gl.x, gl.y, gl.z, TEAM[e.team], 220, 22); if (arena.setCrowdMood) arena.setCrowdMood(1); }
        else if (e.type === 'drop' && e.id === 'you') flash(e.why === 'bolt' ? 'HIT! DROPPED' : 'RAMMED!', '#FF6A6A', 1);
        else if (e.type === 'grab' && e.id === 'you') flash('GOT IT', '#E8C45C', 0.7);
        else if (e.type === 'demo') { burst(e.x, e.y + 1, e.z, 0xFFAA33, 90, 14); if (e.victim === 'you') { flash('DEMOLISHED', '#FF6A6A', 2.4); } }
        else if (e.type === 'hit') burst(e.x || 0, (e.y || 0) + 1.2, e.z || 0, e.blocked ? 0x7DF4FF : 0xFFFFFF, 30, 8);
        else if (e.type === 'respawn' && e.id === 'you' && hv && hv.state) { var sp = toWorld(L.A - L.QP_W - 10, 0, 0), s2 = hv.state(); s2.x = sp.x; s2.z = sp.z; s2.v = 0; s2.psi = -Math.PI / 2; }
        else if (e.type === 'pickup' && e.id === 'you') flash(e.kind.toUpperCase(), '#E8C45C', 1);
        else if (e.type === 'overtime') flash('OVERTIME', '#E8C45C', 2);
        else if (e.type === 'end') { flash(e.winner === 'draw' ? 'DRAW' : (e.winner === 'cyon' ? 'CYON WINS' : 'MAGMA WINS'), e.winner === 'magma' ? '#FF3FA4' : '#27E0FF', 6); setTimeout(function () { if (!game || !game.state.over) return; stop(true); picker(); }, 5500); }
      });
      // ball
      var b = st.ball; view.ball.position.set(b.x, b.y, b.z); view.ball.userData.tick(dt, t); view.light.position.copy(view.ball.position);
      // bots: real rigged riders (full board instance) or code placeholders
      st.players.forEach(function (p) {
        var r = view.riders[p.id];
        if (r) {
          var hs = r.hover.state(), w = toWorld(p.x, p.y, p.z), dpsi = Math.atan2(Math.sin(p.psi - hs.psi), Math.cos(p.psi - hs.psi));
          hs.x = w.x; hs.z = w.z; hs.y = w.y + 0.35 * U; hs.yawRate = dt > 0 ? dpsi / dt : 0; hs.psi = p.psi; hs.v = Math.hypot(p.vx, p.vz); hs.air = !!p.air; hs.t += dt; hs.vy = p.vy * U || 0;
          r.hover.board.visible = p.out <= 0; if (r.avatar) r.avatar.visible = p.out <= 0;
          r.hover.pose(dt, { showRider: p.out <= 0 }); return;
        }
        var g = view.bots[p.id]; if (!g) return; g.visible = p.out <= 0 && !g.userData.real; g.position.set(p.x, p.y + 0.25 + Math.sin(t * 3 + p.x) * 0.05, p.z); g.rotation.y = p.psi;
        var sp = Math.hypot(p.vx, p.vz); g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, -Math.max(-0.4, Math.min(0.4, (p.vx * Math.cos(p.psi) - p.vz * Math.sin(p.psi)) * 0.02)), 0.15); g.rotation.x = p.stun > 0 ? Math.sin(t * 30) * 0.12 : -Math.min(0.15, sp * 0.006);
        var rd = g.userData.rider; if (rd) { rd.rotation.x = st.ball.holder === p.id ? -0.25 : 0; }
      });
      // pads / power-ups
      st.pads.forEach(function (pd, i) { var v = view.pads[i]; if (!v) return; var on = pd.t <= 0; v.g.children.forEach(function (c) { if (/orb/.test(c.name)) { c.visible = on; c.rotation.z += dt * 2; c.position.z = 1.6 + Math.sin(t * 2 + i) * 0.15; } }); });
      st.ups.forEach(function (u, i) { var v = view.ups[i]; if (v && v.cube) { v.cube.visible = u.t <= 0; v.cube.rotation.z += dt * 1.5; v.cube.rotation.x += dt; } });
      // bolts
      var pool = { cyon: view.bolts.filter(function (b) { return b.userData.kind === 'cyon'; }), magma: view.bolts.filter(function (b) { return b.userData.kind === 'magma'; }) }, used = { cyon: 0, magma: 0 };
      view.bolts.forEach(function (bm) { bm.visible = false; });
      st.bolts.forEach(function (bo) { var bm = pool[bo.team][used[bo.team]++]; if (!bm) return; bm.visible = true; bm.position.set(bo.x, bo.y, bo.z); bm.userData.tick(dt, t * 1.6); });
      // fx
      for (var fi = view.fx.length - 1; fi >= 0; fi--) { var f = view.fx[fi]; f.t -= dt; var pa = f.pts.geometry.attributes.position.array; for (var k = 0; k < f.v.length; k++) { f.v[k].y -= 14 * dt; pa[k * 3] += f.v[k].x * dt; pa[k * 3 + 1] += f.v[k].y * dt; pa[k * 3 + 2] += f.v[k].z * dt; } f.pts.geometry.attributes.position.needsUpdate = true; f.pts.material.opacity = Math.max(0, f.t); if (f.t <= 0) { view.group.remove(f.pts); f.pts.geometry.dispose(); view.fx.splice(fi, 1); } }
      view.barrier.material.uniforms.uT.value = t;
      // paint (throttled canvas writes)
      paintT -= dt; var dc = game.dirtyCells(); if (dc.length) { view.pending = (view.pending || []).concat(dc); }
      if (paintT <= 0 && view.pending && view.pending.length) { view.floor.paintCells(game.paintGrid(), view.pending); view.pending = []; paintT = 0.1; }
      // HUD
      if (hud) {
        hud.q('sc').textContent = st.score.cyon; hud.q('sm').textContent = st.score.magma;
        var c = Math.max(0, Math.ceil(st.clock)); hud.q('clock').textContent = (st.overtime ? '+' : '') + Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0');
        hud.q('boost').textContent = Math.round(human.boost); hud.q('boostRing').style.setProperty('--b', Math.round(human.boost) + '%');
        var tags = []; if (st.ball.holder === 'you') tags.push('<b style="color:#E8C45C">HOLDING — F to shoot</b>'); if (human.power) tags.push(human.power.toUpperCase() + ' ' + Math.ceil(human.powerT) + 's'); if (human.strong) tags.push('STRONG SHOT READY'); if (human.stun > 0) tags.push('<span style="color:#FF6A6A">STUNNED</span>'); if (human.out > 0) tags.push('<span style="color:#FF6A6A">RESPAWN ' + human.out.toFixed(1) + '</span>');
        hud.q('state').innerHTML = tags.join('<br>');
        if (st.mode === 'paint') { var tot = Math.max(1, st.paint.total); hud.q('pc').style.width = (st.paint.cyon / tot * 100) + '%'; hud.q('pm').style.width = (st.paint.magma / tot * 100) + '%'; hud.q('sc').textContent = Math.round(st.paint.cyon / tot * 100) + '%'; hud.q('sm').textContent = Math.round(st.paint.magma / tot * 100) + '%'; }
        if (hud.msgT > 0) { hud.msgT -= dt; if (hud.msgT <= 0) hud.q('msg').style.opacity = 0; }
      }
    }

    return { open: function () { getLayout(); getKit(); return picker(); }, start: start, stop: stop, active: function () { return active; }, update: update,
      heightAtWorld: heightAtWorld, worldWalls: worldWalls, game: function () { return game; }, _view: function () { return view; } };
  }

  root.HoverLeague = { create: create, BALL_LOOK: BALL_LOOK };
})(typeof window !== 'undefined' ? window : globalThis);

/* SHADDAI · Descent — OCEAN shader (Phase 2). GLSL ES 3.00 + a JS renderer.
 *
 * window.DescentOcean.create(DGL, glenv) -> renderer | null   (null if WebGL2 unusable)
 *   renderer.resize(glenv)
 *   renderer.draw(glenv, p, mouse, t, sunDir)   -- renders the living water to #gl
 *   renderer.dispose(glenv)                      -- frees ALL gl resources
 *
 * Pipeline (all under #art, additive 2D accents ride above):
 *   1) RIPPLE SIM  — 256² ping-ponged R16F/RGBA height field. Shallow-water/pool
 *      update + damping; the pointer injects impulses scaled by pointer speed so
 *      ripples PROPAGATE and DECAY. Concentric Flower-of-Life interference forms
 *      where the pointer disturbs it (cymatics).
 *   2) SURFACE     — full-res. Sim normal + scrolling noise-normal octaves for a
 *      living idle swell; sharp gold sun-glint specular; Fresnel reflect↔refract;
 *      deep water is EMERALD→OBSIDIAN (never blue). u_dive lowers the view
 *      through the surface → dim procedural FISH + gold god-ray shafts over an
 *      emerald→obsidian depth gradient. Bright glints written for bloom.
 *   3) BLOOM       — threshold + cheap separable blur of the glints → additive.
 *
 * Cost scales with q/lowfx. Never throws; on any compile/link failure returns null
 * so scene-water.gl silently falls back to the certified 2D ocean.
 * Obsidian #06080b · emerald #00ff9c · gold #e8c45c · cyan #5fe0ff.
 */
(function () {
  'use strict';

  // ── shared fullscreen-triangle vertex shader ──────────────────────────────
  var VS = `#version 300 es
  precision highp float;
  out vec2 v_uv;
  const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
  void main(){
    vec2 pos = P[gl_VertexID];
    v_uv = pos*0.5 + 0.5;
    gl_Position = vec4(pos, 0.0, 1.0);
  }`;

  // ── ripple simulation (shallow-water pool update on the height field) ─────
  // channel R = height(t), G = height(t-1). We read neighbours from R and the
  // previous frame from G, integrate with damping, and write new R/old-R.
  var FS_SIM = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o_col;
  uniform sampler2D u_prev;     // R=h(t), G=h(t-1)
  uniform vec2  u_texel;        // 1/simRes
  uniform vec2  u_pointer;      // 0..1 pointer pos in sim space
  uniform vec2  u_pointerVel;   // -1..1 velocity
  uniform float u_pointerSpeed; // 0..1
  uniform float u_down;         // 0/1
  uniform float u_time;
  uniform float u_damp;         // damping (0.985..0.996)
  uniform float u_active;       // pointer active 0/1

  void main(){
    vec2 uv = v_uv;
    vec4 c  = texture(u_prev, uv);
    float h  = c.r;
    float hp = c.g;
    // neighbours (clamped by edge wrap of CLAMP_TO_EDGE sampler)
    float l = texture(u_prev, uv - vec2(u_texel.x,0.0)).r;
    float r = texture(u_prev, uv + vec2(u_texel.x,0.0)).r;
    float u = texture(u_prev, uv - vec2(0.0,u_texel.y)).r;
    float d = texture(u_prev, uv + vec2(0.0,u_texel.y)).r;
    // wave integrate: h' = (2h - hp) + c^2*(lap) ; c^2 ~ 0.30 stable
    float lap = (l + r + u + d - 4.0*h);
    float nh = (2.0*h - hp) + 0.32*lap;
    nh *= u_damp;

    // POINTER IMPULSE — a slow, heavy, sacred drop scaled by speed.
    // Distance in sim space; a soft gaussian well pushed DOWN (negative) so
    // ripples ring outward from where the cursor drags the membrane.
    vec2 dp = (uv - u_pointer);
    float dist = length(dp);
    float force = (0.05 + u_pointerSpeed*0.22) * u_active;
    // Flower-of-Life cymatic bias: modulate the impulse by concentric rings so
    // interference forms hexagonal sacred symmetry near the disturbance.
    float rings = 0.5 + 0.5*cos(dist*90.0 - u_time*2.2);
    float well  = exp(-dist*dist*900.0) * force * (0.6 + 0.4*rings);
    nh -= well;
    // a fainter, faster tick where the pointer is held down (deeper drag)
    nh -= exp(-dist*dist*2600.0) * u_down * 0.06 * u_active;

    o_col = vec4(clamp(nh,-1.5,1.5), h, 0.0, 1.0);
  }`;

  // ── surface + deep shading (full-res) ─────────────────────────────────────
  var FS_SURF = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  layout(location=0) out vec4 o_col;    // composited water
  layout(location=1) out vec4 o_bloom;  // bright glints only (for bloom pass)

  uniform sampler2D u_sim;    // ripple height field (R=h)
  uniform vec2  u_res;
  uniform vec2  u_texel;      // 1/simRes
  uniform float u_time;
  uniform vec2  u_sunDir;     // screen-space direction to sun (low sun)
  uniform float u_dive;       // 0 surface .. 1 submerged
  uniform vec2  u_pointer;    // 0..1
  uniform float u_pointerSpeed;
  uniform float u_ripple;     // ripple strength scale
  uniform float u_octaves;    // 1..3 noise-normal octaves (lowfx scales down)
  // palette
  uniform vec3  u_void;       // obsidian
  uniform vec3  u_emerald;
  uniform vec3  u_gold;
  uniform vec3  u_cyan;

  // ── cheap value noise ─────────────────────────────────────────────────────
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    float a = hash(i), b = hash(i+vec2(1.0,0.0));
    float c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  // fbm-ish scrolling swell height for normal derivation
  float swell(vec2 uv, float t){
    float h = 0.0, amp = 0.5, frq = 1.0;
    for(int i=0;i<3;i++){
      if(float(i) >= u_octaves) break;
      vec2 dir = vec2(0.7+float(i)*0.2, 0.35-float(i)*0.11);
      h += amp * vnoise(uv*frq*3.0 + dir*t*0.05);
      amp *= 0.5; frq *= 2.03;
    }
    return h;
  }

  // procedural fish silhouette (below-surface). Returns 0..1 darkness mask.
  float fish(vec2 uv, float t){
    float m = 0.0;
    for(int i=0;i<3;i++){
      float fi = float(i);
      float sp = 0.02 + fi*0.012;
      float lane = 0.35 + fi*0.22;
      float x = fract(uv.x + t*sp + fi*0.37);
      float y = uv.y - lane - sin((uv.x+t*sp)*6.28 + fi)*0.03;
      // body: squashed ellipse
      vec2 q = vec2((x-0.5)*3.2, y*22.0);
      float body = smoothstep(1.0, 0.55, length(q));
      // tail wag
      float tail = smoothstep(0.12,0.0, abs(y)) * smoothstep(0.5,0.42,x) * (0.5+0.5*sin(t*4.0+fi));
      m = max(m, body*0.85 + tail*0.3);
    }
    return clamp(m, 0.0, 1.0);
  }

  void main(){
    vec2 uv = v_uv;
    vec2 asp = vec2(u_res.x/u_res.y, 1.0);

    // ── derive normal from sim height (central differences) ──
    float hL = texture(u_sim, uv - vec2(u_texel.x,0.0)).r;
    float hR = texture(u_sim, uv + vec2(u_texel.x,0.0)).r;
    float hU = texture(u_sim, uv - vec2(0.0,u_texel.y)).r;
    float hD = texture(u_sim, uv + vec2(0.0,u_texel.y)).r;
    float simSlopeX = (hR - hL);
    float simSlopeY = (hD - hU);

    // ── living idle swell normal (scrolling noise octaves) ──
    float e = 0.004;
    float s0 = swell(uv*asp, u_time);
    float sx = swell((uv+vec2(e,0.0))*asp, u_time) - s0;
    float sy = swell((uv+vec2(0.0,e))*asp, u_time) - s0;

    // combined surface normal — swell for base life, sim for interaction
    vec3 N = normalize(vec3(
      -(simSlopeX*22.0*u_ripple + sx*2.0),
      -(simSlopeY*22.0*u_ripple + sy*2.0),
       1.0));

    // ── sun-glint specular (low gold sun) ──
    vec3 sun = normalize(vec3(u_sunDir, 0.55));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(sun + V);
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    // anamorphic streak: stretch the glint horizontally along the sun azimuth
    float streak = pow(max(dot(N, H), 0.0), 60.0) * 0.35;
    float glint = spec + streak;

    // ── Fresnel (grazing → reflect sky+gold; facing down → refract deep water) ──
    float fres = pow(1.0 - max(N.z, 0.0), 3.0);
    fres = clamp(fres*0.9 + 0.05, 0.0, 1.0);

    // deep water body: emerald → obsidian (NEVER blue)
    float depthGrad = smoothstep(0.0, 1.0, uv.y);        // darker lower
    vec3 deep = mix(u_emerald*0.14, u_void, depthGrad*0.9 + 0.1);
    // subtle cyan energy where sim disturbs (caustic cymatic tint)
    float simMag = abs(hL)+abs(hR)+abs(hU)+abs(hD);
    deep += u_cyan * simMag * 0.06;

    // reflected "sky": dark obsidian with a faint gold band low toward the sun
    vec3 refl = mix(u_void*1.4, u_gold*0.5, clamp(u_sunDir.y*0.5+0.5,0.0,1.0)*0.4);

    // ── CAUSTIC / Flower-of-Life interference near the pointer (restrained) ──
    vec2 pd = (uv - u_pointer)*asp;
    float pr = length(pd);
    float caustic = 0.0;
    // three hex-offset centers → Flower-of-Life ring interference
    for(int i=0;i<3;i++){
      float ang = float(i)*2.0944;                        // 120° apart
      vec2 ctr = u_pointer + vec2(cos(ang),sin(ang))*0.05;
      float rr = length((uv-ctr)*asp);
      caustic += 0.5+0.5*sin(rr*70.0 - u_time*1.6);
    }
    caustic /= 3.0;
    caustic *= exp(-pr*pr*10.0) * (0.15 + u_pointerSpeed*0.5);
    vec3 causticCol = mix(u_cyan, u_emerald, 0.5) * caustic;

    // ── compose SURFACE ──
    vec3 surf = mix(deep, refl, fres);
    surf += u_gold * glint * 1.6;              // gold sun sparkle
    surf += causticCol;                        // sacred cymatic rings

    // ── DEEP (below surface) — blend in as u_dive rises ──
    // god-ray shafts (gold) descending + fish silhouettes + emerald→obsidian
    float shaft = 0.0;
    for(int i=0;i<3;i++){
      float fi = float(i);
      float x = uv.x*asp.x + sin(u_time*0.15+fi*2.1)*0.15 - 0.5*asp.x;
      float band = smoothstep(0.06,0.0, abs(fract(x*1.5+fi*0.33)-0.5)-0.02);
      shaft += band * (1.0-uv.y) ;
    }
    shaft = clamp(shaft*0.12, 0.0, 1.0);
    // refract the fish lookup by the surface normal (water distortion)
    vec2 fuv = uv + N.xy*0.02;
    float fishMask = fish(fuv, u_time);
    vec3 depthBg = mix(u_emerald*0.10, u_void, smoothstep(0.0,1.0,uv.y*0.8+0.2));
    vec3 deepScene = depthBg + u_gold*shaft;
    deepScene = mix(deepScene, u_void*0.4, fishMask*0.9);   // dark fish silhouettes
    deepScene += u_cyan * simMag * 0.03;                    // faint refracted light

    // seam: at low dive we see mostly surface; rising dive reveals the deep,
    // with a bright membrane-pierce flash around the transition band.
    float membrane = smoothstep(0.35, 0.55, u_dive) * (1.0 - smoothstep(0.55,0.75,u_dive));
    vec3 col = mix(surf, deepScene, smoothstep(0.15, 0.85, u_dive));
    col += u_cyan * membrane * 0.06 * (0.5+0.5*simMag);

    // gentle overall depth vignette in obsidian (darkness carries the frame)
    float vig = smoothstep(1.15, 0.35, length((uv-0.5)*vec2(asp.x,1.0)));
    col *= mix(0.55, 1.0, vig);

    o_col = vec4(col, 1.0);

    // ── bloom source: only the brightest gold glints & membrane flash ──
    float bloomLum = max(glint - 0.25, 0.0)*1.5 + membrane*0.4;
    o_bloom = vec4(u_gold * bloomLum, 1.0);
  }`;

  // ── separable blur (used twice: H then V) for the glint bloom ─────────────
  var FS_BLUR = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o_col;
  uniform sampler2D u_src;
  uniform vec2 u_dir;    // (texelX,0) or (0,texelY)
  void main(){
    vec4 sum = texture(u_src, v_uv) * 0.227027;
    sum += texture(u_src, v_uv + u_dir*1.3846) * 0.316216;
    sum += texture(u_src, v_uv - u_dir*1.3846) * 0.316216;
    sum += texture(u_src, v_uv + u_dir*3.2308) * 0.070270;
    sum += texture(u_src, v_uv - u_dir*3.2308) * 0.070270;
    o_col = sum;
  }`;

  // ── final composite: water + additive bloom → screen ──────────────────────
  var FS_COMPOSITE = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 o_col;
  uniform sampler2D u_water;
  uniform sampler2D u_bloom;
  uniform float u_alpha;     // scene crossfade alpha
  void main(){
    vec3 c = texture(u_water, v_uv).rgb;
    vec3 b = texture(u_bloom, v_uv).rgb;
    c += b * 1.3;            // additive sparkle
    // tone: keep obsidian deep, let the four glows breathe
    c = c / (c + vec3(0.72));
    o_col = vec4(c, u_alpha);
  }`;

  // ══════════════════════════════════════════════════════════════════════════
  // JS renderer
  // ══════════════════════════════════════════════════════════════════════════
  function create(DGL, glenv) {
    var gl = glenv.gl;
    if (!gl) return null;

    // half-float color-render support is required for the sim; guard it.
    var extCBF = gl.getExtension('EXT_color_buffer_float');
    var simInternal = extCBF ? gl.RGBA16F : gl.RGBA;   // fallback to RGBA8 sim
    var simType     = extCBF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    // compile all programs; if ANY fails, dispose partial + return null (→2D fallback)
    var progSim   = DGL.compile(VS, FS_SIM);
    var progSurf  = DGL.compile(VS, FS_SURF);
    var progBlur  = DGL.compile(VS, FS_BLUR);
    var progComp  = DGL.compile(VS, FS_COMPOSITE);
    if (!progSim || !progSurf || !progBlur || !progComp) {
      [progSim, progSurf, progBlur, progComp].forEach(function (p) { if (p) gl.deleteProgram(p); });
      return null;
    }

    // dummy VAO (fullscreen triangle uses gl_VertexID, no attributes)
    var vao = gl.createVertexArray();

    var R = {
      simRes: 256,
      progSim: progSim, progSurf: progSurf, progBlur: progBlur, progComp: progComp,
      vao: vao, extCBF: !!extCBF,
      sim: [null, null], simIdx: 0,   // ping-pong sim FBOs
      water: null, bloomA: null, bloomB: null,
      w: 0, h: 0,
      uSim: {}, uSurf: {}, uBlur: {}, uComp: {},
      lost: false
    };

    // cache uniform locations
    function locs(prog, names) {
      var o = {}; for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(prog, names[i]); return o;
    }
    R.uSim = locs(progSim, ['u_prev','u_texel','u_pointer','u_pointerVel','u_pointerSpeed','u_down','u_time','u_damp','u_active']);
    R.uSurf = locs(progSurf, ['u_sim','u_res','u_texel','u_time','u_sunDir','u_dive','u_pointer','u_pointerSpeed','u_ripple','u_octaves','u_void','u_emerald','u_gold','u_cyan']);
    R.uBlur = locs(progBlur, ['u_src','u_dir']);
    R.uComp = locs(progComp, ['u_water','u_bloom','u_alpha']);

    // ── build a float-capable ping-pong sim FBO ──
    function makeSimFBO(res) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, simInternal, res, res, 0, gl.RGBA, simType, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo: fbo, tex: tex, w: res, h: res };
    }

    // ── build the surface MRT (color + bloom) at a scaled resolution ──
    function makeSurfFBO(w, h) {
      var texC = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texC);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var texB = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texC, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texB, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo: fbo, texC: texC, texB: texB, w: w, h: h };
    }

    function makeColorFBO(w, h) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo: fbo, tex: tex, w: w, h: h };
    }

    function freeSurf(o) { if (!o) return; gl.deleteFramebuffer(o.fbo); if (o.texC) gl.deleteTexture(o.texC); if (o.texB) gl.deleteTexture(o.texB); if (o.tex) gl.deleteTexture(o.tex); }

    function allocSize(glenv) {
      // surface/bloom at a q-scaled fraction of the canvas (bloom is cheap-blurred anyway)
      var q = glenv.q || 1;
      var scale = q >= 0.85 ? 1.0 : q >= 0.7 ? 0.75 : 0.6;
      var w = Math.max(2, Math.round(glenv.w * scale));
      var h = Math.max(2, Math.round(glenv.h * scale));
      // bloom at half of that
      R.w = w; R.h = h;
      freeSurf(R.water); freeSurf(R.bloomA); freeSurf(R.bloomB);
      R.water = makeSurfFBO(w, h);
      R.bloomA = makeColorFBO(Math.max(2, w >> 1), Math.max(2, h >> 1));
      R.bloomB = makeColorFBO(Math.max(2, w >> 1), Math.max(2, h >> 1));
    }

    // build sim once (res fixed)
    R.sim[0] = makeSimFBO(R.simRes);
    R.sim[1] = makeSimFBO(R.simRes);
    // clear sim FBOs to zero
    [0, 1].forEach(function (i) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.sim[i].fbo);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    allocSize(glenv);

    function drawTri() { gl.bindVertexArray(R.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

    // hex → normalized rgb
    function rgb(hex) {
      var n = parseInt(hex.replace('#', ''), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    R.resize = function (glenv2) {
      if (R.lost) return;
      allocSize(glenv2);
    };

    R.draw = function (glenv2, p, mouse, t, sunDir) {
      if (R.lost) return;
      var gl2 = glenv2.gl;
      var PAL = glenv2.PAL || {};
      var q = glenv2.q || 1;
      var tt = t * 0.001;

      var alpha = (p && p.alpha != null) ? p.alpha : 1;
      var dive = (p && p.local != null) ? p.local : 0;   // 0 surface → 1 deep

      // pointer in sim space (0..1). y flipped (screen→gl).
      var px = (mouse && mouse.nx != null) ? mouse.nx : 0.5;
      var py = (mouse && mouse.ny != null) ? (1 - mouse.ny) : 0.5;
      var pvx = (mouse && mouse.vx != null) ? mouse.vx : 0;
      var pvy = (mouse && mouse.vy != null) ? -mouse.vy : 0;
      var pspeedRaw = (mouse && mouse.speed != null) ? mouse.speed : 0;
      var pspeed = Math.min(1, pspeedRaw / 45);
      var down = (mouse && mouse.down) ? 1 : 0;
      var active = (mouse && mouse.active) ? 1 : 0;

      var octaves = q >= 0.85 ? 3 : q >= 0.7 ? 2 : 1;
      var ripple = 0.7 + 0.5 * Math.min(1, pspeedRaw / 30);

      // sun: low, gold; art-directed slightly left & low.
      var sdx = sunDir ? sunDir[0] : -0.55;
      var sdy = sunDir ? sunDir[1] : 0.42;

      // ── 1) SIM STEP (sub-steps: 2 at hi-q for faster propagation, 1 at low) ──
      var subSteps = q >= 0.85 ? 2 : 1;
      gl2.disable(gl2.BLEND);
      gl2.viewport(0, 0, R.simRes, R.simRes);
      gl2.useProgram(R.progSim);
      gl2.uniform2f(R.uSim.u_texel, 1 / R.simRes, 1 / R.simRes);
      gl2.uniform2f(R.uSim.u_pointer, px, py);
      gl2.uniform2f(R.uSim.u_pointerVel, pvx, pvy);
      gl2.uniform1f(R.uSim.u_pointerSpeed, pspeed);
      gl2.uniform1f(R.uSim.u_down, down);
      gl2.uniform1f(R.uSim.u_damp, 0.994);
      gl2.uniform1f(R.uSim.u_active, active);
      for (var st = 0; st < subSteps; st++) {
        var src = R.sim[R.simIdx], dst = R.sim[R.simIdx ^ 1];
        gl2.bindFramebuffer(gl2.FRAMEBUFFER, dst.fbo);
        gl2.activeTexture(gl2.TEXTURE0);
        gl2.bindTexture(gl2.TEXTURE_2D, src.tex);
        gl2.uniform1i(R.uSim.u_prev, 0);
        gl2.uniform1f(R.uSim.u_time, tt + st * 0.016);
        drawTri();
        R.simIdx ^= 1;
      }

      // ── 2) SURFACE + DEEP → MRT (color + bloom) ──
      gl2.viewport(0, 0, R.w, R.h);
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, R.water.fbo);
      gl2.useProgram(R.progSurf);
      gl2.activeTexture(gl2.TEXTURE0);
      gl2.bindTexture(gl2.TEXTURE_2D, R.sim[R.simIdx].tex);
      gl2.uniform1i(R.uSurf.u_sim, 0);
      gl2.uniform2f(R.uSurf.u_res, R.w, R.h);
      gl2.uniform2f(R.uSurf.u_texel, 1 / R.simRes, 1 / R.simRes);
      gl2.uniform1f(R.uSurf.u_time, tt);
      gl2.uniform2f(R.uSurf.u_sunDir, sdx, sdy);
      gl2.uniform1f(R.uSurf.u_dive, dive);
      gl2.uniform2f(R.uSurf.u_pointer, px, py);
      gl2.uniform1f(R.uSurf.u_pointerSpeed, pspeed);
      gl2.uniform1f(R.uSurf.u_ripple, ripple);
      gl2.uniform1f(R.uSurf.u_octaves, octaves);
      var cv = rgb(PAL.void || '#06080b'), ce = rgb(PAL.emerald || '#00ff9c'),
          cg = rgb(PAL.gold || '#e8c45c'), cc = rgb(PAL.cyan || '#5fe0ff');
      gl2.uniform3f(R.uSurf.u_void, cv[0], cv[1], cv[2]);
      gl2.uniform3f(R.uSurf.u_emerald, ce[0], ce[1], ce[2]);
      gl2.uniform3f(R.uSurf.u_gold, cg[0], cg[1], cg[2]);
      gl2.uniform3f(R.uSurf.u_cyan, cc[0], cc[1], cc[2]);
      drawTri();

      // ── 3) BLOOM: threshold already in o_bloom → separable blur H then V ──
      var bw = R.bloomA.w, bh = R.bloomA.h;
      gl2.viewport(0, 0, bw, bh);
      gl2.useProgram(R.progBlur);
      // H: water.texB → bloomA
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, R.bloomA.fbo);
      gl2.activeTexture(gl2.TEXTURE0); gl2.bindTexture(gl2.TEXTURE_2D, R.water.texB);
      gl2.uniform1i(R.uBlur.u_src, 0);
      gl2.uniform2f(R.uBlur.u_dir, 1.5 / bw, 0);
      drawTri();
      // V: bloomA → bloomB
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, R.bloomB.fbo);
      gl2.bindTexture(gl2.TEXTURE_2D, R.bloomA.tex);
      gl2.uniform2f(R.uBlur.u_dir, 0, 1.5 / bh);
      drawTri();

      // ── 4) COMPOSITE → default framebuffer (#gl), premultiplied-safe alpha ──
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
      gl2.viewport(0, 0, glenv2.w, glenv2.h);
      gl2.useProgram(R.progComp);
      gl2.activeTexture(gl2.TEXTURE0); gl2.bindTexture(gl2.TEXTURE_2D, R.water.texC);
      gl2.uniform1i(R.uComp.u_water, 0);
      gl2.activeTexture(gl2.TEXTURE1); gl2.bindTexture(gl2.TEXTURE_2D, R.bloomB.tex);
      gl2.uniform1i(R.uComp.u_bloom, 1);
      gl2.uniform1f(R.uComp.u_alpha, alpha);
      gl2.enable(gl2.BLEND);
      gl2.blendFunc(gl2.SRC_ALPHA, gl2.ONE_MINUS_SRC_ALPHA);
      drawTri();
      gl2.disable(gl2.BLEND);
      gl2.bindVertexArray(null);
    };

    R.dispose = function (glenv2) {
      var g = (glenv2 && glenv2.gl) || gl;
      try {
        [R.progSim, R.progSurf, R.progBlur, R.progComp].forEach(function (pr) { if (pr) g.deleteProgram(pr); });
        [R.sim[0], R.sim[1]].forEach(function (s) { if (s) { g.deleteFramebuffer(s.fbo); g.deleteTexture(s.tex); } });
        freeSurf(R.water); freeSurf(R.bloomA); freeSurf(R.bloomB);
        if (R.vao) g.deleteVertexArray(R.vao);
      } catch (e) {}
      R.progSim = R.progSurf = R.progBlur = R.progComp = null;
      R.sim = [null, null]; R.water = R.bloomA = R.bloomB = null; R.vao = null;
    };

    return R;
  }

  window.DescentOcean = { create: create, VS: VS, FS_SIM: FS_SIM, FS_SURF: FS_SURF, FS_BLUR: FS_BLUR, FS_COMPOSITE: FS_COMPOSITE };
})();

/* SHADDAI · Descent — WebGL2 manager (NO shaders yet).
 * ONE shared WebGL2 context on #gl. If unavailable, env.glOk=false and run() is a no-op.
 * Per-scene GL lifecycle (optional): scene.gl = { init(glenv), resize(glenv), draw(glenv,p,mouse,t), dispose(glenv) }.
 *   glenv = { gl, w, h, dpr, PAL, q }
 * Existing 2D scenes have no .gl — that's fine, run() just skips them.
 */
(function(){
  'use strict';
  var canvas = null, gl = null, env = null;
  var glenv = { gl:null, w:0, h:0, dpr:1, PAL:null, q:1 };
  var loggedNull = false;
  // scenes that currently have live GL resources (id -> true)
  var live = {};

  function init(theCanvas, sharedEnv){
    canvas = theCanvas; env = sharedEnv;
    try {
      gl = canvas.getContext('webgl2', { alpha:true, premultipliedAlpha:false, antialias:false });
    } catch(e){ gl = null; }
    if(!gl){
      env.glOk = false;
      if(!loggedNull){ console.info('[DGL] WebGL2 unavailable — GL layer disabled (2D scenes unaffected).'); loggedNull = true; }
      return false;
    }
    env.glOk = true;
    glenv.gl = gl; glenv.PAL = env.PAL;
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    resize();
    return true;
  }

  function onLost(e){
    e.preventDefault();
    env.glOk = false;
    live = {};   // resources are gone; scenes will re-init on restore
    console.info('[DGL] WebGL context lost.');
  }
  function onRestored(){
    if(!gl) return;
    env.glOk = true;
    console.info('[DGL] WebGL context restored — re-initializing active scenes.');
    // active scenes get lazily re-init'd by run() on next frame (live map cleared)
  }

  function resize(){
    if(!gl) return;
    glenv.w = canvas.width; glenv.h = canvas.height;
    glenv.dpr = env.dpr; glenv.q = env.q; glenv.PAL = env.PAL;
    gl.viewport(0,0,canvas.width,canvas.height);
    // notify live GL scenes so they can rebuild size-dependent FBOs
    var scenes = (window.__DESCENT && window.__DESCENT.scenes) || [];
    for(var i=0;i<scenes.length;i++){
      var s = scenes[i];
      if(s && s.gl && live[s.id] && s.gl.resize){ try{ s.gl.resize(glenv); }catch(e){} }
    }
  }

  // per-frame: clear the GL canvas to transparent
  function clear(){
    if(!gl) return;
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  // helper: compile a program from vertex + fragment source (unused until shaders land)
  function compile(vsSrc, fsSrc){
    if(!gl) return null;
    function sh(type, src){
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        console.warn('[DGL] shader compile error:', gl.getShaderInfoLog(s)); gl.deleteShader(s); return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, vsSrc), fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    if(!vs || !fs) return null;
    var p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.warn('[DGL] program link error:', gl.getProgramInfoLog(p)); return null;
    }
    return p;
  }

  // helper: make a color-texture-backed framebuffer
  function makeFBO(w, h){
    if(!gl) return null;
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
    return { fbo:fbo, tex:tex, w:w, h:h };
  }

  /* run(scene, p): lazy init on enter, dispose on leave (with ~1-scene hysteresis
   * handled by core-shell deciding the active set; here we only init/dispose based
   * on whether the shell is still calling run() for this scene). The shell calls
   * run() ONLY for active scenes, and calls sweep(activeIds) each frame so we can
   * dispose scenes that left the window. */
  function run(scene, p, mouse, t){
    if(!gl || !scene || !scene.gl) return;      // no-op for 2D-only scenes
    glenv.q = env.q; glenv.PAL = env.PAL;
    if(!live[scene.id]){
      if(scene.gl.init){ try{ scene.gl.init(glenv); }catch(e){ console.warn('[DGL] init', scene.id, e); } }
      live[scene.id] = true;
    }
    if(scene.gl.draw){ try{ scene.gl.draw(glenv, p, mouse, t); }catch(e){} }
  }

  // dispose any GL scene not in the active-id set (called by shell each frame)
  function sweep(activeIds){
    if(!gl) return;
    var scenes = (window.__DESCENT && window.__DESCENT.scenes) || [];
    for(var i=0;i<scenes.length;i++){
      var s = scenes[i];
      if(!s || !s.gl) continue;
      if(live[s.id] && activeIds.indexOf(s.id) === -1){
        if(s.gl.dispose){ try{ s.gl.dispose(glenv); }catch(e){} }
        live[s.id] = false;
      }
    }
  }

  window.DGL = { init:init, resize:resize, clear:clear, compile:compile, makeFBO:makeFBO, run:run, sweep:sweep,
    get gl(){ return gl; }, glenv:glenv };
})();

/* SHADDAI · Descent — render engine (stacked-layer shell).
 *
 * SCENE CONTRACT (extended):
 *   REQUIRED  2D: scene.draw(ctx, env, p, mouse, t)
 *     ctx   = #art 2D context (transform already DPR-scaled → draw in CSS px)
 *     env   = { w,h,dpr,reduced,PAL,lowfx,q,glOk }
 *     p     = { local:0..1 within THIS scene window, gt:0..1 whole journey, alpha:0..1 crossfade }
 *     mouse = window.Pointer.state  { x,y, ex,ey (eased alias), nx,ny (0..1),
 *                                     snx,sny (-1..1), vx,vy, speed, down, ... }
 *     t     = ms (performance.now)
 *     The shell CLEARS #art each frame and sets ctx.globalAlpha=p.alpha before draw().
 *     After each scene it RESETS globalAlpha=1 + globalCompositeOperation='source-over'.
 *   OPTIONAL  GL: scene.gl = { init(glenv), resize(glenv), draw(glenv,p,mouse,t), dispose(glenv) }
 *     Runs BEFORE the 2D draw (renders under #art). Existing scenes have no .gl — fine.
 *
 * ART RULE: crisp generated art is NEVER tinted; overlays are additive-over-black.
 */
(function(){
  'use strict';

  var art, ctx, glCanvas, env, scenes;
  var running = false;
  var progEl, labelEl, enterEl;
  var lastLabel = '';

  // ---- FPS governor state ----
  var ema = 16.7, lastT = 0, governCd = 0;
  var DPR_CAP = 1.6, DPR_MIN = 0.9;

  // ---- easing ----
  function clamp01(x){ return x<0?0:x>1?1:x; }
  function smooth(x){ return x*x*(3-2*x); }

  function scrollS(){
    var max = (document.documentElement.scrollHeight - innerHeight) || 1;
    return clamp01(scrollY / max);
  }

  /* Active set: scenes are evenly spaced centers across [0,1] at i/(n-1).
   * A scene's window half-width is ~1/(n-1) so neighbors overlap. We select
   * up to 3 scenes whose window contains s, and compute complementary eased
   * alpha ramps so the crossfade midpoint is NOT both-at-0.5:
   *   outgoing holds near full until ~0.6 of the transition then drops fast;
   *   incoming eases in late.  local = progress within the scene's own window. */
  function computeActive(s){
    var n = scenes.length; if(n === 0) return [];
    if(n === 1){ return [{ i:0, p:{ local:clamp01(s), gt:s, alpha:1 } }]; }
    var span = 1/(n-1);                       // distance between scene centers
    var out = [];
    for(var i=0;i<n;i++){
      var c = i*span;                         // this scene's center
      var d = Math.abs(s - c);
      if(d >= span) continue;                 // outside its window
      var near = 1 - d/span;                  // 0 at edge, 1 at center
      // local camera progress across the FULL window this scene owns [c-span, c+span]
      var local = clamp01((s - (c - span)) / (2*span));
      out.push({ i:i, near:near, local:local });
    }
    // derive complementary alphas from the two (or three) nearest by proximity
    if(out.length === 1){ out[0].p = mk(out[0], 1); return [out[0]].map(strip); }
    // sort by proximity, dominant first
    out.sort(function(a,b){ return b.near - a.near; });
    // transition ratio: how far we are from dominant toward the runner-up center.
    // dominant near d1, second near d2; blend so incoming eases in late.
    var dom = out[0], sec = out[1];
    // fraction toward the secondary: 0 = fully on dominant, 1 = crossover point
    var frac = clamp01(sec.near / (dom.near + sec.near)); // 0..0.5 typically
    var tt = clamp01(frac / 0.5);              // 0..1 across the transition band
    // outgoing (dominant) holds near-full until ~0.6 then drops fast
    var aDom = tt <= 0.6 ? 1 : 1 - smooth((tt-0.6)/0.4);
    // incoming (secondary) eases in late
    var aSec = tt <= 0.3 ? 0 : smooth((tt-0.3)/0.7);
    dom.p = { local:dom.local, gt:s, alpha:clamp01(aDom) };
    sec.p = { local:sec.local, gt:s, alpha:clamp01(aSec) };
    var res = [dom, sec];
    if(out.length >= 3 && out[2].near > 0.001){
      out[2].p = { local:out[2].local, gt:s, alpha:0 };  // fringe scene kept warm (init'd) but invisible
      res.push(out[2]);
    }
    return res.map(strip);
  }
  function mk(o, a){ return { local:o.local, gt:0, alpha:a }; }
  function strip(o){ return { i:o.i, p:o.p }; }

  function sizeAll(){
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    env.dpr = dpr; env.w = innerWidth; env.h = innerHeight;
    // #art (2D)
    art.width = Math.round(env.w * dpr); art.height = Math.round(env.h * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    // #gl (WebGL)
    glCanvas.width = Math.round(env.w * dpr); glCanvas.height = Math.round(env.h * dpr);
    if(window.DGL) window.DGL.resize();
    // notify 2D scenes
    for(var i=0;i<scenes.length;i++){ if(scenes[i].resize){ try{ scenes[i].resize(env); }catch(e){} } }
  }

  function govern(t){
    var dt = t - lastT; lastT = t;
    if(dt>0 && dt<200) ema += (dt-ema)*0.08;
    env.q = ema>40 ? 0.5 : ema>30 ? 0.72 : ema>22 ? 0.88 : 1;
    env.lowfx = ema > 30;
    if(governCd>0){ governCd--; return dt; }
    // sustained-slow → step DPR cap down; recovered → step back up
    if(ema>34 && DPR_CAP > DPR_MIN){ DPR_CAP = Math.max(DPR_MIN, DPR_CAP - 0.3); governCd = 90; sizeAll(); }
    else if(ema<18 && DPR_CAP < 1.6){ DPR_CAP = Math.min(1.6, DPR_CAP + 0.3); governCd = 90; sizeAll(); }
    return dt;
  }

  function frame(t){
    if(!running) return;
    var dt = govern(t);
    if(!(dt>0 && dt<200)) dt = 16.7;
    window.Pointer.update(dt, env.reduced);
    var mouse = window.Pointer.state;

    var s = scrollS();
    var active = computeActive(s);
    var ids = [];
    for(var a=0;a<active.length;a++){ ids.push(scenes[active[a].i].id); }

    // GL pass first (renders under #art). Clear GL canvas to transparent each frame.
    if(window.DGL){ window.DGL.clear(); window.DGL.sweep(ids); }

    // clear #art (transparent — #stage bg shows through as void)
    ctx.setTransform(env.dpr,0,0,env.dpr,0,0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0,0,env.w,env.h);

    for(var k=0;k<active.length;k++){
      var it = active[k], scene = scenes[it.i], p = it.p;
      if(!scene) continue;
      if(scene.gl && window.DGL){ window.DGL.run(scene, p, mouse, t); }
      if(scene.draw){
        ctx.globalAlpha = p.alpha;
        ctx.globalCompositeOperation = 'source-over';
        try { scene.draw(ctx, env, p, mouse, t); } catch(e){ /* keep page alive */ }
        // ANTI-MUDDINESS: reset after every scene
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }

    // HUD: progress + label + enter reveal
    if(progEl) progEl.style.width = (s*100).toFixed(2) + '%';
    var dom = active.length ? scenes[active[0].i] : null;
    var lab = (dom && dom.label) || '';
    if(lab !== lastLabel){ if(labelEl) labelEl.textContent = lab; lastLabel = lab; }
    if(enterEl){ if(s > 0.985){ enterEl.hidden = false; } else { enterEl.hidden = true; } }

    if(!env.reduced) requestAnimationFrame(frame);
  }

  function start(){
    env    = window.__DESCENT_ENV;
    scenes = (window.__DESCENT && window.__DESCENT.scenes) || [];
    art    = document.getElementById('art'); ctx = art.getContext('2d');
    glCanvas = document.getElementById('gl');
    progEl  = document.querySelector('#progress i');
    labelEl = document.getElementById('label');
    enterEl = document.getElementById('enter');

    // set --beats so the scroll spacer height matches scene count
    document.documentElement.style.setProperty('--beats', Math.max(1, scenes.length));

    // init GL manager (shared context on #gl)
    if(window.DGL) window.DGL.init(glCanvas, env);

    sizeAll();
    addEventListener('resize', sizeAll, { passive:true });

    // init 2D scenes
    for(var i=0;i<scenes.length;i++){ if(scenes[i].init){ try{ scenes[i].init(env); }catch(e){ console.warn('init', scenes[i].id, e); } } }

    running = true; lastT = performance.now();
    if(env.reduced){
      addEventListener('scroll', function(){ frame(performance.now()); }, { passive:true });
      frame(performance.now());
    } else {
      requestAnimationFrame(frame);
    }
  }

  window.Shell = {
    start: start,
    get env(){ return env; },
    gl: window.DGL || null,
    scenes: function(){ return (window.__DESCENT && window.__DESCENT.scenes) || []; }
  };
  // wire Shell.gl once DGL exists (load order guarantees core-gl before core-shell)
  if(window.DGL) window.Shell.gl = window.DGL;
})();

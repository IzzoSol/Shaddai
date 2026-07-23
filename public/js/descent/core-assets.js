/* SHADDAI · Descent — asset loader with placeholder fallback.
 * NEVER blanks, NEVER throws. Missing images fall back to an obsidian→emerald
 * placeholder canvas so a scene always has something to cover-fit.
 */
(function(){
  'use strict';

  // obsidian -> faint-emerald radial placeholder (built once, reused)
  var _ph = null;
  function placeholder(){
    if(_ph) return _ph;
    var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    g.fillStyle = '#06080b'; g.fillRect(0,0,S,S);
    var grd = g.createRadialGradient(S/2,S*0.42,0, S/2,S*0.5, S*0.75);
    grd.addColorStop(0, 'rgba(0,255,156,0.10)');
    grd.addColorStop(0.5, 'rgba(0,60,52,0.06)');
    grd.addColorStop(1, '#06080b');
    g.fillStyle = grd; g.fillRect(0,0,S,S);
    _ph = c; return c;
  }

  var _cache = {};   // src -> rec
  function img(src){
    if(_cache[src]) return _cache[src];
    var rec = { el:new Image(), ok:false, ph:placeholder(), src:src };
    rec.el.onload = function(){ if(rec.el.naturalWidth > 0) rec.ok = true; };
    rec.el.onerror = function(){ rec.ok = false; };   // never throws
    try { rec.el.src = src; } catch(e){ rec.ok = false; }
    _cache[src] = rec;
    return rec;
  }

  // cover-fit draw of a rec (or its placeholder) centered + optional drift.
  // kb = ken-burns scale multiplier (>=1), drift = {x,y} extra px offset.
  function cover(ctx, rec, w, h, kb, drift){
    kb = kb || 1; drift = drift || { x:0, y:0 };
    var src, iw, ih;
    if(rec && rec.ok){
      src = rec.el; iw = src.naturalWidth || src.width; ih = src.naturalHeight || src.height;
    } else {
      src = (rec && rec.ph) || placeholder(); iw = src.width; ih = src.height;
    }
    if(!iw || !ih){ src = placeholder(); iw = src.width; ih = src.height; }
    var sc = Math.max(w/iw, h/ih) * kb;
    var dw = iw*sc, dh = ih*sc;
    var dx = (w-dw)/2 + (drift.x||0);
    var dy = (h-dh)/2 + (drift.y||0);
    try { ctx.drawImage(src, dx, dy, dw, dh); } catch(e){}
  }

  // beat -> base image path. Simple object map for the 7 beats.
  var BASE = {
    'molecules': '/assets/descent/molecules/base.webp',
    'grass':     '/assets/descent/grass/base.webp',
    'ocean':     '/assets/descent/ocean/base.webp',
    'sun-moon':  '/assets/descent/sun-moon/base.webp',
    'cosmos':    '/assets/descent/cosmos/base.webp',
    'esoteric':  '/assets/descent/esoteric/base.webp',
    'arrival':   '/assets/descent/arrival/base.webp'
  };
  function base(beatId){ return BASE[beatId] || ('/assets/descent/' + beatId + '/base.webp'); }

  window.Assets = { img:img, placeholder:placeholder, cover:cover, base:base };
})();

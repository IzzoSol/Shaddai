/* SHADDAI · Descent — shared VIDEO TEXTURE helper
 * Lets any scene use a looping Seedance clip as a canvas texture (drawImage source).
 * Videos autoplay muted+looping (allowed) and are shared/cached by src.
 *   var vt = getVideoTex('/assets/journey/xxx.mp4');
 *   if (vt.ready) ctx.drawImage(vt.video, x, y, w, h);   // vt.video is a live HTMLVideoElement
 * Falls back silently (vt.ready stays false) if the file is missing or autoplay is blocked.
 */
(function () {
  'use strict';
  window.__VIDTEX = window.__VIDTEX || {};
  window.getVideoTex = function (src) {
    var cache = window.__VIDTEX;
    if (cache[src]) return cache[src];
    var rec = { video: null, ready: false, src: src };
    try {
      var v = document.createElement('video');
      v.src = src;
      v.loop = true; v.muted = true; v.defaultMuted = true; v.autoplay = true;
      v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.setAttribute('preload', 'auto');
      v.crossOrigin = 'anonymous';
      var kick = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
      v.addEventListener('loadeddata', function () {
        if (v.videoWidth > 0) { rec.ready = true; kick(); }
      });
      v.addEventListener('canplay', kick);
      v.addEventListener('playing', function () { rec.ready = true; });
      v.addEventListener('error', function () { rec.ready = false; });
      // first user gesture also un-gates autoplay on strict browsers
      window.addEventListener('pointerdown', kick, { once: true, passive: true });
      window.addEventListener('scroll', kick, { once: true, passive: true });
      kick();
      rec.video = v;
    } catch (e) { /* leave rec.ready = false */ }
    cache[src] = rec;
    return rec;
  };
})();

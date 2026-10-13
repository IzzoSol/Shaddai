/* ══════════════════════════════════════════════════════════════════
   SHADDAI — FORGE 3D SWIVEL
   Brings the real rotating 3D GLB model (from the standalone forge.html)
   INTO the on-theme dashboard forge swivel (#ofScene), with the agent
   PORTRAIT behind it. Follows the dashboard theme (transparent bg + a
   var(--accent) glow frame). Additive, null-safe, never throws.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MODELS = { SHADDAI:1, NEXUS:1, ZEROX:1, ORACLE:1, TURTLE:1, QUILL:1, PIKADON:1 };

  function curModel() {
    var m = String(window.SHADDAI_FORGE_MODEL || 'SHADDAI').toUpperCase();
    return MODELS[m] ? m : 'SHADDAI';
  }
  function srcFor(m) { return '/assets/agents/' + m + '.glb?v=14'; }

  // Load the <model-viewer> web component once (unpkg is already CSP-allowed — forge.html uses it).
  function ensureMV() {
    if (document.querySelector('script[data-forge3d-mv]')) return;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = '/model-viewer.min.js?v=15';
    s.setAttribute('data-forge3d-mv', '1');
    document.head.appendChild(s);
  }

  function injectStyles() {
    if (document.getElementById('forge3d-css')) return;
    var st = document.createElement('style');
    st.id = 'forge3d-css';
    st.textContent =
      '#operatorForge #ofScene { position:relative; }' +
      // portrait stays as the backdrop behind the 3D model
      '#operatorForge #ofScene #ofArt { z-index:1 !important; filter:saturate(.92) brightness(.9); }' +
      // dim the old 2D SVG compositor so the real 3D model reads clearly
      '#operatorForge #ofScene #ofComposite { opacity:.12 !important; }' +
      '#operatorForge #forge3dMv {' +
        'position:absolute; inset:0; z-index:3; width:100%; height:100%;' +
        'background:transparent; --poster-color:transparent; --progress-bar-color:var(--accent,#00ff88);' +
        'border-radius:16px; overflow:hidden; pointer-events:auto;' +
        'box-shadow:0 0 34px color-mix(in srgb, var(--accent,#00ff88) 35%, transparent), inset 0 0 40px rgba(0,0,0,.45);' +
        'border:1px solid color-mix(in srgb, var(--accent,#00ff88) 45%, transparent);' +
      '}' +
      '#operatorForge #forge3dBadge {' +
        'position:absolute; left:8px; top:8px; z-index:4; font:700 8px/1 "Share Tech Mono",monospace;' +
        'letter-spacing:.14em; color:var(--accent,#00ff88); background:rgba(0,0,0,.55);' +
        'border:1px solid color-mix(in srgb,var(--accent,#00ff88) 40%,transparent); border-radius:3px; padding:3px 7px;' +
      '}';
    document.head.appendChild(st);
  }

  function mount() {
    var scene = document.getElementById('ofScene');
    if (!scene) return false;
    if (document.getElementById('forge3dMv')) return true;
    injectStyles();
    ensureMV();
    var mv = document.createElement('model-viewer');
    mv.id = 'forge3dMv';
    mv.setAttribute('auto-rotate', '');
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('rotation-per-second', '22deg');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('shadow-intensity', '0.7');
    mv.setAttribute('exposure', '1.0');
    mv.setAttribute('environment-image', 'neutral');   // neutral IBL so PBR reads its texture, not a bright white mirror
    mv.setAttribute('tone-mapping', 'aces');
    mv.setAttribute('camera-orbit', '0deg 82deg 2.4m');
    mv.setAttribute('field-of-view', '32deg');
    mv.setAttribute('src', srcFor(curModel()));
    // TEXTURE FIX: Meshy GLBs export metallicFactor≈1 → the environment mirrors to solid white.
    // On load, walk the scene-graph materials and drop metalness to ~0 / bump roughness so the
    // real albedo texture shows. Runtime-only (no GLB re-export). Null-safe, never throws.
    mv.addEventListener('load', function () {
      try {
        var mats = (mv.model && mv.model.materials) || [];
        for (var i = 0; i < mats.length; i++) {
          var pbr = mats[i] && mats[i].pbrMetallicRoughness; if (!pbr) continue;
          try { pbr.setMetallicFactor(0); } catch (e) {}
          try { if (typeof pbr.roughnessFactor === 'number' && pbr.roughnessFactor < 0.6) pbr.setRoughnessFactor(0.7); } catch (e) {}
        }
      } catch (e) {}
    });
    mv.addEventListener('error', function () { /* GLB failed — portrait backdrop still shows */ });
    scene.appendChild(mv);
    var badge = document.createElement('div');
    badge.id = 'forge3dBadge'; badge.textContent = '◈ 3D · ' + curModel();
    scene.appendChild(badge);
    return true;
  }

  function update() {
    var mv = document.getElementById('forge3dMv');
    if (!mv) return;
    var want = srcFor(curModel());
    if (mv.getAttribute('src') !== want) {
      mv.setAttribute('src', want);
      var b = document.getElementById('forge3dBadge'); if (b) b.textContent = '◈ 3D · ' + curModel();
    }
  }

  var last = curModel();
  function boot() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      mount();
      var c = curModel();
      if (c !== last) { last = c; update(); }
      if (tries > 600) clearInterval(t); // ~5min safety
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SHADDAI_FORGE_3D = { update: update, model: curModel };
})();

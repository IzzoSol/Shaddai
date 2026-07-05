/* ============================================================================
 * SHADDAI · rooms-plus.js  —  Premium auto-generated agent Rooms (enhancement)
 * ----------------------------------------------------------------------------
 * Self-contained, additive, non-destructive layer. It WRAPS the existing
 * window.openRoomCustomizer(agentId) and, after the stock modal renders,
 * injects a character-themed premium panel (portrait, motifs, collectable +
 * trophy plinths) and an "Auto-Generate Room" button that applies a preset
 * tuned to the agent's archetype.
 *
 * It NEVER edits index.html or the backend, NEVER throws, and scopes all of
 * its DOM under `.rmx-*` classes. Pair with rooms-plus.css.
 *
 * Include AFTER index.html's own scripts:
 *   <link rel="stylesheet" href="/rooms-plus.css">
 *   <script src="/rooms-plus.js" defer></script>
 * ==========================================================================*/
(function () {
  'use strict';

  /* The 7 canonical archetypes. agentId is lowercase (e.g. "nexus"); the
   * archetype key is the uppercased form ("NEXUS"). Portrait art already lives
   * at /assets/agents/<ARCH>-portrait.png for every archetype. */
  var PRESETS = {
    SHADDAI: {
      roomName: "The Sovereign's Throne Sanctum",
      vibe: 'Sovereign command sanctum — gilded ember and gold',
      accent: '#ff6b35', accent2: '#ffd700',
      bgGradient: 'radial-gradient(ellipse at 25% 20%,rgba(255,107,53,0.22),transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(255,215,0,0.14),transparent 60%),#0d0603',
      motifs: ['👑 Throne', '🔥 Ember Sigils', '⚜️ Gilded Command'],
      wallpaper: 3, floor: 3, desk: 2, chair: 3
    },
    NEXUS: {
      roomName: "The Architect's Forge-Loft",
      vibe: 'Blueprint war-room — cool cyan engineering',
      accent: '#00c4ff', accent2: '#38bdf8',
      bgGradient: 'radial-gradient(ellipse at 20% 25%,rgba(0,196,255,0.20),transparent 60%),linear-gradient(135deg,rgba(56,189,248,0.10),transparent 55%),#03060f',
      motifs: ['📐 Blueprints', '🔧 Tool Wall', '🖥️ Server Rack'],
      wallpaper: 2, floor: 3, desk: 0, chair: 1
    },
    ZEROX: {
      roomName: 'The Gilded Vault-Parlor',
      vibe: 'Wealth trading floor — bullion and tickers',
      accent: '#ffd700', accent2: '#f59e0b',
      bgGradient: 'radial-gradient(ellipse at 70% 20%,rgba(255,215,0,0.20),transparent 60%),radial-gradient(ellipse at 20% 85%,rgba(245,158,11,0.14),transparent 60%),#0f0d03',
      motifs: ['💰 Vault', '📈 Ticker Wall', '🪙 Bullion'],
      wallpaper: 3, floor: 2, desk: 1, chair: 3
    },
    ORACLE: {
      roomName: 'The Astral Scrying Atelier',
      vibe: 'Cosmic observatory — violet nebula light',
      accent: '#a78bfa', accent2: '#c4b5fd',
      bgGradient: 'radial-gradient(ellipse at 30% 30%,rgba(167,139,250,0.22),transparent 60%),radial-gradient(ellipse at 80% 75%,rgba(124,58,237,0.16),transparent 60%),#08030f',
      motifs: ['🔮 Scrying Orb', '🌌 Star Map', '📜 Codex'],
      wallpaper: 0, floor: 1, desk: 3, chair: 1
    },
    TURTLE: {
      roomName: 'The Verdant Design Studio',
      vibe: 'Creative greenhouse loft — neon and foliage',
      accent: '#00ff88', accent2: '#4ade80',
      bgGradient: 'radial-gradient(ellipse at 25% 25%,rgba(0,255,136,0.18),transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(74,222,128,0.12),transparent 60%),#03100a',
      motifs: ['🎨 Easel', '🌿 Foliage', '✨ Neon Trim'],
      wallpaper: 1, floor: 1, desk: 3, chair: 2
    },
    QUILL: {
      roomName: "The Scrivener's Ink-Study",
      vibe: "Warm writer's library — amber candlelight",
      accent: '#fb923c', accent2: '#fdba74',
      bgGradient: 'radial-gradient(ellipse at 30% 25%,rgba(251,146,60,0.18),transparent 60%),linear-gradient(135deg,rgba(253,186,116,0.10),transparent 55%),#0f0803',
      motifs: ['✍️ Quill', '📚 Library', '🕯️ Candlelight'],
      wallpaper: 5, floor: 2, desk: 1, chair: 1
    },
    PIKADON: {
      roomName: 'The Aegis Security Bastion',
      vibe: 'Hardened watch-fort — crimson alert glow',
      accent: '#f43f5e', accent2: '#fb7185',
      bgGradient: 'radial-gradient(ellipse at center,rgba(244,63,94,0.18),transparent 65%),repeating-linear-gradient(135deg,rgba(244,63,94,0.05) 0 1px,transparent 1px 20px),#0f0306',
      motifs: ['🛡️ Aegis', '🔒 Vault Door', '📡 Watchtower'],
      wallpaper: 4, floor: 3, desk: 0, chair: 0
    }
  };

  var DEFAULT_PRESET = {
    roomName: "The Operative's Quarters",
    vibe: 'Personal command room',
    accent: '#ff6b35', accent2: '#ffd700',
    bgGradient: 'radial-gradient(ellipse at 25% 25%,rgba(255,107,53,0.16),transparent 60%),#08060c',
    motifs: ['✨ Signature Decor', '🏆 Trophy Wall', '📦 Collectables'],
    wallpaper: 0, floor: 0, desk: 0, chair: 0
  };

  function presetFor(archetype) {
    if (!archetype) return DEFAULT_PRESET;
    var key = String(archetype).trim().toUpperCase();
    return PRESETS[key] || DEFAULT_PRESET;
  }

  /* Public API */
  window.SHADDAI_ROOMS = window.SHADDAI_ROOMS || {};
  window.SHADDAI_ROOMS.presetFor = presetFor;
  window.SHADDAI_ROOMS.PRESETS = PRESETS;

  /* -------------------------------------------------------------------------
   * Archetype detection.
   *   1) Preferred: the agentId passed into openRoomCustomizer (closure).
   *   2) Fallback: modal title text ("🎨 NEXUS'S ROOM").
   *   3) Fallback: window.S operatives lookup by id, then .archetype/.name.
   * ---------------------------------------------------------------------- */
  function archetypeFromAgentId(agentId) {
    if (!agentId) return null;
    var key = String(agentId).trim().toUpperCase();
    if (PRESETS[key]) return key;
    // Try operatives registry for a mapped archetype/character.
    try {
      var S = window.S;
      var ops = (S && (S.operatives || (S.agents && S.agents.list))) || null;
      if (ops) {
        var op = Array.isArray(ops)
          ? ops.filter(function (o) { return o && String(o.id || o.name).toLowerCase() === String(agentId).toLowerCase(); })[0]
          : ops[agentId];
        if (op) {
          var cand = String(op.archetype || op.character || op.base || op.name || '').toUpperCase();
          if (PRESETS[cand]) return cand;
        }
      }
    } catch (_) { /* never throw */ }
    return null;
  }

  function archetypeFromTitle() {
    try {
      var t = document.getElementById('modalTitle');
      if (!t) return null;
      var up = t.textContent.toUpperCase();
      for (var k in PRESETS) { if (PRESETS.hasOwnProperty(k) && up.indexOf(k) !== -1) return k; }
    } catch (_) { /* ignore */ }
    return null;
  }

  function resolveArchetype(agentId) {
    return archetypeFromAgentId(agentId) || archetypeFromTitle() || 'SHADDAI';
  }

  /* -------------------------------------------------------------------------
   * Apply a preset to the stock customizer's temp config + highlight the
   * matching wallpaper/floor/desk/chair buttons so an eventual Save persists
   * the themed room via the ORIGINAL save logic (we never bypass it).
   * ---------------------------------------------------------------------- */
  function highlightGridChoice(gridId, index) {
    try {
      var grid = document.getElementById(gridId);
      if (!grid) return;
      var btns = grid.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].style.background = 'rgba(255,255,255,0.04)';
      }
      if (btns[index]) btns[index].style.background = 'rgba(255,255,255,0.2)';
    } catch (_) { /* ignore */ }
  }

  function applyPresetToConfig(agentId, preset) {
    try {
      if (!window._roomCfgTmp || typeof window._roomCfgTmp !== 'object') window._roomCfgTmp = {};
      window._roomCfgTmp.wallpaper = preset.wallpaper;
      window._roomCfgTmp.floor = preset.floor;
      window._roomCfgTmp.desk = preset.desk;
      window._roomCfgTmp.chair = preset.chair;
      highlightGridChoice('wpGrid_' + agentId, preset.wallpaper);
      highlightGridChoice('flGrid_' + agentId, preset.floor);
      highlightGridChoice('dskGrid_' + agentId, preset.desk);
      highlightGridChoice('chrGrid_' + agentId, preset.chair);
    } catch (_) { /* never throw */ }
  }

  function notify(msg) {
    try { if (typeof window.notify === 'function') window.notify(msg); } catch (_) { /* ignore */ }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* -------------------------------------------------------------------------
   * Build + inject the premium panel into the (already-rendered) modal.
   * ---------------------------------------------------------------------- */
  function buildPanel(agentId, arch, preset) {
    var portrait = '/assets/agents/' + arch + '-portrait.png';
    var motifChips = (preset.motifs || []).map(function (m) {
      return '<span class="rmx-chip">' + esc(m) + '</span>';
    }).join('');

    // 5 collectable plinths + 3 trophy slots — empty-state placeholders.
    var plinths = '';
    for (var i = 0; i < 5; i++) {
      plinths += '<div class="rmx-plinth"><span class="rmx-slot-glyph">◇</span></div>';
    }
    var trophies = '';
    for (var j = 0; j < 3; j++) {
      trophies += '<div class="rmx-trophy"><span class="rmx-slot-glyph">🏆</span></div>';
    }

    var panel = document.createElement('div');
    panel.className = 'rmx-panel';
    panel.setAttribute('data-rmx-archetype', arch);
    panel.style.setProperty('--rmx-accent', preset.accent);
    panel.style.setProperty('--rmx-accent2', preset.accent2);
    panel.style.setProperty('--rmx-bg', preset.bgGradient);

    panel.innerHTML =
      '<div class="rmx-banner">' +
        '<div class="rmx-portrait-frame">' +
          '<img class="rmx-portrait" alt="' + esc(arch) + '" src="' + portrait + '" ' +
               'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'rmx-noimg\')">' +
          '<span class="rmx-portrait-fallback">' + esc(arch.charAt(0)) + '</span>' +
        '</div>' +
        '<div class="rmx-banner-txt">' +
          '<div class="rmx-room-name">' + esc(arch) + ' · ' + esc(preset.roomName) + '</div>' +
          '<div class="rmx-vibe">' + esc(preset.vibe) + '</div>' +
          '<div class="rmx-motifs">' + motifChips + '</div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="rmx-autogen">✦ Auto-Generate Room</button>' +
      '<div class="rmx-shelves">' +
        '<div class="rmx-shelf">' +
          '<div class="rmx-shelf-label">Collectables</div>' +
          '<div class="rmx-plinths">' + plinths + '</div>' +
        '</div>' +
        '<div class="rmx-shelf">' +
          '<div class="rmx-shelf-label">Trophies</div>' +
          '<div class="rmx-trophies">' + trophies + '</div>' +
        '</div>' +
      '</div>';

    // Wire the Auto-Generate button (no inline globals needed — closure).
    try {
      var btn = panel.querySelector('.rmx-autogen');
      if (btn) {
        btn.addEventListener('click', function () {
          applyPresetToConfig(agentId, preset);
          panel.classList.remove('rmx-flash');
          // reflow to restart animation
          void panel.offsetWidth;
          panel.classList.add('rmx-flash');
          notify('✦ ' + arch + ' room auto-generated — ' + preset.roomName);
        });
      }
    } catch (_) { /* never throw */ }

    return panel;
  }

  function enhanceModal(agentId) {
    try {
      var content = document.getElementById('modalContent');
      var box = document.getElementById('modalBox');
      if (!content || !box) return;
      // Only enhance the room customizer (unique wallpaper grid marker present).
      if (!document.getElementById('wpGrid_' + agentId)) return;
      // Idempotent — don't double-inject.
      if (content.querySelector('.rmx-panel')) return;

      var arch = resolveArchetype(agentId);
      var preset = presetFor(arch);

      box.setAttribute('data-rmx-archetype', arch);
      box.classList.add('rmx-enhanced');

      var panel = buildPanel(agentId, arch, preset);
      content.insertBefore(panel, content.firstChild);

      // Auto-apply the character theme immediately so the room opens "top-tier".
      applyPresetToConfig(agentId, preset);
    } catch (_) { /* never throw — enhancement is best-effort */ }
  }

  /* -------------------------------------------------------------------------
   * Non-destructive wrap of the existing global. If it isn't defined yet,
   * retry briefly (scripts may load in any order), then give up quietly.
   * ---------------------------------------------------------------------- */
  function installWrap() {
    if (typeof window.openRoomCustomizer !== 'function') return false;
    if (window.openRoomCustomizer.__rmxWrapped) return true;

    var original = window.openRoomCustomizer;
    var wrapped = function (agentId) {
      var ret;
      try { ret = original.apply(this, arguments); }
      catch (e) { throw e; } // preserve original error behavior
      // Enhance after the stock modal has rendered.
      try {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () { enhanceModal(agentId); });
        } else {
          setTimeout(function () { enhanceModal(agentId); }, 0);
        }
        // Second pass in case the modal renders async.
        setTimeout(function () { enhanceModal(agentId); }, 60);
      } catch (_) { /* ignore */ }
      return ret;
    };
    wrapped.__rmxWrapped = true;
    window.openRoomCustomizer = wrapped;
    return true;
  }

  if (!installWrap()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (installWrap() || tries > 60) clearInterval(timer);
    }, 250);
  }
})();

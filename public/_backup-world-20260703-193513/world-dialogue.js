/* world-dialogue.js — SHADDAI World in-world agent dialogue system
 * Key: T — "Talk to <NAME>"  (E is already taken by building ENTER / EXIT)
 *
 * API (set by the lead after loading this script):
 *   const dialogue = window.buildWorldDialogue({ agents, getPlayer, onHire });
 *   // each frame:
 *   dialogue.update(dt);
 *   const agent = dialogue.nearestAgent(playerPos.x, playerPos.z);
 *   // on T keydown (when not open):
 *   if (agent) dialogue.open(agent.code);
 *   // movement gate:
 *   if (dialogue.isOpen()) { /* skip movement keys *\/ }
 *
 * agents  = [{ code, name, role, color, skills:[], portrait }]
 * getPlayer() → { x, z }
 * onHire(code) = optional callback
 */
(function (root) {
  'use strict';

  /* ── TALK RADIUS ─────────────────────────────────────────────────────────── */
  var TALK_RADIUS = 14;  // world units from building pos centre

  /* ── PER-AGENT GREETING LINES (personality-matched one-liners) ──────────── */
  var GREETINGS = {
    SHADDAI: 'Every empire begins with a single decision — let\'s make yours count.',
    NEXUS:   'Simple, testable, scalable — that\'s how we build things that last.',
    ZEROX:   'Show me your numbers and I\'ll show you exactly where the money\'s hiding.',
    ORACLE:  'The answer already exists — we just haven\'t looked in the right place yet.',
    TURTLE:  'Good design isn\'t decoration; it\'s the difference between ignored and loved.',
    QUILL:   'The right words at the right moment can open any door.',
    PIKADON: 'I\'ve already found three ways this could go wrong — want to hear them?'
  };

  /* ── CANNED FALLBACK REPLIES (shown when /api/agent/run is unavailable) ─── */
  var CANNED = {
    SHADDAI: 'Strategically speaking, every move you make either narrows or widens the path to dominance. What\'s your next play?',
    NEXUS:   'Break it down: what\'s the input, what\'s the expected output, and what\'s broken in between? We fix from there.',
    ZEROX:   'Every dollar has a job. Let\'s make sure yours is working overtime. What\'s your current monthly recurring revenue?',
    ORACLE:  'Interesting query. Cross-referencing known data patterns… the signal is definitely there if you know where to look.',
    TURTLE:  'Aesthetics and function converge at the limit. Tell me — what does the user feel the first second they see it?',
    QUILL:   'Clarity first, elegance second. Say it plainly to me right now — then we\'ll make it sing on the page.',
    PIKADON: 'Before I answer that, I need to know: who else currently has access to this information? Threat model first.'
  };

  /* ── ROLE LABELS (fallback if agents array omits role) ──────────────────── */
  var DEFAULT_ROLES = {
    SHADDAI: 'Supreme Orchestrator',
    NEXUS:   'Technical Architect',
    ZEROX:   'Wealth & Revenue Engine',
    ORACLE:  'Research & Intelligence',
    TURTLE:  'UI/UX & Creative',
    QUILL:   'Writing & Communication',
    PIKADON: 'Security & Compliance'
  };

  /* ── CSS ─────────────────────────────────────────────────────────────────── */
  var PANEL_CSS = [
    '#sdp-root{position:fixed;inset:0;z-index:9800;display:none;pointer-events:none;}',
    '#sdp-root.sdp-open{display:flex;align-items:center;justify-content:center;pointer-events:all;}',
    '#sdp-backdrop{position:absolute;inset:0;background:rgba(0,4,12,0.72);backdrop-filter:blur(3px);}',
    '#sdp-panel{',
    '  position:relative;z-index:1;',
    '  width:min(480px,92vw);max-height:80vh;',
    '  background:rgba(4,10,22,0.96);',
    '  border:1.5px solid var(--sdp-color,#27e0ff);',
    '  border-radius:10px;',
    '  box-shadow:0 0 32px 4px var(--sdp-glow,rgba(39,224,255,0.35)),inset 0 0 60px rgba(0,0,0,0.6);',
    '  display:flex;flex-direction:column;overflow:hidden;',
    '  font-family:"Share Tech Mono",Consolas,"Courier New",monospace;',
    '  color:#e8f4ff;',
    '  transition:box-shadow 0.4s ease;',
    '}',
    /* scan-line texture */
    '#sdp-panel::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:10;',
    '  background:repeating-linear-gradient(0deg,rgba(0,0,0,0.06) 0px,rgba(0,0,0,0.06) 1px,transparent 1px,transparent 3px);',
    '}',
    /* header */
    '#sdp-header{display:flex;align-items:center;gap:14px;padding:16px 18px 12px;',
    '  border-bottom:1px solid rgba(255,255,255,0.07);',
    '}',
    '#sdp-portrait{width:62px;height:62px;border-radius:8px;',
    '  border:2px solid var(--sdp-color,#27e0ff);',
    '  object-fit:cover;background:#0a1428;flex-shrink:0;',
    '  box-shadow:0 0 12px var(--sdp-glow,rgba(39,224,255,0.4));',
    '}',
    '#sdp-info{flex:1;min-width:0;}',
    '#sdp-name{margin:0 0 3px;font-size:1.15rem;letter-spacing:2px;color:var(--sdp-color,#27e0ff);text-transform:uppercase;}',
    '#sdp-role{margin:0;font-size:0.68rem;letter-spacing:1px;color:rgba(200,220,255,0.6);text-transform:uppercase;}',
    '#sdp-close-btn{',
    '  background:none;border:1px solid rgba(255,255,255,0.15);border-radius:5px;',
    '  color:rgba(200,220,255,0.5);font-size:1rem;cursor:pointer;',
    '  width:30px;height:30px;display:flex;align-items:center;justify-content:center;',
    '  transition:color 0.2s,border-color 0.2s;flex-shrink:0;',
    '}',
    '#sdp-close-btn:hover{color:#fff;border-color:rgba(255,255,255,0.4);}',
    /* body */
    '#sdp-body{padding:14px 18px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;}',
    /* greeting */
    '#sdp-greeting{',
    '  font-size:0.82rem;line-height:1.55;color:rgba(220,240,255,0.85);',
    '  font-style:italic;border-left:2px solid var(--sdp-color,#27e0ff);padding-left:10px;',
    '}',
    /* skills */
    '#sdp-skills{display:flex;flex-wrap:wrap;gap:5px;}',
    '.sdp-chip{',
    '  padding:3px 9px;border-radius:20px;font-size:0.66rem;letter-spacing:0.5px;',
    '  background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);',
    '  color:rgba(200,220,255,0.7);white-space:nowrap;',
    '}',
    '.sdp-chip-more{',
    '  padding:3px 9px;border-radius:20px;font-size:0.66rem;',
    '  background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);',
    '  color:rgba(200,220,255,0.4);cursor:default;',
    '}',
    /* ASK section */
    '#sdp-ask-section{display:flex;gap:8px;}',
    '#sdp-ask-input{',
    '  flex:1;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.15);',
    '  border-radius:6px;padding:7px 10px;color:#e8f4ff;font-size:0.78rem;',
    '  font-family:inherit;outline:none;',
    '  transition:border-color 0.2s;',
    '}',
    '#sdp-ask-input:focus{border-color:var(--sdp-color,#27e0ff);}',
    '#sdp-ask-input::placeholder{color:rgba(200,220,255,0.3);}',
    '#sdp-ask-btn{',
    '  padding:7px 14px;border-radius:6px;border:1px solid var(--sdp-color,#27e0ff);',
    '  background:rgba(39,224,255,0.08);color:var(--sdp-color,#27e0ff);',
    '  font-size:0.78rem;font-family:inherit;cursor:pointer;white-space:nowrap;',
    '  transition:background 0.2s;',
    '}',
    '#sdp-ask-btn:hover{background:rgba(39,224,255,0.18);}',
    '#sdp-ask-btn:disabled{opacity:0.45;cursor:default;}',
    /* reply */
    '#sdp-reply{',
    '  min-height:0;font-size:0.78rem;line-height:1.55;color:rgba(220,240,255,0.8);',
    '  background:rgba(0,0,0,0.3);border-radius:6px;padding:9px 11px;',
    '  display:none;border-left:2px solid rgba(255,255,255,0.12);',
    '}',
    '#sdp-reply.sdp-visible{display:block;}',
    /* actions */
    '#sdp-actions{display:flex;gap:10px;padding:10px 18px 16px;border-top:1px solid rgba(255,255,255,0.07);}',
    '#sdp-hire-btn{',
    '  flex:1;padding:9px;border-radius:7px;border:none;cursor:pointer;',
    '  background:var(--sdp-color,#27e0ff);color:#000;',
    '  font-size:0.82rem;font-family:inherit;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;',
    '  transition:opacity 0.2s,transform 0.1s;',
    '}',
    '#sdp-hire-btn:hover{opacity:0.85;transform:translateY(-1px);}',
    '#sdp-hire-btn:active{transform:translateY(0);}',
    '#sdp-close2-btn{',
    '  padding:9px 20px;border-radius:7px;',
    '  background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);',
    '  color:rgba(200,220,255,0.6);font-size:0.82rem;font-family:inherit;cursor:pointer;',
    '  transition:background 0.2s;',
    '}',
    '#sdp-close2-btn:hover{background:rgba(255,255,255,0.1);color:#fff;}',
  ].join('');

  /* ── DOM BUILDER ─────────────────────────────────────────────────────────── */
  function buildDOM() {
    var style = document.createElement('style');
    style.id = 'sdp-styles';
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = 'sdp-root';
    root.innerHTML = [
      '<div id="sdp-backdrop"></div>',
      '<div id="sdp-panel">',
      '  <div id="sdp-header">',
      '    <img id="sdp-portrait" alt="" />',
      '    <div id="sdp-info">',
      '      <p id="sdp-name"></p>',
      '      <p id="sdp-role"></p>',
      '    </div>',
      '    <button id="sdp-close-btn" aria-label="Close">✕</button>',
      '  </div>',
      '  <div id="sdp-body">',
      '    <p id="sdp-greeting"></p>',
      '    <div id="sdp-skills"></div>',
      '    <div id="sdp-ask-section">',
      '      <input id="sdp-ask-input" type="text" maxlength="200" />',
      '      <button id="sdp-ask-btn">ASK</button>',
      '    </div>',
      '    <div id="sdp-reply"></div>',
      '  </div>',
      '  <div id="sdp-actions">',
      '    <button id="sdp-hire-btn">⚡ HIRE</button>',
      '    <button id="sdp-close2-btn">CLOSE</button>',
      '  </div>',
      '</div>',
    ].join('');
    document.body.appendChild(root);
    return root;
  }

  /* ── HEX COLOR → CSS rgba ────────────────────────────────────────────────── */
  function hexToRgba(hex, alpha) {
    // hex may arrive as 0xRRGGBB number or '#rrggbb' string
    var n = (typeof hex === 'number') ? hex : parseInt(String(hex).replace('#', ''), 16);
    var r = (n >> 16) & 0xff;
    var g = (n >> 8)  & 0xff;
    var b =  n        & 0xff;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function hexToCss(hex) {
    var n = (typeof hex === 'number') ? hex : parseInt(String(hex).replace('#', ''), 16);
    return '#' + ('000000' + n.toString(16)).slice(-6);
  }

  /* ── SECTOR POSITION MAP (from window.WORLD_LAYOUT.sectors) ─────────────── */
  function getSectorMap() {
    var map = {};
    var layout = (typeof window !== 'undefined') && window.WORLD_LAYOUT;
    if (layout && layout.sectors) {
      layout.sectors.forEach(function (s) {
        map[s.code] = { x: s.pos[0], z: s.pos[1] };
      });
    }
    return map;
  }

  /* ── SAFE TEXT (XSS guard) ───────────────────────────────────────────────── */
  function safe(el, text) {
    el.textContent = String(text);
  }

  /* ── FACTORY ─────────────────────────────────────────────────────────────── */
  function buildWorldDialogue(opts) {
    var agents    = opts.agents    || [];
    var getPlayer = opts.getPlayer || function () { return { x: 0, z: 0 }; };
    var onHire    = opts.onHire    || null;

    // Build index: code → agent
    var agentMap = {};
    agents.forEach(function (a) { agentMap[a.code] = a; });

    // DOM
    var root        = buildDOM();
    var panel       = document.getElementById('sdp-panel');
    var portrait    = document.getElementById('sdp-portrait');
    var nameEl      = document.getElementById('sdp-name');
    var roleEl      = document.getElementById('sdp-role');
    var greetingEl  = document.getElementById('sdp-greeting');
    var skillsEl    = document.getElementById('sdp-skills');
    var askInput    = document.getElementById('sdp-ask-input');
    var askBtn      = document.getElementById('sdp-ask-btn');
    var replyEl     = document.getElementById('sdp-reply');
    var hireBtn     = document.getElementById('sdp-hire-btn');
    var closeBtnTop = document.getElementById('sdp-close-btn');
    var closeBtn2   = document.getElementById('sdp-close2-btn');
    var backdrop    = document.getElementById('sdp-backdrop');

    var _open     = false;
    var _curCode  = null;
    var _glowPhase = 0;    // used by update() for panel pulse animation

    /* ── populate panel for an agent ───────────────────────────────────── */
    function populate(code) {
      var ag  = agentMap[code] || {};
      var col = ag.color || 0x27e0ff;
      var css = hexToCss(col);
      var glow = hexToRgba(col, 0.40);

      panel.style.setProperty('--sdp-color', css);
      panel.style.setProperty('--sdp-glow',  glow);

      // portrait (safe: it's a URL set via .src, never innerHTML)
      if (ag.portrait) {
        portrait.src = ag.portrait;
        portrait.style.display = '';
      } else {
        portrait.src = '';
        portrait.style.display = 'none';
      }
      portrait.style.borderColor = css;
      portrait.style.boxShadow   = '0 0 14px ' + glow;

      safe(nameEl,     ag.name || code);
      safe(roleEl,     ag.role || DEFAULT_ROLES[code] || '');
      safe(greetingEl, GREETINGS[code] || 'Welcome, traveller.');

      // skills chips (max 12 shown + overflow chip)
      skillsEl.innerHTML = '';
      var skills = Array.isArray(ag.skills) ? ag.skills : [];
      var MAX_CHIPS = 12;
      skills.slice(0, MAX_CHIPS).forEach(function (sk) {
        var chip = document.createElement('span');
        chip.className = 'sdp-chip';
        safe(chip, sk);
        skillsEl.appendChild(chip);
      });
      if (skills.length > MAX_CHIPS) {
        var more = document.createElement('span');
        more.className = 'sdp-chip-more';
        safe(more, '+' + (skills.length - MAX_CHIPS) + ' more');
        skillsEl.appendChild(more);
      }

      // ASK placeholder
      askInput.placeholder = 'Ask ' + (ag.name || code) + ' something…';
      askInput.value = '';
      replyEl.textContent = '';
      replyEl.className = 'sdp';   // hide reply
    }

    /* ── ASK handler ────────────────────────────────────────────────────── */
    function handleAsk() {
      var text = askInput.value.trim();
      if (!text || !_curCode) return;

      askBtn.disabled = true;
      safe(replyEl, '…');
      replyEl.className = 'sdp-visible';

      // Try the live API, fall back to canned
      var agCode = _curCode;
      var didRespond = false;

      function useCanned() {
        if (didRespond) return;
        didRespond = true;
        safe(replyEl, CANNED[agCode] || 'I\'ll get back to you on that.');
        askBtn.disabled = false;
      }

      if (typeof fetch === 'function') {
        var timer = setTimeout(useCanned, 8000);   // 8-second timeout guard
        fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent: agCode.toLowerCase(), prompt: text })
        })
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (didRespond) return;
          didRespond = true;
          // accept common response shapes
          var reply = data.response || data.result || data.message || data.output || '';
          safe(replyEl, reply || CANNED[agCode]);
          askBtn.disabled = false;
        })
        .catch(function () {
          clearTimeout(timer);
          useCanned();
        });
      } else {
        useCanned();
      }
    }

    /* ── wire buttons / keys ────────────────────────────────────────────── */
    function closePanel() {
      _open = false;
      _curCode = null;
      root.classList.remove('sdp-open');
    }

    closeBtnTop.addEventListener('click', closePanel);
    closeBtn2.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    hireBtn.addEventListener('click', function () {
      if (_curCode && typeof onHire === 'function') onHire(_curCode);
      closePanel();
    });

    askBtn.addEventListener('click', handleAsk);
    askInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); handleAsk(); }
      e.stopPropagation();   // don't leak WASD/T etc. to the world while typing
    });

    // Escape closes the dialogue (global listener, only acts when open)
    document.addEventListener('keydown', function (e) {
      if (_open && e.code === 'Escape') closePanel();
    });

    /* ── public API ─────────────────────────────────────────────────────── */

    /**
     * nearestAgent(x, z) — returns the closest agent whose building is within
     * TALK_RADIUS of the given world position, else null.
     */
    function nearestAgent(x, z) {
      var sectorMap = getSectorMap();
      var best = null, bestDist = TALK_RADIUS * TALK_RADIUS;

      agents.forEach(function (ag) {
        var sec = sectorMap[ag.code];
        if (!sec) return;
        var dx = x - sec.x, dz = z - sec.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < bestDist) { bestDist = d2; best = ag; }
      });
      return best;
    }

    /**
     * open(code) — reveal the dialogue panel for the given agent code.
     */
    function open(code) {
      if (!agentMap[code]) return;
      _curCode = code;
      populate(code);
      _open = true;
      _glowPhase = 0;
      root.classList.add('sdp-open');
      // focus the ask input after the transition frame
      setTimeout(function () { askInput.focus(); }, 60);
    }

    /**
     * close() — hide the panel.
     */
    function close() { closePanel(); }

    /**
     * isOpen() — true while the dialogue panel is visible.
     */
    function isOpen() { return _open; }

    /**
     * update(dt) — call each frame. Drives a subtle border-glow pulse.
     */
    function update(dt) {
      if (!_open) return;
      _glowPhase += dt * 1.8;
      var pulse = 0.28 + 0.14 * Math.sin(_glowPhase);
      var col = panel.style.getPropertyValue('--sdp-color') || '#27e0ff';
      // parse the hex colour out of CSS to build an rgba glow
      panel.style.boxShadow =
        '0 0 32px 6px rgba(39,224,255,' + pulse + '),' +
        'inset 0 0 60px rgba(0,0,0,0.6)';
      // the --sdp-color variable already drives border; we just pulse the glow
    }

    return { update: update, nearestAgent: nearestAgent, open: open, close: close, isOpen: isOpen };
  }

  /* ── expose ─────────────────────────────────────────────────────────────── */
  root.buildWorldDialogue = buildWorldDialogue;

}(typeof window !== 'undefined' ? window : global));

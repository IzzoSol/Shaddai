/* ============================================================================
 * SHADDAI PIXEL OFFICE  —  by TURTLE (design + game lead)
 * ----------------------------------------------------------------------------
 * A fast, self-contained, isometric 2.5D office MMO stand-in for the heavy 3D
 * world. Pure Canvas 2D. Zero external libraries / assets (all procedural).
 * Loads instantly. Elevated to a premium isometric-game SHOWPIECE while keeping
 * every public hook, the mount/unmount lifecycle, and the perf safeguards.
 *
 * PUBLIC API  (window.PixelOffice):
 *   mount(hostEl)                       build the experience inside hostEl (idempotent)
 *   unmount()                           tear down, stop rAF, remove DOM/listeners
 *   addCollectable({tileX,tileY,icon})  drop a collectable onto the floor (hook for later)
 *   onPay(cb)                           register an x402 payment callback (hook for later)
 *   selectAgent(name)                   programmatically select + center an agent
 *
 * MOUNT CONTRACT: safe to call mount() repeatedly; pauses its render loop when
 * unmounted or when the host is not visible (IntersectionObserver + rAF flag).
 *
 * ISO PROJECTION (see isoToScreen): a "diamond" tile grid. Each tile (col,row)
 * maps to screen space as:
 *     sx = originX + (col - row) * TILE_W/2
 *     sy = originY + (col + row) * TILE_H/2
 * TILE_W:TILE_H ≈ 2:1 for the classic 2:1 isometric look.
 *
 * PERF DISCIPLINE: single rAF, stops on unmount, pauses when offscreen
 * (IntersectionObserver → `visible` flag). Only visible/on-screen work is drawn.
 * Idle bobs, blinks, bubbles, selection pulse, water shimmer are all cheap
 * Canvas math driven by a shared clock — no per-frame allocations in hot paths.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.PixelOffice && window.PixelOffice.__v === 7) return; // already loaded

  // ---- Brand + agent theming ------------------------------------------------
  // Positions re-spaced for the larger 22x20 footprint (see LAYOUT below).
  const AGENTS = [
    { name: 'SHADDAI', color: '#f0b429', tile: [11, 4],  role: 'Orchestrator' },
    { name: 'ZEROX',   color: '#00e5ff', tile: [4, 8],   role: 'Revenue' },
    { name: 'ORACLE',  color: '#a78bfa', tile: [17, 8],  role: 'Research' },
    { name: 'NEXUS',   color: '#00f0ff', tile: [4, 13],  role: 'Architect' },
    { name: 'TURTLE',  color: '#00ff88', tile: [17, 13], role: 'Design' },
    { name: 'QUILL',   color: '#fb923c', tile: [8, 16],  role: 'Writing' },
    { name: 'PIKADON', color: '#f43f5e', tile: [13, 16], role: 'Security' },
  ];
  // ROSTER = the 7 council above PLUS the owner's forged operatives (merged at runtime from
  // window._officeOperatives). Everything that spawns/draws/lists agents reads ROSTER, so forged
  // agents become real walkable, clickable, chatting characters in the office. See syncRoster().
  let ROSTER = AGENTS.slice();

  // ---- IN-CHARACTER ONE-LINERS (idle speech bubbles) ------------------------
  // Kept as data so they are easy to extend. Short, on-brand, a little witty.
  const LINES = {
    SHADDAI: [
      'The empire scales while others sleep.',
      'Phase 2 is not a question of if.',
      'Every tile answers to the throne.',
      'Strategy first. Then dominion.',
      'I see three moves ahead. You saw one.',
      'Consensus reached. Execute.',
    ],
    ZEROX: [
      'MRR is up. The chart likes us.',
      'Unit economics: chef’s kiss.',
      'Buy fear, bill confidence.',
      'Pro tier ROI? Absurd.',
      'Every click is a coin.',
      'Cash flow never sleeps.',
    ],
    ORACLE: [
      'The trend was written weeks ago.',
      'An omen: volatility rising.',
      'I connect the dots you cannot see.',
      'Data whispers. I translate.',
      'The signal is in the noise.',
      'Question every assumption. Twice.',
    ],
    NEXUS: [
      'Routing traffic. Zero dropped packets.',
      'Simple beats clever. Every time.',
      'The API is fast because I am tired.',
      'Cache warm. Latency cold.',
      'It scales. I made sure.',
      'Ship the pragmatic thing.',
    ],
    TURTLE: [
      'Pixels with intent. Never generic.',
      'That gradient? Deliberate.',
      'Beauty is a feature, not a coat of paint.',
      'Slow down — is it delightful?',
      'Contrast, rhythm, restraint.',
      'We ship showpieces, not screenshots.',
    ],
    QUILL: [
      'Clarity is a kindness.',
      'One less word. Say it again.',
      'The docs write themselves. I lie.',
      'Good copy disappears.',
      'Error messages are apologies.',
      'Read it aloud. Does it sing?',
    ],
    PIKADON: [
      'Assume breach. Verify everything.',
      'That input is not to be trusted.',
      'Rotate the secrets. Now.',
      'Audit trail: complete.',
      'Worst case is my baseline case.',
      'Locked, logged, and watching.',
    ],
  };

  // ---- Grid / iso constants -------------------------------------------------
  const GRID_W = 22, GRID_H = 20;   // logical tile grid (roomier city-seed footprint)
  const TILE_W = 56, TILE_H = 28;   // 2:1 iso diamond footprint (base; scaled to fit)

  // ---------------------------------------------------------------------------
  // ROOM LAYOUT DATA
  //   0 floor(lobby)  1 wall  2 breakroom  3 boss(rug)  4 boardroom
  //   5 agentdesk     6 grass  7 water      8 shelf(collectables)  9 elevator
  //   R forge floor(warm)  K bank floor  M market floor  H docks(planks)
  // ---------------------------------------------------------------------------
  const F = 0, W = 1, B = 2, O = 3, D = 4, A = 5, G = 6, T = 7, S = 8, E = 9,
        R = 10, K = 11, M = 12, H = 13;
  const LAYOUT = [
    [W,W,W,W,W,W,W,W,W,O,O,O,W,W,W,W,W,W,W,W,W,W],
    [W,E,F,F,F,F,F,W,O,O,O,O,O,W,F,F,F,F,F,S,S,W],
    [W,E,F,F,F,F,F,F,O,O,O,O,O,F,F,F,F,F,F,S,S,W],
    [W,F,F,F,F,F,F,F,F,O,O,O,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,B,B,B,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,B,B,B,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,B,B,B,F,F,F,D,D,D,D,D,D,D,D,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,D,D,D,D,D,D,D,D,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,D,D,D,D,D,D,D,D,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,D,D,D,D,D,D,D,D,F,F,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,R,R,R,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,R,R,R,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,R,R,R,W],
    [W,K,K,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,R,R,R,W],
    [W,K,K,F,F,F,F,F,F,F,F,F,F,F,F,F,M,M,F,F,F,W],
    [W,K,K,F,F,F,F,F,F,F,F,F,F,F,F,F,M,M,F,F,F,W],
    [W,F,F,F,F,F,H,H,H,F,F,F,F,F,F,F,M,M,F,F,F,W],
    [W,F,F,F,F,F,H,H,H,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  ];
  const isWall = (c, r) =>
    r < 0 || c < 0 || r >= GRID_H || c >= GRID_W || LAYOUT[r][c] === W;

  // Labelled zones (drawn as floating tags in iso space) ----------------------
  const ZONES = [
    { label: 'RECEPTION',    at: [3, 2],   color: '#ffd700' },
    { label: 'BOSS OFFICE',  at: [10.5, 1.6], color: '#f0b429' },
    { label: 'BOARDROOM',    at: [10.5, 8.5], color: '#00e5ff' },
    { label: 'BREAK ROOM',   at: [2, 5.5],  color: '#00ff88' },
    { label: 'COLLECTABLES', at: [19.5, 1.4], color: '#a78bfa' },
    { label: '⬡ THE FORGE',  at: [19, 11.4], color: '#ff8c1a' },
  ];

  // ---- Clickable "buildings" (hit-tested tile regions) ----------------------
  //   The Forge routes into the dashboard Forge; the rest are city "coming soon"
  //   footprints so the office reads as the seed of a larger city.
  const BUILDINGS = [
    { id: 'forge',  label: '⬡ THE FORGE', soon: false, color: '#ff8c1a',
      tiles: R, center: [19, 12.5], door: [17, 12] },
    { id: 'bank',   label: 'BANK',   soon: true, color: '#ffd76a',
      tiles: K, center: [1.5, 15],  door: [3, 15] },
    { id: 'market', label: '🏪 BAZAAR', soon: true, active: true, color: '#e8b84b',
      tiles: M, center: [16.5, 15.5], door: [15, 16] },
    { id: 'docks',  label: 'DOCKS',  soon: true, color: '#38bdf8',
      tiles: H, center: [7, 17.5], door: [8, 17] },
  ];

  // ---- REAL NAVIGATION DOORS (open dashboard Office sub-tabs) ----------------
  //   Each is a labeled, clickable building/desk INSIDE the office. Clicking one
  //   dispatches CustomEvent('pixeloffice:enter-building',{detail:{building:key}})
  //   and (best-effort) calls window.showView(key) so the user can reach every
  //   Office function from within the pixel office. Hit-tested by a tile radius
  //   around `center` (rendered as an on-theme kiosk/door prop + label).
  const NAV_DOORS = [
    { id: 'command',  label: '◈ MISSION DECK', short: 'Work Board',
      color: '#00e5ff', center: [10.5, 11.4], glyph: '◈', hitR: 2.2 },
    { id: 'projects', label: '▤ PROJECTS',     short: 'Projects',
      color: '#7ee787', center: [5.5, 3.4],  glyph: '▤', hitR: 1.7 },
    { id: 'skills',   label: '✦ SKILLS',       short: 'Skills',
      color: '#a78bfa', center: [16, 3.4],   glyph: '✦', hitR: 1.7 },
    { id: 'library',  label: '❖ LIBRARY',      short: 'Library',
      color: '#fb923c', center: [19.5, 2.4], glyph: '❖', hitR: 1.7 },
    { id: 'boardroom',label: '⬢ BOARDROOM',    short: 'Boardroom',
      color: '#00b4d8', center: [10.5, 6.2], glyph: '⬢', hitR: 1.8 },
  ];

  // ---- Module state ---------------------------------------------------------
  let host = null, canvas = null, ctx = null, hud = null;
  let dpr = 1, running = false, rafId = 0, visible = true, io = null, ro = null;
  let originX = 0, originY = 0, scale = 1;      // camera
  let camTargetX = 0, camTargetY = 0;           // recenter easing
  let selected = 'SHADDAI';
  let sprites = {};                             // name -> sprite runtime
  const collectables = [];                      // {tileX,tileY,icon}
  const payCallbacks = [];                      // x402 hooks
  let lastT = 0, hoverTile = null, hoverDoor = null;
  let mountAt = 0;                              // for the staggered intro reveal
  let nextBubbleAt = 0;                         // scheduler for idle chatter

  // ---- MULTIPLAYER (opt-in; single-player unchanged when offline) -----------
  //   Contract:
  //     POST /api/mp/sync  {room,id,name,agent,x,y}
  //        -> {ok, online, players:[{id,name,agent,x,y}], chat:[{name,text,t}]}
  //     POST /api/mp/chat  {room,id,name,text} -> {ok}
  //   All fetch is try/catch + backoff. On repeated failure or non-OK we
  //   permanently DISABLE MP for this mount (no console spam, never throws).
  const MP = {
    room: 'office',
    joined: false,                 // are we online?
    available: true,               // set false after repeated failures / opened as file://
    player: null,                  // {id,name} persistent identity
    you: null,                     // YOUR avatar sprite (walks the office when joined)
    others: {},                    // id -> remote sprite runtime {id,name,agent,col,row,tcol,trow,...}
    chat: [],                      // last chat array from sync (name,text,t)
    online: 0,                     // reported online count
    pollTimer: 0,                  // setInterval handle
    inFlight: false,               // guard against overlapping syncs
    fails: 0,                      // consecutive failure counter
    POLL_MS: 1300,
    MAX_FAILS: 4,
    panel: null,                   // chat panel DOM
    goBtn: null,                   // "Go Online" HUD button
    onlineChip: null,              // "● N online" indicator
    msgList: null, msgInput: null, // chat DOM refs
    nameInput: null,
    seenChatKey: '',               // to skip re-rendering identical chat
  };
  const YOU_COLOR = '#e8eef5';     // neutral operator tone (distinct from the 7 agents)

  // ---- ISO MATH -------------------------------------------------------------
  function isoToScreen(col, row) {
    return {
      x: originX + (col - row) * (TILE_W * scale) / 2,
      y: originY + (col + row) * (TILE_H * scale) / 2,
    };
  }
  function screenToIso(px, py) {
    const dx = (px - originX) / ((TILE_W * scale) / 2);
    const dy = (py - originY) / ((TILE_H * scale) / 2);
    return { col: (dx + dy) / 2, row: (dy - dx) / 2 };
  }

  // ---- Fit camera so the ENTIRE scene (floor + wall/prop height + labels)
  //      is fully contained within the host, with comfortable margin --------
  //
  //   FIT MATH (guarantees nothing is ever clipped):
  //   1. Compute the iso content bounding box in *unscaled* screen units
  //      (i.e. as if scale === 1, origin at 0,0). The floor diamond's four
  //      corners project to:
  //          minSX = -(GRID_H) * TILE_W/2   (left  = tile [0, GRID_H])
  //          maxSX =  (GRID_W) * TILE_W/2   (right = tile [GRID_W, 0])
  //          minSY =  0                     (top   = tile [0,0])
  //          maxSY = (GRID_W+GRID_H)*TILE_H/2 (bottom = far corner)
  //      We then EXPAND this box by the extra vertical/horizontal reach of
  //      things drawn ABOVE the floor (walls, furnace, tall props, sprite
  //      name labels, floating emblems) and BELOW it (contact shadows) plus a
  //      little horizontal slack for labels near the diamond's left/right tips.
  //   2. Let content span be (cw, ch) at scale=1. To fit inside the host with
  //      PAD fractional margin on every side:
  //          scale = min( (w*(1-2*PAD)) / cw , (h*(1-2*PAD)) / ch )
  //      Using min() over BOTH axes means the box is contained in width AND
  //      height for wide OR tall hosts. Then we center the *scaled box* in the
  //      host and back out originX/originY so the box's min corner lands at the
  //      centered position. This is exact — the box, scaled and translated, is
  //      provably inside the host rect.
  const PAD = 0.07;                 // ~7% breathing room on every side
  // extra reach (in unscaled px) beyond the flat floor diamond:
  const REACH_TOP = 78;             // tallest thing above a tile: sprite label + emblem
  const REACH_BOTTOM = 14;          // contact shadow droop below the front row
  const REACH_SIDE = 30;            // zone/name labels poking past the L/R tips
  function fitCamera() {
    if (!canvas) return;
    const w = canvas.width / dpr, h = canvas.height / dpr;

    // (1) unscaled content box (scale = 1, origin = 0,0)
    const minSX = -(GRID_H * TILE_W / 2) - REACH_SIDE;
    const maxSX = (GRID_W * TILE_W / 2) + REACH_SIDE;
    const minSY = 0 - REACH_TOP;
    const maxSY = (GRID_W + GRID_H) * TILE_H / 2 + REACH_BOTTOM;
    const cw = maxSX - minSX;        // content width  @ scale 1
    const ch = maxSY - minSY;        // content height @ scale 1

    // (2) scale that contains the box in BOTH axes with PAD margin
    const availW = Math.max(1, w * (1 - 2 * PAD));
    const availH = Math.max(1, h * (1 - 2 * PAD));
    scale = Math.min(availW / cw, availH / ch);
    scale = Math.max(0.08, Math.min(scale, 1.8));

    // center the scaled box in the host, then solve origin so the box's
    // min-corner lands at the centered top-left.
    const boxW = cw * scale, boxH = ch * scale;
    const boxLeft = (w - boxW) / 2;
    const boxTop = (h - boxH) / 2;
    // origin maps unscaled (0,0); box min corner sits at origin + min*scale.
    camTargetX = boxLeft - minSX * scale;
    camTargetY = boxTop - minSY * scale;
    // ZOOM + FRAME on the capital district so the office fills the frame (not a
    // miniature board): scale up and center the district on-screen.
    try {
      scale = Math.min(1.8, scale * 1.32);
      const dc = DIST.center[0], dr = DIST.center[1];
      camTargetX = w / 2 - (dc - dr) * (TILE_W * scale) / 2;
      camTargetY = h * 0.52 - (dc + dr) * (TILE_H * scale) / 2;
    } catch (e) {}
    if (!originX && !originY) { originX = camTargetX; originY = camTargetY; }
  }

  // ---- PATHING: greedy BFS on the walkable grid ------------------------------
  function findPath(sc, sr, tc, tr) {
    sc |= 0; sr |= 0; tc |= 0; tr |= 0;
    if (isWall(tc, tr)) return null;
    const key = (c, r) => r * GRID_W + c;
    const q = [[sc, sr]], prev = {}; prev[key(sc, sr)] = null;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let found = false, guard = 0;
    while (q.length && guard++ < GRID_W * GRID_H) {
      const [c, r] = q.shift();
      if (c === tc && r === tr) { found = true; break; }
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr, k = key(nc, nr);
        if (!isWall(nc, nr) && !(k in prev)) { prev[k] = [c, r]; q.push([nc, nr]); }
      }
    }
    if (!found) return null;
    const path = []; let cur = [tc, tr];
    while (cur) { path.unshift({ c: cur[0], r: cur[1] }); cur = prev[key(cur[0], cur[1])]; }
    return path;
  }

  // ---- SPRITE MODEL ---------------------------------------------------------
  function makeSprite(a, i) {
    return {
      name: a.name, color: a.color, role: a.role,
      forged: !!a.forged, skinIcon: a.skinIcon || '',
      col: a.tile[0], row: a.tile[1],   // logical position (fractional while moving)
      homeCol: a.tile[0], homeRow: a.tile[1],
      idx: i,
      path: null, pathI: 0,
      face: 1,                          // +1 faces screen-right, -1 faces screen-left
      bob: Math.random() * Math.PI * 2, // idle bob phase
      breath: Math.random() * Math.PI * 2,
      nextBlinkAt: performance.now() + 1500 + Math.random() * 4000,
      blinkUntil: 0,
      wanderAt: performance.now() + 2000 + Math.random() * 4000,
      // speech bubble runtime
      bubbleText: '', bubbleStart: 0, bubbleDur: 0,
    };
  }
  function resetSprites() {
    sprites = {};
    ROSTER.forEach((a, i) => { sprites[a.name] = makeSprite(a, i); });
  }

  // ---- FORGED-AGENT ROSTER SYNC ---------------------------------------------
  // Merge the owner's forged operatives (window._officeOperatives) into ROSTER as walkable
  // characters, place them on open floor tiles, and keep sprites/chips in sync. Idempotent.
  const MAX_FORGED = 10;
  const RARITY_COLOR = { legendary:'#ffd700', epic:'#c084fc', rare:'#00e5ff', uncommon:'#00ff88', common:'#8fb0c4' };
  const GENERIC_LINES = ['Operative online.', 'Loadout ready.', 'Awaiting orders.', 'On the grid.', 'Executing tasks.', 'Forged and functional.', 'Tools primed.'];
  function _forgedColor(op) {
    if (op && op.color) return op.color;
    const rk = String((op && op.rarity) || '').toLowerCase();
    if (RARITY_COLOR[rk]) return RARITY_COLOR[rk];
    let h = 0, s = String((op && (op.codename || op.name)) || 'A');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ',72%,62%)';
  }
  function _freeFloorTiles() {
    const used = new Set(AGENTS.map(a => a.tile[0] + ',' + a.tile[1]));
    const out = [];
    for (let r = 2; r < GRID_H - 1; r++)
      for (let c = 2; c < GRID_W - 1; c++)
        if (LAYOUT[r][c] === F && !used.has(c + ',' + r)) out.push([c, r]);
    return out;
  }
  function _assignForgedTiles(n) {
    const free = _freeFloorTiles(); const tiles = []; if (!free.length || n <= 0) return tiles;
    const stride = Math.max(1, Math.floor(free.length / Math.max(1, n))); const usedIdx = new Set();
    for (let i = 0; i < n; i++) {
      let idx = (i * stride + 5) % free.length, g = 0;
      while (usedIdx.has(idx) && g++ < free.length) idx = (idx + 1) % free.length;
      usedIdx.add(idx); tiles.push(free[idx]);
    }
    return tiles;
  }
  function _readForged() {
    const base = new Set(AGENTS.map(a => a.name.toUpperCase()));
    const list = (typeof window !== 'undefined' && (window._officeOperatives || window._operatives)) || [];
    const seen = new Set(), forged = [];
    (Array.isArray(list) ? list : []).forEach(item => {
      const op = (item && item.op) ? item.op : item;   // dashboard office items nest the record under .op
      const nm = String((item && item.name) || (op && (op.codename || op.name)) || '').trim(); if (!nm) return;
      const up = nm.toUpperCase(); if (base.has(up) || seen.has(up)) return; seen.add(up);
      // Pixel Forge agents carry look.pixel = { color, icon, ... } — use it for skin.
      const pix = (op && op.look && op.look.pixel) || null;
      const color = (pix && pix.color) || (item && item.color) || _forgedColor(op);
      const role = (op && (op.role || op.archetype)) || (item && item.role) || 'Operative';
      forged.push({ name: nm, color: color, role: role, forged: true, skinIcon: (pix && pix.icon) || '' });
    });
    return forged.slice(0, MAX_FORGED);
  }
  function syncRoster() {
    const forged = _readForged(); const tiles = _assignForgedTiles(forged.length);
    forged.forEach((f, i) => { f.tile = tiles[i] || [8, 8]; });
    ROSTER = AGENTS.concat(forged);
  }
  function reconcileSprites() {
    ROSTER.forEach((a, i) => {
      if (!sprites[a.name]) sprites[a.name] = makeSprite(a, i);
      else { sprites[a.name].idx = i; sprites[a.name].color = a.color; sprites[a.name].role = a.role; sprites[a.name].skinIcon = a.skinIcon || ''; sprites[a.name].forged = !!a.forged; }
    });
    const keep = new Set(ROSTER.map(a => a.name));
    Object.keys(sprites).forEach(nm => { if (!keep.has(nm)) delete sprites[nm]; });
  }
  function rebuildChips() {
    if (!hud) return; const chips = hud.querySelector('.pxo-chips'); if (!chips) return;
    chips.innerHTML = '';
    ROSTER.forEach(a => {
      const b = document.createElement('button');
      b.className = 'pxo-chip'; b.dataset.agent = a.name; b.style.setProperty('--ac', a.color);
      b.innerHTML = '<span class="dot"></span>' + a.name;
      b.addEventListener('click', () => selectAgent(a.name, true));
      chips.appendChild(b);
    });
  }
  // Public re-sync: called on mount and by the dashboard whenever operatives change.
  function refreshRoster() { try { syncRoster(); reconcileSprites(); rebuildChips(); } catch (_) {} }
  function randomWalkTile() {
    for (let i = 0; i < 30; i++) {
      const c = 1 + (Math.random() * (GRID_W - 2) | 0);
      const r = 1 + (Math.random() * (GRID_H - 2) | 0);
      if (!isWall(c, r) && LAYOUT[r][c] !== T) return [c, r];
    }
    return [8, 8];
  }
  function walkTo(sp, tc, tr) {
    const p = findPath(sp.col, sp.row, tc, tr);
    if (p && p.length > 1) { sp.path = p; sp.pathI = 1; }
  }

  // ---- SPEECH BUBBLES -------------------------------------------------------
  function sayBubble(sp, text, dur) {
    if (!sp) return;
    sp.bubbleText = text;
    sp.bubbleStart = performance.now();
    sp.bubbleDur = dur || 4200;
  }
  function sayRandom(sp) {
    const pool = LINES[sp.name] || GENERIC_LINES;   // forged agents fall back to generic lines
    if (!pool || !pool.length) return;
    sayBubble(sp, pool[(Math.random() * pool.length) | 0]);
  }

  // ---- UPDATE ---------------------------------------------------------------
  function update(dt, now) {
    for (const name in sprites) {
      const sp = sprites[name];
      sp.bob += dt * 3;
      sp.breath += dt * 1.6;
      // occasional blink
      if (now > sp.nextBlinkAt) {
        sp.blinkUntil = now + 120;
        sp.nextBlinkAt = now + 2200 + Math.random() * 4200;
      }
      // follow path (lerp toward next tile) + facing flip
      if (sp.path && sp.pathI < sp.path.length) {
        const tgt = sp.path[sp.pathI];
        const spd = dt * 3.2;
        const ddc = tgt.c - sp.col, ddr = tgt.r - sp.row;
        // screen-space x direction = (dc - dr); flip facing to match travel
        const sx = ddc - ddr;
        if (Math.abs(sx) > 0.001) sp.face = sx > 0 ? 1 : -1;
        sp.col += Math.sign(ddc) * Math.min(spd, Math.abs(ddc));
        sp.row += Math.sign(ddr) * Math.min(spd, Math.abs(ddr));
        if (Math.abs(tgt.c - sp.col) < 0.02 && Math.abs(tgt.r - sp.row) < 0.02) {
          sp.col = tgt.c; sp.row = tgt.r; sp.pathI++;
          if (sp.pathI >= sp.path.length) sp.path = null;
        }
      } else if (name !== selected && now > sp.wanderAt) {
        const [c, r] = randomWalkTile(); walkTo(sp, c, r);
        sp.wanderAt = now + 4000 + Math.random() * 6000;
      }
    }

    // staggered idle chatter — one bubble at a time, tasteful cadence.
    if (now > nextBubbleAt && now > mountAt + 1400) {
      const candidates = [];
      for (const name in sprites) {
        const sp = sprites[name];
        const active = sp.bubbleText && (now - sp.bubbleStart) < sp.bubbleDur;
        if (!active) candidates.push(sp);
      }
      if (candidates.length) {
        sayRandom(candidates[(Math.random() * candidates.length) | 0]);
      }
      nextBubbleAt = now + 3400 + Math.random() * 3600;
    }

    // multiplayer: move YOUR avatar + glide remote players (no-op when offline)
    if (MP.joined) updateMP(dt, now);

    // ease camera toward target (recenter)
    originX += (camTargetX - originX) * Math.min(1, dt * 6);
    originY += (camTargetY - originY) * Math.min(1, dt * 6);
  }

  // ---- RENDER helpers -------------------------------------------------------
  function tileColors(kind) {
    switch (kind) {
      case W: return ['#1a2230', '#0e141d'];
      case B: return ['#123026', '#0c211a'];              // break room
      case O: return ['#3a2f14', '#241d0c'];              // boss rug (gold)
      case D: return ['#12242e', '#0b1820'];              // boardroom (cyan)
      case A: return ['#20262f', '#161b22'];              // agent desk
      case G: return ['#153a1f', '#0e2716'];              // grass
      case T: return ['#0e3540', '#0a2530'];              // water
      case S: return ['#241a33', '#170f22'];              // collectables shelf
      case E: return ['#2a2320', '#1a1512'];              // elevator
      case R: return ['#3a1f0c', '#26140a'];              // forge (warm ember floor)
      case K: return ['#2a2818', '#1a1810'];              // bank marble/brass
      case M: return ['#182a1a', '#0f1c11'];              // market stalls
      case H: return ['#2a2114', '#1c160d'];              // docks planks
      default:
        return null; // lobby → checker handled separately
    }
  }
  // Diamond path helper (top point up).
  function diamondPath(x, y, hw, hh) {
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
  }
  function drawTile(col, row, kind, now) {
    const p = isoToScreen(col, row);
    const hw = (TILE_W * scale) / 2, hh = (TILE_H * scale) / 2;

    // ---- top face with a subtle per-tile vertical gradient (depth) ----
    let top, side, edge;
    const c = tileColors(kind);
    if (c) {
      top = c[0]; side = c[1]; edge = 'rgba(0,0,0,0.16)';
    } else {
      const light = (col + row) % 2 === 0;               // obsidian holo-deck (world palette)
      // soft per-tile variation so the deck never reads flat
      const v = (((col * 7 + row * 13) % 5) - 2) * 3;
      top = light ? shade('#0f1826', v / 255) : shade('#0b111c', v / 255);
      side = light ? '#0a1220' : '#070c15';
      edge = 'rgba(34,211,238,0.09)';                    // teal gridlight seams
    }

    // water gets a gentle animated shimmer band
    if (kind === T) {
      const grad = ctx.createLinearGradient(p.x, p.y - hh, p.x, p.y + hh);
      const sh = (Math.sin(now / 700 + col * 0.9 + row * 0.7) + 1) / 2;
      grad.addColorStop(0, shade('#0e3540', 0.05 + sh * 0.10));
      grad.addColorStop(1, '#0a2530');
      diamondPath(p.x, p.y, hw, hh); ctx.fillStyle = grad; ctx.fill();
    } else if (kind === R) {
      // forge floor: warm radiating ember glow (heat haze pulse)
      const sh = (Math.sin(now / 500 + col * 0.8 + row * 0.6) + 1) / 2;
      const grad = ctx.createLinearGradient(p.x, p.y - hh, p.x, p.y + hh);
      grad.addColorStop(0, shade('#4a2a10', 0.06 + sh * 0.12));
      grad.addColorStop(1, '#20120a');
      diamondPath(p.x, p.y, hw, hh); ctx.fillStyle = grad; ctx.fill();
    } else {
      const grad = ctx.createLinearGradient(p.x, p.y - hh, p.x, p.y + hh);
      grad.addColorStop(0, shade(top, 0.05));
      grad.addColorStop(1, shade(top, -0.06));
      diamondPath(p.x, p.y, hw, hh); ctx.fillStyle = grad; ctx.fill();
    }
    ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();

    // faint grid glow on the lobby floor for a "holo deck" feel
    if (kind === F || kind === O || kind === D) {
      ctx.strokeStyle = 'rgba(0,229,255,0.05)'; ctx.lineWidth = 1;
      diamondPath(p.x, p.y, hw, hh); ctx.stroke();
    }
    // warm forge floor gets an ember rim instead of the cool holo line
    if (kind === R) {
      ctx.strokeStyle = 'rgba(255,140,26,0.10)'; ctx.lineWidth = 1;
      diamondPath(p.x, p.y, hw, hh); ctx.stroke();
    }

    // wall extrusion (blocky 2.5D height) with shaded L/R faces + lit cap
    if (kind === W) {
      const h = 22 * scale;
      // left face (darker)
      ctx.fillStyle = '#0b111a';
      ctx.beginPath();
      ctx.moveTo(p.x - hw, p.y); ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
      // right face (lighter)
      ctx.fillStyle = '#141c28';
      ctx.beginPath();
      ctx.moveTo(p.x + hw, p.y); ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x + hw, p.y - h); ctx.closePath(); ctx.fill();
      // top cap (lit) + thin neon rim
      ctx.fillStyle = '#1c2636';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - hh - h); ctx.lineTo(p.x + hw, p.y - h);
      ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,229,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // Soft contact shadow (flattened ellipse) under sprites/props.
  function contactShadow(x, y, rx, ry, a) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // iso "box" prop (furniture) at tile with height + top color + contact shadow
  function drawBox(col, row, wTiles, hgt, topCol, sideCol, glow) {
    const p = isoToScreen(col, row);
    const hw = (TILE_W * scale) / 2 * wTiles, hh = (TILE_H * scale) / 2 * wTiles;
    const h = hgt * scale;
    contactShadow(p.x, p.y + hh * 0.35, hw * 0.95, hh * 0.7, 0.22);
    // left face
    ctx.fillStyle = sideCol;
    ctx.beginPath(); ctx.moveTo(p.x - hw, p.y); ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
    // right face (slightly darker)
    ctx.fillStyle = shade(sideCol, -0.15);
    ctx.beginPath(); ctx.moveTo(p.x + hw, p.y); ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x + hw, p.y - h); ctx.closePath(); ctx.fill();
    // top cap
    ctx.fillStyle = topCol;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - hh - h); ctx.lineTo(p.x + hw, p.y - h);
    ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
    if (glow) {
      ctx.save();
      ctx.strokeStyle = glow; ctx.lineWidth = 1.2; ctx.shadowColor = glow; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - hh - h); ctx.lineTo(p.x + hw, p.y - h);
      ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }
  function shade(hex, amt) {
    let r, g, b;
    if (hex[0] === '#') {
      const n = parseInt(hex.slice(1), 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
      const m = hex.match(/\d+/g) || [0, 0, 0];
      r = +m[0]; g = +m[1]; b = +m[2];
    }
    r = Math.max(0, Math.min(255, r + amt * 255 | 0));
    g = Math.max(0, Math.min(255, g + amt * 255 | 0));
    b = Math.max(0, Math.min(255, b + amt * 255 | 0));
    return `rgb(${r},${g},${b})`;
  }

  function drawPlant(col, row) {
    const p = isoToScreen(col, row);
    contactShadow(p.x, p.y + 2 * scale, 8 * scale, 4 * scale, 0.2);
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(p.x - 4 * scale, p.y - 6 * scale, 8 * scale, 8 * scale);
    ctx.fillStyle = '#1f7a3a';
    ctx.beginPath(); ctx.arc(p.x, p.y - 14 * scale, 9 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2aa04d';
    ctx.beginPath(); ctx.arc(p.x - 4 * scale, p.y - 18 * scale, 6 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ab85e';
    ctx.beginPath(); ctx.arc(p.x + 3 * scale, p.y - 16 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
  }
  function drawTree(col, row) {
    const p = isoToScreen(col, row);
    contactShadow(p.x, p.y + 2 * scale, 12 * scale, 6 * scale, 0.22);
    ctx.fillStyle = '#4a3320';
    ctx.fillRect(p.x - 3 * scale, p.y - 20 * scale, 6 * scale, 22 * scale);
    ctx.fillStyle = '#1e6b34';
    ctx.beginPath(); ctx.arc(p.x, p.y - 30 * scale, 15 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b8a45';
    ctx.beginPath(); ctx.arc(p.x - 7 * scale, p.y - 36 * scale, 10 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39a457';
    ctx.beginPath(); ctx.arc(p.x + 6 * scale, p.y - 34 * scale, 7 * scale, 0, Math.PI * 2); ctx.fill();
  }
  // Cozy break-room couch (long cushioned box + backrest).
  function drawCouch(col, row) {
    drawBox(col, row, 0.9, 6, '#237a5b', '#154d39');
    const p = isoToScreen(col, row);
    ctx.fillStyle = '#2e9670';
    ctx.fillRect(p.x - 12 * scale, p.y - 16 * scale, 24 * scale, 5 * scale);
  }
  // Steaming coffee cup on a small table.
  function drawCoffee(col, row, now) {
    drawBox(col, row, 0.4, 5, '#2a3138', '#1a2026');
    const p = isoToScreen(col, row);
    ctx.fillStyle = '#e8e0d4';
    ctx.beginPath(); ctx.arc(p.x, p.y - 8 * scale, 3 * scale, 0, Math.PI * 2); ctx.fill();
    // steam wisps
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 2; i++) {
      const ph = now / 500 + i * 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 1 + i * 2, p.y - 11 * scale);
      ctx.quadraticCurveTo(p.x - 4 + i * 4 + Math.sin(ph) * 3, p.y - 18 * scale,
                           p.x - 1 + i * 2 + Math.sin(ph + 1) * 2, p.y - 24 * scale);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Boardroom screen (glowing panel on a stand).
  function drawScreen(col, row, now) {
    const p = isoToScreen(col, row);
    contactShadow(p.x, p.y + 2 * scale, 12 * scale, 5 * scale, 0.2);
    ctx.fillStyle = '#0c1620';
    ctx.fillRect(p.x - 14 * scale, p.y - 34 * scale, 28 * scale, 20 * scale);
    const pulse = 0.35 + (Math.sin(now / 600) + 1) / 2 * 0.4;
    ctx.save();
    ctx.shadowColor = 'rgba(0,229,255,0.7)'; ctx.shadowBlur = 12;
    ctx.fillStyle = `rgba(0,229,255,${pulse})`;
    ctx.fillRect(p.x - 12 * scale, p.y - 32 * scale, 24 * scale, 16 * scale);
    ctx.restore();
    // bar-chart glyphs
    ctx.fillStyle = 'rgba(4,18,12,0.8)';
    for (let i = 0; i < 4; i++) {
      const bh = (3 + ((i * 5 + (now / 400 | 0)) % 8)) * scale;
      ctx.fillRect(p.x - 10 * scale + i * 6 * scale, p.y - 18 * scale - bh, 4 * scale, bh);
    }
    ctx.fillStyle = '#2a3138';
    ctx.fillRect(p.x - 2 * scale, p.y - 14 * scale, 4 * scale, 12 * scale);
  }
  function drawStatue(col, row, now) {
    // gold reception centerpiece
    const p = isoToScreen(col, row);
    drawBox(col, row, 0.6, 8, '#3a2f14', '#241d0c');
    const t = now / 1000;
    ctx.save();
    ctx.shadowColor = 'rgba(240,180,41,0.7)'; ctx.shadowBlur = 18 + Math.sin(t * 2) * 6;
    ctx.fillStyle = '#f0b429';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - (16 + 8) * scale, 7 * scale, 16 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.arc(p.x, p.y - 34 * scale, 6 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Subtle SHADDAI emblem on the boss-office back wall (diamond sigil).
  function drawEmblem(col, row, now) {
    const p = isoToScreen(col, row);
    const y = p.y - 30 * scale;
    const glow = 0.4 + (Math.sin(now / 900) + 1) / 2 * 0.3;
    ctx.save();
    ctx.strokeStyle = `rgba(240,180,41,${glow})`; ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(240,180,41,0.6)'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(p.x, y - 9 * scale); ctx.lineTo(p.x + 7 * scale, y);
    ctx.lineTo(p.x, y + 9 * scale); ctx.lineTo(p.x - 7 * scale, y);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, y, 2.4 * scale, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,215,106,${glow})`; ctx.fill();
    ctx.restore();
  }

  // ===========================================================================
  // THE FORGE — the marquee workshop: furnace + anvil + sparks + emblem.
  // Warm orange/gold palette against the cool office. All procedural.
  // ===========================================================================
  // Persistent ember particles for the forge (recycled — no per-frame alloc).
  const embers = [];
  function initEmbers() {
    embers.length = 0;
    for (let i = 0; i < 16; i++) {
      embers.push({
        ox: (Math.random() - 0.5) * 16,   // launch offset around furnace mouth
        life: Math.random(),               // 0..1 progress
        spd: 0.35 + Math.random() * 0.5,   // rise speed
        drift: (Math.random() - 0.5) * 0.8,
        sz: 1 + Math.random() * 1.6,
      });
    }
  }
  function drawFurnace(col, row, now) {
    const p = isoToScreen(col, row);
    const s = scale;
    // stone furnace body
    drawBox(col, row, 0.85, 26, '#3a2b22', '#241811', 'rgba(255,140,26,0.35)');
    // glowing mouth (pulsing molten core)
    const pulse = 0.55 + (Math.sin(now / 260) + 1) / 2 * 0.45;
    ctx.save();
    ctx.shadowColor = 'rgba(255,120,20,0.9)'; ctx.shadowBlur = 24 * s;
    const mg = ctx.createRadialGradient(p.x, p.y - 16 * s, 1, p.x, p.y - 16 * s, 12 * s);
    mg.addColorStop(0, `rgba(255,240,180,${pulse})`);
    mg.addColorStop(0.4, `rgba(255,150,40,${pulse})`);
    mg.addColorStop(1, 'rgba(180,40,0,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 16 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // chimney glow cap
    ctx.save();
    ctx.shadowColor = 'rgba(255,90,20,0.7)'; ctx.shadowBlur = 14 * s;
    ctx.fillStyle = 'rgba(255,120,30,0.5)';
    ctx.fillRect(p.x - 3 * s, p.y - 40 * s, 6 * s, 6 * s);
    ctx.restore();

    // ---- ember particles rising from the mouth ----
    ctx.save();
    for (const e of embers) {
      e.life += e.spd * 0.012;
      if (e.life > 1) { e.life = 0; e.ox = (Math.random() - 0.5) * 16; }
      const ex = p.x + (e.ox + e.drift * e.life * 14) * s;
      const ey = p.y - 16 * s - e.life * 34 * s;
      const a = (1 - e.life) * 0.9;
      ctx.globalAlpha = a;
      ctx.fillStyle = e.life < 0.4 ? '#ffe08a' : '#ff7a1a';
      ctx.shadowColor = '#ff8c1a'; ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(ex + Math.sin(now / 200 + e.ox) * 1.5 * s, ey, e.sz * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Blacksmith anvil on a stump — the forge's icon prop.
  function drawAnvil(col, row, now) {
    const p = isoToScreen(col, row);
    const s = scale;
    contactShadow(p.x, p.y + 3 * s, 13 * s, 6 * s, 0.28);
    // wood stump base
    ctx.fillStyle = '#3a2716';
    ctx.fillRect(p.x - 7 * s, p.y - 8 * s, 14 * s, 10 * s);
    ctx.fillStyle = '#2a1c0f';
    ctx.fillRect(p.x + 0 * s, p.y - 8 * s, 7 * s, 10 * s);
    // anvil body (dark iron)
    ctx.fillStyle = '#3d434d';
    ctx.fillRect(p.x - 9 * s, p.y - 15 * s, 18 * s, 5 * s);   // top face
    ctx.fillStyle = '#2a2f37';
    ctx.fillRect(p.x - 5 * s, p.y - 10 * s, 10 * s, 3 * s);   // waist
    // horn (tapered nose)
    ctx.fillStyle = '#4a515c';
    ctx.beginPath();
    ctx.moveTo(p.x + 9 * s, p.y - 15 * s);
    ctx.lineTo(p.x + 15 * s, p.y - 13.5 * s);
    ctx.lineTo(p.x + 9 * s, p.y - 11 * s);
    ctx.closePath(); ctx.fill();
    // hot glowing metal being worked
    const hot = 0.5 + (Math.sin(now / 220) + 1) / 2 * 0.5;
    ctx.save();
    ctx.shadowColor = 'rgba(255,140,30,0.9)'; ctx.shadowBlur = 12 * s;
    ctx.fillStyle = `rgba(255,${140 + hot * 90 | 0},40,${0.7 + hot * 0.3})`;
    ctx.fillRect(p.x - 3 * s, p.y - 16.5 * s, 5 * s, 1.6 * s);
    ctx.restore();
    // occasional hammer-strike spark burst on top of the anvil
    const strike = (Math.sin(now / 220) > 0.92);
    if (strike) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,140,0.85)'; ctx.lineWidth = 1;
      ctx.shadowColor = '#ffcf6a'; ctx.shadowBlur = 8;
      for (let i = 0; i < 5; i++) {
        const ang = -0.6 - i * 0.35;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 16 * s);
        ctx.lineTo(p.x + Math.cos(ang) * 9 * s, p.y - 16 * s + Math.sin(ang) * 9 * s);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // Glowing ⬡ SHADDAI forge emblem, floating over the workshop.
  function drawForgeEmblem(col, row, now) {
    const p = isoToScreen(col, row);
    const s = scale;
    const y = p.y - 40 * s;
    const glow = 0.5 + (Math.sin(now / 700) + 1) / 2 * 0.4;
    ctx.save();
    ctx.strokeStyle = `rgba(255,150,40,${glow})`; ctx.lineWidth = 2 * s;
    ctx.shadowColor = 'rgba(255,140,26,0.8)'; ctx.shadowBlur = 14 * s;
    // hexagon sigil
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const hx = p.x + Math.cos(a) * 9 * s, hy = y + Math.sin(a) * 9 * s;
      i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
    }
    ctx.closePath(); ctx.stroke();
    // inner molten core
    ctx.fillStyle = `rgba(255,200,90,${glow})`;
    ctx.beginPath(); ctx.arc(p.x, y, 3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---- COMING-SOON city footprints (bank / market / docks) ------------------
  // Lightweight décor + a "SOON" tag so the office reads as a city seed.
  function drawSoonFootprint(b, now) {
    const p = isoToScreen(b.center[0], b.center[1]);
    const s = scale;
    // faint building silhouette box in the building's accent color
    drawBox(b.center[0], b.center[1], 0.8, 14,
            shade(b.color, -0.5), shade(b.color, -0.62), b.color + '55');
    // small themed glyph on the roof
    ctx.save();
    ctx.font = `${13 * s | 0}px sans-serif`; ctx.textAlign = 'center';
    ctx.shadowColor = b.color; ctx.shadowBlur = 8;
    ctx.fillStyle = b.color;
    const glyph = b.id === 'bank' ? '🏦' : b.id === 'market' ? '🛒' : '⚓';
    ctx.fillText(glyph, p.x, p.y - 20 * s);
    ctx.restore();
    // pulsing status tag — "OPEN" for live buildings (Bazaar), "SOON" for the rest
    const tag = b.active ? 'OPEN' : 'SOON';
    const blink = 0.45 + (Math.sin(now / 600 + b.center[0]) + 1) / 2 * 0.55;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.font = "7px 'Share Tech Mono', monospace"; ctx.textAlign = 'center';
    const tw = ctx.measureText(tag).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(p.x - tw / 2 - 5, p.y - 34 * s, tw + 10, 11, 3); ctx.fill();
    ctx.strokeStyle = b.color; ctx.lineWidth = 1;
    roundRect(p.x - tw / 2 - 5, p.y - 34 * s, tw + 10, 11, 3); ctx.stroke();
    ctx.fillStyle = b.color; ctx.fillText(tag, p.x, p.y - 34 * s + 8);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // ---- Draw a REAL nav door/kiosk (opens an Office sub-tab on click) ---------
  //   A glowing archway-panel with the section glyph + a floating label so the
  //   user clearly reads it as an interactive door into that office function.
  function drawNavDoor(d, now, hovered) {
    const p = isoToScreen(d.center[0], d.center[1]);
    const s = scale;
    const pulse = 0.55 + (Math.sin(now / 620 + d.center[0]) + 1) / 2 * 0.45;
    // grounded kiosk base
    drawBox(d.center[0], d.center[1], 0.5, 5, shade(d.color, -0.4), shade(d.color, -0.55));
    // portal panel (glowing doorway)
    ctx.save();
    ctx.shadowColor = d.color; ctx.shadowBlur = (hovered ? 22 : 13) * s;
    const pg = ctx.createLinearGradient(p.x, p.y - 30 * s, p.x, p.y - 6 * s);
    pg.addColorStop(0, d.color + 'e0');
    pg.addColorStop(1, shade(d.color, -0.45));
    ctx.fillStyle = pg;
    roundRect(p.x - 9 * s, p.y - 30 * s, 18 * s, 26 * s, 5 * s); ctx.fill();
    // inner dark recess
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6,11,17,0.82)';
    roundRect(p.x - 6.4 * s, p.y - 27 * s, 12.8 * s, 22 * s, 4 * s); ctx.fill();
    // glyph
    ctx.globalAlpha = pulse;
    ctx.shadowColor = d.color; ctx.shadowBlur = 10 * s;
    ctx.fillStyle = d.color;
    ctx.font = `${13 * s | 0}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(d.glyph, p.x, p.y - 13 * s);
    ctx.restore();

    // floating label pill
    ctx.save();
    ctx.font = "8px 'Share Tech Mono', monospace"; ctx.textAlign = 'center';
    const tw = ctx.measureText(d.label).width;
    ctx.fillStyle = hovered ? 'rgba(8,14,20,0.96)' : 'rgba(8,14,20,0.72)';
    roundRect(p.x - tw / 2 - 7, p.y - 44 * s, tw + 14, 13, 4); ctx.fill();
    ctx.strokeStyle = d.color + (hovered ? 'ff' : 'aa'); ctx.lineWidth = 1;
    ctx.shadowColor = d.color; ctx.shadowBlur = hovered ? 9 : 4;
    roundRect(p.x - tw / 2 - 7, p.y - 44 * s, tw + 14, 13, 4); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = d.color; ctx.fillText(d.label, p.x, p.y - 44 * s + 9);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // ---- Draw an agent sprite — a characterful little operative ----------------
  //   Refined silhouette: tapered legs w/ feet, a shoulder-cut torso, a helmet
  //   head with a glowing visor + brow, an antenna glint, subtle idle breathing
  //   + weight-shift + blink, and a proper stride with arm swing while walking.
  //   All procedural, no per-frame allocations.
  function drawAgent(sp, now, intro) {
    const p = isoToScreen(sp.col, sp.row);
    const s = scale;
    const walking = !!sp.path;
    // idle life: gentle breathing scale + a slow lateral weight-shift when idle
    const breathe = Math.sin(sp.breath) * (walking ? 0.6 : 1.0);
    const bob = (Math.sin(sp.bob) * (walking ? 2.6 : 0.9) + breathe * 0.7) * s;
    const sway = walking ? 0 : Math.sin(sp.breath * 0.5) * 0.9 * s;   // weight shift
    const isSel = sp.name === selected;
    const fdir = sp.face; // +1 right, -1 left

    ctx.save();
    ctx.globalAlpha = intro;

    // clean colored ground-glow (soft radial, no harsh ring)
    ctx.save();
    const glowR = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 16 * s);
    glowR.addColorStop(0, sp.color + '3a');
    glowR.addColorStop(1, sp.color + '00');
    ctx.fillStyle = glowR;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 16 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // grounded contact shadow (tightens when idle, stretches slightly walking)
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1.5 * s, (walking ? 10.5 : 9.5) * s, 4.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // pulsing selection ring (double: crisp inner + soft outer)
    if (isSel) {
      const k = (Math.sin(now / 260) + 1) / 2;
      ctx.save();
      ctx.strokeStyle = sp.color; ctx.lineWidth = 2 * s;
      ctx.shadowColor = sp.color; ctx.shadowBlur = 16;
      ctx.globalAlpha = intro * (0.6 + k * 0.4);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, (13 + k * 3) * s, (6.5 + k * 1.6) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const bx = p.x + sway, by = p.y - bob;

    // ---- LEGS: tapered, with feet; alternating stride while walking ----
    const gait = Math.sin(sp.bob * 2);
    const strideF = walking ? gait * 3.0 * s : 0;      // front leg lift
    const strideB = walking ? -gait * 3.0 * s : 0;     // back leg lift
    const darkLeg = shade(sp.color, -0.4);
    // back leg
    ctx.fillStyle = shade(sp.color, -0.5);
    ctx.fillRect(bx - 5 * s, by - 7 * s, 3.4 * s, 7 * s + Math.max(0, strideB));
    ctx.fillStyle = '#1a1f26';                          // foot
    ctx.fillRect(bx - 5.4 * s, by - 0.5 * s + Math.max(0, strideB), 4.2 * s, 2 * s);
    // front leg
    ctx.fillStyle = darkLeg;
    ctx.fillRect(bx + 1.6 * s, by - 7 * s, 3.4 * s, 7 * s + Math.max(0, strideF));
    ctx.fillStyle = '#222831';                          // foot
    ctx.fillRect(bx + 1.2 * s, by - 0.5 * s + Math.max(0, strideF), 4.2 * s, 2 * s);

    // ---- TORSO: trapezoid (broad shoulders → narrower waist) ----
    const topY = by - 25 * s, botY = by - 7 * s;
    const shoW = 8.2 * s, waistW = 6.4 * s;
    ctx.beginPath();
    ctx.moveTo(bx - shoW, topY);
    ctx.lineTo(bx + shoW, topY);
    ctx.lineTo(bx + waistW, botY);
    ctx.lineTo(bx - waistW, botY);
    ctx.closePath();
    ctx.fillStyle = sp.color; ctx.fill();
    // shaded trailing half
    ctx.save(); ctx.clip();
    ctx.fillStyle = shade(sp.color, -0.2);
    ctx.fillRect(fdir > 0 ? bx : bx - shoW - 1, topY - 1, shoW + 1, 20 * s);
    // core seam / chest light
    ctx.fillStyle = shade(sp.color, 0.28);
    ctx.fillRect(bx - 0.6 * s, topY, 1.2 * s, 18 * s);
    ctx.restore();
    // rim light on leading shoulder edge
    ctx.strokeStyle = shade(sp.color, 0.34); ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(fdir > 0 ? bx + shoW : bx - shoW, topY);
    ctx.lineTo(fdir > 0 ? bx + waistW : bx - waistW, botY);
    ctx.stroke();

    // ---- ARM hint: a small swinging forearm on the leading side ----
    const armSwing = walking ? gait * 3.2 * s : Math.sin(sp.breath) * 0.5 * s;
    ctx.fillStyle = shade(sp.color, -0.28);
    const ax = fdir > 0 ? bx + shoW - 1.2 * s : bx - shoW - 1.6 * s;
    ctx.fillRect(ax, topY + 2 * s + Math.max(0, armSwing), 2.8 * s, 8 * s);

    // ---- HEAD: rounded helmet w/ visor, brow glint, antenna ----
    const hy = by - 35 * s;
    // helmet shell
    ctx.fillStyle = '#efe2cd';
    roundRect(bx - 5 * s, hy - 1 * s, 10 * s, 11 * s, 3.2 * s); ctx.fill();
    // shaded trailing cheek
    ctx.save(); roundRect(bx - 5 * s, hy - 1 * s, 10 * s, 11 * s, 3.2 * s); ctx.clip();
    ctx.fillStyle = shade('#efe2cd', -0.13);
    ctx.fillRect(fdir > 0 ? bx : bx - 5 * s, hy - 1 * s, 5 * s, 12 * s);
    // hair/helmet cap band in agent color
    ctx.fillStyle = sp.color;
    ctx.fillRect(bx - 5 * s, hy - 1 * s, 10 * s, 2.4 * s);
    ctx.restore();

    // visor band (blink = thins to a line)
    const blinking = now < sp.blinkUntil;
    ctx.save();
    ctx.shadowColor = sp.color; ctx.shadowBlur = 7;
    ctx.fillStyle = sp.color;
    if (blinking) {
      ctx.fillRect(bx - 4.4 * s, hy + 5.4 * s, 8.8 * s, 1 * s);
    } else {
      ctx.fillStyle = shade(sp.color, -0.55);
      ctx.fillRect(bx - 4.4 * s, hy + 4 * s, 8.8 * s, 3.2 * s);      // visor recess
      // bright glint travelling across the visor on the facing side
      ctx.fillStyle = shade(sp.color, 0.5);
      const gx = fdir > 0 ? bx + 0.6 * s : bx - 3.6 * s;
      ctx.fillRect(gx, hy + 4.4 * s, 2.4 * s, 2 * s);
    }
    ctx.restore();

    // antenna with a pulsing tip
    const aBlink = 0.5 + (Math.sin(now / 380 + sp.idx) + 1) / 2 * 0.5;
    ctx.strokeStyle = shade(sp.color, -0.1); ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(bx + 2.4 * s * fdir, hy - 1 * s);
    ctx.lineTo(bx + 3.6 * s * fdir, hy - 4 * s);
    ctx.stroke();
    ctx.save(); ctx.globalAlpha = intro * aBlink;
    ctx.fillStyle = sp.color; ctx.shadowColor = sp.color; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(bx + 3.6 * s * fdir, hy - 4.2 * s, 1.3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ---- NAME LABEL: crisp pill w/ status dot ----
    ctx.font = `700 ${Math.max(9, 9.5 * s) | 0}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';
    const label = sp.name;
    const tw = ctx.measureText(label).width;
    const ly = by - 52 * s;
    ctx.fillStyle = 'rgba(6,11,17,0.72)';
    roundRect(bx - tw / 2 - 10, ly, tw + 20, 15, 5); ctx.fill();
    ctx.strokeStyle = sp.color + '77'; ctx.lineWidth = 1; ctx.stroke();
    // status dot (left)
    const dotA = 0.55 + (Math.sin(now / 420 + sp.idx) + 1) / 2 * 0.45;
    ctx.save(); ctx.globalAlpha = intro * dotA;
    ctx.fillStyle = sp.color; ctx.shadowColor = sp.color; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(bx - tw / 2 - 3, ly + 7.5, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#eef4f2';
    ctx.fillText(label, bx + 4, ly + 11);
    ctx.textAlign = 'left';

    // Pixel Forge skin marker — floats just above the name pill so custom agents read distinctly.
    if (sp.skinIcon) {
      ctx.save();
      ctx.globalAlpha = intro;
      ctx.font = `${Math.max(12, 14 * s) | 0}px serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = sp.color; ctx.shadowBlur = 8;
      ctx.fillText(sp.skinIcon, bx, ly - 4);
      ctx.restore();
    }

    ctx.restore();

    // speech bubble (drawn last so it floats above)
    drawBubble(sp, bx, by, now);
  }

  // ---- Draw a MULTIPLAYER avatar (YOU or a remote guest) --------------------
  //   Same charming operative silhouette as the agents but in a neutral operator
  //   tone so real humans read as clearly distinct from the 7 AI agents. YOUR
  //   avatar gets a bright "YOU" tag + selection-style ring; guests get a plain
  //   name pill with a soft presence dot.
  function drawPlayer(sp, now, isYou) {
    const p = isoToScreen(sp.col, sp.row);
    const s = scale;
    const walking = !!sp.path || (!isYou && (Math.abs(sp.tcol - sp.col) > 0.03 || Math.abs(sp.trow - sp.row) > 0.03));
    const accent = isYou ? '#00ff88' : '#8fa6c0';      // YOU=brand green tag, guests=cool grey
    const body = sp.color || YOU_COLOR;
    const fdir = sp.face || 1;
    const breathe = Math.sin(sp.breath) * (walking ? 0.6 : 1.0);
    const bob = (Math.sin(sp.bob) * (walking ? 2.6 : 0.9) + breathe * 0.7) * s;
    const bx = p.x, by = p.y - bob;

    ctx.save();

    // ground glow (subtle, accent-tinted)
    const glowR = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 16 * s);
    glowR.addColorStop(0, accent + '33');
    glowR.addColorStop(1, accent + '00');
    ctx.fillStyle = glowR;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 16 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();

    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1.5 * s, (walking ? 10.5 : 9.5) * s, 4.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // YOU gets a pulsing presence ring so you always find yourself
    if (isYou) {
      const k = (Math.sin(now / 300) + 1) / 2;
      ctx.save();
      ctx.strokeStyle = accent; ctx.lineWidth = 2 * s;
      ctx.shadowColor = accent; ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.55 + k * 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, (13 + k * 3) * s, (6.5 + k * 1.6) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ---- legs with stride ----
    const gait = Math.sin(sp.bob * 2);
    const strideF = walking ? gait * 3.0 * s : 0;
    const strideB = walking ? -gait * 3.0 * s : 0;
    ctx.fillStyle = shade(body, -0.5);
    ctx.fillRect(bx - 5 * s, by - 7 * s, 3.4 * s, 7 * s + Math.max(0, strideB));
    ctx.fillStyle = '#1a1f26';
    ctx.fillRect(bx - 5.4 * s, by - 0.5 * s + Math.max(0, strideB), 4.2 * s, 2 * s);
    ctx.fillStyle = shade(body, -0.4);
    ctx.fillRect(bx + 1.6 * s, by - 7 * s, 3.4 * s, 7 * s + Math.max(0, strideF));
    ctx.fillStyle = '#222831';
    ctx.fillRect(bx + 1.2 * s, by - 0.5 * s + Math.max(0, strideF), 4.2 * s, 2 * s);

    // ---- torso trapezoid ----
    const topY = by - 25 * s, botY = by - 7 * s;
    const shoW = 8.2 * s, waistW = 6.4 * s;
    ctx.beginPath();
    ctx.moveTo(bx - shoW, topY); ctx.lineTo(bx + shoW, topY);
    ctx.lineTo(bx + waistW, botY); ctx.lineTo(bx - waistW, botY);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = shade(body, -0.2);
    ctx.fillRect(fdir > 0 ? bx : bx - shoW - 1, topY - 1, shoW + 1, 20 * s);
    // accent chest stripe marks a human operator
    ctx.fillStyle = accent;
    ctx.fillRect(bx - 0.9 * s, topY + 2 * s, 1.8 * s, 14 * s);
    ctx.restore();

    // ---- arm ----
    const armSwing = walking ? gait * 3.2 * s : Math.sin(sp.breath) * 0.5 * s;
    ctx.fillStyle = shade(body, -0.28);
    const ax = fdir > 0 ? bx + shoW - 1.2 * s : bx - shoW - 1.6 * s;
    ctx.fillRect(ax, topY + 2 * s + Math.max(0, armSwing), 2.8 * s, 8 * s);

    // ---- head ----
    const hy = by - 35 * s;
    ctx.fillStyle = '#e7ecf2';
    roundRect(bx - 5 * s, hy - 1 * s, 10 * s, 11 * s, 3.2 * s); ctx.fill();
    ctx.save(); roundRect(bx - 5 * s, hy - 1 * s, 10 * s, 11 * s, 3.2 * s); ctx.clip();
    ctx.fillStyle = shade('#e7ecf2', -0.13);
    ctx.fillRect(fdir > 0 ? bx : bx - 5 * s, hy - 1 * s, 5 * s, 12 * s);
    ctx.fillStyle = accent;                       // accent headband
    ctx.fillRect(bx - 5 * s, hy - 1 * s, 10 * s, 2.4 * s);
    ctx.restore();
    // visor (accent, blinks)
    const blinking = now < sp.blinkUntil;
    ctx.save();
    ctx.shadowColor = accent; ctx.shadowBlur = 7;
    ctx.fillStyle = accent;
    if (blinking) ctx.fillRect(bx - 4.4 * s, hy + 5.4 * s, 8.8 * s, 1 * s);
    else ctx.fillRect(bx - 4.4 * s, hy + 4 * s, 8.8 * s, 3.2 * s);
    ctx.restore();

    // ---- name pill + YOU tag / presence dot ----
    ctx.font = `700 ${Math.max(9, 9.5 * s) | 0}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';
    const label = String(sp.name || (isYou ? 'YOU' : 'Guest')).slice(0, 16);
    const tw = ctx.measureText(label).width;
    const ly = by - 52 * s;
    ctx.fillStyle = 'rgba(6,11,17,0.78)';
    roundRect(bx - tw / 2 - 10, ly, tw + 20, 15, 5); ctx.fill();
    ctx.strokeStyle = accent + (isYou ? 'cc' : '77'); ctx.lineWidth = 1; ctx.stroke();
    const dotA = 0.55 + (Math.sin(now / 420 + sp.bob) + 1) / 2 * 0.45;
    ctx.save(); ctx.globalAlpha = dotA;
    ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(bx - tw / 2 - 3, ly + 7.5, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#eef4f2';
    ctx.fillText(label, bx + 4, ly + 11);

    if (isYou) {
      // small "YOU" tag pill above the name
      ctx.font = `700 8px 'Share Tech Mono', monospace`;
      const yt = 'YOU';
      const ytw = ctx.measureText(yt).width;
      ctx.fillStyle = accent;
      ctx.shadowColor = accent; ctx.shadowBlur = 6;
      roundRect(bx - ytw / 2 - 5, ly - 13, ytw + 10, 11, 4); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#04120c';
      ctx.fillText(yt, bx, ly - 4);
    }
    ctx.textAlign = 'left';
    ctx.restore();

    // speech bubble (chat) floats above
    drawBubble(sp, bx, by, now);
  }

  // Rounded rect path helper.
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Speech bubble with fade in/out + tail, over the sprite's head.
  function drawBubble(sp, bx, by, now) {
    if (!sp.bubbleText) return;
    const age = now - sp.bubbleStart;
    if (age > sp.bubbleDur) { sp.bubbleText = ''; return; }
    // fade in first 260ms, fade out last 400ms
    let a = 1;
    if (age < 260) a = age / 260;
    else if (age > sp.bubbleDur - 400) a = Math.max(0, (sp.bubbleDur - age) / 400);
    const rise = (1 - Math.min(1, age / 260)) * 6; // small pop-up

    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "11px 'Rajdhani','Share Tech Mono',sans-serif";
    ctx.textAlign = 'left';
    const text = sp.bubbleText;
    const padX = 9, padY = 6, maxW = 150;
    // wrap into up to 2 lines
    const words = text.split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
    }
    if (line) lines.push(line);
    let bw = 0;
    lines.forEach(l => { bw = Math.max(bw, ctx.measureText(l).width); });
    bw += padX * 2;
    const lh = 14, bh = lines.length * lh + padY * 2 - 2;
    const cx = bx - bw / 2;
    const cy = by - 66 * scale - bh + rise;

    // bubble body
    ctx.fillStyle = 'rgba(8,14,20,0.94)';
    roundRect(cx, cy, bw, bh, 7); ctx.fill();
    ctx.strokeStyle = sp.color + 'cc'; ctx.lineWidth = 1.4;
    ctx.shadowColor = sp.color; ctx.shadowBlur = 10;
    roundRect(cx, cy, bw, bh, 7); ctx.stroke();
    ctx.shadowBlur = 0;
    // tail
    ctx.fillStyle = 'rgba(8,14,20,0.94)';
    ctx.beginPath();
    ctx.moveTo(bx - 5, cy + bh - 1);
    ctx.lineTo(bx + 5, cy + bh - 1);
    ctx.lineTo(bx, cy + bh + 7);
    ctx.closePath(); ctx.fill();

    // text
    ctx.fillStyle = '#e8f0ee';
    lines.forEach((l, i) => ctx.fillText(l, cx + padX, cy + padY + 10 + i * lh));
    ctx.restore();
  }

  // ---- MAIN RENDER ----------------------------------------------------------
  // ===========================================================================
  // CAPITAL DISTRICT — forged agents as room-buildings, live from /api/agent-rooms.
  // "One agent, many surfaces": each building = a real operative; click → its
  // Command Deck. HQ shrine anchors the plaza; empty slots = holographic claim
  // plots. The walking agents + multiplayer keep running as the ambient life.
  // ===========================================================================
  const DIST = { center: [11, 10], radius: 4.8, slots: 6, rooms: [], plots: [], loaded: false, lastFetch: 0 };
  function distRingPos(i, ring, data) {
    const a = (-90 + i * (360 / ring)) * Math.PI / 180;
    return { data, col: DIST.center[0] + Math.cos(a) * DIST.radius, row: DIST.center[1] + Math.sin(a) * DIST.radius, phase: i * 1.1 };
  }
  async function fetchDistrict() {
    DIST.lastFetch = performance.now();
    try {
      const owner = (typeof window.opOwner === 'function') ? window.opOwner() : 'guest';
      const res = await fetch('/api/agent-rooms?owner=' + encodeURIComponent(owner));
      const d = await res.json();
      const rooms = (d && d.rooms) || [];
      const ring = Math.max(DIST.slots, rooms.length);
      DIST.rooms = rooms.map((rm, i) => distRingPos(i, ring, rm));
      // Office is your OWNED PROPERTY — no generic claim plots in the command chamber.
      // (Cohesion spec: claim/expansion lives in the world/parcel layer, not the office center.)
      DIST.plots = [];
    } catch (e) { DIST.plots = []; }
    DIST.loaded = true;
  }
  function dPoly(pts, fill, stroke, lw) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = (lw || 1); ctx.stroke(); } }
  function dFacePt(c, u, v) { const bx = c[0][0] + (c[1][0] - c[0][0]) * u, by = c[0][1] + (c[1][1] - c[0][1]) * u; const tx = c[3][0] + (c[2][0] - c[3][0]) * u, ty = c[3][1] + (c[2][1] - c[3][1]) * u; return [bx + (tx - bx) * v, by + (ty - by) * v]; }
  function dFaceRect(c, u0, v0, u1, v1, fill, stroke, lw) { dPoly([dFacePt(c, u0, v0), dFacePt(c, u1, v0), dFacePt(c, u1, v1), dFacePt(c, u0, v1)], fill, stroke, lw); }
  function dBox(col, row, footW, footH, hgt, cols) {
    const p = isoToScreen(col, row); const w = (TILE_W * scale / 2) * footW, d = (TILE_H * scale / 2) * footH, h = hgt * scale;
    const bR = [p.x + w, p.y], bB = [p.x, p.y + d], bL = [p.x - w, p.y]; const tR = [p.x + w, p.y - h], tB = [p.x, p.y + d - h], tL = [p.x - w, p.y - h], tT = [p.x, p.y - d - h];
    dPoly([bL, bB, tB, tL], cols.left); dPoly([bB, bR, tR, tB], cols.right); dPoly([tT, tR, tB, tL], cols.top, cols.trim, 1);
    return { front: [bB, bR, tR, tB], cx: p.x, cy: p.y, w, d, h, topY: p.y - d - h };
  }
  function distLabel(x, y, text, color, big) {
    ctx.font = (big ? 'bold ' + (12 * scale | 0) : (10 * scale | 0)) + "px 'Space Grotesk','Share Tech Mono',sans-serif";
    const tw = ctx.measureText(text).width + 12 * scale, bx = x - tw / 2, by = y - 18 * scale, bh = 15 * scale;
    ctx.fillStyle = 'rgba(8,4,18,0.85)'; ctx.strokeStyle = color; ctx.lineWidth = 1; roundRect(bx, by, tw, bh, 4 * scale); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, by + bh / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  let DIST_MOTES = null;
  function drawDistMotes(now, cP) {
    if (!DIST_MOTES) DIST_MOTES = Array.from({ length: 26 }, () => ({ col: DIST.center[0] + (Math.random() * 2 - 1) * (DIST.radius + 2), row: DIST.center[1] + (Math.random() * 2 - 1) * (DIST.radius + 2), z: Math.random() * 50, sp: 5 + Math.random() * 10, c: Math.random() < 0.5 ? '#a855f7' : '#22d3ee' }));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const m of DIST_MOTES) { m.z += m.sp * 0.016; if (m.z > 52) { m.z = 0; m.col = DIST.center[0] + (Math.random() * 2 - 1) * (DIST.radius + 2); m.row = DIST.center[1] + (Math.random() * 2 - 1) * (DIST.radius + 2); }
      const p = isoToScreen(m.col, m.row); ctx.globalAlpha = Math.max(0, 1 - m.z / 52) * 0.5; ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(p.x + Math.sin(m.z * 0.2) * 4 * scale, p.y - m.z * scale, 1.5 * scale, 0, 7); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawDistrict(now) {
    const t = now / 1000;
    const cP = isoToScreen(DIST.center[0], DIST.center[1]);
    // "Source" aura — soft radial glow spill so HQ reads as the focal landmark
    const aura = ctx.createRadialGradient(cP.x, cP.y - 26 * scale, 0, cP.x, cP.y - 26 * scale, (DIST.radius + 3) * TILE_W * scale / 2);
    aura.addColorStop(0, 'rgba(168,85,247,0.18)'); aura.addColorStop(0.5, 'rgba(34,211,238,0.07)'); aura.addColorStop(1, 'rgba(168,85,247,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = aura; ctx.fillRect(cP.x - 460 * scale, cP.y - 460 * scale, 920 * scale, 920 * scale); ctx.restore();
    // plaza medallion (seed-of-life sigil) + district ring + spokes
    ctx.save(); ctx.strokeStyle = 'rgba(232,196,92,0.4)'; ctx.lineWidth = 1;
    const rr = 1.9 * (TILE_H * scale / 2) * 2;
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.ellipse(cP.x + Math.cos(a) * rr * 0.5, cP.y + Math.sin(a) * rr * 0.25, rr * 0.5, rr * 0.25, 0, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(cP.x, cP.y, rr * 0.5, rr * 0.25, 0, 0, 7); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.ellipse(cP.x, cP.y, (DIST.radius + 1.1) * TILE_W * scale / 2, (DIST.radius + 1.1) * TILE_H * scale / 2, 0, 0, 7); ctx.strokeStyle = 'rgba(168,85,247,0.28)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    [...DIST.rooms, ...DIST.plots].forEach(o => { const bp = isoToScreen(o.col, o.row); const nx = bp.y - cP.y, ny = -(bp.x - cP.x); const L = Math.hypot(nx, ny) || 1; const wx = nx / L * 5 * scale, wy = ny / L * 5 * scale; dPoly([[cP.x + wx, cP.y + wy], [bp.x + wx, bp.y + wy], [bp.x - wx, bp.y - wy], [cP.x - wx, cP.y - wy]], 'rgba(168,85,247,0.14)'); });
    // depth-sorted structures (HQ + rooms + plots), back to front
    const structs = [{ hq: true, col: DIST.center[0], row: DIST.center[1] }, ...DIST.rooms.map(r => ({ room: r, col: r.col, row: r.row })), ...DIST.plots.map(p => ({ plot: p, col: p.col, row: p.row }))];
    structs.sort((a, b) => (a.col + a.row) - (b.col + b.row));
    for (const s of structs) { if (s.hq) drawDistHQ(now); else if (s.room) drawDistRoom(s.room, DIST_HOVER === s.room, now); else drawDistPlot(s.plot, now); }
    drawDistMotes(now, cP);   // drifting ambient motes over the plaza
  }
  function drawDistHQ(now) {
    const t = now / 1000; const C = DIST.center;
    dBox(C[0], C[1], 2.0, 2.0, 22, { top: '#3a2568', left: '#241245', right: '#2f1c56', trim: '#a855f7' });
    const b2 = dBox(C[0], C[1], 1.5, 1.5, 46, { top: '#a855f7', left: '#3a2568', right: '#6d3fb0', trim: '#e8c45c' });
    dFaceRect(b2.front, 0, 0.9, 1, 1, '#e8c45c');
    dFaceRect(b2.front, 0.4, 0, 0.6, 0.5, 'rgba(8,4,18,0.9)', '#e8c45c', 1.4);
    ctx.save(); ctx.shadowColor = '#e8c45c'; ctx.shadowBlur = 14 * scale; dFaceRect(b2.front, 0.44, 0, 0.56, 0.42, 'rgba(232,196,92,0.3)'); ctx.restore();
    const b3 = dBox(C[0], C[1], 0.7, 0.7, 66, { top: '#e8c45c', left: '#7a5a1a', right: '#b78a2a', trim: '#fff' });
    const cols = ['#e8c45c', '#22d3ee', '#a855f7', '#4f9dff', '#00e5a0', '#ff8bd0', '#ff5b5b'];
    cols.forEach((c, k) => { const a = (-90 + (k - 3) * 17) * Math.PI / 180; ctx.fillStyle = c; ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 7 * scale; ctx.beginPath(); ctx.arc(b3.cx + Math.cos(a) * 14 * scale, b3.topY + 4 * scale + Math.sin(a) * 8 * scale, 2.4 * scale, 0, 7); ctx.fill(); ctx.restore(); });
    const bp = 0.5 + 0.5 * Math.sin(t * 1.6); const gr = ctx.createLinearGradient(b3.cx, b3.topY - 70 * scale, b3.cx, b3.topY); gr.addColorStop(0, 'rgba(232,196,92,0)'); gr.addColorStop(1, 'rgba(232,196,92,' + (0.26 + 0.16 * bp) + ')');
    dPoly([[b3.cx - 2.5 * scale, b3.topY], [b3.cx + 2.5 * scale, b3.topY], [b3.cx + 7 * scale, b3.topY - 72 * scale], [b3.cx - 7 * scale, b3.topY - 72 * scale]], gr);
    ctx.save(); ctx.shadowColor = '#e8c45c'; ctx.shadowBlur = (12 + 7 * bp) * scale; ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(b3.cx, b3.topY - 12 * scale, 3.6 * scale, 0, 7); ctx.fill(); ctx.restore();
    distLabel(b3.cx, b3.topY - 26 * scale, 'COUNCIL HQ', '#e8c45c', true);
  }
  function drawDistRoom(rm, hot, now) {
    const t = now / 1000; const d = rm.data; const agent = d.agent || {}; const room = d.room || {};
    const col = agent.badgeColor || room.badgeColor || '#22d3ee';
    const b = dBox(rm.col, rm.row, 1.25, 1.25, 34 * (hot ? 1.05 : 1), { top: shade(col, hot ? 0.14 : 0.02), left: shade(col, -0.55), right: shade(col, -0.28), trim: shade(col, 0.3) });
    const F = b.front;
    dFaceRect(F, 0, 0.9, 1, 1, shade(col, 0.3));
    dFaceRect(F, 0.42, 0, 0.6, 0.46, 'rgba(8,4,18,0.9)', shade(col, 0.35), 1.2);   // door
    const fl = 0.5 + 0.5 * Math.sin(t * 3 + rm.phase);
    dFaceRect(F, 0.15, 0.55, 0.32, 0.78, 'rgba(255,245,200,' + (0.3 + 0.4 * fl) + ')', shade(col, 0.2), 1);
    dFaceRect(F, 0.68, 0.55, 0.85, 0.78, 'rgba(255,245,200,' + (0.3 + 0.4 * (1 - fl)) + ')', shade(col, 0.2), 1);
    // glyph plaque
    dFaceRect(F, 0.44, 0.52, 0.58, 0.74, 'rgba(8,4,18,0.7)', shade(col, 0.3), 1);
    const g = dFacePt(F, 0.51, 0.63); ctx.fillStyle = shade(col, 0.4); ctx.font = 'bold ' + (10 * scale | 0) + "px 'Space Grotesk'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((agent.name || 'A')[0], g[0], g[1]); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // permission cue: private=calm, showroom=glow ring, hireable=bright + $ badge
    const vis = (d.permissions && d.permissions.visibility) || 'private';
    if (vis !== 'private') { ctx.save(); ctx.beginPath(); ctx.ellipse(b.cx, b.cy, b.w * 1.5, b.d * 1.5, 0, 0, 7); ctx.strokeStyle = vis === 'hireable-studio' ? 'rgba(0,229,160,0.6)' : 'rgba(34,211,238,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
    // roof emblem + glow
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = (hot ? 14 : 8) * scale; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.cx, b.topY + 2 * scale, 4.5 * scale, 0, 7); ctx.fill(); ctx.restore();
    let lbl = agent.name || 'AGENT'; if (vis === 'hireable-studio') lbl += ' · ⚡'; else if (vis === 'public-showroom') lbl += ' · ◈';
    distLabel(b.cx, b.topY - 4 * scale, lbl, col, false);
  }
  function drawDistPlot(p, now) {
    const t = now / 1000; const pt = isoToScreen(p.col, p.row); const w = TILE_W * scale / 2 * 1.15, d = TILE_H * scale / 2 * 1.15, h = 30 * scale; const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + p.phase);
    ctx.save(); ctx.globalAlpha = 0.3 + 0.22 * pulse; const c = '#22d3ee';
    const bB = [pt.x, pt.y + d], bR = [pt.x + w, pt.y], bL = [pt.x - w, pt.y], tB = [pt.x, pt.y + d - h], tR = [pt.x + w, pt.y - h], tL = [pt.x - w, pt.y - h], tT = [pt.x, pt.y - d - h];
    dPoly([bL, bB, tB, tL], null, c, 1); dPoly([bB, bR, tR, tB], null, c, 1); dPoly([tT, tR, tB, tL], null, c, 1); ctx.restore();
    ctx.setLineDash([6 * scale, 4 * scale]); ctx.lineWidth = 2; ctx.strokeStyle = DIST_HOVER === p ? '#bfffff' : c; dPoly([[pt.x, pt.y - d], [pt.x + w, pt.y], [pt.x, pt.y + d], [pt.x - w, pt.y]], 'rgba(34,211,238,' + (0.08 + 0.09 * pulse) + ')', DIST_HOVER === p ? '#bfffff' : c, 2); ctx.setLineDash([]);
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = (5 + 5 * pulse) * scale; ctx.fillStyle = DIST_HOVER === p ? '#bfffff' : c; ctx.font = 'bold ' + (10 * scale | 0) + "px 'Space Grotesk'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('＋ CLAIM', pt.x, pt.y); ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  // screen-space hit test for district structures (rooms + claim plots)
  let DIST_HOVER = null;
  function distHitAt(px, py) {
    let hit = null, best = 40 * scale;
    for (const rm of DIST.rooms) { const p = isoToScreen(rm.col, rm.row); const dd = Math.hypot(px - p.x, py - (p.y - 12 * scale)); if (dd < best) { best = dd; hit = rm; } }
    for (const pl of DIST.plots) { const p = isoToScreen(pl.col, pl.row); const dd = Math.hypot(px - p.x, py - p.y); if (dd < best) { best = dd; hit = pl; } }
    return hit;
  }

  function render(now) {
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // backdrop gradient (dark brand) with a gentle top-light
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0c1420'); g.addColorStop(0.5, '#0a0f16'); g.addColorStop(1, '#05080c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // soft top-light bloom
    const tl = ctx.createRadialGradient(w / 2, -h * 0.2, 0, w / 2, -h * 0.2, h * 1.1);
    tl.addColorStop(0, 'rgba(0,229,255,0.06)'); tl.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = tl; ctx.fillRect(0, 0, w, h);

    // staggered intro reveal: rooms first, then agents (quick, ~700ms total)
    const t0 = now - mountAt;
    const roomsIn = Math.min(1, t0 / 420);

    ctx.save();
    ctx.globalAlpha = roomsIn;

    // floor + walls, painted back-to-front (row+col order = iso depth)
    for (let r = 0; r < GRID_H; r++)
      for (let c = 0; c < GRID_W; c++)
        drawTile(c, r, LAYOUT[r][c], now);

    // hover highlight
    if (hoverTile && !isWall(hoverTile.c, hoverTile.r)) {
      const p = isoToScreen(hoverTile.c, hoverTile.r);
      const hw = (TILE_W * scale) / 2, hh = (TILE_H * scale) / 2;
      const pulse = 0.5 + (Math.sin(now / 220) + 1) / 2 * 0.4;
      ctx.save();
      ctx.strokeStyle = `rgba(0,255,136,${pulse})`; ctx.lineWidth = 2;
      ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 8;
      diamondPath(p.x, p.y, hw, hh); ctx.stroke();
      ctx.restore();
    }

    // ---- PROPS — composition pass A: legacy office decor removed so the
    //      CAPITAL DISTRICT reads as the hero. Reception/break-room/boss-office/
    //      boardroom/shelf cleared; the Forge + nav doors + district remain, and
    //      the 7 council agents walk the plaza as ambient life.

    // ---- THE FORGE (marquee workshop, bottom-right warm room) ----
    drawForgeEmblem(19, 11, now);
    drawFurnace(20, 12, now);
    drawAnvil(18.5, 13, now);
    drawBox(19, 14, 0.6, 8, '#2a1c10', '#1a1108');           // tool bench / quench barrel

    // ---- REAL NAV DOORS (open Office sub-tabs) — drawn as glowing kiosks ----
    NAV_DOORS.forEach(d => {
      const hovered = hoverDoor && hoverDoor.id === d.id;
      drawNavDoor(d, now, hovered);
    });

    // (coming-soon footprints, tree, scattered plants, and per-agent desks removed
    //  in pass A — the district's HQ + forged-agent room-buildings carry the scene.)

    // collectables (hook-fed) with glow + float
    collectables.forEach(cl => {
      const p = isoToScreen(cl.tileX, cl.tileY);
      const t = now / 400;
      contactShadow(p.x, p.y, 8 * scale, 4 * scale, 0.2);
      ctx.save();
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10;
      ctx.font = `${16 * scale | 0}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(cl.icon || '★', p.x, p.y - 14 * scale + Math.sin(t) * 3);
      ctx.restore();
      ctx.textAlign = 'left';
    });

    // (legacy zone labels removed in pass A — the district labels its own structures.)

    ctx.restore(); // rooms alpha

    // ---- CAPITAL DISTRICT (forged-agent room-buildings) — behind the walking agents
    if (!DIST.lastFetch || (now - DIST.lastFetch > 30000)) fetchDistrict();
    if (DIST.loaded) drawDistrict(now);

    // agents + multiplayer avatars, depth-sorted together (draw back first) so
    // occlusion between AI agents and real players reads correctly.
    const drawList = Object.values(sprites).map(sp => ({ sp, kind: 'agent' }));
    if (MP.joined) {
      for (const id in MP.others) drawList.push({ sp: MP.others[id], kind: 'remote' });
      if (MP.you) drawList.push({ sp: MP.you, kind: 'you' });
    }
    drawList
      .sort((a, b) => (a.sp.col + a.sp.row) - (b.sp.col + b.sp.row))
      .forEach(item => {
        if (item.kind === 'agent') {
          const introStart = 380 + item.sp.idx * 70;
          const intro = Math.max(0, Math.min(1, (t0 - introStart) / 320));
          if (intro <= 0) return;
          drawAgent(item.sp, now, intro);
        } else {
          drawPlayer(item.sp, now, item.kind === 'you');
        }
      });

    // building-entry toast (floats over the target tile, fades out)
    drawToast(now);

    // ---- HUD CHROME overlay: vignette + scanlines + corner brackets ----
    drawChrome(w, h, now);
  }

  // On-theme toast anchored to a world tile (building entry cue).
  function drawToast(now) {
    if (!toast.text) return;
    const age = now - toast.start;
    if (age > toast.dur) { toast.text = ''; return; }
    let a = 1;
    if (age < 200) a = age / 200;
    else if (age > toast.dur - 500) a = Math.max(0, (toast.dur - age) / 500);
    const rise = (1 - Math.min(1, age / 300)) * 8;
    const p = isoToScreen(toast.at[0], toast.at[1]);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "11px 'Rajdhani','Share Tech Mono',sans-serif"; ctx.textAlign = 'center';
    const tw = ctx.measureText(toast.text).width;
    const bw = tw + 20, bh = 22, cx = p.x - bw / 2, cy = p.y - 54 * scale - rise;
    ctx.fillStyle = 'rgba(8,14,20,0.95)';
    roundRect(cx, cy, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = toast.color; ctx.lineWidth = 1.5;
    ctx.shadowColor = toast.color; ctx.shadowBlur = 12;
    roundRect(cx, cy, bw, bh, 8); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eef4f2';
    ctx.fillText(toast.text, p.x, cy + 15);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // Ambient vignette, faint scanline grain, and neon corner brackets.
  function drawChrome(w, h, now) {
    // vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

    // subtle scanlines (cheap: draw every 3px, low alpha)
    ctx.save();
    ctx.globalAlpha = 0.05; ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();

    // corner brackets
    const L = 22, M = 10;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,136,0.55)'; ctx.lineWidth = 2;
    ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 6;
    const corner = (x, y, sx, sy) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L);
      ctx.stroke();
    };
    corner(M, M, 1, 1);
    corner(w - M, M, -1, 1);
    corner(M, h - M, 1, -1);
    corner(w - M, h - M, -1, -1);
    ctx.restore();

    // slim top status line
    ctx.save();
    ctx.font = "8px 'Share Tech Mono', monospace"; ctx.textAlign = 'left';
    const blink = (Math.sin(now / 500) + 1) / 2 > 0.5;
    ctx.fillStyle = blink ? 'rgba(0,255,136,0.7)' : 'rgba(0,255,136,0.35)';
    ctx.fillText('● LIVE', M + 8, M + 14);
    ctx.fillStyle = 'rgba(0,229,255,0.45)';
    ctx.textAlign = 'right';
    ctx.fillText('SHADDAI · PIXEL OFFICE', w - M - 8, M + 14);
    ctx.restore();
  }

  // ---- rAF LOOP -------------------------------------------------------------
  function loop(t) {
    if (!running) return;
    if (!visible) { rafId = requestAnimationFrame(loop); lastT = t; return; }
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
    try { update(dt, t); render(t); } catch (_) { /* never throw out of rAF */ }
    rafId = requestAnimationFrame(loop);
  }

  // ---- INPUT / HIT-TESTING --------------------------------------------------
  function localPt(ev) {
    const rect = canvas.getBoundingClientRect();
    const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    return { x: cx, y: cy };
  }
  function agentAt(px, py) {
    let hit = null, best = 26 * scale;
    for (const name in sprites) {
      const sp = sprites[name];
      const p = isoToScreen(sp.col, sp.row);
      const dx = Math.abs(px - p.x), dy = Math.abs(py - (p.y - 20 * scale));
      if (dx < 12 * scale && dy < 24 * scale) {
        const d = dx + dy; if (d < best) { best = d; hit = sp; }
      }
    }
    return hit;
  }
  function onMove(ev) {
    const p = localPt(ev);
    const iso = screenToIso(p.x, p.y);
    const c = Math.round(iso.col), r = Math.round(iso.row);
    hoverTile = (c >= 0 && r >= 0 && c < GRID_W && r < GRID_H) ? { c, r } : null;
    hoverDoor = doorAtIso(iso.col, iso.row);
    const overBuilding = hoverTile && buildingAtTile(hoverTile.c, hoverTile.r);
    DIST_HOVER = distHitAt(p.x, p.y);   // forged-agent room-buildings / claim plots
    canvas.style.cursor = (agentAt(p.x, p.y) || overBuilding || hoverDoor || DIST_HOVER) ? 'pointer' : 'default';
  }
  // Which clickable building (if any) owns the clicked tile?
  function buildingAtTile(c, r) {
    if (r < 0 || c < 0 || r >= GRID_H || c >= GRID_W) return null;
    const kind = LAYOUT[r][c];
    return BUILDINGS.find(b => b.tiles === kind) || null;
  }
  // Which nav door (if any) sits under a fractional iso coord (radius hit-test)?
  function doorAtIso(col, row) {
    let hit = null, best = Infinity;
    for (const d of NAV_DOORS) {
      const dc = col - d.center[0], dr = row - d.center[1];
      const dist = Math.hypot(dc, dr);
      if (dist <= (d.hitR || 1.6) && dist < best) { best = dist; hit = d; }
    }
    return hit;
  }

  // Floating toast bubble anchored to a tile (used for building entry cues).
  const toast = { text: '', color: '#fff', at: [0, 0], start: 0, dur: 0 };
  function showToast(text, color, tile) {
    toast.text = text; toast.color = color || '#fff';
    toast.at = tile || [GRID_W / 2, GRID_H / 2];
    toast.start = performance.now(); toast.dur = 2400;
  }

  function enterBuilding(b) {
    if (!b) return;
    if (b.id === 'forge') {
      showToast('↦ Opening The Forge…', '#ff8c1a', b.center);
      try { if (typeof window.showView === 'function') window.showView('forge'); } catch (_) {}
    } else if (b.id === 'market') {
      showToast('↦ Opening the Bazaar…', '#e8b84b', b.center);   // handled by the dashboard router → opens the Bazaar
    } else {
      showToast(`${b.label} — coming soon`, b.color, b.center);
    }
    try {
      window.dispatchEvent(new CustomEvent('pixeloffice:enter-building',
        { detail: { building: b.id } }));
    } catch (_) {}
  }

  // Open an Office sub-tab from a nav door — best-effort, never throws.
  function enterNavDoor(d) {
    if (!d) return;
    showToast(`↦ Opening ${d.short}…`, d.color, d.center);
    // The dashboard's 'pixeloffice:enter-building' router owns ALL routing (office sub-tabs
    // don't have standalone views, so a direct showView(d.id) here would flash a false
    // "Coming soon" toast for command/boardroom). Dispatch the event and let it route.
    try {
      window.dispatchEvent(new CustomEvent('pixeloffice:enter-building',
        { detail: { building: d.id } }));
    } catch (_) {}
  }

  function onClick(ev) {
    const p = localPt(ev);
    const a = agentAt(p.x, p.y);
    if (a) {                                     // select + deploy to Mission Control
      selectAgent(a.name);
      sayBubble(a, 'Deploying to Mission Control…', 2600);
      try {
        if (typeof window.deployAgentToMissionControl === 'function') {
          window.deployAgentToMissionControl(a.name);
        } else {
          window.dispatchEvent(new CustomEvent('pixeloffice:agent-click', { detail: { name: a.name } }));
        }
      } catch (_) {}
      return;
    }
    // CAPITAL DISTRICT: a forged-agent room-building opens its real Command Deck; a claim plot → Forge.
    const dh = distHitAt(p.x, p.y);
    if (dh) {
      if (dh.data && dh.data.agent) {
        const ag = dh.data.agent;
        showToast('◈ Opening ' + (ag.name || 'agent') + "'s Command Deck…", ag.badgeColor || '#22d3ee', [dh.col, dh.row]);
        try { if (ag.id && typeof window.openAgentRoom === 'function') window.openAgentRoom(ag.id); } catch (_) {}
      } else {
        // Forge from the office → PIXEL FORGE by default (the world-facing 2D embodiment).
        showToast('◈ Opening the Pixel Forge…', '#22d3ee', [dh.col, dh.row]);
        try { window.location.href = '/pixel-forge.html'; } catch (_) {}
      }
      return;
    }
    const iso = screenToIso(p.x, p.y);
    // REAL nav doors take priority — open the matching Office sub-tab
    const nd = doorAtIso(iso.col, iso.row);
    if (nd) { enterNavDoor(nd); return; }
    const c = Math.round(iso.col), r = Math.round(iso.row);
    // building click (forge routes to dashboard; soon-tiles show a toast)
    const b = buildingAtTile(c, r);
    if (b) { enterBuilding(b); return; }
    // else: walk to the clicked tile.
    //   When JOINED, a bare floor-click moves YOUR avatar (agent/nav/building
    //   clicks above are untouched). When OFFLINE, behavior is unchanged: the
    //   selected AI agent walks there.
    if (MP.joined && MP.you) {
      if (!isWall(c, r)) walkTo(MP.you, c, r);
      return;
    }
    const sp = sprites[selected];
    if (sp && !isWall(c, r)) walkTo(sp, c, r);
  }

  // ===========================================================================
  // MULTIPLAYER — identity, join/leave, poll loop, remote render, chat.
  // Everything below is null-safe and never throws. When the backend is absent
  // (404 / network / file://) MP silently disables and the office keeps working.
  // ===========================================================================

  // Persistent identity in localStorage. Short random id + friendly guest name.
  function shortId(n) {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < (n || 6); i++) s += c[(Math.random() * c.length) | 0];
    return s;
  }
  function loadPlayer() {
    let p = null;
    try {
      const raw = localStorage.getItem('pxo_player');
      if (raw) p = JSON.parse(raw);
    } catch (_) {}
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') {
      p = { id: shortId(8), name: 'Guest-' + shortId(4) };
      savePlayer(p);
    }
    return p;
  }
  function savePlayer(p) {
    try { localStorage.setItem('pxo_player', JSON.stringify(p)); } catch (_) {}
  }
  function renamePlayer(name) {
    if (!MP.player) return;
    name = String(name || '').trim().slice(0, 20).replace(/[\r\n]/g, '');
    if (!name) return;
    MP.player.name = name;
    savePlayer(MP.player);
    if (MP.you) MP.you.name = name;
  }

  // Build YOUR avatar sprite (distinct neutral operator). Spawns at reception.
  function makeYou() {
    const spawn = [3, 3];
    return {
      name: MP.player ? MP.player.name : 'YOU',
      color: YOU_COLOR, role: 'Operator', isYou: true,
      col: spawn[0], row: spawn[1], homeCol: spawn[0], homeRow: spawn[1],
      idx: 99, path: null, pathI: 0, face: 1,
      bob: 0, breath: 0,
      nextBlinkAt: performance.now() + 2000, blinkUntil: 0,
      wanderAt: Infinity,           // YOU never auto-wanders
      bubbleText: '', bubbleStart: 0, bubbleDur: 0,
    };
  }
  // Remote-player sprite. col/row = smoothed render pos; tcol/trow = reported target.
  function makeRemote(pl) {
    return {
      id: pl.id, name: String(pl.name || 'Guest').slice(0, 20),
      color: YOU_COLOR, role: 'Guest', isRemote: true,
      col: pl.x, row: pl.y, tcol: pl.x, trow: pl.y,
      idx: 90, path: null, face: 1,
      bob: Math.random() * Math.PI * 2, breath: Math.random() * Math.PI * 2,
      nextBlinkAt: performance.now() + 1500 + Math.random() * 4000, blinkUntil: 0,
      bubbleText: '', bubbleStart: 0, bubbleDur: 0,
      lastChatKey: '',
    };
  }

  // Toggle online/offline from the HUD button.
  function toggleJoin() {
    if (!MP.available) return;
    if (MP.joined) leaveMP(); else joinMP();
  }
  function joinMP() {
    if (!MP.available || MP.joined) return;
    if (!MP.player) MP.player = loadPlayer();
    MP.you = makeYou();
    MP.joined = true;
    MP.fails = 0;
    updateJoinUI();
    if (MP.panel) MP.panel.style.display = 'flex';
    // immediate sync, then interval
    syncMP();
    if (MP.pollTimer) clearInterval(MP.pollTimer);
    MP.pollTimer = setInterval(() => {
      // pause polling while offscreen to be a good citizen
      if (!visible) return;
      syncMP();
    }, MP.POLL_MS);
  }
  function leaveMP() {
    MP.joined = false;
    if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = 0; }
    MP.you = null;
    MP.others = {};
    MP.online = 0;
    updateJoinUI();
    if (MP.panel) MP.panel.style.display = 'none';
  }
  // Permanently disable MP for this mount (backend missing / repeated failure).
  function disableMP() {
    MP.available = false;
    MP.joined = false;
    if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = 0; }
    MP.you = null; MP.others = {}; MP.online = 0;
    if (MP.goBtn) {
      MP.goBtn.textContent = '◌ OFFLINE';
      MP.goBtn.classList.add('pxo-mp-off');
      MP.goBtn.disabled = true;
      MP.goBtn.title = 'Multiplayer unavailable';
    }
    if (MP.panel) MP.panel.style.display = 'none';
  }

  // POST /api/mp/sync — report our tile, ingest other players + chat.
  async function syncMP() {
    if (!MP.available || !MP.joined || MP.inFlight || !MP.you) return;
    MP.inFlight = true;
    try {
      const body = {
        room: MP.room,
        id: MP.player.id,
        name: MP.player.name,
        agent: selected,
        x: Math.round(MP.you.col),
        y: Math.round(MP.you.row),
      };
      const res = await fetch('/api/mp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res || !res.ok) throw new Error('bad status');
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error('not ok');
      MP.fails = 0;
      ingestPlayers(Array.isArray(data.players) ? data.players : []);
      ingestChat(Array.isArray(data.chat) ? data.chat : []);
      MP.online = (typeof data.online === 'number') ? data.online : (Object.keys(MP.others).length + 1);
      updateOnlineChip();
    } catch (_) {
      MP.fails++;
      if (MP.fails >= MP.MAX_FAILS) disableMP();   // silent — no console spam
    } finally {
      MP.inFlight = false;
    }
  }

  // Reconcile the remote-player set: add new, retarget existing, drop gone.
  function ingestPlayers(players) {
    const seen = {};
    for (const pl of players) {
      if (!pl || typeof pl.id !== 'string' || pl.id === MP.player.id) continue;
      const x = clampTile(+pl.x, GRID_W), y = clampTile(+pl.y, GRID_H);
      seen[pl.id] = true;
      let r = MP.others[pl.id];
      if (!r) { r = makeRemote({ id: pl.id, name: pl.name, x, y }); MP.others[pl.id] = r; }
      r.name = String(pl.name || 'Guest').slice(0, 20);
      // face toward travel direction (screen x = dc - dr)
      const sx = (x - r.tcol) - (y - r.trow);
      if (Math.abs(sx) > 0.001) r.face = sx > 0 ? 1 : -1;
      r.tcol = x; r.trow = y;                       // lerp target (glide, not teleport)
    }
    for (const id in MP.others) if (!seen[id]) delete MP.others[id];
  }
  function clampTile(v, max) {
    if (!isFinite(v)) return 1;
    return Math.max(0, Math.min(max - 1, Math.round(v)));
  }

  // Ingest chat: render into the panel + pop a bubble over the speaker.
  function ingestChat(chat) {
    MP.chat = chat;
    // pop a speech bubble on the most recent NEW message from a remote player
    if (chat.length) {
      const last = chat[chat.length - 1];
      const key = (last.name || '') + '|' + (last.text || '') + '|' + (last.t || '');
      if (key !== MP.seenChatKey) {
        MP.seenChatKey = key;
        // find a remote sprite whose name matches the speaker
        for (const id in MP.others) {
          const r = MP.others[id];
          if (r.name === last.name && r.lastChatKey !== key) {
            r.lastChatKey = key;
            sayBubble(r, String(last.text || '').slice(0, 120), 4200);
            break;
          }
        }
      }
    }
    renderChatList();
  }

  // POST /api/mp/chat — send a message (name+text). Never throws.
  async function sendChat(text) {
    if (!MP.available || !MP.joined || !MP.player) return;
    text = String(text || '').trim().slice(0, 240);
    if (!text) return;
    try {
      const res = await fetch('/api/mp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: MP.room, id: MP.player.id, name: MP.player.name, text }),
      });
      if (!res || !res.ok) throw new Error('bad status');
      // optimistic: pop our own bubble + kick a fast sync to pull the log
      if (MP.you) sayBubble(MP.you, text.slice(0, 120), 4200);
      syncMP();
    } catch (_) {
      MP.fails++;
      if (MP.fails >= MP.MAX_FAILS) disableMP();
    }
  }

  // ---- Chat DOM rendering (XSS-safe: textContent only, never innerHTML) -----
  function renderChatList() {
    if (!MP.msgList) return;
    const key = MP.chat.map(m => (m.name || '') + '' + (m.text || '') + '' + (m.t || '')).join('');
    if (key === MP.msgList.__key) return;          // no change → skip DOM churn
    MP.msgList.__key = key;
    // rebuild (small list, max 30) with safe textContent nodes
    const nearBottom = MP.msgList.scrollHeight - MP.msgList.scrollTop - MP.msgList.clientHeight < 40;
    MP.msgList.textContent = '';
    for (const m of MP.chat) {
      const row = document.createElement('div');
      row.className = 'pxo-msg';
      const nm = document.createElement('span');
      nm.className = 'pxo-msg-name';
      nm.textContent = (m.name || 'Guest') + ':';    // textContent = XSS-safe
      const tx = document.createElement('span');
      tx.className = 'pxo-msg-text';
      tx.textContent = ' ' + (m.text || '');
      row.appendChild(nm); row.appendChild(tx);
      MP.msgList.appendChild(row);
    }
    if (nearBottom) MP.msgList.scrollTop = MP.msgList.scrollHeight;
  }
  function updateOnlineChip() {
    if (!MP.onlineChip) return;
    if (MP.joined) {
      MP.onlineChip.style.display = '';
      MP.onlineChip.textContent = '● ' + Math.max(1, MP.online | 0) + ' online';
    } else {
      MP.onlineChip.style.display = 'none';
    }
  }
  function updateJoinUI() {
    if (MP.goBtn && MP.available) {
      MP.goBtn.textContent = MP.joined ? '◉ LEAVE' : '◉ GO ONLINE';
      MP.goBtn.classList.toggle('pxo-mp-on', MP.joined);
    }
    updateOnlineChip();
  }

  // ---- MP update (called each frame from update()) --------------------------
  function updateMP(dt, now) {
    // YOUR avatar walks its path just like an agent
    const you = MP.you;
    if (you) {
      you.bob += dt * 3; you.breath += dt * 1.6;
      if (now > you.nextBlinkAt) { you.blinkUntil = now + 120; you.nextBlinkAt = now + 2200 + Math.random() * 4200; }
      if (you.path && you.pathI < you.path.length) {
        const tgt = you.path[you.pathI];
        const spd = dt * 3.2;
        const ddc = tgt.c - you.col, ddr = tgt.r - you.row;
        const sx = ddc - ddr;
        if (Math.abs(sx) > 0.001) you.face = sx > 0 ? 1 : -1;
        you.col += Math.sign(ddc) * Math.min(spd, Math.abs(ddc));
        you.row += Math.sign(ddr) * Math.min(spd, Math.abs(ddr));
        if (Math.abs(tgt.c - you.col) < 0.02 && Math.abs(tgt.r - you.row) < 0.02) {
          you.col = tgt.c; you.row = tgt.r; you.pathI++;
          if (you.pathI >= you.path.length) you.path = null;
        }
      }
    }
    // remote players glide toward their reported tile (lerp, not teleport)
    for (const id in MP.others) {
      const r = MP.others[id];
      r.bob += dt * 3; r.breath += dt * 1.6;
      if (now > r.nextBlinkAt) { r.blinkUntil = now + 120; r.nextBlinkAt = now + 2200 + Math.random() * 4200; }
      const k = Math.min(1, dt * 6);               // smoothing factor
      r.col += (r.tcol - r.col) * k;
      r.row += (r.trow - r.row) * k;
    }
  }

  // ---- HUD ------------------------------------------------------------------
  function buildHud() {
    hud = document.createElement('div');
    hud.className = 'pxo-hud';
    hud.innerHTML =
      '<div class="pxo-chips"></div>' +
      '<div class="pxo-tools">' +
        '<button class="pxo-btn" data-act="recenter">◎ RECENTER</button>' +
        '<button class="pxo-btn pxo-mp-btn" data-act="join">◉ GO ONLINE</button>' +
        '<button class="pxo-btn pxo-mp-btn" data-act="chat">✆ CHAT</button>' +
        '<span class="pxo-online" style="display:none">● 0 online</span>' +
      '</div>' +
      '<div class="pxo-legend">' +
        '<span class="pxo-lg"><i style="background:#00ff88"></i>tile → walk</span>' +
        '<span class="pxo-lg"><i style="background:#00e5ff"></i>agent → chat</span>' +
        '<span class="pxo-lg"><i style="background:#a78bfa"></i>door → open</span>' +
      '</div>';
    const chips = hud.querySelector('.pxo-chips');
    ROSTER.forEach(a => {
      const b = document.createElement('button');
      b.className = 'pxo-chip'; b.dataset.agent = a.name;
      b.style.setProperty('--ac', a.color);
      b.innerHTML = `<span class="dot"></span>${a.name}`;
      b.addEventListener('click', () => selectAgent(a.name, true));
      chips.appendChild(b);
    });
    hud.querySelector('[data-act="recenter"]').addEventListener('click', () => {
      fitCamera();
    });
    // multiplayer HUD wiring
    MP.goBtn = hud.querySelector('[data-act="join"]');
    MP.onlineChip = hud.querySelector('.pxo-online');
    MP.goBtn.addEventListener('click', toggleJoin);
    hud.querySelector('[data-act="chat"]').addEventListener('click', toggleChatPanel);
    host.appendChild(hud);
    buildChatPanel();
    updateJoinUI();
    refreshChips();
  }

  // ---- Chat panel (compact, on-theme, XSS-safe rendering) -------------------
  function buildChatPanel() {
    const panel = document.createElement('div');
    panel.className = 'pxo-chat';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="pxo-chat-head">' +
        '<span class="pxo-chat-title">◉ OFFICE CHAT</span>' +
        '<span class="pxo-chat-name">' +
          '<input class="pxo-name-input" maxlength="20" placeholder="name" />' +
          '<button class="pxo-name-save" title="Rename">✎</button>' +
        '</span>' +
        '<button class="pxo-chat-close" title="Close">✕</button>' +
      '</div>' +
      '<div class="pxo-msglist"></div>' +
      '<div class="pxo-chat-input">' +
        '<input class="pxo-msg-input" maxlength="240" placeholder="Say something…" />' +
        '<button class="pxo-send">SEND</button>' +
      '</div>';
    host.appendChild(panel);
    MP.panel = panel;
    MP.msgList = panel.querySelector('.pxo-msglist');
    MP.msgInput = panel.querySelector('.pxo-msg-input');
    MP.nameInput = panel.querySelector('.pxo-name-input');
    if (!MP.player) MP.player = loadPlayer();
    MP.nameInput.value = MP.player.name;

    const send = () => {
      const v = MP.msgInput.value;
      MP.msgInput.value = '';
      sendChat(v);
    };
    panel.querySelector('.pxo-send').addEventListener('click', send);
    MP.msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    const doRename = () => { renamePlayer(MP.nameInput.value); MP.nameInput.value = MP.player.name; };
    panel.querySelector('.pxo-name-save').addEventListener('click', doRename);
    MP.nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doRename(); MP.msgInput.focus(); } });
    panel.querySelector('.pxo-chat-close').addEventListener('click', () => { panel.style.display = 'none'; });
  }
  function toggleChatPanel() {
    if (!MP.panel) return;
    MP.panel.style.display = (MP.panel.style.display === 'none') ? 'flex' : 'none';
  }
  function refreshChips() {
    if (!hud) return;
    hud.querySelectorAll('.pxo-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.agent === selected));
  }

  // ---- PUBLIC: select (+optionally center) an agent -------------------------
  function selectAgent(name, center) {
    if (!sprites[name]) return;
    selected = name; refreshChips();
    if (center) {
      const sp = sprites[name], p = isoToScreen(sp.col, sp.row);
      const w = canvas.width / dpr, h = canvas.height / dpr;
      camTargetX += (w / 2 - p.x); camTargetY += (h / 2 - p.y);
    }
  }

  // ---- STYLES (injected once) ----------------------------------------------
  function injectStyles() {
    if (document.getElementById('pxo-styles')) return;
    const st = document.createElement('style'); st.id = 'pxo-styles';
    st.textContent = `
    .pxo-root{position:relative;width:100%;height:100%;min-height:0;display:flex;flex-direction:column;
      background:#05080c;border:1px solid rgba(0,255,136,.18);border-radius:12px;overflow:hidden;
      box-shadow:0 0 0 1px rgba(0,229,255,.06) inset, 0 14px 44px rgba(0,0,0,.5);
      font-family:'Rajdhani','Share Tech Mono',monospace}
    .pxo-root canvas{flex:1;display:block;width:100%;height:100%;touch-action:none;
      animation:pxoFade .5s ease}
    @keyframes pxoFade{from{opacity:0}to{opacity:1}}
    .pxo-hud{position:absolute;left:0;right:0;bottom:0;padding:9px 11px;display:flex;gap:10px;align-items:center;
      flex-wrap:wrap;background:linear-gradient(0deg,rgba(4,7,11,.94),rgba(4,7,11,0));pointer-events:none;
      backdrop-filter:blur(2px)}
    .pxo-hud>*{pointer-events:auto}
    .pxo-chips{display:flex;gap:5px;flex-wrap:wrap}
    .pxo-chip{--ac:#00ff88;display:flex;align-items:center;gap:5px;font-size:9px;letter-spacing:1px;
      font-family:'Share Tech Mono',monospace;padding:4px 9px;border-radius:20px;cursor:pointer;
      color:#9fb0c4;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);
      transition:all .16s ease}
    .pxo-chip .dot{width:7px;height:7px;border-radius:50%;background:var(--ac);box-shadow:0 0 6px var(--ac)}
    .pxo-chip:hover{border-color:var(--ac);color:#e8f0ee;transform:translateY(-1px)}
    .pxo-chip.active{color:#04120c;background:var(--ac);border-color:var(--ac);font-weight:700;
      box-shadow:0 0 14px var(--ac)}
    .pxo-tools{display:flex;gap:6px}
    .pxo-btn{font-size:9px;letter-spacing:1.5px;font-family:'Share Tech Mono',monospace;padding:5px 11px;
      border-radius:6px;cursor:pointer;color:#00ff88;background:rgba(0,255,136,.08);
      border:1px solid rgba(0,255,136,.35);transition:all .16s ease}
    .pxo-btn:hover{background:#00ff88;color:#04120c;box-shadow:0 0 14px rgba(0,255,136,.55)}
    .pxo-legend{margin-left:auto;display:flex;gap:10px;font-size:8px;letter-spacing:1px;
      color:rgba(0,229,255,.55);font-family:'Share Tech Mono',monospace}
    .pxo-lg{display:flex;align-items:center;gap:4px}
    .pxo-lg i{width:6px;height:6px;border-radius:2px;display:inline-block}
    @media(max-width:640px){.pxo-legend{display:none}}
    /* ---- multiplayer HUD ---- */
    .pxo-mp-btn{color:#00e5ff;background:rgba(0,229,255,.08);border-color:rgba(0,229,255,.35)}
    .pxo-mp-btn:hover{background:#00e5ff;color:#04120c;box-shadow:0 0 14px rgba(0,229,255,.55)}
    .pxo-btn.pxo-mp-on{color:#04120c;background:#00ff88;border-color:#00ff88;box-shadow:0 0 14px rgba(0,255,136,.55)}
    .pxo-btn.pxo-mp-off{color:#6b7787;background:rgba(255,255,255,.02);border-color:rgba(255,255,255,.12);cursor:not-allowed;box-shadow:none}
    .pxo-online{font-size:8px;letter-spacing:1px;font-family:'Share Tech Mono',monospace;
      color:#00ff88;padding:4px 8px;border-radius:20px;background:rgba(0,255,136,.08);
      border:1px solid rgba(0,255,136,.3);align-self:center}
    /* ---- chat panel ---- */
    .pxo-chat{position:absolute;right:11px;bottom:52px;width:min(300px,72vw);height:min(320px,52vh);
      display:flex;flex-direction:column;background:rgba(6,11,17,.94);
      border:1px solid rgba(0,229,255,.3);border-radius:11px;overflow:hidden;z-index:6;
      box-shadow:0 12px 40px rgba(0,0,0,.55),0 0 0 1px rgba(0,229,255,.06) inset;
      backdrop-filter:blur(4px);font-family:'Share Tech Mono',monospace}
    .pxo-chat-head{display:flex;align-items:center;gap:6px;padding:7px 9px;
      background:linear-gradient(90deg,rgba(0,229,255,.14),rgba(0,255,136,.05));
      border-bottom:1px solid rgba(0,229,255,.2)}
    .pxo-chat-title{font-size:9px;letter-spacing:1.5px;color:#00e5ff;font-weight:700}
    .pxo-chat-name{margin-left:auto;display:flex;align-items:center;gap:3px}
    .pxo-name-input{width:72px;font-size:9px;font-family:'Share Tech Mono',monospace;
      color:#e8f0ee;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);
      border-radius:5px;padding:3px 5px;outline:none}
    .pxo-name-input:focus{border-color:#00ff88}
    .pxo-name-save,.pxo-chat-close{font-size:10px;cursor:pointer;color:#9fb0c4;
      background:transparent;border:none;padding:2px 4px}
    .pxo-name-save:hover,.pxo-chat-close:hover{color:#00ff88}
    .pxo-msglist{flex:1;overflow-y:auto;padding:7px 9px;display:flex;flex-direction:column;gap:4px;
      scrollbar-width:thin;scrollbar-color:rgba(0,229,255,.3) transparent}
    .pxo-msglist::-webkit-scrollbar{width:6px}
    .pxo-msglist::-webkit-scrollbar-thumb{background:rgba(0,229,255,.28);border-radius:3px}
    .pxo-msg{font-size:11px;line-height:1.35;color:#dce6e2;word-break:break-word;font-family:'Rajdhani','Share Tech Mono',sans-serif}
    .pxo-msg-name{color:#00e5ff;font-weight:700}
    .pxo-chat-input{display:flex;gap:5px;padding:7px 9px;border-top:1px solid rgba(0,229,255,.16)}
    .pxo-msg-input{flex:1;font-size:11px;font-family:'Rajdhani','Share Tech Mono',sans-serif;
      color:#e8f0ee;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);
      border-radius:6px;padding:5px 8px;outline:none}
    .pxo-msg-input:focus{border-color:#00e5ff;box-shadow:0 0 8px rgba(0,229,255,.3)}
    .pxo-send{font-size:9px;letter-spacing:1px;font-weight:700;cursor:pointer;color:#04120c;
      background:#00e5ff;border:none;border-radius:6px;padding:5px 11px;transition:all .15s ease}
    .pxo-send:hover{background:#00ff88;box-shadow:0 0 12px rgba(0,255,136,.5)}
    @media(max-width:640px){.pxo-chat{bottom:60px;height:min(260px,44vh)}}
    `;
    document.head.appendChild(st);
  }

  // ---- SIZING ---------------------------------------------------------------
  function resize() {
    if (!canvas || !host) return;
    // Measure the HOST (guaranteed laid-out), not the canvas (which may be mid-reflow
    // or momentarily 0-height during a flex/tab transition → baked-in wrong size).
    const rect = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);          // cap DPR at 2
    canvas.width = Math.max(1, rect.width * dpr | 0);
    canvas.height = Math.max(1, rect.height * dpr | 0);
    fitCamera();
  }

  // ---- MOUNT / UNMOUNT ------------------------------------------------------
  function mount(hostEl) {
    if (!hostEl) return;                          // null-safe
    if (host === hostEl && running) return;       // idempotent
    unmount();                                    // clean any prior mount
    host = hostEl;
    injectStyles();
    host.classList.add('pxo-root');
    host.innerHTML = '';                          // clean slate
    canvas = document.createElement('canvas');
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');
    // multiplayer: fresh per-mount state (default OFFLINE = single-player)
    MP.joined = false;
    MP.available = (typeof location === 'undefined') ? true : location.protocol !== 'file:';
    MP.you = null; MP.others = {}; MP.chat = []; MP.online = 0;
    MP.fails = 0; MP.inFlight = false; MP.seenChatKey = '';
    if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = 0; }
    MP.player = loadPlayer();

    syncRoster();     // merge forged operatives into ROSTER before HUD/sprites are built
    buildHud();
    resetSprites();
    initEmbers();
    if (!MP.available) disableMP();               // file:// → MP off, office fine

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchstart', onClick, { passive: true });

    ro = new ResizeObserver(resize); ro.observe(host);
    io = new IntersectionObserver(es => {
      var wasVisible = visible;
      visible = es[0] && es[0].isIntersecting;
      // Re-fit the moment the office tab becomes visible: on hidden→visible the host
      // now has a real laid-out rect, so this replaces the fragile setTimeout mount hack.
      if (visible && !wasVisible) resize();
    }, { threshold: 0.01 });
    io.observe(host);

    resize();
    running = true; lastT = performance.now();
    mountAt = lastT; nextBubbleAt = lastT + 1800;
    rafId = requestAnimationFrame(loop);
  }

  function unmount() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId); rafId = 0;
    // multiplayer: stop polling + drop remote state (no leaks across mounts)
    if (MP.pollTimer) { clearInterval(MP.pollTimer); MP.pollTimer = 0; }
    MP.joined = false; MP.inFlight = false;
    MP.you = null; MP.others = {}; MP.chat = [];
    MP.panel = null; MP.msgList = null; MP.msgInput = null; MP.nameInput = null;
    MP.goBtn = null; MP.onlineChip = null;
    if (ro) { try { ro.disconnect(); } catch (_) {} ro = null; }
    if (io) { try { io.disconnect(); } catch (_) {} io = null; }
    if (canvas) {
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('touchstart', onClick);
    }
    if (host) { host.classList.remove('pxo-root'); host.innerHTML = ''; }
    canvas = null; ctx = null; hud = null; host = null; originX = 0; originY = 0;
    hoverTile = null; hoverDoor = null; toast.text = '';
  }

  // ---- HOOKS (documented placeholders — wired later by other terminals) -----
  function addCollectable(obj) {
    if (!obj || typeof obj.tileX !== 'number' || typeof obj.tileY !== 'number') return;
    collectables.push({ tileX: obj.tileX, tileY: obj.tileY, icon: obj.icon || '★' });
  }
  function onPay(cb) { if (typeof cb === 'function') payCallbacks.push(cb); }
  function _emitPay(payload) { payCallbacks.forEach(cb => { try { cb(payload); } catch (_) {} }); }

  window.PixelOffice = {
    __v: 7,
    mount, unmount,
    addCollectable, onPay,
    selectAgent,
    syncAgents: refreshRoster,      // dashboard calls this when forged operatives change
    _emitPay,                       // reserved for x402 wiring
  };
})();

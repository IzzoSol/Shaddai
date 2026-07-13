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
  if (window.PixelOffice && window.PixelOffice.__v === 3) return; // already loaded

  // ---- Brand + agent theming ------------------------------------------------
  const AGENTS = [
    { name: 'SHADDAI', color: '#f0b429', tile: [8, 3],  role: 'Orchestrator' },
    { name: 'ZEROX',   color: '#00e5ff', tile: [3, 6],  role: 'Revenue' },
    { name: 'ORACLE',  color: '#a78bfa', tile: [12, 6], role: 'Research' },
    { name: 'NEXUS',   color: '#00f0ff', tile: [3, 10], role: 'Architect' },
    { name: 'TURTLE',  color: '#00ff88', tile: [12, 10],role: 'Design' },
    { name: 'QUILL',   color: '#fb923c', tile: [6, 13], role: 'Writing' },
    { name: 'PIKADON', color: '#f43f5e', tile: [9, 13], role: 'Security' },
  ];

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
  const GRID_W = 16, GRID_H = 16;   // logical tile grid
  const TILE_W = 56, TILE_H = 28;   // 2:1 iso diamond footprint (base; scaled to fit)

  // ---------------------------------------------------------------------------
  // ROOM LAYOUT DATA
  //   0 floor(lobby)  1 wall  2 breakroom  3 boss(rug)  4 boardroom
  //   5 agentdesk     6 grass  7 water      8 shelf(collectables)  9 elevator
  // ---------------------------------------------------------------------------
  const F = 0, W = 1, B = 2, O = 3, D = 4, A = 5, G = 6, T = 7, S = 8, E = 9;
  const LAYOUT = [
    [W,W,W,W,W,W,W,O,O,W,W,W,W,W,W,W],
    [W,E,F,F,F,F,W,O,O,W,F,F,F,F,S,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,S,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,B,B,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,B,B,F,F,A,F,F,F,F,A,F,F,F,F,W],
    [W,B,B,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,D,D,D,D,D,D,D,D,F,F,F,W],
    [W,F,F,F,D,D,D,D,D,D,D,D,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
    [W,F,F,F,F,A,F,F,F,F,A,F,F,F,F,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,F,G,G,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,G,G,G,W],
    [W,F,F,F,F,F,A,F,F,A,F,F,G,T,G,W],
    [W,F,F,F,F,F,F,F,F,F,F,F,G,G,G,W],
    [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  ];
  const isWall = (c, r) =>
    r < 0 || c < 0 || r >= GRID_H || c >= GRID_W || LAYOUT[r][c] === W;

  // Labelled zones (drawn as floating tags in iso space) ----------------------
  const ZONES = [
    { label: 'RECEPTION',    at: [4, 2],  color: '#ffd700' },
    { label: 'BOSS OFFICE',  at: [8, 5],  color: '#f0b429' },
    { label: 'BOARDROOM',    at: [8, 7.5],color: '#00e5ff' },
    { label: 'BREAK ROOM',   at: [1.5,5], color: '#00ff88' },
    { label: 'COLLECTABLES', at: [14, 1.5],color: '#a78bfa' },
    { label: 'WORLD',        at: [13, 12], color: '#00ff88' },
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
  let lastT = 0, hoverTile = null;
  let mountAt = 0;                              // for the staggered intro reveal
  let nextBubbleAt = 0;                         // scheduler for idle chatter

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

  // ---- Fit camera so the whole diamond grid is centered in the host ---------
  function fitCamera() {
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const gridW = (GRID_W + GRID_H) * TILE_W / 2;
    const gridH = (GRID_W + GRID_H) * TILE_H / 2;
    scale = Math.min((w * 0.92) / gridW, (h * 0.86) / gridH);
    scale = Math.max(0.35, Math.min(scale, 1.6));
    camTargetX = w / 2 - ((GRID_W - GRID_H) * (TILE_W * scale) / 4);
    camTargetY = h / 2 - ((GRID_W + GRID_H) * (TILE_H * scale) / 4) + 10;
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
    AGENTS.forEach((a, i) => { sprites[a.name] = makeSprite(a, i); });
  }
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
    const pool = LINES[sp.name];
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
      const light = (col + row) % 2 === 0;               // beige checker lobby
      // soft per-tile variation so the checker never reads flat
      const v = (((col * 7 + row * 13) % 5) - 2) * 3;
      top = light ? shade('#d9c9a3', v / 255) : shade('#c9b892', v / 255);
      side = light ? '#b3a074' : '#a08c60';
      edge = 'rgba(0,0,0,0.10)';
    }

    // water gets a gentle animated shimmer band
    if (kind === T) {
      const grad = ctx.createLinearGradient(p.x, p.y - hh, p.x, p.y + hh);
      const sh = (Math.sin(now / 700 + col * 0.9 + row * 0.7) + 1) / 2;
      grad.addColorStop(0, shade('#0e3540', 0.05 + sh * 0.10));
      grad.addColorStop(1, '#0a2530');
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

  // ---- Draw an agent sprite (blocky iso character w/ life) ------------------
  function drawAgent(sp, now, intro) {
    const p = isoToScreen(sp.col, sp.row);
    const s = scale;
    const walking = !!sp.path;
    // breathing bob (bigger while walking)
    const bob = (Math.sin(sp.bob) * (walking ? 2.4 : 1.2) + Math.sin(sp.breath) * 0.6) * s;
    const isSel = sp.name === selected;

    ctx.save();
    ctx.globalAlpha = intro;

    // colored ground-glow in the agent's color
    ctx.save();
    ctx.shadowColor = sp.color; ctx.shadowBlur = 14;
    ctx.fillStyle = sp.color + '22';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 13 * s, 6.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // soft contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 1.5 * s, 11 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();

    // pulsing selection ring
    if (isSel) {
      const pulse = 1 + (Math.sin(now / 260) + 1) / 2 * 0.25;
      ctx.save();
      ctx.strokeStyle = sp.color; ctx.lineWidth = 2 * s;
      ctx.shadowColor = sp.color; ctx.shadowBlur = 14;
      ctx.globalAlpha = intro * (0.65 + (Math.sin(now / 260) + 1) / 2 * 0.35);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 15 * s * pulse, 8 * s * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    const bx = p.x, by = p.y - bob;
    const fdir = sp.face; // +1 right, -1 left

    // legs (tiny stride when walking)
    const stride = walking ? Math.sin(sp.bob * 2) * 2.5 * s : 0;
    ctx.fillStyle = shade(sp.color, -0.35);
    ctx.fillRect(bx - 6 * s, by - 6 * s, 4 * s, 6 * s + Math.max(0, stride));
    ctx.fillRect(bx + 2 * s, by - 6 * s, 4 * s, 6 * s + Math.max(0, -stride));

    // body (colored torso block) w/ shaded half
    ctx.fillStyle = sp.color;
    ctx.fillRect(bx - 7 * s, by - 24 * s, 14 * s, 20 * s);
    ctx.fillStyle = shade(sp.color, -0.18);
    ctx.fillRect(fdir > 0 ? bx : bx - 7 * s, by - 24 * s, 7 * s, 20 * s);  // shaded trailing half
    // subtle rim light on the leading edge
    ctx.fillStyle = shade(sp.color, 0.22);
    ctx.fillRect(fdir > 0 ? bx - 7 * s : bx + 5 * s, by - 24 * s, 2 * s, 20 * s);

    // head
    ctx.fillStyle = '#f2e4cf';
    ctx.fillRect(bx - 5 * s, by - 36 * s, 10 * s, 12 * s);
    ctx.fillStyle = shade('#f2e4cf', -0.12);
    ctx.fillRect(fdir > 0 ? bx : bx - 5 * s, by - 36 * s, 5 * s, 12 * s);

    // visor accent (blinks: thins to a line briefly)
    const blinking = now < sp.blinkUntil;
    ctx.fillStyle = sp.color;
    if (blinking) {
      ctx.fillRect(bx - 5 * s, by - 30.5 * s, 10 * s, 1.2 * s);
    } else {
      ctx.fillRect(bx - 5 * s, by - 32 * s, 10 * s, 3 * s);
      // eye-glint on the facing side
      ctx.save(); ctx.shadowColor = sp.color; ctx.shadowBlur = 6;
      ctx.fillStyle = shade(sp.color, 0.4);
      ctx.fillRect(fdir > 0 ? bx + 1.5 * s : bx - 3.5 * s, by - 31.4 * s, 2 * s, 1.6 * s);
      ctx.restore();
    }

    // name label + status dot
    ctx.font = `${Math.max(8, 9 * s) | 0}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';
    const label = sp.name;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(bx - tw / 2 - 8, by - 53 * s, tw + 18, 14, 4); ctx.fill();
    ctx.strokeStyle = sp.color + '55'; ctx.lineWidth = 1; ctx.stroke();
    // pulsing status dot
    const dotA = 0.55 + (Math.sin(now / 420 + sp.idx) + 1) / 2 * 0.45;
    ctx.save(); ctx.globalAlpha = intro * dotA;
    ctx.fillStyle = sp.color;
    ctx.beginPath(); ctx.arc(bx - tw / 2 - 2, by - 53 * s + 7, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#e8f0ee';
    ctx.fillText(label, bx + 4, by - 53 * s + 11);
    ctx.textAlign = 'left';

    ctx.restore();

    // speech bubble (drawn last so it floats above)
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

    // ---- PROPS (depth-sorted roughly by row) ----
    drawStatue(4, 2, now);                                    // reception centerpiece
    drawBox(1, 1, 0.8, 26, '#3a3f4a', '#22262e', 'rgba(0,229,255,0.4)'); // elevator
    // Break room: couches + coffee table w/ steam
    drawCouch(1, 4); drawCouch(2, 5);
    drawCoffee(1, 5, now);
    drawPlant(2, 4);
    // Boss office: rug emblem + big desk + throne
    drawEmblem(8, 4, now);
    drawBox(8, 5, 1.1, 12, '#5a4a1c', '#3a300f', 'rgba(240,180,41,0.35)'); // big desk
    drawBox(8, 4, 0.7, 16, '#6a5620', '#463913');            // throne
    // Boardroom: long table + chairs + screen
    drawBox(6, 7.5, 1.6, 9, '#20404c', '#132a33');
    drawBox(9, 7.5, 1.6, 9, '#20404c', '#132a33');
    drawScreen(6, 6.4, now);
    // Collectables shelf
    drawBox(14, 1.5, 0.7, 18, '#3a2c52', '#241a33', 'rgba(167,139,250,0.4)');
    // Plants dotted around
    drawPlant(13, 2); drawPlant(3, 9); drawPlant(11, 11); drawPlant(6, 3);
    // World-replica outdoor patch (bottom-right grass/water)
    drawTree(13, 13); drawTree(14, 12);

    // Agent desks: colored nameplates on desk tiles
    AGENTS.forEach(a => {
      const [c, r] = a.tile;
      drawBox(c, r, 0.7, 7, shade(a.color, -0.35), shade(a.color, -0.5));
      const p = isoToScreen(c, r);
      ctx.save();
      ctx.shadowColor = a.color; ctx.shadowBlur = 6;
      ctx.fillStyle = a.color;
      ctx.fillRect(p.x - 9 * scale, p.y - (7 + 3) * scale, 18 * scale, 3 * scale);
      ctx.restore();
    });

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

    // zone labels (floating tags)
    ZONES.forEach(z => {
      const p = isoToScreen(z.at[0], z.at[1]);
      ctx.font = "8px 'Share Tech Mono', monospace"; ctx.textAlign = 'center';
      const tw = ctx.measureText(z.label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(p.x - tw / 2 - 6, p.y - 7, tw + 12, 13, 3); ctx.fill();
      ctx.strokeStyle = z.color + '77'; ctx.lineWidth = 1;
      roundRect(p.x - tw / 2 - 6, p.y - 7, tw + 12, 13, 3); ctx.stroke();
      ctx.fillStyle = z.color; ctx.fillText(z.label, p.x, p.y + 2.5);
      ctx.textAlign = 'left';
    });

    ctx.restore(); // rooms alpha

    // agents, depth-sorted (draw farther/back first), with per-agent staggered fade-in
    Object.values(sprites)
      .sort((a, b) => (a.col + a.row) - (b.col + b.row))
      .forEach(sp => {
        const introStart = 380 + sp.idx * 70;
        const intro = Math.max(0, Math.min(1, (t0 - introStart) / 320));
        if (intro <= 0) return;
        drawAgent(sp, now, intro);
      });

    // ---- HUD CHROME overlay: vignette + scanlines + corner brackets ----
    drawChrome(w, h, now);
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
    canvas.style.cursor = agentAt(p.x, p.y) ? 'pointer' : 'default';
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
    // else: walk the selected agent to the clicked tile
    const iso = screenToIso(p.x, p.y);
    const c = Math.round(iso.col), r = Math.round(iso.row);
    const sp = sprites[selected];
    if (sp && !isWall(c, r)) walkTo(sp, c, r);
  }

  // ---- HUD ------------------------------------------------------------------
  function buildHud() {
    hud = document.createElement('div');
    hud.className = 'pxo-hud';
    hud.innerHTML =
      '<div class="pxo-chips"></div>' +
      '<div class="pxo-tools">' +
        '<button class="pxo-btn" data-act="recenter">◎ RECENTER</button>' +
      '</div>' +
      '<div class="pxo-legend">' +
        '<span class="pxo-lg"><i style="background:#00ff88"></i>tile → walk</span>' +
        '<span class="pxo-lg"><i style="background:#00e5ff"></i>agent → chat</span>' +
      '</div>';
    const chips = hud.querySelector('.pxo-chips');
    AGENTS.forEach(a => {
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
    host.appendChild(hud);
    refreshChips();
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
    .pxo-root{position:relative;width:100%;height:100%;min-height:340px;display:flex;flex-direction:column;
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
    `;
    document.head.appendChild(st);
  }

  // ---- SIZING ---------------------------------------------------------------
  function resize() {
    if (!canvas || !host) return;
    const rect = canvas.getBoundingClientRect();
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
    buildHud();
    resetSprites();

    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchstart', onClick, { passive: true });

    ro = new ResizeObserver(resize); ro.observe(host);
    io = new IntersectionObserver(es => {
      visible = es[0] && es[0].isIntersecting;
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
    if (ro) { try { ro.disconnect(); } catch (_) {} ro = null; }
    if (io) { try { io.disconnect(); } catch (_) {} io = null; }
    if (canvas) {
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('touchstart', onClick);
    }
    if (host) { host.classList.remove('pxo-root'); host.innerHTML = ''; }
    canvas = null; ctx = null; hud = null; host = null; originX = 0; originY = 0;
  }

  // ---- HOOKS (documented placeholders — wired later by other terminals) -----
  function addCollectable(obj) {
    if (!obj || typeof obj.tileX !== 'number' || typeof obj.tileY !== 'number') return;
    collectables.push({ tileX: obj.tileX, tileY: obj.tileY, icon: obj.icon || '★' });
  }
  function onPay(cb) { if (typeof cb === 'function') payCallbacks.push(cb); }
  function _emitPay(payload) { payCallbacks.forEach(cb => { try { cb(payload); } catch (_) {} }); }

  window.PixelOffice = {
    __v: 3,
    mount, unmount,
    addCollectable, onPay,
    selectAgent,
    _emitPay,                       // reserved for x402 wiring
  };
})();

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
  if (window.PixelOffice && window.PixelOffice.__v === 5) return; // already loaded

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
    { id: 'market', label: 'MARKET', soon: true, color: '#7ee787',
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
    scale = Math.max(0.18, Math.min(scale, 1.8));

    // center the scaled box in the host, then solve origin so the box's
    // min-corner lands at the centered top-left.
    const boxW = cw * scale, boxH = ch * scale;
    const boxLeft = (w - boxW) / 2;
    const boxTop = (h - boxH) / 2;
    // origin maps unscaled (0,0); box min corner sits at origin + min*scale.
    camTargetX = boxLeft - minSX * scale;
    camTargetY = boxTop - minSY * scale;
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
    // pulsing SOON tag
    const blink = 0.45 + (Math.sin(now / 600 + b.center[0]) + 1) / 2 * 0.55;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.font = "7px 'Share Tech Mono', monospace"; ctx.textAlign = 'center';
    const tw = ctx.measureText('SOON').width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(p.x - tw / 2 - 5, p.y - 34 * s, tw + 10, 11, 3); ctx.fill();
    ctx.strokeStyle = b.color; ctx.lineWidth = 1;
    roundRect(p.x - tw / 2 - 5, p.y - 34 * s, tw + 10, 11, 3); ctx.stroke();
    ctx.fillStyle = b.color; ctx.fillText('SOON', p.x, p.y - 34 * s + 8);
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
    drawStatue(3, 2, now);                                    // reception centerpiece
    drawBox(1, 1, 0.8, 26, '#3a3f4a', '#22262e', 'rgba(0,229,255,0.4)'); // elevator
    drawBox(1, 2, 0.8, 26, '#3a3f4a', '#22262e', 'rgba(0,229,255,0.4)');
    // Break room: couches + coffee table w/ steam
    drawCouch(2, 5); drawCouch(3, 6);
    drawCoffee(2, 6, now);
    drawPlant(3, 5);
    // Boss office: rug emblem + big desk + throne (top gold rug)
    drawEmblem(10.5, 1.4, now);
    drawBox(10.5, 2.2, 1.1, 12, '#5a4a1c', '#3a300f', 'rgba(240,180,41,0.35)'); // big desk
    drawBox(10.5, 1.4, 0.7, 16, '#6a5620', '#463913');       // throne
    // Boardroom: long table + chairs + screen (center cyan)
    drawBox(9, 8.5, 1.8, 9, '#20404c', '#132a33');
    drawBox(12.5, 8.5, 1.8, 9, '#20404c', '#132a33');
    drawScreen(10.5, 7.2, now);
    // Collectables shelf (top-right)
    drawBox(19.5, 1.5, 0.7, 18, '#3a2c52', '#241a33', 'rgba(167,139,250,0.4)');

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

    // ---- COMING-SOON city footprints (bank / market / docks) ----
    BUILDINGS.forEach(b => { if (b.soon) drawSoonFootprint(b, now); });
    // docks water accent beside the docks planks
    drawTree(4, 18);

    // Plants dotted around the roomier floor
    drawPlant(6, 4); drawPlant(15, 4); drawPlant(6, 12); drawPlant(15, 11); drawPlant(9, 14);

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
    canvas.style.cursor = (agentAt(p.x, p.y) || overBuilding || hoverDoor) ? 'pointer' : 'default';
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
    const iso = screenToIso(p.x, p.y);
    // REAL nav doors take priority — open the matching Office sub-tab
    const nd = doorAtIso(iso.col, iso.row);
    if (nd) { enterNavDoor(nd); return; }
    const c = Math.round(iso.col), r = Math.round(iso.row);
    // building click (forge routes to dashboard; soon-tiles show a toast)
    const b = buildingAtTile(c, r);
    if (b) { enterBuilding(b); return; }
    // else: walk the selected agent to the clicked tile
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
        '<span class="pxo-lg"><i style="background:#a78bfa"></i>door → open</span>' +
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
    initEmbers();

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
    __v: 5,
    mount, unmount,
    addCollectable, onPay,
    selectAgent,
    _emitPay,                       // reserved for x402 wiring
  };
})();

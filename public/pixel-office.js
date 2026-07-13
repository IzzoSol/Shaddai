/* ============================================================================
 * SHADDAI PIXEL OFFICE  —  by TURTLE (design + game lead)
 * ----------------------------------------------------------------------------
 * A fast, self-contained, isometric 2.5D office MMO stand-in for the heavy 3D
 * world. Pure Canvas 2D. Zero external libraries. Loads instantly.
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
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.PixelOffice && window.PixelOffice.__v === 2) return; // already loaded

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

  // ---- Grid / iso constants -------------------------------------------------
  const GRID_W = 16, GRID_H = 16;   // logical tile grid
  const TILE_W = 56, TILE_H = 28;   // 2:1 iso diamond footprint (base; scaled to fit)

  // ---------------------------------------------------------------------------
  // ROOM LAYOUT DATA
  // Tile "kinds" painted onto the floor. Walls block movement + pathing.
  //   0 floor(lobby)  1 wall  2 breakroom  3 boss(rug)  4 boardroom
  //   5 agentdesk     6 grass  7 water      8 shelf(collectables)  9 elevator
  // The layout reads clearly from the iso camera: lobby+statue center-top,
  // boss office top, boardroom mid, agent desks flanking, break room left,
  // collectables shelf right, and an outdoor world-replica patch bottom-right.
  // ---------------------------------------------------------------------------
  const F = 0, W = 1, B = 2, O = 3, D = 4, A = 5, G = 6, T = 7, S = 8, E = 9;
  const LAYOUT = [
    // row 0..15  (each row = 16 cols)
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
    { label: "BOSS OFFICE",  at: [8, 5],  color: '#f0b429' },
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

  // ---- ISO MATH -------------------------------------------------------------
  function isoToScreen(col, row) {
    return {
      x: originX + (col - row) * (TILE_W * scale) / 2,
      y: originY + (col + row) * (TILE_H * scale) / 2,
    };
  }
  // Inverse projection: screen px -> fractional tile (for click hit-testing).
  function screenToIso(px, py) {
    const dx = (px - originX) / ((TILE_W * scale) / 2);
    const dy = (py - originY) / ((TILE_H * scale) / 2);
    return { col: (dx + dy) / 2, row: (dy - dx) / 2 };
  }

  // ---- Fit camera so the whole diamond grid is centered in the host ---------
  function fitCamera() {
    const w = canvas.width / dpr, h = canvas.height / dpr;
    // grid bounding diamond spans width = (GRID_W+GRID_H)*TILE_W/2
    const gridW = (GRID_W + GRID_H) * TILE_W / 2;
    const gridH = (GRID_W + GRID_H) * TILE_H / 2;
    scale = Math.min((w * 0.92) / gridW, (h * 0.86) / gridH);
    scale = Math.max(0.35, Math.min(scale, 1.6));
    // center: put grid midpoint at host center, nudge down a touch for HUD
    const midX = (0 - (GRID_H - 1)) * (TILE_W * scale) / 2;        // col0,row range
    camTargetX = w / 2 - ((GRID_W - GRID_H) * (TILE_W * scale) / 4);
    camTargetY = h / 2 - ((GRID_W + GRID_H) * (TILE_H * scale) / 4) + 10;
    if (!originX && !originY) { originX = camTargetX; originY = camTargetY; }
  }

  // ---- PATHING: greedy BFS on the walkable grid (small, avoids walls) --------
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
  function makeSprite(a) {
    return {
      name: a.name, color: a.color, role: a.role,
      col: a.tile[0], row: a.tile[1],   // logical position (fractional while moving)
      path: null, pathI: 0,
      bob: Math.random() * Math.PI * 2, // idle bob phase
      wanderAt: performance.now() + 2000 + Math.random() * 4000,
    };
  }
  function resetSprites() {
    sprites = {};
    AGENTS.forEach(a => { sprites[a.name] = makeSprite(a); });
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

  // ---- UPDATE ---------------------------------------------------------------
  function update(dt, now) {
    for (const name in sprites) {
      const sp = sprites[name];
      sp.bob += dt * 3;
      // follow path (lerp toward next tile)
      if (sp.path && sp.pathI < sp.path.length) {
        const tgt = sp.path[sp.pathI];
        const spd = dt * 3.2;
        sp.col += Math.sign(tgt.c - sp.col) * Math.min(spd, Math.abs(tgt.c - sp.col));
        sp.row += Math.sign(tgt.r - sp.row) * Math.min(spd, Math.abs(tgt.r - sp.row));
        if (Math.abs(tgt.c - sp.col) < 0.02 && Math.abs(tgt.r - sp.row) < 0.02) {
          sp.col = tgt.c; sp.row = tgt.r; sp.pathI++;
          if (sp.pathI >= sp.path.length) sp.path = null;
        }
      } else if (name !== selected && now > sp.wanderAt) {
        // idle wander for the "alive" feel
        const [c, r] = randomWalkTile(); walkTo(sp, c, r);
        sp.wanderAt = now + 4000 + Math.random() * 6000;
      }
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
  function drawTile(col, row, kind) {
    const p = isoToScreen(col, row);
    const hw = (TILE_W * scale) / 2, hh = (TILE_H * scale) / 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - hh);
    ctx.lineTo(p.x + hw, p.y);
    ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x - hw, p.y);
    ctx.closePath();
    let top, side;
    const c = tileColors(kind);
    if (c) { top = c[0]; side = c[1]; }
    else {
      const light = (col + row) % 2 === 0;               // beige checker lobby
      top = light ? '#d9c9a3' : '#c9b892';
      side = light ? '#b3a074' : '#a08c60';
    }
    ctx.fillStyle = top; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1; ctx.stroke();

    // wall extrusion (blocky 2.5D height)
    if (kind === W) {
      const h = 22 * scale;
      ctx.fillStyle = '#0b111a';
      ctx.beginPath();
      ctx.moveTo(p.x - hw, p.y); ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#141c28';
      ctx.beginPath();
      ctx.moveTo(p.x + hw, p.y); ctx.lineTo(p.x, p.y + hh);
      ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x + hw, p.y - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1c2636';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - hh - h); ctx.lineTo(p.x + hw, p.y - h);
      ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
    }
  }

  // simple iso "box" prop (furniture) at tile with height + top color
  function drawBox(col, row, wTiles, hgt, topCol, sideCol) {
    const p = isoToScreen(col, row);
    const hw = (TILE_W * scale) / 2 * wTiles, hh = (TILE_H * scale) / 2 * wTiles;
    const h = hgt * scale;
    ctx.fillStyle = sideCol;
    ctx.beginPath(); ctx.moveTo(p.x - hw, p.y); ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(sideCol, -0.15);
    ctx.beginPath(); ctx.moveTo(p.x + hw, p.y); ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x + hw, p.y - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = topCol;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - hh - h); ctx.lineTo(p.x + hw, p.y - h);
    ctx.lineTo(p.x, p.y + hh - h); ctx.lineTo(p.x - hw, p.y - h); ctx.closePath(); ctx.fill();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt * 255 | 0));
    g = Math.max(0, Math.min(255, g + amt * 255 | 0));
    b = Math.max(0, Math.min(255, b + amt * 255 | 0));
    return `rgb(${r},${g},${b})`;
  }

  function drawPlant(col, row) {
    const p = isoToScreen(col, row);
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(p.x - 4 * scale, p.y - 6 * scale, 8 * scale, 8 * scale);
    ctx.fillStyle = '#1f7a3a';
    ctx.beginPath(); ctx.arc(p.x, p.y - 14 * scale, 9 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2aa04d';
    ctx.beginPath(); ctx.arc(p.x - 4 * scale, p.y - 18 * scale, 6 * scale, 0, Math.PI * 2); ctx.fill();
  }
  function drawTree(col, row) {
    const p = isoToScreen(col, row);
    ctx.fillStyle = '#4a3320';
    ctx.fillRect(p.x - 3 * scale, p.y - 20 * scale, 6 * scale, 22 * scale);
    ctx.fillStyle = '#1e6b34';
    ctx.beginPath(); ctx.arc(p.x, p.y - 30 * scale, 15 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b8a45';
    ctx.beginPath(); ctx.arc(p.x - 7 * scale, p.y - 36 * scale, 10 * scale, 0, Math.PI * 2); ctx.fill();
  }
  function drawStatue(col, row) {
    // gold reception centerpiece
    const p = isoToScreen(col, row);
    drawBox(col, row, 0.6, 8, '#3a2f14', '#241d0c');       // base
    const t = performance.now() / 1000;
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

  // ---- Draw an agent sprite (blocky iso character) --------------------------
  function drawAgent(sp) {
    const p = isoToScreen(sp.col, sp.row);
    const s = scale;
    const bob = Math.sin(sp.bob) * 2 * s;
    // soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 12 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    // selection ring
    if (sp.name === selected) {
      ctx.strokeStyle = sp.color; ctx.lineWidth = 2 * s;
      ctx.shadowColor = sp.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 15 * s, 8 * s, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const bx = p.x, by = p.y - bob;
    // body (colored torso block)
    ctx.fillStyle = sp.color;
    ctx.fillRect(bx - 7 * s, by - 24 * s, 14 * s, 20 * s);
    ctx.fillStyle = shade(sp.color, -0.18);
    ctx.fillRect(bx, by - 24 * s, 7 * s, 20 * s);                 // shaded half
    // head
    ctx.fillStyle = '#f2e4cf';
    ctx.fillRect(bx - 5 * s, by - 36 * s, 10 * s, 12 * s);
    ctx.fillStyle = shade('#f2e4cf', -0.12);
    ctx.fillRect(bx, by - 36 * s, 5 * s, 12 * s);
    // visor accent
    ctx.fillStyle = sp.color;
    ctx.fillRect(bx - 5 * s, by - 32 * s, 10 * s, 3 * s);
    // name label + status dot
    ctx.font = `${Math.max(8, 9 * s) | 0}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';
    const label = sp.name;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - tw / 2 - 6, by - 52 * s, tw + 16, 13);
    ctx.fillStyle = sp.color;
    ctx.beginPath(); ctx.arc(bx - tw / 2 - 1, by - 52 * s + 6.5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8f0ee';
    ctx.fillText(label, bx + 4, by - 52 * s + 10);
    ctx.textAlign = 'left';
  }

  // ---- MAIN RENDER ----------------------------------------------------------
  function render() {
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // backdrop gradient (dark brand)
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0f16'); g.addColorStop(1, '#05080c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // floor + walls, painted back-to-front (row+col order = iso depth)
    for (let r = 0; r < GRID_H; r++)
      for (let c = 0; c < GRID_W; c++)
        drawTile(c, r, LAYOUT[r][c]);

    // hover highlight
    if (hoverTile && !isWall(hoverTile.c, hoverTile.r)) {
      const p = isoToScreen(hoverTile.c, hoverTile.r);
      const hw = (TILE_W * scale) / 2, hh = (TILE_H * scale) / 2;
      ctx.strokeStyle = 'rgba(0,255,136,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - hh); ctx.lineTo(p.x + hw, p.y);
      ctx.lineTo(p.x, p.y + hh); ctx.lineTo(p.x - hw, p.y); ctx.closePath(); ctx.stroke();
    }

    // ---- PROPS (depth-sorted roughly by row) ----
    // Reception statue centerpiece
    drawStatue(4, 2);
    // Elevator prop
    drawBox(1, 1, 0.8, 26, '#3a3f4a', '#22262e');
    // Break room: couches + coffee table + coffee
    drawBox(1, 4, 0.8, 8, '#1f5c46', '#123b2c');
    drawBox(2, 5, 0.8, 8, '#1f5c46', '#123b2c');
    drawBox(1, 5, 0.5, 5, '#2a3138', '#1a2026');
    // Boss office: big desk + throne + plant
    drawBox(8, 5, 1.1, 12, '#5a4a1c', '#3a300f');            // big desk
    drawBox(8, 4, 0.7, 16, '#6a5620', '#463913');            // throne
    // Boardroom: long table + chairs
    drawBox(6, 7.5, 1.6, 9, '#20404c', '#132a33');
    drawBox(9, 7.5, 1.6, 9, '#20404c', '#132a33');
    // Collectables shelf
    drawBox(14, 1.5, 0.7, 18, '#3a2c52', '#241a33');
    // Plants dotted around
    drawPlant(13, 2); drawPlant(3, 9); drawPlant(11, 11); drawPlant(6, 3);
    // ---- World-replica outdoor patch (bottom-right grass/water) ----
    drawTree(13, 13); drawTree(14, 12);

    // Agent desks: colored nameplates on desk tiles
    AGENTS.forEach(a => {
      const [c, r] = a.tile;
      drawBox(c, r, 0.7, 7, shade(a.color, -0.35), shade(a.color, -0.5));
      const p = isoToScreen(c, r);
      ctx.fillStyle = a.color;
      ctx.fillRect(p.x - 9 * scale, p.y - (7 + 3) * scale, 18 * scale, 3 * scale);
    });

    // collectables (hook-fed)
    collectables.forEach(cl => {
      const p = isoToScreen(cl.tileX, cl.tileY);
      const t = performance.now() / 400;
      ctx.font = `${16 * scale | 0}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(cl.icon || '★', p.x, p.y - 14 * scale + Math.sin(t) * 3);
      ctx.textAlign = 'left';
    });

    // zone labels (floating tags)
    ZONES.forEach(z => {
      const p = isoToScreen(z.at[0], z.at[1]);
      ctx.font = "8px 'Share Tech Mono', monospace"; ctx.textAlign = 'center';
      const tw = ctx.measureText(z.label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - tw / 2 - 5, p.y - 7, tw + 10, 12);
      ctx.strokeStyle = z.color + '66'; ctx.lineWidth = 1;
      ctx.strokeRect(p.x - tw / 2 - 5, p.y - 7, tw + 10, 12);
      ctx.fillStyle = z.color; ctx.fillText(z.label, p.x, p.y + 2);
      ctx.textAlign = 'left';
    });

    // agents, depth-sorted (draw farther/back first)
    Object.values(sprites)
      .sort((a, b) => (a.col + a.row) - (b.col + b.row))
      .forEach(drawAgent);
  }

  // ---- rAF LOOP -------------------------------------------------------------
  function loop(t) {
    if (!running) return;
    if (!visible) { rafId = requestAnimationFrame(loop); lastT = t; return; }
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
    try { update(dt, t); render(); } catch (_) { /* never throw out of rAF */ }
    rafId = requestAnimationFrame(loop);
  }

  // ---- INPUT / HIT-TESTING --------------------------------------------------
  function localPt(ev) {
    const rect = canvas.getBoundingClientRect();
    const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    return { x: cx, y: cy };
  }
  // Agent hit-test: nearest sprite whose screen box contains the point.
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
      '<div class="pxo-legend">Click a tile → selected agent walks · Click an agent → open chat</div>';
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
      background:#05080c;border:1px solid rgba(0,255,136,.14);border-radius:10px;overflow:hidden;
      font-family:'Rajdhani','Share Tech Mono',monospace}
    .pxo-root canvas{flex:1;display:block;width:100%;height:100%;touch-action:none}
    .pxo-hud{position:absolute;left:0;right:0;bottom:0;padding:8px 10px;display:flex;gap:10px;align-items:center;
      flex-wrap:wrap;background:linear-gradient(0deg,rgba(5,8,12,.92),rgba(5,8,12,0));pointer-events:none}
    .pxo-hud>*{pointer-events:auto}
    .pxo-chips{display:flex;gap:5px;flex-wrap:wrap}
    .pxo-chip{--ac:#00ff88;display:flex;align-items:center;gap:5px;font-size:9px;letter-spacing:1px;
      font-family:'Share Tech Mono',monospace;padding:4px 9px;border-radius:20px;cursor:pointer;
      color:#9fb0c4;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);transition:all .14s}
    .pxo-chip .dot{width:7px;height:7px;border-radius:50%;background:var(--ac);box-shadow:0 0 6px var(--ac)}
    .pxo-chip:hover{border-color:var(--ac);color:#e8f0ee}
    .pxo-chip.active{color:#04120c;background:var(--ac);border-color:var(--ac);font-weight:700;box-shadow:0 0 12px var(--ac)}
    .pxo-tools{display:flex;gap:6px}
    .pxo-btn{font-size:9px;letter-spacing:1.5px;font-family:'Share Tech Mono',monospace;padding:5px 11px;border-radius:5px;
      cursor:pointer;color:#00ff88;background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.35);transition:all .14s}
    .pxo-btn:hover{background:#00ff88;color:#04120c;box-shadow:0 0 12px rgba(0,255,136,.5)}
    .pxo-legend{margin-left:auto;font-size:8px;letter-spacing:1px;color:rgba(0,229,255,.5);
      font-family:'Share Tech Mono',monospace}
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

    // resize observer (responsive to panel)
    ro = new ResizeObserver(resize); ro.observe(host);
    // pause loop when host not visible (perf)
    io = new IntersectionObserver(es => {
      visible = es[0] && es[0].isIntersecting;
    }, { threshold: 0.01 });
    io.observe(host);

    resize();
    running = true; lastT = performance.now();
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
  // COLLECTABLES: drop an icon on a tile; renders on the floor + shelf zone.
  function addCollectable(obj) {
    if (!obj || typeof obj.tileX !== 'number' || typeof obj.tileY !== 'number') return;
    collectables.push({ tileX: obj.tileX, tileY: obj.tileY, icon: obj.icon || '★' });
  }
  // X402: register a payment-gated callback. A gated room/item can later call
  // these when a `data-x402` element is activated. cb receives {sku, tile}.
  function onPay(cb) { if (typeof cb === 'function') payCallbacks.push(cb); }
  // internal trigger for future gated interactions (not auto-called yet)
  function _emitPay(payload) { payCallbacks.forEach(cb => { try { cb(payload); } catch (_) {} }); }

  window.PixelOffice = {
    __v: 2,
    mount, unmount,
    addCollectable, onPay,
    selectAgent,
    _emitPay,                       // reserved for x402 wiring
  };
})();

/* ============================================================================
 * SHADDAI · world-siege.js — Full Siege Game Mechanics
 * Monthly cycle: buildings become capturable, garrison defenders spawn,
 * siege weapons can be placed, hold HQ for 3min to win.
 * ============================================================================*/
'use strict';

window.SiegeSystem = (function () {

  // ── Config ─────────────────────────────────────────────────────────────────
  const CFG = {
    CAPTURE_MS:     8000,    // ms standing in zone to capture
    GARRISON_COUNT: 3,       // NPCs spawned per captured building
    BUILDING_MAX_HP:200,
    HQ_HOLD_WIN_MS: 180000,  // 3 minutes
    WAVE_INTERVAL_MS:45000,  // raider wave every 45s
    CATAPULT_DMG:   35,
    RAM_DMG:        50,
    CATAPULT_RATE:  6000,    // ms between shots
    CAPTURE_RADIUS: 72,      // px (world-space)
    LOG_MAX:        20,
    SIEGE_CYCLE_MS: 28 * 24 * 3600 * 1000,
  };

  // ── State ──────────────────────────────────────────────────────────────────
  const S = {
    active:       false,
    nextMs:       0,
    buildingHP:   {},    // bldKey → {hp,maxHp,owner,captureProgress,capturingBy,name,kind}
    captureZones: [],    // [{bldKey,wx,wy,name}]  world-pixel coords
    garrison:     [],    // NPC defenders
    siegeWeapons: [],    // placed catapults/rams
    projectiles:  [],    // {x,y,vx,vy,dmg,target,age}
    log:          [],
    winner:       null,
    hqHoldMs:     0,
    hqBldKey:     null,
    waveTimer:    0,
    catTimers:    {},
    playerFaction:'player',
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function bldKey(b) { return b.col + ',' + b.row; }

  function log(msg, color) {
    S.log.unshift({ ts: Date.now(), msg, color: color || '#e8f5f0' });
    if (S.log.length > CFG.LOG_MAX) S.log.length = CFG.LOG_MAX;
    _renderLog();
  }

  function worldXY(b) {
    // Convert grid col/row to world pixel (matches TW=84, TH=42 iso)
    const TW = 84, TH = 42;
    const cx = (b.col - b.row) * TW / 2;
    const cy = (b.col + b.row) * TH / 2;
    return { x: cx + (b.w || 2) * TW / 2, y: cy };
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(props) {
    if (!props) return;
    S.buildingHP = {};
    S.captureZones = [];
    S.hqBldKey = null;

    props.forEach(function (b) {
      if (b.type !== 'building') return;
      const k = bldKey(b);
      S.buildingHP[k] = {
        hp: CFG.BUILDING_MAX_HP,
        maxHp: CFG.BUILDING_MAX_HP,
        owner: null,
        captureProgress: 0,
        capturingBy: null,
        name: b.name || 'Building',
        kind: b.kind || 'generic',
      };
      const wp = worldXY(b);
      S.captureZones.push({ bldKey: k, wx: wp.x, wy: wp.y, name: b.name || 'Building' });
      if (b.landmark === 'hq' || b.kind === 'hub') S.hqBldKey = k;
    });

    // Load saved siege state
    try {
      const saved = JSON.parse(localStorage.getItem('shaddai.siege') || 'null');
      if (saved) {
        S.nextMs = saved.next || Date.now() + CFG.SIEGE_CYCLE_MS;
        S.active = saved.active || false;
        if (saved.hp) Object.assign(S.buildingHP, saved.hp);
      } else {
        S.nextMs = Date.now() + CFG.SIEGE_CYCLE_MS;
      }
    } catch (_) {
      S.nextMs = Date.now() + CFG.SIEGE_CYCLE_MS;
    }
    _save();
    _updateSiegeHudTxt();
  }

  function _save() {
    try {
      localStorage.setItem('shaddai.siege', JSON.stringify({
        next: S.nextMs, active: S.active,
        hp: Object.fromEntries(Object.entries(S.buildingHP).map(([k, v]) => [k, { hp: v.hp, maxHp: v.maxHp, owner: v.owner }])),
      }));
    } catch (_) {}
  }

  // ── Open / Close Siege ────────────────────────────────────────────────────
  function openSiege() {
    S.active = true;
    S.hqHoldMs = 0;
    S.winner = null;
    S.waveTimer = 0;
    S.garrison = [];
    S.siegeWeapons = [];
    S.projectiles = [];
    log('⚔ SIEGE OPEN — Capture buildings to claim their yield!', '#ff6060');
    _spawnWave(5);
    _save();
    _updateSiegeHudTxt();
    toast('⚔ THE SIEGE HAS BEGUN — defend or attack!');
  }

  function endSiege(winner) {
    S.active = false;
    S.winner = winner;
    S.garrison = [];
    S.siegeWeapons = [];
    S.projectiles = [];
    S.nextMs = Date.now() + CFG.SIEGE_CYCLE_MS;
    log('◈ SIEGE ENDED — ' + (winner === 'player' ? 'VICTORY!' : 'Raiders won.'), winner === 'player' ? '#00ff9c' : '#ff6060');
    _save();
    _updateSiegeHudTxt();
    if (winner === 'player') toast('⚔ SIEGE WON — your buildings yield for the next cycle!');
    else toast('⚔ Siege ended — raiders hold the field.');
  }

  // ── Main update (call every frame with delta-time in ms) ──────────────────
  function update(dt, player, enemies, props, camCol, camRow) {
    if (!S.active) {
      // Countdown check
      if (Date.now() >= S.nextMs) openSiege();
      return;
    }

    // Wave timer
    S.waveTimer += dt;
    if (S.waveTimer >= CFG.WAVE_INTERVAL_MS) {
      S.waveTimer = 0;
      _spawnWave(3);
      log('⚠ Raider wave incoming!', '#ff8060');
    }

    // Capture zone check — player proximity
    if (player && !window.spectate) {
      const pw = _playerWorld(player);
      S.captureZones.forEach(function (zone) {
        const bld = S.buildingHP[zone.bldKey];
        if (!bld) return;
        const dx = pw.x - zone.wx, dy = pw.y - zone.wy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CFG.CAPTURE_RADIUS) {
          if (bld.owner !== S.playerFaction) {
            bld.captureProgress += dt;
            bld.capturingBy = S.playerFaction;
            if (bld.captureProgress >= CFG.CAPTURE_MS) {
              captureBuilding(zone.bldKey, S.playerFaction);
            }
          }
        } else {
          // Decay capture progress if not in zone
          if (bld.capturingBy === S.playerFaction) {
            bld.captureProgress = Math.max(0, bld.captureProgress - dt * 0.5);
            if (bld.captureProgress === 0) bld.capturingBy = null;
          }
        }
      });
    }

    // HQ hold timer
    if (S.hqBldKey && S.buildingHP[S.hqBldKey] && S.buildingHP[S.hqBldKey].owner === S.playerFaction) {
      S.hqHoldMs += dt;
      if (S.hqHoldMs >= CFG.HQ_HOLD_WIN_MS) endSiege('player');
    }

    // Garrison AI — simple patrol / attack
    _updateGarrison(dt, enemies || []);

    // Projectile movement
    _updateProjectiles(dt, enemies || []);

    // Catapult firing
    S.siegeWeapons.forEach(function (sw) {
      if (sw.type !== 'catapult') return;
      S.catTimers[sw.id] = (S.catTimers[sw.id] || 0) + dt;
      if (S.catTimers[sw.id] >= CFG.CATAPULT_RATE) {
        S.catTimers[sw.id] = 0;
        _fireCatapult(sw, enemies || []);
      }
    });
  }

  function _playerWorld(player) {
    const TW = 84, TH = 42;
    return {
      x: (player.col - player.row) * TW / 2,
      y: (player.col + player.row) * TH / 2,
    };
  }

  // ── Capture ───────────────────────────────────────────────────────────────
  function captureBuilding(key, faction) {
    const bld = S.buildingHP[key];
    if (!bld) return;
    const prevOwner = bld.owner;
    bld.owner = faction;
    bld.captureProgress = 0;
    bld.capturingBy = null;
    // Kill previous owner's garrison
    S.garrison = S.garrison.filter(function (g) { return g.bldKey !== key || g.faction === faction; });
    // Spawn new garrison
    _spawnGarrison(key, faction);
    log('◈ ' + bld.name + ' captured by ' + (faction === 'player' ? 'YOU' : faction) + '!', faction === 'player' ? '#00ff9c' : '#ff6060');
    _save();
    if (typeof toast === 'function') toast('◈ ' + bld.name + ' is yours!');
  }

  function damageBuilding(key, amount) {
    const bld = S.buildingHP[key];
    if (!bld) return;
    bld.hp = Math.max(0, bld.hp - amount);
    if (bld.hp <= 0) {
      bld.owner = null;
      S.garrison = S.garrison.filter(function (g) { return g.bldKey !== key; });
      log('💥 ' + bld.name + ' BREACHED!', '#ff4040');
    }
    _save();
  }

  // ── Garrison ──────────────────────────────────────────────────────────────
  function _spawnGarrison(bldKey, faction) {
    const zone = S.captureZones.find(function (z) { return z.bldKey === bldKey; });
    if (!zone) return;
    const TW = 84, TH = 42;
    // Convert world pixel back to grid approx
    for (let i = 0; i < CFG.GARRISON_COUNT; i++) {
      const angle = (i / CFG.GARRISON_COUNT) * Math.PI * 2;
      S.garrison.push({
        id: 'g_' + bldKey + '_' + i + '_' + Date.now(),
        bldKey,
        faction,
        wx: zone.wx + Math.cos(angle) * 60,
        wy: zone.wy + Math.sin(angle) * 30,
        hp: 40, maxHp: 40,
        speed: 0.6,
        patrolAngle: angle,
        patrolTimer: 0,
        state: 'patrol',
      });
    }
  }

  function _updateGarrison(dt, enemies) {
    S.garrison = S.garrison.filter(function (g) { return g.hp > 0; });
    S.garrison.forEach(function (g) {
      if (g.faction !== S.playerFaction) return; // Only update player garrison
      // Find nearest enemy in world coords
      let nearestDist = 999999, nearest = null;
      enemies.forEach(function (e) {
        if (!e || e.dead) return;
        const TW = 84, TH = 42;
        const ex = (e.col - e.row) * TW / 2, ey = (e.col + e.row) * TH / 2;
        const dx = ex - g.wx, dy = ey - g.wy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearest = e; }
      });

      if (nearest && nearestDist < 150) {
        // Charge
        const TW = 84, TH = 42;
        const ex = (nearest.col - nearest.row) * TW / 2, ey = (nearest.col + nearest.row) * TH / 2;
        const dx = ex - g.wx, dy = ey - g.wy, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 30) {
          g.wx += (dx / dist) * g.speed * dt * 0.06;
          g.wy += (dy / dist) * g.speed * dt * 0.06;
        } else {
          nearest.hp = (nearest.hp || 20) - 0.08 * dt;
        }
        g.state = 'chase';
      } else {
        // Patrol circle around building
        g.patrolTimer += dt;
        g.patrolAngle += 0.0005 * dt;
        const zone = S.captureZones.find(function (z) { return z.bldKey === g.bldKey; });
        if (zone) {
          g.wx = zone.wx + Math.cos(g.patrolAngle) * 55;
          g.wy = zone.wy + Math.sin(g.patrolAngle) * 28;
        }
        g.state = 'patrol';
      }
    });
  }

  // ── Siege Weapons ─────────────────────────────────────────────────────────
  let _swId = 0;
  function placeSiegeWeapon(type, col, row) {
    if (!S.active) { if (typeof toast === 'function') toast('Siege is not active'); return; }
    const id = 'sw_' + (++_swId);
    const TW = 84, TH = 42;
    S.siegeWeapons.push({
      id, type, col, row,
      wx: (col - row) * TW / 2,
      wy: (col + row) * TH / 2,
      ammo: type === 'catapult' ? 20 : 10,
      owner: S.playerFaction,
    });
    log('⚙ ' + type.toUpperCase() + ' placed at [' + col + ',' + row + ']', '#e8c45c');
  }

  function _fireCatapult(sw, enemies) {
    if (sw.ammo <= 0) return;
    // Find nearest enemy building or enemy NPC
    let target = null, bestDist = 99999;
    enemies.forEach(function (e) {
      if (!e || e.dead) return;
      const TW = 84, TH = 42;
      const ex = (e.col - e.row) * TW / 2, ey = (e.col + e.row) * TH / 2;
      const dx = ex - sw.wx, dy = ey - sw.wy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist && d < 400) { bestDist = d; target = { wx: ex, wy: ey, e }; }
    });
    if (!target) return;
    sw.ammo--;
    const dx = target.wx - sw.wx, dy = target.wy - sw.wy, dist = Math.sqrt(dx * dx + dy * dy);
    S.projectiles.push({
      x: sw.wx, y: sw.wy,
      vx: (dx / dist) * 4, vy: (dy / dist) * 4,
      dmg: CFG.CATAPULT_DMG, age: 0, maxAge: dist / 4,
      targetE: target.e,
    });
  }

  function _updateProjectiles(dt, enemies) {
    S.projectiles = S.projectiles.filter(function (p) {
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.age += dt;
      if (p.age >= p.maxAge) {
        // Hit — apply damage
        if (p.targetE && !p.targetE.dead) {
          p.targetE.hp = (p.targetE.hp || 20) - p.dmg;
          if (p.targetE.hp <= 0) p.targetE.dead = true;
        }
        return false;
      }
      return true;
    });
  }

  // ── Raider Waves ──────────────────────────────────────────────────────────
  function _spawnWave(count) {
    const GW = 60, GH = 60; // approximate grid size
    if (!window.enemies) return;
    for (let i = 0; i < count; i++) {
      const side = Math.floor(Math.random() * 4);
      let col, row;
      if (side === 0) { col = Math.random() * GW | 0; row = 0; }
      else if (side === 1) { col = GW - 1; row = Math.random() * GH | 0; }
      else if (side === 2) { col = Math.random() * GW | 0; row = GH - 1; }
      else { col = 0; row = Math.random() * GH | 0; }
      const PP = window.PixelPeople;
      const preset = PP && PP.PRESETS ? PP.PRESETS[Math.floor(Math.random() * PP.PRESETS.length)] : null;
      window.enemies.push({
        col, row, kind: 'raider',
        hp: 30 + Math.random() * 20 | 0,
        maxHp: 50,
        speed: 0.9 + Math.random() * 0.4,
        loot: { money: 15 + Math.random() * 20 | 0, xp: 8 },
        rig: preset ? JSON.parse(JSON.stringify(preset.rig)) : null,
        faction: 'raiders',
      });
    }
  }

  // ── Canvas Render overlay ─────────────────────────────────────────────────
  function render(ctx, cam, TW, TH) {
    if (!S.active && S.garrison.length === 0) return;
    ctx.save();

    const toScreen = function (wx, wy) {
      // cam is in grid coords; convert world pixel to screen
      const camPxX = (cam.col - cam.row) * TW / 2;
      const camPxY = (cam.col + cam.row) * TH / 2;
      const W = ctx.canvas.width / (window.DPR || 1);
      const H = ctx.canvas.height / (window.DPR || 1);
      return {
        sx: wx - camPxX + W / 2,
        sy: wy - camPxY + H / 2,
      };
    };

    // Garrison defender dots
    S.garrison.forEach(function (g) {
      const s = toScreen(g.wx, g.wy);
      const alive = g.hp / g.maxHp;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = g.faction === S.playerFaction ? '#00ff9c' : '#ff4040';
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      // HP pip above
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(s.sx - 8, s.sy - 11, 16, 3);
      ctx.fillStyle = alive > 0.5 ? '#4fe07a' : '#e05050';
      ctx.fillRect(s.sx - 8, s.sy - 11, 16 * alive, 3);
    });

    // Capture progress arcs
    S.captureZones.forEach(function (zone) {
      const bld = S.buildingHP[zone.bldKey];
      if (!bld || bld.captureProgress <= 0) return;
      const pct = bld.captureProgress / CFG.CAPTURE_MS;
      const s = toScreen(zone.wx, zone.wy);
      ctx.beginPath();
      ctx.arc(s.sx, s.sy - 20, 16, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.strokeStyle = '#00ff9c';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    });

    // Building ownership dots
    S.captureZones.forEach(function (zone) {
      const bld = S.buildingHP[zone.bldKey];
      if (!bld || !bld.owner) return;
      const s = toScreen(zone.wx, zone.wy);
      const col = bld.owner === S.playerFaction ? '#00ff9c' : '#ff4040';
      ctx.beginPath();
      ctx.arc(s.sx, s.sy - 36, 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Siege weapon icons
    S.siegeWeapons.forEach(function (sw) {
      const s = toScreen(sw.wx, sw.wy);
      ctx.fillStyle = '#e8c45c';
      ctx.globalAlpha = 0.8;
      ctx.font = 'bold 16px Share Tech Mono';
      ctx.textAlign = 'center';
      ctx.fillText(sw.type === 'catapult' ? '⚙' : '▮', s.sx, s.sy);
      ctx.globalAlpha = 1;
    });

    // Projectiles
    S.projectiles.forEach(function (p) {
      const s = toScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8c00';
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // HQ hold progress bar (top-center when active)
    if (S.active && S.hqBldKey && S.buildingHP[S.hqBldKey] && S.buildingHP[S.hqBldKey].owner === S.playerFaction) {
      const pct = Math.min(1, S.hqHoldMs / CFG.HQ_HOLD_WIN_MS);
      const W = ctx.canvas.width / (window.DPR || 1);
      const barW = 240, barH = 12, bx = W / 2 - barW / 2, by = 16;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 18);
      ctx.fillStyle = '#004020';
      ctx.fillRect(bx, by + 14, barW, barH - 4);
      ctx.fillStyle = '#00ff9c';
      ctx.fillRect(bx, by + 14, barW * pct, barH - 4);
      ctx.fillStyle = '#00ff9c';
      ctx.font = 'bold 9px Share Tech Mono';
      ctx.textAlign = 'center';
      const secsLeft = Math.max(0, (CFG.HQ_HOLD_WIN_MS - S.hqHoldMs) / 1000) | 0;
      ctx.fillText('HQ HOLD · ' + (secsLeft / 60 | 0) + ':' + String(secsLeft % 60).padStart(2, '0') + ' remaining', W / 2, by + 11);
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Siege Registration Panel ───────────────────────────────────────────────
  function openSiegeReg() {
    let el = document.getElementById('siegeRegPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'siegeRegPanel';
      el.className = 'panel';
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;width:min(540px,94vw);max-height:80vh;overflow-y:auto;padding:22px 24px';
      document.body.appendChild(el);
    }
    const timeToNext = Math.max(0, S.nextMs - Date.now());
    const dy = Math.floor(timeToNext / 86400000);
    const hr = Math.floor((timeToNext % 86400000) / 3600000);
    const mn = Math.floor((timeToNext % 3600000) / 60000);

    const ownedBuildings = Object.entries(S.buildingHP).filter(function ([k, b]) { return b.owner === S.playerFaction; });

    let h = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">';
    h += '<div><div style="font-family:\'Orbitron\',monospace;font-size:18px;font-weight:900;color:#e8f5f0">⚔ SIEGE COMMAND</div>';
    h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:rgba(0,229,160,0.5);letter-spacing:.1em;margin-top:2px">MONTHLY CYCLE · CAPTURE BUILDINGS · EARN YIELD</div></div>';
    h += '<button onclick="document.getElementById(\'siegeRegPanel\').classList.add(\'hide\')" style="font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:7px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.5);cursor:pointer">CLOSE</button>';
    h += '</div>';

    // Status card
    if (S.active) {
      h += '<div style="padding:14px 16px;background:rgba(255,40,40,0.08);border:1px solid rgba(255,60,60,0.35);border-radius:10px;margin-bottom:14px;animation:siegePulse 1.2s infinite">';
      h += '<div style="font-family:\'Orbitron\',monospace;font-size:14px;font-weight:700;color:#ff4040">⚔ SIEGE IS ACTIVE</div>';
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:10px;color:rgba(255,96,96,0.7);margin-top:4px">Capture buildings — hold SHADDAI HQ for 3 minutes to win</div>';
      // HQ hold progress
      const hqPct = Math.min(100, (S.hqHoldMs / CFG.HQ_HOLD_WIN_MS * 100)).toFixed(0);
      const hqOwned = S.hqBldKey && S.buildingHP[S.hqBldKey] && S.buildingHP[S.hqBldKey].owner === S.playerFaction;
      h += '<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;font-family:\'Share Tech Mono\',monospace;font-size:9px;color:rgba(0,229,160,0.6);margin-bottom:4px">';
      h += '<span>HQ HOLD PROGRESS</span><span>' + hqPct + '%' + (hqOwned ? ' · YOU OWN HQ' : '') + '</span></div>';
      h += '<div style="height:8px;background:rgba(0,229,160,0.1);border-radius:4px"><div style="height:100%;width:' + hqPct + '%;background:linear-gradient(90deg,#00a060,#00ff9c);border-radius:4px;transition:width .5s"></div></div></div>';
      h += '</div>';
    } else {
      h += '<div style="padding:14px 16px;background:rgba(232,196,92,0.06);border:1px solid rgba(232,196,92,0.22);border-radius:10px;margin-bottom:14px">';
      h += '<div style="font-family:\'Orbitron\',monospace;font-size:13px;font-weight:700;color:#e8c45c">NEXT SIEGE</div>';
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:20px;font-weight:700;color:#e8f5f0;margin-top:6px">' + dy + 'd ' + hr + 'h ' + mn + 'm</div>';
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:rgba(232,196,92,0.5);margin-top:4px">Monthly siege cycle · build up resources before it opens</div>';
      // Debug: force open button (dev only)
      h += '<button onclick="SiegeSystem.openSiege()" style="margin-top:10px;font-family:\'Share Tech Mono\',monospace;font-size:9px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,60,60,0.3);background:rgba(255,40,40,0.06);color:#ff6060;cursor:pointer">⚔ FORCE OPEN (DEV)</button>';
      h += '</div>';
    }

    // Owned buildings
    h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:.14em;color:rgba(0,229,160,0.5);margin-bottom:8px">YOUR BUILDINGS (' + ownedBuildings.length + ')</div>';
    if (ownedBuildings.length === 0) {
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:11px;color:rgba(255,255,255,0.3);padding:12px;text-align:center;border:1px solid rgba(255,255,255,0.06);border-radius:8px">None yet — approach a building during siege to capture it</div>';
    } else {
      h += '<div style="display:grid;gap:6px">';
      ownedBuildings.forEach(function ([k, b]) {
        const hpPct = (b.hp / b.maxHp * 100).toFixed(0);
        h += '<div style="padding:10px 12px;background:rgba(0,229,160,0.04);border:1px solid rgba(0,229,160,0.14);border-radius:8px;display:flex;align-items:center;justify-content:space-between">';
        h += '<div><div style="font-family:\'Share Tech Mono\',monospace;font-size:11px;font-weight:700;color:#e8f5f0">' + b.name + '</div>';
        h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:8px;color:rgba(0,229,160,0.5);letter-spacing:.08em">' + (b.kind || 'building').toUpperCase() + ' · HP ' + hpPct + '%</div></div>';
        h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:#00e5a0">HELD</div>';
        h += '</div>';
      });
      h += '</div>';
    }

    // Siege log
    if (S.log.length > 0) {
      h += '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:.14em;color:rgba(255,255,255,0.3);margin:14px 0 8px">SIEGE LOG</div>';
      h += '<div id="siegeLogInner" style="font-family:\'Share Tech Mono\',monospace;font-size:10px;line-height:1.7;padding:10px 12px;background:rgba(0,0,0,0.35);border-radius:8px;max-height:140px;overflow-y:auto">';
      S.log.slice(0, 8).forEach(function (entry) {
        h += '<div style="color:' + entry.color + '">' + entry.msg + '</div>';
      });
      h += '</div>';
    }

    el.innerHTML = h;
    el.classList.remove('hide');
  }

  function _renderLog() {
    const el = document.getElementById('siegeLogInner');
    if (!el) return;
    el.innerHTML = S.log.slice(0, 8).map(function (e) {
      return '<div style="color:' + e.color + '">' + e.msg + '</div>';
    }).join('');
  }

  function _updateSiegeHudTxt() {
    const el = document.getElementById('siegeTxt');
    const btn = document.getElementById('siegeBtn');
    if (!el) return;
    if (S.active) {
      el.textContent = 'SIEGE ACTIVE';
      el.style.color = '#ff3232';
      if (btn) btn.classList.add('siege-active');
    } else {
      const d = S.nextMs - Date.now();
      if (d <= 0) { el.textContent = 'SIEGE NOW!'; el.style.color = '#ff3232'; if (btn) btn.classList.add('siege-active'); }
      else {
        const dy = Math.floor(d / 86400000), hr = Math.floor((d % 86400000) / 3600000);
        el.textContent = dy + 'd ' + hr + 'h';
        el.style.color = '#e8c45c';
        if (btn) btn.classList.remove('siege-active');
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init,
    update,
    render,
    openSiege,
    endSiege,
    captureBuilding,
    damageBuilding,
    placeSiegeWeapon,
    openSiegeReg,
    get active() { return S.active; },
    get log() { return S.log; },
    get buildingHP() { return S.buildingHP; },
    get garrison() { return S.garrison; },
    _updateSiegeHudTxt,
  };

})();

// ── Hook into game loop ────────────────────────────────────────────────────
window.updateSiege = function (dt, player, enemies, props, camCol, camRow) {
  if (window.SiegeSystem) SiegeSystem.update(dt, player, enemies, props, camCol, camRow);
};
window.renderSiege = function (ctx, cam, TW, TH) {
  if (window.SiegeSystem) SiegeSystem.render(ctx, cam, TW || 84, TH || 42);
};
window.openSiegeReg = function () {
  if (window.SiegeSystem) SiegeSystem.openSiegeReg();
  else {
    // Fallback if not loaded yet
    if (typeof toast === 'function') toast('Siege system loading…');
  }
};

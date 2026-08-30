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

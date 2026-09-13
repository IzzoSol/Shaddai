// backend/office-service.js
// ─────────────────────────────────────────────────────────────────────────
// SHADDAI — Office ownership layer (cohesion: World → OFFICE → Rooms → Agents).
// ONE office per user, a building the user owns in SHADDAI City. Creating one
// is sign-in-gated (the route enforces it). The office OWNS the user's rooms
// (the canonical agent-rooms). Persisted to data/offices.json.
// ─────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const rooms = require('./agent-room-service');

const STORE = path.join(__dirname, 'data', 'offices.json');
const REGION = 'shaddai-city';
const TOTAL_LOTS = 30;   // Founders' Row capacity (mirrors game.html)

// Ready-made office looks so a user can set up without building one.
const PRESETS = [
  { id: 'command-loft', name: 'Command Loft', accent: '#00e5a0', d: 'Sleek emerald command deck.' },
  { id: 'obsidian-hq', name: 'Obsidian HQ', accent: '#a855f7', d: 'Dark violet executive suite.' },
  { id: 'neon-studio', name: 'Neon Studio', accent: '#22d3ee', d: 'Cyan creator studio.' },
  { id: 'gold-atrium', name: 'Gold Atrium', accent: '#e8c45c', d: 'Warm gilded atrium.' },
  { id: 'terminal-bay', name: 'Terminal Bay', accent: '#39ff97', d: 'Phosphor-green ops bay.' },
  { id: 'crimson-forge', name: 'Crimson Forge', accent: '#ff5470', d: 'Molten red workshop.' },
];
const VISIBILITIES = ['private', 'public-showroom', 'hireable-studio'];

function read() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { return { offices: {}, slots: 0 }; } }
function write(d) { try { fs.writeFileSync(STORE, JSON.stringify(d, null, 2)); } catch (e) {} }

// ADMIN: wipe offices. Pass a userId to remove just that owner's office, or nothing to
// clear them all (frees every Founders' Row lot). Returns how many were removed.
function clearOffices(userId) {
  const db = read(); const before = Object.keys(db.offices || {}).length;
  if (userId) { if (db.offices) delete db.offices[userId]; }
  else { db.offices = {}; }
  write(db);
  return before - Object.keys(db.offices || {}).length;
}

// One-time reset of Founders' Row — the existing offices were all test data. This runs
// automatically ONCE (gated by a version marker persisted in the store), so it clears now
// but will NOT wipe real offices on future deploys. WIPE_OFFICES=1 env forces a re-clear.
(function officeReset() {
  const WIPE_V = 1;
  try {
    const forced = (process.env.WIPE_OFFICES === '1' || process.env.WIPE_OFFICES === 'true');
    const db = read();
    if (forced || db._wipeVersion !== WIPE_V) {
      const n = Object.keys(db.offices || {}).length;
      db.offices = {}; db._wipeVersion = WIPE_V; write(db);
      console.log('[office] Founders\' Row reset — cleared ' + n + ' office(s)' + (forced ? ' [forced]' : ' [one-time v' + WIPE_V + ']') + '.');
    }
  } catch (e) {}
})();

// Deterministic office plot coords in SHADDAI City — "Founders' Row", a northern
// boulevard of 30 lots. MUST mirror game.html's FLOT() so the city renders each
// office on the exact lot the backend assigned it.
function slotCoords(i) { return { col: 6 + (i % 10) * 5, row: 4 + Math.floor(i / 10) * 5 }; }

function getOffice(userId) {
  if (!userId) return null;
  const db = read();
  return db.offices[userId] || null;
}

// Idempotent — exactly one office per user. Sign-in is enforced by the route.
// opts.slot (optional): the specific Founders' Row lot the player clicked in the
// world (game.html's FLOT(i) index). Honored only if it's a real, currently-open
// slot — otherwise falls back to auto-assigning the next sequential one. Without
// this, a player clicking lot #7 could silently be assigned an unrelated slot,
// while the client (which just marks whatever it clicked as claimed) never finds
// out — the office would then render on a different lot after the next refresh.
function claimOffice(userId, opts = {}) {
  if (!userId) return null;
  const db = read();
  if (db.offices[userId]) {
    if (opts.name) { db.offices[userId].name = String(opts.name).slice(0, 48); db.offices[userId].updatedAt = new Date().toISOString(); write(db); }
    return db.offices[userId];
  }
  let slot = db.slots || 0, autoAssigned = true;
  const requested = parseInt(opts.slot, 10);
  if (Number.isInteger(requested) && requested >= 0 && requested < TOTAL_LOTS) {
    const takenByOther = Object.values(db.offices).some(x => x.slot === requested);
    if (!takenByOther) { slot = requested; autoAssigned = false; }
  }
  const c = slotCoords(slot);
  const office = {
    officeId: 'office_' + userId,
    ownerUserId: userId,
    name: (opts.name && String(opts.name).slice(0, 48)) || 'My Command Office',
    regionId: REGION,
    slot,
    cityCoords: c,
    visibility: opts.visibility || 'private',   // private | public-showroom | hireable-studio
    preset: opts.preset || 'command-loft',       // one of PRESETS[].id
    verified: !!opts.verified,                   // signed-in now; email/wallet verify later
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.offices[userId] = office;
  if (autoAssigned) db.slots = slot + 1;
  write(db);
  return office;
}

// Update the owner's office look/identity. Only known fields, validated.
function updateOffice(userId, patch = {}) {
  if (!userId) return null;
  const db = read();
  const o = db.offices[userId];
  if (!o) return null;
  if (patch.name != null) o.name = String(patch.name).slice(0, 48);
  if (patch.preset != null && PRESETS.some(p => p.id === patch.preset)) o.preset = patch.preset;
  if (patch.visibility != null && VISIBILITIES.includes(patch.visibility)) o.visibility = patch.visibility;
  o.updatedAt = new Date().toISOString();
  write(db);
  return o;
}

// Move the owner's office to a different Founders' Row lot. Rejects taken lots.
function switchLot(userId, slot) {
  if (!userId) return { error: 'no user' };
  slot = parseInt(slot, 10);
  if (!Number.isInteger(slot) || slot < 0 || slot >= TOTAL_LOTS) return { error: 'invalid lot' };
  const db = read();
  const o = db.offices[userId];
  if (!o) return { error: 'no office' };
  const taken = Object.values(db.offices).some(x => x.ownerUserId !== userId && x.slot === slot);
  if (taken) return { error: 'lot taken' };
  o.slot = slot;
  o.cityCoords = slotCoords(slot);
  o.updatedAt = new Date().toISOString();
  write(db);
  return { office: o };
}

// Which Founders' Row lots are open vs taken (for the office lot picker).
function lotMap(userId) {
  const db = read();
  const taken = {};
  Object.values(db.offices).forEach(x => { taken[x.slot] = { owner: x.ownerUserId === userId ? 'you' : 'taken', name: x.name }; });
  const lots = [];
  for (let i = 0; i < TOTAL_LOTS; i++) lots.push({ slot: i, coords: slotCoords(i), state: taken[i] ? taken[i].owner : 'open' });
  return lots;
}

// The office + the rooms it owns (canonical agent-rooms for this owner) + a summary.
function officeWithRooms(userId) {
  const office = getOffice(userId);
  if (!office) return null;
  const r = rooms.listForOwner(userId);
  return {
    office,
    rooms: r,
    summary: {
      rooms: r.length,
      agents: r.length,
      public: r.filter(x => x.permissions && x.permissions.visibility !== 'private').length,
      hireable: r.filter(x => x.permissions && x.permissions.visibility === 'hireable-studio').length,
    },
  };
}

// All offices as lightweight map markers for the city (exterior only, respects visibility).
function cityOffices() {
  const db = read();
  return Object.values(db.offices).map(o => ({
    officeId: o.officeId, ownerUserId: o.ownerUserId, name: o.name,
    slot: o.slot, cityCoords: o.cityCoords, visibility: o.visibility, preset: o.preset || 'command-loft',
  }));
}

module.exports = { getOffice, claimOffice, updateOffice, switchLot, lotMap, officeWithRooms, cityOffices, slotCoords, clearOffices, PRESETS, VISIBILITIES, TOTAL_LOTS };

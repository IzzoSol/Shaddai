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

function read() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { return { offices: {}, slots: 0 }; } }
function write(d) { try { fs.writeFileSync(STORE, JSON.stringify(d, null, 2)); } catch (e) {} }

// Deterministic office plot coords in SHADDAI City (a grid of building lots).
function slotCoords(i) { const cols = 6; return { col: 22 + (i % cols) * 7, row: 20 + Math.floor(i / cols) * 7 }; }

function getOffice(userId) {
  if (!userId) return null;
  const db = read();
  return db.offices[userId] || null;
}

// Idempotent — exactly one office per user. Sign-in is enforced by the route.
function claimOffice(userId, opts = {}) {
  if (!userId) return null;
  const db = read();
  if (db.offices[userId]) {
    if (opts.name) { db.offices[userId].name = String(opts.name).slice(0, 48); db.offices[userId].updatedAt = new Date().toISOString(); write(db); }
    return db.offices[userId];
  }
  const slot = db.slots || 0;
  const c = slotCoords(slot);
  const office = {
    officeId: 'office_' + userId,
    ownerUserId: userId,
    name: (opts.name && String(opts.name).slice(0, 48)) || 'My Command Office',
    regionId: REGION,
    slot,
    cityCoords: c,
    visibility: opts.visibility || 'private',   // private | public-showroom | hireable-studio
    verified: !!opts.verified,                   // signed-in now; email/wallet verify later
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.offices[userId] = office;
  db.slots = slot + 1;
  write(db);
  return office;
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
    cityCoords: o.cityCoords, visibility: o.visibility,
  }));
}

module.exports = { getOffice, claimOffice, officeWithRooms, cityOffices, slotCoords };

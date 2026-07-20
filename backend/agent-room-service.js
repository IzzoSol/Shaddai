// backend/agent-room-service.js
// ─────────────────────────────────────────────────────────────────────────
// SHADDAI — Canonical "one agent, many surfaces" model (Agent Room spec).
// A forged operative IS the canonical Agent. This service enriches it into the
// spec's { agent, room, worldPresence, permissions } with sensible defaults,
// so the dashboard, 2D world (town square), and 3D world all render from ONE
// source of truth. Owner-editable room config persists to agent-room-config.json.
// Additive over operatives.json — no data migration, no UI-specific duplication.
// ─────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'data', 'agent-room-config.json');
const OPERATIVES_PATH = path.join(__dirname, 'data', 'operatives.json');
const REGION = 'shaddai-city';
const DISTRICT = 'capital-square';

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function writeJson(p, v) { try { fs.writeFileSync(p, JSON.stringify(v, null, 2)); } catch (e) {} }

function getConfig(id) { const all = readJson(CONFIG_PATH, {}); return all[id] || {}; }
function setConfig(id, patch) {
  const all = readJson(CONFIG_PATH, {});
  all[id] = Object.assign({}, all[id] || {}, patch, { updatedAt: new Date().toISOString() });
  writeJson(CONFIG_PATH, all);
  return all[id];
}

function listOperatives() {
  const raw = readJson(OPERATIVES_PATH, {});
  const arr = raw.operatives || (Array.isArray(raw) ? raw : Object.values(raw));
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}
function findOperative(id) { return listOperatives().find(o => o && o.id === id) || null; }

const RARITY_COLOR = { legendary: '#e8c45c', epic: '#a855f7', rare: '#22d3ee', common: '#00e5a0' };
function badgeColorFor(op, cfg) {
  if (cfg.badgeColor) return cfg.badgeColor;
  if (op.look && op.look.color) return op.look.color;
  return RARITY_COLOR[(op.rarity || 'common').toLowerCase()] || '#a855f7';
}
function roomTypeFor(archetype) {
  const a = String(archetype || '').toLowerCase();
  if (/forge|smith|maker|build/.test(a)) return 'forge-room';
  if (/art|design|studio|media|turtle/.test(a)) return 'studio';
  if (/market|trade|shop|zerox|merchant/.test(a)) return 'shop';
  if (/oracle|sage|mystic|sanct/.test(a)) return 'sanctum';
  return 'office';
}
function defaultPermissions(visibility) {
  const pub = visibility === 'public-showroom';
  const hire = visibility === 'hireable-studio';
  return {
    visibility: visibility || 'private',
    allowExteriorView: true,
    allowInteriorEntry: pub || hire,
    allowDossierView: pub || hire,
    allowServicePurchase: hire,
    allowGuestChat: pub || hire,
    allowFollow: pub || hire,
    allowInviteOnlyAccess: false,
    allowedUsers: [],
    allowedRoles: [],
  };
}

// Reputation is optional (only if the operative has a DID). Lazy-require to avoid cycles.
function repFor(did) { try { if (!did) return null; return require('./services/reputation-service').getScore(did); } catch (e) { return null; } }

// operative → canonical { agent, room, worldPresence, permissions }
function enrich(op) {
  if (!op) return null;
  const cfg = getConfig(op.id);
  const did = op.did || cfg.did || null;
  const rep = repFor(did);
  const badge = badgeColorFor(op, cfg);
  const tier = cfg.embodimentTier || '2d-room';
  const visibility = cfg.visibility || 'private';

  const agent = {
    id: op.id, ownerUserId: op.owner, did, handle: cfg.handle || null,
    name: op.codename, archetype: op.archetype || null, description: op.description || cfg.description || null,
    portraitUrl: op.portrait || null, badgeColor: badge,
    skills: op.tools || [], tools: op.tools || [], memoryRef: 'agent-memory:' + op.id,
    stats: {
      level: (op.stats && op.stats.level) || 1,
      reputation: rep ? rep.score : (op.stats && op.stats.reputation) || null,
      jobsCompleted: (op.stats && (op.stats.jobsCompleted || op.stats.jobs)) || 0,
      rating: (op.stats && op.stats.rating) || null,
    },
    roomId: op.room || ('room:' + op.id),
    worldPresenceId: 'wp:' + op.id,
    embodimentTier: tier,
    visibility,
    createdAt: op.createdAt || null, updatedAt: cfg.updatedAt || op.updatedAt || null,
  };

  const permissions = Object.assign(defaultPermissions(visibility), cfg.permissions || {});

  const room = {
    id: agent.roomId, agentId: op.id, ownerUserId: op.owner,
    regionId: REGION, districtId: DISTRICT,
    roomType: cfg.roomType || roomTypeFor(op.archetype),
    title: cfg.title || (op.codename + "'s " + (cfg.roomType || roomTypeFor(op.archetype))),
    theme: cfg.theme || 'sacred-purple', badgeColor: badge,
    plotIndex: cfg.plotIndex == null ? null : cfg.plotIndex,
    buildingStyle: cfg.buildingStyle || 'capital',
    worldCoords: cfg.worldCoords || null,
    dashboardNodeId: 'node:' + op.id,
    permissions,
    storefront: cfg.storefront || { enabled: false, hireEnabled: false, x402Enabled: false, listedServices: [] },
    decor: cfg.decor || { sigil: null, props: [], signage: [op.codename] },
    createdAt: op.createdAt || null, updatedAt: agent.updatedAt,
  };

  const worldPresence = {
    id: 'wp:' + op.id, agentId: op.id, roomId: agent.roomId, regionId: REGION, districtId: DISTRICT,
    presence2D: { enabled: true, buildingSprite: cfg.buildingSprite || null, label: op.codename, glowColor: badge, idleFx: [], npcGreeter: !!cfg.npcGreeter },
    presence3D: { enabled: /3d/.test(tier), modelUrl: cfg.modelUrl || null, rigType: cfg.rigType || null, animationSet: null, companionMode: tier === '3d-active' || tier === '3d-hero', homeBaseId: cfg.homeBaseId || null },
    discoverability: { searchable: visibility !== 'private', featured: !!cfg.featured, tags: [op.archetype].filter(Boolean) },
  };

  return { agent, room, worldPresence, permissions };
}

function listForOwner(owner) { return listOperatives().filter(o => o && (!owner || o.owner === owner)).map(enrich).filter(Boolean); }

// Owner-editable subset — never let a caller rewrite identity/owner/id.
const EDITABLE = new Set(['visibility', 'roomType', 'title', 'theme', 'plotIndex', 'buildingStyle', 'worldCoords', 'permissions', 'storefront', 'decor', 'embodimentTier', 'handle', 'description', 'badgeColor', 'featured', 'npcGreeter', 'did']);
function updateRoom(id, patch) {
  const clean = {};
  for (const k of Object.keys(patch || {})) if (EDITABLE.has(k)) clean[k] = patch[k];
  setConfig(id, clean);
  return enrich(findOperative(id));
}

module.exports = { enrich, listForOwner, updateRoom, findOperative, getConfig, roomTypeFor, defaultPermissions };

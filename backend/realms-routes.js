// realms-routes.js — SHADDAI REALMS (2.5D isometric RPG) API.
//   Mounted at /api/realms (see server-production.js).
//
//   Character:
//     POST   /character   { name, class, gender?, walletAddress?, uid? } → create
//     GET    /character                                                  → current user's character
//     PUT    /character   { ...patch }                                   → update (pos/stats/inventory/squad)
//     DELETE /character                                                  → delete/reset
//   Guild (clan):
//     GET    /guild                                                      → player's guild + roster
//     POST   /guild       { name, tag? }                                 → create guild
//     POST   /guild/:id/join                                             → join a guild
//     POST   /guild/:id/leave                                            → leave current guild
//   Leaderboard:
//     GET    /leaderboard?sort=resources|clanSize|bossKills&limit=N      → ranked guilds
//
// Storage: flat JSON files under backend/data (same lightweight pattern as the
//   arcade / portal registries). Persists to disk, validates class.
// Auth: softAuth from auth-guard (attaches req.userId; hard-blocks only when
//   REQUIRE_AUTH==='true'). In dev, callers may pass a `uid` in the body/query
//   to disambiguate accounts. TODO(launch): swap to verifyFirebaseToken.
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

let softAuth;
try { ({ softAuth } = require('./auth-guard')); }
catch (_) { softAuth = (req, _res, next) => { req.userId = req.headers['x-user-id'] || 'local'; next(); }; }

// ── storage ──────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const CHAR_FILE = path.join(DATA_DIR, 'realms-characters.json');
const GUILD_FILE = path.join(DATA_DIR, 'realms-guilds.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return fallback; }
}
function writeJson(file, obj) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);   // atomic-ish swap
  } catch (e) { console.warn('[realms] write failed:', e.message); }
}
// characters: { [uid]: character }   guilds: { [id]: guild }
function loadChars() { return readJson(CHAR_FILE, {}); }
function saveChars(c) { writeJson(CHAR_FILE, c); }
function loadGuilds() { return readJson(GUILD_FILE, {}); }
function saveGuilds(g) { writeJson(GUILD_FILE, g); }

// ── domain constants ─────────────────────────────────────────────────────────
const VALID_CLASSES = ['Archer', 'Ninja', 'Sword-Maiden', 'Mage'];
const BASE_STATS = {
  'Archer':       { hp: 90,  atk: 14, def: 6,  spd: 12, mag: 4 },
  'Ninja':        { hp: 85,  atk: 13, def: 7,  spd: 15, mag: 5 },
  'Sword-Maiden': { hp: 120, atk: 16, def: 12, spd: 8,  mag: 3 },
  'Mage':         { hp: 70,  atk: 6,  def: 4,  spd: 9,  mag: 18 },
};
function baseStatsFor(cls) { return { ...(BASE_STATS[cls] || {}) }; }

// Resolve the acting user id. Prefer a real authenticated id; in dev softAuth
// yields 'local', so allow an explicit uid from the body/query to separate users.
function resolveUid(req) {
  const authed = req.userId && req.userId !== 'local' ? req.userId : null;
  const supplied = (req.body && req.body.uid) || (req.query && req.query.uid);
  return String(authed || supplied || 'local').trim();
}

const genId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ── CHARACTER ────────────────────────────────────────────────────────────────

// POST /character — create
router.post('/character', softAuth, json, (req, res) => {
  const uid = resolveUid(req);
  const { name, gender, walletAddress } = req.body || {};
  const charClass = req.body && req.body.class;

  if (!name || !charClass) {
    return res.status(400).json({ ok: false, error: 'name and class are required' });
  }
  if (!VALID_CLASSES.includes(charClass)) {
    return res.status(400).json({ ok: false, error: `class must be one of ${VALID_CLASSES.join(', ')}` });
  }

  const chars = loadChars();
  if (chars[uid]) return res.status(409).json({ ok: false, error: 'character already exists for this account' });

  const character = {
    uid,
    name: String(name).slice(0, 40),
    class: charClass,
    gender: gender || 'unspecified',
    walletAddress: walletAddress || null,
    level: 1,
    xp: 0,
    gold: 0,
    stats: baseStatsFor(charClass),
    inventory: [],
    squad: [],
    position: { x: 0, y: 0 },
    guildId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  chars[uid] = character;
  saveChars(chars);
  res.json({ ok: true, character });
});

// GET /character — current user's character
router.get('/character', softAuth, (req, res) => {
  const uid = resolveUid(req);
  const character = loadChars()[uid];
  if (!character) return res.status(404).json({ ok: false, error: 'no character found', code: 'NO_CHARACTER' });
  res.json({ ok: true, character });
});

// PUT /character — update (position/stats/inventory/squad/gold/xp/level)
router.put('/character', softAuth, json, (req, res) => {
  const uid = resolveUid(req);
  const chars = loadChars();
  const character = chars[uid];
  if (!character) return res.status(404).json({ ok: false, error: 'no character found', code: 'NO_CHARACTER' });

  const patch = req.body || {};
  // Only allow a safe subset to be mutated by the client.
  const ALLOWED = ['name', 'gender', 'walletAddress', 'level', 'xp', 'gold',
                   'stats', 'inventory', 'squad', 'position', 'guildId'];
  for (const k of ALLOWED) {
    if (patch[k] !== undefined) character[k] = patch[k];
  }
  // class is immutable but if supplied must stay valid.
  if (patch.class !== undefined) {
    if (!VALID_CLASSES.includes(patch.class)) {
      return res.status(400).json({ ok: false, error: `class must be one of ${VALID_CLASSES.join(', ')}` });
    }
    character.class = patch.class;
  }
  character.updatedAt = Date.now();
  chars[uid] = character;
  saveChars(chars);
  res.json({ ok: true, character });
});

// DELETE /character — delete/reset
router.delete('/character', softAuth, (req, res) => {
  const uid = resolveUid(req);
  const chars = loadChars();
  if (!chars[uid]) return res.status(404).json({ ok: false, error: 'no character found', code: 'NO_CHARACTER' });
  delete chars[uid];
  saveChars(chars);
  res.json({ ok: true });
});

// ── GUILD ────────────────────────────────────────────────────────────────────

function guildForUser(uid) {
  const guilds = loadGuilds();
  return Object.values(guilds).find(g => g.members.some(m => m.uid === uid)) || null;
}

// GET /guild — player's guild + roster
router.get('/guild', softAuth, (req, res) => {
  const uid = resolveUid(req);
  const guild = guildForUser(uid);
  if (!guild) return res.status(404).json({ ok: false, error: 'not in a guild', code: 'NO_GUILD' });
  res.json({ ok: true, guild });
});

// POST /guild — create a guild (founder auto-joins)
router.post('/guild', softAuth, json, (req, res) => {
  const uid = resolveUid(req);
  const { name, tag } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'guild name required' });

  if (guildForUser(uid)) {
    return res.status(409).json({ ok: false, error: 'already in a guild — leave it first' });
  }

  const chars = loadChars();
  const character = chars[uid];
  const guilds = loadGuilds();
  const id = genId('guild');
  const guild = {
    id,
    name: String(name).slice(0, 40),
    tag: (tag ? String(tag).slice(0, 4) : '').toUpperCase(),
    founderUid: uid,
    tier: 'free',
    treasuryCredits: 0,
    liberatedCities: [],
    members: [{
      uid,
      characterName: character ? character.name : uid,
      role: 'founder',
      loyalty: 100,
      joinedAt: Date.now(),
    }],
    stats: { totalResources: 0, bossKills: 0, clanSize: 1 },
    createdAt: Date.now(),
  };
  guilds[id] = guild;
  saveGuilds(guilds);
  if (character) { character.guildId = id; chars[uid] = character; saveChars(chars); }
  res.json({ ok: true, guild });
});

// POST /guild/:id/join
router.post('/guild/:id/join', softAuth, json, (req, res) => {
  const uid = resolveUid(req);
  const guilds = loadGuilds();
  const guild = guilds[req.params.id];
  if (!guild) return res.status(404).json({ ok: false, error: 'guild not found' });
  if (guildForUser(uid)) return res.status(409).json({ ok: false, error: 'already in a guild — leave it first' });

  const chars = loadChars();
  const character = chars[uid];
  guild.members.push({
    uid,
    characterName: character ? character.name : uid,
    role: 'member',
    loyalty: 100,
    joinedAt: Date.now(),
  });
  guild.stats.clanSize = guild.members.length;
  guilds[guild.id] = guild;
  saveGuilds(guilds);
  if (character) { character.guildId = guild.id; chars[uid] = character; saveChars(chars); }
  res.json({ ok: true, guild });
});

// POST /guild/:id/leave
router.post('/guild/:id/leave', softAuth, json, (req, res) => {
  const uid = resolveUid(req);
  const guilds = loadGuilds();
  const guild = guilds[req.params.id];
  if (!guild) return res.status(404).json({ ok: false, error: 'guild not found' });
  if (!guild.members.some(m => m.uid === uid)) {
    return res.status(400).json({ ok: false, error: 'not a member of this guild' });
  }

  guild.members = guild.members.filter(m => m.uid !== uid);
  guild.stats.clanSize = guild.members.length;
  if (guild.members.length === 0) {
    delete guilds[guild.id];                 // last member out → disband
  } else {
    if (guild.founderUid === uid) {          // founder left → promote next member
      guild.founderUid = guild.members[0].uid;
      guild.members[0].role = 'founder';
    }
    guilds[guild.id] = guild;
  }
  saveGuilds(guilds);

  const chars = loadChars();
  if (chars[uid]) { chars[uid].guildId = null; saveChars(chars); }
  res.json({ ok: true });
});

// ── LEADERBOARD ───────────────────────────────────────────────────────────────

// GET /leaderboard?sort=resources|clanSize|bossKills&limit=N
router.get('/leaderboard', (req, res) => {
  const sortKey = ['resources', 'clanSize', 'bossKills'].includes(req.query.sort) ? req.query.sort : 'resources';
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const field = { resources: 'totalResources', clanSize: 'clanSize', bossKills: 'bossKills' }[sortKey];

  const guilds = Object.values(loadGuilds());
  const rows = guilds
    .map(g => ({
      guildId: g.id,
      guildName: g.name,
      guildTag: g.tag,
      value: (g.stats && g.stats[field]) || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, ...r }));

  res.json({ ok: true, sort: sortKey, rows });
});

module.exports = router;

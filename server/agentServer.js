/* agentServer.js – agent labor board (agents as citizens/workers)
   – endpoints:
     * GET  /agent/roster?characterId=<id>   – your hired agents (base roles + stationed Forge agents)
     * GET  /agent/forge-roster              – real agents created in the dashboard Forge, available to station
     * POST /agent/hire                      – hire a base role (Spark cost) OR station a real forged agent (free, id-based)
     * POST /agent/shift/{key}               – send agent on a work shift (energy cost)
     * POST /agent/collect/{key}             – collect finished shift yield (scales with level)
   – base role types: gatherer, merchant, scout, crafter
   – a "key" is either one of those role names, or a forgedAgentId when
     the agent is a real one created in the dashboard Forge
   – leveling: level = 1 + floor(shifts / 3); yield quantities scale by
     level, so repeatedly working an agent visibly levels it up
   – persistence: server/data/agents.json + server/data/characters.json
     (base roles/config) and backend/data/custom_agents.json (read-only,
     the real dashboard Forge roster -- lives in the main app, not this
     standalone server)
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sparksCore = require('./sparksCore');
// FORGE-AGENT-WIRING 1-9: body grants (identity from the server, ownership, idempotent collect, presence, release) - mounted FIRST so grant routes win; base-role keys fall through to the legacy routes below
router.use(require('./agentBodies'));

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data'); // env override = test isolation
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');
const FORGE_AGENTS_FILE = path.join(__dirname, '..', 'backend', 'data', 'custom_agents.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENTS_FILE)) fs.writeFileSync(AGENTS_FILE, '{}', 'utf8');

function loadFile(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function saveFile(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); }
function loadForgeAgents() {
  if (!fs.existsSync(FORGE_AGENTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(FORGE_AGENTS_FILE, 'utf8')); } catch (e) { return []; }
}

const AGENT_ROLES = {
  gatherer: { name: 'Gatherer', cost: 50, energy: 10, durationMs: 5 * 60 * 1000, yield: { ore: 3 } },
  merchant: { name: 'Merchant', cost: 80, energy: 15, durationMs: 5 * 60 * 1000, yield: { sparks: 20 } },
  scout:    { name: 'Scout',    cost: 60, energy: 12, durationMs: 5 * 60 * 1000, yield: { fiber: 2 } },
  crafter:  { name: 'Crafter',  cost: 100, energy: 20, durationMs: 5 * 60 * 1000, yield: { sword: 1 } }
};

function levelFromShifts(shifts) { return 1 + Math.floor((shifts || 0) / 3); }

/* GET /agent/forge-roster – real dashboard-forged agents available to station */
router.get('/forge-roster', (req, res) => {
  try {
    const agents = loadForgeAgents().map(a => ({
      id: a.id, name: a.name, emoji: a.emoji, role: a.role, avatarUrl: a.avatarUrl
    }));
    res.json({ success: true, agents });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.get('/roster', (req, res) => {
  try {
    const { characterId } = req.query;
    if (!characterId) return res.status(400).json({ success: false, error: 'Missing characterId' });
    const db = loadFile(AGENTS_FILE);
    const roster = db[characterId] || {};
    // surface computed level alongside stored fields, without mutating storage
    const withLevels = {};
    Object.entries(roster).forEach(([key, a]) => { withLevels[key] = { ...a, level: levelFromShifts(a.shifts) }; });
    res.json({ success: true, roster: withLevels, roles: AGENT_ROLES });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/hire', (req, res) => {
  try {
    const { characterId, role, forgedAgentId } = req.body;
    if (!characterId || (!role && !forgedAgentId)) return res.status(400).json({ success: false, error: 'Missing role or forgedAgentId' });

    const chars = loadFile(CHARS_FILE);
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });

    const db = loadFile(AGENTS_FILE);
    const roster = db[characterId] || {};

    let key, def;
    if (forgedAgentId) {
      const forged = loadForgeAgents().find(a => a.id === forgedAgentId);
      if (!forged) return res.status(404).json({ success: false, error: 'Forged agent not found in the dashboard roster' });
      key = forgedAgentId;
      // Stationing your own already-forged agent is free -- the value is
      // putting it to work in the 2D realm, not creating it again.
      def = { name: forged.name, emoji: forged.emoji, cost: 0, energy: 15, durationMs: 5 * 60 * 1000, yield: { sparks: 12 }, isForged: true };
    } else {
      def = AGENT_ROLES[role];
      if (!def) return res.status(404).json({ success: false, error: 'Unknown role' });
      key = role;
    }

    if (roster[key]) return res.status(409).json({ success: false, error: 'Already hired/stationed' });
    if (Object.keys(roster).length >= 4) return res.status(400).json({ success: false, error: 'Max 4 agents working at once' });

    char.currency = char.currency || { sparks: 0 };
    if ((char.currency.sparks || 0) < def.cost) return res.status(400).json({ success: false, error: 'Insufficient Sparks' });
    char.currency.sparks -= def.cost;
    saveFile(CHARS_FILE, chars);
    if (def.cost > 0) sparksCore.recordSink(char, def.cost, 'agent-hire', { ref: key });

    roster[key] = { key, name: def.name, emoji: def.emoji || null, isForged: !!def.isForged, energy: def.energy, durationMs: def.durationMs, yield: def.yield, hiredAt: Date.now(), shiftEndAt: 0, shifts: 0 };
    db[characterId] = roster;
    saveFile(AGENTS_FILE, db);
    res.json({ success: true, agent: { ...roster[key], level: 1 } });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/shift/:key', (req, res) => {
  try {
    const { characterId } = req.body;
    const { key } = req.params;
    if (!characterId || !key) return res.status(400).json({ success: false, error: 'Missing fields' });

    const db = loadFile(AGENTS_FILE);
    const agent = (db[characterId] || {})[key];
    if (!agent) return res.status(404).json({ success: false, error: 'Hire/station this agent first' });
    if (Date.now() < agent.shiftEndAt) return res.status(409).json({ success: false, error: 'Agent still working' });

    const chars = loadFile(CHARS_FILE);
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    // Same energy pool the character sheet and /venture use (char.stats.energy) --
    // this used to read/write a separate, never-initialized char.energy field
    // that had no connection to the character's actual stats.
    char.stats = char.stats || { energy: 100, maxEnergy: 100 };
    if (char.stats.energy < agent.energy) return res.status(400).json({ success: false, error: 'Not enough energy' });
    char.stats.energy -= agent.energy;
    saveFile(CHARS_FILE, chars);

    agent.shiftEndAt = Date.now() + agent.durationMs;
    db[characterId][key] = agent;
    saveFile(AGENTS_FILE, db);
    res.json({ success: true, agent, endsAt: agent.shiftEndAt });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/collect/:key', (req, res) => {
  try {
    const { characterId } = req.body;
    const { key } = req.params;
    if (!characterId || !key) return res.status(400).json({ success: false, error: 'Missing fields' });

    const db = loadFile(AGENTS_FILE);
    const agent = (db[characterId] || {})[key];
    if (!agent) return res.status(404).json({ success: false, error: 'Hire/station this agent first' });
    if (!agent.shiftEndAt) return res.status(400).json({ success: false, error: 'Agent not working' });
    if (Date.now() < agent.shiftEndAt) return res.status(400).json({ success: false, error: 'Shift not finished' });

    const chars = loadFile(CHARS_FILE);
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.inventory = char.inventory || {};
    char.currency = char.currency || { sparks: 0 };

    // Completing a shift levels the agent up (level = 1 + floor(shifts/3));
    // yield scales with the level the agent had going INTO this shift.
    const level = levelFromShifts(agent.shifts);
    const gained = {};
    for (const [item, qty] of Object.entries(agent.yield)) {
      const total = qty * level;
      gained[item] = total;
      if (item === 'sparks') char.currency.sparks = (char.currency.sparks || 0) + total;
      else char.inventory[item] = (char.inventory[item] || 0) + total;
    }
    saveFile(CHARS_FILE, chars);
    if (gained.sparks) sparksCore.recordChange(char, gained.sparks, 'agent-yield', { ref: key });

    agent.shiftEndAt = 0;
    agent.shifts = (agent.shifts || 0) + 1;
    db[characterId][key] = agent;
    saveFile(AGENTS_FILE, db);
    res.json({ success: true, gained, level, newLevel: levelFromShifts(agent.shifts), inventory: char.inventory, sparks: char.currency.sparks });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;

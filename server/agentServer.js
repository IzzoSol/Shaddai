/* agentServer.js – agent labor board (agents as citizens/workers)
   – endpoints:
     * GET  /agent/roster?characterId=<id>   – your hired agents
     * POST /agent/hire                      – hire an agent (Spark cost)
     * POST /agent/shift/{role}              – send agent on a work shift (energy cost)
     * POST /agent/collect/{role}            – collect finished shift yield
   – role types: gatherer, merchant, scout, crafter
   – persistence: server/data/agents.json + server/data/characters.json
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENTS_FILE)) fs.writeFileSync(AGENTS_FILE, '{}', 'utf8');

function loadFile(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function saveFile(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); }

const AGENT_ROLES = {
  gatherer: { name: 'Gatherer', cost: 50, energy: 10, durationMs: 5 * 60 * 1000, yield: { ore: 3 } },
  merchant: { name: 'Merchant', cost: 80, energy: 15, durationMs: 5 * 60 * 1000, yield: { sparks: 20 } },
  scout:    { name: 'Scout',    cost: 60, energy: 12, durationMs: 5 * 60 * 1000, yield: { fiber: 2 } },
  crafter:  { name: 'Crafter',  cost: 100, energy: 20, durationMs: 5 * 60 * 1000, yield: { sword: 1 } }
};

router.get('/roster', (req, res) => {
  try {
    const { characterId } = req.query;
    if (!characterId) return res.status(400).json({ success: false, error: 'Missing characterId' });
    const db = loadFile(AGENTS_FILE);
    res.json({ success: true, roster: db[characterId] || {}, roles: AGENT_ROLES });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/hire', (req, res) => {
  try {
    const { characterId, role } = req.body;
    if (!characterId || !role) return res.status(400).json({ success: false, error: 'Missing fields' });
    const def = AGENT_ROLES[role];
    if (!def) return res.status(404).json({ success: false, error: 'Unknown role' });

    const chars = loadFile(CHARS_FILE);
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.currency = char.currency || { sparks: 0 };
    if ((char.currency.sparks || 0) < def.cost) return res.status(400).json({ success: false, error: 'Insufficient Sparks' });

    const db = loadFile(AGENTS_FILE);
    const roster = db[characterId] || {};
    if (roster[role]) return res.status(409).json({ success: false, error: 'Already hired this role' });
    if (Object.keys(roster).length >= 4) return res.status(400).json({ success: false, error: 'Max 4 agents' });

    char.currency.sparks -= def.cost;
    saveFile(CHARS_FILE, chars);

    roster[role] = { role, name: def.name, hiredAt: Date.now(), shiftEndAt: 0, shifts: 0 };
    db[characterId] = roster;
    saveFile(AGENTS_FILE, db);
    res.json({ success: true, agent: roster[role] });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/shift/:role', (req, res) => {
  try {
    const { characterId } = req.body;
    const { role } = req.params;
    if (!characterId || !role) return res.status(400).json({ success: false, error: 'Missing fields' });
    const def = AGENT_ROLES[role];
    if (!def) return res.status(404).json({ success: false, error: 'Unknown role' });

    const db = loadFile(AGENTS_FILE);
    const agent = (db[characterId] || {})[role];
    if (!agent) return res.status(404).json({ success: false, error: 'Hire this role first' });
    if (Date.now() < agent.shiftEndAt) return res.status(409).json({ success: false, error: 'Agent still working' });

    const chars = loadFile(CHARS_FILE);
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.energy = char.energy || 100;
    if (char.energy < def.energy) return res.status(400).json({ success: false, error: 'Not enough energy' });
    char.energy -= def.energy;
    saveFile(CHARS_FILE, chars);

    agent.shiftEndAt = Date.now() + def.durationMs;
    agent.shifts = (agent.shifts || 0) + 1;
    db[characterId][role] = agent;
    saveFile(AGENTS_FILE, db);
    res.json({ success: true, agent, endsAt: agent.shiftEndAt });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/collect/:role', (req, res) => {
  try {
    const { characterId } = req.body;
    const { role } = req.params;
    if (!characterId || !role) return res.status(400).json({ success: false, error: 'Missing fields' });
    const def = AGENT_ROLES[role];
    if (!def) return res.status(404).json({ success: false, error: 'Unknown role' });

    const db = loadFile(AGENTS_FILE);
    const agent = (db[characterId] || {})[role];
    if (!agent) return res.status(404).json({ success: false, error: 'Hire this role first' });
    if (!agent.shiftEndAt) return res.status(400).json({ success: false, error: 'Agent not working' });
    if (Date.now() < agent.shiftEndAt) return res.status(400).json({ success: false, error: 'Shift not finished' });

    const chars = loadFile(CHARS_FILE);
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.inventory = char.inventory || {};
    char.currency = char.currency || { sparks: 0 };
    for (const [item, qty] of Object.entries(def.yield)) {
      if (item === 'sparks') char.currency.sparks = (char.currency.sparks || 0) + qty;
      else char.inventory[item] = (char.inventory[item] || 0) + qty;
    }
    saveFile(CHARS_FILE, chars);

    agent.shiftEndAt = 0;
    saveFile(AGENTS_FILE, db);
    res.json({ success: true, gained: def.yield, inventory: char.inventory, sparks: char.currency.sparks });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
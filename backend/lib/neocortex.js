// neocortex.js — persistent per-agent/per-user memory + bond levels with conscious recall.
//   JSON-backed store at backend/data/neocortex.json
//   shape: { "<AGENT>/<user>": { bond, count, last, memory:[{role,content,at,tags}] } }
//   Agents bond with users over interactions; recall is injected into agent context once trust is earned.
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'data', 'neocortex.json');
const MEM_CAP = 50;          // max memory entries per agent/user pair
const BOND_MAX = 100;

// ── bond deltas per interaction type ──
const DELTAS = { skill_run: 1, task_complete: 3, bazaar_buy: 2, daily_login: 0.5 };

// ── level table: [min, max, label, recallCount] ──
const LEVELS = [
  { min: 0,  max: 19,  label: 'Stranger',     recall: 0 },
  { min: 20, max: 39,  label: 'Acquaintance', recall: 0 },
  { min: 40, max: 59,  label: 'Ally',         recall: 3 },
  { min: 60, max: 79,  label: 'Trusted',      recall: 10 },
  { min: 80, max: 100, label: 'Bonded',       recall: 10 },
];

function levelFor(bond) {
  for (const l of LEVELS) if (bond >= l.min && bond <= l.max) return l;
  return LEVELS[LEVELS.length - 1];
}

// ── atomic-ish JSON read/write helpers (mirrors district-routes.js style) ──
function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { return {}; }
}
function writeStore(db) {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    const tmp = STORE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, STORE);
  } catch (e) {}
}

function keyFor(agent, user) {
  return String(agent || 'SHADDAI').toUpperCase() + '/' + String(user || 'guest');
}
function blank() { return { bond: 0, count: 0, last: null, memory: [] }; }

// ── public API ──
function getBond(agent, user) {
  const db = readStore();
  const rec = db[keyFor(agent, user)] || blank();
  const lvl = levelFor(rec.bond);
  return { bond: rec.bond, level: LEVELS.indexOf(lvl), label: lvl.label, count: rec.count, last: rec.last };
}

function incrementBond(agent, user, type) {
  const delta = DELTAS[type] != null ? DELTAS[type] : 0;
  const db = readStore();
  const k = keyFor(agent, user);
  const rec = db[k] || blank();
  rec.bond = Math.min(BOND_MAX, rec.bond + delta);
  rec.count = (rec.count || 0) + 1;
  rec.last = Date.now();
  db[k] = rec;
  writeStore(db);
  return rec.bond;
}

function addMemory(agent, user, { role, content, tags } = {}) {
  const db = readStore();
  const k = keyFor(agent, user);
  const rec = db[k] || blank();
  rec.memory = rec.memory || [];
  rec.memory.push({
    role: role || 'user',
    content: String(content || '').slice(0, 4000),
    at: Date.now(),
    tags: Array.isArray(tags) ? tags : (tags ? [String(tags)] : []),
  });
  if (rec.memory.length > MEM_CAP) rec.memory = rec.memory.slice(-MEM_CAP);
  db[k] = rec;
  writeStore(db);
  return rec.memory.length;
}

function getRecentMemory(agent, user, limit) {
  const db = readStore();
  const rec = db[keyFor(agent, user)] || blank();
  const n = Math.max(0, parseInt(limit, 10) || 10);
  return (rec.memory || []).slice(-n);
}

function buildAgentContext(agent, user, userMessage) {
  const { bond, label } = getBond(agent, user);
  const lvl = levelFor(bond);
  const messages = [];
  let recentText = '';
  if (bond >= 40 && lvl.recall > 0) {
    const recent = getRecentMemory(agent, user, lvl.recall);
    recentText = recent.map(m => `${m.role}: ${m.content}`).join(' | ');
  }
  messages.push({
    role: 'system',
    content: `Bond level: ${bond} (${label}). Recent context: ${recentText}`,
  });
  messages.push({ role: 'user', content: String(userMessage || '') });
  return messages;
}

module.exports = { getBond, incrementBond, addMemory, getRecentMemory, buildAgentContext, DELTAS, LEVELS };

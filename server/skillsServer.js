/* skillsServer.js – skill training + Total Level (RS-style)
   – endpoints:
     * GET  /skills/state?characterId=   – per-skill xp/level + totalLevel
     * POST /skills/train                – train one skill (fixed XP per call, 2s cooldown)
   – Total Level = sum of every skill's level. Mirrored onto
     characters.json as char.totalLevel so other systems (market gate,
     soft token wall) can read it without recomputing.
   – persistence: server/data/skills.json + server/data/characters.json
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SKILLS_FILE = path.join(DATA_DIR, 'skills.json');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SKILLS_FILE)) fs.writeFileSync(SKILLS_FILE, '{}', 'utf8');

function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function saveJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }

const SKILLS = ['mining', 'woodcutting', 'crafting', 'foraging', 'trading'];
const XP_PER_TRAIN = 25;
const TRAIN_COOLDOWN_MS = 2000;
const MAX_LEVEL = 99;

function levelFromXp(xp) { return Math.min(MAX_LEVEL, 1 + Math.floor(xp / 100)); }

function ensureCharSkills(db, characterId) {
  if (!db[characterId]) {
    db[characterId] = {};
    SKILLS.forEach(s => { db[characterId][s] = { xp: 0, lastTrainAt: 0 }; });
  }
  return db[characterId];
}

function summarize(rec) {
  const skills = {};
  let totalLevel = 0;
  SKILLS.forEach(s => {
    const xp = (rec[s] && rec[s].xp) || 0;
    const level = levelFromXp(xp);
    skills[s] = { xp, level };
    totalLevel += level;
  });
  return { skills, totalLevel };
}

function mirrorTotalLevel(characterId, totalLevel) {
  if (!fs.existsSync(CHARS_FILE)) return;
  const chars = loadJson(CHARS_FILE);
  if (chars[characterId]) {
    chars[characterId].totalLevel = totalLevel;
    saveJson(CHARS_FILE, chars);
  }
}

router.get('/state', (req, res) => {
  try {
    const { characterId } = req.query;
    if (!characterId) return res.status(400).json({ success: false, error: 'Missing characterId' });
    const db = loadJson(SKILLS_FILE);
    const rec = ensureCharSkills(db, characterId);
    saveJson(SKILLS_FILE, db);
    const summary = summarize(rec);
    mirrorTotalLevel(characterId, summary.totalLevel);
    res.json({ success: true, ...summary });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/train', (req, res) => {
  try {
    const { characterId, skill } = req.body;
    if (!characterId || !skill) return res.status(400).json({ success: false, error: 'Missing fields' });
    if (!SKILLS.includes(skill)) return res.status(400).json({ success: false, error: 'Unknown skill' });

    const db = loadJson(SKILLS_FILE);
    const rec = ensureCharSkills(db, characterId);
    const now = Date.now();
    if (now - (rec[skill].lastTrainAt || 0) < TRAIN_COOLDOWN_MS) {
      return res.status(429).json({ success: false, error: 'Training too fast, wait a moment' });
    }
    rec[skill].xp += XP_PER_TRAIN;
    rec[skill].lastTrainAt = now;
    saveJson(SKILLS_FILE, db);

    const summary = summarize(rec);
    mirrorTotalLevel(characterId, summary.totalLevel);
    res.json({ success: true, skill, xpGained: XP_PER_TRAIN, ...summary });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
module.exports.SKILLS = SKILLS;
module.exports.levelFromXp = levelFromXp;

/* Helper other route files can use without an HTTP round-trip:
   readTotalLevel(characterId) -> number (0 if never trained) */
module.exports.readTotalLevel = function readTotalLevel(characterId) {
  if (!fs.existsSync(SKILLS_FILE)) return 0;
  const db = loadJson(SKILLS_FILE);
  if (!db[characterId]) return 0;
  return summarize(db[characterId]).totalLevel;
};

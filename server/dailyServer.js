/* dailyServer.js – rotating daily quest board + streak rewards
   – endpoints:
     * GET  /daily/board?characterId=    – today's 4 daily quests + status
     * POST /daily/accept                – lock a quest for the day
     * POST /daily/progress              – add progress toward a daily
     * POST /daily/claim                 – claim the quest reward
     * POST /daily/drop                  – drop a quest (refreshes the pool automatically)
   – persistence: server/data/daily.json
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sparksCore = require('./sparksCore');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data'); // env override = test isolation
const DAILY_FILE = path.join(DATA_DIR, 'daily.json');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return JSON.parse(JSON.stringify(fallback));
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return JSON.parse(JSON.stringify(fallback)); }
}
function saveJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }

// Daily quest pool – weighted, indexes rotate per UTC day
const POOL = [
  { id: 'd_mine',    name: 'Miner',      desc: 'Collect ore',            target: 10, reward: 60, type: 'gather'  },
  { id: 'd_slay',    name: 'Slayer',     desc: 'Defeat wilderness mobs', target: 8,  reward: 80, type: 'combat'  },
  { id: 'd_trade',   name: 'Merchant',   desc: 'Complete market trades', target: 3,  reward: 50, type: 'market'  },
  { id: 'd_shop',    name: 'Patron',     desc: 'Use shop services',      target: 5,  reward: 45, type: 'service' },
  { id: 'd_plant',   name: 'Gardener',   desc: 'Plant crops on a plot',  target: 6,  reward: 40, type: 'housing' },
  { id: 'd_train',   name: 'Scholar',    desc: 'Train a skill tree',     target: 4,  reward: 55, type: 'skills'  },
  { id: 'd_agent',   name: 'Boss',       desc: 'Command an agent shift', target: 1,  reward: 70, type: 'agents'  }
];

router.get('/board', (req, res) => {
  try {
    const { characterId } = req.query;
    if (!characterId) return res.status(400).json({ success: false, error: 'Missing characterId' });
    const db = loadJson(DAILY_FILE, {});
    const today = new Date().toISOString().slice(0, 10);
    const day = parseInt(today.replace(/\D/g, ''), 10);
    let rec = db[characterId];
    if (!rec || rec.date !== today) {
      // roll a fresh board for today (seeded by characterId + date)
      const pool = POOL.slice().sort((a, b) => (a.id + characterId + today < b.id + characterId + today ? -1 : 1));
      const picks = pool.slice(0, 4).map(q => ({ ...q, progress: 0, accepted: false, claimed: false }));
      rec = { date: today, seed: day + characterId.length, quests: picks };
      db[characterId] = rec;
      saveJson(DAILY_FILE, db);
    }
    res.json({ success: true, date: rec.date, quests: rec.quests });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/accept', (req, res) => {
  try {
    const { characterId, questId } = req.body;
    if (!characterId || !questId) return res.status(400).json({ success: false, error: 'Missing fields' });
    const db = loadJson(DAILY_FILE, {});
    const rec = db[characterId];
    if (!rec) return res.status(404).json({ success: false, error: 'No board – GET /daily/board first' });
    const q = rec.quests.find(x => x.id === questId);
    if (!q) return res.status(404).json({ success: false, error: 'Quest not on today board' });
    if (q.accepted) return res.status(409).json({ success: false, error: 'Already accepted' });
    q.accepted = true;
    saveJson(DAILY_FILE, db);
    res.json({ success: true, quest: q });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/progress', (req, res) => {
  try {
    const { characterId, questId, amount = 1 } = req.body;
    if (!characterId || !questId) return res.status(400).json({ success: false, error: 'Missing fields' });
    const db = loadJson(DAILY_FILE, {});
    const rec = db[characterId];
    if (!rec) return res.status(404).json({ success: false, error: 'No board – GET /daily/board first' });
    const q = rec.quests.find(x => x.id === questId);
    if (!q) return res.status(404).json({ success: false, error: 'Quest not on today board' });
    if (!q.accepted) return res.status(400).json({ success: false, error: 'Accept the quest first' });
    q.progress = Math.min(q.target, (q.progress || 0) + amount);
    saveJson(DAILY_FILE, db);
    res.json({ success: true, quest: q });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/claim', (req, res) => {
  try {
    const { characterId, questId } = req.body;
    if (!characterId || !questId) return res.status(400).json({ success: false, error: 'Missing fields' });
    const db = loadJson(DAILY_FILE, {});
    const rec = db[characterId];
    if (!rec) return res.status(404).json({ success: false, error: 'No board – GET /daily/board first' });
    const q = rec.quests.find(x => x.id === questId);
    if (!q) return res.status(404).json({ success: false, error: 'Quest not on today board' });
    if (!q.accepted || q.progress < q.target) return res.status(400).json({ success: false, error: 'Quest not completed' });
    if (q.claimed) return res.status(409).json({ success: false, error: 'Already claimed' });

    const chars = loadJson(CHARS_FILE, {});
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.currency = char.currency || { sparks: 0 };
    char.currency.sparks = (char.currency.sparks || 0) + q.reward;
    saveJson(CHARS_FILE, chars);
    sparksCore.recordChange(char, q.reward, 'daily-quest', { ref: String(questId) });

    q.claimed = true;
    saveJson(DAILY_FILE, db);
    res.json({ success: true, reward: q.reward, questId });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/drop', (req, res) => {
  try {
    const { characterId, questId } = req.body;
    if (!characterId || !questId) return res.status(400).json({ success: false, error: 'Missing fields' });
    const db = loadJson(DAILY_FILE, {});
    const rec = db[characterId];
    if (!rec) return res.status(404).json({ success: false, error: 'No board – GET /daily/board first' });
    const q = rec.quests.find(x => x.id === questId);
    if (!q) return res.status(404).json({ success: false, error: 'Quest not on today board' });
    // consume an unused pool quest as replacement
    const used = new Set(rec.quests.map(x => x.id));
    const repl = POOL.find(x => !used.has(x.id));
    if (!repl) return res.status(400).json({ success: false, error: 'No replacement left today' });
    Object.assign(q, { ...repl, progress: 0, accepted: false, claimed: false });
    saveJson(DAILY_FILE, db);
    res.json({ success: true, quest: q });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
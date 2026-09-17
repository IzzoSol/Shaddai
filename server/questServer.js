/* questServer.js – simple quest / daily system
   – endpoints:
     * POST /quest/accepted  – player accepts a quest
     * POST /quest/progress  – submit progress (amount); auto-completes at target
     * POST /quest/complete  – turn in a completed quest, grant reward
   – rewards (XP + Sparks) are applied to the character store and a bridge
     event is fired. Progress persists in <characterId>.json.
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const QUESTS_FILE = path.join(__dirname, 'data', 'quests.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(QUESTS_FILE)) fs.writeFileSync(QUESTS_FILE, '[]', 'utf8');

function loadQuests() { return JSON.parse(fs.readFileSync(QUESTS_FILE, 'utf8')); }
function saveQuests(db) { fs.writeFileSync(QUESTS_FILE, JSON.stringify(db, null, 2), 'utf8'); }

function broadcast(event) {
  if (global.shaddai_bridge && global.shaddai_bridge.post) {
    global.shaddai_bridge.post(event);
  }
}

/* Character store lives alongside quests (data/char_<id>.json) */
function charPath(characterId) {
  return path.join(path.dirname(QUESTS_FILE), `char_${characterId}.json`);
}
function loadChar(characterId) {
  if (!fs.existsSync(charPath(characterId))) return {};
  return JSON.parse(fs.readFileSync(charPath(characterId), 'utf8'));
}
function saveChar(characterId, store) {
  fs.writeFileSync(charPath(characterId), JSON.stringify(store, null, 2), 'utf8');
}

/* --------------------------------------------------------------
   QUEST DEFINITIONS (example starter set)
   -------------------------------------------------------------- */
const starterQuests = [
  { id: 'q1', title: 'Gather 10 Iron Ore', description: 'Mine iron ore from the Wasteland and bring it to the Forge.', type: 'gather', targetItem: 'ore', targetAmount: 10, rewardXP: 150, rewardSparks: 30, repeatable: false },
  { id: 'q2', title: 'Craft 5 Iron Swords', description: 'Craft swords using iron ore at the Forge.', type: 'craft', targetItem: 'sword', targetAmount: 5, rewardXP: 200, rewardSparks: 40, repeatable: false },
  { id: 'daily_01', title: 'Daily: Collect 5 Fiber', description: 'Harvest fiber from grass nodes.', type: 'gather', targetItem: 'fiber', targetAmount: 5, rewardXP: 50, rewardSparks: 10, repeatable: true, resetAt: '00:00' }
];

function ensureInitialQuests() {
  const db = loadQuests();
  if (db.length === 0) saveQuests([...starterQuests]);
}
ensureInitialQuests();

/* --------------------------------------------------------------
   POST /quest/accepted – player accepts a quest
   payload: { questId, characterId }
   -------------------------------------------------------------- */
router.post('/accepted', (req, res) => {
  try {
    const { questId, characterId } = req.body;
    if (!questId || !characterId) return res.status(400).json({ success: false, error: 'Missing fields' });

    const quest = loadQuests().find(q => q.id === questId);
    if (!quest) return res.status(404).json({ success: false, error: 'Quest not found' });

    const store = loadChar(characterId);
    if (store[`quest_${questId}`]) return res.status(409).json({ success: false, error: 'Quest already active' });
    store[`quest_${questId}`] = 'accepted';
    store[`progress_${questId}`] = 0;
    saveChar(characterId, store);

    broadcast({ type: 'quest_accepted', payload: { questId, characterId } });
    res.json({ success: true, message: `Quest ${questId} accepted` });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* --------------------------------------------------------------
   POST /quest/progress – submit progress; auto-completes at target
   payload: { questId, characterId, amount }
   -------------------------------------------------------------- */
router.post('/progress', (req, res) => {
  try {
    const { questId, characterId, amount } = req.body;
    if (!questId || !characterId) return res.status(400).json({ success: false, error: 'Missing fields' });
    if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });

    const quest = loadQuests().find(q => q.id === questId);
    if (!quest) return res.status(404).json({ success: false, error: 'Quest not found' });

    const store = loadChar(characterId);
    if (!store[`quest_${questId}`]) return res.status(404).json({ success: false, error: 'Quest not accepted' });

    const current = parseInt(store[`progress_${questId}`] || '0') || 0;
    const newVal = Math.min(current + amount, quest.targetAmount);
    store[`progress_${questId}`] = newVal;
    saveChar(characterId, store);

    broadcast({ type: 'quest_progress', payload: { questId, characterId, progress: newVal, target: quest.targetAmount } });

    if (newVal >= quest.targetAmount) {
      return completeQuest(questId, characterId, res);
    }
    res.json({ success: true, progress: newVal, target: quest.targetAmount });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* --------------------------------------------------------------
   POST /quest/complete – turn in a completed quest
   payload: { questId, characterId }
   -------------------------------------------------------------- */
router.post('/complete', (req, res) => {
  try {
    const { questId, characterId } = req.body;
    if (!questId || !characterId) return res.status(400).json({ success: false, error: 'Missing fields' });
    completeQuest(questId, characterId, res);
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

/* Share the completion logic (used by /progress auto-complete and /complete) */
function completeQuest(questId, characterId, res) {
  const quest = loadQuests().find(q => q.id === questId);
  if (!quest) return res.status(404).json({ success: false, error: 'Quest not found' });

  const store = loadChar(characterId);
  if (!store[`quest_${questId}`]) return res.status(404).json({ success: false, error: 'Quest not active' });

  // Grant rewards on the character store
  store.currency = store.currency || {};
  store.currency.sparks = (store.currency.sparks || 0) + quest.rewardSparks;
  store.totalXP = (store.totalXP || 0) + quest.rewardXP;
  store.questLog = store.questLog || [];
  store.questLog.push({ questId, completedAt: new Date().toISOString(), rewardXP: quest.rewardXP, rewardSparks: quest.rewardSparks });

  // Clear accept + progress flags
  delete store[`quest_${questId}`];
  delete store[`progress_${questId}`];
  saveChar(characterId, store);

  broadcast({ type: 'quest_completed', payload: { questId, characterId, rewardXP: quest.rewardXP, rewardSparks: quest.rewardSparks } });
  res.json({ success: true, message: `Quest ${questId} completed – rewards granted`, rewardXP: quest.rewardXP, rewardSparks: quest.rewardSparks });
}

module.exports = router;
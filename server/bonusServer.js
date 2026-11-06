/* bonusServer.js – daily login streak + stipend
   – endpoints:
     * GET  /bonus/state?characterId=<id>  – streak, next amount, claimedToday
     * POST /bonus/claim                   – claim daily Spark stipend (once per UTC day)
   – persistence: server/data/bonus.json + server/data/char_<id>.json
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sparksCore = require('./sparksCore');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data'); // env override = test isolation
const BONUS_FILE = path.join(DATA_DIR, 'bonus.json');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BONUS_FILE)) fs.writeFileSync(BONUS_FILE, '{}', 'utf8');

function loadBonus() { return JSON.parse(fs.readFileSync(BONUS_FILE, 'utf8')); }
function saveBonus(db) { fs.writeFileSync(BONUS_FILE, JSON.stringify(db, null, 2), 'utf8'); }
function loadChars() { return JSON.parse(fs.readFileSync(CHARS_FILE, 'utf8')); }
function saveChars(chars) { fs.writeFileSync(CHARS_FILE, JSON.stringify(chars, null, 2), 'utf8'); }

function todayStr() { return new Date().toISOString().slice(0, 10); }

function isConsecutive(lastDate) {
  if (!lastDate) return false;
  const last = new Date(lastDate + 'T00:00:00Z');
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return last.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

const BASE_AMOUNT = 20;

router.get('/state', (req, res) => {
  try {
    const { characterId } = req.query;
    if (!characterId) return res.status(400).json({ success: false, error: 'Missing characterId' });
    const db = loadBonus();
    const rec = db[characterId] || {};
    const today = todayStr();
    const streak = rec.streak || 0;
    res.json({
      success: true,
      claimedToday: rec.lastClaim === today,
      streak,
      nextAmount: BASE_AMOUNT + (streak) * 5
    });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/claim', (req, res) => {
  try {
    const { characterId } = req.body;
    if (!characterId) return res.status(400).json({ success: false, error: 'Missing characterId' });

    const db = loadBonus();
    const rec = db[characterId] || {};
    const today = todayStr();
    if (rec.lastClaim === today) return res.status(409).json({ success: false, error: 'Already claimed today' });

    const streak = isConsecutive(rec.lastClaim) ? (rec.streak || 0) + 1 : 1;
    const amount = BASE_AMOUNT + (streak - 1) * 5;

    // Credit Spark to the canonical character store
    const chars = loadChars();
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.currency = char.currency || { sparks: 0 };
    char.currency.sparks = (char.currency.sparks || 0) + amount;
    saveChars(chars);
    sparksCore.recordChange(char, amount, 'login-bonus', { note: 'streak ' + streak });

    db[characterId] = { lastClaim: today, streak };
    saveBonus(db);

    res.json({ success: true, amount, streak, nextAmount: BASE_AMOUNT + streak * 5 });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
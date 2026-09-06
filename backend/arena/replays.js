'use strict';
// ============================================================================
// arena/replays.js - Write/read match replays to data/replays/{matchId}.json
// Winner can be recovered WITHOUT the socket (pure file IO).
// ============================================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data', 'replays');
const MAX_REPLAYS = 2000;

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function writeReplay(replay) {
  ensureDir();
  const file = path.join(DATA_DIR, replay.match.id + '.json');
  try {
    fs.writeFileSync(file, JSON.stringify(replay, null, 2));
    // Trim oldest to avoid unbounded growth.
    try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
      while (files.length > MAX_REPLAYS) {
        const old = files.shift();
        fs.unlinkSync(path.join(DATA_DIR, old));
      }
    } catch (_) {}
  } catch (e) {
    console.warn('[replays] write failed:', e.message);
  }
}

function readReplay(matchId) {
  const file = path.join(DATA_DIR, matchId + '.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function listReplays(limit) {
  ensureDir();
  try {
    return fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort().slice(-(limit || 50));
  } catch (_) { return []; }
}

module.exports = { writeReplay, readReplay, listReplays };

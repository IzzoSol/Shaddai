/* dailybonus.js – grants each logged‑in character a daily Spark stipend.
   Runs hourly via the SHADDAI scheduler. It checks each character’s
   last‑claimed date; if a new UTC day has started it credits Sparks
   and updates the stored timestamp.
   Persistence: data/bonus_timestamps.json and data/characters.json.
*/

const fs = require('fs');
const path = require('path');

// Paths (using forward slashes for reliability)
const CHAR_STORE = path.join(__dirname, '..', '..', 'data', 'characters.json');
const BONUS_STORE = path.join(__dirname, '..', '..', 'data', 'bonus_timestamps.json');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Ensure stores exist
if (!fs.existsSync(CHAR_STORE)) fs.writeFileSync(CHAR_STORE, JSON.stringify({}), 'utf8');
if (!fs.existsSync(BONUS_STORE)) fs.writeFileSync(BONUS_STORE, JSON.stringify({}), 'utf8');

/* Helper functions */
function loadChars() { return JSON.parse(fs.readFileSync(CHAR_STORE, 'utf8')); }
function saveChars(chars) { fs.writeFileSync(CHAR_STORE, JSON.stringify(chars, null, 2), 'utf8'); }
function loadStamps() { return JSON.parse(fs.readFileSync(BONUS_STORE, 'utf8')); }
function saveStamps(stamps) { fs.writeFileSync(BONUS_STORE, JSON.stringify(stamps, null, 2), 'utf8'); }

function creditDailyBonus(charId, amount = 20) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY‑MM‑DD

  const stamps = loadStamps();
  const last = stamps[charId] || '';

  if (last !== today) {
    // Load character data
    const charPath = path.join(path.dirname(CHAR_STORE), `char_${charId}.json`);
    if (fs.existsSync(charPath)) {
      const data = JSON.parse(fs.readFileSync(charPath, 'utf8'));
      data.currency = data.currency || { sparks: 0 };
      data.currency.sparks = (data.currency.sparks || 0) + amount;
      fs.writeFileSync(charPath, JSON.stringify(data), 'utf8');

      // Update stamp
      stamps[charId] = today;
      fs.writeFileSync(BONUS_STORE, JSON.stringify(stamps), 'utf8');

      // Notify UI via bridge (if available)
      if (typeof shaddai_hall_post === 'function') {
        shaddai_hall_post({ text: `🎁 Daily bonus: +${amount} Sparks`, channel: `user_${charId}` });
      }
    }
  }
}

/* --------------------------------------------------------------
   Scheduler registration – runs hourly
   -------------------------------------------------------------- */
function registerJob() {
  if (typeof shaddai_sched_add !== 'function') return;
  // The scheduler call format (type, payload, everyMs, at, priority, timeout)
  shaddai_sched_add('daily_bonus_check', '', 60 * 60 * 1000, null, 0, 30000, () => {
    // When the timer fires, scan all characters and credit if needed
    const chars = loadChars();
    Object.values(chars).forEach(c => creditDailyBonus(c.id));
  });
}

/* Auto‑run on module load */
registerJob();

module.exports = { creditDailyBonus };
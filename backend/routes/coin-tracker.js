/**
 * Coin Tracker - Historical FDV Baseline
 * Stores FIRST-SEEN FDV for every coin to calculate real multipliers
 * Without this, multipliers break for coins already pumped when discovered
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const COIN_HISTORY_FILE = path.join(DATA_DIR, 'coin-history.json');

/**
 * Get or create coin entry with first-seen FDV
 */
function trackCoin(mint, symbol, currentFdv) {
  if (!mint || !currentFdv || currentFdv === 0) {
    return null;
  }

  let history = {};
  try {
    if (fs.existsSync(COIN_HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(COIN_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    history = {};
  }

  const mintLower = mint.toLowerCase();

  // If coin not tracked yet, this is the ENTRY FDV
  if (!history[mintLower]) {
    history[mintLower] = {
      mint,
      symbol,
      firstSeenFdv: currentFdv,
      firstSeenAt: Date.now(),
      lowestFdv: currentFdv,
      highestFdv: currentFdv,
      lastSeenFdv: currentFdv,
      lastSeenAt: Date.now(),
    };
  } else {
    // Update last seen, track min/max
    history[mintLower].lastSeenFdv = currentFdv;
    history[mintLower].lastSeenAt = Date.now();
    history[mintLower].lowestFdv = Math.min(history[mintLower].lowestFdv, currentFdv);
    history[mintLower].highestFdv = Math.max(history[mintLower].highestFdv, currentFdv);
  }

  fs.writeFileSync(COIN_HISTORY_FILE, JSON.stringify(history, null, 2));
  return history[mintLower];
}

/**
 * Get the baseline FDV for multiplier calculation
 * CRITICAL: don't call if coin is too new (< 30s) or if discovered already pumped
 * Returns: { entryFdv, currentFdv, curMult, peakMult, reason, tooYoung }
 */
function getMultiplierBaseline(mint, currentFdv) {
  if (!mint || !currentFdv || currentFdv === 0) {
    return {
      entryFdv: currentFdv,
      currentFdv,
      curMult: 1,
      peakMult: 1,
      reason: 'no-baseline',
      tooYoung: false,
    };
  }

  let history = {};
  try {
    if (fs.existsSync(COIN_HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(COIN_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    history = {};
  }

  const mintLower = mint.toLowerCase();
  const coinRecord = history[mintLower];
  const now = Date.now();

  if (!coinRecord) {
    // First time seeing this coin - TOO YOUNG, don't call yet
    return {
      entryFdv: currentFdv,
      currentFdv,
      curMult: 1,
      peakMult: 1,
      reason: 'first-seen',
      tooYoung: true, // Wait 30 seconds before calling
      ageMs: 0,
    };
  }

  // Calculate multipliers using FIRST-SEEN FDV as baseline
  const entryFdv = coinRecord.firstSeenFdv;
  const curMult = parseFloat((currentFdv / entryFdv).toFixed(2));
  const peakMult = parseFloat((coinRecord.highestFdv / entryFdv).toFixed(2));
  const ageMs = now - coinRecord.firstSeenAt;

  return {
    entryFdv,
    currentFdv,
    curMult,
    peakMult,
    reason: 'tracked',
    firstSeenAt: coinRecord.firstSeenAt,
    lowestFdv: coinRecord.lowestFdv,
    highestFdv: coinRecord.highestFdv,
    ageMs,
    tooYoung: ageMs < 30000, // Must be tracked for 30+ seconds
  };
}

module.exports = {
  trackCoin,
  getMultiplierBaseline,
};

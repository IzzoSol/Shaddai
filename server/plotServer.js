/* plotServer.js – housing / land ownership
   – endpoints:
     * GET  /plot/list       – plots owned by a character
     * POST /plot/buy        – buy a starting plot
     * POST /plot/assign     – station an agent in a plot (for idle yield)
     * POST /plot/collect    – collect passive yield produced by a stationed agent
   – persistence: server/data/plots.json
*/
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sparksCore = require('./sparksCore');

const DATA_DIR = process.env.SHADDAI_MMO_DATA || path.join(__dirname, 'data'); // env override = test isolation
const PLOTS_FILE = path.join(DATA_DIR, 'plots.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PLOTS_FILE)) fs.writeFileSync(PLOTS_FILE, '{}', 'utf8');

function loadPlots() { return JSON.parse(fs.readFileSync(PLOTS_FILE, 'utf8')); }
function savePlots(db) { fs.writeFileSync(PLOTS_FILE, JSON.stringify(db, null, 2), 'utf8'); }

function broadcast(event) {
  if (global.shaddai_bridge && global.shaddai_bridge.post) {
    global.shaddai_bridge.post(event);
  }
}

/* Plot price and idle-yield config */
const PLOT_COST = 100;             // Sparks (matches starting capital)
/* FAUCET FIX (2026-09-28): was 0.02/s = 1,728 Sparks/day PER PLOT, uncapped (83-minute payback). Now ~72/day per plot, max 3 plots,
   and at most 24 h of yield banks between collects. Payback = 100/72 = ~1.4 days (~33 h). */
const YIELD_PER_DAY = 72;
const YIELD_PER_SEC = YIELD_PER_DAY / 86400;
const MAX_PLOTS_PER_CHARACTER = 3;
const MAX_ACCRUE_MS = 24 * 60 * 60 * 1000;

router.get('/list', (req, res) => {
  try {
    const { characterId } = req.query;
    if (!characterId) return res.status(400).json({ success: false, error: 'Missing characterId' });
    const db = loadPlots();
    res.json({ success: true, plots: Object.values(db).filter(p => p.ownerId === characterId) });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/buy', (req, res) => {
  try {
    const { characterId, plotId } = req.body;
    if (!characterId || !plotId) return res.status(400).json({ success: false, error: 'Missing fields' });
    const db = loadPlots();
    if (db[plotId]) return res.status(409).json({ success: false, error: 'Plot already owned' });
    if (Object.values(db).filter(p => p.ownerId === characterId).length >= MAX_PLOTS_PER_CHARACTER) return res.status(409).json({ success: false, code: 'PLOT_CAP', error: 'Plot cap reached (' + MAX_PLOTS_PER_CHARACTER + ' per character)', cap: MAX_PLOTS_PER_CHARACTER });

    // Deduct Sparks from character store
    const charsPath = path.join(DATA_DIR, 'characters.json');
    const chars = JSON.parse(fs.readFileSync(charsPath, 'utf8'));
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.currency = char.currency || { sparks: 0 };
    if ((char.currency.sparks || 0) < PLOT_COST) return res.status(400).json({ success: false, error: 'Insufficient Sparks' });
    char.currency.sparks -= PLOT_COST;
    fs.writeFileSync(charsPath, JSON.stringify(chars, null, 2), 'utf8');
    sparksCore.recordSink(char, PLOT_COST, 'plot-buy', { ref: plotId });

    db[plotId] = { id: plotId, ownerId: characterId, agent: null, lastCollectAt: Date.now(), purchasedAt: Date.now() };
    savePlots(db);
    broadcast({ type: 'plot_purchased', payload: db[plotId] });
    res.json({ success: true, plot: db[plotId], price: PLOT_COST, yieldPerDay: YIELD_PER_DAY, cap: MAX_PLOTS_PER_CHARACTER });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/assign', (req, res) => {
  try {
    const { characterId, plotId, agentId } = req.body;
    if (!characterId || !plotId || !agentId) return res.status(400).json({ success: false, error: 'Missing fields' });
    const db = loadPlots();
    const plot = db[plotId];
    if (!plot) return res.status(404).json({ success: false, error: 'Plot not found' });
    if (plot.ownerId !== characterId) return res.status(403).json({ success: false, error: 'Not your plot' });

    plot.agent = agentId;
    plot.lastCollectAt = Date.now(); // reset yield clock for new tenant
    savePlots(db);
    broadcast({ type: 'plot_agent_assigned', payload: { plotId, agentId } });
    res.json({ success: true, plot });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

router.post('/collect', (req, res) => {
  try {
    const { characterId, plotId } = req.body;
    if (!characterId || !plotId) return res.status(400).json({ success: false, error: 'Missing fields' });
    const db = loadPlots();
    const plot = db[plotId];
    if (!plot) return res.status(404).json({ success: false, error: 'Plot not found' });
    if (plot.ownerId !== characterId) return res.status(403).json({ success: false, error: 'Not your plot' });
    if (!plot.agent) return res.status(400).json({ success: false, error: 'No agent stationed' });

    /* accrual is banked (capped at 24 h). Only the time actually PAID OUT is consumed, so collecting often never forfeits the fractional part
       (the old code reset the clock every call and floor()ed the yield to 0). */
    const now = Date.now();
    const elapsedMs = Math.min(now - plot.lastCollectAt, MAX_ACCRUE_MS);
    const yieldAmount = Math.floor((elapsedMs / 1000) * YIELD_PER_SEC);
    if (yieldAmount > 0) plot.lastCollectAt = (now - elapsedMs) + Math.round((yieldAmount / YIELD_PER_SEC) * 1000);
    if (now - plot.lastCollectAt > MAX_ACCRUE_MS) plot.lastCollectAt = now - MAX_ACCRUE_MS;
    savePlots(db);

    if (yieldAmount > 0) {
      const charsPath = path.join(DATA_DIR, 'characters.json');
      const chars = JSON.parse(fs.readFileSync(charsPath, 'utf8'));
      const char = chars[characterId];
      if (char) {
        char.currency = char.currency || { sparks: 0 };
        char.currency.sparks = (char.currency.sparks || 0) + yieldAmount;
        fs.writeFileSync(charsPath, JSON.stringify(chars, null, 2), 'utf8');
        sparksCore.recordChange(char, yieldAmount, 'plot-yield', { ref: plotId });
      }
    }

    broadcast({ type: 'plot_yield', payload: { plotId, yieldAmount } });
    res.json({ success: true, yieldAmount, yieldPerDay: YIELD_PER_DAY });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
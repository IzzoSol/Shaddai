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

const DATA_DIR = path.join(__dirname, 'data');
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
const YIELD_PER_SEC = 0.02;        // Sparks per second while occupied (≈1.2/min)

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

    // Deduct Sparks from character store
    const charsPath = path.join(DATA_DIR, 'characters.json');
    const chars = JSON.parse(fs.readFileSync(charsPath, 'utf8'));
    const char = chars[characterId];
    if (!char) return res.status(404).json({ success: false, error: 'Character not found' });
    char.currency = char.currency || { sparks: 0 };
    if ((char.currency.sparks || 0) < PLOT_COST) return res.status(400).json({ success: false, error: 'Insufficient Sparks' });
    char.currency.sparks -= PLOT_COST;
    fs.writeFileSync(charsPath, JSON.stringify(chars, null, 2), 'utf8');

    db[plotId] = { id: plotId, ownerId: characterId, agent: null, lastCollectAt: Date.now(), purchasedAt: Date.now() };
    savePlots(db);
    broadcast({ type: 'plot_purchased', payload: db[plotId] });
    res.json({ success: true, plot: db[plotId], price: PLOT_COST });
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

    const now = Date.now();
    const elapsed = (now - plot.lastCollectAt) / 1000;
    const yieldAmount = Math.floor(elapsed * YIELD_PER_SEC);
    plot.lastCollectAt = now;
    savePlots(db);

    if (yieldAmount > 0) {
      const charsPath = path.join(DATA_DIR, 'characters.json');
      const chars = JSON.parse(fs.readFileSync(charsPath, 'utf8'));
      const char = chars[characterId];
      if (char) {
        char.currency = char.currency || { sparks: 0 };
        char.currency.sparks = (char.currency.sparks || 0) + yieldAmount;
        fs.writeFileSync(charsPath, JSON.stringify(chars, null, 2), 'utf8');
      }
    }

    broadcast({ type: 'plot_yield', payload: { plotId, yieldAmount } });
    res.json({ success: true, yieldAmount });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
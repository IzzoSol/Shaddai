// results-routes.js — persistent "Results Inbox" for SHADDAI.
//   Workflow / agent-chain runs POST their final result here so it survives reloads.
//   Data stored as backend/data/results.json (atomic write, capped to newest ~500).
//   POST   /api/results        {workflowId,title,agents,input,output,steps} -> {ok,id}
//   GET    /api/results[?limit] -> {ok, results:[...]}  (newest first)
//   DELETE /api/results/:id     -> {ok, removed}
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json({ limit: '2mb' });

const DATA_DIR = path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'results.json');
const CAP = 500;

// ── tiny local atomic JSON helpers (replicated, no cross-file imports) ──
function loadJSON() {
  try {
    var raw = fs.readFileSync(STORE, 'utf8');
    var d = JSON.parse(raw);
    return Array.isArray(d) ? d : (Array.isArray(d && d.results) ? d.results : []);
  } catch (e) { return []; }
}

function saveJSON(arr) {
  try {
    if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {} }
    var tmp = STORE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
    fs.renameSync(tmp, STORE);
    return true;
  } catch (e) { try { console.warn('[results] save failed', e && e.message); } catch (_) {} return false; }
}

function str(v, max) {
  var s = (v == null) ? '' : String(v);
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

// ── POST /api/results — append a saved result ──
router.post('/api/results', json, function (req, res) {
  try {
    var b = req.body || {};
    var rec = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(),
      workflowId: str(b.workflowId, 120),
      title: str(b.title, 300) || 'Untitled workflow',
      agents: Array.isArray(b.agents)
        ? b.agents.map(function (a) { return str(a, 40); }).slice(0, 20)
        : str(b.agents, 200),
      input: str(b.input, 20000),
      output: str(b.output, 200000),
      steps: Array.isArray(b.steps)
        ? b.steps.slice(0, 50).map(function (s) {
            s = s || {};
            return { agent: str(s.agent, 40), prompt: str(s.prompt, 20000), output: str(s.output, 200000) };
          })
        : []
    };
    var arr = loadJSON();
    arr.unshift(rec);
    if (arr.length > CAP) arr = arr.slice(0, CAP);
    saveJSON(arr);
    res.json({ ok: true, id: rec.id });
  } catch (e) {
    try { console.warn('[results] POST failed', e && e.message); } catch (_) {}
    res.status(200).json({ ok: false, error: 'save_failed' });
  }
});

// ── GET /api/results — newest first, optional ?limit ──
router.get('/api/results', function (req, res) {
  try {
    var arr = loadJSON();
    var limit = parseInt(req.query.limit, 10);
    if (limit > 0 && limit < arr.length) arr = arr.slice(0, limit);
    res.json({ ok: true, results: arr });
  } catch (e) {
    res.json({ ok: true, results: [] });
  }
});

// ── DELETE /api/results/:id ──
router.delete('/api/results/:id', function (req, res) {
  try {
    var id = String(req.params.id || '');
    var arr = loadJSON();
    var before = arr.length;
    arr = arr.filter(function (r) { return r && r.id !== id; });
    var removed = before - arr.length;
    if (removed) saveJSON(arr);
    res.json({ ok: true, removed: removed });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'delete_failed' });
  }
});

module.exports = router;

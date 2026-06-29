// ainl-routes.js — REST surface for the AINL workflow executor.
//   GET  /api/ainl/list           → available .ainl workflows (name + description)
//   POST /api/ainl/run  { workflow, inputs } → runAINL result
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();

const WORKFLOWS_DIR = path.join(__dirname, '..', 'workflows');
let exec = null; try { exec = require('./lib/ainl-executor'); } catch (e) {}

router.get('/api/ainl/list', (req, res) => {
  let files = [];
  try { files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.ainl')); } catch (e) {}
  const workflows = files.map((f) => {
    const name = f.replace(/\.ainl$/, '');
    let description = '';
    let title = name;
    try {
      const wf = exec.parseAINL(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
      description = wf.description || '';
      title = wf.name || name;
      return { file: name, name: title, description, inputs: wf.inputs, steps: wf.steps.length };
    } catch (e) {
      return { file: name, name: title, description, error: 'parse failed' };
    }
  });
  res.json({ ok: true, count: workflows.length, workflows });
});

router.post('/api/ainl/run', json, async (req, res) => {
  const { workflow, inputs } = req.body || {};
  if (!workflow) return res.status(400).json({ error: 'workflow required' });
  if (!exec) return res.status(500).json({ error: 'AINL executor unavailable' });
  try {
    const result = await exec.runAINL(workflow, inputs || {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;

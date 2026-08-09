'use strict';

/**
 * brain-http.js
 * Standalone local server that mounts backend/brain-server.js (the in-process
 * Node replacement for the old python brain_server.py) on http://localhost:8787.
 *
 * Runs entirely from the local corpus index + brain_agent_stats.json — no
 * Python, no separate RAG daemon, no network round-trips.
 *
 *   node backend/brain-http.js [--port 8787]
 */

const path = require('path');
const express = require('express');

try { require('dotenv').config(); } catch (_) { /* optional */ }

const brainRoutes = require('./brain-server');

const port = (process.argv.indexOf('--port') >= 0)
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10)
  : (parseInt(process.env.SHADDAI_BRAIN_PORT, 10) || 8787);

const app = express();

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'brain-http', uptime: process.uptime() }));

app.use('/api', brainRoutes);

app.use((req, res) => res.status(404).json({ ok: false, error: 'not found', path: req.path }));

app.listen(port, () => {
  console.log(`[brain-http] in-process brain serving on http://localhost:${port}/api`);
  console.log(`[brain-http] corpus adapter: backend/brain-index.js`);
});

process.on('SIGINT', () => { console.log('\n[brain-http] shutting down'); process.exit(0); });
process.on('uncaughtException', (e) => console.error('[brain-http] uncaught:', e.message));

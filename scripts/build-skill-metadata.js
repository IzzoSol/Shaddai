#!/usr/bin/env node
/**
 * build-skill-metadata.js — SHADDAI skill/tool registry generator
 *
 * Reads the exported TOOLS registry from backend/agent-engine.js and emits a
 * machine-readable capability registry at public/skills-registry.json so the
 * frontend and external devs can discover tools without loading the engine.
 *
 * Output: an array of { name, description, schema, agents } for every tool.
 *
 * Node built-ins only (fs, path). Run: `node scripts/build-skill-metadata.js`
 * NOTE: requiring the engine may keep the process alive (timers/handles), so we
 * call process.exit(0) at the end.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public');
const OUT_FILE = path.join(OUT_DIR, 'skills-registry.json');

function main() {
  // Pull the live tool registry from the engine.
  const engine = require('../backend/agent-engine');
  const TOOLS = engine && engine.TOOLS;

  if (!TOOLS || typeof TOOLS !== 'object') {
    console.error('[build-skill-metadata] backend/agent-engine.js did not export a TOOLS object');
    process.exit(1);
  }

  const registry = Object.keys(TOOLS).map((key) => {
    const tool = TOOLS[key] || {};
    return {
      name: tool.name || key,
      description: tool.description || '',
      schema: tool.schema || {},
      agents: Array.isArray(tool.agents) ? tool.agents : [],
    };
  });

  // Stable, predictable ordering for diffs/discovery.
  registry.sort((a, b) => a.name.localeCompare(b.name));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(registry, null, 2), 'utf8');

  console.log(`[build-skill-metadata] wrote ${registry.length} tools to ${path.relative(path.join(__dirname, '..'), OUT_FILE)}`);

  // The engine may register timers/handles that keep the event loop alive.
  process.exit(0);
}

main();

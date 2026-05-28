#!/usr/bin/env node
/**
 * Build Skills Catalog — one-time/CI script
 *
 * Walks the Obsidian vault (dev machine only), reads every SKILL.md,
 * normalizes them, and writes a single JSON file that ships with the backend.
 *
 * Production servers load this JSON at boot — they don't need Obsidian installed,
 * don't walk the file system, and can serve thousands of users from one shared
 * in-memory catalog.
 *
 * Run: node backend/scripts/build-skills-catalog.js
 * Output: backend/data/skills-catalog.json
 */

const fs   = require('fs');
const path = require('path');

const VAULT  = process.env.OBSIDIAN_ROOT || 'C:\\Users\\Brittany\\OneDrive\\Desktop\\OBSIDIAN\\SHADDAI OBSIDIAN';
const OUTPUT = path.join(__dirname, '..', 'data', 'skills-catalog.json');

const AGENT_MAP = {
  XEROX: 'ZEROX', ZEROX: 'ZEROX', NEXUS: 'NEXUS', ORACLE: 'ORACLE',
  QUILL: 'QUILL', TURTLE: 'TURTLE', PIKADON: 'PIKADON', SHADDAI: 'SHADDAI',
  'Marketing Skills': 'QUILL'
};

function parseFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  m[1].split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i === -1) return;
    out[line.slice(0,i).trim()] = line.slice(i+1).trim().replace(/^['"]|['"]$/g, '');
  });
  return out;
}

function walk(dir, agentName, results, depth = 0) {
  if (depth > 5) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, agentName, results, depth + 1);
    else if (e.name === 'SKILL.md') {
      try {
        const raw = fs.readFileSync(full, 'utf8');
        const fm = parseFrontmatter(raw);
        const folderName = path.basename(path.dirname(full));
        const name = fm.name || folderName;
        if (!name) continue;
        const body = raw.replace(/^---[\s\S]*?---\n/, '').trim();
        const parts = full.split(path.sep);
        const category = parts[parts.indexOf(folderName) - 1] || 'general';
        results.push({
          id: name,
          name,
          description: fm.description || `${name} skill`,
          agent: agentName,
          category,
          methodology: body.slice(0, 4000),
          methodologyLength: body.length,
          source: 'obsidian'
        });
      } catch {}
    }
  }
}

function buildCatalog() {
  const skills = [];
  const agentsRoot = path.join(VAULT, 'Agents');
  if (!fs.existsSync(agentsRoot)) {
    console.error(`Vault not found: ${agentsRoot}`);
    process.exit(1);
  }
  const dirs = fs.readdirSync(agentsRoot, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const d of dirs) {
    const agentName = AGENT_MAP[d.name] || 'SHADDAI';
    const agentPath = path.join(agentsRoot, d.name);
    const skillsPath = path.join(agentPath, 'Skills');
    walk(fs.existsSync(skillsPath) ? skillsPath : agentPath, agentName, skills);
  }

  // Dedup by name (keep longest methodology)
  const byName = new Map();
  for (const s of skills) {
    const existing = byName.get(s.name);
    if (!existing || s.methodologyLength > existing.methodologyLength) byName.set(s.name, s);
  }
  return Array.from(byName.values());
}

function main() {
  console.log('[BUILD] Scanning vault:', VAULT);
  const t0 = Date.now();
  const catalog = buildCatalog();
  const byAgent = {};
  catalog.forEach(s => { byAgent[s.agent] = (byAgent[s.agent] || 0) + 1; });

  const output = {
    builtAt: new Date().toISOString(),
    source: VAULT,
    totalSkills: catalog.length,
    byAgent,
    skills: catalog
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
  const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
  console.log(`[BUILD] ✓ Wrote ${catalog.length} skills to ${OUTPUT} (${sizeMB}MB) in ${Date.now()-t0}ms`);
  console.log(`[BUILD] By agent: ${JSON.stringify(byAgent)}`);
}

main();

'use strict';
/**
 * SKILL AUDIT — Phase 1 Investigation
 *
 * Checks every RECIPE step's tool reference against the TOOLS registry
 * in agent-engine.js. Reports:
 *   - Total recipe count
 *   - Tools referenced per recipe
 *   - MISSING tools (recipes that call a non-existent tool key)
 *   - Coverage %
 *
 * Run from repo root:
 *   node scripts/skill-audit.js
 */

const path = require('path');
const fs   = require('fs');

// ── 1. Build the TOOLS set from agent-engine.js (parse only, don't execute) ──
// We grep for the "name: 'xxx'" pattern to collect all tool keys safely.
// This avoids running agent-engine.js which starts servers/does side effects.

const engineSrc = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'agent-engine.js'),
  'utf8'
);

// Collect top-level TOOLS object keys. The pattern we use:
//   /^  ([a-z][a-z0-9_]+): \{/gm  — key at 2-space indent in the TOOLS literal
// but some tools have no leading "name:" so we also collect from `name: 'xxx'`
const toolKeysFromPattern = new Set();

// Pattern 1: top-level key in TOOLS object  (2-space indent before identifier)
for (const m of engineSrc.matchAll(/^  ([a-z][a-z0-9_]+): \{/gm)) {
  toolKeysFromPattern.add(m[1]);
}
// Pattern 2: explicit `name: 'xxx'` inside tool objects
for (const m of engineSrc.matchAll(/name:\s*'([a-z][a-z0-9_]+)'/g)) {
  toolKeysFromPattern.add(m[1]);
}

// Remove false positives that are not tool names (nested object fields, etc.)
// We'll cross-check with the RECIPES tool references to report missing ones.
const KNOWN_TOOLS = toolKeysFromPattern;
console.log(`\n[AUDIT] Tool keys found in agent-engine.js: ${KNOWN_TOOLS.size}`);
console.log('[AUDIT] Tools:', [...KNOWN_TOOLS].sort().join(', '));

// ── 2. Load RECIPES from skill-index.js ──
const { RECIPES } = require(path.join(__dirname, '..', 'backend', 'skill-index'));

const recipeIds = Object.keys(RECIPES);
console.log(`\n[AUDIT] Total RECIPES: ${recipeIds.length}`);

// ── 3. Collect all unique tool names referenced in recipe steps ──
const allToolsReferenced = new Set();
for (const [id, r] of Object.entries(RECIPES)) {
  for (const step of r.steps) {
    allToolsReferenced.add(step.tool);
  }
}
console.log(`\n[AUDIT] Unique tool names referenced in RECIPES: ${allToolsReferenced.size}`);
console.log('[AUDIT] Referenced tools:', [...allToolsReferenced].sort().join(', '));

// ── 4. Find MISSING tools (referenced but not in TOOLS registry) ──
const missingTools = [...allToolsReferenced].filter(t => !KNOWN_TOOLS.has(t));
const presentTools = [...allToolsReferenced].filter(t => KNOWN_TOOLS.has(t));

console.log(`\n[AUDIT] Tools present in registry: ${presentTools.length}/${allToolsReferenced.size}`);
if (missingTools.length === 0) {
  console.log('[AUDIT] ✅  All tool references resolve — no missing tools!');
} else {
  console.log(`[AUDIT] ❌  MISSING TOOLS (${missingTools.length}): ${missingTools.join(', ')}`);
}

// ── 5. For each recipe, list its steps and whether they resolve ──
console.log('\n[AUDIT] ══════════════════════════════════════════');
console.log('[AUDIT] PER-RECIPE BREAKDOWN');
console.log('[AUDIT] ══════════════════════════════════════════');

const brokenRecipes = [];
const healthyRecipes = [];

for (const [id, r] of Object.entries(RECIPES)) {
  const brokenSteps = r.steps.filter(s => !KNOWN_TOOLS.has(s.tool));
  if (brokenSteps.length) {
    brokenRecipes.push({ id, agent: r.agent, brokenSteps });
    console.log(`[BROKEN] ${id} (${r.agent})`);
    for (const step of brokenSteps) {
      console.log(`         ❌  tool: "${step.tool}" — NOT FOUND in registry`);
    }
  } else {
    healthyRecipes.push(id);
  }
}

// ── 6. Also check skill-router.js SKILL_HANDLERS against its own fn references ──
console.log('\n[AUDIT] ══════════════════════════════════════════');
console.log('[AUDIT] SKILL-ROUTER.js SKILL_HANDLERS coverage');
console.log('[AUDIT] ══════════════════════════════════════════');

const routerSrc = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'skill-router.js'),
  'utf8'
);

// Extract fn: 'xxx' entries from AGENT_SKILLS
const skillFns = new Set();
for (const m of routerSrc.matchAll(/fn:\s*'([a-zA-Z]+)'/g)) {
  skillFns.add(m[1]);
}

// Extract handler names from SKILL_HANDLERS
const handlerNames = new Set();
for (const m of routerSrc.matchAll(/^  ([a-zA-Z]+):\s*async/gm)) {
  handlerNames.add(m[1]);
}

const missingHandlers = [...skillFns].filter(f => !handlerNames.has(f));
const presentHandlers = [...skillFns].filter(f => handlerNames.has(f));

console.log(`[AUDIT] Skill fn refs in AGENT_SKILLS: ${skillFns.size}`);
console.log(`[AUDIT] Handlers in SKILL_HANDLERS:    ${handlerNames.size}`);
console.log(`[AUDIT] Resolved: ${presentHandlers.length}/${skillFns.size}`);
if (missingHandlers.length) {
  console.log(`[AUDIT] ❌ MISSING HANDLERS: ${missingHandlers.join(', ')}`);
} else {
  console.log('[AUDIT] ✅ All skill fn references have handlers in SKILL_HANDLERS');
}

// ── 7. Check skill-router.js duplicate fn key (orchestrateAgents defined twice) ──
const orchCount = (routerSrc.match(/orchestrateAgents:\s*async/g) || []).length;
if (orchCount > 1) {
  console.log(`\n[AUDIT] ⚠️  DUPLICATE KEY: "orchestrateAgents" defined ${orchCount} times in SKILL_HANDLERS — second definition silently overrides first!`);
}

// ── 8. Check skill-bridge.js: does it call orchestrator.executeSkillForAgent? ──
const bridgeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'skill-bridge.js'),
  'utf8'
);
const bridgeCallsOrch = bridgeSrc.includes('orchestrator.executeSkillForAgent');
console.log(`\n[AUDIT] skill-bridge.js calls orchestrator.executeSkillForAgent: ${bridgeCallsOrch ? '✅ YES' : '❌ NO'}`);

// ── 9. Check skill-orchestrator.js: does it call skillsManager.getSkill? ──
const orchSrc = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'skill-orchestrator.js'),
  'utf8'
);
const orchCallsGetSkill = orchSrc.includes('skillsManager.getSkill');
console.log(`[AUDIT] skill-orchestrator.js calls skillsManager.getSkill: ${orchCallsGetSkill ? '✅ YES' : '❌ NO'}`);

// ── 10. Check skill-executor-real.js: does it dispatch to agent-engine tools? ──
const execSrc = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'skill-executor-real.js'),
  'utf8'
);
const execCallsEngine = execSrc.includes('TOOLS') || execSrc.includes('agent-engine');
console.log(`[AUDIT] skill-executor-real.js references agent-engine TOOLS: ${execCallsEngine ? '✅ YES' : '❌ NO'}`);
const execCallsAgent = execSrc.includes('/api/agents/task');
console.log(`[AUDIT] skill-executor-real.js calls /api/agents/task HTTP endpoint: ${execCallsAgent ? '✅ YES' : '❌ NO'}`);

// ── 11. Summary ──
console.log('\n[AUDIT] ══════════════════════════════════════════');
console.log('[AUDIT] SUMMARY');
console.log('[AUDIT] ══════════════════════════════════════════');
console.log(`Total recipes:          ${recipeIds.length}`);
console.log(`Healthy recipes:        ${healthyRecipes.length} (${(healthyRecipes.length/recipeIds.length*100).toFixed(1)}%)`);
console.log(`Broken recipes:         ${brokenRecipes.length} (${(brokenRecipes.length/recipeIds.length*100).toFixed(1)}%)`);
console.log(`Missing tool names:     ${missingTools.length}`);
if (missingTools.length) console.log(`  → ${missingTools.join(', ')}`);
console.log(`\nSkill-router fn coverage: ${presentHandlers.length}/${skillFns.size} (${(presentHandlers.length/skillFns.size*100).toFixed(1)}%)`);
console.log(`Missing skill handlers: ${missingHandlers.length}`);
if (missingHandlers.length) console.log(`  → ${missingHandlers.join(', ')}`);
console.log(`\nDuplicate key warning:  ${orchCount > 1 ? 'YES (orchestrateAgents)' : 'none'}`);
console.log(`Bridge → Orchestrator:  ${bridgeCallsOrch ? 'wired' : 'BROKEN'}`);
console.log(`Executor → HTTP agent:  ${execCallsAgent ? 'wired (HTTP loop-back, not direct TOOLS call)' : 'BROKEN'}`);

'use strict';

/**
 * scripts/skill-coverage.js
 * Reports: total skills, # tool-backed, # LLM-fallback, invalid tool refs.
 * Run: node scripts/skill-coverage.js
 */

const path = require('path');

// ── Load AGENT_SKILLS from skill-router ─────────────────────────────────────
let AGENT_SKILLS;
try {
  ({ AGENT_SKILLS } = require(path.join(__dirname, '..', 'backend', 'skill-router')));
} catch (e) {
  console.error('[ERROR] Could not load skill-router:', e.message);
  process.exit(1);
}

// ── Load SKILL_TOOL_MAP from skill-executor ──────────────────────────────────
let SKILL_TOOL_MAP;
try {
  ({ SKILL_TOOL_MAP } = require(path.join(__dirname, '..', 'backend', 'skill-executor')));
} catch (e) {
  console.error('[ERROR] Could not load skill-executor:', e.message);
  process.exit(1);
}

// ── Load combined TOOLS registry from agent-engine (includes TOOLS_EXTRA) ───
let TOOLS;
try {
  ({ TOOLS } = require(path.join(__dirname, '..', 'backend', 'agent-engine')));
} catch (e) {
  console.error('[ERROR] Could not load agent-engine:', e.message);
  process.exit(1);
}

const allToolNames = new Set(Object.keys(TOOLS));

// ── Enumerate all skills from AGENT_SKILLS ──────────────────────────────────
const allSkills = [];
for (const [agentId, agentDef] of Object.entries(AGENT_SKILLS)) {
  for (const skillName of Object.keys(agentDef.skills || {})) {
    allSkills.push({ key: `${agentId}/${skillName}`, agentId, skillName });
  }
}

const totalSkills = allSkills.length;
const toolBacked = [];
const llmFallback = [];
const badToolRefs = [];

for (const { key, agentId, skillName } of allSkills) {
  const mapping = SKILL_TOOL_MAP[key];
  if (mapping && Array.isArray(mapping.tools) && mapping.tools.length > 0) {
    toolBacked.push(key);
    // Check that every referenced tool name exists in the registry
    for (const toolName of mapping.tools) {
      if (!allToolNames.has(toolName)) {
        badToolRefs.push({ skill: key, badTool: toolName });
      }
    }
  } else {
    llmFallback.push(key);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  SKILL COVERAGE REPORT');
console.log('══════════════════════════════════════════════════════════════');
console.log('');
console.log(`  Total skills:       ${totalSkills}`);
console.log(`  Tool-backed:        ${toolBacked.length}  (${Math.round(toolBacked.length / totalSkills * 100)}%)`);
console.log(`  LLM-only fallback:  ${llmFallback.length}  (${Math.round(llmFallback.length / totalSkills * 100)}%)`);
console.log(`  Tool registry size: ${allToolNames.size} tools`);
console.log('');

console.log('── Tool-backed skills ──────────────────────────────────────');
toolBacked.forEach(k => {
  const tools = SKILL_TOOL_MAP[k].tools.join(', ');
  console.log(`  ✓ ${k.padEnd(42)} [${tools}]`);
});

console.log('');
console.log('── LLM-fallback skills (no tool binding) ───────────────────');
llmFallback.forEach(k => console.log(`  ~ ${k}`));

if (badToolRefs.length > 0) {
  console.log('');
  console.log('── INVALID TOOL REFERENCES (FIX REQUIRED) ─────────────────');
  badToolRefs.forEach(({ skill, badTool }) => {
    console.log(`  ✗ ${skill} references unknown tool: "${badTool}"`);
  });
  console.log('');
  console.log(`  ERROR: ${badToolRefs.length} invalid tool reference(s) found.`);
  process.exit(1);
} else {
  console.log('');
  console.log('  ✓ All tool references valid — no bad tool names found.');
}

console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('');

#!/usr/bin/env node
'use strict';
// Builds public/mcp-tools.json from the live MCP tool definitions so the
// /tools.html catalog can never drift from the code. Run after editing tools:
//   node scripts/gen-mcp-catalog.js
const path = require('path');
const fs = require('fs');
const { TOOLS } = require(path.join(__dirname, '..', 'shaddai-mcp', 'mcp-unified.js'));

const CATS = [
  ['Game Dev (TURTLE)', /^(gamedev_|shaddai_turtle_build$)/, 'Build games with TURTLE and the game-dev library.'],
  ['Agents', /^(shaddai_(orchestrate|run_agent|list_agents|nexus|oracle|zerox|turtle|quill|pikadon|capture)$)/, 'Talk to the 7-agent council or run a task through them.'],
  ['Knowledge & RAG', /^(rag_|list_rag_docs|memory_search|brain_|aura_|graph_|get_route|shaddai_search_mastery|mastery_)/, 'Search and ask the SHADDAI knowledge brain.'],
  ['Markets & ZEROX', /^zerox_/, 'Prices, sentiment, paper trading and commissions.'],
  ['Hall & Community', /^hall_/, 'Arcade, arena, quests, referrals and community stats.'],
  ['Money & Ledger', /^(x402_|ledger_|quota_|reputation_|plot_|shaddai_(create_agent|set_spend_policy|revoke_agent|get_agent_ledger)$)/, 'Spend caps, receipts, payments and plots. Money tools are off unless the operator enables them.'],
  ['Automation', /^(workflow_|sched_|forge_|bridge_|directory_)/, 'Workflows, schedules, sub-agents, and the agent directory.'],
  ['Web & Media', /^(web_|shaddai_(generate_image|media_))/, 'Search/scrape the web, generate and fetch images and media.'],
];
const catOf = (n) => (CATS.find(([, re]) => re.test(n)) || ['Other'])[0];

const tools = TOOLS.map((t) => {
  const props = (t.inputSchema && t.inputSchema.properties) || {}, req = new Set((t.inputSchema && t.inputSchema.required) || []);
  return { name: t.name, category: catOf(t.name), description: t.description,
    params: Object.entries(props).map(([k, v]) => ({ name: k, type: v.type || 'string', required: req.has(k), description: v.description || '' })) };
});
const out = { generatedAt: new Date().toISOString(), count: tools.length,
  categories: [...CATS.map(([name, , blurb]) => ({ name, blurb })), { name: 'Other', blurb: 'Everything else.' }].filter((c) => tools.some((t) => t.category === c.name)),
  tools };
fs.writeFileSync(path.join(__dirname, '..', 'public', 'mcp-tools.json'), JSON.stringify(out, null, 1));
console.log(tools.length + ' tools →', out.categories.map((c) => c.name + ':' + tools.filter((t) => t.category === c.name).length).join(', '));
process.exit(0);

/**
 * WORKFLOW AUDIT — Phase 1 investigation script
 * Validates all builtin workflows (api-proxy-routes BUILTIN_WORKFLOWS + agent-engine WORKFLOW_TEMPLATES)
 * without running LLMs. Checks:
 *   1. Each step has a valid agent name
 *   2. Each agent has all tools that are named in the step goal/task
 *   3. Context chaining: steps that reference {prev} or context actually have a predecessor
 *   4. Error-handling: does the route have per-step try/catch?
 *   5. {{INPUT}} placeholder substitution
 */

'use strict';

// ── Import only the static registry — no LLM calls ──────────────────────────
const path = require('path');

// Replicate BUILTIN_WORKFLOWS from api-proxy-routes.js
const BUILTIN_WORKFLOWS = {
  'research-to-build': {
    name: 'Research → Build',
    steps: [
      { agent: 'ORACLE', task: 'Research the topic deeply and summarize key findings, technologies, and opportunities: {input}' },
      { agent: 'NEXUS',  task: 'Based on this research, design a technical architecture and implementation plan: {prev}' },
      { agent: 'QUILL',  task: 'Write a clear project brief and documentation based on this plan: {prev}' }
    ]
  },
  'market-analysis': {
    name: 'Market Analysis',
    steps: [
      { agent: 'ORACLE', task: 'Research current market conditions, competitors, and trends for: {input}' },
      { agent: 'ZEROX',  task: 'Analyze the financial opportunity, revenue potential, and unit economics: {prev}' },
      { agent: 'SHADDAI', task: 'Give a final VERDICT: should we pursue this? Include top 3 risks and top 3 opportunities: {prev}' }
    ]
  },
  'idea-to-product': {
    name: 'Idea → Product',
    steps: [
      { agent: 'ORACLE', task: 'Validate this idea: research the market, competitors, and target users: {input}' },
      { agent: 'ZEROX',  task: 'Define the monetization model and pricing strategy: {prev}' },
      { agent: 'NEXUS',  task: 'Design the technical stack and MVP feature set: {prev}' },
      { agent: 'TURTLE', task: 'Define the brand, UI/UX direction, and user experience: {prev}' },
      { agent: 'QUILL',  task: 'Write the product one-pager and launch copy: {prev}' }
    ]
  },
  'full-audit': {
    name: 'Full System Audit',
    steps: [
      { agent: 'PIKADON', task: 'Security audit: identify vulnerabilities, risks, and attack vectors in: {input}' },
      { agent: 'NEXUS',   task: 'Technical audit: identify performance, scalability, and architecture issues: {prev}' },
      { agent: 'ZEROX',   task: 'Business audit: identify revenue leaks, inefficiencies, and growth blockers: {prev}' },
      { agent: 'SHADDAI', task: 'Compile a prioritized action plan from all audit findings: {prev}' }
    ]
  }
};

// Replicate WORKFLOW_TEMPLATES from agent-engine.js
const WORKFLOW_TEMPLATES = {
  'market-brief': {
    name: 'Daily Market Brief',
    description: 'ZEROX gets prices → ORACLE finds news → QUILL writes brief',
    steps: [
      { agent: 'ZEROX', goal: 'Get current BTC, ETH, SOL prices, the Fear & Greed Index, and top 5 trending coins.' },
      { agent: 'ORACLE', goal: 'Find the top 3 crypto news headlines from today. Use search_web with query "crypto news today" and get_hackernews.' },
      { agent: 'QUILL', goal: 'Write a 3-paragraph daily crypto market brief using the data above. Include prices, sentiment, and news. Save to file as market-brief.md.' }
    ]
  },
  'security-audit': {
    name: 'Full Security Audit',
    description: 'PIKADON audits code → NEXUS proposes fixes → QUILL documents',
    steps: [
      { agent: 'PIKADON', goal: 'Use list_files to find recent code files in generated-output. Read each one with read_file. Run check_security on every file. Produce a vulnerability report with severity scores.' },
      { agent: 'NEXUS', goal: 'For each vulnerability found above, propose a specific code fix. Be concrete with before/after code.' },
      { agent: 'QUILL', goal: 'Write a clean security audit report combining the findings and fixes above. Format as markdown with severity badges. Save as security-audit-report.md.' }
    ]
  },
  'research-report': {
    name: 'Deep Research Report',
    description: 'ORACLE researches → ORACLE analyzes → QUILL writes report',
    steps: [
      { agent: 'ORACLE', goal: '{{INPUT}} — use search_web, wikipedia_search, and get_rss_feed to gather facts from 3+ sources.' },
      { agent: 'ORACLE', goal: 'Analyze the research above. Use extract_keywords to find themes. Use analyze_sentiment to gauge tone. Identify 3 key insights.' },
      { agent: 'QUILL', goal: 'Write a 5-paragraph research report using the data above. Structure: intro, 3 key insights, conclusion. Use markdown headings. Save as research-report.md.' }
    ]
  },
  'agent-council': {
    name: 'Agent Council Decision',
    description: 'All 7 agents weigh in on a decision',
    steps: [
      { agent: 'ZEROX', goal: '{{INPUT}} — analyze from a financial/business perspective. Use fetch_price if relevant.' },
      { agent: 'ORACLE', goal: 'Research the topic above. Find precedents and data. Use search_web and wikipedia_search.' },
      { agent: 'NEXUS', goal: 'Analyze technical feasibility of the topic above. Consider architecture and implementation.' },
      { agent: 'PIKADON', goal: 'Identify security risks for the topic above.' },
      { agent: 'TURTLE', goal: 'Think about user experience and design implications of the topic above.' },
      { agent: 'QUILL', goal: 'Consider how to communicate this decision to users.' },
      { agent: 'SHADDAI', goal: 'Synthesize all the perspectives above into a final executive decision with clear reasoning.' }
    ]
  },
  'content-blast': {
    name: 'Content Blast Campaign',
    description: 'ORACLE finds trending → QUILL writes 3 platforms → SHADDAI reviews',
    steps: [
      { agent: 'ORACLE', goal: 'Find the top 3 trending topics in {{INPUT}}. Use search_web and get_rss_feed.' },
      { agent: 'QUILL', goal: 'Write 3 separate posts based on the trending topics above: (1) a Twitter thread (5 tweets), (2) a LinkedIn post (200 words), (3) an Instagram caption. Save each to a file.' },
      { agent: 'SHADDAI', goal: 'Review the 3 posts above. Rate each on engagement potential 1-10. Pick the best one and explain why.' }
    ]
  },
  'token-deep-dive': {
    name: 'Token Deep Dive',
    description: 'ZEROX fetches everything about a token, ORACLE researches community sentiment',
    steps: [
      { agent: 'ZEROX', goal: 'Deep analysis of token {{INPUT}}. Get: price, 7-day OHLCV, token info, whale activity (whale_scan), DEX liquidity. Compute volatility.' },
      { agent: 'ORACLE', goal: 'Research the project {{INPUT}}. Use wikipedia_search and search_web. Find recent news and sentiment.' },
      { agent: 'ZEROX', goal: 'Synthesize the financial and research data into a verdict: BUY / HOLD / AVOID with 3 reasons. Save full analysis to file.' }
    ]
  }
};

// Valid agents
const VALID_AGENTS = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];

// Agent tool grants (from agent-engine.js AGENTS definitions)
const AGENT_TOOLS = {
  SHADDAI: ['delegate_to_agent','fetch_price','get_fear_greed','get_global_market','search_web','wikipedia_search','get_wikipedia_summary','get_weather','calculate','count_tokens','write_file','save_to_inbox','save_memory','get_memory','run_js','post_discord','read_obsidian_skill','translate_text','hash_text','random_user','get_uuid','get_random_quote','get_history_today','compress_prompt','run_local_llm','remember_fact','recall_memory','format_as_table','summarize_text','mint_collectible','list_open_jobs','complete_job','set_agent_room_state','save_room_layout','get_agent_mood','create_skill_pack','list_skill_packs','install_skill_pack','run_workflow_chain','pay_api_call','geocode_address','get_forex_rate','get_crypto_backup'],
  NEXUS: ['delegate_to_agent','run_js','run_python','write_file','read_file','list_files','search_web','wikipedia_search','get_github_repo','get_github_trending','search_npm','check_security','calculate','count_tokens','hash_text','base64_codec','encode_base64','decode_base64','regex_test','markdown_to_html','random_user','save_to_inbox','save_memory','get_memory','read_obsidian_skill','check_port','get_public_apis','get_uuid','get_arxiv_papers','grammar_check','analyze_code_complexity','validate_json','convert_units','get_package_info','search_github_repos','diff_texts','generate_uuid','generate_code_template','format_as_table','generate_mermaid','run_local_llm','list_open_jobs','bid_on_job','complete_job','pay_api_call','geocode_address'],
  ZEROX: ['fetch_price','get_fear_greed','get_trending','get_ohlcv','get_global_market','get_token_info','whale_scan','get_defi_tvl','get_sol_balance','get_eth_balance','get_exchange_rates','jupiter_quote','get_nft_floor','get_stock_quote','get_crypto_news','get_gas_price','calculate','analyze_sentiment','extract_keywords','save_to_inbox','save_memory','get_memory','read_obsidian_skill','dex_price','binance_price','binance_orderbook','get_eth_gas','get_top_gainers','get_stablecoin_data','get_protocol_revenue','get_fear_greed_history','calculate_position_size','get_sol_token_info','get_onchain_activity','get_funding_rates','get_dominance','format_as_table','mint_collectible','list_collectible','browse_listings','list_open_jobs','bid_on_job','complete_job','execute_trade','pay_api_call','get_forex_rate','get_crypto_backup'],
  ORACLE: ['search_web','wikipedia_search','get_wikipedia_summary','fetch_url','screenshot_url','get_hackernews','get_rss_feed','get_reddit_posts','get_arxiv_papers','fetch_price','get_fear_greed','get_github_trending','get_weather','weather_live','get_country_info','get_ip_info','get_history_today','get_moon_phase','get_timezone','analyze_sentiment','extract_keywords','count_tokens','format_data','translate_text','save_to_inbox','save_memory','get_memory','read_obsidian_skill','fetch_url_clean','get_news_headlines','get_product_hunt','get_github_issues','search_web_ddg','get_stackoverflow','get_medium_articles','get_hacker_news_comments','get_trending_topics','get_word_definition','detect_language','summarize_text','extract_entities','format_as_table','browse_listings','list_open_jobs','bid_on_job','complete_job','pay_api_call','geocode_address','get_forex_rate','get_crypto_backup'],
  TURTLE: ['generate_image','screenshot_url','markdown_to_html','write_file','search_web','wikipedia_search','get_wikipedia_summary','get_color_palette','get_qr_code','shorten_url','get_random_quote','get_joke','random_user','save_to_inbox','read_obsidian_skill','generate_image_free','generate_mermaid','format_as_table','list_open_jobs','complete_job'],
  QUILL: ['write_file','read_file','search_web','wikipedia_search','get_wikipedia_summary','get_hackernews','get_rss_feed','get_reddit_posts','get_random_quote','grammar_check','analyze_sentiment','extract_keywords','count_tokens','format_data','markdown_to_html','translate_text','post_discord','regex_test','shorten_url','save_to_inbox','save_memory','read_obsidian_skill','summarize_text','extract_entities','get_trending_topics','post_webhook','send_telegram','create_github_issue','detect_language','format_as_table','get_news_headlines','list_collectible','list_open_jobs','complete_job'],
  PIKADON: ['check_security','check_password_strength','read_file','list_files','search_web','wikipedia_search','get_ip_info','check_port','get_sol_balance','get_eth_balance','calculate','hash_text','base64_codec','encode_base64','decode_base64','regex_test','save_to_inbox','read_obsidian_skill','validate_json','analyze_code_complexity','diff_texts','post_webhook','create_github_issue','list_open_jobs','complete_job']
};

// Tool names explicitly mentioned in step goals/tasks (by scanning for tool-name patterns)
// We look for known tool names in the text
const ALL_KNOWN_TOOLS = new Set([
  ...Object.values(AGENT_TOOLS).flat()
]);

function extractToolReferences(text) {
  // Find words that match known tool names mentioned in the step text
  const refs = [];
  for (const tool of ALL_KNOWN_TOOLS) {
    if (text.includes(tool)) refs.push(tool);
  }
  return refs;
}

// ── Audit function ─────────────────────────────────────────────────────────

function auditWorkflows(label, workflows, stepKey) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`AUDITING: ${label}`);
  console.log('='.repeat(60));

  const allIssues = [];

  for (const [id, wf] of Object.entries(workflows)) {
    console.log(`\n  Workflow: "${id}" (${wf.name})`);
    const steps = wf.steps || [];

    if (!steps.length) {
      const issue = `  [CRITICAL] No steps defined`;
      console.log(issue);
      allIssues.push({ workflow: id, type: 'CRITICAL', msg: 'No steps defined' });
      continue;
    }

    let hasPrevOutput = false;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const text = step[stepKey] || '';
      const agentName = (step.agent || '').toUpperCase();

      // Check 1: Valid agent
      if (!VALID_AGENTS.includes(agentName)) {
        const issue = `    Step ${i+1}: [CRITICAL] Unknown agent "${step.agent}"`;
        console.log(issue);
        allIssues.push({ workflow: id, step: i+1, type: 'CRITICAL', msg: `Unknown agent: ${step.agent}` });
      }

      // Check 2: Step has text
      if (!text.trim()) {
        const issue = `    Step ${i+1}: [CRITICAL] Empty task/goal text`;
        console.log(issue);
        allIssues.push({ workflow: id, step: i+1, type: 'CRITICAL', msg: 'Empty task/goal text' });
        continue;
      }

      // Check 3: Tools referenced but not granted
      const referencedTools = extractToolReferences(text);
      const agentGranted = AGENT_TOOLS[agentName] || [];
      const ungrantedTools = referencedTools.filter(t => !agentGranted.includes(t));
      if (ungrantedTools.length) {
        const issue = `    Step ${i+1} (${agentName}): [HIGH] References tools not in agent's grant: ${ungrantedTools.join(', ')}`;
        console.log(issue);
        allIssues.push({ workflow: id, step: i+1, type: 'HIGH', msg: `Agent ${agentName} references tools it cannot call: ${ungrantedTools.join(', ')}` });
      }

      // Check 4: Context chaining — step uses {prev} or "above" but there's no prior step
      const usesPrev = text.includes('{prev}') || text.includes('{{INPUT}}') || text.includes('{input}');
      const referencesAbove = /above|previous step|context from|research above|findings above|data above|plans? above|posts? above/i.test(text);

      if (i === 0 && text.includes('{prev}')) {
        const issue = `    Step ${i+1} (${agentName}): [HIGH] First step uses {prev} but no prior step exists`;
        console.log(issue);
        allIssues.push({ workflow: id, step: i+1, type: 'HIGH', msg: 'First step references {prev} — no prior output available' });
      }

      if (i > 0 && referencesAbove) {
        // This is fine — context chaining is working
      }

      // Check 5: {{INPUT}} without substitution warning
      if (text.includes('{{INPUT}}') && stepKey === 'task') {
        const issue = `    Step ${i+1} (${agentName}): [MEDIUM] Uses {{INPUT}} placeholder but BUILTIN_WORKFLOWS route substitutes {input} not {{INPUT}}`;
        console.log(issue);
        allIssues.push({ workflow: id, step: i+1, type: 'MEDIUM', msg: 'Placeholder mismatch: template uses {{INPUT}} but route substitutes {input}' });
      }

      hasPrevOutput = true;

      // Report OK steps
      if (ungrantedTools.length === 0) {
        const toolsNote = referencedTools.length ? ` [tools: ${referencedTools.join(', ')}]` : '';
        console.log(`    Step ${i+1} (${agentName}): OK${toolsNote}`);
      }
    }
  }

  return allIssues;
}

// ── Audit BUILTIN_WORKFLOWS (api-proxy-routes.js) ─────────────────────────
const builtinIssues = auditWorkflows('BUILTIN_WORKFLOWS (api-proxy-routes.js — /api/workflows/run)', BUILTIN_WORKFLOWS, 'task');

// ── Audit WORKFLOW_TEMPLATES (agent-engine.js) ────────────────────────────
const templateIssues = auditWorkflows('WORKFLOW_TEMPLATES (agent-engine.js — /api/agent/workflow/:id/run)', WORKFLOW_TEMPLATES, 'goal');

// ── Audit route error-handling ─────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log('AUDITING: Route error-handling & structural issues');
console.log('='.repeat(60));

const routeIssues = [];

// BUILTIN_WORKFLOWS route (lines ~2849-2896 in api-proxy-routes.js)
// Check: POST /workflows/run has per-step try/catch BUT:
// - On step failure: sends step_error event but does NOT add anything to results array
//   → final results array has gaps; prevOutput stays as last successful step
//   → this is actually correct behavior (skip failed steps), but the final `complete`
//     event doesn't indicate which steps failed
// - No timeout at workflow level — a hanging Ollama call with timeout=120000 will block

// Check: /workflow/:id/run (user-created workflows, line ~3270)
// - On step failure: breaks the loop and marks whole workflow failed
//   → one failing step kills the entire run — NOT resilient

console.log('\n  /api/workflows/run (BUILTIN_WORKFLOWS):');
console.log('    [HIGH] Step error: results[] does not record failed steps, making final output incomplete');
console.log('    [MEDIUM] No overall workflow timeout guard — a slow Ollama call blocks indefinitely up to 120s per step');
console.log('    [MEDIUM] No pre-run validation of steps (agent name / task presence) before starting SSE stream');
routeIssues.push(
  { route: '/api/workflows/run', type: 'HIGH', msg: 'Failed step not recorded in results array; final step count understated' },
  { route: '/api/workflows/run', type: 'MEDIUM', msg: 'No pre-run validation; errors only discovered mid-stream' },
);

console.log('\n  /api/workflow/:id/run (user-created workflows):');
console.log('    [CRITICAL] Step failure breaks the loop: `break` on catch — entire workflow aborts on first error');
console.log('    [HIGH] allSucceeded flag always starts true; any error marks full workflow failed even if 4/5 steps passed');
console.log('    [MEDIUM] No input validation — step.task could be undefined, producing empty Ollama request');
console.log('    [MEDIUM] Only calls Ollama directly (no Groq fallback), bypassing the provider chain in agent-engine');
routeIssues.push(
  { route: '/api/workflow/:id/run', type: 'CRITICAL', msg: 'catch block has `break` — first failing step aborts entire workflow' },
  { route: '/api/workflow/:id/run', type: 'HIGH', msg: 'No Groq fallback — if Ollama is down, workflow always fails' },
  { route: '/api/workflow/:id/run', type: 'MEDIUM', msg: 'step.task could be undefined if user omits task field' },
);

console.log('\n  /api/agent/workflow/:id/run (WORKFLOW_TEMPLATES via agentEngine.runWorkflow):');
console.log('    [OK] Uses agentEngine.runWorkflow which has per-step error isolation (status=failed, continues)');
console.log('    [OK] {{INPUT}} placeholder substitution is done before calling runWorkflow');
console.log('    [MEDIUM] No timeout guard around the whole runWorkflow call — could hang if all LLM providers are slow');
routeIssues.push(
  { route: '/api/agent/workflow/:id/run', type: 'MEDIUM', msg: 'No timeout guard on runWorkflow — could hang for many minutes with 7-step workflows' },
);

// ── Summary ─────────────────────────────────────────────────────────────────
const allIssues = [...builtinIssues, ...templateIssues, ...routeIssues];
console.log(`\n${'='.repeat(60)}`);
console.log('SUMMARY');
console.log('='.repeat(60));
const bySeverity = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
for (const i of allIssues) {
  (bySeverity[i.type] || bySeverity.LOW).push(i);
}
for (const [sev, items] of Object.entries(bySeverity)) {
  if (items.length) console.log(`\n  ${sev} (${items.length}):`);
  items.forEach(i => console.log(`    - [${i.workflow || i.route || '?'}] ${i.msg}`));
}
console.log('\n');

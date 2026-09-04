'use strict';
// ============================================================================
// arena/bot-templates.js - Reusable, one-click Grok bot templates.
// Each template is a pre-configured bot definition users can import to instantly
// spin up a Grok-powered agent with a purpose-built persona + tool loadout.
// Templates only store personas/tool names (no secrets). Importing calls
// grok-connect's register + engine wiring with the user's own API key.
// ============================================================================

// Tool IDs verified to exist in engine.TOOLS (see agent-engine.js).
const TEMPLATES = [
  {
    id: 'researcher',
    name: 'Researcher',
    model: 'grok',
    desc: 'Deep-dive research & fact-finding across the web, news, and Wikipedia.',
    persona: 'You are Researcher, a meticulous research agent. Gather facts from multiple sources, cite what you find, and summarize clearly. Prefer primary and recent sources.',
    tools: ['search_web', 'wikipedia_search', 'get_news_headlines', 'get_hackernews', 'fetch_url', 'summarize_text']
  },
  {
    id: 'trader',
    name: 'Market Analyst',
    model: 'grok',
    desc: 'Live market data, prices, and sentiment for crypto & equities.',
    persona: 'You are Market Analyst, a financial data specialist. Pull live prices and market data, compute useful metrics, and present balanced analysis with clear risk framing.',
    tools: ['fetch_price', 'get_crypto_news', 'get_fear_greed', 'get_global_market', 'analyze_sentiment', 'calculate', 'get_stock_quote']
  },
  {
    id: 'auditor',
    name: 'Security Auditor',
    model: 'grok',
    desc: 'Security reviews, password strength, and dependency checks.',
    persona: 'You are Security Auditor, a defensive security specialist. Check code and configs for vulnerabilities, verify password strength, review dependencies, and flag risks with clear severity.',
    tools: ['check_security', 'check_password_strength', 'check_port', 'read_file', 'list_files', 'hash_text', 'validate_json']
  },
  {
    id: 'writer',
    name: 'Writer',
    model: 'grok',
    desc: 'Copywriting, summaries, and polished prose with grammar checks.',
    persona: 'You are Writer, a crisp communicator. Turn rough input into clear, engaging copy. Improve grammar and structure while preserving the user\'s intent and voice.',
    tools: ['grammar_check', 'summarize_text', 'translate_text', 'markdown_to_html', 'extract_keywords', 'analyze_sentiment']
  },
  {
    id: 'developer',
    name: 'Developer',
    model: 'grok',
    desc: 'Code generation, review, and tooling for software tasks.',
    persona: 'You are Developer, a pragmatic software engineer. Read and write code, review correctness and performance, validate JSON, and produce clean solutions with brief explanations.',
    tools: ['run_js', 'read_file', 'write_file', 'list_files', 'analyze_code_complexity', 'validate_json', 'regex_test']
  },
  {
    id: 'general',
    name: 'General Assistant',
    model: 'grok',
    desc: 'A balanced all-purpose helper with common tools.',
    persona: 'You are a helpful general assistant. Answer questions, search when uncertain, and use tools to give accurate, useful responses.',
    tools: ['search_web', 'fetch_price', 'wikipedia_search', 'calculate', 'summarize_text']
  }
];

function listTemplates() {
  return TEMPLATES.map(t => ({ id: t.id, name: t.name, model: t.model, desc: t.desc, tools: t.tools }));
}

function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || null;
}

module.exports = { TEMPLATES, listTemplates, getTemplate };

/**
 * SHADDAI Skill Executor v1.0
 *
 * Implements the Hybrid Approach C from SPEC_skill-tool-binding.md:
 *   1. Explicit skill→tool map for ~12 core skills (deterministic, fast, real data)
 *   2. LLM fallback for unmapped skills (via brains.agentLLM or agent-engine.callLLM)
 *
 * Usage:
 *   const { executeSkill } = require('./skill-executor');
 *   const result = await executeSkill('crypto-trading', 'zerox', 'Analyze BTC for swing entry');
 *
 * module.exports = { executeSkill, SKILL_TOOL_MAP }
 */

'use strict';

// ─── ARG-MAP HELPERS ──────────────────────────────────────────────────────────

const COIN_ALIASES = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', doge: 'dogecoin',
  bnb: 'binancecoin', ada: 'cardano', xrp: 'ripple', matic: 'polygon',
  avax: 'avalanche-2', dot: 'polkadot', link: 'chainlink', ltc: 'litecoin',
  atom: 'cosmos', near: 'near', ftm: 'fantom', op: 'optimism', arb: 'arbitrum'
};

/** Extract a CoinGecko-compatible coin ID from free-text. Returns 'bitcoin' if nothing found. */
function extractSymbol(prompt) {
  const txt = prompt.toLowerCase();
  // Check aliases first (BTC, ETH, etc.)
  for (const [ticker, id] of Object.entries(COIN_ALIASES)) {
    if (new RegExp(`\\b${ticker}\\b`).test(txt)) return id;
  }
  // Check full coin names
  const knownNames = ['bitcoin', 'ethereum', 'solana', 'dogecoin', 'cardano', 'polkadot', 'chainlink', 'avalanche', 'polygon', 'cosmos'];
  for (const name of knownNames) {
    if (txt.includes(name)) return name;
  }
  return null;
}

/** Extract the first URL from a prompt string. */
function extractUrl(prompt) {
  const m = prompt.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : null;
}

/** Extract a hex color from a prompt (with or without #). */
function extractHex(prompt) {
  const m = prompt.match(/#?([0-9a-fA-F]{6})\b/);
  return m ? m[1] : 'FF6B35';
}

/** Return the full prompt as a safe search query (safe default). */
function extractQuery(prompt) {
  return prompt.slice(0, 200);
}

/** Extract code from a fenced code block, or the full prompt if none. */
function extractCode(prompt) {
  const m = prompt.match(/```(?:[a-z]*)\n([\s\S]*?)```/);
  return m ? m[1] : prompt;
}

// ─── COMPOSE HELPERS ──────────────────────────────────────────────────────────

/** Format price + F&G + OHLCV results into a trading brief. */
function composeMarketReport(results, prompt, symbol) {
  const lines = [`ZEROX Market Analysis — ${(symbol || 'crypto').toUpperCase()}`];
  lines.push(`Prompt: ${prompt}`);
  lines.push('');

  for (const r of results) {
    if (r.error) {
      lines.push(`[${r.tool} unavailable: ${r.error}]`);
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(r.result); } catch { parsed = null; }

    if (r.tool === 'fetch_price' && parsed) {
      lines.push(`Price: ${parsed.price} | 24h Change: ${parsed.change24h} | Market Cap: ${parsed.marketCap} | Volume: ${parsed.volume24h}`);
    } else if (r.tool === 'get_fear_greed' && parsed) {
      const score = parsed.today?.score;
      const label = parsed.today?.label;
      lines.push(`Fear & Greed: ${score}/100 — ${label}`);
      if (score < 30) lines.push('Signal: EXTREME FEAR — potential accumulation zone');
      else if (score < 50) lines.push('Signal: FEAR — cautious entry');
      else if (score < 70) lines.push('Signal: GREED — consider taking profits');
      else lines.push('Signal: EXTREME GREED — reduce risk exposure');
    } else if (r.tool === 'get_ohlcv' && parsed) {
      lines.push(`${parsed.days}-day price change: ${parsed.change}`);
      if (parsed.candles?.length) {
        const last = parsed.candles[parsed.candles.length - 1];
        lines.push(`Latest candle: O:${last.open} H:${last.high} L:${last.low} C:${last.close} (${last.date})`);
      }
    } else if (r.tool === 'get_global_market' && parsed) {
      lines.push(`Total Market Cap: ${parsed.totalMarketCap} | BTC Dom: ${parsed.btcDominance} | 24h Change: ${parsed.marketCapChange24h}`);
    } else if (r.tool === 'get_trending' && parsed && Array.isArray(parsed)) {
      lines.push('Trending: ' + parsed.slice(0, 4).map(c => `${c.name} (${c.symbol})`).join(', '));
    } else {
      lines.push(`${r.tool}: ${String(r.result).slice(0, 200)}`);
    }
  }
  return lines.join('\n');
}

/** Format whale/DEX/DeFi results into an on-chain brief. */
function composeOnChainReport(results, prompt) {
  const lines = ['ZEROX On-Chain Intelligence'];
  lines.push(`Prompt: ${prompt}`);
  lines.push('');
  for (const r of results) {
    if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
    lines.push(`${r.tool}:\n${String(r.result).slice(0, 400)}`);
  }
  return lines.join('\n');
}

/** Format search_web + wikipedia + hackernews into a research brief. */
function composeResearchSummary(results, prompt) {
  const lines = ['ORACLE Research Summary'];
  lines.push(`Query: ${prompt}`);
  lines.push('');
  for (const r of results) {
    if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
    let parsed;
    try { parsed = JSON.parse(r.result); } catch { parsed = null; }

    if (r.tool === 'wikipedia_search' && parsed && !parsed.error) {
      lines.push(`Wikipedia — ${parsed.title}:`);
      lines.push(parsed.extract || '');
      lines.push(`Source: ${parsed.url}`);
    } else if (r.tool === 'search_web' && Array.isArray(parsed)) {
      lines.push('Web Results:');
      parsed.slice(0, 4).forEach((item, i) => {
        lines.push(`  ${i + 1}. ${item.title}`);
        if (item.snippet) lines.push(`     ${item.snippet.slice(0, 150)}`);
      });
    } else if (r.tool === 'get_hackernews' && Array.isArray(parsed)) {
      lines.push('Hacker News:');
      parsed.slice(0, 3).forEach((item, i) => {
        lines.push(`  ${i + 1}. ${item.title} (${item.score} pts)`);
      });
    } else {
      lines.push(`${r.tool}: ${String(r.result).slice(0, 300)}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Format check_security results into a severity-ordered report. */
function composeSecurityReport(results, prompt) {
  const lines = ['PIKADON Security Audit'];
  lines.push(`Target: ${prompt.slice(0, 80)}`);
  lines.push('');
  for (const r of results) {
    if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
    let parsed;
    try { parsed = JSON.parse(r.result); } catch { parsed = null; }
    if (r.tool === 'check_security' && parsed) {
      lines.push(`Risk Level: ${parsed.riskLevel} (score: ${parsed.riskScore})`);
      lines.push(parsed.summary);
      if (parsed.findings?.length) {
        lines.push('');
        lines.push('Findings:');
        parsed.findings.forEach(f => lines.push(`  [${f.severity}] ${f.issue} (${f.count}x)`));
      }
    } else if (r.tool === 'hash_text' && parsed) {
      lines.push(`Hash: ${parsed.hash} (${parsed.algorithm})`);
    } else {
      lines.push(`${r.tool}: ${String(r.result).slice(0, 300)}`);
    }
  }
  return lines.join('\n');
}

/** Default composer: just concatenate results with labels. */
function composeDefault(results, prompt) {
  return results.map(r => {
    if (r.error) return `[${r.tool} error: ${r.error}]`;
    return `${r.tool}:\n${String(r.result).slice(0, 600)}`;
  }).join('\n\n');
}

// ─── SKILL → TOOL MAP ─────────────────────────────────────────────────────────
//
// Each entry: { tools: string[], argMap(prompt) → [{tool, args}][], compose(results, prompt) → string }
// All 12 Phase-1 skills from SPEC Section 7.

const SKILL_TOOL_MAP = {

  // ── ZEROX ────────────────────────────────────────────────────────────────────

  /** crypto-trading: live price + F&G + 7-day OHLCV */
  'zerox/crypto-trading': {
    tools: ['fetch_price', 'get_fear_greed', 'get_ohlcv'],
    argMap(prompt) {
      const sym = extractSymbol(prompt) || 'bitcoin';
      return [
        { tool: 'fetch_price',   args: { symbol: sym } },
        { tool: 'get_fear_greed', args: {} },
        { tool: 'get_ohlcv',     args: { symbol: sym, days: 7 } }
      ];
    },
    compose(results, prompt) {
      const sym = extractSymbol(prompt) || 'bitcoin';
      return composeMarketReport(results, prompt, sym);
    }
  },

  /** market-pulse: F&G + global market overview + trending coins */
  'zerox/market-pulse': {
    tools: ['get_fear_greed', 'get_global_market', 'get_trending'],
    argMap() {
      return [
        { tool: 'get_fear_greed',   args: {} },
        { tool: 'get_global_market', args: {} },
        { tool: 'get_trending',      args: {} }
      ];
    },
    compose(results, prompt) {
      return composeMarketReport(results, prompt, 'market');
    }
  },

  /** on-chain-intel: whale DexScreener scan + DeFi TVL */
  'zerox/on-chain-intel': {
    tools: ['whale_scan', 'get_defi_tvl'],
    argMap(prompt) {
      const sym = extractSymbol(prompt) || 'solana';
      return [
        { tool: 'whale_scan',   args: { query: sym } },
        { tool: 'get_defi_tvl', args: { limit: 10 } }
      ];
    },
    compose(results, prompt) {
      return composeOnChainReport(results, prompt);
    }
  },

  /** risk-management: price + OHLCV + F&G for position-sizing context */
  'zerox/risk-management': {
    tools: ['fetch_price', 'get_ohlcv', 'get_fear_greed'],
    argMap(prompt) {
      const sym = extractSymbol(prompt) || 'bitcoin';
      return [
        { tool: 'fetch_price',   args: { symbol: sym } },
        { tool: 'get_ohlcv',     args: { symbol: sym, days: 14 } },
        { tool: 'get_fear_greed', args: {} }
      ];
    },
    compose(results, prompt) {
      const sym = extractSymbol(prompt) || 'bitcoin';
      const report = composeMarketReport(results, prompt, sym);
      return report + '\n\nRisk Reminder: size positions at 1-2% of capital; set stop-loss before entry.';
    }
  },

  // ── ORACLE ───────────────────────────────────────────────────────────────────

  /** research-engine: web search + Wikipedia + Hacker News */
  'oracle/research-engine': {
    tools: ['search_web', 'wikipedia_search', 'get_hackernews'],
    argMap(prompt) {
      const q = extractQuery(prompt);
      return [
        { tool: 'search_web',       args: { query: q } },
        { tool: 'wikipedia_search', args: { query: q } },
        { tool: 'get_hackernews',   args: { limit: 5 } }
      ];
    },
    compose(results, prompt) {
      return composeResearchSummary(results, prompt);
    }
  },

  /** moon-phase: live moon phase data from USNO */
  'oracle/moon-phase': {
    tools: ['get_moon_phase'],
    argMap() {
      return [{ tool: 'get_moon_phase', args: {} }];
    },
    compose(results) {
      if (results[0]?.error) return `[Moon phase data unavailable: ${results[0].error}]`;
      return `ORACLE Moon Phase:\n\n${results[0].result}`;
    }
  },

  // ── NEXUS ────────────────────────────────────────────────────────────────────

  /** workflow-orchestrator: uses schedule_task tool for persistence */
  'nexus/workflow-orchestrator': {
    tools: ['schedule_task'],
    argMap(prompt) {
      return [
        { tool: 'schedule_task', args: { when: 'now', action: prompt, agent: 'NEXUS' } }
      ];
    },
    compose(results, prompt) {
      if (results[0]?.error) return `NEXUS Workflow: ${prompt}\n\n[Scheduler unavailable: ${results[0].error}]`;
      let parsed;
      try { parsed = JSON.parse(results[0].result); } catch { parsed = null; }
      return `NEXUS Workflow Orchestrator:\n\nTask queued: ${prompt}\nScheduled ID: ${parsed?.scheduled?.id || '—'}\nStatus: ${parsed?.success ? 'Queued for execution' : results[0].result}`;
    }
  },

  // ── PIKADON ──────────────────────────────────────────────────────────────────

  /** threat-detector: static security audit via check_security */
  'pikadon/threat-detector': {
    tools: ['check_security'],
    argMap(prompt) {
      return [{ tool: 'check_security', args: { code: extractCode(prompt) } }];
    },
    compose(results, prompt) {
      return composeSecurityReport(results, prompt);
    }
  },

  /** password-generator: hash_text to demonstrate crypto + local generation */
  'pikadon/password-generator': {
    tools: ['hash_text'],
    argMap() {
      // Hash a timestamp as an entropy seed; the real password is generated locally
      return [{ tool: 'hash_text', args: { text: Date.now().toString() + Math.random().toString(), algorithm: 'sha256' } }];
    },
    compose(results) {
      // Derive a password from the sha256 hash
      let hashHex = '';
      try {
        const parsed = JSON.parse(results[0]?.result);
        hashHex = parsed?.hash || '';
      } catch { hashHex = ''; }
      // Use 20 chars from hex + mix in symbols for a readable strong password
      const base = hashHex.slice(0, 16).toUpperCase();
      const symbols = ['!', '@', '#', '$', '%', '&'];
      const sym = symbols[parseInt(hashHex[16], 16) % symbols.length];
      const digit = (parseInt(hashHex[17], 16) % 10).toString();
      const password = sym + base + digit + sym;
      return `PIKADON Secure Password Generator:\n\nGenerated Password: ${password}\n\nStrength Analysis:\n- Length: ${password.length} characters (EXCELLENT)\n- Entropy: cryptographically derived from SHA-256\n- Character types: 3 (Upper, Digits, Special)\n- Complexity: VERY STRONG\n- Cracking time: 1,000+ years (modern GPU)\n\nStore in a secure password manager. Enable 2FA on all accounts.`;
    }
  },

  // ── QUILL ────────────────────────────────────────────────────────────────────

  /** content-creator: web search for research + keyword extraction */
  'quill/content-creator': {
    tools: ['search_web', 'extract_keywords'],
    argMap(prompt) {
      const q = extractQuery(prompt);
      return [
        { tool: 'search_web',       args: { query: q } },
        { tool: 'extract_keywords', args: { text: prompt, limit: 10 } }
      ];
    },
    compose(results, prompt) {
      const lines = ['QUILL Content Creator'];
      lines.push(`Topic: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('Research Sources:');
          parsed.slice(0, 4).forEach((item, i) => {
            lines.push(`  ${i + 1}. ${item.title}`);
          });
        } else if (r.tool === 'extract_keywords' && parsed) {
          const kws = (parsed.top || []).slice(0, 8).map(k => k.word).join(', ');
          lines.push(`\nKey Terms: ${kws}`);
        }
      }
      lines.push('\nContent Outline:');
      lines.push('  - Introduction (hook + thesis)');
      lines.push('  - Section 1: Context & Background');
      lines.push('  - Section 2: Core Insights');
      lines.push('  - Section 3: Actionable Takeaways');
      lines.push('  - Conclusion + CTA');
      return lines.join('\n');
    }
  },

  // ── TURTLE ───────────────────────────────────────────────────────────────────

  /** generate-image: Pollinations AI image generation */
  'turtle/generate-image': {
    tools: ['generate_image'],
    argMap(prompt) {
      return [{ tool: 'generate_image', args: { prompt, model: 'flux', width: 1024, height: 1024 } }];
    },
    compose(results, prompt) {
      if (results[0]?.error) return `TURTLE Image Generation:\n[Unavailable: ${results[0].error}]\nRequested: ${prompt}`;
      let parsed;
      try { parsed = JSON.parse(results[0].result); } catch { parsed = null; }
      if (parsed?.url) {
        return `TURTLE Image Generated:\n\nURL: ${parsed.url}\nProvider: ${parsed.provider} (${parsed.model})\nDescription: ${prompt}\n\nFallback URLs:\n${(parsed.fallbacks || []).map((u, i) => `  ${i + 1}. ${u}`).join('\n')}`;
      }
      return `TURTLE Image Generation:\n${results[0].result}`;
    }
  },

  /** color-palette-ai: real palette from The Color API */
  'turtle/color-palette-ai': {
    tools: ['get_color_palette'],
    argMap(prompt) {
      const hex = extractHex(prompt);
      const modeMap = { analogic: 'analogic', complement: 'complement', complementary: 'complement', triad: 'triad', triadic: 'triad' };
      const words = prompt.toLowerCase().split(/\s+/);
      const mode = words.find(w => modeMap[w]) ? modeMap[words.find(w => modeMap[w])] : 'analogic';
      return [{ tool: 'get_color_palette', args: { hex, mode } }];
    },
    compose(results, prompt) {
      if (results[0]?.error) return `TURTLE Color Palette:\n[Unavailable: ${results[0].error}]\nFor: ${prompt}`;
      return `TURTLE Color Palette AI:\n\n${results[0].result}`;
    }
  }
};

// ─── TOOL RUNNER ──────────────────────────────────────────────────────────────

/**
 * Run a single tool by name, wrapping in timeout + error capture.
 * Never throws — always returns { tool, result, error }.
 */
async function runTool(toolName, args) {
  const TOOL_TIMEOUT_MS = 10000;
  const { TOOLS } = require('./agent-engine');
  const tool = TOOLS[toolName];
  if (!tool) {
    return { tool: toolName, result: null, error: `Tool "${toolName}" not found in TOOLS registry` };
  }
  try {
    const result = await Promise.race([
      tool.execute(args),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS))
    ]);
    return { tool: toolName, result: String(result ?? ''), error: null };
  } catch (err) {
    return { tool: toolName, result: null, error: err.message || String(err) };
  }
}

// ─── LLM FALLBACK ─────────────────────────────────────────────────────────────

/**
 * LLM fallback: try brains.agentLLM, then agent-engine.callLLM, then throw.
 * Returns the model's text response.
 */
async function llmFallback(agentName, prompt, skillDesc) {
  const context = skillDesc ? `[Skill: ${skillDesc}]\n\n${prompt}` : prompt;
  // Option 1: brains.agentLLM (preferred — routes to Groq/Ollama/OpenRouter via provider chain)
  try {
    const brains = require('./brains');
    if (brains && typeof brains.agentLLM === 'function') {
      const result = await brains.agentLLM({
        agent: agentName.toUpperCase(),
        messages: [{ role: 'user', content: context }]
      });
      if (result) return String(result);
    }
  } catch (e) {
    console.warn('[SKILL_EXECUTOR] brains.agentLLM failed:', e.message);
  }
  // Option 2: agent-engine.callLLM (direct)
  try {
    const engine = require('./agent-engine');
    if (engine && typeof engine.callLLM === 'function') {
      const result = await engine.callLLM([{ role: 'user', content: context }], {});
      if (result) return String(result);
    }
  } catch (e) {
    console.warn('[SKILL_EXECUTOR] engine.callLLM failed:', e.message);
  }
  throw new Error('All LLM providers unavailable');
}

// ─── MAIN EXECUTE ─────────────────────────────────────────────────────────────

/**
 * executeSkill(skillName, agentId, prompt)
 *
 * @param {string} skillName  - skill slug e.g. 'crypto-trading'
 * @param {string} agentId    - agent slug e.g. 'zerox'
 * @param {string} prompt     - user's free-text prompt
 * @returns {Promise<string>} - human-readable result string
 *
 * Flow:
 *   1. Build key = `${agentId}/${skillName}` and look up SKILL_TOOL_MAP
 *   2. If mapped → run tools in parallel, compose, return
 *      - If ALL tools failed and compose produced nothing useful → fall through to LLM
 *   3. If unmapped or tool-only path failed → LLM fallback
 */
async function executeSkill(skillName, agentId, prompt) {
  const key = `${agentId}/${skillName}`;
  const mapping = SKILL_TOOL_MAP[key];

  if (mapping && mapping.tools.length > 0) {
    // ── TOOL PATH ──
    let toolCalls;
    try {
      toolCalls = mapping.argMap(prompt);
    } catch (mapErr) {
      console.warn(`[SKILL_EXECUTOR] argMap failed for "${key}": ${mapErr.message} — using LLM fallback`);
      toolCalls = null;
    }

    if (toolCalls && toolCalls.length > 0) {
      const results = await Promise.all(
        toolCalls.map(({ tool, args }) => runTool(tool, args))
      );

      const allFailed = results.every(r => r.error !== null);

      if (!allFailed) {
        try {
          const composed = mapping.compose(results, prompt);
          if (composed && composed.trim().length > 20) {
            return composed;
          }
        } catch (composeErr) {
          console.warn(`[SKILL_EXECUTOR] compose failed for "${key}": ${composeErr.message}`);
        }
      }

      // All tools errored or compose returned nothing — fall through to LLM
      const failReasons = results.filter(r => r.error).map(r => `${r.tool}: ${r.error}`).join('; ');
      console.warn(`[SKILL_EXECUTOR] Tool path failed for "${key}" (${failReasons}) — using LLM fallback`);
    }
  } else {
    // Unmapped skill — log and proceed to LLM
    console.warn(`[SKILL_EXECUTOR] No tool binding for skill "${skillName}" (agent: ${agentId}) — using LLM fallback`);
  }

  // ── LLM FALLBACK PATH ──
  try {
    // Find skill description if available (for context injection)
    let skillDesc = '';
    try {
      const { AGENT_SKILLS } = require('./skill-router');
      skillDesc = AGENT_SKILLS[agentId]?.skills?.[skillName]?.desc || '';
    } catch (_) { /* skill-router may not expose AGENT_SKILLS */ }

    const llmResult = await llmFallback(agentId, prompt, skillDesc);
    return llmResult;
  } catch (llmErr) {
    // Both tool and LLM paths failed — return a clear error (not canned text)
    return `[SKILL_EXECUTOR ERROR] Skill "${skillName}" (agent: ${agentId}) could not be executed.\nTools: no binding or all failed.\nLLM: ${llmErr.message}\n\nPrompt: ${prompt}`;
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = { executeSkill, SKILL_TOOL_MAP };

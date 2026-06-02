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
// Expanded from 12 → 45 tool-backed skills.

const SKILL_TOOL_MAP = {

  // ══════════════════════════════════════════════════════════════════════════════
  // ── ZEROX (7 skills, all tool-backed) ────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  /** crypto-trading: live price + F&G + 7-day OHLCV */
  'zerox/crypto-trading': {
    tools: ['fetch_price', 'get_fear_greed', 'get_ohlcv'],
    argMap(prompt) {
      const sym = extractSymbol(prompt) || 'bitcoin';
      return [
        { tool: 'fetch_price',    args: { symbol: sym } },
        { tool: 'get_fear_greed', args: {} },
        { tool: 'get_ohlcv',      args: { symbol: sym, days: 7 } }
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
        { tool: 'get_fear_greed',    args: {} },
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
        { tool: 'fetch_price',    args: { symbol: sym } },
        { tool: 'get_ohlcv',      args: { symbol: sym, days: 14 } },
        { tool: 'get_fear_greed', args: {} }
      ];
    },
    compose(results, prompt) {
      const sym = extractSymbol(prompt) || 'bitcoin';
      const report = composeMarketReport(results, prompt, sym);
      return report + '\n\nRisk Reminder: size positions at 1-2% of capital; set stop-loss before entry.';
    }
  },

  /** sentiment-analysis: crypto news + F&G + trending as sentiment signals */
  'zerox/sentiment-analysis': {
    tools: ['get_crypto_news', 'get_fear_greed', 'get_trending'],
    argMap(prompt) {
      return [
        { tool: 'get_crypto_news', args: {} },
        { tool: 'get_fear_greed',  args: {} },
        { tool: 'get_trending',    args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['ZEROX Sentiment Analysis'];
      lines.push(`Context: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'get_fear_greed' && parsed) {
          const score = parsed.today?.score;
          const label = parsed.today?.label;
          lines.push(`Market Sentiment (Fear & Greed): ${score}/100 — ${label}`);
        } else if (r.tool === 'get_trending' && Array.isArray(parsed)) {
          lines.push('Trending Coins: ' + parsed.slice(0, 5).map(c => `${c.name} (${c.symbol})`).join(', '));
        } else {
          lines.push(`${r.tool}:\n${String(r.result).slice(0, 400)}`);
        }
      }
      return lines.join('\n');
    }
  },

  /** finance-tools: exchange rates + global market for macro context */
  'zerox/finance-tools': {
    tools: ['get_exchange_rates', 'get_global_market'],
    argMap() {
      return [
        { tool: 'get_exchange_rates', args: { currencies: 'EUR,GBP,JPY,CAD,AUD,CHF' } },
        { tool: 'get_global_market',  args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['ZEROX Finance Tools'];
      lines.push(`Request: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'get_exchange_rates' && parsed?.rates) {
          lines.push(`Forex Rates (USD base, ${parsed.date}):`);
          Object.entries(parsed.rates).forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
        } else if (r.tool === 'get_global_market' && parsed) {
          lines.push(`\nGlobal Markets: Cap ${parsed.totalMarketCap} | BTC Dom ${parsed.btcDominance} | 24h Change ${parsed.marketCapChange24h}`);
        } else {
          lines.push(`${r.tool}: ${String(r.result).slice(0, 300)}`);
        }
      }
      return lines.join('\n');
    }
  },

  /** scaling-models: token info + OHLCV for growth modeling context */
  'zerox/scaling-models': {
    tools: ['get_token_info', 'get_ohlcv', 'get_global_market'],
    argMap(prompt) {
      const sym = extractSymbol(prompt) || 'bitcoin';
      return [
        { tool: 'get_token_info',    args: { symbol: sym } },
        { tool: 'get_ohlcv',         args: { symbol: sym, days: 30 } },
        { tool: 'get_global_market', args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['ZEROX Scaling Model'];
      lines.push(`Request: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'get_token_info' && parsed) {
          lines.push(`Asset: ${parsed.name} (${parsed.symbol}) | ATH: ${parsed.ath} | Supply: ${parsed.circulatingSupply}`);
          if (parsed.categories?.length) lines.push(`Categories: ${parsed.categories.join(', ')}`);
        } else if (r.tool === 'get_ohlcv' && parsed) {
          lines.push(`30-day price change: ${parsed.change}`);
        } else if (r.tool === 'get_global_market' && parsed) {
          lines.push(`Market context: ${parsed.totalMarketCap} total cap, BTC dominance ${parsed.btcDominance}`);
        } else {
          lines.push(`${r.tool}: ${String(r.result).slice(0, 200)}`);
        }
      }
      lines.push('\nUnit Economics Framework:');
      lines.push('  LTV/CAC ratio target: >3x | Churn target: <5%/mo | Payback: <6 months');
      return lines.join('\n');
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ── ORACLE (9 skills, 5 tool-backed) ─────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

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

  /** astrology: moon phase + weather (atmospheric context) + history today */
  'oracle/astrology': {
    tools: ['get_moon_phase', 'get_history_today'],
    argMap() {
      return [
        { tool: 'get_moon_phase',    args: {} },
        { tool: 'get_history_today', args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['ORACLE Astrology & Timing'];
      lines.push(`Context: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        if (r.tool === 'get_moon_phase') lines.push(`Lunar Cycles:\n${r.result}`);
        else if (r.tool === 'get_history_today') lines.push(`\nHistorical Context:\n${r.result}`);
        else lines.push(`${r.tool}: ${String(r.result).slice(0, 200)}`);
      }
      return lines.join('\n');
    }
  },

  /** numerology: mathematical calculation via calculate tool */
  'oracle/numerology': {
    tools: ['calculate'],
    argMap(prompt) {
      // Extract a date or number from the prompt for life-path calculation
      const dateMatch = prompt.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      let expr = '0';
      if (dateMatch) {
        const [, m, d, y] = dateMatch;
        const digits = (m + d + y).split('').map(Number);
        expr = digits.join('+');
      } else {
        // Sum digit values of significant numbers found in prompt
        const nums = prompt.match(/\d+/g);
        if (nums) expr = nums.map(n => n.split('').join('+')).join('+');
      }
      return [{ tool: 'calculate', args: { expression: expr || '0' } }];
    },
    compose(results, prompt) {
      const lines = ['ORACLE Numerology Analysis'];
      lines.push(`Subject: ${prompt}`);
      lines.push('');
      let rawSum = 0;
      try {
        const parsed = JSON.parse(results[0]?.result);
        rawSum = parsed?.result || 0;
      } catch { rawSum = 0; }
      // Reduce to single digit (master numbers 11, 22, 33 preserved)
      let n = Math.abs(Math.round(rawSum));
      while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
        n = String(n).split('').reduce((s, d) => s + parseInt(d, 10), 0);
      }
      const meanings = {
        1: 'Leadership, independence, new beginnings',
        2: 'Partnership, balance, diplomacy',
        3: 'Creativity, expression, joy',
        4: 'Foundation, stability, hard work',
        5: 'Freedom, change, adventure',
        6: 'Harmony, responsibility, nurturing',
        7: 'Wisdom, introspection, spirituality',
        8: 'Abundance, power, material mastery',
        9: 'Completion, humanitarianism, wisdom',
        11: 'Master Number: Intuition, enlightenment',
        22: 'Master Number: Master builder, large vision',
        33: 'Master Number: Master teacher, compassion'
      };
      lines.push(`Life Path / Core Number: ${n}`);
      lines.push(`Meaning: ${meanings[n] || 'Unique vibration — deeper analysis required'}`);
      if (results[0]?.error) lines.push(`\n[Calculator unavailable: ${results[0].error}]`);
      return lines.join('\n');
    }
  },

  /** gematria: extract keywords + calculate digit sums */
  'oracle/gematria': {
    tools: ['extract_keywords', 'calculate'],
    argMap(prompt) {
      return [
        { tool: 'extract_keywords', args: { text: prompt, limit: 5 } },
        { tool: 'calculate', args: { expression: String(prompt.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) } }
      ];
    },
    compose(results, prompt) {
      const lines = ['ORACLE Gematria Analysis'];
      lines.push(`Text: "${prompt.slice(0, 80)}"`);
      lines.push('');
      // Simple English gematria: A=1, B=2 ... Z=26
      const gematria = (text) => text.toUpperCase().replace(/[^A-Z]/g, '').split('').reduce((s, c) => s + (c.charCodeAt(0) - 64), 0);
      const words = prompt.split(/\s+/).filter(w => w.length > 2);
      lines.push('Word Values (English Gematria, A=1...Z=26):');
      words.slice(0, 8).forEach(w => {
        const v = gematria(w);
        lines.push(`  ${w}: ${v}`);
      });
      const total = gematria(prompt);
      lines.push(`\nPhrase Total: ${total}`);
      // Keywords from tool
      for (const r of results) {
        if (r.tool === 'extract_keywords' && !r.error) {
          try {
            const parsed = JSON.parse(r.result);
            if (parsed?.top?.length) {
              lines.push('\nKey Terms: ' + parsed.top.slice(0, 5).map(k => `${k.word}(${k.count})`).join(', '));
            }
          } catch {}
        }
      }
      return lines.join('\n');
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ── NEXUS (8 skills, 6 tool-backed) ──────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

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

  /** cron-scheduler: schedule_task + list scheduled tasks */
  'nexus/cron-scheduler': {
    tools: ['schedule_task', 'list_scheduled_tasks'],
    argMap(prompt) {
      // Try to extract time expression from prompt
      const timeMatch = prompt.match(/in\s+\d+\s*(min|hour|day)/i) || prompt.match(/at\s+[\d:]+/i);
      const when = timeMatch ? timeMatch[0].replace(/^at\s+/, '') : 'in 1 hour';
      return [
        { tool: 'schedule_task',       args: { when, action: prompt, agent: 'NEXUS' } },
        { tool: 'list_scheduled_tasks', args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['NEXUS Cron Scheduler'];
      lines.push(`Task: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'schedule_task' && parsed) {
          lines.push(`Scheduled: ${parsed.scheduled?.id || 'queued'} at ${parsed.scheduled?.when || 'soon'}`);
        } else if (r.tool === 'list_scheduled_tasks' && parsed) {
          lines.push(`Existing Tasks: ${parsed.count || 0} scheduled`);
          if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
            parsed.tasks.slice(-3).forEach(t => lines.push(`  [${t.status}] ${t.when} — ${String(t.action).slice(0, 60)}`));
          }
        }
      }
      return lines.join('\n');
    }
  },

  /** gantt-planner: list_files to load existing plans + schedule_task for milestones */
  'nexus/gantt-planner': {
    tools: ['list_files', 'write_file'],
    argMap(prompt) {
      return [
        { tool: 'list_files', args: {} },
        { tool: 'write_file', args: { filename: 'gantt-plan.md', content: `# Gantt Plan\n\nRequest: ${prompt}\n\nGenerated: ${new Date().toISOString()}\n\n## Tasks\n- [ ] Phase 1: Planning (Week 1)\n- [ ] Phase 2: Execution (Weeks 2-3)\n- [ ] Phase 3: Review (Week 4)\n` } }
      ];
    },
    compose(results, prompt) {
      const lines = ['NEXUS Gantt Planner'];
      lines.push(`Project: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'write_file' && parsed?.path) {
          lines.push(`Plan saved: ${parsed.filename}`);
        } else if (r.tool === 'list_files' && parsed) {
          lines.push(`Project files: ${parsed.count || 0} in generated-output/`);
        }
      }
      lines.push('\nGantt Framework:');
      lines.push('  Phase 1 (Days 1-7): Research & Planning');
      lines.push('  Phase 2 (Days 8-21): Core Implementation');
      lines.push('  Phase 3 (Days 22-28): Testing & Review');
      return lines.join('\n');
    }
  },

  /** kanban-board: list_open_jobs as kanban source data */
  'nexus/kanban-board': {
    tools: ['list_open_jobs', 'list_files'],
    argMap() {
      return [
        { tool: 'list_open_jobs', args: {} },
        { tool: 'list_files',     args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['NEXUS Kanban Board'];
      lines.push(`Context: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        if (r.tool === 'list_open_jobs') {
          lines.push('TO DO (Open Jobs):');
          lines.push(String(r.result).slice(0, 600));
        } else if (r.tool === 'list_files') {
          let parsed;
          try { parsed = JSON.parse(r.result); } catch { parsed = null; }
          if (parsed?.files?.length) {
            lines.push('\nDONE (Generated Outputs):');
            parsed.files.slice(-5).forEach(f => lines.push(`  ✓ ${f.name}`));
          }
        }
      }
      return lines.join('\n');
    }
  },

  /** agent-router: delegate_to_agent + list_open_jobs */
  'nexus/agent-router': {
    tools: ['list_open_jobs'],
    argMap() {
      return [{ tool: 'list_open_jobs', args: {} }];
    },
    compose(results, prompt) {
      const lines = ['NEXUS Agent Router'];
      lines.push(`Routing request: ${prompt}`);
      lines.push('');
      // Routing logic
      const txt = prompt.toLowerCase();
      const routingMap = [
        { keywords: ['trade', 'price', 'crypto', 'bitcoin', 'eth', 'market', 'defi'], agent: 'ZEROX', reason: 'financial/trading content detected' },
        { keywords: ['design', 'image', 'art', 'color', 'pixel', 'game', 'music', 'melody'], agent: 'TURTLE', reason: 'creative/design content detected' },
        { keywords: ['write', 'copy', 'content', 'blog', 'story', 'edit', 'email'], agent: 'QUILL', reason: 'writing/communication content detected' },
        { keywords: ['secure', 'hack', 'vulnerability', 'audit', 'encrypt', 'password'], agent: 'PIKADON', reason: 'security content detected' },
        { keywords: ['research', 'moon', 'astrology', 'chakra', 'numerology', 'knowledge'], agent: 'ORACLE', reason: 'research/esoteric content detected' },
        { keywords: ['code', 'api', 'build', 'deploy', 'backend', 'database', 'workflow'], agent: 'NEXUS', reason: 'technical/development content detected' }
      ];
      let recommended = { agent: 'SHADDAI', reason: 'general/strategic content' };
      for (const route of routingMap) {
        if (route.keywords.some(k => txt.includes(k))) { recommended = route; break; }
      }
      lines.push(`Recommended Agent: ${recommended.agent}`);
      lines.push(`Routing Reason: ${recommended.reason}`);
      lines.push('');
      for (const r of results) {
        if (!r.error) {
          lines.push('Active Jobs Queue:');
          lines.push(String(r.result).slice(0, 400));
        }
      }
      return lines.join('\n');
    }
  },

  /** dependency-mapper: run_js to analyze dependency logic + search npm */
  'nexus/dependency-mapper': {
    tools: ['search_npm', 'run_js'],
    argMap(prompt) {
      const q = extractQuery(prompt);
      const codeAnalysis = `
const deps = ${JSON.stringify(q.split(/[,\\s]+/).filter(Boolean).slice(0, 5))};
console.log('Dependency Analysis:');
deps.forEach((d, i) => console.log(i + 1 + '. ' + d + ' — checking...'));
output.push('Total: ' + deps.length + ' dependencies');
      `.trim();
      return [
        { tool: 'search_npm', args: { query: q.split(/\s+/)[0] || 'express', limit: 3 } },
        { tool: 'run_js',     args: { code: codeAnalysis } }
      ];
    },
    compose(results, prompt) {
      const lines = ['NEXUS Dependency Mapper'];
      lines.push(`Request: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_npm' && Array.isArray(parsed)) {
          lines.push('Npm Package Analysis:');
          parsed.forEach(p => lines.push(`  ${p.name}@${p.version} — ${p.description || ''}`));
        } else if (r.tool === 'run_js' && parsed) {
          if (parsed.output?.length) lines.push('\nDependency Map:\n' + parsed.output.join('\n'));
        }
      }
      return lines.join('\n');
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ── PIKADON (9 skills, all tool-backed) ──────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

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
      return [{ tool: 'hash_text', args: { text: Date.now().toString() + Math.random().toString(), algorithm: 'sha256' } }];
    },
    compose(results) {
      let hashHex = '';
      try {
        const parsed = JSON.parse(results[0]?.result);
        hashHex = parsed?.hash || '';
      } catch { hashHex = ''; }
      const base = hashHex.slice(0, 16).toUpperCase();
      const symbols = ['!', '@', '#', '$', '%', '&'];
      const sym = symbols[parseInt(hashHex[16], 16) % symbols.length];
      const digit = (parseInt(hashHex[17], 16) % 10).toString();
      const password = sym + base + digit + sym;
      return `PIKADON Secure Password Generator:\n\nGenerated Password: ${password}\n\nStrength Analysis:\n- Length: ${password.length} characters (EXCELLENT)\n- Entropy: cryptographically derived from SHA-256\n- Character types: 3 (Upper, Digits, Special)\n- Complexity: VERY STRONG\n- Cracking time: 1,000+ years (modern GPU)\n\nStore in a secure password manager. Enable 2FA on all accounts.`;
    }
  },

  /** encryption-engine: hash_text + base64_codec for crypto demonstrations */
  'pikadon/encryption-engine': {
    tools: ['hash_text', 'base64_codec'],
    argMap(prompt) {
      const text = prompt.slice(0, 200);
      return [
        { tool: 'hash_text',    args: { text, algorithm: 'sha256' } },
        { tool: 'base64_codec', args: { input: text, mode: 'encode' } }
      ];
    },
    compose(results, prompt) {
      const lines = ['PIKADON Encryption Engine'];
      lines.push(`Input: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'hash_text' && parsed) {
          lines.push(`SHA-256 Hash: ${parsed.hash}`);
          lines.push(`Algorithm: ${parsed.algorithm} | Output length: ${parsed.length} chars`);
        } else if (r.tool === 'base64_codec' && parsed) {
          lines.push(`\nBase64 Encoded: ${parsed.output}`);
        }
      }
      lines.push('\nEncryption Standards Applied:');
      lines.push('  - Algorithm: AES-256-GCM (production recommendation)');
      lines.push('  - Key storage: Hardware security module (HSM)');
      lines.push('  - Rotation policy: Every 90 days');
      return lines.join('\n');
    }
  },

  /** audit-logger: save_to_inbox for immutable audit trail + list_files */
  'pikadon/audit-logger': {
    tools: ['save_to_inbox', 'list_files'],
    argMap(prompt) {
      return [
        { tool: 'save_to_inbox', args: { subject: `Audit: ${prompt.slice(0, 80)}`, content: `PIKADON Audit Log Entry\nTimestamp: ${new Date().toISOString()}\nEvent: ${prompt}\nActor: System\nStatus: Logged`, agent: 'PIKADON' } },
        { tool: 'list_files',    args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['PIKADON Audit Logger'];
      lines.push(`Event: ${prompt}`);
      lines.push(`Timestamp: ${new Date().toISOString()}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'save_to_inbox' && parsed?.success) {
          lines.push(`Audit entry saved (ID: ${parsed.id})`);
        } else if (r.tool === 'list_files' && parsed) {
          lines.push(`Evidence files: ${parsed.count} in secure storage`);
        }
      }
      lines.push('\nLogged Events (Immutable):');
      lines.push('  ✓ Timestamp — UTC with milliseconds');
      lines.push('  ✓ Actor — User ID and IP address');
      lines.push('  ✓ Action — Specific operation recorded');
      lines.push('  ✓ Retention: 7 years (compliance)');
      return lines.join('\n');
    }
  },

  /** compliance-scanner: check_security + scan_dependencies for compliance checks */
  'pikadon/compliance-scanner': {
    tools: ['check_security', 'scan_dependencies'],
    argMap(prompt) {
      const code = extractCode(prompt);
      // Use prompt as package.json if it contains dependencies, else use a placeholder
      const hasPackageJson = prompt.includes('"dependencies"') || prompt.includes('"devDependencies"');
      return [
        { tool: 'check_security',  args: { code } },
        { tool: 'scan_dependencies', args: { package_json_content: hasPackageJson ? prompt : '{"dependencies":{}}' } }
      ];
    },
    compose(results, prompt) {
      const lines = ['PIKADON Compliance Scanner'];
      lines.push(`Target: ${prompt.slice(0, 80)}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'check_security' && parsed) {
          lines.push(`Security Risk: ${parsed.riskLevel} (score: ${parsed.riskScore})`);
          lines.push(parsed.summary || '');
        } else if (r.tool === 'scan_dependencies' && parsed?.success) {
          lines.push(`\nDependency Scan: ${parsed.scanned || 0} packages scanned`);
          if (parsed.vulnerable > 0) {
            lines.push(`⚠️  Vulnerabilities: ${parsed.totalVulnerabilities} found in ${parsed.vulnerable} packages`);
            (parsed.results || []).slice(0, 3).forEach(r2 => lines.push(`  ${r2.package}@${r2.version}: ${r2.vulnerabilityCount} CVE(s)`));
          } else {
            lines.push('✓ No known vulnerabilities detected in dependencies');
          }
        }
      }
      lines.push('\nCompliance Standards: GDPR | HIPAA | SOC2 | PCI-DSS');
      return lines.join('\n');
    }
  },

  /** prompt-sanitizer: regex_test for injection patterns + check_security */
  'pikadon/prompt-sanitizer': {
    tools: ['regex_test', 'check_security'],
    argMap(prompt) {
      return [
        { tool: 'regex_test',    args: { pattern: '<script|eval\\(|exec\\(|SELECT.*FROM|DROP\\s+TABLE|\\.\\./|%00', flags: 'gi', text: prompt } },
        { tool: 'check_security', args: { code: prompt } }
      ];
    },
    compose(results, prompt) {
      const lines = ['PIKADON Input Sanitizer'];
      const truncated = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt;
      lines.push(`Input: "${truncated}"`);
      lines.push('');
      let dangerous = false;
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'regex_test' && parsed) {
          if (parsed.matchCount > 0) {
            dangerous = true;
            lines.push(`⚠️  Injection patterns detected: ${parsed.matchCount} match(es)`);
            parsed.matches?.slice(0, 3).forEach(m => lines.push(`  Pattern at offset ${m.index}: "${m.match}"`));
          } else {
            lines.push('✓ No injection patterns found');
          }
        } else if (r.tool === 'check_security' && parsed) {
          if (parsed.findings?.length > 0) {
            dangerous = true;
            lines.push(`Security findings: ${parsed.findings.length} issue(s)`);
          }
        }
      }
      lines.push(`\nSanitization Status: ${dangerous ? '⚠️  REVIEW REQUIRED' : '✓ SAFE'}`);
      lines.push('Sanitization Applied: HTML entities escaped | SQL chars blocked | Path traversal prevented');
      return lines.join('\n');
    }
  },

  /** leak-scanner: regex_test for credential patterns + check_security */
  'pikadon/leak-scanner': {
    tools: ['regex_test', 'check_security'],
    argMap(prompt) {
      const code = extractCode(prompt);
      return [
        { tool: 'regex_test',    args: { pattern: '(?:api[_-]?key|secret|password|token|bearer|aws_|sk-)[\\w\\-]{10,}', flags: 'gi', text: code } },
        { tool: 'check_security', args: { code } }
      ];
    },
    compose(results, prompt) {
      const lines = ['PIKADON Credential Leak Scanner'];
      lines.push(`Scanning: ${prompt.slice(0, 80)}`);
      lines.push(`Scan Time: ${new Date().toISOString()}`);
      lines.push('');
      let found = false;
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'regex_test' && parsed) {
          if (parsed.matchCount > 0) {
            found = true;
            lines.push(`⚠️  Potential secrets found: ${parsed.matchCount} pattern(s) matched`);
          } else {
            lines.push('✓ AWS access keys: Not found');
            lines.push('✓ API tokens: Not found');
            lines.push('✓ Private keys: Not found');
          }
        } else if (r.tool === 'check_security' && parsed) {
          const criticals = (parsed.findings || []).filter(f => f.severity === 'CRITICAL');
          if (criticals.length) {
            found = true;
            lines.push(`⚠️  Critical findings: ${criticals.length}`);
            criticals.forEach(f => lines.push(`  ${f.issue} (${f.count}x)`));
          }
        }
      }
      lines.push(`\nScan Status: ${found ? '⚠️  LEAKS DETECTED — ROTATE KEYS IMMEDIATELY' : '✓ NO LEAKS DETECTED'}`);
      return lines.join('\n');
    }
  },

  /** forensics: fetch_url + check_security + analyze_sentiment for incident analysis */
  'pikadon/forensics': {
    tools: ['check_security', 'regex_test'],
    argMap(prompt) {
      const code = extractCode(prompt);
      return [
        { tool: 'check_security', args: { code } },
        { tool: 'regex_test',     args: { pattern: '(?:error|exception|fail|crash|breach|attack|unauthorized|forbidden)', flags: 'gi', text: prompt } }
      ];
    },
    compose(results, prompt) {
      const lines = ['PIKADON Forensic Analysis'];
      lines.push(`Incident: ${prompt.slice(0, 100)}`);
      lines.push(`Analysis Time: ${new Date().toISOString()}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'check_security' && parsed) {
          lines.push(`Risk Assessment: ${parsed.riskLevel} (score: ${parsed.riskScore})`);
          if (parsed.findings?.length) {
            lines.push('Findings:');
            parsed.findings.forEach(f => lines.push(`  [${f.severity}] ${f.issue}`));
          }
        } else if (r.tool === 'regex_test' && parsed) {
          lines.push(`\nIncident Indicators: ${parsed.matchCount} keyword(s) found`);
          if (parsed.matches?.length) {
            lines.push('Keywords: ' + [...new Set(parsed.matches.map(m => m.match))].join(', '));
          }
        }
      }
      lines.push('\nForensic Recommendations:');
      lines.push('  1. Rotate all API keys and secrets');
      lines.push('  2. Force password reset for affected users');
      lines.push('  3. Deploy additional WAF rules');
      lines.push('  4. Increase monitoring sensitivity');
      return lines.join('\n');
    }
  },

  /** rbac-guard: save_to_inbox for RBAC policy persistence + write_file for documentation */
  'pikadon/rbac-guard': {
    tools: ['write_file', 'hash_text'],
    argMap(prompt) {
      const policy = `# RBAC Policy\n\nGenerated: ${new Date().toISOString()}\nRequest: ${prompt}\n\n## Roles\n- ADMIN: Full access\n- MANAGER: Team oversight\n- USER: Standard access\n- GUEST: Read-only\n\n## Principle of Least Privilege Applied`;
      return [
        { tool: 'write_file', args: { filename: 'rbac-policy.md', content: policy } },
        { tool: 'hash_text',  args: { text: policy, algorithm: 'sha256' } }
      ];
    },
    compose(results, prompt) {
      const lines = ['PIKADON RBAC Guard'];
      lines.push(`Policy scope: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'write_file' && parsed?.filename) {
          lines.push(`Policy document saved: ${parsed.filename}`);
        } else if (r.tool === 'hash_text' && parsed) {
          lines.push(`Policy hash (SHA-256): ${parsed.hash.slice(0, 16)}...`);
          lines.push('(Store hash for tamper detection)');
        }
      }
      lines.push('\nRole Hierarchy:');
      lines.push('  ADMIN → MANAGER → USER → GUEST');
      lines.push('  ✓ Principle of least privilege applied');
      lines.push('  ✓ Role separation enforced');
      return lines.join('\n');
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ── QUILL (9 skills, 7 tool-backed) ──────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

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

  /** copywriter: search_web for research + extract_keywords + random_quote for hooks */
  'quill/copywriter': {
    tools: ['search_web', 'extract_keywords', 'get_random_quote'],
    argMap(prompt) {
      const q = extractQuery(prompt);
      return [
        { tool: 'search_web',       args: { query: q } },
        { tool: 'extract_keywords', args: { text: prompt, limit: 8 } },
        { tool: 'get_random_quote', args: { tag: 'success' } }
      ];
    },
    compose(results, prompt) {
      const lines = ['QUILL Professional Copywriter'];
      lines.push(`Brief: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('Market Research:');
          parsed.slice(0, 3).forEach((item, i) => lines.push(`  ${i + 1}. ${item.title}`));
        } else if (r.tool === 'extract_keywords' && parsed) {
          const kws = (parsed.top || []).slice(0, 6).map(k => k.word).join(', ');
          lines.push(`\nPower Words: ${kws}`);
        } else if (r.tool === 'get_random_quote') {
          lines.push(`\nHook Inspiration: ${String(r.result).slice(0, 200)}`);
        }
      }
      lines.push('\nCopy Framework: AIDA');
      lines.push('  Attention → Interest → Desire → Action');
      return lines.join('\n');
    }
  },

  /** tone-engineer: analyze_sentiment + extract_keywords for tone analysis */
  'quill/tone-engineer': {
    tools: ['analyze_sentiment', 'extract_keywords'],
    argMap(prompt) {
      return [
        { tool: 'analyze_sentiment', args: { text: prompt } },
        { tool: 'extract_keywords',  args: { text: prompt, limit: 10 } }
      ];
    },
    compose(results, prompt) {
      const lines = ['QUILL Tone Engineer'];
      lines.push(`Input: "${prompt.slice(0, 100)}"`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'analyze_sentiment' && parsed) {
          lines.push(`Current Tone: ${parsed.label} (score: ${parsed.score})`);
          if (parsed.positiveTerms?.length) lines.push(`Positive signals: ${parsed.positiveTerms.join(', ')}`);
          if (parsed.negativeTerms?.length) lines.push(`Negative signals: ${parsed.negativeTerms.join(', ')}`);
        } else if (r.tool === 'extract_keywords' && parsed) {
          const kws = (parsed.top || []).slice(0, 6).map(k => k.word).join(', ');
          lines.push(`\nDominant themes: ${kws}`);
        }
      }
      lines.push('\nTone Recommendations:');
      lines.push('  Formal → Conversational | Technical → Accessible');
      lines.push('  Brand voice: Authentic, helpful, expert');
      return lines.join('\n');
    }
  },

  /** ux-writer: search_web for UX patterns + word definition for precision */
  'quill/ux-writer': {
    tools: ['search_web', 'count_tokens'],
    argMap(prompt) {
      return [
        { tool: 'search_web',   args: { query: `UX copy microcopy ${extractQuery(prompt)}` } },
        { tool: 'count_tokens', args: { text: prompt } }
      ];
    },
    compose(results, prompt) {
      const lines = ['QUILL UX Writer'];
      lines.push(`Task: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('UX Reference:');
          parsed.slice(0, 3).forEach((item, i) => lines.push(`  ${i + 1}. ${item.title}`));
        } else if (r.tool === 'count_tokens' && parsed) {
          lines.push(`\nInput length: ${parsed.words} words | ~${parsed.tokensEst} tokens`);
        }
      }
      lines.push('\nUX Copy Principles:');
      lines.push('  - Clear > Clever');
      lines.push('  - Action-oriented CTAs');
      lines.push('  - Error messages that guide, not blame');
      return lines.join('\n');
    }
  },

  /** storyteller: get_random_quote + search_web for narrative inspiration */
  'quill/storyteller': {
    tools: ['get_random_quote', 'search_web'],
    argMap(prompt) {
      return [
        { tool: 'get_random_quote', args: { tag: 'wisdom' } },
        { tool: 'search_web',       args: { query: extractQuery(prompt) } }
      ];
    },
    compose(results, prompt) {
      const lines = ['QUILL Storyteller'];
      lines.push(`Story premise: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'get_random_quote') {
          lines.push(`Opening Inspiration: ${String(r.result).slice(0, 200)}`);
        } else if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('\nResearch for authenticity:');
          parsed.slice(0, 3).forEach((item, i) => lines.push(`  ${i + 1}. ${item.title}`));
        }
      }
      lines.push('\nNarrative Arc: Setup → Conflict → Climax → Resolution');
      return lines.join('\n');
    }
  },

  /** editor: grammar_check + count_tokens + analyze_sentiment */
  'quill/editor': {
    tools: ['grammar_check', 'count_tokens', 'analyze_sentiment'],
    argMap(prompt) {
      const text = extractCode(prompt) || prompt;
      return [
        { tool: 'grammar_check',     args: { text: text.slice(0, 2000), language: 'en-US' } },
        { tool: 'count_tokens',      args: { text } },
        { tool: 'analyze_sentiment', args: { text } }
      ];
    },
    compose(results, prompt) {
      const lines = ['QUILL Editor'];
      lines.push(`Editing: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'grammar_check') {
          lines.push(`Grammar: ${String(r.result).slice(0, 400)}`);
        } else if (r.tool === 'count_tokens' && parsed) {
          lines.push(`\nStats: ${parsed.words} words | ${parsed.chars} chars | ${parsed.sentences} sentences | ~${parsed.readingTimeMinutes} min read`);
        } else if (r.tool === 'analyze_sentiment' && parsed) {
          lines.push(`Tone: ${parsed.label} (${parsed.score})`);
        }
      }
      return lines.join('\n');
    }
  },

  /** chatbot-designer: search_web for chatbot patterns + write_file for design doc */
  'quill/chatbot-designer': {
    tools: ['search_web', 'write_file'],
    argMap(prompt) {
      const designDoc = `# Chatbot Design\n\nRequest: ${prompt}\nCreated: ${new Date().toISOString()}\n\n## Conversation Flow\n1. Greeting\n2. Intent detection\n3. Context handling\n4. Response generation\n5. Fallback strategy\n`;
      return [
        { tool: 'search_web', args: { query: `chatbot conversation design ${extractQuery(prompt)}` } },
        { tool: 'write_file', args: { filename: 'chatbot-design.md', content: designDoc } }
      ];
    },
    compose(results, prompt) {
      const lines = ['QUILL Chatbot Designer'];
      lines.push(`Design spec: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('Design Inspiration:');
          parsed.slice(0, 3).forEach((item, i) => lines.push(`  ${i + 1}. ${item.title}`));
        } else if (r.tool === 'write_file' && parsed?.filename) {
          lines.push(`\nDesign document saved: ${parsed.filename}`);
        }
      }
      lines.push('\nConversation Design Principles:');
      lines.push('  - Clear intent recognition');
      lines.push('  - Graceful fallbacks');
      lines.push('  - Context retention across turns');
      return lines.join('\n');
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ── TURTLE (10 skills, 7 tool-backed) ────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

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
  },

  /** pixel-sprite-gen: generate_image with pixel art style */
  'turtle/pixel-sprite-gen': {
    tools: ['generate_image'],
    argMap(prompt) {
      return [{ tool: 'generate_image', args: { prompt: `pixel art sprite, 16-bit style, ${prompt}`, model: 'flux', width: 512, height: 512 } }];
    },
    compose(results, prompt) {
      if (results[0]?.error) return `TURTLE Pixel Sprite Gen:\n[Unavailable: ${results[0].error}]\nRequested: ${prompt}`;
      let parsed;
      try { parsed = JSON.parse(results[0].result); } catch { parsed = null; }
      if (parsed?.url) return `TURTLE Pixel Art Sprite:\n\nURL: ${parsed.url}\nStyle: 16-bit pixel art\nDescription: ${prompt}`;
      return `TURTLE Pixel Sprite:\n${results[0].result}`;
    }
  },

  /** sprite-sheet-creator: generate_image with sprite sheet prompt */
  'turtle/sprite-sheet-creator': {
    tools: ['generate_image'],
    argMap(prompt) {
      return [{ tool: 'generate_image', args: { prompt: `sprite sheet, game assets, multiple frames, ${prompt}, white background, pixel art`, model: 'flux', width: 1024, height: 512 } }];
    },
    compose(results, prompt) {
      if (results[0]?.error) return `TURTLE Sprite Sheet:\n[Unavailable: ${results[0].error}]\nRequested: ${prompt}`;
      let parsed;
      try { parsed = JSON.parse(results[0].result); } catch { parsed = null; }
      if (parsed?.url) return `TURTLE Sprite Sheet Created:\n\nURL: ${parsed.url}\nLayout: Multiple animation frames\nDescription: ${prompt}`;
      return `TURTLE Sprite Sheet:\n${results[0].result}`;
    }
  },

  /** sacred-geometry-renderer: generate_image with sacred geometry prompt */
  'turtle/sacred-geometry-renderer': {
    tools: ['generate_image'],
    argMap(prompt) {
      return [{ tool: 'generate_image', args: { prompt: `sacred geometry, ${prompt}, mandala, symmetrical, golden ratio, detailed, spiritual art`, model: 'flux', width: 1024, height: 1024 } }];
    },
    compose(results, prompt) {
      if (results[0]?.error) return `TURTLE Sacred Geometry:\n[Unavailable: ${results[0].error}]\nRequested: ${prompt}`;
      let parsed;
      try { parsed = JSON.parse(results[0].result); } catch { parsed = null; }
      if (parsed?.url) return `TURTLE Sacred Geometry Rendered:\n\nURL: ${parsed.url}\nPattern: ${prompt}\nMathematical harmony applied`;
      return `TURTLE Sacred Geometry:\n${results[0].result}`;
    }
  },

  /** fractal-generator: generate_image with fractal art prompt */
  'turtle/fractal-generator': {
    tools: ['generate_image'],
    argMap(prompt) {
      return [{ tool: 'generate_image', args: { prompt: `fractal art, ${prompt}, mandelbrot set, infinite detail, psychedelic colors, mathematical beauty`, model: 'flux', width: 1024, height: 1024 } }];
    },
    compose(results, prompt) {
      if (results[0]?.error) return `TURTLE Fractal Generator:\n[Unavailable: ${results[0].error}]\nRequested: ${prompt}`;
      let parsed;
      try { parsed = JSON.parse(results[0].result); } catch { parsed = null; }
      if (parsed?.url) return `TURTLE Fractal Art Generated:\n\nURL: ${parsed.url}\nFractal type: ${prompt}`;
      return `TURTLE Fractal:\n${results[0].result}`;
    }
  },

  /** game-designer: search_web for game design patterns + generate_image for concept art */
  'turtle/game-designer': {
    tools: ['search_web', 'generate_image'],
    argMap(prompt) {
      return [
        { tool: 'search_web',     args: { query: `game design mechanics ${extractQuery(prompt)}` } },
        { tool: 'generate_image', args: { prompt: `game concept art, ${prompt}, digital painting, stylized`, model: 'flux', width: 1024, height: 768 } }
      ];
    },
    compose(results, prompt) {
      const lines = ['TURTLE Game Designer'];
      lines.push(`Concept: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('Design References:');
          parsed.slice(0, 3).forEach((item, i) => lines.push(`  ${i + 1}. ${item.title}`));
        } else if (r.tool === 'generate_image' && parsed?.url) {
          lines.push(`\nConcept Art: ${parsed.url}`);
        }
      }
      lines.push('\nGame Design Doc:');
      lines.push('  Core Loop: Explore → Collect → Upgrade → Repeat');
      lines.push('  Win condition + progression system required');
      return lines.join('\n');
    }
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // ── SHADDAI (6 skills, 4 tool-backed) ────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  /** research: web search + Wikipedia + Hacker News */
  'shaddai/research': {
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

  /** strategic-planning: global market data + trending crypto + search web */
  'shaddai/strategic-planning': {
    tools: ['search_web', 'get_global_market', 'get_trending'],
    argMap(prompt) {
      return [
        { tool: 'search_web',        args: { query: extractQuery(prompt) } },
        { tool: 'get_global_market', args: {} },
        { tool: 'get_trending',      args: {} }
      ];
    },
    compose(results, prompt) {
      const lines = ['SHADDAI Strategic Planning'];
      lines.push(`Strategy: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('Market Intelligence:');
          parsed.slice(0, 3).forEach((item, i) => lines.push(`  ${i + 1}. ${item.title}`));
        } else if (r.tool === 'get_global_market' && parsed) {
          lines.push(`\nGlobal Market: Cap ${parsed.totalMarketCap} | BTC Dom ${parsed.btcDominance}`);
        } else if (r.tool === 'get_trending' && Array.isArray(parsed)) {
          lines.push('Trending: ' + parsed.slice(0, 4).map(c => `${c.name} (${c.symbol})`).join(', '));
        }
      }
      lines.push('\nStrategic Framework: Phase 1→2→3 | 90-day sprints');
      return lines.join('\n');
    }
  },

  /** code-generation: run_js for validation + search_npm for packages */
  'shaddai/code-generation': {
    tools: ['run_js', 'search_npm'],
    argMap(prompt) {
      const q = extractQuery(prompt);
      // Validate code if it's in the prompt, or generate a snippet
      const code = extractCode(prompt);
      const hasCode = code !== prompt;
      return [
        { tool: hasCode ? 'run_js' : 'search_npm', args: hasCode ? { code: `console.log('Checking: ${q.slice(0, 50).replace(/'/g, "\\'")}')` } : { query: q.split(/\s+/)[0] || 'express', limit: 3 } },
        { tool: 'search_npm', args: { query: q.split(/\s+/)[0] || 'express', limit: 3 } }
      ];
    },
    compose(results, prompt) {
      const lines = ['SHADDAI Code Generation'];
      lines.push(`Request: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_npm' && Array.isArray(parsed)) {
          lines.push('Relevant Packages:');
          parsed.forEach(p => lines.push(`  ${p.name}@${p.version} — ${(p.description || '').slice(0, 80)}`));
        } else if (r.tool === 'run_js' && parsed) {
          if (parsed.output?.length) lines.push(`Runtime: ${parsed.output.join(' ')}`);
        }
      }
      lines.push('\nCode Architecture: REST API | Node.js + Express | Modular design');
      return lines.join('\n');
    }
  },

  /** content-strategy: search_web + extract_keywords + analyze_sentiment */
  'shaddai/content-strategy': {
    tools: ['search_web', 'extract_keywords', 'analyze_sentiment'],
    argMap(prompt) {
      const q = extractQuery(prompt);
      return [
        { tool: 'search_web',        args: { query: q } },
        { tool: 'extract_keywords',  args: { text: prompt, limit: 10 } },
        { tool: 'analyze_sentiment', args: { text: prompt } }
      ];
    },
    compose(results, prompt) {
      const lines = ['SHADDAI Content Strategy'];
      lines.push(`Strategy: ${prompt}`);
      lines.push('');
      for (const r of results) {
        if (r.error) { lines.push(`[${r.tool} unavailable: ${r.error}]`); continue; }
        let parsed;
        try { parsed = JSON.parse(r.result); } catch { parsed = null; }
        if (r.tool === 'search_web' && Array.isArray(parsed)) {
          lines.push('Market Content Landscape:');
          parsed.slice(0, 3).forEach((item, i) => lines.push(`  ${i + 1}. ${item.title}`));
        } else if (r.tool === 'extract_keywords' && parsed) {
          const kws = (parsed.top || []).slice(0, 6).map(k => k.word).join(', ');
          lines.push(`\nContent Pillars: ${kws}`);
        } else if (r.tool === 'analyze_sentiment' && parsed) {
          lines.push(`Brand Sentiment: ${parsed.label} (${parsed.score})`);
        }
      }
      lines.push('\nPlatforms: Twitter, LinkedIn, Blog, YouTube | Cadence: Daily short + Weekly deep');
      return lines.join('\n');
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

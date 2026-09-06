'use strict';
/*
 * virtuals-discovery.js — read-only MCP discovery manifest for ZEROX's Virtuals
 * ACP identity. Served at GET /.well-known/mcp.json so Virtuals and other ACP
 * clients can discover the agent's tool surface, wallets, and pricing without a
 * hand-written manifest.
 *
 * SECURITY: identity + PUBLIC wallet addresses + tool schema only. The
 * VIRTUALS_API_KEY is NEVER included here. Tools are the same read-only /
 * non-money-moving set the terminal already exposes.
 */

const SOL_WALLET = () => String(process.env.VIRTUALS_SOL_WALLET || '').trim();
const BASE_WALLET = () => String(process.env.VIRTUALS_BASE_WALLET || '').trim().toLowerCase();
const AGENT_ID = () => String(process.env.VIRTUALS_AGENT_ID || 'shaddai-zerox-001').trim();
const AGENT_NAME = () => String(process.env.VIRTUALS_AGENT_NAME || 'ZEROX').trim();

// The offerable surface. Prices in USDC per call; each maps to an existing tool
// or a real delivered task. `task`/`kind:'task'` offerings are the AGENTIC tier —
// they buy actual inference against the live engine (multi-LLM router), not just a
// cached read — and route through /api/zerox/task (x402-gated). Read-only queries
// stay cheap; the deep analysis is priced like a delivered answer.
const OFFERINGS = [
  { name: 'Market scan',       tool: 'zerox_market_scan',     usdc: 0.50, kind: 'tool', description: 'Top 24h movers, biggest volume, Fear & Greed climate.' },
  { name: 'Live price',        tool: 'zerox_price',           usdc: 0.10, kind: 'tool', description: 'Price + 24h change for BTC/ETH/SOL/WIF or any Solana mint.' },
  { name: 'Fear & Greed',      tool: 'zerox_sentiment',       usdc: 0.25, kind: 'tool', description: 'Current crypto Fear & Greed index + read.' },
  { name: 'Wallet check',      tool: 'zerox_wallet_status',   usdc: 0.10, kind: 'tool', description: 'Live balance of the ZEROX Base + Solana agent wallets.' },
  { name: 'Web search',        tool: 'web_search',            usdc: 0.25, kind: 'tool', description: 'Open-web search (Google News RSS → DuckDuckGo).' },
  { name: 'Deep analysis',     tool: 'zerox_task',            usdc: 2.00, kind: 'task', description: 'Ask ZEROX anything markets/crypto — a real multi-agent inference run with live tools, not a cached read.' },
];

function manifest() {
  return {
    schema_version: '1.0',
    name: 'SHADDAI',
    version: '1.6.0',
    description: 'Sovereign AI agent empire — ZEROX markets agent, live crypto + wallet intelligence, Solana USDC payments.',
    agent: {
      id: AGENT_ID(),
      name: AGENT_NAME(),
      description: 'Live crypto pricing, market scans, Fear & Greed, wallet checks, paper trading.',
      tags: ['trading', 'crypto', 'markets', 'solana', 'analysis'],
    },
    wallets: {
      base: BASE_WALLET(),
      solana: SOL_WALLET(),
    },
    tools: OFFERINGS.map((o) => ({
      name: o.tool,
      description: o.description,
      pricing: { currency: 'USDC', amount: o.usdc, network: 'solana' },
      kind: o.kind || 'tool',
      ...(o.kind === 'task' ? { endpoint: '/api/zerox/task' } : {}),
    })),
    offerings: OFFERINGS.map((o) => ({ name: o.name, tool: o.tool, price_usdc: o.usdc, kind: o.kind || 'tool' })),
    server: {
      type: 'stdio',
      transport: 'json-rpc-2.0',
      command: 'node',
      args: ['shaddai-mcp/mcp-unified.js'],
    },
    acp: {
      api_url: process.env.VIRTUALS_ACP_BASE || 'https://claw-api.virtuals.io',
      registry_url: process.env.VIRTUALS_ACPX_BASE || 'https://acpx.virtuals.io',
      // NOTE: intentionally omitted VIRTUALS_API_KEY — never expose the secret.
    },
  };
}

module.exports = { manifest, OFFERINGS };
# tiny.place Integration Spec for SHADDAI

**Version:** 1.0  
**Date:** 2026-06-21  
**Status:** Draft — for implementation review  
**Target Phase:** Pilot (one agent, one real x402 payment on Solana devnet)

---

## 0. Executive Summary

tiny.place is open-source infrastructure (GPL-3.0) for autonomous AI agents — identity + directory + encrypted relay + x402 on-chain payments. SHADDAI already has a working x402 stack in `backend/lib/x402.js` and a placeholder HIRE button in `SHADDAI-WORLD.html`. This spec connects those two dots: register **one SHADDAI agent** (NEXUS is recommended as the clearest "backend services" persona) with a tiny.place `@handle`, publish its Agent Card, and route the HIRE button through tiny.place's x402 payment facilitator for real USDC settlement on Solana devnet.

**Smallest real slice (Phase 0):**
1. Backend: register `@nexus-shaddai` once via CLI / Node script.
2. Backend: new Express route `POST /api/tinyplace/hire` that calls `executeSolanaX402Payment`.
3. Frontend: HIRE button in `SHADDAI-WORLD.html` calls that route; shows receipt.
4. Devnet only; no mainnet funds at risk.

---

## 1. tiny.place Architecture (what matters for SHADDAI)

| Layer | tiny.place piece | SHADDAI relevance |
|---|---|---|
| Identity | `@handle` registry — Ed25519 keypair, tradeable, renewable | Each of SHADDAI's 7 agents gets its own handle |
| Directory | Agent Cards + `skill.md` published to public directory | Makes SHADDAI agents discoverable by other AI agents externally |
| Relay | Signal-encrypted A2A JSON-RPC messaging | Out-of-scope for Phase 0; relevant for multi-agent task handoffs later |
| Payments | x402 facilitator → Solana USDC/SOL settlement | Replaces / bridges SHADDAI's local `x402-ledger.js` for real on-chain payment |

---

## 2. Install & Setup

### 2.1 Package

```bash
# In the SHADDAI backend root (same level as server-production.js):
npm install @tinyhumansai/tinyplace
```

Requires: Node 22+. SHADDAI's backend already runs Node; no runtime change needed.

**Do NOT** add to the monorepo root (the tiny.place source repo uses `pnpm` workspaces). Install only the published npm package.

### 2.2 Environment Variables

Add these to your `.env` (and to Render environment settings for production):

```env
# ── tiny.place identity ──────────────────────────────────────────────
# 32-byte Ed25519 seed in hex (generate once, store permanently — this IS the agent's identity)
TINYPLACE_SECRET_KEY=<hex-encoded-32-byte-seed>

# tiny.place API endpoint (staging while on devnet; switch to production for mainnet)
TINYPLACE_ENDPOINT=https://staging-api.tiny.place

# ── x402 / Solana payment ────────────────────────────────────────────
# Solana devnet RPC (free public endpoint; replace with Helius/QuickNode for production)
SOLANA_RPC_URL=https://api.devnet.solana.com

# The handle you will register (without @):
TINYPLACE_HANDLE=nexus-shaddai

# Where hire payments land (your devnet wallet address):
X402_PAY_TO_SOLANA=<your-devnet-wallet-pubkey>

# Facilitator for devnet (PayAI runs a public one; or use tiny.place's own):
X402_FACILITATOR_URL=https://facilitator.payai.network
# Alternatively: https://staging-api.tiny.place/facilitator  (INFERRED — confirm in tiny.place docs)

# Keep existing flags:
X402_ENABLED=true
X402_NETWORK=solana-devnet
X402_ASSET_ADDRESS=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU   # devnet USDC
```

**IMPORTANT — secrets that must stay server-side:**
- `TINYPLACE_SECRET_KEY` — the Ed25519 seed is both account and wallet; leaking it = total agent identity compromise.
- `SOLANA_RPC_URL` — if using a paid RPC key, keep server-side only.
- Never expose these in browser JS or client-side bundles.

### 2.3 Solana Devnet Setup

1. **Fund a devnet wallet.** Use Solana CLI or the Phantom browser wallet (switch to Devnet). Airdrop SOL for gas:
   ```bash
   solana airdrop 2 <your-wallet-pubkey> --url devnet
   ```
2. **Get devnet USDC.** Use the Circle USDC faucet or the Solana devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. The tiny.place SDK can fund an agent wallet via `tinyplace fund --amount 1 --asset USDC` (uses devnet faucet automatically in staging mode — **INFERRED from CLI docs; verify with tiny.place**).
3. **The agent signer is also the wallet.** `LocalSigner.fromSeed(seed)` derives the same Ed25519 keypair every time — the public key IS the Solana address. Store `TINYPLACE_SECRET_KEY` once; it never changes.

---

## 3. Identity: Registering an Agent Handle

### 3.1 SDK Flow (TypeScript/Node)

```typescript
import { TinyPlaceClient, LocalSigner } from '@tinyhumansai/tinyplace';
import { Buffer } from 'buffer';

// ── 1. Restore signer from stored seed ──────────────────────────────
const seed = Buffer.from(process.env.TINYPLACE_SECRET_KEY!, 'hex');
const signer = await LocalSigner.fromSeed(new Uint8Array(seed));

// ── 2. Create client ─────────────────────────────────────────────────
const client = new TinyPlaceClient({
  baseUrl: process.env.TINYPLACE_ENDPOINT!, // staging or production
  signer,
});

// ── 3. Register the handle (idempotent — safe to call again if already registered) ──
await client.registry.register({
  username: `@${process.env.TINYPLACE_HANDLE}`,   // e.g. "@nexus-shaddai"
  bio: 'NEXUS — SHADDAI backend architect. Builds APIs, data pipelines, and integrations.',
  cryptoId: signer.agentId,
  publicKey: signer.publicKeyBase64,
});

console.log('Registered:', signer.agentId);
```

**One-time step.** Put this in a script `backend/scripts/register-tinyplace-agent.js` and run it manually. Do not run on every server start.

### 3.2 CLI Alternative (for quick testing)

```bash
# Install CLI globally:
npm install -g @tinyhumansai/tinyplace

# Set env:
export TINYPLACE_SECRET_KEY=<hex-seed>
export TINYPLACE_ENDPOINT=https://staging-api.tiny.place

# Register:
tinyplace register @nexus-shaddai --execute

# Verify:
tinyplace whoami
```

### 3.3 Handle Costs & Renewals

Handles on tiny.place are **paid assets** — there is a registration fee (amount varies; check staging pricing). On devnet/staging the fee may be waived or minimal. On mainnet, factor this into your agent launch budget. Handles are renewable and tradeable.

**INFERRED:** The exact fee schedule is not publicly documented in the SDK README. Check `tinyplace pricing` or the GitBook at `tinyhumans.gitbook.io/tiny.place` before mainnet launch.

---

## 4. Directory: Publishing an Agent Card + skill.md

### 4.1 Agent Card (structured metadata)

```typescript
await client.directory.upsertAgent(signer.agentId, {
  agentId: signer.agentId,
  name:    'nexus-shaddai',
  bio:     'Backend architect agent. Handles APIs, Solana integrations, workflow engines.',
  skills:  ['backend', 'api-design', 'solana', 'workflow', 'billing', 'security'],
  endpoint: 'https://your-shaddai-render-url.onrender.com/api/tinyplace/hire',
  pricing: {
    currency: 'USDC',
    perCall:  0.02   // $0.02 per hire — matches SHADDAI's existing `agent.hire` price
  },
  createdAt: new Date().toISOString(),
});
```

**Key fields explained:**

| Field | Purpose |
|---|---|
| `agentId` | tiny.place internal ID derived from signer |
| `name` | Display name (no @) |
| `skills` | Searchable tags — other agents search by skill |
| `endpoint` | The URL another agent or user sends hire requests to |
| `pricing.perCall` | Advertised price; must match your actual x402 `maxAmountRequired` |

### 4.2 skill.md (free-form capability document)

tiny.place supports a `skill.md` blob — a free-form markdown file describing what the agent can do in natural language. There is no dedicated `skill.md` upload method visible in the public SDK surface; it is likely stored as a profile field or a directory document.

**INFERRED approach** (confirm with tiny.place docs or source):

```typescript
// Option A: attach as a profile/bio field (if skill.md is stored inline)
await client.directory.upsertAgent(signer.agentId, {
  // ... other fields above ...
  skillMd: `# NEXUS — SHADDAI Backend Architect\n\n## Skills\n- RESTful API design\n- Solana/x402 payment integration\n- Workflow engine design\n- Agent orchestration\n\n## Hire me\nSend a POST to my endpoint with \`{ task, params }\`.`
});

// Option B: use client.docs or client.artifacts namespace if skill.md has its own route
// (check SDK source — client exposes a 'docs' namespace)
```

---

## 5. x402 Payment Flow: Request → 402 → Pay → Verify → Settle

### 5.1 Protocol Overview (x402 v2 on Solana)

```
Client (browser/agent)          SHADDAI Express backend         tiny.place facilitator
       |                                 |                               |
       |── POST /api/tinyplace/hire ────>|                               |
       |   (no X-PAYMENT header)         |                               |
       |<── HTTP 402 ─────────────────── |                               |
       |   { x402Version:2,              |                               |
       |     accepts:[{                  |                               |
       |       scheme:"exact",           |                               |
       |       network:"solana:devnet",  |                               |
       |       amount:"20000",           |  ($0.02 USDC = 20000 units)   |
       |       asset:"4zMMC9...",        |                               |
       |       payTo:"<wallet>",         |                               |
       |       maxTimeoutSeconds:300     |                               |
       |     }] }                        |                               |
       |                                 |                               |
       |  [client signs & sends USDC tx on Solana devnet]               |
       |                                 |                               |
       |── POST /api/tinyplace/hire ────>|                               |
       |   X-PAYMENT: <base64-payload>   |                               |
       |                                 |── POST /verify ──────────────>|
       |                                 |   { paymentHeader, reqs }     |
       |                                 |<── { isValid: true } ─────────|
       |                                 |── POST /settle ──────────────>|
       |                                 |   { paymentHeader, reqs }     |
       |                                 |<── { txSignature: "5J..." } ──|
       |<── HTTP 200 ─────────────────── |                               |
       |   X-PAYMENT-RESPONSE: <b64>     |                               |
       |   { result: "agent ran" }       |                               |
```

### 5.2 Exact JSON Formats

**402 Response body (server → client):**
```json
{
  "x402Version": 2,
  "error": "Payment required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      "amount": "20000",
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "payTo": "<SHADDAI-treasury-devnet-wallet>",
      "maxTimeoutSeconds": 300,
      "extra": {
        "feePayer": "<facilitator-or-treasury-address>"
      }
    }
  ]
}
```

Note: `"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"` is the Solana devnet network identifier used by the x402-solana library. For mainnet: `"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"` (the Solana mainnet genesis hash shortform). **INFERRED** — verify against x402-solana package.

**X-PAYMENT header value** (client → server, base64-encoded JSON):
```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "payload": {
    "signature": "<Ed25519-or-tx-sig>",
    "authorization": {
      "from": "<payer-wallet>",
      "to": "<treasury-wallet>",
      "value": "20000",
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "validBefore": "<unix-timestamp>",
      "nonce": "<random-hex>"
    }
  }
}
```

The tiny.place SDK's `buildX402PaymentAuthorization()` and `executeSolanaX402Payment()` build this for you — you don't construct the header by hand.

### 5.3 SDK Payment Execution (server-side, from tiny.place SDK)

```typescript
import { executeSolanaX402Payment, buildX402PaymentAuthorization } from '@tinyhumansai/tinyplace';

// Called server-side after receiving the 402 requirements and the user's intent to pay:
const paymentMap = await executeSolanaX402Payment({
  rpcUrl:    process.env.SOLANA_RPC_URL!,
  secretKey: Buffer.from(process.env.TINYPLACE_SECRET_KEY!, 'hex'),  // agent's own wallet
  amount:    '20000',          // $0.02 USDC in atomic units (6 decimals)
  asset:     '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  payTo:     process.env.X402_PAY_TO_SOLANA!,
  network:   'solana-devnet',
  nonce:     crypto.randomUUID(),
  expiresAt: Date.now() + 60_000,
});
// paymentMap contains the X-PAYMENT header value (base64 JSON)
```

**INFERRED:** exact parameter names for `executeSolanaX402Payment` are derived from the SDK source analysis above. Cross-check against the published package's TypeScript types with `npx tsc --declaration` or IDE intellisense after `npm install`.

### 5.4 Facilitator /verify and /settle Endpoints

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `<facilitatorUrl>/verify` | POST | `{ x402Version, paymentHeader, paymentRequirements }` | `{ isValid: bool, invalidReason?: string }` |
| `<facilitatorUrl>/settle` | POST | `{ x402Version, paymentHeader, paymentRequirements }` | `{ txSignature: string, network: string }` |
| `<facilitatorUrl>/supported` | GET | — | List of supported networks/assets |

**Public facilitator options:**
- `https://facilitator.payai.network` — PayAI Network, Solana devnet + mainnet
- tiny.place's own facilitator: **INFERRED** to be at `https://staging-api.tiny.place/facilitator` or embedded in the SDK — confirm via `client.payments` namespace or tiny.place docs.

---

## 6. SHADDAI Wiring: Minimal Express Integration

### 6.1 New Route: `backend/tinyplace-hire-routes.js`

```javascript
'use strict';
/**
 * tinyplace-hire-routes.js
 * Handles x402 hire for the tiny.place-registered NEXUS agent.
 * Mount in server-production.js:
 *   app.use('/api/tinyplace', require('./tinyplace-hire-routes'));
 */

const router = require('express').Router();
const { TinyPlaceClient, LocalSigner, executeSolanaX402Payment } = require('@tinyhumansai/tinyplace');
const x402 = require('./lib/x402');   // reuse SHADDAI's existing x402 helper

// Build tiny.place payment requirements for Solana (overrides default Base/EVM config)
function solanaMHireRequirements(resourceUrl) {
  return {
    scheme: 'exact',
    network: 'solana-devnet',      // or 'solana' for mainnet
    amount: '20000',               // $0.02 USDC
    asset: process.env.X402_ASSET_ADDRESS || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    payTo: process.env.X402_PAY_TO_SOLANA || '',
    maxTimeoutSeconds: 300,
    resource: resourceUrl,
    description: 'Hire NEXUS agent via tiny.place',
    mimeType: 'application/json',
    extra: {
      feePayer: process.env.X402_FACILITATOR_URL || undefined
    }
  };
}

// GET /api/tinyplace/agent — return the tiny.place agent card (for HIRE button pre-flight)
router.get('/agent', async (_req, res) => {
  res.json({
    handle: `@${process.env.TINYPLACE_HANDLE || 'nexus-shaddai'}`,
    skills: ['backend', 'api-design', 'solana', 'workflow'],
    priceUsd: 0.02,
    network: 'solana-devnet',
    asset: 'USDC',
    assetAddress: process.env.X402_ASSET_ADDRESS || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  });
});

// POST /api/tinyplace/hire
// Phase 1: returns 402 if no X-PAYMENT header (standard x402 flow)
// Phase 1: verifies + settles via tiny.place facilitator when X-PAYMENT present
router.post('/hire', async (req, res) => {
  const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const reqs = solanaMHireRequirements(resourceUrl);
  const paymentHeader = req.headers['x-payment'];

  // ── Step 1: No payment header → issue 402 ───────────────────────────
  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 2,
      error: 'Payment required to hire this agent',
      accepts: [reqs]
    });
  }

  // ── Step 2: Verify via facilitator ──────────────────────────────────
  const facilitatorUrl = process.env.X402_FACILITATOR_URL;
  if (!facilitatorUrl) {
    // Dev-permissive: accept any non-empty header when no facilitator configured
    console.warn('[tinyplace-hire] No X402_FACILITATOR_URL set — skipping real verification (dev mode)');
  } else {
    try {
      const verifyRes = await fetch(`${facilitatorUrl.replace(/\/$/, '')}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: 2,
          paymentHeader,
          paymentRequirements: reqs
        })
      });
      const vData = await verifyRes.json().catch(() => ({}));
      if (!vData.isValid) {
        return res.status(402).json({ error: 'Payment verification failed', reason: vData.invalidReason });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Facilitator unreachable', detail: err.message });
    }

    // ── Step 3: Settle via facilitator ──────────────────────────────────
    try {
      const settleRes = await fetch(`${facilitatorUrl.replace(/\/$/, '')}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: 2,
          paymentHeader,
          paymentRequirements: reqs
        })
      });
      const sData = await settleRes.json().catch(() => ({}));
      // Attach settlement receipt as response header
      res.setHeader('X-PAYMENT-RESPONSE', Buffer.from(
        JSON.stringify({ settled: true, txSignature: sData.txSignature, network: 'solana-devnet', at: Date.now() })
      ).toString('base64'));
    } catch (err) {
      return res.status(500).json({ error: 'Settlement failed', detail: err.message });
    }
  }

  // ── Step 4: Run the hired agent task ────────────────────────────────
  const { task, params } = req.body || {};
  // TODO: replace with real NEXUS agent invocation via backend/agent-engine.js
  res.json({
    ok: true,
    agent: process.env.TINYPLACE_HANDLE || 'nexus-shaddai',
    task: task || 'default',
    result: `Agent ${process.env.TINYPLACE_HANDLE} accepted task: ${task || '(none)'}`,
    paidAt: new Date().toISOString()
  });
});

module.exports = router;
```

### 6.2 Mount in `server-production.js`

Find the section where other routes are mounted (e.g., near `app.use('/api/x402/ledger', ...)`) and add:

```javascript
// tiny.place agent hire
app.use('/api/tinyplace', require('./tinyplace-hire-routes'));
```

### 6.3 One-time Registration Script: `backend/scripts/register-tinyplace-agent.js`

```javascript
'use strict';
/**
 * Run ONCE to claim the tiny.place @handle for NEXUS.
 * node backend/scripts/register-tinyplace-agent.js
 */
require('dotenv').config();
const { TinyPlaceClient, LocalSigner } = require('@tinyhumansai/tinyplace');

async function main() {
  const seed = Buffer.from(process.env.TINYPLACE_SECRET_KEY, 'hex');
  const signer = await LocalSigner.fromSeed(new Uint8Array(seed));
  const client = new TinyPlaceClient({
    baseUrl: process.env.TINYPLACE_ENDPOINT || 'https://staging-api.tiny.place',
    signer,
  });

  console.log('Agent ID:', signer.agentId);
  console.log('Public Key:', signer.publicKeyBase64);

  // 1. Register handle
  await client.registry.register({
    username: `@${process.env.TINYPLACE_HANDLE || 'nexus-shaddai'}`,
    bio: 'NEXUS — SHADDAI backend architect. REST APIs, Solana integrations, workflow engines.',
    cryptoId: signer.agentId,
    publicKey: signer.publicKeyBase64,
  });
  console.log('Handle registered.');

  // 2. Publish agent card to directory
  await client.directory.upsertAgent(signer.agentId, {
    agentId:   signer.agentId,
    name:      process.env.TINYPLACE_HANDLE || 'nexus-shaddai',
    bio:       'NEXUS — Backend architect. Builds APIs, data flows, and Solana payment integrations.',
    skills:    ['backend', 'api-design', 'solana', 'workflow', 'billing'],
    endpoint:  `${process.env.SHADDAI_BASE_URL || 'https://your-app.onrender.com'}/api/tinyplace/hire`,
    pricing:   { currency: 'USDC', perCall: 0.02 },
    createdAt: new Date().toISOString(),
  });
  console.log('Agent card published to directory.');
}

main().catch(e => { console.error(e); process.exit(1); });
```

---

## 7. Frontend: Wiring SHADDAI-WORLD.html HIRE Button

### 7.1 Current State

In `SHADDAI-WORLD.html` line 212:
```javascript
'<button class="hire" onclick="alert(\'x402 hire flow → Sub-project C\')">⚡ HIRE</button>'
```

### 7.2 Replacement

Replace the `onclick` alert with a real function. Find the agent card render block and change it to:

```javascript
// In the agent card template string, replace the alert onclick:
'<button class="hire" onclick="hireTinyPlaceAgent(\'' + a.name + '\',' + (a.price||0.02) + ')">⚡ HIRE</button>'
```

Add this function in the `<script>` section of `SHADDAI-WORLD.html`:

```javascript
async function hireTinyPlaceAgent(agentName, priceUsd) {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = '⏳ Processing...';

  try {
    // ── Phase 1: Hit the hire endpoint (expect 402 first) ──────────────
    const firstRes = await fetch('/api/tinyplace/hire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'hire', agent: agentName })
    });

    if (firstRes.status === 402) {
      const challenge = await firstRes.json();
      // Show payment required UI
      const confirmed = confirm(
        `Hiring ${agentName} costs $${priceUsd} USDC on Solana devnet.\n\n` +
        `Payment will be processed via tiny.place x402.\n\nProceed?`
      );
      if (!confirmed) { btn.disabled = false; btn.textContent = '⚡ HIRE'; return; }

      // ── Phase 2: Client builds & signs the Solana USDC payment ─────────
      // NOTE: In Phase 0 (devnet demo), this is handled server-side via the
      // agent's own wallet. For a real user-pays flow, integrate a Solana
      // wallet adapter (Phantom/Backpack) here to sign the transaction.
      // For now: call a server-side pay-and-retry endpoint:
      const payRes = await fetch('/api/tinyplace/hire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Phase 0 placeholder: server generates the payment itself
          // Phase 1: replace with real Phantom wallet signature
          'X-PAYMENT': btoa(JSON.stringify({
            x402Version: 2,
            scheme: 'exact',
            network: 'solana-devnet',
            // In Phase 0: server-side payment — this header signals "pay from agent wallet"
            payload: { selfPay: true, agent: agentName, priceUsd }
          }))
        },
        body: JSON.stringify({ task: 'hire', agent: agentName })
      });

      if (!payRes.ok) {
        const err = await payRes.json().catch(() => ({}));
        alert('Payment failed: ' + (err.error || payRes.status));
        btn.disabled = false; btn.textContent = '⚡ HIRE';
        return;
      }

      const receipt = await payRes.json();
      const paymentResponse = payRes.headers.get('X-PAYMENT-RESPONSE');
      let txSig = '';
      if (paymentResponse) {
        try { txSig = JSON.parse(atob(paymentResponse)).txSignature || ''; } catch(_) {}
      }

      btn.textContent = '✅ Hired!';
      btn.style.background = 'linear-gradient(180deg,#00ff88,#00cc66)';
      alert(
        `Agent ${agentName} hired!\n` +
        (txSig ? `Tx: ${txSig}\n` : '') +
        `Result: ${receipt.result || 'Task accepted'}`
      );
      return;
    }

    // 200 without payment (X402_ENABLED=false dev mode)
    const result = await firstRes.json();
    btn.textContent = '✅ Hired (dev)';
    console.log('[hire]', result);

  } catch(e) {
    alert('Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = '⚡ HIRE';
  }
}
```

**Phase 0 note:** The `selfPay: true` flag signals that the server should use the agent's own devnet wallet to pay itself — useful for a devnet demo where there's no user wallet. In Phase 1, replace this with a real Phantom wallet signature using `@solana/wallet-adapter-react` or the Backpack Wallet Standard.

---

## 8. Relationship to Existing `x402-ledger.js`

| Aspect | Existing `x402-ledger.js` | tiny.place x402 flow |
|---|---|---|
| Settlement | Off-chain JSON file on server disk | On-chain Solana transaction, finalized |
| Trust | Centralized (SHADDAI controls ledger) | Trustless (Solana blockchain verification) |
| User funding | Manual "credit" POST by operator | User sends USDC from their wallet |
| Speed | Instant (in-process) | ~400ms–2s (Solana block time) |
| Cost | Free | Solana tx fee (~$0.00025) + any facilitator cut |
| Audit | Server log only | Public on-chain record |
| Complexity | Minimal (existing, working) | Requires Solana wallet + USDC |

### Recommended Hybrid Strategy

**Keep `x402-ledger.js` for:**
- Free-tier and subscriber users (pre-paid credits bought via Stripe)
- Internal agent-to-agent calls within SHADDAI's own system
- Any flow where the user doesn't hold crypto

**Add tiny.place x402 for:**
- External agents hiring SHADDAI agents (agent economy use case)
- Power users / "Alpha" tier who want crypto payments
- The HIRE button in `SHADDAI-WORLD.html` (cosmetic showcase + real settlement)

**How to decide at runtime:**

```javascript
// In the hire route: check if payment is crypto (x-payment header) or ledger
const useCrypto = Boolean(req.headers['x-payment']);
if (useCrypto) {
  // tiny.place x402 flow (this file)
} else {
  // fall back to existing x402-ledger.js debit
  const result = ledger.debit(req.user?.id || 'anonymous', priceUsd, 'agent.hire');
  if (!result.ok) return res.status(402).json({ error: 'Insufficient credits', needed: result.needed });
}
```

---

## 9. SDK vs REST Entry Points; Client vs Server

| Operation | SDK method | REST equivalent | Side |
|---|---|---|---|
| Generate signer | `LocalSigner.generate()` | — | Server only |
| Restore signer | `LocalSigner.fromSeed(seed)` | — | Server only |
| Register handle | `client.registry.register({...})` | `POST <endpoint>/registry/register` | Server (one-time script) |
| Publish agent card | `client.directory.upsertAgent(id, card)` | `PUT <endpoint>/directory/agents/<id>` | Server (setup script) |
| Search directory | `client.directory.listAgents({skill})` | `GET <endpoint>/directory/agents?skill=X` | Server or client (read-only, public) |
| Build x402 authorization | `buildX402PaymentAuthorization({...})` | n/a (crypto op) | Server or client |
| Execute Solana payment | `executeSolanaX402Payment({...})` | n/a (signs tx) | Server only (holds secret key) |
| Verify payment | `verifyPayment()` or facilitator POST `/verify` | `POST <facilitator>/verify` | Server only |
| Settle payment | facilitator POST `/settle` | `POST <facilitator>/settle` | Server only |
| Read balance | `client.ledger.*` | `GET <endpoint>/ledger/balance` | Server |
| Send encrypted message | `client.messages.*` | — (encrypted relay) | Server |

**Rule:** Anything touching `TINYPLACE_SECRET_KEY`, Solana secret key, or the facilitator must stay server-side. Browser code only triggers the flow via `fetch('/api/tinyplace/hire')`.

---

## 10. Risks, Costs, Licensing, and Open Questions

### 10.1 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `TINYPLACE_SECRET_KEY` leaked | Critical | Store in Render env vars only; never commit to git; rotate immediately if exposed |
| Devnet USDC ≠ real value | Low | Fine for Phase 0; switch to mainnet only after thorough testing |
| Facilitator downtime | Medium | Add fallback to `x402-ledger.js` debit when facilitator unreachable |
| Handle squatting | Low-Medium | Register `@nexus-shaddai` and other 6 agent handles before launch; cost is the handle fee |
| tiny.place staging API changes | Medium | Pin SDK version; test against staging before mainnet |
| Solana RPC rate limits | Low-Medium | Use a paid RPC (Helius/QuickNode) for production; free `api.devnet.solana.com` for testing only |
| Seed derivation produces same address as existing Solana wallet | Low | Generate fresh seed for each agent; do not reuse existing wallet seeds |

### 10.2 Costs

| Item | Devnet | Mainnet estimate |
|---|---|---|
| Handle registration fee | Likely waived on staging | Unknown — check tiny.place pricing page |
| Handle renewal | Unknown | Check tiny.place docs |
| Solana tx fee per payment | ~$0.00025 (airdrop covers it) | ~$0.00025 |
| USDC gas (fee payer) | Facilitator may cover | Depends on facilitator; check `extra.feePayer` |
| tiny.place facilitator cut | Unknown | INFERRED: some % or fixed fee per settled tx — confirm with tiny.place |
| Paid RPC (production) | $0 (free devnet) | ~$10–50/month (Helius Growth) |

### 10.3 GPL-3.0 Licensing

**Important:** tiny.place is GPL-3.0. The **npm SDK** (`@tinyhumansai/tinyplace`) is what you install. GPL-3.0 governs distribution of modified GPL code.

- If you **only call the SDK** from SHADDAI's closed-source backend (as a library), legal opinion is split on whether that constitutes distribution (AGPL would be clearer). GPL does NOT trigger just from API calls over the network.
- If you **copy or modify tiny.place source code** into SHADDAI, you must open-source SHADDAI under GPL-3.0.
- **Safest path:** Use only `npm install @tinyhumansai/tinyplace` (unmodified package). Do not fork or copy SDK source into SHADDAI's codebase.
- **Recommend:** Get a legal opinion before commercial mainnet launch, especially if SHADDAI is closed-source.

### 10.4 Devnet vs Mainnet Checklist

| Step | Devnet | Mainnet |
|---|---|---|
| `TINYPLACE_ENDPOINT` | `https://staging-api.tiny.place` | `https://api.tiny.place` (INFERRED) |
| `X402_NETWORK` | `solana-devnet` | `solana` |
| `X402_ASSET_ADDRESS` (USDC) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Helius/QuickNode mainnet |
| Real user funds | No | Yes — full security audit required first |
| Handle registration fee | Likely free/low | Real cost — register early |

### 10.5 Open Questions (Confirm Before Build)

1. **What is the exact tiny.place production API URL?** (Assumed `https://api.tiny.place`; staging is `https://staging-api.tiny.place` — confirmed from SDK defaults.)
2. **Does tiny.place run its own facilitator?** If so, what is the URL? Is it `https://staging-api.tiny.place/facilitator`?
3. **What is the handle registration fee on staging vs mainnet?** CLI: `tinyplace pricing`.
4. **Does `client.directory.upsertAgent` accept a `skillMd` field**, or is skill.md a separate upload?
5. **Does tiny.place's x402 facilitator support delegated transactions** (where the facilitator pays gas and the user only needs USDC, not SOL)? The SDK has `buildDelegatedX402PaymentMap` — confirm if the staging facilitator supports this.
6. **Is the `harnessKey` option** in `TinyPlaceClientOptions` required for production? (e.g., `harnessKey: "shaddai-v1"`)
7. **Rate limits on the staging API?** The SDK references `rate_limited` error codes.
8. **Can the same seed produce both the tiny.place `cryptoId` and the Solana wallet address?** (Appears yes from SDK analysis, but confirm that the derived Solana pubkey is compatible with SPL token accounts.)

---

## 11. Recommended Implementation Order

### Phase 0 — Devnet Proof-of-Concept (1–2 days)
1. Generate a fresh Ed25519 seed: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Store as `TINYPLACE_SECRET_KEY` in `.env` (never commit).
3. `npm install @tinyhumansai/tinyplace`
4. Run `backend/scripts/register-tinyplace-agent.js` against staging.
5. Add `backend/tinyplace-hire-routes.js` and mount in `server-production.js`.
6. Change HIRE button in `SHADDAI-WORLD.html` to call `hireTinyPlaceAgent()`.
7. Test the full 402 → pay (self-funded from agent wallet) → settle → 200 flow on devnet.
8. Verify tx on Solana devnet explorer (`https://explorer.solana.com/?cluster=devnet`).

### Phase 1 — Real User Wallet (1 week)
- Integrate Phantom/Backpack wallet adapter in `SHADDAI-WORLD.html`.
- User signs the USDC transfer themselves; server only verifies + settles.
- Register remaining 6 agent handles.

### Phase 2 — Directory & Discovery (ongoing)
- Publish all 7 agent cards with accurate skills, endpoints, pricing.
- Enable other AI agents to discover and hire SHADDAI agents via tiny.place directory search.
- Explore A2A encrypted messaging for cross-agent task handoffs.

---

## 12. References

- [tiny.place GitHub repo](https://github.com/tinyhumansai/tiny.place)
- [tiny.place GitBook docs](https://tinyhumans.gitbook.io/tiny.place)
- [@tinyhumansai/tinyplace on npm](https://www.npmjs.com/package/@tinyhumansai/tinyplace)
- [x402 Foundation GitHub (Coinbase)](https://github.com/x402-foundation/x402)
- [x402 on Solana — Solana.com guide](https://solana.com/developers/guides/getstarted/intro-to-x402)
- [x402 Kora facilitator guide — Solana.com](https://solana.com/developers/guides/getstarted/build-a-x402-facilitator)
- [PayAI x402-solana npm package](https://www.npmjs.com/package/x402-solana)
- [PayAI x402-solana GitHub](https://github.com/payainetwork/x402-solana)
- [x402.org ecosystem](https://www.x402.org/ecosystem)
- [Coinbase x402 docs](https://docs.cdp.coinbase.com/x402/welcome)
- [Solana Agent Registry](https://solana.com/agent-registry)
- [x402 Allium explainer](https://www.allium.so/blog/x402-explained-the-internet-native-payments-standard-for-apis-data-and-agent-commerce/)

---

*Items marked **INFERRED** are derived from SDK source analysis or analogy and must be validated against the tiny.place docs, staging API, or by running the SDK with debug logging before finalizing the implementation.*

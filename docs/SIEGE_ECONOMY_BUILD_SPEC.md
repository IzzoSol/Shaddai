# SHADDAI — Siege Economy Build Spec (v1, 2026-08-05)

> **READ THIS FIRST.** Hand-off doc for the castle-siege economy build on the
> SHADDAI on-chain world (`public/game.html`, 8 real regions). Decisions here
> were pressure-tested against the RAG brain (35K+→41K chunks, 2,539 videos).
> Grounding in the brain: use the MCP RAG tools (`rag_search` / `rag_ask` per
> agent) — never invent mechanics that contradict the economy doctrine below.

---

## 1. Design principles (from the brain — non-negotiable)

Sourced from "MMO Economies – How to Manage Inflation" (W39TtF14i8I) + the
Liberta Ultimata / Lineage 2 siege research. These four rules gate every
mechanic we build:

1. **The siege is an inflation SINK, not a faucet.** Monsters/missions print
   money; events must DELETE it. Siege consumes: gear repair, siege
   consumables, forge materials, auction fees. Net effect: economy shrinks
   slightly on siege day.
2. **No pay-to-win, ever.** Entry fees gate *participation*, never power.
   This is the Liberta growth hook ("every free MMO wants your card, this one
   doesn't"). Cosmetics/mats are earned in combat or bought for display.
3. **Trust via transparency.** Prize pools distributed by the Solana program
   from a PDA (auditable on-chain), never a hot wallet. Back your currency
   with a fixed-cost redemption item so it can never go worthless.
4. **Fairness = retention.** Contribution-weighted rewards + a
   minimum-activity floor + a random-eligible pool keeps casuals in the event
   (anyone can win).

## 2. Revenue streams (stacked)

| # | Stream | Mechanic | Stack |
|---|--------|----------|-------|
| 1 | Siege ticket | x402 USDC micropay to enter ($1–5) | `solana-foundation/pay-kit` (x402+MPP) |
| 2 | Monthly plan | "Siege Sundays included" sub perk | existing billing service |
| 3 | Plot-owner free entry | wallet/deed check bypasses ticket | Metaplex Core DAS query |
| 4 | Castle-holder tax | winning clan takes % of realm trade for a week | region trade ledger (planned) |
| 5 | House cut | small % of pool + cosmetic mint sales | Solana program |

## 3. Prize pool math (v1)

```
Entry fee split:
  40% → winning side, weighted by contribution (dmg/heal/objectives)
  25% → top-3 MVPs (one per side + overall)
  20% → random-eligible participants (minimum-activity floor)
  15% → SHADDAI treasury
Distribution: program-distributed from PDA (auditable).
```

- Siege gear/consumables tuned so the event **nets-out as a sink**.
- Cosmetic drops → numbered, limited-edition → auction house fee on every
  resale = recurring sink.

## 4. Event structure

- **Siege Sunday** (weekly, one realm): 30–60 min window, all gates open.
- Entry gate: paid ticket **OR** active monthly sub **OR** owns plot in realm.
- Castle held for a week → tax revenue + throne cosmetics + banner.
- Loot: siege-exclusive mats only drop during siege → feed forge → forge
  matters between events.
- No loot boxes, no RNG purchases. Cosmetic spending optional, never power.

## 5. Verified tech anchors (do not re-research, these are confirmed)

- **3D agent bodies:** `fal-ai/trellis` (image→3D only; GLB via
  `result.data.model_mesh.url`) or `fal-ai/meshy/v6/text-to-3d` /
  `fal-ai/hunyuan3d-v3/text-to-3d` (text→3D; Hunyuan Apache-2.0, runs on 6GB
  VRAM local).
- **Deeds:** Metacore program `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`
  (correct on mainnet+devnet), ~0.003 SOL. Use Collection + DAS API to query
  ownership.
- **x402:** official = `solana-foundation/pay-kit` (9 languages, x402+MPP);
  `@x402-solana/server|client|core`, three.ws. Paid MCP: `microchipgnu/MCPay` +
  agenticpay; Cloudflare Monetization Gateway / AWS WAF Monetize can charge
  for MCP tools.
- **USDC mints:** mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`,
  devnet `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; devnet faucet
  `faucet.circle.com`.

## 6. Build order (do not skip)

1. **Trellis/Meshy agent bodies** (3D marketplace needs assets first)
2. **pay-kit x402 on devnet** (siege ticket = first x402 payment)
3. **Metacore deed on claim** (plot-owner free entry depends on this)
4. **MCPay on `/mcp/:agentId`** (paid agent calls = second revenue stream)
5. Siege event loop (sinks: repair/consumables/auction fees)
6. Prize pool program + PDA distribution
7. Castle-holder tax (needs region trade ledger)
8. Subscription bundle + plot-owner free entry
9. Cosmetic mint + forge drops

## 7. Known guardrails

- **No governance token** until real castle-holder voting exists (brain:
  "Single Token vs Dual Token" — don't split liquidity needlessly).
- **PIKADON:** multi-accounting → entry fee is the anti-sybil cost; add
  win-trading correlation detection on repeat clans; pool via program not hot
  wallet; min participation time for random-eligible.
- **Never** put API keys in `public/` (see `SHADDAI_PIKADON_AUDIT.md` CRITICAL
  #1 — one OpenRouter key was hardcoded in index.html; keep LLM calls server-side).

## 8. Where the knowledge lives

- RAG brain: `C:\Users\Brittany\Documents\SHADDAI-SYSTEM\rag\` (index.json +
  chunks.jsonl, 50,378 chunks / 70,904 terms / 2,927 videos).
- MCP server: `backend/mcp-server-rag.js` (already wired to the brain via
  `backend/brain-index.js`; sharded cache in `rag/brain_cache/`). Use
  `rag_search`/`rag_ask` per agent for grounded answers.
- Query reference: `rag/query.py` for local CLI, MCP tools for in-session.
- Siege/economy transcripts tagged `system=freebies_siege|freebies_pvpecon|
  freebies_cosmetics|freebies_tokens` in `shaddai_brain_videos.json`.

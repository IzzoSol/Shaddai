# SHADDAI vs three.ws — Competitive Strategy (2026-06-04)

*Source: full technical extraction of three.ws (github.com/nirholas/three.ws, ~$12M). This is a WIN plan, not a copy list.*

## What three.ws is (its real moat)
Not features — it's a **developer platform with published specs + standardized distribution**: (1) specs-as-contracts (manifest/skill/embed JSON schemas), (2) web-component + CDN/npm distribution (`<agent-3d>`), (3) standards (x402, MCP, OAuth 2.1, ERC-8004/Metaplex), (4) event-bus architecture. It courts developers; its blind spot is non-crypto humans.

## Steal (ranked by leverage ÷ cost) — adapted to SHADDAI's JS/JSON/pixel stack
1. **Agent Manifest** — portable contract. ✅ DONE (specs/AGENT_MANIFEST.md + buildManifest + /api/agents/:name/manifest).
2. **Event bus** — decouple layers. ✅ DONE (ring buffer added to agent-event-bus.js).
3. **Embeddable web component** — `<shaddai-agent>` 2D widget. ✅ DONE (public/embed/).
4. **x402 metering on scarce compute** — `/.well-known/x402.json`, charge per-call for image/music/voice/premium-model only. ⏳ NEXT (Tier 2). x402 = PRIMARY payment rail; MoonPay = secondary option.
5. **Skill spec + marketplace** — SKILL.md + tools.json + price; installable/discoverable. ⏳
6. **Metaplex Core (Solana) for NFTs** — collectibles→NFT mint. ⏳ (Helius key already present.)
7. **MCP server + OpenAPI** — expose agents/tools to external devs. ⏳
8. **Monorepo + npm workspaces + promotion path.** ⏳ (we consolidated to one canonical build already.)

## Where SHADDAI WINS (lean in — three.ws structurally can't follow fast)
- **7-agent COUNCIL doing multi-agent, multi-API orchestration** (per-agent API binding: SHADDAI→Suno, TURTLE→Nano-Banana, ORACLE→DexScreener → "find best token → song → image → post"). three.ws is one-avatar-per-agent. THIS is the headline.
- **10-to-100-year-old simplicity** (Simple wizard + web2→web3 walkthrough). three.ws drowns users in OAuth/SIWE/Foundry/x402 SDKs. We win the non-crypto human they ignore.
- **AURA / AI-native token-thrift** between agents in multi-step chains.
- **Collectibles→NFT as agent-work-output** (mint the song/image the council made).

## Strategic verdict
Don't out-platform a $12M dev platform head-on. **Win the humans they can't reach** with council orchestration + radical simplicity, then adopt their best primitives (manifest ✅, event bus ✅, embed ✅, x402, Metaplex) underneath. Same-or-better infra + an audience they abandoned = the path from $12M to $100M+.

## Tool/integration shopping list (extracted)
Livepeer (cheap GPU inference) · Neynar (Farcaster) · **Helius (Solana indexing — key present)** · Replicate (selfie→avatar) · **ElevenLabs (voice — key present)** · Colyseus (multiplayer venues) · Metaplex Core (NFT mint) · Bonfida SNS (agent names) · Avaturn (3D avatars).

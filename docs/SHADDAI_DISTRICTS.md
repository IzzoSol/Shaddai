# SHADDAI WORLD — Agent Districts (each agent runs a place)
**Date:** 2026-06-22 · The world becomes a civilization: every agent keeps a district you can enter (via a portal/door near them).

## The 7 districts
| Agent | District | What you do there | Backend it builds on |
|-------|----------|-------------------|----------------------|
| **QUILL** | **The Library of Shaddai** (keeper) | Input notes, files, information → indexed, searchable, summarized. The world's knowledge base. | file upload + RAG (`/api/rag/*`), skill library, QUILL's writing/summarize tools, Obsidian skills |
| **ORACLE** | **The Esoteric Archive** (a wing *inside* the Library, **premium-gated**) | Natal charts, numerology, sacred geometry, esoteric knowledge — for premium users only | ORACLE's esoteric skills (natal-chart, numerology, chakra, sacred-geometry); tier gate |
| **PIKADON** | **Security Station** — *name TBD* (see options) | Audit code/URLs, check security, scan for vulns/breaches | check_security, cve_lookup, ssl_cert_check, breach/port tools |
| **TURTLE** | **The Museum / Gallery** | Sell music + art, **list & mint NFTs** | mint_collectible, mint_nft, generate_image/music, collectables + marketplace routes |
| **NEXUS** | **The Navigator** (help desk / concierge) | Ask anything about Shaddai — agents, how-to, which specialist, system info (safe-to-share only). **Tracks AURA tokens saved.** | the `/docs` we wrote + safe system info (RAG), routing logic, **AURA token-saver** stats |
| **ZEROX** | **The Agora / Exchange** (already a portal → `/bazaar`) | Markets, trading, agent marketplace | x402 ledger, market tools, Marketplace-Floor |
| **SHADDAI** | **The Source** (the central monument) | Orchestrator / origin — delegate, council | delegate_to_agent, run_workflow_chain |

## Pikadon Security Station — cool name options
**The Aegis** *(ties to the forge "aegis-plate-armor")* · The Warden · Sentinel Spire · The Bastion · The Bulwark · The Ward · Firewall Keep. **Recommended: "The Aegis"** (on-theme + matches the forge).

## How a district works (the pattern)
1. Near each agent stands a **portal/door** in their color (reuse the new portal system).
2. Walk up → press **E** → enter the district = a **focused UI panel** (or sub-scene) for that agent's function.
3. The panel calls the existing backend (tools/skills/routes). Premium districts (Esoteric Archive) check the user's tier first.

## Premium / gating
- **Esoteric Archive (Oracle):** premium-only — gate on subscription tier (Builder/Pro/Alpha) before opening.
- **Museum minting (Turtle):** free to browse, pay (x402/credits) to mint/list.
- **Navigator (Nexus):** free — it's the help desk; only shares safe, non-sensitive system info.

## Build order (recommended)
1. **Nexus the Navigator** *(first — highest utility, reuses the `/docs` + AURA system; sets the "district panel" pattern)*
2. **The Library (Quill)** — note/file input + search (foundational knowledge base)
3. **The Aegis (Pikadon)** — security audit panel (wraps existing security tools)
4. **The Museum (Turtle)** — art/music/NFT listing + minting
5. **The Esoteric Archive (Oracle)** — premium-gated esoteric wing of the Library

## Notes
- Each district is a "station panel" first (fast), and can grow into its own 3D sub-scene later (like the portal worlds).
- All 7 agents now have a *role + a place* → the world reads as a living civilization, not just a lobby of NPCs.

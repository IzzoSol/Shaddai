# SHADDAI Agent Manifest — Spec v1.0

*The portable contract for a SHADDAI agent. One JSON object fully describes an agent so it can be reproduced, embedded, traded, or registered on-chain. Adapted to SHADDAI's stack (JS + file/JSON storage + pixel agents) — derived from `backend/brains.js` (`PERSONAS` + `BRAINS`), not a separate table.*

## Why
- **Portability** — one object = a reproducible agent everywhere (UI, embed, API).
- **Orchestration** — the multi-agent workflow chain references agents by manifest, not scattered config.
- **Distribution** — the embeddable `<shaddai-agent>` widget loads an agent from its manifest.
- **On-chain** — pin the manifest (IPFS CID) → mint a collectible/NFT identity later.

## Schema

```jsonc
{
  "specVersion": "1.0",            // contract version (required)
  "id": "a_oracle",                // stable unique id (required)
  "name": "ORACLE",                // agent key (required)
  "label": "ORACLE · Research",    // display label
  "description": "Research & intelligence — connects dots, surfaces signals.",

  "brain": {                       // LLM config (required)
    "brainId": "claude-haiku",     // key in BRAINS registry
    "provider": "anthropic",       // anthropic | groq | openrouter | openai | ollama (required)
    "model": "claude-haiku-4-5-20251001",   // (required)
    "tier": "standard",            // free | standard | premium
    "instructions": "You are ORACLE…"        // system prompt
  },

  "tools": ["search_web", "fetch_price", "get_fear_greed", "..."],  // tool names from the registry (required, may be [])

  "voice": {                       // optional — TTS/STT
    "tts": { "provider": "elevenlabs", "voiceId": "..." }
  },

  "avatar": {                      // SHADDAI is pixel-art (not 3D GLB)
    "kind": "pixel",
    "sprite": "oracle",
    "color": "#a98bff"
  },

  "wallet": {                      // optional — for paid actions / on-chain
    "address": null,
    "supportedChains": ["solana", "base"]
  },

  "tags": ["research", "council"],
  "createdAt": "2026-06-04T00:00:00.000Z",
  "updatedAt": "2026-06-04T00:00:00.000Z"
}
```

## Required fields
`specVersion` · `id` · `name` · `brain.provider` · `brain.model` · `tools` (array, may be empty).

## Producing a manifest
`backend/lib/agent-manifest.js`:
- `buildManifest(agentName, opts?)` — derives a manifest from `PERSONAS`/`BRAINS` (+ optional `tools`, `voice`, `avatar`, `wallet`, `brainId`, `id`). Works for the 7 council agents and custom agents (`opts.custom = { label, persona, defaultBrain }`).
- `validateManifest(manifest)` → `{ valid, errors[] }`.

## API
`GET /api/agents/:name/manifest` → the agent's manifest (200) or 404 if unknown.

## Versioning
Breaking changes bump `specVersion`. Consumers must check it before hydrating.

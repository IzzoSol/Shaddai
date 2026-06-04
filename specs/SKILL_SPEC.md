# SHADDAI Skill Spec — Spec v1.0

*The portable contract for a SHADDAI skill. One JSON object describes a skill — what it does, which agent owns it, and the tools it bundles — so it can be discovered, lazy-loaded, documented, or shipped to external devs. Modeled on the `three.ws` SKILL_SPEC pattern, adapted to SHADDAI's stack (JS + file/JSON storage + a tool registry). Derived from `backend/skill-executor.js` (`SKILL_TOOL_MAP`) and `backend/agent-engine.js` (`TOOLS`), not a separate table.*

## Why
- **Discovery** — one object = a machine-readable capability the UI, embed widget, or an external dev can list without reading source.
- **Lazy-load** — a skill names its tools; the engine resolves and loads them only when the skill runs, keeping cold paths cheap.
- **Orchestration** — the multi-agent workflow chain references a skill by name → its tool bundle → the owning agent.
- **Distribution** — a skill is the unit of capability traded in the marketplace and surfaced in `public/skills-registry.json`.

## Schema

```jsonc
{
  "specVersion": "1.0",                 // contract version (required)
  "name": "crypto-trading",             // stable unique skill id (required)
  "version": "1.0.0",                   // semver of this skill (required)
  "description": "Live price + Fear&Greed + 7-day OHLCV, composed into a trade read.",  // (required)
  "agent": "ZEROX",                     // owning agent key from PERSONAS (required)

  "tools": [                            // tools the skill bundles (required, may be [])
    {
      "name": "fetch_price",            // tool name from the TOOLS registry (required)
      "description": "Live crypto price from CoinGecko.",
      "inputSchema": {                  // field → human/type hint (mirrors TOOLS[].schema)
        "symbol": "string — coin id e.g. bitcoin, ethereum, solana"
      }
    },
    {
      "name": "get_fear_greed",
      "description": "Crypto Fear & Greed Index (0–100) + 7-day history.",
      "inputSchema": {}
    }
  ],

  "cost": "low",                        // optional hint: low | medium | high
  "tags": ["crypto", "trading", "council"],
  "createdAt": "2026-06-04T00:00:00.000Z",
  "updatedAt": "2026-06-04T00:00:00.000Z"
}
```

## Required fields
`specVersion` · `name` · `version` · `description` · `agent` · `tools` (array, may be empty). Each tool requires `name`; `description` and `inputSchema` are recommended and default to the values in the `TOOLS` registry.

## Cost hint
`cost` is an optional planning signal, not a billing figure:
- **low** — local/computed or a single cached/free API call (e.g. `calculate`, `get_memory`).
- **medium** — one or two live external API calls (e.g. `fetch_price`, `search_web`).
- **high** — multi-call composition, code execution, or paid/LLM-backed work (e.g. `run_python`, image/video generation).

## Lazy-load & lifecycle
1. **Register** — a skill is declared by mapping its name to a tool bundle in `SKILL_TOOL_MAP`. Tool implementations stay in the registry; the skill only references them by name.
2. **Resolve (lazy)** — on invocation the engine resolves each tool name against the live `TOOLS` registry (and MCP tools when prefixed `mcp__`). Tools are not instantiated until the skill actually runs.
3. **Execute** — mapped tools run (in parallel where independent), their outputs compose, and the skill returns. If all mapped tools fail and nothing useful is produced, the engine falls through to an LLM path.
4. **Discover** — capabilities are emitted to a machine-readable registry (`public/skills-registry.json`) so the frontend and external devs can list skills/tools without loading the engine.

Skills are stateless between runs; durable facts go through the `save_memory` / `get_memory` tools, not the skill object.

## How SHADDAI implements it
- **Skill → tool mapping:** `backend/skill-executor.js` — `SKILL_TOOL_MAP` maps each skill (keyed by name, grouped per agent) to its tool steps and a `compose`/`synthesize` strategy. This is the source of truth for which tools a skill bundles.
- **Tool registry:** `backend/agent-engine.js` — `TOOLS` is the registry of executable tools, each `{ name, description, schema, agents[], execute() }`. A skill's `tools[].inputSchema` mirrors `TOOLS[name].schema`; `tools[].name` must exist in the registry (resolved via the engine's `resolveTool`).
- **Owning agent:** the `agent` field maps to a persona in `backend/brains.js` (`PERSONAS`); a tool's `agents[]` lists which agents may call it.
- **Registry export:** `scripts/build-skill-metadata.js` reads the exported `TOOLS` and emits `public/skills-registry.json` for discovery.

## Versioning
`version` is per-skill semver (bump on behavior change). `specVersion` is the contract version — breaking changes to this schema bump it, and consumers must check it before hydrating a skill.

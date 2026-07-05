# `run_skill` Tool — Design Specification

**File:** `docs/RUN_SKILL_SPEC.md`  
**Status:** Ready to implement  
**Target file:** `backend/agent-engine.js` — paste the TOOLS object entry after `read_obsidian_skill` (~line 1192)

---

## Background: Why This Matters

The SHADDAI skill index contains **3,437 skills** across three tiers:

| Tier | Count | Source |
|------|-------|--------|
| RECIPES | 100 | `skill-index.js` RECIPES map — deterministic tool chains |
| MD Catalog | 315 | `backend/data/agents/*.md` — per-agent skill tables |
| Baked Catalog | 3,022 | `skills-catalog.json` — full Obsidian vault with methodology |

Currently an agent inside `runAgentLoop` can only read a skill's text via `read_obsidian_skill` and then apply the methodology in its next response. It cannot **execute** a recipe's tool chain mid-loop. The `run_skill` tool bridges this gap: it lets any agent call `[TOOL:run_skill:{"skill":"daily-market-snapshot"}]` and get back the actual computed result — prices, research, code output — without leaving the loop.

---

## Section A — The Exact JS Object to Paste into `TOOLS`

Paste this immediately after the closing `}` of the `read_obsidian_skill` entry (around line 1192 in `agent-engine.js`), adding a comma after the previous entry:

```js
  run_skill: {
    name: 'run_skill',
    description: 'Execute one of the 3,437 SHADDAI skills by name or intent. For RECIPE skills, runs all tool steps deterministically and returns combined results. For MD/baked skills, returns the methodology so you can apply it. Prefer your own agent\'s skills first.',
    schema: {
      skill:  'string — skill name (e.g. "daily-market-snapshot") or a natural-language description of what you want (e.g. "analyze BTC dominance")',
      input:  'object — optional input params passed to recipe {{input.X}} placeholders (e.g. {"symbol":"bitcoin","address":"abc"})',
      agent:  'string — optional: restrict search to a specific agent\'s skills (ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON, SHADDAI)'
    },
    agents: ['SHADDAI','ZEROX','ORACLE','NEXUS','TURTLE','QUILL','PIKADON'],

    execute: async ({ skill: skillQuery = '', input: inputParams = {}, agent: preferAgent } = {}) => {
      // ── RECURSION GUARD ──────────────────────────────────────────────
      // run_skill is itself a tool, so a nested LLM synthesis step that
      // emits [TOOL:run_skill:...] would infinitely re-enter this function.
      // We block it at the step-execution level by checking resolved steps.
      // (The LLM synthesis in runSkill uses callLLM with plainChat=true which
      //  strips tool syntax, so this guard is a belt-and-suspenders safety.)
      const _runSkillDepth = (run_skill._depth || 0);
      if (_runSkillDepth >= 1) {
        return `[run_skill] Recursion blocked: run_skill cannot be called from inside a run_skill execution. Use individual tools (fetch_price, search_web, etc.) directly instead.`;
      }
      run_skill._depth = _runSkillDepth + 1;

      const STEP_TIMEOUT_MS = 8000; // cap per-step execution so the loop doesn't hang

      try {
        if (!skillQuery || !skillQuery.trim()) {
          return '[run_skill] Error: "skill" param is required. Provide a skill name or description.';
        }

        // ── STEP 1: RESOLVE THE SKILL ──────────────────────────────────
        // Try exact lookup first (fastest), then fuzzy keyword search.
        // Prefer the calling agent's skills (2× score boost already in findSkills).
        let skillMeta = null;
        let skillContent = null;

        // Exact match in recipe map
        const { RECIPES, loadSkillContent, findSkills } = skillIndex;
        if (RECIPES[skillQuery]) {
          skillMeta = { id: skillQuery, type: 'recipe' };
          skillContent = { type: 'recipe', recipe: RECIPES[skillQuery] };
        }

        // Fuzzy search if no exact match
        if (!skillContent) {
          const searchAgent = preferAgent || undefined; // undefined = search all
          const matches = findSkills(skillQuery, { agent: searchAgent, limit: 1 });

          if (matches.length === 0) {
            // Widen search to all agents if agent-scoped search found nothing
            const wideMatches = searchAgent ? findSkills(skillQuery, { limit: 1 }) : [];
            if (wideMatches.length === 0) {
              return `[run_skill] No skill found matching "${skillQuery}". Try a different description or use read_obsidian_skill to browse by name.`;
            }
            skillMeta = wideMatches[0];
          } else {
            skillMeta = matches[0];
          }
          skillContent = loadSkillContent(skillMeta.id, { type: skillMeta.type });
          if (!skillContent) {
            return `[run_skill] Skill "${skillMeta.id}" found in index but content could not be loaded.`;
          }
        }

        const resolvedId = skillMeta?.id || skillQuery;

        // ── STEP 2A: RECIPE — deterministic tool execution ─────────────
        // Execute each step's tool directly (no nested LLM planning).
        // Results are combined into a concise text block returned to the loop.
        // The agent in the outer loop does the synthesis — keeping us out of
        // nested LLM calls that could stall or recurse.
        if (skillContent.type === 'recipe') {
          const recipe = skillContent.recipe;
          const stepResults = [];

          for (let i = 0; i < recipe.steps.length; i++) {
            const step = recipe.steps[i];

            // RECURSION GUARD at step level: block steps that call run_skill
            if (step.tool === 'run_skill') {
              stepResults.push({ tool: step.tool, result: '[blocked: run_skill cannot call itself]', error: true });
              continue;
            }

            // Interpolate {{input.X}} and {{step[N].field}} placeholders
            const resolvedParams = {};
            Object.entries(step.params || {}).forEach(([k, v]) => {
              resolvedParams[k] = skillIndex.interpolate(String(v), inputParams, stepResults);
            });

            const tool = resolveTool(step.tool);
            if (!tool) {
              stepResults.push({ tool: step.tool, result: `Unknown tool: ${step.tool}`, error: true });
              continue;
            }

            // Execute with a per-step timeout
            try {
              const result = await Promise.race([
                tool.execute(resolvedParams),
                new Promise((_, rej) =>
                  setTimeout(() => rej(new Error(`timeout after ${STEP_TIMEOUT_MS}ms`)), STEP_TIMEOUT_MS)
                )
              ]);
              stepResults.push({ tool: step.tool, result: String(result).slice(0, 800) });
            } catch (stepErr) {
              stepResults.push({ tool: step.tool, result: `Error: ${stepErr.message}`, error: true });
            }
          }

          // Build a compact result block. The calling agent synthesizes prose;
          // we just return the raw data so there is NO nested LLM call here.
          const dataBlock = stepResults
            .map(s => `[${s.tool}]${s.error ? ' ERROR' : ''}: ${s.result}`)
            .join('\n\n');

          const note = recipe.synthesize
            ? `\n\n[run_skill note] This skill has a suggested synthesis prompt — apply it to the data above:\n"${skillIndex.interpolate(recipe.synthesize, inputParams, stepResults).slice(0, 300)}..."`
            : '';

          return `Skill "${resolvedId}" — ${recipe.description || ''}\nAgent: ${recipe.agent}\nSteps executed: ${stepResults.length}\n\n${dataBlock}${note}`;
        }

        // ── STEP 2B: MD / BAKED SKILL — return methodology ────────────
        // MD and baked skills are textual methodology, not tool chains.
        // Returning the content (like read_obsidian_skill) lets the calling
        // agent apply the methodology in its next response — no nested loop.
        // This is INTENTIONALLY identical to what read_obsidian_skill does,
        // but go through the unified resolver so skill discovery (findSkills)
        // drives everything rather than raw Obsidian id lookups.
        const s = skillContent.skill;
        const content = skillContent.content || s?.methodology || s?.description || 'No methodology available.';
        const agentLabel = s?.agent || skillMeta?.agent || 'SHADDAI';
        const category = s?.category ? `\nCategory: ${s.category}` : '';

        return `Skill: ${s?.name || resolvedId}\nAgent: ${agentLabel}${category}\nType: ${skillContent.type} (methodology — apply yourself)\n\n${content.slice(0, 2000)}`;

      } finally {
        // Always decrement the recursion counter
        run_skill._depth = Math.max(0, (run_skill._depth || 1) - 1);
      }
    }
  },
```

> **Placement note:** The `resolveTool` function is already defined at the top of `agent-engine.js` (line 26) and handles both the static `TOOLS` map and MCP tools — use it instead of `TOOLS[step.tool]` directly so MCP tools work too.

---

## Section B — Recursion Safety Design

### The Problem

`runSkill()` (the exported function used by `/api/skills/run`) already handles RECIPE execution, but it includes an **LLM synthesis step** (`callLLM`) when the recipe has a `synthesize` prompt. If that LLM call produces `[TOOL:run_skill:...]` in its output (because the system prompt advertises the tool), the loop re-enters `run_skill` — which calls `callLLM` again — unbounded stack.

The existing `runSkill` also calls `runAgentLoop` for MD/baked skills, which is a full 3–5 iteration LLM loop. Calling that from inside another agent's loop means: outer loop iter → `run_skill` tool → `runAgentLoop` → up to 5 more LLM calls, each potentially calling `run_skill` again.

### The Safe Design Chosen

| Path | What we do | Why it's safe |
|------|-----------|---------------|
| **RECIPE** | Execute tool steps directly via `tool.execute(params)` with 8s timeout per step. Return raw data block. Do NOT call `callLLM` for synthesis. | No LLM = no chance of emitting `[TOOL:run_skill:...]`. The outer loop agent does the synthesis in its next message. |
| **MD/baked** | Return skill text (methodology). Do NOT call `runAgentLoop`. | No nested loop. Agent reads the methodology and applies it in its own response. |
| **Recursion guard** | `run_skill._depth` counter. If depth ≥ 1, immediately return a refusal string. | Belt-and-suspenders: even if the LLM somehow emits a nested call in the data block, execution won't proceed. |
| **Step-level guard** | If any recipe step's `tool` field equals `'run_skill'`, skip it with an error note. | Prevents a hypothetically malicious/corrupt recipe entry from causing recursion. |
| **Per-step timeout** | `Promise.race([tool.execute(), timeout(8000)])` | Prevents a single slow network tool (e.g. `search_web`, `get_arxiv_papers`) from hanging the agent loop indefinitely. |

**Key principle:** The `run_skill` tool in `TOOLS` is NOT a wrapper around `runSkill()` the function. It is a leaner sibling that skips the parts unsafe for mid-loop use (nested LLM calls, nested `runAgentLoop`).

---

## Section C — Skill Selection Logic & Return Format

### How it selects the right skill

1. **Exact match** — checks `RECIPES[skillQuery]` first. O(1), instant, no ambiguity.
2. **Agent-scoped fuzzy search** — calls `findSkills(query, { agent: callingAgent, limit: 1 })`. The `findSkills` scorer already gives RECIPES a 2× boost and MD skills 1.3× boost, so deterministic skills surface first.
3. **Widened search** — if agent-scoped search finds nothing, repeats without the `agent` filter. This lets ZEROX use a QUILL skill if nothing in ZEROX's catalog matches.
4. **Failure** — returns a human-readable error string (not an exception), so the agent loop continues gracefully.

### String returned to the loop

For **recipes**, the return string has this shape:
```
Skill "daily-market-snapshot" — Live BTC/ETH/SOL prices, Fear & Greed, top trending coins, global market cap.
Agent: ZEROX
Steps executed: 6

[fetch_price]: {"symbol":"bitcoin","price":"$67,420",...}

[fetch_price]: {"symbol":"ethereum","price":"$3,841",...}

[get_fear_greed]: {"today":{"score":"72","label":"Greed"},...}

...

[run_skill note] This skill has a suggested synthesis prompt — apply it to the data above:
"Write a punchy 4-paragraph daily market snapshot using the data above. Include: (1) major prices..."
```

The agent in the outer loop then writes the synthesis using this real data in its next message — which is exactly how the existing tool-result injection works (`[TOOL_RESULT:tool_name]\n${result}`).

For **MD/baked skills**, the return is the methodology text (same as `read_obsidian_skill`) plus a `Type: md (methodology — apply yourself)` header so the agent knows to self-apply rather than look for computed data.

### Timeout handling

Each recipe step is raced against an 8-second timeout. Steps that time out record an error entry (`"Error: timeout after 8000ms"`) and the loop continues to the next step. This matches the existing `runSkill` pattern of tolerating partial failures and still delivering whatever data was collected.

---

## Section D — What This Unlocks

Three points:

1. **3,437 skills become callable tools.** Any agent, mid-reasoning-loop, can now execute any of the 100 recipes or retrieve any of the 3,337 methodology skills with a single `[TOOL:run_skill:{"skill":"..."}]` call — instead of requiring a separate `/api/skills/run` HTTP round-trip orchestrated from outside the loop.

2. **Recipes run without a human trigger.** Previously, the `runSkill` function was called only by the `/api/skills/run` route (user-initiated). With `run_skill` in `TOOLS`, an agent can autonomously choose and execute a skill as part of its own reasoning — enabling self-directed multi-skill workflows inside one task.

3. **The skill index becomes RAG-for-execution, not just RAG-for-reference.** The existing system injects skill *descriptions* into the prompt so the agent knows skills exist. With `run_skill`, the agent can also *execute* them, closing the gap between knowing a skill and doing it.

---

## Quick Integration Checklist

- [ ] Paste the `run_skill` TOOLS entry after `read_obsidian_skill` in `agent-engine.js`
- [ ] Verify `resolveTool` is visible in scope (it is — defined at line 26, same file, before `TOOLS`)
- [ ] Verify `skillIndex.interpolate` is available (it is — `const skillIndex = require('./skill-index')` at line 16)
- [ ] The normalisation loop at line ~2646 (`for (const [key, tool] of Object.entries(TOOLS))`) will auto-backfill `name` if omitted — but the entry above includes `name: 'run_skill'` explicitly, so it's clean
- [ ] Test with: `[TOOL:run_skill:{"skill":"daily-market-snapshot"}]` in a ZEROX agent chat
- [ ] Test recursion guard: call `run_skill` with `{"skill":"run_skill"}` — should return the blocked message, not hang

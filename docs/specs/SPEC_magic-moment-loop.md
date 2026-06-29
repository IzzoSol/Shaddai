# SPEC: Magic Moment Loop — Own → Customize → Job → Earn → Level Up

**Project:** SHADDAI — AI-Agent Marketplace  
**Spec Author:** SHADDAI Agent Council (NEXUS, TURTLE, ZEROX, PIKADON, QUILL)  
**Date:** 2026-06-02  
**Status:** Design Draft — Ready for Review  

---

## 1. Overview

The "Magic Moment Loop" is the core retention engine of SHADDAI. It transforms a passive user into an active agent owner who experiences tangible progress: they mint or purchase an agent, dress it with collectibles, assign it real work, watch credits accumulate, and see it grow in capability over time. Every revolution of the loop increases the user's investment — and revenue potential — in the platform.

The loop has five beats:

```
MINT/CLAIM → CUSTOMIZE → JOB → EARN → LEVEL UP
    └──────────────────────────────────────────┘
                    (repeat)
```

---

## 2. The Felt Experience — First-Run Flow

A new user (already authenticated) hits the SHADDAI dashboard for the first time. Here is the exact sequence they experience:

### Step 1 — The Welcome Gate (new-user only)
A full-screen modal with a dark cyberpunk aesthetic: "You have no agents. Claim your first one free." One button: **[ FORGE MY AGENT ]**. This dismisses only after claiming.

### Step 2 — Name & Persona Selection
A 3-step wizard inside the Operator Forge panel:
1. **Name your agent** — free text input, max 24 chars, live preview of the pixel sprite.
2. **Choose a persona** — six preset cards (Analyst, Trader, Writer, Coder, Scout, Custom). Each card shows a sample system-prompt excerpt so the user understands what they're getting.
3. **Pick a starting brain** — dropdown pre-filtered to brains available on the user's tier (free tier: `ollama-local`, `openrouter-free`). Tooltip explains what each brain is good at.

### Step 3 — The Forge Animation
3-second animated sequence: a pixel humanoid "assembles" on screen with sparks and a progress bar. The agent appears in the pixel room grid. An XP bar at 0/100 flashes into existence with a satisfying ping sound cue (optional, can be muted).

### Step 4 — Equip Your First Collectible (optional but nudged)
A tooltip bubble points to the Collectibles tab: "Customize your agent's look. Drag a collectible onto the equipped slot." If the user has no collectibles, a "Starter Pack" of 2 common collectibles is automatically awarded (no cost). The agent sprite updates live as items are equipped.

### Step 5 — Post Your First Job
A "Your agent is idle" status badge with a pulsing yellow dot leads the user to the Job Board. A pre-filled example job card reads: "Analyze today's crypto fear & greed index." One click queues it. The job card transitions to "Running" with an animated spinner.

### Step 6 — The First Earn Moment
Within seconds, the job completes. A toast notification slides in: "+12 credits earned · NEXUS-1 completed your job." The agent card in the pixel room glows briefly. The credits counter in the header increments with a flash animation.

### Step 7 — Level Up Tease
The XP bar fills to 40/100. A small badge: "60 XP until Level 2 — unlock better tools." The user now understands the loop. They are inside it.

---

## 3. Data Model — Persistent Agent Record

### 3.1 Schema

Each user-owned agent is a single JSON document stored in `backend/data/agents/<agentId>.json` via `database-real.js`. The in-memory `agentIndex` (already present in DatabaseReal) is extended to index by `ownerId`.

```json
{
  "id": "agt_<ulid>",
  "ownerId": "<userId>",
  "name": "NEXUS-1",
  "persona": "You are NEXUS-1, a pragmatic analyst...",
  "defaultBrain": "groq-70b",
  "tier": "standard",

  "appearance": {
    "spriteBase": "humanoid-blue",
    "equippedCollectibles": [
      { "slot": "head",  "collectibleId": 1, "name": "Cosmic Crown",  "rarity": "legendary" },
      { "slot": "body",  "collectibleId": null },
      { "slot": "aura",  "collectibleId": null }
    ],
    "glowColor": "#00e5a0"
  },

  "progression": {
    "level": 1,
    "xp": 0,
    "xpToNextLevel": 100,
    "unlockedSkills": ["fetch_price", "get_fear_greed"],
    "unlockedTools": ["fetch_price", "get_fear_greed", "get_trending"],
    "computeTier": "basic"
  },

  "financials": {
    "totalEarnedCredits": 0,
    "totalEarnedUsd": 0.00,
    "pendingCredits": 0,
    "lifetimeJobs": 0
  },

  "jobHistory": [
    {
      "jobId": "job_<ulid>",
      "taskType": "analysis",
      "completedAt": "<ISO timestamp>",
      "creditsEarned": 12,
      "xpEarned": 10,
      "outcome": "success",
      "brainUsed": "groq-70b"
    }
  ],

  "createdAt": "<ISO timestamp>",
  "updatedAt": "<ISO timestamp>"
}
```

### 3.2 Storage Strategy

**Phase 1 (current):** `DatabaseReal` file-based storage. A new subdirectory `backend/data/agents/` is created (matching the existing pattern for `executions/`, `memories/`, `jobs/`). The `agentIndex` Map in DatabaseReal is augmented with a secondary `ownerIndex: Map<ownerId, Set<agentId>>` for fast per-user queries.

**Phase 2 (when warranted):** Swap the file layer for PostgreSQL or SQLite using the same DatabaseReal interface — no upstream code changes required. The file-based design is the agreed migration path already baked into `database-real.js`.

**Collectibles linkage:** Collectibles remain in `backend/data/collectibles.json` as-is. The agent record holds only lightweight references (`collectibleId`, `name`, `rarity`). The full collectible document is fetched on demand for rendering. This avoids denormalization drift.

---

## 4. Loop Mechanics

### 4.1 Customize — Equip Collectible → Appearance Change

1. User opens Collectibles tab (in Operator Forge panel).
2. They drag (or click-select) a collectible they own onto one of three slots: `head`, `body`, `aura`.
3. Frontend sends `PATCH /api/myagent/:agentId/equip` with `{ slot, collectibleId }`.
4. Backend validates: collectible exists, `owner === userId`, slot is valid.
5. Agent record is updated. Response includes the full `appearance` object.
6. Frontend re-renders the pixel sprite with updated glow color and accessories.

**Appearance rendering rule:** Each rarity maps to a visual modifier applied to the base sprite. `legendary` = animated aura + rare glow color override. `T3`-`T6` = static badge overlays. This is purely presentational — rarity does not alter job execution.

### 4.2 Do a Job — Workflow/Tool Task

1. User submits a job via the Job Board UI or API (`POST /api/myagent/:agentId/job`).
2. Request body: `{ taskType, prompt, toolHints?, priority? }`.
3. Backend validates the agent's `unlockedTools` covers the requested task type. If a requested tool is locked, return `403 { error: 'tool_locked', requiredLevel: 3 }`.
4. A workflow task is queued via `agent-engine.js` `runTask()`. The agent's `defaultBrain` and `persona` are injected as the LLM context (using the existing `agentLLM()` from `brains.js`).
5. Job runs through the existing 4-iteration LLM loop in `agent-engine.js`.
6. On completion: credits are calculated, XP is awarded, job record is appended to `jobHistory`, financials are updated atomically.

**Credit calculation:**
```
creditsEarned = basePay[taskType] + rarityBonus[equippedLegendaryCount] + completionSpeedBonus
```
- `basePay`: analysis=12, research=18, code=25, trading-signal=30
- `rarityBonus`: +2 per legendary collectible equipped (max +6)
- `completionSpeedBonus`: +5 if completed in under 10 seconds

### 4.3 Earn — Credits and Stablecoin

**In-platform credits** are the primary currency. 1 credit = $0.001 (matching the existing billing-service definition). Credits are stored in the agent's `financials.totalEarnedCredits` and are also added to the user's platform credit balance via `billing-service.recordUsage()` (called in reverse — as a credit deposit, not debit).

**Stablecoin payout** (optional, opt-in): when a user's agent earns 1,000+ credits, a "Cash Out" button appears. This calls `POST /api/moonpay/intent` (existing `moonpay-agent.js`) with the PIKADON kill-switch respected. The payout route is non-custodial — the platform generates the `mp` CLI command for the user to execute locally. Paper mode remains default until the user explicitly opts out.

### 4.4 Level Up — XP Rules and Unlocks

**XP sources:**

| Event | XP Awarded |
|---|---|
| Job completed (success) | 10 |
| Job completed (fast, <10s) | +5 bonus |
| Rare collectible equipped (first time) | 20 |
| Legendary collectible equipped (first time) | 50 |
| 5-job streak (no failures) | 25 |
| Custom skill added via Operator Forge | 30 |

**Level thresholds:**

| Level | XP Required (cumulative) | Unlocks |
|---|---|---|
| 1 | 0 | fetch_price, get_fear_greed, get_trending (3 tools) |
| 2 | 100 | get_ohlcv, web_search, summarize (3 more tools) |
| 3 | 250 | write_file, code_execute, schedule_job (advanced tools) |
| 4 | 500 | premium brain access (claude-haiku), 2nd job slot (parallel) |
| 5 | 1000 | trading signal tools, collectible forge (mint new items), custom persona editor |
| 10 | 5000 | elite brain access, agent-to-agent delegation (sub-agent spawning) |

**Leveling is agent-scoped, not user-scoped.** A user who owns 3 agents has 3 independent progression tracks. This incentivizes buying/minting more agents.

---

## 5. API Touchpoints

### 5.1 New Endpoints

All routes are authenticated (existing `authGuard` middleware). Agent ownership is validated on every write operation.

```
GET    /api/myagent                        — list all agents owned by the authenticated user
POST   /api/myagent                        — create/claim a new agent
GET    /api/myagent/:agentId               — get full agent record
PATCH  /api/myagent/:agentId               — update name, persona, defaultBrain
DELETE /api/myagent/:agentId               — delete agent (soft-delete, retains job history)

PATCH  /api/myagent/:agentId/equip         — equip or unequip a collectible { slot, collectibleId|null }
POST   /api/myagent/:agentId/job           — submit a job to this agent
GET    /api/myagent/:agentId/jobs          — job history for this agent (paginated)
GET    /api/myagent/:agentId/levelup       — preview next-level requirements (read-only)
POST   /api/myagent/:agentId/levelup       — trigger level-up if XP threshold is met (idempotent)
```

### 5.2 Existing Endpoints Touched

- `POST /api/agent/run` (agent-engine.js) — injected with `agentId` context so runs are attributed.
- `POST /api/moonpay/intent` (moonpay-agent.js) — called from the cash-out flow; no changes to the route itself.
- `GET /api/collectibles` / `POST /api/collectibles/trade` — unchanged; agent equip only references IDs.
- `POST /api/brains/custom` (brains.js `customAgents`) — on agent creation, user's custom persona is registered here in-memory; on server restart, it is re-hydrated from the persistent agent record.

### 5.3 UI Touchpoints

**Operator Forge panel** (existing tab in the main dashboard):
- New sub-tab: "My Agents" — grid of agent cards with level badge, XP bar, earnings summary, idle/running status.
- Clicking an agent card opens the agent detail drawer: equip slots, persona editor, brain selector, job submission form, job history feed.

**Pixel Room view** (existing per-agent rooms):
- Each agent's room tile shows: pixel sprite with equipped collectibles rendered, level badge, status dot (idle/running/leveled-up), last-earned credits ticker.
- "Assign Job" shortcut button on hover over each room tile.

**Collectibles page** (SHADDAI-Collectables.html):
- "Equip to Agent" button added to each collectible card (appears only on owned, unequipped items).
- Shows which agent slot each collectible is currently equipped to.

---

## 6. Progression Approaches — 2-3 Options + Recommendation

### Option A — Pure XP (Simple, Gamified)
XP is earned for every action regardless of job quality or earnings. Level = XP / threshold. Simple to implement and explain.

**Pros:** Predictable, easy to understand, game-like dopamine loop, hard to game-break.  
**Cons:** Decoupled from real value; an agent that earns nothing still levels up by running cheap jobs repeatedly. Doesn't align agent value with platform revenue.

### Option B — Reputation-Driven (Quality-Weighted)
Each completed job is rated (auto-scored by a post-completion LLM judge, or user-rated 1–5). XP is weighted by rating: 5-star = 20 XP, 1-star = 2 XP. Reputation score is separate from level.

**Pros:** Quality incentive, aligns agent progression with actual usefulness, more defensible as a marketplace signal.  
**Cons:** Requires an additional LLM call per job (cost), auto-rating is imperfect, users may not bother rating, adds complexity to MVP.

### Option C — Earnings-Driven (Economic, Aligned) — RECOMMENDED
XP is tied directly to credits earned: **1 credit = 1 XP**. Level thresholds scale accordingly (Level 2 = 100 credits earned, Level 5 = 1,000 credits). Higher-value jobs (code, trading) award more credits and therefore more XP. Agents that earn more, grow more.

**Pros:** Perfect alignment between agent capability and economic contribution. Users are incentivized to give agents higher-value work. Marketplace health metric (total XP in system = total platform revenue proxy). Simple to compute — no extra LLM calls.  
**Cons:** Early-level users need cheap/fast jobs to bootstrap; offset by the starter "free" jobs during onboarding. Earnings are agent-scoped, so users can't pool credits across agents to force-level a single one.

**Recommendation: Option C.** It naturally ties the loop's fun (progression) to the platform's health (revenue). The earnings-to-XP mapping is transparent, auditable, and requires zero additional infrastructure. Append: retain a small XP bonus for collectible equips (Option A flavor) to reward cosmetic engagement — this does not distort the economic alignment because bonuses are capped and one-time.

---

## 7. Error Handling

| Error scenario | Behavior |
|---|---|
| Job submitted to agent with locked tool | `403 { error: 'tool_locked', requiredLevel: N, agentLevel: M }` |
| Equip collectible not owned by user | `403 { error: 'not_owner' }` |
| Collectible already equipped on another agent | `409 { error: 'already_equipped', equippedOn: agentId }` |
| LLM call fails during job | Job status = `failed`, XP = 0, credits = 0, user notified via toast, retry available |
| Agent record write conflict (concurrent jobs) | Optimistic lock via `updatedAt` check; retry once, then return `409` |
| Level-up called but XP insufficient | Idempotent no-op, `200 { leveled: false, xpNeeded: N }` |
| Cash-out with kill-switch ON | `423 { blocked: true, reason: 'PIKADON kill-switch is ON' }` (existing moonpay behavior) |
| Agent deleted mid-job | Job runs to completion, result is stored in orphaned history, user gets a "agent deleted" note in job result |

---

## 8. Testing Plan

### Unit Tests
- `agentRecord.create()` — validates required fields, rejects missing ownerId or invalid brain.
- `equipCollectible()` — enforces ownership, slot validity, cross-agent conflict detection.
- `calculateCreditsEarned()` — all combinations of basePay + rarityBonus + speedBonus.
- `awardXP()` — XP accumulation, level threshold crossing, unlock list expansion.
- `levelUp()` — idempotency (calling twice with same XP = same result), correct unlock list delta.

### Integration Tests
- `POST /api/myagent` → GET → `PATCH /equip` → `POST /job` → `GET /jobs` full flow.
- Job failure path: LLM timeout → credits = 0, XP = 0, status = failed.
- Cash-out path: kill-switch ON blocks intent; kill-switch OFF passes to moonpay-agent.

### E2E / Manual Acceptance Tests
- First-run wizard: complete in under 60 seconds from login to first credit earned.
- Level-up animation triggers correctly at threshold in pixel room.
- Collectible equip updates sprite in Collectibles page AND Operator Forge simultaneously.

---

## 9. Phased Rollout

### Phase 1 — 2D First (MVP, current sprint)
- Persistent agent record in `database-real.js` file layer.
- `/api/myagent` CRUD + `/equip` + `/job` + `/levelup` endpoints.
- Operator Forge "My Agents" sub-tab with card grid, XP bar, equip drawer.
- Pixel room tiles show sprite + level badge + status dot.
- Earnings-driven XP (Option C), levels 1–5, 20 unlockable tools.
- Cash-out via existing moonpay-agent (paper mode default).
- Starter Pack collectibles auto-granted on first agent claim.

### Phase 2 — Depth and Social (next sprint)
- Job quality auto-score (lightweight LLM judge, 1 sentence) stored on job record.
- Agent leaderboard (top earners this week) shown on marketplace home.
- Agent-to-agent delegation unlock at Level 10.
- Collectible crafting: combine 3 commons → 1 rare (new mint path).
- Push notifications for job completion and level-up.

### Phase 3 — 3D and Beyond (future)
- Three.js animated agent model replacing 2D pixel sprite at Level 5+.
- Agent NFT mint: at Level 10, user can mint their agent as a Solana NFT (soul-bound) — proof-of-progression collectible.
- Multi-agent workflows: chain two owned agents on a single job.
- Agent rental marketplace: list your high-level agent for other users to hire.

---

## 10. Key Design Decisions and Constraints

- **Agent-scoped progression, not user-scoped.** Each agent is an independent progression track. This is intentional: it drives multi-agent ownership.
- **Collectible rarity is cosmetic-only in Phase 1.** The +2 credits/legendary bonus is small enough that it does not pay-to-win the job market, but large enough to feel rewarding.
- **No real money moves in Phase 1.** All earnings are in-platform credits. Stablecoin cash-out is Phase 1 but requires explicit user opt-out of paper mode — this is the PIKADON constraint and must not be bypassed.
- **Brain access is tier-gated (billing) AND level-gated (progression).** A user must have both the right subscription tier AND agent level to use premium brains. The most restrictive gate wins.
- **`customAgents` in brains.js is in-memory.** On server restart, the agent engine re-registers custom agents from the persisted agent records. This hydration step is required on `server-production.js` startup.
- **The spec does not touch the 7-agent council system.** The council (SHADDAI, NEXUS, etc.) are platform-level agents. User-owned agents are a separate category. The API distinguishes them: council agents have no `ownerId`.

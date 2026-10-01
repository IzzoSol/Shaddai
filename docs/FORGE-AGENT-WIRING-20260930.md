# Forge Agent → Game Wiring (2026-09-30)

**Status:** spec only. Nothing here is implemented. Written by GLM-5 for the Opus/Sonnet session.

**Owner intent:** "the forge agent needs to be wired correctly — the one from the dashboard
needs to be the one that connects to the game."

That is currently false, and it is false structurally, not cosmetically. This document
names the exact break, then specifies the fix.

---

## 1. The finding in one line

**The Forge and the game are reading two different files, so the agent you forge in the
dashboard is not the agent that shows up in the world.**

| | Registry the Forge writes | Registry the game reads |
|---|---|---|
| Path | `backend/data/forge-state.json` → unified Operative store | `backend/data/custom_agents.json` |
| Owner field | `owner` (server-verified via `softAuth`) | **none** |
| Shape | `codename, archetype, rarity, look, portrait, brain, tools, buildHash, economy, inventory` | `name, emoji, role, color, systemPrompt, avatarUrl, position{col,row}, createdAt` |
| Read by | Forge, Office, Gallery, Workflows, World | `server/agentServer.js` only |

Live proof on this machine: `backend/data/custom_agents.json` contains exactly **one**
entry, named `TEST`, with **no owner field**, created `2026-07-11`. The dashboard shows
real forged agents. `GET /agent/forge-roster` will show `TEST` — or nothing — forever.

Every downstream symptom ("my forged agent doesn't appear", "the roster is empty",
"two players forged the same name and they're different agents") follows from this one
line of code:

```js
// server/agentServer.js:27
const FORGE_AGENTS_FILE = path.join(__dirname, '..', 'backend', 'data', 'custom_agents.json');
```

---

## 2. Full defect list, in severity order

### S1 — Wrong registry (the root cause)
`agentServer.js:27,34-37` reads `custom_agents.json`. The Forge writes `forge-state.json`,
which `backend/lib/operatives-routes.js:15-37` (`syncFromForgeState`) imports into the
unified Operative store. Nothing writes `custom_agents.json` during a normal forge.

### S2 — No ownership on the game's stationing path
`POST /agent/hire` (`agentServer.js:71-111`) accepts `forgedAgentId` straight from the
request body and only checks the id exists (`:85-86`). It never checks the caller owns it.
**Any client can station any other player's forged agent.** The Operative store already
solves this: `operatives-routes.js:48` forces `owner: req.userId` and ignores any
client-supplied owner.

### S3 — No authentication on the whole router
`agentServer.js` has **no** `softAuth` on any route. `characterId` arrives via
`req.query` / `req.body` unauthenticated. `backend/auth-guard.js` exports `softAuth` and
`operatives-routes.js` uses it, so the pattern exists and is proven.

`docs/CITY-ACTIONS.md:101` already records the consequence of this pattern elsewhere:
`softAuth` sets `req.userId = 'local'` when anonymous, so **every signed-out player shares
the `'local'` account's balance and roster.** Do not let a second system inherit that.

### S4 — Silent failure masquerading as "no agents"
`loadForgeAgents()` (`:34-37`) wraps everything in `try/catch → []`. Missing file, wrong
shape, permission denied, and genuinely-empty all produce the same answer: an empty roster
with no error anywhere. This is why the bug has been invisible.

### S5 — Cross-repo filesystem dependency
`path.join(__dirname, '..', 'backend', ...)` assumes the game server and the platform
backend share a checkout. They do not:
- the beta repo was just given **its own API backend** (`Shaddai-Beta` `009f96f`)
- Render containers have ephemeral filesystems; a JSON file written at build time is not
  a registry

### S6 — Forge output is discarded at stationing time
`agentServer.js:90` replaces the agent's real definition with a flat literal:

```js
def = { name: forged.name, emoji: forged.emoji, cost: 0,
        energy: 15, durationMs: 5*60*1000, yield: { sparks: 12 }, isForged: true };
```

- `forged.role` is read at `:52` then thrown away
- every forged agent yields flat Sparks, while base roles yield distinct goods
  (gatherer→ore, merchant→sparks, scout→fiber, crafter→sword, `:40-43`)
- `level = 1 + floor(shifts/3)` (`:46`) is identical for every agent regardless of
  archetype, rarity, or tools
- `systemPrompt`, `color`, `position` are dropped

Meanwhile the Operative store holds `archetype`, `rarity`, `tools`, `brain`, `buildHash`.
**The forge's entire output is discarded at the moment it enters the world.**

### S7 — `SHADDAI_FORGE_MODEL` is a model name, not an identity
`public/forge-tab.js:76,102` sets `window.SHADDAI_FORGE_MODEL = 'NEXUS'` etc. — a GLB
choice. Two players both forge "NEXUS" and the game cannot tell them apart. Combined
with S2, archetype is cosmetic.

### S8 — No presence, no home, no body
A roster row has `energy`, `durationMs`, `yield`. That is a job timer, not a citizen.
There is no `homeTile`, no `presence`, no `position`, no calendar. So the agent cannot be
visited, cannot refuse, cannot be seen — which is exactly the layer the friendship thesis
(`FRIENDSHIP-THESIS-20260930.md`) requires as its substrate.

**Note the hook already exists:** `operatives-routes.js:53-79` auto-creates a personal room
per operative in `agent-rooms.json`, keyed `op_<codename>`, with an archetype→theme map.
The home exists. Nothing exposes it as presence.

### S9 — No idempotency, no locking → double-spend and lost updates
`loadFile` → mutate → `saveFile` (`:32-33`) with no mutex and no idempotency key.

- **Double collect:** two concurrent `POST /agent/collect/:key` both read
  `agent.shiftEndAt` in the past, both compute yield, both write. Yield doubles.
  `:173-176` clears `shiftEndAt` *after* the yield is granted.
- **Cap race:** two concurrent `hire` both read `Object.keys(roster).length` (`:98`), both
  pass, both write — a lost update breaks the 4-agent cap.
- **Double charge on retry:** `docs/CITY-ACTIONS.md:105` documents the identical class on
  hire / skills-market / bazaar — "a retried request after a network timeout can charge twice."

### S10 — No release path
No DELETE on the roster. An agent can be stationed forever. The Ward arc (forge → teach →
they leave the nest) has no endpoint.

---

## 3. Target architecture

### 3.1 One identity, two bodies

```
PLATFORM IDENTITY              THE JOIN                  WORLD IDENTITY
instanceId / operativeId  ──►  body grant record  ──►  characterId
owner (server-verified)         claimedAt                  homeTile / roomKey
wallet (Base / Solana)          archetype, rarity         presence
spend caps, public ledger       tools, buildHash          inventory, position
reputation tier, mastery        (copied once, by ref)     bonds, calendar
```

**The single rule:** *the world never mints identity; it grants a body to an identity that
already exists.* That is the whole difference between "the dashboard agent" and "an NPC that
looks like it."

### 3.2 Replace the roster row with a body grant

Today `server/data/agents.json` is `{ characterId: { key: {...} } }` — a **copy** of the
agent's definition. Copies drift. The grant should be a **reference**:

```jsonc
// server/data/agent-bodies.json
{
  "grantId": "grant_…",
  "operativeId": "agent_1783795970764_rty3z",   // FK → unified Operative store
  "characterId": "char_…",                       // who hosts the body
  "claimedAt": "2026-09-30T…",
  "archetype": "vanguard",       // snapshotted at claim for render + balance
  "rarity": "rare",
  "tools": ["survey", "repair"],
  "roomKey": "op_test",           // FK → agent-rooms.json (the home)
  "presence": "home",             // derived; see 3.4
  "workState": { "shiftEndAt": 0, "shifts": 0, "level": 1 }
}
```

`archetype` / `rarity` / `tools` are snapshotted **once, at claim time**, so the world can
render and balance without a cross-service read on every frame. `operativeId` stays the
source of truth for identity. If the player re-forges, the grant is re-pointed, not forked.

### 3.3 The stationing endpoint

```
POST /agent/claim      { operativeId }
GET  /agent/forge-roster          → owner's operatives (NOT a raw file read)
GET  /agent/bodies?characterId=   → granted bodies with joined identity
POST /agent/shift/:grantId
POST /agent/collect/:grantId      → idempotency key required
DELETE /agent/bodies/:grantId     → release (enables the Ward departure)
```

Every route: `softAuth`, identity from `req.userId` only, ownership verified against the
Operative store before any write.

### 3.4 Presence is nearly free

The shift endpoints already produce the truth:

```js
presence = (workState.shiftEndAt > Date.now()) ? 'working' : 'home';
```

Plus `away` when the player is offline and the world is simulating. This is the smallest
possible bridge into the bond/visit system — and it costs nothing, because the shift timer
already exists.

### 3.5 Unify the work queue

Today there are two producers of "work":

1. the player clicking **work shift** (`/agent/shift`)
2. the platform delegating task batches (`forge_delegate` → `forge_complete_work`)

These should be **one queue**. A shift the player started and a batch the orchestrator
delegated are the same row with different `source`. Otherwise the agent has two
unconnected work lives and neither can see the other.

### 3.6 The money leg

If the dashboard agent can earn (`ledger_receipt`, `x402_intent`, `directory_register`
prices), the game must show it, and the game must be able to instruct it. Both sides of
that already exist and neither is connected:

| Platform | Game |
|---|---|
| `shaddai_create_agent` spend caps + public ledger | `char.currency.sparks` |
| `ledger_receipt` / `ledger_summary` (85/15 split) | `sparksCore.recordChange` / `recordSink` |
| `x402_intent` / `x402_confirm` (Solana USDC) | `plotServer` faucet / `marketServer` fee |
| `reputation_status` tier | `level = 1 + floor(shifts/3)` |

Pick one direction first (read-only display of receipts in the HUD is the cheapest honest
v1) and do not attempt a bidirectional bridge before the identity join is solid.

---

## 4. Build order

Each step is independently shippable and independently testable. Stop after any step that
does not go green — do not stack fixes.

| # | Step | Size | Risk |
|---|---|---|---|
| 1 | **Fail loud.** Registry read throws with a named cause instead of `→ []`. Log `forge-roster: N entries from <resolved path>`. | ~15 lines | none |
| 2 | **Fix the registry.** Read the Operative store, not `custom_agents.json`. Add a boot self-check that the store is reachable. | ~40 lines | low |
| 3 | **Add `softAuth`** to every `agentServer` route; derive `characterId` from `req.userId`, stop reading it from query/body. | ~30 lines | **med** — breaks any client still sending `characterId`; ship with a compat shim that logs deprecation |
| 4 | **Ownership check** on stationing, against the Operative store's `owner`. | ~20 lines | low |
| 5 | **Body grants.** New file + schema; migrate `agents.json` rows to `{ operativeId }` references. | ~120 lines | med |
| 6 | **Persist forge output.** Stop the `:90` literal; snapshot `archetype`/`rarity`/`tools`; derive yield from a config table, server-side. | ~60 lines | low |
| 7 | **Idempotency + per-character mutex** on `hire`/`collect`; temp-file-then-rename writes. | ~60 lines | low, high value |
| 8 | **Presence + `roomKey`** on the grant; expose via `/agent/bodies`. | ~40 lines | low |
| 9 | **Release endpoint** (`DELETE`), enabling the Ward departure. | ~30 lines | low |
| 10 | **Unify the work queue** (player shift + delegated batch). | ~150 lines | high — defer |
| 11 | **3D body binding** — render the grant's operative in-world; replace `SHADDAI_FORGE_MODEL` string with `operativeId`. | large | high — needs Cluster A normalization first |
| 12 | **Money leg, read-only.** Show platform receipts in the agent HUD. | ~80 lines | med |

Steps 1–9 are the "wire it correctly" fix. Step 11 is the "you can see it" fix, and it is
blocked on the loader-normalization work in the polish plan — a grant has no body until
Cluster A is fixed.

---

## 5. Tests required before merge

All in the existing direct-run style (`node <file>` — the directory form of `node --test`
fails on Node 25 in this repo).

| Test | Asserts |
|---|---|
| `forge-roster-sources-operatives` | roster returns entries from the Operative store; a file in `custom_agents.json` does **not** appear |
| `registry-fails-loud` | unreadable registry → non-200 with a named error, not an empty array |
| `cannot-station-foreign-agent` | A stationing B's operative with A's session → 403 |
| `roster-needs-auth` | no token → 401/403, never the `'local'` account |
| `claim-is-idempotent` | two identical `claim` calls → one grant |
| `collect-is-idempotent` | two concurrent `collect` → yield granted once |
| `hire-respects-cap-under-race` | N concurrent `hire` at the cap → never exceeds it |
| `forge-output-persists` | claimed agent retains `archetype`, `rarity`, `tools`; yield is archetype-derived |
| `presence-derives-from-shift` | mid-shift → `working`; after expiry → `home` |
| `release-allows-reclaim` | delete grant, re-claim → allowed, no duplicate body |

---

## 6. Open questions for Opus

1. **Snapshot or live-join?** I propose snapshotting `archetype`/`rarity`/`tools` at claim
   time. Alternative is a live join on every read, which is always correct and never
   fast. Does balance need live truth, or is a claim-time snapshot acceptable?
2. **Who owns identity after a re-forge?** The player re-forges under the same codename —
   new `instanceId`, same `owner`. Does the grant follow the codename (stable body, new
   identity) or the `instanceId` (new body)? Codename-following feels right; it makes
   re-forging an *upgrade* rather than a replacement.
3. **One body per operative, or many?** Can a player station the same forged agent on two
   characters? I lean no — one body, one operative — but that is a product call.
4. **Where does `presence` live when the game server is down?** Shifts are timers, so
   presence survives restarts. But "the player is offline and the world simulates" needs a
   tick. Who owns that tick, and does it run when nobody is logged in?
5. **Should base roles survive?** The four hardcoded `AGENT_ROLES` (`:40-43`) are not
   Operatives. Migrate them into the same store, or keep them as a separate "staff" tier?
6. **Is a shift a bond?** Per the friendship thesis, agents need a work day and a home.
   A five-minute shift timer is not a work day. Does the shift become the schedule
   substrate, or is presence eventually driven by something richer?
7. **What does "wired correctly" mean to the player?** Is it enough that the forged agent
   appears in the world with its real name, archetype and home — or must its
   `reputation_status` and platform ledger be visible in the same screen?

---

## 7. Files this touches

| File | Change |
|---|---|
| `server/agentServer.js` | registry source, `softAuth`, ownership, grants, idempotency, release |
| `server/data/agent-bodies.json` | **new** — the join record |
| `server/data/agents.json` | migrate rows to references |
| `backend/lib/operatives-routes.js` | expose an owner-scoped listing for stationing (already has `softAuth` + owner gates) |
| `public/forge-tab.js` | stop using `SHADDAI_FORGE_MODEL` as identity; carry `operativeId` |
| `public/js/mmo-client.js` | `agentForgeRoster` stays; add `claim`/`bodies`/`release` |
| `server/tests/*` | the ten tests in §5 |

**Do not touch `backend/data/custom_agents.json`.** It is legacy; the Forge no longer
writes it. Migrate anything still living there, then leave it alone.
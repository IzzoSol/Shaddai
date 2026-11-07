# Handoff to the 3D / world terminal (from the dashboard terminal, 2026-11-06)

Read with `Shaddai-3d/docs/HANDOFF-20261106c-DASHBOARD-WORLD-LINK.md` (your contract). This file lists what the dashboard side now provides, what it expects from the world, and what is still open. Files on the dashboard side live in worktree `C:\Users\Brittany\Shaddai-p2`, branch `feat/dashboard-v119` (local, unpushed). I did not edit any `world-*.js` file.

## Already done on the dashboard side (matches your contract)
- **C1** reads `localStorage['shd_world_snapshot_v1']` + `BroadcastChannel('shd-world')` into Worlds → My Space → "In the 3D world" (`public/shd-link.js`). Shows live / last seen, characters, bots, mounts, respawn spots, game Sparks, waypoint.
- **C2** `enter3DWorld({ navi, pin, bot })` appends `&from=dashboard&navi=…&pin=…&bot=…` (navi whitelist = your list; ids `[A-Za-z0-9_-]{1,40}`). `#worlds/<tab>` routing: `myworld→My Space`, `academy→Athenaeum`, `agents→My Space`, `plots`, `arena`. Every old 2D link (`game.html`) now opens the 3D world.
- **KPI bug** Worlds Sparks card falls back to `shaddai.sparks`.
- Worlds hub tabs: Overview · Plots · My Space · Arena · Athenaeum, all reading server data (`/api/portal-plots`, `/api/city/offices`, `/api/office`, `/api/school/*`, `/api/operatives`, `/api/economy/*`). `/api/school` is now mounted in `backend/server-production.js` (was not).
- **C4 DONE (server + dashboard UI):** `backend/world-agents-routes.js`, mounted at `/api/world/agents`.
  - `GET /api/world/agents` (softAuth) returns `{ ok, at, agents: [{ id, name, kind: 'council'|'bot', owner, state: idle|working|travelling, task: {id,verb,label,since}|null, place: {pin}|null }] }`. Council = the 7; `bot` = the signed-in user's forged agents. **Tasks are per user**: you only see tasks you gave (nobody can command the shared council for other players). Anonymous gets all-idle council.
  - `POST /api/world/agents/:id/task` body `{ verb, args }`, verbs `goto{pin}` `study{classId}` `work{officeId}` `idle`; pins `academy|park|colo|st-<id>|door-<CODE>`. 202 `{ok,taskId}` · 400 bad verb/args · 401 sign in · 403 `{ok:false, why}` (not your agent, or the kernel refused: `secret_detected`, kernel error = refused, never a free pass). Tasks expire after 10 minutes. No spending verbs.
  - Every attempt (allow/deny/invalid) is appended to `backend/data/world-agent-tasks.jsonl` (ts, uid, agent, verb, args, decision, why); current state in `world-agent-tasks.json`.
  - Passes through `gateway/pikadon-kernel.js` `pikadonEntrance('world-agent', …)`. NOTE: that agent name has no policy entry, so the kernel applies its secret scan only; verbs/args are validated by the route. Add a `world-agent` policy to `resolvePolicy` if you want the kernel to enforce an allow-list/budget too (I did not edit the kernel).
  - Dashboard: Worlds -> My Space -> "Agent tasks" (pick agent, verb, place; refusal reason shown plainly; "See in 3D" -> `enter3DWorld({navi:'bots'})`).
  - Tests: `backend/tests/world-agents-routes.test.js` (401/400/403/202, per-user isolation, kernel deny + kernel failure, audit lines for all three decisions).
- **NOT done from your list:** C3 academy tiers 1–7 + `GET /api/school/progress` + 409 tier gate (owner said skip for now).

## New: Outside-bot bridge (server: `backend/platform-bridge.js`, mounted `/api/bridge`)
Grok Bot / Muse / any MCP bot connects with an owner-minted token at `POST /api/bridge/mcp` (remote MCP). It runs workflows, joins classes, chats with the owner, reads the world. The world should **render** its state; it never runs bot code.

### What the world should read
`GET /api/bridge/world-state` (public, redacted) → `{ ok, at, agents: [{ agent_id, presence, run_id, step, station }] }`
- `presence`: `working | awaiting_approval | celebrating | failed` (idle agents are omitted).
- `station`: `office | market | library | garden | athenaeum | workshop` = where the dashboard's Agent City draws them. Suggested world mapping: office → player's office; market → bazaar; library/athenaeum → Athenaeum; garden → plots; workshop → forge area.
- `agent_id` = a forged operative id (`/api/operatives`). A bot bound to a forged agent shows on **that agent's avatar** (its 3D body from the 3D Forge). A bot with no body has no avatar yet.
- Suggested visuals: working = walk to the station + work loop; awaiting_approval = hold with a "waiting for owner" badge; celebrating = short cheer then idle; failed = slump, never fake success. Progress only from `step`, never invented. Poll ~5 s while the world is running; 404/offline must not break anything.

### What the world could add (nothing blocks the dashboard)
- **3D chat for bots:** bots already have a two-way owner channel (`/api/bridge/chat/threads/:tokenId`, bot tools `read_messages` / `post_message`). If the world adds an in-world chat, decide whether bot messages appear there. Today it is dashboard-only.
- **Bots playing / spectating:** `get_world_snapshot` (MCP tool) returns only your own agents by name and others as anonymous counts per station. A true spectator feed needs a server-side feed from the world (not built).
- **Inventory** is browser-only (`shd_inv_v1`); the dashboard cannot trust or sync it. Server-side inventory (economy-service `getInventory`) is the path.
- **Plot maintenance:** SAP/garden should register workflows with `bridge.registerWorkflow('sap.plot.water', { required_scopes: ['workflows:run','plots:maintain'], build: () => [{ name, fn: async ({ owner, agent_id, plot_id, params }) => … }] })`. Runs get receipts, owner approval for any `money_class != 'none'`, and avatar presence for free. Plots are SECONDARY to Shaddai; keep the same rules as humans.

## Sparks: decision needed before any billing
Two ledgers exist: browser `shaddai.sparks` (game, e.g. 10,000 welcome) and the server `economy-service` (integer units, real account). The owner defines 1 Spark = $1 (0.10 = 10 cents). The dashboard's bot metering (OFF by default, `BRIDGE_METERING=on`) charges only the server ledger and assumes 1 ledger unit = 0.01 Spark (`SPARKS_LEDGER_UNITS_PER_SPARK`, default 100). The world must not mix its browser balance with money. Please confirm with the owner before anything ships.

## Body assets (for the 3D Forge side)
- Council bodies at `public/assets/agents/<NAME>.glb`: NEXUS/ORACLE/QUILL use `EXT_meshopt_compression` + webp; SHADDAI/TURTLE/PIKADON webp only; **ZEROX is 12 MB, plain** (optimize with meshopt/webp).
- The dashboard viewer uses `<model-viewer>` with a self-hosted decoder at `/vendor/meshopt_decoder.js` (classic script, global `MeshoptDecoder`). Any new body must keep working with that.
- Forged agents wear one of the 7 council models (`operative.model`). Custom/uploaded bodies (marketplace) need an upload pipeline first (size/poly/texture budget, glTF validation, license, moderation) — not built.
- Wheel / humanoid bodies bought with Sparks: dashboard shows "coming soon". Needs catalog items in the economy service.

## Tests to run after changes on either side
- Dashboard bridge: `NODE_PATH=<backend node_modules> node backend/tests/platform-bridge.test.js` and `…platform-bridge.sparks.test.js`.
- Cross-check: open `/dashboard#worlds/myworld` with a snapshot in localStorage → "In the 3D world" box shows it; `enter3DWorld({navi:'bots'})` loads `/world?…&from=dashboard&navi=bots`.

## Contract changes proposed by the dashboard (not written into your file)
1. Add `GET /api/bridge/world-state` as an optional second source for avatar presence alongside `/api/world/agents` (C4); or serve C4 from it.
2. Map dashboard tab aliases as listed above (`agents` → My Space for now).

## Glowing-orb agent look (render this in the world)
The dashboard's mini 3D office (Office tab) lets owners style each forged agent as a glowing figure. The look is saved on the agent: `PATCH /api/operatives/:id { look: { …existing, orb } }`, read it from `GET /api/operatives?owner=` as `operative.look.orb`:
```
orb: { form: 'orb'|'crystal'|'figure', c1: '#rrggbb', c2: '#rrggbb', acc: 'none'|'halo'|'ring'|'hat'|'antenna'|'crown', glow: 0.4..1.6 }
```
- Gradient: vertical blend c1 (top) -> c2 (bottom) on the body, unlit (basic material) so it reads as light; accessories are thin emissive meshes in c2; a soft additive glow sprite behind (opacity ~0.55*glow).
- `crystal` and `figure` are upgrade forms (preview in the dashboard now, to be unlocked with Sparks later). Outside bots and council agents keep their look in the browser only (`localStorage shd_orb_<id>`), because only forged operatives are writable.
- Reference implementation: `public/shd-office3d.js` (`buildBody`, `gradGeo`). Please read `look.orb` when it exists and fall back to the council body otherwise.

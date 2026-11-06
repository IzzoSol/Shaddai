# HANDOFF — Dashboard side of the World ↔ Dashboard link (2026-11-06)

Open a Claude Code terminal and say: **"read docs/HANDOFF-20261106c-DASHBOARD-WORLD-LINK.md and do the dashboard side"**.

The owner wants the 3D world and the **real dashboard** (`/dashboard` on the MAIN Render deploy → `public/index.html`) connected in
four ways: **jump between them · my stuff on the dashboard · academy progress · agents act in the world**. It all lives in the
dashboard's **🌐 Worlds** view (`#worldsView`, tabs via `switchWorldsTab(tab)`, ~line 29872 of `public/index.html`).

Two terminals, split by files so they never collide:

| Side | Owner | Files |
|---|---|---|
| **World** | the world terminal (already working) | `public/world-*.js`, `public/SHADDAI-WORLD-3D.html`, `tools/tests/world-*.test.cjs` |
| **Dashboard + server** | **you** | `public/index.html`, `backend/**` (routes, tests), `docs/` notes for your part |

**Do not edit the world files and the world terminal will not edit yours.** The contract below is the only shared surface. If you need
to change it, write the change at the bottom of this file under "Contract changes" and tell the owner, so the world side matches.

## Git (read first)
- Deploy target = main repo `IzzoSol/Shaddai` → https://shaddai-g81x.onrender.com/ (Render auto-deploys `main`). **Never push `main` without the owner.**
- `C:\Users\Brittany\Shaddai-3d` is shared by several sessions (it sits on `feat/sap-treasury`). **Do not check out or switch branches there.**
  Make your own worktree:
  ```
  cd C:\Users\Brittany\Shaddai-3d
  git worktree add ..\Shaddai-dash -b feat/dashboard-world-link polish/world-finish-p2
  cd ..\Shaddai-dash
  ```
  `public/index.html` is byte-identical on `origin/main` and `polish/world-finish-p2` (checked 2026-11-06), so this merges cleanly.
- Repo rules (CLAUDE.md): server is authoritative for economy/items/ownership; agents act **only** through `gateway/pikadon-kernel.js`;
  no keys in client code; every agent write permission-checked, schema-validated, audit-logged; bump `?v=` on edited script tags;
  money / wagering / token / transfer = stop and flag for human legal review.

## What already exists (verified 2026-11-06)
- Same origin → **localStorage is shared** between `/dashboard` and `/SHADDAI-WORLD-3D.html`.
- Login: `shd_signed_in` (`'1'`), session token `shd_token` (Bearer), player id `shd_uid` / `shd_player_code`.
- **Sparks ledger** = `public/sparks-ledger.js` → `window.ShdSparks` (`get()`, `add(n, src, memo)`, `spend(n, kind, id)`), key
  **`shaddai.sparks`** (mirror `shd_sparks`, log `shaddai.sparklog`).
  **BUG to fix:** `_whLoadKpis()` in `index.html` reads `JSON.parse(localStorage['shaddai.econ']).sparks`. The world never writes that
  key, so the Worlds KPI shows the wrong Sparks. Load `/sparks-ledger.js` on the dashboard and read `ShdSparks.get()` (fallback `shaddai.sparks`).
- Dashboard → world today: `window.enter3DWorld()` (~line 4483, sign-in gated, then `_playWorldPortal()`).
- Server: `/api/home-deeds` (`/mine`, `/buy`), `/api/school/*` (`backend/academy-school-routes.js`: `classes`, `classes/:id/join`,
  `enroll`, `exams/begin`, `skills`…), `/api/office*`, `/api/city/offices`, `gateway/pikadon-kernel.js` (policy, budget, skill allow-list, job log).

## THE CONTRACT

### C1. World snapshot (world writes, dashboard reads)
The world writes **`localStorage['shd_world_snapshot_v1']`** every ~5 s while running, on every change it knows about, and when the tab hides.
It also posts the same object on **`BroadcastChannel('shd-world')`** as `{ type: 'snapshot', snap }`, so an open dashboard tab updates live.
```js
{
  v: 1, at: 1762440000000,                 // ms epoch; treat at older than 10 min as "last seen", not live
  live: true,                              // false once the world tab closed / hid
  player: { character: 'NEXUS', name: 'Izzo', pos: { x: 12, z: 88 }, place: 'Shaddai City' },
  sparks: 10000,                           // same number as ShdSparks.get(); the ledger is still the source of truth
  activeBot: 'scrap',                      // or null
  bots:   [{ id, name, kind: 'humanoid'|'wheeled', state: 'active'|'stowed'|'destroyed'|'locked', hp, skills: [] }],
  mounts: [{ id, name, hp, flying }],
  spots:  [{ id, name, kind: 'home'|'plot'|'office'|'realm-bed'|'custom'|'bazaar', active: true|false }],
  operatives: [{ code, name, portrait, owned, equipped }],   // characters (portrait = /assets/agents/<A>-portrait.png etc.)
  waypoint: { label, kind } | null
}
```
Read it with `try { JSON.parse(localStorage.getItem('shd_world_snapshot_v1')) } catch {}`. If missing: "Enter the 3D world once to see your stuff here."
Homes/deeds are **server** data: read `GET /api/home-deeds/mine` (Bearer `shd_token`) yourself; the snapshot does not duplicate it.

### C2. Deep links
**Dashboard → world:** `/SHADDAI-WORLD-3D.html?from=dashboard` plus any of:
| param | world does (after the world is playable) |
|---|---|
| `navi=<module>` | opens the Navi on that module: `map, modes, jobs, inv, market, plots, wallet, sparks, bots, academy, chat, markets, news, radio, settings` |
| `pin=<pinId>` | sets a waypoint to that Navi map pin (`academy`, `park`, `colo`, `st-<stationId>`, `door-<CODE>`) |
| `bot=<botId>` | calls that owned bot to the player (if allowed in the zone) |
Keep the existing sign-in gate (`enter3DWorld`). Add a helper, e.g. `enter3DWorld({ navi: 'bots' })`, that appends the params.

**World → dashboard:** the world opens **`/dashboard#worlds/<tab>`** (new tab). **You must handle the hash:** on load and on
`hashchange`, `#worlds/<tab>` → `showView('worlds'); switchWorldsTab('<tab>')`. Tabs the world links to: `myworld`, `academy`, `agents`.

### C3. Academy tiers (you build the server part, the world reads it)
Tiers (owner ref "The AI Universe"): 1 Artificial Intelligence · 2 Machine Learning · 3 Deep Learning · 4 Neural Networks ·
5 Generative AI · 6 AI Agents · 7 Agentic AI.
- `GET /api/school/classes` → each class gets **`tier` (1–7)**; response adds **`tiers: [{ n: 1, name: 'Artificial Intelligence' }, …]`**.
- **New** `GET /api/school/progress` (auth; `?agentId=` optional) → `{ ok: true, agents: [{ agentId, name, passed: [1, 2], current: 3 }] }`.
- Gate: `POST /api/school/enroll` (and `classes/:id/join`) for a class of tier N when tier N-1 is not passed → **409**
  `{ ok: false, why: 'tier', need: N - 1 }`. Server-side check only; never trust the client.
- Tests: extend `backend/academy-school-fixes.test.js` (tier field, progress shape, 409 gate, tier 1 always open).
- Dashboard: Worlds → **Academy** tab = concentric rings per agent (7 rings, filled = passed, current = pulsing), from `/api/school/progress`.
The world's Navi ACADEMY module will show the same rings from the same endpoint (falls back to "progress offline" if it 404s).

### C4. Agents act in the world (you build server + dashboard UI, the world renders)
Server is authoritative; the world **only renders** (v1 world never posts tasks).
- **New** `GET /api/world/agents` (softAuth) →
  ```js
  { ok: true, at, agents: [{ id: 'NEXUS', name: 'NEXUS', kind: 'council'|'bot', owner: '<uid>'|null,
      state: 'idle'|'working'|'travelling'|'offline',
      task: { id, verb: 'goto'|'work'|'study'|'idle', label: 'Studying tier 3 at the Athenaeum', since } | null,
      place: { pin: 'academy' } | { x, z } | null }] }
  ```
- **New** `POST /api/world/agents/:id/task` (auth) body `{ verb, args }` → runs through **`gateway/pikadon-kernel.js`**
  (resolvePolicy → skill allow-list → budget) → `202 { ok: true, taskId }` or `403 { ok: false, why }`. Audit-log every attempt
  (allowed or denied) with uid, agent, verb, args, decision. Schema-validate `verb` ∈ {goto, work, study, idle} and `args`
  (`goto: { pin }` must be a known pin id; `study: { classId }`; `work: { officeId }`). No spending verbs in v1.
  Storage: JSON/JSONL file store like the other routes (`backend/data/world-agent-tasks.jsonl` + current-state JSON).
- The world polls `GET /api/world/agents` every 10 s while running (and on Navi AGENTS open). For `council` agents it shows the
  task label + a "where" waypoint in the Navi; agents with a `place` get a marker in the world. Offline/404 → nothing breaks.
- Dashboard: Worlds → **Agents** tab: list from `GET /api/world/agents`, give a task (dropdown of verbs + pin/class picker),
  show the 403 reason plainly, and a "See in 3D" button → `enter3DWorld({ navi: 'bots' })`.
- Tests: route tests for 202/403/400 (bad verb, unknown pin), audit line written for both allow and deny, unauthenticated = 401.

### C5. Moving between them
- Dashboard: Worlds → **My World** tab (`data-wtab="myworld"`, button `data-wbtn="myworld"`): snapshot (C1) + `/api/home-deeds/mine`,
  sections Characters (portraits) · Bots · Mounts · Homes & plots · Respawn spots · Sparks. Each section has an "Open in 3D" button
  (`enter3DWorld({ navi: 'bots' | 'inv' | 'plots' })`). Live update on the `shd-world` BroadcastChannel.
- World: the Navi gets a **DASHBOARD** link (opens `/dashboard#worlds/myworld`) — world terminal does this.

## Your order
1. Worktree + branch (above). 2. Sparks KPI bug (C-exists). 3. Hash routing + `enter3DWorld({...})` params (C2). 4. My World tab (C5/C1).
5. Academy tiers server + tests + Academy tab (C3). 6. World agents server + gateway + audit + tests + Agents tab (C4).
Run the backend tests you touched + `node tools/build-dist.cjs` then `--check`. Commit on `feat/dashboard-world-link` only; owner approves any merge.
End with the repo's report: summary · files · commands · before/after · tests · risks · open questions.

## Machine limits
8 GB laptop: one heavy job at a time, headless browser only, check free RAM (~1.2 GB needed for a world boot). The world terminal may be
running headless tests too, so ask the owner before booting the world.

## Contract changes
_(none yet)_

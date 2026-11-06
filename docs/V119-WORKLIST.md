# SHADDAI V119 — everything that's done, decided, and left

Branch `feat/dashboard-v119` (based on `polish/world-finish-p2`). Local commits only, not pushed.
Preview: serve `public/` and open `/index.html`. Restore the old navigation any time:
`localStorage.shd_legacy_nav = '1'` then reload.

---

## 1. Done and verified (headless Chrome against the real dashboard)

| Area | What changed | Proof |
|---|---|---|
| Sign-in | Same Firebase gate, live 3D-grid scene, parallax tilt | gate has scene canvas; no 2nd login |
| Onboarding | ONE wizard, only after sign-in/guest. Legacy "Power Up" + 4-step overlay no longer auto-open | 0 legacy overlays visible; one `#shdWiz` |
| Look | Holo skin + hue variants beside Classic skins; survives reload; fixed loader that reset dusk/solar/parchment to glitch | skin persists after reload |
| Agent art | `assets/agents/wizard/NAME.jpg` (+`SHADDAI.svg`) swaps in everywhere a portrait shows | 15 imgs swapped on page, 7 in wizard |
| Settings | 24 sections grouped: Look / Plan & Usage / AI & APIs / Data & Audit / General | pane counts 4/4/8/3/5 |
| Forge | 3D Forge tab = `forge-demo.html` (cutscene wizard); opens on it; orphaned CSS no longer prints as text | iframe has THREE + canvas |
| Library | Office rooms were display:flex ROWS and the Knowledge Base was crushed; they stack now | child widths all = container |
| Icons | 223 lightning emoji → SVG line icon (also UI rendered later) | 0 emoji left, 88 svg |
| Dock | SHADDAI + SHOP in one row; "?" button and floating theme button removed | rects don't overlap |
| Nav | One door per destination. Sidebar 21 → 16. City/Rooms/Economy are Worlds tabs; Sentiment lives in Markets | sidebar list |
| TuFish | Sentiment + Swarm merged into ONE tabbed platform | `#shdFishBar`, old card hidden |
| Embedded pages | `home-btn.js` / `nav.js` no longer draw Home/Dashboard pills inside iframes (47 pages) | none inside tufish iframe |
| Worlds | 2D World card removed; 3D Realm is the full-width hero; every "enter" → `enter3DWorld()` | hero 996/996px |
| Security | `grok-connect.js`: auth on every route, owner from session, read-only tool allowlist, 5 bots/account, owner-only chat, 4000-char cap | 8/8 attack checks |
| Keys | Provider keys go to server vault only; wizard keeps no localStorage copy | code review |

## 2. Decisions needed from you (these block work packages)

1. **2D world direction** — see §3. Recommendation: make it the **Plots/Rooms map** (a console), not a game.
2. **Push target.** Which remote branch? `shaddai-g81x.onrender.com` looks suspended (commit `904d5b8f` says the live
   backend moved to "r383"). Another session is also committing on `polish/world-finish-p2`.
3. **Obsidian vault.** Only `C:\Users\Brittany\Obsidian Vaults\ASIMOV` was found. Which vault is the SHADDAI one?
4. **Access codes.** The `4444` gates (Worlds, Pro Signals, Swarm) print the code on screen and are checked in the
   browser. Approve moving them server-side (WP3)?

## 3. The 2D world — what it actually is

Facts (counted in the code):
- `game.html` (293 KB) is the 2D game. The dashboard references it **25×**.
- The dashboard's **City / Rooms / Economy / Plots** numbers come from the 2D game's *browser* state:
  `shaddai.city` (14 refs in the dashboard), `shaddai.rooms` (6), `shaddai.econ` (5), `shaddai.player` (3).
  Deleting 2D would leave those tabs empty.
- The **3D world reads none of that** (0 refs). Only `world3d-bridge.js` touches `shaddai.econ`. So 2D and 3D cannot
  mirror each other today — they keep separate ledgers.
- The **server already has the real ledger**: `economy-service`, `district-routes`, `portal-plots`, `agent-room-routes`.
- `pixel-office.js` (114 KB) powers the Office → Command "Pixel Office"; `pixel-forge.html` writes to `/api/operatives`.
- Master plan §4.5: Plots do not exist as a product yet; payouts that share fees need owner sign-off + PIKADON review.

Options:
| | Idea | Verdict |
|---|---|---|
| A | Keep 2D as a second game | Rejected — a parallel game to maintain next to 3D |
| **B** | **2D becomes the "Agent City" map: the console for Plots, Rooms, Economy. 3D is where you walk. Both read ONE server ledger.** | **Recommended** |
| C | 2D becomes $ASIMOV | Fold into B: an **ASIMOV district** on the map (holder cosmetics via read-only balance check) |
| D | Park it | Safe, but strands City/Rooms/Economy |

Why B works: land and rooms are naturally a map UI; it "mirrors" 3D by sharing *state*, which is feasible, instead of
sharing gameplay, which isn't. It also satisfies the plan's alignment rule (any feature touches 2 of dashboard/2D/3D).

## 4. Work packages (in order)

**WP1 — Ship what's done**
- Decide push target (§2.2); confirm which Render service is live; open a PR from `feat/dashboard-v119`.
- Obsidian note (§2.3). Free disk space (C: has ~1 GB; a full checkout already failed once).
- Rotate the OpenRouter key that was hardcoded in v58.88 and older copies.

**WP2 — Finish the chrome (quick, no decision needed)**
- Pro Signals card repeats its terminal's own header → hide the outer one once the terminal is open.
- Brand: the swarm app says MIROFISH inside a card titled TUFISH → rename inside `mirofish-terminal.html`.
- `getAgentConsensusVote` calls `.map` on missing data when the backend is down (TuFish sentiment scan) → guard.
- Mobile pass on Markets, Library, Settings rail, Worlds hero.
- Retire dead code: first `renderWorlds` in the v119 prototype; `public/forge.html` 2D forge file (kept, hidden).

**WP3 — Real gates (needs §2.4)**
- Server verifies the PIN from an env var, sets an httpOnly cookie; `/signals.html`, `/mirofish-terminal.html`, world
  APIs check it. Remove "ACCESS CODE 4444" text. Keep a client prompt only as UX.

**WP4 — Worlds & Plots → one world (needs §2.1)**
1. One ledger: City / Rooms / Economy / Plots tabs read the server (`economy-service`, `portal-plots`, `agent-room`),
   not `localStorage`. Migrate existing local state once.
2. Plots tab = map of the 3D world (district grid), claim/boost via server; show "pays zero if pool empty" per plan.
3. 3D reads the same ledger (extend `world3d-bridge.js`); a plot claimed on the map appears in 3D.
4. ASIMOV district: holder cosmetics by read-only balance check; no claims about NVIDIA backing; PIKADON review first.
5. Retire "Enter 2D World" for good; `game.html` stays only as the map's renderer or is archived.

**WP5 — Forge**
- Dashboard Forge ↔ `/api/operatives` ↔ 3D world: confirm an agent forged in the wizard appears in 3D and in the
  dashboard Agents list (the `shd:operative-created` message is sent; the dashboard currently only shows a toast).
- Basic body template now; custom bodies later (Blender cutscene work if the demo needs changes).
- Optimise `ZEROX.glb` (12 MB, only council body without meshopt/webp).

**WP6 — Connectors page** (calendar, Drive, Gmail, Telegram, GitHub, Phantom): server-side tokens, read-only scopes
first, audit-log entry per connection.

**WP7 — Grok / MCP surface**
- Router hardened (done). Next: review `agent-mcp-routes.js` (`/invoke`, `/batch`) for the same four problems
  (auth, owner scoping, tool allowlist, rate/size limits).

**WP8 — Performance**
- `index.html` is 3.8 MB. Lazy-load Markets/Media/Worlds panels and the three iframes; measure before/after.

## 5. Known leftovers / notes
- The standalone `C:\Users\Brittany\SHADDAI v119.html` is an abandoned prototype — delete or ignore.
- `Shaddai-Beta` was not touched.
- Wizard portraits: the Cinnamoroll image (`1Go8lHWg_400x400.jpg`) only exists as shortcuts; send the real file to use it.

## 6. Outside-bot bridge (Grok Bot / Muse) - Phase 1 built (handoff section 4)
- backend/platform-bridge.js mounted at /api/bridge: owner-minted scoped tokens (hash only stored), remote MCP at POST /api/bridge/mcp (initialize, tools/list, tools/call), runs with receipts, idempotency, owner-only approval, cancel, revoke, audit, world-state presence for the 3D client.
- Tools: list_workflows, start_workflow (demo.ping, demo.needs-approval only), get_run_status, cancel_run, read_agent_state, list_plots, get_plot_state. All read-only or harmless demos. No money, trading or credentials.
- Test: NODE_PATH=<node_modules> node backend/tests/platform-bridge.test.js (acceptance items 1-3, 5-8 and secret rejection pass).
- Not built yet: OAuth 2.1 + PKCE (AddMcpServer consent), durable DB store (JSON file now), 3D client subscription to /api/bridge/world-state, real workflows, plots:maintain (waits for ASIMOV garden state + thresholds), hosted URL decision.
- /api/school (Athenaeum) mounted; its /xagent bot surface is still off.

# HANDOFF — Dashboard + backend wiring for the world finish pass (2026-10-23)

The 3D world side of each item below is built and verified on the client. What is left is **wiring to the backend / dashboard**.
Rules that still apply: never push main/beta without the owner; money, wagering, ownership transfer and token work need human legal review;
agents act only through server tools (`gateway/pikadon-kernel.js`); the server is authoritative for economy, ownership and items.

## 1. Agent Academy — 7-tier curriculum (owner ref: "The AI Universe")
- **Client today:** `public/world-academy-client.js` renders station panels from `/api/school` (`backend/academy-school-routes.js`, bots at `/api/school/xagent/*`). Classes are filtered by `room`.
- **Wire:** add a `tier` field (1–7) to class records and a `tiers` list to the `/api/school` payload:
  1 Artificial Intelligence · 2 Machine Learning · 3 Deep Learning · 4 Neural Networks · 5 Generative AI · 6 AI Agents · 7 Agentic AI.
  Progression: an agent must pass tier N before enrolling in N+1 (server-side check in the enroll/learn route; return 409 + reason).
- **Dashboard:** the same tiers as a concentric-ring progress view per agent (rings = tiers, filled = passed).
- **Tests:** extend `backend/academy-school-fixes.test.js` (tier gate) and `tools/tests/world-academy-client.test.cjs` (tier badge in panel).

## 2. TURTLE studio — Listening Room (`public/world-listening-room.js`)
- **Built:** circular jam UI, 7 synthesized parts, per-listener mix (localStorage `shd_listening_mix_v1`), 432/440 Hz, note colours, cymatics, sacred geometry (`shd_listening_fx_v1`). Opened in the museum at the listening ring (L). Test page: `public/__listening-room.html`.
- **Wire:**
  - Shared session state (lanes, tempo, chord loop) through the multiplayer relay (same pattern as `world-navi-chat.js` `/api/mp`): one room id per studio; lanes = participants. The **mix stays per-listener and local** (that is the design).
  - "Add" for agents: call the agent's music tool through the gateway (FL Studio repo tools later) and drop its stem/pattern in as a lane.
  - Save/export a session: server endpoint storing lanes + pattern JSON; export is a download (no auto-publishing).
- **Dashboard:** list of studio sessions, collaborators, replay.

## 3. City property — plots and pre-built properties
- **Built:** `tools/city-fill-plots.cjs` layer on `public/assets/world/grid-fabric-districts-v1.json` (tag `fill-20261023`; `--undo`). 80 ring plots carry pre-built themed properties (fabric items with `plot: <id>`), 79 stay open claimable pads (`world-city-layout.js`, `window.__cityPlots`). +28 Athenaeum district buildings. Re-run after `tools/city-polar.cjs`.
- **Wire:** one ownership model for both: a plot record `{id, owner, buildingKey|null, use: office|living|shop|...}` in the existing deeds service (`backend/home-deed-routes.js` pattern). Pre-built = plot with `buildingKey` set. Interior use (office/living) switches the interiors-v3 recipe for that building.
- **LEGAL GATE:** any sale/transfer with real money or tokens → human legal review before building (CLAUDE.md).
- **Dashboard:** "My properties" (claimed plots, use, interior recipe), map with plot states.

## 4. Realm gear (hazards)
- **Built (client):** `world-realm-hazards.js` (desert-sun zone, void needs gas mask), `world-realm-zones.js`, `world-gadgets.js` (Void Respirator / Desert Wrap / Frost Kit, Sparks), `world-gear-wear.js` (visible on body in the matching realm). Tests: realm-hazards 7, gadgets 8, realm-zones 7, gear-wear 6.
- **Wire:** purchases are currently client Sparks + localStorage perks. Move ownership to the server inventory (server-authoritative items), keep the client perk read as a cache.
- **Art:** gear meshes are placeholder primitives → K30 Blender gear kit fitted per head size (tracked in MASTER-TRACKER).

## 5. Interiors + tools inside buildings
- **Built:** walk-in interiors for every realm building + landmark (`world-realm-interiors.js`, 93 registered, 0 failed), council rooms upgraded (ORACLE observatory, QUILL library + floating bookcases, TURTLE museum + Genesis + listening ring).
- **Wire:** in-room stations call tools through the gateway; **out-of-game export** of anything produced in a room (art, text, music) is security-gated: PIKADON review step + audit log before a file leaves the platform.

## 6. NAVI
- **Built:** holo-arc swivel (`world-navi.js` v=20261023a), 12 modules, real PayBox hooks (nothing faked).
- **Wire:** `NaviHooks` already exposes `onEquipMount`, `sendChat`, `bindGrokBot`, `onEnrollBot`, `onSendHome` — map each to its server route; Academy module should show the tier ring from §1.

## 7. External bots (Grok etc.)
- Join through the provider-agnostic ingress (gateway webhook entry, provider = free text). In world they appear as **bots** (`world-bot-bodies.js`, humanoid or wheeled), never as council agents (owner rule). `NaviHooks.bindGrokBot` is the client entry point.

## Verify commands
- `node tools/_world-status.cjs` — one boot: errors, agents, bots, dragons, interiors, academy, colosseum (+ screenshots in `C:/Users/Brittany/eye`).
- `node tools/_ui-probe.cjs` — intro timing, HUD, NAVI, FPS sample.
- `node tools/_realm-preview-shot.cjs <realm…>` — realm towns without booting the world.

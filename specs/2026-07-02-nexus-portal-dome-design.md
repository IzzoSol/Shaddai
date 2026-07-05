# SHADDAI — NEXUS Portal-Dome & Games Ecosystem — Design Spec (2026-07-02)

**Owner terminal:** the 3D-world terminal. **Files touched:** `public/portals/*`, `public/world-*.js`, `public/SHADDAI-WORLD-3D.html`, new `backend/lib/*-routes.js`, `backend/data/*.json`. **Do NOT touch** `public/index.html` (other terminal's dashboard).

---

## 1. Vision (from the owner)

A **huge, immersive multi-level DOME behind the NEXUS building** that houses all the world's game-portals, organized and browsable. **NEXUS center is the entrance** (gateable later). Inside the dome you can **browse/apply for a portal, chat, view game leaderboards, and spectate** live games. The **best / community-voted games graduate to the SHADDAI COLOSSEUM** for tournaments with **prize pots**, funded partly by platform revenue, with **revenue-share for subscribers**.

Games are either (a) linked external portal games/sites, (b) popular portal games, or (c) in-world games people create — including SHADDAI sports: **basketball, soccer, football, shooting, escape room, swim, bowling.**

## 2. Goals & non-goals

**Goals**
- One organized, extensible home for portals — editable **1-by-1** (already started: `public/portals/portals-registry.js`).
- Easy for Claude/admin to **drop in a doc/file/link and have it auto-connect** to a portal.
- A dome you physically walk through (levels, portal slots), enter from NEXUS.
- Chat (realm + per-room), leaderboards, spectating.
- Colosseum tournaments + a clear, honest **economy/prize/revenue-share model**.

**Non-goals (this phase)**
- No real-money custody, no gambling backend, no on-chain trading. Solana wallet = **identity + optional entry payment via non-custodial flow**, wired later and clearly gated.
- No building 8 full sports games at once — the *framework* first; games plug in.

## 3. Architecture overview

```
NEXUS building (entrance)  ──►  PORTAL DOME (behind NEXUS, multi-level)
        │                              │
   apply / chat / leaderboards    organized portal slots (1..N per level)
        │                              │
   backend: portals-registry ◄── admin/Claude auto-connect (doc/link/file)
        │
   featured / community-voted  ──►  SHADDAI COLOSSEUM (tournaments, prize pot)
        │
   ECONOMY: entry fees + platform-revenue pot + subscriber revenue-share
```

### Files / modules
| Piece | File | Notes |
|---|---|---|
| Portal registry (data) | `public/portals/portals-registry.js` (exists) | one entry per portal/plot; add `level`, `slot`, `game`, `doc`, `access` fields |
| Dome structure (3D) | NEW `public/portals/portal-dome.js` | builds the multi-level dome behind NEXUS + portal slot frames |
| Portal admin/connect | NEW `backend/lib/portal-admin-routes.js` | CRUD portals, attach doc/link/file, access control (who can edit) |
| Dome UI (browse/apply) | NEW `public/portals/portal-dome-ui.js` | in-world panel: browse portals, apply, attach content |
| Chat (realm + room) | NEW `backend/lib/chat-routes.js` + `public/world-chat.js` | WebSocket or polling; realm channel + per-building/room channel |
| Leaderboards | NEW `backend/lib/leaderboard-routes.js` + panel | per-game scores; feeds Colosseum voting |
| Colosseum (3D + logic) | NEW `public/world-colosseum.js` + `backend/lib/tournament-routes.js` | arena venue + bracket/prize logic |
| Economy/prize pot | `backend/lib/economy-*.js` (extend existing billing/credits) | pot funding sources + revenue-share ledger |
| Solana (optional, later) | NEW `public/portals/solana-connect.js` | wallet-standard connect; entry payment non-custodial |

## 4. The NEXUS Portal-Dome (core of this phase)

- **Location:** directly behind the NEXUS building (NEXUS is on the hexagon at radius 260; the dome sits further out, opposite world-center), large footprint so it reads as monumental. A lit path from NEXUS's rear door into the dome.
- **Structure:** a translucent geodesic/energy dome; inside, **2–3 tiered levels** (ring balconies) reachable by ramps/lifts. Each level has a ring of **organized portal slots** — numbered frames (arch + energy field, reuse the gateway style) that are either **filled** (a live portal to a game/site) or **empty** ("AVAILABLE — apply"). Clean, numbered, not scattered.
- **Entrance gating:** enter from NEXUS center (a door). `access` field per registry allows "open / members / owner-only" — gate visually (a barrier + "requires membership" note) but don't hard-lock in beta.
- **Portal slot data (registry):** each slot = `{ id, level, slot, name, kind:'game'|'site'|'plot', status:'live'|'available'|'pending', url?, doc?, game?, color, owner?, access }`. Editable 1-by-1 in `portals-registry.js` (and via the admin route).

## 5. Portal admin + "drop a doc and it auto-connects" (owner's key ask)

- `backend/lib/portal-admin-routes.js`:
  - `GET /api/portals` — list all portals/slots + status + who has access.
  - `POST /api/portals` / `PATCH /api/portals/:id` — create/edit a portal (name, kind, url, level/slot, access).
  - `POST /api/portals/:id/attach` — **attach a doc/file/link**; the server stores it (or a reference) and marks the portal `live`, auto-wiring it into the dome. This is the "Claude drops a file/info and it connects" path.
  - Access control: an `access`/`owners` list per portal + a simple admin token (reuse `ADMIN_TOKEN`) for privileged edits.
  - **Security:** every attached URL/doc goes through **PIKADON scan** (`pikadon-scan.js`, already built) before it goes live — SSRF/XSS/malware checks, quarantine suspicious ones.
- A minimal **admin panel** (in-dome UI or a `/portals-admin.html`) to do the above without editing code — "easily accessible for Claude."

## 6. In-dome features

- **Chat:** `world-chat.js` — a **realm channel** (everyone in the world) + a **room channel** (per building/dome level you're in). Backend `chat-routes.js` (polling first for simplicity/Render-safety; WebSocket upgrade later). PIKADON-scan messages. Rate-limited, sanitized (textContent render).
- **Leaderboards:** per-game score submission + top-N display. Feeds "community-voted / best games."
- **Spectate:** for in-world games, a "watch" mode that follows an active match (camera + score overlay). For external portal games, link out.

## 7. Games

- **Framework, not 8 games now.** A portal `kind:'game'` points to either an in-world game module (`public/games/*`) or an external URL. In-world sports (basketball/soccer/football/shooting/escape-room/swim/bowling) are **future plug-ins** each built as its own module behind a portal slot — start with **one simple flagship** (e.g. Shaddai Shooting or Bowling) to prove the pipeline: portal → game → score → leaderboard → Colosseum eligibility.
- Community-created games: an "apply for a portal" flow submits a game (URL or uploaded build) → PIKADON scan → pending → approved → live slot.

## 8. SHADDAI Colosseum (tournaments)

- A distinct arena venue (built after the dome). Community-voted / top-leaderboard games get featured.
- `tournament-routes.js`: brackets, entry list, schedule, results, prize-pot amount.
- **Entry:** optional entry fee (platform credits now; Solana later, non-custodial). Winner receives the **pot**.

## 9. Economy — prize pot + revenue-share (honest model)

- **Prize pot funding (configurable split):** a % of platform revenue streams — NFT/collectable sales, domain transactions, skill-pack sales, AURA token-saver subscriptions, room collectables — feeds a **tournament pot ledger** (`backend/data/pot-ledger.json`).
- **Subscriber revenue-share:** subscribers accrue a share of a defined revenue pool, tracked in a transparent ledger; payouts are **records/credits in beta** (no real money movement until a compliant payment rail is chosen). Position it as "creators/subscribers earn a share of platform activity."
- **Honesty rule:** show only real numbers; nothing fake. All money-movement is **records/intent in beta**; real payouts require a chosen compliant rail (Stripe/Solana) wired deliberately, gated, and reviewed by PIKADON.

## 10. Free / safe / Render constraints

- Keep it deployable on Render with **free/no-key services** where possible (chat/leaderboards = our backend + JSON; market data via free proxies). Any paid rail (real payouts) is opt-in and later.
- Solana: **wallet-standard connect** for identity + optional non-custodial entry payment — no private keys server-side, no custody.
- All user content (chat, portal links, docs, game submissions) is **PIKADON-scanned**.

## 11. Phased build plan (each phase = its own spec → plan → build)

1. **Phase 1 — The Dome (visual + organized slots).** `portal-dome.js` + extend `portals-registry.js` (levels/slots) + entrance from NEXUS. Portals show live/available. *(No gameplay yet.)*
2. **Phase 2 — Portal admin + auto-connect.** `portal-admin-routes.js` + admin UI + PIKADON-scan on attach. Drop a link/doc → portal goes live.
3. **Phase 3 — Chat + Leaderboards.** `world-chat.js` (realm + room) + leaderboard.
4. **Phase 4 — First flagship game + spectate.** One in-world game behind a slot, score → leaderboard.
5. **Phase 5 — Colosseum + tournaments.** Arena + bracket/prize-pot logic.
6. **Phase 6 — Economy + Solana + revenue-share.** Pot funding, subscriber ledger, non-custodial wallet, compliant payout rail (reviewed).

## 12. Acceptance (Phase 1, to start)

- A walkable multi-level dome behind NEXUS, entered from NEXUS center.
- Portals organized into numbered slots per level, each showing `live` (enterable) or `available` (apply).
- All slot data comes from `portals-registry.js` (editable 1-by-1); no hand-placed magic coords.
- Performant (instanced slot frames), no white blowout, FPS-governor friendly.

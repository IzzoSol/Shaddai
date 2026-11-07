# Cosmetics, bodies and the 3D realm: one-pass handoff

For the 3D terminal. Everything below describes what the **dashboard already does** (branch `feat/dashboard-v119`, now on `main`), so the 3D realm can match it. Anything marked **TODO (3D)** is work for the 3D side. Nothing here assumes the world loads in the dashboard preview (it does not; it needs the full server and assets).

## 1. One agent, two bodies

An agent made in the Forge is created **for the office first**, as a **glow bot**. Importing it to the 3D realm later gives it an **agent body**. Both live on the same operative record (`/api/operatives`).

| Field | Meaning |
|---|---|
| `look.bodyType` | `"glow"` = office only (set at creation). `"both"` = imported to the 3D realm. Absent on old agents (treat as having an agent body; they were forged with a council body). |
| `look.orb` | The glow body: `{ form: orb\|crystal\|figure, c1, c2, acc: none\|halo\|ring\|hat\|antenna\|crown, glow: 0.4–1.6 }`. Hex colours `#rrggbb`. |
| `look.world` | Present after import: `{ body: SHADDAI\|NEXUS\|ORACLE\|TURTLE\|QUILL\|PIKADON\|ZEROX, imported_at: ISO }`. |
| `model` | The council name. The server validates it against the 7 council bodies. The dashboard sets it to the chosen agent body on import (it first tries `PATCH {model, look}`; if the server rejects `model`, it saves `look.world` only). |
| `look.badges` | Up to 3 pinned achievement ids (pins are re-checked against what was really earned). |
| `tools` | Real workflow ids (`research.topic`, `news.digest`, `market.snapshot`, `dashboard.report`, `lib.*`). |

**TODO (3D):** render the world body from `look.world.body` when present, otherwise `model`. **Do not** draw a glow bot as a walking character unless `look.bodyType === "glow"` agents are meant to appear in the world at all (decision for the owner: today they stay in the office until imported).

## 2. Entitlements and what is "owned"

- Ownership is **server truth** (`/api/economy/inventory?userId=`). The dashboard never infers ownership from local UI state.
- Three states must stay distinct in every client: **owned**, **equipped**, **preview-only**. The dashboard shop currently sells through `POST /api/economy/catalog/purchase {userId,itemId,idempotencyKey}`; a premium item answers `{requiresStripe:true}`.
- Catalog item shape used by the dashboard: `{ id, name, kind, category, rarity: common|rare|epic|legendary, sparks_price, usd_price_cents, description }`. The showcase groups shelves by keywords in `category/kind/name` (cosmetics, bazaar). **TODO:** add an explicit `shelf` field (`sparks|cosmetics|bazaar`) and a `world_ready` flag so the shelves stop depending on keywords.
- Glow-bot forms beyond `orb` (`crystal`, `figure`) and some accessories are labelled "upgrade forms" in the UI but are **not yet gated**. Gate them with entitlements before Sparks pricing goes live.

## 3. Ids that must match across world, office, Colosseum and Forge

| Thing | Id source |
|---|---|
| Glow forms / accessories | the enums in `look.orb` above (single list in `public/shd-glow.js`: `FORMS`, `ACCS`, `GRADS`) |
| Agent bodies | the 7 council names |
| Skills / workflows | bridge workflow ids (`/api/bridge/workflows`, `/api/bridge/library`) |
| Badges | ids returned by `/api/bridge/agents/:id/badges` (derived from real runs and lessons, never stored as earned) |
| Office themes | `aurora, neon, solar, voidlab, sakura` (stored per user as `shd_o3_room`) |

## 4. The two Colosseum views

- **Glow-bot spectator** (`public/shd-colosseum.js`): deterministic fights from a server seed (`/api/colosseum/events`, `/ticket`); practice is free, main event and tournament need a ticket, and the seed is given only to ticket holders.
- **3D realm Colosseum** (`public/colosseum-viewer.html` + `world-colosseum.js`): the real arena. It currently runs **its own** simulation, so the two views do not show the same match.
- **TODO (3D):** read the same seed and event list from `/api/colosseum/events` and drive the arena's crowd and fighters from it (`setCrowdMood`, `setField`, `setTheme` and `tick(dt)` already exist on the record returned by `window.buildColosseumArena`). Note: that function is a classic-script global that returns a record; the 3D object is `record.group`.

## 5. Per-user data (shared device safety)

Browser-side keys that belong to one person are stored as `<key>::<user id>` by `public/shd-user.js` (loaded first): office room/decor, wallet address typed in the office, chat history, Sparks display, Forge draft, setup-wizard flags, profile answers. **TODO (3D):** if the world page reads any of these, read them through the same wrapper or use the server.

## 6. Office widgets ("Screens")

User-chosen widgets inside the 3D office (markets, fear and greed, news, quick workflows) are saved per user under `shd_o3_screens`. Each widget shows its source, the time it was fetched, and a state (live, stale, error); nothing is shown as live unless the last fetch succeeded recently. They read existing same-origin endpoints (`/api/tufish/watch`, `/api/tufish/news`, `/api/market/fear-greed`) and the bridge workflows.

## 7. Windows, links and entry points

- The Forge is its own full-screen window (`public/shd-forge.js`). The wizard tells the dashboard with `postMessage` (`shd:signin`, `shd:forged`, `shd:goto`).
- The 3D realm opens through `enter3DWorld()` (the dashboard's full-screen world view, mounted at the top level). Deep links: `/?view=office`, `/?view=forge`, `/?arena=1`, `/?plans=1`, `/?gate=1` (preview sign-in on localhost).

## 8. Known gaps (be honest in marketing)

- The 3D world itself was not loaded or recorded in the dashboard preview; verify it on the live site.
- Sparks pricing units are unconfirmed and bridge billing (`BRIDGE_METERING`) stays **off**.
- Solana and Hyperliquid are "coming soon"; agent wallets are PAYBOX credits only.
- Visiting bots in the office and per-agent Sparks budgets are not built (per-bot daily caps exist on bot tokens).

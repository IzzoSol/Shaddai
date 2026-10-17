# City actions (`public/world-city-actions.js`)

When you press E at a city marker, `world-city-v3.js` calls `onInteract(marker)`. The host forwards that to `window.__onCityInteract(m)`. This module supplies that hook. It opens one reusable panel and shows the right action view for the marker's family.

- **Look.** The panel background is obsidian `#06080b`, text and actions are emerald `#00ff9c`, and SPARKS prices are gold `#e8c45c`.
- **Closing.** Esc closes the panel. So does E, unless you are typing in one of the panel's inputs. Pressing E again at the same marker also closes it.
- **Pointer lock.** Opening the panel releases pointer lock so the panel can be clicked. `onClose` reports `wasLocked`, so the host can lock the pointer again.
- **Phones.** At 600 px wide or less, the panel becomes a bottom sheet with 42 px touch targets.
- **Text.** The title, prompt and locked text come from `public/assets/world/city-copy-v4.json`. The lookup tries the exact marker name first, then the family key: `STALL_007` falls back to `STALL_*`, but an exact key such as `CLASS_ART` beats `CLASS_*`. The placeholders `{n}`, `{letter}`, `{price}`, `{skill}` and `{lane}` are filled in.

Test: `node tools/tests/world-city-actions.test.cjs` (20 tests; vm + fake DOM + mock fetch, no browser).
Syntax check: `node --check public/world-city-actions.js`.

## API

```js
const actions = window.buildCityActions({
  city,            // optional: window.__cityV3 (the plots view reads city.stats().plotsByState instead of fetching)
  hud,             // optional: defaults to window.__hudV4 at ping time
  copyUrl,         // default '/assets/world/city-copy-v4.json' (fetched once, cached)
  apiBase,         // default '' (same origin). Set it when the world is served from a different origin than the API
  fetchImpl,       // default fetch: every request goes through this, with a 5 s timeout
  getUser,         // () => ({ userId, token }); default reads localStorage shd_userid / shd_token (same as eco-pages.js)
  hasSkill,        // optional (skills[], marker) => true | false | undefined; false shows copy.locked and no actions
  dashboardHref,   // optional id => url; default '/#' + dashboard_id
  plotsUrl,        // default '/assets/world/plots-v4.json' (only used when `city` is not loaded)
  seatMs,          // optional override for the seating animation (default props.seat_anim_s × 1000 = 3000)
  onOpen, onClose, // optional; onClose({ marker, wasLocked })
  bindGlobal       // default true: sets window.__onCityInteract = m => actions.open(m)
});
actions.open(marker)   // → Promise<bool>; opening the marker that is already open closes it
actions.close(); actions.isOpen(); actions.current(); actions.dispose();
window.buildCityActions.pure  // { family, lookupCopy, fill, markerVars, outcome, routeIsNew, clean, uuid, ... } for tests
```

### Request headers

| Header | Value | Notes |
|---|---|---|
| `Authorization` | `Bearer <shd_token>` | Read by `softAuth` |
| `x-user-id` | `<shd_userid>` | `softAuth` only honours it outside production |
| `Idempotency-Key` | the click's key | Sent on POST requests |

POST bodies also carry `userId`, the dev fallback that economy, home and race read. Every spend also carries `idempotencyKey`: a fresh uuid made when you click Confirm. Economy `/catalog/purchase` requires this key. The home and race services derive their own per-day and per-heat keys on the server.

### Money rules (enforced in code and tested)

- **Confirm before spending.** Every spend shows its price in a confirm box, and nothing is sent until you click **Confirm**. Cancel sends nothing.
- **Pings after success.**
  - A SPARKS spend pings `hud.ping({ type: 'sparks:sink', sparks: -n, text })`, but not when the server replays an earlier request.
  - A spend on the SHAD-Credits ledger (hire, the seat) pings `{ type: 'credits:sink', text: '−n credits · …' }` instead. This keeps credits from being shown as SPARKS.
  - Home check-in pings `{ type: 'sparks:mint', sparks: +n }`.
- **Error pings.** Errors ping `{ type: 'error', text }` with a friendly line. Raw server text is never rendered.
- **Nothing flows out.** No withdraw, cash-out or transfer-out control exists. Every rendered string passes through `clean()`, which strips that vocabulary even when it arrives from the network. The test opens all 108 markers against a server that returns such words and checks that none are rendered.
- **HTTP 402.** The panel shows: *"Not enough for this one. Top up at the SPARKS Kiosk: PayBox and x402 are pay-in only."* This is the only place PayBox or x402 is mentioned.
- **Route not mounted.** A 404 on a route marked `status:'new'`, or a 404 that isn't JSON (Express's "Cannot GET"), shows a friendly **coming soon** state instead of an error.
- **Few requests.** Opening a panel only requests what that panel shows. Generic markers make no API request at all.

## Family → route table

| Markers (name / `dashboard_id`) | View | Routes | Mounted? |
|---|---|---|---|
| `OBJ_SPARKS_KIOSK` / `sparks` | Balance, SPARKS-priced catalogue, Buy with confirm | GET `/api/economy/balance`, GET `/api/economy/catalog`, POST `/api/economy/catalog/purchase` `{catalogId, qty:1, idempotencyKey}` | **live** (`softAuth`) |
| `OBJ_HIRING_BOARD` / `hiring` | Rate card; a job text field plus Hire with confirm (the deposit) | GET `/api/hire/rates`, POST `/api/hire/:AGENT` `{task}` | **live** (`softAuth` on the POST); SHAD-Credits |
| `CLASS_*`, `CLASS_ART`, `CLASS_MUSIC`, `OBJ_CLASS_BOARD` / `academy.*` | Catalogue; "Details" runs a quote (a dry run that costs nothing). The board is read-only. Enrolment links to the dashboard | GET `/api/academy/catalog`, POST `/api/academy/quote` | **live** (no auth) |
| `NODE_SKILL_INSTALL` / `forge.install` | Skill search → Seat with confirm → 3 s seating bar, then *"Click. {skill} is seated."* | GET `/api/skills/market?limit=6&q=`, POST `/api/skills/market/:id/run` | **live** (`softAuth`); SHAD-Credits |
| `HUB_HOME_*` / `home.*` | Status tile. Actions: Move in (today's rent), Pay rent, Check in | GET `/api/home/status`, POST `/api/home/inhabit` `/rent` `/checkin` `{homeId}` | **new**, NOT mounted → coming soon |
| `GATE_START` / `race.gate`, `PIT_*` / `race.pit.*` | Track line plus open heats. The gate can Enter with confirm (fee); pits are read-only | GET `/api/race/track`, GET `/api/race/heats?state=open`, POST `/api/race/heats/:id/enter` | **new**, NOT mounted → coming soon |
| `STALL_*`, `BLD_GALLERY_SHOP`, `SLOT_GALLERY_*` / `stall.*`, `culture.gallery*` | Listings, **read-only** (buying goes to the dashboard) | GET `/api/bazaar/list` | **live** (no auth) |
| `DEED_OFFICE`, `BUILDER_YARD` / `plots.*` | Plot counts by state (from `city.stats()` or `plots-v4.json`) and the kit list; Claim/Build is disabled ("coming soon") | none (plots are MCP-only: `plot_buy` / `plot_status`) | n/a |
| everything else | The copy prompt plus a "View on dashboard" link | none | n/a |

## Host snippet (`public/SHADDAI-WORLD-3D.html`; not applied, this file was not edited)

The City v3 step and the HUD step are already in the `window.__mapV4Ready` chain. Append this step **after the HUD step** (`world-hud-v4.js`), before the void-castle step. It works anywhere after the City v3 step, because the HUD is looked up only when a ping fires.

```js
    .then(function(api){   // MAP v4 CITY ACTIONS (world-city-actions.js): E at a marker → action panel (kiosk, hire, academy, seat, home, race, stalls, plots)
      if(!api || !window.__cityV3) return api;
      return _loadScript('/world-city-actions.js?v=20260927a').then(function(){
        window.__cityActions = window.buildCityActions({
          city: window.__cityV3,
          // apiBase: 'https://<api-host>',   // only if the world is not served by the API server itself
          onClose: function(i){ if(i && i.wasLocked && renderer && renderer.domElement.requestPointerLock) try{ renderer.domElement.requestPointerLock(); }catch(_){} }
        });   // sets window.__onCityInteract, which the City v3 onInteract already forwards to
        window.__w3dDebug.cityActions = window.__cityActions;
      }).catch(function(e){ console.warn('[map-v4] city actions failed:', e && e.message); }).then(function(){ return api; });
    })
```

Optional host gates while the panel is open:

- Skip the host's own E handlers (transit, interiors, locked-controls) when `window.__cityActions && window.__cityActions.isOpen()`.
- Pause WASD movement for the same condition.

Keys typed into the panel's inputs don't bubble past the panel. Capture-phase host listeners on `window` still see them.

## Auth / mount mismatches found (backend repo is read-only here, so none are fixed)

1. **`/api/home` and `/api/race` are not mounted** in `backend/server-production.js`. In the game they show "coming soon" until someone adds `app.use('/api/home', softAuth, require('./home-routes')())` and the matching `/api/race` line. Add `softAuth`: `HOME-RACE-SERVICES.md` leaves it out, and without it identity falls back to the caller-supplied `body.userId` / `?userId`, which anyone can spoof.
2. **Anonymous users all share one account.** `softAuth` sets `req.userId = 'local'` whenever there is no valid Bearer token. Economy's `resolveUserId` then uses `'local'`, never `body.userId`. With `REQUIRE_AUTH` unset, every signed-out player in the city shares the balance and purchases of the `'local'` account. Either set `REQUIRE_AUTH=true`, or have the panel refuse spends when there is no token.
3. **Hire and the skill seat spend SHAD-Credits, not SPARKS.** `/api/hire/*` uses `x402.chargeCredits` and `/api/skills/market/:id/run` uses `paybox-settle`, while `PRICES.md` prices both in SPARKS (`hire.contract`, `install.tier` 5/15/40/100). The panel labels these prices "credits" and pings `credits:sink`. The backend needs to decide which ledger these use.
4. **The Academy routes are an x402 API-provider lab priced in USDC.** They cover payment channels (Helius, QuickNode and so on), not SPARKS tuition (`academy.tuition` 5/12/30/75). `open_tab` opens a USDC-capped tab. The panel shows the catalogue and quote but does **not** call `open_tab`, `/spend` or `/close_tab`, and it hides the `$` prices; DOC_PAYMENTS says no tickers in the city. SPARKS classes need a backend.
5. **`POST /api/bazaar/buy` trusts `body.buyer`.** Its router has no `softAuth`. It also settles through an internal HTTP call to `/api/x402/charge` without forwarding the session, the bug `hire-routes.js` already fixed. Stalls are therefore **read-only** in the city.
6. **No server-side idempotency outside economy.** Hire, skills-market run and bazaar buy take no idempotency key. The header and body key are sent, but those routes ignore them, so a retried request after a network timeout can charge twice. Economy, home and race are safe.
7. **Small marker/route drifts.**
   - `GATE_START`'s race endpoint list omits the real result route, `POST /api/race/heats/:heatId/result`. The legacy prose on the marker says `/api/race/result`.
   - `PIT_*` has `sparks_price: 5`, but race-service charges no pit fee (PRICES.md open question 1). Pits are read-only here.
   - `/api/economy/spend` (listed on `STUDIO_*`) is an admin/service-token route and can't be called from a browser. Studios use the generic view.
8. **The world is a separate repo.** If it is served from another origin, set `apiBase`. CORS allows `*.onrender.com`, localhost and `ALLOWED_ORIGINS`, and `credentials: false`, so auth must be the Bearer header (which is what this module sends), not cookies.

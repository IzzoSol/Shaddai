# Home + Race services (City v3 backend pieces)

The two new backend pieces from `CITY-MASTER-BRIEF-v2.md` §6: `HUB_HOME_*` (home/rent) and `GATE_START` / `PIT_*` (race entry). Both sit on top of `economy-service.js`. They never write `sparks_balance` or `spark_transactions` themselves: every Sparks movement is `EconomyService.spend()` / `.grant()` with a deterministic idempotency key.

Sparks are closed-loop and one-way. Neither service has a refund-to-cash, payout-to-cash or transfer path, and none may be added.

| File | Purpose |
|---|---|
| `home-service.js` | `HomeService` and `MemoryHomeStore`: tenancy, rent, check-in, and the dashboard tile |
| `home-routes.js` | Express router, mount at `/api/home` |
| `race-service.js` | `RaceService`, `MemoryRaceStore` and `validateLap`: heats, entries, results, pool payouts |
| `race-routes.js` | Express router, mount at `/api/race` |
| `home-service.test.js` / `race-service.test.js` | Plain node runners: `node home-service.test.js`, `node race-service.test.js` |

## Registering the routes (coordinator, in `server-production.js`)

Put these next to the existing economy mount. They assume `express.json()` is already applied globally.

```js
const homeRoutes = require('./home-routes');
const raceRoutes = require('./race-routes');
app.use('/api/home', homeRoutes());
app.use('/api/race', raceRoutes());
```

Both routers use the same economy singleton (`economy-service.getDefault()`) as `/api/economy`, so all balances stay in one ledger. User identity is resolved the same way as in `economy-routes.js`: `req.user.id`, then `req.userId`, then a dev fallback to `body.userId` / `query.userId`. Before real traffic, wire real auth and remove that fallback.

---

## Home (`/api/home`)

World ids are `home.a` … `home.f` (hubs `HUB_HOME_A` … `HUB_HOME_F`). Each hub has `rent_sparks_per_day` (default 5) and `agent_capacity` (1–3, default 3). Both can be overridden per hub with `new HomeService({ homes })`.

| Method | Path | Body / query | What it does |
|---|---|---|---|
| GET | `/homes` | none | Public board of the 6 hubs: `state` (empty/lit/rent_due/lapsed), `lit`, `claimable`, `agents_count`. No user ids. |
| GET | `/status` | `?userId` | The dashboard tile (see below) |
| POST | `/inhabit` | `{ homeId, agents? }` | Takes an empty or lapsed home and **pays today's rent** (spend). Calling it again as the same tenant is a replay. |
| POST | `/agents` | `{ homeId, agents[] }` | Sets the resident agents, up to the hub's capacity |
| POST | `/rent` | `{ homeId, throughDay? }` | Pays every unpaid day through `throughDay` (default today). Prepay is limited to 7 days. |
| POST | `/checkin` | `{ homeId }` | Daily check-in grant (a capped source) |
| POST | `/vacate` | `{ homeId }` | Leaves the home. No refund: rent is a burn. |
| POST | `/stall-sale` | `{ userId, homeId, saleId }` + `x-admin-token` | Server-to-server counter for "stall sold N". It moves no Sparks (bazaar does that). Idempotent on `saleId`. |

### Rules
- **Lights are the ledger.** State is computed lazily from the clock, so no cron job is needed:
  - `lit`: rent is paid through today.
  - `rent_due`: 1..`graceDays` (default 2) days unpaid. The home is still lit and the tile shows the amount due.
  - `lapsed`: more than `graceDays` days unpaid. The home **dims** and becomes claimable by anyone. `payRent` and `checkIn` are refused with `HOME_LAPSED`. Anyone, including the old tenant, can `inhabit` it again as a fresh tenancy.
  - Arrears are **not** carried as debt, because Sparks balances never go negative.
- **Rent idempotency:** each day is its own spend with key `home:rent:<userId>:<homeId>:<YYYY-MM-DD>` (UTC day). A retry or replay never double-charges, even if the home store loses state.
- **Insufficient balance:** the balance is checked against the full arrears before any spend (402 `INSUFFICIENT_FUNDS`), so there is no partial payment.
- **One active home per user.** A home held by someone else's active tenancy returns `HOME_OCCUPIED`.
- **Check-in:**
  - The home must be `lit` (today's rent paid).
  - One check-in per user per UTC day, with key `home:checkin:<userId>:<day>`.
  - The reward (`checkinReward`, default 3) is clamped by a **hard daily cap** (`checkinDailyCap`, default 3) per user per day across all homes.
  - The cap is reserved before the grant and released if the grant fails.
  - Reward (3) is less than rent (5), so a home never farms Sparks: sinks ≥ print.
- **Pings:** every rent, check-in, lapse, stall sale and vacate event is pushed into a per-user ring buffer (last 20). The tile shows the newest 5.

### `/status` response (dashboard tile: "lit / rent due / stall sold N / last pings")
```json
{ "ok": true, "userId": "u1", "housed": true, "home_id": "home.a", "dashboard_id": "home.a", "hub": "HUB_HOME_A",
  "state": "rent_due", "lit": true, "dims": false, "rent_sparks_per_day": 5,
  "paid_through": "2026-09-27", "overdue_days": 1, "rent_due": 5, "grace_days": 2, "lapses_after": "2026-09-29",
  "agents": ["nexus"], "agent_capacity": 3, "stall_sold": 2, "checked_in_today": false, "checkin_reward": 3,
  "balance": 42, "last_pings": [{ "type": "rent", "amount": -5, "home_id": "home.a", "at": "..." }] }
```

### Errors
| Status | Codes |
|---|---|
| 400 | `VALIDATION` |
| 402 | `INSUFFICIENT_FUNDS` |
| 403 | `NOT_TENANT` |
| 404 | `NOT_FOUND` (unknown home) |
| 409 | `HOME_OCCUPIED`, `ALREADY_HOUSED`, `HOME_LAPSED`, `RENT_DUE`, `CAPACITY_EXCEEDED` |
| 429 | `DAILY_CAP` |
| 401 / 503 | Service-token gate on `/stall-sale` |

---

## Race (`/api/race`)

The track is `TRACK_MAIN`: the ring road at r 1600 m (about a 10 km lap), driven **counter-clockwise**. The gate is `race.gate` and the pits are `race.pit.01..08` (8 entrants maximum). Checkpoints `CP_00..CP_07` sit every 45° and are numbered in driving order.

| Method | Path | Auth | Body | What it does |
|---|---|---|---|---|
| GET | `/track` | public | none | Lap sequence, pits, direction |
| GET | `/heats` | public | `?state=open\|racing\|settled` | Lists heats |
| GET | `/heats/:heatId` | public | none | Heat detail: pool, entrants/pits, results, payouts, burned |
| POST | `/heats` | service token | `{ heatId?, entryFee?, prizeSplitPct? }` | Opens a heat. Defaults: fee 10, split `[50,25,15]`. Idempotent on `heatId`. |
| POST | `/heats/:heatId/enter` | player | none | Pays the entry fee (spend) and assigns the next free pit |
| POST | `/heats/:heatId/start` | service token | none | Drops the gate: entries close and results open |
| POST | `/heats/:heatId/result` | player (or service, see below) | `{ checkpoints: [{id,t}, …] }` | Submits one validated lap |
| POST | `/heats/:heatId/settle` | service token | none | Ranks the laps and pays places 1–3 from the pool. Idempotent. |

The service token is `x-admin-token` holding `ADMIN_TOKEN` or `ARCADE_SERVICE_TOKEN`, the same gate as economy `/grant` and `/spend`. If neither variable is set, the gated routes fail closed with 503.

### Rules
- **Entry:** spend with key `race:entry:<heatId>:<userId>`. A retry or concurrent duplicate charges once and returns the same pit. On insufficient balance the call returns 402 and neither the pool nor the pits change. Entries are allowed only while the heat is `open`, and never past 8 entrants (`HEAT_FULL`).
- **Pool:** the pool is the sum of entry fees actually sunk into *that* heat.
- **Checkpoint validation** (all checks must pass before a lap can earn anything):
  - The sequence must be exactly `CP_00, CP_01, …, CP_07, CP_00`. Skipped, repeated, swapped, clockwise or non-closing laps are rejected with 422 `BAD_CHECKPOINTS`.
  - Times are integer ms. `CP_00` must be at `t = 0`, and times must be strictly increasing.
  - Each segment (about 1257 m) must take at least `ceil(1257 / maxSpeedMps)` ms. `maxSpeedMps` defaults to 150, so the minimum is about 8.4 s per segment.
  - The lap must be at most `maxLapMs` (30 min).
  - The lap can't be longer than the wall-clock time since `start` (plus 5 s skew).
  - Timing failures return 422 `IMPOSSIBLE_TIME`.
  - Each entrant gets one result. Resubmitting the same lap is a replay, and a different lap returns `RESULT_EXISTS`.
- **Payout (places 1–3), funded from that heat's entry pool:**
  - `prize[i] = floor(pool × split[i] / 100)`, and `split` must sum to ≤ 100. This is enforced both in the config and per heat.
  - The result is that total prizes are always ≤ pool. There is also a hard invariant check at settle.
  - Each grant uses key `race:prize:<heatId>:<place>`, so settle is idempotent.
  - Anything not paid out **stays burned**: the split remainder (10% with the default split), places with no finisher, and any amount clamped by the daily prize cap. Nothing is deferred and nothing is minted.
  - Because a heat can never mint beyond its sunk entries, a solo or colluding racer always nets a loss.
- **Daily caps** (per user, per UTC day):
  - `dailyEntryCap`: 10 heats (429 `DAILY_CAP`).
  - `dailyPrizeCap`: 100 Sparks of prizes. Any excess burns.
- **Anti-cheat:** in-browser lap times are client-reported. Validation bounds what a bad client can claim, and the pool funding bounds what it can *win*: other racers' sunk entries, capped per day. For server-authoritative results, set `RACE_RESULTS_REQUIRE_SERVICE=1`. `/result` then accepts only service-token calls, where the game server posts `{ userId, checkpoints }`.

### Errors
| Status | Codes |
|---|---|
| 400 | `VALIDATION` |
| 402 | `INSUFFICIENT_FUNDS` |
| 403 | `NOT_ENTRANT` |
| 404 | `NOT_FOUND` |
| 409 | `HEAT_CLOSED`, `HEAT_FULL`, `BAD_STATE`, `NO_ENTRANTS`, `RESULT_EXISTS` |
| 422 | `BAD_CHECKPOINTS`, `IMPOSSIBLE_TIME` |
| 429 | `DAILY_CAP` |

---

## Storage

Both services default to an **in-memory store** behind a small async interface (listed at the top of each store class). Money is already durable because it lives in the economy ledger. What the memory store loses on restart is only game state: tenancies, heats and cap counters. The deterministic idempotency keys mean a lost store can never cause a double charge or a double grant.

To make this state durable, implement the same interface over Postgres, mirroring `economy-service.js`'s `PostgresStore`, using this schema (**not created by this change**):

```sql
CREATE TABLE home_tenancies (
  home_id        TEXT PRIMARY KEY,               -- 'home.a'..'home.f'
  user_id        TEXT NOT NULL,
  agents         JSONB NOT NULL DEFAULT '[]',
  since          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_through   DATE NOT NULL,
  stall_sold     INTEGER NOT NULL DEFAULT 0,
  stall_sale_ids JSONB NOT NULL DEFAULT '[]',
  checkins       JSONB NOT NULL DEFAULT '[]',
  lapsed_pinged  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX home_tenancies_user ON home_tenancies (user_id);

CREATE TABLE city_daily_caps (                    -- shared by home + race
  user_id TEXT NOT NULL,
  source  TEXT NOT NULL,                          -- 'home_checkin' | 'race_entry' | 'race_prize'
  day     DATE NOT NULL,
  used    BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, source, day)
);

CREATE TABLE city_pings (
  id      BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type    TEXT NOT NULL,
  payload JSONB NOT NULL,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX city_pings_user_at ON city_pings (user_id, at DESC);

CREATE TABLE race_heats (
  heat_id         TEXT PRIMARY KEY,
  state           TEXT NOT NULL CHECK (state IN ('open','racing','settled')),
  entry_fee       BIGINT NOT NULL CHECK (entry_fee > 0),
  prize_split_pct JSONB NOT NULL,
  pool            BIGINT NOT NULL DEFAULT 0,
  paid_out        BIGINT NOT NULL DEFAULT 0 CHECK (paid_out <= pool),
  entrants        JSONB NOT NULL DEFAULT '[]',
  results         JSONB NOT NULL DEFAULT '[]',
  payouts         JSONB NOT NULL DEFAULT '[]',
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  settled_at      TIMESTAMPTZ
);
```

With multiple server instances, the in-process `_serial` lock is not enough. Use `SELECT … FOR UPDATE` on the tenancy or heat row, and the cap row, inside one transaction, as `PostgresStore.applyTransaction` does.

## Tests
```
cd backend
node home-service.test.js   # 13 passed, 0 failed
node race-service.test.js   # 12 passed, 0 failed
```

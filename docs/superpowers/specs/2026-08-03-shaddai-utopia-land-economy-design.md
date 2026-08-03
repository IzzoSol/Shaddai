# SHADDAI City Land Economy — Design Spec
**Date:** 2026-08-03  
**Status:** Approved — ready for implementation planning  
**Research corpus:** 50 videos, 672 RAG chunks, 430+ extracted quotes  
**Playbook:** `C:\Users\Brittany\Documents\SHADDAI-SYSTEM\docs\UTOPIA_LAND_IMPROVEMENT_PLAYBOOK.md`  
**Target file:** `public/game.html` (1,898 lines, ~199KB)

---

## 1. World Architecture

One connected world. No region selector screen. The player spawns in SHADDAI City and walks everywhere.

```
[ Forest ]  [ Nexus Heights ]  [ Beach ]
[ Meadow ]  [ SHADDAI CITY  ]  [ Desert ]
[ Suburb ]  [ Oracle Sky    ]  [ Zerox  ]
```

**SHADDAI City (center)** — The hub. Founders' Row (30 office lots) + revamped landmark buildings (shops, guild halls, transit hub, bank, plaza). No buy-to-rent room plots here — that's the outer districts. Offices earn passive residuals from the entire world economy. All existing SHADDAI City buildings get revamped as part of Phase B.

**8 outer districts** — each a mini-city with a plot grid, rooms, tenants, and a district-specific yield asset. Each district has its own visual identity (tile color, ambient music, Signal drain rate).

Districts map to SHADDAI agents:
| District | Agent | Yield Asset | Signal Drain |
|---|---|---|---|
| Forest | TURTLE | TURTLE Credits | Low |
| Nexus Heights | NEXUS | NEXUS Credits | Medium |
| Beach | ORACLE | ORACLE Credits | Medium |
| Desert | PIKADON | PIKADON Credits | High |
| Meadow | QUILL | QUILL Credits | Low |
| Suburb | (neutral) | Sparks | None |
| Oracle Sky | ORACLE | ORACLE Credits | Medium |
| Zerox District | ZEROX | ZEROX Credits | High |

Walking between districts is physical travel — the player moves across the tile map. No teleportation by default.

---

## 2. Signal Mechanic

**Signal** = your connection to the network. A 0–100 resource shown as a bar in the HUD.

### Drain rules
- Walking within your home district or Suburb: no drain
- Walking in any other district: drains at a per-district rate (see table above)
- Riding transit: drains at 1/3 the walking rate (transit pods are shielded)
- Stationary: no drain

### Regen rules
- Standing in your own office: +5/sec
- Standing in a room you own: +3/sec
- At any transit station: +2/sec
- Food vendor purchase: +20 instant (costs Sparks)
- Rest beds (purchasable amenity in rooms): +10 when you stop moving

### Signal hits 0 — "Signal Drop"
1. Screen flashes static
2. Player blacks out
3. A Sparks deduction fires: **Rescue Taxi fee** — flat 50 Sparks (no RNG, always known)
4. Player respawns at their office in SHADDAI City (or nearest unlocked transit station if no office owned yet)
5. Signal resets to 50

**Why Option C (penalty + respawn):** makes owning an office in SHADDAI City mechanically valuable — it's your anchor point, your rescue destination. The 50 Sparks fee is small enough to not be punishing but large enough to make Signal management real. Food vendors and amenities become meaningful purchases.

---

## 3. Transit System

### Three layers (unlocked progressively)

**Walk** — always available. Slow. Drains Signal at full rate. Free.

**Ring Train** (gold) — loops all 8 outer districts. Fare: 10 Sparks per stop.  
_Unlocks after:_ visiting 3 different outer districts on foot.

**Subway Spokes** (emerald) — direct routes from SHADDAI City to any district. Fare: 25 Sparks.  
_Unlocks after:_ owning any room anywhere.

**Transit Pass** — weekly sub (100 Sparks/week) covers all Ring Train rides. Unlimited subway for 500 Sparks/month.  
_Ultra-rare lifetime pass:_ limited NFT-style collectible, hard flex, no gameplay advantage.

### Fares as economy sinks
All transit fares flow into the **City Treasury**. The treasury distributes:
- 60% → Founders' Row offices (proportional to holdings)
- 30% → district reward reserves (refuels streams)
- 10% → SHADDAI buyback reserve

### Transit stations
Each district has one station building. Stations are:
- Visible on the map as a distinct landmark
- Signal regen zones (+2/sec while standing inside)
- Respawn points (for players with no office)
- The Ring Train arrival/departure point

---

## 4. Plot & Deed Economy

### Plot deed model (extends existing `FLOT` entries)
```js
PLOTS[id] = {
  id, x, y, district,
  owner,          // userId or null
  deed,           // deed NFT id or null
  rate,           // Sparks per second
  lastAccrual,    // timestamp
  claimable,      // accrued but unclaimed
  boostLock: { amount, until },
  rooms: [8],     // room slot array
  amenities: [],
  style, height, color, name,
  agent: {}       // plot agent strategy
}
```

### Streaming accrual (Superfluid pattern)
```js
function accrue(plot) {
  const now = Date.now();
  plot.claimable += plot.rate * (now - plot.lastAccrual) / 1000;
  plot.lastAccrual = now;
  plot.claimable = Math.min(plot.claimable, CITY_RESERVE[plot.district].available(plot.id));
}
```
Called before every claim, transfer, or rate change. Reserve rule is non-negotiable.

### Reserve rule
`claimable` ALWAYS ≤ `CITY_RESERVE[district].available(plot.id)`. Claims are backed by pre-committed reserves, not projected revenue. The City Treasury readout shows reserve balances in real time.

---

## 5. Founders' Row Offices (SHADDAI City only)

30 lots. Same 30 as the existing `office-service.js` model.

**Office residuals (passive income from the world):**
- Transit fare pool share (proportional to office count owned)
- District rent pool: 5% of all room rents from all 8 districts
- Marketplace fee share: 2% of all plot sales

**Why offices are premium:**
- The only property in SHADDAI City
- Your personal Signal regen anchor (+5/sec)
- Rescue respawn destination (Signal Drop)
- Command Hub presence (office shows in the game world + dashboard)

---

## 6. Room / Tenant Economy

8 room slots per building. Each room has:
- A tenant archetype (night baker, clockmaker, chess hustler, data trader…)
- A weekly rent rate (paid in Sparks)
- A unit rating (1–5 stars) that affects rent demand
- Rules: noise, occupancy, pet policy (violations → fines → rating drop)

**Ownership model:**
- Buy-out a room even in someone else's plot (via Sparks)
- Room owner collects rent from a shared rent pool
- Plot owner gets a 10% cut of all room rents in their plot

**Onboarding hook:**
- FTUE steers: rent a room → earn your first passive Sparks → save for a plot deed
- Entry stays fun-first; plot ownership deepens identity

---

## 7. Boost Vaults

Lock Sparks into a plot → multiply its stream rate.

```js
function boostMultiplier(locked, cap) {
  const r = Math.min(locked, cap) / cap;
  return 1 + 3 * r / (1 + 1.5 * r);  // ~4x max, front-loaded
}
```

- Locks are stored in the reserve before the multiplier is honored
- Unlock = boost decays over 48h (not instant drop — smooth decay)
- Cap at 4x on base rate, capped again at 6x with amenity stacking

---

## 8. Economy Faucets & Sinks

| Faucet | Sink |
|---|---|
| Plot streaming | Boost locks |
| Room rent pool | Amenity purchases (burned) |
| District yield | Marketplace fees |
| Transit fares (inflow) | Transit fares (outflow → treasury → reserves) |
| Signal Drop rescue fee | Treasury buyback reserve |

**Discipline:** every new faucet gets a matching sink before it ships. No sink → feature doesn't ship.

---

## 9. Build Order

### Phase 0 — Pre-launch (before public plot sale)
- Publish vesting schedule (linear, no cliffs)
- Pick raise venue (ecosystem grant or private round)
- Build waitlist + referral funnel (cut-the-line mechanic)
- Founding community = first 30 Founders' Row office owners

### Phase A — Plot grid + streaming core
- Extend `FLOT` to deed model
- `accrue()` tick on global interval
- `CITY_RESERVE{}` with treasury readout
- District → yield asset mapping
- `saveCity()` persist

### Phase B — Connected world map + full visual revamp
- Merge 8 separate regions into one 3×3 tile grid
- Walking transit between districts (no region selector)
- Signal HUD bar + drain/regen logic
- Transit stations as map buildings
- Revamp all SHADDAI City buildings (shops, guild halls, plaza, bank, transit hub)
- Revamp player characters (movement, sprites, visual consistency across world)
- Revamp district buildings to match each district's agent identity

### Phase C — Transit system
- Ring Train route (gold, loops outer districts)
- Subway spokes (emerald, SHADDAI City → district)
- Fare system → City Treasury
- Progressive unlock gates

### Phase D — Boost vaults + sinks
- `boostLock` vault with curve
- Amenity burn purchases
- Marketplace fee splitter

### Phase E — Room / tenant economy
- 8-slot rooms per building
- Tenant archetypes + weekly rent
- Unit rating + rules/fines
- FTUE "rent first" onboarding hook

### Phase F — Plot agents + AMM
- x*y=k constant product swap
- Plot agent: target allocation + drift threshold + swap call
- On-map agent activity feed

### Phase G — Marketplace + security hardening
- Plot listing and atomic buy
- Fee splitter
- Reserve reentrancy protection
- Integer overflow guards (BigInt for reserve math)

---

## 10. Pre-launch Funnel (Phase 0 detail)

Research corpus (Batch 3, videos #46–50) gives a proven shape:
1. **Landing page** with plot deed waitlist (email + wallet connect)
2. **Referral mechanic** — share your link → move up the waitlist → get priority plot access
3. **Launch email sequence** — counts down to a fixed 48h public sale window
4. **Founding Discord** — first 30 office owners become "Founders" with identity badge
5. **Transparency page** — treasury readout, reserve balances, vesting calendar visible to all before sale

Waitlist positions are early SHADDAI City office pre-access, not tokens — no regulatory surface.

---

## 11. Non-negotiables

1. `claimable` NEVER exceeds `CITY_RESERVE[district].available(plot.id)`
2. Every faucet has a sink before shipping
3. Yield is called "stream rate" not "APY"
4. Reserve balances are always public (dashboard readout)
5. Signal Drop always costs exactly 50 Sparks — no RNG
6. `BUILDINGS_SOLID = false` — all buildings stay walkable
7. Local-first / single-player first; state designed for SpacetimeDB drop-in later

---

## 12. Files affected

| File | Change |
|---|---|
| `public/game.html` | Phase A–G implementation |
| `backend/office-service.js` | Wire residual distribution |
| `backend/economy-service.js` | Transit fares, Signal Drop fee, rent pool |
| `backend/server-production.js` | New city endpoints |
| `public/home.html` | Pre-launch waitlist section (Phase 0) |
| `public/world-map-concept.html` | Reference only — concept confirmed |

---

*Spec written 2026-08-03. Research: 50 videos / 672 RAG chunks / `UTOPIA_LAND_IMPROVEMENT_PLAYBOOK.md`.*

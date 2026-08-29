# SHADDAI World — Canonical Entrypoint (read me first)

There used to be **two servers and two copies of every world file**, which is why edits
"didn't show up." This is now collapsed to ONE of each. Use only what's below.

## The one server
```
cd "C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD"
$env:PORT="8099"; node backend/server-production.js      # or: npm start  (defaults to :3000)
```
- `backend/server-production.js` is the ONLY server. It serves `public/` as static
  (so `/assets/...` works) and mounts every feature route (forge, rooms, collectables,
  operatives, districts/library, markets, bazaar, x402, …).
- Do **not** run `_dash93.cjs` (the old hand-rolled "preview" server). It has been moved to
  `_archive_world_builds/`. It served ROOT copies of the world files and had no `/assets`
  static mount — that was the whole problem.

## The one world file
- Canonical 3D world: **`public/SHADDAI-WORLD-3D.html`** — served at **`/world`** and `/world3d`.
- Edit THIS file for the 3D world. Nothing else.
- `public/SHADDAI-WORLD-COMPLETE.html` (procedural variant) is still served at `/world-complete`.
- Old duplicates are in `_archive_world_builds/` (kept as backups, not deleted).

## Assets
- Agent bodies (GLB): `public/assets/agents/<AGENT>.glb`
  (SHADDAI/ZEROX/TURTLE = real hi‑res from the user; others = fal.ai auto until replaced).
  Source map: `public/assets/agents/_GLB_SOURCE_MAP.txt`.
- Vehicles/props (GLB): `public/assets/models/*.glb`
- Generate an agent body from its portrait: `node backend/scripts/generate-agent-glb-fal.js <agent>`
  (uses `FAL_KEY` from `.env.local`; Trellis image→3D).

## Key live endpoints
- `GET /world` → the 3D world
- `GET /assets/agents/SHADDAI.glb` → agent body
- `GET /api/markets/ohlc?symbol=btc|eth|sol|...` → candlesticks for ZEROX's chart
- `GET /api/library/books?section=general` → library; `?section=esoteric` needs a premium tier (ORACLE‑gated)
- `POST /api/library/books` add · `POST /api/library/borrow` · `POST /api/library/return` · `GET /api/library/loans?user=`

## Sanity check after starting
```
GET http://localhost:8099/world                      -> 200, body contains id="c3d"
GET http://localhost:8099/assets/agents/SHADDAI.glb  -> 200 (~54MB)
GET http://localhost:8099/api/markets/ohlc?symbol=btc-> 200 JSON with candles
```

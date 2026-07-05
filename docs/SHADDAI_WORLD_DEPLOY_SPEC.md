# SHADDAI v93 + Shaddai World — Production Deploy Spec

**Date:** 2026-06-21  
**Author:** NEXUS (deployment analysis) / SHADDAI build

---

## Overview

Production (`public/index.html`) is currently the v85 build (2,830,009 bytes, dated 2026-06-07).  
The v93 dashboard (`SHADDAI-DASHBOARD-v93.html`) is 2,940,760 bytes — a 110 KB net addition.  
This spec covers exactly what to change, in what order, to ship v93 + Shaddai World safely.

---

## 1. Promote `SHADDAI-DASHBOARD-v93.html` → `public/index.html`

### Sanity-check first (do this before touching any files)

Open `SHADDAI-DASHBOARD-v93.html` in your browser locally via `_grid_preview.cjs`:
```
node _grid_preview.cjs
# → http://localhost:8123
```
Confirm:
- Dashboard loads without console errors
- Forge tab shows archetype portraits
- Agent cards render (FLUX portraits from `/api/forge/art/`)
- "⬡ SHADDAI WORLD" nav button appears
- Clicking it triggers the portal animation and loads the world iframe

If all green, proceed.

### Step 1 — Back up the old index.html

```powershell
# Run from repo root: C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD
Copy-Item "public\index.html" "public\index.html.v85-backup-$(Get-Date -Format 'yyyyMMdd-HHmm')"
```

This creates e.g. `public/index.html.v85-backup-20260621-1430`.  
**Keep this file in the repo.** If Render deploy fails, you can restore with one copy.

### Step 2 — Copy v93 into place

```powershell
Copy-Item "SHADDAI-DASHBOARD-v93.html" "public\index.html" -Force
```

### What this jump includes (v85 → v93, 13 days)

Per memory notes, v93 contains:
- Swivel carousel + character sheet
- Agent cards using real FLUX portraits
- Forge picker with real preset part images (boot bug fixed)
- Shaddai World nav button + portal animation + iframe at `#gridView`

The version label inside the file still reads `SHADDAI v91` (title tag line 9) — that is cosmetic only; the *file* is v93. Do not rename it.

---

## 2. Add the `/world` Route to `backend/server-production.js`

### Why this is needed

The dashboard's Shaddai World section lazily sets `iframe#gridWorldFrame` `src="/world"` the first time the user clicks the World nav button:

```js
// Line 49504 (SHADDAI-DASHBOARD-v93.html)
const WORLD_URL = window.__SHADDAI_WORLD_URL || '/world';
// Line 49536
if(f && !_loaded){ _loaded=true; f.setAttribute('src', WORLD_URL); }
```

In production, `app.get('*')` at line 1438 of `backend/server-production.js` is the current catch-all. A request to `/world` would hit that catch-all and return `public/index.html` (the full dashboard) inside the iframe — broken.

The fix is a dedicated `/world` route **registered before the catch-all**.

### Option A — Copy SHADDAI-WORLD.html into `public/` (recommended)

**Why:** `express.static('../public')` (line 329) already serves everything in `public/` automatically, with correct `ETag`/caching headers. No new route code needed — just copy the file.

```powershell
# Run from repo root
Copy-Item "SHADDAI-WORLD.html" "public\SHADDAI-WORLD.html" -Force
```

Then add this single route to `backend/server-production.js` at **line 1434** (before `app.get('/')` and `app.get('*')`):

```js
// ── Shaddai World — serves the neon world experience loaded by the dashboard iframe ──
app.get('/world', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/SHADDAI-WORLD.html'));
});
```

**Exact insertion point** — the block at lines 1430–1440 should become:

```js
// ============================================
// FRONTEND FALLBACK
// ============================================

// ── Shaddai World — must be BEFORE the catch-all ──
app.get('/world', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/SHADDAI-WORLD.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
```

### Option B — Serve from repo root (no copy, alternate path)

If you prefer not to add SHADDAI-WORLD.html to `public/`, use an absolute path to the repo root:

```js
app.get('/world', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'SHADDAI-WORLD.html'));
});
```

Same insertion point (before `app.get('*')`). Option A is cleaner because the static-file handler will also serve it on cache-busted requests.

### CSP note: `frameSrc`

The production CSP (line 388 of `server-production.js`) is:
```js
frameSrc: ["'self'", "https://calendly.com", "https://calendar.google.com", "https://s.tradingview.com"],
```

`'self'` is already present. Since `/world` is same-origin, **no CSP change is required**.

---

## 3. Confirm `/api/forge/art/*` Already Works in Production

**Short answer: yes, it is already wired.**

`backend/forge/forge-routes.js` line 72–77:
```js
// GET /api/forge/art/arch-vanguard.png → serve a pre-generated premium archetype portrait
router.get('/art/:file', (req, res) => {
  const safe = path.basename(req.params.file);
  const fp = path.join(ART_DIR, safe);
  if (!fp.startsWith(ART_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  res.type('png').send(fs.readFileSync(fp));
});
```

This router is mounted at `app.use('/api/forge', require('./forge/forge-routes'))` (line 680 of `server-production.js`), which is registered **well before** the catch-all at line 1438. The art files live at `backend/data/forge-art/*.png` on disk.

**Action required:** Make sure `backend/data/forge-art/` contains the PNG files and is committed to git (not in `.gitignore`). Verify:

```powershell
Get-ChildItem "backend\data\forge-art\" -Filter "*.png" | Select-Object Name, Length
```

If the directory is empty or missing, Render won't have the images. The forge-art images need to be in the repo (they are binary, so they increase repo size — but there is no alternative for Render's free plan which has no persistent disk across deploys for the free tier).

If they ARE in the repo and committed, the portraits will render in the World iframe automatically once the `/world` route is live.

---

## 4. `grid-module.js` and the `importmap`

### Current situation

`SHADDAI-DASHBOARD-v93.html` lines 10–17 contain an importmap pointing `three` → `https://unpkg.com/three@0.180.0/...`. The root `grid-module.js` file exists at repo root.

The preview server (`_grid_preview.cjs` line 27) serves `/grid-module.js` explicitly. The Shaddai World now uses the **iframe approach** — the world logic lives entirely in `SHADDAI-WORLD.html`, not in `grid-module.js`.

### Decision: keep both, change nothing

- **`grid-module.js`** — keep it in the repo. It does no harm, Render will not serve it (it is not in `public/`), and removing it could break a future use. Mark it as "superseded by iframe approach" in a comment if desired.
- **importmap** — keep it in the dashboard HTML. It is a no-op unless something in the dashboard's own `<script type="module">` blocks imports `"three"`. If SHADDAI-WORLD.html has its own Three.js imports, they are self-contained inside the iframe (different document). The importmap in the parent page does not affect the iframe.
- **`unpkg.com` in CSP `scriptSrc`** (line 352) — already present. No change needed.

Summary: **no action required** for either item.

---

## 5. Git Commit and Push to Trigger Render

### Files to stage

```powershell
# From repo root
git add public/index.html
git add public/SHADDAI-WORLD.html
git add backend/server-production.js
# Stage the backup too so history is in git
git add "public/index.html.v85-backup-*"
```

If `backend/data/forge-art/` PNG files are not already tracked:
```powershell
git add backend/data/forge-art/
```

### Commit message

```
feat(deploy): promote v93 dashboard + wire /world route + copy SHADDAI-WORLD to public/

- public/index.html: replaced v85 build (2,830,009 B) with v93 (2,940,760 B)
  which includes Forge carousels, agent cards w/ FLUX portraits, Shaddai World nav
- public/SHADDAI-WORLD.html: added so static handler + /world route can serve it
- backend/server-production.js: added app.get('/world') before the catch-all at
  line 1438 so the dashboard iframe can load the world same-origin (not caught by *)
- public/index.html.v85-backup-YYYYMMDD-HHmm: safety copy of previous live build
```

### Push

```powershell
git push origin master
```

`render.yaml` has `autoDeploy: true`, so Render will pick up the push automatically and run `npm install && npm start`.

### Watch the deploy

In Render dashboard → Events tab, you will see the build log. The health-check endpoint is `/api/model/health` (from `render.yaml` line 15). Render marks the service live when that returns 200.

---

## 6. Rollback Plan

If something goes wrong after deploy:

### Option A — File restore (fast, no git history needed)

```powershell
# On your local machine — restore backup, re-commit, push
Copy-Item "public\index.html.v85-backup-YYYYMMDD-HHmm" "public\index.html" -Force
git add public/index.html
git commit -m "revert: restore v85 dashboard (rollback from v93 deploy)"
git push origin master
```

Render auto-deploys the revert within ~2 minutes.

### Option B — Git revert (cleaner)

```powershell
# Find the commit hash of the v93 deploy commit
git log --oneline -5
# Then revert it
git revert <deploy-commit-hash> --no-edit
git push origin master
```

### Option C — Render manual rollback

In Render dashboard → Deploys tab → find the previous successful deploy → click "Rollback to this deploy". This is instant (no git push needed) and is the fastest option if you just need to get the old version live while you investigate.

---

## 7. Pre-Flight Checklist

Work through this before pushing.

### Local verification

- [ ] `node _grid_preview.cjs` starts without error at `http://localhost:8123`
- [ ] Dashboard loads in browser — no red console errors on first paint
- [ ] "⬡ SHADDAI WORLD" button is visible in the nav bar
- [ ] Clicking World button triggers the portal animation (stars, warp)
- [ ] World iframe loads (may take a few seconds; check Network tab for `/world` 200)
- [ ] Agent portraits visible in World (check Network tab for `/api/forge/art/*.png` 200)
- [ ] Forge tab loads and archetype images display
- [ ] Agent cards show FLUX portraits (not placeholder SVGs)
- [ ] Exit World button (`← EXIT WORLD`) returns to the dashboard

### File checks

- [ ] `public/index.html` file size is ~2,940,760 bytes (v93)
- [ ] `public/SHADDAI-WORLD.html` exists and is non-empty
- [ ] Backup file `public/index.html.v85-backup-*` exists
- [ ] `backend/server-production.js` has the `/world` route **before** `app.get('*')`
- [ ] `backend/data/forge-art/` contains PNG files and they are committed (`git status` shows them tracked)

### Git checks

- [ ] `git status` shows only the intended files staged
- [ ] `git diff --staged` confirms the `/world` route was added to server-production.js
- [ ] No `.env` files or API keys accidentally staged

### Post-deploy verification (Render)

- [ ] Render deploy log shows `Server running on port ...` (no crash)
- [ ] `GET https://your-render-url.onrender.com/api/model/health` → 200
- [ ] `GET https://your-render-url.onrender.com/` → loads v93 dashboard (title in source reads `SHADDAI v91 · Sovereign AI Command` — correct)
- [ ] `GET https://your-render-url.onrender.com/world` → 200, returns Shaddai World HTML (not the dashboard)
- [ ] `GET https://your-render-url.onrender.com/api/forge/art/arch-vanguard.png` → 200, returns PNG bytes (or 404 if that specific file name differs — check actual filenames in `backend/data/forge-art/`)
- [ ] Open the live URL in browser, click World, confirm portal animation and world load

---

## 8. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| v85→v93 has a JS regression (13-day, multi-feature jump) | Medium | Local preview test before push; v85 backup ready for instant rollback |
| `backend/data/forge-art/*.png` not committed → 404 on portraits | Medium-High | Check `git status` / `git ls-files backend/data/forge-art/` before push |
| `/world` route placed AFTER `app.get('*')` (shadowed) | Low (this spec puts it before) | After deploy verify `GET /world` returns world HTML, not dashboard HTML |
| Render free plan cold-start makes world iframe time out | Low | Add `loading="lazy"` to iframe if needed; the portal animation buys ~3.4s |
| CSP blocks Three.js or WebGL in the world iframe | Low | unpkg.com is in `scriptSrc`; `'self'` is in `frameSrc`. Monitor browser console for CSP errors after deploy |
| `grid-module.js` importmap causes conflict if v93 ever adds `type="module"` scripts | Very low (not currently) | Keep importmap for now; revisit if module scripts are added |

---

## Appendix: Key Line Numbers (server-production.js)

| What | Line |
|---|---|
| `express.static('../public')` | 329 |
| Helmet / CSP setup | 345–393 |
| `app.use('/api/forge', ...)` | 680 |
| FRONTEND FALLBACK comment | 1430 |
| `app.get('/')` | 1434 |
| `app.get('*')` catch-all | 1438 |
| **New `/world` route goes here** | **1434 (insert before existing `app.get('/')`)** |

---

*Spec written by NEXUS. Reviewed scope: server-production.js (1,455 lines), forge-routes.js, _grid_preview.cjs, render.yaml, package.json, public/ directory, SHADDAI-DASHBOARD-v93.html (world section at lines 49455–49572).*

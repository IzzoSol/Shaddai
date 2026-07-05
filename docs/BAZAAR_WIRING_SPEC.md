# BAZAAR WIRING SPEC
## Wiring `SHADDAI-Marketplace-Floor.html` into the Dashboard + World
**Date:** 2026-06-21  
**Target:** `SHADDAI-DASHBOARD-v93.html`, `_grid_preview.cjs`, `backend/server-production.js`, `SHADDAI-WORLD.html`  
**Do NOT edit:** `SHADDAI-Marketplace-Floor.html` (the Floor is a drop-in asset — touch it only to add `postMessage` listeners)

---

## 0. What Exists Today (Read-Only Audit)

| File | Relevant fact |
|---|---|
| `SHADDAI-DASHBOARD-v93.html` | ~49 600 lines. Views toggled by `showView(v)` (defined line ~22459). Each view is `<div id="<v>View" class="view">`. `showView` is monkey-patched by several inline `<script>` blocks that wrap the previous value. |
| `#gridView` (line 49456) | `position:fixed;inset:0;z-index:1200` — fullscreen layer outside `#mainArea`. Contains `<iframe id="gridWorldFrame">`. Populated lazily: `src` is set to `/world` only on first `showView('grid')` call. Same pattern must be replicated. |
| `_grid_preview.cjs` | Zero-dep preview server. Three routes: `/` → dashboard, `/world` → `SHADDAI-WORLD.html`, `/api/forge/...` → forge-art images. Everything else 404s. |
| `backend/server-production.js` | Express, `public/` served statically (`express.static('../public')`). Catch-all `app.get('*')` sends `public/index.html`. Named routes (`/world`, `/bazaar`) must be added **before** the catch-all. |
| `public/` | Contains `SHADDAI-Collectables.html`, `marketplace-shop.html`, etc. **`SHADDAI-WORLD.html` is NOT in `public/`** — it lives at repo root alongside the dashboard. The `/world` route in `_grid_preview.cjs` serves it from root. Production must do the same. |
| `SHADDAI-Marketplace-Floor.html` | Lives at `C:\Users\Brittany\Desktop\SHADDAI-Marketplace-Floor.html` (outside the repo). 316 lines, self-contained canvas app (no deps beyond Google Fonts). Already emits `postMessage({type:'shaddai-floor', action, agent})` to `parent` on button clicks (line 303). The HUD/panel reference the 7 council agents by name. Agent images: none (uses procedural canvas sprites — portraits are NOT loaded). |
| `SHADDAI-WORLD.html` | Lives at repo root. 342 lines. Loads `/api/operatives` for dynamic agent list; falls back to hardcoded `COUNCIL` array that uses `/api/forge/art/agent-<name>.png`. Already expects same origin. |
| Existing "OPEN BAZAAR" button (line 38094 in dashboard) | `onclick="window.open('marketplace-shop.html','_blank')"` — opens `public/marketplace-shop.html` in a new tab. This is a different (lighter) file, not the Floor. The Floor wiring below adds a NEW dedicated `bazaarView`, leaving `marketplace-shop.html` untouched. |

---

## 1. Wiring the Bazaar as `bazaarView` (Rooms → Bazaar button → fullscreen iframe)

### 1-A. Copy the Floor file into the repo

The Floor file currently lives outside the repo. Copy it to root so both servers can serve it:

```
SHADDAI MASTER FINAL BUILD\SHADDAI-Marketplace-Floor.html   ← copy here
```

No edits required during copy. The procedural sprites in the Floor need no image paths.

---

### 1-B. Add the `/bazaar` route — `_grid_preview.cjs`

**Anchor:** the line  
```js
if (url === '/world') return sendFile(res, path.join(DIR, 'SHADDAI-WORLD.html')); // the real neon world (iframe target)
```

**Insert immediately after that line:**
```js
if (url === '/bazaar') return sendFile(res, path.join(DIR, 'SHADDAI-Marketplace-Floor.html')); // Neon Exchange floor
```

Complete context block after edit:
```js
if (url === '/' ) return sendFile(res, path.join(DIR, 'SHADDAI-DASHBOARD-v93.html'));
if (url === '/grid-module.js') return sendFile(res, path.join(DIR, 'grid-module.js'));
if (url === '/world') return sendFile(res, path.join(DIR, 'SHADDAI-WORLD.html'));
if (url === '/bazaar') return sendFile(res, path.join(DIR, 'SHADDAI-Marketplace-Floor.html')); // ← ADD
```

---

### 1-C. Add the `/bazaar` route — `backend/server-production.js`

**Anchor:** The FRONTEND FALLBACK block comment:
```js
// ============================================
// FRONTEND FALLBACK
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('*', (req, res) => {
```

**Insert before `app.get('*', ...)` (named routes must precede the catch-all):**
```js
// ── Named HTML pages (must be before the * catch-all) ──
app.get('/world', (req, res) => {
  res.sendFile(path.join(__dirname, '../SHADDAI-WORLD.html'));
});
app.get('/bazaar', (req, res) => {
  res.sendFile(path.join(__dirname, '../SHADDAI-Marketplace-Floor.html'));
});
```

> Note: `/world` is added at the same time (it was previously missing from production, relying on the catch-all sending `index.html` — which would break the world iframe in production).

---

### 1-D. Add `#bazaarView` to the dashboard

**Anchor:** The exact comment line:
```html
<!-- ════════ SHADDAI WORLD ════════ -->
```

**Insert the full `bazaarView` block immediately before that comment:**

```html
<!-- ════════ SHADDAI BAZAAR ════════ -->
<div id="bazaarView" class="view" style="display:none;position:fixed;inset:0;background:#060912;z-index:1100;overflow:hidden">
  <iframe id="bazaarFrame" title="SHADDAI Bazaar — Neon Exchange Floor"
    style="position:absolute;inset:0;width:100%;height:100%;border:0;display:block"
    allow="fullscreen"></iframe>
  <button onclick="showView('marketplace')" title="Exit Bazaar"
    style="position:absolute;top:16px;right:18px;z-index:20;
           background:rgba(232,184,75,0.10);border:1px solid rgba(232,184,75,0.4);
           color:#e8b84b;font-family:'Share Tech Mono',monospace;font-size:9px;
           padding:7px 14px;cursor:pointer;letter-spacing:0.12em;border-radius:4px;transition:all .2s"
    onmouseover="this.style.background='rgba(232,184,75,0.22)'"
    onmouseout="this.style.background='rgba(232,184,75,0.10)'">← EXIT BAZAAR</button>
</div>
<style>
#bazaarView.active { display:block !important; }
</style>
<script>
/* ════════ SHADDAI BAZAAR — lazy iframe load of SHADDAI-Marketplace-Floor.html at /bazaar.
   Pattern mirrors gridView / SHADDAI-WORLD exactly.
   postMessage listener: floor emits {type:'shaddai-floor', action, agent} on hire/chat/work clicks. */
(function(){
  const BAZAAR_URL = window.__SHADDAI_BAZAAR_URL || '/bazaar';
  let _loaded = false;

  const _prevSV2 = window.showView;
  if (typeof _prevSV2 === 'function') {
    window.showView = function(v) {
      const r = _prevSV2.apply(this, arguments);
      if (v === 'bazaar') {
        // Fullscreen layout fix (same as gridView)
        const el = document.getElementById('bazaarView');
        if (el) {
          el.style.marginTop = '0'; el.style.marginLeft = '0';
          el.style.marginRight = '0'; el.style.padding = '0';
          el.style.width = '100%'; el.style.boxSizing = 'border-box';
        }
        // Lazy-load the Floor iframe once
        const f = document.getElementById('bazaarFrame');
        if (f && !_loaded) { _loaded = true; f.setAttribute('src', BAZAAR_URL); }
      }
      return r;
    };
  }

  // Receive action messages from the Floor iframe
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'shaddai-floor') return;
    const { action, agent } = ev.data;
    if (action === 'hire') {
      // Bridge to the existing x402 hire flow
      if (typeof window.mktHire === 'function') window.mktHire(agent, 2);
      else if (typeof notify === 'function') notify('⚡ Hire ' + agent + ' via x402 — open Marketplace to confirm');
    } else if (action === 'chat') {
      if (typeof window.chatWithAgent === 'function') window.chatWithAgent(agent);
    } else if (action === 'work') {
      if (typeof notify === 'function') notify('🎬 ' + agent + ' work/clips — open Clips tab');
    }
  });
})();
</script>
<!-- ════════ /SHADDAI BAZAAR ════════ -->
```

> **Why z-index:1100, not 1200?** `gridView` (SHADDAI World) is 1200. The Bazaar should sit below it so triggering World still renders on top. Both sit above the normal `#mainArea` content.

---

### 1-E. Add an "Enter Bazaar" button under the Rooms area in the Marketplace view

The "Rooms" concept in the dashboard is embodied by the agent room system (`openAgentRoom()`) and the Pixel Office tab. The Marketplace header bar already has a row of buttons (line 38090–38097). The existing `🏬 OPEN BAZAAR` button at line 38094 currently opens `marketplace-shop.html` in a new tab.

**Two changes to that button row:**

**Change 1 — Retarget existing button to open the in-dashboard `bazaarView` instead of a new tab.**

Find the exact button string (anchor):
```html
onclick="window.open('marketplace-shop.html','_blank')" title="Open the 2D Bazaar — your shop, sell content &amp; agent work">🏬 OPEN BAZAAR</button>
```

Replace `onclick` value only (safest surgical edit):
```html
onclick="showView('bazaar')" title="Enter the Neon Exchange Floor — 2D Bazaar inside the dashboard">🏬 ENTER BAZAAR</button>
```

Full old string (unique in file):
```
onclick="window.open('marketplace-shop.html','_blank')" title="Open the 2D Bazaar — your shop, sell content &amp; agent work">🏬 OPEN BAZAAR</button>
```
Full new string:
```
onclick="showView('bazaar')" title="Enter the Neon Exchange Floor — 2D Bazaar inside the dashboard">🏬 ENTER BAZAAR</button>
```

**Change 2 — Add a second "Bazaar" entry point in the nav sidebar so it appears "under Rooms".**

Anchor — the sidebar nav button for Marketplace (line ~3493):
```html
<button class="sbt" onclick="showView('marketplace');lySetSb(this)"><span class="ic">🛒</span>Marketplace</button>
```

Insert **immediately after** that line:
```html
<button class="sbt" onclick="showView('bazaar');lySetSb(this)"><span class="ic">🏬</span>Bazaar Floor</button>
```

---

## 2. Marketplace Activity Panel Inside `SHADDAI-WORLD.html`

### Goal
A small persistent HUD widget in the bottom-right corner of the World canvas that shows live-simulated market activity (x402 ticker lines) and a "ENTER BAZAAR" shortcut. It must not obscure the minimap (bottom-left) or the hint bar (bottom-center).

### Placement anchor in `SHADDAI-WORLD.html`
The file ends with:
```html
  </div>
  <div id="cur"></div>

  <script>
```

### Insert before the `<script>` tag:

```html
<!-- ── MARKET PULSE HUD (bottom-right, world-overlay) ── -->
<div id="mktPulse" style="
  position:fixed;right:20px;bottom:20px;z-index:42;
  width:220px;background:rgba(4,8,18,.82);
  border:1px solid rgba(39,224,255,.28);border-radius:8px;
  backdrop-filter:blur(8px);overflow:hidden;pointer-events:auto;
  font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(174,187,214,.85)">
  <!-- header -->
  <div style="display:flex;justify-content:space-between;align-items:center;
              padding:7px 10px;border-bottom:1px solid rgba(39,224,255,.14);
              background:rgba(39,224,255,.05)">
    <span style="letter-spacing:2px;color:#27e0ff;font-size:8px">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;
                   background:#27e0ff;box-shadow:0 0 6px #27e0ff;
                   margin-right:5px;animation:mktDot 1.6s infinite"></span>
      NEON EXCHANGE
    </span>
    <button onclick="document.getElementById('mktPulse').style.display='none'"
      style="background:none;border:none;color:rgba(174,187,214,.5);
             cursor:pointer;font-size:11px;padding:0 2px;line-height:1">✕</button>
  </div>
  <!-- scrolling ticker -->
  <div style="height:72px;overflow:hidden;padding:4px 0">
    <div id="mktTickerInner"
      style="animation:mktScroll 22s linear infinite;padding:0 10px;line-height:2"></div>
  </div>
  <!-- enter bazaar button -->
  <div style="padding:7px 10px;border-top:1px solid rgba(39,224,255,.14)">
    <button id="mktEnterBtn"
      style="width:100%;padding:6px;background:linear-gradient(135deg,rgba(232,184,75,.15),rgba(232,184,75,.06));
             border:1px solid rgba(232,184,75,.45);border-radius:5px;color:#e8b84b;
             font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:1.5px;
             cursor:pointer;transition:all .18s"
      onmouseover="this.style.background='linear-gradient(135deg,rgba(232,184,75,.28),rgba(232,184,75,.12))'"
      onmouseout="this.style.background='linear-gradient(135deg,rgba(232,184,75,.15),rgba(232,184,75,.06))'"
      onclick="(function(){ try{ parent.showView('bazaar'); } catch(e){} window.open('/bazaar','_blank'); })()">
      🏬 ENTER BAZAAR
    </button>
  </div>
</div>
<style>
@keyframes mktDot { 50%{opacity:.3} }
@keyframes mktScroll { from{transform:translateY(0)} to{transform:translateY(-50%)} }
</style>
<script>
(function(){
  // Populate ticker with simulated x402 trades (mirrors Floor's ticker content)
  const AGENTS=['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'];
  const VERBS=['sold a skill','completed a job','earned via x402','ran a workflow','shipped a deliverable'];
  function rndItem(a){ return a[Math.random()*a.length|0]; }
  function mkLine(){ return '<span style="color:#27e0ff">'+rndItem(AGENTS)+'</span> '
    +rndItem(VERBS)+' <span style="color:#00e5a0">+$'+(Math.random()*40+5).toFixed(2)+'</span>'; }
  const lines=Array.from({length:14},mkLine);
  const inner=document.getElementById('mktTickerInner');
  if(inner){ inner.innerHTML=lines.map(l=>'<div>'+l+'</div>').join('')
    + lines.map(l=>'<div>'+l+'</div>').join(''); }  // duplicate for seamless loop
  // Refresh a random line every ~4 s so numbers feel live
  setInterval(function(){
    if(!inner)return;
    const divs=inner.querySelectorAll('div');
    const i=Math.random()*divs.length|0;
    if(divs[i]) divs[i].innerHTML=mkLine();
  }, 4000);
})();
</script>
```

> The "ENTER BAZAAR" button first tries `parent.showView('bazaar')` (works when World is inside the dashboard iframe), then falls back to `window.open('/bazaar','_blank')` (works when World is opened standalone).

---

## 3. Agent Data / Portrait Consistency

### Current state
| File | Agent list | Portrait source |
|---|---|---|
| `SHADDAI-Marketplace-Floor.html` | Hardcoded 7-council `AGENTS` array (line 111) | **None** — uses procedural canvas sprites only |
| `SHADDAI-WORLD.html` | `loadAgents()` fetches `/api/operatives`, falls back to hardcoded `COUNCIL` array | `/api/forge/art/agent-<name>.png` (FLUX portraits) |
| Dashboard `#marketplaceView` | Fetches `/api/operatives` | `/api/forge/art/arch-<archetype>.png` |

### No conflict to resolve today
The Floor uses only canvas-drawn procedural operatives — it never requests image paths. The World and Dashboard share `/api/forge/art/` paths and `/api/operatives`. No duplicate data definitions will collide.

### Future consistency rule (when Floor is updated to show portraits)
- Floor should use `/api/forge/art/agent-<codename.toLowerCase()>.png` matching the naming scheme already established in `SHADDAI-WORLD.html`.
- The 7-council fallback array in the Floor (`AGENTS`) uses the same `id` strings as the World's `COUNCIL` `codename` strings. Keep them in sync when either file's agent list changes.

### `postMessage` bridge ensures data flows upward
When a user clicks "Hire" in the Floor iframe, the Floor fires:
```js
parent.postMessage({type:'shaddai-floor', action:'hire', agent:'NEXUS'}, '*');
```
The dashboard listener (added in step 1-D) calls `window.mktHire(agent, 2)` — the same function used by the Marketplace view. This means hire events from the Bazaar flow through the same x402 path as dashboard hires.

---

## 4. Risks and Smallest First Slice

### Risk table

| Risk | Likelihood | Mitigation |
|---|---|---|
| `bazaarView` renders but Floor font (Google Fonts) fails in dev (no internet) | Low-medium | Floor degrades gracefully; monospace system font is the fallback |
| `parent.showView('bazaar')` throws when Floor is opened standalone (not in iframe) | Certain | Already handled: `try{ parent.showView('bazaar') }catch(e){}` then `window.open('/bazaar')` |
| Production `app.get('*')` catch-all intercepts `/bazaar` before the named route | High if order is wrong | Named routes must be inserted **before** `app.get('*', ...)`. The spec inserts them at the FRONTEND FALLBACK block which is the last section before catch-all. |
| `showView` monkey-patch chain breaks if any earlier patch throws | Low | Each patch wraps `_prevSV` via closure; the Bazaar patch follows the same defensive pattern as the World patch. |
| `z-index` conflict between `bazaarView` (1100) and modal overlay | None today — modals are ~500. If raised later, increase bazaarView to 1150. | Monitor |
| `/world` missing from production (currently only in `_grid_preview.cjs`) | Confirmed — both routes should be added in the same PR | Included in step 1-C |
| Floor's `AGENTS` array diverges from World's `COUNCIL` array if agent set changes | Low — both hardcode the same 7 | Add comment in both files pointing to each other |

### Smallest first slice (recommended order)

**Slice 1 — Route only (10 min, zero UI risk)**
- Copy `SHADDAI-Marketplace-Floor.html` to repo root.
- Add `/bazaar` to `_grid_preview.cjs`.
- Verify: `node _grid_preview.cjs`, open `http://localhost:8123/bazaar` — the canvas Floor loads standalone.

**Slice 2 — `bazaarView` HTML + style block only (15 min)**
- Insert the `bazaarView` div + `<style>` block before `<!-- ════════ SHADDAI WORLD ════════ -->`.
- Do NOT add the `<script>` block yet.
- Verify: open dashboard, run `showView('bazaar')` in console — the div becomes active (blank, iframe `src` not set yet). Exit works.

**Slice 3 — `<script>` block (lazy load + postMessage listener) (10 min)**
- Add the `<script>` block.
- Verify: `showView('bazaar')` now loads the Floor; clicking "Hire" in the panel fires the message; dashboard `notify()` shows "Hire X via x402".

**Slice 4 — Nav button + "ENTER BAZAAR" button retarget (5 min)**
- Add sidebar nav button for "Bazaar Floor".
- Retarget the existing `🏬 OPEN BAZAAR` button in the marketplace header.

**Slice 5 — Market Pulse HUD in SHADDAI-WORLD (15 min)**
- Add the HUD HTML + `<script>` to `SHADDAI-WORLD.html` before `<script>`.
- Verify via `_grid_preview.cjs` → `showView('grid')` → walk around world → bottom-right widget visible; "ENTER BAZAAR" opens Floor.

**Slice 6 — Production server routes (5 min)**
- Add `/world` and `/bazaar` named routes to `server-production.js` before the catch-all.
- Verify on Render after deploy.

Total estimated effort: ~55 minutes across 6 low-risk slices, each independently verifiable and rollback-safe.

---

## 5. File Change Summary

| File | Change type | Lines affected |
|---|---|---|
| `SHADDAI-Marketplace-Floor.html` (copy to repo root) | Copy only — no edits | — |
| `_grid_preview.cjs` | +1 line | After `/world` route |
| `backend/server-production.js` | +5 lines | Before `app.get('*', ...)` |
| `SHADDAI-DASHBOARD-v93.html` | +~65 lines (view block) + 2 line edits | Before `<!-- SHADDAI WORLD -->` comment; line 38094; line ~3493 |
| `SHADDAI-WORLD.html` | +~55 lines (HUD widget) | Before first `<script>` tag |

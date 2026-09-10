# 2D Realm — Dark Realm Siege Wiring + Forge-Character Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built-but-orphaned `dark-realm.js` Dragon/Castle siege system into `game.html`'s Dark Realm region, give the dashboard's dead `⚔️ Siege` stat real data, replace the generic `WORLD` dashboard tile with a NEXUS + player-agent entry scene, and delete the superseded `pixel-city.html` prototype.

**Architecture:** No new game systems are being authored. `dark-realm.js` (1086 lines) is a complete, self-contained module — phases, enemy waves, boss fight, its own attack-button UI panel, HUD text, and localStorage persistence are all already written. The work is exclusively *wiring*: loading the script, keeping a handful of `let`-scoped `game.html` globals mirrored onto `window` each frame (since `dark-realm.js` is a separate `<script>` file and can't see plain `let`/`const` bindings from another script), adding one missing function (`combat.js`'s `spawnDarkZone`) that `dark-realm.js` already calls but doesn't exist yet, and building a small new dashboard entry tile from the existing `pixel-people.js` character renderer.

**Tech Stack:** Vanilla JS, Canvas 2D, no build step, no bundler — every file here is served as-is from `public/`. No project-wide test runner covers these frontend files (repo's Jest tests are backend-only); verification is `node --check` for syntax on edited `.js` files plus manual/structural checks, called out per task.

**Spec:** `docs/superpowers/specs/2026-09-09-2d-realm-siege-and-entry-design.md`

## Global Constraints

- Do not touch `public/world-siege.js`, `public/SHADDAI-WORLD-3D.html`, or any `world-regions/*.js` file other than confirming `darkforest.js` is already loaded (it is — no edit needed).
- Do not build the campfire supply-cache trigger (`DarkRealm.searchCampfireCache`) — explicitly deferred per spec §4.1.
- Do not touch the dashboard's Worlds-tab structure beyond the one launcher tile named in Task 6 — the broader tab revamp is out of scope (spec §3, §6).
- `dark-realm.js`'s iso constants are hardcoded `TW=84, TH=42` — this already matches `game.html`'s `const TW=84, TH=42` (game.html:233) exactly; do not change either.
- Never call `DarkRealm.init()` more than once per page load — it calls `_resetState()` unconditionally, which would wipe an in-progress siege (gate HP, dragon HP, chain state) if re-invoked.

---

### Task 1: Delete the orphaned `pixel-city.html` prototype

**Files:**
- Delete: `public/pixel-city.html`

**Interfaces:** None — this file is referenced by zero other files.

- [ ] **Step 1: Confirm nothing references it**

Run: `grep -rn "pixel-city" public/*.html public/*.js`
Expected: no output (already confirmed during spec-writing, but re-verify — files may have changed).

- [ ] **Step 2: Delete the file**

```bash
git rm public/pixel-city.html
```

- [ ] **Step 3: Commit**

```bash
git commit -m "Remove orphaned pixel-city.html prototype, superseded by game.html"
```

---

### Task 2: Add `spawnDarkZone` and a dark-themed enemy roster to `combat.js`

**Files:**
- Modify: `public/combat.js`

**Interfaces:**
- Consumes: existing `makeEnemy(kind, col, row)`, `TYPES`, `clamp(v,lo,hi)`, `irnd(a,b)` helpers already defined in this file (all internal to the IIFE, no import needed).
- Produces: `window.Combat.spawnDarkZone(zoneNum, walkable, GW, GH)` — returns an array of enemy objects shaped exactly like `spawnFor`'s output (`{id,kind,col,row,tc,tr,hp,maxhp,speed,dmg,r,atkCd,dead,hitFlash,aggro,bob}`). `dark-realm.js` already calls this with `(zoneNum, walkableFn, GW, GH)` at three call sites (forest-zone waves, dragon's low-HP wraith summon) and guards on `window.Combat.spawnDarkZone` existing before calling — this task makes that guard pass. Also adds `TYPES.shade`, `TYPES.bonehound`, `TYPES.wraith`, `TYPES.cultist`, `TYPES.shadow_wraith`, `TYPES.gate_guardian` — `dark-realm.js`'s `_spawnGateGuardian()` (dark-realm.js:500-514) already pushes an enemy with `kind:'gate_guardian'` directly into `window.enemies`, and its dragon `<25%HP` handler already force-sets `e.kind='shadow_wraith'` on spawned enemies — both need a matching `TYPES` entry to render with `Combat.draw()` instead of silently falling back to the wolf sprite.

- [ ] **Step 1: Add the dark-themed TYPES entries and zone pool, right after the existing `TYPES` table (after line 57, before the `REGIONS` table)**

```javascript
  // dark realm enemy roster — shadow-themed, escalating across 5 forest zones
  var DARK_TYPES = {
    shade:         { name: 'Shade',         hp: 24,  speed: 2.3, dmg: 7,  r: 0.9, color: '#241a38', size: 1.0,  tough: 1.0, shape: 'beast',    eye: '#cc44ff' },
    bonehound:     { name: 'Bonehound',     hp: 34,  speed: 2.8, dmg: 9,  r: 0.9, color: '#2a2230', size: 1.05, tough: 1.3, shape: 'beast',    eye: '#ff4444' },
    wraith:        { name: 'Wraith',        hp: 40,  speed: 2.6, dmg: 11, r: 1.0, color: '#3a1a4a', size: 1.1,  tough: 1.6, shape: 'humanoid', eye: '#aa00ff', glow: '#8800cc' },
    cultist:       { name: 'Cultist',       hp: 46,  speed: 2.0, dmg: 13, r: 1.0, color: '#1a0f24', size: 1.1,  tough: 1.7, shape: 'humanoid', eye: '#ff0044' },
    shadow_wraith: { name: 'Shadow Wraith', hp: 60,  speed: 2.4, dmg: 14, r: 1.0, color: '#160a20', size: 1.2,  tough: 2.0, shape: 'humanoid', eye: '#dd00ff', glow: '#aa00ff' },
    gate_guardian: { name: 'Gate Guardian', hp: 160, speed: 1.4, dmg: 28, r: 1.2, color: '#241030', size: 1.6,  tough: 3.5, shape: 'golem',    eye: '#ff2266', glow: '#cc0044', boss: true }
  };
  for (var _dk in DARK_TYPES) { TYPES[_dk] = DARK_TYPES[_dk]; }

  // zone 1-5 enemy pools — variety and average toughness increase per zone
  var DARK_ZONE_POOL = [
    ['shade'],
    ['shade', 'bonehound'],
    ['shade', 'bonehound', 'wraith'],
    ['wraith', 'bonehound', 'cultist'],
    ['wraith', 'cultist', 'shadow_wraith']
  ];
```

- [ ] **Step 2: Add `spawnDarkZone`, right after the existing `spawnFor` function (after its closing brace, before the `// ---- update ----` comment)**

```javascript
  // ---- spawnDarkZone ---------------------------------------------------------
  function spawnDarkZone(zoneNum, walkable, GW, GH) {
    GW = GW || 52; GH = GH || 52;
    var zone = clamp(zoneNum || 1, 1, 5);
    var pool = DARK_ZONE_POOL[zone - 1];
    var wf = (typeof walkable === 'function') ? walkable : function () { return true; };
    var budget = clamp(4 + zone, 4, 9);
    var out = [];

    for (var i = 0; i < budget; i++) {
      var placed = false;
      for (var tryn = 0; tryn < 24 && !placed; tryn++) {
        var col = irnd(4, GW - 4);
        var row = irnd(4, GH - 4);
        if (!wf(col, row)) continue;
        var kind = pool[irnd(0, pool.length - 1)];
        var e = makeEnemy(kind, col + 0.5, row + 0.5);
        // scale toughness up slightly with zone so later zones stay a threat
        e.hp = e.maxhp = Math.round(e.hp * (1 + (zone - 1) * 0.12));
        out.push(e);
        placed = true;
      }
    }
    return out;
  }
```

- [ ] **Step 3: Expose it on `window.Combat`**

Find (near the end of the file):
```javascript
  window.Combat = {
    TYPES: TYPES,
    spawnFor: spawnFor,
    update: update,
    draw: draw,
    playerAttack: playerAttack
  };
```

Replace with:
```javascript
  window.Combat = {
    TYPES: TYPES,
    spawnFor: spawnFor,
    spawnDarkZone: spawnDarkZone,
    update: update,
    draw: draw,
    playerAttack: playerAttack
  };
```

- [ ] **Step 4: Syntax-check**

Run: `node --check public/combat.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/combat.js
git commit -m "Add spawnDarkZone + dark-themed enemy roster to combat.js"
```

---

### Task 3: Bootstrap-wire `dark-realm.js` into `game.html`

**Files:**
- Modify: `public/game.html`

**Interfaces:**
- Consumes: `window.DarkRealm.init()` (dark-realm.js public API), `window.RegionGen`/existing script-loading pattern already used for `world-regions/*.js` and `combat.js`.
- Produces: `window.DPR` (mirrors `game.html`'s local `DPR`), `window.regionSel` (mirrors the active region id) — both consumed by `dark-realm.js`'s `update()`/`render()` self-guards (`if (window.regionSel !== 'darkforest') return;`) and its screen-space math (`ctx.canvas.width / (window.DPR || 1)`).

- [ ] **Step 1: Load the script**

Find (around line 226-227):
```html
<script src="world-regions/darkforest.js" onerror="0"></script>
<script src="combat.js" onerror="0"></script>
```

Replace with:
```html
<script src="world-regions/darkforest.js" onerror="0"></script>
<script src="combat.js" onerror="0"></script>
<script src="dark-realm.js" onerror="0"></script>
```

- [ ] **Step 2: Mirror `DPR` onto `window` so `dark-realm.js`'s screen-space overlay isn't half-width on high-DPI screens**

Find (`fit()`, around line 238):
```javascript
function fit(){ DPR=Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight; c.width=W*DPR;c.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=false;
```

Add immediately after the `DPR=Math.min(...)` assignment on that same line:
```javascript
function fit(){ DPR=Math.min(devicePixelRatio||1,2); window.DPR=DPR; W=innerWidth; H=innerHeight; c.width=W*DPR;c.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=false;
```

- [ ] **Step 3: Call `DarkRealm.init()` once at bootstrap**

Find (around line 1253):
```javascript
fit(); setPreset(0);
```

Replace with:
```javascript
fit(); setPreset(0);
if(window.DarkRealm) DarkRealm.init();
```

- [ ] **Step 4: Keep `window.regionSel` in sync with the active region**

Find (`genWorld`, around line 456-458):
```javascript
function genWorld(rid){
  if(rid==='suburb' && region && region.id && region.id!=='suburb') window.SUBURB_FROM=region.id;  // theme suburb by where you arrived from
  region=REGIONS.find(r=>r.id===rid);
```

Replace with:
```javascript
function genWorld(rid){
  if(rid==='suburb' && region && region.id && region.id!=='suburb') window.SUBURB_FROM=region.id;  // theme suburb by where you arrived from
  region=REGIONS.find(r=>r.id===rid);
  window.regionSel=rid;
```

This is the single place `region` changes for every entry path (initial `enterWorld()` and later transit travel both call `genWorld(rid)`), so this one edit keeps `dark-realm.js`'s `window.regionSel` guard correct everywhere.

- [ ] **Step 5: Sanity-check the script loads**

Run: `grep -n "dark-realm.js" public/game.html`
Expected: one line, the `<script src="dark-realm.js" onerror="0"></script>` tag added in Step 1.

- [ ] **Step 6: Commit**

```bash
git add public/game.html
git commit -m "Bootstrap-wire dark-realm.js into game.html (script tag, DPR/regionSel sync, one-time init)"
```

---

### Task 4: Hook `dark-realm.js` into the per-frame update/render loop

**Files:**
- Modify: `public/game.html`

**Interfaces:**
- Consumes: `window.updateDarkRealm(dtMs, player, enemies)` and `window.renderDarkRealm(ctx, cam, TW, TH)` (both already defined at the bottom of `dark-realm.js` as thin wrappers around `DarkRealm.update`/`DarkRealm.render`).
- Produces: keeps `window.enemies`, `window.playerHP`, `window.playerMaxHP` mirrored to/from `game.html`'s local `enemies`/`playerHP`/`playerMaxHP` variables each frame while in Dark Realm — required because `dark-realm.js` reads and writes these via `window.*` (it's a separate `<script>` file; plain `let`-scoped bindings in `game.html`'s own inline script are invisible to it, unlike `function`-declared globals such as `toast`/`updateHP`/`walkable`, which auto-attach to `window` and need no extra wiring).

- [ ] **Step 1: Add the DarkRealm update call, right after the existing `Combat.update` block in the world-state `update()` function**

Find (around line 1052-1053):
```javascript
    if(window.Combat && enemies.length && !spectate){ const dmg=Combat.update(enemies, player, dt, walkable);
      if(dmg>0){ playerHP-=dmg; hurtFlash=0.35; try{ addFloat(player.col,player.row,'-'+Math.round(dmg),'#ff5a5a'); }catch(_){} player.__shake=Math.max(player.__shake||0,0.5); updateHP(); if(playerHP<=0) respawnPlayer(); } }
```

Add immediately after that block (still inside the same `if(state==='world')` branch):
```javascript
    { const sb=document.getElementById('siegeBtn');
      if(window.DarkRealm && region && region.id==='darkforest'){
        if(sb) sb.classList.remove('hide');
        window.enemies=enemies; window.playerHP=playerHP; window.playerMaxHP=playerMaxHP;
        updateDarkRealm(dt*1000, player, enemies);
        enemies=window.enemies; playerHP=window.playerHP;
        updateHP();
      } else if(sb) sb.classList.add('hide');
    }
```

Note the `dt*1000` — `game.html`'s `dt` (from `loop(time)`, line 1245) is in **seconds**; `dark-realm.js`'s internal timers (`CFG.SCHEDULED_INTERVAL`, `CFG.DOWN_REVIVE_MS`, `S.waveRespawnTimer`, etc.) are all millisecond-scale. Passing raw `dt` instead of `dt*1000` would make every Dark Realm timer run ~1000x too slowly.

- [ ] **Step 2: Add the DarkRealm render call, alongside the other post-restore render passes in `renderWorld()`**

Find (around line 1194):
```javascript
  drawBirds(time); drawAmbient(dk); drawVignette();
```

Replace with:
```javascript
  drawBirds(time); drawAmbient(dk); drawVignette();
  if(window.DarkRealm) renderDarkRealm(ctx,cam,TW,TH);
```

`renderDarkRealm` is safe to call unconditionally every frame — `DarkRealm.render()` self-guards on both `S.active` and `window.regionSel==='darkforest'` (dark-realm.js:739-741), so it no-ops outside an active Dark Realm siege.

- [ ] **Step 3: Structural check — confirm both hooks landed**

Run: `grep -n "updateDarkRealm\|renderDarkRealm" public/game.html`
Expected: two lines — the `updateDarkRealm(dt*1000, player, enemies);` call and the `renderDarkRealm(ctx,cam,TW,TH);` call.

- [ ] **Step 4: Commit**

```bash
git add public/game.html
git commit -m "Wire dark-realm.js into game.html's per-frame update/render loop"
```

---

### Task 5: Add the siege HUD button and its CSS

**Files:**
- Modify: `public/game.html`

**Interfaces:**
- Produces: `#siegeBtn` / `#siegeTxt` DOM elements — `dark-realm.js`'s `_updateHud()` (dark-realm.js:864-869, already written, no changes needed there) looks these up by id every frame while active and sets `#siegeTxt`'s text/color and toggles `#siegeBtn`'s `.siege-active` class. Task 4 Step 1 already toggles this button's own `.hide` class based on region.

- [ ] **Step 1: Add the button to the existing `#topbtns` toolbar**

Find (around line 125-133):
```html
<div id="topbtns" class="hide" style="position:fixed;right:16px;top:16px;z-index:6;display:flex;gap:8px">
  <button class="panel" style="padding:9px 13px;border-color:rgba(0,229,160,.3);color:#00e5a0;font-weight:700" onclick="location.href='index.html'">← Dashboard</button>
  <button class="panel" style="padding:9px 13px" onclick="openStore()">🛒 Store</button>
  <button class="panel" style="padding:9px 13px" onclick="openMarket()">🤝 Swap</button>
  <button class="panel" style="padding:9px 13px" onclick="openJobs()">💼 Work</button>
  <button class="panel" style="padding:9px 13px" onclick="openInv()">🎒 Bag</button>
  <button class="panel" style="padding:9px 13px" onclick="openRooms()">🏠 Rooms</button>
  <button class="panel" style="padding:9px 13px;border-color:rgba(0,255,156,.35);color:#00ff9c" onclick="openTactics()">⚔ Tactics</button>
</div>
```

Replace with:
```html
<div id="topbtns" class="hide" style="position:fixed;right:16px;top:16px;z-index:6;display:flex;gap:8px">
  <button class="panel" style="padding:9px 13px;border-color:rgba(0,229,160,.3);color:#00e5a0;font-weight:700" onclick="location.href='index.html'">← Dashboard</button>
  <button class="panel" style="padding:9px 13px" onclick="openStore()">🛒 Store</button>
  <button class="panel" style="padding:9px 13px" onclick="openMarket()">🤝 Swap</button>
  <button class="panel" style="padding:9px 13px" onclick="openJobs()">💼 Work</button>
  <button class="panel" style="padding:9px 13px" onclick="openInv()">🎒 Bag</button>
  <button class="panel" style="padding:9px 13px" onclick="openRooms()">🏠 Rooms</button>
  <button class="panel" style="padding:9px 13px;border-color:rgba(0,255,156,.35);color:#00ff9c" onclick="openTactics()">⚔ Tactics</button>
  <button id="siegeBtn" class="panel hide" style="padding:9px 13px;border-color:rgba(204,68,255,.4);color:#cc44ff;font-weight:700" onclick="if(window.DarkRealm)DarkRealm.openPanel()">☠ <span id="siegeTxt">—</span></button>
</div>
```

- [ ] **Step 2: Add the `.siege-active` pulse CSS, right before `</style>`**

Find (around line 62):
```html
</style></head><body>
```

Replace with:
```html
#siegeBtn.siege-active{animation:darkSiegePulse 1.1s ease-in-out infinite;}
@keyframes darkSiegePulse{0%,100%{box-shadow:0 0 0 0 rgba(204,68,255,.55)}50%{box-shadow:0 0 14px 4px rgba(204,68,255,.55)}}
</style></head><body>
```

- [ ] **Step 3: Structural check**

Run: `grep -n 'id="siegeBtn"\|id="siegeTxt"\|darkSiegePulse' public/game.html`
Expected: three matches (button, span, and the two CSS references — button rule + keyframes name, so likely 4 total including the keyframes definition line).

- [ ] **Step 4: Commit**

```bash
git add public/game.html
git commit -m "Add siege HUD button + pulse CSS to game.html"
```

---

### Task 6: Replace the dashboard's generic WORLD tile with a NEXUS + player-agent entry scene

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `window.PixelPeople.draw(ctx, rig, screenX, feetY, scale, t)` (pixel-people.js's public API — see `public/pixel-people.js:108`), `localStorage['shaddai.player']` (the `{name, rig, source}` shape `game.html` already writes at game.html:343).
- Produces: nothing consumed elsewhere — this is a self-contained dashboard widget.

- [ ] **Step 1: Load `pixel-people.js` on the dashboard**

Find (around line 4179):
```html
<script src="/pixel-office.js?v=19" defer></script>
```

Add immediately after it:
```html
<script src="/pixel-people.js"></script>
```

(Not `defer` — the tile's draw loop needs `window.PixelPeople` available as soon as the launcher renders; the script is 158 lines and has no dependencies of its own.)

- [ ] **Step 2: Replace the WORLD launcher tile markup**

Find (around line 5052-5058):
```html
        <button class="dl-tile" onclick="location.href='game.html'">
          <span class="dl-bg" style="background:radial-gradient(ellipse at 40% 32%, rgba(0,220,195,0.3) 0%, rgba(0,85,90,0.15) 45%, #01080a 88%)"></span>
          <span class="dl-overlay"></span>
          <span class="dl-icon" style="color:#00dcc3;text-shadow:0 0 22px #00dcc3,0 0 55px rgba(0,220,195,0.38)">⊕</span>
          <span class="dl-badge new">2D</span>
          <span class="dl-lbl">WORLD</span>
        </button>
```

Replace with:
```html
        <button class="dl-tile" id="worldEntryTile" onclick="location.href='game.html'">
          <span class="dl-bg" style="background:radial-gradient(ellipse at 40% 32%, rgba(0,220,195,0.3) 0%, rgba(0,85,90,0.15) 45%, #01080a 88%)"></span>
          <span class="dl-overlay"></span>
          <canvas id="worldEntryCv" width="160" height="160" style="position:absolute;top:44%;left:50%;transform:translate(-50%,-58%);width:74px;height:74px;z-index:3;pointer-events:none;image-rendering:pixelated"></canvas>
          <span id="worldEntryLine" style="position:absolute;left:6px;right:6px;top:8px;z-index:4;font-family:'Share Tech Mono',monospace;font-size:7.5px;letter-spacing:.5px;color:#5fe0ff;text-shadow:0 1px 4px #000;text-align:center;pointer-events:none"></span>
          <span class="dl-badge new">2D</span>
          <span class="dl-lbl">WORLD</span>
        </button>
```

- [ ] **Step 3: Add the draw loop and flavor-text rotation, right after the existing launcher click-glow script**

Find (around line 5077-5091):
```html
    <script>
      /* Launcher click-glow: inject a ripple ring per tile + fire the burst on press
         (pointerdown → before showView navigates away, so the animation is visible). GPU-only. */
      (function(){
        var L = document.getElementById('dashLauncher'); if (!L) return;
        L.querySelectorAll('.dl-tile').forEach(function(t){
          if (!t.querySelector('.dl-ring')) { var r = document.createElement('span'); r.className = 'dl-ring'; t.appendChild(r); }
        });
        L.addEventListener('pointerdown', function(e){
          var t = e.target.closest('.dl-tile'); if (!t) return;
          t.classList.remove('dl-burst'); void t.offsetWidth; t.classList.add('dl-burst');
          setTimeout(function(){ t.classList.remove('dl-burst'); }, 500);
        }, true);
      })();
    </script>
```

Add immediately after that `</script>` tag:
```html
    <script>
      /* WORLD tile: NEXUS + your own forged agent as the entry scene into game.html. */
      (function(){
        var cv=document.getElementById('worldEntryCv'); if(!cv) return;
        var ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false;
        var LINES=["The city's waiting.","Siege reports coming in from the Dark Realm.","Your agent's ready when you are.","The Forge never sleeps.","Council's online — 7/7."];
        var lineEl=document.getElementById('worldEntryLine');
        var NEXUS_RIG={robot:true,skin:'#8a9199',cap:'#e8c45c',shirt:'#6b7280',pants:'#3a3f47',led:'#e8c45c',emblem:'#e8c45c'};
        function playerRig(){ try{ var p=JSON.parse(localStorage.getItem('shaddai.player')||'null'); if(p&&p.rig) return p.rig; }catch(e){} return null; }
        function cycleLine(){ if(!lineEl) return; if(!playerRig()){ lineEl.textContent='Forge your agent first →'; return; } lineEl.textContent=LINES[(Math.random()*LINES.length)|0]; }
        cycleLine(); setInterval(cycleLine, 6000);
        function frame(t){
          if(!window.PixelPeople){ requestAnimationFrame(frame); return; }
          var PP=window.PixelPeople;
          ctx.clearRect(0,0,cv.width,cv.height);
          var rig=playerRig();
          if(rig){
            PP.draw(ctx, NEXUS_RIG, cv.width*0.34, cv.height*0.82, 1.5, t);
            PP.draw(ctx, rig, cv.width*0.66, cv.height*0.82, 1.5, t);
          } else {
            PP.draw(ctx, NEXUS_RIG, cv.width*0.5, cv.height*0.82, 1.9, t);
          }
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      })();
    </script>
```

- [ ] **Step 4: Structural check**

Run: `grep -n "worldEntryCv\|worldEntryTile\|worldEntryLine" public/index.html`
Expected: matches for the canvas id (markup + script), the tile id, and the flavor-text span id (markup + script) — no duplicates elsewhere in the file.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "Replace WORLD dashboard tile with NEXUS + forged-agent entry scene"
```

---

### Task 7: Wire the dashboard's `#dashSiege` stat to real Dark Realm state

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `localStorage['shaddai.darkRealm']` — already written by `dark-realm.js`'s `_savePersist()` (dark-realm.js:1041-1048) as `{active, phase, nextScheduled, gateHP, dragonHP, killCount, chains, contrib, poolSparks}`.

- [ ] **Step 1: Replace the fabricated "last Sunday of the month" countdown with real state**

Find (around line 5143-5172 — the entire `_nextSiegeSunday` and `_siegeCountdown` functions):
```javascript
      function _nextSiegeSunday() {
        var now = new Date();
        var y = now.getFullYear(), m = now.getMonth();
        // Last Sunday of the current month
        var lastDay = new Date(y, m+1, 0);
        var lastSun = new Date(lastDay);
        lastSun.setDate(lastDay.getDate() - lastDay.getDay());
        // If last Sunday already passed (or is today), use last Sunday of next month
        if (lastSun <= now) {
          var nextMonth = new Date(y, m+2, 0);
          lastSun = new Date(nextMonth);
          lastSun.setDate(nextMonth.getDate() - nextMonth.getDay());
        }
        lastSun.setHours(18, 0, 0, 0); // 6 PM siege start
        return lastSun;
      }
      function _siegeCountdown() {
        var el = document.getElementById('dashSiege');
        if (!el) return;
        var siege = _nextSiegeSunday();
        var diff = siege - new Date();
        if (diff <= 0) { el.textContent = 'NOW'; el.style.color='#ff3333'; return; }
        var days = Math.floor(diff / 86400000);
        var hrs = Math.floor((diff % 86400000) / 3600000);
        if (days > 0) { el.textContent = days+'d '+(hrs>0?hrs+'h':''); }
        else { var mins=Math.floor((diff%3600000)/60000); el.textContent=hrs+'h '+mins+'m'; }
        var urgent = days < 3;
        el.style.color = urgent ? '#ff3333' : '#ff8a8a';
        el.style.animation = urgent ? 'pulse 1.5s infinite' : 'none';
      }
```

Replace with:
```javascript
      function _siegeCountdown() {
        var el = document.getElementById('dashSiege');
        if (!el) return;
        var dr = null;
        try { dr = JSON.parse(localStorage.getItem('shaddai.darkRealm') || 'null'); } catch (_) {}
        if (!dr) { el.textContent = 'Unexplored'; el.style.color = '#ff8a8a'; el.style.animation = 'none'; return; }
        if (dr.active) {
          var phaseLabel = { forest: 'FOREST', moat: 'MOAT', gate: 'GATES', chains: 'CHAINS', final: 'DRAGON', victory: 'WON', defeat: 'LOST' };
          el.textContent = '☠ ' + (phaseLabel[dr.phase] || (dr.phase || 'ACTIVE').toUpperCase());
          el.style.color = '#ff3333';
          el.style.animation = 'pulse 1.5s infinite';
          return;
        }
        var diff = (dr.nextScheduled || 0) - Date.now();
        if (diff <= 0) { el.textContent = 'NOW'; el.style.color = '#ff3333'; el.style.animation = 'pulse 1.5s infinite'; return; }
        var hrs = Math.floor(diff / 3600000), mins = Math.floor((diff % 3600000) / 60000);
        el.textContent = hrs + 'h ' + mins + 'm';
        var urgent = diff < 900000; // under 15 minutes
        el.style.color = urgent ? '#ff3333' : '#ff8a8a';
        el.style.animation = urgent ? 'pulse 1.5s infinite' : 'none';
      }
```

- [ ] **Step 2: Confirm nothing else called the removed helper**

Run: `grep -n "_nextSiegeSunday" public/index.html`
Expected: no output (fully removed).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "Wire #dashSiege to real dark-realm.js state instead of a fabricated schedule"
```

---

## Final Verification (after all tasks)

- [ ] Run `node --check public/combat.js` — exit 0.
- [ ] Run `grep -rn "pixel-city" public/` — no output.
- [ ] Run `grep -n "dark-realm.js\|updateDarkRealm\|renderDarkRealm\|siegeBtn\|window.regionSel=rid\|window.DPR=DPR" public/game.html` — confirm every wiring point from Tasks 3-5 is present.
- [ ] Manual playtest (recommended, not automated per this session's working style — headless checks only unless the user asks for a browser walkthrough): open `game.html`, enter the Dark Realm region, confirm forest-zone enemies spawn with dark sprites (not wolves), the `☠` HUD button appears and opens the siege panel, and attack buttons respond. Open `index.html` and confirm the WORLD tile shows NEXUS (and your own agent, if one is forged) idle-animating, and `#dashSiege` shows real state instead of a fake weekly countdown.

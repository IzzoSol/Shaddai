# SHADDAI Utopia Land Economy — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Utopia land economy foundation to `game.html`: deed model, per-second reward streaming, district reserves, and the Signal travel mechanic with HUD bar.

**Architecture:** All Phase A state lives in `game.html` (client-side, localStorage). A minimal backend route exposes plot data for the dashboard. The deed model (CITY_PLOTS) extends the existing Founders' Row layout (FLOT). Signal is a new player resource alongside playerHP, draining on travel and triggering a 50-Sparks rescue fee at zero.

**Tech Stack:** Vanilla JS, HTML/CSS in `game.html` · Node.js + `economy-service.js` in `backend/server-production.js` · localStorage for client persistence

**Design spec:** `docs/superpowers/specs/2026-08-03-shaddai-utopia-land-economy-design.md`
**Playbook:** `C:\Users\Brittany\Documents\SHADDAI-SYSTEM\docs\UTOPIA_LAND_IMPROVEMENT_PLAYBOOK.md`

---

## File Map

| File | Change |
|---|---|
| `public/game.html` | All Phase A client-side changes (Tasks 1–7) |
| `backend/server-production.js` | New `/api/city/plots` and `/api/city/signal-drop` routes (Task 8) |
| `backend/economy-service.js` | Read-only — call existing `spend()` method |

---

## Task 1: Signal HUD bar (HTML + CSS)

**Files:** Modify `public/game.html` (around line 93)

The HP bar is at line 92–93 inside `<div id="hud">`. We add the Signal bar immediately after the HP bar row.

- [ ] **Step 1: Add Signal bar HTML after the HP bar row**

Find this exact string in `game.html` (line 93):
```html
  <div style="display:flex;align-items:center;gap:6px;margin-top:5px"><span id="hpTxt" style="color:#ff8a8a;font-size:12px;min-width:34px">❤ 100</span><div style="flex:1;height:7px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden"><div id="hpFill" style="width:100%;height:100%;background:#4fe07a;transition:width .2s,background .2s"></div></div></div></div>
```

Replace it with (the Signal bar row is inserted before the closing `</div>` of `#hud`):
```html
  <div style="display:flex;align-items:center;gap:6px;margin-top:5px"><span id="hpTxt" style="color:#ff8a8a;font-size:12px;min-width:34px">❤ 100</span><div style="flex:1;height:7px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden"><div id="hpFill" style="width:100%;height:100%;background:#4fe07a;transition:width .2s,background .2s"></div></div></div>
  <div style="display:flex;align-items:center;gap:6px;margin-top:3px"><span id="sigTxt" style="color:#00e5a0;font-size:12px;min-width:34px">📡 100</span><div style="flex:1;height:7px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden"><div id="sigFill" style="width:100%;height:100%;background:#00e5a0;transition:width .3s,background .3s"></div></div></div></div>
```

- [ ] **Step 2: Add `updateSignal()` function near `updateHP()`**

Find `function updateHP()` (line ~1324) and add right after it:
```js
function updateSignal(){ const f=document.getElementById('sigFill'),t=document.getElementById('sigTxt'); if(!f)return; const pct=Math.max(0,playerSignal)/playerMaxSignal*100; f.style.width=pct+'%'; f.style.background=pct>50?'#00e5a0':pct>20?'#e8c45c':'#e05a4f'; if(t)t.textContent='📡 '+Math.max(0,Math.ceil(playerSignal)); }
```

- [ ] **Step 3: Add Signal variable near `playerHP`**

Find line 344:
```js
let enemies=[], playerHP=100, playerMaxHP=100, hurtFlash=0, atkSwing=0;   // combat
```

Replace with:
```js
let enemies=[], playerHP=100, playerMaxHP=100, hurtFlash=0, atkSwing=0;   // combat
let playerSignal=100, playerMaxSignal=100;   // travel Signal — drains in unfamiliar districts
```

- [ ] **Step 4: Call `updateSignal()` inside `enterWorld()`**

Find in `function enterWorld()` (line ~306):
```js
genWorld(regionSel); updateHP();
```
Replace with:
```js
genWorld(regionSel); updateHP(); updateSignal();
```

- [ ] **Step 5: Verify in browser**

Open `http://localhost:3000/game.html`, enter the world. The HUD should show a green `📡 100` bar below the HP bar. No console errors.

- [ ] **Step 6: Commit**
```
git add public/game.html
git commit -m "feat(signal): add Signal HUD bar to world HUD"
```

---

## Task 2: Signal drain rates + regen zones

**Files:** Modify `public/game.html`

- [ ] **Step 1: Add `SIGNAL_DRAIN` config and `HOME_DISTRICT` constant**

Find the REGIONS array declaration (line ~271):
```js
const REGIONS=[
  {id:'agentcity',
```

Add these two constants immediately before the REGIONS line:
```js
const HOME_DISTRICT='agentcity';   // Signal never drains here
const SIGNAL_DRAIN={agentcity:0,meadow:0.8,forest:0.8,suburb:0,beach:1.5,city:1.2,desert:3.0,volcano:3.0};
```

- [ ] **Step 2: Wire drain + regen into `update(dt)`**

Find inside `function update(dt)` (line ~975) the movement block:
```js
if(state==='world'){
```

Inside that block, after the `if(mc||mr){...} else player.rig.anim='idle';` section, find `cam.col+=...`. Add the Signal drain/regen block immediately after `player.rig.anim='idle';`:

Locate the exact string:
```js
      else player.rig.anim='idle';
      cam.col+=(player.col-cam.col)*Math.min(1,dt*6); cam.row+=(player.row-cam.row)*Math.min(1,dt*6);
```

Replace with:
```js
      else player.rig.anim='idle';
      // Signal drain (walking in unfamiliar districts)
      if(!spectate){
        const moving=mc||mr;
        const drain=(SIGNAL_DRAIN[regionSel]||1.2)*(moving?1:0);
        // regen: near own office +5/s, near transit +2/s, base +0.05/s
        let regen=0.05;
        for(const p of props){
          const dc=Math.abs((p.col+( p.w||1)/2)-player.col), dr=Math.abs((p.row+(p.d||1)/2)-player.row);
          if(dc<3&&dr<3){ if(p.__source&&p.__office) regen=Math.max(regen,5); else if(p.kind==='transit') regen=Math.max(regen,2); }
        }
        playerSignal=Math.max(0,Math.min(playerMaxSignal,playerSignal+(regen-drain)*dt));
        updateSignal();
        if(playerSignal<=0) signalDrop();
      }
      cam.col+=(player.col-cam.col)*Math.min(1,dt*6); cam.row+=(player.row-cam.row)*Math.min(1,dt*6);
```

- [ ] **Step 3: Restore Signal to full on district entry**

Find inside the fade transition block (line ~973):
```js
    if(fadeV>=1&&pendingRegion){ genWorld(pendingRegion); regionSel=pendingRegion;
```

Add `playerSignal=playerMaxSignal; updateSignal();` after `updateHP();` in that block. Find:
```js
if(travelClockAdd){ tod=(tod+travelClockAdd)%1; travelClockAdd=0; } updateHP(); pendingRegion=null;
```
Replace with:
```js
if(travelClockAdd){ tod=(tod+travelClockAdd)%1; travelClockAdd=0; } updateHP(); playerSignal=playerMaxSignal; updateSignal(); pendingRegion=null;
```

- [ ] **Step 4: Verify**

Open the game, enter world in any non-agentcity region. Walk around — the Signal bar should slowly drain. Enter agentcity — Signal should stop draining. Walk to a transit building — bar should regen faster. No console errors.

- [ ] **Step 5: Commit**
```
git add public/game.html
git commit -m "feat(signal): drain by district, regen near offices/transit"
```

---

## Task 3: Signal Drop handler

**Files:** Modify `public/game.html`

When Signal hits 0: static flash → 50 Sparks deducted → respawn → Signal resets to 50.

- [ ] **Step 1: Add `signalDrop()` function near `respawnPlayer()`**

Find `function respawnPlayer()` (line ~1335) and add immediately before it:
```js
let _sigDropCooldown=0;   // prevent rapid re-trigger
function signalDrop(){
  if(_sigDropCooldown>0||playerSignal>0) return;
  _sigDropCooldown=4;   // 4s grace after drop
  playerSignal=50; updateSignal();
  const fee=50; money=Math.max(0,money-fee); saveEcon();
  hurtFlash=0.6;   // screen flash
  // respawn at own office if in founders row, else plaza
  let rx=Math.round(GW/2), ry=Math.round(GH/2);
  const office=props.find(p=>p.__source&&p.__office);
  if(office){ rx=office.col+1; ry=office.row+2; }
  player.col=rx; player.row=ry; cam.col=rx; cam.row=ry;
  if(!walkable(player.col,player.row)){ player.col=Math.round(GW/2); player.row=Math.round(GH/2); cam.col=player.col; cam.row=player.row; }
  toast('📡 Signal lost — rescue taxi 💵'+fee+' Sparks · signal restored to 50');
}
```

- [ ] **Step 2: Tick down `_sigDropCooldown` in `update(dt)`**

Find inside `update(dt)` the line:
```js
  if(jobCooldown>0) jobCooldown-=dt; if(fishCooldown>0) fishCooldown-=dt; if(gatherCooldown>0) gatherCooldown-=dt;
```
Replace with:
```js
  if(jobCooldown>0) jobCooldown-=dt; if(fishCooldown>0) fishCooldown-=dt; if(gatherCooldown>0) gatherCooldown-=dt; if(_sigDropCooldown>0) _sigDropCooldown-=dt;
```

- [ ] **Step 3: Verify**

In browser, open DevTools console. Run `playerSignal=1;` and walk for a second. The static flash should fire, wallet should lose 50, signal resets to 50, toast appears.

- [ ] **Step 4: Commit**
```
git add public/game.html
git commit -m "feat(signal): signal-drop handler — 50 Sparks rescue + respawn"
```

---

## Task 4: CITY_PLOTS deed model + district yield config

**Files:** Modify `public/game.html`

- [ ] **Step 1: Add `DISTRICT_YIELD` and `CITY_RESERVE` config**

Find line 1284:
```js
let money=120, credits=0; const inv={}, fish={};
```

Add the following block immediately before that line:
```js
// ===== UTOPIA LAND ECONOMY — Phase A =====
const DISTRICT_YIELD={agentcity:'Sparks',meadow:'Quill Credits',forest:'Turtle Credits',beach:'Oracle Credits',desert:'Pikadon Credits',city:'Sparks',volcano:'Nexus Credits',suburb:'Sparks'};

const CITY_RESERVE=(()=>{
  const r={};
  ['agentcity','meadow','forest','beach','desert','city','volcano','suburb'].forEach(id=>{
    r[id]={ balance:10000, _committed:{},
      available(plotId){ const used=Object.entries(this._committed).filter(([k])=>k!==plotId).reduce((s,[,v])=>s+v,0); return Math.max(0,this.balance-used); }
    };
  });
  return r;
})();

// 30 Founders' Row deed slots (mirrors office-service.slotCoords / FLOT layout)
const CITY_PLOTS=Array.from({length:30},(_,i)=>({
  id:'plot-founders-'+i, slot:i,
  col:6+(i%10)*5, row:4+((i/10)|0)*5,
  district:'agentcity',
  owner:null, deed:null,
  rate:0.5,           // Sparks/sec at base rate
  lastAccrual:Date.now(), claimable:0,
  boostLock:{amount:0,until:0},
  rooms:Array(8).fill(null), amenities:[],
  style:'default', name:null,
}));
// ===== END UTOPIA LAND ECONOMY =====
```

- [ ] **Step 2: Verify no syntax errors**

Open `http://localhost:3000/game.html` in browser. Open DevTools console. Run:
```js
console.log(CITY_PLOTS.length, CITY_RESERVE.agentcity.balance, DISTRICT_YIELD.forest)
```
Expected output: `30 10000 "Turtle Credits"`

- [ ] **Step 3: Commit**
```
git add public/game.html
git commit -m "feat(city): CITY_PLOTS deed model, CITY_RESERVE, DISTRICT_YIELD config"
```

---

## Task 5: `accrue()` + `cityTick()` streaming

**Files:** Modify `public/game.html`

- [ ] **Step 1: Add `accrue()` and `cityTick()` after the CITY_PLOTS block**

Find the comment `// ===== END UTOPIA LAND ECONOMY =====` added in Task 4 and replace it with:
```js
function accrue(plot){
  const now=Date.now();
  const elapsed=(now-plot.lastAccrual)/1000;
  plot.claimable+=plot.rate*elapsed;
  plot.lastAccrual=now;
  const res=CITY_RESERVE[plot.district];
  if(res) plot.claimable=Math.min(plot.claimable,res.available(plot.id));
}
function cityTick(){
  CITY_PLOTS.forEach(p=>{ if(p.owner) accrue(p); });
  saveCity();
}
setInterval(cityTick,5000);   // accrue every 5 seconds
// ===== END UTOPIA LAND ECONOMY =====
```

- [ ] **Step 2: Verify streaming**

In DevTools console:
```js
// Give plot 0 an owner and watch claimable grow
CITY_PLOTS[0].owner='test-user';
// Wait 6 seconds then check:
setTimeout(()=>console.log('claimable:',CITY_PLOTS[0].claimable),6000);
```
Expected: `claimable: 3` (0.5 rate × 6 seconds)

- [ ] **Step 3: Commit**
```
git add public/game.html
git commit -m "feat(city): accrue() streaming + cityTick every 5s"
```

---

## Task 6: `saveCity()` + `loadCity()` persistence

**Files:** Modify `public/game.html`

- [ ] **Step 1: Add `saveCity()` and `loadCity()` near `saveEcon()`**

Find `function saveEcon()` (line ~1302) and add immediately after it:
```js
function saveCity(){
  try{ localStorage.setItem('shaddai.city',JSON.stringify(
    CITY_PLOTS.map(p=>({id:p.id,slot:p.slot,owner:p.owner,deed:p.deed,claimable:p.claimable,lastAccrual:p.lastAccrual,boostLock:p.boostLock,name:p.name,rooms:p.rooms,amenities:p.amenities}))
  )); }catch(_){}
}
function loadCity(){
  try{
    const saved=JSON.parse(localStorage.getItem('shaddai.city')||'[]');
    saved.forEach(s=>{
      const p=CITY_PLOTS.find(x=>x.id===s.id); if(!p)return;
      p.owner=s.owner||null; p.deed=s.deed||null;
      p.claimable=typeof s.claimable==='number'?s.claimable:0;
      p.lastAccrual=Date.now();   // reset accrual clock to now on load
      p.boostLock=s.boostLock||{amount:0,until:0};
      p.name=s.name||null; p.rooms=s.rooms||Array(8).fill(null); p.amenities=s.amenities||[];
    });
  }catch(_){}
}
```

- [ ] **Step 2: Call `loadCity()` at boot**

Find line 1892:
```js
loadEcon();
connectMP();
```
Replace with:
```js
loadEcon();
loadCity();
connectMP();
```

- [ ] **Step 3: Verify persistence**

In DevTools console:
```js
CITY_PLOTS[0].owner='test-user'; CITY_PLOTS[0].claimable=42;
saveCity();
// reload the page, then:
console.log(CITY_PLOTS[0].owner, CITY_PLOTS[0].claimable);
```
Expected after reload: `"test-user" 42`

- [ ] **Step 4: Commit**
```
git add public/game.html
git commit -m "feat(city): saveCity/loadCity persistence via localStorage"
```

---

## Task 7: Claim panel UI

**Files:** Modify `public/game.html`

When the player is near their owned plot building in agentcity, show a floating "Claim Yield" button. Claiming adds the accrued amount to `money` and deducts from CITY_RESERVE.

- [ ] **Step 1: Add the claim panel HTML**

Find in the HTML section (around line 91) the `<div id="hud"` element. After the closing `</div>` of the HUD (the one that ends the whole `id="hud"` block), add:
```html
<!-- CITY CLAIM PANEL -->
<div id="claimPanel" class="panel hide" style="position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:10;padding:14px 20px;text-align:center;min-width:200px">
  <div id="claimTitle" style="font-weight:700;font-size:14px;margin-bottom:4px">📦 Your Plot</div>
  <div id="claimAmt" style="color:#00e5a0;font-size:22px;font-weight:700;margin-bottom:10px">0 Sparks</div>
  <button onclick="claimYield()" style="background:#00e5a0;color:#06080b;font-weight:700;border:none;padding:8px 22px;border-radius:6px;cursor:pointer;font-size:14px">Claim</button>
  <div style="font-size:11px;color:#5a6a7a;margin-top:6px" id="claimReserve"></div>
</div>
```

- [ ] **Step 2: Add `claimYield()` and `updateClaimPanel()` functions**

Add these two functions right after `function loadCity()` from Task 6:
```js
function updateClaimPanel(){
  if(state!=='world'||spectate||regionSel!=='agentcity'){ document.getElementById('claimPanel').classList.add('hide'); return; }
  const uid=window.__shd_uid||(localStorage.getItem('shd_signed_in')); if(!uid){ document.getElementById('claimPanel').classList.add('hide'); return; }
  const myPlot=CITY_PLOTS.find(p=>p.owner===uid&&props.some(b=>b.type==='building'&&b.__office&&Math.abs(b.col-p.col)<3&&Math.abs(b.row-p.row)<3&&Math.abs((b.col+1)-player.col)<3&&Math.abs((b.row+2)-player.row)<3));
  const panel=document.getElementById('claimPanel');
  if(!myPlot){ panel.classList.add('hide'); return; }
  accrue(myPlot);
  panel.classList.remove('hide');
  document.getElementById('claimTitle').textContent='📦 '+((myPlot.name||'Plot #'+(myPlot.slot+1)));
  document.getElementById('claimAmt').textContent=myPlot.claimable.toFixed(2)+' Sparks';
  const res=CITY_RESERVE[myPlot.district]; document.getElementById('claimReserve').textContent='Reserve: '+(res?res.available(myPlot.id).toFixed(0):0)+' available';
}
function claimYield(){
  const uid=window.__shd_uid||(localStorage.getItem('shd_signed_in')); if(!uid){ toast('Sign in to claim yield'); return; }
  const myPlot=CITY_PLOTS.find(p=>p.owner===uid);
  if(!myPlot||myPlot.claimable<0.01){ toast('Nothing to claim yet'); return; }
  accrue(myPlot);
  const amt=Math.floor(myPlot.claimable);
  if(amt<1){ toast('Accruing — check back soon'); return; }
  const res=CITY_RESERVE[myPlot.district];
  if(res){ const avail=res.available(myPlot.id); if(amt>avail){ toast('Reserve low — only '+avail.toFixed(0)+' available'); return; } res.balance-=amt; }
  myPlot.claimable-=amt;
  money+=amt; saveEcon(); saveCity();
  updateClaimPanel();
  toast('✅ Claimed '+amt+' '+DISTRICT_YIELD[myPlot.district]+' → added to wallet');
  if(typeof addFloat==='function') addFloat(player.col,player.row,'+'+amt+' 📡','#00e5a0');
}
```

- [ ] **Step 3: Call `updateClaimPanel()` inside `update(dt)`**

Find inside `update(dt)` the line that starts with `if(hurtFlash>0) hurtFlash-=dt;` (line ~995). Add the panel update call at the end of the `if(state==='world')` block, just before its closing `}`. Find the existing line:
```js
    if(hurtFlash>0) hurtFlash-=dt; if(atkSwing>0) atkSwing-=dt;
```
After the full combat block, look for where the world-state block ends. The simplest place: right after the Signal drop block you added in Task 2, add:
```js
        updateClaimPanel();
```
(inside the `if(state==='world'){ if(!spectate){` block, after `if(playerSignal<=0) signalDrop();`)

- [ ] **Step 4: Verify**

In DevTools console, set plot 0 owner to your UID:
```js
CITY_PLOTS[0].owner = localStorage.getItem('shd_signed_in') || 'test';
```
Walk near the office at `col:6, row:4`. The claim panel should appear showing accrued Sparks. Click Claim — wallet increases, toast fires. Panel hides when you walk away.

- [ ] **Step 5: Commit**
```
git add public/game.html
git commit -m "feat(city): claim panel — near-plot yield claim with reserve check"
```

---

## Task 8: Backend city routes (minimal)

**Files:** Modify `backend/server-production.js`

Two endpoints: `GET /api/city/plots` (returns CITY_PLOTS seed data for the dashboard to display) and `POST /api/city/signal-drop` (records the rescue fee server-side via economy-service for future full-sync).

- [ ] **Step 1: Find the route mount point in `server-production.js`**

Search for a block like `app.get('/api/city/offices'` or `app.use('/api'` to find where to add the new routes. Use Grep:
```
grep -n "api/city" backend/server-production.js
```

- [ ] **Step 2: Add city routes after the existing `/api/city/offices` route**

Find the existing `/api/city/offices` route block. Add the following routes immediately after it:
```js
// --- city plots (Phase A seed data) ---
app.get('/api/city/plots', (req, res) => {
  const plots = Array.from({length: 30}, (_, i) => ({
    id: 'plot-founders-' + i,
    slot: i,
    col: 6 + (i % 10) * 5,
    row: 4 + ((i / 10) | 0) * 5,
    district: 'agentcity',
    rate: 0.5,
  }));
  res.json({ plots });
});

// --- signal-drop rescue fee (records spend server-side) ---
app.post('/api/city/signal-drop', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.body?.userId;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const econ = require('./economy-service').getInstance();
    const key = 'signal-drop-' + userId + '-' + Date.now();
    await econ.spend(userId, 50, 'Signal rescue taxi fee', key);
    res.json({ ok: true, deducted: 50 });
  } catch (err) {
    // insufficient funds → just record client-side, don't block gameplay
    res.json({ ok: true, note: 'recorded client-side only', reason: err.message });
  }
});
```

- [ ] **Step 3: Restart the local backend and verify**
```powershell
# Kill existing server, then:
node backend/server-production.js
```
Then test:
```powershell
curl http://localhost:3000/api/city/plots
```
Expected: `{"plots":[{"id":"plot-founders-0","slot":0,...},...]}`

```powershell
curl -X POST http://localhost:3000/api/city/signal-drop -H "x-user-id: test-user" -H "Content-Type: application/json" -d "{}"
```
Expected: `{"ok":true,...}`

- [ ] **Step 4: Wire signal-drop call from game.html (fire-and-forget)**

In the `signalDrop()` function added in Task 3, after `money=Math.max(0,money-fee); saveEcon();`, add:
```js
  // record server-side (fire-and-forget, non-blocking)
  const uid=window.__shd_uid||localStorage.getItem('shd_signed_in');
  if(uid) fetch('/api/city/signal-drop',{method:'POST',headers:{'Content-Type':'application/json','x-user-id':uid},body:'{}',keepalive:true}).catch(()=>{});
```

- [ ] **Step 5: Commit**
```
git add backend/server-production.js public/game.html
git commit -m "feat(city): backend city routes — plots seed + signal-drop endpoint"
```

---

## Task 9: Smoke-test Phase A end-to-end

- [ ] **Step 1: Open game at `http://localhost:3000/game.html`**
- [ ] **Step 2: Enter the world in agentcity. Confirm Signal bar shows at 100.**
- [ ] **Step 3: Travel to Desert district. Confirm Signal bar drains faster.**
- [ ] **Step 4: Walk to a transit building. Confirm Signal regens.**
- [ ] **Step 5: Force signal drop**
  ```js
  playerSignal = 1;
  ```
  Walk one step. Confirm: toast fires, wallet loses 50, signal resets to 50.
- [ ] **Step 6: Assign a plot and verify streaming**
  ```js
  CITY_PLOTS[2].owner = localStorage.getItem('shd_signed_in') || 'test';
  saveCity();
  ```
  Wait 6 seconds. Open console: `CITY_PLOTS[2].claimable` should be ~3.
- [ ] **Step 7: Walk to the Founders' Row building at col 16, row 4**
  Claim panel should appear. Click Claim. Wallet increases.
- [ ] **Step 8: Reload page. Confirm plot ownership + claimable persisted.**
- [ ] **Step 9: Final commit and push**
  ```
  git add -p   # review all changes
  git commit -m "feat(city): Phase A complete — deed model, streaming, Signal mechanic, claim panel"
  git push
  ```

---

## Self-Review: Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Deed model — CITY_PLOTS with {owner, district, rate, lastAccrual, claimable} | Task 4 |
| Per-second accrual via accrue() + tick | Task 5 |
| CITY_RESERVE per district, claimable ≤ reserve | Tasks 4+5 |
| District → yield asset mapping | Task 4 |
| saveCity() / loadCity() persist | Task 6 |
| Signal HUD bar | Task 1 |
| Signal drain by district, regen near office/transit | Task 2 |
| Signal Drop: 50 Sparks penalty + respawn | Task 3 |
| Claim action UI | Task 7 |
| Backend city endpoints | Task 8 |
| Reserve rule non-negotiable | Task 5+7 (clamp in accrue, check in claimYield) |
| `claimable` displays in real time | Task 7 (updateClaimPanel calls accrue on each frame) |

> **Note:** Tasks are Sonnet-friendly. The only Opus-worthy task is a full visual revamp (Phase B) — that's the next plan.

---

*Plan written 2026-08-03. Implements spec: `docs/superpowers/specs/2026-08-03-shaddai-utopia-land-economy-design.md` Phase A.*

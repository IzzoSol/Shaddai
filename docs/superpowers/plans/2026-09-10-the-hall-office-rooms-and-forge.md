# The Hall — 7 Office Rooms + Forge Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 office-lead character presets and office/job/class-tint metadata to `pixel-people.js`, let players pick their office in the Forge (`pixel-forge.html`), and add a new "The Hall" dashboard section (`index.html`) with 7 agent rooms, each a themed front door to that agent's existing `/api/agents/route` chat.

**Architecture:** Purely additive. No new backend, no new payment code, no new rendering engine. `rig.office`/`rig.jobTint`/`rig.classTint` are optional fields carried on the existing rig object wherever it already travels (gallery, `shaddai.player`, the `/api/operatives` POST) — every existing call site that passes `rig` around keeps working unchanged, since nothing reads or requires these new fields except the new code this plan adds.

**Tech Stack:** Vanilla JS, Canvas 2D, no build step — same as the rest of the SHADDAI frontend.

**Spec:** `docs/superpowers/specs/2026-09-10-the-hall-office-rooms-and-forge-design.md`

## Global Constraints

- No changes to the existing "Office" view (`#officeView`, land economy/plots) — The Hall is a
  separate, new section.
- No fal spend, no PayBox/x402 wiring — that's Phase 2 of `docs/SHADDAI_HALL_MASTER_BUILD_BIBLE.md`,
  out of scope here.
- The 7 office-lead rig objects must be copied verbatim from `game.html`'s existing `AGENTS` array
  (game.html:394-402) — do not invent new colors/palettes. This guarantees the Hall, the Forge, and
  the 2D world all render the same character for the same agent.
- All 100 existing `pixel-people.js` `PRESETS` must render identically after this change — the new
  fields are additive only.
- Every agent chat call goes through the existing `POST /api/agents/route` with
  `{message, agentName, history}` (established pattern at `index.html:23025-23030`) — no new
  backend route.

---

### Task 1: Add 7 office-lead presets to `pixel-people.js`

**Files:**
- Modify: `public/pixel-people.js`

**Interfaces:**
- Produces: `PixelPeople.PRESETS` grows from 100 to 107 entries. The 7 new entries have shape
  `{name: 'Council', rig: {...agent rig fields..., office: '<id>'}}` — `name: 'Council'` so
  Task 4's Forge tab filter can group them, `rig.office` so Task 3/5 can key off which agent a
  preset/instance belongs to.

- [ ] **Step 1: Add the 7 office-lead presets, appended after the existing 100-preset loop (after
  the closing of the `for (let i=0;i<100;i++){...}` loop, before `function randomRig(){...}`)**

Find (the end of the existing preset-generation loop):
```javascript
  const PRESETS = [];
  for (let i=0;i<100;i++){
    let rig;
    if (i>=90){ rig=robotFrom(ROBOT_SCHEMES[i-90]); }   // exactly 10 robots, each a different colour
    else { rig=ARCH[i%ARCH.length](SKIN[i%SKIN.length]); }
    rig.__phase = i*0.37;
    PRESETS.push({ name: rig.name || 'Citizen', rig });
  }
  function randomRig(){ SEED=(Date.now?0:0, (SEED*16807+1)&0x7fffffff); const i=(Math.abs(SEED)%PRESETS.length);
```

Replace with (adds the 7 office-lead presets right after the existing 100, before `randomRig`):
```javascript
  const PRESETS = [];
  for (let i=0;i<100;i++){
    let rig;
    if (i>=90){ rig=robotFrom(ROBOT_SCHEMES[i-90]); }   // exactly 10 robots, each a different colour
    else { rig=ARCH[i%ARCH.length](SKIN[i%SKIN.length]); }
    rig.__phase = i*0.37;
    PRESETS.push({ name: rig.name || 'Citizen', rig });
  }
  // ── 7 office-lead presets — rig fields copied verbatim from game.html's AGENTS array so the
  // Forge, the Hall, and the 2D world all render the exact same character per agent. ──
  const OFFICE_LEADS = [
    { office:'shaddai', rig:{suit:'#241f44',cap:'#c9a6ff',tie:'#ffd45c',emblem:'#ffd45c',skin:'#f0c199'} },
    { office:'oracle',  rig:{hoodie:'#3a2f5a',hoodUp:true,emblem:'#8b7bf0',skin:'#e7b58a'} },
    { office:'quill',   rig:{suit:'#173a4a',cap:'#5fe0ff',tie:'#5fe0ff',glasses:true,skin:'#f0c199'} },
    { office:'turtle',  rig:{hoodie:'#1f5a44',cap:'#00ff9c',emblem:'#00ff9c',skin:'#caa06f'} },
    { office:'nexus',   rig:{robot:true,skin:'#8a9199',cap:'#e8c45c',shirt:'#6b7280',pants:'#3a3f47',led:'#e8c45c',emblem:'#e8c45c'} },
    { office:'zerox',   rig:{suit:'#3a2a1a',cap:'#ff9a3c',tie:'#ff9a3c',emblem:'#ff9a3c',skin:'#caa06f'} },
    { office:'pikadon', rig:{jacket:'#331616',cap:'#ff5a4d',emblem:'#ff5a4d',shoeStyle:'boot',skin:'#8a5a3a'} },
  ];
  OFFICE_LEADS.forEach(function(o, i){
    const rig = Object.assign({}, o.rig, { office:o.office, __phase:(100+i)*0.37 });
    PRESETS.push({ name:'Council', rig });
  });
  function randomRig(){ SEED=(Date.now?0:0, (SEED*16807+1)&0x7fffffff); const i=(Math.abs(SEED)%PRESETS.length);
```

- [ ] **Step 2: Sanity-check the file loads and the preset count is right**

Run: `node --check public/pixel-people.js`
Expected: no output (exit 0).

Run: `node -e "const fs=require('fs'); const src=fs.readFileSync('public/pixel-people.js','utf8').replace('window.PixelPeople','globalThis.PixelPeople'); global.window={}; eval(src); console.log('preset count:', window.PixelPeople.PRESETS.length); console.log('offices:', window.PixelPeople.PRESETS.filter(p=>p.rig.office).map(p=>p.rig.office));"`
Expected: `preset count: 107` and `offices: [ 'shaddai', 'oracle', 'quill', 'turtle', 'nexus', 'zerox', 'pikadon' ]`

- [ ] **Step 3: Commit**

```bash
git add public/pixel-people.js
git commit -m "Add 7 office-lead presets to pixel-people.js, copied from game.html's AGENTS"
```

---

### Task 2: Add `office`/`jobTint`/`classTint` awareness to `pixel-people.js`'s docs comment

**Files:**
- Modify: `public/pixel-people.js`

**Interfaces:** None — this is a documentation-only step so future readers of the file know these
fields exist and are safe to add to any rig. No behavior change.

- [ ] **Step 1: Update the file's header comment to document the new optional fields**

Find (the file's top-of-file doc comment, the `rig fields:` line):
```javascript
 * rig fields: skin, hair, cap, shirt|hoodie|suit|jacket|dress, pants, shoe,
 *   shoeStyle(sneaker|boot|dress|heel), glasses, short, hoodUp, mohawk, robot,
 *   led, emblem, logo, tie, watch, anim('idle'|'walk'), __phase
```

Replace with:
```javascript
 * rig fields: skin, hair, cap, shirt|hoodie|suit|jacket|dress, pants, shoe,
 *   shoeStyle(sneaker|boot|dress|heel), glasses, short, hoodUp, mohawk, robot,
 *   led, emblem, logo, tie, watch, anim('idle'|'walk'), __phase
 * optional metadata (ignored by draw(), carried through JSON clone/save so it survives
 * everywhere a rig is persisted — gallery, shaddai.player, /api/operatives):
 *   office('shaddai'|'zerox'|'oracle'|'nexus'|'turtle'|'quill'|'pikadon'|undefined),
 *   jobTint('coder'|'designer'|'writer'|'researcher'|'trader'|'coach'|'builder'|undefined),
 *   classTint('warrior'|'mage'|'rogue'|'cleric'|'ranger'|'bard'|undefined)
```

- [ ] **Step 2: Commit**

```bash
git add public/pixel-people.js
git commit -m "Document office/jobTint/classTint optional rig fields in pixel-people.js"
```

---

### Task 3: Add the office picker to `pixel-forge.html`

**Files:**
- Modify: `public/pixel-forge.html`

**Interfaces:**
- Consumes: `PixelPeople.PRESETS` (Task 1's 7 new `office`-tagged entries), the existing
  `swatches()`/`.crow`/`.clabel` CSS/JS pattern already in this file.
- Produces: `rig.office` set on the working `rig` object before `pfForge()` saves it — no change
  needed to `pfForge()` itself, since `office` lives inside `rig` and `rig` is already
  deep-cloned and saved wholesale (`out.rig = JSON.parse(JSON.stringify(rig))`, pixel-forge.html:369).

- [ ] **Step 1: Add "Council" to the tab rail so office-lead presets are browsable in the filmstrip**

Find (`ARCHES` array):
```javascript
const ARCHES=['All','Suit','Casual','Hoodie','Athlete','Punk','Elder','Dress','Worker','Robot'];
```

Replace with:
```javascript
const ARCHES=['All','Council','Suit','Casual','Hoodie','Athlete','Punk','Elder','Dress','Worker','Robot'];
```

- [ ] **Step 2: Add an Office picker row at the top of the customize panel**

Find:
```html
<div class="cust" id="cust">
  <div class="crow"><div class="clabel">Skin</div><div class="sw" id="sw-skin"></div></div>
```

Replace with:
```html
<div class="cust" id="cust">
  <div class="crow"><div class="clabel">Office</div><div class="styrow" id="sty-office"></div></div>
  <div class="crow"><div class="clabel">Skin</div><div class="sw" id="sw-skin"></div></div>
```

- [ ] **Step 3: Build the office row — add to `buildCust()`, and define the office list + colors**

Find (top of the script, right after the existing palette constants):
```javascript
const TOPTYPES=['shirt','hoodie','suit','jacket','dress'];
const SHOETYPES=['sneaker','boot','dress','heel'];
```

Replace with (adds the office list with each agent's exact accent color, copied from
`game.html`'s `AGENTS` array so the picker's highlight color matches the character it selects):
```javascript
const TOPTYPES=['shirt','hoodie','suit','jacket','dress'];
const SHOETYPES=['sneaker','boot','dress','heel'];
const OFFICES=[
  {id:'shaddai', label:'SHADDAI', accent:'#c9a6ff'},
  {id:'oracle',  label:'ORACLE',  accent:'#8b7bf0'},
  {id:'quill',   label:'QUILL',   accent:'#5fe0ff'},
  {id:'turtle',  label:'TURTLE',  accent:'#00ff9c'},
  {id:'nexus',   label:'NEXUS',   accent:'#e8c45c'},
  {id:'zerox',   label:'ZEROX',   accent:'#ff9a3c'},
  {id:'pikadon', label:'PIKADON', accent:'#ff5a4d'},
];
```

Find (inside `buildCust()`, the `// outfit type` section start):
```javascript
function buildCust(){
  swatches('sw-skin',SKIN,()=>rig.skin,v=>rig.skin=v,false);
```

Replace with (adds the office-row builder call as the first line of `buildCust()`):
```javascript
function buildOfficeRow(){
  const host=document.getElementById('sty-office'); host.innerHTML='';
  OFFICES.forEach(o=>{
    const b=document.createElement('div'); b.className='sty'; b.textContent=o.label; b.dataset.office=o.id;
    b.style.cssText='border-color:'+o.accent+'55;color:'+o.accent+'aa';
    b.onclick=()=>{ rig.office=(rig.office===o.id?undefined:o.id); if(rig.office===undefined) delete rig.office; syncUI(); };
    host.appendChild(b);
  });
  refreshOfficeRow();
}
function refreshOfficeRow(){
  const host=document.getElementById('sty-office'); if(!host) return;
  [...host.children].forEach(b=>{
    const on = b.dataset.office===rig.office;
    b.classList.toggle('on', on);
    b.style.background = on ? (OFFICES.find(o=>o.id===b.dataset.office).accent+'22') : 'transparent';
  });
}
function buildCust(){
  buildOfficeRow();
  swatches('sw-skin',SKIN,()=>rig.skin,v=>rig.skin=v,false);
```

- [ ] **Step 4: Keep the office row in sync when a preset is picked or randomized (`syncUI()`)**

Find (the end of `syncUI()`):
```javascript
function syncUI(){
  refreshSel('sw-skin',()=>rig.skin); refreshSel('sw-hair',()=>rig.hair);
  refreshSel('sw-top',()=>topColor()); refreshSel('sw-pants',()=>rig.pants);
  refreshSel('sw-shoe',()=>rig.shoe); refreshSel('sw-cap',()=>rig.cap);
  [...document.getElementById('sty-top').children].forEach(b=>b.classList.toggle('on',b.dataset.tp===topField()));
  [...document.getElementById('sty-shoe').children].forEach(b=>b.classList.toggle('on',b.dataset.tp===(rig.shoeStyle||'sneaker')));
  [...document.getElementById('toggles').children].forEach(b=>{ const f=b.dataset.f; b.classList.toggle('on',!!rig[f]); });
}
```

Replace with:
```javascript
function syncUI(){
  refreshOfficeRow();
  refreshSel('sw-skin',()=>rig.skin); refreshSel('sw-hair',()=>rig.hair);
  refreshSel('sw-top',()=>topColor()); refreshSel('sw-pants',()=>rig.pants);
  refreshSel('sw-shoe',()=>rig.shoe); refreshSel('sw-cap',()=>rig.cap);
  [...document.getElementById('sty-top').children].forEach(b=>b.classList.toggle('on',b.dataset.tp===topField()));
  [...document.getElementById('sty-shoe').children].forEach(b=>b.classList.toggle('on',b.dataset.tp===(rig.shoeStyle||'sneaker')));
  [...document.getElementById('toggles').children].forEach(b=>{ const f=b.dataset.f; b.classList.toggle('on',!!rig[f]); });
}
```

- [ ] **Step 5: Structural check**

Run: `grep -n "buildOfficeRow\|sty-office\|OFFICES\[\|OFFICES=" public/pixel-forge.html`
Expected: matches for the markup id, the `OFFICES` array definition, and the builder/refresh
function calls (definition + the two call sites in `buildCust()` and `syncUI()`).

Run: `node --check` is not directly applicable (this is an inline `<script>` in an HTML file) —
instead extract and check: `node -e "const fs=require('fs'); const html=fs.readFileSync('public/pixel-forge.html','utf8'); const m=html.match(/<script>([\s\S]*?)<\/script>/); new Function(m[1]); console.log('OK, parsed', m[1].length, 'chars');"`
Expected: `OK, parsed <N> chars` with no thrown error.

- [ ] **Step 6: Commit**

```bash
git add public/pixel-forge.html
git commit -m "Add office picker to pixel-forge.html, tagging rig.office on save"
```

---

### Task 4: Add "The Hall" nav entry and view shell to `index.html`

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Produces: `showView('hall')` navigates to a new `#hallView`. `switchHallTab(office)` shows one of
  7 room panels (`#hallShaddai`, `#hallOracle`, `#hallQuill`, `#hallTurtle`, `#hallNexus`,
  `#hallZerox`, `#hallPikadon`), following the exact same show/hide convention `switchOfficeTab`
  already establishes (`index.html:30020-30040`) — toggling `style.display` between `'flex'` and
  `'none'`, plus an active-button class toggle.

- [ ] **Step 1: Add the nav button, right after the existing Office button**

Find:
```html
  <button class="nav-btn nav-img" onclick="showView('office')" data-guest-lock="Office" style="color:#ffd700;font-weight:700;--nav-img:url(/assets/nav/office.jpg)">🏢 Office</button>
```

Replace with:
```html
  <button class="nav-btn nav-img" onclick="showView('office')" data-guest-lock="Office" style="color:#ffd700;font-weight:700;--nav-img:url(/assets/nav/office.jpg)">🏢 Office</button>
  <button class="nav-btn nav-img" onclick="showView('hall')" data-guest-lock="Hall" style="color:#cc44ff;font-weight:700;--nav-img:url(/assets/nav/office.jpg)">🏛️ The Hall</button>
```

- [ ] **Step 2: Add the `#hallView` shell, right after the closing `</div>` of `#officeView`**

Find (the exact closing of `#officeView` and the start of the next view, `#forgeView`):
```html
  </div>

  <!-- Chat -->
  
  <!-- Skills View with 3D Agent Model Revolver -->
<!-- ═══════════ THE FORGE — consolidated: 2D · 3D · Marketplace ═══════════ -->
  <div id="forgeView" class="view">
```

Replace with (splices the new `#hallView` in between `#officeView`'s closing and the existing
comments/`#forgeView` opening — everything from the Find block is preserved, just with the new
view inserted after the first line):
```html
  </div>

  <!-- The Hall — 7 office rooms -->
  <div id="hallView" class="view">
    <div style="text-align:center;padding:18px 0 8px">
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:3px;color:#cc44ff;text-transform:uppercase">The Hall</div>
      <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:4px">Seven desks. Seven agents. Walk in and talk to one.</div>
    </div>
    <div id="hallRoomGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;padding:8px 16px 20px;max-width:960px;margin:0 auto"></div>
    <div id="hallRoomPanel" style="display:none;max-width:640px;margin:0 auto;padding:0 16px 30px">
      <button onclick="document.getElementById('hallRoomPanel').style.display='none';document.getElementById('hallRoomGrid').style.display='grid';" style="background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.6);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;margin-bottom:12px">← Back to the Hall</button>
      <div id="hallRoomBody"></div>
    </div>
  </div>

  <!-- Chat -->
  
  <!-- Skills View with 3D Agent Model Revolver -->
<!-- ═══════════ THE FORGE — consolidated: 2D · 3D · Marketplace ═══════════ -->
  <div id="forgeView" class="view">
```

- [ ] **Step 3: Structural check**

Run: `grep -n 'id="hallView"\|id="hallRoomGrid"\|id="hallRoomPanel"\|id="hallRoomBody"' public/index.html`
Expected: one match for each of the four ids.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "Add The Hall nav entry and view shell to index.html"
```

---

### Task 5: Build the 7 room cards and agent chat panel logic

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `window.PixelPeople` (already loaded on this page from the earlier WORLD-tile task —
  `<script src="/pixel-people.js">`, no new load needed), the `OFFICE_LEADS`-equivalent data (a
  fresh copy is defined here rather than importing Task 1's `pixel-people.js` internal array,
  since that array isn't exported — only `PRESETS` is), `localStorage['shaddai.player']`, and
  `POST /api/agents/route`.
- Produces: `renderHallRooms()` (called once, populates `#hallRoomGrid`), `openHallRoom(officeId)`
  (switches to the panel view and renders that agent's chat), `sendHallMessage(officeId)`.

- [ ] **Step 1: Add the Hall's JS, right after the existing WORLD-tile script block (the one
  defining `NEXUS_RIG`/`playerRig()`/the `worldEntryCv` canvas loop from the earlier siege-entry
  work) — reuse `playerRig()` from that block rather than redefining it**

Find (the closing of the WORLD-tile script — the exact end of that `<script>...</script>` block;
locate it by finding `})();` immediately followed by `</script>` after the `worldEntryCv` canvas
loop code):
```javascript
        requestAnimationFrame(frame);
      })();
    </script>
```

Replace with (adds a new script block immediately after, reusing the same IIFE pattern):
```javascript
        requestAnimationFrame(frame);
      })();
    </script>
    <script>
      /* The Hall — 7 office rooms, each a themed front door to /api/agents/route. */
      (function(){
        var OFFICES=[
          {id:'shaddai', label:'SHADDAI', role:'Orchestrator', accent:'#c9a6ff', rig:{suit:'#241f44',cap:'#c9a6ff',tie:'#ffd45c',emblem:'#ffd45c',skin:'#f0c199',office:'shaddai'}},
          {id:'oracle',  label:'ORACLE',  role:'Research',      accent:'#8b7bf0', rig:{hoodie:'#3a2f5a',hoodUp:true,emblem:'#8b7bf0',skin:'#e7b58a',office:'oracle'}},
          {id:'quill',   label:'QUILL',   role:'Writing',       accent:'#5fe0ff', rig:{suit:'#173a4a',cap:'#5fe0ff',tie:'#5fe0ff',glasses:true,skin:'#f0c199',office:'quill'}},
          {id:'turtle',  label:'TURTLE',  role:'Design',        accent:'#00ff9c', rig:{hoodie:'#1f5a44',cap:'#00ff9c',emblem:'#00ff9c',skin:'#caa06f',office:'turtle'}},
          {id:'nexus',   label:'NEXUS',   role:'Architect',     accent:'#e8c45c', rig:{robot:true,skin:'#8a9199',cap:'#e8c45c',shirt:'#6b7280',pants:'#3a3f47',led:'#e8c45c',emblem:'#e8c45c',office:'nexus'}},
          {id:'zerox',   label:'ZEROX',   role:'Revenue',       accent:'#ff9a3c', rig:{suit:'#3a2a1a',cap:'#ff9a3c',tie:'#ff9a3c',emblem:'#ff9a3c',skin:'#caa06f',office:'zerox'}},
          {id:'pikadon', label:'PIKADON', role:'Security',      accent:'#ff5a4d', rig:{jacket:'#331616',cap:'#ff5a4d',emblem:'#ff5a4d',shoeStyle:'boot',skin:'#8a5a3a',office:'pikadon'}},
        ];
        function hallPlayerRig(){ try{ var p=JSON.parse(localStorage.getItem('shaddai.player')||'null'); if(p&&p.rig) return p.rig; }catch(e){} return null; }
        function renderHallRooms(){
          var grid=document.getElementById('hallRoomGrid'); if(!grid) return;
          grid.innerHTML='';
          OFFICES.forEach(function(o){
            var card=document.createElement('div');
            card.style.cssText='background:#0a0e16;border:1px solid '+o.accent+'33;border-radius:12px;padding:12px;cursor:pointer;text-align:center;transition:border-color .2s';
            card.onmouseover=function(){ card.style.borderColor=o.accent+'88'; };
            card.onmouseout=function(){ card.style.borderColor=o.accent+'33'; };
            var cv=document.createElement('canvas'); cv.width=120; cv.height=120;
            cv.style.cssText='width:64px;height:64px;image-rendering:pixelated;display:block;margin:0 auto 6px';
            card.appendChild(cv);
            var lbl=document.createElement('div'); lbl.textContent=o.label;
            lbl.style.cssText='font-family:\'Share Tech Mono\',monospace;font-size:11px;font-weight:700;color:'+o.accent;
            card.appendChild(lbl);
            var role=document.createElement('div'); role.textContent=o.role;
            role.style.cssText='font-size:9px;color:rgba(255,255,255,.4);margin-top:2px';
            card.appendChild(role);
            card.onclick=function(){ openHallRoom(o.id); };
            grid.appendChild(card);
            (function animate(){
              if(!window.PixelPeople || !cv.isConnected) { requestAnimationFrame(animate); return; }
              var ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false;
              function frame(t){
                if(!cv.isConnected) return;
                ctx.clearRect(0,0,cv.width,cv.height);
                window.PixelPeople.draw(ctx, o.rig, cv.width/2, cv.height*0.82, 1.6, t);
                requestAnimationFrame(frame);
              }
              requestAnimationFrame(frame);
            })();
          });
        }
        window.openHallRoom=function(officeId){
          var o=OFFICES.filter(function(x){return x.id===officeId;})[0]; if(!o) return;
          document.getElementById('hallRoomGrid').style.display='none';
          var panel=document.getElementById('hallRoomPanel'); panel.style.display='block';
          var body=document.getElementById('hallRoomBody');
          var playerRig=hallPlayerRig();
          var showPlayer = playerRig && playerRig.office===o.id;
          body.innerHTML=
            '<div style="display:flex;gap:16px;align-items:flex-end;margin-bottom:14px">'+
              '<canvas id="hallPanelCv" width="140" height="140" style="width:70px;height:70px;image-rendering:pixelated"></canvas>'+
              (showPlayer?'<canvas id="hallPanelPlayerCv" width="140" height="140" style="width:70px;height:70px;image-rendering:pixelated"></canvas>':'')+
              '<div><div style="font-family:\'Share Tech Mono\',monospace;font-size:15px;font-weight:700;color:'+o.accent+'">'+o.label+'</div>'+
              '<div style="font-size:11px;color:rgba(255,255,255,.5)">'+o.role+'</div></div>'+
            '</div>'+
            '<div id="hallChatLog" style="min-height:120px;max-height:260px;overflow-y:auto;background:#05070c;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;line-height:1.5"></div>'+
            '<div style="display:flex;gap:8px">'+
              '<input id="hallChatInput" placeholder="Talk to '+o.label+'…" style="flex:1;background:#0a0e16;border:1px solid rgba(255,255,255,.15);color:#eee;padding:9px 12px;border-radius:8px;font-size:12px" onkeydown="if(event.key===\'Enter\')sendHallMessage(\''+o.id+'\')">'+
              '<button onclick="sendHallMessage(\''+o.id+'\')" style="background:'+o.accent+';color:#06080b;border:none;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">Send</button>'+
            '</div>';
          var pcv=document.getElementById('hallPanelCv'), pctx=pcv.getContext('2d'); pctx.imageSmoothingEnabled=false;
          var playerCv=showPlayer?document.getElementById('hallPanelPlayerCv'):null, pctx2=playerCv?playerCv.getContext('2d'):null;
          if(pctx2) pctx2.imageSmoothingEnabled=false;
          (function frame(t){
            if(!pcv.isConnected) return;
            pctx.clearRect(0,0,pcv.width,pcv.height);
            window.PixelPeople.draw(pctx, o.rig, pcv.width/2, pcv.height*0.82, 1.9, t);
            if(pctx2){ pctx2.clearRect(0,0,playerCv.width,playerCv.height); window.PixelPeople.draw(pctx2, playerRig, playerCv.width/2, playerCv.height*0.82, 1.9, t); }
            requestAnimationFrame(frame);
          })(0);
        };
        window.sendHallMessage=async function(officeId){
          var o=OFFICES.filter(function(x){return x.id===officeId;})[0]; if(!o) return;
          var input=document.getElementById('hallChatInput'); var txt=(input.value||'').trim(); if(!txt) return;
          input.value=''; input.disabled=true;
          var log=document.getElementById('hallChatLog');
          log.insertAdjacentHTML('beforeend','<div style="margin-bottom:8px"><b style="color:#5fe0ff">You:</b> '+txt.replace(/</g,'&lt;')+'</div>');
          log.insertAdjacentHTML('beforeend','<div id="hallThinking" style="color:rgba(255,255,255,.4)">'+o.label+' is thinking…</div>');
          log.scrollTop=log.scrollHeight;
          try{
            var res=await fetch('/api/agents/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:txt,agentName:o.label,history:[]}),signal:AbortSignal.timeout(30000)});
            var data=await res.json();
            var reply=(res.ok && !data.error) ? (data.response||'(no response)') : ('Error: '+(data.error||res.status));
            var think=document.getElementById('hallThinking'); if(think) think.remove();
            log.insertAdjacentHTML('beforeend','<div style="margin-bottom:8px"><b style="color:'+o.accent+'">'+o.label+':</b> '+String(reply).replace(/</g,'&lt;')+'</div>');
          }catch(e){
            var think2=document.getElementById('hallThinking'); if(think2) think2.remove();
            log.insertAdjacentHTML('beforeend','<div style="color:#ff5a5a">Connection error — try again.</div>');
          }
          log.scrollTop=log.scrollHeight;
          input.disabled=false; input.focus();
        };
        renderHallRooms();
      })();
    </script>
```

- [ ] **Step 2: Structural check**

Run: `grep -n "renderHallRooms\|openHallRoom\|sendHallMessage" public/index.html`
Expected: matches for each function's definition plus its call site(s) (`renderHallRooms()` called
once at the end of the IIFE; `openHallRoom`/`sendHallMessage` referenced from the generated
`onclick`/`onkeydown` HTML strings, which a plain grep won't distinguish from the definitions —
seeing at least 2 matches per name confirms both definition and usage are present).

Run: `node -e "const fs=require('fs'); const html=fs.readFileSync('public/index.html','utf8'); const marker='The Hall — 7 office rooms'; const idx=html.indexOf(marker); const s=html.lastIndexOf('<script>',idx); const e=html.indexOf('</script>',idx); const code=html.slice(s+8,e); new Function(code); console.log('OK, parsed', code.length, 'chars');"`
Expected: `OK, parsed <N> chars` with no thrown error.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "Build The Hall's 7 room cards and per-agent chat panel"
```

---

## Final Verification (after all tasks)

- [ ] Run `node --check public/pixel-people.js` — exit 0.
- [ ] Run `grep -c "office:" public/pixel-people.js` — should show 7 (one per `OFFICE_LEADS` entry).
- [ ] Confirm the existing 100 `pixel-people.js` presets are unmodified: `git diff HEAD~5 -- public/pixel-people.js` (adjust range to the actual Task 1/2 commits) should show only additions, no changes to the existing `ARCH`/`ROBOT_SCHEMES`/loop code.
- [ ] Manual playtest (recommended, not automated — no browser test harness exists for these
  files): open `pixel-forge.html`, confirm the new "Office" row appears above "Skin", pick an
  office, confirm a highlight appears, forge a character, confirm `localStorage['shaddai.player'].rig.office`
  is set (via devtools). Open `index.html`, click "The Hall," confirm 7 animated room cards
  render, click one, confirm the chat panel opens and a sent message gets a real response from
  `/api/agents/route`. If the player's forged character's office matches the room, confirm their
  character also renders in the panel next to the agent lead.

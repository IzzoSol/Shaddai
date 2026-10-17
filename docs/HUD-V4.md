# HUD v4 (`public/world-hud-v4.js`)

A small DOM HUD for the Map v4 world. It shows three things:

- **Vitals, bottom-left.** A thin HP bar and a slimmer stamina bar. HP is emerald, turns gold under 35 and red (pulsing) under 15. The edge of the screen flashes red briefly when HP drops. The stamina bar dims when full and turns gold under 20 %.
- **Pack chip.** `PACK HUNTING · N` appears above the vitals while `wildlife.stats().hostile > 0`.
- **Boss bar, top-centre.** Shows the dragon's name and HP while it engages. It fades 1.5 s after `defeated`, or after 4 s without contact.
- **Ping toasts, right side.** Up to 4 are stacked, and each lasts 3 s. SPARKS amounts are shown in gold. The toasts are display only: the dashboard and backend own the economy.

The HUD writes to the DOM at most 10 times a second, and only for fields whose value changed. It respects `prefers-reduced-motion`: no flash, no transitions. Under 600 px width it scales down.

## API

```js
const hud = window.buildHudV4({
  getHP:      () => 0..100,
  getStamina: () => 0..1,
  dragons:    window.__dragons  || null,   // world-dragons.js api (on/off/stats/core.byId)
  wildlife:   window.__wildlife || null,   // world-wildlife-v4.js api (stats().hostile)
  parent?:    document.body,
  reducedMotion?: bool,                    // default: the media query
});
hud.update(dt);                 // every frame; cheap — renders at 10 Hz, change-only
hud.ping(evt) → bool;           // {type, text?, sparks?} | city {type:'plot',plot_id,state} | {type:'art',slot_id,filled}
hud.setBoss(name | null, hp01); // manual boss (non-dragon); fades 4 s after the last call, null hides now, hp01 0 = defeated
hud.dispose();                  // removes DOM + style, unsubscribes dragon listeners
```

### What each ping shows

| `evt` | Toast |
|---|---|
| `{type:'mint', sparks:5, text:'Class complete'}` | **+5 SPARKS** · Class complete |
| `{type:'sink', sparks:-12, text:'Plot upkeep'}` | **−12 SPARKS** · Plot upkeep |
| `{type:'plot', plot_id:'PLOT-SW-0012', state:'claimed'}` | Plot PLOT-SW-0012 claimed |
| `{type:'art', slot_id, filled:true}` / `filled:false` | Art placed / Art slot cleared |
| `{type:'class_complete'}` (no text) | Class complete |

The HUD builds every toast with `textContent`, never `innerHTML`, so text coming from the backend cannot inject markup.

### Boss engagement source

The boss bar follows the dragons API. A dragon engages on its `telegraph`, `attack`, `hit`, `hurt` or `interrupt` events, and also while `stats().attacker` holds its id. It shows `d.name`, and its HP is `d.hp / d.hpMax`, re-read from `core.byId` at each tick. `downed` sets the HP to 0, and `defeated` starts the 1.5 s fade. A dragon that has already been defeated never engages again.

## Host integration (`public/SHADDAI-WORLD-3D.html`)

**1. Script tag.** Add it next to the other classic scripts (for example, after `world-player-controller.js`):

```html
<script src="/world-hud-v4.js?v=20260927a"></script>   <!-- HP/stamina, boss bar, pack chip, ping toasts (docs/HUD-V4.md) -->
```

**2. Build it after the v4 chain has made dragons and wildlife.** Add one more `.then` to the `window.__mapV4Ready` chain, after the wildlife step (or after the city-v3 step, if that has landed):

```js
    .then(function(api){   // MAP v4 HUD (world-hud-v4.js): vitals, dragon boss bar, pack chip, ping toasts
      if(!api || !window.buildHudV4) return api;
      try{
        window.__hudV4 = window.buildHudV4({
          getHP: ()=> window.__playerHP == null ? 100 : window.__playerHP,
          getStamina: ()=> (_pctlOut && _pctlOut.stamina != null) ? _pctlOut.stamina : 1,
          dragons: window.__dragons || null,
          wildlife: window.__wildlife || null });
        window.__w3dDebug.hudV4 = window.__hudV4;
        // city-v3 pings (plot / art) → toasts. Chain any existing handler rather than replacing it.
        const _prevCityPing = window.__onCityPing;
        window.__onCityPing = function(e){ if(_prevCityPing) try{ _prevCityPing(e); }catch(_){} window.__hudV4.ping(e); };
        // SPARKS mint/sink from the dashboard/backend layer: call window.__hudV4.ping({type:'mint'|'sink', sparks:n, text:'…'})
      }catch(e){ console.warn('[map-v4] hud failed:', e && e.message); }
      return api;
    })
```

The city runtime already forwards `onPing: e => window.__onCityPing && window.__onCityPing(e)`, as described in `docs/CITY-V3-RUNTIME.md`, so the HUD needs no change to `world-city-v3.js`.

**3. Update every frame.** In `animate()`, next to `window.__wildlife.update(dt)` (around line 4697), add:

```js
  if(window.__hudV4) window.__hudV4.update(dt);
```

Keep this line outside the `!_spawnBusy` guard so the bars stay current during a sky-dive.

**Placement.** The vitals sit at `bottom: 44px; left: 24px`, just above `#coords` (which is at `bottom: 18px`). The root is `#hudV4`: `position: fixed`, `z-index: 22`, `pointer-events: none`. That puts it above `.hud` (z-index 20) and below `#worldNav` and the intro (z-index 40 and 60).

## Test / lab

- `node tools/tests/world-hud-v4.test.cjs` runs in a vm context with a fake DOM that counts writes. It covers the colour thresholds, the throttle (zero writes while values are unchanged, and at most 10 renders a second while they change), the hit flash, the cap of 4 toasts and their 3 s expiry, the ping formats, the boss fade (4 s idle, the attacker token, the 1.5 s hold after defeat, no re-engage), `setBoss`, the pack chip and `dispose`.
- `public/hud-lab.html` is a standalone page with buttons for damage, heal, holding sprint, a dragon telegraph, hits and defeat, a manual boss, wolves and pings. Open `/hud-lab.html` from the dev server.

# SHADDAI NAVI (public/world-navi.js)
Open: **Y** or **`** or the NAVI button. World keeps running behind it. Esc closes (closes the confirm modal first). Q/E, arrows, wheel, swipe = swivel.
12 modules: Map, Inv, Chat, Sparks(+Stats), News, Market(+Trade), Radio, Bots, Plots, Wallet, Academy, Jobs.
State: `window.NaviState` (persisted to localStorage `shd_navi_v1`). API: `window.Navi` (open/close/setModule/setWaypoint/registerPin/enableSlot).
Host hooks on `window.NaviHooks`: onEquipMount, onSparksSignup, onVsAccept, sendChat, bindGrokBot, onEnrollBot, onSendHome.
Payments: never faked. PBC items need `window.shaddaiPayBox.authorize({sku,price,memo})` returning {ok:true}; Sparks items use `ShdSparks.spend`.
Waypoints: HUD compass at top; no teleport. Register world places with `Navi.registerPin({id,t,kind,x,z,when})`.
Slots (SOON): Dashboard, SkinForge, AutoPost, Aura, Terminal -> `Navi.enableSlot('SkinForge', fn)`.
TODO next: wire real inventory/chat/pins (colosseum door, academy, market, train stations), 3D preview slot, agent Forge <-> dashboard.

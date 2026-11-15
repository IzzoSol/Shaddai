# VIDEO_ISSUES.md — Issue log from Israel's laptop gameplay recordings

**Date of review:** 2026-11-15 · **Source:** 18 clips recorded by Israel (phone filming his laptop screen), live site `shaddai-g81x.onrender.com/world3d` (plus `/dashboard` in V14/V17).
**Method:** ffprobe durations + ffmpeg frame extraction every ~3 s (385 frames), contact-sheet review of every frame, plus enlarged crops of key frames for on-screen text.
**Caveats:** These are phone recordings of a laptop screen — glare, moiré striping and camera angle limit fine detail. Timestamps are ±3 s (frame interval). On-screen text is quoted exactly only where a crop made it legible; partial reads are marked (…). Root causes are labelled **GUESS** throughout — they are hypotheses for the fix pass, not findings.

**Video key** (V# used below = review order; duration in brackets):
V1 `a37752d7` [42s] · V2 `13b3a6b7` [10s] · V3 `711eff86` [28s] · V4 `380629cb` [16s] · V5 `71bf0990` [56s] · V6 `514b7095` .mov [0.2s, single still] · V7 `1bf95259` [102s] · V8 `01ebe375` [14s] · V9 `1e4e1986` [69s] · V10 `ec087bd3` [86s] · V11 `152b668e` [25s] · V12 `8a9c2e54` [62s] · V13 `6417f31e` [56s] · V14 `0b68a02a` [26s, landscape] · V15 `0fa2a106` [197s] · V16 `78842862` [69s, landscape] · V17 `bee4a2d3` [53s] · V18 `b67138cb` [251s, the long one]

**Israel's headline list (13:17–13:23 EST) and where each shows up:**
- **Buttons / UI** → V14 (Shop stuck on "Loading the shelves…"), V16 (shop panel slides in over the loader), V17 + V18 + V15 ("Page Unresponsive"), V15 (overlapping labels)
- **White fog** → V13, V4, V10, V15
- **City / buildings missing** → V12, V18 (~3:00 plains), V5, V11, V7/V13 interiors
- **ZEROX loads odd** → V18 (shard mass as the player body), V2/V3/V18 (ghost-bubble agents)
- **Load speed** → V16 (≥69 s stuck at 100% "WARMING UP THE RENDERER"), V7 (maglev transition card), V15 (stuck top-down entry)

---

## SPECIAL HEADING — Dismount returns player to mount point (user-confirmed)

**Status: CONFIRMED BY ISRAEL 13:23 EST** — "dismounting a mount returns the player to where they mounted instead of where they are." Logged on his word; video evidence is contextual, not a clean capture:
- V11 (~0:12–0:24): after the maglev sequence the player is **on foot, alone, crossing a vast empty grey plain** beside the track colonnade — consistent with being put down somewhere other than where the ride ended.
- V7 / V9 / V12 are long vehicle drives; no clean dismount moment is isolated in the 3 s frame grid.
- **GUESS:** dismount restores a position snapshot taken at mount time (or the avatar's pre-mount transform, which was never updated while parented to the vehicle) instead of the vehicle's current world position.

## SPECIAL HEADING — Death respawns player IN THE SKY, falling (user-confirmed)

**Status: CONFIRMED BY ISRAEL 13:23 EST** — "dying respawns the player IN THE SKY (falling)." Video evidence partially consistent:
- V10: "YOU DIED" at ~0:36; the following ~20 s (0:39–0:57) are disorienting — camera hard against dark/grey geometry, a close-up of a black box face (~0:45), white fog (~0:51) and **one fully black frame (~0:54)** — before stable ground-level play resumes on the snowy slope (~0:57+). Consistent with a falling/tumbling respawn, not provable from stills alone.
- V5's respawn after "YOU DIED" (~0:36) lands indoors at the bazaar at ground level — so behaviour differs by death/area, or the sky respawn applies to the world-spawn path only.
- **GUESS:** respawn reuses the entry/spawn point (the sky-drop Nexus entry, high Y) without snapping to ground height, so the player materialises in the air and falls.

---

## Per-video log

### V1 — `a37752d7` [42s] — Sky Nexus tram area, error flood
- **0:00–0:42 (entire clip):** A red error banner covers the **top half of the screen for the whole video**, headed "— Tell this to Claude:" and filled with hundreds of repeats of one line, confirmed by crop: **"TypeError: Cannot read properties of undefined (reading 'matrixWorld')"** (file/line suffix per line not legible). Gameplay continues underneath (yellow tram/track hub, "[E] ENTER…" prompt, "Press R to ride — RIDE TO THE SKY NEXUS" prompt visible) but the upper view is unusable.
- The error count grows between frames — it is being thrown repeatedly, every frame or near it.
- **GUESS:** an update/render loop touches `.matrixWorld` on an undefined object (a missing bone/attachment — e.g. a weapon or ring parented to a model that failed to load), and the on-screen error reporter has no dedupe/throttle, so one bug becomes a screen-filling flood.

### V2 — `13b3a6b7` [10s] — QUILL / Library interior
- 0:00–0:10: Interior is a **black void** — no room geometry, floor or lighting visible. A pale ghost humanoid stands inside a translucent oval bubble at centre; small floating UI cards around it. Bottom text: **"QUILL — The Library • [E] or [ESC] to exit"**; top button "[ E ] EXIT".
- **GUESS:** interior environment fails to load/render (only the UI + fallback avatar render), and the agent/player body is the placeholder ghost because the real model didn't come in.

### V3 — `711eff86` [28s] — NEXUS / Navigator Core → street
- 0:00–0:15: Same black-void interior pattern: ghost-in-bubble at centre, green-outlined doorway shape floating in darkness, banner "NEXUS — Navigator Core • TOOLS - press (…) or M to shrink/free cursor" (partially legible), "[ E ] EXIT".
- ~0:09: Fabricator panel: "NEXUS — FABRICATOR / The Navigator / Fabrication is patience with better tools. Craft parts from Sparks." Items approx. "Thruster Kit (+10% race turbo)" and "Bot Part Pack (-20% rebuild cost)" with green price buttons (values not fully legible).
- ~0:18–0:27: Exits to a colourful street scene (yellow pillars, "…ORCE" sign, vehicles) — outdoors renders, interiors don't. Prompt "[ E ] ENTER NEXUS"; side text "Job Hall - quests". The ghost-bubble figure is still the visible body outdoors.

### V4 — `380629cb` [16s] — White plains flight
- 0:00–0:15: Flying/gliding over **flat white untextured ground** under a black starry sky; a large grey blocky structure (flat-shaded, untextured) passes at ~0:03–0:06; distant green tree line and water appear late (~0:09+). A white rectangle (untextured plane?) sits in the top-left of the sky in several frames.
- **GUESS:** ground texture missing in this biome/LOD band (pure white), and the grey structure is an untextured building/rock asset.

### V5 — `71bf0990` [56s] — Grey plains, giant legs, death, bazaar respawn
- 0:00: A silver crystalline fountain/UFO-like object hovers over grey ground (unidentified; possibly a vehicle or landmark rendering oddly).
- 0:03–0:21: **Vast empty grey plain**, night sky, tan hills on the horizon — nothing else. A blocky green/yellow humanoid figure appears standing on the plain (~0:18).
- 0:24–0:33: The camera moves **underneath a pair of GIANT green/yellow legs** that fill the whole screen — some character model is loaded at enormous scale (tens of metres tall).
- ~0:36: **"YOU DIED"** (red text on black).
- 0:39–0:45: Respawn inside a building (market hall with stalls/pillars), then a hub with big yellow bowl structures and track; "[E] ENTER HANGAR"(?) prompt (partially legible); pale ghost avatar again.
- **GUESS:** the giant figure is an agent/NPC GLB with a wrong scale factor (same broken-model family as V18's shard mass); death cause unclear from stills — possibly collision/crush or a fall while passing under it.

### V6 — `514b7095` .mov [0.2s — single still]
- One frame: the player sits in/on a grey-blue rounded mech/rover (yellow shoulder pads, antennae) with a tiny white/pink figure on top, on sandy terrain with strong stripe moiré; bottom-left toast fragment "…you have 0)". URL visible: "…nder.com/world3d".
- Note only: the avatar reads as a tiny pale figure perched on the vehicle — the same pale-body rendering as elsewhere.

### V7 — `1bf95259` [102s] — Desert drive, maglev, station interior
- 0:00–0:30: Driving over pale sand; the sand shows **striped tiling/moiré banding** across whole slopes. "BOOST" banner ~0:03. Large counter bottom-right reads ~"28"/"38" (see FPS note in consolidated list). A rainbow arcs in the black sky.
- ~0:30–0:36: Station menu open: "TUNNEL LINE • CENTRAL ST(ATION)" with a numbered station list (items partially legible).
- ~0:39–0:45: **"MAGLEV TUNNEL — Central Station → Reef Line Shore"** title/transition card held for at least ~6 s of the clip.
- ~0:48: Station list panel "RINGED REALM MAGLEV / Central Station / 1 — Rift Gate Station / 2 — Desert Terminal / 3 — Emberfall Forge Station / 4 — Suburb Transit Hub / 5 — Meadowbelle Hall / 6 — Harbor Line Station / 7 — Darkreach Station / 8 — Arctic Outpost Station / 9 — Star City (Suburb Gardens)" (best-effort read), "Esc to close".
- 0:51–1:36: Inside the destination station: **flat white/grey untextured architecture**; repeatedly the camera is hard against blank walls (frames ~0:54–1:00, ~1:18–1:30 are mostly featureless white/black planes) — camera clipping into geometry / no camera collision. Benches/tables are plain grey blocks.
- 1:39+: Back outside over green plains.

### V8 — `01ebe375` [14s] — Giant white slab
- 0:00–0:12: Flying over plains toward/past a **massive white angular slab structure** (like a building-sized white shard/wall, untextured) at ~0:03–0:09; final frames: flat white ground and a white rectangle overhead in the sky.
- **GUESS:** same class as V4's grey block and V18's shard mass — a large model rendering as plain white geometry (missing texture/material or exploded transform).

### V9 — `1e4e1986` [69s] — Long vehicle drive, boss bar, black terrain patches
- 0:00–1:09 (whole clip): Driving the two-wheel rover over cracked-earth mountains. The boss bar **"STORM DRAGON OF SUBURB TRANSIT HUB"** stays pinned at the top for the entire drive, far from any visible boss.
- "BOOST" banner recurs (~0:03–0:09, ~0:48–0:57, ~1:06).
- **Black blob patches** appear on the cracked terrain in multiple frames (~0:15–0:27) — irregular pure-black areas on the ground, not shadows of anything visible.
- Terrain texture is **severely stretched** on slopes (crack pattern smears vertically); large areas are flat white (snow/water?) with no texture detail.
- ~0:57–1:03: Vehicle parked on white flat ground by a fence; a long grey object (fallen beam?) lies on the ground.
- **GUESS (black patches):** a decal/shadow/height-blend layer failing — e.g. shadow map or splat layer rendering black where data is missing.

### V10 — `ec087bd3` [86s] — Mountain, dragon, giant pink structure, death
- 0:00–0:09: Player on the snowy cracked mountain; a **pink dragon** nearby (the Storm Dragon), a black-clad figure; bottom-left quest text fragments: "…mask level 2 (you have 0)" and "…(Emberfall?) Forge Station slumps nearby - defeat it to claim the Ember Shard" (best-effort read). (Parent preview of this clip also noted HUD: "100 SPARKS", "NAVI [V]", "DRAGON SHARDS 0/8", FPS-type counter bottom-right reading 102–144 in open terrain.)
- 0:12–0:27: Sliding/tumbling down the cracked slope (quest panel opened on the right at ~0:21); the pale two-ring bot avatar with swords is the visible body, translucent-looking against the slope.
- ~0:30: One **all-white frame** (camera inside white geometry or full whiteout).
- ~0:33: A **GIANT pink flat blocky structure** fills the screen — boxy pink slabs with a yellow stripe, totally untextured, building/mech-sized.
- ~0:36: **"YOU DIED"**.
- 0:39–0:57: Post-death disorientation (see Sky Respawn heading): dark geometry close-ups, black box face ~0:45, fog ~0:51, **fully black frame ~0:54**.
- 0:57–1:25: Back on the snowy mountain in the vehicle, more slope sliding; boss bar returns ~1:12; a purple figure (dragon?) at ~1:15.
- **GUESS:** the pink structure is another agent/landmark GLB rendering with a flat pink placeholder material at giant scale — the same broken-model family as V5's giant legs and V18's shard mass.

### V11 — `152b668e` [25s] — Maglev list, tunnel, on foot in the grey
- 0:00: "RINGED REALM MAGLEV / Central Station" list open over a white plaza.
- 0:03–0:09: Inside a tunnel of yellow rings; small pale avatar on the track; "BOOST" visible.
- 0:12–0:24: The avatar is **on foot crossing a flat grey plain** beside a long pillar colonnade, horizon empty — see Dismount heading.

### V12 — `8a9c2e54` [62s] — Vehicle vs the "city"
- 0:00–1:01: Driving the rover through a built-up area — but the "buildings" are **flat-shaded boxes in grey/yellow/white/brown with no visible textures, windows or detail**; a tall grey rock-spire stands among them (~0:18).
- Large white counter at the right edge reads **"14" (~0:06), "13" (~0:09), "14" (~0:18), then "5" (~0:33) and "4" (~0:36)** — values collapse as the vehicle gets among the buildings (label not legible; consistent with the FPS counter — see consolidated #11).
- ~0:27–0:36: The camera goes **under/inside a building** — blank beige/brown walls fill the frame; HUD pills legible in crop: **"CURSOR MODE"**, **"NAVI [V]"**, **"DRAGON SHARDS 0/8"**. No collision stops the vehicle entering the structure.
- Cracked-earth texture stretched across all the ground between buildings.

### V13 — `6417f31e` [56s] — Whiteout fog, station corridor
- 0:00–0:06: **Near-total whiteout** — the avatar is a faint smudge in white/grey fog; a settings-type panel opens (~0:03) over the white.
- 0:09–0:18: Flying over green/yellow plains with white ground patches; a long settings/menu panel stays open on the right while moving (items not legible).
- 0:21–0:42: Walking a station/platform corridor: rows of grey T-shaped benches, **flat white/grey untextured walls**, black wall sections; the avatar here reads as a dark vehicle-like shape in the corridor.
- 0:45–0:54: White plain again with a lone grey obelisk; final frames return to whiteout over cracked terrain.
- **GUESS:** fog density is cranked far beyond intent in these zones (or an exposure/bloom blowout), erasing the scene; the split appearance (white left, normal right in some frames of V13/V15) suggests fog applied per-chunk/section rather than uniformly.

### V14 — `0b68a02a` [26s, landscape] — Dashboard Shop never loads
- URL: `shaddai-g81x.onrender.com/dashboard`. A "SHOP — **Showcase**" modal with tabs "**Sparks**", "**Cosmetics**", "**Bazaar**" (Bazaar highlighted/selected).
- 0:00–0:25 (whole clip): The modal body shows only **"Loading the shelves…"** — the shop content **never arrives** in 26 s of waiting/clicking. A small popup/tooltip appears near the tabs at ~0:18–0:21 and the modal is still empty behind it.
- **GUESS:** the shop/shelves fetch hangs or fails silently — no timeout, error state or retry is surfaced to the user. (This is one of Israel's "buttons" complaints made visible: the tab responds, the content doesn't.)

### V15 — `0fa2a106` [197s] — Entry: stuck top-down over the Nexus, two browser freezes
- 0:00–0:06: Camera opens **inside/against white spiky crystalline geometry** (the shard-mass material at point-blank range).
- 0:06–1:24: Camera hangs **high above the Nexus hub platform** (dark disc, concentric rings, yellow centre disc, radial track) in a near-static top-down view for over a minute. At ~0:09, location labels overlap into an unreadable stack: "**NEON HOOPS** / **GRID GRIDIRON** / **THE ORACLE TEMPLE**" (best-effort read) printed on top of each other.
- ~0:27–0:36: Menu: "**CHOOSE YOUR OPERATIVE & ENTRY POINT**" (title runs off the right edge) with operative portraits and entry buttons "The Navigator", "The Library", "The Observatory", "The Aegis", "The Markets" (best-effort reads).
- ~1:33: One **fully black frame**.
- ~1:48: **Chrome "Page Unresponsive" dialog** ("You can wait for it to become responsive or exit the page") over the still-top-down view; bottom text "Athenaeum & Job Hall - Athenaeum - Job Hall - quests".
- ~2:30–2:48: Camera finally descends into the city — pastel purple/white flat buildings, a yellow house-like structure (Job Hall?).
- ~3:06: **Second "Page Unresponsive" dialog** in the same session.
- **GUESS:** the entry camera sequence waits on a load/warm-up step that stalls (same family as V16's hang), leaving the player staring at the map disc; the freezes are main-thread blocks during streaming/first render of the city.

### V16 — `78842862` [69s, landscape] — The loader that never finishes
- 0:00–1:08 (**the entire clip**): The "SHADDAI — WORLD" loading screen. Bar already at **"100%"**, stage text **"WARMING UP THE RENDERER"**, and it **never advances** for the full 69 s recorded. Exact on-screen text (from crops):
  - "WARMING UP THE RENDERER"
  - "100%"
  - Tips rotate: "Hold Shift to sprint." → "Press E at a glowing marker to interact."
  - "First visit downloads the whole world (about 30 MB). It is still working - later visits load much faster."
- From ~0:30 a "SHOP — Spend Sparks, g(et)…" panel ("Sparks — Top up and spend", "Bazaar…") slides in at the right **over the still-running loader** — UI layers are alive while the world never enters.
- **GUESS:** the renderer warm-up step (shader compile / first-frame render) deadlocks or takes minutes on this laptop's GPU/driver; the loader has no timeout or skip, so 100% ≠ playable. This is the "load speed" headline in one clip: even at 100%, entry never happens.

### V17 — `bee4a2d3` [53s] — Dashboard item grid freezes the browser
- 0:00–0:52: A dashboard page (tab title "…Sovereign AI Age…") showing a grid of item cards with green action buttons; card names best-effort: "Holo Plant", "Circuit Bug", "Trophy Shelf", "Feather Work(s)", "Focus Core (…)", "Extra Session Slot". The user scrolls and clicks around the grid for ~40 s.
- ~0:39: **Chrome "Page Unresponsive" dialog** appears over the grid ("Page Unresponsive — You can wait for it to become responsive or exit the page", with Wait/Exit buttons).
- **GUESS:** something on this page (card rendering, live data polling, or a click handler) blocks the main thread hard enough for Chrome's hang detector — same freeze signature as V15/V18, but on a plain 2D dashboard page, so it is not purely a WebGL problem.

### V18 — `b67138cb` [251s] — The long one: shard-mass player, Navi wheel, plains, ghosts
- 0:00–0:09: City plaza: yellow gazebo/house structure, purple-white flat towers. **Trees pop in between frames** (~0:06–0:09) — visible pop-in at close range.
- **0:12–~3:00: THE SHARD MASS.** A huge spiky white/clear crystalline mass — like a model exploded into shards — occupies the centre of the screen and **moves like the player**: it travels the city streets, passes a "[ E ] ENTER HANGAR" sign (~0:33), leaves the city, crosses open grey ground, passes a yellow signpost (~1:00). The camera follows it exactly as a third-person player body. No avatar is visible inside it.
- ~1:15–2:50: The **Navi wheel** (circular NEXUS ring menu; bottom buttons include "SPARKS 100", "PATHOS"(?), "AGENT KEY") is open for ~90 s while the user clicks through sub-panels: a portal list (~2:15+, entries like "Dragon Dens", "Skyline Circuit" with PLAY buttons), and an "**APPLY FOR A PORTAL**" panel (~1:45) with X / Telegram handle fields. The shard mass sits behind the wheel the whole time.
- **~1:36: Chrome "Page Unresponsive" dialog** over the Navi wheel (confirmed by crop: "Page Unresponsive — You can wait for it to become responsive or exit the page").
- ~2:48: "SHADDAI NEWS" panel (crypto headlines list) opens from the wheel.
- ~3:00–3:15: The player leaves the hub: **vast empty grey plains at night, the city reduced to a tiny lit smudge on the horizon**; a toast reads "…and owned land (Plots 55W Avenue)" (partially legible).
- ~3:18–3:36: "NEXUS • HELP DESK" panel (world map + FAQ; full text captured in review notes — controls, landmarks list incl. "Zerox Markets — live trading floor").
- ~3:33: "**NOW PLAYING: ORACLE**" text on screen.
- ~3:39–4:05: On the plains, the visible character is again the **pale ghost humanoid inside an oval bubble** (walking toward the track colonnade); "NOW PLAYING: (TURTLE…)" appears ~3:57 (best-effort). Parent review of this clip noted the same ghost-bubble figures captioned "NOW PLAYING: ZEROX/TURTLE/QUILL…" across ~3:30–4:05.
- **GUESS:** the shard mass is the player's operative GLB (Israel: "ZEROX loads odd") with its geometry/skinning transforms broken — vertices exploded outward from the bind pose, materials untextured — while its root motion works fine, so it "plays" normally as a crystal blob. The ghost bubbles are the fallback body shown when an agent model is absent/unloaded; "NOW PLAYING" suggests the UI believes an agent theme is active while the model never arrived.

---

## Consolidated ranked issue list (most severe first)

1. **Player/agent model renders as an exploded SHARD MASS** (V18 ~0:12–3:00; also V15 0:00, V8's giant white slab, V5's silver object). The main character is unplayable-looking for most of the longest clip. **GUESS:** operative GLB (ZEROX per Israel) loads with broken skinning/transforms — exploded vertices, no textures — while root motion works.
2. **Per-frame runtime error flood covers the screen** (V1, entire 42 s): "TypeError: Cannot read properties of undefined (reading 'matrixWorld')" × hundreds, under a "Tell this to Claude:" banner. **GUESS:** an attachment/bone lookup on an undefined object in the animation loop (plausibly the same broken model as #1), plus an error overlay with no dedupe.
3. **Loader hangs forever at 100% — "WARMING UP THE RENDERER"** (V16, ≥69 s and counting; entry stalls also V15). 100% does not mean entry; no timeout/skip. **GUESS:** shader-compile/first-render warm-up deadlocks or crawls on this GPU; the step never resolves.
4. **Chrome "Page Unresponsive" freezes** in three separate contexts: Navi wheel (V18 ~1:36), world entry/city (V15 ~1:48 and ~3:06), and a plain dashboard grid page (V17 ~0:39). **GUESS:** heavy synchronous JS (registry/list rendering, streaming, first-render) blocks the main thread past Chrome's hang threshold — and it is not WebGL-only, since the 2D dashboard does it too.
5. **Agents/NPCs render as pale ghost silhouettes in oval bubbles** (V2, V3, V5, V11, V18 ~3:39–4:05) with "NOW PLAYING: ZEROX/TURTLE/QUILL/ORACLE" captions — i.e. the council agents have no working bodies. **GUESS:** agent GLBs fail to load/parse and the placeholder bubble fallback is what ships to screen; pairs with #1/#2 as one broken-model pipeline.
6. **Giant-scale character models** (V5 ~0:24–0:33 legs filling the screen, followed by "YOU DIED" ~0:36; V10 ~0:33 giant pink flat structure, "YOU DIED" ~0:36). **GUESS:** some GLBs load at 10–100× intended scale (unit/transform mismatch — same family as #1).
7. **Dismount teleports the player back to the mount point** (user-confirmed; V11 context). **GUESS:** dismount restores the mount-time position snapshot instead of the vehicle's current position.
8. **Respawn drops the player in the sky** (user-confirmed; V10 post-death chaos/black frame partially consistent). **GUESS:** respawn reuses the high sky-entry spawn without a ground-height snap.
9. **White fog / whiteout** (V13 0:00–0:06 and 0:45+, V4, V10 ~0:51, V15) — whole scenes washed to white; in places the wash covers only part of the view while the rest stays black-night. **GUESS:** fog density/exposure far beyond intent, applied unevenly (per-chunk or a stuck weather volume).
10. **City/buildings missing or placeholder** (V12 flat untextured boxes; V18 ~3:00 city a distant smudge across empty grey plains; V5/V11 empty grey biomes). **GUESS:** building textures/detail fail to stream in (LOD never swaps), and the grey plains are untextured ground with content only near the hub.
11. **Performance collapse near buildings**: the bottom-right counter reads 102–144 in open terrain (parent preview, V10), ~28–38 driving the desert (V7), and 14 → 13 → 5 → 4 among buildings (V12; counter label not legible in my frames — readings are the large white numerals at screen-right). **GUESS:** unbatched flat-box city geometry + the #2 error flood + streaming stalls eat the frame budget exactly where the content is.
12. **Shop/Bazaar UI hangs**: dashboard Showcase stuck on "Loading the shelves…" for a full 26 s clip (V14); a shop panel slides in over the still-loading world (V16 ~0:30+). **GUESS:** shop data fetch hangs/fails with no timeout or error state.
13. **Terrain texture failures**: cracked-earth texture massively stretched on slopes (V9, V10, V12); striped tiling/moiré on sand (V6, V7); **irregular black patches** on the ground (V9 ~0:15–0:27); large flat-white untextured ground areas (V4, V7, V9). **GUESS:** no slope-aware (triplanar) UV mapping; black patches = a splat/shadow layer rendering black where its data is missing.
14. **Camera clips into geometry; no camera collision** (V7 station walls fill the frame ~0:54–1:36; V12 vehicle inside a building ~0:27–0:36; V10 black-box close-up ~0:45; V15 camera inside the shard mass 0:00). Vehicles also drive through buildings (V12).
15. **Interiors are empty voids** (V2 Library and V3 Navigator Core = black nothing with floating UI cards; V7/V13 station interiors flat untextured grey). **GUESS:** interior environment/lighting assets don't load — only the UI layer renders.
16. **Entry flow stalls in a top-down map view** (V15: ~1–2 min hanging over the Nexus disc, one fully black frame ~1:33) and **location labels overlap** into unreadable stacks (V15 ~0:09: "NEON HOOPS / GRID GRIDIRON / THE ORACLE TEMPLE"). **GUESS:** spawn camera waits on the same stalled warm-up as #3; label anchors aren't de-overlapped or distance-culled.
17. **Pop-in at close range** (V18: trees materialise between frames ~0:06–0:09 in the central plaza). **GUESS:** LOD/streaming distance set shorter than the plaza sightlines, or assets arriving late after entry.
18. **Sticky/irrelevant HUD state**: boss bar "STORM DRAGON OF SUBURB TRANSIT HUB" pinned through an entire unrelated drive (V9, 69 s); quest text "…mask level 2 (you have 0)" persisting across areas (V10). **GUESS:** boss/quest HUD state isn't cleared on leaving the encounter/zone.

*End of log. All root causes above are guesses for the fix pass to verify against code; every symptom, timestamp and quoted string is from the frames as recorded, within the legibility limits noted at the top.*

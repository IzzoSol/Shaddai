# Realm Art Direction — Neon City + Tech-Fusion Regions — Design Spec

**Date:** 2026-09-18
**Status:** Design — awaiting owner review before any new generation batch
**Authored by:** TURTLE (visual direction) + QUILL (naming/copy), at SHADDAI's request
**Target files (future work, not touched by this spec):** `fal-assets/batches/*.json` (new art
generation), `public/world-regions/*.js` (region re-theming), `fal-assets/spike/city-center.html`,
`fal-assets/characters/roster.json`

---

## 1. Context (verified by reading the code, not assumed)

Two art-direction decisions landed in the same session, in two different concurrently-running
sessions, and looked like they conflicted until the owner clarified the actual model:

- One session's memory note (`SHADDAI_NEON_STREETWEAR_AESTHETIC_20260918.md`): owner supplied 3
  references (a stained-glass streetwear character sheet, two saturated cyan/lime "sneaker anime"
  designs) and said *"this is the aesthetic im going for for full body and all of the surroundings
  in the game its futuristic cool neon and vibrant urban street vibes."*
- This session had just finished a 12-character voxel-block restyle in the original locked
  obsidian/emerald/gold "Lantern Order" spine (`fal-assets/characters/roster.json`'s `spine`
  field, `fal-assets/spike/style-voxel-blocky.png`).

Owner's actual clarification, verbatim intent: **"Its just a type for shaddai city we would need
farm tech ones and beach tech ones for different realms forest tech etc etc etc we are mixing
great styles but yes that is a key aesthetic to all of it."**

Reading `docs/superpowers/specs/2026-09-09-2d-realm-siege-and-entry-design.md` (the most recent
prior 2D-realm spec) confirms this isn't a green-field decision — **`public/game.html` already
has 9 real, live, playable regions** (`public/world-regions/*.js`), each with its own building set
and name already in the code:

| Region file | Existing identity (from actual building names in the code) |
|---|---|
| `city.js` | Downtown: BANK, CITY HALL, MALL, OFFICE, PLAZA, CENTRAL STATION, HOTEL, PARKING |
| `meadow.js` | Farm town: BARN, FARMHOUSE, GROCER, BAKERY, CHAPEL, COTTAGE, DINER |
| `beach.js` | Coastal town: LIGHTHOUSE, PIER, FISH MARKET, CANNERY, CRANE, WAREHOUSE, COTTAGE, AIR PAD |
| `forest.js` | Woodland: **KETHER KEEP** (sacred-geometry naming — a direct bridge to the original spine), RANGER LODGE, LOG CABIN, TREEHOUSE, TRAPPER, TOWER |
| `desert.js` | Pueblo/dune: ADOBE, PUEBLO, **GRAND FORGE**, **AIR PAD**, MARKET, INN |
| `suburb.js` | Residential (sparser building set, GATEWAY landmark) |
| `volcano.js` | (sparse/procedural — no fixed named buildings in the grep) |
| `darkforest.js` | The Dark Realm / castle-siege zone, already wired to `dark-realm.js` (Forest → Moat → Gate → Chains → Final boss). **Deliberately its own gothic identity — do not tech-fuse this one, see §4.8.** |

This spec's job: give each of these **8 already-real regions** (darkforest excluded, see below) a
named, detailed visual direction — neon-streetwear for the city hub, a distinct "X-tech" fusion
per outer region — so future art-generation batches (buildings, NPCs, mecha-mounts, vehicles) have
a real brief to prompt against instead of improvising per-batch. This is the actual root cause of
today's session friction: two concurrent sessions each generated real, paid art without a shared
written brief to check against. This document is that brief.

## 2. Goals

- One clear, named visual identity per existing region, each detailed enough to drive an art
  batch's prompt language directly (palette hex codes, silhouette rules, material language,
  what makes each region *instantly* readable as itself in a screenshot).
- Preserve what's already real: existing building names/kinds in each region file are not
  renamed or removed — this is a *rendering/material* pass, the way `pixel-people.js`'s `voxel`
  kit is a rendering variant of the same rig, not a new rig.
- Resolve the two-session naming conflict permanently: this file is the shared source of truth
  going forward. Either session should read it before a new full-body character, building, or
  vehicle art batch.
- Cover the mecha-mount/vehicle vision from this session's reference images (casino jackpot
  mech-boss, Wildstar hoverboards, mecha-animal mounts) by assigning them to the region they
  actually belong to, not as a floating unthemed category.

## 3. Non-Goals

- Re-theming `darkforest.js` — it has a deliberately distinct gothic-siege identity tied to
  `dark-realm.js`'s boss encounter; folding it into the neon/tech-fusion family would flatten the
  one region that's supposed to feel different on purpose.
- Rewriting or re-skinning the 24 characters (12 smooth-chibi + 12 voxel) already generated and
  committed this session. They stay as the "Lantern Order" — see §4.9 for where that identity
  now lives in this model, it is not discarded.
- Actually running any generation batches. This is the brief; execution is a separate,
  owner-approved next step per character/region.
- The 2D `game.html` canvas-rendering engine itself (colors/sprites for the *existing* 2D game)
  — that's a separate, larger integration effort than this art-direction brief covers.

## 4. Design

### 4.0 The model, stated plainly

**SHADDAI City (the hub, `city.js` / `fal-assets/spike/city-center.html`) is neon urban
streetwear.** Every other realm is its own **"[theme]-tech" fusion** — recognizably that theme
(farm, beach, forest, desert...) at a glance, but with SHADDAI's technology bleeding into it, the
same way the city hub's tech bleeds into streetwear fashion instead of pure cyberpunk. The throughline
across every realm, including the city, is: **technology in service of a human (or humanoid) culture,
never technology *as* the culture.** A farmer with a glowing tool is still a farmer. A lifeguard
with a drone is still a lifeguard.

### 4.1 SHADDAI City — Neon Urban Streetwear

**TURTLE's read on the references:** the stained-glass streetwear sheet and the two sneaker-anime
pieces share three traits worth locking down precisely, because "neon" alone is not a spec:
1. **Saturated, not glowing-in-the-dark.** The color is in the *paint*, not just emissive strips.
   A jacket is hot-magenta because it's dyed that color, with maybe one thin emissive trim line —
   not a grey jacket with neon piping. This is the single biggest difference from the old
   obsidian-void spine, where color was almost entirely emissive-on-black.
2. **Thick, clean, confident linework.** Cel-shaded, 2-3 tone shading per surface, hard shadow
   shapes (not soft ambient occlusion gradients). This is compatible with the voxel-block
   hard-outline technique already validated this session (`CHARACTER_WORKFLOW.md` §"Voxel-block
   style variant") — same black-outline discipline, different palette family and softer geometry
   (sneaker-anime curves, not right-angle blocks).
3. **One dominant hue per character/building, not a rainbow.** The references each commit hard to
   one or two hues (cyan-and-lime, or magenta-and-violet) rather than using the full spectrum at
   once. This is a rule, not a suggestion — mixed-hue characters will read as generic, not as
   *this* aesthetic.

**Palette family (pick 1-2 per subject, not all at once):** magenta `#ff2e88`, lime `#c6ff3d`,
cyan `#3de5ff`, violet `#a13dff`, orange `#ff7a1a` — always against near-black `#0c0c10` (not pure
black — the old spine's `#06080b` is close enough to reuse for continuity) or a warm concrete
grey `#8a8580` for street-level environment surfaces.

**Silhouette language:** streetwear layering — open jackets over fitted base layers, chunky
sneakers, asymmetric details (one glove, one bag strap). NPCs and vehicles alike get "hype"
details: holo-tag sneaker soles, jacket patches, spoiler fins.

**QUILL's naming pass:** Shaddai City keeps its existing landmark names (Bank, City Hall, Mall,
Plaza, Central Station) — this is a *reskin*, not a rename, matching §2's goal. Flavor copy for
the hub should lean into arrival/energy: *"the City never actually sleeps, it just changes which
block is loudest."*

**Character-select icon exception (already decided, keep as-is):** the face-icon grid in
`character-select.html` keeps duotone + film-grain, per hue from this same palette family — this
was already locked in the other session's memory note and this spec doesn't reopen it.

### 4.2 Meadow → Farm-Tech

**TURTLE:** the existing region is already unambiguously a farm town (barn, farmhouse, grocer,
bakery). Farm-tech means: real analog farm silhouettes (barns, silos, scarecrows, tractors) with
one or two clearly *SHADDAI* technological interventions per structure, never a full tech
takeover. A silo gets a glowing grain-level gauge ring near the top, not a sci-fi reactor core.
A scarecrow gets glowing emerald eyes and a solar-panel hat, but is still built like a scarecrow.

**Palette:** warm wheat-gold `#e8c45c` (already the spine's gold — genuinely reusable here, it's
already an agriculture-adjacent color), barn-red `#a13c2e`, and a single tech accent (emerald
`#00ff9c`, kept from the original spine specifically for this realm since it reads as
"cultivated/grown" rather than "urban") for gauges, drone lights, irrigation-line glow.

**Mecha-mount tie-in:** this is where a working ox/bison-mecha (per the reference image of the
armored bison mount) belongs — a plow-mecha or cart-hauler, function over spectacle, still reads
as livestock first.

**QUILL:** *"Every crop here grows twice as fast and the order still insists on doing the
harvest by hand once a season, so nobody forgets what the tech is actually for."*

### 4.3 Beach → Coastal-Tech

**TURTLE:** lighthouse, pier, fish market, cannery, crane, and — notably — the region *already
has an AIR PAD* in the existing building set. That's not a coincidence to design around, it's a
gift: coastal-tech's signature vehicle is a seaplane/hoverboard hybrid, and the Wildstar hoverboard
references from this session map directly onto it. Fishing-boat silhouettes get a glowing hull
waterline instead of a running light. Lighthouses keep their rotating beam but the beam is a
crisp cyan wedge, not a soft glow.

**Palette:** sea-glass teal `#4ec9d0` and sun-bleached sand `#f4c8a0` (both already used in the
existing `beach.js` building palette — reuse verbatim for continuity), cyan `#5fe0ff` (spine
carryover) as the tech accent.

**Mecha-mount tie-in:** the mecha-hawk reference (blue/white, wings, talons) fits a coastal
scout-mount better than any other realm — reads as a gull/osprey analog patrolling the coastline.

**QUILL:** *"The tide charts used to be guesswork. Now they're just also guesswork, but the
guesswork glows."*

### 4.4 Forest → Forest-Tech

**TURTLE:** the existing **Kether Keep** landmark is the anchor here — Kether is the topmost
sephirot on the Kabbalistic Tree of Life, meaning this region already, unknowingly, carries the
occult-almanac spine's deepest reference point. Forest-tech should lean into this rather than
away from it: living wood fused with brass/copper fittings (not steel/chrome — copper patinas
green over time, which visually rhymes with real forest lichen), glowing moss-veins instead of
LED strips, canopy-filtered light as the dominant lighting language instead of hard studio light.

**Palette:** deep pine `#1f3d2e`, aged copper `#6b7a5c`→`#8a9a6c` patina range, glow-moss emerald
`#00ff9c` (spine carryover, doing double duty with meadow — deliberate, both are "grown" realms).

**Mecha-mount tie-in:** the moss-covered ape-mecha reference is the forest realm's signature mount
almost without modification — it already reads as "nature reclaiming a machine," exactly the
region's throughline.

**QUILL:** *"Kether Keep doesn't light its own halls. The moss does that. The Keep just decided,
a long time ago, not to argue with it."*

### 4.5 Desert → Dune-Tech

**TURTLE:** like beach, this region already hands us the two key pieces: a **Grand Forge** and an
**Air Pad**. Dune-tech is the realm where SHADDAI's own Forge identity (gold trim, dark base,
sacred-geometry etching — the *actual* original spine) is most legible without contradiction,
because a forge in a desert reads as *correct* on its own terms, not as a tech overlay. Sun-bleached
adobe walls, brass sun-collector panels instead of solar-glass, heat-shimmer as a rendering motif.

**Palette:** adobe clay `#c9764f`, sun-brass `#e8c45c` (spine gold, doing triple duty across
meadow/desert — this is the thread that ties the "grown/crafted" realms together, deliberately),
deep shadow-violet `#3a2a4a` for the cool side of every hard desert shadow.

**Mecha-mount tie-in:** the ice-mammoth reference doesn't fit desert thematically, but its *build
language* — heavy, tusked, load-bearing — maps well onto a desert **camel-mecha** or **dune-crawler**
hauling caravan freight between the Grand Forge and the Air Pad.

**QUILL:** *"Nothing sells for less than water out here, and nothing sells for more than a Forge
that still runs when the sand gets in everything else."*

### 4.6 Suburb → Retro-Future Suburb-Tech

**TURTLE:** the sparsest existing region (only a GATEWAY landmark documented), which is actually
useful — this is the realm with the most room to define fresh. Retro-future suburb-tech: manicured
lawns, picket fences, but every driveway has a hover-mower, every mailbox has a small delivery-drone
perch. This is the "everyday life caught up to the future and got bored of it" realm — the tone
should be gently mundane, not spectacular, which differentiates it from every other realm on
purpose.

**Palette:** picket-fence white `#e8e4da`, lawn green (muted, not neon — deliberately the least
saturated realm) `#7a9c6a`, single warm-porch-light accent `#ffb85c`.

**QUILL:** *"Every house on the block insists theirs was the first to get the delivery-drone
perch. None of them are right."*

### 4.7 Volcano → Forge-Industrial-Tech

**TURTLE:** sparsest region in the code (procedural, no fixed named buildings found) — pairs
naturally with dune-tech's Grand Forge as the *heavy industry* end of the same thread: this is
where ore actually gets smelted before it reaches the desert forge. Molten-glow as the dominant
light source (replacing sun/moon entirely in this one realm — a deliberate exception), obsidian-black
rock (direct, literal callback to the original spine's `#06080b`) with magma-orange seams.

**Palette:** obsidian `#06080b` (spine carryover, and correct here literally, not just
thematically — this is where "obsidian" as a material actually exists in-world), magma-orange
`#ff6a2e`, structural iron `#3a3530`.

**Mecha-mount tie-in:** a natural home for a heavy quadruped hauler-mecha (chicken-tank or
"normal vehicle [has limbs]" archetypes from the mecha-silhouette reference sheet) moving ore.

**QUILL:** *"Everything here is either fireproof or hasn't been here long."*

### 4.8 Darkforest — stays as-is, explicitly

Not tech-fused. This is `dark-realm.js`'s Forest → Moat → Gate → Chains → Final-boss siege
sequence, already spec'd and partially wired per the Sept 9 spec. Its gothic-castle identity is
the whole point of it reading as a threat distinct from every other (friendly, lived-in) realm.
The castle-mood references from earlier this session (swirling cosmic sky, glowing lava-glass
approach path, torches) belong here, not to any tech-fusion realm — TURTLE recommends the glow
color for that path be emerald `#00ff9c` instead of the reference's blue-pink, to tie it back to
the spine as "the one realm still lit the old way."

### 4.9 Where the 24 already-generated characters live in this model

Not discarded, not wasted: the Warrior/Mage/Explorer/Engineer/Scout roster and the 7 council
agents (both smooth-chibi and voxel-block variants) *are* the Lantern Order — and the Lantern
Order's obsidian/emerald/gold identity now reads correctly as **Kether Keep's own order**, i.e.
native to the Forest-tech realm (§4.4), not a game-wide default. This resolves the apparent
conflict cleanly: nothing generated today was the wrong style for *everywhere* — it was scoped too
broadly by default, and this spec narrows that scope to where it was always most at home.

### 4.10 2D/3D parity is a hard requirement, not a nice-to-have

Owner, stated three times in direct succession this session: *"we have a 2D game already it
should match the 3D realm yes"* and *"All of these things needs to be connected and aligned."*
This is not aesthetic preference, it's a design constraint every future batch must satisfy:

- Each realm's palette (§4.1-4.7) applies identically whether the asset is a `public/world-regions/*.js`
  2D building/sprite or a `fal-assets/characters/` 3D model/sprite-strip for that realm. One hex
  list per realm, referenced by both.
- A mecha-mount generated for a realm (farm-tech ox, coastal hawk, forest ape, etc.) needs to exist
  as BOTH a rideable 3D model (same pipeline as the character roster,
  `fal-assets/CHARACTER_WORKFLOW.md`) AND a matching 2D sprite for `game.html`'s existing region —
  not one or the other. Same rule as the characters: one asset generation, two renderings, not two
  separate art efforts that can drift apart.
- Vehicles follow the same rule and the same "farm-tech tractor becomes a mecha-tractor, cars
  hover, boards hover" pattern the owner specified directly — every realm's vehicle silhouette
  is its real-world analog (tractor, boat, delivery van) with that realm's tech language applied,
  not a generic hover-vehicle reused across realms.
- Before generating ANY new asset (character, mount, vehicle, building), check: does the
  equivalent already exist in `public/world-regions/<realm>.js` for the 2D side, or in
  `fal-assets/characters/` for the 3D side? If one exists and the other doesn't, build the missing
  half to match — don't start a third, disconnected version.

## 6. Status: mounts + vehicles shipped (2026-09-18, same day)

All 6 non-darkforest realms now have a static 3D mesh mount AND a static 3D mesh vehicle,
following this spec's palette/silhouette rules directly (`fal-assets/characters/mount-<realm>*/`,
`fal-assets/characters/vehicle-<realm>*/`):

| Realm | Mount | Vehicle |
|---|---|---|
| Meadow (farm-tech) | Ox (plow-hauler) | Mecha-tractor |
| Beach (coastal-tech) | Hawk (patrol scout) | Hoverboard |
| Forest (forest-tech) | Ape (moss-reclaimed) | Canopy zipline pod |
| Desert (dune-tech) | Camel (dune-hauler) | Hover-buggy |
| Suburb (retro-future) | Dog (neighborhood-watch) | Hover-scooter + delivery-drone |
| Volcano (forge-industrial) | Rhino-hauler (obsidian/magma) | Ore-hauler truck |
| City (neon-streetwear) | — (not designed, hub doesn't need one) | Hover-car |

**Real constraint discovered mid-session:** fal's Meshy rigging endpoint is confirmed
humanoid-only by direct test (not just docs) — every quadruped/vehicle mesh above is STATIC,
no walk/drive animation. Owner's explicit call: don't warp designs into bipeds to force
rig-compatibility, ship full-detail static meshes instead and solve animation separately later
(candidate: procedural idle bob / wheel-spin in three.js needs no skeleton; real walk-cycles need
either a different rigging service or hand-rigging, neither investigated yet).

**Neon-streetwear technique note:** `register: "cinematic"` and `register: "pixel"` both have the
OLD obsidian/emerald/gold palette baked into their base prompt text (`SPINE_CINEMATIC`/
`SPINE_PIXEL` in `generate.mjs`) and will fight any other palette. Use `register: "raw"` (added by
the other session for the icon pipeline) plus explicit "2D anime illustration, NOT a photograph,
flat cel-shading, thick black outlines" framing in the prompt body — confirmed working on the
city hover-car after one correction pass (first attempt with `raw` alone still drifted photoreal).

## 5. Open questions for owner review before any generation batch

1. Confirm the realm↔theme mapping in §4 matches intent (especially desert/volcano forge pairing
   and forest/Kether Keep framing — these are TURTLE's inference from the existing code, not
   something the owner stated directly).
2. Confirm mecha-mount assignments in §4.2-4.7 (bison→farm, hawk→beach, ape→forest,
   mammoth-build-language→desert-as-camel, industrial→volcano) before any mount art batch spends.
3. Should the jackpot-mech-boss reference (casino/dice/cards, from this session's Hall district
   discussion) become an actual Hall-district boss encounter, parallel to Dark Realm's dragon? Not
   assigned to any realm above — it belongs to `hallView`/casino content, out of this spec's scope.
4. Suburb (§4.6) is the one realm this spec invents fresh rather than reading off existing code —
   worth explicit owner sign-off since there's no existing building-name evidence to check it against.

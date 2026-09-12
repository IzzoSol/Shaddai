# Forge Character Kits & Cosmetics Store — Design

> 2026-09-12. Architectural spec, brainstormed this session. Covers Phase A (character kits + accessories) and Phase B (Sparks-priced cosmetics store). Phase C (NFT presale, funds/gates Phase D) and Phase D (agent embodiment — agents/bots piloting a body, tasks, goals, leveling, pets, first-person mode) are explicitly out of scope, deferred to their own future specs.

## One sentence

Players pick a "character kit" (a matched portrait art style + procedural walking-rig template) for their Forge operative, then dress it in fal-generated accessories bought with Sparks — real store loop, built on infrastructure that already exists.

## Reality check — what's already there

- `public/pixel-people.js` — code-drawn (canvas, $0 cost) isometric character rig. Zero image assets. Draws every character in `game.html`, the Dark Realm siege, and The Hall's office rooms today. `PixelPeople.draw(ctx, rig, sx, sy, scale, t)`; rig is a flat data object (skin/hair/cap/shirt/pants/shoe/glasses/etc + `office`/`jobTint`/`classTint` metadata that survives JSON clone/save).
- `public/pixel-forge.html` — Forge UI. Has an Office picker (added 2026-09-10) and an ARCHES tab filter pattern to extend.
- `backend/lib/operatives.js` — single source of truth for every forged operative (`{id, owner, codename, look, portrait, inventory:{files,collectables}, economy:{creditsSpent,...}, ...}`), atomic JSON persistence, already read/written by Forge/Rooms/Marketplace/Office/Collectables. `inventory` already exists — this spec adds one array to it, not a new store.
- `backend/data/credit-costs.json` + `enforceCredits()` (`backend/api-proxy-routes.js`) — existing Sparks/credit debit pattern from this session's fal-pricing work (100 credits = 1 Spark = $1).
- `fal-assets/generate.mjs` — fal.ai batch generator, dry-run by default. Has a locked style spine (`SPINE_PIXEL`: isometric pixel-art, clean 2:1 tile projection, palette-locked emerald/gold/cyan/obsidian, single light source upper-left 45°, game-ready spritesheet quality) and an untested `img2img` job type (`fal-ai/flux/dev/image-to-image`, field `image_url`, `strength` default 0.6 in this codebase's own prior usage).
- `backend/lib/hf-keys.js` — free HuggingFace FLUX pool with automatic Pollinations fallback (`generateSafe()` never throws, always returns a usable image).
- Commit `98bf42d` (2026-09-10): fal master-sheet route already tested once for full-character-sprite generation and rejected — two flux/dev generations both produced a front-facing smooth-cartoon portrait, not an isometric transparent game sprite.

## Decision: hybrid art architecture (evidence-based)

**Tested this session, six data points total (one HF draft + five style variants, covering top-down, 3/4, side-profile, chibi-top-down, and voxel-elevated camera requests):** five of six ignored the requested camera angle and defaulted to front-facing hero/portrait framing regardless of which angle was asked for. This confirms the finding from `98bf42d` generalizes — the failure is not "isometric is hard," it's that flux-family models will not reliably hold *any* specific non-default game-camera angle through text prompting alone.

**Conclusion:** do not change the 2D world's isometric projection (`dark-realm.js` 1,093 lines + `game.html` 2,031 lines + `combat.js` 504 lines + `pixel-people.js`'s draw math all assume it — a real rewrite, not a tweak, and the evidence says a different angle would hit the identical wall). Instead:

- **Walking in-world sprite** stays the procedural `pixel-people.js` rig — the only thing that reliably produces correct isometric geometry.
- **Portrait art** (Forge preview, character-select, store cards, office busts — everywhere a character is seen up close, not walking) uses fal/HF-generated front-facing art, which is exactly the framing these models default to anyway. This turns the "failure" into the intended pipeline.

## Character Kits

A kit bundles a portrait art style + a matching rig template (proportions/palette) so a player's portrait and walking figure read as one coherent character, not two mismatched styles.

Five kits identified this session (from real generated test art, not invented in the abstract):

| Kit | Portrait style | Rig template | Status |
|---|---|---|---|
| **Voxel** | Low-poly geometric render (clean 3D-render look, tech palette) | Blocky/geometric proportions | **Flagship — build first** (user's pick from the live comparison) |
| Sentinel | Sci-fi realism, painterly, glowing armor | Standard proportions | Banked for later |
| Comic | Cel-shaded, bold outlines, flat comic shading | Standard proportions | Banked for later |
| Chibi | Cute cartoon, big head/small body, glowing eyes | Chibi proportions | Banked for later |
| Archivist | Refined side-profile realism | Leaner proportions | Banked for later |

**This phase builds Voxel only.** The other four are validated-but-deferred — same "prove the pipeline on one, then wrap more in" sequencing the Hall/Royale spec used for its own build order. Adding a kit later is: one portrait generation pass + one rig-template code branch, not new infrastructure.

**Rig template mechanism:** extend `pixel-people.js` with a `rig.kit` field (default `'classic'` = today's existing look, unchanged for all current presets/operatives — zero migration risk). `rig.kit === 'voxel'` branches in `guy()` the same way `rig.robot` already does today (a special-case block, not a rewrite of the draw function) — blockier proportions, flat-shaded palette pulled from the Voxel portrait's actual color values (`#06080b` obsidian base, `#e8c45c` gold trim, `#5fe0ff` cyan glow, `#00ff9c` emerald accent — this is already the exact site-wide Art Bible palette, so the Voxel kit reuses it, not a new palette).

**This is a fully animated, walking character, not a static image.** `guy()`'s existing walk-cycle math (`L`/`str` — the leg/arm swing computed live from `t`/`phase` every frame) drives the Voxel branch exactly like it drives every other rig today; the branch changes box proportions and shading, not the animation system. The portrait art from the pipeline below is ADDITIONAL — shown only in UI chrome (Forge preview thumbnail, character-select card, store card, office bust) — the character that actually walks around `game.html`/the Dark Realm/The Hall is always the live procedural rig, identical mechanism to every character in the game today.

**Diversity carries over.** `pixel-people.js`'s existing 100-preset system is explicitly built for diverse people (varied skin tones, hair, builds — see its own header comment). The Voxel kit is a proportions/palette branch applied on top of that same preset variety, not a single fixed character — a player picks Voxel *and* a skin tone/hair/build within it, the same two-axis choice (kit × preset) as picking an outfit today. Building the Voxel kit means adding this branch plus a representative spread of presets through it (not just one demo character), so the kit reads as "many different Voxel people," matching the "fits all kinda people" goal directly.

**Portrait generation pipeline (per kit, one-time cost):**
1. Draft via `backend/lib/hf-keys.js` `generateSafe()` (free — HF pool or Pollinations fallback).
2. Detail-refinement pass via `fal-ai/flux/dev/image-to-image` (`image_url` = draft as data URI, `strength ≈0.5-0.7` tuned per test — refining an *already-correct* pose/framing, not fixing geometry, so this works where the isometric attempt didn't).
3. Background removal (the drafts come back on a flat gray/white background, not transparent — needs a real transparency pass; see Task list).

## Accessory / clothing layer

Today every cosmetic (hat, glasses, tie) is a canvas primitive drawn by `pixel-people.js` — no images at all. This phase adds the engine's first image-overlay capability:

- New rig field: `rig.accessories = { hat: 'id'|null, weapon: 'id'|null, pet: 'id'|null, wings: 'id'|null, mask: 'id'|null }` (slot list fixed for this phase; extensible later).
- New catalog: `public/assets/accessories/catalog.json` — array of `{ id, slot, kit: 'voxel'|'any', anchorOffset: {x,y}, imageFile, rarity, sparksPrice }`. `anchorOffset` accounts for the fact a hat sits differently on the Voxel rig's blockier head than the classic rig's — one anchor per (accessory, kit) pair that matters; `kit:'any'` accessories (most of them) use one anchor tuned against the classic rig and are close enough for Voxel's similar head size.
- `pixel-people.js` gains an image-loading/caching layer (`Image()` objects keyed by `imageFile`, loaded once, drawn via `ctx.drawImage()` at the anchor point after the procedural rig is drawn) — this is the one genuinely new rendering capability in this spec; everything else is data/content.
- **Accessories move with the walk cycle, not painted on top of it.** `anchorOffset` is expressed relative to the same per-frame animated coordinates every existing cosmetic already uses (`cx`/`cy`/`T(o)` — which already bake in the live `L` walk-bob offset each frame, exactly like `rig.cap`'s existing draw call does today). A hat drawn at a fixed screen position while the head bobs beneath it would look broken; anchoring to the animated head/hand/back position instead of a static offset is a correctness requirement, not a nice-to-have — call this out explicitly in the implementation task for whoever builds the overlay layer.
- Accessory art generation: same HF-draft → fal-detail-pass pipeline as portraits, but targeting small flat icon art (hats, capes, weapons, wings, pets, masks) following `SPINE_PIXEL`'s existing style rules directly (no camera-angle problem here — these are flat item icons, not posed characters, so the framing problem this spec spent most of its research on does not apply to them).
- **Budget (precise, not rounded):** fal.ai flux/dev costs $0.025/megapixel, rounded up to the nearest megapixel. At icon scale (512×512 → rounds to 1MP), a 100-150 item accessory library, even generating 3-4 variants per item to pick the best, costs **$5-15 total**. Character kit portraits (5 kits × ~2 refinement passes each, at up to 1024×1024/2MP = $0.05/image) add roughly **$1-2 more**. This phase's total fal spend is under $20 against the $500 balance — the rest stays reserved for Phase C/D and the dashboard's ongoing per-request premium image tier (already Sparks-recovered from users at a healthy margin: 25 Sparks credits = $0.25 charged vs. ~$0.05 real cost).

## Forge UI (`pixel-forge.html`)

- New Kit picker row (same tab-row pattern as the existing Office picker) — one tile per kit, disabled/greyed for banked (unbuilt) kits with a "coming soon" label rather than hidden, so the roadmap is visible.
- Per-slot accessory browser (hat/weapon/pet/wings/mask) with a live preview canvas showing the composed character (kit rig + equipped accessories) using `PixelPeople.draw()` directly — no separate preview renderer needed.
- Owned vs. unowned accessories are visually distinct: owned show an equip toggle, unowned show a Sparks price tag and a Buy button.

## Inventory & Store (Phase B)

No new data file. `backend/lib/operatives.js`'s existing `inventory: { files, collectables }` gains a third array: `inventory.cosmetics: []` (owned accessory ids). New endpoints:

- `GET /api/cosmetics/catalog` — returns `accessories/catalog.json` (public, no auth).
- `POST /api/cosmetics/purchase` — `{ operativeId, accessoryId }`. Looks up price from the catalog, debits Sparks via the existing `enforceCredits()` pattern (same one wired into `/image/generate` this session), then pushes `accessoryId` into that operative's `inventory.cosmetics` and returns the updated record. Rejects if already owned (idempotent) or insufficient balance.
- Forge's accessory picker calls `GET /api/cosmetics/catalog` on load, cross-references against the current operative's `inventory.cosmetics` to decide owned-vs-buy per item, and calls `POST /api/cosmetics/purchase` on Buy.

## Explicitly out of scope this phase

- The other four character kits (Sentinel/Comic/Chibi/Archivist) — banked, not built.
- Phase C: NFT presale funding/gating specific accessories or forge-agent types. Separate spec when that's scheduled; this phase's accessory catalog schema already has room for a future `nftGated: boolean` field but nothing enforces it yet.
- Phase D: agent/bot embodiment (an agent or external bot piloting a character body, autonomous tasks/goals/leveling, pets-as-companions, first-person mode). Explicitly its own future architectural spec per the decomposition agreed this session — not a cosmetics add-on.
- Custom avatar generation (type a description or upload a photo → a walking sprite). Deferred behind Phase D; this session's testing already shows the naive version of this (full character image → game sprite) doesn't work, so it needs its own dedicated design pass, not a bolt-on here.

## Testing

- Unit: rig-template branch in `pixel-people.js` (`kit:'voxel'` renders without throwing for every existing preset field combination); accessory anchor math (image drawn at the expected pixel offset for a known scale/kit).
- Integration: `POST /api/cosmetics/purchase` — insufficient balance rejected, duplicate purchase idempotent, successful purchase debits the correct Sparks amount and appears in `inventory.cosmetics` on the next `GET` of that operative.
- Manual/visual: Forge preview renders the Voxel kit + at least 3 equipped accessories correctly at the actual in-game scale used by `game.html` (not just the Forge's own preview canvas size) — anchor offsets are the most likely thing to look right in isolation and wrong in-world.

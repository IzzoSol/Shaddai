# HANDOFF — next session (2026-11-06, part 2)

Open a new Claude Code terminal in `C:\Users\Brittany\Shaddai-3d` and say:
**"read docs/HANDOFF-20261106b-NEXT.md and continue"**.
Older context: `docs/HANDOFF-20261106-WHERE-WE-LEFT-OFF.md` (what the world work contains) + master plan Phase W.

## Target + git (read first)
- Deploy target = **main repo** `IzzoSol/Shaddai` → https://shaddai-g81x.onrender.com/ (Render auto-deploys `main`). Never push `main` without the owner.
- **All world work is now committed** on branch **`polish/world-finish-p2`** (built from a temp index, never checked out):
  - `7b66ec5f` world polish: bazaar v02 + tunnel trains, Athenaeum classes, bot bodies, light budget, intro/Navi, forge demo (52 files, incl. `shaddai_bazaar_city_v02.glb` force-added)
  - `7f8811fb` agents: owner headshots = canonical agent faces; SHADDAI = glowing SH crest
- The shared folder is checked out on **`feat/sap-treasury`** (another session's branch). **Do not check out / switch branches here.** Keep committing with the temp-index method:
  ```
  export GIT_INDEX_FILE="$(git rev-parse --absolute-git-dir)/tmp-idx-x"
  git read-tree polish/world-finish-p2 && git add <files>
  T=$(git write-tree); C=$(git commit-tree $T -p polish/world-finish-p2 -m "...")
  git update-ref refs/heads/polish/world-finish-p2 $C <old-sha>; rm -f "$GIT_INDEX_FILE"
  ```
  (`.git` is a file here: use `git rev-parse --absolute-git-dir`, not `.git/`.)
- Left OUT of the branch on purpose: `backend/sap-routes.js` (treasury session), `backend/api-proxy-routes.js` (`agent` param on /api/shaddai/chat; who owns it is unclear, so ask the owner), `backend/data/agent-avatars.json` (timestamps only), runtime data (`home-deeds.json`, `navi-state.json`), junk txt, `tools/_out`, `public/__audit-shots`, `fal-assets/backups`.
- The old temp backup folder from the earlier handoff is **gone**; the branch is now the backup.

## Done this session
1. Committed the world work (above).
2. **Agent faces** (owner images from `OneDrive\Pictures\LF2\MODELS FOR FAL`): `public/assets/agents/<A>-portrait.png` now = TURTLE (green avatar, dark corners + green rim added), NEXUS (agent-nexus), PIKADON (agent-pikadon), ORACLE/QUILL/ZEROX (`*-council.png`), SHADDAI = square crop of `assets/council/SH-logo.png`. 768², JPEG data (same as before).
   Old full-body art → `<A>-body-ref.png`; `tools/hf-likeness.cjs` + `tools/k42_pikadon.py` now reference body-ref. `agents.html` uses the portraits for all 7 (`IMGV=faces-20261106`). Server revalidates images by ETag, no long cache.
   Not yet eyeballed inside the running game (Navi picker / forge tab), so do that in the headless pass.
3. **Disk**: deleted the 4 superseded `docs/blender/*.blend1` (Blender previous-saves; the `.blend` was newer each time). C: now ~1.1 GB free. **Kept** `realm-view-20261023-owner-edit-backup.blend` (owner's hand edits, unverified whether merged) and `realm-view-20261023-before-finish.blend` (only rollback before the finish pass). Also untouched: `before-refresh`, `before-towns` (~170 MB more if the owner ever OKs).

## NEXT (owner order)
1. **Polish the Navi** (`public/world-navi.js`, 715 lines + `world-navi-chat.js`). Owner asked for this now. Notes from a first read (leads, not verified on screen yet):
   - **Demo data still seeds state**: `S.bots` default = AEGIS-7 / NYX-3 / ORACLE-9 with fake revenue (412, 96), and `S.inventory` has a demo default (overwritten by `realInventory()` on ITEMS). Contradicts "no demo data". The core label reads `NO ACTIVE BOT` from these. Check what the AGENTS module actually uses (`WorldBots`) and drop the fakes.
   - `CLASSES` (academy) and `JOBS` are hard-coded placeholders with made-up coords (200,200 / -200,300 / 500,-400). Point them at real places or label them "coming".
   - Ring has **15 nodes** of 64 px on a `min(46vh,40vw)` ring, so they likely overlap at 1200×760. Check the screenshot; maybe shrink nodes or group them (PLAY / OWN / AGENTS / SOCIAL arcs per the 2026-10-16 owner note).
   - `modes` and `settings` share the same gear icon.
   - Plates use `backdrop-filter: blur(6px)` (HOLO ARC block), but the 3D-skin comment says "no blur" and `open()` gates the full-screen blur to HIGH tier. Gate the plate blur the same way (fill-rate tax).
   - `render()` rebuilds both plates + swivel on every click; fine, but the academy code countdown only updates on re-render. Add a 1 s tick while ACADEMY is open.
   - Agent faces: the bots/agents detail could show the new `<A>-portrait.png`.
   - Existing tests: `tools/tests/world-navi-polish.test.cjs`, `world-navi-chat.test.cjs`. Screenshot tool: `node tools/_navi-shot.cjs` (writes `C:/Users/Brittany/navi-shot.png`; waits for `__loadPlayable`, ~110 s).
   - After editing: bump the script's `?v=` in `SHADDAI-WORLD-3D.html`, `node tools/build-dist.cjs` then `--check`.
2. **Headless audit** of what can be checked without spawning: Navi every module (screenshots), agent faces in picker/forge tab, console errors, run the `tools/tests` sweep (last: 101/102; only `canon:academy-hall` fails, an owner decision).
3. **Measure the light budget** (`public/world-light-budget.js`, `?lightbudget=0` = off). Baseline: street 1,708 calls / 2.9 M tris, aerial 3,485 / 3.4 M, realm edge 3,781 / 4.0 M; 40 lights, 660 shadow casters, 248 programs. Render the same 3 custom-camera viewpoints on/off, compare `renderer.info` + ms.
4. Textures / FPS (KTX2 via gltf-transform is pre-approved; shadow casters; static merges; hide far towns/titans).
5. Hoverboard feel (needs an in-game session).
6. Intro slides: owner sends images → `public/assets/loading/owner/NN.webp` + `world-loading-slides.js` SLIDES.
7. Owner approval → merge `polish/world-finish-p2` → `main` → deploy.

## Machine limits
- RAM was **1.23 GB free** at the end of this session; headless world tests need ~1.2–1.5 GB. Ask the owner to close Edge / opencode / other Claude windows first. How-to: memory `reference_shaddai_world_headless_probe.md`.
- Local server usually on :3013 (`node tools/serve.cjs 3013`); it was up this session.
- Disk ~1.1 GB free.

## Open owner decisions
- `api-proxy-routes.js` chat `agent` param: whose is it, and should it ship?
- `CLASS_01` academy marker vs the Athenaeum building.
- Cavern lighting (surface sun washes out the bazaar); bridges/cinematic art direction.
- ZEROX.glb 12.9 MB compression.
- Delete the remaining Blender safety copies (`owner-edit-backup`, `before-finish`, `before-refresh`, `before-towns`)?

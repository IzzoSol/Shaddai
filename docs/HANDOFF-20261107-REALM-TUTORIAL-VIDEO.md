# HANDOFF — Realm tour + tutorial video, British narration (2026-11-07)

Open a Claude Code terminal and say: **"read docs/HANDOFF-20261107-REALM-TUTORIAL-VIDEO.md on branch polish/world-finish-p2 and make the video"**.

Owner ask: *"we need content and tutorial of the realm"*, narrated in a **British accent**. Deliver one finished video plus a short written tutorial.

## Git + machine (read first)
- Code: branch **`polish/world-finish-p2`** (pushed to `origin`). Deploy = `main` on Render. **Never push or merge `main` without the owner.**
- `C:\Users\Brittany\Shaddai-3d` is shared and sits on `feat/sap-treasury`: **do not switch branches there.** Make your own worktree:
  ```
  cd C:\Users\Brittany\Shaddai-3d
  git worktree add --no-checkout ..\Shaddai-video -b feat/realm-video origin/polish/world-finish-p2
  cd ..\Shaddai-video
  export MSYS_NO_PATHCONV=1      # Git Bash only, or the '/backend/' patterns get rewritten to C:/Program Files/Git/...
  git sparse-checkout set --no-cone '/*.json' '/*.md' '/tools/' '/public/*.js' '/public/*.html' '/public/*.css' '/public/*.json' '/public/portals/' '/docs/*.md'
  git checkout
  ```
  The disk is nearly full (about 8 GB free): keep the worktree code-only. Models and art are served from `Shaddai-3d/public` by `tools/_serve-merged.cjs`.
- **8 GB laptop.** One heavy job at a time, headless only (never a visible browser). Booting the world needs **about 1.5 GB free RAM**
  (check `node -e "console.log(require('os').freemem()/1048576|0)"`). Below that, Claude Code reaps the job. Ask the owner to close apps.
  Another terminal (dashboard) may be running: ask before you boot the world.
- **Paid services:** narration uses ElevenLabs (the `text-to-speech` skill; key setup via `setup-api-key`). The owner asked for the voice, but
  **confirm the credit cost with the owner before generating**: write the full script first and send it for approval, then generate once.
  No fal / image-gen spend. No keys in git, logs or the video.

## Capture tools (already in the branch)
- `node tools/_serve-merged.cjs 3080` serves the worktree's `public/` first, then falls back to `ASSET_ROOT` (default `C:/Users/Brittany/Shaddai-3d/public`).
- `OUT=<folder> CHARS=SHADDAI,ZEROX node tools/_ride-shots.cjs` is a working example of driving the real game headless:
  - boot `SHADDAI-WORLD-3D.html?colointro=0&unlockall`, wait for `window.__loadPlayable` (about 110 s), click **Source Temple**, wait for `__spawnBusy === false` (spawn is slow under SwiftShader)
  - pick a body with `setPlayerCharacter(code)`, ride with `O` + `W`
  - render your OWN camera: `const D = __w3dDebug; D.renderer.render(D.scene, cam); D.renderer.domElement.toDataURL()`
- Handles: `__w3dDebug.{scene, camera, renderer, THREE, playerAvatar, playerPos, dragons, mobs, terrain, interiors, wildlife, skyTraffic}`, `__hover`, `Navi`, `WorldLink`.
- **Video under SwiftShader runs at about 1 fps**, so do not screen-record. Render frames **offline**: move your own camera along a path,
  render frame N, save PNG, repeat. For animations, step time yourself where the module allows (e.g. the bazaar ride `__bazaar._cineSeek(k)`).
  Then assemble with `ffmpeg` (`-framerate 30 -i f%05d.png`). Keep it to 720p to stay inside RAM.
- Writing PNGs per frame through `toDataURL` is slow: batch 30–60 frames per `page.evaluate`, and return them as an array.

## What the video must cover (about 3–4 minutes, chapters)
1. **Welcome to the realm:** an aerial flyover of Shaddai City and the realm map, ending at the Source Temple spawn.
2. **Moving:** WASD, Shift run, Space jump, mouse look, V camera, E interact, F1 shows the controls (full list: Navi → Settings → Controls).
3. **The Navi (Y):** the module ring (map, modes, jobs, items, shop, homes, wallet, sparks, agents, academy, chat, markets, news, radio, settings).
   Show **Settings → Navi style**: HOLO ARC, HEX DECK, CLEAN, WRIST. Show map waypoints.
4. **Hoverboard (O):** carve, boost, ollie (Space), flips (Shift+W/S), spins (A/D in the air), grab (Shift), plus the Hoverskate Park.
5. **Mounts and travel (I) + maglev (U):** stations on the ring line.
6. **Combat + wilderness:** left-click melee, Q bolt. There are 8 mob camps in the wilderness belt (mummies, imps, wraiths, stalkers): they chase,
   telegraph, then strike, and come back on a respawn timer. Night makes them stronger.
7. **Dragons:** they notice you within about 250 m, circle, then breath / swoop / stomp / tail; fleeing into the city makes them break off.
8. **Council agents + the Academy (the Athenaeum):** the 7 council agents, the class hall, the tier rings (1 AI to 7 Agentic AI).
9. **Your stuff on the dashboard:** the Navi **DASHBOARD** slot opens `/dashboard#worlds/myworld` (characters, bots, mounts, homes, Sparks), and
   links come back into the world (`?navi=bots`, `?pin=academy`).

Use only what is real in the game (verify each claim on screen; if a feature does not show up, cut it from the script and tell the owner).
No made-up prices, listings or promises; no money, token or wager claims.

## Voice
- British accent, warm and clear, like a documentary guide. Pick an ElevenLabs British voice, generate **one short sample line first** for the owner to approve.
- One MP3 per chapter (easy to re-do one), then merge them. Captions too: write an `.srt` from the script.

## Deliverables (put them in `C:\Users\Brittany\Videos\Shaddai\`, NOT in git: videos are large)
- `shaddai-realm-tour-v1.mp4` (720p, captions burned in or as a side `.srt`)
- `script.md` (the approved narration) and `tutorial.md`: the same content as a written step-by-step guide.
- Optional, ask first: `tutorial.md` also as a Navi "HOW TO PLAY" entry or a dashboard Worlds-tab card (small PR on your branch).

## Known state (so the video does not show broken things)
- Hoverboard rider fix landed (`5d9cb603`): hands bind through their own arm chain. A real-game ride check was running when this was written.
  **If any body looks torn or spiky on the board, do not film it: tell the owner** (leads: the animation layer `ual-retarget.js`, the
  baked clips in the agent GLBs, `WorldRiderPose` in `world-actions.js`).
- Frame rate is low on weak machines (about 1,400–1,650 draw calls per frame). Offline frame rendering avoids it for the video.
- The Shaddai MCP server timed out on 2026-11-07; restart it if you need it.

## End with
Summary · files made · commands run · cost of the narration (characters / credits) · what was cut and why · open questions.

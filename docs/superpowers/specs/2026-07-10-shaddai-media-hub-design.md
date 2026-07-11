# SHADDAI Media Hub — Design Spec

Date: 2026-07-10
Status: Approved (design) → pending spec review → writing-plans
Supersedes/absorbs: `2026-07-10-media-tab-and-popout-ui-design.md` (its Create/free-video/gallery/HUD
work becomes the **Create** sub-tab + polish phase of this hub).

Owner ask (verbatim intent): "Put the video Clipper, the video generator, image/music, and a gallery
all in ONE place — organized and clean. Make a **Shaddai Media** tab. Move **Simple Mode** out of
Workflows to a prominent **Quick Create** button. Better tab emojis/icons."

Informed by an external architecture review (`ASK-PERPLEXITY-shaddai-media-organization.md` +
`shaddai-media-architecture-guide.md`), adopted with owner-fit adjustments (below).

---

## 1. Goals

1. One top-level **Shaddai Media** destination that unifies **Create · Clipper · Gallery** without
   adding clutter (dashboard already has ~28 top-level `showView()` tabs).
2. **Simple Mode → Quick Create**: a global beginner entry point (header CTA + Home hero card),
   leaving Workflows as advanced-only.
3. A **federated Gallery**: dashboard-generated media and Clipper-rendered clips shown in one grid,
   via a shared `MediaAsset` contract — **without** merging codebases, storage, or deploys.
4. Keep the Clipper **embedded via iframe** (separately deployed, CPU-heavy). No framework rewrite.
5. Foundation for asset **handoff** ("Use in Clipper" as intro/b-roll) — metadata-only, later phase.

## 2. Non-goals (explicitly deferred)

- **No 28→grouped-nav regroup or Cmd+K palette in this spec.** It's valuable but a large edit to a
  co-owned 52k-line `index.html`; it becomes its own separate spec later to avoid collisions.
- **No full replacement of all 28 tab emojis.** Only the Media subnav + Quick Create get a curated
  icon set now; the rest is part of the later nav project.
- **No paid provider spend.** Funded video path stays dormant until `FAL_KEY` is set.
- **No deep frontend fusion / porting the Clipper into the dashboard.** Iframe stays until the pain
  signals in §7 appear.
- **No merging of Clipper storage into dashboard storage.** Federation by contract only.

## 3. Adjustment vs. the external review

The review recommended "build the `MediaAsset` contract first." We flip the first two phases for
**visible, low-risk wins**: ship the **shell + Quick Create first** (instant product clarity), then
the gallery federation plumbing. Everything else in the review is adopted.

---

## 4. Information architecture

```
🎬 SHADDAI MEDIA   ( showView('media-hub') — one top-level tab )
 ├─ ✦ Create   — image (free FLUX) · video (free motion-clip .webm + HF-beta + BYOK) · music
 │               (this is the existing media-tab spec, relocated here)
 ├─ ✂ Clipper  — the SHADDAI Clipper, embedded <iframe>, lazy-loaded on first open
 └─ ▦ Gallery  — federated MediaAsset grid: dashboard /api/gallery + Clipper /api/clips/v1/gallery
                 filters (kind/source/date) · Download · "Use in Clipper" / "Use in Create" handoff

Header (persistent):  [ ✚ Quick Create ]  → modal "What do you want to make?" → Image · Video · Music · Clip
Home view:            hero card mirroring Quick Create
Workflows tab:        unchanged, advanced-only (Simple Mode removed from it)
```

The current `showView('media')` becomes the **Create** pane inside the hub (kept working; re-parented,
not rewritten). `media-hub` is the new top-level id.

### 4b. Codex surface (public landing `codex.html`)

The Codex (`public/codex.html`) is the public almanac landing with instrument links (`.lk`). Two
changes, built with TURTLE + the frontend-design skill:

- **Add a "Shaddai Media" instrument** → opens the Shaddai Media hub (option 2a). Until the hub ships,
  it can point at the Clipper; switch the href to the hub route once Phase 1 lands.
- **Turtle Museum → into The Athenaeum (3D).** Today it's its own Codex link (`/museum.html`). The
  museum is already built; promote it into a **walkable 3D room inside `athenaeum.html`** alongside
  Oracle's observatory and Quill's library (the Athenaeum already hosts ORACLE + QUILL entry portals
  via `enterOracle` / `enterQuill`). Work: make the museum **walkable**, **fix the pillars/geometry**,
  and wire it as a third portal (`enterMuseum`); update the Athenaeum's blurb to "Oracle · Quill ·
  Turtle's Museum"; **remove the standalone `/museum.html` link** from `codex.html`. No new standalone
  museum page.

Codex files touched: `public/codex.html` (add Shaddai Media link, remove Museum link, relabel
Athenaeum), `public/athenaeum.html` (third walkable museum room + `enterMuseum`), reusing existing
`public/museum.html` content/assets.

---

## 5. The shared `MediaAsset` contract (the integration layer)

Both apps emit the same normalized shape so the Gallery can render everything in one grid:

```ts
type MediaAsset = {
  id: string
  sourceApp: 'dashboard' | 'clipper'
  ownerUserId?: string
  kind: 'image' | 'video' | 'audio' | 'clip' | 'cover'
  title: string
  status: 'ready' | 'processing' | 'error'
  thumbUrl?: string
  fileUrl: string
  previewUrl?: string
  mimeType?: string
  width?: number; height?: number; durationSec?: number
  createdAt: string
  tags?: string[]
  projectId?: string
  originMeta?: { sourceId?: string; batchId?: string; clipId?: string; candidateId?: string; provider?: string; theme?: string }
}
```

**Rules:** HTTP is the source of truth for Gallery data; `postMessage` is only for "something changed,
refetch" signals; every message bridge validates `event.origin` before trusting a payload.

### Gallery sync flows
- **Passive merge (baseline, must always work):** on Gallery open, fetch dashboard `/api/gallery` +
  Clipper `/api/clips/v1/gallery` (through a dashboard proxy/bridge to avoid CORS/mixed-origin), merge
  + dedupe into one normalized `MediaAsset[]`.
- **Event refresh:** Clipper posts `clipper:batchComplete` / `clipper:assetCreated` to the parent;
  parent verifies origin → refetches or optimistically inserts.
- **Handoff (later):** Gallery "Use in Clipper" sends metadata into the iframe; Clipper surfaces it in
  an `ImportedAssetsTray` for intro-card/b-roll — no filesystem/object sharing across origins.

---

## 6. Quick Create

- Exposed as a persistent **header CTA** and a **Home hero card**.
- Opens a modal whose first and only question is **"What do you want to make?"** → Image · Video ·
  Music · **Clip from long video**. Each option launches the right module (Create sub-tab section, or
  opens the Clipper) with minimal ceremony.
- This is the relocation target for the current **Simple Mode** content; Workflows keeps only advanced
  automation.

---

## 7. Keep the iframe — and the switch signals

Iframe embedding is correct now (isolation, independent deploy, resource separation). Revisit deeper
fusion only when these recur: shared auth/theme/state becomes too awkward to bridge; users need one
seamless editor across Create/Gallery/Clipper; or persistent iframe UX pain (double nav, sizing,
focus, fragmented analytics). Until then, iframe = strength.

---

## 8. Files touched

### Dashboard (`SHADDAI MASTER FINAL BUILD`)
| Path | Change | Purpose |
|---|---|---|
| `public/index.html` | modify | Add `media-hub` view + Create/Clipper/Gallery subnav shell; Quick Create button + modal + Home hero; re-parent current Media into Create; Gallery host area. |
| `backend/gallery-routes.js` | modify | Return normalized dashboard assets in `MediaAsset` shape. |
| `backend/media-save.js` | modify | Emit `MediaAsset` for dashboard-created outputs. |
| `backend/video-routes.js` | modify | Ensure generated video enters the Gallery contract; keep the free/BYOK/funded priority from the prior spec. |
| `backend/media-index.js` | add | Aggregate dashboard assets + Clipper feed into one normalized response (server-side proxy → avoids browser cross-origin). |
| `public/js/media-shell.js` | add | Create/Clipper/Gallery sub-tab switching; lazy-load iframe; `openMediaTab()`. |
| `public/js/gallery-sync.js` | add | Fetch/merge/dedupe/filter/refresh unified Gallery. |
| `public/js/clipper-bridge.js` | add | Parent-side `postMessage` bridge with origin checks. |
| `public/js/quick-create.js` | add | Global Quick Create modal (promoted Simple Mode). |

### Clipper (`SHADDAI CLIPPER`)
| Path | Change | Purpose |
|---|---|---|
| `server/src/server.ts` | modify | Add `GET /api/clips/v1/gallery` returning `MediaAsset[]`; emit/persist asset metadata on render complete. |
| `server/src/asset-manifest.ts` | add | Convert clips/covers into shared `MediaAsset` objects; decide which are gallery-visible. |
| `src/lib/parentBridge.ts` | add | Safe iframe→parent messaging (origin allow-list). |
| `src/hooks/useParentBridge.ts` | add | React hook: emit `clipper:assetCreated` / `clipper:batchComplete`; receive `dashboard:importAsset`. |
| `src/components/ImportedAssetsTray.tsx` | add | Show dashboard-sent assets for intro/b-roll (later phase). |

(Note: the Clipper engine is currently a flat `server/src/*.ts`; the gallery route can live in
`server.ts` + a new `asset-manifest.ts` rather than a `routes/` folder, matching the real structure.)

---

## 9. Phased rollout (low-risk order)

1. **Media shell** — `media-hub` view + Create/Clipper/Gallery subnav; move current Media → Create;
   lazy-load Clipper iframe.
2. **Quick Create** — Simple Mode → global button + Home hero + modal; Workflows advanced-only.
3. **Gallery federation** — `MediaAsset` contract; Clipper `/api/clips/v1/gallery`; dashboard
   `media-index.js` merge; unified grid with filters + Download.
4. **Event bridge** — `postMessage` batch-complete/asset-created with origin verification → auto-refresh.
5. **Asset handoff** — "Use in Clipper" / "Use in Create" (metadata only); `ImportedAssetsTray`.
6. **Polish** — agentic-HUD pop-out restyle (from prior spec) + curated Media/nav icon set +
   free-video paths finalized in Create.

Each phase is independently shippable and eyeball-able before the next.

## 10. Testing / verification

- **Shell:** open Shaddai Media → Create/Clipper/Gallery switch; iframe loads only when Clipper opened.
- **Quick Create:** header + Home card open the modal; each option launches the right target.
- **Federation:** render a clip in Clipper → it appears in the dashboard Gallery after refresh; a
  dashboard image appears too; both share the `MediaAsset` shape; dedupe holds.
- **Event bridge:** finishing a Clipper batch auto-refreshes the Gallery (origin-checked).
- **Security:** parent ignores messages from unknown origins / unknown `type`; payload shape validated;
  iframe messages never used as persistence (always refetch authoritative data).
- **No regressions:** existing Media generation + Workflows still work; dashboard still deploys.

## 11. Risks & mitigations

- **Co-owned `index.html`:** coordinate with the other terminal; land shell edits in small commits;
  keep new logic in `public/js/*.js` modules to minimize inline diff surface.
- **Cross-origin gallery fetch:** do the Clipper fetch **server-side** (`media-index.js` proxy), not in
  the browser, to sidestep CORS/mixed-content.
- **Clipper prod URL:** federation needs the Clipper deployed (or a dev `:8787`); until deployed, the
  Gallery gracefully shows dashboard-only assets.
- **Scope creep into nav-regroup/icons:** kept as deferred non-goals (§2).

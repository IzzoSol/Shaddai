# SHADDAI — THE FRONT DOOR
### Master prompt & build spec · 2026-08-27

> Canonical for the new entry experience. Subordinate to `MASTER-PLAN.md`;
> supersedes nothing else. Frontend only — no backend, payment, or agent-logic
> changes anywhere in this document.

---

## 0. The vision, stated once

Someone hears about SHADDAI. They open the link on a phone, one-handed, probably
walking. They have about four seconds before they decide whether this is a real
thing or another AI landing page.

**What they should hit is not a page. It's a threshold.**

Four enormous, beautifully-lit objects sitting in obsidian dark. Not buttons —
*monoliths*. Each one is a different way into the same empire, and each one is
alive: a slowly-turning sacred-geometry solid, lit in its own colour, breathing.
The energy of an iPhone home screen — instant, obvious, tappable — but nothing
about it looks like an app grid. It looks like a door you were not expecting to
find open.

And the four are **not fixed**. They're slots. The visitor rearranges their own
front door, the way you rearrange a home screen, and it remembers.

That's the whole idea. Everything below is in service of it.

---

## 1. The enhancement (what the vision was missing)

The owner's brief described four modules and a spinnable wheel. Four things were
underspecified; these are the deliberate additions:

**1. Slots, not tiles.** The brief said "four modules." Halfway through it also
said *"I'd really like people to swap out more big module buttons — RAG,
DASHBOARD, 2D, 3D, SIMPLE, ARCADE, SIGNALS."* Those are the same wish. So the
screen is **4 slots backed by a 9-module library**, with an edit affordance. The
visitor curates. Adding a tenth module later is one object in a JS array.

**2. Dwell-to-reveal, not hover-to-reveal.** Hover doesn't exist on a phone.
Sitting on a selection for **5 seconds** opens its bio — a mechanic that works
identically for thumb, mouse, and keyboard, and that rewards hesitation instead
of punishing it. A very small corner toggle turns it off for people who already
know the map. This is the owner's idea, kept exactly, and it's the best one in
the brief because it solves the mobile-affordance problem for free.

**3. The wheel swivels vertically.** A vertical drum — tiles rising and falling
like a rolodex — is the correct axis for a thumb held at the bottom of a phone.
Horizontal carousels fight the hand. Vertical is also what "swivel down into a
sub-menu" wants to be: the parent wheel tips *back and down*, the child wheel
rises into its place. One continuous motion, no page change, no jar.

**4. Simple Mode is a navigator, not a second app.** The temptation is to let it
run workflows, sign people in, do quick jobs. That kills it. Simple Mode's
promise is *anywhere in SHADDAI in two thumb moves* — the moment it grows a
second job it stops being simple. Workflows are reachable **from** the wheel
(CREATE → WORKFLOWS deep-links to `/dashboard#workflows`), they don't live in it.

---

## 2. The four defaults

| Slot | Module | Goes to | Status |
|---|---|---|---|
| 1 | **DESCENT** — the cinematic entry | `/journey.html` | Already built. Reused, not rebuilt. |
| 2 | **ENTRY** — the whole story | `/home.html` | The current landing. Preserved as a module. |
| 3 | **DASHBOARD** — straight in | `/dashboard` | Existing app. Where sign-in and real work live. |
| 4 | **SIMPLE** — one thumb, everything | `/simple.html` | **New. The flagship.** |

**Library** (swappable into any slot): the four above plus RAG BRAIN
(`/brain.html`), 2D WORLD, 3D WORLD, ARCADE, SIGNALS.

**Future — Descent ending:** ORACLE astronomy resolves the final scene of the
descent, updating over time with real sky data. Not this pass. The descent is
reused as-is; its ending is a later commit and does not block anything here.

---

## 3. Simple Mode

One object. One data model. One drill-down engine. **Three renderers.**

- **WHEEL** (default) — vertical drum, thumb-spins with inertia and snaps.
- **ORB** — the same items mapped onto a sphere, drag any direction.
- **LIST** — the same items as slabs receding in Z, flick to scroll.

A small toggle switches skin; the choice persists. Same categories, same
sub-menus, same dwell-bios in all three. Building three *renderers* over one
shared model is roughly 1.4× the work of one — building three *pages* would be
3× and two would be thrown away.

**Interaction contract (all three skins):**

| | |
|---|---|
| Spin | Drag / swipe, with inertia and snap-to-nearest |
| Select | Tap the front item |
| Read | Dwell 5s on an item → bio card. Toggle in the corner, off state remembered |
| Drill in | Parent tips back and down, child wheel rises into place. Never a page load |
| Back | Swipe down past the top, the back chip, `Esc`, or browser back |
| Keyboard | Arrows spin, Enter selects, Esc goes back |
| Reduced motion | Honoured — instant transitions, no idle spin, everything still works |

**Categories:** AGENTS (the 7), GAMES (climb / courts / arena / tactics),
SIGNALS, CREATE, FORGE, WORLDS, BRAIN, TOOLS, HUB. Sub-menus are recursive — any
category gains one by adding an `items` array in `public/js/shd-modules.js`.

---

## 4. Rules this build obeys

- **Frontend only.** No file under `backend/` is modified. No payment code, no
  agent logic. Existing endpoints are read, never changed.
- **No paid services beyond what the owner authorised.** Everything renders
  from `public/vendor/three/`. The tile plates were generated on the owner's
  own Hugging Face account, at their explicit instruction, on 2026-08-28 (§8).
  Every image is still a single swappable path.
- **Mobile-first and verified as such.** Touch is the primary input and is tested
  as touch, not assumed from mouse drag. Targets ≥ 44px. One-handed reachable.
- **Sign-in is optional and never gates entry.** A small corner chip:
  email + password via the existing `POST /api/auth/login`, or Solana wallet via
  the existing `GET /api/wallet/nonce` → `POST /api/wallet/session`. Both routes
  already exist; neither is modified.
- **Theme-consistent.** Obsidian `#06080b`, emerald `#00ff9c`, gold `#e8c45c`,
  cyan `#5fe0ff`, violet `#b07cff`. Cinzel / Fraunces / IBM Plex Mono. Grain,
  vignette, radial grade — the language of `home.html` and `journey.html`. The
  six-skin choice shares the `shd_theme_skin` key with the rest of the app.
- **The default route is not switched here.** `/` still serves `home.html`.
  Flipping it to the new front door is one line in `backend/server-production.js`
  and is the owner's call, made outside this pass. See §6.
- **Nothing is pushed.** Local commits only. No remote, no Render config.

---

## 5. 🔇 OUT OF SCOPE — VOICE MODE

**Voice mode is explicitly NOT built in this pass.** Asking the RAG brain a
question aloud and hearing it answer is a deliberate future TODO. No microphone
permission, no speech API, no audio endpoint is wired anywhere in this work.

When it is scoped, it becomes one more entry in `LIBRARY` and one more category
in `WHEEL` — the structure already accommodates it. This marker also appears at
the top of `public/js/shd-modules.js` so nobody re-derives the decision.

---

## 6. Handing it over

New files, all under `public/`:

```
public/enter.html            the 4-slot selector — the front door
public/simple.html           Simple Mode
public/js/shd-modules.js     the shared registry (modules · wheel · sub-items)
public/js/simple/*.js        the wheel / orb / list renderers + shared model
```

**To make it the real front door**, change one line in
`backend/server-production.js` (~2523):

```js
res.sendFile(path.join(__dirname, '../public/home.html'));   // before
res.sendFile(path.join(__dirname, '../public/enter.html'));  // after
```

Until then it lives at `/enter.html` and nothing existing changes behaviour.
`home.html` is deliberately left untouched — it is MODULE 2, not a casualty.

---

## 7. What was verified, and how

Headless Chrome against a static server, measured rather than eyeballed —
several defects below were invisible in a screenshot and only showed up in
numbers.

**Both screens** — render with no console errors; no horizontal overflow
(`scrollWidth` 375 at a 390 viewport); the header fits without the brand
colliding with the controls; `prefers-reduced-motion` drops the motion and
keeps every function; WebGL failure degrades to a working page rather than a
blank one.

**enter.html** — 4 slots render; the shared theme sheet opens with all six
skins; the sign-in sheet injects and opens with its email field; edit mode
opens the library drawer showing correct slot assignments; the bios
preference persists and is shared with Simple Mode.

**simple.html** — all three skins render inside the viewport; drilling into
GAMES and back works; dwell bios fire; the outgoing level is disposed once
the swivel completes (`children=1, out=no`).

**Touch, tested as touch** (synthetic `PointerEvent`s with
`pointerType:'touch'`, not mouse drag):

| Check | Result |
|---|---|
| 200px touch-drag up | advances exactly 2 items (AGENTS → SIGNALS) |
| Tap with a 1px wobble | still activates — drills into the sub-menu, back chip appears |
| `touch-action` on the canvas | `none` — the page can't scroll under the gesture |
| Touch targets | enter 277×56, back 56 tall (≥44 required) |

**Bugs found by measuring:** camera fit ignored that the front plate sits
nearer than the origin (everything ~15% oversized, lettering off the sides of
a phone); the drum didn't wrap its angles (a forward arc, nothing below the
selection); the orb's off-axis items ran past the screen edge; the mobile
header overflowed 390px by 8px; drawer rows ran name and kicker together.
All fixed and re-verified.

---

## 8. The tile plates

`public/assets/enter/*.jpg` — nine bespoke plates, generated 2026-08-28 with
**FLUX.1-schnell** through the Hugging Face router on the owner's account,
at their explicit instruction. Regenerate with:

```
HFTOK=<token> python scripts/gen-front-door-plates.py public/assets/enter
```

**The provider gotcha, so nobody re-debugs it.** All six HF keys in the vault
are valid, but HF's own `hf-inference` provider no longer serves these image
models — it returns **410 Gone**, which reads exactly like a dead key and
isn't. Route through a live partner provider instead; `nscale`, `fal-ai` and
`wavespeed` all served FLUX.1-schnell at the time of writing, and `nscale` is
used here because it's OpenAI-compatible and returns base64 directly. Check
current providers with the `inferenceProviderMapping` expand on the model API.

Separately, one key returned **403** rather than 410 — a fine-grained token
missing the "Make calls to Inference Providers" permission. 403 is a scope
problem, 410 is a provider problem. They are not the same failure.

**Why the prompts look the way they do.** Each plate sits behind a neon solid
and heavy Cinzel lettering at 30-46% opacity, so every prompt forces
near-black, low clutter, light in the upper half, and nothing legible. Plates
measured 4.6-33.7 mean luma. The first `world3d` pass came back as pale grey
fog and was regenerated against a darker prompt — brightness here is a
measurement, not a matter of taste, because anything brighter fights the type.

Total weight: ~340 KB for all nine.

---

## 9. Rotating plates — "never read twice" (2026-08-30)

The four doors now rotate their artwork. Every visitor is handed a **different**
plate for the same door, so the front door reads fresh on each return — but the
choice is **frozen for the visit**, so nothing flickers mid-render.

**Mechanic (already live):** each module in `public/js/shd-modules.js` carries an
`artVary` array — the base plate first, then numbered variants:

```js
artVary: [
  '/assets/enter/descent.jpg',      // base — always exists (fallback)
  '/assets/enter/descent-1.jpg',    // drop in generated plates to grow the pool
  '/assets/enter/descent-2.jpg',
  '/assets/enter/descent-3.jpg',
  '/assets/enter/descent-4.jpg'
]
```

`SHDModules.artFor(id)` picks one deterministically from a per-session seed
(`sessionStorage['shd_enter_art_seed']`): random once per new session, then
stable until the tab closes. `enter.html` renders it as an `<img class="artimg">`
with an `onerror` that falls **back to the base plate** if a numbered variant
hasn't been generated yet — so rotation can never show a blank.

**To add a vibe:** generate the plate, drop it at the matching `-N.jpg` path,
and it's in the rotation the next visit. No code change. The base plate stays
first so it's always the safe fallback.

---

## 10. The Wuxia master prompt — still hero plates (2026-08-30)

The owner's brief was a 15-second cinematic, so it's adapted here into a **still
that reads as a frozen frame of it** — because a door plate is a backdrop, not a
film. One aesthetic across every variant: **Neo-Chinese Wuxia · ink-fluid
simulation · black / white / red · high-speed-cinematography grain**, with the
subjects being **literal likenesses of the SHADDAI agents**, not generic
warriors. Keep every plate near-black and low-clutter so the Cinzel lettering and
neon solid stay legible (§8: brightness is measured, not a matter of taste).

> **Shared subject block** (paste into every variant, swapping the two archetypes
> for the door's two signature agents):
>
> Two dueling figures — the **Black Ink Warrior** and the **Red Assassin** — on a
> floor of torn Xuan (rice) paper in a pure white void that turns to obsidian ink
> at the edges. Every physical strike is an **explosion of ink**, not flesh: a
> black-ink **dragon fist** and a red **Vermilion-Bird blade** locked mid-air,
> frozen a half-second before the dimensional wall shatters. Ink calligraphy
> strokes hang where dust would fall. Style: **Neo-Chinese Wuxia, ink-fluid
> particle simulation, black/white/red impact, high-speed cinematography grain,
> ultra-detailed, 8k, dramatic rim light — black and red only, nothing legible.**

**Five vibes (one per `-1` … `-4`, plus a copy for `-0` if you regenerate the
base):**

| Plate | Vibe | Composition twist |
|---|---|---|
| `descent-1.jpg` | **The Awakening** | Both figures still as a static ink painting, then caught the instant motion explodes — ink-dust replacing their first impact |
| `descent-2.jpg` | **The Collision** | Ultra-high-speed close-quarters lock — black-ink wave tsunamis from a sweep kick, red afterimages from mid-air kicks, paper tearing |
| `descent-3.jpg` | **Breaking the Dimension** | The ink world cracking — the pair "falling" out of a torn ink scroll onto a real wooden floor, ink mist + paper scraps frozen around them |
| `descent-4.jpg` | **The Single Stroke** | One massive final calligraphy stroke rendered as a sweeping ink arc, the two figures standing at its two ends, breathing, ink dripping |
| `descent-5.jpg` | **The Guardian** | The Black Ink Warrior in full stance, red cinnabar seals floating as the assassin's afterimage orbits them — calm, monolithic, patient |

**Agent likeness mapping** (which two agents for which door):

| Door | Agents |
|---|---|
| ASCEND (descent) | **NEXUS** (black, structural) vs **ORACLE** (red, seer) |
| SIMPLE (simple) | **TURTLE** (black, form) vs **QUILL** (red, the brush-stroke) |
| ENTRY (entry) | **SHADDAI** (black, the sovereign) vs **PIKADON** (red, the warden) |
| DASHBOARD (dashboard) | **ZEROX** (black, the ledger) vs **NEXUS** (red, the spine) |

Drop the generated files at `public/assets/enter/<id>-N.jpg`; the rotation (§9)
picks them up automatically. Keep base luma under ~35 mean and nothing legible in
frame.
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
- **No spend, no keys.** Everything renders from `public/vendor/three/` and art
  already on disk. Every image is a single swappable path — bespoke generated
  plates drop in later with no code change.
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

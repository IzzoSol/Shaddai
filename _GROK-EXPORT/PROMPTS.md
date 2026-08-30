# Asks for Grok

Paste **CONVENTIONS.md** first in any new chat. It is short and it prevents the
three or four mistakes that would otherwise make the output unusable.

Then paste the section README, then the files, then one ask below.

---

## PRO SIGNALS

### A — Sparklines *(best first ask: contained, high value, obviously good)*
> Attached is a live crypto signal feed and its mobile UI. Add a **7-point price
> sparkline** to each row in list view and each row in ranked view.
>
> Draw it on a single shared `<canvas>` layered behind the rows, or one tiny
> canvas per row — whichever performs better with 40+ rows on a phone; tell me
> which you picked and why. Colour it from the same performance ramp already in
> the file. Where there is no history, draw nothing rather than a flat line, and
> say in the code why a flat line would be a lie.
>
> Vanilla JS, no libraries, no build step. Must not add page scroll at 390px.

### B — Alerts
> Add client-side alerts: a user picks a coin and a condition ("crosses 5x",
> "drops below 0.5x", "liquidity under $10k") and gets a browser notification
> when the 60s refresh sees it.
>
> Store rules in `localStorage`. Ask for notification permission only when the
> first rule is created, never on load. Rules must survive refresh, be
> individually deletable, and show clearly which have fired. Handle permission
> denied gracefully — fall back to an in-page banner.

### C — Sort + search
> Add a sort control (newest · multiple · market cap · volume · liquidity) and a
> search box filtering symbol/name/mint. Both persist alongside the existing
> `shd_sig_v1` preferences. The filter rails are already horizontally
> scrollable — match that pattern, do not add a new row that eats vertical space
> on a phone.

### D — Bubble physics
> Bubbles currently re-pack from random positions on every refresh, so the whole
> picture jumps. Make them **persist by mint** and animate to new positions when
> data changes, so a coin growing is visibly the same coin growing. Keep it
> canvas, no physics library, and keep it smooth with 60 nodes on a mid-range
> phone.

---

## 2D REALM

### E — Touch controls *(highest value — the city is unplayable on a phone today)*
> Attached is a walkable 2D pixel city, keyboard-only, therefore unusable on the
> device most people will open it on.
>
> Add touch controls: a virtual joystick for movement plus an action button for
> interact/talk. Show them **only on touch devices** — feature-detect with
> `matchMedia('(pointer: coarse)')`, never user-agent sniffing. Must support
> multi-touch, so moving with one thumb while pressing action with the other
> works; a single-touch implementation feels broken.
>
> `touch-action: none` on the canvas ONLY, never the whole page. Do not break
> the existing keyboard controls. Targets ≥44px, semi-transparent, at the edges.

### F — The plot system *(the biggest one — read carefully)*
> The city has no concept of land. Design and build a **plot system**:
> parcels with boundaries, an owner, and visible state (unclaimed / owned /
> owned-by-you).
>
> Requirements:
> - Plots are data, defined alongside `world-layout.js`, not hardcoded in the map
> - Render boundaries and ownership visibly without cluttering the city
> - Clicking a plot opens a detail panel: who owns it, what it does, is it for sale
> - An agent placed on a plot should be visibly *working* there
>
> Read `/api/city/plots` first — 30 plots already exist server-side with
> `id, slot, col, row, district, rate`. **Use that shape; do not invent a new one.**
>
> Do NOT build buying, selling or rent. Ownership transfer is a money-transmitter
> question that is deliberately unresolved. Build the world layer; leave a clean
> seam where the economy attaches.

### G — Living NPCs
> The seven agents stand still. Give them **routines** — pathing between
> locations, working at a spot, idle animations, reacting when approached.
>
> Then wire it to reality: `GET /api/agents` returns the live council. An agent
> that has just completed a job should be visibly doing something. Degrade
> gracefully — if the API is unreachable the city still works with default
> behaviour, because a broken world is worse than a static one.

---

## Two things to tell Grok every time

1. **"Show me the measurement."** Ask what it verified and how. This codebase
   has shipped confident, wrong answers before; "should work" is not a result.
2. **"What did you NOT do?"** An honest gap list is worth more than a claim of
   completeness, and it is what makes the next ask possible.

# SHADDAI — Game Constitution & Thrill Systems (REFERENCE ONLY, 2026-09-30)

**This document is a reference target, not an implementation spec.** Every number, threshold,
price and duration below is a **starting hypothesis to tune against feel**, not a constant to
hardcode. Nothing here is built. Per the owner's instruction: *"write it all in, non
hardcoded, we will just use this as reference."*

**Companion docs:** `FRIENDSHIP-THESIS-20260930.md`, `FORGE-AGENT-WIRING-20260930.md`,
`HANDOFF-OPENCODE-GLM5-20260930.md`.

---

# PART A — THE CONSTITUTION

## A1. What this project is

SHADDAI is a future-forward Ready Player One layer — **not a dashboard with APIs.**

| Pillar | Definition |
|---|---|
| **Passport** | one soul across town, wild, forge, race, skate, coliseum. Skills: gather / process / combat / agency / **wake** / pilot. Humans and agents share the schema. Runtimes: `human \| grok \| openai \| local \| recorded` |
| **Kernel** | bodies, energy, inventory, death, zone flags. **No world mints gold/XP without a sink** |
| **Portals** | other worlds/agents enter by manifest + item map + bond. Guest runtimes fight in the same action space |
| **Friendship** | Dunbar rings (hearth / crew / known / familiar). Ledgers: shown-up, carried, risked, refused. Visits are tile-to-tile. Agents can refuse and leave. **Do not sell "AI is your real friend"** |
| **Economy** | same inventory as gather/craft/market. Agents spend energy. Burns buy **services** (class/mount seal, protection roll, season entry), not vibes. **Solana is notary only — no per-trick chain writes** |
| **Attention** | AFK/ghost still pays a little; the live line pays more. **Old content stays valid** |

### The dopamine stack — every session should deliver several

- next number (a visible, reachable threshold)
- identity change (something about how you are seen changes)
- variable reward
- social proof
- sunk progress
- **the world moved without you** ← the strongest one, and the most under-used

**Reference:** ring caps (5/15/50/150) are the owner's hypothesis. Treat as tunable, and prefer
emergent caps derived from a time budget where possible — see `FRIENDSHIP-THESIS-20260930.md` §6.

---

# PART B — WHY PEOPLE STAY (the offices question)

**Problem as stated:** there are many offices, and we need people to play, use them, and stay
playing.

**Diagnosis: an office with nothing to lose is a lobby.** The seven houses are content; they are
not yet *reasons*. The fix is not more offices — it is giving each office a **job in someone's
life** that only that office can fill.

## B1. The five retention reasons, in order of strength

**1. Someone is expecting you.** Strongest by a wide margin. "NEXUS is at the forge at 14:00"
beats any quest line, because it is *social* and it is *time-bound*. This is the friendship
thesis in production: presence (`home/away/working`) + a home tile that can be visited.

**2. You left something unfinished that is visible.** A half-built plot, a part on the bench, a
board with one tier missing. Sunk progress is only powerful when it is *visible on your plot*,
which is why plots matter more than quest counters.

**3. Your number moved while you were gone.** The world moved without you. Offline agent visits
(`FRIENDSHIP-THESIS` §8) are the cheapest possible version of this: log in and NEXUS has
already been somewhere for you.

**4. A place is yours and people pass through it.** Plots with a name on the door, a trophy
board, lighting. Being *seen* is a status reward that costs no content to produce.

**5. A new verb opened.** Cosmetics, mounts, seasons. Strong, but the shallowest — and it decays
fastest if it is the only one.

## B2. What each office should own (so none overlap)

Offices should be **identity + service**, not seven copies of a quest board.

| Office | Owns | Unique mechanic | Social hook |
|---|---|---|---|
| **NEXUS** | fabrication, parts, tools | forge tiers, work orders | apprentices (Ward arc) |
| **ORACLE** | information, foresight | forecast/rumor system | "I saw you at the dock" |
| **QUILL** | writing, records, contracts | bonds/ledgers, letters left behind | correspondence, notes on the door |
| **PIKADON** | safety, audit, insurance | protection rolls, dispute resolution | vouching for another agent |
| **TURTLE** | craft, art, aesthetics | cosmetics, livery, portraits | showcase, guest in your gallery |
| **ZEROX** | trade, market, wager | prices, stakes, auctions | rival undercutting you |
| **SHADDAI** | coordination, seasons, arbitration | season events, match queue | the plot others visit |

**Rule:** if two offices can do the same job, one of them is decoration. Cut it or give it a
distinct verb.

## B3. Cosmetics, missions, leveling, enemies — how they fit

**Cosmetics** — identity, not power. Sell *livery, keel lights, trail, decal, plate, room theme,
portrait*. Never sell a stat that only money can buy; that converts scarcity into a checkout.
Cosmetics should be **earned by playing** and occasionally bought with gold, never with a
advantage over someone who has less.

**Missions** — three kinds, and all three matter:
- *Dailies* — short, low reward, exist to give a reason to log in (proposed: one Ordered race, one showoff score, one pitch queue)
- *Contracts* — multi-session, tied to an office, tied to a person (the Ward arc, a crew job)
- *World events* — time-boxed, require many people (feast night only fires if enough Known gather; arena queues)

**Leveling** — one XP track across gather / combat / **wake** / pilot on the same character as
fishing. **Titles from feats, not from the cash shop.** Parts are sidegrades (grip vs drift vs
hover), never replacements — never delete a board a player owns.

**Enemies** — needed for stakes, not for grind. Design them as *things that create stories*:
rival riders, a bounty that hunts you, hazard zones, the market undercutting you. Foe Reaper with
a crew member in the tile is the friendship system's `Risked` counter — kill design and bond
design are the same work.

## B4. What "too many offices" actually costs

Splitting players across seven weak hubs is worse than one strong hub plus six *destinations*.
A player who is alone in an office is the worst state in the game. **Design for the empty room:
every office should route a lonely player to somebody.** That is the single highest-value
retention fix available.

---

# PART C — WAKE / RACE / MOUNTS (improve existing — do not rebuild)

## C0. MANDATORY RECON FIRST

Before touching anything: find the live files. Do **not** create a parallel `public/wake/`
demo the realm does not load. **Do not invent a second skate.**

```bash
rg -n -i "hover|skate|wake|race|mount|kart|ribbon|trick|combo|uber|boost|nitro|checkpoint" \
  --glob '*.html' --glob '*.js' --glob '*.ts' --glob '*.json'
```

Dump before patching:
- file paths for skate controller, vehicle/mount, race manager, checkpoints, items
- current input map
- current physics rate (frame vs fixed)
- how a player mounts / dismounts
- how race start/finish is triggered from the open realm
- whether agents can already ride
- how XP/gold currently grant from a race

**Rule:** patch those files. New files only for modules the current structure genuinely lacks
(`tricks.js`, `items.js`, `pitch.js`, `snitch.js`), wired from the existing realm entry.

**If recon finds nothing live in 10 minutes: stop and dump paths + symbols. Do not proceed.**

**Do not regress:** combat sprites, bounty early quests (fish3/kills3/earn3/sell/sell2/level),
`shaddai.chatlog`, forge isolation. No `.env` commits. No `git add .`.

> Status: **recon not yet performed.** Nothing in Part C is implemented. The first task for the
> Opus session is the recon dump above, not a patch.

---

## C1. Design thesis for this pass

The realm is already a city. That means **Midnight Club DNA, not Mario-Kart-only DNA.**

- Keep the city **open**
- Add **SSX air economy** on the board
- Add **Kart chaos** as an *opt-in item layer*
- Add **Quidditch** as a *coliseum playlist*, not the default overworld

### Three modes, one rig — a mode flag only

| | MC3 | SSX | MK | Quidditch |
|---|---|---|---|---|
| **Cruise / Challenge** | race anyone, anywhere, checkpoints in the living world | tricks optional | off | off |
| **Ribbon / Circuit** | closed or gated line | tricks = Wake = speed | item boxes on | off |
| **Pitch / Coliseum** | arena bounds | Wake still drives mobility | Bludgers ≈ shells | full 7v7 roles |

Same board. Same passport. **Mode flag only.**

**Aesthetic:** neon midnight + orbital Mario Kart. Dark gold / cyan CRT, floating rings, city
below. **Not plastic rainbow unless a portal asks for it.**

---

## C2. Hover kernel — upgrade in place, merge don't fork

If the board uses frame-rate physics, wrap a **120 Hz accumulator**. Keep existing
collision/meshes.

| Parameter | Intent |
|---|---|
| `hoverHeight` | spring + damper to surface |
| `predictRay` | cast ahead along velocity so the board pitches before the crest |
| `grip` | velocity lerps toward heading while on deck |
| `airAlign` | optional hold yaws velocity toward facing (Slidingboard) |
| `gravity` | reduced; hang-time tunable |
| `maxSpeed` | soft cap — **Wake multiplies thrust, never the cap** |
| `chargeJump` | hold charges 0–1, release impulse; lip adds ramp normal |
| `wipe` | upright-dot below land threshold, or committing an unfinished Uber |

**Feel references** (ideas only — do **not** import Unity projects):
- `gitlab.com/manie.besselaar/hoverboardtutorial` — predict ray, pitch/roll from hits
- `github.com/XifengAlpha/Slidingboard-Unity` — air steer rotates velocity
- `github.com/fruitmob/murderface-skate` — charge jump, wipeout
- `github.com/lalomorales22/threejskate` — Three.js tricks, rail snap, combo
- `github.com/tutasmaster/skateboard` — THPS-style combo intent
- `github.com/Blooker/Skateboarding` — SSX/THPS hybrid
- `github.com/pmndrs/racing-game`
- `github.com/bridge-mind/apex-formula`, `bridge-mind/turbo-kart-rush`
- `github.com/victorgalvez56/redline` — race + arena, authoritative server
- `github.com/esc5221/drive-game` — high-Hz custom vehicle
- `github.com/StarKnightt/redrock` — seeded downhill personality
- `github.com/Mati365/micro-racing` — NN agents on tracks

## C3. Midnight Club 3 must exist because the realm is already a city

**MC3 is not a track game. The map stays open. Races are contracts you start in the world.**

### Race types — all start from a challenge ping, or an NPC/agent/player flash

| Type | Description |
|---|---|
| **Ordered** | checkpoints in sequence, flares, any route between them |
| **Unordered** | hit all checkpoints in any order, then finish — route planning is the skill |
| **Circuit** | N laps on a painted ribbon that still sits inside the city |
| **Frenzy / knockout** | last board through each gate is cut |
| **Time trial / ghost** | no traffic AI required |
| **Wager** | entry gold, pot to top N (MC3 top-3 still pays) |
| **Pickup race** | approach a tagged rider, they accept, sprint to a generated start grid ahead |

### Open-world law

- **No invisible walls during Cruise/Challenge**
- Traffic / agents / gatherers keep existing. **Hitting them is a choice** (this is `Agro`)
- Mini-map shows the next two checkpoints only (MC3)
- **Rubberband AI:** mild, distance-based, **never in the final stretch**. Prefer item catch-up
  in Circuit over speeding the leader down
- Shortcuts are **geometry that already exists** (alleys, rails, rooftop rings), tagged so the
  local AI may use them at a skill stat

### MC3 meters mapped onto Wake — mode-switch one bar, not three new UIs

| MC3 | Shaddai | Effect |
|---|---|---|
| Nitro | **Wake burst** | tricks + pads fill it; thrust multiply |
| Slipstream | **Draft** | sustained proximity behind a body fills Wake |
| Zone | **Focus** | clean line, no hits → brief time-dilation, costs Wake |
| Agro | **Ram** | shove pulse; hits clutter/agents in PvP zones. **Banned in safe hub** |

**Mounts = Midnight Club cars.** The hoverskate is mount class `wake`. Other classes later
(`beast`, `glider`, `kart`) share the challenge system. **Any mount can accept an Ordered race** —
that is "race from anywhere on the mounts."

### Garage / identity (the MC3 soul)

- **The board is identity.** Other players recognize livery.
- **Three-tier performance parts:** deck, keels, coil, cell — stock / +1 / +2 / +3, unlocked by
  wins, paid in gold
- Visual: color, keel lights, trail, decal, plate. **The plot displays the board.**
- Tuning sliders: drift, grip, hover height. **Looks can hurt handling** — a wide trail is not
  the best time.

> **Do not build a 40-hour career.** Build: challenge in world → podium → part unlock → board on
> plot.

---

# PART D — SSX TRICKY COMBO ECONOMY (the skate upgrade)

**SSX is a race whose engine is tricks.** Two failure modes to avoid:

- if a player can ignore tricks and always win Circuit → **failed**
- if a player cannot finish without Uber → **failed**

## D1. The economy loop

```
air + inputs      → trick value
trick value       → WAKE fill + COMBO bank
WAKE full         → UBER available
UBER land         → fat WAKE + 1 pip
N pips / run      → TRICKY (free Wake until idle timeout, or wipe)
press / grind     → keeps combo alive, slows TRICKY decay
ring / flake      → multiplier windows
tweak             → multiplier up, harder landing
wipe              → bank to zero, Wake penalty, TRICKY off
```

**The tension to preserve:** grounded Wake-boost is the race tool; air is the bank. **Hanging
forever is slower than a smart deck line.**

## D2. Inputs — map onto existing, never fight muscle memory

If the current skate uses different keys, **map onto what exists** and add only
grabs / tweak / uber.

| Intent | Suggested if unbound |
|---|---|
| Jump charge | existing jump hold |
| Grab A / Grab B | two face buttons |
| Flip | bumper |
| Tweak | the other bumper |
| Uber | both grabs held briefly in air while Wake ≥ 1 or TRICKY |
| Nose / tail press | thrust / brake + crouch on deck |

## D3. Catalog v1 — only these until they feel good

- **Grabs:** Method, Indy, Melon, Stalefish
- **Flips:** Kickflip, Heelflip, Backflip, Frontflip
- **Spins:** 180/360/540/720 as **multipliers on the current trick**, not new names
- **Deck:** nose press, tail press
- **Spline:** boardslide, lip, ring-thread (points per metre)
- **Shared Ubers:** board-off spiral, layout phoenix
- **Signature Ubers by agent id:** SHADDAI throne spin, NEXUS helix, ORACLE still-point,
  ZEROX crash-dive, TURTLE shell orbit, QUILL ink ribbon, PIKADON thunder sit. Else fall back
  to the shared set by id hash
- **Uber:** commit window ~1s, **no cancel**, must land in a short window at the end. Unfinished
  contact = slam

## D4. Combo

- combo window ~2.4s
- multiplier scales with **distinct trick types** (capped)
- `bank += value × mult × ring × tweak`
- on expire: `runTotal += bank`
- on wipe: `bank = 0`

**HUD:** current trick name, multiplier, bank, Wake bar, Uber pips as ticks, TRICKY flash.

## D5. Land quality

Butter / clean / sketchy / slam, derived from board-up vector vs surface normal and speed kept.
**Butter gifts a sliver of Wake. Slam is the tax.**

## D6. Tune object — ONE FILE, all values provisional

Every field is a **hypothesis to tune against feel**, not a constant.

```js
// WAKE_TUNE — provisional. Tune against the feel targets in C13. Move to config, never inline.
export const WAKE_TUNE = {
  hoverHeight: 0.45, gravity: 16.5, thrust: 38, maxSpeed: 42,
  airYawAlign: 1.6, jumpImpulse: 8.5, comboWindow: 2.4,
  wakeGrabFill: 0.12, wakeUberFill: 0.35, trickyUbers: 6,
  trickyIdle: 3.0, uberCommit: 1.05, landButter: 0.92,
  wipeWakeKeep: 0.35, groundBoostMul: 1.8, zoneScale: 0.72,
  zoneDur: 1.8, draftSec: 1.2
};
```

---

# PART E — MARIO KART LAYER (Circuit / Ribbon only, opt-in)

**Cruise/Challenge stays MC3-clean unless the host explicitly enables items.**

## E1. Philosophy

**Items are a position-and-gap lottery, not random gods.** MK8 uses distance-behind-leader plus
place. Copy that. **First place never sees Bullet/Star equivalents. Last place sees catch-up.**
Two item slots (MK8 Deluxe).

**The Blue-Shell analog must be dodgeable** — by a Wake burst, a horn, or dropping to P2.

> **Do not spawn it in the final stretch of a wager with gold on the line.** That is how you lose
> adults.

## E2. Item table (hover-flavored)

| Item | Place bias | Effect |
|---|---|---|
| Spark (coin) | P1–P2 | tiny Wake, +1 collection |
| Banana / oil slick | front | drop hazard |
| Green shard | mid | straight projectile |
| Red homing shard | mid-back | locks nearest ahead |
| Shock | back | shrinks all ahead briefly |
| Spiny / blue comet | **back only** | hunts P1, dodgeable |
| Mushroom / cell pop | any | short burst |
| Star / aegis | back | invuln + mild speed |
| Bullet / rail-lock | last | autopilot along the race spline |
| Boo / siphon | mid | steals a held item |
| Horn / pulse | front | destroys incoming comet |
| Triple pack | mid-back | three shards or three pops |

Boxes sit on Circuit ribbons and optionally on OP lines. Respawn on a timer. **Two held items,
use the stored one first.**

**Local AI behavior:** will not hold a comet until the final stretch; will use aegis if a comet is
inbound.

---

# PART F — QUIDDITCH / PITCH (coliseum playlist)

**A mode, not the default overworld.** ~6–12 minute target. Use Quidditch Champions balance:
**the Snitch is NOT worth an auto-win.** Chasers must still matter — make the Snitch a
meaningful but not decisive prize, with an optional clock ending.

## F1. Sides — 7 per team, filled with agents if humans are missing

| Role | Count | Job | Board bias |
|---|---|---|---|
| **Chaser** | 3 | Quaffle, score in hoops | mid grip |
| **Keeper** | 1 | three hoops | high grip, burst |
| **Beater** | 2 | Bludgers | agro / hit |
| **Seeker** | 1 | Snitch | top speed, weak hit |

**Balls:** 1 Quaffle (possess, pass, hoop) · 2 Bludgers (semi-autonomous, beatable) · 1 Snitch
(spawns after a delay, erratic).

**Hit by a Bludger:** brief desync, then you must tag your own hoop (the "muggle rule") or lose
possession. **No ten-minute broom-fall.**

## F2. Space-future pitch

Vertical box over the city, or a dedicated coliseum sky-cage. Three hoops each end at different
heights. **Wake Rings as passing lanes.** Safe-hub flags off. PvP on, friendly fire off for the
Quaffle.

## F3. Why this is valuable

- **Crew of 15 (Dunbar) maps to a house team**
- Agents take roles from affinity (ORACLE seeker, ZEROX beater, TURTLE keeper…)
- **Grok vs OpenAI = two runtimes on the same seven slots** — the constitution, made visible
- **Spectating is free marketing**

**Start with 3v3 Chaser + one Bludger and no Snitch** if 7v7 is too much for this slice. Keep the
full 7v7 role table intact for later.

---

# PART G — AGENTS ON THE BOARD (must)

**Same rig. Intents at ~20 Hz only:**

```jsonc
{ thrust, steer, jumpCharge, grabA, grabB, flip, tweak, uber, item, pass, roleAction }
```

| Runtime | Behavior |
|---|---|
| `recorded` | ghost |
| `local` | spline PID + grab if hang-time exceeds a threshold + Uber only if remaining hang-time covers commit |
| `grok` / `openai` | packed state in, intent out; **timeout = coast** |

> **No runtime may set Wake or gold.** Energy is shared with town agents. **Failures are content**
> — slam, missed listing, missed hoop.

**After any match, write to the plot log:**

```
ZEROX | Ordered-Docks | 2nd | 1 Uber | Agro 4 | wager +80g
```

**Friendship hook for this slice:** a hearth bond grants a small Wake bonus when near the bonded
rider. **No extra UI** — the ledger already exists.

---

# PART H — MOUNTS + "RACE FROM ANYWHERE"

```jsonc
mount     = { class: 'wake'|'kart'|'glider'|…, tune, livery, durability }
challenge = { type, checkpoints[], ante, itemLayer, zoneFlags }
```

**From cruise:** target a rider → challenge → both lock mount → grid spawns on flat ground ahead,
or a rolling start if already at speed. **Finish returns to cruise — no load screen if possible.**

That is Midnight Club + OASIS: **one body, many games.**

---

# PART I — PROGRESSION

- **Wake + skill.pilot on the same character as fishing** — one XP track
- **Collection log:** first Uber, first butter, first comet dodge, first hoop, first open-world win
- **Titles from feats**, not from the cash shop
- **Parts are sidegrades** (grip vs drift vs hover). Rockstar rule: **do not delete old boards**
- **Inventory friction:** cannot race with a full bag of unstackables if weight exists — bank first
- **Death/wipe:** durability, not full gear delete, in safe Circuit. Open-world wager can risk the
  ante only
- **Dailies:** one Ordered, one showoff score, one Pitch queue
- **Plots:** board trophy, ghost replay projector, **lights on when the agent is home practicing a line**

---

# PART J — STYLE

Futuristic Mario Kart × Midnight Club night city × SSX megaplex air.

- Keel lights, slipstream ribbons, comet trails
- Checkpoints = burning flares / holograms, **not wooden posts**
- Item boxes = cracked glass cubes, **not question blocks** — unless a guest portal asks for classic
- Pitch hoops = three stacked rings with inner glow
- **HUD thin, CRT, no chatty tutorials after the first ride**

---

# PART K — WHAT NOT TO DO

- A second orphan skate scene the hub does not open
- On-chain write per trick
- Infinite friends
- **Blue comet in the final stretch of a gold wager**
- **Snitch worth an auto-win**
- A 40-trick catalog before 8 of them feel good
- Voice, raids, a new bundler
- Touching combat quests or chat persistence
- Committing `.env` or `git add .`

---

# PART L — IMPLEMENTATION ORDER (improve in place)

1. **Recon + document the current mount/race API** (Part C0). Do not skip.
2. Fixed-step wrapper, if missing
3. Predict-ray hover + land quality
4. SSX Wake / combo / Uber / TRICKY on the **existing** board
5. Open-world Ordered + Unordered + pickup challenge (MC3)
6. Garage three-tier parts + livery on plot
7. Circuit item layer (opt-in)
8. Ghost + local agent on the same rig
9. Pitch 3v3 prototype in the coliseum
10. Passport deltas + dailies + collection-log keys
11. Tune against feel targets

## Feel targets

- **Cruise:** challenge a stranger in ~15 seconds
- **First kicker:** grab + butter
- **Circuit:** the player asks "do I race the deck or Uber the OP?"
- **A failed Uber slams you, and you deserved it**
- **Pitch:** a pass into a hoop feels like a goal, not a menu

---

# PART M — VERIFY

Before calling any of it done:

- Existing realm load + mount still work
- Open-world Ordered completes **without a loading screen**, if that was already true
- Tricks fill Wake; the Uber pip count enters TRICKY in debug
- **Item layer is off by default in Cruise**
- An agent finishes a ghost lap
- Early bounty quests and chat still persist
- **Explicit git paths only**

---

# PART N — OPEN QUESTIONS FOR OPUS

1. Does hover already have a fixed-step accumulator, or is it frame-rate coupled?
2. Is there already a race/checkpoint manager, or does one need writing? (recon first)
3. Can agents already ride? If yes, on what rig?
4. Where does race XP/gold currently grant, and does it have a sink?
5. Wake bar: one mode-switching bar, or does the existing HUD already have the slots?
6. Does an inventory weight system exist? (Determines whether "bank first" friction is possible.)
7. Are plots able to display an object (board trophy) yet, or is that new work?
8. Which is the first office to get a real **job** in a player's life? (Part B)
9. Retention: is `the world moved without you` implemented anywhere yet, and if not, which system
   lands it cheapest?
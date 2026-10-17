# SHADDAI World — Game Systems Plan (2026-09-28)

Scope: the 7 agents' movesets, the item and wearable catalogue, shops run by agents or humans, and what is sold with SPARKS.
Companion docs: [WORLD-COMPLETION-PLAN.md](WORLD-COMPLETION-PLAN.md) (build order), [DRAGON-ELEMENTS.md](DRAGON-ELEMENTS.md),
[INTERIORS-V3.md](INTERIORS-V3.md), [TRAIN-RIDE.md](TRAIN-RIDE.md), [FAL-MODEL-MAP.md](FAL-MODEL-MAP.md).

**Hard rules:**
- SPARKS is closed-loop: earned and spent in-world only, with no cash-out, yield or vault.
- Real money enters only through the existing tiers (Pro $49, Max $199, Founder) and SPARKS packs.
- Futuristic tech-fusion look only.
- Weapons, gear and VFX are built in code (three.js), at $0. fal is used only for bodies.

---

## 1. Shared animation set (every agent)

Everyone is on one skeleton: Meshy v6 rig retargeted to UAL2 via `ual-retarget.js`. Each clip is made once and works on all 7 agents.

| Group | Clips |
|---|---|
| Locomotion | idle, walk, run, sprint, strafe L/R, walk back, turn in place |
| Traversal | jump (start/loop/land), double-jump flip, dodge roll, slide, climb ledge, swim idle/stroke, fall, hard landing |
| Combat base | draw weapon, sheathe, light combo 1-2-3, heavy/charged, block/guard, parry, hit-react front/back, knockdown + get-up, death, revive |
| Riding | mount/dismount, ride_sit (bike, hoverboard stance, dragon saddle), lean L/R, dragon breath-command pose |
| Social / world | sit (chair, sofa, stool, train seat), lie (bed pod), talk gesture, wave, point, cheer, work loops (shop counter, typing, crafting, farming/harvest, dealing cards) |
| Emotes (unlockable) | dance ×3, bow, flex, laugh, victory pose per agent |

- **Weapons:** each is attached to the `hand_R` bone (plus an optional `back` socket when sheathed). A weapon is a code-built mesh with an emissive material registered on the day/night ramp.
- **Timing:** attack clips emit hit-frame events. Damage uses the same telegraph/hit-window rules as the dragon core, so no free hits and a minimum wind-up.

## 2. Per-agent movesets (attacks)

Each agent has 3 abilities plus an ultimate. They are on cooldowns, use the agent's stamina/energy bar, and follow the element rules from DRAGON-ELEMENTS where noted.

| Agent | Weapon (code-built) | Light / heavy | Ability 1 | Ability 2 | Ultimate |
|---|---|---|---|---|---|
| **ZEROX** | Teal lightning katana (ref `refs/agent-zerox/zerox-katana-weapon.jpg`) | 3-hit slash combo / iaido draw-slash | Dash-cut (blink 8 m, slash through) | Arc parry: a perfect parry sends lightning back | **Market Crash:** 5 rapid teleport-slashes on marked targets |
| **NEXUS** | Wrist laser emitter / beam cannon | Pulse bolts / charged beam | Chain lightning (3 jumps) | Deployable shock turret (8 s) | **Overclock:** electric field aura, beam never overheats (6 s) |
| **PIKADON** | Rune warhammer | Heavy swings / ground slam | Shield wall (frontal block, pushes back) | Hammer throw + recall | **Bastion:** AoE quake + team damage-reduction dome |
| **ORACLE** | Purple wand-staff | Orb bolts / charged nova | Foresight: reveals enemy telegraphs early for 5 s | Heal circle / cleanse | **Eclipse:** slows time in a radius (enemies 40%) |
| **TURTLE** | Electric spiked flail (chain + glowing ball) | Wide swings / spin | Chain-pull (hook an enemy to you) | Electrified ground stomp | **Storm Orbit:** flail orbits her as a lightning sawblade |
| **QUILL** | Quill-blade + ink | Ink darts / quill lance | Ink trap (root puddle) | Scribe glyph: a written rune buffs allies' next hit | **Final Chapter:** giant quill strike that writes a damage line across the ground |
| **SHADDAI** | Emerald sigil (hands) + gold crest | Energy palm strikes / sigil blast | Sigil ward (absorb shield) | Summon echo (a copy that fights for 6 s) | **Genesis:** emerald shockwave that revives downed allies + damages enemies |

Players pick an agent as their avatar. The other agents can join as AI companions and use the same movesets.

## 3. Wearables and gear (cosmetic + stats)

Slots:
- head
- chest/suit
- cape/back
- gloves
- boots
- orb (floats beside the shoulder)
- charm (the SHADDAI emerald S-sigil family)
- weapon skin

| Item family | What it does | Tiers | How obtained |
|---|---|---|---|
| **Protection orbs** | A floating orb that orbits the player; one element each, giving resistance to that dragon element (ice orb → resist slow, magma orb → burn immunity, void orb → drain resist) plus a small shield that regenerates | Common → Rare → Epic → Legendary (more resist, bigger shield, visual trail) | Crafted from dragon drops, shop, quest rewards |
| **Rider gear** | helmet/visor, flight cloak, saddle armour (see FAL-MODEL-MAP.md, rider section) | Basic, Racer, Dragon-Knight, Legendary | Level / SPARKS |
| **Suit mods** | stat chips slotted into chest: +stamina, +speed, +armour, element resist | 3 slots, unlock by level | Loot, crafting |
| **Capes / trails** | cosmetic, with glow colours from the agent palette | — | Events, colosseum rewards, SPARKS |
| **Charms** | SHADDAI sigil charms (no bears): small passive (+5% SPARKS from jobs, +loot luck) | 1 equipped | Quests, farm tower blooms |
| **Weapon skins** | recolour + VFX (e.g. obsidian-gold katana) | — | Colosseum pass, SPARKS |

All gear is code-built on sockets from the shared skeleton, so it is $0 to generate and recolourable per agent.

## 4. Consumables and items

| Item | Effect | Source |
|---|---|---|
| Health potion (S/M/L) | restores 25/50/100 HP over 2 s | shops, farm-tower med-herbs crafting |
| Stamina tonic | refills stamina, +10% regen for 30 s | shops, farm |
| Cleanse vial | removes a dragon status (burn, root, haze, slow) | shops, ORACLE craft |
| Element antidote | 60 s immunity to one element | crafted from dragon scales |
| Revive shard | self-revive once | colosseum rewards, rare drop |
| Mount feed / dragon treat | mount stamina, dragon bond XP | farm tower |
| Repair kit | restores gear durability (if durability is enabled) | shops |
| Teleport ticket | fast-travel to a visited station hub without riding | train kiosk |
| Seeds / bio-fuel cells | farm inputs; bio-fuel powers hover cars and bots | farm tower |
| Crafting mats | dragon scales (per element), crystal shards, void essence, scrap alloy | drops, gathering, bots |

## 5. Upgrades and progression
- **Player level (XP):** unlocks gear slots, suit-mod slots, vehicles (hoverboard → car → bike → mount → dragon) and Grok bot tiers.
- **Agent mastery:** per-agent XP from using that agent; unlocks moveset upgrades (e.g. ZEROX dash gets 2 charges, NEXUS turret lasts longer) and victory emotes.
- **Skill packs:** bundles of ability upgrades or new work skills for your agent. Examples: "Merchant" (better shop prices when your agent runs a stall), "Farmer" (+yield), "Guard" (defends your plot), "Dealer" (runs the casino table). Bought with SPARKS; tie-in to the real agent marketplace skills where one exists.
- **Grok bots:** 2 wheel styles × 4 tiers (Courier → Worker → Guardian → Humanoid fighter). Unlock by level, buy with SPARKS; an agent pilots the bot.

## 6. Shops: who runs them and what they sell

Every enterable storefront from interiors v3 has a **counter slot**, **shelf/holo-shelf slots** and **1–2 NPC slots**. A shop is one of:

| Mode | Who runs it | How it works |
|---|---|---|
| **City vendor** | built-in NPC (system) | fixed catalogue at base prices; always open; sinks SPARKS |
| **Agent-run** | a player's agent or hired Grok bot works the counter while the owner is offline | owner stocks the shelves, sets prices; the agent sells and haggles within limits; the owner gets the SPARKS minus a small market fee (the fee is a SPARKS sink) |
| **Human-run** | the player stands at the counter | live trade window; the same fee |

Shop types (from the interiors recipes):
- **Apothecary:** potions, tonics, cleanse.
- **Armoury:** weapon skins, suit mods, orbs.
- **Outfitter:** capes, rider gear, charms.
- **Garage:** hover cars, hoverboards, bot parts, bio-fuel.
- **Skill hall** (campus): skill packs, agent training.
- **Deed office:** plots and farm-tower claims.
- **Station hub kiosks:** heal/rest, teleport tickets, local realm goods (each hub is themed per realm).
- **Arcade / casino:** Arcade cabinets (all SHADDAI Arcade games) and a blackjack table with a dealer bot; play costs SPARKS, prizes are SPARKS/cosmetics.
- **Colosseum box office:** passes (below).

**Real-life items:** later, an agent can run a storefront that links to the owner's real products (the SHADDAI marketplace/Stripe checkout). This is a separate real-money checkout outside SPARKS and is subject to the owner's legal/compliance call. Not in v1.

## 7. Plots and ownership
- Plots (City SW district + realm plots) and **growth-farm towers** are claimed at the Deed office with SPARKS. The $UTOPIA-style ecosystem plan is parked; see memory.
- An owner can build/place a shop, a home (bed pod = personal respawn), a farm tower, or bot garage on their plot.
- Hired agents/bots work there: farmer, clerk, guard, courier.
- Regen meter: farm output greens the district (shared utopia progress).

## 8. Colosseum passes
- **Day pass:** entry + spectate + 3 matches.
- **Season pass:**
  - free track: weapon skins, capes, orbs, emotes, revive shards;
  - premium track (SPARKS): exclusive gear + a Legendary orb.
- **Event tickets:** naval battle, lava floor, void platforms, dragon exhibition.
- The pass is bought at the box office or the train kiosk. Access is via the Colosseum underground station (`__worldTransitApi.addStation`, see TRAIN-RIDE.md).

## 9. SPARKS flow (closed loop)
- **Earn:** jobs (agent work shifts, farming, courier runs), quests, colosseum wins, dragon kills, selling items to players.
- **Spend:** gear, potions, skill packs, plots, passes, bots, vehicles, arcade/casino play, market fees, repairs.
- **Sinks** keep it healthy: market fee, repairs, consumables, pass renewals, plot upkeep (small).
- Never cash-out, never yield, never staking.

## 10. Build order (inserted into WORLD-COMPLETION-PLAN)
1. **Animation library:** retarget UAL2 clips onto the 5 new Meshy rigs + ORACLE/PIKADON; verify with node + one render sheet.
2. **Weapons in code** (`world-weapons.js`) + hand/back sockets + draw/sheathe.
3. **Combat core for players** (`world-combat.js`): light/heavy/abilities/ultimate per the table, hit-frame events, telegraph rules, stamina.
4. **Gear/orb system** (`world-gear.js`): slots, code-built meshes, protection orbs with element resist that hooks into the dragon `statusMods`.
5. **Agent phone:** pulled up with a key or tap (P), and pops up on events (job offer, chat, dragon alert). Apps: **Map**, **Inventory**, **Jobs**, **Marketplace**, **News**, **Chat**. It works everywhere, including on the train and in shops. Visual style: WAIT for the owner's phone refs before building the UI.
   **Items + inventory** (`world-inventory.js`): consumables, hotbar, phone UI tab. It must work on the train (the ride only takes E).
6. **Shops** (`world-shops.js`): wire the interiors counter/shelf/NPC slots to the catalogue, the agent-run/human-run modes, and the market fee.
7. **Economy wiring:** SPARKS ledger calls to the existing backend (`/api/...` SPARKS endpoints); plots, farm tower, skill packs, colosseum passes.
8. **Jobs** for agents/bots (work loops + payouts) and chat bubbles.

Each step: one helper, node tests, commit. The owner then does one browser review per 2–3 steps.

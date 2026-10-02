# Gameplay expansion — owner brain-dump 2026-10-02 (design + build order)

Status legend: BUILT = code + tests exist, not yet wired into the host page · IDEA = design only · EXISTS = already in the game and reusable.

## Rules decided
- **Dragons are fought** in the wild. A dragon can also be **tamed**, but it is earned: wolf hides, skeleton cores, farm goods and a dragon potion crafted at an Academy-taught recipe. (BUILT: `public/world-tame.js`, recipes + lure items + persistence, `tools/tests/world-tame-mode.test.cjs`.)
- **Passive mode** vs **Fight mode**, player choice, persisted. In **the Void** (a single area) Fight is forced and the toggle refuses. (BUILT: `public/world-combat-mode.js`; host needs `WorldCombatMode.setInVoid(fn)` with the Void realm bounds and a per-frame `update(x, z)`; mob targeting and PvP hit code must call `canHurt` / `mobsTarget`.)
- Learn at the **Academy**, buy the upgrade as a **scroll** in the **Upgrade Shop**, then apply it to the item. Nothing is upgraded without all three steps.

## The progression loop (everything feeds everything)
```
 hunt / fish / farm / repair ──► materials ──► Academy skill (learn) ──► craft or upgrade scroll (shop) ──► stronger gear / ride / potion
        ▲                                                                                                      │
        └───────────── quests, NPC events, village jobs, races pay Sparks + materials ◄──────────────────────────┘
```
Existing pieces to hook: `world-quests.js` (daily board, QUILL library), `world-farm3d.js` (harvest), `world-gear.js` (loadouts), `world-gadgets.js`, `world-mobs.js` (16 wilderness camps), `world-naval.js` (boats), `world-inventory.js` (`ShdInv`), `world-hitfx.js` (hit markers), races + hoverskate scores.

## Materials (drop table seed)
| Source | Drops |
|---|---|
| Wolves | wolf-hide, raw-meat, fang |
| Skeletons | bone-shard, skeleton-core |
| Farm | ember-herb, frost-berry, golden-grain |
| Fishing | raw-fish, pearl, river-glass |
| Void | void-dust (rare, forced Fight mode area) |
| Repair jobs | scrap, coil, gasket |

## Systems to add, in suggested order
1. **Materials + crafting bench** (EXISTS partly: inventory). Wire `WorldTame.craft` to a bench in the Academy / Forge. Wolves and skeleton camps start dropping hides/cores.
2. **Academy skills** as learnable flags: `alchemy-1/2`, `tamer-1`, `smith-1`, `angler-1`, `mechanic-1`. A skill is a one-time Sparks cost + a short lesson quest.
3. **Upgrade Shop + scrolls**: scroll = consumable item `scroll:<stat>:<tier>`; applying needs the matching Academy skill. Tiers raise damage, armour, hover speed, car handling, board trick score, health.
4. **Community Hall** (an office converted): the village board. Jobs posted by NPCs (deliver, gather, escort, repair), reputation per village, a shared project (build a bridge, light the lanterns) that unlocks a town perk when the community fills it.
5. **Fishing** (water exists): cast, wait, reel mini-game; fish feed taming lures, cooking and Hall trades; rare catches in the waterways and under the boat lanes.
6. **Repairing**: gear, boards and cars take wear; a mechanic NPC or your own `mechanic-1` skill fixes them for scrap. Broken items work at reduced power instead of vanishing.
7. **NPC random events** (a seeded director, one active event per region): wolf raid on a village, a trader stranded on the train, a collapsed bridge, a meteor drops void-dust, a rival tamer challenges you. Events are small chains: 2–4 steps, pay materials.
8. **Chain quests / side quests** (examples to author):
   - "Fetch the fang": a wolf boss in the forest realm holds a fang a village elder needs; bring it back.
   - "The train stranger": find a person on the train, trade a specific item, carry the result to another terrain.
   - "Dragon fever": craft a potion, buy a lure, tame an ember dragon, race it through the Dragon Gate circuit.
   - "Lanterns for the Hall": gather 12 river-glass, repair 3 lamps, power the Community Hall.
9. **NPC villages** per terrain: each has a Hall, a stall that sells that terrain's scroll, a repair bench, a quest giver and 3–6 residents with routines. Different villages want different goods, which gives trading routes.
10. **Offices turned into other things** (EXISTS: offices as rooms): Community Hall, Apothecary (alchemy bench), Mechanic bay, Fish market, Scroll shop, Notice board, Tamer's lodge.
11. **Combat feel** (EXISTS: hitfx, rigs): move set per input (light, heavy, kick, dodge-roll, power move on a charged bar), dodge i-frames, stagger by weapon class, hit markers sized by damage and coloured by weakness.
12. **Dynamic battle differences**: damage and health depend on what each side is on.
    - On foot: baseline.
    - On a hoverboard: faster, light (low health pool), tricks double as attacks (BATTLE mode already stubs this).
    - In a car: heavy, ramming damage scales with speed, windows protect the rider, exposed when dismounted.
    - On a mount or tamed dragon: big health, fixed attack patterns, stamina-limited.
    - Passive-mode players cannot be hit or loot; Void ignores the toggle.

## Open questions for the owner
- Where exactly does **the Void** start and end (bounds or a radius around the Void gate)? The mode module needs that area test.
- Is Sparks the only currency for scrolls, or do materials also pay for them?
- Should tamed dragons be rideable with flight cost, or a battle companion that follows and fights?
- Which existing offices become the Community Hall and the Apothecary first?

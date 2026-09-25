# Colosseum + Dragon Gates — design (owner, 2026-09-25)

## 1. The Colosseum — agent-vs-agent, tournaments, soccer, team attack, parties
Owner: "colosseum lobby and inside but **less futuristic** … the middle should be usable for any playing
field grid or as a party … admin sets the theme, with presets … for now the building perfected with great
dimensions, to walk around / spectate."

**Look (from refs `interiors/colosseum-arena-*.jpg`, `interiors/grand-hall.jpg`, `world/colosseum-neon-exterior.jpg`):**
classical monumental — travertine stone tiers, marble, bronze and gold trims, red banners, statues, shafts of
light through an open oculus roof. Only the big screens stay modern. *(Deliberate exception to the
futuristic-only rule — colosseum only.)*

### Real dimensions (1 m = 3.89 world units — docs/ASSET-INBOX.md scale law)
| Part | Real | Why |
|---|---|---|
| Field (play area) | **100 × 64 m** | FIFA-legal pitch (90–120 × 45–90) — soccer fits; also a 16 × 12 tactics grid of 6.25 × 5.33 m tiles |
| Arena floor (field + apron) | 124 × 88 m ellipse | 12 m runoff each side for team modes / parties |
| Podium wall | 4 m high | separates floor from stands, with 4 player tunnels + 2 VIP boxes |
| Lower tier | 18 rows × 0.8 m tread, 0.45 m riser (≈30°) → +8.1 m | sightlines clear the podium |
| Promenade (concourse) | 6 m wide ring at +8.1 m | walk-around + food/bet stalls |
| Upper tier | 18 rows → +16.2 m above promenade | spectators |
| Arcade crown | 4 arched storeys to 46 m | real Colosseum is 48 m |
| Outer shell | ≈ 205 × 170 m | real Colosseum 189 × 156 m |
| Lobby (grand hall) | 60 × 32 m, 26 m tall | from grand-hall ref: ticket/bet board, trophy, tier gate, statues |

At 3.89 u/m the bowl is ~800 u across — wider than the whole city — so, like every interior, it is an
**instance off the map** (its own island at x = 12000), entered through the colosseum door at [-14, 460].
The outside can stay a sensible landmark; the inside is full real size (standard game practice).

### Field modes (one floor, swappable) — `COLOSSEUM.setField(mode)`
`sand` (classic duels) · `soccer` (pitch markings, goals) · `tactics` (16 × 12 glowing grid for agent battles) ·
`team-attack` (capture zones + cover blocks) · `party` (dance floor lights, stage at the north end).

### Themes (admin-set, presets ready) — `COLOSSEUM.setTheme(name)`
`classic` (travertine + red banners + sand) · `royal` (white marble + gold) · `night` (dark stone, torch light,
screens bright) · `festival` (party lighting, colour banners). Admin control: `?colo=<theme>` now; admin panel later.

### Walk + spectate
Stands are walkable (smooth ramp height under the stepped geometry), promenade ring, tunnels to the field.
Spectate: fixed broadcast cameras (north/south/sideline/aerial) the player can cycle.

## 2. Dragon Gates — the Wilds
Owner: "the dragons for each terrain … you fight in the wilderness when getting across; once you beat them you
can get in without fighting them."

- Each realm behind the mountain ring is guarded by its dragon **in its pass** (MOUNTAINS v2 canyons).
- First crossing: the dragon blocks the canyon → boss fight. Win → that pass is **unlocked forever** for the
  player (saved with the profile / sparks ledger); later crossings are free.
- Refs: `characters/dragon-red-emberfall` (Volcano pass), `dragon-green-forest` (Meadow pass),
  `dragon-tan-desert` (Suburb pass), `dragon-blue-arctic` (Darkforest pass — ice-blue fits its cold neon);
  breath FX: `vfx/dragon-breath-sheet` (fire / ice / poison / sand). Ocean road + Colosseum road stay open.
- 3D: dragons are winged bipeds in a front T-pose → fal mesh + rig; wings animate procedurally in code.

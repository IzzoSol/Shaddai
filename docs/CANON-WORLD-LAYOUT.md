# Canon World Layout — deliverables A–D (Master Build Prompt, 2026-09-26)

- **The canonical map is** `fal-assets/refs/world/ATLAS-CANON-image37.jpg` (the owner's image 37, "Word of Shaddai — Ringed Realm").
- **Everything else is interpretation:** `tour-*`, `v4-*` (including `v4-emberfall.png`, which is a Blender *test render*, not a map) and every atlas-style render.
- **Layout lock:** keep the Map v4 disc as it is. That means the terrain, the realm clock positions, the Crystal Sea silhouette, the NE volcano and the gold ring.

## A. Discrepancies: the canon atlas vs the current renders

| Feature | Canon (atlas) | Current render | What's wrong | Fix (step) |
|---|---|---|---|---|
| Centre | Dense Grid + SHADDAI monument | Empty asphalt disc and a small cyan pad | Missing landmark; empty plaza | A 60 m monument with Central Station wrapped round its base (1) |
| Grid | A walkable neon city in concentric rings | 12 thin lines on black | Nothing lives there | 16 streets, 4 ring roads, blocks in wedges at ≥40 % density (1 = 4 cardinal wedges as proof) |
| Agora | A connected market district | Absent | Missing | A 30×30 m plaza on the inner-east rings, between the ORACLE and QUILL spokes (1) |
| Agent pads | ZEROX W, ORACLE E, QUILL ESE, TURTLE NNE, NEXUS SW harbour | Only a small hexagon at the core | Missing | 8×8 m pads with each agent's trim colour and a sign (1) |
| Stations | 8 named stations ON the gold ring | Grey slabs / white dots, some 40 m off the ring | Placeholder; not on the ring | One station kit: 24×8 m platform, 4 m canopy, 3 m nameplate, stairs down to the spoke road (2) |
| Routes | Spokes continue as roads into the biomes | Spokes end at the Grid edge | Disconnected | Each station bearing continues as a 12 m road from the Grid edge, through the ring, into the biome (2) |
| Ring rail | A deck with rails | A beige beam on pylons | Too thin | 4 m deck, 6 m above grade, rails + parapets, supports every 20 m (2) |
| Meadowfields | Halt + amphitheatre + formal garden boulevard, blossom trees at the EDGE | A field of red-cap shacks and flowers | Wrong genre ("toy farm") | Halt on the ring, a 12 m boulevard, green-roof civic halls and crescent courts, a 50 m amphitheatre bowl; shacks deleted (3) |
| Quill Forest | A dark tree MASS between the Grid's east edge and the Halt | Pink dots | No forest mass | 400+ trees, 12–20 m, dense; the QUILL pad on the seam (3) |
| Deep Void | A vertical vortex, the Rift Gate Station, a winged gate over the pit | Two cyan puddles and a 2 m "manhole" gate | No rift, no gate | Station on the ring, overlook plaza, winged ring gate + tetrahedron, a deeper pit (4) |
| Emberfall | A terraced city + rune bridges over a lava channel | One hill with orange paint | No gameplay space | Terrace, switchback, 2 bridges over a lava trough, tower blocks, dragon on the ridge (5) |
| Suburbs | Packed megablocks + a sky-megatower + a Transit Hub | A grey plate with 4 lone gizmos | <40 % density | ≥40 % footprint coverage, one 80–120 m megatower, an east highway (6) |
| Sand Sea | An adobe cluster at the Desert Terminal | A dome and dune blobs | Weak | 8–15 adobe-kit buildings in a 120 m bowl (7) |
| Darkforest | Dense pine + a path from Darkvault | Sparse trees | Too empty | Hex pads + plank bridges, high pine density (8) |
| Crystal Sea | Islands + harbour line | Good silhouette, no harbour | Missing harbour | Harbour Line Station, a pier, one glass-tube segment, rock-hop planks. Don't dry the sea (9) |
| Arctic | A shelf city on the ice | Ice peak + salmon rocks | No city | A shelf city on the south face, a tunnel gate, 3 glass domes (10) |
| Colosseum | A massive oval that owns the south | A small hoop | Under scale | A real-size oval (the ~200 m game building) on the south spoke with a 12 m ceremonial road (11) |
| Dragons/gates | One per biome crossing | None | Missing | Named placeholders last (12) |

## B/D. Canonical coordinate table

The machine-readable version is `tools/blender/canon/world-layout.json`. Its `pos_m` follows the prompt's formula with R = 5000 m.

| id | table x,y (%) | bearing ° | r (m) | Note |
|---|---|---|---|---|
| shaddai-source / the-grid | 50,50 | — | 0 / r 1600 | Grid radius locked at 1600 m |
| agora | 58,52 | 104 | 825 | Inner-east rings |
| darkforest | 22,38 | 293 | 3046 | |
| arctic-vault | 38,24 | 335 | 2864 | |
| deep-void | 50,22 | 0 | 2800 | |
| sand-sea | 64,26 | 30 | 2778 | |
| emberfall | 78,32 | 57 | 3329 | |
| the-suburbs | 84,50 | 90 | 3400 | |
| quill-forest | 66,54 | 104 | 1649 | Seam east of the Grid |
| meadowfields | 70,72 | 138 | 2973 | |
| crystal-sea | 24,70 | 232 | 3280 | |
| southern-colosseum | 50,82 | 180 | 3200 | |
| agents | ZEROX 38,50 · ORACLE 64,48 · QUILL 62,58 · TURTLE 60,36 · NEXUS 34,62 | 270 · 82 · 124 · 36 · 233 | 1200 · 1414 · 1442 · 1720 · 2000 | 8×8 m pads |
| stations (on the ring, r 2829) | Darkvault 299 · Arctic Outpost 333 · Rift Gate 0 · Desert Terminal 31 · Emberfall Forge 54 · Suburb Hub 90 · Meadowfields Halt 142 · Harbor Line 225 | | 2829 | Bearings are from the table; the radius is snapped to the ring |

### Resolved conflicts (the prompt's own rules decide)
1. **Station radii.** The table puts stations 1.8–2.3 km out, but the text and the atlas say "ON the gold ring". Each station keeps its table *bearing* (all within about 6° of the atlas) and snaps to the ring.
2. **The harvest amphitheatre.** At (68,64) it would sit inside the ring. The atlas draws it in Meadowfields at about 3800 m, 133°. The atlas wins.
3. **Ring and Grid radii.** The prompt uses 30 % / 18 %; the locked disc has 28.3 % / 16 %. The layout lock wins; the difference is small.
4. **Spoke count.** The Grid had 12 avenues. The spec builds 16 wedges, so it now has 16.
5. **Grid heights.** The spec says Grid blocks are 8–16 m (40–80 m for civic). The earlier 60–320 m tower plan (`world-grid-city-v4.js`) is shelved; it conflicts.

## C. Minimum changes, in order (the prompt's ORDER OF WORK)
0. Axis and table → `world-layout.json`, `README.md`. ✅
1. Monument + Central Station + 16 Grid streets + blocks in the 4 cardinal wedges only (proof) + Agora + agent pads.
2. All 8 stations as ONE kit, snapped to the ring. Deck at 6 m above grade, supports every 20 m. Spoke roads into the biomes.
3. Meadowfields Halt + a 12 m civic boulevard + green-roof civic kit + amphitheatre bowl. Quill Forest mass. Red-shack village deleted.
   - **STOP here for owner approval** (top-down + eye-level screenshots). No shader or particle passes before sign-off.
4. Void station + winged gate.
5. Emberfall terrace + 2 bridges.
6. Suburbs footprints + megatower.
7. Sand adobe cluster.
8. Darkforest path.
9. Harbour + tube + planks.
10. Arctic shelf.
11. Colosseum scale.
12. Dragons.

**Builder:** `tools/blender/canon/build_canon.py`.
- It writes collections 00_–16_, plus a DEBUG view layer with the atlas at 0.35 opacity, a 10×10 grid, station arrows and region boxes.
- It logs what it added and deleted to `build-log-step<N>.json`.
- It saves `.bl-cache/canon-step<N>.blend` so the owner can open it.

# DOC_WORLD — SHADDAI City v3 (Blender metres: +X east, +Y north, Z up; bearing 0 = north, clockwise)
Grid disk diameter 3200 m (r 1600). Whole world 10000 m.
Core r < 170 m = the EXISTING 3D Shaddai City (7 agent houses, museum, library, arcade, music). Never built over.

## Wedge map (16 Grid wedges, 22.5 deg each)
- Built (N 0-22.5, E 90-112.5, S 180-202.5, W 270-292.5) -> 01_HOUSING:
  - lit windows 45-60 %
  - arcade bands
  - 12 rooftop courier pads
- NE petal 22.5-90 -> 02_ACADEMY_FORGE (plaza 1073, 717) + 03_PERCH on the rim (crown 1164, 977, 93).
- NW petal 292.5-360 -> 04_TRACK Race Quarter.
  - TRACK_MAIN = r1600 ring road, counter-clockwise.
  - GATE_START 0, 1600.
- SE petal 112.5-180 -> 06_COMMONS (Shaddai building library) + the moved SHADDAI monument in the Commons plaza 436, -652.
- SE Commons also holds CULTURE_LANE: one short street off the monument plaza (broadcast booth, gallery shop + 8 SLOT_GALLERY, 4-cabinet arcade alcove, STUDIO_01-04, radio queue, exhibit intake to TURTLE downtown). It is a block, not a petal.
- NE / NW also get lower-density themed fabric from the building library (campus workshops and dorms / team garages and parts shops). This keeps the petals reading as districts, not empty land.
- Art slots: every home, office and plot facade has 1-2 SLOT_FACADE / SLOT_HOME (art-slots-v4.json). Empty = blank panel; filled = emissive artwork card.
- SW petal 202.5-270 -> 05_PLOTS (dark until claimed) + DEED_OFFICE / BUILDER_YARD strip on the 202.5 edge (deed office -327, -686).
- The blue stripes in the viewport are DISC_Water (water level 2 m) showing through flat ground. They are NOT canals.

## Not deleted (kept exactly)
All canon collections 00_Layout_Disc ... 16_Debug: STREETS_Grid, BLD_Grid_CardinalWedges, LM_Agora, PAD_ZEROX/ORACLE/QUILL/TURTLE/NEXUS, stations, ring rail, realms.
Moved (not deleted): LM_ShaddaiMonument_CentralStation + its nameplate -> Commons plaza. The nameplate now reads 'SHADDAI COMMONS'.

## Sound of the places
- Forge: low hum, occasional clang, chip-seat click.
- Academy: soft room tone, page turns, distant music practice.
- Track: tyre/hover whine sweeping CCW, gate pulse tone.
- Commons: stall pings, footsteps, plaza chatter.
- Plots: wind; a beacon hum starts when a plot is claimed.

## Agent contract (every official agent)
- home_id -> one HUB_HOME_*
- job_id -> forge bay | class | pit | stall | perch courier | hiring-board contract
- schedule >= 3 beats (leave home, work, return)
- skills[]
- sparks_wallet = ledger id (economy-service)
- paybox_client_id: optional

Max 8 AGENT_PROXY_* in 07_MARKERS.

## Success test
"Center is the old city. SE is the square with the monument. NE they train and rebuild; dragons land on the spike. NW is the race. SW is dark plots that light when claimed. The bright wedges are where people live."

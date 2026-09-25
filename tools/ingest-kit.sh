#!/usr/bin/env bash
# tools/ingest-kit.sh — owner GLB kit from Downloads -> public/assets/models/kit/<slug>.glb (meshopt + webp, one file at a time)
SRC="/c/Users/Brittany/OneDrive/Desktop/New folder/Downloads"
OUT=public/assets/models/kit
cd "$(dirname "$0")/.."
LIST="Path_01_Art Wall_Module_04 Wall_Module_07 TerrainGroundRight01 TerrainWater01 Terrain_Amount_02_Art Terrain TerrainGrass01 TerrainGround01 TerrainFloor Tree_01_Art Tree03 Tree04 PalmTree03 Tree01 Colony_Planet_Art SciFi_Bridge Path_03_Art Japanese_Sign_15 Table_Dinner Path_04_Art ElevatorTeleport01_Art Path_02_Art BlockChain_CodeBush_Art Platform_03 Sofa Seat Pot SandMount_Art TempleEmbelisher03_Art TempleEmbelisher02_Art TempleEmbelisher01_Art TempleFloor03_Art TempleFloor04_Art TempleFloor01_Cut Spooky_Bridge_Fragment_01_Art BlockChain_Tower_Art Iron_Structure_01_Art Bench_01 Plant_02_Art Floor_Ring Japanese_Arch Japanese_Sign_03 Japanese_Sign_12 Japanese_Sign_16 Orion RetroComputerBooth Sidewalk Top_Beam Wall_01 Stairs SciFi_Stairs_32 Table_Round_01 Table_Futuristic Stage_Structure_Backstage Grass03 Grass04 InformationStand01 InformativePanel01 Mountain01 Mountain05 PortalEffect02 StandArc01 WaterfallFoam01 Tree02 VIPBridge01_Art VIP_Domes_Outline Tree01_Art VipBarrier01_Art VIPWall01_Art Floating_Island_01_Art"
for n in $LIST; do
  slug=$(echo "$n" | sed -E 's/_Art$//; s/([a-z0-9])([A-Z])/\1-\2/g; s/_/-/g' | tr 'A-Z' 'a-z')
  [ -f "$OUT/$slug.glb" ] && { echo "skip $slug"; continue; }
  npx --yes @gltf-transform/cli optimize "$SRC/$n.glb" "$OUT/$slug.glb" --compress meshopt --texture-compress webp --texture-size 1024 --simplify false >/dev/null 2>&1 \
    && echo "ok   $slug $(( $(stat -c %s "$SRC/$n.glb") / 1000 ))KB -> $(( $(stat -c %s "$OUT/$slug.glb") / 1000 ))KB" \
    || echo "FAIL $slug"
done

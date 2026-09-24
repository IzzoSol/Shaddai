#!/bin/bash
# packages every finished world model into the 3D worktree, then commits + pushes feat/world3d. Safe to re-run.
cd /c/Users/Brittany/Shaddai
W=/c/Users/Brittany/Shaddai-3d
for round in $(seq 1 30); do
  for d in fal-assets/world/assets/*/; do n=$(basename $d); f=$d$n-mesh.glb; o=$W/public/assets/models/$n.glb
    [ -f "$f" ] && [ ! -f "$o" ] && npx -y @gltf-transform/cli optimize "$f" "$o" --compress meshopt --texture-compress webp --texture-size 1024 >/dev/null 2>&1
  done
  done_n=$(grep -l "✔ Done" fal-assets/world/logs/*.log 2>/dev/null | wc -l)
  cd $W && git add -f public/assets/models >/dev/null 2>&1 && git commit -qm "3D world: more models packaged ($done_n/38 of batch 5)" >/dev/null 2>&1 && git push origin feat/world3d >/dev/null 2>&1; cd /c/Users/Brittany/Shaddai
  [ $done_n -ge 37 ] && break
  sleep 120
done
echo SHIPPED > fal-assets/world/ship.done

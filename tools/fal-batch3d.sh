#!/usr/bin/env bash
# tools/fal-batch3d.sh id1 id2 ... — to3d (preflight-gated) -> compress -> public/assets/models/fal/<id>.glb
# FAL_KEY must be in env. Pro-tier GLBs (~50-60MB) get a stronger simplify than rapid ones.
cd "$(dirname "$0")/.."
for id in "$@"; do
  echo "== $id"
  PYTHONIOENCODING=utf-8 python fal-assets/production/to3d.py "$id" --go 2>&1 | grep -E "saved|BLOCKED|STOP|OK:" | head -3
  src=fal-assets/production/models/$id.glb; [ -f "$src" ] || continue
  mb=$(( $(stat -c %s "$src") / 1000000 )); ratio=0.25; err=0.002; [ $mb -gt 10 ] && ratio=0.12 && err=0.004
  npx --yes @gltf-transform/cli optimize "$src" fal-assets/production/ship/$id.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify true --simplify-ratio $ratio --simplify-error $err 2>&1 | grep -E "info: |rror"
  cp fal-assets/production/ship/$id.glb public/assets/models/fal/$id.glb
done
node fal-assets/production/preflight.mjs | sed -n 1p

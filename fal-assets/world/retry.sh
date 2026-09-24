#!/bin/bash
cd /c/Users/Brittany/Shaddai
n=0
while read id; do id=${id%$'\r'}; [ -z "$id" ] && continue
  OUTDIR=fal-assets/world/assets/$id node fal-assets/character-pipeline.mjs $id fal-assets/world/concepts5/$id.png --meshy6 --static > fal-assets/world/logs/$id.log 2>&1 &
  n=$((n+1)); [ $((n % 7)) -eq 0 ] && wait
done < fal-assets/world/retry.list
wait; echo RETRYDONE > fal-assets/world/retry.done

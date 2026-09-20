#!/bin/bash
# usage: tools/gen-models.sh <batch> <concept-dir> <list-file> <out-assets-dir> [parallel=8]
cd /c/Users/Brittany/Shaddai
node fal-assets/generate.mjs $1 --go > $TEMP/gen-$1.log 2>&1
P=${5:-8}; n=0
while read id; do
  [ -f "$2/$id.png" ] || continue
  ( OUTDIR=$4/$id node fal-assets/character-pipeline.mjs $id $2/$id.png --meshy6 --static > $TEMP/m-$id.log 2>&1 || (sleep 20; OUTDIR=$4/$id node fal-assets/character-pipeline.mjs $id $2/$id.png --meshy6 --static > $TEMP/m-$id.log 2>&1) ) &
  n=$((n+1)); if [ $((n % P)) -eq 0 ]; then wait; fi
done < $3
wait; echo GENDONE > $TEMP/gen-$1.done

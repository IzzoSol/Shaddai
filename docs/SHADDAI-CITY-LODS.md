# SHADDAI City building GLBs: compression + LODs

Source: `.bl-cache/sc/sc-*.glb`, the raw Blender exports (metadata in `.bl-cache/sc/sc-types.json`).
Output:
- `public/assets/models/shaddai-city/<key>.glb`: full detail
- `public/assets/models/shaddai-city/lod/<key>-lod1.glb`
- `public/assets/models/shaddai-city/lod/<key>-lod2.glb`

Tool: `@gltf-transform/cli` 4.5.0 (`optimize`), run one model at a time.
Tris come from `node tools/ual/count-tris.mjs`. Materials come from `node tools/ual/inspect-glb.mjs`, plus a check for emissive materials.

## Results

MB = 10^6 bytes.

| key | raw MB / tris | full MB / tris | lod1 MB / tris | lod2 MB / tris |
|---|---|---|---|---|
| sc-storefront-s | 35.43 / 15,703 | 1.50 / 15,703 | 0.57 / 5,233 | 0.17 / 5,188 |
| sc-storefront-l | 26.46 / 31,641 | 1.06 / 31,641 | 0.46 / 11,588 | 0.27 / 11,515 |
| sc-office | 45.89 / 33,903 | 1.75 / 33,903 | 0.67 / 11,933 | 0.29 / 11,909 |
| sc-office-mid | 26.61 / 39,137 | 1.10 / 39,137 | 0.48 / 13,914 | 0.32 / 13,871 |
| sc-market | 12.06 / 22,622 | 0.55 / 22,622 | 0.24 / 8,766 | 0.16 / 8,783 |
| sc-techlab | 25.97 / 17,104 | 0.82 / 17,104 | 0.33 / 4,861 | 0.15 / 4,731 |
| sc-garden | 36.84 / 6,288 | 1.27 / 6,288 | 0.56 / 5,270 | 0.16 / 5,196 |
| sc-teleport | 11.83 / 6,216 | 0.44 / 6,216 | 0.23 / 3,749 | 0.09 / 3,721 |
| sc-civic-tower | 28.97 / 84,205 | 1.83 / 84,205 | 0.86 / 31,252 | 0.68 / 31,164 |
| sc-ad-pylon | 10.97 / 2,854 | 0.30 / 2,854 | 0.14 / 1,832 | 0.06 / 1,832 |
| **total** | **261.0** | **10.63** | **4.53** | **2.36** |

## Commands (exactly as run)

```bash
npx --yes @gltf-transform/cli optimize .bl-cache/sc/<key>.glb public/assets/models/shaddai-city/<key>.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 --simplify false

npx --yes @gltf-transform/cli optimize .bl-cache/sc/<key>.glb public/assets/models/shaddai-city/lod/<key>-lod1.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify true --simplify-ratio 0.12 --simplify-error 0.15

npx --yes @gltf-transform/cli optimize .bl-cache/sc/<key>.glb public/assets/models/shaddai-city/lod/<key>-lod2.glb \
  --compress meshopt --texture-compress webp --texture-size 128 --simplify true --simplify-ratio 0.02 --simplify-error 0.5
```

The runtime needs `MeshoptDecoder`, because the geometry uses `EXT_meshopt_compression`. Textures are WebP (`EXT_texture_webp`).

## artslot-* and emissive materials

- **No extra flags were needed.** Every `artslot-NN-*` material keeps its exact name in the full and LOD1 files (01 to 07 across storefront-s, storefront-l, market, civic-tower and ad-pylon). `--join`, `--palette` and `--instance` stayed at their defaults. Each artslot has its own texture, so `dedup` never merged two of them.
- Emissive materials are still emissive at every level.
- `dedup` merged a few duplicate kit materials into an identical twin. Triangle counts are unchanged, so no geometry was lost. The duplicates were: MI_Trim_03_Cables and MI_Trim_02_Variation (storefront-s), Eclipse (office), MI_Trim_01_Stairs (techlab) and MI_Trim_01_Floor (teleport). None of them are artslots.
- **LOD2 caveat:** in `sc-storefront-l-lod2` and `sc-civic-tower-lod2`, the artslot panel geometry was simplified away and its material was then pruned. The name was not changed; the panel is simply gone. Some small kit materials were also removed at LOD2: Atlas_Sign/Urban_Trim (office), M_Glass (techlab) and Atlas_Sign (storefront-s). This is expected at far distance, but code that swaps artslot art must tolerate a missing artslot material on LOD2.

## Known issue: LOD2 barely reduces triangles

LOD2 has almost the same triangle count as LOD1 (within 1 to 3%), even with ratio 0.02 and error 0.5. Only the smaller textures make it lighter. The simplifier seems to stop where vertices cannot be merged: hard-surface kit geometry has UV and normal seams and many separate pieces, and meshopt's simplifier will not collapse across them.

Possible fixes, none applied here:
- Build LOD2 without normals/UVs.
- Use a sloppy simplifier (`meshoptimizer` `simplifySloppy`) in a custom script.
- Use an impostor or billboard for the farthest band.

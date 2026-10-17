# Rig audit: import each GLB into the OPEN Blender (one at a time, scene cleared between) and print rig facts.
#   node tools/blender/bl.cjs tools/blender/audit-rigs.py FILES="a.glb;b.glb"   (paths absolute, ; separated)
# Read-only: it only imports, measures and clears the scene it imported. Run on a fresh/default scene, NEVER on the full city .blend.
import bpy, os, json
files = [f for f in str(bpy.app.driver_namespace.get('FILES', '')).split(';') if f]
SOCKETS = ('seat', 'seat2', 'stand', 'saddle')
BONE_HINTS = ['Hips', 'Spine', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftToeBase']
def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for a in list(bpy.data.armatures): bpy.data.armatures.remove(a)
out = []
for f in files:
    clear()
    try:
        bpy.ops.import_scene.gltf(filepath=f)
    except Exception as e:
        out.append({'file': os.path.basename(f), 'error': str(e)[:120]}); continue
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']; arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    tris = sum(len(m.data.polygons) for m in meshes)  # polygons (tris if the export was triangulated)
    bones = sorted({b.name for a in arms for b in a.data.bones})
    names = {n.split(':')[-1] for n in bones}
    missing = [h for h in BONE_HINTS if h not in names]
    skinned = sum(1 for m in meshes if any(md.type == 'ARMATURE' for md in m.modifiers))
    ncolor = len({mat.name for m in meshes for mat in m.data.materials if mat})
    # size in metres
    mn = [1e9] * 3; mx = [-1e9] * 3
    for m in meshes:
        for c in m.bound_box:
            w = m.matrix_world @ __import__('mathutils').Vector(c)
            for i in range(3): mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    clips = sorted({a.name for a in bpy.data.actions})
    sockets = sorted({o.name for o in bpy.data.objects if o.name.lower() in SOCKETS})
    out.append({'file': os.path.basename(f), 'meshes': len(meshes), 'polys': tris, 'armatures': len(arms), 'bones': len(bones), 'skinned_meshes': skinned, 'materials': ncolor,
                'clips': clips[:12], 'n_clips': len(clips), 'size_m': [round(mx[i] - mn[i], 2) for i in range(3)], 'standard_bones_missing': missing, 'sockets': sockets, 'sample_bones': bones[:6]})
clear()
print(json.dumps(out))

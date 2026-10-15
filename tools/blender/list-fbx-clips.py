# List the animation clips inside an FBX/GLB in the OPEN Blender (read-only; clears what it imported).
#   node tools/blender/bl.cjs tools/blender/list-fbx-clips.py FILE=C:/path/x.fbx OUT=C:/path/out.json
import bpy, json
f = str(bpy.app.driver_namespace.get('FILE')); out = str(bpy.app.driver_namespace.get('OUT'))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
if f.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=f)
else: bpy.ops.import_scene.gltf(filepath=f)
acts = sorted([(a.name, round(a.frame_range[1] - a.frame_range[0])) for a in bpy.data.actions])
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
bones = sorted({b.name for o in arms for b in o.data.bones})
json.dump({'clips': acts, 'bones': bones}, open(out, 'w'))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
print('clips', len(acts), 'bones', len(bones))

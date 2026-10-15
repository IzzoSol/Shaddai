# blender -b <file.blend> --python tools/blender/assets/inspect-blend.py   → objects, armatures, bones, actions, tris, size
import bpy
print('=== FILE', bpy.data.filepath)
for o in bpy.data.objects:
    extra = ''
    if o.type == 'MESH':
        me = o.data; tris = sum(len(p.vertices) - 2 for p in me.polygons); extra = ' tris=%d mats=%s' % (tris, [m.name for m in me.materials if m][:4])
    if o.type == 'ARMATURE': extra = ' bones=%d' % len(o.data.bones)
    print('OBJ', o.type, o.name, 'dims=%s' % (tuple(round(v, 2) for v in o.dimensions),), 'parent=%s' % (o.parent.name if o.parent else None), extra)
for a in bpy.data.armatures:
    print('ARM', a.name, [b.name for b in a.bones][:60])
for ac in bpy.data.actions:
    print('ACT', ac.name, 'frames=%s' % (tuple(int(f) for f in ac.frame_range),), 'fcurves=%d' % len(getattr(ac, 'fcurves', []) or []))
print('IMAGES', [i.name for i in bpy.data.images][:12])

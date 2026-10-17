# SHADDAI · render-anim-sheet.py — headless contact sheet of library poses on one rig (one render, all poses in a row).
#
#   node tools/anim/make-pose-sheet-glb.mjs                       (writes <tmp>/shaddai-anim-sheet-poses.glb)
#   "/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/anim/render-anim-sheet.py -- <poses.glb> <out.png>
#
# The GLB holds the rig plus one constant "NN_Clip@t" pose action per clip. We import it once, duplicate the rig
# (mesh data linked, so memory stays flat), give each copy its action, and render with Workbench (cheap on the HD 620).
import bpy, sys, os, math, tempfile, mathutils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
src = argv[0] if argv else os.path.join(tempfile.gettempdir(), 'shaddai-anim-sheet-poses.glb')
out = argv[1] if len(argv) > 1 else os.path.join(root, 'docs', 'img', 'anim-sheet-v1.png')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
meshes = [o for o in scene.objects if o.type == 'MESH']
actions = sorted([a for a in bpy.data.actions if '@' in a.name], key=lambda a: a.name)
print('actions', [a.name for a in actions])

def top(o):
    while o.parent: o = o.parent
    return o

def assign(ob, act):
    ob.animation_data_create()
    ob.animation_data.action = act
    try:
        if hasattr(ob.animation_data, 'action_slot') and act.slots:
            ob.animation_data.action_slot = act.slots[0]
    except Exception as e:
        print('slot', e)

base_root = top(arm)
group = [base_root] + [o for o in base_root.children_recursive]
SP = 1.25
for i, act in enumerate(actions):
    if i == 0:
        objs = group
    else:
        mp = {}
        for o in group:
            c = o.copy(); mp[o] = c; scene.collection.objects.link(c)   # data linked (mesh shared)
        for o, c in mp.items():
            if o.parent in mp: c.parent = mp[o.parent]
            for m in c.modifiers:
                if m.type == 'ARMATURE' and m.object in mp: m.object = mp[m.object]
        objs = list(mp.values())
    r = objs[0]
    r.location.x = base_root.location.x + i * SP
    for o in objs:
        if o.type == 'ARMATURE': assign(o, act)
    label = act.name.split('_', 1)[1]
    bpy.ops.object.text_add(location=(i * SP, -0.6, 0.02))
    t = bpy.context.object; t.data.body = label.replace('@', '\n@ ') + 's'; t.data.size = 0.09; t.data.align_x = 'CENTER'
    t.rotation_euler = (math.radians(90), 0, 0)

scene.frame_set(1)
n = len(actions)
bpy.ops.mesh.primitive_plane_add(size=1, location=((n - 1) * SP / 2, 0.3, 0))
fl = bpy.context.object; fl.scale = (n * SP + 1, 3, 1)
bpy.ops.object.camera_add(location=((n - 1) * SP / 2 + 3.2, -9.5, 2.6))
cam = bpy.context.object
cam.data.type = 'ORTHO'; cam.data.ortho_scale = n * SP + 0.8
target = ((n - 1) * SP / 2, 0, 0.85)
d = [target[i] - cam.location[i] for i in range(3)]
cam.rotation_euler = mathutils.Vector(d).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
sh = scene.display.shading
sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_shadows = True; sh.show_cavity = True
scene.render.resolution_x = 3200; scene.render.resolution_y = 760
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new('w') if not scene.world else scene.world
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('wrote', out)

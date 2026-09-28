# mannequin-tpose.py — render the UAL2 mannequin in its REST T-pose, front orthographic, exact height, flat grey studio.
# This image is the POSE + PROPORTION reference given to the image model alongside each character reference, so every
# concept comes out in a true T-pose at the proportions of the skeleton our animations (UAL2) use.
#   blender -b [Mannequin_F.blend] --factory-startup --python tools/blender/assets/mannequin-tpose.py -- --src <fbx|omit> --out <png> [--height 1.8]
import bpy, sys, os, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
def arg(k, d=None): return a[a.index(k) + 1] if k in a else d
SRC, OUT, HEIGHT = arg('--src'), os.path.abspath(arg('--out')), float(arg('--height', '1.8'))
if SRC:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.fbx(filepath=SRC)
sc = bpy.context.scene
arms = [o for o in sc.objects if o.type == 'ARMATURE']
for ar in arms:
    ar.data.pose_position = 'REST'                                   # the bind pose = T-pose
    if ar.animation_data: ar.animation_data.action = None
meshes = [o for o in sc.objects if o.type == 'MESH' and o.visible_get()]
for o in sc.objects:
    if o.type not in ('MESH', 'ARMATURE'): o.hide_render = True
bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in meshes:
    ev = o.evaluated_get(dg)
    for v in ev.to_mesh().vertices:
        w = ev.matrix_world @ v.co; mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    ev.to_mesh_clear()
h = mx.z - mn.z; k = HEIGHT / h
for o in [o for o in sc.objects if o.parent is None]: o.scale = o.scale * k; o.location = o.location * k
bpy.context.view_layer.update(); mn *= k; mx *= k
span = mx.x - mn.x
print('MANNEQUIN height_m %.3f arm_span_m %.3f span/height %.3f meshes %d' % (HEIGHT, span, span / HEIGHT, len(meshes)))
mat = bpy.data.materials.new('clay'); mat.use_nodes = True
b = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Base Color'].default_value = (0.82, 0.82, 0.84, 1); b.inputs['Roughness'].default_value = 0.8
for o in meshes:
    o.data.materials.clear(); o.data.materials.append(mat)
cx, cz = (mn.x + mx.x) / 2, (mn.z + mx.z) / 2
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
W, H = 1024, 1536
cd.ortho_scale = max(span * 1.3, (mx.z - mn.z) * 1.08 * W / H)
if '--flip' in a: cam.location = (cx, mx.y + 10, cz); cam.rotation_euler = (math.radians(90), 0, math.radians(180))   # model faces +Y
else: cam.location = (cx, mn.y - 10, cz); cam.rotation_euler = (math.radians(90), 0, 0)        # looking +Y at the front
for rot in ((math.radians(55), 0, math.radians(20)), (math.radians(60), 0, math.radians(-160))):
    ld = bpy.data.lights.new('k', 'SUN'); ld.energy = 3.0; lo = bpy.data.objects.new('k', ld); sc.collection.objects.link(lo); lo.rotation_euler = rot
sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.use_nodes = True
bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.35, 0.35, 0.36, 1); bg.inputs['Strength'].default_value = 1.0
sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.film_transparent = False; sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True); print('SAVED', OUT)

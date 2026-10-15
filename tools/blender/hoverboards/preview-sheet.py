# tools/blender/hoverboards/preview-sheet.py — headless preview: the 9 code-built hoverboards + ZEROX standing on one.
#   node tools/blender/hoverboards/export-boards.cjs <boards.json>
#   blender -b --factory-startup --python tools/blender/hoverboards/preview-sheet.py -- <boards.json> <out.png>
import bpy, json, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = argv[0] if argv else 'boards.json'
OUT = argv[1] if len(argv) > 1 else 'hoverboards-v1.png'
ROOT = __file__.replace('\\', '/').rsplit('/tools/', 1)[0]
ZEROX = ROOT + '/fal-assets/characters/zerox/zerox-rigged.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
data = json.load(open(SRC))


def hexcol(h):
    return ((h >> 16 & 255) / 255.0, (h >> 8 & 255) / 255.0, (h & 255) / 255.0, 1.0)


mats = {}
def material(m):
    key = (m['color'], m['emissive'], round(m['strength'], 2), m['additive'], round(m['metal'], 2))
    if key in mats: return mats[key]
    mt = bpy.data.materials.new('m%d' % len(mats)); mt.use_nodes = True
    b = next(n for n in mt.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hexcol(m['color'])
    b.inputs['Metallic'].default_value = m['metal']; b.inputs['Roughness'].default_value = m['rough']
    if m['emissive'] and m['strength'] > 0:
        b.inputs['Emission Color'].default_value = hexcol(m['emissive'])
        b.inputs['Emission Strength'].default_value = min(8.0, m['strength'] * 2.0)
    if m['additive']:
        b.inputs['Alpha'].default_value = 0.45
        try: mt.surface_render_method = 'BLENDED'
        except Exception: pass
    mats[key] = mt
    return mt


for bd in data['boards']:
    for i, m in enumerate(bd['meshes']):
        v = m['v']; verts = [(v[k], v[k + 1], v[k + 2]) for k in range(0, len(v), 3)]
        f = m['f']; faces = [(f[k], f[k + 1], f[k + 2]) for k in range(0, len(f), 3)]
        me = bpy.data.meshes.new('%s_%d' % (bd['id'], i)); me.from_pydata(verts, [], faces); me.update()
        ob = bpy.data.objects.new(me.name, me); ob.data.materials.append(material(m))
        sc.collection.objects.link(ob)

# ground + lights + world
bpy.ops.mesh.primitive_plane_add(size=40, location=(1.2, 2.0, 0))
g = bpy.context.active_object; gm = bpy.data.materials.new('ground'); gm.use_nodes = True
gb = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gb.inputs['Base Color'].default_value = (0.03, 0.035, 0.05, 1); gb.inputs['Roughness'].default_value = 0.35
g.data.materials.append(gm)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.02, 0.03, 0.06, 1); bg.inputs[1].default_value = 0.6
for loc, e in (((4, -6, 9), 900), ((-6, 8, 7), 500), ((8, 8, 4), 300)):
    L = bpy.data.lights.new('l', 'AREA'); L.energy = e; L.size = 6
    lo = bpy.data.objects.new('l', L); lo.location = loc; sc.collection.objects.link(lo)
    lo.rotation_euler = (Vector((1.2, 2.5, 0.4)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

# ZEROX standing on the rider board (side-on surf stance, knees bent, arms out)
r = data['rider']
try:
    bpy.ops.import_scene.gltf(filepath=ZEROX)
    arm = next(o for o in bpy.context.selected_objects if o.type == 'ARMATURE')
    top = [o for o in bpy.context.selected_objects if o.parent is None]
    holder = bpy.data.objects.new('zerox', None); sc.collection.objects.link(holder)
    for o in top: o.parent = holder
    bpy.context.view_layer.update()
    def bbox():
        pts = [o.matrix_world @ Vector(c) for o in bpy.context.selected_objects if o.type == 'MESH' for c in o.bound_box]
        return min(p.z for p in pts), max(p.z for p in pts)
    z0, z1 = bbox(); holder.scale = (1.8 / (z1 - z0),) * 3
    holder.rotation_euler = (0, 0, r['yaw'] - math.pi / 2)   # face the board's right side; left foot at the nose
    bpy.context.view_layer.update()
    P = arm.pose.bones; mw = arm.matrix_world
    F = (holder.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()   # glTF +Z forward → Blender -Y
    Lf = (holder.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()
    def rot(name, axis, deg, want):   # rotate a bone about a WORLD axis; sign chosen so its tail moves along `want`
        pb = P.get(name)
        if not pb: return
        best = None
        for s in (1, -1):
            M = mw @ pb.matrix; piv = M.translation
            R = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg * s), 4, axis) @ Matrix.Translation(-piv)
            tail = R @ (mw @ pb.tail)
            sc_ = (tail - (mw @ pb.tail)).dot(want)
            if best is None or sc_ > best[0]: best = (sc_, R @ M)
        pb.matrix = mw.inverted() @ best[1]; bpy.context.view_layer.update()
    Z = Vector((0, 0, 1))
    rot('LeftUpLeg', F, 16, Lf); rot('RightUpLeg', F, 16, -Lf)
    rot('LeftUpLeg', Lf, 28, F); rot('RightUpLeg', Lf, 28, F)
    rot('LeftLeg', Lf, 50, -F); rot('RightLeg', Lf, 50, -F)
    rot('LeftFoot', Lf, 22, -Z); rot('RightFoot', Lf, 22, -Z)
    rot('Spine02', Lf, 12, F)
    rot('LeftArm', F, 50, -Z); rot('RightArm', F, 50, -Z)
    rot('LeftForeArm', Z, 25, F); rot('RightForeArm', Z, 25, F)
    rot('Head', Z, 60, Lf)   # look down the board (toward the nose)
    feet = [mw @ P[n].tail for n in ('LeftFoot', 'RightFoot') if P.get(n)]
    fz = min(p.z for p in feet) if feet else bbox()[0]
    holder.location = (r['x'], r['y'], r['z'] - fz + 0.02)
    bpy.context.view_layer.update()
except Exception as e:
    print('[preview] ZEROX import/pose failed:', e)

# camera
cam = bpy.data.cameras.new('c'); cam.lens = 38
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (1.6, -8.2, 7.4)
co.rotation_euler = (Vector((1.55, 2.1, 0.3)) - co.location).to_track_quat('-Z', 'Y').to_euler()
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try: sc.render.engine = eng; break
    except TypeError: continue
if sc.render.engine == 'CYCLES': sc.cycles.samples = 48
sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
try: sc.view_settings.view_transform = 'AgX'
except TypeError: pass
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('[preview] wrote', OUT)

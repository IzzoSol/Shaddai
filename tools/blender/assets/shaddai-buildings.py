# shaddai-buildings.py — the SHADDAI GRID BUILDING LIBRARY: 9 building types assembled from the Modular SciFi MegaKit
# (red trim → emerald) + owner props/billboards, each joined into ONE model with a base-centre pivot, exported per type.
#   blender -b --factory-startup --python tools/blender/assets/shaddai-buildings.py [-- --only office,market]
# Out: .bl-cache/sc/<type>.glb (raw; compress + LOD with gltf-transform), .bl-cache/renders/sc-lineup.png, sc-types.json
# Footprints ride the canon Grid block grid (20-34 m wide × 18-28 m deep, 8-16 m tall; civic 40-70 m). Front = -Y (street).
import bpy, sys, os, math, json, glob
sys.path.insert(0, os.path.abspath('tools/blender/assets'))
from kit import *
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(a[a.index('--only') + 1].split(',')) if '--only' in a else None
OUTD = os.path.abspath('.bl-cache/sc'); os.makedirs(OUTD, exist_ok=True)
def art(pat): return (glob.glob(ART + pat) or [None])[0]
W_ = 'Walls/'; P_ = 'Platforms/'; PR = 'Props/'; CO = 'Columns/'
GLASS, OFFICE, FLAT, BAND, CROWN = W_ + 'WallWindow_Straight.gltf', W_ + 'WallAstra_Straight_Window.gltf', W_ + 'WallAstra_Straight_Flat.gltf', W_ + 'WallBand_Straight.gltf', W_ + 'TopPlastic_Straight.gltf'
FH = 3.2   # floor height (kit walls are 3.0-3.2 m)
_glow = {}
def glow_mat(kind):
    # lit interiors: glass facades read as SOLID buildings (day: dim warm fill; night: windows glow). warm offices, emerald shops
    if kind not in _glow:
        col = {'warm': (1.0, 0.82, 0.55, 1), 'emerald': (0.0, 1.0, 0.61, 1), 'cool': (0.55, 0.75, 1.0, 1)}[kind]
        m = bpy.data.materials.new('interior-' + kind); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.05, 0.05, 0.06, 1); b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = 0.35
        _glow[kind] = m
    return _glow[kind]
def interior(w, d, floors, kinds=('emerald', 'warm', 'warm', 'cool')):
    for f in range(floors):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, f * FH + FH / 2)); c = bpy.context.active_object
        c.scale = (w - 0.9, d - 0.9, FH - 0.35); c.data.materials.append(glow_mat(kinds[f % len(kinds)]))
        for cc in c.users_collection: cc.objects.unlink(c)
        TARGET[0].objects.link(c)

def shell(w, d, floors, ground=GLASS, upper=OFFICE, crown=CROWN, door=True, roof=P_ + 'Platform_Metal2.gltf'):
    """w, d multiples of 4 m. Walls ring each floor; slabs every floor; crown trim; roof deck. Door gap on the front."""
    for f in range(floors):
        z = f * FH; piece = ground if f == 0 else (upper if f % 3 else FLAT)
        for i in range(w // 4):
            x = -w / 2 + 2 + 4 * i
            if not (f == 0 and door and i == (w // 4) // 2): put(SCI + piece, x, -d / 2, z, rot=90)
            put(SCI + piece, x, d / 2, z, rot=90)
        for j in range(d // 4):
            y = -d / 2 + 2 + 4 * j
            put(SCI + piece, -w / 2, y, z, rot=0); put(SCI + piece, w / 2, y, z, rot=0)
    if door: put(SCI + P_ + 'Door_Frame_Square.gltf', -w / 2 + 2 + 4 * ((w // 4) // 2), -d / 2, 0)
    top = floors * FH
    for i in range(w // 4):
        put(SCI + crown, -w / 2 + 2 + 4 * i, -d / 2, top, rot=90); put(SCI + crown, -w / 2 + 2 + 4 * i, d / 2, top, rot=90)
    for j in range(d // 4):
        put(SCI + crown, -w / 2, -d / 2 + 2 + 4 * j, top, rot=0); put(SCI + crown, w / 2, -d / 2 + 2 + 4 * j, top, rot=0)
    for i in range(w // 4):
        for j in range(d // 4):
            put(SCI + roof, -w / 2 + 2 + 4 * i, -d / 2 + 2 + 4 * j, top)
            put(SCI + P_ + 'Platform_CenterPlate.gltf', -w / 2 + 2 + 4 * i, -d / 2 + 2 + 4 * j, 0.05)
    return top

def storefront_s():
    t = shell(16, 12, 2); put(DL + 'Japanese_Sign_16.glb', -8.4, -6.2, 3.4, rot=-45, fit=3.2)
    emissive_plane(art('Gemini_Generated_Image_*'), -2, -6.4, 3.6, 3.4, strength=2.5)
    put(SCI + PR + 'Prop_AccessPoint.gltf', 3, -6.5, 0, rot=180)
    return {'w': 16, 'd': 12, 'h': t, 'collider': True, 'use': 'shop / agent storefront (enterable later)'}
def storefront_l():
    t = shell(24, 16, 3); emissive_plane(art('SHADDAI AI IMAGE*'), 0, -8.5, 4.0, 12, strength=3)
    put(SCI + PR + 'Prop_Light_Wide.gltf', -6, -8.6, 0, rot=180); put(SCI + PR + 'Prop_Light_Wide.gltf', 6, -8.6, 0, rot=180)
    return {'w': 24, 'd': 16, 'h': t, 'collider': True, 'use': 'flagship store / agent HQ front'}
def office():
    t = shell(20, 20, 4); put(DL + 'Japanese_Sign_12.glb', 10.4, -6, 6, rot=90, fit=4)
    return {'w': 20, 'd': 20, 'h': t, 'collider': True, 'use': 'agent offices / co-work'}
def market():
    # open market hall: columns + canopy roof, stalls inside, glitch ad screens
    for i in range(8):
        for j in range(6):
            if i in (0, 7) or j in (0, 5): put(SCI + CO + 'Column_Round.gltf', -14 + 4 * i, -10 + 4 * j, 0, fit=5.0)
    for i in range(7):
        for j in range(5): put(SCI + P_ + 'Platform_DarkPlates.gltf', -12 + 4 * i, -8 + 4 * j, 5.0); put(SCI + P_ + 'Platform_Squares.gltf', -12 + 4 * i, -8 + 4 * j, 0.05)
    for i in range(7): put(SCI + CROWN, -12 + 4 * i, -10, 5.2, rot=90); put(SCI + CROWN, -12 + 4 * i, 10, 5.2, rot=90)
    for k, (x, y) in enumerate([(-8, -3), (-2, -3), (4, -3), (-8, 4), (-2, 4), (4, 4)]):
        put(DL + 'Table_Futuristic.glb', x, y, 0.05); put(SCI + PR + ('Prop_Crate3.gltf' if k % 2 else 'Prop_Crate4.gltf'), x + 1.8, y + 1.2, 0.05, s=0.8)
    emissive_plane(art('GREEN GLITCH*'), 0, -10.3, 2.2, 2.6, strength=2)   # one ad screen (owner: art, not too much)
    return {'w': 28, 'd': 20, 'h': 7.2, 'collider': False, 'use': 'Agora-style market hall (walk-in, stalls)'}
def techlab():
    t = shell(20, 16, 3, upper=FLAT)
    put(SCI + P_ + 'Platform_Stairs_4Wide.gltf', 12, -4, 0, rot=90); put(SCI + P_ + 'Platform_Stairs_4Wide.gltf', 12, 0.1, 2.0, rot=90)
    put(DL + 'FreeSample/FreeSample/SateliteDish.fbx', 4, 3, t, fit=4.0); put(SCI + PR + 'Prop_Fan_Small.gltf', -5, 3, t)
    put(SCI + PR + 'Prop_Computer.gltf', -6, -8.6, 0, rot=180)
    return {'w': 20, 'd': 16, 'h': t, 'collider': True, 'use': 'NEXUS-style lab / workshop'}
def garden():
    for i in range(6):
        for j in range(5): put(SCI + P_ + 'Platform_CenterPlate.gltf', -10 + 4 * i, -8 + 4 * j, 0.05)
    put(DL + 'Floor_Ring.glb', 0, 0, 0.06, s=2.0); put(DL + 'Colony_Planet_Art.glb', 0, 0, 1.6, s=0.6)
    for (x, y) in ((-8, -6), (8, -6), (-8, 6), (8, 6)):
        put(DT + 'Sidewalk_Planter.fbx', x, y, 0.05, s=1.4); put(DL + 'BlockChain_CodeBush_Art.glb', x, y, 0.5, fit=1.4)
    for (x, y, r) in ((-4, -7, 0), (4, -7, 0), (-4, 7, 180), (4, 7, 180)): put(DL + 'Seat.glb', x, y, 0.05, rot=r)
    for (x, y) in ((-11, 0), (11, 0)): put(DL + 'Plant_02_Art.glb', x, y, 0.05, fit=2.4)
    for k in range(6): put(SCI + W_ + 'ShortWall_AccentStrip_Straight.gltf', -10 + 4 * k, 9.8, 0.05, rot=90)
    return {'w': 24, 'd': 20, 'h': 3.0, 'collider': False, 'use': 'pocket park: holo planet ring, code-bush garden, seats (quest spot)'}
def teleport():
    put(SCI + P_ + 'Platform_Round1.gltf', 0, 0, 0.05, s=1.6); put(DL + 'ElevatorTeleport01_Art.glb', 0, 0, 0.3, fit=6.0)
    for r in (0, 90, 180, 270):
        x, y = 6 * math.sin(math.radians(r)), -6 * math.cos(math.radians(r)); put(SCI + P_ + 'Platform_Ramp_4Wide.gltf', x, y, 0.05, rot=r)
    for (x, y) in ((-7, -7), (7, -7), (-7, 7), (7, 7)): put(SCI + PR + 'Prop_Light_Floor.gltf', x, y, 0.05)
    return {'w': 20, 'd': 20, 'h': 6.5, 'collider': False, 'use': 'holo teleport pad → fast travel to ring stations'}
def civic_tower():
    t = shell(16, 16, 12, upper=OFFICE); emissive_plane(art('SHADDAI AI IMAGE*'), 0, -8.6, t - 7, 14, strength=4)
    put(SCI + CO + 'Column_Pipes.gltf', 0, 0, t, fit=10.0)
    return {'w': 16, 'd': 16, 'h': t + 10, 'collider': True, 'use': 'civic tower (6 % of blocks, 40-50 m)'}
def ad_pylon():
    put(SCI + CO + 'Column_Hollow.gltf', 0, 0, 0, fit=18.0)
    for k, col in enumerate(['GREEN', 'BLUE', 'PURPLE']):
        r = k * 120; emissive_plane(art(col + ' GLITCH*'), 1.3 * math.sin(math.radians(r)), -1.3 * math.cos(math.radians(r)), 6 + k * 3.5, 2.4, rot=r, strength=2.5)
    return {'w': 4, 'd': 4, 'h': 18, 'collider': True, 'use': 'street ad pylon (animated glitch screens)'}

TYPES = {'storefront-s': storefront_s, 'storefront-l': storefront_l, 'office': office, 'market': market, 'techlab': techlab,
         'garden': garden, 'teleport': teleport, 'civic-tower': civic_tower, 'ad-pylon': ad_pylon}
meta = {}; lineup = []
x0 = 0.0
for name, fn in TYPES.items():
    if ONLY and name not in ONLY: continue
    col = bpy.data.collections.new('SC_' + name); sc.collection.children.link(col); TARGET[0] = col
    info = fn()
    # join into ONE object (copies share mesh data → make single-user, apply transforms, join)
    objs = [o for o in col.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.data = o.data.copy(); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = 'sc-' + name
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUTD, 'sc-' + name + '.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=True)
    info['tris'] = sum(len(p.vertices) - 2 for p in ob.data.polygons); info['materials'] = len(ob.data.materials)
    meta['sc-' + name] = info; print('BUILT', name, info, flush=True)
    ob.location.x = x0 + info['w'] / 2; x0 += info['w'] + 8; lineup.append(ob)
json.dump(meta, open(os.path.join(OUTD, 'sc-types.json'), 'w'), indent=1)

# lineup render for owner approval (night, 1.8 m citizen at the front)
bpy.ops.mesh.primitive_plane_add(size=1, location=(x0 / 2, 0, -0.02)); gp = bpy.context.active_object; gp.scale = (x0 + 60, 120, 1); gp.data.materials.append(mat('ground', (0.02, 0.025, 0.03, 1)))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=1.8, location=(4, -14, 0.9)); bpy.context.active_object.data.materials.append(mat('citizen', (0.0, 1.0, 0.61, 1), 3))
sc.world = bpy.data.worlds.new('night'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.015, 0.02, 0.035, 1)
sd = bpy.data.lights.new('moon', 'SUN'); sd.energy = 1.4; sd.color = (0.6, 0.7, 1.0); so = bpy.data.objects.new('moon', sd); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
try: sc.render.engine = 'BLENDER_EEVEE'
except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 16
except Exception: pass
sc.view_settings.view_transform = 'AgX'; sc.render.resolution_x, sc.render.resolution_y = 1600, 640
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.lens = 26
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 3.0
half = len(lineup) // 2 + 1
for part, obs in (('a', lineup[:half]), ('b', lineup[half:])):
    xa, xb = obs[0].location.x - 14, obs[-1].location.x + 14; cx = (xa + xb) / 2; span = xb - xa
    cam.location = (cx, -span * 0.95, span * 0.32); cam.rotation_euler = (Vector((cx, 0, 10)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.abspath('.bl-cache/renders/sc-lineup-' + part + '.png'); bpy.ops.render.render(write_still=True)
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.45, 0.55, 0.7, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
sd.energy = 4.0; sd.color = (1, 0.96, 0.9)
for part, obs in (('a', lineup[:half]),):
    xa, xb = obs[0].location.x - 14, obs[-1].location.x + 14; cx = (xa + xb) / 2; span = xb - xa
    cam.location = (cx, -span * 0.95, span * 0.32); cam.rotation_euler = (Vector((cx, 0, 10)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.abspath('.bl-cache/renders/sc-lineup-day.png'); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('.bl-cache/shaddai-buildings.blend'))
print('SC DONE', list(meta))

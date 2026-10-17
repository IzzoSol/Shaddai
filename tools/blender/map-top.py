# Top-down MAP of The Grid in the OPEN Blender, built from the real plan (public/assets/world/grid-city-v4.json): buildings as boxes coloured by district, plazas, parks, avenues, rings.
# Light (one mesh per district, ~1000 boxes), clears the scene it builds on: run on a FRESH/default scene, never on the full city .blend.
#   node tools/blender/bl.cjs tools/blender/map-top.py PLAN=C:/.../grid-city-v4.json OUT=C:/Users/Brittany/eye/world-map-top.png [RES=1600]
import bpy, bmesh, json, math, os
from mathutils import Vector
PLAN = str(bpy.app.driver_namespace.get('PLAN')); OUT = str(bpy.app.driver_namespace.get('OUT')); RES = int(bpy.app.driver_namespace.get('RES', 1600))
plan = json.load(open(PLAN))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
def mat(name, rgb):
    m = bpy.data.materials.new(name); m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1); return m
DIST = {'campus': (0.15, 0.80, 0.90), 'commons': (0.93, 0.76, 0.30), 'plots': (0.20, 0.85, 0.50), 'race': (0.95, 0.35, 0.55)}
MATS = {k: mat('d_' + k, v) for k, v in DIST.items()}; MATS['spire'] = mat('spire', (1.0, 0.9, 0.3)); MATS['park'] = mat('park', (0.25, 0.45, 0.22)); MATS['plaza'] = mat('plaza', (0.75, 0.78, 0.82)); MATS['road'] = mat('road', (0.10, 0.11, 0.13)); MATS['ground'] = mat('ground', (0.05, 0.06, 0.08))
def district(x, y):
    d = math.degrees(math.atan2(x, y)) % 360
    return 'campus' if d < 90 else 'commons' if d < 180 else 'plots' if d < 270 else 'race'
def box(bm, cx, cy, w, d, h, rot_deg):
    a = math.radians(rot_deg); c, s = math.cos(a), math.sin(a); pts = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        lx, ly = sx * w / 2, sy * d / 2; pts.append((cx + lx * c - ly * s, cy + lx * s + ly * c))
    lo = [bm.verts.new((x, y, 0)) for x, y in pts]; hi = [bm.verts.new((x, y, h)) for x, y in pts]
    bm.faces.new(hi); bm.faces.new(lo[::-1])
    for i in range(4): bm.faces.new((lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]))
def make(name, matname, build):
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); bm = bmesh.new(); build(bm); bm.to_mesh(me); bm.free(); me.materials.append(MATS[matname]); return ob
R = float(plan.get('grid_r_m', 1600))
# ground disc + rings
def ground(bm): bmesh.ops.create_circle(bm, cap_ends=True, radius=R + 40, segments=96, matrix=__import__('mathutils').Matrix.Translation((0, 0, -0.5)))
make('ground', 'ground', ground)
def rings(bm):
    for rr in plan.get('rings_m', [576, 992]) + [R]:
        n = 180
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n; w = 6
            p = [(math.sin(a0) * (rr - w), math.cos(a0) * (rr - w)), (math.sin(a0) * (rr + w), math.cos(a0) * (rr + w)), (math.sin(a1) * (rr + w), math.cos(a1) * (rr + w)), (math.sin(a1) * (rr - w), math.cos(a1) * (rr - w))]
            bm.faces.new([bm.verts.new((x, y, 0.2)) for x, y in p])
    for k in range(12):   # 12 avenues every 30 degrees
        a = math.radians(k * 30); c, s = math.sin(a), math.cos(a); w = 7
        p = [(c * 170 - s * -w, s * 170 + c * -w)]
        q = [(c * 170 + s * w, s * 170 * 0 + 0)]
        x0, y0, x1, y1 = c * 170, s * 170, c * R, s * R   # (c,s) are (sin,cos) of the bearing: x = sin*r, y = cos*r
        x0, y0, x1, y1 = math.sin(a) * 170, math.cos(a) * 170, math.sin(a) * R, math.cos(a) * R; nx, ny = math.cos(a) * w, -math.sin(a) * w
        bm.faces.new([bm.verts.new((x0 + nx, y0 + ny, 0.2)), bm.verts.new((x1 + nx, y1 + ny, 0.2)), bm.verts.new((x1 - nx, y1 - ny, 0.2)), bm.verts.new((x0 - nx, y0 - ny, 0.2))])
make('roads', 'road', rings)
def plazas(bm):
    for p in plan.get('plazas', []): box(bm, p['x_m'], p['y_m'], p['w_m'], p['d_m'], 0.6, p.get('rot_deg', 0))
make('plazas', 'plaza', plazas)
def parks(bm):
    for p in plan.get('parks', []): box(bm, p['x_m'], p['y_m'], p['w_m'], p['d_m'], 0.5, p.get('rot_deg', 0))
make('parks', 'park', parks)
buckets = {k: [] for k in DIST}; spires = []
for b in plan['buildings']:
    (spires if b['kind'] == 'spire' else buckets[district(b['x_m'], b['y_m'])]).append(b)
for k, lst in buckets.items():
    make('bld_' + k, k, lambda bm, lst=lst: [box(bm, b['x_m'], b['y_m'], b['w_m'], b['d_m'], b['h_m'], b.get('rot_deg', 0)) for b in lst])
make('spires', 'spire', lambda bm: [box(bm, b['x_m'], b['y_m'], b['w_m'], b['d_m'], b['h_m'], b.get('rot_deg', 0)) for b in spires])
# top-down orthographic camera + workbench render (fast, flat colours)
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = (R + 80) * 2; cam.clip_end = 10000; co = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(co); co.location = (0, 0, 2000); co.rotation_euler = (0, 0, 0); bpy.context.scene.camera = co
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.render.filepath = OUT; sc.render.image_settings.file_format = 'PNG'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'MATERIAL'; sc.display.shading.show_cavity = False; sc.view_settings.view_transform = 'Standard'
sc.world = bpy.data.worlds.new('w') if sc.world is None else sc.world; sc.world.color = (0.02, 0.02, 0.03)
bpy.ops.render.render(write_still=True)
print('rendered', OUT, 'buildings', len(plan['buildings']))

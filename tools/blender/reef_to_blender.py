# tools/blender/reef_to_blender.py - the owner's REEF CITIES into REALM_VIEW (2026-10-23, owner: "we MADE water homes ... boats and harbor ... underwater
# train"). Same placement rules as SHADDAI-WORLD-3D.html bootReef(): Reef A/B at the owner's Blender spots + Z rotations, hub + atrium, four stations
# 150 m out, four sets (home M / shop / dome + dome interior) 66 m out, harbour + harbour house, sub, walkways, elevator, tube station; Reef B twin
# (hub, atrium, sets); a glass bridge A-B; the undersea glass tube along the owner's route to the REEF LINE SHORE station. Additive: collection REEF_20261023.
import bpy, math, os
from mathutils import Vector, Matrix
SC = bpy.data.scenes['REALM_VIEW']; DIR = r'C:/Users/Brittany/Shaddai-3d/public/assets/reef/'; W = 2.0
def coll(n, parent):
    c = bpy.data.collections.get(n) or bpy.data.collections.new(n)
    if c.name not in [x.name for x in parent.children]: parent.children.link(c)
    return c
R = coll('REEF_20261023', SC.collection); LIB = coll('REEF_LIB', bpy.data.collections.get('REEF_20261023'))
for o in list(R.objects): bpy.data.objects.remove(o, do_unlink=True)
lay = bpy.context.view_layer.layer_collection.children['REEF_20261023'].children['REEF_LIB']; lay.exclude = True
def lib(f):
    n = 'RL_' + f
    if n in bpy.data.collections: return bpy.data.collections[n]
    c = bpy.data.collections.new(n); LIB.children.link(c); before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=DIR + f)
    for o in [o for o in bpy.data.objects if o not in before]:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        c.objects.link(o)
    return c
def put(f, hub, yaw, dx, dy, z, rot=0.0, name=None):
    c = math.cos(yaw); s = math.sin(yaw); x = hub[0] + dx * c - dy * s; y = hub[1] + dx * s + dy * c   # turn the layout about the hub by the owner's yaw
    e = bpy.data.objects.new(name or f, None); e.instance_type = 'COLLECTION'; e.instance_collection = lib(f); e.location = (x, y, z); e.rotation_euler = (0, 0, rot + yaw); R.objects.link(e); return e
def sets(hub, yaw):
    for deg in (0, 90, 180, 270):
        a = math.radians(deg); cx, cy = math.sin(a) * 66, math.cos(a) * 66
        for f, off in (('reef-home-M.glb', -22), ('reef-shop.glb', 0), ('reef-dome.glb', 22)):
            dx, dy = cx + math.cos(a) * off, cy - math.sin(a) * off; put(f, hub, yaw, dx, dy, W + 4, a)
            if f == 'reef-dome.glb': put('reef-interior.glb', hub, yaw, dx, dy, W + 4, a)
A = (-1974.1, -3277.2); YA = -0.64; B = (-2714.5, -2774.8); YB = -0.70
put('reef-city-hub.glb', A, YA, 0, 0, W + 4); put('reef-atrium.glb', A, YA, 0, 0, W + 4)
for i, deg in enumerate((0, 90, 180, 270)):
    a = math.radians(deg); put('reef-station.glb', A, YA, math.sin(a) * 150, math.cos(a) * 150, W, i * 0.7)
sets(A, YA)
put('reef-harbor.glb', A, YA, 0, 235, W); put('reef-harbor-house.glb', A, YA, 0, 212, W); put('reef-sub.glb', A, YA, 0, 68, W)
put('reef-walkways.glb', A, YA, 0, 150, W); put('reef-interior.glb', A, YA, -16, 162, W + 4); put('reef-elevator.glb', A, YA, 30, 156, W + 4); put('reef-tube-station.glb', A, YA, 2, 210, W)
put('reef-city-hub.glb', B, YB, 0, 0, W + 4); put('reef-atrium.glb', B, YB, 0, 0, W + 4); sets(B, YB)
# glass bridge A <-> B and the undersea tube line (tube 6 m under the water) to the shore station
def ribbon(name, pts, w, z, rgba):
    import bmesh; bm = bmesh.new(); prev = None
    for i, p in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]; d = Vector((b[0] - a[0], b[1] - a[1], 0)).normalized(); sd = Vector((-d.y, d.x, 0)) * w / 2
        zz = z(p) if callable(z) else z; row = (bm.verts.new((p[0] - sd.x, p[1] - sd.y, zz)), bm.verts.new((p[0] + sd.x, p[1] + sd.y, zz)))
        if prev: bm.faces.new((prev[0], row[0], row[1], prev[1]))
        prev = row
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color = rgba; me.materials.append(m)
    o = bpy.data.objects.new(name, me); R.objects.link(o); return o
def lerp(P, step):
    out = []
    for a, b in zip(P, P[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(n): out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    out.append(P[-1]); return out
ribbon('reef_glass_bridge_AB', lerp([A, B], 10), 8, W + 4.5, (0.75, 0.92, 0.97, 0.6))
start = (A[0] + 22 * math.cos(YA), A[1] + 22 * math.sin(YA)); ROUTE = [start, (-2878, -2470), (-2817, -1938), (-2200, -1811), (-1308, -1308)]
tube = ribbon('reef_undersea_tube', lerp(ROUTE, 18), 7, W - 6, (0.31, 0.89, 1.0, 0.7))
sol = tube.modifiers.new('wall', 'SOLIDIFY'); sol.thickness = 6
put('reef-tube-station.glb', (-1308, -1308), 0, 0, 0, W, 0, 'reef_shore_station')
bpy.ops.wm.save_mainfile(); print('REEF ok', len(R.objects), 'objects;', len(LIB.children), 'library models')

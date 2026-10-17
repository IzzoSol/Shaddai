# SHADDAI Kit 10b - realm TOWN buildings (owner 2026-10-16: "finish each realm ... the buildings ... real usecases").
# Four more kinds per realm in that realm's K10 style, so each realm reads as a city: HOME (buyable with Sparks - P6),
# WORKSHOP (jobs), INN (rest / quests), APARTMENTS (homes stacked). Same contract as K10 (world-interiors-v3: door 3.0 m,
# ground-floor ceiling 4.0 m, front = -Y = three +z, origin = footprint centre on the ground, door_/slot_sign_/hook_interior_ empties).
# Run inside Blender 5.x after k1_tower.py, k6_race.py, k8_realm_stations.py AND k10_realm_buildings.py are exec'd.
# Export: one GLB per realm, assets/kits/shaddai_realm_town_<realm>_v01.glb (the K10 hall/shop/tower GLBs stay untouched).
import bpy, os

TOWN_KINDS = {"home": dict(w=11.0, d=10.0, storeys=2, sh=3.6, roof=3.6),
              "workshop": dict(w=18.0, d=14.0, storeys=1, sh=6.5, roof=4.0),
              "inn": dict(w=18.0, d=14.0, storeys=3, sh=4.0, roof=5.0),
              "apartments": dict(w=14.0, d=14.0, storeys=5, sh=3.6, roof=4.5)}


def build_realm_town(realm):
    KINDS.update(TOWN_KINDS)                     # build_realm_building reads the module-level KINDS table
    coll = bpy.data.collections.get("K10_realm_buildings") or bpy.data.collections.new("K10_realm_buildings")
    out = {}
    for kind in TOWN_KINDS:
        ob, info = build_realm_building(realm, kind)
        out[kind] = (ob, info)
    return coll, out


def export_realm_town(realm, path):
    coll, out = build_realm_town(realm)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    sel = []
    for kind, (ob, _) in out.items():
        ob.hide_set(False); ob.select_set(True); sel.append(ob)
        for ch in ob.children: ch.hide_set(False); ch.select_set(True)
    bpy.context.view_layer.objects.active = sel[0]
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_cameras=False, export_lights=False)
    try: bpy.ops.export_scene.gltf(export_vertex_color="MATERIAL", **kw)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    size = os.path.getsize(path)
    if size < 1024: raise RuntimeError("empty GLB " + path)
    return size, {k: v[1]["height"] for k, v in out.items()}

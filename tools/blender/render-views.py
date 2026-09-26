# render-views.py — EEVEE renders of the atlas world: SHD_VIEW = 'top' | 'atlas' (tilted from the south like the atlas) | 'city' | x,y,z,tx,ty,tz
import bpy, math
from mathutils import Vector
NS = bpy.app.driver_namespace
sc = bpy.context.scene
cam = bpy.data.objects.get('ATLAS Cam')
if not cam:
    cd = bpy.data.cameras.new('ATLAS Cam'); cam = bpy.data.objects.new('ATLAS Cam', cd); sc.collection.objects.link(cam)
cam.data.clip_start = 1; cam.data.clip_end = 40000; sc.camera = cam
v = NS.get('SHD_VIEW', 'top')
def look(pos, tgt, lens=35):
    cam.data.type = 'PERSP'; cam.data.lens = lens; cam.location = pos
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
if v == 'top':
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(NS.get('SHD_ORTHO', 6200)); cam.location = (0, 0, 9000); cam.rotation_euler = (0, 0, 0)
elif v == 'atlas':
    k = float(NS.get('SHD_ORTHO', 6200)) / 6200; look((0, -5200 * k, 4300 * k), (0, 150 * k, 0), 30)
elif v == 'city':
    look((0, -260, 170), (0, 0, 0), 30)
else:
    p = [float(x) for x in v.split(',')]; look(p[:3], p[3:], 35)
try: sc.render.engine = 'BLENDER_EEVEE'
except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = (1600, 1100) if v != 'top' else (1400, 1400)
sc.render.filepath = NS['SHD_OUT']
bpy.ops.render.render(write_still=True)
print('rendered', v, '→', sc.render.filepath)

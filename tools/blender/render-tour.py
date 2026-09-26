# render-tour.py — HEADLESS: build the v4 world and render a picture tour (no Blender window needed).
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python tools/blender/render-tour.py -- <repo> [quick]
# Output: <repo>/.bl-cache/renders/tour-*.png
import bpy, sys, os, math, runpy
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
REPO = argv[0] if argv else os.getcwd(); QUICK = 'quick' in argv
OUT = os.path.join(REPO, '.bl-cache', 'renders'); os.makedirs(OUT, exist_ok=True)
NS = bpy.app.driver_namespace
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
NS['SHD_OUT_DIR'] = os.path.join(REPO, '.bl-cache', 'terrain-tmp'); NS['SHD_N'] = 2048; NS['SHD_PREVIEW_STEP'] = 4   # terrain preview only; game files untouched
NS['SHD_REPO'] = REPO; NS['SHD_CACHE'] = os.path.join(REPO, '.bl-cache')
runpy.run_path(os.path.join(REPO, 'tools/blender/terrain-v4.py'), run_name='__main__')
_g = runpy.run_path(os.path.join(REPO, 'tools/blender/place-world-v4.py'), run_name='__main__')
runpy.run_path(os.path.join(REPO, 'tools/blender/realm-clusters-v4.py'), init_globals={'place': _g['place']}, run_name='__main__')   # realm districts

sc = bpy.context.scene
try: sc.render.engine = 'BLENDER_EEVEE'
except Exception: sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = (1280, 720) if not QUICK else (960, 540)
w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (0.55, 0.72, 0.95, 1); bg.inputs['Strength'].default_value = 0.9
sun = bpy.data.objects.get('ATLAS Sun')
if sun: sun.data.energy = 4.0; sun.rotation_euler = (math.radians(48), 0, math.radians(35))
cd = bpy.data.cameras.new('Tour'); cam = bpy.data.objects.new('Tour', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.clip_start = 1; cd.clip_end = 60000
def at(c, r): a = math.radians(c); return (r * math.sin(a), r * math.cos(a))
H = NS['SHD_H']
ONLY = next((x.split('=',1)[1].split(',') for x in argv if x.startswith('only=')), None)
def shot(name, pos, tgt, lens=28):
    if ONLY and not any(name.startswith(o) for o in ONLY): return
    cd.type = 'PERSP'; cd.lens = lens; cam.location = pos
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, 'tour-%s.png' % name); bpy.ops.render.render(write_still=True); print('TOUR', name)
def realm_view(name, c, r_frac, dist=900, height=380, lens=26):
    RIM = NS['SHD_TERRAIN']['rim_m']; tx, ty = at(c, RIM * r_frac); cx, cy = at(c, RIM * r_frac - dist)
    shot(name, (cx, cy, H(tx, ty) + height), (tx, ty, H(tx, ty) + 20), lens)

shot('01-overview', (0, -9800, 7600), (0, 300, 0), 24)
if not ONLY:
  cd.type = 'ORTHO'; cd.ortho_scale = 10400; cam.location = (0, 0, 12000); cam.rotation_euler = (0, 0, 0)
  sc.render.filepath = os.path.join(OUT, 'tour-02-top.png'); bpy.ops.render.render(write_still=True); print('TOUR top')
shot('03-grid-city', (0, -2300, 900), (0, 0, 0), 24)
realm_view('04-emberfall', 64, 0.74, 1300, 520)
realm_view('05-deep-void', 0, 0.66, 1000, 380)
realm_view('06-sand-sea', 28, 0.68, 1000, 360)
realm_view('07-suburbs-quill', 102, 0.74, 1300, 420)
realm_view('08-meadowfields', 140, 0.76, 1200, 380)
realm_view('09-colosseum', 180, 0.72, 700, 260)
realm_view('10-crystal-sea', 224, 0.70, 1300, 420)
realm_view('11-darkforest', 292, 0.80, 1100, 400)
realm_view('12-arctic-vault', 334, 0.76, 1300, 520)
print('TOUR DONE →', OUT)

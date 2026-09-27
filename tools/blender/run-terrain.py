# headless: blender -b --factory-startup --python tools/blender/run-terrain.py -- <repo>   → regenerates public/assets/terrain/*
import bpy, sys, os, runpy
argv = sys.argv[sys.argv.index('--') + 1:]; REPO = argv[0]
NS = bpy.app.driver_namespace; NS['SHD_OUT_DIR'] = os.path.join(REPO, 'public/assets/terrain'); NS['SHD_N'] = 2048; NS['SHD_PREVIEW_STEP'] = 8
runpy.run_path(os.path.join(REPO, 'tools/blender/terrain-v4.py'), run_name='__main__')
print('TERRAIN', NS['SHD_TERRAIN'].get('features', {}).keys())

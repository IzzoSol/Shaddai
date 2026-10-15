# render-top.py — orthographic top-down render of the whole map (Workbench, fast) → SHD_OUT png
import bpy, math
sc = bpy.context.scene
cam = bpy.data.objects.get('SHD TopCam')
if not cam:
    cd = bpy.data.cameras.new('SHD TopCam'); cam = bpy.data.objects.new('SHD TopCam', cd); sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'
half = bpy.app.driver_namespace.get('SHD_HALF_M', 700)
cam.data.ortho_scale = half * 2.1; cam.data.clip_end = 20000
cam.location = (0, 0, 3000); cam.rotation_euler = (0, 0, 0)
sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'MATERIAL'
sc.render.resolution_x = 1400; sc.render.resolution_y = 1400; sc.render.resolution_percentage = 100
sc.render.filepath = bpy.app.driver_namespace['SHD_OUT']
bpy.ops.render.render(write_still=True)
print('rendered', sc.render.filepath)

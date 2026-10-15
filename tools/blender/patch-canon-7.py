# One-shot patch: build_canon.py ← step 7 (SHADDAI City v3: tools/blender/canon/city_v3.py), export + approval renders.
import sys
p = 'tools/blender/canon/build_canon.py'
s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    if s.count(a) != 1: sys.exit('ANCHOR x%d %r' % (s.count(a), a[:70]))
    s = s.replace(a, b)

rep("# ── 16 DEBUG: atlas image empty", """# ═════════ STEP 7: SHADDAI CITY v3 — housing / campus / perch / track / commons / plots / markers / docs (city_v3.py) ═════════
if STEP >= 7:
    exec(open(os.path.join(REPO, 'tools/blender/canon/city_v3.py'), encoding='utf-8').read())

# ── 16 DEBUG: atlas image empty""")
rep("    EXP = ['01_Grid_Streets', '02_Grid_Blocks', '06_Meadow_Quill', '07_Void', '08_Emberfall', '09_Suburbs', '15_Agents']",
    "    EXP = ['01_Grid_Streets', '02_Grid_Blocks', '06_Meadow_Quill', '07_Void', '08_Emberfall', '09_Suburbs', '15_Agents']\n"
    "    if STEP >= 7: EXP += ['01_HOUSING', '02_ACADEMY_FORGE', '03_PERCH', '04_TRACK', '05_PLOTS', '06_COMMONS']   # sc-* proxies stay Blender-only (game: grid-commons-v4.json)")
rep("    keep = [o for n in EXP for o in bpy.data.collections[n].objects if o.type == 'MESH']",
    "    keep = [o for n in EXP for o in bpy.data.collections[n].objects if o.type == 'MESH' and not o.name.startswith('sc-')]")
rep("print('CANON DONE')", """    if STEP >= 7:
        shoot('v3-top-day', ortho=3500, res=(1600, 1600))
        bg.inputs['Color'].default_value = (0.004, 0.006, 0.012, 1); bg.inputs['Strength'].default_value = 1.0; ld.energy = 0.08
        shoot('v3-top-night', ortho=3500, res=(1600, 1600))
        sc.camera = bpy.data.objects['CAM_GATE']; sc.render.resolution_x, sc.render.resolution_y = 1280, 720
        for v in sc.view_layers: v.use = (v.name == 'MAIN')
        sc.render.filepath = os.path.join(OUT, 'canon-s7-v3-cam-gate-night.png'); bpy.ops.render.render(write_still=True); sc.camera = cam
        bg.inputs['Color'].default_value = (0.55, 0.72, 0.95, 1); bg.inputs['Strength'].default_value = 0.9; ld.energy = 4.0
        pz0 = V3_SHOTS['plaza']; shoot('v3-campus-oblique', pos=(pz0[0] - 260, pz0[1] - 170, GZ + 170), tgt=(pz0[0] + 20, pz0[1] + 10, GZ + 8), lens=28)
        pc0 = V3_SHOTS['perch']; shoot('v3-perch', pos=(pc0[0] - 150, pc0[1] - 170, GZ + 60), tgt=(pc0[0], pc0[1], GZ + 55), lens=24)
        cm0 = V3_SHOTS['commons']; shoot('v3-commons-oblique', pos=(cm0[0] - 240, cm0[1] + 230, GZ + 150), tgt=(cm0[0] + 30, cm0[1] - 30, GZ + 5), lens=28)
        shoot('v3-eye-commons-plaza', pos=(cm0[0] + 70, cm0[1] + 30, GZ + 1.6), tgt=(cm0[0], cm0[1], GZ + 25), lens=20)
        gt0 = V3_SHOTS['gate']; shoot('v3-race-quarter', pos=(gt0[0] - 260, gt0[1] - 200, GZ + 140), tgt=(gt0[0] - 60, gt0[1] - 60, GZ + 5), lens=28)
        do0 = V3_SHOTS['deed']; shoot('v3-plots-deed', pos=(do0[0] - 200, do0[1] - 300, GZ + 180), tgt=(do0[0] - 150, do0[1] - 80, GZ), lens=28)
print('CANON DONE')""")
open(p, 'w', encoding='utf-8').write(s)
print('patched')

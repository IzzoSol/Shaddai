# SHADDAI Kit 27 - RACE HQ (owner 2026-10-16: "a building for the one on the ground and a shop center in it to buy a car, later car upgrades ...
# that could be the starting point"). Run inside Blender 5.x after k1_tower.py is exec'd (MB, mat_body, mat_emit, PAL, ccw).
# Frame: metres, origin = ground centre, ENTRANCE faces +X (glTF +X; the game turns +X toward the pit straight). Race neon = cyan + magenta
# (world-race-track.js NEON deck), SHADDAI gold trims.
#   race_hq_shell   octagon podium, glass showroom drum (glass = own slot), halo roof with neon edge, entrance canopy, control tower + cab
#   race_hq_floor   showroom floor, 4 car turntables, shop counter, parts wall
# Hooks: hook_counter (shop E prompt), hook_plinth_0..3 (car display spots, code places hover cars), hook_door (outside the door), slot_sign (tower sign).
import bpy, math

HQ = dict(R=30.0, podium=0.45, drum_r=24.0, drum_h=8.0, roof_z=9.0, roof_r=33.0, tower_h=42.0, plinths=4, plinth_r=13.0)
MAGENTA = (1.0, 0.25, 0.64)


def octo(r, n=8, rot=math.pi / 8):
    return [(r * math.cos(rot + 2 * math.pi * k / n), r * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)]


def ring(m, r0, r1, z0, z1, n, mat=0, col="graphite", a0=0.0, a1=2 * math.pi):
    """Annular sector band between radii r0..r1 (top + both walls + bottom)."""
    for k in range(n):
        t0 = a0 + (a1 - a0) * k / n; t1 = a0 + (a1 - a0) * (k + 1) / n
        p = lambda r, t, z: (r * math.cos(t), r * math.sin(t), z)
        m.quad([p(r0, t0, z1), p(r1, t0, z1), p(r1, t1, z1), p(r0, t1, z1)], mat, col)
        m.quad([p(r0, t1, z0), p(r1, t1, z0), p(r1, t0, z0), p(r0, t0, z0)], mat, col)
        m.quad([p(r1, t0, z0), p(r1, t1, z0), p(r1, t1, z1), p(r1, t0, z1)], mat, col)
        m.quad([p(r0, t1, z0), p(r0, t0, z0), p(r0, t0, z1), p(r0, t1, z1)], mat, col)


def mat_glass():
    m = bpy.data.materials.get("hq_glass")
    if m: return m
    m = bpy.data.materials.new("hq_glass"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.55, 0.82, 0.95, 1); b.inputs["Roughness"].default_value = 0.05
    b.inputs["Metallic"].default_value = 0.1; b.inputs["Alpha"].default_value = 0.32
    try: m.surface_render_method = "BLENDED"
    except Exception: m.blend_method = "BLEND"
    return m


def build_race_hq(**over):
    P = dict(HQ); P.update(over)
    coll = bpy.data.collections.get("K27_shaddai_race_hq") or bpy.data.collections.new("K27_shaddai_race_hq")
    if coll.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(coll)
    for o in list(coll.objects): bpy.data.objects.remove(o, do_unlink=True)
    root = bpy.data.objects.new("shaddai_race_hq", None); coll.objects.link(root)
    body = mat_body(); em_c = mat_emit("cyan", PAL["cyan"]); em_m = mat_emit("magenta", MAGENTA, 7); em_y = mat_emit("gold", PAL["gold"], 10); glass = mat_glass()
    gold = (0.66, 0.53, 0.17); R, DR, DH, RZ, RR = P["R"], P["drum_r"], P["drum_h"], P["roof_z"], P["roof_r"]; pz = P["podium"]
    DOOR = math.radians(26)   # door opening half-angle in the drum, centred on +X

    # ---------------- SHELL
    m = MB()
    m.prism(ccw(octo(R)), -8.0, pz, 0, "obsidian", bottom=True)                                     # podium (skirt runs 8 m down: sits on sloped ground)
    m.prism(ccw(octo(R + 0.08)), pz - 0.12, pz, 1, bottom=False, top=False)                        # cyan podium edge
    # glass drum (slot 3) with a door gap; graphite mullions every 15 deg; sill + head rings
    n = 48
    for k in range(n):
        t0 = 2 * math.pi * k / n; t1 = 2 * math.pi * (k + 1) / n; tm = (t0 + t1) / 2
        if abs(math.atan2(math.sin(tm), math.cos(tm))) < DOOR: continue
        a = (DR * math.cos(t0), DR * math.sin(t0)); b = (DR * math.cos(t1), DR * math.sin(t1))
        m.quad([(a[0], a[1], pz + 0.4), (b[0], b[1], pz + 0.4), (b[0], b[1], RZ), (a[0], a[1], RZ)], 3, "stone")
        m.quad([(b[0], b[1], pz + 0.4), (a[0], a[1], pz + 0.4), (a[0], a[1], RZ), (b[0], b[1], RZ)], 3, "stone")
    for k in range(24):
        t = 2 * math.pi * k / 24
        if abs(math.atan2(math.sin(t), math.cos(t))) < DOOR - 0.02: continue
        c = (DR * math.cos(t), DR * math.sin(t))
        m.box(c[0] - 0.18, c[1] - 0.18, pz, c[0] + 0.18, c[1] + 0.18, RZ, col="graphite")
    ring(m, DR - 0.3, DR + 0.3, pz, pz + 0.4, 48, col="graphite", a0=DOOR, a1=2 * math.pi - DOOR)  # sill (open at the door)
    ring(m, DR - 0.3, DR + 0.3, RZ - 0.5, RZ, 48, col="graphite")                                    # head ring
    for side in (-1, 1):                                                                              # door jambs (gold)
        t = side * DOOR; c = (DR * math.cos(t), DR * math.sin(t))
        m.box(c[0] - 0.35, c[1] - 0.35, pz, c[0] + 0.35, c[1] + 0.35, RZ, col=gold)
    # HALO ROOF: thick disc ring + inner skylight ring, neon edge (cyan top lip, magenta underside strip)
    ring(m, 6.0, RR, RZ, RZ + 1.2, 64, col="graphite")
    ring(m, RR, RR + 0.25, RZ + 0.25, RZ + 0.95, 64, mat=1)                                          # cyan edge band
    ring(m, RR - 1.2, RR - 0.9, RZ - 0.06, RZ, 64, mat=2)                                            # magenta underside strip
    ring(m, 5.6, 6.0, RZ, RZ + 1.6, 32, col=gold)                                                     # skylight collar
    for k in range(8):                                                                                # roof fins (radial, race chevron rhythm)
        t = 2 * math.pi * k / 8 + math.pi / 8
        for r in (12.0, 20.0, 28.0):
            c = (r * math.cos(t), r * math.sin(t))
            m.box(c[0] - 0.25, c[1] - 0.25, RZ + 1.2, c[0] + 0.25, c[1] + 0.25, RZ + 1.2 + (2.2 if r < 25 else 1.2), col="obsidian")
    # ENTRANCE CANOPY (+X): cantilevered blade with gold soffit and emerald-less race glow
    m.box(DR - 1, -9, RZ - 2.6, DR + 11, 9, RZ - 2.0, col="graphite")
    m.box(DR - 1, -8.6, RZ - 2.7, DR + 10.6, 8.6, RZ - 2.6, col=gold)
    m.box(DR + 10.9, -9, RZ - 2.5, DR + 11.05, 9, RZ - 2.1, mat=1)
    for sy in (-1, 1): m.box(DR + 9.6, sy * 8.0 - 0.3, pz, DR + 10.2, sy * 8.0 + 0.3, RZ - 2.6, col="graphite")
    # entrance ramp (podium -> ground) + magenta threshold
    m.prism(ccw([(R - 0.2, -6), (R + 6.0, -6), (R + 6.0, 6), (R - 0.2, 6)]), -3.0, pz, 0, "graphite", bottom=False)   # entrance landing
    m.box(DR + 0.2, -5, pz, DR + 0.5, 5, pz + 0.03, mat=2, bottom=False)
    # CONTROL TOWER (-X, behind the drum): tapered blade, race-control cab, vertical neon spines
    TH = P["tower_h"]; tx = -DR - 2
    m.prism(ccw([(tx - 7, -5), (tx + 3, -4), (tx + 3, 4), (tx - 7, 5)]), 0, TH - 8, 0, "graphite", bottom=False)
    m.prism(ccw([(tx - 9, -8), (tx + 6, -8), (tx + 6, 8), (tx - 9, 8)]), TH - 8, TH - 7.6, 0, "obsidian", bottom=True)   # cab floor
    m.prism(ccw([(tx - 8.6, -7.6), (tx + 5.6, -7.6), (tx + 5.6, 7.6), (tx - 8.6, 7.6)]), TH - 7.6, TH - 3, 3, "stone")   # cab glass
    m.prism(ccw([(tx - 9.4, -8.4), (tx + 6.6, -8.4), (tx + 6.6, 8.4), (tx - 9.4, 8.4)]), TH - 3, TH - 1.8, 0, "graphite", bottom=True)  # cab roof
    m.box(tx + 6.6, -8.4, TH - 2.6, tx + 6.75, 8.4, TH - 2.2, mat=1)
    m.box(tx - 9.4, -8.4, TH - 2.6, tx - 9.55, 8.4, TH - 2.2, mat=2)
    for sy in (-1, 1): m.box(tx + 3.0, sy * 3.2 - 0.12, 2, tx + 3.1, sy * 3.2 + 0.12, TH - 8.4, mat=1 if sy > 0 else 2)
    m.box(tx - 1.0, -0.6, TH - 1.8, tx - 0.4, 0.6, TH + 9, col="graphite")                           # antenna mast
    m.box(tx - 1.1, -0.7, TH + 9, tx - 0.3, 0.7, TH + 9.6, mat=2)
    shell = m.finish("race_hq_shell", [body, em_c, em_m, glass], coll)

    # ---------------- FLOOR: showroom deck, turntables, counter, parts wall
    m = MB()
    m.prism(ccw(octo(DR - 0.3, n=24, rot=0)), pz, pz + 0.05, 0, "obsidian", bottom=False)
    for k in range(6): ring(m, 4.0 + k * 3.4, 4.12 + k * 3.4, pz + 0.05, pz + 0.07, 48, mat=1 if k % 2 else 2)   # floor light rings
    np_, PR = P["plinths"], P["plinth_r"]
    plinths = []
    for k in range(np_):
        t = math.pi + (k - (np_ - 1) / 2) * math.radians(42) if np_ > 1 else math.pi   # arc facing the door (behind the counter)
        t = math.radians(-135 + 90 * k)                                                    # four quadrants, door axis kept clear
        c = (PR * math.cos(t), PR * math.sin(t)); plinths.append((c, t))
        m.prism(ccw([(c[0] + x, c[1] + y) for x, y in octo(3.6, 16, 0)]), pz, pz + 0.5, 0, "graphite", bottom=False)
        ring_pts = 32
        for j in range(ring_pts):
            a0 = 2 * math.pi * j / ring_pts; a1 = 2 * math.pi * (j + 1) / ring_pts
            p0 = (c[0] + 3.62 * math.cos(a0), c[1] + 3.62 * math.sin(a0)); p1 = (c[0] + 3.62 * math.cos(a1), c[1] + 3.62 * math.sin(a1))
            m.quad([(p0[0], p0[1], pz + 0.32), (p1[0], p1[1], pz + 0.32), (p1[0], p1[1], pz + 0.44), (p0[0], p0[1], pz + 0.44)], 1, "stone")
    # SHOP COUNTER: curved desk in the centre-back facing the door (+X), gold top, magenta kick strip
    ring(m, 5.0, 6.2, pz, pz + 1.05, 16, col="graphite", a0=math.radians(130), a1=math.radians(230))
    ring(m, 4.9, 6.3, pz + 1.05, pz + 1.15, 16, col=gold, a0=math.radians(130), a1=math.radians(230))
    ring(m, 6.2, 6.25, pz + 0.05, pz + 0.2, 16, mat=2, a0=math.radians(130), a1=math.radians(230))
    # holo column over the counter (car configurator), and a PARTS WALL on the back of the drum (upgrades, later)
    m.prism(ccw([(x, y) for x, y in octo(0.9, 12, 0)]), pz, RZ - 0.6, 1, bottom=False)
    for k in range(5):
        t = math.radians(160 + k * 10)
        c = (DR - 1.2, 0)
        cx, cy = (DR - 1.0) * math.cos(t), (DR - 1.0) * math.sin(t)
        m.box(cx - 0.4, cy - 1.6, pz + 0.8, cx + 0.4, cy + 1.6, pz + 5.8, col="graphite")
        for row in range(4): m.box(cx - 0.45, cy - 1.4, pz + 1.4 + row * 1.2, cx + 0.45, cy + 1.4, pz + 1.5 + row * 1.2, mat=1 if row % 2 else 2)
    floor = m.finish("race_hq_floor", [body, em_c, em_m], coll)

    # ---------------- BEACON (TURTLE 2026-10-16: "a rotating, light-emitting spire" so the HQ reads as the hub from the sky ring): rises out of
    # the skylight, gold cap, cyan + magenta halo rings; separate object so the game can spin it.
    m = MB(); bz = RZ + 1.6
    m.prism(ccw(octo(1.6, 8, 0)), bz - 3, bz + 14, 0, "graphite", bottom=False)
    for k, z in enumerate((bz + 4, bz + 8, bz + 12)):
        ring(m, 2.2 + k * 0.4, 3.0 + k * 0.4, z, z + 0.35, 24, mat=1 if k % 2 == 0 else 2)
        for j in range(3):                                                                   # ring spokes
            t = 2 * math.pi * j / 3 + k; m.box(min(0, 3 * math.cos(t)) - 0.08, min(0, 3 * math.sin(t)) - 0.08, z + 0.1, max(0, 3 * math.cos(t)) + 0.08, max(0, 3 * math.sin(t)) + 0.08, z + 0.25, col="graphite")
    m.prism(ccw(octo(1.0, 8, 0)), bz + 14, bz + 18.5, 0, gold)
    m.prism(ccw(octo(0.35, 8, 0)), bz + 18.5, bz + 21, 2, bottom=False)
    beacon = m.finish("race_hq_beacon", [body, em_c, em_m], coll)
    for o in (shell, floor, beacon): o.parent = root
    def hook(name, loc):
        e = bpy.data.objects.new(name, None); coll.objects.link(e); e.parent = root; e.location = loc; return e
    hook("hook_counter", (4.0, 0.0, pz))
    hook("hook_door", (R + 6.0, 0.0, 0.0))
    for k, (c, t) in enumerate(plinths): hook(f"hook_plinth_{k}", (c[0], c[1], pz + 0.5))
    hook("slot_sign", (tx + 6.8, 0.0, TH - 12))
    return root, coll, {"shell": shell, "floor": floor, "beacon": beacon}, P

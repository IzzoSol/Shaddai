# realms_v1.py — SHADDAI CANON step 8: the 6 pending frontier realm builds (owner's canon order 7-12, renumbered here
# as one canon STEP so a single `step=8` run gets everything): Sand adobe/print cluster at Desert Terminal, Darkforest
# gothic bio-tech hex pads + plank bridges + pines, Crystal harbour + pier + glass-tube segment, Arctic shelf city on
# cloud-stair walkways + 3 domes, Colosseum scale on the south spoke, and a handful of dragon lairs.
# exec()'d by build_canon.py at STEP >= 8, so it shares its globals exactly like city_v3.py does at STEP >= 7:
# MeshBuf, mat, MAT, hexrgb, COLL, LOG, text, at, H, bearing, GZ, GRID_R, RING_R, WL, LAY, T, FEAT, C, rng, REPO, np, math, bpy, json, os.
#
# Owner rule: FUTURISTIC / tech-fusion only, no plain houses/barns/roads — Darkforest is the one realm that stays
# gothic (gothic BIO-TECH, not medieval). Every new mesh sits on H() (real terrain height) or WL (water level for the
# Crystal Sea harbour), and stays clear of the Grid (r <= GRID_R + 30) and the gold ring deck (RING_R +/- 40 m).
import bpy, math, json, os

NAMES8 = ['30_SAND', '31_DARKFOREST', '32_CRYSTAL', '33_ARCTIC', '34_COLOSSEUM', '35_LAIRS']
for _n in NAMES8:
    if _n not in C:
        _c = bpy.data.collections.new(_n); bpy.context.scene.collection.children.link(_c); C[_n] = _c


def stn(id_):
    return next(s for s in LAY['stations'] if s['id'] == id_)


# ── realm palette (tech-fusion; Darkforest stays gothic-biotech, not medieval) ──
MR = {
    'sandframe': mat('r-sand-frame', hexrgb('#8A6E4E'), 0, 0.5, 0.7),
    'sandglass': mat('r-sandglass', hexrgb('#E8C9A0'), 0.6, 0.2, 0.3, 0.55),
    'sandglow': mat('r-sand-glow', hexrgb('#FFB25C'), 4.0),
    'gothicbio': mat('r-gothic-biotech', (0.05, 0.06, 0.05), 0, 0.4, 0.3),
    'bioveins': mat('r-bio-veins', hexrgb('#7CFF6E'), 3.2),
    'pine': mat('r-gothic-pine', (0.03, 0.05, 0.035), 0, 0.9),
    'plank': mat('r-plank-biotech', (0.08, 0.06, 0.05), 0, 0.85),
    'crystalframe': mat('r-crystal-frame', (0.08, 0.09, 0.11), 0, 0.3, 0.7),
    'crystal': mat('r-crystal-glass', hexrgb('#8FE3FF'), 0.4, 0.05, 0.15, 0.6),
    'harbourglow': mat('r-harbour-glow', hexrgb('#3DE0FF'), 3.5),
    'tube': mat('r-glass-tube', hexrgb('#BFEFFF'), 0.2, 0.05, 0.2, 0.35),
    'shelf': mat('r-arctic-shelf', (0.86, 0.9, 0.94), 0, 0.35, 0.1),
    'dome': mat('r-arctic-dome', hexrgb('#CFF4FF'), 0.3, 0.05, 0.25, 0.4),
    'cloudstair': mat('r-cloud-stair', (0.92, 0.94, 0.98), 0.2, 0.4, 0.2),
    'arena': mat('r-arena-stone', (0.14, 0.13, 0.15), 0, 0.5, 0.4),
    'arenaglow': mat('r-arena-glow', hexrgb('#FF3D6E'), 4.5),
    'lair': mat('r-lair-rock', (0.08, 0.07, 0.08), 0, 0.9),
    'laireye': mat('r-lair-glow', hexrgb('#FF7A1A'), 5.0),
}


def htube(buf, p0, p1, r, m, seg=16, capped=False):
    """horizontal (or any-axis) open tube from p0 to p1 -- built by hand on buf.bm, same primitive style as MeshBuf
    (the step-4 hovering tetrahedron already reaches into vb.bm directly for shapes MeshBuf has no method for)."""
    mi = buf.mi(m)
    x0, y0, z0 = p0; x1, y1, z1 = p1
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
    L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    ux, uy, uz = dx / L, dy / L, dz / L
    ref = (0.0, 0.0, 1.0) if abs(uz) < 0.9 else (1.0, 0.0, 0.0)
    e1x = uy * ref[2] - uz * ref[1]; e1y = uz * ref[0] - ux * ref[2]; e1z = ux * ref[1] - uy * ref[0]
    el = math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z) or 1.0
    e1x, e1y, e1z = e1x / el, e1y / el, e1z / el
    e2x = uy * e1z - uz * e1y; e2y = uz * e1x - ux * e1z; e2z = ux * e1y - uy * e1x
    ring0, ring1 = [], []
    for k in range(seg):
        a = k / seg * 2 * math.pi; ca, sa = math.cos(a) * r, math.sin(a) * r
        ox, oy, oz = e1x * ca + e2x * sa, e1y * ca + e2y * sa, e1z * ca + e2z * sa
        ring0.append(buf.bm.verts.new((x0 + ox, y0 + oy, z0 + oz)))
        ring1.append(buf.bm.verts.new((x1 + ox, y1 + oy, z1 + oz)))
    for k in range(seg):
        f = buf.bm.faces.new((ring0[k], ring0[(k + 1) % seg], ring1[(k + 1) % seg], ring1[k])); f.material_index = mi
    if capped:
        f = buf.bm.faces.new(list(reversed(ring0))); f.material_index = mi
        f = buf.bm.faces.new(ring1); f.material_index = mi


# ═════════ 30_SAND — 3D-printed sand-glass habitat cluster at the Desert Terminal ═════════
def build_sand():
    c = stn('desert-terminal')['bearing']   # 31.0 deg, sector 'desert' 14-45 deg (world-clusters-v4 realm-clusters.json)
    buf = MeshBuf(); positions = []
    pts = [(*at(c, r), H(*at(c, r)) + 0.15) for r in np.linspace(RING_R + 45, RING_R + 260, 40)]
    pts = [p for p in pts if p[2] > WL + 0.2]
    if len(pts) > 2:
        buf.ribbon(pts, 6, MAT['walk']); buf.ribbon([(x, y, z + 0.05) for x, y, z in pts], 4, MAT['asphalt'])
    for _ in range(7):
        a = c + rng.uniform(-12, 12); r = RING_R + rng.uniform(160, 420)
        x, y = at(a, r)
        if math.hypot(x, y) <= GRID_R + 30: continue
        z = H(x, y)
        if z < WL + 0.3: continue
        positions.append((x, y, z))
    for x, y, z in positions:
        base_r = rng.uniform(7, 11); height = rng.uniform(9, 16); rings = 5
        rr, zc = base_r, z
        for ri in range(rings):
            rr2 = rr * 0.86
            buf.cyl(x, y, zc, rr, height / rings, MR['sandframe'] if ri % 2 == 0 else MR['sandglass'], seg=20, r2=rr2)
            zc += height / rings; rr = rr2
        buf.cyl(x, y, zc, rr * 1.05, height * 0.35, MR['sandglass'], seg=20, r2=0.2)   # print-cap dome, tapers to a point
        buf.cyl(x, y, zc - 0.2, rr * 1.1, 0.3, MR['sandglow'], seg=20)                 # emissive collar (print-seam glow)
        COLL['circle'].append({'x': round(x, 2), 'y': round(y, 2), 'r': round(base_r, 2), 'top': round(z + 0.4, 2), 'kind': 'sand-habitat-base'})
    if len(positions) >= 2:                                                            # gantry arm between the two nearest pods (print-works signature)
        x0, y0, z0 = positions[0]; x1, y1, z1 = positions[1]
        midz = max(z0, z1) + 14
        buf.box((x0 + x1) / 2, (y0 + y1) / 2, midz, math.hypot(x1 - x0, y1 - y0) + 4, 1.2, 1.2, math.atan2(y1 - y0, x1 - x0), MR['sandframe'])
    if positions:
        buf.to_object('SAND_PrintWorks_HabitatCluster', C['30_SAND'])
        tx, ty = at(c, RING_R + 150)
        text('DESERT TERMINAL — PRINT WORKS', (tx, ty - 20, H(tx, ty) + 16), 3, math.radians(-c), C['30_SAND'], MAT['plateText'])
    return len(positions)


# ═════════ 31_DARKFOREST — gothic bio-tech hex pads + plank bridges + pines ═════════
def build_darkforest():
    c = stn('darkvault')['bearing']   # 299.1 deg, sector 'darkforest' 262-318 deg
    buf = MeshBuf(); pads = []
    for _ in range(8):
        a = c + rng.uniform(-14, 14); r = RING_R + rng.uniform(150, 600)
        x, y = at(a, r)
        if math.hypot(x, y) <= GRID_R + 30: continue
        z = H(x, y)
        if z < WL + 0.3: continue
        stalk_h = rng.uniform(4, 9); pz = z + stalk_h; rr = rng.uniform(6, 9)
        buf.cyl(x, y, z, 0.9, stalk_h, MR['gothicbio'], seg=6, r2=1.4)     # bio-mech stalk (hex cross-section), flares up
        buf.cyl(x, y, pz, rr, 1.1, MR['gothicbio'], seg=6)                 # hex pad deck
        buf.cyl(x, y, pz + 1.1, rr * 1.02, 0.15, MR['bioveins'], seg=6)    # emissive vein trim
        for vk in range(3):
            va = vk / 3 * 2 * math.pi
            buf.box(x + rr * 0.6 * math.cos(va), y + rr * 0.6 * math.sin(va), pz + 1.25, 0.4, 0.4, rng.uniform(2, 5), va, MR['bioveins'])   # thorn spires
        COLL['circle'].append({'x': round(x, 2), 'y': round(y, 2), 'r': round(rr, 2), 'top': round(pz + 1.25, 2), 'kind': 'darkforest-hexpad', 'walkableTop': True})
        pads.append((x, y, pz + 1.1))
    if pads:
        origin = pads[0]
        pads.sort(key=lambda p: math.hypot(p[0] - origin[0], p[1] - origin[1]))
    for i_ in range(len(pads) - 1):
        x0, y0, z0 = pads[i_]; x1, y1, z1 = pads[i_ + 1]
        if math.hypot(x1 - x0, y1 - y0) > 90: continue
        seg_pts = [(x0 + (x1 - x0) * t / 12, y0 + (y1 - y0) * t / 12, z0 + (z1 - z0) * t / 12 + 0.05) for t in range(13)]
        buf.ribbon(seg_pts, 1.8, MR['plank'])                                          # gothic plank bridge deck
        for sd in (-0.75, 0.75):
            rail = [(x + sd, y + sd, z + 0.7) for x, y, z in seg_pts]
            buf.ribbon(rail, 0.15, MR['bioveins'])
    ntree = 0; tries = 0
    while ntree < 140 and tries < 3000:
        tries += 1
        a = c + rng.uniform(-16, 16); r = RING_R + rng.uniform(120, 620)
        x, y = at(a, r)
        if math.hypot(x, y) <= GRID_R + 30: continue
        z = H(x, y)
        if z < WL + 0.3: continue
        hgt = rng.uniform(16, 26); cr = hgt * rng.uniform(0.14, 0.2)
        buf.cyl(x, y, z, 0.5, hgt * 0.3, MAT['bark'], seg=6)
        buf.cyl(x, y, z + hgt * 0.2, cr, hgt * 0.8, MR['pine'], seg=7, r2=0.15)         # dark gothic pine
        ntree += 1
    if pads:
        buf.to_object('DARKFOREST_HexPads_Bridges_Pines', C['31_DARKFOREST'])
        tx, ty = at(c, RING_R + 150)
        text('DARKVAULT REACH', (tx, ty - 12, H(tx, ty) + 14), 3, math.radians(-c), C['31_DARKFOREST'], MAT['plateText'])
    return len(pads), ntree


# ═════════ 32_CRYSTAL — crystal harbour + pier + glass-tube segment ═════════
def build_crystal():
    c = stn('harbor-line')['bearing']   # 225.0 deg, sector 'ocean'/crystal-sea 196-265 deg
    buf = MeshBuf(); towers = []
    for _ in range(6):
        a = c + rng.uniform(-20, 20); r = RING_R + rng.uniform(140, 460)
        x, y = at(a, r)
        if math.hypot(x, y) <= GRID_R + 30: continue
        z = H(x, y); base = z if z > WL else WL   # towers stand at the water's edge, or on stilts over the water
        h = rng.uniform(24, 46); rr = rng.uniform(6, 9); rot = math.radians(-a)
        buf.cyl(x, y, base, rr, h, MR['crystalframe'], seg=6, r2=rr * 0.15)             # faceted crystal spire (hex taper)
        buf.cyl(x, y, base + h * 0.15, rr * 0.92, h * 0.85, MR['crystal'], seg=6, r2=rr * 0.1)
        for f_ in range(int(h // 7)):
            buf.cyl(x, y, base + 3 + f_ * 7, rr * 0.94, 0.4, MR['harbourglow'], seg=6, r2=rr * 0.94 * 0.9)
        if z <= WL:
            buf.cyl(x, y, z - 6, 0.6, base - z + 6, MAT['concrete'], seg=8)             # stilt down to the seabed
        COLL['circle'].append({'x': round(x, 2), 'y': round(y, 2), 'r': round(rr, 2), 'top': round(base + 0.3, 2), 'kind': 'crystal-spire-base'})
        towers.append((x, y, base, h, rr))
    n = len(towers)
    shore_r = RING_R + 120
    px0, py0 = at(c, shore_r); pz = H(px0, py0)
    if towers:
        tx, ty, tb, th, trr = min(towers, key=lambda t: math.hypot(t[0] - px0, t[1] - py0))
        pier_pts = [(px0 + (tx - px0) * t / 40, py0 + (ty - py0) * t / 40, WL + 0.4) for t in range(41)]
        buf.ribbon(pier_pts, 5, MAT['deck'])
        for i_ in range(0, 41, 6):
            x_, y_, z_ = pier_pts[i_]
            buf.cyl(x_, y_, WL - 4, 0.4, 4.4, MAT['concrete'], seg=8)                   # pier pilings
        htube(buf, (pier_pts[-1][0], pier_pts[-1][1], WL + 2.4), (tx, ty, tb + 3), 2.2, MR['tube'], seg=14, capped=True)   # glass-tube segment: pier -> tower
        pyaw = math.atan2(ty - py0, tx - px0); plen = math.hypot(tx - px0, ty - py0)
        COLL['obb'].append({'x': round((px0 + tx) / 2, 2), 'y': round((py0 + ty) / 2, 2), 'hx': round(plen / 2, 2), 'hy': 3.0, 'rot': round(pyaw, 4), 'top': round(WL + 0.9, 2), 'kind': 'crystal-pier', 'walkableTop': True})
        n += 1
    if towers:
        buf.to_object('CRYSTAL_Harbour_Pier_Tube', C['32_CRYSTAL'])
        text('CRYSTAL SEA HARBOUR', (px0, py0 - 14, pz + 8), 3, math.radians(-c), C['32_CRYSTAL'], MAT['plateText'])
    return n


# ═════════ 33_ARCTIC — shelf city on cloud-stair walkways + 3 domes ═════════
def build_arctic():
    c = stn('arctic-outpost')['bearing']   # 333.4 deg, sector 'arctic' 314-346 deg
    buf = MeshBuf(); shelves = []
    base_r = RING_R + 180
    for k in range(4):
        a = c + (k - 1.5) * 8.0; r = base_r + k * 70
        x, y = at(a, r)
        if math.hypot(x, y) <= GRID_R + 30: continue
        z = H(x, y) + 10 + k * 14   # shelves float above grade, stepping up (the "shelf city")
        rr = rng.uniform(30, 44)
        buf.cyl(x, y, z, rr, 2.2, MR['shelf'], seg=28)
        buf.cyl(x, y, z + 2.2, rr * 0.985, 0.3, MAT['curb'], seg=28)
        for sup in range(6):
            sa = sup / 6 * 2 * math.pi; sx, sy = x + rr * 0.7 * math.cos(sa), y + rr * 0.7 * math.sin(sa)
            gz2 = H(sx, sy)
            buf.cyl(sx, sy, gz2, 0.8, z - gz2, MR['cloudstair'], seg=8)                 # support pylons down to grade
        COLL['circle'].append({'x': round(x, 2), 'y': round(y, 2), 'r': round(rr, 2), 'top': round(z + 2.5, 2), 'kind': 'arctic-shelf', 'walkableTop': True})
        shelves.append((x, y, z, rr))
    for i_ in range(len(shelves) - 1):
        x0, y0, z0, rr0 = shelves[i_]; x1, y1, z1, rr1 = shelves[i_ + 1]
        steps = 14
        stair_pts = [(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps, z0 + 2.2 + (z1 - z0) * t / steps + 1.2) for t in range(steps + 1)]
        buf.ribbon(stair_pts, 4, MR['cloudstair'])                                     # cloud-stair walkway between shelves
        for sd in (-1.6, 1.6):
            rail = [(x, y, z + 0.6) for x, y, z in stair_pts]
            buf.ribbon(rail, 0.15, MR['harbourglow'])
    for x, y, z, rr in shelves[:3]:                                                    # 3 domes over the first 3 shelves
        dz, rc = z + 2.5, rr * 0.7; rings = 4
        for _ in range(rings):
            rc2 = rc * 0.7
            buf.cyl(x, y, dz, rc, rr * 0.7 * 0.35, MR['dome'], seg=32, r2=rc2)
            dz += rr * 0.7 * 0.35; rc = rc2
        buf.cyl(x, y, dz - 0.3, rc * 1.05, 0.3, MAT['curb'], seg=32)
    n = len(shelves)
    if n:
        buf.to_object('ARCTIC_ShelfCity_CloudStairs_Domes', C['33_ARCTIC'])
        tx, ty = at(c, base_r)
        text('ARCTIC SHELF CITY', (tx, ty - 20, H(tx, ty) + 16), 3, math.radians(-c), C['33_ARCTIC'], MAT['plateText'])
    return n, min(n, 3)


# ═════════ 34_COLOSSEUM — colosseum scale, on the south spoke (bearing 180) ═════════
def build_colosseum():
    a_bearing = 180.0   # one of the 16 Grid spokes (0, 22.5, ... 180 ...), continued past the ring; matches region 'southern-colosseum'
    cx, cy = at(a_bearing, RING_R + 400)
    cz = H(cx, cy)
    buf = MeshBuf()
    R_in, R_out = 70.0, 120.0
    buf.cyl(cx, cy, cz, R_in, 0.8, MAT['plaza'], seg=64)                               # arena floor
    tiers = 9; step_r = (R_out - R_in - 4) / tiers
    for k in range(tiers):
        r_ = R_in + 4 + k * step_r
        buf.cyl(cx, cy, cz + 0.9 + k * 1.1, r_ + step_r, 1.1, MAT['seat'], seg=64)      # concentric tiered seating
    wall_h = 46.0
    buf.cyl(cx, cy, cz, R_out + 2, wall_h, MR['arena'], seg=64, r2=(R_out + 2) * 0.92)  # outer drum wall
    for k in range(64):
        if k % 8 != 0: continue
        a = k / 64 * 2 * math.pi
        gx_, gy_ = cx + (R_out + 2) * math.cos(a), cy + (R_out + 2) * math.sin(a)
        buf.box(gx_, gy_, cz, 8, 4.5, wall_h * 0.55, a, MAT['obsidian'])                # entrance arch
        buf.box(gx_, gy_, cz + wall_h * 0.55, 8.4, 4.8, 0.8, a, MR['arenaglow'])
    for k in range(16):
        a = k / 16 * 2 * math.pi
        gx_, gy_ = cx + (R_out + 2) * math.cos(a), cy + (R_out + 2) * math.sin(a)
        buf.box(gx_, gy_, cz + wall_h, 3, 3, 6, a, MR['arenaglow'])                     # crown pylons
    COLL['circle'].append({'x': round(cx, 2), 'y': round(cy, 2), 'r': R_in, 'top': round(cz + 0.9 + tiers * 1.1, 2), 'kind': 'colosseum-floor', 'walkableTop': True})
    COLL['circle'].append({'x': round(cx, 2), 'y': round(cy, 2), 'r': R_out + 2, 'top': round(cz + wall_h, 2), 'kind': 'colosseum-wall'})
    buf.to_object('COLOSSEUM_SouthSpoke', C['34_COLOSSEUM'])
    text('SOUTHERN COLOSSEUM', (cx, cy - R_out - 14, cz + 8), 4, math.radians(-a_bearing), C['34_COLOSSEUM'], MAT['plateText'])
    return 1, R_out


# ═════════ 35_LAIRS — dragon lairs (Emberfall already has one perch empty from step 5; these are the rest) ═════════
def build_lairs():
    buf = MeshBuf(); n = 0
    lair_specs = [
        ('Darkforest', stn('darkvault')['bearing'], RING_R + 340),
        ('Arctic', stn('arctic-outpost')['bearing'], RING_R + 420),
        ('Crystal', stn('harbor-line')['bearing'], RING_R + 300),
        ('Sand', stn('desert-terminal')['bearing'], RING_R + 500),
        ('Colosseum', 180.0, RING_R + 560),
    ]
    for name, c, r in lair_specs:
        x, y = at(c, r); z = H(x, y)
        if z < WL + 0.5: continue
        rot = math.radians(-c); rr = rng.uniform(10, 15); max_h = 0.0
        for _ in range(5):
            ox, oy = rng.uniform(-rr, rr), rng.uniform(-rr, rr)
            hh = rng.uniform(4, 10); max_h = max(max_h, hh)
            buf.box(x + ox, y + oy, z, rr * 0.5, rr * 0.5, hh, rng.uniform(0, 6.283), MR['lair'], taper=0.4)   # rock outcrop mound
        buf.box(x, y, z, 6, 3.5, 4.5, rot, MAT['obsidian'])                             # cave-mouth recess
        buf.cyl(x + 3.2 * math.cos(rot), y + 3.2 * math.sin(rot), z + 2.5, 0.35, 0.35, MR['laireye'], seg=8)   # glowing eyes in the dark
        buf.cyl(x + 3.6 * math.cos(rot), y + 3.6 * math.sin(rot), z + 2.9, 0.3, 0.3, MR['laireye'], seg=8)
        e = bpy.data.objects.new('DRAGON_' + name + '_Lair', None); e.empty_display_type = 'CONE'; e.empty_display_size = 14
        e.location = (x, y, z + 6); C['35_LAIRS'].objects.link(e)
        COLL['circle'].append({'x': round(x, 2), 'y': round(y, 2), 'r': round(rr + 2, 2), 'top': round(z + max_h, 2), 'kind': 'dragon-lair'})
        n += 1
    if n:
        buf.to_object('LAIR_RockOutcrops', C['35_LAIRS'])
    return n


N_SAND = build_sand()
N_DARK, N_DARK_TREES = build_darkforest()
N_CRYSTAL = build_crystal()
N_ARCTIC, N_ARCTIC_DOMES = build_arctic()
N_COLO, COLO_ROUT = build_colosseum()
N_LAIRS = build_lairs()

LOG.setdefault('metrics', {})['realms_v1'] = {
    'sand_pods': N_SAND, 'darkforest_pads': N_DARK, 'darkforest_trees': N_DARK_TREES,
    'crystal_features': N_CRYSTAL, 'arctic_shelves': N_ARCTIC, 'arctic_domes': N_ARCTIC_DOMES,
    'colosseum': N_COLO, 'lairs': N_LAIRS,
}
print('REALMS_V1', json.dumps(LOG['metrics']['realms_v1']))

# positions for the v8-<realm> approval shots (build_canon.py's RENDER section reads this dict; shoot() itself only
# exists there, same split as V3_SHOTS/city_v3.py at step 7)
V8_SHOTS = {
    'sand': at(stn('desert-terminal')['bearing'], RING_R + 260),
    'darkforest': at(stn('darkvault')['bearing'], RING_R + 300),
    'crystal': at(stn('harbor-line')['bearing'], RING_R + 250),
    'arctic': at(stn('arctic-outpost')['bearing'], RING_R + 250),
    'colosseum': at(180.0, RING_R + 400),
    'lairs': at(stn('darkvault')['bearing'], RING_R + 340),
}

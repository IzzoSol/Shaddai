# terrain-v4.py — the WHOLE WORLD's terrain from the owner's atlas (Map v4, ~10 km across), in Blender + exported for the game.
#   heights: one numpy function, realm-by-realm (atlas bearings), wilderness + rivers between realms, cloud-sea cliff edge
#   outputs (SHD_OUT_DIR):  height16.bin (uint16 LE, row 0 = north, col 0 = west)  ·  color.jpg  ·  terrain.json
#   Blender preview: 'ATLAS Terrain' mesh (vertex heights) with the colour map, water + cloud-sea planes.
#   Also stores NS['SHD_H'](x_m, y_m) → ground height (m) so build scripts can seat models on it.
# Coordinates: metres, Blender X = east, Y = north. compass = clockwise from north.
import bpy, json, math, os
import numpy as np

NS = bpy.app.driver_namespace
OUT = NS['SHD_OUT_DIR']; os.makedirs(OUT, exist_ok=True)
U = 7 / 1.8
HALF = 5000.0                     # world half-size (m)  → 10 km across
RIM = 4800.0                      # realms end here; cliff edge at HALF-120
M_PX = RIM / 840.0                # atlas px → m (atlas rim = 840 px)
GRID_R, RING_R = 280 * M_PX, 495 * M_PX     # ≈ 1600 m, 2829 m
N = int(NS.get('SHD_N', 2048))    # heightmap resolution
cell = 2 * HALF / N
rng = np.random.default_rng(11)

# ── noise (vectorised value noise) ──
PERM = rng.random((512, 512)).astype(np.float32)
def vnoise(x, y):
    xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - xi, y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = PERM[yi & 511, xi & 511]; b = PERM[yi & 511, (xi + 1) & 511]; c = PERM[(yi + 1) & 511, xi & 511]; d = PERM[(yi + 1) & 511, (xi + 1) & 511]
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
def fbm(x, y, scale, octaves=5, gain=0.5, off=0.0):
    s, amp, tot, norm = 1.0 / scale, 1.0, 0.0, 0.0
    for o in range(octaves):
        tot = tot + amp * vnoise(x * s + off + o * 17.3, y * s - off + o * 31.7); norm += amp; amp *= gain; s *= 2.03
    return tot / norm
def ridged(x, y, scale, octaves=5, off=0.0):
    s, amp, tot, norm = 1.0 / scale, 1.0, 0.0, 0.0
    for o in range(octaves):
        n = 1 - np.abs(2 * vnoise(x * s + off + o * 9.1, y * s + off - o * 4.7) - 1); tot = tot + amp * n * n; norm += amp; amp *= 0.5; s *= 2.1
    return tot / norm
def sstep(e0, e1, v): t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def P(c, r): a = math.radians(c); return r * math.sin(a), r * math.cos(a)

# ── grid of sample points (row 0 = north) ──
ys = HALF - (np.arange(N) + 0.5) * cell
xs = -HALF + (np.arange(N) + 0.5) * cell
X, Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
R = np.sqrt(X * X + Y * Y); C = (np.degrees(np.arctan2(X, Y)) + 360) % 360
C = (C + 7.0 * (fbm(X, Y, 1300, 4, 0.5, 2.2) - 0.5) * 2 + 2.5 * (fbm(X, Y, 380, 3, 0.5, 6.1) - 0.5) * 2) % 360   # meandering borders, not ruler lines

# realms: (id, compass0, compass1, r0, r1)
REALMS = [('void', 344, 16, GRID_R + 300, RIM), ('desert', 14, 45, GRID_R + 300, RIM), ('volcano', 45, 80, GRID_R + 300, RIM),
          ('suburb', 80, 122, RING_R + 450, RIM), ('forest', 86, 120, GRID_R + 120, RING_R + 300), ('meadow', 122, 172, GRID_R + 300, RIM),
          ('colo', 172, 196, GRID_R + 200, RIM), ('ocean', 196, 265, GRID_R + 250, RIM), ('darkforest', 262, 318, GRID_R + 300, RIM),
          ('arctic', 314, 346, GRID_R + 300, RIM)]
def angdist_in(c, c0, c1):          # signed distance (deg) inside the wedge (>0 inside), handles wrap
    span = (c1 - c0) % 360; rel = (c - c0) % 360
    return np.where(rel <= span, np.minimum(rel, span - rel), -np.minimum(rel - span, 360 - rel))
def mask(c0, c1, r0, r1, fa=4.0, fr=260.0, inset=3.2):
    c0, c1 = c0 + inset, c1 - inset
    return sstep(0, fa, angdist_in(C, c0, c1)) * sstep(r0, r0 + fr, R) * (1 - sstep(r1 - 60, r1 + fr * 0.5, R))

# ── base: wilderness rolling hills + ridges everywhere outside the Grid ──
wild = 6 + 30 * fbm(X, Y, 900, 5) + 55 * ridged(X, Y, 1400, 4, 3.3) ** 2
H = wild.copy()
masks = {}
def blend(mk, h):
    global H; H = H * (1 - mk) + h * mk
# realm terrain
m = mask(344, 16, GRID_R + 300, RIM); masks['void'] = m
vc = P(0, 3700); dv = np.hypot(X - vc[0], Y - vc[1])
blend(m, 30 + 110 * ridged(X, Y, 500, 5, 1.1) ** 3 - 22 * (1 - sstep(0, 700, dv)) + 12 * fbm(X, Y, 300))   # canon step 4: dry basin, the pit is carved below
m = mask(14, 46, GRID_R + 300, RIM); masks['desert'] = m
du = X * 0.8 + Y * 0.6 + 120 * fbm(X, Y, 600, 3)
blend(m, 8 + 32 * np.abs(np.sin(du / 85.0)) ** 1.5 * (0.5 + fbm(X, Y, 700, 3)) + 14 * fbm(X, Y, 1500, 3))
m = mask(45, 80, GRID_R + 300, RIM); masks['volcano'] = m
vk = P(66, 3950); dk = np.hypot(X - vk[0], Y - vk[1])
cone = 620 * np.clip(1 - dk / 1000, 0, 1) ** 1.7 - 170 * (1 - sstep(60, 170, dk))
blend(m, 12 + 230 * ridged(X, Y, 650, 5, 7.7) ** 2.2 + cone)
m = mask(80, 122, RING_R + 450, RIM); masks['suburb'] = m
blend(m, 22 + 3 * fbm(X, Y, 300, 3) + 10 * (np.floor(fbm(X, Y, 1600, 2) * 4) / 4))
m = mask(86, 120, GRID_R + 120, RING_R + 300, 3, 180); masks['forest'] = m
blend(m, 10 + 30 * fbm(X, Y, 500, 4))
m = mask(122, 172, GRID_R + 300, RIM); masks['meadow'] = m
blend(m, 12 + 70 * fbm(X, Y, 1100, 4) ** 1.4)
m = mask(172, 196, GRID_R + 200, RIM, 3, 200); masks['colo'] = m
blend(m, 6 + 20 * fbm(X, Y, 1200, 3))
m = mask(196, 265, GRID_R + 250, RIM + 120, 5, 500); masks['ocean'] = m
isl = fbm(X, Y, 420, 5, 0.55, 5.5); coast = sstep(GRID_R + 250, GRID_R + 900, R)
blend(m, (1 - coast) * 3 + coast * (-34 + 80 * np.clip(isl - 0.52, 0, 1) * 4.5))
m = mask(262, 318, GRID_R + 300, RIM); masks['darkforest'] = m
blend(m, 18 + 150 * ridged(X, Y, 800, 5, 2.2) ** 1.6 + 20 * fbm(X, Y, 250, 3))
m = mask(314, 346, GRID_R + 300, RIM); masks['arctic'] = m
blend(m, 40 + 720 * ridged(X, Y, 700, 6, 4.4) ** 2.4 * sstep(GRID_R + 400, GRID_R + 1400, R))

# ── rivers between realms (along 4 borders) + lakes; beds carved, water level 2 m ──
RIVERS = []
for cb in (45, 122, 265, 330):
    pts = []
    for k in range(90):
        r = GRID_R + 350 + k * (RIM - GRID_R - 450) / 89
        wob = 2.6 * math.sin(k * 0.11 + cb) + 0.9 * math.sin(k * 0.29 + cb * 0.3)
        pts.append(P(cb + wob, r))
    RIVERS.append(pts)
def seg_dist(px, py, pts):
    d = np.full(px.shape, 1e9, np.float32)
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        dx, dy = x1 - x0, y1 - y0; L2 = dx * dx + dy * dy
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1)
        d = np.minimum(d, np.hypot(px - (x0 + t * dx), py - (y0 + t * dy)))
    return d
WATER_LVL = 2.0
for pts in RIVERS:
    d = seg_dist(X, Y, pts); bank = 1 - sstep(18, 90, d)
    H = H * (1 - bank) + np.minimum(H, WATER_LVL + 1.5) * bank                     # flatten banks
    H = np.where(d < 22, np.minimum(H, WATER_LVL - 4 * (1 - d / 22) ** 0.5), H)    # carve the bed
LAKES = [(P(84, 2150), 300), (P(172, 2500), 360), (P(262, 3300), 330), (P(47, 3900), 280), (P(333, 2600), 260)]
for (lx, ly), lr in LAKES:
    d = np.hypot(X - lx, Y - ly) * (0.75 + 0.5 * fbm(X, Y, 260, 3, 0.5, lx * 0.001)); H = np.where(d < lr, np.minimum(H, WATER_LVL - 2.5 - 7 * (1 - d / lr)), H * 1)
    H = H * (1 - (1 - sstep(lr, lr + 120, d)) * (d >= lr)) + (d >= lr) * (1 - sstep(lr, lr + 120, d)) * np.minimum(H, WATER_LVL + 2)

# ── The Grid (flat city district), ring corridor, station pads, colosseum plaza ──
g = 1 - sstep(GRID_R - 40, GRID_R + 160, R); H = H * (1 - g) + 6.0 * g
ringband = 1 - sstep(40, 160, np.abs(R - RING_R)); H = H * (1 - ringband * 0.85) + ringband * 0.85 * np.clip(H, 3, 14)
STATIONS = [('rift', 'Rift Gate Station', 0), ('desert', 'Desert Terminal', 31), ('forge', 'Emberfall Forge Station', 54), ('suburb', 'Suburb Transit Hub', 90),
            ('meadow', 'Meadowfields Halt', 142.1), ('harbor', 'Harbor Line Station', 225), ('darkvault', 'Darkvault Station', 299.1), ('arctic', 'Arctic Outpost Station', 333.4)]
for _, _, cst in STATIONS:
    sx, sy = P(cst, RING_R); d = np.hypot(X - sx, Y - sy); pad = 1 - sstep(90, 220, d); H = H * (1 - pad) + 6.0 * pad
cx, cy = P(180, RING_R + 300); d = np.hypot(X - cx, Y - cy); pad = 1 - sstep(260, 420, d); H = H * (1 - pad) + 4.0 * pad

# ── CANON STEP 4 — DEEP VOID: a vertical pit (not two lakes) + a flat overlook lip on the Grid side ──
FEATURES = {}
PIT_R = 165.0
dvp = np.hypot(X - vc[0], Y - vc[1])
pit_floor = H[np.argmin(np.abs(dvp - PIT_R - 30).ravel())].item() if False else None
lip = float(np.median(H[(dvp > PIT_R + 20) & (dvp < PIT_R + 60)]))
H = np.where(dvp < PIT_R, np.minimum(H, lip - 24 * (1 - (dvp / PIT_R) ** 4) - 3), H)          # steep walls, 24-27 m deep bowl
ov = P(180 + 0, PIT_R + 22); ov = (vc[0] + ov[0], vc[1] + ov[1])                              # overlook: inner (Grid-side = south) lip
dov = np.hypot(X - ov[0], Y - ov[1]); ovz = lip
H = H * sstep(18, 40, dov) + ovz * (1 - sstep(18, 40, dov))
FEATURES['void'] = {'pit_centre_m': [round(vc[0], 1), round(vc[1], 1)], 'pit_r_m': PIT_R, 'lip_z_m': round(lip, 2), 'floor_z_m': round(lip - 27, 2),
                    'overlook_m': [round(ov[0], 1), round(ov[1], 1)], 'overlook_z_m': round(ovz, 2)}

# ── CANON STEP 5 — EMBERFALL: terrace on the Grid-facing slope, graded switchback from the Forge Station, lava channel ──
def Hs(x, y):   # sample the current H array (metres) at a point
    j = int(min(max(round((x + HALF) / cell - 0.5), 0), N - 1)); i = int(min(max(round((HALF - y) / cell - 0.5), 0), N - 1)); return float(H[i, j])
FB = 54.0                                            # Emberfall Forge Station bearing (canon)
s0 = P(FB, RING_R + 70); h0 = Hs(*s0)                # road starts just outside the ring pad
rt = RING_R + 260
while rt < RING_R + 1100 and Hs(*P(FB + 4, rt)) < h0 + 40: rt += 10
TC = P(FB + 4, rt + 170); hT = h0 + 44               # terrace centre: 170 m beyond the +40 m contour, shelf at +44 m
dT = np.hypot(X - TC[0], Y - TC[1])
H = np.where(dT < 175, hT, H * sstep(175, 235, dT) + hT * (1 - sstep(175, 235, dT)))
# switchback: s0 → hairpin (beyond the channel) → terrace edge; graded linearly by arc length (cut + fill)
hp = P(FB - 7, rt + 60); te = P(FB + 2, rt)
def poly(a, b, n): return [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n + 1)]
road = poly(s0, hp, 40)[:-1] + poly(hp, te, 40)
L = [0.0]
for k in range(1, len(road)): L.append(L[-1] + math.hypot(road[k][0] - road[k - 1][0], road[k][1] - road[k - 1][1]))
RZ = [h0 + (hT - h0) * l / L[-1] for l in L]
FEATURES['emberfall'] = {'terrace_centre_m': [round(TC[0], 1), round(TC[1], 1)], 'terrace_r_m': 175, 'terrace_z_m': round(hT, 2),
                         'road_m': [[round(x, 1), round(y, 1), round(z, 2)] for (x, y), z in zip(road, RZ)], 'road_len_m': round(L[-1], 1),
                         'grade_pct': round(100 * (hT - h0) / L[-1], 1)}
# lava channel: a tangential S-curve between the ring and the terrace that BOTH road legs cross (→ exactly 2 bridges)
rc = (RING_R + 70 + rt) / 2 + 25
chan = [P(FB - 16 + k * 0.8, rc + 18 * math.sin(k * 0.45)) for k in range(41)]
FEATURES['emberfall']['channel_m'] = [[round(x, 1), round(y, 1)] for x, y in chan]
dch = seg_dist(X, Y, chan)
H = np.where(dch < 7, H - 8 * (1 - (dch / 7) ** 2), H - 3 * (1 - sstep(7, 16, dch)))              # 14 m trough, 8 m deep
droad = seg_dist(X, Y, road)
# graded road surface: nearest road station's z (approx: blend toward the linear grade inside 6 m, feather to 18 m)
ri = np.zeros_like(X, dtype=np.int32)
best = np.full(X.shape, 1e9, np.float32)
for k, (rx, ry) in enumerate(road):
    d = np.hypot(X - rx, Y - ry); m_ = d < best; best = np.where(m_, d, best); ri = np.where(m_, k, ri)
RZa = np.array(RZ, np.float32)[ri]
bridge = dch < 9                                     # keep the channel open under the road → bridges span it
wroad = (1 - sstep(6, 18, droad)) * (~bridge)
H = H * (1 - wroad) + RZa * wroad
# bridge crossings = where each road leg meets the channel
cross = []
for a, b in ((0, 40), (40, len(road) - 1)):
    k = min(range(a, b), key=lambda k: min(math.hypot(road[k][0] - cx, road[k][1] - cy) for cx, cy in chan))
    cross.append([round(road[k][0], 1), round(road[k][1], 1), round(RZ[k], 2)])
FEATURES['emberfall']['bridges_m'] = cross

# ── world edge: cliffs into the cloud sea ──
edge = np.maximum(np.abs(X), np.abs(Y)) * 0 + R      # circular world
H = np.where(R > HALF - 120, H - (R - (HALF - 120)) * 6.0, H)
H = np.maximum(H, -420.0)

# ── colour map ──
def hexc(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
gx, gy = np.gradient(H, cell); slope = np.clip(np.hypot(gx, gy), 0, 3)
n1 = fbm(X, Y, 60, 3, 0.5, 9.9)
col = np.zeros(H.shape + (3,), np.float32)
def paint(mk, a, b, t):
    global col; mix = (a[None, None, :] * (1 - t[..., None]) + b[None, None, :] * t[..., None]); col = col * (1 - mk[..., None]) + mix * mk[..., None]
paint(np.ones_like(H), hexc('#4b6a36'), hexc('#6d5a3a'), np.clip(slope * 0.8 + (n1 - 0.5), 0, 1))           # wilderness grass/dirt
paint(masks['void'], hexc('#241535'), hexc('#7b3fc6'), np.clip(ridged(X, Y, 500, 3, 1.1) ** 3 * 2, 0, 1))
paint(masks['desert'], hexc('#c89a55'), hexc('#e7c784'), np.clip(n1 + slope * 0.3, 0, 1))
lava = np.clip((0.35 - ridged(X, Y, 650, 5, 7.7)) * 6, 0, 1)
paint(masks['volcano'], hexc('#2a2222'), hexc('#ff5a10'), lava)
paint(masks['suburb'], hexc('#3a3f47'), hexc('#555c66'), n1)
paint(masks['forest'], hexc('#24461f'), hexc('#3b6b2c'), n1)
paint(masks['meadow'], hexc('#5f8f3a'), hexc('#8cbf52'), n1)
paint(masks['colo'], hexc('#8a8f5a'), hexc('#c8b98a'), 1 - sstep(200, 500, np.hypot(X - cx, Y - cy)))
paint(masks['darkforest'], hexc('#18231a'), hexc('#2c3a22'), n1)
paint(masks['arctic'], hexc('#8e9aa8'), hexc('#f2f6fb'), np.clip(1 - slope * 0.6 + (H - 200) / 600, 0, 1))
below = H < WATER_LVL + 1.2
beach = (H >= WATER_LVL - 0.5) & (H < WATER_LVL + 5)
col = np.where(beach[..., None] & (masks['ocean'] > 0.3)[..., None], hexc('#e3d3a0')[None, None, :], col)
col = np.where(below[..., None], (hexc('#2a8f9a') * np.clip(1 + H / 40, 0.2, 1)[..., None] + hexc('#0b2f55') * np.clip(-H / 40, 0, 0.8)[..., None]), col)
col = np.where((g > 0.5)[..., None], hexc('#1c2a31')[None, None, :] + 0.03 * n1[..., None], col)
col = np.where((R > HALF - 120)[..., None], hexc('#6a6358')[None, None, :], col)
shade = np.clip(0.78 + 0.22 * (gx * -0.6 + gy * 0.6) / (1 + slope), 0.55, 1.15)[..., None]
col = np.clip(col * shade * (0.92 + 0.16 * n1[..., None]), 0, 1)

# ── export ──
MIN_M, MAX_M = -420.0, float(np.ceil(H.max() + 5))
q = np.round((H - MIN_M) / (MAX_M - MIN_M) * 65535).astype('<u2'); q.tofile(os.path.join(OUT, 'height16.bin'))
img = bpy.data.images.get('shd-terrain-color') or bpy.data.images.new('shd-terrain-color', N, N, alpha=False)
if img.size[0] != N: img.scale(N, N)
rgba = np.concatenate([col[::-1], np.ones(H.shape + (1,), np.float32)], axis=2)   # Blender images are bottom-row first
img.pixels.foreach_set(rgba.astype(np.float32).ravel()); img.filepath_raw = os.path.join(OUT, 'color.jpg'); img.file_format = 'JPEG'; img.save()
meta = {'half_units': HALF * U, 'half_m': HALF, 'min_m': MIN_M, 'max_m': MAX_M, 'sea_level_m': 0.0, 'water_level_m': WATER_LVL, 'size_px': N,
        'units_per_m': U, 'grid_r_m': GRID_R, 'ring_r_m': RING_R, 'rim_m': RIM, 'cloud_sea_m': -160,
        'realms': [{'id': a, 'c0': b, 'c1': c, 'r0_m': d, 'r1_m': e} for a, b, c, d, e in REALMS],
        'stations': [{'id': i, 'name': n, 'compass': c, 'xy_m': P(c, RING_R)} for i, n, c in STATIONS],
        'water': [{'type': 'ocean', 'realm': 'ocean', 'level_m': WATER_LVL}] + [{'type': 'river', 'level_m': WATER_LVL, 'width_m': 44, 'path_m': [list(p) for p in pts]} for pts in RIVERS]
                 + [{'type': 'lake', 'level_m': WATER_LVL, 'center_m': list(c), 'radius_m': r} for c, r in LAKES],
        'features': FEATURES,
        'note': 'height16.bin: uint16 LE, row 0 = north (+Y / game -z), col 0 = west; h_m = min_m + v/65535*(max_m-min_m). Game: x_u = X_m*U, z_u = -Y_m*U.'}
json.dump(meta, open(os.path.join(OUT, 'terrain.json'), 'w'), indent=1)

# sampler for other scripts (bilinear, metres in/out)
Hf = H.astype(np.float32)
def sample(x, y):
    fx = (x + HALF) / cell - 0.5; fy = (HALF - y) / cell - 0.5
    j0 = int(min(max(math.floor(fx), 0), N - 2)); i0 = int(min(max(math.floor(fy), 0), N - 2)); tx = min(max(fx - j0, 0), 1); ty = min(max(fy - i0, 0), 1)
    a, b, c_, d = Hf[i0, j0], Hf[i0, j0 + 1], Hf[i0 + 1, j0], Hf[i0 + 1, j0 + 1]
    return float((a * (1 - tx) + b * tx) * (1 - ty) + (c_ * (1 - tx) + d * tx) * ty)
NS['SHD_H'] = sample; NS['SHD_TERRAIN'] = meta

# ── Blender preview mesh (every 4th sample) ──
for n in ('ATLAS Terrain', 'ATLAS Water', 'ATLAS Cloud sea'):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
step = int(NS.get('SHD_PREVIEW_STEP', 4)); sub = H[::step, ::step]; n = sub.shape[0]
xs2, ys2 = xs[::step], ys[::step]
verts = np.zeros((n * n, 3), np.float32); gxv, gyv = np.meshgrid(xs2, ys2); verts[:, 0] = gxv.ravel(); verts[:, 1] = gyv.ravel(); verts[:, 2] = sub.ravel()
ii = np.arange(n - 1); I, J = np.meshgrid(ii, ii, indexing='ij'); a = (I * n + J).ravel()
faces = np.stack([a, a + n, a + n + 1, a + 1], 1)
me = bpy.data.meshes.new('ATLAS Terrain'); me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
me.loops.add(faces.size); me.loops.foreach_set('vertex_index', faces.ravel().astype(np.int32))
me.polygons.add(len(faces)); me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 4).astype(np.int32)); me.polygons.foreach_set('loop_total', np.full(len(faces), 4, np.int32))
me.update(); me.validate()
uv = me.uv_layers.new(name='UVMap'); vuv = np.stack([(verts[:, 0] + HALF) / (2 * HALF), (verts[:, 1] + HALF) / (2 * HALF)], 1)
uv.data.foreach_set('uv', vuv[faces.ravel()].ravel())
for p in me.polygons: p.use_smooth = True
ter = bpy.data.objects.new('ATLAS Terrain', me)
cg = bpy.data.collections.get('ATLAS Ground') or bpy.data.collections.new('ATLAS Ground')
if cg.name not in [c.name for c in bpy.context.scene.collection.children_recursive]: bpy.context.scene.collection.children.link(cg)
cg.objects.link(ter)
M = bpy.data.materials.get('shd-terrain') or bpy.data.materials.new('shd-terrain'); M.use_nodes = True; nt = M.node_tree
tex = next((nd for nd in nt.nodes if nd.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage'); tex.image = img
nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color']); nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95; nt.nodes.active = tex
ter.data.materials.append(M)
def plane(name, z, size, rgb, alpha, emit=0.0):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z)); o = bpy.context.active_object; o.name = name
    for u in list(o.users_collection): u.objects.unlink(o)
    cg.objects.link(o); Mt = bpy.data.materials.new(name); Mt.use_nodes = True; b = Mt.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Alpha'].default_value = alpha; b.inputs['Roughness'].default_value = 0.08
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    Mt.diffuse_color = (*rgb, alpha); o.data.materials.append(Mt); return o
wtr = plane('ATLAS Water', WATER_LVL - 0.3, 2, (0.1, 0.45, 0.6), 0.75)
bpy.data.objects.remove(wtr, do_unlink=True)
bpy.ops.mesh.primitive_circle_add(vertices=256, radius=HALF - 100, fill_type='NGON', location=(0, 0, WATER_LVL - 0.3)); wtr = bpy.context.active_object; wtr.name = 'ATLAS Water'
for u in list(wtr.users_collection): u.objects.unlink(wtr)
cg.objects.link(wtr); wtr.data.materials.append(bpy.data.materials['ATLAS Water'])
plane('ATLAS Cloud sea', -160, 60000, (0.95, 0.96, 1.0), 1.0, 0.6)
atl = bpy.data.objects.get('Atlas ground')
if atl: atl.hide_viewport = True; atl.hide_render = True
print('terrain v4: %d px, %.1f m/px, h %.0f..%.0f m, grid %.0f m, ring %.0f m, rim %.0f m → %s' % (N, cell, H.min(), H.max(), GRID_R, RING_R, RIM, OUT))

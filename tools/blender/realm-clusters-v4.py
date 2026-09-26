# realm-clusters-v4.py — DISTRICTS for every realm (TURTLE design pass, 2026-09-26), shared by Blender and the game.
# Writes public/assets/world/realm-clusters-v4.json (metres, X east / Y north, compass clockwise from north) and,
# when run inside Blender after place-world-v4.py, places the same items into 'V4 Clusters'.
# Only EXISTING models. Futuristic tech-fusion only. Deterministic (seeded) so Blender == game.
import json, math, os, random
import numpy as np
try:
    import bpy; NS = bpy.app.driver_namespace; IN_BLENDER = True
except Exception:
    NS = {}; IN_BLENDER = False
import sys
REPO = NS.get('SHD_REPO') or (sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.getcwd())
T = json.load(open(os.path.join(REPO, 'public/assets/terrain/terrain.json')))
N, HALF, MN, MX = T['size_px'], T['half_m'], T['min_m'], T['max_m']
HM = np.fromfile(os.path.join(REPO, 'public/assets/terrain/height16.bin'), dtype='<u2').reshape(N, N).astype(np.float32) / 65535 * (MX - MN) + MN
CELL = 2 * HALF / N; RIM, RING, GRID, WL = T['rim_m'], T['ring_r_m'], T['grid_r_m'], T['water_level_m']
def H(x, y):
    fx = (x + HALF) / CELL - 0.5; fy = (HALF - y) / CELL - 0.5
    j = int(min(max(math.floor(fx), 0), N - 2)); i = int(min(max(math.floor(fy), 0), N - 2)); tx = min(max(fx - j, 0), 1); ty = min(max(fy - i, 0), 1)
    return float((HM[i, j] * (1 - tx) + HM[i, j + 1] * tx) * (1 - ty) + (HM[i + 1, j] * (1 - tx) + HM[i + 1, j + 1] * tx) * ty)
def slope(x, y, d=8.0): return math.hypot(H(x + d, y) - H(x - d, y), H(x, y + d) - H(x, y - d)) / (2 * d)
def at(c, r): a = math.radians(c); return (r * math.sin(a), r * math.cos(a))
def ok(x, y, s=0.35): return H(x, y) > WL + 1.0 and slope(x, y) < s
rng = random.Random(4242)
ITEMS = []; taken = []
def free(x, y, r):
    for (ax, ay, ar) in taken:
        if (ax - x) ** 2 + (ay - y) ** 2 < (ar + r) ** 2: return False
    return True
def add(key, x, y, L, yaw=0.0, lift=0.0, by_height=False, cluster='', s=0.35):
    r = L * 0.55
    if not ok(x, y, s) or not free(x, y, r): return False
    taken.append((x, y, r)); ITEMS.append({'key': key, 'x_m': round(x, 1), 'y_m': round(y, 1), 'len_m': round(L, 1), 'yaw': round(yaw, 1), 'lift_m': lift, 'by_height': by_height, 'cluster': cluster}); return True

# ── SUBURBS: street-grid district aligned to the radial, blocks 70 m, streets 18 m ──
SUB = ['bld-apartment-pod-block', 'bld-inverted-cube-hab', 'bld-neon-observatory', 'bld-sea-terrace-spire', 'hero-city-megatower', 'bld-holo-market-v2']
SUBL = {'bld-apartment-pod-block': 45, 'bld-inverted-cube-hab': 30, 'bld-neon-observatory': 35, 'bld-sea-terrace-spire': 30, 'hero-city-megatower': 40, 'bld-holo-market-v2': 32}
c0 = 102; ox, oy = at(c0, 3950); ux, uy = math.sin(math.radians(c0)), math.cos(math.radians(c0)); vx, vy = uy, -ux
for i in range(-3, 4):
    for j in range(-4, 5):
        bx, by = ox + ux * i * 88 + vx * j * 88, oy + uy * i * 88 + vy * j * 88
        for k in range(rng.choice((2, 3, 3, 4))):
            key = rng.choice(SUB); L = SUBL[key] * rng.uniform(0.85, 1.15)
            px, py = bx + rng.uniform(-22, 22), by + rng.uniform(-22, 22)
            add(key, px, py, L, (-c0 + 90 * rng.randint(0, 3)) % 360, cluster='suburbs')
        for (sx, sy) in ((bx + ux * 44, by + uy * 44), (bx + vx * 44, by + vy * 44)):
            add('prop-street-lamp', sx, sy, 6, -c0, by_height=True, cluster='suburbs', s=0.6)
# ── MEADOWFIELDS: (removed 2026-09-26 — Master Build Prompt: 'DELETE the red-shack field'; Meadowfields = Halt + civic boulevard, see tools/blender/canon/build_canon.py) ──
if False:
  for ring, (rr, n) in enumerate(((0, 1), (70, 7), (140, 12), (210, 16))):
    cx, cy = at(138, 3550)
    for k in range(n):
        a = k / max(n, 1) * 2 * math.pi + ring * 0.4; x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        key = 'hero-mushroom-pods' if ring == 0 else 'homes-mushroom-pods'
        add(key, x, y, 40 if ring == 0 else rng.uniform(20, 28), rng.uniform(0, 360), cluster='meadow-village', s=0.45)
# ── SAND SEA: habitat-dome settlement around the desert terminal ──
tx, ty = at(27, 0.644 * RIM)
for k in range(22):
    a = rng.uniform(0, 2 * math.pi); rr = rng.uniform(110, 420)
    add('hero-sky-dome', tx + rr * math.cos(a), ty + rr * math.sin(a), rng.uniform(16, 34), 0, cluster='desert-domes', s=0.5)
for k in range(10):
    a = k / 10 * 2 * math.pi; add('prop-street-lamp', tx + 90 * math.cos(a), ty + 90 * math.sin(a), 7, 0, by_height=True, cluster='desert-domes', s=0.8)
# ── CRYSTAL SEA: terrace spires on the islands + harbour town at Harbor Line ──
n = 0
for k in range(4000):
    if n >= 26: break
    c = rng.uniform(205, 256); r = rng.uniform(0.60 * RIM, 0.97 * RIM); x, y = at(c, r)
    if H(x, y) > WL + 6 and slope(x, y) < 0.3 and add('bld-sea-terrace-spire', x, y, rng.uniform(26, 40), rng.uniform(0, 360), cluster='spire-islands'): n += 1
hx, hy = at(224, 0.652 * RIM)
n = 0
for k in range(3000):
    if n >= 14: break
    a = rng.uniform(0, 2 * math.pi); rr = rng.uniform(60, 520)
    if add(rng.choice(['bld-holo-market-v2', 'bld-inverted-cube-hab', 'bld-apartment-pod-block']), hx + rr * math.cos(a), hy + rr * math.sin(a), rng.uniform(24, 36), rng.uniform(0, 360), cluster='harbour-town', s=0.5): n += 1
# ── EMBERFALL: forge towers along the lava field + ritual circles ──
n = 0
for k in range(4000):
    if n >= 14: break
    c = rng.uniform(50, 76); r = rng.uniform(0.62 * RIM, 0.95 * RIM); x, y = at(c, r)
    if add('volcano-forge-tower', x, y, rng.uniform(16, 26), rng.uniform(0, 360), cluster='forge-line', s=1.0): n += 1
n = 0
for k in range(4000):
    if n >= 5: break
    c = rng.uniform(52, 74); r = rng.uniform(0.66 * RIM, 0.9 * RIM); x, y = at(c, r)
    if add('volcano-ritual-circle', x, y, rng.uniform(24, 34), 0, cluster='forge-line', s=0.6): n += 1
# ── ARCTIC VAULT: outpost chain up the valley + domes ──
n = 0
for k in range(6000):
    if n >= 16: break
    c = 330 + rng.uniform(-10, 10); r = rng.uniform(0.6, 0.97) * RIM; x, y = at(c, r)
    if add('hero-arctic-outpost' if n % 2 == 0 else 'hero-sky-dome', x, y, rng.uniform(26, 38), rng.uniform(0, 360), cluster='arctic-outposts', s=1.1): n += 1
# ── DARKFOREST: obsidian + crystal ruin fields around the castle ──
cx, cy = at(292, 0.815 * RIM)
for k in range(36):
    a = rng.uniform(0, 2 * math.pi); rr = rng.uniform(120, 700)
    add(rng.choice(['prop-obsidian-rocks', 'prop-crystal-cluster', 'prop-crystal-cluster']), cx + rr * math.cos(a), cy + rr * math.sin(a), rng.uniform(6, 18), rng.uniform(0, 360), cluster='dark-ruins', s=0.8)
# ── DEEP VOID: violet crystal fields around the rift ──
vx0, vy0 = at(0, 0.66 * RIM)
for k in range(40):
    a = rng.uniform(0, 2 * math.pi); rr = rng.uniform(150, 900)
    add('prop-crystal-cluster', vx0 + rr * math.cos(a), vy0 + rr * math.sin(a), rng.uniform(8, 22), rng.uniform(0, 360), cluster='void-crystals', s=0.9)

out = os.path.join(REPO, 'public/assets/world'); os.makedirs(out, exist_ok=True)
by = {}
for it in ITEMS: by[it['cluster']] = by.get(it['cluster'], 0) + 1
json.dump({'version': 1, 'note': 'realm districts (tools/blender/realm-clusters-v4.py). metres, X east, Y north; game x = X*U, z = -Y*U; seat on terrain + lift_m; len_m = widest side (or height if by_height).',
           'units_per_m': T['units_per_m'], 'counts': by, 'items': ITEMS}, open(os.path.join(out, 'realm-clusters-v4.json'), 'w'), separators=(',', ':'))
print('clusters:', by, 'total', len(ITEMS))

# ── Blender placement (uses place()/source() from place-world-v4.py when run in the same namespace) ──
if IN_BLENDER and 'place' in globals():
    c = bpy.data.collections.get('V4 Clusters')
    if c:
        for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new('V4 Clusters'); bpy.data.collections['V4 World'].children.link(c)
    n = 0
    for it in ITEMS:
        if place(it['key'], 'Cluster · %s · %s %d' % (it['cluster'], it['key'], n), (it['x_m'], it['y_m']), it['len_m'], it['yaw'], it['lift_m'], c=c, by_height=it['by_height']): n += 1
    print('clusters placed in Blender:', n)

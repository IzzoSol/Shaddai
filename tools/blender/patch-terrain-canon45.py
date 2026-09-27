# One-shot patch: terrain-v4.py ← canon steps 4-5 (Void pit, Emberfall terrace/switchback/lava channel) + canon station bearings.
import sys
p = 'tools/blender/terrain-v4.py'
s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    if s.count(a) != 1: sys.exit('ANCHOR x%d %r' % (s.count(a), a[:70]))
    s = s.replace(a, b)

# Void: crater floor stays ABOVE water (the vertical pit is carved later) — no more two lakes in the basin
rep("blend(m, 10 + 110 * ridged(X, Y, 500, 5, 1.1) ** 3 - 70 * (1 - sstep(0, 700, dv)) + 25 * fbm(X, Y, 300))",
    "blend(m, 30 + 110 * ridged(X, Y, 500, 5, 1.1) ** 3 - 22 * (1 - sstep(0, 700, dv)) + 12 * fbm(X, Y, 300))   # canon step 4: dry basin, the pit is carved below")

# canon station bearings (tools/blender/canon/world-layout.json — owner's table)
rep("STATIONS = [('rift', 'Rift Gate Station', 0), ('desert', 'Desert Terminal', 27), ('forge', 'Emberfall Forge Station', 61), ('suburb', 'Suburb Transit Hub', 104),",
    "STATIONS = [('rift', 'Rift Gate Station', 0), ('desert', 'Desert Terminal', 31), ('forge', 'Emberfall Forge Station', 54), ('suburb', 'Suburb Transit Hub', 90),")
i = s.index("STATIONS = ["); j = s.index("]", s.index("\n", i) + 1)
line2 = s[s.index("\n", i) + 1: j + 1]
s = s.replace(line2, "            ('meadow', 'Meadowfields Halt', 142.1), ('harbor', 'Harbor Line Station', 225), ('darkvault', 'Darkvault Station', 299.1), ('arctic', 'Arctic Outpost Station', 333.4)]", 1)

# canon features, carved after the pads and before the world edge
rep("# ── world edge: cliffs into the cloud sea ──", """# ── CANON STEP 4 — DEEP VOID: a vertical pit (not two lakes) + a flat overlook lip on the Grid side ──
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

# ── world edge: cliffs into the cloud sea ──""")
rep("        'note': 'height16.bin:", "        'features': FEATURES,\n        'note': 'height16.bin:")
open(p, 'w', encoding='utf-8').write(s)
print('patched')

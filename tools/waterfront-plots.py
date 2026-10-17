#!/usr/bin/env python
"""tools/waterfront-plots.py - stilted waterfront PLOTS along the Harbor Ring Canal (SW sector) and the Crystal Sea shore (owner 2026-10-11).
Reads public/assets/terrain-ww/{terrain.json,height16.bin}; writes docs/waterfront-plots.json and adds `harbor.plots` to terrain-ww/terrain.json.
A plot is 30 x 44 m, faces the water, sits on the outer bank (away from the city) or the sea shore, and is only kept where the ground is within 12 m of the water level."""
import json, math, os
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); D = os.path.join(ROOT, 'public', 'assets', 'terrain-ww')
T = json.load(open(os.path.join(D, 'terrain.json')))
raw = np.fromfile(os.path.join(D, 'height16.bin'), dtype='<u2'); N = int(round(math.sqrt(raw.size)))
hm = T['min_m'] + raw.reshape(N, N).astype(np.float32) / 65535.0 * (T['max_m'] - T['min_m']); half = T['half_m']; sc = (N - 1) / (2 * half)
def h(e, n): return float(hm[min(N - 1, max(0, int(round((half - n) * sc)))), min(N - 1, max(0, int(round((e + half) * sc))))])
ring = next(w for w in T['water'] if w.get('id') == 'harbor-ring')['path_m']; lvl = T['harbor']['level_m']
ocean = next(r for r in T['realms'] if r['id'] == 'ocean'); c0, c1 = ocean['c0'] - 10, ocean['c1'] + 10     # SW sector, a little wider than the sea
def comp(e, n): return math.degrees(math.atan2(e, n)) % 360
plots = []; last = None
for i in range(len(ring) - 1):
    e, n = ring[i]; e2, n2 = ring[i + 1]
    if not (c0 <= comp(e, n) <= c1): continue
    if last is not None and math.hypot(e - last[0], n - last[1]) < 56: continue
    tx, ty = e2 - e, n2 - n; ln = math.hypot(tx, ty) or 1; tx, ty = tx / ln, ty / ln; nx, ny = ty, -tx          # right-hand normal
    if nx * e + ny * n < 0: nx, ny = -nx, -ny                                                                    # pick the outward side (away from the city)
    off = 22 + 30 + 22 + 8                                                                                          # channel half width + wall blend + half plot depth + gap
    pe, pn = e + nx * off, n + ny * off
    g = h(pe, pn)
    if abs(g - lvl) > 12: continue
    plots.append({'id': 'WF-C%02d' % len(plots), 'kind': 'canal', 'e': round(pe, 1), 'n': round(pn, 1), 'yaw_deg': round(math.degrees(math.atan2(-nx, -ny)) % 360, 1), 'w_m': 30, 'd_m': 44, 'ground_m': round(g, 1), 'water_m': lvl}); last = (e, n)
# sea shore: points where the land meets the Crystal Sea inside the ocean sector, sampled along compass lines
for comp_deg in range(int(ocean['c0']) + 4, int(ocean['c1']) - 3, 4):
    a = math.radians(comp_deg)
    prev = None
    for r in range(int(ocean['r0_m']) - 150, int(ocean['r0_m']) + 900, 10):
        e, n = r * math.sin(a), r * math.cos(a); g = h(e, n)
        if prev is not None and prev > T['water_level_m'] + 1.0 and g <= T['water_level_m'] + 0.5:     # land -> water going outward = a shoreline
            se, sn = (r - 40) * math.sin(a), (r - 40) * math.cos(a)
            if all(math.hypot(se - p['e'], sn - p['n']) > 70 for p in plots) and abs(h(se, sn) - T['water_level_m']) < 12:
                plots.append({'id': 'WF-S%02d' % len([p for p in plots if p['kind'] == 'shore']), 'kind': 'shore', 'e': round(se, 1), 'n': round(sn, 1), 'yaw_deg': round((comp_deg + 0.0) % 360, 1), 'w_m': 30, 'd_m': 44, 'ground_m': round(h(se, sn), 1), 'water_m': T['water_level_m']})
            break
        prev = g
        if len(plots) > 60: break
json.dump(plots, open(os.path.join(ROOT, 'docs', 'waterfront-plots.json'), 'w'), indent=1)
T['harbor']['plots'] = plots; json.dump(T, open(os.path.join(D, 'terrain.json'), 'w'))
print('plots:', len(plots), '| canal', sum(p['kind'] == 'canal' for p in plots), '| shore', sum(p['kind'] == 'shore' for p in plots))

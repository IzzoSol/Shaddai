#!/usr/bin/env python
"""SHADDAI · spec-sheets.py — concept sheets exactly per docs/ASSET-SPEC-CLAUDE.md (§B locks, §C manifests).

  python fal-assets/production/spec-sheets.py list
  python fal-assets/production/spec-sheets.py run <id> [<id> ...] [--go]
  python fal-assets/production/spec-sheets.py run --all [--go]

Endpoint: fal-ai/flux/schnell (owner table 2026-09-24: fronts ~$0.003/MP; HF credits exhausted).
Output: fal-assets/concepts/<id>.png — ONE sheet per asset; an existing sheet is never regenerated
(delete it by hand after the owner rejects it). FAL_KEY from env, never printed. Dry-run by default.
Every call is appended to production/spec-ledger.json (preflight.mjs counts it against the $100).
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "concepts")
LEDGER = os.path.join(HERE, "spec-ledger.json")
ENDPOINT = "fal-ai/flux/schnell"
USD_PER_MP = 0.003

# ── §B locks, verbatim ────────────────────────────────────────────────────────
STYLE = ("Brand palette: obsidian #06080b brushed-metal base, gold #e8c45c sacred-geometry accents, "
         "emerald #00ff9c energy seams, cyan #5fe0ff holographic glow. Futuristic sci-fi, clean readable "
         "silhouette, no medieval, no cartoon.")
SHOT = ("single isolated object, full object in frame with 10% margin, 3/4 view, flat mid-grey studio "
        "background, soft even studio light, solid opaque surfaces.")
TURNTABLE = ("ONE turnaround sheet with 4 views of the SAME object side by side in a row: front, 3-quarter, "
             "side, back, all at equal scale, evenly spaced, flat mid-grey studio background, soft even studio light, "
             "solid opaque surfaces, nothing cropped.")
NEGATIVE = ("no text, no logos, no watermark, no people, no duplicate objects, no background clutter, "
            "no cropped edges, no reflections, no perspective distortion.")
# schnell ignores negative prompts, so the lock is also stated positively
CLEAN = ("All surfaces are plain with no lettering, no numbers and no emblems; every screen, sign and panel shows only "
         "abstract glowing geometric shapes, never words. Colors stay in the obsidian, gold, emerald and cyan palette.")

KIT = {"tourney": "gold and emerald", "garage": "emerald and gold", "war": "ember orange and obsidian", "siege": "violet and black"}


def A(id, sec, kind, core, dims="", size=1024):
    return {"id": id, "sec": sec, "kind": kind, "core": core, "dims": dims, "size": size}


ASSETS = [
    # C1 tactics units — turntable + one attack pose each; SHADDAI is the §D canary
    A("unit-shaddai", "C1", "char", "commander in obsidian robes with gold sacred-geometry mantle, calm power", "1.85m regal humanoid, gold mantle"),
    A("unit-pilot", "C1", "char", "agile pilot, slim armored flightsuit, cyan visor, gold trim seams, standing alone with nothing behind him", "1.8m human, sleek flight-suit, cyan visor"),
    A("unit-oracle", "C1", "char", "hooded seer, violet glow eyes, constellation-pattern cloak", "1.8m hooded mystic"),
    A("unit-bot-heavy", "C1", "char", "heavy combat mech, blocky armored plates, red sensor visor, huge fists", "2.6m mech, 2x2 grid footprint"),
    A("unit-bot-scout", "C1", "char", "thin fast recon mech, long rifle arm, single cyan optic", "1.7m wiry ranged mech"),
] + [
    A(f"{u}-attack", "C1", "pose", core + ", mid-attack action pose, dynamic, full body in frame", dims, 1024)
    for u, core, dims in [
        ("unit-shaddai", "commander in obsidian robes with gold sacred-geometry mantle", "1.85m"),
        ("unit-pilot", "agile pilot, slim armored flightsuit, cyan visor, gold trim seams", "1.8m"),
        ("unit-oracle", "hooded seer, violet glow eyes, constellation-pattern cloak", "1.8m"),
        ("unit-bot-heavy", "heavy combat mech, blocky armored plates, red sensor visor, huge fists", "2.6m"),
        ("unit-bot-scout", "thin fast recon mech, long rifle arm, single cyan optic", "1.7m"),
    ]
] + [
    # C2 fishing — one 1024 icon sheet
    A("fishing-icons", "C2", "icons", "fishing icon set, transparent-look isolated items on a grid: slim carbon rod with gold reel and emerald line glow; five different sci-fi fish; a black pearl with violet nebula core and gold rim; a bold gold exclamation-mark strike prompt", "icons read at 32-48px", 1024),
    # C3 arcade venue
    A("bld-arcade-palace", "C3", "object", "futuristic entertainment hall, facade covered in rows of glowing cyan screen panels showing abstract shapes, gold marquee arch, obsidian columns, glowing doorway", "18x14m base x 16m tall, doorway 2.2x1.2m"),
    A("arcade-cabinet", "C3", "object", "retro-futuristic arcade cabinet, gold trim, cyan screen", "about 1.9m tall"),
] + [
    A(f"arcade-thumb-{g}", "C3", "thumb", f"arcade game thumbnail art for {desc}, SHADDAI neon arcade style, bold readable composition", "512x512 thumbnail", 512)
    for g, desc in [("skate", "a hoverboard skate trick game"), ("basketball", "a futuristic basketball court game"),
                    ("dodgeball", "a futuristic dodgeball arena game"), ("sigil", "a magic sigil pattern-reflex duel game")]
] + [
    # C4 sparks ledger icons
    A("sparks-icons", "C4", "icons", "energy lightning rune in a gold hexagon icon family on a grid: gold spark bolt, gold pot bowl, entry chip, win banner", "icons read at 64px", 1024),
    # C5 swim / water fx
    A("fx-splash-ring", "C5", "fx", "water splash ring sprite sheet, 4 animation frames in a row from small to large ring, emerald-tinted spray", "each frame 128x128", 1024),
    A("fx-foam-tile", "C5", "fx", "seamless tileable waterline foam texture, top-down, white foam lace on teal water", "512 tile", 512),
    A("fx-swim-vignette", "C5", "fx", "soft radial underwater vignette gradient, deep teal edges fading to transparent center", "screen overlay", 512),
] + [
    # C6 ships + vehicles (every one needs a seat_anchor — cockpit must read as a seat)
    A("veh-ocean-skiff", "C6", "object", "sleek hover-skiff, open cockpit, seat at helm, gold hull trim", "12x5x4m (LxWxH)"),
    A("veh-ocean-catamaran", "C6", "object", "twin-hull luxury catamaran, twin seats, emerald glass canopy", "19x11x7m"),
    A("veh-ocean-superyacht", "C6", "object", "futuristic mega-yacht, wraparound cockpit, 2 deck levels, gold accents, captain seat", "30x11x9m"),
    A("veh-ocean-submarine", "C6", "object", "elongated torpedo-shaped research submarine, long cylindrical hull, glass viewport dome at the bow, small rear fins, cyan running lights", "14x6x6m"),
    A("veh-hovercar", "C6", "object", "wheel-less two-seat hover coupe floating above the ground on four glowing thruster pads, NO wheels, glass canopy, gold trim, cyan underglow", "4.6x2.4x1.6m"),
    A("veh-hoverboard-v2", "C6", "object", "long narrow skateboard-shaped hover deck with no wheels, seen from above at 3/4, emerald underglow strip along the edge, gold side rails, no rider", "3.4x1x0.4m"),
] + [
    # C7 interior hall kits — "dungeon-scale room prop", kit palette
    A(f"kit-{k}-{pid}", "C7", "object", f"dungeon-scale room prop: {core}, {KIT[k]} palette", "room prop, <=30k tris")
    for k, pid, core in [
        ("tourney", "betting-board", "betting holo-board"), ("tourney", "champion-banner", "blank fabric champion banner hanging from a stand, decorated only with a geometric star emblem, no words"),
        ("tourney", "weapon-rack", "weapon rack"), ("tourney", "trophy-pedestal", "trophy pedestal"), ("tourney", "tier-gate", "tier gate arch"),
        ("garage", "vehicle-pedestal", "rotating vehicle pedestal"), ("garage", "spec-bench", "holo spec bench"),
        ("garage", "parts-shelf", "parts shelf"), ("garage", "tool-wall", "wall pegboard holding futuristic wrenches, drills and power tools"),
        ("war", "map-table", "tactical map table with holo realm-map"), ("war", "throne", "obsidian throne"),
        ("war", "lava-hearth", "rectangular fireplace hearth with a glowing orange lava pool inside, heavy obsidian stone surround"), ("war", "weapon-wall", "wall-mounted rack holding several futuristic swords and spears"),
        ("siege", "throne", "dark throne"), ("siege", "window-frame", "moat-facing arched window frame"),
        ("siege", "plan-table", "rectangular war table with a violet holographic map of a castle projected above it"), ("siege", "dragon-banner", "banner of the dragon"),
    ]
] + [
    # C9 city + world fill
    A("prop-street-lamp", "C9", "object", "futuristic sci-fi street light, sleek curved metal pole ending in a glowing horizontal light bar, not an old-fashioned lantern", "5m tall"),
    A("prop-kiosk", "C9", "object", "futuristic vendor kiosk", "3m tall"),
    A("prop-transit-stop", "C9", "object", "futuristic transit stop shelter", "4m tall"),
    A("prop-holo-fountain", "C9", "object", "holographic fountain", "6m tall"),
    A("prop-statue-shaddai", "C9", "object", "obsidian monolith statue of a hooded figure holding a gold sphere, sacred geometry", "5m tall"),
    A("prop-neon-tree", "C9", "object", "neon tree", "6m tall"),
    A("prop-ore-node", "C9", "object", "crystal ore node", "2m tall"),
    A("prop-signpost", "C9", "object", "signpost", "3m tall"),
    A("hero-fortress", "C9", "object", "obsidian volcanic citadel, three stepped tiers, glowing orange lava waterfalls pouring down its edges, ember orange palette, gold command spire, open gate", "80x60m base x 45m tall"),
    # C10 realm landmarks — from the owner's world refs (fal-assets/refs/world/WORLD-REF-MAP.md)
    A("hero-colosseum", "C10", "object", "single circular colosseum stadium building seen from outside at 3/4 above, tiered steel stands visible over the rim, arched entrance gates, neon pink and cyan light strips, no characters, no mech", "90m diameter, walk-in"),
    A("hero-sky-dome", "C10", "object", "transparent ribbed glass dome over a lush green hill with a tiered lit building inside, bullet-train viaduct passing by", "120m dome (ref W1)"),
    A("hero-desert-terminal", "C10", "object", "glass-domed hyperloop terminal on red desert ground, gold light strips, chrome capsule docked", "60m (ref W5)"),
    A("hero-forest-amphitheater", "C10", "object", "conical black timber-lattice pavilion over a circular stage with terraced steps and a round pond", "50m (ref C2)"),
    A("hero-beach-market-dome", "C10", "object", "domed round marketplace half-sunk in turquoise water, rooftop palms, lit shop windows with no signage", "40m (ref C1)"),
    A("hero-farm-sky-structure", "C10", "object", "floating farm-tech structure of stacked glowing boxes hanging over golden wheat fields", "60m (ref W4)"),
    A("hero-city-megatower", "C10", "object", "pale steel-glass crescent megatower with cantilevered truss terraces on a disc transit podium", "200m spire (ref W6)"),
    A("hero-mushroom-pods", "C10", "object", "glossy candy-red mushroom-cap pod homes on curved stalks, rooftop gardens, round windows, sweeping ramps", "12-20m homes (ref W7), candy-red #FF4D4D + moss green"),
    A("hero-arctic-outpost", "C10", "object", "arctic research outpost, ice-blue glowing domes on stilts, antenna mast", "40m"),
    A("hero-void-rift-gate", "C10", "object", "colossal void rift gate, floating obsidian ring with a violet starfield portal inside", "50m tall"),
    A("hero-castle", "C9", "object", "dark crystal castle, floating rune-shard towers, violet energy moat glow, open drawbridge on the SE face", "70x70m base x 55m tall"),
]
CUT = {  # vetted 2026-09-24
    "arcade-thumb-skate": "use a real in-game screenshot ($0)", "arcade-thumb-basketball": "use a real in-game screenshot ($0)",
    "arcade-thumb-dodgeball": "use a real in-game screenshot ($0)", "arcade-thumb-sigil": "use a real in-game screenshot ($0)",
    "sparks-icons": "draw as SVG in code ($0)", "fishing-icons": "draw as SVG in code ($0)",
    "fx-splash-ring": "particle effect in code ($0)", "fx-foam-tile": "shader in code ($0)", "fx-swim-vignette": "CSS gradient ($0)",
    "veh-ocean-skiff": "duplicate — use approved HF concept veh-skiff", "prop-neon-tree": "duplicate — HF concept prop-neon-tree is better",
}
BY = {a["id"]: a for a in ASSETS}
CANARY = ["unit-shaddai", "bld-arcade-palace"]


def prompt(a):
    k = a["kind"]
    if k in ("char", "object"):
        # owner-approved deviation 2026-09-24: schnell cannot hold a 4-view turntable (canary failed:
        # 3 views, uneven scale, mixed objects) -> ONE clean 3/4 view, which is also what image-to-3D consumes
        framing = SHOT + (" Full body, neutral standing pose, feet flat on the ground." if k == "char" else "")
    elif k == "pose":
        framing = SHOT.replace("3/4 view", "dynamic 3/4 view")
    else:  # icons / thumb / fx sheets
        framing = "flat mid-grey background, soft even light, clean isolated items."
    scale = f" Scale: {a['dims']}." if a["dims"] else ""
    clean = CLEAN if "palette" not in a["core"] else CLEAN.split(" Colors stay")[0]
    return f"{STYLE} {a['core']}.{scale} {framing} {clean} {NEGATIVE}"


def cost(a):
    return round(USD_PER_MP * a["size"] * a["size"] / 1_000_000, 4)


def ledger():
    return json.load(open(LEDGER, encoding="utf-8")) if os.path.exists(LEDGER) else {"entries": []}


def generate(a, key):
    body = json.dumps({"prompt": prompt(a), "image_size": {"width": a["size"], "height": a["size"]},
                       "num_images": 1, "num_inference_steps": 4, "enable_safety_checker": True}).encode()
    req = urllib.request.Request(f"https://fal.run/{ENDPOINT}", data=body, method="POST",
                                 headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    res = json.load(urllib.request.urlopen(req, timeout=180))
    url = res["images"][0]["url"]
    path = os.path.join(OUT, a["id"] + ".png")
    data = urllib.request.urlopen(url, timeout=120).read()
    from PIL import Image
    import io
    Image.open(io.BytesIO(data)).save(path)          # normalise to real PNG
    return path


def main():
    args = sys.argv[1:]
    if not args or args[0] == "list":
        tot = sum(cost(a) for a in ASSETS)
        for a in ASSETS:
            done = "✓" if os.path.exists(os.path.join(OUT, a["id"] + ".png")) else " "
            print(f"{done} {a['sec']} {a['id']:<28} {a['kind']:<6} {a['size']}px  ${cost(a)}")
        print(f"{len(ASSETS)} sheets · est ${tot:.2f} total · canary first: {', '.join(CANARY)}")
        return
    if args[0] != "run":
        sys.exit(__doc__)
    go = "--go" in args
    ids = [x for x in args[1:] if not x.startswith("--")]
    if "--all" in args:
        ids = [a["id"] for a in ASSETS if a["id"] not in CUT]
    bad = [i for i in ids if i not in BY]
    if bad:
        sys.exit(f"BLOCKED: not in ASSET-SPEC manifest: {bad}")
    L = ledger()
    canary_ok = all(os.path.exists(os.path.join(OUT, c + ".png")) for c in CANARY)
    if not canary_ok and any(i not in CANARY for i in ids):
        sys.exit(f"BLOCKED: canary first — run and review {CANARY} before any other sheet")
    key = os.environ.get("FAL_KEY")
    if go and not key:
        sys.exit("BLOCKED: FAL_KEY not in env")
    os.makedirs(OUT, exist_ok=True)
    spent = 0.0
    for i in ids:
        a = BY[i]
        path = os.path.join(OUT, i + ".png")
        if os.path.exists(path):
            print(f"skip {i} (sheet exists — delete it to regenerate)")
            continue
        if not go:
            print(f"DRY {i}  ${cost(a)}\n    {prompt(a)}")
            continue
        for attempt in (1, 2):
            try:
                generate(a, key)
                break
            except Exception as e:
                msg = str(e).replace(key, "***")[:160]
                print(f"  {i}: attempt {attempt} failed: {msg}")
                if attempt == 2:
                    sys.exit("STOP: fal call failed twice")
                time.sleep(3)
        spent += cost(a)
        L["entries"].append({"at": datetime.now(timezone.utc).isoformat(), "id": i, "endpoint": ENDPOINT,
                             "usd_est": cost(a), "px": a["size"]})
        json.dump(L, open(LEDGER, "w", encoding="utf-8"), indent=2)
        print(f"saved concepts/{i}.png  ~${cost(a)}")
    if go:
        print(f"batch ~${spent:.3f} · ledger total ~${sum(e['usd_est'] for e in L['entries']):.3f}")


if __name__ == "__main__":
    main()

"""
Regenerate the front-door tile plates (public/assets/enter/*.jpg).

    HFTOK=<a huggingface token> python scripts/gen-front-door-plates.py public/assets/enter

Build-time only. The token is read from the environment and is never written
to disk or committed; only the finished JPEGs land in the repo.

PROVIDER NOTE (verified 2026-08-28) — HF's own `hf-inference` provider no
longer serves these image models: it returns 410 Gone, which reads like a
dead key but is not. Route through a live partner provider instead. At the
time of writing `nscale`, `fal-ai` and `wavespeed` all serve FLUX.1-schnell;
`nscale` is used here because it is OpenAI-compatible and returns base64
directly. Check current providers with:

    curl -s "https://huggingface.co/api/models/black-forest-labs/FLUX.1-schnell?expand%5B%5D=inferenceProviderMapping"

A token also needs the "Make calls to Inference Providers" permission — a
fine-grained token without it returns 403, not 410.

Each plate sits BEHIND a neon 3D solid and big Cinzel lettering at 30-46%
opacity, so every prompt asks for the same thing: near-black, low clutter,
light concentrated in the upper half, nothing legible, no text. Generated
plates measured 4.6-33.7 mean luma; anything brighter fights the type and
should be regenerated.
"""
import base64, io, json, os, sys, time, urllib.request

TOKEN = os.environ.get("HFTOK", "")
if not TOKEN:
    sys.exit("no token in env")

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
URL = "https://router.huggingface.co/nscale/v1/images/generations"

STYLE = (
    "cinematic still, near-black obsidian background, deep shadow, "
    "sacred geometry, ancient-tech fusion, volumetric haze, film grain, "
    "high contrast, light concentrated in the upper half, empty dark space "
    "along the bottom third, no text, no words, no letters, no watermark, "
    "no people facing camera, minimal, elegant"
)

PLATES = {
    "descent":   "a descent through the scales of reality, nested luminous spheres receding into a starfield, planetary rim light, faint cyan glow",
    "entry":     "seven robed luminous silhouettes standing in a vast dark hall, thin gold rim light, tree of life geometry etched behind them",
    "dashboard": "a dark command deck, floating emerald wireframe panels and thin holographic readouts, glass reflections",
    "simple":    "a single luminous violet ring turning in an empty void, concentric halo, one clean object",
    "rag":       "an immense neural knowledge lattice, emerald nodes joined by faint filaments, depth fog",
    "world2d":   "an isometric ancient city at night seen from far above, tiny warm gold windows, dark streets",
    "world3d":   "colossal black monolithic geometric structures at night under a starfield, thin cyan edge light tracing their silhouettes, deep black sky, no fog, no haze",
    "arcade":    "rows of glowing arcade cabinets in a pitch-dark room, warm amber screen light, receding perspective",
    "signals":   "streams of financial data and candlestick charts dissolving into dark space, crimson and rose light trails",
}

def gen(prompt):
    body = json.dumps({
        "model": "black-forest-labs/FLUX.1-schnell",
        "prompt": prompt + ", " + STYLE,
        "size": "1024x640",
        "response_format": "b64_json",
    }).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read())
    return base64.b64decode(d["data"][0]["b64_json"])

def main():
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    ok, fail = 0, []
    for name, prompt in PLATES.items():
        dest = os.path.join(OUT, name + ".jpg")
        try:
            raw = gen(prompt)
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            im = im.resize((1000, 625), Image.LANCZOS)
            im.save(dest, "JPEG", quality=80, optimize=True, progressive=True)
            kb = os.path.getsize(dest) // 1024
            print(f"  {name:<10} {im.width}x{im.height}  {kb} KB")
            ok += 1
        except Exception as e:
            msg = str(e)
            if hasattr(e, "read"):
                try: msg = e.read().decode()[:200]
                except Exception: pass
            print(f"  {name:<10} FAILED: {msg[:180]}")
            fail.append(name)
        time.sleep(1.0)
    print(f"\n{ok}/{len(PLATES)} generated" + (f" · failed: {', '.join(fail)}" if fail else ""))

main()

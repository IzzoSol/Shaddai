#!/usr/bin/env python
"""SHADDAI · to3d.py — approved concept PNG -> textured GLB on fal (Hunyuan3D v3.1).

  python fal-assets/production/to3d.py <asset-id> [--tier rapid|pro] [--go]

Owner table 2026-09-24: props -> rapid ($0.225), hero/buildings -> pro ($0.375).
Gate: `preflight.mjs check <id> mesh` must pass (manifest row, status concept-approved, canary
first, caps, 2-try rule) — then the real cost is logged with `preflight.mjs log`.
Input: the newest HF/fal concept for the asset (manifest concepts/ or fal-assets/concepts/<id>.png).
Output: fal-assets/production/models/<id>.glb (raw; compress with gltf-transform before shipping).
FAL_KEY from env, never printed. Dry-run by default.
"""
import base64, glob, json, os, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FAL = os.path.dirname(HERE)
ROOT = os.path.dirname(FAL)
PRICE = {"rapid": 0.225, "pro": 0.375}
HERO_FAMILIES = {"building", "agent"}


def concept_for(aid):
    c = sorted(glob.glob(os.path.join(HERE, "concepts", aid, "*.png")))
    c += [p for p in [os.path.join(FAL, "concepts", aid + ".png")] if os.path.exists(p)]
    return c[-1] if c else None


def req(url, key, body=None):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                               method="POST" if body is not None else "GET",
                               headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=120))


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("--"):
        sys.exit(__doc__)
    aid, go = args[0], "--go" in args
    M = json.load(open(os.path.join(HERE, "manifest.json"), encoding="utf-8"))
    row = next((a for a in M["assets"] if a["id"] == aid), None)
    if not row:
        sys.exit(f"BLOCKED: no manifest row {aid}")
    tier = args[args.index("--tier") + 1] if "--tier" in args else ("pro" if row["family"] in HERO_FAMILIES else "rapid")
    src = concept_for(aid)
    if not src:
        sys.exit(f"BLOCKED: {aid} has no concept image")
    chk = subprocess.run(["node", os.path.join(HERE, "preflight.mjs"), "check", aid, "mesh"], capture_output=True, text=True)
    print(chk.stdout.strip())
    if chk.returncode != 0:
        sys.exit(1)
    endpoint = f"fal-ai/hunyuan-3d/v3.1/{tier}/image-to-3d"
    print(f"asset {aid} · concept {os.path.relpath(src, FAL)} · {endpoint} · ${PRICE[tier]}")
    if not go:
        print("DRY RUN — add --go to spend")
        return
    key = os.environ.get("FAL_KEY") or sys.exit("BLOCKED: FAL_KEY not in env")
    data_uri = "data:image/png;base64," + base64.b64encode(open(src, "rb").read()).decode()
    body = {"input_image_url": data_uri}
    if tier == "pro":
        body["enable_pbr"] = True
    sub = req(f"https://queue.fal.run/{endpoint}", key, body)
    t0 = time.time()
    while True:
        st = req(sub["status_url"], key)
        if st.get("status") == "COMPLETED":
            break
        if st.get("status") not in ("IN_QUEUE", "IN_PROGRESS") or time.time() - t0 > 900:
            sys.exit(f"STOP: fal status {st.get('status')}")
        time.sleep(5)
    res = req(sub["response_url"], key)
    url = (res.get("model_glb") or {}).get("url")
    if not url:
        sys.exit("STOP: no GLB in response: " + ",".join(res.keys()))
    out = os.path.join(HERE, "models"); os.makedirs(out, exist_ok=True)
    dst = os.path.join(out, aid + ".glb")
    open(dst, "wb").write(urllib.request.urlopen(url, timeout=300).read())
    thumb = (res.get("thumbnail") or {}).get("url")
    if thumb:
        open(os.path.join(out, aid + "-thumb.png"), "wb").write(urllib.request.urlopen(thumb, timeout=120).read())
    subprocess.run(["node", os.path.join(HERE, "preflight.mjs"), "log", aid, "mesh", str(PRICE[tier]),
                    f"{endpoint} from {os.path.basename(src)}"], check=False)
    print(f"saved production/models/{aid}.glb ({os.path.getsize(dst) / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()

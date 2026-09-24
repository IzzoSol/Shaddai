#!/usr/bin/env python
"""SHADDAI · hf-concept.py — concept images on HUGGING FACE credits (never the $100 fal).

  python fal-assets/production/hf-concept.py <asset-id> [--n 2] [--provider wavespeed] [--go]

DRY-RUN by default: prints the ref it picked + the exact prompt and spends nothing.
--go runs FLUX.1-Kontext-dev (image edit) through HF Inference Providers and saves to
fal-assets/production/concepts/<id>/. Auth = HF_TOKEN env or `hf auth login` — this
script never reads the keys vault.

Gates (same spirit as preflight.mjs): asset must be in manifest.json, status
ready-concept (not needs-ref / cut), and at most 2 --go runs per asset — a third
means the PROMPT is wrong, not the dice. Then the OWNER looks at the board and flips
status to concept-approved; only after that may fal spend on a mesh.
"""
import argparse, glob, io, json, os, sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
FAL = os.path.dirname(HERE)
MODEL = "black-forest-labs/FLUX.1-Kontext-dev"      # image edit (has a ref)
T2I_MODEL = "black-forest-labs/FLUX.1-dev"          # text only (no ref)


def tokens():
    """HF_TOKENS (comma-separated) > HF_TOKEN > ~/.shaddai/hf_tokens.txt (one per line). Never printed."""
    out = [t.strip() for t in os.environ.get("HF_TOKENS", "").split(",") if t.strip()]
    if os.environ.get("HF_TOKEN"): out.append(os.environ["HF_TOKEN"].strip())
    f = os.path.join(os.path.expanduser("~"), ".shaddai", "hf_tokens.txt")
    if os.path.exists(f): out += [l.strip() for l in open(f, encoding="utf-8") if l.strip().startswith("hf_")]
    seen = []
    for t in out:
        if t not in seen: seen.append(t)
    return seen or [None]   # None = huggingface_hub's own `hf auth login` cache


def call_with_rotation(fn):
    """Try each token; move on for out-of-credit / rate-limit / no-scope. All rate-limited = stop."""
    toks, limited = tokens(), 0
    for i, t in enumerate(toks):
        try:
            return fn(t), i + 1
        except Exception as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            msg = str(e).replace(t or "", "hf_***")[:160]
            if code in (402, 403, 429) or "credit" in msg.lower() or "rate" in msg.lower():
                limited += code == 429
                print(f"  key #{i + 1}: HTTP {code} — trying next key")
                continue
            raise
    sys.exit("STOP: every HF key is out of credit or rate-limited" if limited == len(toks) else "STOP: no HF key could run this (see codes above)")

# Verbatim from fal-assets/forge.mjs POSE — the wording that survives auto-rigging. Do not reword.
POSE = ("standing in a strict scarecrow T-POSE facing the camera dead-on: "
        "BOTH ARMS LOCKED COMPLETELY STRAIGHT OUT HORIZONTALLY TO THE SIDES at exactly shoulder "
        "height, elbows perfectly straight, both open empty hands with fingers spread, a large "
        "visible gap of empty background between each hand and the torso, nothing held (no weapon, "
        "no gear, hands completely empty), legs straight shoulder-width apart.")


def load():
    M = json.load(open(os.path.join(HERE, "manifest.json"), encoding="utf-8"))
    return M, {a["id"]: a for a in M["assets"]}


def pick_ref(a):
    """Owner drops win; otherwise the tallest (most full-body) image on file."""
    from PIL import Image
    dropped = sorted(glob.glob(os.path.join(HERE, "refs", a["id"], "*.*")))
    cands = [p for p in dropped if p.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
    cands += [os.path.join(FAL, p) for p in (a.get("refs") or {}).get("have", [])]
    cands = [p for p in cands if os.path.exists(p)]
    if not cands:
        return None
    def tallness(p):
        w, h = Image.open(p).size
        return h / w
    return max(cands, key=tallness)


def build_prompt(M, a, ref_is_portrait):
    fam = a["family"]
    parts = []
    if fam == "agent":
        parts.append("Redraw this exact same character as a full-body character-sheet image. " + POSE)
        if ref_is_portrait:
            parts.append("The reference shows only the head and shoulders: invent a matching full body, "
                         "outfit and boots that continue the same design language, materials and colors.")
        parts.append("Keep the same face, hairstyle, skin tone, outfit design and colors. "
                     "Realistic adult proportions, about 7.5 heads tall, NOT chibi, NOT stylized short.")
        parts.append("Whole body visible head to toe with margin, feet flat on the ground, "
                     "plain flat mid-grey studio background, soft even studio light, no shadows on the backdrop.")
    else:
        parts.append("Redraw this as a " + M["family_rules"][fam] + " " + M["shot"])
    for k in ("silhouette", "palette", "emissive"):
        if a.get(k) and a[k] != "style_lock":
            parts.append(f"{k.capitalize()}: {a[k]}.")
    parts.append("Futuristic sci-fi. No text, no logos, no watermark, no extra characters, no props in hands.")
    return " ".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("--n", type=int, default=1, help="variants per run (default 1 — one image at a time)")
    ap.add_argument("--provider", default="wavespeed", help="HF provider: wavespeed | replicate | fal-ai")
    ap.add_argument("--go", action="store_true")
    ar = ap.parse_args()

    M, A = load()
    a = A.get(ar.id)
    if not a:
        sys.exit(f"BLOCKED: no manifest row '{ar.id}'")
    if a["status"] != "ready-concept":
        sys.exit(f"BLOCKED: {ar.id} is '{a['status']}' — concepts only run at 'ready-concept'")
    ref = pick_ref(a)
    from PIL import Image
    if ref:
        img = Image.open(ref).convert("RGB")
        portrait = img.size[1] / img.size[0] < 1.3
        prompt = build_prompt(M, a, portrait)
    elif a["family"] == "agent":
        sys.exit(f"BLOCKED: {ar.id} is an agent with no reference image on disk")
    else:
        img, portrait = None, False
        prompt = " ".join([M["style_lock"], M["family_rules"][a["family"]], M["shot"],
                           f"Subject: {a.get('silhouette', a['name'])}.", f"Scale: {a.get('dims', '')}.",
                           "NEGATIVE: " + M["negative"]])

    ledger_p = os.path.join(HERE, "hf-ledger.json")
    ledger = json.load(open(ledger_p, encoding="utf-8")) if os.path.exists(ledger_p) else {"entries": []}
    runs = [e for e in ledger["entries"] if e["id"] == ar.id]
    model = MODEL if img is not None else T2I_MODEL
    print(f"asset   {ar.id} ({a['name']})")
    print("ref     " + (f"{os.path.relpath(ref, FAL)}  {img.size} {'PORTRAIT' if portrait else 'full-body'}" if img is not None else "none — text-to-image"))
    print(f"model   {model} via HF provider '{ar.provider}' — billed to HUGGING FACE, not fal")
    print(f"runs    {len(runs)} previous --go run(s) of max 2\nprompt  {prompt}\n")
    if len(runs) >= 2:
        sys.exit("BLOCKED: 2 runs already — the prompt/ref is wrong. Change it, then clear this asset's hf-ledger entries by hand.")
    if not ar.go:
        print(f"DRY RUN — add --go to generate {ar.n} variant(s).")
        return

    from huggingface_hub import InferenceClient
    if img is not None:
        img.thumbnail((1024, 1024))
        buf = io.BytesIO(); img.save(buf, format="PNG")
        gen = lambda t: InferenceClient(provider=ar.provider, api_key=t).image_to_image(buf.getvalue(), prompt=prompt, model=model)
    else:
        gen = lambda t: InferenceClient(provider=ar.provider, api_key=t).text_to_image(prompt, model=model, width=1024, height=1024)
    out_dir = os.path.join(HERE, "concepts", ar.id); os.makedirs(out_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    saved = []
    for i in range(ar.n):
        res, keyno = call_with_rotation(gen)
        print(f"  generated with key #{keyno}")
        p = os.path.join(out_dir, f"{ar.id}-hf-{stamp}-{i + 1}.png"); res.save(p); saved.append(os.path.relpath(p, FAL))
        print("saved", saved[-1])
    ledger["entries"].append({"at": stamp, "id": ar.id, "provider": ar.provider, "model": model, "n": ar.n,
                              "ref": os.path.relpath(ref, FAL) if ref else None, "files": saved})
    json.dump(ledger, open(ledger_p, "w", encoding="utf-8"), indent=2)
    print("\nNext: node fal-assets/production/preflight.mjs  (board shows the concepts) → owner approves → status concept-approved")


if __name__ == "__main__":
    main()

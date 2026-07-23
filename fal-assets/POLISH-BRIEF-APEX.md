# TURTLE — POLISH BRIEF: "SEE THE APEX, KEEP THE FLOW"
### Add-only cinematic polish · lab-molecules.html (journey) + lab-dome.html (finale seam)
Palette LOCKED: obsidian `#06080b` (~80% frame) / emerald `#00ff9c` / gold `#e8c45c` / cold-cyan `#5fe0ff`. Procedural only. Bloom parity = molecule master. **Rule zero: DON'T REMOVE ANYTHING. Every note is an ADD or intensify-in-place.**

## 1. PYRAMID APEX FRAMING — reveal the top without breaking the blend
Drive an ADDITIVE crane on the second half of `uPDesert` (`pD` 0→1):
- **pD 0.00–0.45 — LOVED VIEW, untouched.** Keep current `camPosD.y`, `fwd`, `focalD`. Change nothing.
- **pD 0.45–0.80 — THE CRANE (marquee).** `camPosD.y += smoothstep(0.45,0.80,pD)*craneRise` (~+38..46, tune so apex clears top-frame ~pD 0.72); dolly back `camPosD.xz -= fwdXZ*smoothstep(0.45,0.80,pD)*60.0`; pitch `fwd.y += smoothstep(0.45,0.80,pD)*0.22`; narrow `focalD` toward 1.10 (telephoto compression). Optional ≤12° lateral arc `camPosD.xz += perpXZ*sin(smoothstep(...)*PI)*18.0` to reveal two lit faces + shadow face.
- **pD 0.80–1.00 — APEX HERO → SKY HAND-OFF.** Apex centered upper-third; crane final pitch MATCHES the dome tilt start pitch (zero seam). The apex reveal *becomes* the sky tilt.
- **Gold apex-glint = hero.** `apexUp=smoothstep(pyrH*0.7,pyrH,pyrY)`; `col += GOLD*pow(apexUp,3.0)*craneReveal*(0.6+rim*1.2)`, `craneReveal=smoothstep(0.45,0.85,pD)`. At pD~0.75 throw a crisp gold 4-point diffraction cross through the apex pixel — this glint is the bridge that becomes the first dome star.

## 2. ADDED DETAIL — add-only, analytic, on already-hit fragments only (NO new marches)
**Pyramid (hitPyr, on lp/hitPos):** per-course color-temp jitter via `hash11(crs)` (±6%, cyan↔gold lean ×0.02); mortar/seam lines (`fract` thin dark inset → `OBS*0.8`, lit-face hairline gold seam ×0.15); erosion `mix(1.0,0.82,fbm(lp*0.6))` concentrated near edges (reuse `dfbm`); apex capstone above `pyrY>pyrH*0.92` (kill mortar, spec exp ~90, albedo `mix(OBS,GOLD*0.4,apexUp)`); base weathered-brick rim tinted to match course temp.
**Dunes (hitSand, reuse N/w/wr):** sand-drift band at pyramid base (modulate existing ripple amp by `driftMask`); 2nd wind octave `+sin(wr.x*47-t*0.6)*0.09` + cross-streak `sin((wr.x+wr.y)*31)*0.06`; horizon 3rd far ridge merging to `OBS*0.95`.

## 3. MOONLIGHT — richer cold cyan-white, enhance never replace, hold 80% obsidian (all gated by bNight)
2nd tighter spec lobe `pow(dot(N,hV),120)*graze` ×0.06 (star-point on sharpest crests) + keep broad 42-lobe; mirror grazing spec into hitPyr lit face (×0.05 exp~60); moon-path sheen `pow(max(dot(N,moonDir),0),2)` × slow dfbm ×0.025; keep moon disc/glow exactly (bloom 0.22→0.26 ONLY if histogram ≥78% obsidian). After each add: histogram check; if luminance lifts, pull sand ambient base DOWN before touching highlights.

## 4. DESERT→DOME CONNECT (SEAM C) — never cut to black; REUSE the shared star buffer
- **C0 (pD~0.85→dome 0.15):** crane pitch continues straight up past apex-glint; apex glint = last desert element → FIRST bright dome star (same screen pos, hand luminance to a hero node).
- **C1 (dome 0.15–0.45):** `mix(planarStars,sphereStars,tilt)` — SAME star dirs, only curvature changes; Milky-Way dust continuous.
- **C2 (dome 0.45–0.75):** gold hairline constellation lines DRAW ON (`lineProgress` per segment), hairline gold = molecule-lattice weight; faint traveling shimmer (reuse bond-pulse). Lines connect shared hero stars → feel discovered.
- **C3 (dome 0.75–1.0):** Kether crown assembles as fine gold filigree + brightens at zenith. Held.
- **Carries across:** shared star buffer, apex-glint→hero star, Milky-Way whisper, single cold light dir, mouse-steer→drag-rotate with SAME inertia. Prev layer alpha stays 1.

## 5. CRISPNESS + FPS GUARDRAILS
Crisp = hard micro-contrast cores via the EXISTING composite unsharp sharpen: brick mortar (dark inset + bright lit-lip), star/line cores (sub-pixel bright center, bloom halo AROUND it), sand crest + apex glints (high spec exponent so sharpen finds an edge; apex diffraction cross needle-sharp). Never `ctx.filter` blur; softness only from bloom.
FPS rule (hard): NO added detail may cost framerate. Zero new marches — everything inside existing hitSand/hitPyr/sky branches on data already in registers. Crane is free (uniform math). Dome stars = existing shared buffer. Lean on the adaptive renderScale governor (authoritative). Cap new sin/pow to those specified; gate grain/moon-path behind bNight + distance falloff. Verify FPS before/after each add + histogram ≥78–80% obsidian; if either regresses, the add reverts — flow & framerate outrank detail. Confirm pD 0.00–0.45 blend is pixel-identical to before.

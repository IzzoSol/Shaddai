# SHADDAI Council — 3D-Model Pixel-Art Spec

**Purpose:** A definitive, buildable spec so another dev can recreate all 7 SHADDAI agents as matching pixel characters that read as **their actual 3D GLB models** — NOT the polished cinematic card portraits. Every description below is sampled from the model-source renders.

**Reference renders (authoritative source of truth for look):**
`fal-assets/model-refs/{NAME}-model.png` — SHADDAI-model.png is a real GLB render (most authoritative). The other six are the model-source design renders each GLB was built from.

**GLBs live at:** `public/assets/agents/{NAME}.glb`

---

## SHARED RIG FACTS (document once)

All 7 GLBs share a **~24-bone Meshy humanoid skeleton** with **~20 animation clips** aliased to canonical actions:

| Canonical action | Source clips it aliases |
|---|---|
| **idle** (default, upright loop) | dance / breath / groove / strut |
| **walk** | walk / Walking |
| **run** | run / sprint |
| **flip** | vault / backflip |
| **attack1** | kick / roundhouse |
| **attack2** | jab / punch |
| **heavy** | spin_kick |

Root motion is stripped (all clips play **in place**). Default state = upright **idle** loop. Because the skeleton is shared, every agent is the **same proportions and height** — build all 7 pixel sprites on the same body template so silhouettes stack. Only the shell/costume differs.

---

## 1. GLOBAL PIXEL STYLE GUIDE

**Locked 4-color world base** (~80% of every sprite is the dark base):
- Obsidian `#06080b` — dark base (silhouette body, shadow, ~80% coverage)
- Emerald `#00ff9c` — world neon
- Gold `#e8c45c` — world neon
- Cyan `#5fe0ff` — world neon

**Per-agent signature accent** (the ONE neon glow that identifies each character — overrides world neon on that sprite):

| Agent | Chakra | Accent |
|---|---|---|
| SHADDAI | Crown (Sahasrara) | `#c9a6ff` |
| ORACLE | Third Eye (Ajna) | `#8b7bf0` |
| QUILL | Throat (Vishuddha) | `#5fe0ff` |
| TURTLE | Heart (Anahata) | `#00ff9c` |
| NEXUS | Solar Plexus (Manipura) | `#e8c45c` |
| ZEROX | Sacral (Svadhisthana) | `#ff9a3c` |
| PIKADON | Root (Muladhara) | `#ff5a4d` |

**Rules:**
- **Silhouette-first.** Each agent must be recognizable as a black shape before any color. Draw the silhouette, then add rim + accent.
- **Neon rim-light on dark silhouette.** Body is obsidian; edges catch a thin 1px rim in the agent's accent (or gold/silver for the two non-armor robes).
- **Canvas 48×64** per frame (portrait), character ~44px tall, feet on baseline.
- **Per-sprite palette cap:** base obsidian + 2 shades (mid `#12161c`, light-edge `#20262e`) + **1 neon accent** (agent color) + 1 highlight (near-white `#eef2ff` for hottest glow pixels). That's the whole ramp — 5 colors + accent glow. Robed agents (SHADDAI, QUILL) swap the mid/light shades for their cloth colors.
- **Consistent head-height:** ~7px head, ~44px body = ~6.3 heads. Keep helmet/hood crest inside the 64px canvas.
- **Shared anim set** mirroring the 3D clips: idle (2–4 frame breath/sway), walk (4–6 frame cycle), run (4–6 frame), plus optional flip/attack pose frames. Idle is the default.
- Accent glow = place accent pixels ONLY on emissive points (visor, chest core, joint lights, glyph), then a 1px lighter-accent bloom halo. Never flood-fill the body with accent.

---

## 2. PER-AGENT SPECS

### SHADDAI — Crown (Sahasrara) · Supreme Orchestrator · ✧ · `#c9a6ff`
*(This is the real GLB render — most authoritative.)*

- **COSTUME PALETTE:** `#f4f2ec` (white cloak) · `#e8c45c` (gold armor) · `#b8860b` (deep gold shade) · `#1a1a1f` (black bodysuit/hands) · `#3a6ea5` (blue rune-panel on chest) · `#c9a6ff` (crown-halo accent glow)
- **SILHOUETTE:** Caped royal knight — spiked crown-halo ring behind head, broad gold pauldrons, long white cloak falling to boots.
- **HEAD/FACE:** Gold faceplate/mask with slit blue-glowing eyes; ornate pointed gold crown headpiece; a full **golden ring-halo studded with spikes** floating behind the head (the Crown signature).
- **BODY/OUTFIT:** White cloak draped over both shoulders; ornate gold plate armor over torso and legs with filigree/sacred-geometry etching; a glowing **blue central chest panel bearing Hebrew lettering** (משה / ארץ); black undersuit and black gloves; gold sabatons over black boots.
- **WEAPON/PROP:** None held — presence is the halo + cloak. Central chest rune-panel is the focal glyph plate.
- **SIGNATURE FX:** Spiked gold halo ring + soft `#c9a6ff` crown glow above the head.
- **PIXEL TRANSLATION (must read at 48×64):**
  1. **Spiked halo ring** behind head — draw as a gold arc of 5–7 spike-pixels; his #1 identifier.
  2. **White cloak** flanking a gold+black body (only agent that reads white/gold, not black).
  3. **Blue glowing chest plate** — 3×4px cyan-blue panel dead center.
  4. Gold crown crest on the head.
  - Accent `#c9a6ff` = a 1px halo bloom around the ring + faint aura over the crown; eyes are the blue slit.
  - **Idle pose:** stand tall, arms at sides, cloak still — regal.

### ORACLE — Third Eye (Ajna) · Research & Intelligence · ◉ · `#8b7bf0`

- **COSTUME PALETTE:** `#0d0b14` (black armor) · `#1c1826` (purple-black mid) · `#2a2438` (edge) · `#a24bff` (magenta-violet visor) · `#c9a0ff` (joint spark-lights) · `#8b7bf0` (accent glow)
- **SILHOUETTE:** Bulky armored sci-fi sentinel — smooth rounded helmet, heavy pauldrons, no cape, brawler stance.
- **HEAD/FACE:** Full **smooth black helmet with a large glowing violet visor** covered in a fine dotted/pixelated grid (no visible face). Rounded ear-pods on the sides.
- **BODY/OUTFIT:** Matte-black powered armor, heavy layered plates on chest/abs/thighs; a small violet under-glow strip beneath the chest; scattered tiny **glowing violet dot-lights** studded across shoulders, chest, knees; segmented gauntlets and armored boots.
- **WEAPON/PROP:** None — armored bruiser, empty clawed gloves.
- **SIGNATURE FX:** Dotted/starfield violet lights peppering the armor + violet visor glow.
- **PIXEL TRANSLATION:**
  1. **Big violet visor** on a smooth black dome helmet — the eye of the Third Eye; draw as a 4×3px `#a24bff` block with a dark grid dot.
  2. **Scattered accent dot-lights** — sprinkle 4–6 single `#8b7bf0` pixels across shoulders/knees.
  3. Heavy blocky pauldron silhouette (widest-shoulder agent).
  - Accent `#8b7bf0` = visor + dot constellation only; body stays pure obsidian.
  - **Idle pose:** feet planted wide, arms slightly out — heavy sentinel breath.
- **⚠ CANON CHECK:** The MODEL reads as an **armored black-and-violet sentinel/mech**, NOT the purple sorceress/seer look of a card portrait. Owner must confirm whether the pixel version matches the MODEL or the CARD.

### QUILL — Throat (Vishuddha) · Writing & Communication · ✒ · `#5fe0ff`

- **COSTUME PALETTE:** `#8a8560` (olive-tan robe) · `#6b6647` (robe shade) · `#3a3428` (brown wrap/belt) · `#1a1512` (black inner leggings) · `#5a3a2a` (leather boots) · `#5fe0ff` (throat accent — overlays the model's warm firefly glow)
- **SILHOUETTE:** Hooded robed monk/mage — deep pointed hood hiding the face, layered ragged-hem cloak flaring at the ground, tall laced boots.
- **HEAD/FACE:** Deep **hood with a pitch-black void where the face should be** (no visible features) — faceless mystery.
- **BODY/OUTFIT:** Layered olive/tan tattered robes over a darker under-robe; a wrapped rope/cloth belt knotted at the waist; forearms wrapped in dark cloth; black leggings; **brown laced leather boots**. Hems are frayed and torn.
- **WEAPON/PROP:** Holds a **single glowing feather quill** in both hands at chest height (the ✒ signature) — the model glows it warm orange; per canon recolor the quill/glow to throat cyan `#5fe0ff`.
- **SIGNATURE FX:** Glowing quill + a ring of glowing runes/sparks at the feet (recolor to cyan for canon).
- **PIXEL TRANSLATION:**
  1. **Deep hood + black void face** — instantly reads as the robed scribe.
  2. **Glowing quill held at chest** — 1px cyan feather with a hot-white tip; the single most important prop.
  3. **Flared ragged cloak hem** at the base + laced boots peeking out.
  - Accent `#5fe0ff` = quill glow + a faint cyan sparkle ring at the feet; robe stays olive/obsidian.
  - **Idle pose:** both hands cupping the quill at chest, cloak still, slight forward reverence.
- **⚠ CANON CHECK:** The MODEL is a **hooded olive-robed monk with a WARM ORANGE fire glow**; canon assigns QUILL the **cyan throat accent**. Confirm whether pixel keeps the model's warm glow or recolors to canon cyan.

### TURTLE — Heart (Anahata) · UI/UX & Creative · ❧ · `#00ff9c`

- **COSTUME PALETTE:** `#0a0d0c` (black armor) · `#13181a` (mid) · `#1e2528` (edge) · `#00e0c0` (teal visor) · `#00ff9c` (emerald accent) · `#ffcc33` (small amber indicator lights)
- **SILHOUETTE:** Bulky tactical **power-armor trooper** — rounded helmet with a shoulder-mounted pack, thick armored limbs, chunky boots.
- **HEAD/FACE:** Rounded black helmet with a wide **teal/emerald curved visor** and small orange side-nubs; a **teal-lit tech module mounted on the left shoulder/back**.
- **BODY/OUTFIT:** Heavy matte-black plated suit; chest and abdomen studded with a row of small **glowing rectangular indicator lights** — mixed emerald, cyan and amber (like an equalizer/status bar); segmented arm and leg plates; big armored gauntlets; oversized armored boots.
- **WEAPON/PROP:** None held — the shoulder-mounted glowing pack is the signature gear.
- **SIGNATURE FX:** Emerald visor + a row of multicolor status-lights down the chest (emerald dominant).
- **PIXEL TRANSLATION:**
  1. **Emerald curved visor** on a rounded black helmet.
  2. **Shoulder-mounted glowing module** (top-left) — 2×2px emerald block; distinguishes TURTLE from ORACLE.
  3. **Chest status-light row** — 3–4 tiny emerald/amber pixels stacked vertically center-chest.
  - Accent `#00ff9c` = visor, shoulder pack, chest lights; keep 1 amber pixel for contrast.
  - **Idle pose:** grounded trooper stance, arms relaxed, slight power-armor sway.
- **⚠ CANON CHECK:** The MODEL is a **tech power-armor trooper**, NOT a literal turtle/creature. Confirm the pixel keeps the armored-trooper read.

### NEXUS — Solar Plexus (Manipura) · Technical Architect · ⬡ · `#e8c45c`

*(Note: the model render glows GREEN, but canon assigns NEXUS the GOLD solar-plexus accent — see CANON CHECK.)*
- **COSTUME PALETTE:** `#0a0d0a` (black armor) · `#12161a` (mid) · `#1c2228` (edge) · `#39ff5a` (model's green glow) · `#e8c45c` (canon gold accent) · `#eefff0` (highlight)
- **SILHOUETTE:** Sleek humanoid **battlesuit** — angular full-face helmet, moderate pauldrons, utility belt, athletic (not bulky) build.
- **HEAD/FACE:** Angular black helmet with **no eyes — instead a horizontal grille/mouth of glowing bars** (like a vocoder/equalizer visor) glowing bright.
- **BODY/OUTFIT:** Fitted matte-black armor with clean paneling; **glowing round shoulder-orbs** (one per pauldron), a **glowing square chest-core** of vertical bars, glowing knee/forearm accents; a segmented **tactical utility belt** at the waist; armored boots.
- **WEAPON/PROP:** None — the glowing chest-core and shoulder-orbs are the signature.
- **SIGNATURE FX:** Grille-visor + round shoulder-orbs + square chest reactor, all lit.
- **PIXEL TRANSLATION:**
  1. **Grille/bar visor** (horizontal glowing lines) instead of eyes — unique face read.
  2. **Two round shoulder-orb lights** — single bright accent pixel on each shoulder.
  3. **Square chest-core** — 2×3px lit panel center-chest + utility belt line.
  - Accent = per canon `#e8c45c` gold on visor/orbs/core (or `#39ff5a` green if matching model — see below).
  - **Idle pose:** upright, hands loose at sides, athletic ready-stance.
- **⚠ CANON CHECK:** The MODEL glows **GREEN**; canon assigns NEXUS the **GOLD (`#e8c45c`)** solar-plexus accent. Confirm whether pixel uses model-green or canon-gold. (Green here also collides with TURTLE's emerald — a reason to prefer canon gold.)

### ZEROX — Sacral (Svadhisthana) · Wealth & Revenue · ◈ · `#ff9a3c`

- **COSTUME PALETTE:** `#0a0a0c` (black armor) · `#141418` (mid) · `#1e1e24` (edge) · `#ff7a1a` (orange circuit-lines) · `#ff9a3c` (sacral accent) · `#ff4d3d` (small red node lights)
- **SILHOUETTE:** Tall sleek **cyber-knight**, arms **crossed** over the chest — twin antennae rising from the helmet, thigh-mounted side packs.
- **HEAD/FACE:** Angular black helmet with a **V-shaped orange visor slit** and **two tall thin antennae** rising like horns from the crown (the ◈ signature); side ear-pods.
- **BODY/OUTFIT:** Matte-black armor traced with **glowing orange circuit-lines** running down the torso, hips and legs (Tron-like); round shoulder-emblem lights; **rectangular equipment packs mounted on both outer thighs**; small red accent nodes; armored boots.
- **WEAPON/PROP:** None held (arms crossed); the thigh side-packs read as gear/holsters.
- **SIGNATURE FX:** Orange circuit-line tracery flowing over black + antennae + V-visor.
- **PIXEL TRANSLATION:**
  1. **Two tall antennae** off the helmet — top identifier; draw as 2 vertical accent pixels.
  2. **Crossed-arms idle pose** — the only agent posed with arms folded.
  3. **Orange circuit-lines** — thin 1px `#ff9a3c` traces down center torso + thighs; **thigh side-packs** as small blocks.
  - Accent `#ff9a3c` = V-visor, antennae tips, circuit lines; 1 red pixel for the node.
  - **Idle pose:** arms crossed, confident stand (matches the model exactly).

### PIKADON — Root (Muladhara) · Security & Compliance · ⛨ · `#ff5a4d`

- **COSTUME PALETTE:** `#08080a` (black armor) · `#101014` (mid) · `#1a1a20` (edge) · `#ff3a2a` (red glow lines) · `#ff5a4d` (root accent) · `#ffd0c8` (hot highlight)
- **SILHOUETTE:** Bulky **riot/enforcer armor** — helmet with two forward/back-swept blade-antennae, heavy pauldrons, thigh side-packs, imposing wide stance.
- **HEAD/FACE:** Black helmet with a **downward-pointing red visor / face-vents** and **two curved blade-antennae swept off the top** (aggressive read); side ear housings.
- **BODY/OUTFIT:** Heavy matte-black plated armor edged with **glowing red seam-lines** across chest, waist and legs; **round red shoulder-emblem lights**; thick armored torso; **rectangular utility packs on both thighs**; small red vents at the shins; heavy armored boots. Reads as a guard/sentinel.
- **WEAPON/PROP:** None held — the armor + thigh packs are the gear; posture is the deterrent.
- **SIGNATURE FX:** Red seam-glow tracing the plate edges + red shoulder emblems + visor.
- **PIXEL TRANSLATION:**
  1. **Twin blade-antennae** + downward red visor — menacing helmet read (distinct from ZEROX's straight thin antennae).
  2. **Red glowing seam-lines** edging a heavy black silhouette + round red shoulder dots.
  3. **Thigh side-packs** + widest/bulkiest enforcer stance.
  - Accent `#ff5a4d` = visor, shoulder dots, seam-lines; hottest seams get a `#ffd0c8` highlight pixel.
  - **Idle pose:** wide grounded guard stance, arms out slightly — immovable.

---

## 3. CONSISTENCY CHECKLIST

- [ ] All 7 built on the **same body template**: ~7px head, ~44px body, feet on the 64px baseline (shared 24-bone rig = shared proportions).
- [ ] Every sprite is **~80% obsidian**; accent is emissive-points-only (never body flood-fill).
- [ ] Palette cap respected: obsidian + 2 shades + 1 accent + 1 highlight (robed agents swap shades for cloth colors).
- [ ] **Silhouette test:** each agent recognizable in pure black — SHADDAI (halo+cape), ORACLE (wide pauldrons+dome), QUILL (hood+cloak+quill), TURTLE (shoulder pack), NEXUS (slim+belt), ZEROX (straight antennae+crossed arms), PIKADON (blade-antennae+bulk).
- [ ] Only **SHADDAI** and **QUILL** break the "black armor" mold (white/gold royalty; olive robe). The other five are black cyber-armor differentiated by accent + helmet + gear.
- [ ] Correct accent hex per agent (SHADDAI `#c9a6ff`, ORACLE `#8b7bf0`, QUILL `#5fe0ff`, TURTLE `#00ff9c`, NEXUS `#e8c45c`, ZEROX `#ff9a3c`, PIKADON `#ff5a4d`).
- [ ] Shared anim set: idle (default) / walk / run, mirroring the GLB clip aliases; idle poses per-agent (ZEROX arms-crossed, QUILL quill-cupped, PIKADON wide guard).
- [ ] **4 CANON CHECKS unresolved** — owner to decide model-vs-card: ORACLE (sentinel vs sorceress), QUILL (warm-orange vs cyan), TURTLE (trooper vs creature), NEXUS (green vs gold).

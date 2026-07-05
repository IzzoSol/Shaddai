# SHADDAI Operative Forge — Master Asset Catalog (Revamped, AI-art optimized)

> Canonical asset spec for the Forge. Each asset has rich **"Prompt DNA"** (concatenated into the
> FLUX prompt) for high-fidelity, consistent generation. Source: owner's 2026-06-18 revamp.
> Mirror in Obsidian. **This drives all future HF generation — get it right before spending tokens.**

## Archetypes (thematic presets → pre-fill slots, then customize)
| Archetype | Core vibe | Key artistic elements |
|---|---|---|
| **Vanguard** | Unyielding protector, battle-hardened leader | Heavy gleaming armor, resolute stance, fiery auras |
| **Ghost** | Silent infiltrator, master of shadows/data | Sleek stealth tech-wear, enigmatic, void/digital auras |
| **Artisan** | Master builder, resourceful innovator | Practical durable attire, focused gaze, tools of creation |
| **Oracle** | Seer, keeper of ancient knowledge, cosmic guide | Ethereal robes, glowing symbols, cosmic/crystalline auras |
| **Street-Deity** | Urban legend, tech-savvy rebel | Stylish tech-wear, neon accents, glitch auras, defiant |
| **Gaia-Link** | Nature's guardian, conduit of the wild | Organic flowing attire, bioluminescent flora, living auras |
| **Psionic** | Mind-bender, reality-warper | Ethereal garments, glowing eyes, swirling psychic energy |
| **Harvester** | Rugged survivor, gatherer, master of the land | Durable utilitarian clothing, weathered, extraction tools |

## Slots & assets (name · Prompt DNA · rarity · archetypes)

### BODY (foundational form)
- **Humanoid** — "A perfectly sculpted human form, athletic and graceful, hyper-realistic skin textures and subtle muscle definition, cinematic high-resolution render." · Common · Vanguard/Artisan/Psionic/Harvester
- **Android** — "A sleek futuristic android chassis, seamless polished chrome and matte black panels, glowing internal circuitry through translucent sections, cyberpunk high-tech." · Uncommon · Ghost/Oracle/Street-Deity
- **Cyborg** — "A formidable cyborg, organic and synthetic seamlessly integrated, exposed metallic endoskeleton interwoven with living tissue, glowing optical implants, gritty post-human." · Rare · Vanguard/Street-Deity/Ghost
- **Sylvan-Form** — "An ethereal being of ancient gnarled wood and vibrant bioluminescent flora, bark-like skin, flowing moss, delicate leaf patterns, mystical nature-bound." · Rare · Gaia-Link/Harvester/Psionic
- **Xeno-Form (Alien)** — "An otherworldly entity, elongated elegant silhouette, smooth obsidian-like skin, subtle bioluminescent patterns, alien yet graceful anatomy, cosmic enigmatic." · Legendary (Unlockable) · Psionic/Oracle/Ghost
- _Removed: Battle-Robot (→Android/Cyborg), Anime (→style prompt)._

### HEADWEAR (defining crest)
- **Mage Hood** — "Deep flowing hood of dark enchanted fabric, face in dramatic shadow, intricate arcane embroidery glowing faintly, mystical secretive." · Common · Psionic/Oracle/Ghost
- **Neural Crown** — "Delicate glowing circlet of interwoven light and data streams, integrated with temples, advanced cognitive processing, high-tech ethereal." · Uncommon · Oracle/Ghost/Street-Deity
- **Oni Mask** — "Fearsome intricate Oni mask, lacquered metal, sharp stylized horns, glowing red eyes, samurai-cyberpunk fusion, power and intimidation." · Rare · Vanguard/Street-Deity
- **Tactical Headwrap** — "Rugged military-grade headwrap, durable weather-resistant fabric, integrated comms and night-vision optics, practical stealthy." · Common · Ghost/Harvester/Artisan
- **Explorer's Hat** — "Wide-brimmed weathered adventurer's hat, feathers and small intricate tools, sense of journey, rustic resourceful." · Common · Gaia-Link/Artisan/Harvester
- **Operator Cap** — "Modern tactical baseball cap, subtly branded, sleek low-profile, practical urban understated." · Common · Street-Deity/Ghost/Vanguard

### OUTFIT (attire of purpose)
- **Street-Tech Hoodie** — "Stylish oversized tech-wear hoodie, advanced breathable fabric, integrated LED strips, hidden compartments, urban rebellious functional." · Common · Street-Deity/Ghost/Artisan
- **Aegis Plate Armor** — "Imposing heavy plate armor, gleaming futuristic alloy, intricate engravings, glowing energy conduits, unyielding protective." · Rare · Vanguard/Cyborg
- **Leaf-Woven Mantle** — "Flowing organic mantle of iridescent leaves, bioluminescent vines, delicate petals, alive and nature-connected, ethereal ancient." · Uncommon · Gaia-Link/Psionic/Harvester
- **Tech-Kimono** — "Fusion of traditional elegance and tech: flowing smart-fabric kimono, holographic patterns, integrated data displays, sophisticated deadly." · Rare · Oracle/Ghost/Psionic
- **Nomad's Duster** — "Long weathered duster, durable earth-toned canvas, utility pouches and survival gear, endless journey, resilient independent." · Common · Harvester/Artisan/Vanguard
- **Psionic Robes** — "Flowing ethereal robes of shimmering translucent fabric rippling with unseen energy, subtle cosmic patterns, otherworldly contemplative." · Uncommon · Psionic/Oracle

### AURA (energetic signature)
- **Neon Pulse** — "Vibrant pulsating aura of electric neon, shifting electric-blue to magenta, glitching digital particles, energetic artificial." · Common · Street-Deity/Android/Ghost
- **Inferno** — "Fierce roaring inferno of hyper-realistic flames engulfing the operative, dramatic shadows, intense heat, volatile destructive." · Uncommon · Vanguard/Cyborg
- **Sprouting Vines** — "Gentle swirling aura of rapidly growing bioluminescent vines and glowing spores, life and growth, organic restorative." · Rare · Gaia-Link/Harvester/Psionic
- **Cosmic Nebula** — "Mesmerizing swirling nebula of stardust and miniature galaxies within the aura, profound ancient cosmic." · Legendary · Psionic/Oracle
- **Data-Stream** — "Cascading streams of glowing green hexadecimal code forming a digital shield, constant information flow, analytical protective." · Uncommon · Oracle/Ghost/Android
- **Whispering Mist** — "Subtle swirling mist of ethereal translucent vapor with faint glowing runes, mysterious elusive, hidden power." · Common · Ghost/Psionic/Gaia-Link

### HANDHELD (instrument of action)
- **Mage Staff** — "Gnarled ancient wooden staff topped with a brilliantly glowing multi-faceted crystal pulsing with arcane energy, powerful mystical." · Common · Psionic/Oracle/Gaia-Link
- **Cyber-Katana** — "Sleek futuristic katana, razor-sharp blade of shimmering energy, ergonomic high-tech hilt, deadly precise." · Uncommon · Vanguard/Ghost/Street-Deity
- **Holo-Tablet** — "Transparent glowing holographic data-tablet showing complex UI and real-time analytics, confident analytical grip, informative strategic." · Common · Oracle/Artisan/Ghost
- **Plasma-Scythe** — "Massive intimidating scythe, blade of crackling contained plasma energy, raw destructive power, formidable ancient." · Rare · Harvester/Vanguard/Gaia-Link
- **Aether-Orb** — "Levitating perfect sphere of swirling condensed magical energy held gently in palm, immense controlled power." · Legendary · Psionic/Oracle
- **Bio-Harvester** — "Sophisticated organic-tech extraction tool with glowing tendrils and sharp crystalline edge, efficient sustainable." · Uncommon · Harvester/Gaia-Link

### HAIR (flow of identity)
- **Natural Flow** — "Flowing realistic natural hair, elegant, catching the light, rich earthy tones." · Common · Humanoid/Artisan/Harvester
- **Silver Silk** — "Long shimmering silver hair cascading like liquid metal, ethereal sheen, futuristic elegant." · Uncommon · Android/Oracle/Psionic
- **Electric Blue** — "Vibrant electric-blue hair, sharp modern cut, subtle glowing highlights, bold cyberpunk." · Common · Street-Deity/Ghost/Cyborg
- **Verdant Tendrils** — "Hair of intertwining glowing green vines and delicate blossoms, alive and organic, nature-infused mystical." · Rare · Gaia-Link/Harvester
- **Crimson Flare** — "Intense fiery crimson hair, wild and untamed, radiating passionate energy, dynamic powerful." · Uncommon · Vanguard/Cyborg
- **Shadow Weave** — "Hair of inky blackness in intricate braids/dreadlocks absorbing all light, mysterious ancient." · Common · Ghost/Psionic

### EYES (gaze of intent)
- **Normal** — "Piercing highly-detailed expressive human eyes, deep emotion and intelligence, sharp focus." · Common · Humanoid/Artisan/Harvester
- **Glowing** — "Eyes radiating solid intense unnatural light (emerald/sapphire), no visible pupils, pure energy mystical." · Uncommon · Psionic/Oracle/Android
- **Scanner** — "Cybernetic eyes with glowing targeting reticles and data-overlays, constant processing, machine precision analytical." · Rare · Android/Ghost/Cyborg
- **Void-Stare** — "Eyes containing swirling miniature galaxies and nebulae, profound ancient all-seeing." · Legendary · Psionic/Oracle

### BACKGROUND (operative's domain)
- **Void** — "Pure infinite pitch-black void, dramatic studio lighting on the operative, minimalist impactful." · Common · All
- **Neon Cityscape** — "Blurred rainy cyberpunk cityscape at night, glowing neon signs, wet asphalt reflections, cinematic depth of field, urban futuristic." · Uncommon · Street-Deity/Ghost/Android
- **Ancient Grove** — "Serene ancient forest grove, sunlight through colossal trees, glowing flora, mystical mist, ethereal natural." · Rare · Gaia-Link/Harvester/Psionic
- **Matrix Rain** — "Cascading glowing green hexadecimal code, digital waterfall effect, hacking the system, cyber-reality." · Uncommon · Oracle/Android/Ghost
- **Astral Plane** — "Swirling multi-dimensional astral plane, cosmic dust, distant galaxies, shimmering energy, otherworldly infinite." · Legendary · Psionic/Oracle
- **Industrial Core** — "Massive humming industrial complex, glowing pipes, steam vents, heavy machinery, gritty powerful mechanical." · Common · Vanguard/Artisan/Cyborg

### ACCENT (factional hue)
- **Azure** (Common, All) · **Magenta** (Common, Street-Deity/Vanguard) · **Emerald** (Common, Gaia-Link/Harvester) · **Gold** (Rare, Oracle/Vanguard) · **Obsidian** (Uncommon, Ghost/Cyborg) · **Crimson** (Common, Vanguard/Street-Deity) — each = "primary color theme is <hue> with <treatment>."

## Style suffix (append to every prompt)
`premium NFT trading-card character portrait, dramatic rim lighting, volumetric glow, intricate fine
detail, sharp focus, centered bust, hint of 3D depth, no text, no watermark, no letters` + the
existing diverse-representation `ETHNIC` rotation in `forge-core.js`.

## Architecture — "three.ws-lite" turntable + embeddable widget
- **Action-figure turntable:** generate **8–12 angle renders** (0°…315°) per operative; the embed cycles
  them (drag / auto-rotate) for a 3D illusion. WebP, CDN-stored. ⚠️ COST: 8–12 FLUX gens **per forge**.
- **`<shaddai-agent agent-id>` web component:** lazy-loads, reads an `agent-manifest.json` (angle image
  URLs + brain + skills; IPFS-hostable), x402 micropayments on paid skills, CustomEvent bus to host page.

## Integration plan (from owner's instructions)
- **Phase 1:** reconstruct the Clips React/Vite `src/` (per `tsconfig.tsbuildinfo` map); add
  `src/features/operative-forge/` (move assets/core/sprites into `utils/`); `OperativeBuilder.tsx` with
  per-slot visual selectors + real-time `SpriteCompositor` preview + archetype prefill + live rarity;
  "Forge Operative" button w/ x402 cost confirm.
- **Phase 2:** `/api/forge/operative` endpoint → AURA-optimize prompt → dispatch FLUX job via
  `shaddai-orchestrator.js` → x402 debit (`x402-ledger-routes.js`) → store image; NFT-mint placeholder (Solana).
- **Phase 3:** perf (compositor), error handling, UX polish.

## ⚠️ OPEN DECISIONS (resolve before code/HF — see chat)
1. **Target codebase:** this plan says build the Forge into the **Clips React/Vite app** (reconstruct `src/`).
   Our working Forge is in the **single-file dashboard** (`SHADDAI-DASHBOARD-v93.html`, SVG compositor).
   → Build a new React Forge in Clips, OR upgrade the dashboard Forge to this catalog? (Big fork.)
2. **Turntable cost:** 8–12 FLUX renders **per forged agent** = real HF spend each forge. Confirm vs. a
   single front render now + multi-angle later.
3. **Catalog rename** changes asset keys (Xeno-Form, Tactical Headwrap, Holo-Tablet, etc.) → must update
   `forge-core.js` ASSETS **and** the dashboard's mirrored `A`/`SMAP`/`SPR` together (coordinated edit).

---
## Architecture decision (2026-06-18) — manifest-first, Pro-budget filter
Owner relayed ideas from Manus/Perplexity (no codebase context). Synthesis:
- **Already manifest-first:** `backend/lib/operatives.js` = the agent manifest (look/archetype/rarity/
  portrait = render; brain/persona/tools = behavior+capabilities; room/economy/stats = runtime). Forge
  writes it; gallery/Office/Marketplace read it. No rebuild needed.
- **ADOPT (cheap):** this catalog as render vocabulary; **single HF front render per forge** (turntable
  later); renderer stays swappable (vector card now → 3D later); optionally add `identity`/`behavior`/
  `permissions` fields + a small manifest validator.
- **DEFER (no budget now):** full 3D/glTF, 8–12-angle turntable, embeddable `<shaddai-agent>` web
  component, Clips React `src/` rebuild, full permission policy-engine + tool-registry overhaul.
- **Render-cost decision:** single front render per forge (confirmed).

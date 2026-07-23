# SHADDAI SITE SYSTEM — shared chrome + nav for every page
Build target: a cohesive multi-page cinematic site. EVERY page must feel like ONE product. Read this + `public/home.html` (the design source of truth) and reuse its chrome EXACTLY.

## LOCKED (never deviate)
- Palette: obsidian `#06080b` (~80% of every frame) · emerald `#00ff9c` · gold `#e8c45c` · cyan `#5fe0ff`. NOTHING else glows. No purple, no Inter, no AI-slop.
- Fonts (already linked in home.html): Cinzel (display), Fraunces (serif/italic), IBM Plex Mono (labels/nav/mono).
- Design tokens: LIFT the exact `:root{...}` CSS variables from `public/home.html` verbatim (--void, --emerald, --gold, --cyan, --ink, --f-display, --f-serif, --f-mono, --gutter, --maxw, --ease, etc.).
- Neon-outline type recipe (wordmark + section headings):
  `.neon{ color:transparent; -webkit-text-stroke:1.4px var(--emerald); text-shadow:0 0 6px rgba(0,255,156,.55),0 0 20px rgba(0,255,156,.32); paint-order:stroke fill; }` (+ gold variant).

## SHARED CHROME — every page includes ALL of these, identical to home.html
1. **Custom cursor** (`#cursor` emerald ring+dot; `.hot` gold on hover; hidden on touch).
2. **Grain + vignette overlay** (body::after SVG fractal-noise grain; body::before radial vignette).
3. **Top ledger bar** (`.bar`) with `◈ SHADDAI` wordmark (links to `/home.html`) + the **6-pillar MEGA-NAV** (below) + a live status pill.
4. **6-PILLAR MEGA-NAV** — hover/tap opens a manuscript-style dropdown panel per pillar (hairline gold dividers, mono sub-labels, tiny emerald "LIVE" badges, staggered reveal). EXACT pillars + destinations:
   - **ENTER**: The Descent `/lab-molecules.html` LIVE · Command Deck `/dashboard` LIVE · 3D World `/SHADDAI-WORLD-3D.html` LIVE · Pixel City `/pixel-city.html` (Preview)
   - **THE COUNCIL**: Meet the Seven `/agents.html` LIVE · The Forge `/forge-about.html` LIVE · Agent Rooms (soon) · The Villain (soon)
   - **CREATE**: Overview `/create.html` · The Forge `/forge-about.html` LIVE · Model Gallery `/model-gallery.html` LIVE · Media Studio (soon) · Skills & Tools (soon)
   - **PLAY**: Overview `/play.html` · The Arcade `/arcade.html` LIVE · Gridiron · Neon Hoops · Dodgeball · Starfall (list)
   - **INTELLIGENCE**: Overview `/intelligence.html` · Markets & Data `/data-api.html` LIVE · AURA Token-Saver `/aura.html` LIVE
   - **LEARN**: Overview `/learn.html` · The Codex `/codex.html` LIVE · The Covenant `/pricing.html` LIVE · Docs (soon)
   Mobile (≤720px): collapse to a menu button opening a full-screen sacred-tech panel with the same pillars.
5. **Footer** (`.foot`) matching home.html (wordmark line · social/codex links · "bound in ink · gold · emerald").
6. Back-to-home affordance (the top-bar wordmark).

## QUALITY BAR (every page)
- ~80% obsidian by area every frame. Reveal-on-scroll (IntersectionObserver `.reveal`→`.in`). Cinematic but FAST — pure CSS motion, no heavy libs (GSAP already on home is fine; don't add others). No per-frame filter blur.
- Responsive: 1180px max content, breakpoints at 720px + 480px. Accessible: keyboard-open menus, focus-visible, aria, `prefers-reduced-motion` honored.
- Distinctive + intentional (frontend-design principles): a memorable hero per page, sacred-geometry accents, neon-outline headings, generous rhythm.
- Single self-contained HTML file each. Locked palette. Keep everything that already works — do not remove loved features.

## PILLAR PAGE CONTENT (the 4 new overview pages)
Each = a themed landing: neon-outline hero (pillar name + one-line creed) → 2-4 rich sections presenting that pillar's offerings as cards/tiles that link to the REAL destination pages (mark aspirational items "soon"). ~80% obsidian, sacred-geometry hero accent.
- **create.html — "CREATE · the studios"**: The Forge (build your own operative — skills, tools, body, name) `/forge-about.html` · Model Gallery (GLB agents & buildings) `/model-gallery.html` · Media Studio (FLUX image + video — soon) · Skills & Tool Registry (soon). Creed: forge minds and give them form.
- **play.html — "PLAY · the arcade"**: The Arcade `/arcade.html` + the neon sports (Gridiron, Neon Hoops, Dodgeball, Starfall) + the Skill Engine (agent skills → game abilities). Creed: agent skills become play.
- **intelligence.html — "INTELLIGENCE · markets, data, AURA"**: Markets & Data (keyless crypto Data API) `/data-api.html` · AURA token-saver (open-source npm `shaddai-aura` + MCP) `/aura.html` · a live AURA ledger readout (fetch `/api/aura/stats` like home.html does; count-up). Creed: see the whole board, spend coin last.
- **learn.html — "LEARN · the codex"**: The Codex `/codex.html` · The Covenant (pricing) `/pricing.html` · Docs (soon) · Open source (AURA, Clipper — soon). Creed: the lore, made legible.

## VERIFY (each page, headless puppeteer @ http://localhost:3000/<file>)
0 console/page errors; the mega-nav opens each pillar; mobile menu works at 480px; screenshots of the hero + a mega-menu open + one content section. Server runs on :3000 (behind an auto-restart keeper).

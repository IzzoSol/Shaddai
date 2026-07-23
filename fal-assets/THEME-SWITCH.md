# SHADDAI THEME SWITCHER — two worlds, one toggle
A persisted toggle that flips the site between its two aesthetics. Distinctive, production-grade (frontend-design craft), not a generic switch.

## The two themes (applied via `data-theme` on `<html>`; persisted in localStorage key `shaddai-theme`)

### `neon` — "The Terminal" (home's native / codex's alternate)
Dark cinematic sacred-tech. obsidian `#06080b` base (~80%), neon emerald `#00ff9c`, gold `#e8c45c`, cyan `#5fe0ff`. Fonts: Cinzel Decorative / Chakra Petch / Fraunces / IBM Plex Mono. Glows ON, grain overlay, custom cursor, luminous.

### `codex` — "The Manuscript" (codex's native / home's alternate)
Light illuminated-manuscript. paper `#ece4d3` base, paper2 `#e4dac6`, ink `#191510`, ink-soft `#3b342a`, gold-ink `#9c7c26`, gold2 `#c4a24e`, faint `#b3a586`, hairline ink borders. Fonts: Cinzel / Fraunces / IBM Plex Mono. Glows OFF/muted → replaced by 1px ink rules, drop-cap flourishes, deckled edges, letterpress feel. Grain becomes a subtle paper-fiber texture.

## How to implement on EACH page
1. Both pages must drive their visuals from theme variables. Add a `[data-theme="codex"]` (on neon-native pages) OR `[data-theme="neon"]` (on codex-native page) CSS block that OVERRIDES the existing palette variables to the other theme's values, AND neutralizes theme-specific effects:
   - neon→codex on home: remap `--void`→paper, `--void2`→paper2, `--ink`→#191510, `--emerald`/`--gold`/`--cyan`→ink/gold-ink tones; DISABLE neon `text-shadow`/`box-shadow` glows + `mix-blend-mode:screen`; swap the grain SVG for a faint paper texture; hairline borders become `1px solid rgba(25,21,16,.2)`; neon-outline headings become solid ink/gold with a thin stroke, no glow.
   - codex→neon on codex: remap paper→obsidian, ink→#e9efe9, gold-ink→emerald/gold; add restrained neon glow; dark grain.
2. **Background swap:** on home in `codex` mode, HIDE the descent iframe + show a parchment texture with faint ink sacred-geometry (no dark WebGL behind a light page). In `neon` mode keep the descent-bg. On codex in `neon` mode, darken its paper background to obsidian.
3. Keep contrast/readability excellent in BOTH modes (WCAG-ish). Everything that works must keep working in both themes.

## The toggle (build it beautifully — this is a hero micro-interaction)
- Place in the top bar (right side, near the status pill). A single control that reads as two worlds: e.g. a segmented emblem **◈ TERMINAL  /  ✦ CODEX** or a sigil that morphs (neon obsidian glyph ⟷ illuminated gold seal) with a smooth crossfade/rotate transition. Label current state in mono.
- Click flips the theme, animates the transition (fade the palette over ~.5s via a transition on the root, or a brief wipe), and writes `localStorage.shaddai-theme`.
- Keyboard accessible (button, focus-visible, aria-pressed), respects prefers-reduced-motion (instant swap).

## Persistence + cross-page
- On load: `var t=localStorage.getItem('shaddai-theme'); if(t) document.documentElement.setAttribute('data-theme',t); else` use the page's native default (home→neon, codex→codex) and set the attribute. Do this BEFORE paint (inline script in <head>) to avoid a flash.
- Switching on one page persists → the other page opens in the chosen theme.
- Same localStorage key + same two theme names on both pages so they stay in sync.

## Verify (each page)
0 console errors; toggling flips ALL colors/fonts/background correctly (no half-themed elements, no unreadable text); the choice persists on reload; both themes look intentional and polished. Screenshot each page in BOTH themes.

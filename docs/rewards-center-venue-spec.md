# ASIMOV/NVIDIA Rewards Center — Visual & UX Spec (TURTLE)

## District & Aesthetic
- **District: Nexus** (cyan tech quarter). Neon-lit arcade facade, holographic NVDAx Chrome trim, ASIMOV token sigil over the door.
- **Facade (2D, 16px tiles, 48x48 sprite):** obsidian base `#0a0e1a`, gold signage `#e8c45c`, emerald energy strips `#00ff9c`, cyan holographic windows. Night-lit: windows glow cyan pulse (2s loop). Doorway arch with ASIMOV ⚙ sigil.
- Reference: `world-map-concept.html` district cell pattern; `office-workflow-redesign.html` panel corner brackets.

## Interior Layout (5 zones, top-down 2D)
1. **Lobby** — welcome kiosk, daily-cap progress ring, cosmetics preview mannequin.
2. **Match Arena** — center stage, 2-player match surface, score HUD, countdown timer.
3. **Leaderboard Wall** — right wall, top-10 Sparks earners, per-player avatar + NVDAx badge.
4. **Cosmetics Display** — left wall, 3 pedestals (Neon Skin, Gold Cat Announcer, NVDAx Chrome), preview carousel.
5. **Pool Status Ticker** — bottom strip, scrolling balance/earnings/cap.

## Mobile Controls (touch)
- Left: virtual thumb stick (movement) — cyan ring, emerald knob.
- Right: 3 action buttons — A (jump/dash) gold, B (interact) emerald, C (special) cyan. 48px min tap targets, 8px gap.
- Above stick: pause ⏸. Haptic on hit.

## Cosmetics Display
- Pedestal = 48x48 sprite, hover → 2x preview with rotation.
- Unlocked: gold border + emerald check. Locked: desaturated + price in Sparks.
- Preview modal: 3D turntable (lazy, desktop only), equip button.

## Pool Status Ticker
- Bottom strip, mono font, scrolls: `POOL: 12,450 Sparks · YOU: 340 · DAILY CAP: 500/1000`.
- Color: pool balance cyan, your earnings gold, cap emerald→red when >80%.
- Tap → expands to breakdown modal (per-game earnings, cap reset timer).

## 3D Counterpart (Pro-only, lazy)
- Three.js scene, GLB arcade cabinet + neon signage, bloom post-processing.
- Desktop-only, `IntersectionObserver` lazy-load, fallback to 2D sprite on mobile/low-end.
- Camera: isometric 45°, orbit disabled on touch.

## Color Palette (SHADDAI canonical)
| Token | Hex | Use |
|-------|-----|-----|
| Obsidian | `#0a0e1a` | Base surfaces |
| Gold | `#e8c45c` | Accents, CTAs, unlocked |
| Emerald | `#00ff9c` | Energy, success, caps OK |
| Cyan | `#5fe0ff` | Holographic, tech, highlights |
| Red | `#ff4d6d` | Cap warning, sell |
| Violet | `#a98bff` | ASIMOV token |

- Motion: 200ms ease transitions, glow pulses 2s, scanline overlay 4% opacity.
- Typography: Chakra Petch (display), Share Tech Mono (data). Consistent with office-workflow-redesign.html.
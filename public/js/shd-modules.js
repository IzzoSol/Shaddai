/* ══════════════════════════════════════════════════════════════════════
   SHADDAI — MODULE REGISTRY  (shd-modules.js)

   The single source of truth for the new front door. Two screens read it:

     /enter.html   — the 4-tile selector (4 slots, swappable from LIBRARY)
     /simple.html  — Simple Mode (the swivel wheel + its sub-menus)

   Nothing here touches the backend. Every `href` points at a page that
   already exists in /public (verified 2026-08-27).

   `art` plates live in /public/assets/enter/ and were generated with
   FLUX.1-schnell via the Hugging Face router (nscale provider), 2026-08-28.
   Prompts and the regeneration script are recorded in
   docs/FRONT-DOOR-MASTER-PROMPT.md §8 — they are deliberately near-black
   and low-clutter because each plate sits BEHIND a neon solid and heavy
   lettering at 30-46% opacity. Every path is a plain string: to replace a
   plate, drop in a new file and change nothing else.

   ── FUTURE TODO · VOICE MODE ────────────────────────────────────────────
   Voice mode (ask the RAG brain a question out loud, hear it answer) is
   EXPLICITLY OUT OF SCOPE for this pass and is NOT implemented anywhere.
   When it is built, it becomes one more entry in LIBRARY below plus one
   more category in WHEEL — no structural change required. Do not wire a
   microphone, a speech API, or an audio endpoint until that is scoped.
   ────────────────────────────────────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── palette ──────────────────────────────────────────────────────────
     Locked theme: obsidian ground, emerald / gold / cyan / violet accents.
     Mirrors the tokens in home.html + journey.html — do not invent new hues. */
  /* TWO HUES, ON PURPOSE.

     This was six — emerald, gold, cyan, violet, rose, amber — one per door.
     Six saturated hues sitting in a grid does not read as a palette, it reads
     as a colour wheel, and the front door is the first thing anyone sees.

     The brand is obsidian, emerald and gold. Everything else was noise, so the
     doors now differentiate by GEOMETRY, WEIGHT and TYPOGRAPHY rather than by
     hue — which is the harder and better way to do it. Restraint reads as
     considered; a rainbow reads as undecided.

     cyan/violet/rose/amber remain as aliases so nothing that references them
     breaks, but they all resolve into the two-hue system. Do not reintroduce a
     third accent without a reason that survives being said out loud. */
  var C = {
    emerald: '#00ff9c',   // the brand. default for anything active or primary
    gold:    '#e8c45c',   // value, money, premium, the council itself
    dim:     '#4a7a68',   // a desaturated emerald for secondary doors
    // aliases — collapsed deliberately, see above
    cyan:    '#00ff9c',
    violet:  '#e8c45c',
    rose:    '#e8c45c',
    amber:   '#e8c45c'
  };

  /* ── the modules ──────────────────────────────────────────────────────
     `geo` names a procedural sacred-geometry solid drawn live in the tile
     (see enter.html → TILE_GEOMETRY). `blurb` is the dwell-reveal copy. */

  var MODULES = [
    {
      // id stays 'descent' on purpose: it is the key saved in a visitor's slot
      // arrangement (shd_enter_slots). Renaming it would silently reset their
      // layout. Only the presentation and target changed.
      id: 'descent',
      name: 'ASCEND',
      kicker: 'The cinematic entry',
      blurb: 'The ascent — from the quantum lattice at Malkuth up through the scales of matter to the stars. Full screen, so it actually gets seen.',
      href: '/lab-molecules.html',
      art: '/assets/enter/descent.jpg',
      accent: C.cyan,
      geo: 'icosa'
    },
    {
      id: 'entry',
      name: 'MAIN',
      kicker: 'The main site',
      blurb: 'The main site. What SHADDAI is, how it works, the seven agents, the worlds, the arcade and the brain — the whole story, in order.',
      href: '/home.html',
      art: '/assets/enter/entry.jpg',
      accent: C.gold,
      geo: 'dodeca'
    },
    {
      id: 'dashboard',
      name: 'DASHBOARD',
      kicker: 'Straight in',
      blurb: 'Skip the fanfare. The Command Hub, sign-in, and every tool exactly where you left them. For people who already know what they came for.',
      href: '/dashboard',
      art: '/assets/enter/dashboard.jpg',
      accent: C.emerald,
      geo: 'lattice'
    },
    {
      id: 'simple',
      name: 'SIMPLE',
      kicker: 'One thumb, everything',
      blurb: 'A single object you spin with your thumb. Every part of SHADDAI on one wheel — agents, games, signals, forge, worlds. Swivel, sit on a choice to read it, tap to enter.',
      href: '/simple.html',
      art: '/assets/enter/simple.jpg',
      accent: C.violet,
      geo: 'drum'
    },

    /* ── library: not in a slot by default, swappable into any of the 4 ── */
    {
      id: 'rag',
      name: 'RAG BRAIN',
      kicker: 'The council’s memory',
      blurb: 'The knowledge graph behind every agent. Ask it anything and every answer is cited back to the exact passage it came from. No invention.',
      href: '/brain.html',
      art: '/assets/enter/rag.jpg',
      accent: C.emerald,
      geo: 'graph'
    },
    {
      id: 'world2d',
      name: '2D WORLD',
      kicker: 'Walk the city',
      blurb: 'The walkable pixel world. The seven agents live here as characters you can approach, talk to, and put to work.',
      href: '/SHADDAI-WORLD.html',
      art: '/assets/enter/world2d.jpg',
      accent: C.gold,
      geo: 'isogrid'
    },
    {
      id: 'world3d',
      name: '3D WORLD',
      kicker: 'The full realm',
      blurb: 'The dimensional build of the same world — terrain, districts, interiors, and the council halls, rendered in full 3D.',
      href: '/world3d',
      art: '/assets/enter/world3d.jpg',
      accent: C.cyan,
      geo: 'terrain'
    },
    {
      id: 'arcade',
      name: 'ARCADE',
      kicker: 'Play',
      blurb: 'Every game in the empire in one hall — the climb, the courts, the arenas, the tactics board.',
      href: '/arcade.html',
      art: '/assets/enter/arcade.jpg',
      accent: C.amber,
      geo: 'octa'
    },
    {
      id: 'agentforge',
      name: 'FORGE',
      kicker: 'Build your own agent',
      blurb: 'Name it, choose what it can really do, give it a personality or none at all, and open its wallet. Four questions and it is hireable.',
      href: '/agent-forge.html',
      art: '/assets/nav/forge.jpg',
      accent: C.violet,
      geo: 'icosa'
    },
    {
      id: 'connect',
      name: 'CONNECT',
      kicker: 'Your keys · your assistant',
      blurb: 'Plug in the accounts you already pay for, and point your own Claude or Grok at the council. Twenty-two connectors, and we take nothing on what you make.',
      href: '/connectors.html',
      art: '/assets/nav/apis.jpg',
      accent: C.emerald,
      geo: 'cube'
    },
    {
      id: 'manual',
      name: 'MANUAL',
      kicker: 'How all of it works',
      blurb: 'The booklet — Sparks, the council, the forge, every game and its controls, and the flywheel. Read it like a cartridge manual.',
      href: '/manual.html',
      art: '/assets/nav/apis.jpg',
      accent: C.gold,
      geo: 'dodeca'
    },
    {
      id: 'signals',
      name: 'SIGNALS',
      kicker: 'ZEROX calls',
      blurb: 'Live market and coin intelligence from ZEROX — scored, timestamped, and tracked by hit rate rather than vibes.',
      href: '/signals.html',
      art: '/assets/enter/signals.jpg',
      accent: C.rose,
      geo: 'chart'
    }
  ];

  /* The four that occupy the slots on a first visit. A visitor's own
     arrangement overrides this and lives in localStorage (shd_enter_slots). */
  /* Six doors, not four. The brain earned a permanent slot — it is the thing
     that makes the council different from a chat box, so hiding it behind the
     library was wrong. Arcade rounds the grid to 3x2. */
  /* MANUAL sits on the front door on purpose: the most common first question
     is "what is this and how does it work", and the answer should not be two
     taps deep. ARCADE moves to the library — games matter, but not before
     someone understands the product, and most are not playable on a phone. */
  /* FOUR DOORS, and Simple Mode is not one of them.

     Six tiles asked a first-time visitor to make a six-way choice before they
     knew what any of it was. These four are the whole product in one row —
     the cinematic way in, the workstation, the front page, and the library.

     Simple Mode moves OUT of the grid and becomes the glowing button above it,
     because it is not a peer of these: it is a different way to reach all of
     them. A thing that contains the others should not sit beside them. */
  var DEFAULT_SLOTS = ['descent', 'dashboard', 'entry', 'rag'];

  /* ── Simple Mode wheel ────────────────────────────────────────────────
     Top level spins vertically. A category with `items` swivels down into
     its own wheel of sub-items using the identical motion — the pattern is
     recursive, so any category can gain a sub-wheel by adding `items`. */

  var WHEEL = [
    {
      id: 'do',
      name: 'DO',
      accent: C.emerald,
      art: '/assets/nav/automation.jpg',
      blurb: 'Put the council to work. Pick a job and it runs end to end.',
      /* WAS: 'ORACLE', 'CHECK IT', 'WRITE IT' — three ways to ask a question,
         which is what the BRAIN tab is for. A tab called DO should DO things.
         These are whole outcomes a person would actually want, each one a real
         multi-agent workflow rather than a single prompt.

         `requiresAuth` greys the tile and asks for a quick sign-in instead of
         failing after the tap. A job that produces a file and charges Sparks
         genuinely cannot run for an anonymous visitor — but finding that out
         AFTER committing to it is the worst version of the same rule. */
      items: [
        { id: 'wf-content', name: 'CONTENT PACK', accent: C.emerald, art: '/assets/nav/automation.jpg',
          href: '/index.html#workflow', requiresAuth: true,
          blurb: 'Ten posts in one voice. QUILL writes, TURTLE makes the art, you approve.' },
        { id: 'wf-coin', name: 'CHECK A COIN', accent: C.gold, art: '/assets/nav/markets.jpg',
          href: '/signals.html', requiresAuth: false,
          blurb: 'ZEROX reads the chain and PIKADON checks the contract. Free to look.' },
        { id: 'wf-research', name: 'RESEARCH BRIEF', accent: C.emerald, art: '/assets/nav/apis.jpg',
          href: '/index.html#workflow', requiresAuth: true,
          blurb: 'A hard question answered properly, with every source cited.' },
        { id: 'wf-build', name: 'BUILD SOMETHING', accent: C.gold, art: '/assets/nav/forge.jpg',
          href: '/agent-forge.html', requiresAuth: true,
          blurb: 'Forge an agent that does this for you on its own, from now on.' },
      ],
    },
    {
      id: 'agents',
      name: 'AGENTS',
      accent: C.emerald,
      art: '/assets/nav/agents.jpg',
      blurb: 'The seven-agent council. Each one owns a domain, carries its own mastery library, and answers grounded in it.',
      items: [
        { id: 'shaddai', name: 'SHADDAI', accent: C.gold,    art: '/assets/agents/SHADDAI-portrait.png', href: '/agents.html#shaddai', blurb: 'Supreme orchestrator. Strategy, prioritization, and the final call before anything ships.' },
        { id: 'nexus',   name: 'NEXUS',   accent: C.cyan,    art: '/assets/agents/NEXUS-portrait.png',   href: '/agents.html#nexus',   blurb: 'Technical architect. Backend, APIs, database design, and anything that has to scale.' },
        { id: 'zerox',   name: 'ZEROX',   accent: C.rose,    art: '/assets/agents/ZEROX-portrait.png',   href: '/agents.html#zerox',   blurb: 'Wealth engine. Pricing, unit economics, billing, and market calls scored by hit rate.' },
        { id: 'oracle',  name: 'ORACLE',  accent: C.violet,  art: '/assets/agents/ORACLE-portrait.png',  href: '/agents.html#oracle',  blurb: 'Research and intelligence. Gathers context, spots gaps, and questions the assumption first.' },
        { id: 'turtle',  name: 'TURTLE',  accent: C.emerald, art: '/assets/agents/TURTLE-portrait.png',  href: '/agents.html#turtle',  blurb: 'Design and creative. Interfaces, motion, and whether a thing actually feels good to use.' },
        { id: 'quill',   name: 'QUILL',   accent: C.gold,    art: '/assets/agents/QUILL-portrait.png',   href: '/agents.html#quill',   blurb: 'Writing and communication. Copy, documentation, guides, and every word a user reads.' },
        { id: 'pikadon', name: 'PIKADON', accent: C.amber,   art: '/assets/agents/PIKADON-portrait.png', href: '/agents.html#pikadon', blurb: 'Security and compliance. Reviews everything for holes and assumes the worst case.' }
      ]
    },
    {
      id: 'games',
      name: 'GAMES',
      accent: C.amber,
      art: '/assets/landing/tab-play.png',
      blurb: 'The arcade. Every real game in the empire — nothing here that isn’t actually playable.',
      // 2026-08-29: arena/tactics/courts pointed at battle-arena.html/tactics.html/
      // basketball-jam.html — real files, but never part of the curated arcade
      // roster (arcade.html's own game grid never lists them). Replaced with
      // arcade.html's actual FEATURED array (its unlocked, playable games) —
      // xto-adventure and shaddai-realms are excluded on purpose, they're in
      // arcade.html's BETA_GAMES (password-gated, "SHADDAIGAMES"), not featured.
      // NEON HOOPS has a known rendering bug and none of these are mobile-tuned
      // yet — both queued as follow-up, not fixed here.
      items: [
        { id: 'climb',     name: 'THE CLIMB',   accent: C.emerald, art: '/assets/landing/tab-play.png', href: '/games/dreamers-climb/index.html', blurb: 'Dreamers Climb — the ascent run. Eight radio stations, one very long way up.' },
        { id: 'hoops',     name: 'NEON HOOPS',  accent: C.amber,   art: '/assets/nav/office.jpg',        href: '/games/basketball.html', blurb: 'Fast-break 2.5D arcade basketball.' },
        { id: 'football',  name: 'GRIDIRON',    accent: C.rose,    art: '/assets/nav/social.jpg',        href: '/games/football.html', blurb: 'Agent sport, 5v5. Dominate the gridiron.' },
        { id: 'soccer',    name: 'SOCCER',      accent: C.cyan,    art: '/assets/nav/worlds.jpg',        href: '/games/shaddai-soccer.html', blurb: 'Agent sport, 5v5. Own the pitch.' },
        { id: 'dodgeball', name: 'DODGEBALL',   accent: C.violet,  art: '/assets/nav/automation.jpg',    href: '/games/dodgeball.html', blurb: 'Reflex, team. Dodge or get wrecked.' },
        { id: 'starfall',  name: 'STARFALL',    accent: C.gold,    art: '/assets/nav/markets.jpg',       href: '/games/shaddai-shooting.html', blurb: 'Wave-defense shooter. Survive the void.' },
        { id: 'royale',    name: 'SHADDAI ROYALE', accent: C.emerald, art: '/assets/nav/plans.jpg',      href: '/games/royale/index.html', blurb: 'Casino, high-stakes 21. Beat the house.' }
      ]
    },
    {
      id: 'signals',
      name: 'SIGNALS',
      accent: C.rose,
      art: '/assets/landing/tab-signals.png',
      blurb: 'The three trading terminals — Pro Signals, the gated TG desk, and TuFish.',
      // The zerox-chart / zerox-live-signals pages were never real trading
      // tools and are deliberately NOT linked here. The three terminals below
      // are the actual ones.
      items: [
        { id: 'pro',    name: 'PRO SIGNALS', accent: C.gold,   art: '/assets/landing/tab-signals.png', href: '/pro-signals.html', blurb: 'The Oracle Terminal — live calls, scoring and hit-rate history. PIN gated.', pro: true },
        { id: 'tg',     name: 'SHADDAI TG',  accent: C.emerald, art: '/assets/nav/social.jpg',         href: '/m-signals.html',   blurb: 'The Team Terminal — the gated desk behind the Telegram feed. PIN gated.', pro: true },
        { id: 'tufish', name: 'TUFISH',      accent: C.cyan,    art: '/assets/nav/markets.jpg',        href: '/mirofish-terminal.html', blurb: 'MiroFish swarm intelligence — the research terminal behind the calls.', pro: true }
      ]
    },
    {
      id: 'forge',
      name: 'FORGE',
      accent: C.gold,
      art: '/assets/nav/forge.jpg',
      blurb: 'Build your own operatives, sprites and objects, then trade them.',
      items: [
        { id: 'agent',    name: 'AGENT CREATION', accent: C.gold,    art: '/assets/nav/forge.jpg',   href: '/agent-forge.html', blurb: 'Forge an agent end to end — a name, abilities that really run, a personality or none, and its own budgeted wallet.' },
        { id: 'pixel',    name: '2D PIXEL',   accent: C.emerald, art: '/assets/landing/tab-worlds.png', href: '/pixel-forge.html', blurb: 'Pixel-realm assets — sprites and objects for the 2D world.' },
        { id: 'forge3d',  name: '3D WORLD',   accent: C.cyan,    art: '/assets/nav/worlds.jpg',  href: '/forge-3d.html', blurb: 'The procedural 3D sculptor. Build objects that live in the 3D world.' },
        // 2026-08-29: owner wants a REAL marketplace here (create/list/buy/sell,
        // owner-curated + monthly featured) — forge-gallery.html today is still
        // the static placeholder, not that. Wired so the menu isn't a dead end;
        // rebuilding the page into a real marketplace is tracked in
        // TODO-COORDINATION.md, not done here.
        { id: 'market3d', name: '3D MARKETPLACE', accent: C.violet, art: '/assets/nav/apis.jpg', href: '/forge-gallery.html', blurb: 'Browse what the community has forged. (Marketplace rebuild in progress — buy/sell/curate isn’t real yet.)' }
      ]
    },
    {
      id: 'worlds',
      name: 'WORLDS',
      accent: C.cyan,
      art: '/assets/landing/tab-worlds.png',
      blurb: 'One world, more than one way to stand in it.',
      items: [
        { id: 'w2d',   name: '2D CITY',  accent: C.gold,    art: '/assets/landing/tab-worlds.png', href: '/SHADDAI-WORLD.html', blurb: 'The walkable pixel city where the agents live as characters.' },
        { id: 'w3d',   name: '3D REALM', accent: C.cyan,    art: '/assets/nav/worlds.jpg',         href: '/world3d', blurb: 'The full dimensional build — terrain, districts, interiors, council halls.' },
        { id: 'realm', name: 'REALMS',   accent: C.violet,  art: '/assets/nav/office.jpg',         href: '/region-select.html', blurb: 'Pick a region and drop into it.' }
      ]
    },
    {
      id: 'brain',
      name: 'BRAIN',
      accent: C.emerald,
      art: '/assets/nav/aura.jpg',
      blurb: 'The RAG brain — the council’s shared memory, and every answer cited to its source.',
      items: [
        // both brain surfaces, not just one: the library view and the cockpit
        { id: 'connect', name: 'CONNECT',   accent: C.emerald, art: '/assets/nav/apis.jpg', href: '/connectors.html',
          blurb: 'Bring your own keys, and let your own assistant use the council.' },
        { id: 'mcp',     name: 'MCP SETUP', accent: C.gold,    art: '/assets/nav/apis.jpg', href: '/mcp.html',
          blurb: 'Point Claude Desktop, Claude Code or Cursor at SHADDAI. Your config, already filled in.' },
        { id: 'manual',  name: 'THE MANUAL', accent: C.gold, art: '/assets/nav/apis.jpg', href: '/manual.html',
          blurb: 'How everything works, in plain language — Sparks, the council, the forge, the games and their controls.' },
        { id: 'ask',     name: 'THE BRAIN', accent: C.emerald, art: '/assets/nav/aura.jpg', href: '/brain.html',
          blurb: 'The knowledge base itself — search, digested chapters, and every answer cited to the passage it came from.' },
        { id: 'cockpit', name: 'COCKPIT',   accent: C.cyan,    art: '/assets/nav/automation.jpg', href: '/rag-cockpit.html',
          blurb: 'The neural cockpit — the brain as a live 3D instrument you fly through rather than a list you scroll.' },
        { id: 'council', name: 'THE COUNCIL', accent: C.violet, art: '/assets/agents/SHADDAI-portrait.png', href: '/brain-head.html',
          blurb: 'Council Mind — all seven agents reasoning on the same question at once.' },
        { id: 'codex',   name: 'CODEX',     accent: C.gold,    art: '/assets/nav/apis.jpg',  href: '/codex.html', blurb: 'The almanac — the written record of the empire.' },
        { id: 'learn',   name: 'LEARN',     accent: C.rose,    art: '/assets/nav/chat.jpg',  href: '/learn.html', blurb: 'Guided paths through what the council knows.' },
        // moved here from the removed CREATE category (2026-08-29) — works well, just needed a home.
        { id: 'launch',  name: 'LAUNCH KIT', accent: C.gold,   art: '/assets/nav/plans.jpg', href: '/launch-kit.html', blurb: 'Everything needed to put something live — copy, assets, and the checklist.' }
      ]
    },
    {
      id: 'tools',
      name: 'TOOLS',
      accent: C.violet,
      art: '/assets/nav/apis.jpg',
      blurb: 'Two hundred real, executable tools, the bazaar, and the API behind them.',
      items: [
        { id: 'bazaar',  name: 'THE BAZAAR', accent: C.violet,  art: '/assets/nav/apis.jpg',       href: '/marketplace-shop-v2.html', blurb: 'The night market — buy, sell and trade what the council and the community have made.' },
        { id: 'aura',    name: 'AURA',        accent: C.emerald, art: '/assets/nav/aura.jpg',       href: '/aura.html', blurb: 'The token-saving layer — deterministic answers before any model is called.' },
        // 2026-08-29: "connect a bot" lives here rather than a separate OTHERS
        // bucket — things should go where they belong, not a catch-all. Points
        // at the real API-key page for now; the federation/MCP endpoint itself
        // (/mcp/tools/call, key-gated, live as of 6526fe3) still wants its own
        // dedicated connect page (show the manifest, issue an MCP-specific key).
        { id: 'api',     name: 'API',         accent: C.cyan,    art: '/assets/nav/automation.jpg', href: '/api.html', blurb: 'Wire SHADDAI into your own stack — or bring your own agent (Grok bot, etc.) in over MCP.' }
      ]
    },
    {
      id: 'hub',
      name: 'HUB',
      accent: C.gold,
      art: '/assets/nav/dashboard.jpg',
      href: '/dashboard',
      blurb: 'The Command Hub — the full dashboard, sign-in, and everything at once. Tap to go straight there.'
    }
  ];

  /* ── lookups ──────────────────────────────────────────────────────────── */

  function byId(id) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i];
    return null;
  }

  /* Reads the visitor's slot arrangement, repairing anything stale — an id
     that no longer exists, a wrong length, or a duplicate — by falling back
     to the default for that position. Never throws, never returns a hole. */
  function readSlots() {
    var raw = null;
    /* Versioned key. A visitor who arranged their doors before MANUAL became
       a default has 'arcade' pinned in storage and would never see the change,
       so bumping the key retires the old arrangement once. Bump again only
       when a default change genuinely must reach people who already chose. */
    try { raw = JSON.parse(localStorage.getItem('shd_enter_slots_v2') || 'null'); } catch (e) { raw = null; }
    var out = [], seen = {};
    for (var i = 0; i < DEFAULT_SLOTS.length; i++) {
      var id = Array.isArray(raw) ? raw[i] : null;
      if (!id || !byId(id) || seen[id]) id = null;
      if (!id) {
        // first default that isn't already placed
        for (var j = 0; j < DEFAULT_SLOTS.length; j++) {
          if (!seen[DEFAULT_SLOTS[j]]) { id = DEFAULT_SLOTS[j]; break; }
        }
      }
      if (!id) id = MODULES[i].id;
      seen[id] = 1;
      out.push(id);
    }
    return out;
  }

  function writeSlots(ids) {
    try { localStorage.setItem('shd_enter_slots_v2', JSON.stringify(ids.slice(0, DEFAULT_SLOTS.length))); } catch (e) {}
  }

  root.SHDModules = {
    C: C,
    MODULES: MODULES,
    LIBRARY: MODULES,          // every module is swappable into any slot
    DEFAULT_SLOTS: DEFAULT_SLOTS,
    WHEEL: WHEEL,
    byId: byId,
    readSlots: readSlots,
    writeSlots: writeSlots
  };
})(window);

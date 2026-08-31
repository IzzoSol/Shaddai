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
      art: '/assets/enter/hf-ascent.jpg',
      // Rotating door art pool: every visitor is handed a different plate, so
      // the front door never reads twice. Drop in numbered files (descent-1.jpg,
      // descent-2.jpg, …) to grow the pool — see docs/FRONT-DOOR-MASTER-PROMPT.md.
      // artFor() picks one deterministically per session and falls back to `art`
      // if a variant is missing.
      artVary: ['/assets/enter/descent.jpg'],
      accent: C.cyan,
      geo: 'icosa'
    },
    {
      id: 'entry',
      name: 'MAIN',
      kicker: 'The main site',
      blurb: 'The main site. What SHADDAI is, how it works, the seven agents, the worlds, the arcade and the brain — the whole story, in order.',
      href: '/home.html',
      art: '/assets/enter/hf-main.jpg',
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
      artVary: ['/assets/enter/dashboard.jpg','/assets/enter/dashboard-1.jpg','/assets/enter/dashboard-2.jpg','/assets/enter/dashboard-3.jpg','/assets/enter/dashboard-4.jpg'],
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
      artVary: ['/assets/enter/simple.jpg','/assets/enter/simple-1.jpg','/assets/enter/simple-2.jpg','/assets/enter/simple-3.jpg','/assets/enter/simple-4.jpg'],
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
      artVary: ['/assets/enter/rag.jpg','/assets/enter/rag-1.jpg','/assets/enter/rag-2.jpg','/assets/enter/rag-3.jpg','/assets/enter/rag-4.jpg'],
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
      artVary: ['/assets/enter/world2d.jpg','/assets/enter/world2d-1.jpg','/assets/enter/world2d-2.jpg','/assets/enter/world2d-3.jpg','/assets/enter/world2d-4.jpg'],
      accent: C.gold,
      geo: 'isogrid',
      /* Gated on purpose. The city renders and the agents are in it, but the
         economy on top — plots, ownership, rent — is not built. Letting people
         walk in now means they meet an empty world and decide that is what it
         is. Better to be closed than disappointing. */
      locked: true,
      lockNote: 'Opening when plots go live' 
    },
    {
      id: 'world3d',
      name: '3D WORLD',
      kicker: 'The full realm',
      blurb: 'The dimensional build of the same world — terrain, districts, interiors, and the council halls, rendered in full 3D.',
      href: '/world3d',
      art: '/assets/enter/hf-world3d.jpg',
      artVary: ['/assets/enter/world3d.jpg'],
      /* Greyed rather than accented. A dim tile beside bright ones reads as
         "not yet" without a word of explanation — the way a locked level does
         in a game, which is the right feeling for something being built. */
      accent: C.dim,
      dim: true,
      geo: 'terrain',
      locked: true,
      lockNote: 'In build' 
    },
    {
      id: 'arcade',
      name: 'ARCADE',
      kicker: 'Play',
      blurb: 'Every game in the empire in one hall — the climb, the courts, the arenas, the tactics board.',
      href: '/arcade.html',
      art: '/assets/enter/arcade.jpg',
      artVary: ['/assets/enter/arcade.jpg','/assets/enter/arcade-1.jpg','/assets/enter/arcade-2.jpg','/assets/enter/arcade-3.jpg','/assets/enter/arcade-4.jpg'],
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
      art: '/assets/enter/hf-connect.jpg',
      artVary: ['/assets/enter/hf-connect.jpg'],
      accent: C.emerald,
      geo: 'cube'
    },
    {
      id: 'manual',
      name: 'MANUAL',
      kicker: 'How all of it works',
      blurb: 'The booklet — Sparks, the council, the forge, every game and its controls, and the flywheel. Read it like a cartridge manual.',
      href: '/manual.html',
      art: '/assets/enter/hf-manual.jpg',
      artVary: ['/assets/enter/hf-manual.jpg'],
      accent: C.gold,
      geo: 'dodeca'
    },
    {
      id: 'signals',
      name: 'SIGNALS',
      kicker: 'ZEROX calls',
      blurb: 'Live market and coin intelligence from ZEROX — scored, timestamped, and tracked by hit rate rather than vibes.',
      href: '/pro-signals.html',
      art: '/assets/enter/signals.jpg',
      artVary: ['/assets/enter/signals.jpg','/assets/enter/signals-1.jpg','/assets/enter/signals-2.jpg','/assets/enter/signals-3.jpg','/assets/enter/signals-4.jpg'],
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

  /* THE WHEEL — ten buttons, each one a place.

     REMOVED and why:
       DO          every item led to the dashboard. A menu entry that is four
                   doors into the same room is not a category.
       HUB         zero items. A dead button.
       2D CITY     does not exist. It is the bazaar, and the bazaar is not
                   finished. Linking to it promised a place with no way in.
       THE COUNCIL that IS the RAG brain, which already has its own button.
       COCKPIT     a second door into the brain. One door is the point.
       LAUNCH KIT  internal. Never belonged on a customer menu.

     PRO SIGNALS pointed at /pro-signals.html, which is the OLD page. The rebuilt
     four-mode mobile one is /signals.html. A stale link to a superseded page is
     worse than a dead one, because it looks like it worked.

     The rule applied throughout: one idea per button, nothing that leads
     somewhere already reachable, and nothing pointing at a page that does not
     do what its name claims. */
  var WHEEL = [
    {
      id: 'agents', name: 'AGENTS', accent: C.gold, art: '/assets/nav/agents.jpg',
      blurb: 'The seven. Each has skills, a wallet and an MCP door — hire them here.',
      items: [
        { id: 'shaddai', name: 'SHADDAI', accent: C.gold,    art: '/assets/agents/SHADDAI-portrait.png', href: '/agents.html#shaddai', blurb: 'Orchestration and the final call.' },
        { id: 'zerox',   name: 'ZEROX',   accent: C.gold,    art: '/assets/agents/ZEROX-portrait.png',   href: '/agents.html#zerox',   blurb: 'Markets, pricing, unit economics.' },
        { id: 'oracle',  name: 'ORACLE',  accent: C.emerald, art: '/assets/agents/ORACLE-portrait.png',  href: '/agents.html#oracle',  blurb: 'Research, people, patterns.' },
        { id: 'nexus',   name: 'NEXUS',   accent: C.emerald, art: '/assets/agents/NEXUS-portrait.png',   href: '/agents.html#nexus',   blurb: 'Backends, APIs, systems that hold.' },
        { id: 'turtle',  name: 'TURTLE',  accent: C.emerald, art: '/assets/agents/TURTLE-portrait.png',  href: '/agents.html#turtle',  blurb: 'Image, motion, sound, game assets.' },
        { id: 'quill',   name: 'QUILL',   accent: C.gold,    art: '/assets/agents/QUILL-portrait.png',   href: '/agents.html#quill',   blurb: 'Every word a person reads.' },
        { id: 'pikadon', name: 'PIKADON', accent: C.emerald, art: '/assets/agents/PIKADON-portrait.png', href: '/agents.html#pikadon', blurb: 'Audits, contracts, what could go wrong.' },
      ],
    },
    {
      id: 'paybox', name: 'PAYBOX', accent: C.gold, art: '/assets/nav/apis.jpg',
      blurb: 'Pay an agent to do the work — Sparks when signed in, a wallet when not.',
      items: [
        /* Only ONE item, deliberately. The other two pointed at the dashboard and
           back at the front door — a category whose entries lead somewhere the
           menu already reaches is the same mistake the DO tab made. Paybox
           earns more entries when it can actually settle a payment; until then
           one honest door beats three that go nowhere new. */
        { id: 'pb-sparks', name: 'GET SPARKS', accent: C.gold, art: '/assets/nav/apis.jpg', href: '/pricing.html',
          blurb: '1 Spark = $1, fixed. Fund an agent and it works for you.' },
      ],
    },
    {
      id: 'signals', name: 'SIGNALS', accent: C.emerald, art: '/assets/nav/markets.jpg',
      blurb: 'Live calls — list, bubbles, heatmap and ranked.',
      items: [
        /* ONE entry, not two. Both pages still exist — the terminal routes
           phones to /signals.html and the phone view offers the terminal on a
           wide screen — so a single button lands everyone in the right place
           and the menu does not ask the user to know which is which. */
        { id: 'pro', name: 'PRO SIGNALS', accent: C.emerald, art: '/assets/nav/markets.jpg', href: '/pro-signals.html',
          blurb: 'Live calls. The full terminal on a desktop, four fast views on a phone.' },
        { id: 'tg',     name: 'SHADDAI TG',  accent: C.gold,    art: '/assets/nav/markets.jpg', href: '/m-signals.html', blurb: 'Calls delivered to Telegram.' },
        { id: 'tufish', name: 'TUFISH',      accent: C.emerald, art: '/assets/nav/markets.jpg', href: '/mirofish-terminal.html', blurb: 'The sentiment terminal.' },
      ],
    },
    {
      id: 'dashboard', name: 'DASHBOARD', accent: C.emerald, art: '/assets/nav/dashboard.jpg',
      blurb: 'The workstation. Everything the council can do, in one place.',
      items: [
        { id: 'dash-open', name: 'OPEN', accent: C.emerald, art: '/assets/nav/dashboard.jpg', href: '/index.html', blurb: 'The full dashboard.' },
      ],
    },
    {
      id: 'forge', name: 'FORGE', accent: C.gold, art: '/assets/nav/forge.jpg',
      blurb: 'Build an agent, or the things it works with.',
      items: [
        { id: 'agent',   name: 'AGENT CREATION', accent: C.gold,    art: '/assets/nav/forge.jpg',  href: '/agent-forge.html',
          blurb: 'Four questions and it is hireable — abilities, a personality or none, a wallet.' },
        { id: 'pixel',   name: '2D PIXEL',       accent: C.emerald, art: '/assets/nav/forge.jpg',  href: '/pixel-forge.html', blurb: 'Sprites and objects.' },
        { id: 'forge3d', name: '3D SCULPTOR',    accent: C.emerald, art: '/assets/nav/worlds.jpg', href: '/forge-3d.html',    blurb: 'Objects for the 3D realm.' },
      ],
    },
    {
      id: 'market', name: 'MARKETPLACE', accent: C.gold, art: '/assets/nav/apis.jpg',
      blurb: 'Buy and sell what the community has made.',
      items: [
        { id: 'bazaar',   name: 'THE BAZAAR',     accent: C.gold,    art: '/assets/nav/apis.jpg',   href: '/marketplace-shop-v2.html', blurb: 'The store. Sign in to buy.' },
        { id: 'market3d', name: '3D MARKETPLACE', accent: C.emerald, art: '/assets/nav/worlds.jpg', href: '/forge-gallery.html',       blurb: 'Browse what has been forged.' },
      ],
    },
    {
      id: 'worlds', name: 'WORLDS', accent: C.emerald, art: '/assets/nav/worlds.jpg',
      blurb: 'Where the agents live.',
      items: [
        { id: 'realms',  name: '2D REALM', accent: C.emerald, art: '/assets/nav/worlds.jpg', href: '/region-select.html', blurb: 'Pick a region and walk in.' },
        { id: 'realm3d', name: '3D REALM', accent: C.dim,     art: '/assets/nav/worlds.jpg', href: '/world3d',            blurb: 'The dimensional build. Still going up.' },
      ],
    },
    {
      id: 'brain', name: 'RAG BRAIN', accent: C.emerald, art: '/assets/nav/brain.jpg',
      blurb: 'Ask the library. Every answer cited to its source.',
      items: [
        { id: 'brain-classic', name: 'CLASSIC', accent: C.emerald, art: '/assets/nav/brain.jpg', href: '/rag-cockpit.html',
          blurb: 'The plain view — ask, read the answer, follow the citations.' },
        { id: 'brain-3d',      name: '3D BRAIN', accent: C.gold,    art: '/assets/nav/brain.jpg', href: '/brain.html',
          blurb: 'The same library, rendered — see which regions an answer came from.' },
      ],
    },
    {
      id: 'manual', name: 'MANUAL', accent: C.gold, art: '/assets/nav/apis.jpg',
      blurb: 'How all of it works, and how to plug your own things in.',
      items: [
        { id: 'booklet', name: 'DIGITAL BOOKLET', accent: C.gold,    art: '/assets/nav/apis.jpg', href: '/manual.html',
          blurb: 'The N64-style manual. Sparks, the council, the forge, the flywheel.' },
        { id: 'mcp',     name: 'MCP SETUP',       accent: C.emerald, art: '/assets/nav/apis.jpg', href: '/mcp.html',
          blurb: 'Point your own Claude or Grok at the council.' },
        { id: 'connect', name: 'CONNECTORS',      accent: C.emerald, art: '/assets/nav/apis.jpg', href: '/connectors.html',
          blurb: 'Bring your own keys. We take nothing on what you make.' },
        { id: 'learn',   name: 'LEARN',           accent: C.gold,    art: '/assets/nav/apis.jpg', href: '/learn.html', blurb: 'Guides and lessons.' },
        { id: 'codex',   name: 'CODEX',           accent: C.emerald, art: '/assets/nav/apis.jpg', href: '/codex.html', blurb: 'The reference.' },
      ],
    },
    {
      id: 'tools', name: 'TOOLS', accent: C.emerald, art: '/assets/nav/automation.jpg',
      blurb: 'The machinery underneath.',
      items: [
        { id: 'aura', name: 'AURA', accent: C.emerald, art: '/assets/nav/automation.jpg', href: '/aura.html',
          blurb: 'Answers without paying for a model call, wherever it can.' },
        { id: 'api',  name: 'API',  accent: C.gold,    art: '/assets/nav/apis.jpg',       href: '/api.html', blurb: 'Build against SHADDAI directly.' },
      ],
    },
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

  /* Rotating front-door art. Every visit is handed a *different* plate from a
     module's artVary pool, so the door never reads the same twice — but the
     choice is frozen for the whole session so it never flickers mid-render.
     The base image is always first in the pool, and enter.html falls back to
     it if a numbered variant has not been generated yet. */
  function artFor(id) {
    var m = byId(id);
    if (!m) return '/assets/enter/entry.jpg';
    var pool = Array.isArray(m.artVary) && m.artVary.length ? m.artVary : [m.art];
    if (pool.length === 1) return pool[0];
    /* session-stable seed: locked after first read, random per new session */
    var seed = 0;
    try {
      var s = sessionStorage.getItem('shd_enter_art_seed');
      if (s === null) { seed = Math.floor(Math.random() * 100000); sessionStorage.setItem('shd_enter_art_seed', String(seed)); }
      else seed = parseInt(s, 10) || 0;
    } catch (e) { seed = Math.floor(Math.random() * 100000); }
    var pick = pool[(seed + (m.seedOff || 0)) % pool.length];
    return pick || pool[0];
  }

  root.SHDModules = {
    C: C,
    MODULES: MODULES,
    LIBRARY: MODULES,          // every module is swappable into any slot
    DEFAULT_SLOTS: DEFAULT_SLOTS,
    WHEEL: WHEEL,
    byId: byId,
    readSlots: readSlots,
    writeSlots: writeSlots,
    artFor: artFor
  };
})(window);

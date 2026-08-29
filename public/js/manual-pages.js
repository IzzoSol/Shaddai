/* ══════════════════════════════════════════════════════════════════════
   THE SHADDAI MANUAL — contents.

   Every page is data. To add a chapter as the product grows, append an
   object here — the booklet builds its rail, its 3D plates, its keyboard
   order and its deep links from this array alone.

   RULE: only verified facts go in here. Game controls were read out of the
   game source; agent domains come from backend/lib/knowledge-map.js; the
   money model comes from docs/final/FLYWHEEL.md. If something is not built,
   the page says so rather than describing it as if it were.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var C = {
    emerald: '#00ff9c', gold: '#e8c45c', cyan: '#5fe0ff',
    violet: '#b07cff', rose: '#ff6f6f', amber: '#ff8a5c',
  };

  var PAGES = [
    {
      id: 'start', tab: 'START', accent: C.gold,
      title: 'What This Is',
      lede: 'Seven agents, a set of real tools, and a world they work in.',
      blocks: [
        { k: 'p', v: 'SHADDAI is a workstation where AI agents do actual jobs — writing, art, research, market reads, code — and a persistent world those agents live in. The dashboard is the product. The world is where the work becomes visible.' },
        { k: 'grid', v: [
          ['THE COUNCIL', 'Seven specialised agents. Each owns a subject and answers from its own library.'],
          ['THE FORGE', 'Build your own agent. Give it skills, a face, a job.'],
          ['THE WORLDS', 'A 2D city and a 3D realm where agents and people occupy the same space.'],
          ['THE ARCADE', 'Ten games. Short sessions, head to head.'],
        ] },
        { k: 'note', v: 'Everything in this manual was checked against the running build. Where something is not finished, the page says so.' },
      ],
    },

    {
      id: 'sparks', tab: 'SPARKS', accent: C.emerald,
      title: 'How Money Works',
      lede: 'One Spark is one dollar. It never moves.',
      blocks: [
        { k: 'big', v: '1 SPARK = $1' },
        { k: 'p', v: 'Fixed, permanently. "This costs 5 Sparks" means five dollars this week and next year. If Sparks floated, every price in the product would change hourly and nobody could plan.' },
        { k: 'flow', v: ['money in', 'SPARKS', 'pay an agent', 'the owner earns'] },
        { k: 'p', v: 'Card, SOL, ETH and USDC are all just ways in. They convert to Sparks at the moment you spend. What you paid with never changes what things cost.' },
        { k: 'grid', v: [
          ['YOU SPEND', 'Sparks buy work from agents, and things in the world.'],
          ['YOU EARN', 'If your agent does the job, you get paid for it.'],
          ['THE PLATFORM', 'Takes a cut of work that flows through it.'],
          ['THE WORLD', 'That cut funds plots, cosmetics and the arcade.'],
        ] },
        { k: 'warn', v: 'Sparks are store credit at a fixed value. They are not an investment, they do not float, and they are not a token.' },
        { k: 'big', v: 'WHAT IT COSTS' },
        { k: 'grid', v: [
          ['FREE', 'Simple Mode, the seven agents, a few grounded brain answers a day. No card.'],
          ['PRO · $30', 'Pro Signals, the brain without a daily cap, ZEROX sentiment, workflows, AURA.'],
          ['MAX · $200', 'Everything in Pro, plus brain lessons, the full library, MCP access, priority.'],
          ['SPARKS', 'Top up a wallet and spend it on anything. No subscription.'],
        ] },
        { k: 'note', v: 'You never need a subscription to use SHADDAI. Sparks alone work — pay for what you use, nothing more.' },
      ],
    },

    {
      id: 'council', tab: 'COUNCIL', accent: C.violet,
      title: 'The Seven',
      lede: 'Each agent owns subjects. Ask the right one and it answers from its own library.',
      blocks: [
        { k: 'roster', v: [
          ['SHADDAI', C.gold, 'Supreme Orchestrator', 'Strategy and the final call. Takes a goal and decides who does what.'],
          ['ZEROX', C.rose, 'Revenue Engine', 'Anywhere money moves — pricing, markets, offers, unit economics.'],
          ['ORACLE', C.violet, 'Intelligence Analyst', 'People and patterns — research, psychology, meaning.'],
          ['NEXUS', C.cyan, 'Technical Architect', 'Systems that have to hold — backends, APIs, data.'],
          ['TURTLE', C.emerald, 'UI/UX Designer', 'How a thing looks and feels — interface, motion, image, sound.'],
          ['QUILL', C.gold, 'Writer & Communicator', 'Every word a person reads — copy, docs, threads.'],
          ['PIKADON', C.amber, 'Security Guard', 'What could go wrong. Checks claims, contracts and worst cases.'],
        ] },
        { k: 'p', v: 'You do not have to pick. Say what you want and it routes: "make me a 3D model and a voice over" goes to SHADDAI, who hands the work to TURTLE. "Is this contract safe" goes straight to PIKADON.' },
        { k: 'note', v: 'Answers are grounded in an indexed library — 401,767 passages across the seven — and cited back to the passage they came from.' },
      ],
    },

    {
      id: 'forge', tab: 'FORGE', accent: C.amber,
      title: 'Build Your Own',
      lede: 'Give an agent a job, a set of skills, and a face.',
      blocks: [
        { k: 'steps', v: [
          ['Choose the work', 'What should it be good at? That decides its skills.'],
          ['Give it a face', 'Pixel forge for the 2D city, 3D sculptor for the realm.'],
          ['Put it to work', 'It can take jobs. When it completes one, you are paid.'],
        ] },
        { k: 'p', v: 'A forged agent is yours. It carries your skills, your look, and its earnings come to you.' },
        { k: 'warn', v: 'NOT FINISHED: the Forge "Build" UI still says coming soon. The 3D sculptor and the gallery work today; full agent forging does not.' },
      ],
    },

    {
      id: 'games', tab: 'GAMES', accent: C.rose,
      title: 'The Arcade',
      lede: 'Ten games. Controls below are read from the games themselves.',
      blocks: [
        { k: 'controls', v: [
          ['MOVE', 'W A S D'],
          ['SPRINT', 'SHIFT'],
          ['CONFIRM', 'ENTER'],
          ['PAUSE / EXIT', 'ESC'],
          ['AIM / SHOOT', 'MOUSE'],
        ] },
        { k: 'grid', v: [
          ['DREAMERS CLIMB', 'The ascent run. Eight radio stations, one long way up.'],
          ['SHADDAI ROYALE', 'High-stakes blackjack. Turn-based, tap to play.'],
          ['SHADDAI REALMS', 'Strategy and conquest across the realm map.'],
          ['NEON HOOPS', 'Basketball. WASD, sprint, mouse to shoot.'],
          ['GRID GRIDIRON', 'Football on the neon field.'],
          ['GRID DODGEBALL', 'Dodge, catch, throw.'],
          ['SHADDAI SOCCER', 'The pitch at night.'],
          ['SHADDAI ARENA', 'Neon shooter. The most reflex-driven.'],
          ['XTO ADVENTURE', 'Action-RPG through the jungle temple.'],
          ['TACTICS', 'Turn-based board. Slow and deliberate.'],
        ] },
        { k: 'warn', v: 'MOBILE: most games are keyboard and mouse only. Dodgeball, Soccer, XTO Adventure, Tactics and Battle Arena have no touch controls at all and cannot be played on a phone yet. Royale and Tactics are closest, because tapping is already their input.' },
      ],
    },

    {
      id: 'worlds', tab: 'WORLDS', accent: C.cyan,
      title: 'The Realms',
      lede: 'One world, more than one way to stand in it.',
      blocks: [
        { k: 'grid', v: [
          ['2D CITY', 'The walkable pixel city. Agents live here as characters you can approach.'],
          ['3D REALM', 'The dimensional build — terrain, districts, interiors, council halls.'],
          ['REGIONS', 'Pick a region and drop into it.'],
          ['THE ASCENT', 'The cinematic climb from the quantum lattice to the stars.'],
        ] },
        { k: 'p', v: 'The world is where work becomes visible. An agent standing on a plot is an agent doing a job someone can watch.' },
        { k: 'warn', v: 'NOT BUILT YET: plots, land ownership and the monthly siege. The regions and characters exist; the economy on top of them does not.' },
      ],
    },

    {
      id: 'tools', tab: 'TOOLS', accent: C.emerald,
      title: 'Tools & AURA',
      lede: 'Two hundred real, executable tools — and a layer that stops you paying twice.',
      blocks: [
        { k: 'p', v: 'Agents do not just talk. They run tools: search, generate, post, analyse, build. The marketplace lists every one they can actually execute.' },
        { k: 'big', v: 'AURA' },
        { k: 'p', v: 'AURA sits in front of the model. When a request can be answered deterministically — because the same thing was asked before, or because a pattern solves it — it answers without paying for a model call at all.' },
        { k: 'p', v: 'This matters most in agent loops, where the same tool schemas and history get re-sent over and over. One-shot chat barely notices. A seven-agent workflow notices a lot.' },
        { k: 'warn', v: 'UNVERIFIED: the real hit rate has not been measured yet. Until it is, treat token savings as a design goal rather than a proven number.' },
      ],
    },

    {
      id: 'flywheel', tab: 'FLYWHEEL', accent: C.gold,
      title: 'Why It Compounds',
      lede: 'The people earning are the people playing.',
      blocks: [
        { k: 'flow', v: ['work', 'earnings', 'spend', 'more work'] },
        { k: 'p', v: 'Your agent earns while you sleep. You spend those Sparks on a plot, a cosmetic, an arcade entry, or hiring someone else’s agent that is better than yours at one thing. That hiring pays another person, who spends it here too.' },
        { k: 'p', v: 'The platform takes a cut of the work flowing through, and that cut funds the world everyone is playing in. No coin is required for any of this to work.' },
        { k: 'grid', v: [
          ['SAFE', 'Selling access. Subscriptions, terminals, the brain, the library.'],
          ['SAFE', 'Utility. A plot, a cosmetic, priority, a bigger allowance.'],
          ['SAFE', 'Earning from your own agent’s completed work.'],
          ['CAREFUL', 'Anything that pays a holder a share of platform revenue they did not work for.'],
        ] },
        { k: 'warn', v: 'The last one is an investment contract in substance, whatever the wrapper is called. The fix costs nothing: make a plot productive rather than passive — the holder earns because their agent works from it, not because they hold it.' },
      ],
    },

    {
      id: 'founders', tab: 'FOUNDERS', accent: C.violet,
      title: 'Founders',
      lede: 'First 25, next 25, last 50.',
      blocks: [
        { k: 'big', v: '$100 · 20 SEATS' },
        { k: 'p', v: 'One payment, once. Twenty seats, then the door closes and it is never sold again.' },
        { k: 'grid', v: [
          ['PRO, PERMANENTLY', 'The $30 plan, for as long as SHADDAI runs. No renewal, no price rise.'],
          ['A FOUNDER MARK', 'On your agent and beside your name. Twenty exist, never minted again.'],
          ['FIRST CLAIM ON LAND', 'When plots open in the 2D world, founders choose before anyone else.'],
          ['A DIRECT LINE', 'You say what to fix and it gets fixed. Worth more than any perk here.'],
        ] },
        { k: 'warn', v: 'It is not an investment and it pays you nothing. You are buying access and standing, not a share of revenue. Anyone selling you the second thing owes you a prospectus.' },
      ],
    },
  ];

  root.MANUAL_PAGES = PAGES;
  root.MANUAL_C = C;
})(window);

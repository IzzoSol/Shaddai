/* ══════════════════════════════════════════════════════════════════════
   SHADDAI · SHARED NAV COMPONENT  (nav.js)
   Self-injecting top nav extracted verbatim from home.html. Drop into any
   page with:  <script src="/nav.js" data-active="council" defer></script>
   On load it: (a) injects :root tokens (if missing) + nav CSS, (b) injects
   the Google Fonts link (if missing), (c) injects the nav HTML at top of
   <body>, (d) wires mega-menu + mobile menu, (e) marks the active pillar.
   ══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  // v119: embedded inside the dashboard (or any iframe)? The host provides navigation — don't inject a second top nav.
  if (window.self !== window.top) return;

  // ── figure out which pillar is active from the script tag ──────────────
  var self = document.currentScript ||
    (function(){ var s=document.getElementsByTagName('script'); for(var i=s.length-1;i>=0;i--){ if((s[i].src||'').indexOf('nav.js')>-1) return s[i]; } return null; })();
  var ACTIVE = (self && self.getAttribute('data-active') || '').toLowerCase();

  // ── (a) design tokens (only if the page has not already defined --void) ─
  // Key off a token unique to Home's sacred palette (--emerald-dim + --f-hud):
  // a page may define --void with a different meaning (e.g. the Bazaar) yet
  // still be missing the nav-critical tokens. Only skip injection when the
  // full Home token set is clearly present.
  function hasTokens(){
    try{
      var cs=getComputedStyle(document.documentElement);
      return !!cs.getPropertyValue('--emerald-dim').trim()
          && !!cs.getPropertyValue('--edge').trim()
          && !!cs.getPropertyValue('--f-hud').trim();
    } catch(e){ return false; }
  }
  // Scoped to the nav containers (not :root) so a page that already defines
  // clashing vars (e.g. its own --void/--panel/--gold) is never recolored.
  var TOKENS = 'header.bar.shd-nav, #mobileNav{'+
    '--void:#06080b; --void2:#0a0e13; --panel:#0e141b; --edge:rgba(120,150,140,.14);'+
    '--emerald:#00ff9c; --emerald-dim:#0e6b4d; --gold:#e8c45c; --gold-dim:#8a6f2c;'+
    '--cyan:#5fe0ff; --ink:#e9efe9; --ink-soft:#93a49b; --ink-faint:#4f5d57;'+
    "--f-display:'Cinzel Decorative','Cinzel',serif; --f-cinzel:'Cinzel',serif;"+
    "--f-hud:'Chakra Petch',sans-serif; --f-serif:'Fraunces',Georgia,serif; --f-mono:'IBM Plex Mono',monospace;"+
    '--gutter:clamp(20px,5vw,64px);'+
    '--ease:cubic-bezier(.22,.7,.2,1);'+
    '}';

  // ── nav CSS (extracted verbatim from home.html) ────────────────────────
  var CSS = [
  '.shd-nav a{ color:inherit; text-decoration:none; }',
  /* TOP LEDGER BAR */
  '.bar{ position:fixed; top:0; left:0; right:0; z-index:80; display:flex; align-items:center; justify-content:space-between;',
  '  padding:14px var(--gutter); font-family:var(--f-hud); font-size:11px; font-weight:500; letter-spacing:.26em; text-transform:uppercase; color:var(--ink-soft);',
  '  background:linear-gradient(180deg, rgba(6,8,11,.92), rgba(6,8,11,.55) 60%, rgba(6,8,11,0)); }',
  /* This nav is reused as a plain utility header on 7 app-ish pages (Bazaar, Agents,
     Create, Play, AURA, etc.) — the home.html hero has its own separate inline nav
     with its own cinematic entrance. A staggered per-pillar fade-in (was up to 1.1s
     end to end) read as the whole bar "glitching in" piece by piece on every visit
     to these utility pages, especially on a slow load. One quick, uniform fade instead. */
  '.bar .mark, .bar nav.mega .pillar, .bar .menuBtn, .bar .corner{ opacity:0; animation:barIn .25s var(--ease) forwards; }',
  '@keyframes barIn{ from{ opacity:0; } to{ opacity:1; } }',
  '.bar .mark{ color:var(--ink); letter-spacing:.30em; font-weight:700; font-family:var(--f-display); }',
  '.bar .mark b{ color:var(--emerald); font-weight:700; }',
  /* MEGA-NAV */
  '.bar nav.mega{ display:flex; gap:2px; align-items:center; }',
  '.pillar{ position:relative; }',
  '.pillar>button{ font:inherit; color:var(--ink-soft); background:none; border:0; cursor:pointer; padding:16px 14px;',
  '  letter-spacing:.13em; text-transform:uppercase; font-weight:600; font-size:14px; transition:color .3s; display:flex; align-items:center; gap:6px; white-space:nowrap; }',
  '@media(max-width:1360px){ .pillar>button{ padding:16px 10px; letter-spacing:.10em; font-size:13px; } }',
  '.pillar>button .cx{ font-size:8px; opacity:.5; transition:transform .3s, color .3s, opacity .3s; }',
  '.pillar:hover>button, .pillar.open>button, .pillar>button:focus-visible{ color:var(--emerald); outline:none; }',
  '.pillar:hover>button .cx, .pillar.open>button .cx{ transform:rotate(180deg); color:var(--emerald); opacity:1; }',
  '.pillar>button::after{ content:\'\'; position:absolute; left:11px; right:11px; bottom:8px; height:1px;',
  '  background:linear-gradient(90deg,var(--emerald),var(--gold)); transform:scaleX(0); transform-origin:left; transition:transform .32s var(--ease); }',
  '.pillar:hover>button::after, .pillar.open>button::after{ transform:scaleX(1); }',
  /* ACTIVE pillar highlight */
  '.pillar.active>button{ color:var(--emerald); }',
  '.pillar.active>button::after{ transform:scaleX(1); }',
  '.pillar.active>button .cx{ color:var(--emerald); opacity:.9; }',
  /* dropdown panel */
  '.panel{ position:absolute; top:calc(100% + 6px); left:50%; transform:translateX(-50%) translateY(-8px);',
  '  min-width:274px; background:linear-gradient(180deg, rgba(12,17,23,.98), rgba(8,11,15,.98));',
  '  border:1px solid var(--edge); box-shadow:0 24px 60px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(0,255,156,.05) inset;',
  '  padding:12px 10px 10px; opacity:0; visibility:hidden; pointer-events:none; transition:opacity .15s var(--ease), transform .17s var(--ease), visibility .15s; z-index:90;',
  '  clip-path:polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px)); }',
  '.panel::before{ content:\'\'; position:absolute; top:-1px; left:16px; right:16px; height:1px; background:linear-gradient(90deg,transparent,var(--gold-dim),transparent); }',
  '.panel .phdr{ display:flex; justify-content:space-between; align-items:center; padding:0 8px 8px; margin-bottom:4px;',
  '  font-family:var(--f-mono); font-size:8px; letter-spacing:.24em; text-transform:uppercase; color:var(--ink-faint); border-bottom:1px solid rgba(120,150,140,.08); }',
  '.panel .phdr .cd{ color:var(--emerald-dim); }',
  '.pillar:hover>.panel, .pillar.open>.panel{ opacity:1 !important; visibility:visible !important; pointer-events:auto !important; transform:translateX(-50%) translateY(0); }',
  '.panel a, .panel span.soon{ display:flex; align-items:baseline; gap:9px; padding:10px 12px; position:relative;',
  '  border-bottom:1px solid rgba(120,150,140,.07); transition:background .25s, padding-left .25s;',
  '  opacity:0; transform:translateY(6px); }',
  '.panel a:last-child, .panel span.soon:last-child{ border-bottom:0; }',
  '.pillar:hover>.panel a, .pillar.open>.panel a, .pillar:hover>.panel span.soon, .pillar.open>.panel span.soon{ opacity:1; transform:none;',
  '  transition:opacity .3s var(--ease) calc(var(--i,0)*22ms), transform .3s var(--ease) calc(var(--i,0)*22ms), background .25s, padding-left .25s; }',
  '.panel a:hover{ background:rgba(0,255,156,.06); padding-left:16px; }',
  '.panel a:focus-visible{ outline:1px solid var(--emerald); outline-offset:-1px; }',
  '.panel .lk{ display:flex; flex-direction:column; gap:2px; }',
  '.panel .t{ font-family:var(--f-cinzel); font-weight:700; letter-spacing:.05em; font-size:14px; color:var(--ink); }',
  '.panel a:hover .t{ color:var(--emerald); }',
  '.panel .s{ font-family:var(--f-mono); font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-faint); }',
  '.panel .gi{ font-family:var(--f-cinzel); font-size:15px; color:var(--gold); flex:0 0 auto; width:18px; text-align:center; }',
  '.panel .badge{ font-family:var(--f-mono); font-size:8px; letter-spacing:.16em; padding:2px 6px; margin-left:auto; align-self:center; border:1px solid; }',
  '.panel .badge.live{ color:var(--emerald); border-color:rgba(0,255,156,.35); }',
  '.panel .badge.live::before{ content:\'● \'; }',
  '.panel .badge.prev{ color:var(--gold); border-color:var(--gold-dim); }',
  '.panel span.soon{ color:var(--ink-faint); cursor:default; }',
  '.panel span.soon .t{ color:var(--ink-faint); }',
  '.panel span.soon .badge{ color:var(--ink-faint); border-color:rgba(120,150,140,.2); margin-left:auto; align-self:center; }',
  /* CORNER CLUSTER */
  '.corner{ display:flex; align-items:center; gap:6px; margin-left:14px; }',
  '.corner .cc-link, .corner .cc-ascend{',
  '  font-family:var(--f-hud); font-size:10px; font-weight:500; letter-spacing:.16em; text-transform:uppercase;',
  '  line-height:1; padding:7px 11px; border:1px solid var(--edge); background:rgba(10,14,19,.42); color:var(--ink-soft);',
  '  cursor:pointer; white-space:nowrap; transition:color .3s, border-color .3s, background .3s; border-radius:2px; }',
  '.corner .cc-link:hover{ color:var(--emerald); border-color:color-mix(in srgb,var(--emerald) 40%,transparent); }',
  '.corner .cc-home{ color:var(--emerald); border-color:color-mix(in srgb,var(--emerald) 34%,transparent); background:rgba(0,255,156,.06); }',
  '.corner .cc-home:hover{ color:#022; background:var(--emerald); border-color:transparent; }',
  '.corner .cc-deck{ color:var(--ink); }',
  '.corner .cc-deck:hover{ color:var(--emerald); border-color:color-mix(in srgb,var(--emerald) 45%,transparent); }',
  '.corner .cc-ascend{ color:var(--gold); border-color:color-mix(in srgb,var(--gold) 42%,transparent); background:rgba(232,196,92,.08); }',
  '.corner .cc-ascend:hover{ color:#241a03; background:var(--gold); border-color:transparent; }',
  '.corner .cc-link:focus-visible, .corner .cc-ascend:focus-visible{ outline:1px solid var(--emerald); outline-offset:2px; }',
  '@media(max-width:1180px){ .corner .cc-docs-hide, .corner #cornerDocs{ display:none; } }',
  '@media(max-width:960px){ .corner{ display:none; } }',
  /* mobile menu button + panel */
  '.menuBtn{ display:none; font-family:var(--f-hud); font-size:11px; font-weight:600; letter-spacing:.22em; text-transform:uppercase;',
  '  color:var(--emerald); background:none; border:1px solid rgba(0,255,156,.3); padding:9px 14px; cursor:pointer; }',
  '#mobileNav{ position:fixed; inset:0; z-index:120; background:radial-gradient(120% 90% at 50% 0%, rgba(10,20,16,.98), rgba(6,8,11,.99));',
  '  backdrop-filter:blur(6px); padding:76px var(--gutter) 40px; overflow-y:auto; opacity:0; visibility:hidden; transform:translateY(-12px);',
  '  transition:opacity .4s var(--ease), transform .4s var(--ease), visibility .4s; }',
  '#mobileNav.open{ opacity:1; visibility:visible; transform:none; }',
  '#mobileNav .mclose{ position:absolute; top:20px; right:var(--gutter); font-family:var(--f-mono); font-size:12px; letter-spacing:.2em;',
  '  color:var(--gold); background:none; border:0; cursor:pointer; }',
  '.mhome{ display:inline-flex; align-items:center; gap:9px; margin:2px 0 4px; padding:10px 15px; border:1px solid color-mix(in srgb,var(--emerald) 34%,transparent);',
  '    background:rgba(0,255,156,.07); color:var(--emerald); font-family:var(--f-hud); font-weight:600; font-size:14px; letter-spacing:.1em; text-transform:uppercase; border-radius:3px; }',
  '.mhome .gi{ font-size:16px; }',
  '.mgroup{ border-top:1px solid var(--edge); padding:18px 0; }',
  '.mgroup>.mh{ font-family:var(--f-display); font-weight:700; letter-spacing:.10em; text-transform:uppercase; font-size:15px; color:var(--emerald); margin-bottom:12px; }',
  '.mgroup a, .mgroup span.soon{ display:flex; align-items:center; gap:10px; padding:9px 0; font-family:var(--f-hud); font-weight:500; font-size:13px; letter-spacing:.08em; color:var(--ink-soft); }',
  '.mgroup a .gi{ color:var(--gold); }',
  '.mgroup a:active{ color:var(--emerald); }',
  '.mgroup span.soon{ color:var(--ink-faint); }',
  '.mgroup .badge{ font-family:var(--f-mono); font-size:8px; letter-spacing:.14em; padding:1px 5px; border:1px solid var(--emerald-dim); color:var(--emerald); margin-left:auto; }',
  '@media(max-width:960px){ .bar nav.mega{ display:none; } .menuBtn{ display:inline-block; } }',
  '.bar nav.mega a:hover{ color:var(--emerald); }',
  '@media(min-width:961px){ #mobileNav{ display:none; } }',
  /* spacer so page content is not hidden under the fixed bar (only when body has no hero descent) */
  'body.shd-nav-spacer{ padding-top:60px; }'
  ].join('\n');

  // ── nav HTML (verbatim from home.html header + mobile panel) ───────────
  var NAV_HTML =
  '<header class="bar shd-nav">'+
  '  <a href="/home.html" class="mark">◈ <b>SHADDAI</b></a>'+
  '  <nav class="mega" aria-label="Primary">'+
  '    <div class="pillar" data-pillar data-key="worlds">'+
  '      <button aria-haspopup="true" aria-expanded="false">Worlds <span class="cx">▾</span></button>'+
  '      <div class="panel" role="menu">'+
  '        <div class="phdr"><span>The ways in</span><span class="cd">SCALE · 0</span></div>'+
  '        <a href="/dashboard" role="menuitem"><span class="gi">◈</span><span class="lk"><span class="t">Command Deck</span><span class="s">your 2D control surface</span></span><span class="badge live">live</span></a>'+
  '        <a href="/SHADDAI-WORLD-3D.html" role="menuitem"><span class="gi">✦</span><span class="lk"><span class="t">3D World</span><span class="s">walk among the Seven</span></span><span class="badge live">live</span></a>'+
  '        <a href="/_LAUNCH.html" role="menuitem"><span class="gi">▦</span><span class="lk"><span class="t">Pixel World</span><span class="s">isometric multiplayer city · 7 realms</span></span><span class="badge live">live</span></a>'+
  '      </div>'+
  '    </div>'+
  '    <div class="pillar" data-pillar data-key="council">'+
  '      <button aria-haspopup="true" aria-expanded="false">The Council <span class="cx">▾</span></button>'+
  '      <div class="panel" role="menu">'+
  '        <div class="phdr"><span>The Seven + their halls</span><span class="cd">SCALE · I</span></div>'+
  '        <a href="/agents.html" role="menuitem"><span class="gi">◈</span><span class="lk"><span class="t">Meet the Seven</span><span class="s">personas &amp; loadouts</span></span><span class="badge live">live</span></a>'+
  '        <a href="/athenaeum.html" role="menuitem"><span class="gi">☰</span><span class="lk"><span class="t">The Athenaeum</span><span class="s">the halls of knowledge</span></span><span class="badge live">live</span></a>'+
  '        <a href="/oracle-sky.html" role="menuitem"><span class="gi">◉</span><span class="lk"><span class="t">Oracle\'s Observatory</span><span class="s">research &amp; foresight</span></span><span class="badge live">live</span></a>'+
  '        <a href="/library.html" role="menuitem"><span class="gi">✒</span><span class="lk"><span class="t">Quill\'s Library</span><span class="s">words &amp; codices</span></span><span class="badge live">live</span></a>'+
  '        <a href="/museum.html" role="menuitem"><span class="gi">❂</span><span class="lk"><span class="t">Turtle\'s Museum</span><span class="s">art &amp; creation</span></span><span class="badge live">live</span></a>'+
  '      </div>'+
  '    </div>'+
  '    <div class="pillar" data-pillar data-key="create">'+
  '      <button aria-haspopup="true" aria-expanded="false">Create <span class="cx">▾</span></button>'+
  '      <div class="panel" role="menu">'+
  '        <div class="phdr"><span>Make things</span><span class="cd">FORGE</span></div>'+
  '        <a href="/forge.html" role="menuitem"><span class="gi">⚒</span><span class="lk"><span class="t">The Forge</span><span class="s">pixel + 3D · skills · tools · a body</span></span><span class="badge live">live</span></a>'+
  '        <a href="/creative-studio.html" role="menuitem"><span class="gi">◨</span><span class="lk"><span class="t">Creative Studio</span><span class="s">beats · melody · art · hertz</span></span><span class="badge live">live</span></a>'+
  '        <span class="soon"><span class="gi">✂</span><span class="lk"><span class="t">Video Clipper</span><span class="s">cut &amp; caption clips</span></span><span class="badge">soon</span></span>'+
  '      </div>'+
  '    </div>'+
  '    <div class="pillar" data-pillar data-key="play">'+
  '      <button aria-haspopup="true" aria-expanded="false">Play <span class="cx">▾</span></button>'+
  '      <div class="panel" role="menu">'+
  '        <div class="phdr"><span>The arcade</span><span class="cd">SKILL ENGINE</span></div>'+
  '        <a href="/play.html" role="menuitem"><span class="gi">✧</span><span class="lk"><span class="t">Overview</span><span class="s">the arcade</span></span><span class="badge live">live</span></a>'+
  '        <a href="/arcade.html" role="menuitem"><span class="gi">◈</span><span class="lk"><span class="t">The Arcade</span><span class="s">skill-driven neon sports</span></span><span class="badge live">live</span></a>'+
  '      </div>'+
  '    </div>'+
  '    <div class="pillar" data-pillar data-key="markets">'+
  '      <button aria-haspopup="true" aria-expanded="false">Signals <span class="cx">▾</span></button>'+
  '      <div class="panel" role="menu">'+
  '        <div class="phdr"><span>Markets &amp; signals</span><span class="cd">SCALE · V</span></div>'+
  '        <a href="/zerox-markets.html" role="menuitem"><span class="gi">₿</span><span class="lk"><span class="t">ZEROX Markets</span><span class="s">BTC · SOL · ETH · SpaceX</span></span><span class="badge live">live</span></a>'+
  '        <a href="/api" role="menuitem"><span class="gi">◈</span><span class="lk"><span class="t">Signals API</span><span class="s">live rug-filtered calls · JSON · free key</span></span><span class="badge live">live</span></a>'+
  '        <a href="/api" role="menuitem"><span class="gi">✎</span><span class="lk"><span class="t">News API</span><span class="s">crypto headlines &amp; trending · free key</span></span><span class="badge live">live</span></a>'+
  '        <a href="https://t.me/ShaddaiSignalsBot" target="_blank" rel="noopener" role="menuitem"><span class="gi">✈</span><span class="lk"><span class="t">Signals on Telegram</span><span class="s">live rug-filtered calls in your DMs</span></span><span class="badge live">live</span></a>'+
  '      </div>'+
  '    </div>'+
  '    <div class="pillar" data-pillar data-key="aura">'+
  '      <button aria-haspopup="true" aria-expanded="false">AURA <span class="cx">▾</span></button>'+
  '      <div class="panel" role="menu">'+
  '        <div class="phdr"><span>The token-saver</span><span class="cd">LEDGER</span></div>'+
  '        <a href="/aura.html" role="menuitem"><span class="gi">⚖</span><span class="lk"><span class="t">What AURA is</span><span class="s">coin spared per call</span></span><span class="badge live">live</span></a>'+
  '        <a href="/aura.html#ledger" role="menuitem"><span class="gi">◷</span><span class="lk"><span class="t">Live ledger</span><span class="s">coin spared, in ink</span></span><span class="badge live">live</span></a>'+
  '        <a href="/aura.html#opensource" role="menuitem"><span class="gi">⌘</span><span class="lk"><span class="t">Open-source</span><span class="s">npm shaddai-aura + MCP</span></span><span class="badge live">live</span></a>'+
  '      </div>'+
  '    </div>'+
  '    <div class="pillar" data-pillar data-key="shop">'+
  '      <button aria-haspopup="true" aria-expanded="false">Shop <span class="cx">▾</span></button>'+
  '      <div class="panel" role="menu">'+
  '        <div class="phdr"><span>The bazaar &amp; economy</span><span class="cd">MARKET</span></div>'+
  '        <a href="/marketplace-shop-v2.html" role="menuitem"><span class="gi">◈</span><span class="lk"><span class="t">The Bazaar</span><span class="s">agents · skills · knowledge · workflows · cosmetics</span></span><span class="badge live">live</span></a>'+
  '        <a href="/collectibles-nft.html" role="menuitem"><span class="gi">◆</span><span class="lk"><span class="t">NFTs</span><span class="s">redeemable collectables</span></span><span class="badge live">live</span></a>'+
  '        <span class="soon"><span class="gi">▣</span><span class="lk"><span class="t">3D Portals</span><span class="s">collaborate — your own portal world</span></span><span class="badge">soon</span></span>'+
  '      </div>'+
  '    </div>'+
  '    <div class="pillar" data-key="codex">'+
  '      <button type="button" onclick="location.href=\'/codex.html\'">Codex</button>'+
  '    </div>'+
  '  </nav>'+
  '  <div class="corner" id="cornerCluster">'+
  '    <a class="cc-link cc-home" id="cornerHome" href="/home.html" title="Home">⌂ Home</a>'+
  '    <a class="cc-link" id="cornerDocs" href="/codex.html" title="Docs — the Codex">Docs</a>'+
  '    <a class="cc-link cc-deck" id="cornerDeck" href="/dashboard" title="Enter the Command Deck">Enter Dashboard</a>'+
  '    <a class="cc-ascend" id="cornerAscend" href="/lab-molecules.html" title="Open the full-screen Ascent">▶ Ascend</a>'+
  '  </div>'+
  '  <button class="menuBtn" id="menuBtn" aria-expanded="false" aria-controls="mobileNav">☰ Menu</button>'+
  '</header>'+
  '<div id="mobileNav" aria-hidden="true">'+
  '  <button class="mclose" id="mClose">✕ close</button>'+
  '  <a class="mhome" href="/home.html"><span class="gi">⌂</span>Home</a>'+
  '  <div class="mgroup"><div class="mh">Worlds</div>'+
  '    <a href="/dashboard"><span class="gi">◈</span>Command Deck<span class="badge">live</span></a>'+
  '    <a href="/SHADDAI-WORLD-3D.html"><span class="gi">✦</span>3D World<span class="badge">live</span></a>'+
  '    <a href="/_LAUNCH.html"><span class="gi">▦</span>Pixel World<span class="badge">live</span></a>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">The Council</div>'+
  '    <a href="/agents.html"><span class="gi">◈</span>Meet the Seven<span class="badge">live</span></a>'+
  '    <a href="/athenaeum.html"><span class="gi">☰</span>The Athenaeum<span class="badge">live</span></a>'+
  '    <a href="/oracle-sky.html"><span class="gi">◉</span>Oracle\'s Observatory<span class="badge">live</span></a>'+
  '    <a href="/library.html"><span class="gi">✒</span>Quill\'s Library<span class="badge">live</span></a>'+
  '    <a href="/museum.html"><span class="gi">❂</span>Turtle\'s Museum<span class="badge">live</span></a>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">Create</div>'+
  '    <a href="/forge.html"><span class="gi">⚒</span>The Forge · Pixel + 3D<span class="badge">live</span></a>'+
  '    <a href="/creative-studio.html"><span class="gi">◨</span>Creative Studio<span class="badge">live</span></a>'+
  '    <span class="soon"><span class="gi">✂</span>Video Clipper · soon</span>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">Play</div>'+
  '    <a href="/play.html"><span class="gi">✧</span>Overview<span class="badge">live</span></a>'+
  '    <a href="/arcade.html"><span class="gi">◈</span>The Arcade<span class="badge">live</span></a>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">Signals</div>'+
  '    <a href="/zerox-markets.html"><span class="gi">₿</span>ZEROX Markets<span class="badge">live</span></a>'+
  '    <a href="/api"><span class="gi">◈</span>Signals API<span class="badge">live</span></a>'+
  '    <a href="/api"><span class="gi">✎</span>News API<span class="badge">live</span></a>'+
  '    <a href="https://t.me/ShaddaiSignalsBot" target="_blank" rel="noopener"><span class="gi">✈</span>Signals on Telegram<span class="badge">live</span></a>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">AURA</div>'+
  '    <a href="/aura.html"><span class="gi">⚖</span>What AURA is<span class="badge">live</span></a>'+
  '    <a href="/aura.html#ledger"><span class="gi">◷</span>Live ledger<span class="badge">live</span></a>'+
  '    <a href="/aura.html#opensource"><span class="gi">⌘</span>Open-source · npm + MCP<span class="badge">live</span></a>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">Shop</div>'+
  '    <a href="/marketplace-shop-v2.html"><span class="gi">◈</span>The Bazaar · agents · skills · workflows<span class="badge">live</span></a>'+
  '    <a href="/collectibles-nft.html"><span class="gi">◆</span>NFTs · redeemable collectables<span class="badge">live</span></a>'+
  '    <span class="soon"><span class="gi">▣</span>3D Portals · collaborate · soon</span>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">Codex</div>'+
  '    <a href="/codex.html"><span class="gi">📜</span>The Codex · the almanac<span class="badge">live</span></a>'+
  '  </div>'+
  '  <div class="mgroup"><div class="mh">Quick</div>'+
  '    <a href="/lab-molecules.html"><span class="gi">▶</span>Ascend · full screen<span class="badge">film</span></a>'+
  '    <a href="/dashboard"><span class="gi">◈</span>Enter Dashboard<span class="badge">live</span></a>'+
  '  </div>'+
  '</div>';

  // ── injection ──────────────────────────────────────────────────────────
  function injectFonts(){
    // (b) Google Fonts — only if not already present
    var has = false;
    var links = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
    for(var i=0;i<links.length;i++){ if((links[i].href||'').indexOf('Cinzel+Decorative')>-1){ has=true; break; } }
    if(has) return;
    var pc1=document.createElement('link'); pc1.rel='preconnect'; pc1.href='https://fonts.googleapis.com';
    var pc2=document.createElement('link'); pc2.rel='preconnect'; pc2.href='https://fonts.gstatic.com'; pc2.crossOrigin='anonymous';
    var l=document.createElement('link'); l.rel='stylesheet';
    l.href='https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Cinzel+Decorative:wght@500;700;900&family=Chakra+Petch:wght@300;400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(pc1); document.head.appendChild(pc2); document.head.appendChild(l);
  }

  function injectStyle(){
    var css = (hasTokens() ? '' : TOKENS + '\n') + CSS;
    var s=document.createElement('style'); s.id='shd-nav-style'; s.textContent=css;
    document.head.appendChild(s);
  }

  function injectNav(){
    if(document.querySelector('header.bar.shd-nav')) return; // idempotent
    var host=document.createElement('div'); host.id='shd-nav-host';
    host.innerHTML=NAV_HTML;
    // move children to top of body (preserve order)
    var frag=document.createDocumentFragment();
    while(host.firstChild){ frag.appendChild(host.firstChild); }
    document.body.insertBefore(frag, document.body.firstChild);
    // add a top spacer only when the page has no full-bleed hero of its own
    // (hero pages already reserve the whole viewport, so the fixed bar overlays them like Home)
    if(!document.querySelector('.hero, .hero-center, [data-nav-nospacer]')){
      document.body.classList.add('shd-nav-spacer');
    }
  }

  function markActive(){
    if(!ACTIVE) return;
    var p=document.querySelector('.pillar[data-key="'+ACTIVE+'"]');
    if(p){ p.classList.add('active'); var b=p.querySelector('button'); if(b) b.setAttribute('aria-current','page'); }
  }

  // ── wiring: mega-menu (click/keyboard/Esc/outside) ─────────────────────
  function wireMega(){
    var pillars=Array.prototype.slice.call(document.querySelectorAll('.pillar[data-pillar]'));
    pillars.forEach(function(p){
      Array.prototype.slice.call(p.querySelectorAll('.panel > a, .panel > .soon')).forEach(function(row,i){ row.style.setProperty('--i', i); });
    });
    function closeAll(except){ pillars.forEach(function(p){ if(p!==except){ p.classList.remove('open');
      var b=p.querySelector('button'); if(b) b.setAttribute('aria-expanded','false'); } }); }
    pillars.forEach(function(p){
      var btn=p.querySelector('button');
      btn.addEventListener('click', function(e){ e.preventDefault();
        var isOpen=p.classList.contains('open'); closeAll(p);
        p.classList.toggle('open', !isOpen); btn.setAttribute('aria-expanded', String(!isOpen)); });
      btn.addEventListener('keydown', function(e){
        if(e.key==='ArrowDown'){ e.preventDefault(); p.classList.add('open'); btn.setAttribute('aria-expanded','true');
          var first=p.querySelector('.panel a'); if(first) first.focus(); }
        else if(e.key==='Escape'){ p.classList.remove('open'); btn.setAttribute('aria-expanded','false'); } });
      p.querySelector('.panel').addEventListener('keydown', function(e){
        if(e.key==='Escape'){ p.classList.remove('open'); btn.setAttribute('aria-expanded','false'); btn.focus(); } });
    });
    document.addEventListener('click', function(e){ if(!e.target.closest('.pillar[data-pillar]')) closeAll(null); });
  }

  // ── wiring: mobile menu ────────────────────────────────────────────────
  function wireMobile(){
    var btn=document.getElementById('menuBtn'), nav=document.getElementById('mobileNav'), close=document.getElementById('mClose');
    if(!btn||!nav) return;
    function open(){ nav.classList.add('open'); nav.setAttribute('aria-hidden','false'); btn.setAttribute('aria-expanded','true'); }
    function shut(){ nav.classList.remove('open'); nav.setAttribute('aria-hidden','true'); btn.setAttribute('aria-expanded','false'); }
    btn.addEventListener('click', open); if(close) close.addEventListener('click', shut);
    nav.addEventListener('click', function(e){ var a=e.target.closest('a'); if(a) shut(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && nav.classList.contains('open')) shut(); });
  }

  function boot(){
    injectFonts();
    injectStyle();
    injectNav();
    markActive();
    wireMega();
    wireMobile();
  }

  if(document.body){ boot(); }
  else if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})();

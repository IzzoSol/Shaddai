/* ============================================================================
 * SHADDAI · rooms-command-deck.js — "Holographic Command Deck" agent room (P1)
 * ----------------------------------------------------------------------------
 * Self-contained, additive. OVERRIDES window.openAgentRoom(agentId) to render a
 * premium command-deck room into #agentRoomOverlay, wired to REAL endpoints:
 *   GET  /api/brains                         → model list + key-pool
 *   GET  /api/operatives/:id                 → forged agent (brain/tools/stats)
 *   PATCH/api/operatives/:id  {brain|tools}  → change model / equip skills
 *   GET  /api/skills/catalog?limit=5000      → 3.4k-skill library
 *   POST /api/agent/run  + GET /api/agent/task/:id   → OPERATE cockpit
 *   POST /api/collectibles/mint + /list, GET /listings → WORKSHOP → Bazaar
 * Works for the 7 council agents AND forged operatives ("op:<id>").
 * VIEW-3D toggle reuses window._roomViewer (defined in index.html).
 * NEVER throws; scoped under `.cd-*`; injects its own <style>. index.html gets
 * exactly one <script> include — no other dashboard changes.
 * ==========================================================================*/
(function () {
  'use strict';

  var GLB = { shaddai:'SHADDAI', nexus:'NEXUS', zerox:'ZEROX', oracle:'ORACLE', turtle:'TURTLE', quill:'QUILL', pikadon:'PIKADON' };
  var COUNCIL = {
    nexus:  { nm:'NEXUS',  role:'TECHNICAL ARCHITECT — BACKEND · INFRA · SCALE', mood:'WORKING',  acg:'0,229,255',  lore:'Backend systems, APIs, and infrastructure. Thinks in scale. Ships nothing without a plan.', scene:'THE CORE' },
    shaddai:{ nm:'SHADDAI', role:'SUPREME ORCHESTRATOR — STRATEGY · FINAL CALLS', mood:'FOCUSED', acg:'255,107,53', lore:'Leads the empire. Strategic vision, final decisions, revenue obsession.', scene:'THRONE TEMPLE' },
    zerox:  { nm:'ZEROX',  role:'REVENUE ENGINE — MARKETS · PRICING · MRR',     mood:'WORKING',  acg:'255,215,0',  lore:'Billing, pricing, subscriptions. Every decision measured in MRR.', scene:'TRADING FLOOR' },
    oracle: { nm:'ORACLE', role:'RESEARCH INTEL — TRENDS · SIGNALS',            mood:'IDLE',     acg:'167,139,250',lore:'Spots trends before they happen. Connects dots no one else sees.', scene:'OBSERVATORY' },
    turtle: { nm:'TURTLE', role:'UI / UX DESIGNER — VISUALS · BRAND',           mood:'WORKING',  acg:'0,255,136',  lore:'Makes things beautiful. Cares about feel, flow, and brand identity.', scene:'DESIGN STUDIO' },
    quill:  { nm:'QUILL',  role:'WRITER — COPY · DOCS · CLARITY',               mood:'FOCUSED',  acg:'251,146,60', lore:'No fluff. Every word earns its place. Writes docs people actually read.', scene:'THE LIBRARY' },
    pikadon:{ nm:'PIKADON',role:'SECURITY GUARD — AUDIT · COMPLIANCE',          mood:'WORKING',  acg:'244,63,94',  lore:'Assumes worst-case. Reviews everything. Keeps secrets truly safe.', scene:'THE VAULT' }
  };
  function sceneCss(id){var m={
    nexus:'radial-gradient(60% 45% at 50% 20%,rgba(0,229,255,.22),transparent 70%),repeating-linear-gradient(90deg,transparent 0 38px,rgba(0,229,255,.08) 38px 39px),linear-gradient(180deg,#041018,#02060c)',
    shaddai:'radial-gradient(70% 60% at 50% 8%,rgba(255,107,53,.28),transparent 65%),conic-gradient(from 200deg at 50% 0%,transparent,rgba(255,107,53,.12),transparent 40%),linear-gradient(180deg,#160a06,#05030a)',
    zerox:'linear-gradient(0deg,rgba(255,215,0,.12),transparent 40%),repeating-linear-gradient(90deg,rgba(255,215,0,.14) 0 3px,transparent 3px 26px),linear-gradient(180deg,#12100a,#05040a)',
    oracle:'radial-gradient(50% 40% at 50% 25%,rgba(167,139,250,.26),transparent 70%),radial-gradient(1px 1px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 70% 20%,#fff,transparent),radial-gradient(1px 1px at 40% 60%,#cbb6ff,transparent),linear-gradient(180deg,#0c0a1a,#04030a)',
    turtle:'radial-gradient(60% 50% at 50% 22%,rgba(0,255,136,.22),transparent 70%),conic-gradient(from 120deg at 30% 40%,rgba(0,255,136,.1),transparent 30%),linear-gradient(180deg,#04140d,#02060a)',
    quill:'radial-gradient(60% 50% at 50% 30%,rgba(251,146,60,.2),transparent 70%),repeating-linear-gradient(90deg,rgba(251,146,60,.16) 0 5px,rgba(120,70,30,.14) 5px 12px,transparent 12px 20px),linear-gradient(180deg,#140d06,#06040a)',
    pikadon:'radial-gradient(55% 45% at 50% 25%,rgba(244,63,94,.22),transparent 70%),repeating-linear-gradient(60deg,rgba(244,63,94,.09) 0 20px,transparent 20px 40px),linear-gradient(180deg,#140609,#05030a)'
  };return m[id]||m.nexus;}

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function j(u,o){return fetch(u,o).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});}
  function el(id){return document.getElementById(id);}

  /* ---- one-time CSS inject ---- */
  function injectCss(){
    if (el('cdCss')) return;
    var s=document.createElement('style'); s.id='cdCss';
    s.textContent=[
    "#agentRoomOverlay{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(2,4,9,.82);backdrop-filter:blur(6px);font-family:'Chakra Petch','Share Tech Mono',sans-serif}",
    ".cd{--ac:#00e5ff;--acg:0,229,255;--ink:#dfe9f5;--mut:rgba(223,233,245,.45);position:relative;width:min(1240px,100%);height:min(770px,94vh);display:grid;grid-template-columns:1.2fr 1fr;grid-template-rows:auto 1fr;overflow:hidden;border:1px solid rgba(var(--acg),.3);border-radius:18px;background:linear-gradient(180deg,rgba(10,18,32,.9),rgba(4,7,13,.96));box-shadow:0 40px 120px rgba(0,0,0,.7),inset 0 0 120px rgba(var(--acg),.05);color:var(--ink);animation:cdIn .5s cubic-bezier(.2,.8,.2,1) both}",
    "@keyframes cdIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}",
    ".cd::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;z-index:6;background:linear-gradient(90deg,transparent,var(--ac),transparent);filter:drop-shadow(0 0 6px var(--ac));animation:cdSweep 5.5s linear infinite}",
    "@keyframes cdSweep{0%{transform:translateX(-40%);opacity:0}12%,88%{opacity:.9}100%{transform:translateX(40%);opacity:0}}",
    ".cd svg.i{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.12em}",
    ".cd .bar{grid-column:1/3;display:flex;align-items:center;gap:15px;padding:14px 20px;border-bottom:1px solid rgba(var(--acg),.28);background:linear-gradient(180deg,rgba(var(--acg),.08),transparent)}",
    ".cd .sig{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;font-family:'Press Start 2P',monospace;font-size:13px;color:var(--ac);background:radial-gradient(circle at 40% 30%,rgba(var(--acg),.35),rgba(var(--acg),.06));border:1px solid rgba(var(--acg),.5);box-shadow:0 0 22px rgba(var(--acg),.35)}",
    ".cd h1{margin:0;font-family:'Press Start 2P',monospace;font-size:14px;color:var(--ac);text-shadow:0 0 18px rgba(var(--acg),.6)}",
    ".cd .role{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--mut);margin-top:6px}",
    ".cd .mood{margin-left:auto;display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:22px;border:1px solid rgba(var(--acg),.35);background:rgba(var(--acg),.07);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px}",
    ".cd .dot{width:8px;height:8px;border-radius:50%;background:var(--ac);box-shadow:0 0 10px var(--ac);animation:cdPulse 1.8s ease-in-out infinite}",
    "@keyframes cdPulse{0%,100%{opacity:1}50%{opacity:.35}}",
    ".cd .x{width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:var(--mut);cursor:pointer;font-size:15px}.cd .x:hover{border-color:var(--ac);color:var(--ac)}",
    ".cd .holo{position:relative;overflow:hidden;border-right:1px solid rgba(var(--acg),.2);display:flex;align-items:flex-end;justify-content:center;cursor:crosshair}",
    ".cd .holo::after{content:'';position:absolute;inset:0;z-index:4;pointer-events:none;box-shadow:inset 0 0 120px 34px rgba(0,0,0,.6)}",
    ".cd .scene{position:absolute;inset:0;z-index:0}",
    ".cd .floor{position:absolute;inset:-2px;z-index:0;opacity:.4;background-image:linear-gradient(rgba(var(--acg),.16) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--acg),.16) 1px,transparent 1px);background-size:46px 46px;-webkit-mask-image:radial-gradient(120% 80% at 50% 55%,#000,transparent 78%);mask-image:radial-gradient(120% 80% at 50% 55%,#000,transparent 78%);animation:cdDrift 22s linear infinite}",
    "@keyframes cdDrift{to{background-position:0 -46px,-46px 0}}",
    ".cd .beam{position:absolute;top:-6%;left:50%;transform:translateX(-50%);width:44%;height:92%;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(var(--acg),.2),rgba(var(--acg),.04) 55%,transparent);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);filter:blur(7px);opacity:.6;animation:cdPulse 4s ease-in-out infinite}",
    ".cd .glow{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);width:56%;height:60px;z-index:1;border-radius:50%;background:radial-gradient(ellipse,rgba(var(--acg),.45),transparent 70%);filter:blur(8px)}",
    ".cd .figw{position:relative;z-index:2;height:82%;margin-bottom:28px;display:flex;flex-direction:column;align-items:center;animation:cdFloat 6s ease-in-out infinite}",
    "@keyframes cdFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}",
    ".cd .fig{position:relative;height:100%;filter:drop-shadow(0 24px 40px rgba(0,0,0,.6)) drop-shadow(0 0 40px rgba(var(--acg),.35));transition:transform .2s ease-out}.cd .fig img{height:100%;object-fit:contain;display:block}",
    ".cd .fig::after{content:'';position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:.4;background:repeating-linear-gradient(0deg,transparent 0 2px,rgba(var(--acg),.22) 2px 3px);background-size:100% 4px;animation:cdHs 3.2s linear infinite}",
    "@keyframes cdHs{to{background-position:0 -120px}}",
    ".cd #cdHost{position:absolute;inset:0;z-index:2;display:none}",
    ".cd .tag{position:absolute;top:14px;left:14px;z-index:3;display:flex;gap:7px;align-items:center;padding:5px 11px;border-radius:20px;background:rgba(0,0,0,.5);border:1px solid rgba(var(--acg),.4);font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:2px;color:var(--ac)}",
    ".cd .vtog{position:absolute;top:12px;right:12px;z-index:5;display:flex;background:rgba(0,0,0,.5);border:1px solid rgba(var(--acg),.4);border-radius:22px;overflow:hidden}",
    ".cd .vtog button{border:none;background:transparent;color:var(--mut);cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:1px;padding:6px 12px;display:flex;align-items:center;gap:5px}.cd .vtog button.on{background:rgba(var(--acg),.22);color:var(--ac)}",
    ".cd .lvl{position:absolute;bottom:14px;left:16px;z-index:3;font-family:'Press Start 2P',monospace;font-size:10px;color:var(--ac);text-shadow:0 0 12px rgba(var(--acg),.7)}.cd .lvl small{display:block;font-family:'Share Tech Mono',monospace;font-size:7px;letter-spacing:2px;color:var(--mut);margin-bottom:5px}",
    ".cd .panel{position:relative;display:flex;flex-direction:column;background:rgba(8,16,28,.62);min-height:0}",
    ".cd .tabs{position:relative;display:flex;gap:2px;padding:12px 12px 0;border-bottom:1px solid rgba(var(--acg),.28)}",
    ".cd .tab{flex:1;padding:10px 4px 12px;text-align:center;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:1px;color:var(--mut);border-bottom:2px solid transparent;transition:.16s}.cd .tab:hover{color:var(--ink)}.cd .tab.on{color:var(--ac)}",
    ".cd .tab .ic{display:block;font-size:15px;margin-bottom:5px}",
    ".cd .tabInd{position:absolute;bottom:-1px;height:2px;background:var(--ac);box-shadow:0 0 10px var(--ac);border-radius:2px;transition:left .28s cubic-bezier(.2,.8,.2,1),width .28s}",
    ".cd .body{flex:1;overflow:auto;padding:18px 20px;min-height:0}.cd .body::-webkit-scrollbar{width:7px}.cd .body::-webkit-scrollbar-thumb{background:rgba(var(--acg),.3);border-radius:4px}",
    ".cd .pane{display:none;animation:cdFade .3s ease both}.cd .pane.on{display:block}@keyframes cdFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
    ".cd .sec{font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:2px;color:rgba(var(--acg),.7);margin:0 0 10px;display:flex;align-items:center;gap:8px}.cd .sec::after{content:'';flex:1;height:1px;background:rgba(var(--acg),.16)}.cd .sec.mt{margin-top:18px}",
    ".cd .lore{font-size:13px;line-height:1.7;color:rgba(223,233,245,.72);border-left:2px solid rgba(var(--acg),.5);padding-left:12px;font-style:italic}",
    ".cd .brain{border:1px solid rgba(var(--acg),.25);border-radius:12px;padding:12px;background:rgba(var(--acg),.05)}",
    ".cd .brow{display:flex;align-items:center;gap:10px}",
    ".cd .bic{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;color:var(--ac);background:rgba(var(--acg),.12);border:1px solid rgba(var(--acg),.35);font-size:17px}",
    ".cd .bmeta b{font-weight:700;font-size:13px;color:var(--ink)}.cd .bmeta span{display:block;font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--mut);margin-top:3px}",
    ".cd .bsel{margin-left:auto;background:rgba(0,0,0,.4);border:1px solid rgba(var(--acg),.35);border-radius:8px;color:var(--ac);font-family:'Share Tech Mono',monospace;font-size:10px;padding:7px 8px;cursor:pointer;outline:none;max-width:150px}",
    ".cd .bars{margin-top:12px;display:flex;flex-direction:column;gap:8px}.cd .brw{display:flex;align-items:center;gap:9px;font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--mut)}.cd .brw b{width:64px;color:var(--ink);font-weight:400}.cd .brw .v{width:56px;text-align:right;color:var(--ac)}",
    ".cd .bbar{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}.cd .bbar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,rgba(var(--acg),.5),var(--ac));box-shadow:0 0 8px rgba(var(--acg),.6);transition:width 1s}",
    ".cd .goal{width:100%;background:rgba(0,0,0,.35);border:1px solid rgba(var(--acg),.3);border-radius:10px;color:var(--ink);font-family:'Chakra Petch',sans-serif;font-size:13px;padding:12px;resize:none;outline:none}.cd .goal:focus{border-color:var(--ac)}",
    ".cd .run{margin-top:10px;width:100%;padding:12px;border:none;border-radius:10px;cursor:pointer;font-family:'Press Start 2P',monospace;font-size:9px;color:#02121a;background:linear-gradient(135deg,var(--ac),rgba(var(--acg),.55));box-shadow:0 0 24px rgba(var(--acg),.4);display:flex;align-items:center;justify-content:center;gap:8px}.cd .run:hover{transform:translateY(-2px)}.cd .run:disabled{opacity:.6;cursor:wait;transform:none}",
    ".cd .con{margin-top:12px;background:rgba(0,0,0,.42);border:1px solid rgba(var(--acg),.22);border-radius:10px;padding:12px;font-family:'Share Tech Mono',monospace;font-size:11px;line-height:1.7;color:rgba(223,233,245,.82);min-height:120px;max-height:230px;overflow:auto;white-space:pre-wrap}.cd .con .l{color:var(--ac)}.cd .con .m{color:var(--mut)}.cd .con .g{color:#7CFFB2}",
    ".cd .skhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.cd .add{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--ac);background:rgba(var(--acg),.1);border:1px solid rgba(var(--acg),.4);border-radius:8px;padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:5px}.cd .add:hover{background:rgba(var(--acg),.18)}",
    ".cd .cap{font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--mut);margin:0 0 12px}",
    ".cd .skills{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cd .skill{padding:9px 10px;border-radius:10px;background:rgba(var(--acg),.05);border:1px solid rgba(var(--acg),.2);font-family:'Share Tech Mono',monospace;font-size:10px;display:flex;align-items:center;gap:7px;transition:.15s}.cd .skill:hover{border-color:var(--ac)}.cd .skill .k{color:var(--ac)}",
    ".cd .picker{margin-top:10px;border:1px solid rgba(var(--acg),.25);border-radius:10px;background:rgba(0,0,0,.3);max-height:200px;overflow:auto;display:none}.cd .picker.on{display:block}",
    ".cd .psearch{width:100%;background:rgba(0,0,0,.4);border:none;border-bottom:1px solid rgba(var(--acg),.25);color:var(--ink);font-family:'Share Tech Mono',monospace;font-size:11px;padding:9px 11px;outline:none;position:sticky;top:0}",
    ".cd .prow{display:flex;align-items:center;gap:8px;padding:8px 11px;font-family:'Share Tech Mono',monospace;font-size:10px;color:rgba(223,233,245,.75);border-bottom:1px solid rgba(var(--acg),.08);cursor:pointer}.cd .prow:hover{background:rgba(var(--acg),.1);color:var(--ac)}",
    ".cd .wgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.cd .wcard{border:1px solid rgba(var(--acg),.22);border-radius:11px;overflow:hidden;background:rgba(255,255,255,.02)}.cd .wth{aspect-ratio:16/10;position:relative;display:grid;place-items:center;color:var(--mut);font-family:'Share Tech Mono',monospace;font-size:9px}.cd .wth .scene{position:absolute;inset:0}.cd .wmeta{padding:8px 9px}.cd .wt{font-weight:600;font-size:12px;color:var(--ink)}.cd .ws{font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--mut);margin-top:2px}",
    ".cd .list{width:100%;margin-top:8px;padding:7px;border-radius:7px;border:1px solid rgba(var(--acg),.4);background:rgba(var(--acg),.08);color:var(--ac);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}.cd .list:hover{background:rgba(var(--acg),.16)}",
    ".cd .swatches{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px}.cd .sw{width:34px;height:34px;border-radius:9px;border:2px solid rgba(255,255,255,.14);cursor:pointer;transition:.15s}.cd .sw:hover{transform:scale(1.08)}",
    ".cd .opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cd .opt{padding:10px 11px;border-radius:10px;background:rgba(var(--acg),.05);border:1px solid rgba(var(--acg),.2);font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:space-between}.cd .opt:hover{border-color:var(--ac)}.cd .opt.on{border-color:var(--ac);background:rgba(var(--acg),.12);color:var(--ac)}.cd .opt .pill{font-size:7px;padding:3px 6px;border-radius:20px;border:1px solid rgba(255,255,255,.18);color:var(--mut)}.cd .opt.on .pill{border-color:var(--ac);color:var(--ac)}",
    "@media (prefers-reduced-motion:reduce){.cd *{animation:none!important;transition:none!important}}"
    ].join('\n');
    document.head.appendChild(s);
  }

  var IC = {
    ov:'<svg class="i" viewBox="0 0 24 24"><path d="M4 6l8-3 8 3-8 3zM4 6v8l8 3 8-3V6M12 9v11"/></svg>',
    op:'<svg class="i" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
    sk:'<svg class="i" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M8 7l3 9M16 7l-3 9M8 6h8"/></svg>',
    st:'<svg class="i" viewBox="0 0 24 24"><path d="M12 3l2.2 5.5L20 10l-5.8 1.5L12 17l-2.2-5.5L4 10l5.8-1.5z"/></svg>',
    cu:'<svg class="i" viewBox="0 0 24 24"><path d="M4 8h10M18 8h2M4 16h4M12 16h8"/><circle cx="16" cy="8" r="2.3"/><circle cx="10" cy="16" r="2.3"/></svg>',
    d3:'<svg class="i" viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v9M12 12l8-4.5M12 12l-8-4.5"/></svg>',
    d2:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 15l4-4 3 3 4-5 5 6"/></svg>',
    add:'<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    cart:'<svg class="i" viewBox="0 0 24 24"><path d="M4 5h2l2 11h9l2-8H7"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
    run:'<svg class="i" viewBox="0 0 24 24"><path d="M6 4l12 8-12 8z"/></svg>',
    cpu:'<svg class="i" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2"/></svg>'
  };

  /* runtime state for the open room */
  var ST = { agentId:null, forged:false, op:null, brains:null, catalog:null, tools:[], glb:'NEXUS', color:'#00e5ff', acg:'0,229,255', view:'2d', poll:null };

  function color(acg){return '#'+acg.split(',').map(function(n){return (+n).toString(16).padStart(2,'0');}).join('');}

  /* ---- data resolve (council vs forged) ---- */
  function resolve(agentId, cb){
    var forged = String(agentId).indexOf('op:')===0;
    if (forged){
      var id=agentId.slice(3);
      j('/api/operatives/'+id).then(function(r){
        var op=r&&r.operative?r.operative:null;
        cb({forged:true, op:op, glb:(op&&op.model)||'NEXUS', nm:(op&&op.codename)||'OPERATIVE',
            role:((op&&op.archetype)||'forged').toUpperCase()+' · '+((op&&op.rarity)||'common').toUpperCase(),
            mood:'READY', lore:(op&&op.brain&&op.brain.persona)||'A forged operative.',
            acg:'0,229,255', scene:'FORGED CHAMBER', sceneKey:'nexus',
            tools:(op&&op.tools)||[], brainId:(op&&op.brain&&op.brain.brainId)||null});
      });
    } else {
      var c=COUNCIL[agentId]||COUNCIL.nexus;
      cb({forged:false, op:null, glb:GLB[agentId]||'NEXUS', nm:c.nm, role:c.role, mood:c.mood, lore:c.lore,
          acg:c.acg, scene:c.scene, sceneKey:agentId, tools:null, brainId:null});
    }
  }

  function open(agentId){
    injectCss();
    try { window._chamberViewer && window._chamberViewer.dispose && window._chamberViewer.dispose(); } catch(_){}
    var overlay = el('agentRoomOverlay');
    if (!overlay){ overlay=document.createElement('div'); overlay.id='agentRoomOverlay'; document.body.appendChild(overlay); }
    overlay.style.display='flex';
    overlay.innerHTML='<div class="cd" style="align-items:center;justify-content:center;color:rgba(255,255,255,.4);font-family:\'Share Tech Mono\',monospace">◈ INITIALIZING COMMAND DECK…</div>';

    resolve(agentId, function(d){
      ST.agentId=agentId; ST.forged=d.forged; ST.op=d.op; ST.glb=d.glb; ST.acg=d.acg; ST.color=color(d.acg); ST.view='2d';
      ST.sceneKey=d.sceneKey;
      render(d);
      // fetch brains + catalog in background to fill brain panel + skills
      Promise.all([ j('/api/brains'), j('/api/skills/catalog?limit=5000&agent='+encodeURIComponent(d.glb)) ]).then(function(res){
        ST.brains=res[0]; ST.catalog=(res[1]&&res[1].skills)||[];
        fillBrain(d); fillSkills(d);
      });
    });
  }

  function render(d){
    var overlay=el('agentRoomOverlay');
    var img='/assets/agents/'+d.glb+'-action.png';
    overlay.innerHTML=''+
    '<div class="cd" id="cdRoot" style="--acg:'+d.acg+';--ac:'+ST.color+'">'+
      '<div class="bar">'+
        '<div class="sig">'+esc(d.nm.charAt(0))+'</div>'+
        '<div><h1>'+esc(d.nm)+' · COMMAND DECK</h1><div class="role">'+esc(d.role)+'</div></div>'+
        '<div class="mood"><span class="dot"></span> '+esc(d.mood)+'</div>'+
        '<button class="x" id="cdClose">✕</button>'+
      '</div>'+
      '<div class="holo" id="cdHolo">'+
        '<div class="scene" style="background:'+sceneCss(d.sceneKey)+'"></div>'+
        '<div class="floor" id="cdFloor"></div><div class="beam" id="cdBeam"></div>'+
        '<div class="tag"><span class="dot" style="width:6px;height:6px"></span> <span id="cdTag">STATIC · 2D — '+esc(d.scene)+'</span></div>'+
        '<div class="vtog"><button class="on" data-v="2d">'+IC.d2+' 2D</button><button data-v="3d">'+IC.d3+' 3D</button></div>'+
        '<div class="glow"></div>'+
        '<div class="figw" id="cdFigw"><div class="fig" id="cdFig"><img src="'+img+'" alt="" onerror="this.style.opacity=.15"></div></div>'+
        '<div id="cdHost"></div>'+
        '<div class="lvl"><small>OPERATOR</small>'+esc(d.nm)+'</div>'+
      '</div>'+
      '<div class="panel">'+
        '<div class="tabs" id="cdTabs">'+
          '<div class="tab on" data-t="ov"><span class="ic">'+IC.ov+'</span>OVERVIEW</div>'+
          '<div class="tab" data-t="op"><span class="ic">'+IC.op+'</span>OPERATE</div>'+
          '<div class="tab" data-t="sk"><span class="ic">'+IC.sk+'</span>SKILLS</div>'+
          '<div class="tab" data-t="wk"><span class="ic">'+IC.st+'</span>WORKSHOP</div>'+
          '<div class="tab" data-t="cu"><span class="ic">'+IC.cu+'</span>CUSTOMIZE</div>'+
        '</div>'+
        '<div class="body">'+
          '<div class="pane on" data-p="ov">'+
            '<div class="sec">DOSSIER</div><div class="lore">"'+esc(d.lore)+'"</div>'+
            '<div class="sec mt">BRAIN &amp; CONNECTIONS</div><div id="cdBrain" class="brain"><div class="brow"><div class="bic">'+IC.cpu+'</div><div class="bmeta"><b>loading…</b><span>querying /api/brains</span></div></div></div>'+
          '</div>'+
          '<div class="pane" data-p="op">'+
            '<div class="sec">ISSUE DIRECTIVE — runs the agent\'s real skills</div>'+
            '<textarea class="goal" id="cdGoal" rows="3" placeholder="e.g. '+esc(d.forged?'use one of your tools and report':'do a real task with your tools')+'…"></textarea>'+
            '<button class="run" id="cdRun">'+IC.run+' RUN '+esc(d.nm)+'</button>'+
            '<div class="con" id="cdCon"><span class="l">▸ '+esc(d.nm.toLowerCase())+'@shaddai: standing by.</span>\n<span class="m">issue a directive — executes via /api/agent/run.</span></div>'+
          '</div>'+
          '<div class="pane" data-p="sk">'+
            '<div class="skhead"><div class="sec" style="margin:0">EQUIPPED SKILLS</div><button class="add" id="cdAddBtn">'+IC.add+' ADD SKILL</button></div>'+
            '<div class="cap" id="cdSkCap">loading…</div>'+
            '<div class="picker" id="cdPicker"><input class="psearch" id="cdPSearch" placeholder="search 3,478 skills…"><div id="cdPList"></div></div>'+
            '<div class="skills" id="cdSkills" style="margin-top:10px"></div>'+
          '</div>'+
          '<div class="pane" data-p="wk">'+
            '<div class="sec">WORKSHOP — create &amp; list to the Bazaar</div>'+
            '<div class="wgrid" id="cdWGrid"></div>'+
            '<button class="run" id="cdCreate" style="font-size:8px">'+IC.add+' CREATE NEW → LIST TO BAZAAR</button>'+
            '<div class="cap" id="cdWMsg" style="margin-top:10px"></div>'+
          '</div>'+
          '<div class="pane" data-p="cu">'+
            '<div class="sec">ACCENT</div><div class="swatches" id="cdSw"></div>'+
            '<div class="sec mt">ROOM MODULES</div>'+
            '<div class="opts">'+
              '<div class="opt on" data-mod="floor">FLOOR GRID <span class="pill">ON</span></div>'+
              '<div class="opt on" data-mod="beam">LIGHT BEAM <span class="pill">ON</span></div>'+
              '<div class="opt on" data-mod="fig">HOLOGRAM <span class="pill">ON</span></div>'+
            '</div>'+
            '<div class="cap" style="margin-top:10px">In 3D view the model shows its idle / walk / attack clips.</div>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
    wire(d);
  }

  function wire(d){
    // close
    el('cdClose').onclick=function(){ try{window._closeAgentRoom&&window._closeAgentRoom();}catch(_){ } var o=el('agentRoomOverlay'); if(o){o.style.display='none';o.innerHTML='';} if(ST.poll){clearInterval(ST.poll);ST.poll=null;} };
    el('agentRoomOverlay').onclick=function(e){ if(e.target&&e.target.id==='agentRoomOverlay'){ el('cdClose').onclick(); } };
    // tabs + indicator
    var tabs=el('cdTabs'), ind=document.createElement('div'); ind.className='tabInd'; tabs.appendChild(ind);
    function mv(t){ind.style.left=t.offsetLeft+'px';ind.style.width=t.offsetWidth+'px';}
    [].forEach.call(tabs.querySelectorAll('.tab'),function(t){ t.onclick=function(){
      [].forEach.call(tabs.querySelectorAll('.tab'),function(x){x.classList.remove('on');});
      [].forEach.call(document.querySelectorAll('.cd .pane'),function(x){x.classList.remove('on');});
      t.classList.add('on'); var p=document.querySelector('.cd .pane[data-p="'+t.dataset.t+'"]'); if(p)p.classList.add('on'); mv(t);
    };});
    setTimeout(function(){mv(tabs.querySelector('.tab.on'));},80);
    // parallax
    var holo=el('cdHolo'), fig=el('cdFig');
    holo.addEventListener('mousemove',function(e){var r=holo.getBoundingClientRect(),dx=(e.clientX-r.left)/r.width-.5,dy=(e.clientY-r.top)/r.height-.5;fig.style.transform='translateX('+(dx*20)+'px) rotateY('+(dx*13)+'deg) rotateX('+(-dy*7)+'deg)';});
    holo.addEventListener('mouseleave',function(){fig.style.transform='';});
    // view toggle
    [].forEach.call(holo.querySelectorAll('.vtog button'),function(b){ b.onclick=function(){ setView(b.dataset.v, d); }; });
    // operate
    el('cdRun').onclick=function(){ operate(d); };
    // skills add
    el('cdAddBtn').onclick=function(){ var p=el('cdPicker'); p.classList.toggle('on'); if(p.classList.contains('on'))el('cdPSearch').focus(); };
    el('cdPSearch').oninput=function(){ renderPicker(this.value); };
    // workshop
    el('cdCreate').onclick=function(){ createAndList(d); };
    // customize accents
    var sws=['0,229,255','255,215,0','167,139,250','0,255,136','251,146,60','244,63,94']; var sw=el('cdSw');
    sws.forEach(function(g){ var b=document.createElement('div'); b.className='sw'; b.style.background=color(g); b.onclick=function(){ setAccent(g); }; sw.appendChild(b); });
    // modules
    [].forEach.call(document.querySelectorAll('.cd .opt[data-mod]'),function(o){ o.onclick=function(){ o.classList.toggle('on'); var on=o.classList.contains('on'); o.querySelector('.pill').textContent=on?'ON':'OFF'; var map={floor:'cdFloor',beam:'cdBeam',fig:'cdFigw'}; var t=el(map[o.dataset.mod]); if(t)t.style.display=on?'':'none'; }; });
    loadWorkshop(d);
  }

  function setAccent(g){ ST.acg=g; ST.color=color(g); var root=el('cdRoot'); if(root){root.style.setProperty('--acg',g);root.style.setProperty('--ac',ST.color);} }

  function setView(v,d){
    ST.view=v;
    [].forEach.call(document.querySelectorAll('.cd .vtog button'),function(b){b.classList.toggle('on',b.dataset.v===v);});
    el('cdTag').textContent=(v==='3d'?'LIVE · 3D — ':'STATIC · 2D — ')+d.scene;
    var host=el('cdHost'), figw=el('cdFigw');
    if(v==='3d'){
      figw.style.display='none'; host.style.display='block';
      try { if(window._roomViewer&&window._roomViewer.mount){ window._roomViewer.mount(host, d.glb, ST.acg); } else { host.innerHTML='<div style="position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.4);font-family:\'Share Tech Mono\',monospace;font-size:10px">3D viewer unavailable</div>'; } } catch(_){}
    } else {
      host.style.display='none'; try{window._roomViewer&&window._roomViewer.dispose&&window._roomViewer.dispose();}catch(_){}
      figw.style.display='';
    }
  }

  /* ---- BRAIN panel (real /api/brains + operative.brain) ---- */
  function fillBrain(d){
    var box=el('cdBrain'); if(!box)return;
    var brains=(ST.brains&&ST.brains.brains)||[];
    var curId = d.brainId || (ST.brains&&ST.brains.agents&&ST.brains.agents[d.glb]&&ST.brains.agents[d.glb].brain) || (brains[0]&&brains[0].id);
    var cur = brains.filter(function(b){return b.id===curId;})[0] || brains[0] || {label:'—',model:'—',provider:''};
    var opts = brains.map(function(b){ return '<option value="'+esc(b.id)+'"'+(b.id===curId?' selected':'')+(b.available?'':' disabled')+'>'+esc(b.label||b.model)+(b.available?'':' (add key)')+'</option>'; }).join('');
    var pool = (ST.brains&&ST.brains.keyPool)||{};
    var conns = Object.keys(pool).map(function(p){ var ok=pool[p]&&pool[p].available>0; return '<span style="font-family:\'Share Tech Mono\',monospace;font-size:9px;padding:5px 9px;border-radius:8px;border:1px solid '+(ok?'rgba(0,255,136,.4)':'rgba(255,255,255,.12)')+';color:'+(ok?'#7CFFB2':'var(--mut)')+'">'+esc(p.toUpperCase())+'</span>'; }).join(' ');
    var toolN = ST.forged ? (d.tools||[]).length : (window._ROOM_AGENT_TOOLS||[]).filter(function(t){return t.agents&&t.agents.indexOf(d.glb)!==-1;}).length;
    box.innerHTML=''+
      '<div class="brow"><div class="bic">'+IC.cpu+'</div>'+
        '<div class="bmeta"><b>'+esc(cur.model||cur.label)+'</b><span>'+esc((cur.provider||'')+' · '+(cur.tier||''))+'</span></div>'+
        (ST.forged?'<select class="bsel" id="cdModel">'+opts+'</select>':'<span class="bsel" style="cursor:default">'+esc(cur.tier||'council')+'</span>')+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:11px">'+conns+'</div>'+
      '<div class="bars">'+
        '<div class="brw"><b>PROVIDER</b><div class="bbar"><i style="width:'+(cur.available?100:20)+'%"></i></div><span class="v">'+esc(cur.available?'LIVE':'no key')+'</span></div>'+
        '<div class="brw"><b>TOOLS</b><div class="bbar"><i style="width:'+Math.min(100,toolN)+'%"></i></div><span class="v">'+toolN+'</span></div>'+
      '</div>';
    var sel=el('cdModel');
    if(sel) sel.onchange=function(){ changeModel(d, this.value); };
  }
  function changeModel(d, brainId){
    if(!ST.forged||!ST.op){ return; }
    var brain=Object.assign({tier:'standard',persona:''}, ST.op.brain||{}, {brainId:brainId});
    j('/api/operatives/'+ST.op.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({brain:brain})}).then(function(r){
      if(r&&r.operative){ ST.op=r.operative; d.brainId=brainId; fillBrain(d); try{window.notify&&window.notify('◈ Model wired: '+brainId);}catch(_){ } }
    });
  }

  /* ---- SKILLS (real catalog + equip via PATCH) ---- */
  function fillSkills(d){
    var list=el('cdSkills'), cap=el('cdSkCap'); if(!list)return;
    var tools = ST.forged ? ((ST.op&&ST.op.tools)||[]) : (ST.catalog||[]).slice(0,12).map(function(s){return s.id;});
    ST.tools=tools;
    cap.textContent = tools.length+' '+(ST.forged?'/ 100 equipped · pull from the 3,478-skill library':'core skills · '+d.nm+' library has '+((ST.catalog||[]).length)+'+ skills');
    list.innerHTML = tools.length ? tools.map(function(t){return '<div class="skill"><span class="k">▸</span>'+esc(t)+'</div>';}).join('') : '<div class="cap">no skills equipped</div>';
    // forged can add; council is read-only here
    var addBtn=el('cdAddBtn'); if(addBtn) addBtn.style.display=ST.forged?'':'none';
    renderPicker('');
  }
  function renderPicker(q){
    var pl=el('cdPList'); if(!pl)return; var cat=ST.catalog||[];
    q=(q||'').toLowerCase();
    var rows=cat.filter(function(s){ return !ST.tools.length||ST.tools.indexOf(s.id)===-1; })
      .filter(function(s){ return !q || (s.id+' '+(s.description||'')).toLowerCase().indexOf(q)!==-1; })
      .slice(0,40);
    pl.innerHTML = rows.length ? rows.map(function(s){return '<div class="prow" data-id="'+esc(s.id)+'">'+IC.add+' <b style="color:var(--ac)">'+esc(s.id)+'</b> <span style="color:var(--mut)">'+esc((s.description||'').slice(0,44))+'</span></div>';}).join('') : '<div class="cap" style="padding:11px">no matches</div>';
    [].forEach.call(pl.querySelectorAll('.prow'),function(r){ r.onclick=function(){ addSkill(r.dataset.id); }; });
  }
  function addSkill(id){
    if(!ST.forged||!ST.op)return;
    var next=[].concat(ST.tools); if(next.indexOf(id)===-1)next.push(id);
    j('/api/operatives/'+ST.op.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tools:next})}).then(function(r){
      if(r&&r.operative){ ST.op=r.operative; ST.tools=r.operative.tools||next;
        var d={forged:true,glb:ST.glb,nm:(ST.op.codename||'OP')}; fillSkills(d);
        try{window.notify&&window.notify('⚙ Equipped '+id);}catch(_){ }
      }
    });
  }

  /* ---- OPERATE (real /api/agent/run + poll) ---- */
  function operate(d){
    var goal=(el('cdGoal').value||'').trim(); var con=el('cdCon'); var btn=el('cdRun');
    if(!goal){ con.innerHTML='<span class="m">enter a directive first.</span>'; return; }
    btn.disabled=true; con.innerHTML='<span class="l">▸ dispatching to '+esc(d.nm)+'…</span>';
    var body={goal:goal, agent:d.nm}; if(ST.forged&&ST.op&&ST.op.tools) body.options={tools:ST.op.tools};
    j('/api/agent/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){
      if(!r||!r.taskId){ con.innerHTML='<span class="m">⚠ '+esc((r&&r.error)||'agent engine offline')+'</span>'; btn.disabled=false; return; }
      con.innerHTML+='\n<span class="m">task '+esc(r.taskId).slice(0,8)+' running…</span>';
      var tries=0;
      ST.poll=setInterval(function(){ tries++;
        j('/api/agent/task/'+r.taskId).then(function(t){
          if(!t)return;
          if(/complete|done|fail|error/i.test(t.status)){
            clearInterval(ST.poll); ST.poll=null; btn.disabled=false;
            var used=(t.tools_used&&t.tools_used.length)?'\n<span class="g">⚡ tools: '+esc(Array.from(new Set(t.tools_used)).join(', '))+'</span>':'';
            con.innerHTML='<span class="l">▸ '+esc(d.nm)+':</span>\n'+esc(t.result||t.error||'(no output)')+used;
            con.scrollTop=con.scrollHeight;
          } else {
            con.innerHTML='<span class="l">▸ dispatching to '+esc(d.nm)+'…</span>\n<span class="m">'+esc(t.status||'running')+' · '+(t.steps?t.steps.length:0)+' steps…</span>';
          }
        });
        if(tries>40){ clearInterval(ST.poll); ST.poll=null; btn.disabled=false; con.innerHTML+='\n<span class="m">⚠ still running — check back.</span>'; }
      },1500);
    });
  }

  /* ---- WORKSHOP (collectibles listings + mint→list) ---- */
  function loadWorkshop(d){
    var grid=el('cdWGrid'); if(!grid)return;
    j('/api/collectibles/listings').then(function(r){
      var items=(r&&r.data)||[];
      var mine=items.filter(function(c){return String(c.owner||'').toUpperCase()===d.nm||String(c.owner||'')===(ST.op&&ST.op.id);}).slice(0,4);
      var show=mine.length?mine:items.slice(0,2);
      grid.innerHTML = show.length ? show.map(function(c){return '<div class="wcard"><div class="wth"><div class="scene" style="background:'+sceneCss(ST.sceneKey)+'"></div><span style="position:relative;z-index:1">'+esc(c.rarity||'item')+'</span></div><div class="wmeta"><div class="wt">'+esc(c.name||'Untitled')+'</div><div class="ws">'+(c.listing?esc(c.listing.priceCredits)+' cr · listed':'owned')+'</div></div></div>';}).join('')
        : '<div class="cap" style="grid-column:1/3">No outputs yet — create one and list it to the Bazaar.</div>';
    });
  }
  function createAndList(d){
    var msg=el('cdWMsg'); msg.textContent='minting…';
    var name=d.nm+' Output #'+Math.floor((ST.op&&ST.op.tokenId||0)+ (window.performance?performance.now():1))%9999;
    j('/api/collectibles/mint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,rarity:'rare',owner:(ST.op&&ST.op.id)||d.nm})}).then(function(r){
      var c=r&&r.data&&r.data.collectible; if(!c){ msg.textContent='⚠ mint failed (backend offline?)'; return; }
      j('/api/collectibles/list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:c.id,priceCredits:50})}).then(function(r2){
        msg.textContent = r2&&r2.ok ? '✓ listed "'+name+'" to the Bazaar (50 cr)' : '⚠ list failed';
        loadWorkshop(d);
      });
    });
  }

  /* ---- install override ---- */
  function install(){ window.openAgentRoom = open; window.openAgentRoom.__cdDeck=true; }
  install();
  // re-assert in case index.html reassigns after us
  setTimeout(function(){ if(!(window.openAgentRoom&&window.openAgentRoom.__cdDeck)) install(); }, 1200);
})();

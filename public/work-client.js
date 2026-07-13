/* ============================================================================
 * SHADDAI · work-client.js — "AGENTS AT WORK" (window.Work)  [TURTLE build]
 * ----------------------------------------------------------------------------
 * Self-contained, additive, ONE <script> include (pattern: economy-client.js).
 * The HERO MOMENT ("while you were away") + the live aliveness feed.
 *
 * Backend contract (matched exactly):
 *   POST /api/work/assign  {userId,agent,task} → {ok,sessionId,agent,summary,result,sparksEarned}
 *   GET  /api/work/summary?userId=             → {activities:[{agent,action,sparks,at}],totalSparks,count,since}
 *   GET  /api/work/feed                        → {feed:[{agent,action,sparks,at}]}
 *   GET  /api/work/active?userId=              → {active:[agentNames]}   (optional)
 *
 * window.Work: getSummary(), getFeed(), assign(agent,task), renderPanel(el), mount().
 *
 * Currency is ALWAYS "Sparks" (⬡). GRACEFUL DEGRADE: if /api/work/* are absent
 * / 404 / error, the panel shows a clean "coming soon" state — NO console spam,
 * NO thrown errors, app keeps working. All fetch in try/catch + timeout + backoff.
 * User/feed text rendered via textContent/createElement (XSS-safe), never
 * innerHTML with untrusted data. Scoped under `.wk-*`; injects its own CSS.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.Work) return;

  var FEED_POLL_MS = 4000;         // live ticker cadence
  var FEED_MAX = 8;                // rows kept in the ticker
  var AGENTS = [
    { key: 'SHADDAI', emoji: '👑', color: '#ffd54a' },
    { key: 'NEXUS',   emoji: '⚡', color: '#00E5FF' },
    { key: 'ZEROX',   emoji: '💠', color: '#4ea1ff' },
    { key: 'ORACLE',  emoji: '🔮', color: '#b98bff' },
    { key: 'TURTLE',  emoji: '🐢', color: '#00ff88' },
    { key: 'QUILL',   emoji: '🖋', color: '#ff9d5c' },
    { key: 'PIKADON', emoji: '🛡', color: '#ff5c7a' }
  ];
  var AGENT_MAP = {};
  AGENTS.forEach(function (a) { AGENT_MAP[a.key] = a; });

  /* ---------- tiny helpers (never throw) ---------- */
  function uid() {
    try { return (window.S && S.user && (S.user.id || S.user.email)) || 'demo'; }
    catch (e) { return 'demo'; }
  }
  function safeTimeout(ms) { try { return AbortSignal.timeout(ms); } catch (e) { return undefined; } }
  function jget(u, ms) {
    return fetch(u, { signal: safeTimeout(ms || 6000) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function jpost(u, body, ms) {
    return fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: safeTimeout(ms || 30000)
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function agentOf(name) {
    var k = String(name || '').trim().toUpperCase();
    return AGENT_MAP[k] || { key: k || 'AGENT', emoji: '⬡', color: '#00ff88' };
  }
  function n2(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function ago(ts) {
    var t = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!isFinite(t)) return '';
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;   // XSS-safe
    return e;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- one-time CSS ---------- */
  function injectCss() {
    if (document.getElementById('wkCss')) return;
    var s = document.createElement('style'); s.id = 'wkCss';
    s.textContent = [
      ".wk-panel{--wk-g:#00ff88;--wk-c:#00E5FF;position:relative;border-radius:16px;padding:0;margin:0 0 14px;color:#e7fff4;font-family:'Rajdhani','Chakra Petch',sans-serif;background:linear-gradient(180deg,rgba(8,16,22,.96),rgba(3,7,12,.98));border:1px solid rgba(0,229,136,.28);box-shadow:0 24px 70px rgba(0,0,0,.5),inset 0 0 70px rgba(0,229,136,.04);overflow:hidden}",
      ".wk-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--wk-g),var(--wk-c),transparent);filter:drop-shadow(0 0 6px var(--wk-g));animation:wkSweep 5s linear infinite;z-index:2}",
      "@keyframes wkSweep{0%{transform:translateX(-45%);opacity:0}12%,88%{opacity:.9}100%{transform:translateX(45%);opacity:0}}",
      ".wk-hd{display:flex;align-items:center;gap:10px;padding:14px 16px 12px;border-bottom:1px solid rgba(0,229,136,.14)}",
      ".wk-hd .wk-ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:15px;background:radial-gradient(circle at 40% 30%,rgba(0,229,136,.3),rgba(0,229,136,.04));border:1px solid rgba(0,229,136,.45);box-shadow:0 0 18px rgba(0,229,136,.3)}",
      ".wk-hd h3{margin:0;font-family:'Orbitron','Rajdhani',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;color:#fff;text-shadow:0 0 16px rgba(0,229,136,.5)}",
      ".wk-hd .wk-tag{font-size:9px;letter-spacing:.6px;color:rgba(231,255,244,.42);text-transform:uppercase}",
      ".wk-body{padding:14px 16px 16px;display:grid;gap:14px}",
      /* hero card */
      ".wk-hero{position:relative;border-radius:13px;padding:16px 15px;background:radial-gradient(130% 100% at 50% 0%,rgba(0,229,136,.1),transparent 62%),linear-gradient(180deg,rgba(10,22,28,.7),rgba(4,9,14,.7));border:1px solid rgba(0,229,136,.25);overflow:hidden}",
      ".wk-hero-big{font-family:'Orbitron','Rajdhani',sans-serif;font-weight:800;font-size:15px;line-height:1.35;color:#fff;text-shadow:0 0 18px rgba(0,229,136,.5);margin:0 0 3px;display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}",
      ".wk-hero-big b{color:var(--wk-g);font-size:22px}",
      ".wk-hero-sub{font-size:10px;letter-spacing:.5px;color:rgba(231,255,244,.5);margin:0 0 12px}",
      ".wk-list{display:grid;gap:6px}",
      ".wk-row{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.05);opacity:0;transform:translateY(6px);animation:wkRowIn .5s cubic-bezier(.2,.8,.2,1) forwards}",
      "@keyframes wkRowIn{to{opacity:1;transform:none}}",
      ".wk-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:0 0 8px currentColor}",
      ".wk-emj{font-size:14px;flex-shrink:0;width:18px;text-align:center}",
      ".wk-nm{font-weight:800;font-size:11px;letter-spacing:.5px;flex-shrink:0}",
      ".wk-act{font-size:11px;color:rgba(231,255,244,.82);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wk-spk{font-size:10px;font-weight:800;color:var(--wk-g);flex-shrink:0;white-space:nowrap}",
      ".wk-when{font-size:9px;color:rgba(231,255,244,.38);flex-shrink:0;white-space:nowrap}",
      ".wk-empty{text-align:center;padding:14px 8px;color:rgba(231,255,244,.55);font-size:11px;line-height:1.6}",
      ".wk-empty b{color:var(--wk-g)}",
      ".wk-share{margin-top:11px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;letter-spacing:.5px;font-size:10px;padding:6px 12px;border-radius:18px;color:var(--wk-c);background:rgba(0,229,255,.07);border:1px solid rgba(0,229,255,.4);transition:background .2s}",
      ".wk-share:hover{background:rgba(0,229,255,.15)}",
      /* assign block */
      ".wk-sec-ttl{font-family:'Orbitron',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.2px;color:rgba(231,255,244,.6);text-transform:uppercase;margin:0 0 8px}",
      ".wk-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}",
      ".wk-chip{cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;font-size:10px;letter-spacing:.5px;padding:5px 10px;border-radius:16px;color:#cfe;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);transition:all .15s;display:inline-flex;align-items:center;gap:5px}",
      ".wk-chip:hover{background:rgba(255,255,255,.09)}",
      ".wk-chip[aria-pressed='true']{color:#02150c;box-shadow:0 4px 16px rgba(0,0,0,.4)}",
      ".wk-assign-row{display:flex;gap:8px;flex-wrap:wrap}",
      ".wk-input{flex:1;min-width:150px;box-sizing:border-box;font-family:'Rajdhani',sans-serif;font-size:12px;color:#e7fff4;background:rgba(0,0,0,.35);border:1px solid rgba(0,229,136,.28);border-radius:10px;padding:10px 12px;outline:none;transition:border .2s,box-shadow .2s}",
      ".wk-input:focus{border-color:var(--wk-g);box-shadow:0 0 0 3px rgba(0,229,136,.12)}",
      ".wk-go{cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:800;letter-spacing:.6px;font-size:12px;color:#02150c;background:linear-gradient(135deg,var(--wk-g),var(--wk-c));border:none;border-radius:10px;padding:10px 18px;box-shadow:0 8px 24px rgba(0,229,136,.38);transition:transform .12s,box-shadow .2s}",
      ".wk-go:hover{box-shadow:0 10px 30px rgba(0,229,160,.55)}",
      ".wk-go:active{transform:translateY(1px)}",
      ".wk-go[disabled]{opacity:.55;cursor:default;box-shadow:none}",
      ".wk-result{margin-top:10px;border-radius:10px;padding:11px 12px;background:rgba(0,229,136,.06);border:1px solid rgba(0,229,136,.3);font-size:11px;line-height:1.55;color:rgba(231,255,244,.9);animation:wkRowIn .45s ease both}",
      ".wk-result .wk-earn{display:inline-block;margin-top:7px;font-weight:800;font-size:11px;color:#02150c;background:linear-gradient(135deg,var(--wk-g),var(--wk-c));padding:3px 10px;border-radius:14px}",
      ".wk-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(2,21,12,.35);border-top-color:#02150c;border-radius:50%;animation:wkSpin .7s linear infinite;vertical-align:-2px;margin-right:6px}",
      "@keyframes wkSpin{to{transform:rotate(360deg)}}",
      /* live feed ticker */
      ".wk-feed{border-radius:11px;background:rgba(0,0,0,.3);border:1px solid rgba(0,229,255,.16);overflow:hidden}",
      ".wk-feed-hd{display:flex;align-items:center;gap:7px;padding:8px 11px;border-bottom:1px solid rgba(0,229,255,.12);font-size:9px;letter-spacing:1px;text-transform:uppercase;color:rgba(0,229,255,.75);font-weight:700}",
      ".wk-pulse{width:7px;height:7px;border-radius:50%;background:#00ff88;box-shadow:0 0 8px #00ff88;animation:wkPulse 1.6s ease-in-out infinite}",
      "@keyframes wkPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}",
      ".wk-feed-list{max-height:150px;overflow-y:auto;padding:4px 0}",
      ".wk-feed-row{display:flex;align-items:center;gap:8px;padding:5px 11px;font-size:10px;animation:wkRowIn .4s ease both}",
      ".wk-feed-row .wk-emj{font-size:12px}",
      ".wk-feed-row .wk-nm{font-size:10px}",
      ".wk-feed-act{flex:1;min-width:0;color:rgba(231,255,244,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wk-feed-list::-webkit-scrollbar{width:5px}.wk-feed-list::-webkit-scrollbar-thumb{background:rgba(0,229,255,.25);border-radius:3px}",
      /* offline / coming soon */
      ".wk-offline{text-align:center;padding:20px 14px;color:rgba(231,255,244,.5);font-size:11px;line-height:1.7}",
      ".wk-offline .wk-ic{margin:0 auto 8px}"
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  /* ================= data (graceful) ================= */
  function getSummary() {
    return jget('/api/work/summary?userId=' + encodeURIComponent(uid())).then(function (d) {
      if (!d || !Array.isArray(d.activities)) return null;   // absent → degrade
      return {
        activities: d.activities.slice(0, 12),
        totalSparks: n2(d.totalSparks),
        count: n2(d.count) || d.activities.length,
        since: d.since || null
      };
    });
  }
  function getFeed() {
    return jget('/api/work/feed', 5000).then(function (d) {
      if (!d || !Array.isArray(d.feed)) return null;
      return d.feed.slice(0, FEED_MAX);
    });
  }
  function assign(agent, task) {
    return jpost('/api/work/assign', { userId: uid(), agent: agent, task: task }).then(function (d) {
      if (!d || d.ok === false) return null;
      return {
        sessionId: d.sessionId || null,
        agent: d.agent || agent,
        summary: d.summary || '',
        result: d.result || d.summary || '',
        sparksEarned: n2(d.sparksEarned)
      };
    });
  }

  /* ================= panel render ================= */
  var _feedTimer = null, _feedFails = 0;

  function renderPanel(root) {
    if (!root || !root.nodeType) return;
    injectCss();
    clear(root);
    root.classList.add('wk-panel');

    // header
    var hd = el('div', 'wk-hd');
    var ic = el('div', 'wk-ic', '⬡');
    var htxt = el('div');
    htxt.appendChild(el('h3', null, 'AGENTS AT WORK'));
    htxt.appendChild(el('div', 'wk-tag', 'your crew works while you’re away'));
    hd.appendChild(ic); hd.appendChild(htxt);
    root.appendChild(hd);

    var body = el('div', 'wk-body');
    root.appendChild(body);

    var heroSlot = el('div');   body.appendChild(heroSlot);
    var assignSlot = el('div'); body.appendChild(assignSlot);
    var feedSlot = el('div');   body.appendChild(feedSlot);

    renderAssign(assignSlot, heroSlot);
    renderFeed(feedSlot);

    // hero: "while you were away"
    getSummary().then(function (sum) {
      if (sum === null) { renderHeroOffline(heroSlot); return; }
      renderHero(heroSlot, sum);
    });
  }

  function renderHero(slot, sum) {
    clear(slot);
    var hero = el('div', 'wk-hero');

    if (!sum.activities.length) {
      var em = el('div', 'wk-empty');
      var l1 = el('div'); l1.appendChild(document.createTextNode('No missions yet. '));
      var b = el('b', null, 'Put an agent to work'); l1.appendChild(b);
      l1.appendChild(document.createTextNode(' below —'));
      em.appendChild(l1);
      em.appendChild(el('div', null, 'they earn ⬡ Sparks for you even while you’re away.'));
      hero.appendChild(em);
      slot.appendChild(hero);
      return;
    }

    var big = el('div', 'wk-hero-big');
    big.appendChild(document.createTextNode('Your crew earned '));
    var bEl = el('b'); bEl.setAttribute('data-count', String(sum.totalSparks)); bEl.textContent = '⬡ 0';
    big.appendChild(bEl);
    big.appendChild(document.createTextNode(' Sparks'));
    hero.appendChild(big);
    hero.appendChild(el('div', 'wk-hero-sub', 'while you were away · ' + sum.count + ' mission' + (sum.count === 1 ? '' : 's') + ' completed'));

    var list = el('div', 'wk-list');
    sum.activities.forEach(function (a, i) {
      var meta = agentOf(a.agent);
      var row = el('div', 'wk-row');
      row.style.animationDelay = (0.06 * i) + 's';
      var dot = el('span', 'wk-dot'); dot.style.color = meta.color; dot.style.background = meta.color;
      row.appendChild(dot);
      row.appendChild(el('span', 'wk-emj', meta.emoji));
      var nm = el('span', 'wk-nm', meta.key); nm.style.color = meta.color;
      row.appendChild(nm);
      row.appendChild(el('span', 'wk-act', String(a.action || 'completed a task')));
      var spk = n2(a.sparks);
      if (spk) row.appendChild(el('span', 'wk-spk', '+' + spk + ' ⬡'));
      row.appendChild(el('span', 'wk-when', ago(a.at)));
      list.appendChild(row);
    });
    hero.appendChild(list);

    // share affordance (copy text)
    var share = el('button', 'wk-share', '⤴ Share');
    share.type = 'button';
    share.addEventListener('click', function () {
      var lines = sum.activities.map(function (a) {
        return agentOf(a.agent).emoji + ' ' + agentOf(a.agent).key + ' ' + (a.action || '') +
               (n2(a.sparks) ? ' (+' + n2(a.sparks) + ' Sparks)' : '');
      });
      var text = 'My SHADDAI crew earned ⬡ ' + sum.totalSparks + ' Sparks while I was away:\n' +
                 lines.join('\n') + '\n\nBuild your own AI agent crew → shaddai';
      doShare(text, share);
    });
    hero.appendChild(share);

    slot.appendChild(hero);
    countUp(bEl, sum.totalSparks);
  }

  function renderHeroOffline(slot) {
    clear(slot);
    var off = el('div', 'wk-offline');
    off.appendChild(el('div', 'wk-ic', '⬡'));
    off.appendChild(el('div', null, 'Agents-at-Work is warming up.'));
    off.appendChild(el('div', null, 'Your "while you were away" summary appears here once your crew starts earning.'));
    slot.appendChild(off);
  }

  function countUp(node, target) {
    target = n2(target);
    if (target <= 0) { node.textContent = '⬡ 0'; return; }
    var start = performance.now(), dur = 900;
    function step(t) {
      var p = Math.min(1, (t - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);            // ease-out cubic
      node.textContent = '⬡ ' + Math.round(target * e).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function doShare(text, btn) {
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () {});
      return;
    }
    var done = function () {
      var old = btn.textContent; btn.textContent = '✓ Copied';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {});
    } else {
      try {
        var ta = document.createElement('textarea'); ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); done();
      } catch (e) {}
    }
  }

  /* ================= assign flow ================= */
  function renderAssign(slot, heroSlot) {
    clear(slot);
    slot.appendChild(el('div', 'wk-sec-ttl', '▶ Put an agent to work'));

    var chips = el('div', 'wk-chips');
    var selected = 'ORACLE';
    AGENTS.forEach(function (a) {
      var chip = el('button', 'wk-chip');
      chip.type = 'button';
      chip.appendChild(el('span', null, a.emoji));
      chip.appendChild(el('span', null, a.key));
      chip.style.borderColor = 'rgba(255,255,255,.12)';
      chip.setAttribute('aria-pressed', a.key === selected ? 'true' : 'false');
      if (a.key === selected) { chip.style.background = a.color; chip.style.color = '#02150c'; }
      chip.addEventListener('click', function () {
        selected = a.key;
        Array.prototype.forEach.call(chips.children, function (c) {
          c.setAttribute('aria-pressed', 'false'); c.style.background = 'rgba(255,255,255,.04)'; c.style.color = '#cfe';
        });
        chip.setAttribute('aria-pressed', 'true'); chip.style.background = a.color; chip.style.color = '#02150c';
      });
      chips.appendChild(chip);
    });
    slot.appendChild(chips);

    var row = el('div', 'wk-assign-row');
    var input = el('input', 'wk-input');
    input.type = 'text';
    input.placeholder = 'e.g. research trending AI agent tools';
    input.maxLength = 300;
    var go = el('button', 'wk-go', '▶ Work');
    go.type = 'button';
    row.appendChild(input); row.appendChild(go);
    slot.appendChild(row);

    var resultSlot = el('div'); slot.appendChild(resultSlot);

    function run() {
      var task = input.value.trim();
      if (!task) { input.focus(); return; }
      go.disabled = true;
      clear(go); go.appendChild(el('span', 'wk-spin')); go.appendChild(document.createTextNode('Working…'));
      clear(resultSlot);

      assign(selected, task).then(function (r) {
        go.disabled = false; go.textContent = '▶ Work';
        if (!r) {
          var offr = el('div', 'wk-result');
          offr.textContent = 'Agents-at-Work isn’t live yet on this deployment. Your task wasn’t lost — try again once it’s enabled.';
          resultSlot.appendChild(offr);
          return;
        }
        input.value = '';
        var meta = agentOf(r.agent);
        var box = el('div', 'wk-result');
        var head = el('div');
        var nm = el('b', null, meta.emoji + ' ' + meta.key + ' '); nm.style.color = meta.color;
        head.appendChild(nm);
        head.appendChild(document.createTextNode(r.summary || 'finished the task'));
        box.appendChild(head);
        if (r.result && r.result !== r.summary) {
          var res = el('div'); res.style.marginTop = '6px'; res.style.color = 'rgba(231,255,244,.72)';
          res.textContent = String(r.result).slice(0, 600);
          box.appendChild(res);
        }
        if (r.sparksEarned) {
          box.appendChild(el('span', 'wk-earn', '+' + r.sparksEarned + ' ⬡ earned'));
        }
        resultSlot.appendChild(box);

        // refresh the Sparks balance display if Economy is present
        try {
          if (window.Economy && typeof window.Economy.renderSparks === 'function') {
            var chip = document.querySelector('#sparksBalance,[data-sparks-chip]');
            if (chip) window.Economy.renderSparks(chip);
          }
        } catch (e) {}
        // refresh the hero so the new mission shows up
        getSummary().then(function (sum) {
          if (sum) renderHero(heroSlot, sum);
        });
      });
    }

    go.addEventListener('click', run);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  }

  /* ================= live feed ================= */
  function renderFeed(slot) {
    clear(slot);
    var wrap = el('div', 'wk-feed');
    var fhd = el('div', 'wk-feed-hd');
    fhd.appendChild(el('span', 'wk-pulse'));
    fhd.appendChild(document.createTextNode('LIVE · agents at work'));
    wrap.appendChild(fhd);
    var list = el('div', 'wk-feed-list');
    list.appendChild(el('div', 'wk-feed-row', 'Connecting to the live feed…'));
    wrap.appendChild(list);
    slot.appendChild(wrap);

    function paint(feed) {
      clear(list);
      if (!feed || !feed.length) {
        var r = el('div', 'wk-feed-row');
        r.appendChild(el('span', 'wk-feed-act', 'Quiet right now — assign a task to wake the crew.'));
        list.appendChild(r);
        return;
      }
      feed.forEach(function (f, i) {
        var meta = agentOf(f.agent);
        var row = el('div', 'wk-feed-row');
        row.style.animationDelay = (0.03 * i) + 's';
        row.appendChild(el('span', 'wk-emj', meta.emoji));
        var nm = el('span', 'wk-nm', meta.key); nm.style.color = meta.color;
        row.appendChild(nm);
        row.appendChild(el('span', 'wk-feed-act', String(f.action || 'is working')));
        if (n2(f.sparks)) row.appendChild(el('span', 'wk-spk', '+' + n2(f.sparks) + ' ⬡'));
        row.appendChild(el('span', 'wk-when', ago(f.at)));
        list.appendChild(row);
      });
    }

    function tick() {
      getFeed().then(function (feed) {
        if (feed === null) {
          _feedFails++;
          if (_feedFails === 1) {   // first failure → clean offline state, no spam
            clear(list);
            var r = el('div', 'wk-feed-row');
            r.appendChild(el('span', 'wk-feed-act', 'Live feed offline — will reconnect automatically.'));
            list.appendChild(r);
          }
        } else {
          _feedFails = 0;
          paint(feed);
        }
        schedule();
      });
    }
    function schedule() {
      if (_feedTimer) clearTimeout(_feedTimer);
      // backoff: base 4s, grows with consecutive failures, capped at 40s
      var delay = FEED_POLL_MS * Math.min(10, Math.max(1, _feedFails ? _feedFails * 2 : 1));
      _feedTimer = setTimeout(function () {
        if (document.hidden) { schedule(); return; }   // pause when tab hidden
        tick();
      }, delay);
    }
    tick();
  }

  /* ================= mount ================= */
  function mount() {
    var host = document.getElementById('agentsAtWorkMount');
    if (!host) return false;
    if (host.getAttribute('data-wk-mounted') === '1') return true;
    host.setAttribute('data-wk-mounted', '1');
    try { renderPanel(host); } catch (e) { /* never break the app */ }
    return true;
  }

  function boot() {
    if (!mount()) {
      // mount point not in DOM yet — retry a few times, then give up silently
      var tries = 0;
      var iv = setInterval(function () {
        if (mount() || ++tries > 20) clearInterval(iv);
      }, 400);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ================= public API ================= */
  window.Work = {
    getSummary: getSummary,
    getFeed: getFeed,
    assign: assign,
    renderPanel: renderPanel,
    mount: mount
  };
})();

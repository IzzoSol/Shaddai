/* ═════════════════════════════════════════════════════════════════════════
   SHADDAI v119 — HOLO layer
   • live sign-in scene (same Firebase gate, no second login)
   • ONE setup wizard, after sign-in (replaces Power Up + the 4-step overlay)
   • "Holo" skin beside the Classic skins, with colour variants
   • Forge ↔ 3D world bridge (live "forged" notice, 3D tab first)
   • Settings grouped into categories
   Additive: nothing here changes the OG layout unless the Holo skin is on.
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var VERSION = 'V119';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* quota */ } }, del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  function say(m) { try { if (typeof notify === 'function') notify(m); } catch (e) { /* ignore */ } }

  /* ── Scene: perspective grid + aurora + particles, hue-shifting ───────── */
  function startScene(host, opt) {
    opt = opt || {};
    if (host.querySelector('.holo-canvas')) return;
    var cv = document.createElement('canvas'); cv.className = 'holo-canvas'; cv.setAttribute('aria-hidden', 'true');
    host.insertBefore(cv, host.firstChild);
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = 0, H = 0, t = 0, hue = 160, px = 0, py = 0, tx = 0, ty = 0, parts = [], bursts = [];
    function resize() { W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    resize(); window.addEventListener('resize', resize);
    for (var i = 0; i < 90; i++) parts.push({ x: Math.random(), y: Math.random(), v: 0.0004 + Math.random() * 0.0012, r: 0.6 + Math.random() * 2, a: 0.25 + Math.random() * 0.6, s: Math.random() * 6 });
    host._scene = { burst: function (x, y) { for (var k = 0; k < 70; k++) { var a = Math.random() * 6.283, s = 1 + Math.random() * 5; bursts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, r: 1 + Math.random() * 2.5 }); } } };
    host.addEventListener('pointermove', function (e) { tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; });
    function draw() {
      var th = parseFloat(getComputedStyle(host).getPropertyValue('--h')) || 160;
      if (opt.drift) th += Math.sin(t * 0.25) * opt.drift;
      var d = ((th - hue + 540) % 360) - 180; hue += d * 0.06; px += (tx - px) * 0.06; py += (ty - py) * 0.06;
      host.style.setProperty('--rx', px.toFixed(3)); host.style.setProperty('--ry', py.toFixed(3));
      var g = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, Math.max(W, H) * 0.8);
      g.addColorStop(0, 'hsl(' + hue + ' 70% 16%)'); g.addColorStop(0.55, '#050b1c'); g.addColorStop(1, '#010309');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i2 = 0; i2 < 2; i2++) { var cx = W * (0.3 + 0.4 * i2) + Math.sin(t * 0.4 + i2 * 2) * W * 0.12, cy = H * (0.3 + 0.2 * i2) + Math.cos(t * 0.35 + i2) * H * 0.08; var ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.45); ag.addColorStop(0, 'hsla(' + (hue + i2 * 70) + ',100%,55%,.16)'); ag.addColorStop(1, 'transparent'); ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H); }
      var hy = H * 0.64; ctx.lineWidth = 1;
      for (var v = -22; v <= 22; v++) { ctx.strokeStyle = 'hsla(' + hue + ',100%,62%,' + (0.34 - Math.abs(v) * 0.012) + ')'; ctx.beginPath(); ctx.moveTo(W / 2 + v * W * 0.012 + px * 14, hy); ctx.lineTo(W / 2 + v * W * 0.13 + px * 60, H); ctx.stroke(); }
      for (var k = 0; k < 16; k++) { var z = ((k + (t * 0.5) % 1) / 16), y = hy + (H - hy) * Math.pow(z, 2.3); ctx.strokeStyle = 'hsla(' + hue + ',100%,62%,' + (0.08 + z * 0.4) + ')'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      var hg = ctx.createLinearGradient(0, hy - 40, 0, hy + 30); hg.addColorStop(0, 'transparent'); hg.addColorStop(0.5, 'hsla(' + hue + ',100%,65%,.35)'); hg.addColorStop(1, 'transparent'); ctx.fillStyle = hg; ctx.fillRect(0, hy - 40, W, 70);
      parts.forEach(function (p) { p.y -= p.v; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } var x = p.x * W + Math.sin(t + p.s) * 14 + px * p.r * 8, yy = p.y * H; ctx.fillStyle = 'hsla(' + (hue + p.s * 6) + ',100%,72%,' + p.a * (0.6 + 0.4 * Math.sin(t * 2 + p.s)) + ')'; ctx.beginPath(); ctx.arc(x, yy, p.r, 0, 6.283); ctx.fill(); });
      for (var b = bursts.length - 1; b >= 0; b--) { var q = bursts[b]; q.x += q.vx; q.y += q.vy; q.vy += 0.05; q.vx *= 0.985; q.life -= 0.014; if (q.life <= 0) { bursts.splice(b, 1); continue; } ctx.fillStyle = 'hsla(' + (hue + q.life * 80) + ',100%,70%,' + q.life + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * q.life + 0.4, 0, 6.283); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    function frame() {
      if (!cv.isConnected) { window.removeEventListener('resize', resize); return; }
      // idle when the host is hidden (gate closed) — no wasted frames behind the dashboard
      var hidden = document.hidden || host.offsetParent === null && getComputedStyle(host).position !== 'fixed' || getComputedStyle(host).display === 'none';
      if (!hidden) { t += 1 / 60; draw(); }
      if (!RM) requestAnimationFrame(frame);
    }
    draw(); if (!RM) requestAnimationFrame(frame);
  }

  /* ── Sign-in gate skin (keeps the Firebase logic exactly as is) ───────── */
  function skinGate() {
    var g = $('shdAuthGate'); if (!g || g.dataset.holo) return;
    g.dataset.holo = '1'; g.classList.add('holo-gate');
    var tag = document.createElement('div'); tag.className = 'gate-tag'; tag.textContent = 'SHADDAI ' + VERSION; g.appendChild(tag);
    startScene(g, { drift: 38 });
    g.style.setProperty('--h', '195');
  }

  /* ── Skins: Classic (existing) + Holo (new) ───────────────────────────── */
  var CLASSIC = [['glitch', 'Glitch', '#00ff88'], ['terminal', 'Terminal', '#9dff2f'], ['void', 'Void', '#ffffff'], ['amber', 'Amber', '#ffb020'], ['dusk', 'Dusk', '#c08cff'], ['solar', 'Solar', '#ffd23f'], ['parchment', 'Parchment', '#d9c9a3']];
  var HOLO = [['160', 'Aurora', 'hsl(160 100% 60%)'], ['265', 'Nebula', 'hsl(265 100% 68%)'], ['195', 'Ice', 'hsl(195 100% 62%)'], ['42', 'Solar', 'hsl(42 100% 60%)'], ['330', 'Plasma', 'hsl(330 100% 66%)']];
  function applyHolo(hue) {
    var h = String(hue || LS.get('shd_holo_hue') || '160');
    document.documentElement.setAttribute('data-theme-skin', 'holo');
    document.documentElement.style.setProperty('--hh', h);
    LS.set('shaddai_skin', 'holo'); LS.set('shd_holo_hue', h);
    document.querySelectorAll('.skin-opt').forEach(function (el) { el.classList.remove('active'); });
  }
  function applyClassic(id) {
    document.documentElement.style.removeProperty('--hh');
    if (typeof window._origSetSkin === 'function') window._origSetSkin(id);
    else { document.documentElement.setAttribute('data-theme-skin', id); LS.set('shaddai_skin', id); }
  }
  function currentLook() { return LS.get('shaddai_skin') === 'holo' ? 'holo' : 'classic'; }
  // The OG loader resets any skin outside its whitelist to glitch on every load — restore ours (and the
  // 3 extra classic skins) so a chosen look survives a refresh.
  (function restoreSkin() {
    var s = LS.get('shaddai_skin');
    if (s === 'holo') applyHolo();
    else if (s && CLASSIC.some(function (c) { return c[0] === s; })) document.documentElement.setAttribute('data-theme-skin', s);
  })();
  // Other page code re-applies the skin after load and resets Holo to glitch — re-assert it, but only while
  // the saved choice is still Holo (picking a Classic skin writes shaddai_skin first, so that stays respected).
  new MutationObserver(function () {
    if (LS.get('shaddai_skin') === 'holo' && document.documentElement.getAttribute('data-theme-skin') !== 'holo') applyHolo();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-skin'] });
  window._origSetSkin = window.setShaddaiSkin;
  window.setShaddaiSkin = function (id) { if (id === 'holo') applyHolo(); else applyClassic(id); };

  /* ── Glyphs ───────────────────────────────────────────────────────────── */
  var G = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><rect x="10" y="10" width="4" height="4"/>',
    look: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="4"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'
  };
  function glyph(k) { return '<svg class="wz-glyph" viewBox="0 0 24 24" aria-hidden="true">' + (G[k] || G.user) + '</svg>'; }

  /* ── Deck engine ──────────────────────────────────────────────────────── */
  function mount(cfg) {
    var old = $(cfg.id); if (old) old.remove();
    var st = document.createElement('div'); st.id = cfg.id; st.className = 'shd-wiz'; st.setAttribute('role', 'dialog'); st.setAttribute('aria-modal', 'true'); st.setAttribute('aria-label', cfg.label);
    var n = cfg.steps.length, cur = 0;
    st.style.setProperty('--h', cfg.steps[0].hue);
    st.innerHTML = '<div class="wz-top"><div class="wz-brand">SHADDAI<i>' + VERSION + '</i></div><div class="wz-rail">' + cfg.steps.map(function (s, i) { return (i ? '<span class="wz-link"><i></i></span>' : '') + '<span class="wz-node" title="' + esc(s.rail) + '"></span>'; }).join('') + '</div><button class="wz-skip" type="button">Skip setup</button></div>' +
      '<div class="wz-deck">' + cfg.steps.map(function (s, i) { return '<section class="wc" data-o="' + i + '" aria-label="' + esc(s.rail) + '"><div class="wc-float"><div class="wc-face"><span class="br tl"></span><span class="br tr"></span><span class="br bl"></span><span class="br bb"></span><div class="wc-glyph">' + glyph(s.glyph) + '</div><div class="wc-kicker">' + esc(s.kicker) + '</div><h2>' + esc(s.title) + '</h2>' + (s.sub ? '<p class="sub">' + esc(s.sub) + '</p>' : '') + '<div class="wc-body">' + (s.html || '') + '</div></div></div></section>'; }).join('') + '</div>' +
      '<div class="wz-foot"><button class="wbtn gh" type="button" data-n="back">Back</button><button class="wbtn pri" type="button" data-n="next">Next</button><span class="hint">← → to navigate</span></div>';
    document.body.appendChild(st); startScene(st);
    var cards = [].slice.call(st.querySelectorAll('.wc')), nodes = [].slice.call(st.querySelectorAll('.wz-node')), links = [].slice.call(st.querySelectorAll('.wz-link'));
    var backB = st.querySelector('[data-n=back]'), nextB = st.querySelector('[data-n=next]');
    function burst(el) { var r = (el || st).getBoundingClientRect(); if (st._scene) st._scene.burst(r.left + r.width / 2, r.top + r.height / 2); }
    var ctl = {
      el: st, burst: burst,
      go: function (i, silent) {
        if (i < 0 || i >= n) return;
        if (i > cur && cfg.leave) cfg.leave(cur);
        cur = i; st.style.setProperty('--h', cfg.steps[i].hue);
        cards.forEach(function (c, k) { c.dataset.o = String(k - i); if (k === i) c.removeAttribute('inert'); else c.setAttribute('inert', ''); });
        nodes.forEach(function (nd, k) { nd.classList.toggle('on', k === i); nd.classList.toggle('done', k < i); }); links.forEach(function (l, k) { l.classList.toggle('done', k < i); });
        backB.hidden = i === 0; nextB.hidden = !!cfg.steps[i].hideNext; nextB.textContent = i === n - 1 ? 'Finish' : (cfg.steps[i].nextLabel || 'Next');
        if (cfg.steps[i].enter) cfg.steps[i].enter(cards[i], ctl);
        var f = cards[i].querySelector('input[type=text]'); if (f && !silent) setTimeout(function () { f.focus({ preventScroll: true }); }, 450);
        if (i > 0 && !silent) burst(cards[i]);
      },
      next: function () { if (cur < n - 1) ctl.go(cur + 1); },
      prev: function () { ctl.go(cur - 1); },
      close: function () { document.removeEventListener('keydown', key); st.classList.add('out'); setTimeout(function () { st.remove(); }, 420); }
    };
    function key(e) {
      if (!st.isConnected) return document.removeEventListener('keydown', key);
      var tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'ArrowRight' && !typing) ctl.next(); else if (e.key === 'ArrowLeft' && !typing) ctl.prev();
      else if (e.key === 'Enter' && tag === 'input' && e.target.type === 'text') { e.preventDefault(); ctl.next(); }
    }
    document.addEventListener('keydown', key);
    st.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.n === 'next') ctl.next(); else if (b.dataset.n === 'back') ctl.prev(); else if (b.classList.contains('wz-skip') && cfg.onSkip) cfg.onSkip(ctl);
    });
    ctl.go(0, true); return ctl;
  }

  /* ── The one wizard ───────────────────────────────────────────────────── */
  var FOCUS = [['Trading', 'Markets, signals, wallet'], ['Content', 'Posts, media, social'], ['Building', 'Code, apps, automation'], ['Research', 'Intel, notes, library'], ['Everything', 'The full deck']];
  var COUNCIL = [['SHADDAI', '#ffd45e', 'Commander'], ['ZEROX', '#00ff88', 'Wealth Engine'], ['ORACLE', '#c08cff', 'Wisdom Keeper'], ['NEXUS', '#27e0ff', 'Auto-Router'], ['TURTLE', '#1abc9c', 'Creation Master'], ['QUILL', '#e0a63a', 'Writer & Scribe'], ['PIKADON', '#ff5a5a', 'Defense Shield']];
  var PROVIDERS = [
    { id: 'groq', name: 'Groq', tag: 'EASIEST', blurb: 'Free, blazing-fast Llama 3.3 70B — nothing to install.', link: 'https://console.groq.com/keys', ph: 'gsk_…', ls: 'shaddai_groq_key' },
    { id: 'openrouter', name: 'OpenRouter', tag: 'FREE MODELS', blurb: 'One free key, dozens of open models.', link: 'https://openrouter.ai/keys', ph: 'sk-or-v1-…', ls: 'shaddai_openrouter_key' },
    { id: 'ollama', name: 'Ollama', tag: 'PRIVATE', blurb: 'Runs on your own computer — no key, fully private. Install it from ollama.com, run <code>ollama run llama3.2</code>, and SHADDAI finds it automatically.', link: 'https://ollama.com/download', ph: null }
  ];
  function tier() { try { if (window.S && S.billing && S.billing.subscription && S.billing.subscription.tier) return String(S.billing.subscription.tier).toLowerCase(); } catch (e) { /* ignore */ } return 'free'; }
  function markDone() { LS.set('shaddai_onboarded', '1'); LS.set('shd_onboarded', 'true'); }

  var W = { name: '', focus: 'Everything', lead: 'SHADDAI', look: 'holo', skin: 'glitch', hue: '160' };
  var wizCtl = null;

  function openWizard(startStep) {
    if (wizCtl && wizCtl.el.isConnected) return;
    W.name = LS.get('shd_name') || LS.get('shd_displayName') || ''; W.focus = LS.get('shd_focus') || 'Everything'; W.lead = LS.get('shd_lead_agent') || 'SHADDAI';
    W.look = currentLook() === 'holo' || !LS.get('shaddai_skin') ? 'holo' : 'classic'; W.skin = CLASSIC.some(function (c) { return c[0] === LS.get('shaddai_skin'); }) ? LS.get('shaddai_skin') : 'glitch'; W.hue = LS.get('shd_holo_hue') || '160';
    var steps = [
      { glyph: 'user', hue: 160, rail: 'You', kicker: 'STEP 01 / 04', title: 'Who’s commanding?', sub: 'Tell us who you are and what you’re here for.',
        html: '<label class="wf"><span>Your name or alias</span><input id="wzName" type="text" maxlength="40" placeholder="e.g. Izzo" autocomplete="off"></label><div class="wf"><span>Main focus</span><div class="wz-tiles">' + FOCUS.map(function (f) { return '<button type="button" class="wz-tile" data-focus="' + f[0] + '"><b>' + f[0] + '</b><small>' + f[1] + '</small></button>'; }).join('') + '</div></div>' },
      { glyph: 'chip', hue: 265, rail: 'Engine', kicker: 'STEP 02 / 04', title: 'Power your agents', sub: 'Connect a free AI key — or run fully private on Ollama. You can skip and do it later.',
        html: PROVIDERS.map(function (p) { return '<div class="wz-prov" data-prov="' + p.id + '"><div class="hd"><b>' + p.name + '</b><small>' + p.blurb.replace(/<[^>]+>/g, '').slice(0, 56) + '…</small><span class="tag">' + p.tag + '</span></div><div class="bd"><div>' + p.blurb + ' <a href="' + p.link + '" target="_blank" rel="noopener noreferrer">' + (p.ph ? 'Get a free key ↗' : 'Download ↗') + '</a></div>' + (p.ph ? '<div class="kr"><input type="password" autocomplete="off" spellcheck="false" placeholder="' + esc(p.ph) + '" data-key="' + p.id + '"><button type="button" class="wbtn pri" style="padding:8px 16px;font-size:12px" data-save="' + p.id + '">Save</button></div>' : '') + '<div class="msg" data-msg="' + p.id + '"></div></div></div>'; }).join('') + '<div class="wz-status" id="wzStatus">Checking your setup…</div>' },
      { glyph: 'look', hue: 195, rail: 'Look', kicker: 'STEP 03 / 04', title: 'Pick your look', sub: 'Classic is the original dashboard. Holo is the new glass-and-glow style. Change it any time in Settings.',
        html: '<div class="wz-look"><button type="button" class="wz-tile" data-look="classic"><b>Classic</b><small>The original skins</small></button><button type="button" class="wz-tile" data-look="holo"><b>Holo</b><small>Sleek, vibrant, glowing</small></button></div><div class="wz-sw" id="wzSw"></div><div class="wz-swl" id="wzSwl"></div>' },
      { glyph: 'crown', hue: 42, rail: 'Lead', kicker: 'STEP 04 / 04', title: 'Choose your lead', sub: 'Your lead takes requests by default. Then pick where to start.',
        html: '<div class="wz-agents">' + COUNCIL.map(function (a) { return '<button type="button" class="wz-agent" data-lead="' + a[0] + '" style="--c:' + a[1] + '" aria-label="' + a[0] + '"><span class="ini">' + a[0][0] + '</span><img alt="" loading="lazy" src="' + artUrl(a[0]) + '" onerror="if(!this.dataset.f){this.dataset.f=1;this.src=\'/assets/agents/' + a[0] + '-portrait.png\'}else{this.remove()}"><b>' + a[0] + '</b></button>'; }).join('') + '</div><div class="wz-lead"><b id="wzLeadName"></b> — <span id="wzLeadRole"></span></div><div class="wz-dest"><button type="button" class="wbtn pri" data-go="dash">Open the dashboard</button><button type="button" class="wbtn" data-go="forge">Forge my first agent</button><button type="button" class="wbtn" data-go="worlds">Explore the Worlds</button></div>', hideNext: true }
    ];
    var ctl = wizCtl = mount({ id: 'shdWiz', label: 'SHADDAI setup', steps: steps, onSkip: function (c) { markDone(); c.close(); }, leave: function () { grab(); } });
    var el = ctl.el;
    function q(s) { return el.querySelector(s); }
    function grab() { if (q('#wzName')) { W.name = q('#wzName').value.trim(); } }
    q('#wzName').value = W.name;
    function syncFocus() { el.querySelectorAll('[data-focus]').forEach(function (b) { b.classList.toggle('on', b.dataset.focus === W.focus); }); }
    function syncLead() { el.querySelectorAll('[data-lead]').forEach(function (b) { b.classList.toggle('on', b.dataset.lead === W.lead); }); var a = COUNCIL.filter(function (c) { return c[0] === W.lead; })[0]; q('#wzLeadName').textContent = a ? a[0] : ''; q('#wzLeadRole').textContent = a ? a[2] : ''; }
    function syncLook() {
      el.querySelectorAll('[data-look]').forEach(function (b) { b.classList.toggle('on', b.dataset.look === W.look); });
      var sw = q('#wzSw'), list = W.look === 'holo' ? HOLO : CLASSIC;
      sw.innerHTML = list.map(function (c) { var on = W.look === 'holo' ? W.hue === c[0] : W.skin === c[0]; return '<button type="button" title="' + c[1] + '" aria-label="' + c[1] + '" class="' + (on ? 'on' : '') + '" data-sw="' + c[0] + '" style="background:' + c[2] + ';color:' + c[2] + '"></button>'; }).join('');
      var cur = list.filter(function (c) { return W.look === 'holo' ? W.hue === c[0] : W.skin === c[0]; })[0]; q('#wzSwl').textContent = cur ? cur[1].toUpperCase() : '';
    }
    function preview() { if (W.look === 'holo') applyHolo(W.hue); else applyClassic(W.skin); }
    function status() {
      fetch('/api/byok/status').then(function (r) { return r.json(); }).then(function (s) {
        var c = []; ['groq', 'openrouter', 'gemini'].forEach(function (k) { if (s && s[k]) c.push(k.toUpperCase()); });
        q('#wzStatus').innerHTML = c.length ? '✓ <b>Powered up.</b> Connected: <b>' + c.join(', ') + '</b>' : 'No key yet — a free Groq key takes about 30 seconds.';
      }).catch(function () { q('#wzStatus').textContent = 'Pick an option above — or skip for now.'; });
    }
    steps[1].enter = status;
    steps[3].enter = syncLead;
    syncFocus(); syncLook(); syncLead();
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'), hd = e.target.closest('.wz-prov .hd');
      if (hd) { var p = hd.parentNode, was = p.classList.contains('open'); el.querySelectorAll('.wz-prov').forEach(function (x) { x.classList.remove('open'); }); if (!was) p.classList.add('open'); return; }
      if (!b) return;
      if (b.dataset.focus) { W.focus = b.dataset.focus; syncFocus(); ctl.burst(b); }
      else if (b.dataset.look) { W.look = b.dataset.look; syncLook(); preview(); ctl.burst(b); }
      else if (b.dataset.sw) { if (W.look === 'holo') W.hue = b.dataset.sw; else W.skin = b.dataset.sw; syncLook(); preview(); }
      else if (b.dataset.lead) { W.lead = b.dataset.lead; syncLead(); ctl.burst(b); }
      else if (b.dataset.save) { saveKey(b.dataset.save); }
      else if (b.dataset.go) { grab(); finish(b.dataset.go, b); }
    });
    function saveKey(id) {
      var p = PROVIDERS.filter(function (x) { return x.id === id; })[0], inp = q('[data-key="' + id + '"]'), msg = q('[data-msg="' + id + '"]'), key = (inp.value || '').trim();
      if (!key) return;
      msg.className = 'msg'; msg.textContent = 'Saving…';
      // the key goes to the server vault (/api/byok) only. No copy is kept in localStorage: browser storage is readable by any injected script.
      fetch('/api/byok/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: tier(), provider: id, key: key }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok && res.d && res.d.ok) { inp.value = ''; msg.className = 'msg ok'; msg.textContent = '✓ Connected — your agents now run on ' + p.name + '.'; status(); ctl.burst(inp); }
          else { msg.className = 'msg err'; msg.textContent = '✗ ' + ((res.d && res.d.error) || 'Could not save key'); }
        }).catch(function (er) { msg.className = 'msg err'; msg.textContent = '✗ ' + (er.message || 'network error'); });
    }
    function finish(dest, btn) {
      LS.set('shd_name', W.name); LS.set('shd_focus', W.focus); LS.set('shd_lead_agent', W.lead);
      try { if (typeof window.pickAgent === 'function') window.pickAgent(W.lead); } catch (e) { /* optional */ }
      preview(); markDone(); ctl.burst(btn);
      setTimeout(function () { ctl.close(); try { if (typeof showView === 'function') showView(dest); } catch (e) { /* ignore */ } say('Setup saved' + (W.name ? ' — welcome, ' + W.name : '')); }, RM ? 0 : 700);
    }
    if (startStep) ctl.go(startStep);
  }

  /* First run: only AFTER sign-in (or guest), never over the gate, never twice. */
  var started = false;
  function maybeStart() {
    if (started || LS.get('shaddai_onboarded') || LS.get('shd_onboarded') === 'true' && LS.get('shd_holo_seen')) return;
    var g = $('shdAuthGate'); if (g && g.classList.contains('on')) return;
    var boot = $('shaddai-boot-overlay');
    if (boot) { var cs = getComputedStyle(boot); if (cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 && boot.offsetHeight > 0) return; }
    var signed = LS.get('shd_signed_in') === '1', guest = false; try { guest = sessionStorage.getItem('shd_guest') === '1'; } catch (e) { /* ignore */ }
    if (!(window.SHD_AUTH && window.SHD_AUTH.ready) || !(signed || guest)) return;
    started = true; LS.set('shd_holo_seen', '1'); openWizard();
  }
  var tmr = setInterval(function () { maybeStart(); if (started) clearInterval(tmr); }, 600);

  // Every legacy entry point now opens THE wizard (Power Up lives in step 2, Reset onboarding re-runs it).
  function wire() {
    window.SHD_HOLO = { open: openWizard, version: VERSION };
    window.resetOnboarding = function () { LS.del('shaddai_onboarded'); LS.del('shd_onboarded'); LS.del('shd_holo_seen'); started = false; openWizard(); };
    window.runOnboardingWizard = function () { openWizard(); };
    window.shdOnboardOpen = function () { openWizard(); };
    window.SHADDAI_ONBOARD = { open: function () { openWizard(1); }, close: function () { if (wizCtl) wizCtl.close(); } };
  }
  wire();
  // legacy scripts assign these after us on DOMContentLoaded — re-assert once the page is fully up
  window.addEventListener('load', function () { wire(); });

  /* ── Forge ↔ 3D world bridge ──────────────────────────────────────────── */
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'shd:operative-created') return;
    say('Agent forged — live in the 3D world' + (e.data.name ? ': ' + e.data.name : ''));
    try { document.querySelectorAll('#forgeView iframe').forEach(function (f) { if (f.id === 'forgeFrame3d' && f.contentWindow) { f.contentWindow.postMessage({ type: 'shd:refresh' }, location.origin); } }); } catch (er) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('shd:operatives-changed', { detail: e.data })); } catch (er) { /* ignore */ }
  });
  // The 3D Forge is the main forge — the Forge view opens on it.
  function wrapShowView() {
    var sv = window.showView; if (typeof sv !== 'function' || sv._holo) return;
    window.showView = function (v) {
      var r = sv.apply(this, arguments);
      try {
        // The OG code forces the "agent" tab with a 0ms timer on open — land on the 3D Forge (the cutscene wizard) just after it.
        if (v === 'forge') setTimeout(function () { if (typeof switchForgeTab === 'function') switchForgeTab('3d'); }, 40);
        if (v === 'settings') setTimeout(organizeSettings, 60);
      } catch (e) { /* never break navigation */ }
      return r;
    };
    window.showView._holo = true;
  }
  wrapShowView(); window.addEventListener('load', wrapShowView);

  /* ── Settings: grouped categories + the look picker ───────────────────── */
  var CATS = [['look', 'Look', /Theme|Color Studio|Appearance|Display/i], ['plan', 'Plan & Usage', /Plan|Cost|Budget|Token/i], ['ai', 'AI & APIs', /AI Backend|Remote AI|OpenClaw|GitHub|Integration|API Registry|Endpoints|Subagents/i], ['data', 'Data & Audit', /Audit|Data|Memory/i], ['general', 'General', /./]];
  function titleOf(el) { var t = el.querySelector('.settings-title') || el.querySelector('summary'); return (t ? t.textContent : '') + ' ' + (el.id || ''); }
  function organizeSettings() {
    var skin = $('settingsThemeSkin'); if (!skin || skin.dataset.holo) return;
    var host = skin.parentElement; if (!host || host.dataset.shdSet) return;
    skin.dataset.holo = '1'; host.dataset.shdSet = '1';
    // Look picker at the top of THEME / SKIN
    var pick = document.createElement('div'); pick.id = 'shdLookPicker'; pick.style.cssText = 'margin:0 0 14px;padding:12px;border:1px solid var(--border);border-radius:10px';
    pick.innerHTML = '<div style="font:700 11px \'Share Tech Mono\',monospace;letter-spacing:.2em;color:var(--accent);margin-bottom:8px">STYLE</div><div class="wz-look" style="display:flex;gap:8px"><button type="button" class="wz-tile" data-slook="classic" style="flex:1;text-align:center;padding:9px;border-radius:10px;cursor:pointer"><b>Classic</b></button><button type="button" class="wz-tile" data-slook="holo" style="flex:1;text-align:center;padding:9px;border-radius:10px;cursor:pointer"><b>Holo</b></button></div><div id="shdHueRow" style="display:flex;gap:9px;margin-top:10px"></div>';
    skin.insertBefore(pick, skin.children[1] || null);
    function paint() {
      var holo = currentLook() === 'holo';
      pick.querySelectorAll('[data-slook]').forEach(function (b) { b.classList.toggle('on', (b.dataset.slook === 'holo') === holo); });
      var row = pick.querySelector('#shdHueRow'); var cur = LS.get('shd_holo_hue') || '160';
      row.innerHTML = holo ? HOLO.map(function (c) { return '<button type="button" title="' + c[1] + '" aria-label="' + c[1] + '" data-hue="' + c[0] + '" style="width:34px;height:34px;border-radius:50%;cursor:pointer;background:' + c[2] + ';border:2px solid ' + (cur === c[0] ? '#fff' : 'rgba(255,255,255,.2)') + '"></button>'; }).join('') : '<span style="font-size:11px;color:var(--text-muted)">Pick a Classic skin below, or switch to Holo.</span>';
    }
    pick.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.slook === 'holo') applyHolo(); else if (b.dataset.slook === 'classic') applyClassic(LS.get('shd_last_classic') || 'glitch'); else if (b.dataset.hue) applyHolo(b.dataset.hue); paint(); });
    paint();
    // Group the long scroll of sections
    var kids = [].slice.call(document.querySelectorAll('#settingsView .settings-section')).filter(function (el) { return !el.parentElement.closest('.settings-section') && !el.closest('.shd-set'); });
    // some sections are wrapped in a container section — lift the nested ones out so every card gets grouped
    (function flat(list) {
      var out = [];
      list.forEach(function (el) {
        var nested = [].slice.call(el.querySelectorAll('.settings-section')).filter(function (n) { return n.parentElement.closest('.settings-section') === el; });
        if (nested.length >= 3 && el.tagName !== 'DETAILS') { out = out.concat(flat(nested)); out.push(el); } else out.push(el);
      });
      kids = out;
      return out;
    })(kids);
    if (kids.length < 4) return;
    var wrap = document.createElement('div'); wrap.className = 'shd-set';
    var rail = document.createElement('nav'); rail.className = 'shd-set-rail'; rail.setAttribute('aria-label', 'Settings categories');
    var panes = document.createElement('div');
    CATS.forEach(function (c, i) { var b = document.createElement('button'); b.dataset.cat = c[0]; b.textContent = c[1]; if (!i) b.className = 'on'; rail.appendChild(b); var p = document.createElement('div'); p.className = 'shd-set-pane'; p.dataset.pane = c[0]; p.style.display = i ? 'none' : 'block'; panes.appendChild(p); });
    wrap.appendChild(rail); wrap.appendChild(panes);
    host.insertBefore(wrap, skin);
    kids.forEach(function (el) {
      var t = titleOf(el), cat = 'general';
      for (var i = 0; i < CATS.length - 1; i++) { if (CATS[i][2].test(t)) { cat = CATS[i][0]; break; } }
      panes.querySelector('[data-pane="' + cat + '"]').appendChild(el);
    });
    [].slice.call(panes.children).forEach(function (p, i) { if (!p.children.length) { rail.children[i].style.display = 'none'; } });
    rail.addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; [].forEach.call(rail.children, function (x) { x.classList.toggle('on', x === b); }); [].forEach.call(panes.children, function (p) { p.style.display = p.dataset.pane === b.dataset.cat ? 'block' : 'none'; }); });
  }

  /* ── Agent art: new portraits everywhere (nav, Settings, wizard) ───────
     Drop NAME.jpg into /assets/agents/wizard/ and every portrait of that agent upgrades automatically;
     anything without custom art keeps its current image. */
  var ART_NAMES = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'], ART = {};
  function artUrl(n) { return '/assets/agents/wizard/' + n + (n === 'SHADDAI' ? '.svg' : '.jpg') + '?v=119'; }
  function artName(src) { var m = /\/agent-([a-z]+)\.png|\/assets\/agents\/([A-Z]+)-portrait\.png/.exec(src || ''); if (!m) return null; var n = (m[1] || m[2]).toUpperCase(); return ART_NAMES.indexOf(n) > -1 ? n : null; }
  function swapImg(img) { var n = artName(img.getAttribute('src')); if (!n || !ART[n] || img.dataset.shdArt) return; img.dataset.shdArt = '1'; img.src = artUrl(n); }
  function swapAll() { document.querySelectorAll('img').forEach(swapImg); }
  ART_NAMES.forEach(function (n) { var im = new Image(); im.onload = function () { ART[n] = true; swapAll(); }; im.src = artUrl(n); });
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (nd) { if (nd.nodeType === 1) { if (nd.tagName === 'IMG') swapImg(nd); else if (nd.querySelectorAll) nd.querySelectorAll('img').forEach(swapImg); } });
      if (m.type === 'attributes' && m.target.tagName === 'IMG' && !/\/assets\/agents\/wizard\//.test(m.target.getAttribute('src') || '')) { m.target.dataset.shdArt = ''; swapImg(m.target); }
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  function init() {
    skinGate();
    // keep trying briefly in case the gate markup is parsed after this script
    var tries = 0, t = setInterval(function () { skinGate(); if (++tries > 20 || ($('shdAuthGate') && $('shdAuthGate').dataset.holo)) clearInterval(t); }, 250);
    // remember the last Classic skin so Holo→Classic returns to it
    var o = window.setShaddaiSkin; window.setShaddaiSkin = function (id) { if (id !== 'holo') LS.set('shd_last_classic', id); return o(id); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

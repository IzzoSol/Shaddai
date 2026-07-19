/* ══════════════════════════════════════════════════════════════════
   SHADDAI — INTRO / POWER-UP ONBOARDING
   First-run overlay that sends testers straight to a FREE AI key and
   registers it via /api/byok/set so their agents run on real models.
   Includes per-option how-to steps, a live theme picker, and a gated
   entry (must connect a key OR choose the local Ollama path — no blind skip).
   Self-contained, null-safe, never throws.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DONE_KEY = 'shaddai_onboarded';
  var ollamaAck = false;

  var PROVIDERS = [
    {
      id: 'groq', ico: '⚡', name: 'Groq', tag: 'EASIEST · RECOMMENDED', tagClass: '',
      blurb: 'Free, blazing-fast Llama 3.3 70B in the cloud — nothing to install. Best place to start.',
      link: 'https://console.groq.com/keys', linkText: 'Get Free Key ↗', ph: 'gsk_...', ls: 'shaddai_groq_key',
      howto: ['Open the Groq console (button above) — sign in with Google, free.', 'Click "Create API Key", copy it.', 'Paste it below and hit Save. Done — agents are live.']
    },
    {
      id: 'openrouter', ico: '🛰', name: 'OpenRouter', tag: 'FREE MODELS', tagClass: 'alt',
      blurb: 'One free key, dozens of open models in the cloud — also nothing to install.',
      link: 'https://openrouter.ai/keys', linkText: 'Get Free Key ↗', ph: 'sk-or-v1-...', ls: 'shaddai_openrouter_key',
      howto: ['Open OpenRouter keys (button above), sign in free.', 'Create a key, copy it.', 'Paste below and Save.']
    },
    {
      id: 'ollama', ico: '🖥', name: 'Ollama', tag: '100% PRIVATE · NO KEY', tagClass: 'priv',
      blurb: 'Runs the AI entirely on YOUR computer — no key, no cloud, fully private and free forever. Trade-off: you install a small app, and it\'s slower than Groq.',
      link: 'https://ollama.com/download', linkText: 'Download Ollama ↗', ph: null, ls: null,
      howto: ['Download & install Ollama (button above) — Windows/Mac/Linux.', 'Open a terminal and run:  ollama run llama3.2', 'Leave it running — SHADDAI detects it automatically. No key needed.'],
      ack: true
    }
  ];

  var THEMES = [
    { id: 'glitch',   label: 'Glitch',   c: '#00ff88', bg: '#000000' },
    { id: 'terminal', label: 'Terminal', c: '#00ff41', bg: '#041004' },
    { id: 'void',     label: 'Void',     c: '#ffffff', bg: '#000000' },
    { id: 'amber',    label: 'Amber',    c: '#ffb020', bg: '#0a0600' }
  ];

  function tier() {
    try {
      if (window.S && S.billing && S.billing.subscription && S.billing.subscription.tier) {
        return String(S.billing.subscription.tier).toLowerCase();
      }
    } catch (e) {}
    return 'free';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function updateEntry() {
    var btn = document.getElementById('shdObDone');
    if (!btn) return;
    fetch('/api/byok/status').then(function (r) { return r.json(); }).then(function (s) {
      var hasKey = s && (s.groq || s.openrouter || s.gemini);
      var ready = hasKey || ollamaAck;
      btn.disabled = !ready;
      btn.textContent = ready ? 'Enter SHADDAI →' : 'Pick an option above to continue';
    }).catch(function () {
      var ready = ollamaAck;
      btn.disabled = !ready;
      btn.textContent = ready ? 'Enter SHADDAI →' : 'Pick an option above to continue';
    });
  }

  function saveKey(p, key, msgEl) {
    key = (key || '').trim();
    if (!key) { return; }
    if (msgEl) { msgEl.className = 'shd-ob-cardmsg'; msgEl.textContent = 'Saving…'; }
    fetch('/api/byok/set', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tier(), provider: p.id, key: key })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d && res.d.ok) {
          try { if (p.ls) localStorage.setItem(p.ls, key); } catch (e) {}
          if (msgEl) { msgEl.className = 'shd-ob-cardmsg ok'; msgEl.textContent = '✓ Connected — your agents now run on ' + p.name + '.'; }
          refreshStatus(); updateEntry();
        } else {
          if (msgEl) { msgEl.className = 'shd-ob-cardmsg err'; msgEl.textContent = '✗ ' + ((res.d && res.d.error) || 'Could not save key'); }
        }
      }).catch(function (e) {
        if (msgEl) { msgEl.className = 'shd-ob-cardmsg err'; msgEl.textContent = '✗ ' + (e.message || 'network error'); }
      });
  }

  function refreshStatus() {
    var box = document.getElementById('shdOb-status');
    if (!box) { return; }
    fetch('/api/byok/status').then(function (r) { return r.json(); }).then(function (s) {
      var connected = [];
      ['groq', 'openrouter', 'gemini'].forEach(function (k) { if (s && s[k]) connected.push(k.toUpperCase()); });
      if (connected.length) {
        box.innerHTML = '✓ <b>Powered up.</b> Connected: <b>' + connected.join(', ') + '</b>. Your 7 agents now run on real cloud models — you\'re ready.';
      } else if (ollamaAck) {
        box.innerHTML = '🖥 <b>Local mode.</b> Once Ollama is running on your machine, SHADDAI uses it automatically — private and free.';
      } else {
        box.innerHTML = '◦ <b>No brain connected yet.</b> Pick an option above — a free <b>Groq</b> key takes ~30 seconds and makes agents ~10× smarter.';
      }
    }).catch(function () { box.innerHTML = '◦ Pick an option above to power up your agents.'; });
  }

  function build() {
    if (document.getElementById('shdOnboard')) { return document.getElementById('shdOnboard'); }
    var ov = document.createElement('div'); ov.id = 'shdOnboard';

    var cards = PROVIDERS.map(function (p) {
      var steps = (p.howto || []).map(function (s, i) {
        return '<li><span class="n">' + (i + 1) + '</span>' + esc(s) + '</li>';
      }).join('');
      var input = p.ls ? (
        '<div class="shd-ob-row" style="margin-top:9px">' +
          '<input class="shd-ob-key" data-key="' + p.id + '" type="password" placeholder="' + esc(p.ph) + '">' +
          '<button class="shd-ob-save" data-save="' + p.id + '">Save Key</button></div>'
      ) : (
        '<div class="shd-ob-row" style="margin-top:9px">' +
          '<button class="shd-ob-save" data-ack="' + p.id + '">✓ I\'ll run Ollama locally</button></div>'
      );
      return '<div class="shd-ob-card' + (p.id === 'groq' ? ' rec' : '') + '" data-card="' + p.id + '">' +
        '<div class="shd-ob-card-top"><span class="ico">' + p.ico + '</span>' +
        '<span class="nm">' + esc(p.name) + '</span>' +
        '<span class="tag ' + p.tagClass + '">' + esc(p.tag) + '</span></div>' +
        '<div class="blurb">' + esc(p.blurb) + '</div>' +
        '<ol class="shd-ob-howto">' + steps + '</ol>' +
        '<div class="shd-ob-row"><a class="shd-ob-link' + (p.ls ? '' : ' ghost') + '" href="' + p.link + '" target="_blank" rel="noopener">' + esc(p.linkText) + '</a></div>' +
        input +
        '<div class="shd-ob-cardmsg" data-msg="' + p.id + '"></div></div>';
    }).join('');

    var themeSwatches = THEMES.map(function (t) {
      return '<button class="shd-ob-theme" data-theme="' + t.id + '" title="' + t.label + '" ' +
        'style="background:' + t.bg + ';border-color:' + t.c + '"><span style="background:' + t.c + '"></span>' + t.label + '</button>';
    }).join('');

    ov.innerHTML =
      '<div id="shdOb-modal">' +
        '<div class="shd-ob-eyebrow">SHADDAI // INITIALIZE</div>' +
        '<h1>Power up your <span class="cy">7 agents</span></h1>' +
        '<div class="shd-ob-sub">Your agents are ready — they just need a brain. Pick <b>one</b> free option below (~30 seconds) and every workflow, forge agent, and command runs on a real model.</div>' +
        '<div class="shd-ob-why">You keep your own free quota — SHADDAI never sees or stores it on a server you don\'t control. Groq &amp; OpenRouter are cloud (nothing to install); Ollama runs privately on your own machine.</div>' +
        '<div class="shd-ob-cards">' + cards + '</div>' +
        '<div class="shd-ob-themewrap"><div class="shd-ob-themelbl">◑ PICK YOUR LOOK</div><div class="shd-ob-themes">' + themeSwatches + '</div></div>' +
        '<div id="shdOb-status">◦ Checking your setup…</div>' +
        '<div id="shdOb-foot">' +
          '<button class="skip" id="shdObLater">⏭ Do this later</button>' +
          '<span class="shd-ob-note">Reopen anytime via ⚡ Power Up on the hub.</span>' +
          '<button class="done" id="shdObDone" disabled>Pick an option above to continue</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) {
      var save = e.target.closest && e.target.closest('[data-save]');
      if (save) {
        var id = save.getAttribute('data-save');
        var p = PROVIDERS.filter(function (x) { return x.id === id; })[0];
        var inp = ov.querySelector('.shd-ob-key[data-key="' + id + '"]');
        var msg = ov.querySelector('[data-msg="' + id + '"]');
        if (p && inp) { saveKey(p, inp.value, msg); }
        return;
      }
      var ack = e.target.closest && e.target.closest('[data-ack]');
      if (ack) {
        ollamaAck = true;
        var am = ov.querySelector('[data-msg="ollama"]');
        if (am) { am.className = 'shd-ob-cardmsg ok'; am.textContent = '✓ Local mode selected — start Ollama and you\'re set.'; }
        var card = ov.querySelector('[data-card="ollama"]'); if (card) card.classList.add('rec');
        refreshStatus(); updateEntry();
        return;
      }
      var th = e.target.closest && e.target.closest('[data-theme]');
      if (th) {
        var tid = th.getAttribute('data-theme');
        try { if (typeof window.setShaddaiSkin === 'function') window.setShaddaiSkin(tid); } catch (er) {}
        ov.querySelectorAll('.shd-ob-theme').forEach(function (b) { b.classList.toggle('sel', b === th); });
        return;
      }
    });
    ov.querySelector('#shdObDone').addEventListener('click', function () { if (!this.disabled) close(); });
    var laterBtn = ov.querySelector('#shdObLater');
    if (laterBtn) laterBtn.addEventListener('click', function () { close(); });
    ov.querySelectorAll('.shd-ob-key').forEach(function (inp) {
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { var id = inp.getAttribute('data-key'); var btn = ov.querySelector('[data-save="' + id + '"]'); if (btn) btn.click(); }
      });
    });
    // mark current theme selected
    try {
      var cur = document.documentElement.getAttribute('data-theme-skin') || 'glitch';
      var sel = ov.querySelector('.shd-ob-theme[data-theme="' + cur + '"]'); if (sel) sel.classList.add('sel');
    } catch (e) {}
    return ov;
  }

  function open() { var ov = build(); ov.classList.add('on'); refreshStatus(); updateEntry(); }
  function close() {
    var ov = document.getElementById('shdOnboard');
    if (ov) { ov.classList.remove('on'); }
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
  }

  function injectHubButton() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var bar = document.querySelector('#shaddaiHome .hh-bar');
      if (bar && !document.getElementById('hhPowerBtn')) {
        var b = document.createElement('button');
        b.id = 'hhPowerBtn'; b.className = 'hh-btn'; b.type = 'button';
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg><span>Power Up</span>';
        b.title = 'Connect a free AI key so your agents run on real models';
        b.addEventListener('click', open);
        bar.appendChild(b);
        clearInterval(t);
      } else if (tries > 80) { clearInterval(t); }
    }, 120);
  }

  function boot() {
    injectHubButton();
    var done = null;
    try { done = localStorage.getItem(DONE_KEY); } catch (e) {}
    if (!done) { setTimeout(open, 900); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SHADDAI_ONBOARD = { open: open, close: close };
})();

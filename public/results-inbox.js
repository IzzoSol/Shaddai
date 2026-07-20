/* ══════════════════════════════════════════════════════════════════
   SHADDAI — RESULTS INBOX
   Renders a "📥 Results Inbox" of saved workflow/agent runs persisted via
   GET/POST/DELETE /api/results. Injects a "📥 Results" button into the
   home hub bar (#shaddaiHome .hh-bar) and opens a modal listing results.
   Self-contained, null-safe, never throws.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {

    var PANEL_ID = 'shdResults';
    var LIST_ID = 'shdResults-list';

    var AG = {
      ORACLE:'🔮', ZEROX:'💰', NEXUS:'🛠', TURTLE:'🎨',
      QUILL:'✍', PIKADON:'🛡', SHADDAI:'⚡'
    };

    function esc(s){
      return String(s==null?'':s).replace(/[&<>"]/g, function(c){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
      });
    }

    function timeAgo(ts){
      try {
        var d = Date.now() - Number(ts);
        if (!(d >= 0)) return '';
        var s = Math.floor(d/1000);
        if (s < 60) return s + 's ago';
        var m = Math.floor(s/60); if (m < 60) return m + 'm ago';
        var h = Math.floor(m/60); if (h < 24) return h + 'h ago';
        var dd = Math.floor(h/24); if (dd < 7) return dd + 'd ago';
        return new Date(Number(ts)).toLocaleDateString();
      } catch(e){ return ''; }
    }

    function agentsStr(a){
      if (Array.isArray(a)) {
        return a.map(function(x){ return (AG[x]||'•') + ' ' + esc(x); }).join(' → ');
      }
      return esc(a || '');
    }

    // ── build modal shell once ──
    function buildPanel(){
      if (document.getElementById(PANEL_ID)) return;
      var ov = document.createElement('div');
      ov.id = PANEL_ID;
      ov.setAttribute('aria-hidden', 'true');
      ov.innerHTML =
        '<div class="shdR-modal" role="dialog" aria-label="Results Inbox">' +
          '<div class="shdR-hd">' +
            '<span class="shdR-ico">📥</span>' +
            '<div class="shdR-hd-txt"><div class="shdR-title">Results Inbox</div>' +
              '<div class="shdR-sub">saved workflow &amp; agent runs</div></div>' +
            '<button class="shdR-refresh" id="shdResults-refresh" type="button" title="Refresh">⟳</button>' +
            '<button class="shdR-x" id="shdResults-close" type="button" title="Close">✕</button>' +
          '</div>' +
          '<div class="shdR-body"><div class="shdR-list" id="' + LIST_ID + '">' +
            '<div class="shdR-empty">Loading…</div></div></div>' +
        '</div>';
      document.body.appendChild(ov);

      ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
      var cb = document.getElementById('shdResults-close');
      if (cb) cb.addEventListener('click', close);
      var rb = document.getElementById('shdResults-refresh');
      if (rb) rb.addEventListener('click', function(){ refresh(); });

      document.addEventListener('keydown', function(e){
        if (e.key === 'Escape') {
          var p = document.getElementById(PANEL_ID);
          if (p && p.classList.contains('on')) close();
        }
      });

      // event delegation for expand + delete
      var list = document.getElementById(LIST_ID);
      if (list) list.addEventListener('click', function(e){
        var del = e.target.closest('.shdR-del');
        if (del) { e.stopPropagation(); removeResult(del.getAttribute('data-id')); return; }
        var card = e.target.closest('.shdR-card');
        if (card) card.classList.toggle('open');
      });
    }

    function renderList(results){
      var list = document.getElementById(LIST_ID);
      if (!list) return;
      if (!results || !results.length) {
        list.innerHTML = '<div class="shdR-empty">No saved results yet. Run a workflow and it will appear here.</div>';
        return;
      }
      list.innerHTML = results.map(function(r){
        r = r || {};
        var stepsHtml = '';
        if (Array.isArray(r.steps) && r.steps.length) {
          stepsHtml = r.steps.map(function(s, idx){
            s = s || {};
            return '<div class="shdR-step"><div class="shdR-step-hd">STEP ' + (idx+1) + ' · ' +
              (AG[s.agent]||'•') + ' ' + esc(s.agent) + '</div>' +
              '<div class="shdR-step-out">' + esc(s.output) + '</div></div>';
          }).join('');
        }
        return '<div class="shdR-card" data-id="' + esc(r.id) + '">' +
          '<div class="shdR-card-hd">' +
            '<div class="shdR-card-main">' +
              '<div class="shdR-card-title">' + esc(r.title || 'Untitled') + '</div>' +
              '<div class="shdR-card-meta">' + agentsStr(r.agents) +
                '<span class="shdR-time">' + esc(timeAgo(r.at)) + '</span></div>' +
            '</div>' +
            '<button class="shdR-del" type="button" data-id="' + esc(r.id) + '" title="Delete">✕</button>' +
          '</div>' +
          '<div class="shdR-card-body">' +
            (r.input ? '<div class="shdR-lbl">Input</div><div class="shdR-input">' + esc(r.input) + '</div>' : '') +
            (stepsHtml ? '<div class="shdR-lbl">Steps</div>' + stepsHtml : '') +
            '<div class="shdR-lbl">Final Output</div>' +
            '<div class="shdR-output">' + esc(r.output) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function refresh(){
      var list = document.getElementById(LIST_ID);
      if (list && !list.querySelector('.shdR-card')) list.innerHTML = '<div class="shdR-empty">Loading…</div>';
      return fetch('/api/results')
        .then(function(r){ return r.json(); })
        .then(function(d){ renderList(d && d.results ? d.results : []); })
        .catch(function(){
          var l = document.getElementById(LIST_ID);
          if (l) l.innerHTML = '<div class="shdR-empty">Could not load results.</div>';
        });
    }

    function removeResult(id){
      if (!id) return;
      var card = document.querySelector('.shdR-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (card) card.style.opacity = '.4';
      fetch('/api/results/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function(){ refresh(); })
        .catch(function(){ if (card) card.style.opacity = ''; });
    }

    function open(){
      buildPanel();
      var p = document.getElementById(PANEL_ID);
      if (!p) return;
      p.classList.add('on');
      p.setAttribute('aria-hidden', 'false');
      refresh();
    }

    function close(){
      var p = document.getElementById(PANEL_ID);
      if (!p) return;
      p.classList.remove('on');
      p.setAttribute('aria-hidden', 'true');
    }

    // ── inject "📥 Results" button into #shaddaiHome .hh-bar (poll up to 6s) ──
    (function injectButton(){
      var tries = 0;
      var timer = setInterval(function(){
        tries++;
        try {
          var bar = document.querySelector('#shaddaiHome .hh-bar');
          if (bar) {
            if (!document.getElementById('shdResults-navBtn')) {
              var btn = document.createElement('button');
              btn.id = 'shdResults-navBtn';
              btn.type = 'button';
              btn.className = 'hh-btn shdR-navbtn';
              btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M4 13h4l2 3h4l2-3h4"/><path d="M12 3v9m0 0 3-3m-3 3-3-3"/></svg><span>Results</span>';
              btn.addEventListener('click', open); // owner: Results removed from the hub bar
            }
            clearInterval(timer);
          } else if (tries >= 12) {
            clearInterval(timer);
          }
        } catch(e){ clearInterval(timer); }
      }, 500);
    })();

    window.SHADDAI_RESULTS = { open: open, refresh: refresh, close: close };

  } catch (err) {
    try { console.warn('[results-inbox] init failed', err); } catch (e) {}
    try {
      window.SHADDAI_RESULTS = window.SHADDAI_RESULTS ||
        { open: function(){}, refresh: function(){}, close: function(){} };
    } catch (e) {}
  }
})();

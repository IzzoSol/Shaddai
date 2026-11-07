/* SHADDAI V119 — AGENT BRAIN + ROLE PICKERS. The Agent Management table's two plain <select>s become holographic pickers.
   Nothing is invented: the model list is read from the table's own <select> (local Ollama models + the cloud brains the server
   reports from /api/brains, ready or needing a key). A brain that needs a key shows "Add key" and jumps to the APIs tab.
   The original <select> stays in the page (hidden) so setModel / setAgentRole keep working exactly as before. */
(function () {
  'use strict';
  function ic(n, s) { return window.shdIcons ? window.shdIcons.icon(n, s) : ''; }
  var pop = null, anchorBtn = null;
  function close() { if (pop) { pop.remove(); pop = null; } if (anchorBtn) { anchorBtn.setAttribute('aria-expanded', 'false'); anchorBtn = null; } }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.addEventListener('click', function (e) { if (pop && !pop.contains(e.target) && !e.target.closest('.bp-btn')) close(); });
  window.addEventListener('scroll', close, true);

  function label(sel) { var o = sel.options[sel.selectedIndex]; return o ? o.textContent.trim() : '—'; }
  function short(s) { s = String(s || '').replace(/^You are acting as (an? )?/i, '').replace(/\.\s.*$/, '').trim(); return s.length > 46 ? s.slice(0, 44) + '…' : s; }

  function open(btn, sel, kind) {
    close(); anchorBtn = btn; btn.setAttribute('aria-expanded', 'true');
    var box = document.createElement('div'); box.className = 'bp-pop'; box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', kind === 'role' ? 'Role' : 'Brain');
    var head = document.createElement('div'); head.className = 'bp-head'; head.textContent = kind === 'role' ? 'Role · how this agent behaves' : 'Brain · which model thinks for this agent'; box.appendChild(head);
    var groups = [], cur = { name: '', items: [] }; groups.push(cur);
    [].forEach.call(sel.children, function (n) {
      if (n.tagName === 'OPTGROUP') { var g = { name: n.label.replace(/^[^A-Za-z]+/, ''), items: [].slice.call(n.children) }; groups.push(g); } else { cur.items.push(n); }
    });
    var shown = 0;
    groups.forEach(function (g) {
      if (!g.items.length) return; if (g.name) { var t = document.createElement('div'); t.className = 'bp-group'; t.textContent = g.name; box.appendChild(t); }
      g.items.forEach(function (o) {
        var dis = o.disabled, on = o.selected, it = document.createElement('button'); it.type = 'button'; it.className = 'bp-item' + (on ? ' on' : '') + (dis ? ' off' : ''); it.setAttribute('role', 'option'); it.setAttribute('aria-selected', on ? 'true' : 'false');
        var name = o.textContent.replace(/\s*·\s*add key\s*$/i, '').trim(), sub = '';
        if (kind === 'role') { sub = o.value && window.AGENT_ROLES ? short(AGENT_ROLES[o.value]) : 'The agent\'s own personality'; name = o.value ? o.value.charAt(0) + o.value.slice(1).toLowerCase() : 'Default'; }
        else if (dis) sub = 'Needs a key'; else if (/local/i.test(g.name)) sub = 'Runs on this machine · free'; else sub = 'Cloud · ready';
        it.innerHTML = '<span class="bp-ico">' + ic(kind === 'role' ? 'user' : (dis ? 'key' : (/local/i.test(g.name) ? 'server' : 'bolt')), 16) + '</span><span class="bp-txt"><b></b><small></small></span>' + (on ? '<span class="bp-tick">' + ic('check', 15) + '</span>' : (dis ? '<span class="bp-key">Add key</span>' : ''));
        it.querySelector('b').textContent = name; it.querySelector('small').textContent = sub;
        it.addEventListener('click', function () {
          if (dis) { close(); try { if (window.showView) showView('apis'); } catch (e) { /* ignore */ } return; }
          sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); btn.querySelector('.bp-cur').textContent = kind === 'role' ? (o.value ? o.value.charAt(0) + o.value.slice(1).toLowerCase() : 'Default') : label(sel); close();
        });
        box.appendChild(it); shown++;
      });
    });
    if (kind !== 'role') {
      var hasCloud = sel.querySelector('optgroup[label*="Cloud"]');
      var more = document.createElement('div'); more.className = 'bp-more';
      more.innerHTML = '<small>' + (hasCloud ? 'Want more brains?' : 'Cloud brains appear here when the server is reachable.') + '</small>';
      var add = document.createElement('button'); add.type = 'button'; add.className = 'bp-add'; add.innerHTML = ic('plus', 14) + '<span>Connect an API</span>'; add.addEventListener('click', function () { close(); try { if (window.showView) showView('apis'); } catch (e) { /* ignore */ } }); more.appendChild(add); box.appendChild(more);
    }
    document.body.appendChild(box); pop = box;
    var r = btn.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 16); box.style.width = w + 'px'; box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    var below = window.innerHeight - r.bottom, up = below < 280 && r.top > below; box.style.maxHeight = Math.max(200, (up ? r.top : below) - 16) + 'px'; if (up) box.style.bottom = (window.innerHeight - r.top + 6) + 'px'; else box.style.top = (r.bottom + 6) + 'px';
    var f = box.querySelector('.bp-item.on') || box.querySelector('.bp-item'); if (f) f.focus();
    box.addEventListener('keydown', function (e) { var its = [].slice.call(box.querySelectorAll('.bp-item')), i = its.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); (its[i + 1] || its[0]).focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); (its[i - 1] || its[its.length - 1]).focus(); } });
  }

  function enhance(sel, kind) {
    if (sel.dataset.bp) return; sel.dataset.bp = '1'; sel.style.display = 'none';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'bp-btn ' + kind; b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false');
    var curTxt = kind === 'role' ? (sel.value ? sel.value.charAt(0) + sel.value.slice(1).toLowerCase() : 'Default') : label(sel);
    b.innerHTML = '<span class="bp-cur"></span>' + ic('plus', 0).replace('<svg', '<svg style="display:none"') + '<svg class="bp-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    b.querySelector('.bp-cur').textContent = curTxt; b.title = kind === 'role' ? 'Choose how this agent behaves' : 'Choose the model this agent uses';
    b.addEventListener('click', function (e) { e.stopPropagation(); if (pop && anchorBtn === b) close(); else open(b, sel, kind); });
    sel.parentNode.insertBefore(b, sel);
  }
  function sweep() {
    var body = document.getElementById('agentTable'); if (!body) return;
    body.querySelectorAll('select[onchange^="setModel"]').forEach(function (s) { enhance(s, 'model'); });
    body.querySelectorAll('select[onchange^="setAgentRole"]').forEach(function (s) { enhance(s, 'role'); });
  }
  function boot() { sweep(); var body = document.getElementById('agentTable'); if (body) new MutationObserver(sweep).observe(body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.shdAgentPickers = { sweep: sweep };
})();

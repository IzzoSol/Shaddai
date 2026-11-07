/* SHADDAI V119 — COMMAND CHAT. One chat for everything you work with:
     Council (7)     answers from each agent's knowledge base            POST /api/bridge/ask
     Forged agents   same, speaking as your agent (borrowing its council model's knowledge)
     Outside bots    a real two-way channel with Grok Bot / Muse / any MCP bot   /api/bridge/chat/threads/:id
   Slash commands run real workflows and skills on the server and show progress, results and approvals inline.
   History is kept in this browser; bot messages and runs live on the server. Restore the old chat: localStorage.shd_legacy_nav = '1'. */
(function () {
  'use strict';
  var COUNCIL = [['SHADDAI', 'Orchestrator'], ['NEXUS', 'Architect'], ['ZEROX', 'Markets'], ['ORACLE', 'Research'], ['TURTLE', 'Creative'], ['QUILL', 'Writing'], ['PIKADON', 'Security']];
  var COMMANDS = [
    { c: '/market', d: 'Live prices, fear & greed, trending', wf: 'market.snapshot', arg: 'coins (optional, comma separated)' },
    { c: '/news', d: 'Crypto news + Hacker News', wf: 'news.digest' },
    { c: '/research', d: 'Web + Wikipedia on a topic', wf: 'research.topic', arg: 'topic' },
    { c: '/report', d: 'Your account: agents, plots, balance, classes', wf: 'dashboard.report' },
    { c: '/skill', d: 'Run a dashboard skill', arg: 'skill-id key=value …' },
    { c: '/skills', d: 'List the skills you can run' },
    { c: '/library', d: 'Browse 150+ ready-made workflows', arg: 'search (optional)' },
    { c: '/wf', d: 'Run a library workflow', arg: 'id key=value …' },
    { c: '/clear', d: 'Clear this conversation' }
  ];
  var legacy = function () { return document.documentElement.classList.contains('shd-legacy-nav'); };
  var root, railEl, headEl, msgsEl, inputEl, sendEl, menuEl, hintEl, targets = [], cur = null, busy = false, pollTimer = null, botSeq = 0, skillsCache = null;

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function uid() { try { return localStorage.getItem('shd_userid') || ''; } catch (e) { return ''; } }
  function hdr(json) { var o = {}; if (json) o['Content-Type'] = 'application/json'; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function api(method, path, body) {
    return fetch(path, { method: method, headers: hdr(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); });
  }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function key(t) { return t.type + ':' + t.id; }

  /* ── safe markdown-lite (no innerHTML): code fences, inline code, bold, links ── */
  function inline(parent, text) {
    var re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|https?:\/\/[^\s<>)]+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var t = m[0];
      if (t[0] === '`') parent.appendChild(h('code', { text: t.slice(1, -1) }));
      else if (t[0] === '*') parent.appendChild(h('strong', { text: t.slice(2, -2) }));
      else parent.appendChild(h('a', { href: t, target: '_blank', rel: 'noopener noreferrer', text: t.length > 48 ? t.slice(0, 47) + '…' : t }));
      last = m.index + t.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function rich(text) {
    var box = h('div', { class: 'cx-rich' }), parts = String(text).split(/```/);
    parts.forEach(function (p, i) {
      if (i % 2 === 1) {
        var code = p.replace(/^[a-zA-Z0-9_-]*\n/, '');
        box.appendChild(h('div', { class: 'cx-code' }, [h('button', { type: 'button', class: 'cx-copy', text: 'Copy', onclick: function (e) { try { navigator.clipboard.writeText(code); e.target.textContent = 'Copied'; setTimeout(function () { e.target.textContent = 'Copy'; }, 1200); } catch (x) { /* ignore */ } } }), h('pre', null, [h('code', { text: code })])]));
      } else p.split(/\n{2,}/).forEach(function (para) { if (!para.trim()) return; var d = h('p'); para.split('\n').forEach(function (line, j) { if (j) d.appendChild(h('br')); inline(d, line); }); box.appendChild(d); });
    });
    return box;
  }

  /* ── history (this browser) ── */
  function load(t) { try { return JSON.parse(localStorage.getItem('shd_chat2_' + key(t)) || '[]'); } catch (e) { return []; } }
  function save(t, list) { try { localStorage.setItem('shd_chat2_' + key(t), JSON.stringify(list.slice(-60))); } catch (e) { /* ignore */ } }
  var convo = [];
  function push(m) { convo.push(m); if (cur && cur.type !== 'bot') save(cur, convo.filter(function (x) { return x.kind !== 'run'; })); draw(m); scroll(); }
  function scroll() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  /* ── bubbles ── */
  function who(m) { return m.role === 'user' ? 'You' : (m.name || (cur && cur.name) || 'Agent'); }
  function draw(m) {
    if (m.kind === 'run') return; // run cards are drawn by their own poller
    var me = m.role === 'user', b = h('div', { class: 'cx-msg ' + (me ? 'me' : m.role === 'sys' ? 'sys' : 'ai'), 'data-id': m.id || '' });
    if (m.role !== 'sys') b.appendChild(h('div', { class: 'cx-who' }, [h('b', { text: who(m) }), m.at ? h('span', { text: new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : null]));
    b.appendChild(m.role === 'user' ? h('div', { class: 'cx-rich' }, [h('p', { text: m.text })]) : rich(m.text));
    if (m.sources && m.sources.length) b.appendChild(h('div', { class: 'cx-src' }, m.sources.slice(0, 4).map(function (s) { return h('i', { text: s }); })));
    msgsEl.appendChild(b);
  }
  function sys(text) { push({ role: 'sys', text: text }); }
  function typing(on) { var t = document.getElementById('cxTyping'); if (t) t.remove(); if (on) { msgsEl.appendChild(h('div', { id: 'cxTyping', class: 'cx-msg ai typing' }, [h('span'), h('span'), h('span')])); scroll(); } }

  /* ── run cards (workflows / skills) ── */
  function summarize(out) { var t = String(out || ''); try { var j = JSON.parse(t); t = JSON.stringify(j, null, 1); } catch (e) { /* plain */ } return t.length > 900 ? t.slice(0, 900) + '\n…' : t; }
  function runCard(run, title) {
    var card = h('div', { class: 'cx-run' }), head = h('div', { class: 'cx-run-h' }, [h('b', { text: title }), h('i', { text: 'queued' })]), steps = h('div', { class: 'cx-run-steps' }), out = h('div', { class: 'cx-run-out' }), act = h('div', { class: 'cx-run-act' });
    card.appendChild(head); card.appendChild(steps); card.appendChild(act); card.appendChild(out); msgsEl.appendChild(card); scroll();
    var tries = 0;
    (function poll() {
      api('GET', '/api/bridge/runs').then(function (d) {
        var r = ((d && d.runs) || []).filter(function (x) { return x.run_id === run.run_id; })[0];
        if (!r) { head.lastChild.textContent = 'not found'; return; }
        head.lastChild.textContent = r.status.replace('_', ' '); head.className = 'cx-run-h s-' + r.status;
        steps.textContent = ''; r.progress.forEach(function (s) { steps.appendChild(h('span', { class: 'cx-step ' + s.status, text: s.name.replace(/^\d+\.\s*/, '') })); });
        act.textContent = '';
        if (r.status === 'awaiting_approval') { act.appendChild(h('button', { type: 'button', class: 'cx-btn', text: 'Approve', onclick: function () { api('POST', '/api/bridge/runs/' + encodeURIComponent(r.run_id) + '/approve').then(poll); } })); act.appendChild(h('button', { type: 'button', class: 'cx-btn ghost', text: 'Deny', onclick: function () { api('POST', '/api/bridge/runs/' + encodeURIComponent(r.run_id) + '/deny').then(poll); } })); }
        if (r.outputs) { out.textContent = ''; Object.keys(r.outputs).forEach(function (k) { out.appendChild(h('details', null, [h('summary', { text: k.replace(/^\d+\.\s*/, '') }), h('pre', { text: summarize(r.outputs[k]) })])); }); }
        if (['succeeded', 'failed', 'cancelled', 'expired'].indexOf(r.status) > -1) { if (r.error) out.appendChild(h('div', { class: 'cx-err', text: r.error })); scroll(); return; }
        if (++tries < 80) setTimeout(poll, 1500); else head.lastChild.textContent = 'still running…';
      });
    })();
  }
  function startRun(wf, params, title) {
    var body = { workflow_id: wf, params: params || {}, idempotency_key: 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) };
    if (cur && cur.type === 'forged') body.agent_id = cur.id;
    api('POST', '/api/bridge/run', body).then(function (d) { if (!d.ok) { sys('Could not start: ' + (d.error || d._s)); return; } runCard(d.run, title); });
  }
  function parseKV(parts) { var o = {}; parts.forEach(function (p) { var i = p.indexOf('='); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); }); return o; }
  function slash(text) {
    var parts = text.trim().split(/\s+/), cmd = parts[0].toLowerCase(), rest = text.trim().slice(parts[0].length).trim();
    if (cmd === '/clear') { convo = []; save(cur, []); msgsEl.textContent = ''; empty(); return true; }
    if (cmd === '/skills') { loadSkills().then(function (l) { sys(l.length ? 'Runnable skills (' + l.length + '): ' + l.slice(0, 40).map(function (s) { return s.skill + (s.required_input.length ? ' [' + s.required_input.join(',') + ']' : ''); }).join(', ') + (l.length > 40 ? ' …' : '') + '\nRun one with  /skill <id> key=value' : 'No skills available on this server.'); }); return true; }
    if (cmd === '/library') { api('GET', '/api/bridge/library?q=' + encodeURIComponent(rest) + '&limit=12').then(function (d) { var l = (d && d.workflows) || []; sys(l.length ? 'Workflow library (' + (d.total || l.length) + ' ready-made). ' + l.map(function (w) { return w.workflow_id.replace(/^lib./, '') + (w.needs_context.length ? ' [' + w.needs_context.join(',') + ']' : ''); }).join(', ') + '
Run one with  /wf <id> key=value' : 'No workflows match that search.'); }); return true; }
    if (cmd === '/wf') { if (!parts[1]) { sys('Usage: /wf <id> key=value …  (see /library)'); return true; } startRun('lib.' + parts[1].replace(/^lib./, ''), { context: parseKV(parts.slice(2)) }, 'workflow · ' + parts[1]); return true; }
    if (cmd === '/skill') { if (!parts[1]) { sys('Usage: /skill <skill-id> key=value …  (see /skills)'); return true; } startRun('skill.run', { skill: parts[1], input: parseKV(parts.slice(2)) }, 'skill · ' + parts[1]); return true; }
    var c = COMMANDS.filter(function (x) { return x.c === cmd && x.wf; })[0]; if (!c) return false;
    var params = {}; if (c.wf === 'research.topic') { if (!rest) { sys('Usage: /research <topic>'); return true; } params.query = rest; }
    if (c.wf === 'market.snapshot' && rest) params.symbols = rest.split(/[ ,]+/).filter(Boolean);
    startRun(c.wf, params, c.d); return true;
  }
  function loadSkills() { return skillsCache ? Promise.resolve(skillsCache) : api('GET', '/api/bridge/skills').then(function (d) { skillsCache = (d && d.skills) || []; return skillsCache; }).catch(function () { return []; }); }

  /* ── sending ── */
  function send() {
    var text = inputEl.value.trim(); if (!text || busy || !cur) return;
    inputEl.value = ''; autosize(); menu(false);
    if (text[0] === '/' && cur.type !== 'bot') { push({ role: 'user', text: text, at: Date.now() }); if (slash(text)) return; sys('Unknown command. Type / to see the list.'); return; }
    push({ role: 'user', text: text, at: Date.now() });
    if (cur.type === 'bot') {
      api('POST', '/api/bridge/chat/threads/' + encodeURIComponent(cur.id), { text: text }).then(function (d) {
        if (!d.ok) sys(d._s === 403 ? 'This bot was not given the chat permission. Create it with chat:talk to talk to it.' : (d.error || 'Could not send'));
        else { botSeq = Math.max(botSeq, d.message.seq); hint('Sent. The bot reads this the next time it checks in.'); }
      }); return;
    }
    busy = true; sendEl.disabled = true; typing(true);
    var hist = convo.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).slice(-7, -1).map(function (m) { return { role: m.role, text: m.text }; });
    var body = { agent: cur.type === 'forged' ? (cur.model || 'SHADDAI') : cur.id, question: text, history: hist }; if (cur.type === 'forged') body.as = cur.id;
    api('POST', '/api/bridge/ask', body).then(function (d) {
      typing(false); busy = false; sendEl.disabled = false;
      if (d.ok) push({ role: 'assistant', name: cur.name, text: d.answer || '(no answer)', sources: d.sources, at: Date.now() });
      else sys(d._s === 401 ? 'Sign in to chat.' : d._s === 429 ? 'You have reached the hourly chat limit. Try again later.' : (d.error || 'That agent could not answer right now.'));
      inputEl.focus();
    }).catch(function () { typing(false); busy = false; sendEl.disabled = false; sys('Could not reach the server.'); });
  }
  function hint(t) { hintEl.textContent = t; clearTimeout(hint._t); hint._t = setTimeout(function () { hintEl.textContent = ''; }, 3500); }
  function autosize() { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(140, inputEl.scrollHeight) + 'px'; }
  function menu(show, q) {
    menuEl.textContent = ''; if (!show || !cur || cur.type === 'bot') { menuEl.style.display = 'none'; return; }
    var list = COMMANDS.filter(function (c) { return c.c.indexOf(q || '/') === 0; }); if (!list.length) { menuEl.style.display = 'none'; return; }
    list.forEach(function (c) { menuEl.appendChild(h('button', { type: 'button', class: 'cx-cmd', onclick: function () { inputEl.value = c.c + ' '; inputEl.focus(); menu(false); } }, [h('b', { text: c.c }), h('span', { text: c.d + (c.arg ? ' · ' + c.arg : '') })])); });
    menuEl.style.display = 'block';
  }

  /* ── targets + rail ── */
  function avatar(t) {
    if (t.type === 'council' || (t.type === 'forged' && t.model)) return h('img', { class: 'cx-av', alt: '', src: '/assets/agents/' + (t.type === 'council' ? t.id : t.model) + '-portrait.png', onerror: function (e) { e.target.style.visibility = 'hidden'; } });
    return h('span', { class: 'cx-av bot', text: (t.name || '?').charAt(0).toUpperCase() });
  }
  function rail() {
    railEl.textContent = '';
    function sec(title, items, extra) {
      if (!items.length && !extra) return;
      railEl.appendChild(h('div', { class: 'cx-sec', text: title }));
      items.forEach(function (t) { railEl.appendChild(h('button', { type: 'button', class: 'cx-t' + (cur && key(cur) === key(t) ? ' on' : ''), onclick: function () { select(t); } }, [avatar(t), h('span', { class: 'cx-tn' }, [h('b', { text: t.name }), h('i', { text: t.sub || '' })]), t.unread ? h('em', { class: 'cx-badge', text: String(t.unread) }) : null])); });
      if (extra) railEl.appendChild(extra);
    }
    sec('Council', targets.filter(function (t) { return t.type === 'council'; }));
    sec('Your agents', targets.filter(function (t) { return t.type === 'forged'; }));
    sec('Outside bots', targets.filter(function (t) { return t.type === 'bot'; }), h('button', { type: 'button', class: 'cx-t cx-add', onclick: function () { try { showView('worlds'); setTimeout(function () { window.switchWorldsTab && window.switchWorldsTab('space'); }, 60); } catch (e) { /* ignore */ } } }, [h('span', { class: 'cx-av bot', text: '+' }), h('span', { class: 'cx-tn' }, [h('b', { text: 'Connect a bot' }), h('i', { text: 'Grok Bot · Muse · any MCP bot' })])]));
  }
  function refreshTargets() {
    var base = COUNCIL.map(function (c) { return { type: 'council', id: c[0], name: c[0], sub: c[1] }; });
    var u = uid();
    return Promise.all([api('GET', '/api/operatives' + (u ? '?owner=' + encodeURIComponent(u) : '')).catch(function () { return {}; }), api('GET', '/api/bridge/chat/threads').catch(function () { return {}; })]).then(function (r) {
      var ops = (r[0] && (r[0].operatives || (r[0].data && r[0].data.operatives))) || (Array.isArray(r[0]) ? r[0] : []);
      var forged = ops.map(function (o) { return { type: 'forged', id: o.id, name: o.name || o.id, model: String(o.model || 'SHADDAI').toUpperCase(), sub: 'thinks with ' + String(o.model || 'SHADDAI').toUpperCase() }; });
      var bots = ((r[1] && r[1].threads) || []).map(function (t) { return { type: 'bot', id: t.thread, name: t.name, sub: t.can_chat ? (t.last ? t.last.text : 'say hello') : 'chat permission off', unread: t.unread, canChat: t.can_chat }; });
      targets = base.concat(forged, bots); if (cur) { var again = targets.filter(function (t) { return key(t) === key(cur); })[0]; if (again) cur = again; } rail();
    });
  }
  function empty() {
    if (msgsEl.childNodes.length) return;
    var t = cur; if (!t) return;
    var tips = t.type === 'bot' ? ['Write a message. Your bot reads it the next time it checks in and answers here.', t.canChat ? '' : 'This bot was created without the chat permission.'] : [t.type === 'forged' ? t.name + ' answers with ' + t.model + '\'s knowledge.' : t.name + ' answers from its knowledge base.', 'Type / for commands: /market, /news, /research, /report, /skill.'];
    msgsEl.appendChild(h('div', { class: 'cx-empty' }, [h('b', { text: t.name }), h('p', { text: tips[0] }), tips[1] ? h('p', { text: tips[1] }) : null]));
  }
  function select(t) {
    cur = t; stopPoll(); rail(); busy = false; sendEl.disabled = false; msgsEl.textContent = ''; botSeq = 0;
    headEl.textContent = ''; headEl.appendChild(avatar(t)); headEl.appendChild(h('div', { class: 'cx-hn' }, [h('b', { text: t.name }), h('span', { text: t.type === 'bot' ? 'outside bot · two-way channel' : t.type === 'forged' ? 'your agent · thinks with ' + t.model : 'council · ' + t.sub })]));
    if (t.type !== 'bot' && window.shdAgentViewer) headEl.appendChild(h('button', { type: 'button', class: 'cx-btn ghost', text: 'View body', onclick: function () { window.shdAgentViewer.open({ name: t.name, model: t.model || t.id, forged: t.type === 'forged' }); } }));
    headEl.appendChild(h('button', { type: 'button', class: 'cx-btn ghost', text: 'Export', onclick: exportMd }));
    inputEl.placeholder = t.type === 'bot' ? 'Message ' + t.name + '…' : 'Ask ' + t.name + ', or type / for commands…';
    if (t.type === 'bot') { convo = []; fetchBot(true); startPoll(); }
    else { convo = load(t); convo.forEach(draw); empty(); scroll(); }
  }
  function fetchBot(first) {
    if (!cur || cur.type !== 'bot') return;
    api('GET', '/api/bridge/chat/threads/' + encodeURIComponent(cur.id) + '?after=' + botSeq).then(function (d) {
      if (!d.ok || !cur || cur.type !== 'bot') return;
      if (first) { msgsEl.textContent = ''; }
      (d.messages || []).forEach(function (m) { botSeq = Math.max(botSeq, m.seq); if (!document.querySelector('[data-id="' + m.id + '"]')) { var x = { id: m.id, role: m.from === 'owner' ? 'user' : 'assistant', name: cur.name, text: m.text, at: m.at }; convo.push(x); draw(x); } });
      if (first && !(d.messages || []).length) empty(); scroll();
    });
  }
  function startPoll() { stopPoll(); pollTimer = setInterval(function () { if (!root.offsetParent || document.hidden) return; fetchBot(false); }, 3000); }
  function stopPoll() { clearInterval(pollTimer); }
  function exportMd() {
    var md = '# Chat with ' + cur.name + '\n\n' + convo.filter(function (m) { return m.role !== 'sys'; }).map(function (m) { return '**' + who(m) + '**: ' + m.text; }).join('\n\n');
    var a = h('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: 'chat-' + cur.name.toLowerCase() + '.md' }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ── build + wiring ── */
  function build() {
    var view = document.getElementById('chatView'); if (!view || document.getElementById('shdChat') || legacy()) return !!document.getElementById('shdChat');
    railEl = h('div', { class: 'cx-rail', role: 'list' }); headEl = h('div', { class: 'cx-head' }); msgsEl = h('div', { class: 'cx-msgs', 'aria-live': 'polite' });
    inputEl = h('textarea', { class: 'cx-in', rows: '1', placeholder: 'Message…', 'aria-label': 'Message' }); sendEl = h('button', { type: 'button', class: 'cx-send', 'aria-label': 'Send', text: 'Send', onclick: send });
    menuEl = h('div', { class: 'cx-menu', style: 'display:none' }); hintEl = h('div', { class: 'cx-hint' });
    inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === 'Escape') menu(false); });
    inputEl.addEventListener('input', function () { autosize(); var v = inputEl.value; if (v[0] === '/' && v.indexOf(' ') < 0) menu(true, v.toLowerCase()); else menu(false); });
    root = h('div', { id: 'shdChat', class: 'cx' }, [railEl, h('div', { class: 'cx-main' }, [headEl, msgsEl, h('div', { class: 'cx-comp' }, [menuEl, hintEl, h('div', { class: 'cx-row' }, [inputEl, sendEl])])])]);
    view.appendChild(root); return true;
  }
  function open() {
    if (legacy() || !build()) return;
    refreshTargets().then(function () { if (!cur) select(targets[0]); else select(cur); });
    clearInterval(open._t); open._t = setInterval(function () { if (root.offsetParent && !document.hidden) refreshTargets(); }, 15000);
  }
  function wrapShow() {
    var sv = window.showView; if (typeof sv !== 'function' || sv._cx) return;
    window.showView = function (v) { var r = sv.apply(this, arguments); if (v === 'chat') setTimeout(open, 40); else stopPoll(); return r; }; window.showView._cx = true;
    var cw = window.chatWithAgent; if (typeof cw === 'function' && !cw._cx) { window.chatWithAgent = function (name) { var r = cw.apply(this, arguments); setTimeout(function () { open(); var t = targets.filter(function (x) { return x.type === 'council' && x.id === String(name).toUpperCase(); })[0]; if (t) select(t); }, 120); return r; }; window.chatWithAgent._cx = true; }
  }
  wrapShow(); window.addEventListener('load', function () { wrapShow(); setTimeout(wrapShow, 800); });
  window.shdChat = { open: open, select: select, _targets: function () { return targets; } };
})();

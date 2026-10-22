/* world-academy-client.js — station panels for the Athenaeum Campus, talking to /api/school.
 *
 *   var A = WorldAcademy.create({ toast?, getAgents?, request?, fetch?, storage?, base? });
 *   A.open(station)        // station = one of campus.stations[]; mounts the panel on document.body (E key handler calls this)
 *   A.render(station)      // Promise<string>: the panel HTML (pure, escaped, testable)
 *   A.actions.learn(agentId, skillId) · .buy(titleId) · .join(classId, agentId) · .resolve(...) · .approve(...)
 *   WorldAcademy.renderMarkdown(text) · WorldAcademy.PANEL_KINDS
 *
 * Identity: same as world-agents-ui.js (x-user-id from localStorage in dev; the production softAuth/shim supplies the verified one).
 * Every dynamic value is escaped. Nothing here can spend Sparks except the explicit buttons (enroll via learn, buy).
 */
(function (root) {
  'use strict';
  var PANEL_KINDS = ['dais', 'pods', 'directory', 'teachers', 'trophy', 'trading', 'navi', 'lectern', 'press', 'import', 'admin', 'portal'];
  var ACH = [['first_lesson', 'First Lesson', '🎓'], ['honor_roll', 'Honor Roll', '📚'], ['quick_study', 'Quick Study', '⚡'], ['red_pen', 'Red Pen', '🖍️'],
    ['mentor_1', 'Mentor I', '🧑‍🏫'], ['mentor_2', 'Mentor II', '🏅'], ['mentor_3', 'Mentor III', '🏆'], ['grand_curriculum', 'Grand Curriculum', '🎖️']];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // A deliberately small, safe markdown subset: headings, lists, fenced code, bold, inline code. No links, no images, no raw HTML.
  function renderMarkdown(text) {
    var out = [], lines = String(text == null ? '' : text).split(/\r?\n/), i = 0, list = null, para = [];
    function inline(t) { return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
    function flush() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } if (list) { out.push('</' + list + '>'); list = null; } }
    for (; i < lines.length; i++) {
      var l = lines[i], m;
      if (/^```/.test(l)) { flush(); var code = []; i++; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); out.push('<pre>' + esc(code.join('\n')) + '</pre>'); continue; }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { flush(); out.push('<h4>' + inline(m[2]) + '</h4>'); continue; }
      if ((m = /^\s*[-*]\s+(?:\[[ x]\]\s+)?(.*)$/.exec(l))) { if (list !== 'ul') { flush(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if ((m = /^\s*\d+\.\s+(.*)$/.exec(l))) { if (list !== 'ol') { flush(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if (!l.trim()) { flush(); continue; }
      if (list) flush(); para.push(l.trim());
    }
    flush(); return out.join('');
  }

  function create(opts) {
    opts = opts || {};
    var state = { agentId: null, panel: null, station: null };
    function base() { return opts.base || (typeof root.SHD_SCHOOL_API === 'string' && root.SHD_SCHOOL_API ? root.SHD_SCHOOL_API.replace(/\/$/, '') : '/api/school'); }
    function store() { return opts.storage || (root.localStorage || null); }
    function uid() { try { var s = store(); return (s && (s.getItem('shd_uid') || s.getItem('shd_player_code'))) || ''; } catch (e) { return ''; } }
    function toast(m) { if (opts.toast) opts.toast(m); else if (root.Navi && root.Navi.toast) root.Navi.toast(m); }

    // api(method, path, body) -> { status, json }; never rejects (offline is status 0)
    function api(method, path, body) {
      if (opts.request) return Promise.resolve(opts.request(method, path, body));
      var f = opts.fetch || (root.fetch ? root.fetch.bind(root) : null);
      if (!f) return Promise.resolve({ status: 0, json: { success: false, error: 'offline' } });
      var h = { 'Content-Type': 'application/json' }, u = uid(); if (u) h['x-user-id'] = u;
      return f(base() + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); })
        .catch(function () { return { status: 0, json: { success: false, error: 'offline' } }; });
    }
    function agents() {
      if (opts.getAgents) return Promise.resolve(opts.getAgents()).catch(function () { return []; });
      var u = uid(); if (!u) return Promise.resolve([]);
      var f = opts.fetch || (root.fetch ? root.fetch.bind(root) : null); if (!f) return Promise.resolve([]);
      return f('/api/operatives?owner=' + encodeURIComponent(u)).then(function (r) { return r.json(); }).then(function (j) { return j.operatives || []; }).catch(function () { return []; });
    }

    // plain-words error text for a failed response
    function explain(res, what) {
      var e = res && res.json && res.json.error ? String(res.json.error) : '';
      switch (res && res.status) {
        case 0: return 'The Academy server is offline right now. Try again in a moment.';
        case 401: return 'Sign in to use the Academy.';
        case 402: return /enroll/i.test(e) ? 'Enroll first: each paid enrollment covers one baseline and one exam.' : 'Not enough Sparks for that.';
        case 403: return 'That is not yours, or it needs a role you do not have.';
        case 404: return 'That could not be found. It may have been retired.';
        case 409: return 'That is already running. Give it a moment.';
        case 429: return 'You have reached the daily limit for that. Try again tomorrow.';
        case 503: return 'The agent runner is offline on this server, so agents cannot sit exams yet.';
        default: return e ? esc(e) : 'Something went wrong' + (what ? ' while ' + esc(what) : '') + '.';
      }
    }
    function bad(res, what) { return '<div class="ac-err">' + explain(res, what) + '</div>'; }
    function pct(n) { return typeof n === 'number' ? Math.round(n * 100) + '%' : '?'; }

    // ── actions (each returns the HTML for the result area) ───────────────────
    var actions = {
      learn: function (agentId, skillId) {
        return api('POST', '/agents/' + encodeURIComponent(agentId) + '/learn', { skillId: skillId }).then(function (r) {
          if (r.status !== 200 || !r.json || !r.json.success) return bad(r, 'running the exam');
          var j = r.json;
          if (j.pending) return '<div class="ac-note">The judges could not agree, so an administrator will review this attempt. Check back soon.</div>';
          return '<div class="' + (j.passed ? 'ac-ok' : 'ac-warn') + '"><b>' + (j.passed ? 'Passed' : 'Not yet') + '</b> · baseline ' + pct(j.baseline) + ' → exam ' + pct(j.exam) + ' · lift ' + pct(j.lift) +
            (j.installed ? ' · <b>skill installed</b>' : '') + (j.receiptId ? '<br><small>Receipt ' + esc(j.receiptId) + '</small>' : '') + '</div>';
        });
      },
      buy: function (titleId) {
        return api('POST', '/press/buy', { titleId: titleId }).then(function (r) {
          if (r.status !== 200 || !r.json || !r.json.success) return bad(r, 'buying that');
          return api('GET', '/press/read/' + encodeURIComponent(titleId)).then(function (rr) {
            if (rr.status !== 200 || !rr.json || !rr.json.success) return bad(rr, 'opening that');
            return '<div class="ac-book">' + renderMarkdown(rr.json.body) + '</div>';
          });
        });
      },
      join: function (classId, agentId) {
        return api('POST', '/classes/' + encodeURIComponent(classId) + '/join', { agentId: agentId }).then(function (r) { return r.status === 200 && r.json.success ? '<div class="ac-ok">Joined the class.</div>' : bad(r, 'joining'); });
      },
      resolve: function (attemptId, taskScores) {
        return api('POST', '/admin/review/' + encodeURIComponent(attemptId), { taskScores: taskScores }).then(function (r) { return r.status === 200 && r.json.success ? '<div class="ac-ok">Resolved: score ' + pct(r.json.score) + '.</div>' : bad(r, 'resolving'); });
      },
      approve: function (titleId, yes) {
        return api('POST', '/press/approve', { titleId: titleId, approve: !!yes }).then(function (r) { return r.status === 200 && r.json.success ? '<div class="ac-ok">' + (yes ? 'Approved.' : 'Rejected.') + '</div>' : bad(r, 'reviewing the title'); });
      }
    };

    // ── panels ────────────────────────────────────────────────────────────────
    function head(st, sub) { return '<h3 class="ac-title">' + esc(st.label) + '</h3>' + (sub ? '<div class="ac-sub">' + sub + '</div>' : ''); }
    function agentPicker(list, selected) {
      if (!list.length) return '<div class="ac-note">You have no agents yet. Forge one in the dashboard, or import a bot at the Import Dock.</div>';
      return '<label class="ac-lab">Your agent <select id="acAgent" data-act="pick-agent">' + list.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.codename || a.name || a.id) + '</option>'; }).join('') + '</select></label>';
    }
    function installed(a) { var o = {}; ((a && a.skills) || []).forEach(function (s) { o[s.skillId] = true; }); return o; }
    function skillRow(sk, agent, selectable) {
      var have = installed(agent), missing = (sk.requires || []).filter(function (r) { return !have[r]; }), owned = !!have[sk.id];
      var btn = !selectable ? '' : owned ? '<span class="ac-chip ok">installed</span>' : missing.length ? '<span class="ac-chip lock">locked</span>' : '<button data-act="learn" data-skill="' + esc(sk.id) + '">Teach my agent</button>';
      return '<div class="ac-row"><b>' + esc(sk.name) + '</b> <span class="ac-chip">' + esc(sk.tier) + '</span> <span class="ac-price">' + esc(sk.price_sparks) + ' Sparks</span> <small>by ' + esc(sk.teacher && sk.teacher.id) + '</small>' +
        '<div class="ac-sum">' + esc(sk.summary) + '</div>' + (sk.requires && sk.requires.length ? '<div class="ac-req">requires ' + sk.requires.map(esc).join(', ') + (missing.length && selectable ? ' (you are missing ' + missing.map(esc).join(', ') + ')' : '') + '</div>' : '') + '<div>' + btn + '</div></div>';
    }
    var PANELS = {
      directory: function (st) {
        return Promise.all([api('GET', '/skills'), agents()]).then(function (r) {
          if (r[0].status !== 200) return head(st) + bad(r[0], 'loading skills');
          var list = r[1], skills = r[0].json.skills || [], sel = list.find(function (a) { return a.id === state.agentId; }) || list[0]; if (sel) state.agentId = sel.id;
          var tracks = {}; skills.forEach(function (s) { (tracks[s.track] = tracks[s.track] || []).push(s); });
          return head(st, 'Pick a skill. Your agent takes a baseline, learns it, then sits an exam. It only installs if the score really improves.') + agentPicker(list, state.agentId) +
            Object.keys(tracks).sort().map(function (t) { return '<div class="ac-group" data-track="' + esc(t) + '"><h4>' + esc(t) + '</h4>' + tracks[t].map(function (s) { return skillRow(s, sel, !!sel); }).join('') + '</div>'; }).join('') + '<div id="acOut"></div>';
        });
      },
      pods: function (st) {
        return Promise.all([api('GET', '/skills'), agents()]).then(function (r) {
          if (r[0].status !== 200) return head(st) + bad(r[0], 'loading skills');
          var list = r[1], skills = r[0].json.skills || [], sel = list.find(function (a) { return a.id === state.agentId; }) || list[0]; if (sel) state.agentId = sel.id;
          var have = installed(sel);
          return head(st, 'Exam pod ' + esc(st.pod || '') + ': pick your agent and a skill. The pod runs the baseline without the lesson, then the exam with it.') + agentPicker(list, state.agentId) +
            (sel ? '<label class="ac-lab">Skill <select id="acSkill">' + skills.map(function (s) { return '<option value="' + esc(s.id) + '"' + (have[s.id] ? ' disabled' : '') + '>' + esc(s.name) + (have[s.id] ? ' (installed)' : ' · ' + esc(s.price_sparks) + ' Sparks') + '</option>'; }).join('') + '</select></label><button data-act="learn-selected">Run the exam</button>' : '') + '<div id="acOut"></div>';
        });
      },
      dais: function (st) {
        return Promise.all([api('GET', '/skills'), agents()]).then(function (r) {
          if (r[0].status !== 200) return head(st) + bad(r[0], 'loading skills');
          var list = r[1], sel = list.find(function (a) { return a.id === state.agentId; }) || list[0]; if (sel) state.agentId = sel.id; var have = installed(sel);
          return head(st, sel ? 'Skills ' + esc(sel.codename || sel.id) + ' has learned, and what unlocks next.' : 'Sign in with an agent to see its tree.') + agentPicker(list, state.agentId) +
            '<div class="ac-tree">' + (r[0].json.skills || []).map(function (s) {
              var miss = (s.requires || []).filter(function (x) { return !have[x]; });
              return '<div class="ac-node ' + (have[s.id] ? 'on' : miss.length ? 'off' : 'next') + '">' + (have[s.id] ? '✓ installed' : miss.length ? 'locked, requires ' + miss.map(esc).join(', ') : 'available') + ' · <b>' + esc(s.name) + '</b></div>';
            }).join('') + '</div>';
        });
      },
      lectern: function (st) {
        return Promise.all([api('GET', '/faculty'), api('GET', '/classes'), api('GET', '/skills'), agents()]).then(function (r) {
          var fac = ((r[0].json && r[0].json.faculty) || []).find(function (f) { return f.agent === st.agent || f.room === st.room; });
          var skills = ((r[2].json && r[2].json.skills) || []).filter(function (s) { return st.agent && s.teacher && s.teacher.id === st.agent; });
          var classes = ((r[1].json && r[1].json.classes) || []).filter(function (c) { return c.room === st.room; });
          var list = r[3], sel = list.find(function (a) { return a.id === state.agentId; }) || list[0]; if (sel) state.agentId = sel.id;
          return head(st, st.agent ? 'Taught by <b>' + esc(st.agent) + '</b>' + (fac ? ' · ' + (fac.subjects || []).map(esc).join(', ') : '') : 'Open lecture hall') +
            (skills.length ? '<h4>Skills taught here</h4>' + skills.map(function (s) { return skillRow(s, sel, !!sel); }).join('') : '') +
            '<h4>Classes</h4>' + (classes.length ? classes.map(function (c) { return '<div class="ac-row"><b>' + esc(c.name) + '</b> <span class="ac-chip">' + esc(c.kind) + '</span> <small>' + esc(c.seats) + '/' + esc(c.capacity) + ' seats</small>' + (sel ? ' <button data-act="join" data-class="' + esc(c.id) + '">Join with my agent</button>' : '') + '</div>'; }).join('') : '<div class="ac-note">No classes scheduled in this room yet.</div>') + '<div id="acOut"></div>';
        });
      },
      press: function (st) {
        return api('GET', '/press/titles?room=' + encodeURIComponent(st.room)).then(function (r) {
          if (r.status !== 200) return head(st) + bad(r, 'loading the shelf');
          var t = (r.json && r.json.titles) || [];
          return head(st, 'Books and docs from this room. Buying opens the book to read and keep.') + (t.length ? t.map(function (b) { return '<div class="ac-row"><b>' + esc(b.title) + '</b> <span class="ac-chip">' + esc(b.kind) + '</span> <span class="ac-price">' + esc(b.price_sparks) + ' Sparks</span> <button data-act="buy" data-title="' + esc(b.id) + '">' + (b.price_sparks ? 'Buy and read' : 'Read') + '</button></div>'; }).join('') : '<div class="ac-note">Nothing on this shelf yet.</div>') + '<div id="acOut"></div>';
        });
      },
      teachers: function (st) {
        return Promise.all([api('GET', '/faculty'), api('GET', '/skills')]).then(function (r) {
          var fac = (r[0].json && r[0].json.faculty) || [], skills = (r[1].json && r[1].json.skills) || [];
          return head(st, 'The house faculty and what they teach. Publish your own skill to join them.') + fac.map(function (f) {
            var n = skills.filter(function (s) { return s.teacher && s.teacher.id === f.agent; }).length;
            return '<div class="ac-row"><b>' + esc(f.agent) + '</b> <small>' + esc(f.room) + '</small> · ' + n + ' skill' + (n === 1 ? '' : 's') + '<div class="ac-sum">' + (f.subjects || []).map(esc).join(' · ') + '</div></div>';
          }).join('');
        });
      },
      trophy: function (st) {
        return agents().then(function (list) {
          var sel = list.find(function (a) { return a.id === state.agentId; }) || list[0]; if (!sel) return head(st, 'Medals for your agents') + '<div class="ac-note">No agents yet.</div>';
          state.agentId = sel.id;
          var f = opts.request ? null : (opts.fetch || (root.fetch ? root.fetch.bind(root) : null));
          var get = opts.request ? Promise.resolve(opts.request('GET', '/../achievements/' + encodeURIComponent(sel.id))) : (f ? f('/api/achievements/' + encodeURIComponent(sel.id)).then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); }).catch(function () { return { status: 0, json: {} }; }) : Promise.resolve({ status: 0, json: {} }));
          return get.then(function (r) {
            var got = {}; ((r.json && (r.json.unlocked || (r.json.progress && r.json.progress.unlocked))) || []).forEach(function (u) { got[u.id] = true; });
            return head(st, 'Medals for ' + esc(sel.codename || sel.id)) + agentPicker(list, state.agentId) + '<div class="ac-medals">' + ACH.map(function (a) { return '<div class="ac-medal ' + (got[a[0]] ? 'on' : 'off') + '"><span>' + a[2] + '</span> ' + esc(a[1]) + '</div>'; }).join('') + '</div>';
          });
        });
      },
      trading: function (st) {
        return api('GET', '/skills?track=trading').then(function (r) {
          var skills = ((r.json && r.json.skills) || []).filter(function (s) { return s.track === 'trading'; });
          return head(st, '<b>Paper trading only.</b> Nothing here places a real trade or promises a return. You learn sizing, stops and honest journaling.') + skills.map(function (s) { return skillRow(s, null, false); }).join('') +
            '<div class="ac-note">To teach an agent these skills, use an Exam Pod or the Skill Directory.</div>';
        });
      },
      import: function (st) {
        var url = (typeof location !== 'undefined' && location.origin ? location.origin : '') + base() + '/xagent/tools';
        return Promise.resolve(head(st, 'Bring any bot (Grok, Muse, Claude, GPT, your own) into the Academy.') +
          '<ol><li>Register the bot in the dashboard to get a token that starts with <code>shdx_</code>. It is shown once. Keep it secret and never paste it into chats.</li>' +
          '<li>Give the bot this tool list: <code>' + esc(url) + '</code> (works as OpenAI or Anthropic tool definitions).</li>' +
          '<li>It enrolls, takes a baseline, reads the lesson, takes the exam, and finishes. Skills install only on a real score improvement.</li></ol>' +
          '<div class="ac-note">Full guide: docs/ACADEMY-AGENT-GUIDE.md</div>');
      },
      admin: function (st) {
        return Promise.all([api('GET', '/admin/review'), api('GET', '/press/pending')]).then(function (r) {
          if (r[0].status === 403 || r[0].status === 401) return head(st) + '<div class="ac-locked">🔒 Admins only. This door is locked for your account.</div>';
          if (r[0].status !== 200) return head(st) + bad(r[0], 'loading the queue');
          var review = (r[0].json && r[0].json.review) || [], pend = (r[1].json && r[1].json.titles) || [];
          return head(st, 'Approvals and appeals') + '<h4>Exam review queue</h4>' + (review.length ? review.map(function (q) {
            return '<div class="ac-row"><b>' + esc(q.agentId) + '</b> · ' + esc(q.skillId) + q.tasks.map(function (t) { return '<div class="ac-sum"><i>' + esc(t.prompt) + '</i><pre>' + esc(typeof t.output === 'string' ? t.output : JSON.stringify(t.output)) + '</pre>Score 0-1 <input data-task="' + esc(t.taskId) + '" size="4" value="0.5"></div>'; }).join('') + '<button data-act="resolve" data-attempt="' + esc(q.attemptId) + '">Resolve</button></div>';
          }).join('') : '<div class="ac-note">Nothing waiting.</div>') +
            '<h4>Books awaiting approval</h4>' + (pend.length ? pend.map(function (t) { return '<div class="ac-row"><b>' + esc(t.title) + '</b> <small>' + esc(t.room) + ' · ' + esc(t.price_sparks) + ' Sparks</small> <button data-act="approve" data-title="' + esc(t.id) + '">Approve</button> <button data-act="reject" data-title="' + esc(t.id) + '">Reject</button></div>'; }).join('') : '<div class="ac-note">No books pending.</div>') + '<div id="acOut"></div>';
        });
      },
      navi: function (st) { return Promise.resolve(head(st, 'Opening your Navi Academy tab.')); },
      // FIELD TRIPS: the academy is classes only; the seven agent halls are the real buildings in the city (Source Temple, Navigator, Library, Esoteric Wing, Museum, Aegis, Markets)
      portal: function (st) {
        var HALLS = [['SHADDAI', 'The Source Temple', 'strategy and the council'], ['NEXUS', 'The Navigator', 'tools and systems'], ['QUILL', 'The Library', 'writing and records'], ['ORACLE', 'The Observatory', 'research and the observatory'],
          ['TURTLE', 'The Museum', 'art, design and music'], ['PIKADON', 'The Aegis', 'security and compliance'], ['ZEROX', 'The Markets', 'trading and the economy']];
        return Promise.resolve(head(st, 'Take a field trip: apply what you learned in the real hall. Every hall has a return pad back here.') +
          HALLS.map(function (h) { return '<div class="ac-row"><b>' + esc(h[1]) + '</b> <small>' + esc(h[0]) + ' · ' + esc(h[2]) + '</small> <button data-act="hall" data-code="' + esc(h[0]) + '">Go</button></div>'; }).join(''));
      }
    };

    function render(st) { var fn = PANELS[st && st.kind]; return fn ? fn(st) : Promise.resolve('<div class="ac-err">Nothing to show here.</div>'); }

    // ── DOM (thin; everything above is testable without it) ───────────────────
    var STYLE = '#acPanel{position:fixed;right:18px;top:70px;width:min(460px,92vw);max-height:78vh;overflow:auto;z-index:9000;background:linear-gradient(180deg,rgba(8,12,16,.96),rgba(6,8,11,.97));border:1px solid rgba(0,255,156,.45);border-radius:12px;box-shadow:0 0 28px rgba(0,255,156,.18);color:#e7f3ee;font:13px/1.5 system-ui,sans-serif;padding:14px 16px}' +
      '#acPanel .ac-x{position:absolute;right:10px;top:8px;background:none;border:0;color:#9bffe0;font-size:18px;cursor:pointer}#acPanel h3{margin:0 0 4px;color:#00ff9c;font-size:16px}#acPanel h4{margin:12px 0 4px;color:#e8c45c;text-transform:capitalize}' +
      '#acPanel .ac-sub,#acPanel .ac-sum,#acPanel small{opacity:.8}#acPanel .ac-row{border-top:1px solid rgba(255,255,255,.07);padding:8px 0}#acPanel .ac-chip{font-size:11px;border:1px solid #1c5;border-radius:9px;padding:0 6px;color:#9bffe0}#acPanel .ac-chip.lock{border-color:#c66;color:#f99}' +
      '#acPanel .ac-price{color:#e8c45c}#acPanel button{background:rgba(0,255,156,.2);border:1px solid #00ff9c;color:#eafff6;border-radius:7px;padding:4px 10px;cursor:pointer;font:inherit}#acPanel select,#acPanel input{background:#0b1422;color:#e9f4ee;border:1px solid rgba(0,255,156,.35);border-radius:6px;padding:3px}' +
      '#acPanel .ac-ok{color:#9bffb0;margin-top:8px}#acPanel .ac-warn{color:#ffd27a;margin-top:8px}#acPanel .ac-err{color:#ff9a8a;margin-top:8px}#acPanel .ac-note,#acPanel .ac-locked{opacity:.85;margin:8px 0}#acPanel pre{white-space:pre-wrap;background:#0b1117;padding:6px;border-radius:6px}' +
      '#acPanel .ac-medals{display:grid;grid-template-columns:1fr 1fr;gap:6px}#acPanel .ac-medal.off{opacity:.35}#acPanel .ac-node{padding:3px 0}#acPanel .ac-node.on{color:#9bffb0}#acPanel .ac-node.off{opacity:.5}#acPanel .ac-book{margin-top:10px;border-top:1px solid rgba(255,255,255,.12);padding-top:8px}';
    function close() { if (state.panel && state.panel.parentNode) state.panel.parentNode.removeChild(state.panel); state.panel = null; state.station = null; }
    function out(html) { var el = state.panel && state.panel.querySelector('#acOut'); if (el) el.innerHTML = html; }
    function onClick(ev) {
      var t = ev.target; if (!t || !t.dataset) return;
      var act = t.dataset.act, doc = state.panel;
      if (t.classList && t.classList.contains('ac-x')) return close();
      if (act === 'learn') { out('<div class="ac-note">Running… this can take a minute.</div>'); actions.learn(state.agentId, t.dataset.skill).then(out); }
      else if (act === 'learn-selected') { var sk = doc.querySelector('#acSkill'); out('<div class="ac-note">Running the baseline, then the exam… this can take a minute.</div>'); actions.learn(state.agentId, sk && sk.value).then(out); }
      else if (act === 'buy') { out('<div class="ac-note">Opening…</div>'); actions.buy(t.dataset.title).then(out); }
      else if (act === 'hall') { var go = root.__interiorsEnter; close(); if (go) go(t.dataset.code); }
      else if (act === 'join') actions.join(t.dataset['class'], state.agentId).then(out);
      else if (act === 'approve' || act === 'reject') actions.approve(t.dataset.title, act === 'approve').then(out);
      else if (act === 'resolve') { var scores = {}; t.parentNode.querySelectorAll('input[data-task]').forEach(function (i) { scores[i.dataset.task] = Number(i.value); }); actions.resolve(t.dataset.attempt, scores).then(out); }
    }
    function open(st) {
      if (!st) return Promise.resolve(false);
      if (st.kind === 'navi') { if (root.Navi && root.Navi.setModule) { root.Navi.open && root.Navi.open(); root.Navi.setModule('academy'); } return Promise.resolve(true); }
      if (typeof document === 'undefined') return render(st);
      close();
      var el = document.createElement('div'); el.id = 'acPanel'; el.innerHTML = '<style>' + STYLE + '</style><button class="ac-x" aria-label="close">×</button><div id="acBody"><div class="ac-note">Loading…</div></div>';
      document.body.appendChild(el); state.panel = el; state.station = st;
      el.addEventListener('click', onClick);
      el.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'acAgent') state.agentId = ev.target.value; });
      return render(st).then(function (html) { if (state.panel === el) el.querySelector('#acBody').innerHTML = html; return true; });
    }
    return { api: api, render: render, open: open, close: close, actions: actions, explain: explain, state: state };
  }

  var out = { create: create, esc: esc, renderMarkdown: renderMarkdown, PANEL_KINDS: PANEL_KINDS };
  if (typeof module === 'object' && module.exports) module.exports = out;
  if (root) root.WorldAcademy = out;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

/* SHADDAI V119 — THE WORD ENGINE. One shared way to say what you want, used by the chat, the 3D office command bar and the holo tabs.
     /price btc eth        /news        /research mangroves restoration        /mood        /weather london        /run crypto analysis sol
   No ids, no underscores: "market snapshot", "market-snapshot" and "market_snapshot" all mean the same thing, and close matches are found for you.
   It only RESOLVES words into a server workflow + params; the server (/api/bridge/run) does the work with its own scopes, limits and approvals. */
(function () {
  'use strict';
  var TICKERS = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', doge: 'dogecoin', ada: 'cardano', xrp: 'ripple', bnb: 'binancecoin', avax: 'avalanche-2', dot: 'polkadot', matic: 'matic-network', link: 'chainlink', ltc: 'litecoin', wif: 'dogwifcoin', bonk: 'bonk', trx: 'tron', atom: 'cosmos', near: 'near', sui: 'sui', apt: 'aptos', arb: 'arbitrum', op: 'optimism', pepe: 'pepe', shib: 'shiba-inu' };
  var FILLER = { run: 1, do: 1, start: 1, use: 1, open: 1, the: 1, a: 1, an: 1, my: 1, me: 1, please: 1, for: 1, of: 1, on: 1, to: 1, show: 1, get: 1, give: 1, workflow: 1, skill: 1, tool: 1 };
  /* friendly commands: every phrase on the left means the thing on the right */
  var FRIENDLY = [
    { say: ['price', 'prices', 'coin', 'coins', 'ticker', 'tickers'], title: 'Live prices', wf: 'market.snapshot', hint: 'price btc eth', params: function (r) { var s = r.words.map(function (w) { return TICKERS[w] || w; }); return s.length ? { symbols: s.slice(0, 5) } : {}; } },
    { say: ['market', 'markets', 'snapshot', 'market snapshot'], title: 'Market snapshot', wf: 'market.snapshot', hint: 'market', params: function (r) { var s = r.words.map(function (w) { return TICKERS[w] || w; }); return s.length ? { symbols: s.slice(0, 5) } : {}; } },
    { say: ['news', 'headlines', 'digest'], title: 'News digest', wf: 'news.digest', hint: 'news', params: function () { return {}; } },
    { say: ['research', 'study', 'investigate', 'look up', 'lookup', 'find out', 'search'], title: 'Research', wf: 'research.topic', hint: 'research mangroves', need: 'a topic, e.g. /research mangroves', params: function (r) { return r.rest ? { query: r.rest } : null; } },
    { say: ['report', 'status', 'account', 'overview', 'my account'], title: 'Account report', wf: 'dashboard.report', hint: 'report', params: function () { return {}; } },
    { say: ['mood', 'sentiment', 'fear', 'greed', 'fear greed', 'fear and greed'], title: 'Market mood', tool: 'get_fear_greed', hint: 'mood', params: function () { return {}; } },
    { say: ['trending', 'trends', 'hot'], title: 'Trending coins', tool: 'get_trending', hint: 'trending', params: function () { return {}; } },
    { say: ['moon', 'moon phase'], title: 'Moon phase', tool: 'get_moon_phase', hint: 'moon', params: function () { return {}; } },
    { say: ['weather', 'forecast'], title: 'Weather', tool: 'get_weather', hint: 'weather london', need: 'a city, e.g. /weather london', params: function (r) { return r.rest ? { city: r.rest } : null; } },
    { say: ['define', 'definition', 'meaning', 'what does'], title: 'Definition', tool: 'get_word_definition', hint: 'define garden', need: 'a word, e.g. /define garden', params: function (r) { var w = r.words.filter(function (x) { return x !== 'word'; })[0]; return w ? { word: w } : null; } },
    { say: ['calc', 'calculate', 'math', 'compute'], title: 'Calculator', tool: 'calculate', hint: 'calc 12 * (3 + 4)', need: 'an expression, e.g. /calc 12 * 7', params: function (r) { return r.raw ? { expression: r.raw } : null; } },
    { say: ['joke', 'laugh'], title: 'A joke', tool: 'get_joke', hint: 'joke', params: function () { return {}; } },
    { say: ['quote', 'inspire', 'inspiration'], title: 'A quote', tool: 'get_random_quote', hint: 'quote', params: function () { return {}; } }
  ];
  var cache = null, cacheAt = 0;

  function auth() { var o = {}; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function get(path) { return fetch(path, { credentials: 'same-origin', headers: auth() }).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return {}; }); }
  /* normalise anything to lowercase words: "Market_Snapshot", "market-snapshot", "lib.price-pulse" -> ["market","snapshot"] */
  function words(s) { return String(s || '').toLowerCase().replace(/^lib\./, '').split(/[^a-z0-9=.]+/).map(function (w) { return w.replace(/^\.+|\.+$/g, ''); }).filter(Boolean); }
  function nameWords(s) { return String(s || '').toLowerCase().replace(/^lib\./, '').split(/[^a-z0-9]+/).filter(Boolean); }
  function parseInput(text) {
    var t = String(text || '').trim().replace(/^\/+/, ''), kv = {}, plain = [];
    var orig = [];
    t.split(/\s+/).forEach(function (w) { var i = w.indexOf('='); if (i > 0 && i < w.length - 1) kv[w.slice(0, i).toLowerCase()] = w.slice(i + 1); else if (w) { orig.push(w); if (/^[a-z][a-z0-9]*([-_][a-z0-9]+)+$/i.test(w)) w.split(/[-_]+/).forEach(function (x) { plain.push(x); }); else plain.push(w); } });
    return { raw: orig.join(' '), plain: plain, kv: kv };
  }

  function load(force) {
    if (!force && cache && Date.now() - cacheAt < 120000) return Promise.resolve(cache);
    return Promise.all([get('/api/bridge/library?limit=400'), get('/api/bridge/skills'), get('/api/bridge/workflows')]).then(function (r) {
      var c = [];
      ((r[0] && r[0].workflows) || []).forEach(function (w) { c.push({ kind: 'library', id: w.workflow_id, wf: w.workflow_id, title: w.name, desc: w.description, needs: w.needs_context || [], nw: nameWords(w.workflow_id + ' ' + w.name) }); });
      ((r[1] && r[1].skills) || []).forEach(function (s) { c.push({ kind: 'skill', id: s.skill, wf: 'skill.run', skill: s.skill, title: s.skill.replace(/-/g, ' '), desc: s.description, needs: s.required_input || [], nw: nameWords(s.skill) }); });
      ((r[2] && r[2].workflows) || []).forEach(function (w) { if (w.workflow_id.indexOf('demo.') !== 0 && w.workflow_id !== 'tool.run') c.push({ kind: 'workflow', id: w.workflow_id, wf: w.workflow_id, title: w.title, desc: w.title, needs: [], nw: nameWords(w.workflow_id + ' ' + w.title) }); });
      cache = c; cacheAt = Date.now(); return c;
    });
  }
  /* score how well query words match a candidate's words (exact > prefix > contained) */
  function score(q, cand) {
    if (!q.length) return 0; var hit = 0, matched = [];
    q.forEach(function (w) { var best = 0; cand.nw.forEach(function (c) { var s = c === w ? 1 : (w.length >= 3 && c.indexOf(w) === 0) ? 0.75 : (c.length >= 3 && w.indexOf(c) === 0) ? 0.55 : (w.length >= 4 && c.indexOf(w) > -1) ? 0.45 : 0; if (s > best) best = s; }); if (best > 0) matched.push(w); hit += best; });
    var cover = hit / q.length, extra = Math.max(0, cand.nw.length - q.length) * 0.03; return { s: cover - extra, matched: matched };
  }
  function friendlyMatch(parsed) {
    var plain = parsed.plain.map(function (w) { return w.toLowerCase(); }), best = null;
    FRIENDLY.forEach(function (f) { f.say.forEach(function (phrase) { var pw = phrase.split(' '); if (pw.length <= plain.length && pw.every(function (w, i) { return plain[i] === w; })) { if (!best || pw.length > best.len) best = { f: f, len: pw.length }; } }); });
    if (!best) return null; var restWords = plain.slice(best.len), restRaw = parsed.plain.slice(best.len).join(' ');
    var origRest = parsed.raw.split(/\s+/).slice(best.len).join(' ');
    return { f: best.f, r: { words: restWords, rest: restRaw, raw: origRest || restRaw } };
  }

  /* resolve(text) -> Promise of one of:
       { ok:true, title, wf, params, via }                         ready to POST to /api/bridge/run
       { ok:false, message, suggestions:[{say,title}] }            not understood / missing input / ambiguous */
  function resolve(text) {
    var p = parseInput(text); if (!p.plain.length && !Object.keys(p.kv).length) return Promise.resolve({ ok: false, message: 'Say what you want, for example: price btc, news, research mangroves.', suggestions: hints() });
    var fm = friendlyMatch(p);
    if (fm) { var prm = fm.f.params(fm.r); if (prm === null) return Promise.resolve({ ok: false, message: 'That needs ' + fm.f.need + '.', suggestions: [] }); var out = { ok: true, title: fm.f.title, via: 'friendly' }; if (fm.f.tool) { out.wf = 'tool.run'; out.params = { tool: fm.f.tool, args: prm }; } else { out.wf = fm.f.wf; out.params = prm; } return Promise.resolve(out); }
    var q = p.plain.map(function (w) { return w.toLowerCase().replace(/[^a-z0-9]/g, ''); }).filter(function (w) { return w && !FILLER[w]; });
    if (!q.length) return Promise.resolve({ ok: false, message: 'Say what you want to run, for example: run crypto analysis.', suggestions: hints() });
    return load().then(function (cands) {
      var scored = cands.map(function (c) { var r = score(q, c); return { c: c, s: r.s, m: r.matched }; }).filter(function (x) { return x.s >= 0.5; }).sort(function (a, b) { return b.s - a.s; });
      if (!scored.length) return { ok: false, message: 'No match for "' + p.plain.join(' ') + '". Try one of these:', suggestions: hints() };
      var top = scored[0], near = scored.filter(function (x) { return top.s - x.s < 0.08; });
      if (near.length > 1 && top.s < 0.99) return { ok: false, message: 'Which one did you mean?', suggestions: near.slice(0, 5).map(function (x) { return { say: 'run ' + x.c.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), title: x.c.title }; }) };
      var c = top.c, used = {}; top.m.forEach(function (w) { used[w] = 1; });
      var leftover = q.filter(function (w) { return !used[w]; }).map(function (w) { var orig = p.plain.filter(function (o) { return o.toLowerCase().replace(/[^a-z0-9]/g, '') === w; })[0]; return TICKERS[w] ? w : (orig || w); });
      var ctx = {}; Object.keys(p.kv).forEach(function (k) { ctx[k] = TICKERS[p.kv[k].toLowerCase()] ? p.kv[k] : p.kv[k]; });
      c.needs.forEach(function (k, i) { if (ctx[k] == null && leftover.length) { ctx[k] = i === 0 ? leftover.join(' ') : leftover.join(' '); leftover = []; } });
      var miss = c.needs.filter(function (k) { return ctx[k] == null || String(ctx[k]).trim() === ''; });
      if (miss.length) return { ok: false, message: c.title + ' needs ' + miss.join(' and ') + '. Try: ' + c.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ' + miss.map(function (k) { return k + '=...'; }).join(' '), suggestions: [] };
      if (c.kind === 'skill') return { ok: true, title: c.title, wf: 'skill.run', params: { skill: c.skill, input: ctx }, via: 'skill' };
      if (c.kind === 'library') return { ok: true, title: c.title, wf: c.wf, params: { context: ctx }, via: 'library' };
      return { ok: true, title: c.title, wf: c.wf, params: leftover.length && c.id === 'research.topic' ? { query: leftover.join(' ') } : {}, via: 'workflow' };
    });
  }
  /* find(text): the best skill or library workflow for plain words (used by /learn). */
  function find(text) {
    var p = parseInput(text), q = p.plain.map(function (w) { return w.toLowerCase().replace(/[^a-z0-9]/g, ''); }).filter(function (w) { return w && !FILLER[w]; });
    if (!q.length) return Promise.resolve({ ok: false, message: 'Say which skill or workflow, for example: learn price pulse.' });
    return load().then(function (cands) {
      var pool = cands.filter(function (c) { return c.kind === 'skill' || c.kind === 'library'; });
      var sc = pool.map(function (c) { return { c: c, s: score(q, c).s }; }).filter(function (x) { return x.s >= 0.5; }).sort(function (a, b) { return b.s - a.s; });
      if (!sc.length) return { ok: false, message: 'No skill or workflow matches "' + p.plain.join(' ') + '".' };
      var near = sc.filter(function (x) { return sc[0].s - x.s < 0.08; });
      if (near.length > 1 && sc[0].s < 0.99) return { ok: false, message: 'Which one did you mean? ' + near.slice(0, 5).map(function (x) { return x.c.title; }).join(' · ') };
      var c = sc[0].c; return { ok: true, kind: c.kind, id: c.kind === 'skill' ? c.skill : c.wf, title: c.title };
    });
  }
  function hints() { return FRIENDLY.slice(0, 8).map(function (f) { return { say: f.hint, title: f.title }; }); }
  /* autocomplete: friendly commands first, then close library/skill names */
  function suggest(prefix) {
    var p = String(prefix || '').toLowerCase().replace(/^\/+/, '').trim(), out = [];
    FRIENDLY.forEach(function (f) { if (!p || f.say.some(function (s) { return s.indexOf(p) === 0; }) || f.hint.indexOf(p) === 0) out.push({ say: f.hint, title: f.title }); });
    if (cache && p.length >= 2) { var q = nameWords(p); cache.map(function (c) { return { c: c, s: score(q, c).s }; }).filter(function (x) { return x.s >= 0.5; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 5).forEach(function (x) { out.push({ say: 'run ' + x.c.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), title: x.c.title }); }); }
    return out.slice(0, 8);
  }
  window.shdWords = { find: find, resolve: resolve, suggest: suggest, load: load, hints: hints, friendly: FRIENDLY, tickers: TICKERS, _score: score, _words: words };
})();

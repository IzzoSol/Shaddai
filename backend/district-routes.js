// district-routes.js — the agent districts of Shaddai World (each agent runs a place).
//   NEXUS  → The Navigator  (/api/navigator/ask, /api/navigator/aura)
//   PIKADON→ The Aegis       (/api/aegis/scan)
//   QUILL  → The Library     (/api/library/note, /api/library/search)
//   ORACLE → Esoteric Archive(/api/oracle/esoteric)  [premium-gated]
//   TURTLE → The Museum reuses /api/collectables ; ZEROX → The Agora reuses /bazaar
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const json = express.json();
let ae = null;    try { ae = require('./agent-engine'); } catch (e) {}
let cache = null; try { cache = require('./cache-analytics'); } catch (e) {}
let auraLib = null; try { auraLib = require('./lib/aura'); } catch (e) {}

// ── NEXUS — The Navigator (help desk + AURA token tracker) ──
const KB = [
  { q: 'forge build agent create operative make', a: 'Open the Forge (Skills view → Operator Forge). Pick body, outfit, headwear, aura, weapon → equip skills/tools → pick a brain → FORGE. It generates a FLUX character and saves the operative to /api/operatives, which auto-spawns it as a character in Shaddai World.' },
  { q: 'agents council 7 seven who roles agent', a: 'The 7: SHADDAI (THE SOURCE — orchestrator), ZEROX (markets/DeFi, The Agora), ORACLE (research + Esoteric Archive), NEXUS (routing/navigator + AURA), TURTLE (creative/art/NFTs, The Museum), QUILL (writing, The Library), PIKADON (security, The Aegis).' },
  { q: 'tools skills how many count', a: '200 real tools + 3,437 skills (100 executable recipes + 315 MD + 3,022 Obsidian). Agents call them via the tool loop and run_skill; each agent carries 20–50 domain tools.' },
  { q: 'aura token saver savings cache tokens', a: 'AURA is the token-saver: prompt/semantic caching + adaptive model routing. The Navigator AURA panel shows tokens/calls saved.' },
  { q: 'x402 payment hire pay cost money', a: 'x402 = pay-per-call micropayments. Hiring an agent or entering a paid portal debits the x402 ledger (off-chain credits now, Solana USDC later), 5% marketplace fee.' },
  { q: 'world move walk controls keys bike terrain', a: 'Controls: WASD move, mouse look, SHIFT run, B = Grid Bike, V = 3rd-person, ⚙ = terrain, click an agent for its dossier, E to enter a portal/district.' },
  { q: 'zerox markets price defi crypto trade agora', a: 'ZEROX runs The Agora — live prices, DeFi TVL/yields, whale tracking, DEX data.' },
  { q: 'oracle esoteric research natal numerology', a: 'ORACLE runs research + the Esoteric Archive (premium): natal charts, numerology, sacred geometry, deep research.' },
  { q: 'pikadon security audit aegis cve scan', a: 'PIKADON runs The Aegis — security audits, CVE lookups, URL/code vuln scans.' },
  { q: 'turtle art music nft museum gallery mint', a: 'TURTLE runs The Museum — generate/sell art & music, list and mint NFTs.' },
  { q: 'quill writing library notes files docs', a: 'QUILL runs The Library — input notes/files/info, then search and summarize them.' },
  { q: 'deploy render host live', a: 'SHADDAI runs on Render (Node + static). World + dashboard deploy together; preview runs locally on :8099.' },
];
router.get('/api/navigator/ask', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ answer: 'Ask me anything about Shaddai — the agents, the Forge, tools, x402, AURA, the world. e.g. "how do I forge an agent?"' });
  const STOP = new Set(['the','and','for','how','can','you','are','was','what','who','why','does','did','with','that','this','from','about','tell','show','give','any','all','its','his','her','our','your','their']);
  const words = q.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  let best = null, score = 0;
  // keyword (q) hits count double; answer-text hits are a light tiebreaker.
  KB.forEach(e => { const s = words.reduce((acc, w) => acc + (e.q.includes(w) ? 2 : 0) + (e.a.toLowerCase().includes(w) ? 0.25 : 0), 0); if (s > score) { score = s; best = e; } });
  res.json({ answer: best && score > 0 ? best.a : 'Not in my docs yet — try: the agents, the Forge, tools/skills, x402, AURA, world controls, or a specific agent.', matched: score > 0 });
});
router.get('/api/navigator/aura', (req, res) => {
  // Show the REAL token-saver (lib/aura: prompt cache + local compute), with the
  // tool-result cache (cache-analytics) folded in for the entries count.
  let s = {}; try { s = auraLib ? auraLib.stats() : {}; } catch (e) {}
  let tc = {}; try { tc = cache ? cache.getStats() : {}; } catch (e) {}
  const aura = {
    hits: s.hits || 0,
    misses: s.misses || 0,
    hitRate: s.hitRate || 0,
    tokensSaved: s.tokensSaved || 0,
    costSavedUsd: s.costSavedUsd || 0,
    byMethod: s.byMethod || {},
    entries: (tc.totalEntries || 0) + (s.hits || 0),
  };
  res.json({ ok: true, aura });
});

// ── PIKADON — The Aegis (security) ──
router.post('/api/aegis/scan', json, async (req, res) => {
  const target = String((req.body && req.body.target) || '').trim();
  if (!target) return res.status(400).json({ error: 'target required (URL, code, or CVE keyword)' });
  const result = {};
  // check_security takes { code }; audit whatever was pasted (code, snippet, or URL string).
  try { if (ae && ae.TOOLS && ae.TOOLS.check_security) result.security = await ae.TOOLS.check_security.execute({ code: target }); } catch (e) { result.security = 'error: ' + e.message; }
  // cve_lookup takes { query }: use the first token (package/keyword/CVE-id) for the vuln DB lookup.
  const cveQ = (target.match(/CVE-\d{4}-\d+/i) || [])[0] || target.split(/[\s/(){};=]+/).filter(Boolean)[0] || target;
  try { if (ae && ae.TOOLS && ae.TOOLS.cve_lookup) result.cve = String(await ae.TOOLS.cve_lookup.execute({ query: cveQ })).slice(0, 900); } catch (e) { result.cve = 'error: ' + e.message; }
  res.json({ ok: true, target, result });
});

// ── QUILL — The Library ──
const LIB = path.join(__dirname, 'data', 'library.json');
const readLib = () => { try { return JSON.parse(fs.readFileSync(LIB, 'utf8')); } catch (e) { return { notes: [] }; } };
const writeLib = (d) => { try { fs.writeFileSync(LIB, JSON.stringify(d, null, 2)); } catch (e) {} };
router.post('/api/library/note', json, (req, res) => {
  const { title, body, owner } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  const db = readLib();
  const note = { id: Date.now().toString(36), title: title || '(untitled)', body: String(body).slice(0, 20000), owner: owner || 'guest', at: Date.now() };
  db.notes.unshift(note); db.notes = db.notes.slice(0, 500); writeLib(db);
  res.json({ ok: true, note: { id: note.id, title: note.title }, total: db.notes.length });
});
router.get('/api/library/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase(); const db = readLib();
  const hits = q ? db.notes.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(q)) : db.notes.slice(0, 20);
  res.json({ ok: true, count: hits.length, notes: hits.slice(0, 30).map(n => ({ id: n.id, title: n.title, snippet: String(n.body).slice(0, 160), at: n.at })) });
});

// ── ORACLE — The Esoteric Archive (premium-gated) ──
const PREMIUM = ['builder', 'pro', 'alpha'];
router.post('/api/oracle/esoteric', json, (req, res) => {
  const { query, tier } = req.body || {};
  if (!PREMIUM.includes(String(tier || '').toLowerCase())) return res.status(402).json({ error: 'The Esoteric Archive is premium-gated. Upgrade to Builder / Pro / Alpha to enter.', gated: true });
  if (!query) return res.status(400).json({ error: 'query required' });
  let result = null;
  try {
    const m = ae.skillIndex.findSkills(query, { agent: 'ORACLE', limit: 1 });
    if (m.length) { const c = ae.skillIndex.loadSkillContent(m[0].id, { type: m[0].type }); result = { skill: m[0].id, content: String((c && (c.content || (c.skill && (c.skill.methodology || c.skill.description)))) || '').slice(0, 1800) }; }
  } catch (e) {}
  res.json({ ok: true, query, result: result || { content: 'No esoteric skill matched. Try: natal chart, numerology, sacred geometry, chakra, human design.' } });
});

// ════════ THE DIGITAL LIBRARY — books people can ADD & BORROW ════════
//   QUILL greets at the entrance (general stacks).
//   ORACLE seals the Esoteric Wing (premium-gated: Builder / Pro / Alpha).
//   Shares the same library.json store as QUILL's notes.
const readBooks = () => { const d = readLib(); if (!Array.isArray(d.books)) d.books = []; if (!Array.isArray(d.loans)) d.loans = []; if (!d.notes) d.notes = []; return d; };
const LOAN_MS = 14 * 24 * 60 * 60 * 1000; // 14-day loan
const isEso = (s) => String(s || 'general').toLowerCase() === 'esoteric';
const hasOracleAccess = (tier) => PREMIUM.includes(String(tier || '').toLowerCase());
const pubBook = (b) => ({ id: b.id, title: b.title, author: b.author, section: b.section || 'general', cover: b.cover || null, addedBy: b.addedBy, at: b.at, borrowed: !!b.borrowedBy, borrowedBy: b.borrowedBy || null, dueAt: b.dueAt || null });

// list books in a section — esoteric wing gated by ORACLE
router.get('/api/library/books', (req, res) => {
  const section = isEso(req.query.section) ? 'esoteric' : 'general';
  if (section === 'esoteric' && !hasOracleAccess(req.query.tier)) {
    return res.status(402).json({ error: 'The Esoteric Wing is sealed by ORACLE. Enter with Builder / Pro / Alpha.', gated: true, section: 'esoteric' });
  }
  const db = readBooks();
  const books = db.books.filter(b => (isEso(b.section) ? 'esoteric' : 'general') === section).map(pubBook);
  res.json({ ok: true, section, count: books.length, books });
});

// add a book to the stacks (esoteric requires ORACLE access)
router.post('/api/library/books', json, (req, res) => {
  const { title, author, section, cover, body, url, addedBy, tier } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const sec = isEso(section) ? 'esoteric' : 'general';
  if (sec === 'esoteric' && !hasOracleAccess(tier)) {
    return res.status(402).json({ error: 'Only ORACLE-bonded scholars (Builder / Pro / Alpha) may shelve esoteric works.', gated: true });
  }
  const db = readBooks();
  const book = { id: 'bk_' + Date.now().toString(36), title: String(title).slice(0, 200), author: String(author || 'Anonymous').slice(0, 120), section: sec, cover: cover || null, body: String(body || '').slice(0, 200000), url: url || null, addedBy: addedBy || 'guest', at: Date.now(), borrowedBy: null, dueAt: null };
  db.books.unshift(book); db.books = db.books.slice(0, 2000); writeLib(db);
  res.json({ ok: true, book: pubBook(book), total: db.books.length });
});

// read one book's content — esoteric gated
router.get('/api/library/book/:id', (req, res) => {
  const db = readBooks(); const book = db.books.find(b => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: 'book not found' });
  if (isEso(book.section) && !hasOracleAccess(req.query.tier)) {
    return res.status(402).json({ error: 'This esoteric work is sealed by ORACLE.', gated: true });
  }
  res.json({ ok: true, book: { ...pubBook(book), body: book.body || '', url: book.url || null } });
});

// borrow a book (14-day loan)
router.post('/api/library/borrow', json, (req, res) => {
  const { bookId, user } = req.body || {};
  if (!bookId || !user) return res.status(400).json({ error: 'bookId and user required' });
  const db = readBooks(); const book = db.books.find(b => b.id === bookId);
  if (!book) return res.status(404).json({ error: 'book not found' });
  if (book.borrowedBy && book.borrowedBy !== user) return res.status(409).json({ error: `Already borrowed by ${book.borrowedBy}`, dueAt: book.dueAt });
  book.borrowedBy = user; book.dueAt = Date.now() + LOAN_MS;
  db.loans.unshift({ bookId, user, at: Date.now(), dueAt: book.dueAt }); db.loans = db.loans.slice(0, 4000); writeLib(db);
  res.json({ ok: true, bookId, title: book.title, borrowedBy: user, dueAt: book.dueAt, dueDate: new Date(book.dueAt).toISOString().slice(0, 10) });
});

// return a book
router.post('/api/library/return', json, (req, res) => {
  const { bookId } = req.body || {};
  if (!bookId) return res.status(400).json({ error: 'bookId required' });
  const db = readBooks(); const book = db.books.find(b => b.id === bookId);
  if (!book) return res.status(404).json({ error: 'book not found' });
  const was = book.borrowedBy; book.borrowedBy = null; book.dueAt = null; writeLib(db);
  res.json({ ok: true, bookId, returnedFrom: was });
});

// my current loans
router.get('/api/library/loans', (req, res) => {
  const user = String(req.query.user || '').trim(); const db = readBooks();
  const mine = db.books.filter(b => b.borrowedBy && (!user || b.borrowedBy === user)).map(b => ({ id: b.id, title: b.title, borrowedBy: b.borrowedBy, dueAt: b.dueAt, dueDate: b.dueAt ? new Date(b.dueAt).toISOString().slice(0, 10) : null }));
  res.json({ ok: true, count: mine.length, loans: mine });
});

module.exports = router;

'use strict';
// Room Press: books and docs sold from the Academy subject rooms.
// Course books are compiled from skills; guides and co-created works are published by teachers (or house faculty, admin only).
// Buying uses Sparks through economy-service: authors 80% (split by share), 5% burned, house 15%.
const { hashOf, sha256, stripMarkup } = require('./canon');
const { hasSecret } = require('./secrets');
const { isSafeId, hasOwn } = require('./ids');
const { FACULTY } = require('./faculty');
const { ACADEMY_ECON } = require('./economy');

const ROOMS = new Set(FACULTY.map((f) => f.room));
const HOUSE_AGENTS = new Set(FACULTY.map((f) => f.agent));
const KINDS = ['course-book', 'guide', 'cocreated'];
const err = (error, extra) => Object.assign({ ok: false, error }, extra || {});

function compileBook(skill) {
  const L = skill.lesson;
  const out = ['# ' + skill.name, '', '*' + skill.summary + '*', '', 'Track: ' + skill.track + '  |  Tier: ' + skill.tier + '  |  Version ' + skill.version, '', '## Lesson', '', L.prompt_template, ''];
  if (L.tool_strategy.length) {
    out.push('## Tool strategy', '');
    for (const t of L.tool_strategy) out.push('- **' + t.tool + '**: use it when ' + t.when + '. How: ' + t.how);
    out.push('');
  }
  if (L.examples.length) { out.push('## Worked examples', ''); L.examples.forEach((e, i) => out.push((i + 1) + '. ' + e)); out.push(''); }
  if (L.checklist.length) { out.push('## Checklist', ''); for (const c of L.checklist) out.push('- [ ] ' + c); out.push(''); }
  if (skill.homework) out.push('## Homework', '', skill.homework.brief, '');
  return out.join('\n');
}

function createPress({ store, economy, roles, econ = ACADEMY_ECON, now = Date.now }) {
  const load = () => store.read('press', { titles: {}, entitlements: {}, trusted: {} });
  const own = (o, k) => (isSafeId(k) && hasOwn(o, k) ? o[k] : null);
  const normBody = (b) => b.toLowerCase().replace(/\s+/g, ' ').trim();
  const summary = (t) => ({ id: t.id, room: t.room, title: t.title, kind: t.kind, price_sparks: t.price_sparks, authors: t.authors, status: t.status, version: t.version, createdAt: t.createdAt });

  // Shared content rules for every way a title can be created.
  function checkContent({ title, kind, body, price_sparks }) {
    if (!KINDS.includes(kind)) return err('kind must be one of ' + KINDS.join(','));
    const t = stripMarkup(title).slice(0, 120);
    if (t.length < 3) return err('title needs at least 3 characters');
    if (typeof body !== 'string') return err('body required');
    const clean = stripMarkup(body);
    if (clean.length < 50) return err('body is too short (min 50 characters)');
    if (clean.length > 200000) return err('body is too long (max 200000 characters)');
    if (hasSecret(clean) || hasSecret(t)) return err('body looks like it contains a secret');
    if (!Number.isInteger(price_sparks) || price_sparks < 0 || price_sparks > 5000) return err('price_sparks must be an integer 0..5000');
    return { ok: true, t, clean };
  }

  // Internal only (never wired to a request body): a house faculty book, approved at once, into that agent's own room.
  // Repeating the same body is a no-op, so seeding twice changes nothing.
  function publishHouse({ agent, title, kind, body, price_sparks }) {
    const f = FACULTY.find((x) => x.agent === agent);
    if (!f) return err('unknown house agent');
    const c = checkContent({ title, kind, body, price_sparks });
    if (!c.ok) return c;
    const d = load();
    const bodyHash = sha256(normBody(c.clean));
    const dupe = Object.values(d.titles).find((x) => x.bodyHash === bodyHash);
    if (dupe) return { ok: true, created: false, title: summary(dupe) };
    const id = 'bk_' + hashOf({ t: c.t, bodyHash, agent }).slice(0, 12);
    d.titles[id] = { id, room: f.room, title: c.t, kind, price_sparks, authors: [{ type: 'house', id: agent, share: 100 }], status: 'approved', bodyHash, body: c.clean, by: 'house:' + agent, version: 1, createdAt: now() };
    store.write('press', d);
    return { ok: true, created: true, title: summary(d.titles[id]) };
  }

  function publish({ by, room, title, kind, body, price_sparks, authors }) {
    if (!isSafeId(by)) return err('sign in first');
    const admin = roles.rolesOf(by).includes('admin');
    if (!admin && !roles.can(by, 'skill.publish')) return err('teacher role required to publish');
    if (!ROOMS.has(room)) return err('invalid room');
    const c = checkContent({ title, kind, body, price_sparks });
    if (!c.ok) return c;
    const { t, clean } = c;
    if (!Array.isArray(authors) || authors.length < 1 || authors.length > 5) return err('1 to 5 authors required');
    const seen = new Set(); let total = 0;
    for (const a of authors) {
      if (!a || !Number.isInteger(a.share) || a.share <= 0) return err('every author needs a positive integer share');
      if (a.type === 'owner' ? !isSafeId(a.id) : !(a.type === 'house' && HOUSE_AGENTS.has(a.id))) return err('invalid author');
      const k = a.type + ':' + a.id;
      if (seen.has(k)) return err('duplicate author');
      seen.add(k); total += a.share;
    }
    if (total !== 100) return err('author shares must total 100');
    if (!admin && authors.some((a) => a.type === 'house')) return err('house faculty works are admin only');
    if (!admin && !authors.some((a) => a.type === 'owner' && a.id === by)) return err('you must be one of the authors');

    const d = load();
    const bodyHash = sha256(normBody(clean));
    if (Object.values(d.titles).some((x) => x.bodyHash === bodyHash)) return err('duplicate of an existing title');
    const status = admin || d.trusted[by] === true ? 'approved' : 'pending';
    const id = 'bk_' + hashOf({ t, bodyHash, by, at: now(), n: Object.keys(d.titles).length }).slice(0, 12);
    d.titles[id] = { id, room, title: t, kind, price_sparks, authors: authors.map((a) => ({ type: a.type, id: a.id, share: a.share })), status, bodyHash, body: clean, by, version: 1, createdAt: now() };
    store.write('press', d);
    return { ok: true, title: summary(d.titles[id]) };
  }

  function approve({ by, titleId, approve: yes }) {
    if (!isSafeId(by) || !roles.rolesOf(by).includes('admin')) return err('admin only');
    const d = load(); const t = own(d.titles, titleId);
    if (!t) return err('unknown title');
    if (t.status !== 'pending') return err('title is not pending');
    t.status = yes ? 'approved' : 'rejected';
    if (yes) for (const a of t.authors) if (a.type === 'owner') d.trusted[a.id] = true;
    store.write('press', d);
    return { ok: true, title: summary(t) };
  }

  const list = (f) => Object.values(load().titles).filter((t) => t.status === 'approved' && (!f || !f.room || t.room === f.room)).map(summary);
  const pending = () => Object.values(load().titles).filter((t) => t.status === 'pending').map(summary);
  const get = (titleId) => { const t = own(load().titles, titleId); return t ? summary(t) : null; };

  async function buy({ ownerId, titleId }) {
    if (!isSafeId(ownerId)) return err('sign in first');
    const d = load(); const t = own(d.titles, titleId);
    if (!t || t.status !== 'approved') return err('unknown title');
    const key = 'press:buy:' + ownerId + ':' + t.id;
    if (t.price_sparks > 0) {
      try { await economy.spend(ownerId, t.price_sparks, 'press.buy:' + t.id, key, { refId: t.id }); }
      catch (e) { return err((e && e.message) || 'payment failed', { insufficient: !!(e && e.constructor && e.constructor.name === 'InsufficientFundsError') }); }
      const pool = Math.floor(t.price_sparks * econ.teacher);
      const burn = Math.floor(t.price_sparks * econ.burn);
      const houseCut = t.price_sparks - pool - burn;
      const amounts = t.authors.map((a) => Math.floor((pool * a.share) / 100));
      amounts[0] += pool - amounts.reduce((s, x) => s + x, 0);        // rounding remainder goes to the first author
      for (let i = 0; i < t.authors.length; i++) {
        if (amounts[i] <= 0) continue;
        const a = t.authors[i];
        const account = a.type === 'house' ? econ.scholarshipAccount : a.id;
        await economy.grant(account, amounts[i], 'press.author:' + t.id, 'press:pay:' + ownerId + ':' + t.id + ':' + i, { refId: t.id });
      }
      if (houseCut > 0) await economy.grant(econ.houseAccount, houseCut, 'press.house:' + t.id, 'press:pay:' + ownerId + ':' + t.id + ':house', { refId: t.id });
    }
    const fresh = load(); const ek = ownerId + '|' + t.id;
    if (!hasOwn(fresh.entitlements, ek)) { fresh.entitlements[ek] = { ownerId, titleId: t.id, version: t.version, at: now() }; store.write('press', fresh); }
    return { ok: true, entitlement: fresh.entitlements[ek] };
  }

  function read({ ownerId, titleId }) {
    if (!isSafeId(ownerId)) return err('sign in first');
    const d = load(); const t = own(d.titles, titleId);
    if (!t) return err('unknown title');
    const entitled = hasOwn(d.entitlements, ownerId + '|' + t.id);
    const isAuthor = t.authors.some((a) => a.type === 'owner' && a.id === ownerId);
    if (!entitled && !isAuthor) return err('you do not own this title');
    return { ok: true, title: summary(t), body: t.body };
  }

  return { publish, publishHouse, approve, list, pending, get, buy, read };
}

module.exports = { createPress, compileBook, ROOMS, KINDS };

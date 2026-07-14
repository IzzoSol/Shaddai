/* ══════════════════════════════════════════════════════════════════
   tools-security.js — REAL defensive security tools (PIKADON cluster).

   Executors use Node built-ins (dns, tls, crypto, net) + keyless HTTP
   (RDAP whois, HaveIBeenPwned k-anonymity, ip-api). All DEFENSIVE:
   posture checks, cert/DNS/header inspection, password hygiene. No
   offensive scanning. Errors returned as JSON strings, never thrown.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const dns = require('dns').promises;
const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const { assertPublicUrl, assertPublicHost } = require('./lib/ssrf-guard');  // SSRF protection

const ok = (o) => JSON.stringify(o);
const err = (e) => JSON.stringify({ error: (e && e.message) || String(e) });
async function getJson(url, opts) { const r = await fetch(url, opts || {}); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
function cleanHost(s) { return String(s || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, ''); }

const TOOLS_SECURITY = {

  ssl_check: {
    name: 'ssl_check',
    description: 'Inspect a site’s TLS certificate — issuer, validity dates, days until expiry.',
    schema: { host: 'string — domain e.g. example.com' },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ host }) {
      const h = cleanHost(host);
      if (!h) return err('host required');
      try { await assertPublicHost(h); } catch (e) { return err(e); }   // SSRF guard
      return new Promise((resolve) => {
        const s = tls.connect(443, h, { servername: h, timeout: 8000 }, () => {
          const c = s.getPeerCertificate();
          s.end();
          if (!c || !c.valid_to) return resolve(err('no certificate'));
          const daysLeft = Math.round((new Date(c.valid_to) - Date.now()) / 864e5);
          resolve(ok({ host: h, cn: c.subject && c.subject.CN, issuer: c.issuer && (c.issuer.O || c.issuer.CN), validFrom: c.valid_from, validTo: c.valid_to, daysLeft, expired: daysLeft < 0 }));
        });
        s.on('error', (e) => resolve(err(e)));
        s.on('timeout', () => { s.destroy(); resolve(err('connection timeout')); });
      });
    },
  },

  dns_lookup: {
    name: 'dns_lookup',
    description: 'Resolve DNS records for a domain (A, AAAA, MX, NS, TXT).',
    schema: { host: 'string — domain', type: 'string — A|AAAA|MX|NS|TXT|CNAME (default A)' },
    agents: ['PIKADON', 'NEXUS', 'ORACLE'],
    async execute({ host, type = 'A' }) {
      const h = cleanHost(host);
      if (!h) return err('host required');
      try {
        const t = String(type).toUpperCase();
        const recs = await dns.resolve(h, t);
        return ok({ host: h, type: t, records: recs });
      } catch (e) { return err(e); }
    },
  },

  rdap_whois: {
    name: 'rdap_whois',
    description: 'Domain registration info via RDAP (modern whois) — registrar, dates, status. Keyless.',
    schema: { domain: 'string — e.g. example.com' },
    agents: ['PIKADON', 'ORACLE'],
    async execute({ domain }) {
      const d = cleanHost(domain);
      if (!d) return err('domain required');
      try {
        const j = await getJson('https://rdap.org/domain/' + encodeURIComponent(d));
        const events = {};
        (j.events || []).forEach((e) => { events[e.eventAction] = e.eventDate; });
        const registrar = (j.entities || []).find((e) => (e.roles || []).includes('registrar'));
        return ok({ domain: d, handle: j.handle, status: j.status, registered: events.registration, expires: events.expiration, lastChanged: events['last changed'], registrar: registrar && registrar.handle });
      } catch (e) { return err(e); }
    },
  },

  http_headers: {
    name: 'http_headers',
    description: 'Fetch a URL and return its HTTP response headers + status.',
    schema: { url: 'string — full URL' },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ url }) {
      if (!url) return err('url required');
      try {
        const u = await assertPublicUrl(url);   // SSRF guard
        const r = await fetch(u, { method: 'GET', redirect: 'manual' });
        const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
        return ok({ url: u, status: r.status, server: h.server, headers: h });
      } catch (e) { return err(e); }
    },
  },

  security_headers: {
    name: 'security_headers',
    description: 'Grade a site’s security headers (HSTS, CSP, X-Frame-Options, etc.) A–F.',
    schema: { url: 'string — full URL or domain' },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ url }) {
      if (!url) return err('url required');
      try {
        const u = await assertPublicUrl(url);   // SSRF guard
        const r = await fetch(u, { method: 'GET', redirect: 'follow' });
        const h = {}; r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
        const checks = {
          'strict-transport-security': !!h['strict-transport-security'],
          'content-security-policy': !!h['content-security-policy'],
          'x-frame-options': !!h['x-frame-options'],
          'x-content-type-options': !!h['x-content-type-options'],
          'referrer-policy': !!h['referrer-policy'],
          'permissions-policy': !!h['permissions-policy'],
        };
        const passed = Object.values(checks).filter(Boolean).length;
        const grade = ['F', 'F', 'E', 'D', 'C', 'B', 'A'][passed] || 'F';
        return ok({ url: u, grade, passed: passed + '/6', checks, missing: Object.keys(checks).filter((k) => !checks[k]) });
      } catch (e) { return err(e); }
    },
  },

  password_strength: {
    name: 'password_strength',
    description: 'Estimate password strength (entropy bits + rating + suggestions). Computed locally, never sent anywhere.',
    schema: { password: 'string — the password to evaluate' },
    agents: ['PIKADON'],
    async execute({ password }) {
      const p = String(password || '');
      if (!p) return err('password required');
      let pool = 0;
      if (/[a-z]/.test(p)) pool += 26;
      if (/[A-Z]/.test(p)) pool += 26;
      if (/[0-9]/.test(p)) pool += 10;
      if (/[^a-zA-Z0-9]/.test(p)) pool += 33;
      const entropy = Math.round(p.length * Math.log2(pool || 1));
      const rating = entropy < 40 ? 'weak' : entropy < 60 ? 'fair' : entropy < 80 ? 'strong' : 'very strong';
      const tips = [];
      if (p.length < 12) tips.push('use 12+ characters');
      if (!/[A-Z]/.test(p) || !/[a-z]/.test(p)) tips.push('mix upper & lower case');
      if (!/[0-9]/.test(p)) tips.push('add numbers');
      if (!/[^a-zA-Z0-9]/.test(p)) tips.push('add symbols');
      return ok({ length: p.length, entropyBits: entropy, rating, suggestions: tips });
    },
  },

  password_pwned: {
    name: 'password_pwned',
    description: 'Check if a password appears in known breaches via HaveIBeenPwned k-anonymity (only a hash prefix leaves your machine). Keyless.',
    schema: { password: 'string — the password to check' },
    agents: ['PIKADON'],
    async execute({ password }) {
      const p = String(password || '');
      if (!p) return err('password required');
      try {
        const sha1 = crypto.createHash('sha1').update(p).digest('hex').toUpperCase();
        const prefix = sha1.slice(0, 5), suffix = sha1.slice(5);
        const r = await fetch('https://api.pwnedpasswords.com/range/' + prefix);
        const text = await r.text();
        const line = text.split('\n').find((l) => l.split(':')[0] === suffix);
        const count = line ? parseInt(line.split(':')[1], 10) : 0;
        return ok({ pwned: count > 0, timesSeen: count, advice: count > 0 ? 'This password is in breaches — do NOT use it.' : 'Not found in known breaches.' });
      } catch (e) { return err(e); }
    },
  },

  email_dns_check: {
    name: 'email_dns_check',
    description: 'Check a domain’s email security posture — MX, SPF, DMARC records.',
    schema: { domain: 'string — domain part of an email' },
    agents: ['PIKADON', 'ORACLE'],
    async execute({ domain }) {
      const d = cleanHost(domain);
      if (!d) return err('domain required');
      const out = { domain: d };
      try { out.mx = (await dns.resolveMx(d)).map((m) => m.exchange); } catch (_) { out.mx = []; }
      try { const txt = (await dns.resolveTxt(d)).map((a) => a.join('')); out.spf = txt.find((t) => /^v=spf1/i.test(t)) || null; } catch (_) { out.spf = null; }
      try { const dm = (await dns.resolveTxt('_dmarc.' + d)).map((a) => a.join('')); out.dmarc = dm.find((t) => /^v=DMARC1/i.test(t)) || null; } catch (_) { out.dmarc = null; }
      out.grade = (out.mx.length ? 1 : 0) + (out.spf ? 1 : 0) + (out.dmarc ? 1 : 0);
      return ok(out);
    },
  },

  ip_info: {
    name: 'ip_info',
    description: 'Geolocation + network/ISP info for an IP address. Keyless.',
    schema: { ip: 'string — IPv4/IPv6 address' },
    agents: ['PIKADON', 'ORACLE', 'NEXUS'],
    async execute({ ip }) {
      const q = String(ip || '').trim();
      if (!q) return err('ip required');
      try {
        const j = await getJson('http://ip-api.com/json/' + encodeURIComponent(q) + '?fields=status,country,regionName,city,isp,org,as,reverse,proxy,hosting,query');
        if (j.status !== 'success') return err(j.message || 'lookup failed');
        return ok({ ip: j.query, country: j.country, region: j.regionName, city: j.city, isp: j.isp, org: j.org, asn: j.as, reverse: j.reverse, proxy: j.proxy, hosting: j.hosting });
      } catch (e) { return err(e); }
    },
  },

  jwt_decode: {
    name: 'jwt_decode',
    description: 'Decode a JWT (header + payload) WITHOUT verifying — inspect claims, exp, alg. Local only.',
    schema: { token: 'string — a JWT' },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ token }) {
      const t = String(token || '').trim();
      const parts = t.split('.');
      if (parts.length < 2) return err('not a JWT (need header.payload.signature)');
      try {
        const dec = (b) => JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        const header = dec(parts[0]), payload = dec(parts[1]);
        const out = { header, payload, warnings: [] };
        if (header.alg === 'none') out.warnings.push('alg=none — unsigned token!');
        if (payload.exp) { out.expiresAt = new Date(payload.exp * 1000).toISOString(); if (payload.exp * 1000 < Date.now()) out.warnings.push('token expired'); }
        return ok(out);
      } catch (e) { return err('decode failed: ' + e.message); }
    },
  },

  hash_text: {
    name: 'hash_text',
    description: 'Compute cryptographic hashes (md5, sha1, sha256, sha512) of input text.',
    schema: { text: 'string — input to hash', algo: 'string — md5|sha1|sha256|sha512 (default sha256)' },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ text, algo = 'sha256' }) {
      const t = String(text == null ? '' : text);
      try {
        const a = String(algo).toLowerCase();
        if (!['md5', 'sha1', 'sha256', 'sha512'].includes(a)) return err('unsupported algo');
        return ok({ algo: a, hash: crypto.createHash(a).update(t).digest('hex') });
      } catch (e) { return err(e); }
    },
  },

  tcp_port_check: {
    name: 'tcp_port_check',
    description: 'Check whether a single TCP port is OPEN on a host you control (defensive availability check).',
    schema: { host: 'string — domain/IP', port: 'number — port to test' },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ host, port }) {
      const h = cleanHost(host); const p = Number(port);
      if (!h || !p) return err('host and port required');
      try { await assertPublicHost(h); } catch (e) { return err(e); }   // SSRF guard
      return new Promise((resolve) => {
        const sock = new net.Socket(); let done = false;
        const finish = (open, note) => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} resolve(ok({ host: h, port: p, open, note })); };
        sock.setTimeout(6000);
        sock.once('connect', () => finish(true, 'port reachable'));
        sock.once('timeout', () => finish(false, 'timed out (filtered/closed)'));
        sock.once('error', (e) => finish(false, e.code || 'unreachable'));
        sock.connect(p, h);
      });
    },
  },

  url_safety: {
    name: 'url_safety',
    description: 'Heuristic phishing/safety check on a URL (suspicious patterns, punycode, IP host, TLD, redirects).',
    schema: { url: 'string — URL to inspect' },
    agents: ['PIKADON', 'ORACLE'],
    async execute({ url }) {
      const u = String(url || '').trim();
      if (!u) return err('url required');
      const flags = [];
      try {
        const parsed = new URL(/^https?:\/\//.test(u) ? u : 'http://' + u);
        if (parsed.protocol !== 'https:') flags.push('not https');
        if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) flags.push('IP address host');
        if (/xn--/.test(parsed.hostname)) flags.push('punycode (possible homograph)');
        if ((parsed.hostname.match(/-/g) || []).length >= 3) flags.push('many hyphens');
        if (parsed.hostname.split('.').length >= 5) flags.push('deep subdomain');
        if (/(login|verify|account|secure|update|wallet|seed|airdrop|claim)/i.test(parsed.hostname)) flags.push('sensitive keyword in host');
        if (/\.(zip|mov|tk|ml|ga|cf|gq)$/i.test(parsed.hostname)) flags.push('risky TLD');
        if (parsed.username || parsed.password) flags.push('embedded credentials');
        const risk = flags.length === 0 ? 'low' : flags.length <= 2 ? 'medium' : 'high';
        return ok({ url: u, host: parsed.hostname, risk, flags });
      } catch (e) { return err('invalid URL: ' + e.message); }
    },
  },

  breach_list: {
    name: 'breach_list',
    description: 'Look up a known data breach by name from HaveIBeenPwned’s public breach database. Keyless.',
    schema: { name: 'string — breach/company name e.g. Adobe, LinkedIn' },
    agents: ['PIKADON', 'ORACLE'],
    async execute({ name }) {
      const q = String(name || '').trim().toLowerCase();
      if (!q) return err('name required');
      try {
        const all = await getJson('https://haveibeenpwned.com/api/v3/breaches');
        const hits = all.filter((b) => (b.Name || '').toLowerCase().includes(q) || (b.Title || '').toLowerCase().includes(q))
          .slice(0, 5).map((b) => ({ name: b.Title, domain: b.Domain, date: b.BreachDate, accounts: b.PwnCount, data: b.DataClasses }));
        return ok({ query: q, matches: hits });
      } catch (e) { return err(e); }
    },
  },

};

module.exports = { TOOLS_SECURITY };

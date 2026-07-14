/* ══════════════════════════════════════════════════════════════════
   ssrf-guard.js — block Server-Side Request Forgery.
   Any tool that fetches/connects to a USER-supplied host/URL must pass
   the target through here first. Rejects loopback, private, link-local
   (incl. 169.254.169.254 cloud-metadata), CGNAT, and internal TLDs —
   and resolves hostnames so a public name pointing at a private IP is
   also blocked.
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const dns = require('dns').promises;
const net = require('net');

function ipIsPrivate(ip) {
  if (net.isIPv4(ip)) {
    const o = ip.split('.').map(Number);
    return o[0] === 0 || o[0] === 10 || o[0] === 127 ||
      (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
      (o[0] === 192 && o[1] === 168) ||
      (o[0] === 169 && o[1] === 254) ||           // link-local + cloud metadata (169.254.169.254)
      (o[0] === 100 && o[1] >= 64 && o[1] <= 127) || // CGNAT
      o[0] >= 224;                                 // multicast / reserved
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') ||
      l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') ||
      l.startsWith('::ffff:169.254') || l.startsWith('::ffff:192.168') || l.startsWith('::ffff:172.');
  }
  return false;
}

function hostIsBlockedLiteral(host) {
  const h = String(host || '').toLowerCase().trim();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') ||
      h.endsWith('.local') || h.endsWith('.lan') || h === 'metadata.google.internal') return true;
  if (net.isIP(h) && ipIsPrivate(h)) return true;
  return false;
}

// Throws if the host is private/loopback/internal, or (for hostnames) resolves to one.
async function assertPublicHost(host) {
  const h = String(host || '').replace(/^https?:\/\//, '').replace(/[\/:].*$/, '').trim();
  if (!h) throw new Error('host required');
  if (hostIsBlockedLiteral(h)) throw new Error('blocked: private/loopback/internal host not allowed');
  if (!net.isIP(h)) {
    let addrs;
    try { addrs = await dns.lookup(h, { all: true }); }
    catch (e) { throw new Error('cannot resolve host'); }
    for (const a of addrs) if (ipIsPrivate(a.address)) throw new Error('blocked: host resolves to a private IP');
  }
  return h;
}

// Validate + normalize a user URL for fetching. Only http/https, public host.
async function assertPublicUrl(url) {
  let u;
  try { u = new URL(/^https?:\/\//.test(url) ? url : 'https://' + url); }
  catch (e) { throw new Error('invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http/https URLs allowed');
  await assertPublicHost(u.hostname);
  return u.toString();
}

module.exports = { assertPublicHost, assertPublicUrl, ipIsPrivate, hostIsBlockedLiteral };

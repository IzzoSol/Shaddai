'use strict';
// Custom-endpoint safety (manual 7.3): HTTPS only (prod), no credentials in URL, resolve DNS server-side, block private /
// loopback / link-local / metadata ranges, pin the validated IP, port allowlist. Redirects are refused by the caller (redirect:'error').
const dns = require('dns').promises;
const net = require('net');

function ipv4ToInt(ip) { return ip.split('.').reduce((a, o) => (a << 8) + (+o), 0) >>> 0; }
const V4_BLOCKS = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]];
function blockedV4(ip) {
  const n = ipv4ToInt(ip);
  return V4_BLOCKS.some(([b, bits]) => { const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return (n & mask) === (ipv4ToInt(b) & mask); });
}
function blockedV6(ip) {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true;   // fe80::/10
  if (s.startsWith('fc') || s.startsWith('fd')) return true;                                                    // fc00::/7
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);                                                          // v4-mapped
  return m ? blockedV4(m[1]) : false;
}
function blockedIp(ip) { return net.isIPv4(ip) ? blockedV4(ip) : net.isIPv6(ip) ? blockedV6(ip) : true; }

async function validateEndpoint(urlStr, { production = true, ports = [443], resolve } = {}) {
  let u;
  try { u = new URL(urlStr); } catch (_) { return { ok: false, code: 'bad_url' }; }
  if (u.username || u.password) return { ok: false, code: 'credentials_in_url' };
  if (production && u.protocol !== 'https:') return { ok: false, code: 'https_required' };
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, code: 'bad_scheme' };
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  if (!ports.includes(port)) return { ok: false, code: 'port_not_allowed' };
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(host)) addrs = [host];
  else {
    try { addrs = resolve ? await resolve(host) : (await dns.lookup(host, { all: true })).map(a => a.address); }
    catch (_) { return { ok: false, code: 'dns_failed' }; }
  }
  if (!addrs.length) return { ok: false, code: 'dns_failed' };
  if (addrs.some(blockedIp)) return { ok: false, code: 'blocked_address' };
  return { ok: true, pinnedIp: addrs[0], host, port };   // caller connects to pinnedIp and re-validates every request
}
module.exports = { validateEndpoint, blockedIp };

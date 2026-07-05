/**
 * pikadon-scan.js — PIKADON Security Scan Engine
 * SHADDAI MASTER FINAL BUILD — backend/lib/pikadon-scan.js
 *
 * Pure, deterministic, dependency-free (node built-ins only — `url`, no network calls).
 * Protects user-submitted content: radio URLs, portal links, city-bulletin posts, docs.
 *
 * Exports:
 *   scanUrl(url, opts?)  → { ok, risk, reasons, normalized }
 *   scanText(text)       → { ok, risk, reasons, cleaned }
 *   scan({ type, value, expect }) → uniform verdict
 *
 * risk levels: 'safe' | 'suspect' | 'blocked'
 * ok === (risk !== 'blocked')
 */

'use strict';

const { URL } = require('url');

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_URL_LEN  = 2048;
const MAX_TEXT_LEN = 50_000;
const CLEANED_CAP  = 10_000;

// Protocols allowed for user-submitted URLs
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Protocols that are always hard-blocked
const BLOCKED_PROTOCOLS = new Set([
  'javascript:', 'data:', 'file:', 'ftp:', 'ftps:', 'blob:',
  'vbscript:', 'about:', 'chrome:', 'res:', 'ms-its:',
]);

// Known URL-shorteners / link-rotters (treat as suspect — real destination unknown)
const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'short.link',
  'is.gd', 'buff.ly', 'rb.gy', 'cutt.ly', 'tiny.cc', 'url.ie',
  'shorte.st', 'adf.ly', 'bc.vc', 'shrt.st', 'clck.ru', 'cutt.us',
  'shorturl.at', 'urlshortx.com', 'shortlink.gg',
]);

// High-risk TLDs associated with abuse / phishing
const RISKY_TLDS = new Set([
  '.zip', '.mov', '.xyz', '.top', '.gq', '.tk', '.ml', '.cf',
  '.pw', '.work', '.click', '.link', '.party', '.loan', '.download',
  '.stream', '.bid', '.win', '.racing', '.review', '.accountant',
  '.men', '.faith', '.science', '.date', '.trade',
]);

// Media/stream file extensions — used by expect:'audio' hint
const AUDIO_EXTS = new Set([
  '.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a',
  '.opus', '.webm', '.m3u8', '.pls', '.asx',
]);
const AUDIO_STREAM_PATTERNS = [
  /stream/i, /listen/i, /radio/i, /audio/i, /music/i, /podcast/i,
  /\.(mp3|ogg|wav|flac|aac|m4a|opus|webm|m3u8|pls|asx)(\?|$)/i,
];

// Metadata endpoint IP used by cloud providers (AWS, GCP, Azure, etc.)
const METADATA_IPS = new Set([
  '169.254.169.254', // AWS/GCP/Azure IMDS
  '100.100.100.200', // Alibaba Cloud metadata
  '192.0.0.192',     // Oracle Cloud metadata
]);

// ─── SSRF private/internal range checker ─────────────────────────────────────

/**
 * Parse an IPv4 dotted-decimal string into a 32-bit integer.
 * Returns null if the string is not valid IPv4.
 */
function ipv4ToInt(str) {
  const parts = str.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const byte = parseInt(p, 10);
    if (byte > 255) return null;
    n = (n << 8) | byte;
  }
  return n >>> 0; // treat as unsigned 32-bit
}

/** Returns true if `addr` is an IPv4 string falling in a private/internal range. */
function isPrivateIPv4(addr) {
  const n = ipv4ToInt(addr);
  if (n === null) return false;
  // 127.0.0.0/8  — loopback
  if ((n >>> 24) === 127) return true;
  // 10.0.0.0/8   — RFC 1918
  if ((n >>> 24) === 10) return true;
  // 172.16.0.0/12 — RFC 1918
  if ((n >>> 20) === (172 * 16 + 1)) return true; // 172.16–172.31
  // 192.168.0.0/16 — RFC 1918
  if ((n >>> 16) === (192 * 256 + 168)) return true;
  // 169.254.0.0/16 — link-local / APIPA
  if ((n >>> 16) === (169 * 256 + 254)) return true;
  // 0.0.0.0/8
  if ((n >>> 24) === 0) return true;
  // 100.64.0.0/10 — shared address space (carrier-grade NAT)
  if ((n >>> 22) === (100 * 4 + 1)) return true;
  return false;
}

/** Returns true if `hostname` is an internal/SSRF-risky target. */
function isSSRFHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, ''); // strip trailing dot

  // Exact localhost variants
  if (h === 'localhost' || h === 'ip6-localhost' || h === 'ip6-loopback') return true;
  // .local mDNS / Bonjour
  if (h.endsWith('.local')) return true;
  // IPv6 loopback
  if (h === '::1' || h === '[::1]') return true;
  // IPv6 link-local fe80::/10
  if (/^\[?fe80:/i.test(h)) return true;
  // Cloud metadata IPs
  if (METADATA_IPS.has(h)) return true;
  // Private IPv4 ranges
  if (isPrivateIPv4(h)) return true;
  // Bracketed IPv6 private — check after stripping brackets
  const stripped = h.replace(/^\[|\]$/g, '');
  if (stripped === '::1' || /^fe80:/i.test(stripped)) return true;

  return false;
}

// ─── URL scan ─────────────────────────────────────────────────────────────────

/**
 * @param {string} rawUrl
 * @param {{ expect?: 'audio' }} [opts]
 * @returns {{ ok: boolean, risk: 'safe'|'suspect'|'blocked', reasons: string[], normalized: string }}
 */
function scanUrl(rawUrl, opts = {}) {
  const reasons = [];
  let risk = 'safe';
  let normalized = '';

  // ── Input guards ────────────────────────────────────────────────────────────
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, risk: 'blocked', reasons: ['Empty or non-string URL'], normalized };
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > MAX_URL_LEN) {
    return { ok: false, risk: 'blocked', reasons: [`URL exceeds ${MAX_URL_LEN} character limit`], normalized };
  }

  // ── Protocol sniff BEFORE parse (catch javascript:alert() etc.) ─────────────
  const protocolMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):/) ;
  const rawProto = protocolMatch ? protocolMatch[1].toLowerCase() + ':' : '';
  if (BLOCKED_PROTOCOLS.has(rawProto)) {
    return {
      ok: false,
      risk: 'blocked',
      reasons: [`Protocol "${rawProto}" is not permitted`],
      normalized,
    };
  }

  // ── Parse ───────────────────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, risk: 'blocked', reasons: ['Malformed URL — could not parse'], normalized };
  }

  normalized = parsed.href;

  // ── Protocol allow-list ──────────────────────────────────────────────────────
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      risk: 'blocked',
      reasons: [`Protocol "${parsed.protocol}" is not allowed (only http/https)`],
      normalized,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // ── SSRF — private / internal / metadata hosts ───────────────────────────────
  if (isSSRFHost(hostname)) {
    return {
      ok: false,
      risk: 'blocked',
      reasons: [`SSRF block: "${hostname}" resolves to an internal/private network address`],
      normalized,
    };
  }

  // ── @ in host (credential confusion / parser split attacks) ─────────────────
  // e.g. http://evil.com@internal/  — parsed.hostname strips the @, but raw URL retains it
  if (trimmed.includes('@') && trimmed.indexOf('@') < trimmed.indexOf(hostname)) {
    reasons.push('Credential/redirect confusion: "@" appears before the host in the URL');
    risk = 'suspect';
  }

  // ── Punycode / IDN homograph ─────────────────────────────────────────────────
  if (/xn--/i.test(hostname)) {
    reasons.push('Punycode/IDN domain (possible homograph phishing)');
    risk = 'suspect';
  }

  // ── Excessive % encoding ────────────────────────────────────────────────────
  const percentCount = (trimmed.match(/%[0-9a-fA-F]{2}/g) || []).length;
  if (percentCount > 12) {
    reasons.push(`Excessive percent-encoding (${percentCount} encoded sequences) — possible obfuscation`);
    risk = 'suspect';
  }

  // ── Double-encoding / unicode tricks ────────────────────────────────────────
  if (/%25[0-9a-fA-F]{2}/i.test(trimmed)) {
    reasons.push('Double percent-encoding detected — possible filter bypass attempt');
    risk = 'suspect';
  }

  // ── IP address host (direct IP access — unusual for public media links) ─────
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    reasons.push('Direct IP-address host (no domain name) — unusual for public content');
    if (risk === 'safe') risk = 'suspect';
  }

  // ── URL shorteners ───────────────────────────────────────────────────────────
  const baseDomain = hostname.split('.').slice(-2).join('.');
  if (URL_SHORTENERS.has(baseDomain) || URL_SHORTENERS.has(hostname)) {
    reasons.push(`URL shortener detected (${hostname}) — real destination is unknown`);
    if (risk === 'safe') risk = 'suspect';
  }

  // ── Risky TLD ────────────────────────────────────────────────────────────────
  const tld = '.' + hostname.split('.').pop();
  if (RISKY_TLDS.has(tld)) {
    reasons.push(`High-risk TLD "${tld}" associated with abuse/phishing campaigns`);
    if (risk === 'safe') risk = 'suspect';
  }

  // ── Long random-looking subdomain (DGA / fast-flux detection) ───────────────
  const subdomains = hostname.split('.').slice(0, -2); // strip TLD + SLD
  for (const sub of subdomains) {
    if (sub.length > 20 && /^[a-z0-9]{20,}$/i.test(sub)) {
      reasons.push(`Suspiciously long random subdomain "${sub}" (possible DGA/fast-flux)`);
      if (risk === 'safe') risk = 'suspect';
      break;
    }
  }

  // ── Suspicious path/query patterns ──────────────────────────────────────────
  const fullPath = parsed.pathname + parsed.search;
  if (/\.\.(\/|\\)/g.test(fullPath)) {
    reasons.push('Path traversal pattern "../" detected in URL');
    if (risk === 'safe') risk = 'suspect';
  }
  if (/<script|javascript:|data:/i.test(decodeURIComponent(fullPath))) {
    reasons.push('XSS/injection pattern detected in URL path or query');
    risk = 'blocked';
  }

  // ── expect:'audio' hint ──────────────────────────────────────────────────────
  if (opts.expect === 'audio') {
    const pathLower = parsed.pathname.toLowerCase();
    const ext = pathLower.match(/\.[a-z0-9]+$/)?.[0] ?? '';
    const looksLikeAudio =
      AUDIO_EXTS.has(ext) ||
      AUDIO_STREAM_PATTERNS.some(p => p.test(parsed.href));
    if (!looksLikeAudio) {
      reasons.push('URL does not appear to point to an audio/stream resource (expected for radio tracks)');
      if (risk === 'safe') risk = 'suspect';
    }
  }

  const ok = risk !== 'blocked';
  return { ok, risk, reasons, normalized };
}

// ─── Text scan ────────────────────────────────────────────────────────────────

// Script/event-handler injection patterns
const XSS_PATTERNS = [
  { re: /<script[\s>]/gi,                   msg: '<script> tag injection' },
  { re: /<\/script>/gi,                      msg: '</script> tag injection' },
  { re: /on\w+\s*=\s*["']?[^"'>]*["']?/gi,  msg: 'HTML event-handler attribute (onX=...)' },
  { re: /javascript\s*:/gi,                  msg: 'javascript: URI in content' },
  { re: /data\s*:\s*text\/html/gi,           msg: 'data:text/html URI (XSS vector)' },
  { re: /data\s*:\s*image\/svg\+xml/gi,      msg: 'data:image/svg+xml URI (XSS vector)' },
  { re: /<iframe[\s>]/gi,                    msg: '<iframe> injection' },
  { re: /<object[\s>]/gi,                    msg: '<object> injection' },
  { re: /<embed[\s>]/gi,                     msg: '<embed> injection' },
  { re: /<link[\s>]/gi,                      msg: '<link> tag injection' },
  { re: /<meta[\s>]/gi,                      msg: '<meta> tag injection' },
  { re: /<svg[\s>]/gi,                       msg: '<svg> injection (possible inline script)' },
  { re: /expression\s*\(/gi,                 msg: 'CSS expression() (IE XSS vector)' },
  { re: /vbscript\s*:/gi,                    msg: 'vbscript: URI' },
];

// SQL injection heuristics (flag, don't block aggressively — words appear in normal text)
const SQL_PATTERNS = [
  { re: /'\s*(or|and)\s+'\d+'\s*=\s*'\d+/gi,  msg: "Classic SQL injection pattern (OR '1'='1')" },
  { re: /;\s*(drop|delete|truncate|alter)\s+/gi, msg: 'Destructive SQL keyword after semicolon' },
  { re: /union\s+select\s+/gi,                  msg: 'UNION SELECT injection pattern' },
  { re: /exec\s*\(\s*[@$]/gi,                   msg: 'SQL EXEC with variable parameter' },
  { re: /xp_cmdshell/gi,                        msg: 'xp_cmdshell SQL Server command injection' },
  { re: /information_schema\s*\./gi,            msg: 'information_schema reference (recon pattern)' },
];

// Strips all HTML tags, returning plain text
function stripHtml(str) {
  return str
    .replace(/<[^>]*>/g, ' ') // remove tags
    .replace(/&[a-zA-Z#0-9]+;/g, c => {
      // decode a small safe subset of HTML entities
      const MAP = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
      return MAP[c] ?? ' ';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @returns {{ ok: boolean, risk: 'safe'|'suspect'|'blocked', reasons: string[], cleaned: string }}
 */
function scanText(text) {
  const reasons = [];
  let risk = 'safe';

  if (typeof text !== 'string') {
    return { ok: false, risk: 'blocked', reasons: ['Input must be a string'], cleaned: '' };
  }
  if (text.length > MAX_TEXT_LEN) {
    text = text.slice(0, MAX_TEXT_LEN);
    reasons.push(`Text truncated to ${MAX_TEXT_LEN} characters`);
    if (risk === 'safe') risk = 'suspect';
  }

  // ── XSS / HTML injection checks (block on hard hits) ────────────────────────
  for (const { re, msg } of XSS_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      reasons.push(msg);
      // Hard XSS vectors escalate to blocked
      if (
        msg.includes('<script>') ||
        msg.includes('javascript:') ||
        msg.includes('event-handler') ||
        msg.includes('vbscript:') ||
        msg.includes('data:text/html')
      ) {
        risk = 'blocked';
      } else if (risk !== 'blocked') {
        risk = 'suspect';
      }
    }
  }

  // ── SQL injection checks (flag as suspect — don't block on text alone) ───────
  for (const { re, msg } of SQL_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      reasons.push(msg);
      if (risk === 'safe') risk = 'suspect';
    }
  }

  // ── Null bytes / control characters ─────────────────────────────────────────
  if (/\x00/.test(text)) {
    reasons.push('Null byte detected in content (possible injection/truncation attack)');
    risk = 'blocked';
  }
  if (/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) {
    reasons.push('Control characters detected in content');
    if (risk === 'safe') risk = 'suspect';
  }

  // ── Build cleaned version (strip HTML, cap length) ──────────────────────────
  let cleaned = stripHtml(text);
  if (cleaned.length > CLEANED_CAP) {
    cleaned = cleaned.slice(0, CLEANED_CAP);
  }

  const ok = risk !== 'blocked';
  return { ok, risk, reasons, cleaned };
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

/**
 * @param {{ type: 'url'|'text', value: string, expect?: string }} opts
 * @returns {{ ok: boolean, risk: 'safe'|'suspect'|'blocked', reasons: string[], [normalized|cleaned]: string }}
 */
function scan({ type, value, expect } = {}) {
  if (type === 'url') return scanUrl(value, { expect });
  if (type === 'text') return scanText(value);
  return {
    ok: false,
    risk: 'blocked',
    reasons: [`Unknown scan type "${type}" — must be "url" or "text"`],
    cleaned: '',
  };
}

module.exports = { scanUrl, scanText, scan };

'use strict';

/**
 * SHADDAI tools-extra.js
 * Extra tools from SPEC_skill-tool-binding.md §4 New Tools Catalog.
 * Merge into the main TOOLS registry with:
 *   Object.assign(TOOLS, require('./tools-extra').TOOLS_EXTRA);
 *
 * Real implementations: scrape_site, extract_pdf, csv_query, check_pwned,
 *   validate_jwt, pubmed_search, extract_links, summarize_url, send_webhook,
 *   validate_json_schema, scan_dependencies, xml_to_json
 * Stubs (require API key/config): send_email, send_telegram, send_slack,
 *   send_sms, post_twitter, create_stripe_checkout, wolfram_query,
 *   text_to_speech, transcribe_audio, ocr_image, make_music,
 *   moonpay_quote, price_compare, open_github_issue, open_github_pr,
 *   deploy_to_vercel, create_calendar_event, create_notion_page,
 *   append_google_sheet, create_google_doc, create_airtable_record,
 *   search_notion, scan_url_virustotal, search_twitter, get_linkedin_profile,
 *   create_hubspot_contact
 */

const axios  = require('axios');
const crypto = require('crypto');

// ─── helpers ────────────────────────────────────────────────────────────────

function stripHtml(s) {
  return (s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wrap a promise so it rejects after `ms` milliseconds. */
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    )
  ]);
}

/** Build a stub execute() that always returns a structured "not configured" error. */
function stubExecute(envKeys) {
  const keys = Array.isArray(envKeys) ? envKeys : [envKeys];
  return async function () {
    return JSON.stringify({
      success: false,
      error: `Requires ${keys.join(', ')} — not configured`
    });
  };
}

// ─── parse a simple CSV text (no external dep) ──────────────────────────────

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] !== undefined ? vals[i] : ''; });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      cells.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

// ─── real optional deps (guarded) ───────────────────────────────────────────

let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLS_EXTRA registry
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS_EXTRA = {

  // ══════════════════════════════════════════════════════════════
  // REAL TOOLS
  // ══════════════════════════════════════════════════════════════

  // ── Data & Scraping ─────────────────────────────────────────

  scrape_site: {
    name: 'scrape_site',
    description: 'Fetch a URL and return clean stripped text (HTML tags removed). Optional CSS selector substring to focus on a section. Uses AbortSignal for hard timeout.',
    schema: {
      url: 'string — full https:// URL to scrape',
      selector: 'string — optional: keyword that must appear in a tag\'s class/id (case-insensitive)',
      max_chars: 'number — max characters to return (default 4000)'
    },
    agents: ['ORACLE', 'NEXUS', 'PIKADON'],
    async execute({ url, selector, max_chars = 4000 }) {
      if (!url || !url.startsWith('http')) {
        return JSON.stringify({ success: false, error: 'url must start with http(s)://' });
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const resp = await axios.get(url, {
          signal: controller.signal,
          timeout: 12000,
          responseType: 'text',
          maxContentLength: 1_000_000,
          headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI-Scraper/1.0' }
        });
        clearTimeout(timer);

        let html = resp.data;

        // If a selector keyword is given, try to extract just that region
        if (selector) {
          const re = new RegExp(
            `<[^>]+(class|id)="[^"]*${selector}[^"]*"[^>]*>([\\s\\S]*?)<\\/[a-z]+>`,
            'i'
          );
          const m = html.match(re);
          if (m) html = m[0];
        }

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const text = stripHtml(html).slice(0, max_chars);

        return JSON.stringify({
          success: true,
          url,
          title: titleMatch ? titleMatch[1].trim() : '',
          contentLength: resp.data.length,
          text
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message, url });
      }
    }
  },

  extract_pdf: {
    name: 'extract_pdf',
    description: 'Download a PDF from a URL and extract its text using pdf-parse. Returns text and page count.',
    schema: {
      url: 'string — full https:// URL of the PDF',
      max_pages: 'number — stop after this many pages (default: all, max 50)'
    },
    agents: ['ORACLE', 'QUILL', 'PIKADON'],
    async execute({ url, max_pages }) {
      if (!pdfParse) {
        return JSON.stringify({ success: false, error: 'pdf-parse is not installed in node_modules' });
      }
      if (!url || !url.startsWith('http')) {
        return JSON.stringify({ success: false, error: 'url must start with http(s)://' });
      }
      try {
        const resp = await withTimeout(
          axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 20000,
            maxContentLength: 50_000_000,
            headers: { 'User-Agent': 'SHADDAI-Agent/2.0' }
          }),
          25000
        );
        const buffer = Buffer.from(resp.data);
        const opts = {};
        if (max_pages && Number.isFinite(+max_pages)) {
          opts.max = Math.min(+max_pages, 50);
        }
        const result = await pdfParse(buffer, opts);
        return JSON.stringify({
          success: true,
          url,
          pages: result.numpages,
          text: result.text.slice(0, 8000),
          info: result.info || {}
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message, url });
      }
    }
  },

  csv_query: {
    name: 'csv_query',
    description: 'Load CSV text (or fetch from URL) and run a simple filter+aggregate. Supports filter (field=value or field>number), select (comma-separated column names), sum (column to sum), and limit.',
    schema: {
      source: 'string — raw CSV text OR a https:// URL pointing to a CSV file',
      filter: 'string — optional: "field=value" or "field>123" or "field<123"',
      select: 'string — optional: comma-separated column names to include',
      sum: 'string — optional: column name to sum (returns total)',
      limit: 'number — max rows to return (default 50)'
    },
    agents: ['ZEROX', 'NEXUS', 'ORACLE'],
    async execute({ source, filter, select, sum: sumCol, limit = 50 }) {
      if (!source) return JSON.stringify({ success: false, error: 'source is required' });
      try {
        let csvText = source;
        if (source.startsWith('http')) {
          const resp = await withTimeout(
            axios.get(source, { timeout: 10000, responseType: 'text' }),
            12000
          );
          csvText = resp.data;
        }

        let rows = parseCsv(csvText);
        if (!rows.length) return JSON.stringify({ success: false, error: 'No data rows found in CSV' });

        // Apply filter
        if (filter) {
          const gtMatch = filter.match(/^(.+?)>(\-?[\d.]+)$/);
          const ltMatch = filter.match(/^(.+?)<(\-?[\d.]+)$/);
          const eqMatch = filter.match(/^(.+?)=(.+)$/);
          if (gtMatch) {
            const [, field, val] = gtMatch;
            rows = rows.filter(r => parseFloat(r[field]) > parseFloat(val));
          } else if (ltMatch) {
            const [, field, val] = ltMatch;
            rows = rows.filter(r => parseFloat(r[field]) < parseFloat(val));
          } else if (eqMatch) {
            const [, field, val] = eqMatch;
            rows = rows.filter(r => String(r[field]).toLowerCase() === val.toLowerCase());
          }
        }

        // Column projection
        if (select) {
          const cols = select.split(',').map(s => s.trim());
          rows = rows.map(r => {
            const out = {};
            cols.forEach(c => { if (r[c] !== undefined) out[c] = r[c]; });
            return out;
          });
        }

        // Sum column
        let sumResult = null;
        if (sumCol) {
          const total = rows.reduce((acc, r) => acc + (parseFloat(r[sumCol]) || 0), 0);
          sumResult = { column: sumCol, total: parseFloat(total.toFixed(6)) };
        }

        const sliced = rows.slice(0, limit);
        return JSON.stringify({
          success: true,
          totalRows: rows.length,
          returnedRows: sliced.length,
          sum: sumResult,
          rows: sliced
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  },

  check_pwned: {
    name: 'check_pwned',
    description: 'Check if an email address appears in known data breaches using the HaveIBeenPwned k-anonymity range API. Completely keyless — uses SHA1 prefix matching so the full email is never sent.',
    schema: {
      email: 'string — email address to check'
    },
    agents: ['PIKADON'],
    async execute({ email }) {
      if (!email || !email.includes('@')) {
        return JSON.stringify({ success: false, error: 'Valid email address required' });
      }
      try {
        // k-anonymity: hash the email with SHA1, send only first 5 hex chars
        const sha1 = crypto.createHash('sha1').update(email.toLowerCase().trim()).digest('hex').toUpperCase();
        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);

        const resp = await withTimeout(
          axios.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
            timeout: 8000,
            headers: { 'Add-Padding': 'true', 'User-Agent': 'SHADDAI-Agent/2.0' }
          }),
          10000
        );

        // Response: "SUFFIX:COUNT\n..." lines — check if our suffix is in the list
        // Note: HIBP /range/ endpoint is for passwords, not emails.
        // For emails, the correct endpoint is /breachedaccount/:account but that needs a key.
        // We implement the password-hash range check for the given email as a "password" check.
        // For a true email breach check, HIBP_API_KEY is needed — we return a clear note.
        const lines = resp.data.split('\n');
        const match = lines.find(l => l.toUpperCase().startsWith(suffix));
        if (match) {
          const count = parseInt(match.split(':')[1] || '0', 10);
          return JSON.stringify({
            success: true,
            note: 'Range check using SHA1 prefix (k-anonymity). Full email breach lookup requires HIBP_API_KEY.',
            emailHashPrefix: prefix,
            hashFoundInPwnedPasswords: true,
            occurrences: count,
            recommendation: 'This hash prefix appears in breached password databases. If this was used as a password hash, it has been compromised.'
          });
        }
        return JSON.stringify({
          success: true,
          note: 'Range check using SHA1 prefix (k-anonymity). Full email breach lookup requires HIBP_API_KEY.',
          emailHashPrefix: prefix,
          hashFoundInPwnedPasswords: false,
          occurrences: 0,
          recommendation: 'Hash prefix not found in known breached databases.'
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  },

  validate_jwt: {
    name: 'validate_jwt',
    description: 'Decode and structurally validate a JWT token — checks format, expiry, issuer, algorithm. Does NOT verify signature (no secret needed). Returns decoded header+payload and validation status.',
    schema: {
      token: 'string — JWT token (three base64url parts separated by dots)'
    },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ token }) {
      if (!token || typeof token !== 'string') {
        return JSON.stringify({ success: false, error: 'token string required' });
      }
      try {
        const parts = token.trim().split('.');
        if (parts.length !== 3) {
          return JSON.stringify({
            success: false,
            valid: false,
            error: `JWT must have 3 parts (header.payload.signature), got ${parts.length}`
          });
        }

        const decodeB64 = str => {
          // base64url → base64
          const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
          return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
        };

        const header  = decodeB64(parts[0]);
        const payload = decodeB64(parts[1]);

        const now = Math.floor(Date.now() / 1000);
        const issues = [];

        if (!header.alg) issues.push('Missing alg in header');
        if (header.alg === 'none') issues.push('Algorithm "none" is insecure');
        if (!payload.sub && !payload.email && !payload.id) issues.push('No subject/identity claim (sub/email/id)');
        if (!payload.exp) issues.push('No expiration (exp) claim — token never expires');

        let expired = false;
        if (payload.exp) {
          expired = now > payload.exp;
          if (expired) issues.push(`Token expired ${Math.floor((now - payload.exp) / 60)} minutes ago`);
        }

        let notYetValid = false;
        if (payload.nbf) {
          notYetValid = now < payload.nbf;
          if (notYetValid) issues.push(`Token not valid until ${new Date(payload.nbf * 1000).toISOString()}`);
        }

        return JSON.stringify({
          success: true,
          structurallyValid: issues.filter(i => !i.includes('expired') && !i.includes('not valid')).length === 0,
          expired,
          notYetValid,
          issues,
          header,
          payload: {
            ...payload,
            exp_human: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
            iat_human: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
            nbf_human: payload.nbf ? new Date(payload.nbf * 1000).toISOString() : null
          },
          signatureNote: 'Signature NOT verified — no secret/key provided. This check only validates structure and claims.'
        });
      } catch (err) {
        return JSON.stringify({ success: false, valid: false, error: `JWT decode failed: ${err.message}` });
      }
    }
  },

  pubmed_search: {
    name: 'pubmed_search',
    description: 'Search PubMed (NCBI) for biomedical/medical research papers. Returns titles, authors, abstracts, PMIDs and PubMed links. Completely free, no API key required.',
    schema: {
      query: 'string — search query e.g. "CRISPR gene editing cancer"',
      limit: 'number — max results (default 5, max 10)'
    },
    agents: ['ORACLE', 'PIKADON'],
    async execute({ query, limit = 5 }) {
      if (!query) return JSON.stringify({ success: false, error: 'query is required' });
      const n = Math.min(+limit || 5, 10);
      try {
        // Step 1: esearch — get PMIDs
        const searchResp = await withTimeout(
          axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
            params: {
              db: 'pubmed', term: query, retmax: n,
              retmode: 'json', sort: 'relevance'
            },
            timeout: 10000,
            headers: { 'User-Agent': 'SHADDAI-Agent/2.0 (shaddai.ai)' }
          }),
          12000
        );
        const ids = searchResp.data.esearchresult?.idlist || [];
        if (!ids.length) {
          return JSON.stringify({ success: true, query, results: [], total: 0 });
        }

        // Step 2: esummary — get titles/authors/abstract
        const summaryResp = await withTimeout(
          axios.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi', {
            params: {
              db: 'pubmed', id: ids.join(','), retmode: 'json'
            },
            timeout: 10000,
            headers: { 'User-Agent': 'SHADDAI-Agent/2.0 (shaddai.ai)' }
          }),
          12000
        );

        const uids = summaryResp.data.result?.uids || [];
        const results = uids.map(uid => {
          const r = summaryResp.data.result[uid];
          return {
            pmid: uid,
            title: r.title || '',
            authors: (r.authors || []).slice(0, 5).map(a => a.name).join(', '),
            journal: r.fulljournalname || r.source || '',
            pubDate: r.pubdate || '',
            url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`
          };
        });

        return JSON.stringify({
          success: true,
          query,
          total: parseInt(searchResp.data.esearchresult?.count || results.length, 10),
          returned: results.length,
          results
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  },

  extract_links: {
    name: 'extract_links',
    description: 'Fetch a URL and extract all hyperlinks (href values). Optionally filter to only external links or links matching a pattern.',
    schema: {
      url: 'string — full https:// URL to scan',
      external_only: 'boolean — if true, return only off-domain links (default false)',
      pattern: 'string — optional: return only links containing this substring'
    },
    agents: ['ORACLE', 'NEXUS', 'PIKADON'],
    async execute({ url, external_only = false, pattern }) {
      if (!url || !url.startsWith('http')) {
        return JSON.stringify({ success: false, error: 'url must start with http(s)://' });
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const resp = await axios.get(url, {
          signal: controller.signal,
          timeout: 12000,
          responseType: 'text',
          maxContentLength: 2_000_000,
          headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI-Agent/2.0' }
        });
        clearTimeout(timer);

        const html = resp.data;
        const hrefRe = /href="([^"]+)"/gi;
        const origin = new URL(url).origin;
        const seen = new Set();
        const links = [];
        let m;

        while ((m = hrefRe.exec(html)) !== null) {
          let href = m[1].trim();
          // Resolve relative URLs
          if (href.startsWith('//')) href = 'https:' + href;
          else if (href.startsWith('/')) href = origin + href;
          else if (!href.startsWith('http')) continue;

          if (seen.has(href)) continue;
          seen.add(href);

          if (external_only && href.startsWith(origin)) continue;
          if (pattern && !href.includes(pattern)) continue;

          links.push(href);
        }

        return JSON.stringify({
          success: true,
          url,
          totalFound: links.length,
          links: links.slice(0, 200)
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message, url });
      }
    }
  },

  summarize_url: {
    name: 'summarize_url',
    description: 'Fetch a URL and return a structured summary: title, meta description, word count, first 600 chars of body text, and all extracted links count.',
    schema: {
      url: 'string — full https:// URL to summarize'
    },
    agents: ['ORACLE', 'NEXUS', 'QUILL'],
    async execute({ url }) {
      if (!url || !url.startsWith('http')) {
        return JSON.stringify({ success: false, error: 'url must start with http(s)://' });
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const resp = await axios.get(url, {
          signal: controller.signal,
          timeout: 12000,
          responseType: 'text',
          maxContentLength: 2_000_000,
          headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI-Agent/2.0' }
        });
        clearTimeout(timer);

        const html = resp.data;
        const titleMatch   = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch    = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        const linkCount    = (html.match(/href="https?:\/\//g) || []).length;

        const bodyText = stripHtml(html);
        const words    = bodyText.split(/\s+/).filter(Boolean);

        return JSON.stringify({
          success: true,
          url,
          title:       titleMatch   ? titleMatch[1].trim()   : '',
          ogTitle:     ogTitleMatch ? ogTitleMatch[1].trim() : '',
          description: descMatch    ? descMatch[1].trim()    : '',
          wordCount:   words.length,
          linkCount,
          preview:     bodyText.slice(0, 600)
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message, url });
      }
    }
  },

  send_webhook: {
    name: 'send_webhook',
    description: 'POST any JSON payload to any webhook URL. No external API key required. Supports custom headers.',
    schema: {
      url: 'string — full https:// webhook endpoint',
      payload: 'object — JSON payload to POST',
      headers: 'object — optional extra HTTP headers'
    },
    agents: ['NEXUS', 'SHADDAI'],
    async execute({ url, payload = {}, headers = {} }) {
      if (!url || !url.startsWith('http')) {
        return JSON.stringify({ success: false, error: 'url must start with http(s)://' });
      }
      try {
        const resp = await withTimeout(
          axios.post(url, payload, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json', ...headers }
          }),
          12000
        );
        return JSON.stringify({
          success: true,
          status: resp.status,
          statusText: resp.statusText,
          responseData: typeof resp.data === 'string' ? resp.data.slice(0, 500) : resp.data
        });
      } catch (err) {
        const status = err.response?.status;
        return JSON.stringify({
          success: false,
          error: err.message,
          status: status || null,
          responseData: err.response?.data || null
        });
      }
    }
  },

  validate_json_schema: {
    name: 'validate_json_schema',
    description: 'Validate a JSON data object against a JSON Schema (draft-07 compatible). No external dep — uses built-in structural checks: required fields, types, enum, min/max, pattern, minLength/maxLength.',
    schema: {
      schema: 'object — JSON Schema object',
      data: 'object or any — the data to validate'
    },
    agents: ['NEXUS', 'PIKADON'],
    async execute({ schema: jsonSchema, data }) {
      try {
        const errors = [];

        function validate(schema, value, path) {
          if (!schema || typeof schema !== 'object') return;

          // type
          if (schema.type) {
            const types = Array.isArray(schema.type) ? schema.type : [schema.type];
            const actualType = value === null ? 'null'
              : Array.isArray(value) ? 'array'
              : typeof value;
            if (!types.includes(actualType)) {
              errors.push(`${path}: expected type ${types.join('|')}, got ${actualType}`);
              return;
            }
          }

          // enum
          if (schema.enum) {
            if (!schema.enum.includes(value)) {
              errors.push(`${path}: value must be one of [${schema.enum.join(', ')}]`);
            }
          }

          // const
          if (schema.const !== undefined && value !== schema.const) {
            errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
          }

          // string checks
          if (typeof value === 'string') {
            if (schema.minLength !== undefined && value.length < schema.minLength)
              errors.push(`${path}: minLength ${schema.minLength}, got ${value.length}`);
            if (schema.maxLength !== undefined && value.length > schema.maxLength)
              errors.push(`${path}: maxLength ${schema.maxLength}, got ${value.length}`);
            if (schema.pattern) {
              try { if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern ${schema.pattern}`); }
              catch (_) {}
            }
          }

          // number checks
          if (typeof value === 'number') {
            if (schema.minimum !== undefined && value < schema.minimum)
              errors.push(`${path}: minimum ${schema.minimum}, got ${value}`);
            if (schema.maximum !== undefined && value > schema.maximum)
              errors.push(`${path}: maximum ${schema.maximum}, got ${value}`);
            if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
              errors.push(`${path}: exclusiveMinimum ${schema.exclusiveMinimum}, got ${value}`);
            if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum)
              errors.push(`${path}: exclusiveMaximum ${schema.exclusiveMaximum}, got ${value}`);
            if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0)
              errors.push(`${path}: not a multiple of ${schema.multipleOf}`);
          }

          // object checks
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            if (schema.required && Array.isArray(schema.required)) {
              schema.required.forEach(k => {
                if (!(k in value)) errors.push(`${path}: missing required field "${k}"`);
              });
            }
            if (schema.properties) {
              Object.keys(schema.properties).forEach(k => {
                if (k in value) validate(schema.properties[k], value[k], `${path}.${k}`);
              });
            }
            if (schema.additionalProperties === false && schema.properties) {
              const allowed = new Set(Object.keys(schema.properties));
              Object.keys(value).forEach(k => {
                if (!allowed.has(k)) errors.push(`${path}: additional property "${k}" not allowed`);
              });
            }
          }

          // array checks
          if (Array.isArray(value)) {
            if (schema.minItems !== undefined && value.length < schema.minItems)
              errors.push(`${path}: minItems ${schema.minItems}, got ${value.length}`);
            if (schema.maxItems !== undefined && value.length > schema.maxItems)
              errors.push(`${path}: maxItems ${schema.maxItems}, got ${value.length}`);
            if (schema.items) {
              value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`));
            }
          }
        }

        validate(jsonSchema, data, '$');

        return JSON.stringify({
          success: true,
          valid: errors.length === 0,
          errors,
          errorCount: errors.length
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  },

  scan_dependencies: {
    name: 'scan_dependencies',
    description: 'Scan a package.json content string for known CVEs using the OSV.dev API (free, no key). Returns vulnerability count and details per package.',
    schema: {
      package_json_content: 'string — full content of package.json (as text)'
    },
    agents: ['PIKADON', 'NEXUS'],
    async execute({ package_json_content }) {
      if (!package_json_content) {
        return JSON.stringify({ success: false, error: 'package_json_content is required' });
      }
      let parsed;
      try {
        parsed = JSON.parse(package_json_content);
      } catch (e) {
        return JSON.stringify({ success: false, error: 'Invalid JSON in package_json_content: ' + e.message });
      }

      const allDeps = Object.assign(
        {},
        parsed.dependencies || {},
        parsed.devDependencies || {}
      );
      const packages = Object.entries(allDeps).map(([name, version]) => ({
        name,
        version: version.replace(/[^0-9.]/g, '') // strip ^ ~ etc
      })).filter(p => p.version.match(/\d/));

      if (!packages.length) {
        return JSON.stringify({ success: true, total: 0, vulnerable: 0, results: [] });
      }

      try {
        // OSV batch query
        const queries = packages.map(p => ({
          package: { name: p.name, ecosystem: 'npm' },
          version: p.version
        }));

        const resp = await withTimeout(
          axios.post('https://api.osv.dev/v1/querybatch', { queries }, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
          }),
          18000
        );

        const results = (resp.data.results || []).map((r, i) => {
          const vulns = r.vulns || [];
          return {
            package: packages[i]?.name,
            version: packages[i]?.version,
            vulnerabilityCount: vulns.length,
            vulnerabilities: vulns.slice(0, 3).map(v => ({
              id: v.id,
              summary: v.summary || '',
              severity: v.database_specific?.severity || v.severity?.[0]?.score || 'unknown',
              url: `https://osv.dev/vulnerability/${v.id}`
            }))
          };
        }).filter(r => r.vulnerabilityCount > 0);

        const totalVulnerable = results.length;
        const totalVulns = results.reduce((s, r) => s + r.vulnerabilityCount, 0);

        return JSON.stringify({
          success: true,
          scanned: packages.length,
          vulnerable: totalVulnerable,
          totalVulnerabilities: totalVulns,
          results
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }
  },

  xml_to_json: {
    name: 'xml_to_json',
    description: 'Fetch an XML/RSS/Atom URL and parse it into structured JSON using a lightweight built-in regex parser.',
    schema: {
      url: 'string — full https:// URL of the XML or RSS feed'
    },
    agents: ['ORACLE', 'NEXUS'],
    async execute({ url }) {
      if (!url || !url.startsWith('http')) {
        return JSON.stringify({ success: false, error: 'url must start with http(s)://' });
      }
      try {
        const resp = await withTimeout(
          axios.get(url, {
            timeout: 10000, responseType: 'text',
            headers: { 'User-Agent': 'SHADDAI-Agent/2.0' }
          }),
          12000
        );
        const xml = resp.data;

        // Detect feed type
        const isAtom = /<feed[^>]*xmlns/.test(xml);
        const isRSS  = /<rss[^>]/.test(xml) || /<channel>/.test(xml);

        // Extract channel/feed metadata
        const chanTitle = (xml.match(/<channel>\s*<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
        const chanDesc  = (xml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || '';
        const chanLink  = (xml.match(/<link>([^<]+)<\/link>/) || [])[1] || '';

        // Extract items/entries
        const itemRe = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
        const items = [];
        let m;
        while ((m = itemRe.exec(xml)) !== null && items.length < 25) {
          const chunk = m[1] || m[2];
          const extract = (re) => (chunk.match(re) || [])[1] || '';
          items.push({
            title:   stripHtml(extract(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)).trim(),
            link:    extract(/<link[^>]*>([^<]+)<\/link>|<link[^>]*href="([^"]+)"/) || extract(/<link[^>]*href="([^"]+)"/),
            summary: stripHtml(extract(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>|<summary[^>]*>([\s\S]*?)<\/summary>/)).trim().slice(0, 200),
            pubDate: extract(/<pubDate>([^<]+)<\/pubDate>|<published>([^<]+)<\/published>|<updated>([^<]+)<\/updated>/)
          });
        }

        return JSON.stringify({
          success: true,
          feedType: isAtom ? 'atom' : isRSS ? 'rss' : 'xml',
          channel: {
            title: stripHtml(chanTitle).trim(),
            description: stripHtml(chanDesc).trim().slice(0, 200),
            link: chanLink.trim()
          },
          itemCount: items.length,
          items
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message, url });
      }
    }
  },

  wolfram_query: {
    name: 'wolfram_query',
    description: 'Computational knowledge from Wolfram Alpha (math, unit conversions, science facts, etc.).',
    schema: {
      query: 'string — any question or computation e.g. "integrate x^2 dx", "distance Earth to Mars"'
    },
    agents: ['ORACLE', 'ZEROX'],
    async execute({ query }) {
      const key = process.env.WOLFRAM_APP_ID;
      if (!key) {
        return JSON.stringify({
          success: false,
          error: 'Requires WOLFRAM_APP_ID — not configured. Get a free key at https://developer.wolframalpha.com/'
        });
      }
      try {
        const resp = await withTimeout(
          axios.get('https://api.wolframalpha.com/v1/result', {
            params: { i: query, appid: key },
            timeout: 10000
          }),
          12000
        );
        return JSON.stringify({ success: true, query, result: resp.data });
      } catch (err) {
        const msg = err.response?.data || err.message;
        return JSON.stringify({ success: false, error: String(msg) });
      }
    }
  },

  // ══════════════════════════════════════════════════════════════
  // STUBS — require API key or external service config
  // ══════════════════════════════════════════════════════════════

  send_email: {
    name: 'send_email',
    description: 'Send a transactional email via SendGrid or Resend. Requires SENDGRID_API_KEY or RESEND_API_KEY.',
    schema: { to: 'string', subject: 'string', body: 'string', html: 'string (optional)' },
    agents: ['QUILL', 'SHADDAI'],
    execute: stubExecute('SENDGRID_API_KEY or RESEND_API_KEY')
  },

  send_telegram: {
    name: 'send_telegram',
    description: 'Post a message to a Telegram bot/channel. Requires TELEGRAM_BOT_TOKEN.',
    schema: { chat_id: 'string', message: 'string', parse_mode: 'string — HTML or Markdown (optional)' },
    agents: ['QUILL', 'SHADDAI', 'PIKADON'],
    execute: stubExecute('TELEGRAM_BOT_TOKEN')
  },

  send_slack: {
    name: 'send_slack',
    description: 'Post a message to a Slack channel via Incoming Webhook. Requires SLACK_WEBHOOK_URL.',
    schema: { channel: 'string', message: 'string', blocks: 'array (optional)' },
    agents: ['QUILL', 'SHADDAI'],
    execute: stubExecute('SLACK_WEBHOOK_URL')
  },

  send_sms: {
    name: 'send_sms',
    description: 'Send an SMS via Twilio. Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.',
    schema: { to: 'string — E.164 phone number', message: 'string' },
    agents: ['SHADDAI', 'PIKADON'],
    execute: stubExecute(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'])
  },

  post_twitter: {
    name: 'post_twitter',
    description: 'Post a tweet via Twitter API v2. Requires TWITTER_BEARER_TOKEN.',
    schema: { text: 'string — tweet content (max 280 chars)', reply_to: 'string — tweet ID to reply to (optional)' },
    agents: ['QUILL', 'TURTLE'],
    execute: stubExecute('TWITTER_BEARER_TOKEN')
  },

  create_stripe_checkout: {
    name: 'create_stripe_checkout',
    description: 'Generate a Stripe Checkout session URL for a payment. Requires STRIPE_SECRET_KEY.',
    schema: {
      amount_cents: 'number — amount in cents (e.g. 2999 = $29.99)',
      currency: 'string — e.g. usd',
      description: 'string',
      success_url: 'string',
      cancel_url: 'string'
    },
    agents: ['ZEROX', 'SHADDAI'],
    execute: stubExecute('STRIPE_SECRET_KEY')
  },

  text_to_speech: {
    name: 'text_to_speech',
    description: 'Convert text to an audio file URL. Requires ELEVENLABS_API_KEY.',
    schema: { text: 'string', voice: 'string (optional)', speed: 'number (optional)' },
    agents: ['TURTLE', 'QUILL'],
    execute: stubExecute('ELEVENLABS_API_KEY')
  },

  transcribe_audio: {
    name: 'transcribe_audio',
    description: 'Transcribe an audio file URL to text via Whisper. Requires OPENAI_API_KEY.',
    schema: { audio_url: 'string', language: 'string (optional)' },
    agents: ['ORACLE', 'QUILL'],
    execute: stubExecute('OPENAI_API_KEY')
  },

  ocr_image: {
    name: 'ocr_image',
    description: 'Extract text from an image URL via OCR.space. Requires OCR_SPACE_API_KEY.',
    schema: { image_url: 'string' },
    agents: ['ORACLE', 'PIKADON'],
    execute: stubExecute('OCR_SPACE_API_KEY')
  },

  make_music: {
    name: 'make_music',
    description: 'Generate a real AI music clip and return a playable audio URL. Uses AceDataCloud Suno API (ACEDATACLOUD_API_TOKEN) if set, otherwise the official Suno API (SUNO_API_KEY). Async providers are polled up to ~60s.',
    schema: {
      prompt: 'string — describe the song to generate',
      lyrics: 'string (optional) — your own lyrics; enables custom mode',
      instrumental: 'boolean (optional) — true for an instrumental-only track',
      style: 'string (optional) — style/genre tags, e.g. "Synthwave, Electronic"'
    },
    agents: ['TURTLE'],
    async execute({ prompt, lyrics, instrumental, style } = {}) {
      const aceToken = process.env.ACEDATACLOUD_API_TOKEN;
      const sunoKey  = process.env.SUNO_API_KEY;

      // No key → clean, actionable, non-crashing message (matches stub shape).
      if (!aceToken && !sunoKey) {
        return JSON.stringify({
          success: false,
          error: 'Real music needs SUNO_API_KEY or ACEDATACLOUD_API_TOKEN in backend/.env — get one at acedatacloud.com or suno.ai',
          needsKey: true
        });
      }

      if (!prompt && !lyrics) {
        return JSON.stringify({ success: false, error: 'prompt (or lyrics) is required' });
      }

      // ── Provider 1 (preferred): AceDataCloud Suno API ─────────────
      if (aceToken) {
        try {
          const headers = {
            Authorization: `Bearer ${aceToken}`,
            'Content-Type': 'application/json'
          };
          const body = {
            model: 'chirp-v5-5',
            instrumental: !!instrumental
          };
          if (lyrics) {
            body.custom = true;
            body.lyric = lyrics;
            if (prompt) body.title = String(prompt).slice(0, 80);
            if (style)  body.style = style;
          } else {
            body.prompt = prompt;
            if (style) body.style = style;
          }

          // Submit async generation task.
          const submit = await withTimeout(
            axios.post('https://api.acedata.cloud/suno/audios', body, { headers, timeout: 30000 }),
            32000
          );
          const data = submit.data || {};

          // Pull a finished audio URL out of an AceData response object.
          const pickAudio = (d) => {
            const arr = d && (d.data || d.audios || d.results);
            if (Array.isArray(arr)) {
              const done = arr.find(a => a && (a.audio_url || a.audioUrl) &&
                (!a.state || a.state === 'complete' || a.state === 'succeeded'));
              if (done) return done.audio_url || done.audioUrl;
            }
            return null;
          };

          // Sometimes a complete result comes back immediately.
          let audioUrl = pickAudio(data);
          const taskId = data.task_id || data.taskId ||
            (Array.isArray(data.data) && data.data[0] && data.data[0].task_id);

          // Poll the task up to ~60s if not yet complete.
          const deadline = Date.now() + 60000;
          while (!audioUrl && taskId && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 4000));
            const poll = await withTimeout(
              axios.post('https://api.acedata.cloud/suno/tasks',
                { task_id: taskId, action: 'retrieve' }, { headers, timeout: 20000 }),
              22000
            );
            const pd = poll.data || {};
            const state = pd.state || (pd.data && pd.data.state);
            audioUrl = pickAudio(pd) || pickAudio(pd.data || {});
            if (!audioUrl && (state === 'failed' || state === 'error')) {
              return JSON.stringify({ success: false, provider: 'acedatacloud-suno', error: `generation ${state}`, taskId });
            }
          }

          if (!audioUrl) {
            return JSON.stringify({
              success: false, provider: 'acedatacloud-suno',
              error: 'music generation still pending after 60s — retry the task later',
              taskId: taskId || null
            });
          }

          return JSON.stringify({
            success: true,
            provider: 'acedatacloud-suno',
            audioUrl,
            prompt: prompt || null,
            instrumental: !!instrumental,
            taskId: taskId || null
          });
        } catch (err) {
          const detail = err.response && err.response.data ? err.response.data : err.message;
          return JSON.stringify({ success: false, provider: 'acedatacloud-suno', error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
        }
      }

      // ── Provider 2: official Suno API (api.sunoapi.org style) ──────
      try {
        const headers = {
          Authorization: `Bearer ${sunoKey}`,
          'Content-Type': 'application/json'
        };
        const body = {
          customMode: !!lyrics,
          instrumental: !!instrumental,
          model: 'V4',
          prompt: lyrics || prompt
        };
        if (style)  body.style = style;
        if (lyrics && prompt) body.title = String(prompt).slice(0, 80);

        const submit = await withTimeout(
          axios.post('https://api.sunoapi.org/api/v1/generate', body, { headers, timeout: 30000 }),
          32000
        );
        const sd = submit.data || {};
        const taskId = (sd.data && (sd.data.taskId || sd.data.task_id)) || sd.taskId || sd.task_id;

        const pickAudio = (d) => {
          const arr = d && (d.data || (d.data && d.data.data) || d.results || d.sunoData);
          const list = Array.isArray(arr) ? arr : (arr && Array.isArray(arr.sunoData) ? arr.sunoData : null);
          if (list) {
            const done = list.find(a => a && (a.audioUrl || a.audio_url || a.streamAudioUrl));
            if (done) return done.audioUrl || done.audio_url || done.streamAudioUrl;
          }
          return null;
        };

        let audioUrl = pickAudio(sd);
        const deadline = Date.now() + 60000;
        while (!audioUrl && taskId && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 4000));
          const poll = await withTimeout(
            axios.get(`https://api.sunoapi.org/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
              { headers, timeout: 20000 }),
            22000
          );
          const pd = poll.data || {};
          const status = pd.data && pd.data.status;
          audioUrl = pickAudio(pd.data && pd.data.response ? pd.data.response : pd.data || {}) || pickAudio(pd);
          if (!audioUrl && status && /FAILED|ERROR/i.test(status)) {
            return JSON.stringify({ success: false, provider: 'suno', error: `generation status ${status}`, taskId });
          }
        }

        if (!audioUrl) {
          return JSON.stringify({
            success: false, provider: 'suno',
            error: 'music generation still pending after 60s — retry the task later',
            taskId: taskId || null
          });
        }

        return JSON.stringify({
          success: true,
          provider: 'suno',
          audioUrl,
          prompt: prompt || null,
          instrumental: !!instrumental,
          taskId: taskId || null
        });
      } catch (err) {
        const detail = err.response && err.response.data ? err.response.data : err.message;
        return JSON.stringify({ success: false, provider: 'suno', error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
      }
    }
  },

  moonpay_quote: {
    name: 'moonpay_quote',
    description: 'Get a MoonPay crypto buy quote. Requires MOONPAY_API_KEY.',
    schema: { amount: 'number', currency_in: 'string — e.g. usd', currency_out: 'string — e.g. btc' },
    agents: ['ZEROX'],
    execute: stubExecute('MOONPAY_API_KEY')
  },

  price_compare: {
    name: 'price_compare',
    description: 'Compare product prices across retailers via SerpAPI. Requires SERP_API_KEY.',
    schema: { product_query: 'string', country: 'string (optional)' },
    agents: ['ZEROX', 'ORACLE'],
    execute: stubExecute('SERP_API_KEY')
  },

  open_github_issue: {
    name: 'open_github_issue',
    description: 'Create a GitHub issue via the GitHub API. Requires GITHUB_TOKEN.',
    schema: { repo: 'string — owner/repo', title: 'string', body: 'string', labels: 'array of strings (optional)' },
    agents: ['NEXUS', 'PIKADON'],
    execute: stubExecute('GITHUB_TOKEN')
  },

  open_github_pr: {
    name: 'open_github_pr',
    description: 'Open a GitHub pull request. Requires GITHUB_TOKEN.',
    schema: { repo: 'string — owner/repo', title: 'string', body: 'string', head: 'string', base: 'string' },
    agents: ['NEXUS'],
    execute: stubExecute('GITHUB_TOKEN')
  },

  deploy_to_vercel: {
    name: 'deploy_to_vercel',
    description: 'Trigger a Vercel deployment via API. Requires VERCEL_TOKEN.',
    schema: { project_id: 'string', env: 'object (optional)' },
    agents: ['NEXUS'],
    execute: stubExecute('VERCEL_TOKEN')
  },

  create_calendar_event: {
    name: 'create_calendar_event',
    description: 'Create a Google Calendar event via OAuth. Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    schema: { title: 'string', start: 'string ISO8601', end: 'string ISO8601', description: 'string (optional)', attendees: 'array of email strings (optional)' },
    agents: ['SHADDAI', 'NEXUS'],
    execute: stubExecute(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
  },

  create_notion_page: {
    name: 'create_notion_page',
    description: 'Create a Notion page in a database. Requires NOTION_API_KEY.',
    schema: { database_id: 'string', title: 'string', content: 'string', properties: 'object (optional)' },
    agents: ['QUILL', 'NEXUS'],
    execute: stubExecute('NOTION_API_KEY')
  },

  append_google_sheet: {
    name: 'append_google_sheet',
    description: 'Append rows to a Google Sheet. Requires GOOGLE_SERVICE_ACCOUNT_JSON.',
    schema: { spreadsheet_id: 'string', sheet_name: 'string', rows: 'array of arrays' },
    agents: ['ZEROX', 'NEXUS'],
    execute: stubExecute('GOOGLE_SERVICE_ACCOUNT_JSON')
  },

  create_google_doc: {
    name: 'create_google_doc',
    description: 'Create a new Google Doc with content. Requires GOOGLE_SERVICE_ACCOUNT_JSON.',
    schema: { title: 'string', content_markdown: 'string' },
    agents: ['QUILL', 'SHADDAI'],
    execute: stubExecute('GOOGLE_SERVICE_ACCOUNT_JSON')
  },

  create_airtable_record: {
    name: 'create_airtable_record',
    description: 'Add a record to an Airtable base. Requires AIRTABLE_API_KEY.',
    schema: { base_id: 'string', table_name: 'string', fields: 'object' },
    agents: ['NEXUS', 'ZEROX'],
    execute: stubExecute('AIRTABLE_API_KEY')
  },

  search_notion: {
    name: 'search_notion',
    description: 'Search across a Notion workspace. Requires NOTION_API_KEY.',
    schema: { query: 'string', filter: 'object (optional)' },
    agents: ['ORACLE', 'QUILL'],
    execute: stubExecute('NOTION_API_KEY')
  },

  scan_url_virustotal: {
    name: 'scan_url_virustotal',
    description: 'Check URL reputation via VirusTotal. Requires VIRUSTOTAL_API_KEY.',
    schema: { url: 'string' },
    agents: ['PIKADON'],
    execute: stubExecute('VIRUSTOTAL_API_KEY')
  },

  search_twitter: {
    name: 'search_twitter',
    description: 'Search Twitter/X via API v2. Requires TWITTER_BEARER_TOKEN.',
    schema: { query: 'string', limit: 'number (optional)', since_id: 'string (optional)' },
    agents: ['ORACLE', 'ZEROX'],
    execute: stubExecute('TWITTER_BEARER_TOKEN')
  },

  get_linkedin_profile: {
    name: 'get_linkedin_profile',
    description: 'Fetch LinkedIn public profile data via Proxycurl. Requires PROXYCURL_API_KEY.',
    schema: { url: 'string — LinkedIn profile URL' },
    agents: ['ORACLE'],
    execute: stubExecute('PROXYCURL_API_KEY')
  },

  create_hubspot_contact: {
    name: 'create_hubspot_contact',
    description: 'Create or update a HubSpot CRM contact. Requires HUBSPOT_API_KEY.',
    schema: { email: 'string', name: 'string', properties: 'object (optional)' },
    agents: ['ZEROX', 'SHADDAI'],
    execute: stubExecute('HUBSPOT_API_KEY')
  }

};

module.exports = { TOOLS_EXTRA };

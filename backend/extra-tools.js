// extra-tools.js — new REAL, free, no-API-key tools (from SHADDAI_MEGA_BUILD_SPEC §2).
// Merged into agent-engine's TOOLS registry. Every tool here works with zero config.
const TO = 9000;
async function gj(url, opts) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(TO), headers: { 'User-Agent': 'SHADDAI-Agent/3.0' } }, opts || {}));
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}
const trim = (o, n = 1200) => { try { return JSON.stringify(o).slice(0, n); } catch { return String(o).slice(0, n); } };

module.exports = {
  // ── ORACLE — research ──
  semantic_scholar_search: {
    name: 'semantic_scholar_search', description: 'Search academic papers via Semantic Scholar (free, no key).',
    schema: { query: 'string', limit: 'number (optional, default 5)' }, agents: ['ORACLE','SHADDAI','NEXUS'],
    execute: async ({ query, limit = 5 }) => trim(await gj(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query||'AI')}&limit=${limit}&fields=title,authors,year,abstract,citationCount`)),
  },
  wayback_snapshot: {
    name: 'wayback_snapshot', description: 'Get the archived (Wayback Machine) version of any URL.',
    schema: { url: 'string' }, agents: ['ORACLE','PIKADON','SHADDAI'],
    execute: async ({ url }) => trim(await gj(`https://archive.org/wayback/available?url=${encodeURIComponent(url||'example.com')}`)),
  },
  open_library_search: {
    name: 'open_library_search', description: 'Search books via Open Library (free).',
    schema: { query: 'string' }, agents: ['ORACLE','QUILL'],
    execute: async ({ query }) => { const d = await gj(`https://openlibrary.org/search.json?q=${encodeURIComponent(query||'science')}&limit=5`); return trim((d.docs||[]).map(b => ({ title: b.title, author: (b.author_name||[])[0], year: b.first_publish_year }))); },
  },
  hn_algolia_search: {
    name: 'hn_algolia_search', description: 'Search Hacker News stories via Algolia (free).',
    schema: { query: 'string' }, agents: ['ORACLE','NEXUS','QUILL'],
    execute: async ({ query }) => { const d = await gj(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query||'AI')}&tags=story&hitsPerPage=8`); return trim((d.hits||[]).map(h => ({ title: h.title, url: h.url, points: h.points, comments: h.num_comments }))); },
  },

  // ── ZEROX — DeFi / markets ──
  defillama_tvl: {
    name: 'defillama_tvl', description: 'Total value locked for a DeFi protocol via DefiLlama (free).',
    schema: { protocol: 'string — e.g. uniswap, aave, lido' }, agents: ['ZEROX','ORACLE'],
    execute: async ({ protocol }) => { const d = await gj(`https://api.llama.fi/protocol/${encodeURIComponent(protocol||'uniswap')}`); return trim({ name: d.name, tvl: d.currentChainTvls, category: d.category, chains: d.chains }); },
  },
  defillama_yields: {
    name: 'defillama_yields', description: 'Top DeFi yield opportunities above a min APY (free).',
    schema: { minApy: 'number (optional, default 5)', limit: 'number (optional, default 8)' }, agents: ['ZEROX'],
    execute: async ({ minApy = 5, limit = 8 }) => { const d = await gj('https://yields.llama.fi/pools'); return trim((d.data||[]).filter(p => p.apy >= minApy).slice(0, limit).map(p => ({ project: p.project, symbol: p.symbol, apy: Math.round(p.apy*10)/10, tvl: Math.round(p.tvlUsd) }))); },
  },
  coingecko_trending: {
    name: 'coingecko_trending', description: 'Trending coins on CoinGecko (no key).',
    schema: {}, agents: ['ZEROX','ORACLE'],
    execute: async () => { const d = await gj('https://api.coingecko.com/api/v3/search/trending'); return trim((d.coins||[]).map(c => ({ name: c.item.name, symbol: c.item.symbol, rank: c.item.market_cap_rank }))); },
  },
  jupiter_token_price: {
    name: 'jupiter_token_price', description: 'Solana token price via Jupiter Price API (free).',
    schema: { mint: 'string — token mint or symbol (e.g. SOL)' }, agents: ['ZEROX'],
    execute: async ({ mint }) => trim(await gj(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint||'SOL')}`)),
  },

  // ── NEXUS — dev ──
  npm_package_info: {
    name: 'npm_package_info', description: 'npm package latest version + weekly downloads.',
    schema: { package_name: 'string' }, agents: ['NEXUS','SHADDAI'],
    execute: async ({ package_name }) => { const p = package_name||'express'; const [info, dl] = await Promise.all([gj(`https://registry.npmjs.org/${p}/latest`).catch(()=>({})), gj(`https://api.npmjs.org/downloads/point/last-week/${p}`).catch(()=>({}))]); return trim({ name: info.name, version: info.version, description: info.description, weeklyDownloads: dl.downloads }); },
  },
  bundlephobia_size: {
    name: 'bundlephobia_size', description: 'Bundle size (min+gzip) of an npm package.',
    schema: { package_name: 'string' }, agents: ['NEXUS'],
    execute: async ({ package_name }) => { const d = await gj(`https://bundlephobia.com/api/size?package=${encodeURIComponent(package_name||'react')}`); return trim({ name: d.name, version: d.version, size: d.size, gzip: d.gzip, dependencyCount: d.dependencyCount }); },
  },
  cve_lookup: {
    name: 'cve_lookup', description: 'Look up CVE security vulnerabilities by package/keyword or CVE id (Red Hat security data, free, no key).',
    schema: { query: 'string — package name, keyword, or CVE-id' }, agents: ['PIKADON','NEXUS'],
    execute: async ({ query }) => {
      const q = String(query || 'log4j').trim();
      const isId = /^cve-\d{4}-\d+$/i.test(q);
      const url = isId
        ? `https://access.redhat.com/hydra/rest/securitydata/cve/${encodeURIComponent(q.toUpperCase())}.json`
        : `https://access.redhat.com/hydra/rest/securitydata/cve.json?package=${encodeURIComponent(q)}&per_page=8`;
      const d = await gj(url);
      const list = Array.isArray(d) ? d : [d];
      if (!list.length || (list[0] && list[0].message)) return `No CVEs found for "${q}".`;
      const rows = list.slice(0, 8).map(c => ({
        cve: c.CVE || c.name, severity: c.severity || c.threat_severity,
        cvss: c.cvss_score || c.cvss3_score || null,
        desc: String(c.bugzilla_description || c.details || '').slice(0, 140),
      }));
      return trim({ query: q, count: rows.length, cves: rows }, 1500);
    },
  },

  // ── TURTLE — creative (pure JS, always work) ──
  svg_chart: {
    name: 'svg_chart', description: 'Generate an SVG bar chart from data arrays (pure JS, no API).',
    schema: { data: 'number[]', labels: 'string[] (optional)' }, agents: ['TURTLE','ZEROX','NEXUS'],
    execute: async ({ data, labels = [] }) => {
      const arr = Array.isArray(data) ? data : [5,8,3,9,6]; const W=420,H=260,max=Math.max(...arr,1),bw=(W-40)/arr.length;
      const cols=['#00e5ff','#ff7a18','#7dfdfe','#ffad2e','#b06aff'];
      const bars=arr.map((v,i)=>{ const h=(v/max)*(H-50),x=30+i*bw,y=H-h-25; return `<rect x="${x}" y="${y}" width="${bw-6}" height="${h}" fill="${cols[i%5]}"/><text x="${x+bw/2-3}" y="${H-8}" fill="#9fb0e0" font-size="10" text-anchor="middle">${labels[i]||i+1}</text>`; }).join('');
      return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#020509">${bars}</svg>`;
    },
  },
  color_palette: {
    name: 'color_palette', description: 'Generate a color palette from a seed hex (pure JS, no API).',
    schema: { hex: 'string — e.g. #00e5ff', mode: 'string — analogous|neon|dark' }, agents: ['TURTLE'],
    execute: async ({ hex = '#00e5ff', mode = 'analogous' }) => {
      const h = parseInt(String(hex).replace('#',''),16), r=(h>>16)&255, g=(h>>8)&255, b=h&255;
      const tx=(r,g,b)=>'#'+[r,g,b].map(v=>Math.min(255,Math.max(0,Math.round(v))).toString(16).padStart(2,'0')).join('');
      const m={ analogous:Array.from({length:5},(_,i)=>tx(r+i*18,g+i*12,b-i*8)), neon:Array.from({length:5},(_,i)=>tx(r*0.2,g+i*40,b+i*20)), dark:Array.from({length:5},(_,i)=>tx(r*0.3+i*12,g*0.3+i*12,b*0.3+i*12)) };
      return trim(m[mode]||m.analogous);
    },
  },
  font_pairing: {
    name: 'font_pairing', description: 'Suggest Google Font pairings (display + body) for a style (curated, no API).',
    schema: { style: 'string — modern|elegant|brutal' }, agents: ['TURTLE','QUILL'],
    execute: async ({ style = 'modern' }) => { const p={ modern:[{display:'Orbitron',body:'JetBrains Mono'},{display:'Space Grotesk',body:'Inter'}], elegant:[{display:'Cormorant Garamond',body:'Lato'},{display:'Playfair Display',body:'Source Sans Pro'}], brutal:[{display:'Anton',body:'IBM Plex Mono'},{display:'Archivo Black',body:'Roboto Mono'}] }; return trim(p[style]||p.modern); },
  },

  // ── QUILL — writing (pure JS) ──
  readability_score: {
    name: 'readability_score', description: 'Flesch-Kincaid readability score for text (pure JS).',
    schema: { text: 'string' }, agents: ['QUILL'],
    execute: async ({ text = '' }) => {
      const t=String(text)||'The quick brown fox.'; const sent=t.split(/[.!?]+/).filter(s=>s.trim()).length||1; const words=t.split(/\s+/).filter(Boolean); const syl=words.reduce((a,w)=>a+((w.match(/[aeiouy]{1,2}/gi)||[]).length||1),0);
      const fk=206.835-1.015*(words.length/sent)-84.6*(syl/(words.length||1));
      return trim({ score: Math.round(fk), grade: fk>=70?'Easy':fk>=50?'Standard':'Difficult', words: words.length, sentences: sent });
    },
  },
  tweet_thread: {
    name: 'tweet_thread', description: 'Split long text into a numbered tweet thread (<=240 chars each, pure JS).',
    schema: { text: 'string' }, agents: ['QUILL','TURTLE'],
    execute: async ({ text = '' }) => {
      const words=String(text).split(' '); const out=[]; let cur='';
      words.forEach(w=>{ if((cur+' '+w).length>240){ out.push(cur.trim()); cur=w; } else cur+=' '+w; }); if(cur.trim()) out.push(cur.trim());
      return trim(out.map((t,i)=>`${i+1}/${out.length} ${t}`), 1800);
    },
  },
  rss_fetch: {
    name: 'rss_fetch', description: 'Fetch + parse any RSS feed (via rss2json, free).',
    schema: { url: 'string — RSS feed URL' }, agents: ['QUILL','ORACLE'],
    execute: async ({ url }) => { const d = await gj(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url||'https://hnrss.org/frontpage')}&count=8`); return trim((d.items||[]).map(i => ({ title: i.title, link: i.link, date: i.pubDate }))); },
  },

  // ═══════════════════════════════════════════════════════════════════
  // NEW REAL TOOLS (v2 batch) — all free, no API key, verified live.
  // ═══════════════════════════════════════════════════════════════════

  // ── ORACLE — research / data / discovery ──
  get_iss_location: {
    name: 'get_iss_location', description: 'Live position (lat/long/altitude/velocity) of the International Space Station (Where the ISS at, free, no key).',
    schema: {}, agents: ['ORACLE','SHADDAI'],
    execute: async () => {
      // wheretheiss.at can be slow on a cold call — give it 15s and fall back to Open Notify.
      const one = async (u, map) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'SHADDAI-Agent/3.0' } }); return map(await r.json()); };
      try {
        return trim(await one('https://api.wheretheiss.at/v1/satellites/25544', d => ({ latitude: d.latitude, longitude: d.longitude, altitude_km: d.altitude, velocity_kmh: d.velocity, visibility: d.visibility, timestamp: d.timestamp })));
      } catch {
        return trim(await one('https://api.open-notify.org/iss-now.json', d => ({ latitude: Number(d.iss_position.latitude), longitude: Number(d.iss_position.longitude), timestamp: d.timestamp, source: 'open-notify' })));
      }
    },
  },
  get_space_launches: {
    name: 'get_space_launches', description: 'Upcoming rocket launches worldwide (The Space Devs Launch Library 2, free, no key).',
    schema: { limit: 'number (optional, default 5)' }, agents: ['ORACLE','SHADDAI'],
    execute: async ({ limit = 5 }) => { const d = await gj(`https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=${Math.min(10, limit)}&mode=list`); return trim((d.results||[]).map(l => ({ name: l.name, provider: l.launch_service_provider && l.launch_service_provider.name, window: l.window_start, status: l.status && l.status.name }))); },
  },
  get_public_holidays: {
    name: 'get_public_holidays', description: 'Public holidays for a country + year (Nager.Date, free, no key).',
    schema: { country: 'string — ISO2 code, e.g. US, GB, DE', year: 'number (optional, default current year)' }, agents: ['ORACLE','QUILL'],
    execute: async ({ country = 'US', year }) => { const y = year || new Date().getFullYear(); const d = await gj(`https://date.nager.at/api/v3/PublicHolidays/${y}/${encodeURIComponent(String(country).toUpperCase().slice(0,2))}`); return trim((Array.isArray(d) ? d : []).map(h => ({ date: h.date, name: h.name, localName: h.localName }))); },
  },
  get_trivia_questions: {
    name: 'get_trivia_questions', description: 'Random trivia questions with answers (Open Trivia DB, free, no key).',
    schema: { amount: 'number (optional, default 5)' }, agents: ['ORACLE','QUILL','TURTLE'],
    execute: async ({ amount = 5 }) => { const d = await gj(`https://opentdb.com/api.php?amount=${Math.min(15, amount)}`); const dec = s => String(s||'').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/&eacute;/g,'é'); return trim((d.results||[]).map(q => ({ category: q.category, question: dec(q.question), answer: dec(q.correct_answer) }))); },
  },
  gutenberg_search: {
    name: 'gutenberg_search', description: 'Search 70,000+ free public-domain books (Project Gutenberg via Gutendex, free, no key).',
    schema: { query: 'string — title or author' }, agents: ['ORACLE','QUILL'],
    execute: async ({ query }) => { const d = await gj(`https://gutendex.com/books?search=${encodeURIComponent(query||'shakespeare')}`); return trim((d.results||[]).slice(0,6).map(b => ({ title: b.title, author: (b.authors||[])[0] && b.authors[0].name, downloads: b.download_count, txt: (b.formats||{})['text/plain; charset=us-ascii'] || (b.formats||{})['text/html'] }))); },
  },

  get_horoscope: {
    name: 'get_horoscope', description: 'Daily horoscope for a zodiac sign (Horoscope App API, free, no key).',
    schema: { sign: 'string — aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces' }, agents: ['ORACLE','QUILL','TURTLE'],
    execute: async ({ sign = 'aries' }) => {
      const s = String(sign).trim().toLowerCase();
      const valid = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
      const use = valid.includes(s) ? s : 'aries';
      const r = await fetch(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${use}&day=TODAY`, { signal: AbortSignal.timeout(TO), headers: { 'User-Agent': 'SHADDAI-Agent/3.0' } });
      const d = await r.json();
      return trim({ sign: (d.data && d.data.sign) || use, date: d.data && d.data.date, horoscope: d.data && d.data.horoscope }, 1400);
    },
  },

  // ── ZEROX — markets / money ──
  get_btc_fees: {
    name: 'get_btc_fees', description: 'Recommended Bitcoin network fees in sat/vB by confirmation speed (mempool.space, free, no key).',
    schema: {}, agents: ['ZEROX','ORACLE'],
    execute: async () => trim(await gj('https://mempool.space/api/v1/fees/recommended')),
  },
  convert_currency: {
    name: 'convert_currency', description: 'Convert an amount between two fiat currencies at live rates (open.er-api.com, free, no key).',
    schema: { amount: 'number', from: 'string — ISO code e.g. USD', to: 'string — ISO code e.g. EUR' }, agents: ['ZEROX','SHADDAI'],
    execute: async ({ amount = 1, from = 'USD', to = 'EUR' }) => {
      const f = String(from).toUpperCase(), t = String(to).toUpperCase();
      const d = await gj(`https://open.er-api.com/v6/latest/${encodeURIComponent(f)}`);
      const rate = d && d.rates && d.rates[t];
      if (rate == null) return `No rate for ${f}→${t}.`;
      return trim({ amount: Number(amount), from: f, to: t, rate, result: Math.round(Number(amount) * rate * 1e4) / 1e4, asOf: d.time_last_update_utc });
    },
  },

  // ── NEXUS — dev / data ──
  github_user_info: {
    name: 'github_user_info', description: 'Public GitHub user profile: repos, followers, bio (api.github.com, free, no key).',
    schema: { username: 'string' }, agents: ['NEXUS','ORACLE','SHADDAI'],
    execute: async ({ username }) => { const d = await gj(`https://api.github.com/users/${encodeURIComponent(username||'torvalds')}`); if (d && d.message === 'Not Found') return `GitHub user "${username}" not found.`; return trim({ login: d.login, name: d.name, bio: d.bio, company: d.company, publicRepos: d.public_repos, followers: d.followers, following: d.following, created: d.created_at }); },
  },
  http_headers: {
    name: 'http_headers', description: 'Fetch the HTTP status + response headers for any URL (real request, no key). Useful for debugging + security header checks.',
    schema: { url: 'string' }, agents: ['NEXUS','PIKADON'],
    execute: async ({ url }) => {
      const u = /^https?:\/\//.test(url||'') ? url : 'https://' + (url || 'example.com');
      const r = await fetch(u, { method: 'GET', signal: AbortSignal.timeout(TO), headers: { 'User-Agent': 'SHADDAI-Agent/3.0' } });
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      return trim({ url: u, status: r.status, statusText: r.statusText, server: h.server, contentType: h['content-type'], headers: h }, 1600);
    },
  },
  json_to_csv: {
    name: 'json_to_csv', description: 'Convert a JSON array of objects into CSV text (pure JS, no API).',
    schema: { data: 'object[] — array of flat objects' }, agents: ['NEXUS','QUILL'],
    execute: async ({ data }) => {
      let arr = data; if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return 'Invalid JSON input.'; } }
      if (!Array.isArray(arr) || !arr.length) return 'Provide a non-empty array of objects.';
      const cols = [...new Set(arr.flatMap(o => Object.keys(o || {})))];
      const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const rows = arr.map(o => cols.map(c => esc(o && o[c])).join(','));
      return trim([cols.join(','), ...rows].join('\n'), 1800);
    },
  },
  csv_to_json: {
    name: 'csv_to_json', description: 'Parse CSV text into a JSON array of objects (pure JS, handles quoted fields).',
    schema: { csv: 'string — CSV text with a header row' }, agents: ['NEXUS','QUILL'],
    execute: async ({ csv = '' }) => {
      const text = String(csv).trim(); if (!text) return 'Provide CSV text.';
      const parseLine = l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } } out.push(cur); return out; };
      const lines = text.split(/\r?\n/).filter(l => l.length); const header = parseLine(lines[0]);
      const rows = lines.slice(1).map(l => { const cells = parseLine(l); const o = {}; header.forEach((h, i) => o[h.trim()] = cells[i]); return o; });
      return trim(rows, 1800);
    },
  },

  // ── QUILL — writing / language ──
  word_synonyms: {
    name: 'word_synonyms', description: 'Find synonyms (and related words) for a word (Datamuse, free, no key).',
    schema: { word: 'string' }, agents: ['QUILL','TURTLE'],
    execute: async ({ word }) => { const d = await gj(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word||'happy')}&max=12`); return trim({ word: word || 'happy', synonyms: (Array.isArray(d) ? d : []).map(w => w.word) }); },
  },
  slugify: {
    name: 'slugify', description: 'Convert text into a clean URL slug / handle (pure JS, no API).',
    schema: { text: 'string' }, agents: ['QUILL','NEXUS','TURTLE'],
    execute: async ({ text = '' }) => {
      const slug = String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';
      return trim({ input: String(text).slice(0, 120), slug });
    },
  },
  random_fact: {
    name: 'random_fact', description: 'A random interesting fact (uselessfacts, free, no key).',
    schema: {}, agents: ['QUILL','TURTLE','ORACLE'],
    execute: async () => { const d = await gj('https://uselessfacts.jsph.pl/api/v2/facts/random'); return trim({ fact: d.text, source: d.source }); },
  },

  // ── PIKADON — security / infra ──
  dns_lookup: {
    name: 'dns_lookup', description: 'Resolve DNS records (A/AAAA/MX/TXT/NS/CNAME) for a domain over DNS-over-HTTPS (Google, free, no key).',
    schema: { name: 'string — domain', type: 'string (optional) — A|AAAA|MX|TXT|NS|CNAME, default A' }, agents: ['PIKADON','NEXUS','ORACLE'],
    execute: async ({ name, type = 'A' }) => { const d = await gj(`https://dns.google/resolve?name=${encodeURIComponent(name||'github.com')}&type=${encodeURIComponent(type)}`); return trim({ name: name || 'github.com', type, status: d.Status, answers: (d.Answer||[]).map(a => ({ data: a.data, ttl: a.TTL })) }); },
  },
  rdap_domain: {
    name: 'rdap_domain', description: 'WHOIS/RDAP registration data for a domain: registrar, status, key dates (rdap.org, free, no key).',
    schema: { domain: 'string' }, agents: ['PIKADON','ORACLE'],
    execute: async ({ domain }) => {
      const d = await gj(`https://rdap.org/domain/${encodeURIComponent(domain||'example.com')}`);
      if (d && d.errorCode) return `RDAP: ${d.title || 'not found'} for "${domain}".`;
      const events = {}; (d.events||[]).forEach(e => events[e.eventAction] = e.eventDate);
      const registrar = (d.entities||[]).find(e => (e.roles||[]).includes('registrar'));
      return trim({ domain: d.ldhName, status: d.status, registered: events.registration, expires: events.expiration, lastChanged: events['last changed'], registrar: registrar && registrar.handle, nameservers: (d.nameservers||[]).map(n => n.ldhName) });
    },
  },
  generate_password: {
    name: 'generate_password', description: 'Generate a cryptographically-strong random password (Node crypto, no API).',
    schema: { length: 'number (optional, default 20)', symbols: 'boolean (optional, default true)' }, agents: ['PIKADON','NEXUS'],
    execute: async ({ length = 20, symbols = true }) => {
      const crypto = require('crypto');
      const L = Math.min(128, Math.max(8, parseInt(length) || 20));
      const base = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const chars = base + (symbols === false ? '' : '!@#$%^&*()-_=+[]{}');
      const bytes = crypto.randomBytes(L); let out = '';
      for (let i = 0; i < L; i++) out += chars[bytes[i] % chars.length];
      return trim({ password: out, length: L, entropyBits: Math.round(L * Math.log2(chars.length)) });
    },
  },

  // ── TURTLE — design / accessibility ──
  color_contrast_check: {
    name: 'color_contrast_check', description: 'Compute the WCAG contrast ratio between two hex colors and whether it passes AA/AAA (pure JS, no API).',
    schema: { fg: 'string — hex e.g. #ffffff', bg: 'string — hex e.g. #020509' }, agents: ['TURTLE','PIKADON'],
    execute: async ({ fg = '#ffffff', bg = '#020509' }) => {
      const lum = hex => { const h = String(hex).replace('#',''); const n = h.length === 3 ? h.split('').map(c=>c+c).join('') : h.padEnd(6,'0'); const c = [0,2,4].map(i => { let v = parseInt(n.slice(i,i+2),16)/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
      const r = Math.round(ratio*100)/100;
      return trim({ fg, bg, ratio: r, AA_normal: r >= 4.5, AA_large: r >= 3, AAA_normal: r >= 7 });
    },
  },
};

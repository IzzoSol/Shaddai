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
    execute: async ({ mint }) => trim(await gj(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(mint||'SOL')}`)),
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
};

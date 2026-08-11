// PNL image generator — themed ZEROX action art for Shaddai Signals PNL cards.
// Uses AceDataCloud Flux (ACEDATACLOUD_API_TOKEN) when configured; otherwise
// renders a procedural themed SVG scene so the feature never goes dark.
const express = require('express');
const router = express.Router();

const THEMES = [
  { id: 'luxury', label: 'LUXURY', accent: '#f0c060', bg: ['#0d1a24', '#061018', '#01070c'],
    prompt: 'ZEROX, a suave AI crypto agent in a black and gold tuxedo, toasting champagne on a luxury superyacht at golden-hour sunset, gold bars and diamond bling, cinematic dramatic rim lighting, rich gold and black palette, ultra detailed digital art' },
  { id: 'poker', label: 'HIGH ROLLER', accent: '#ff7c44', bg: ['#241308', '#120a06', '#050302'],
    prompt: 'ZEROX, a cool AI crypto agent in a black fedora and gold-rimmed sunglasses at a high-stakes poker table, stacks of gold chips and aces, neon casino glow and smoke, cinematic, ultra detailed digital art' },
  { id: 'whales', label: 'WHALE RIDER', accent: '#22d3ee', bg: ['#06232e', '#031620', '#020a10'],
    prompt: 'ZEROX, a fearless AI crypto agent diving deep underwater riding massive whales, bioluminescent blue ocean, floating gold coins and bubbles, cinematic underwater lighting, ultra detailed digital art' },
  { id: 'jet', label: 'JET SET', accent: '#8f7bff', bg: ['#1a1533', '#0d0a20', '#050310'],
    prompt: 'ZEROX, a jet-setting AI crypto agent in aviator sunglasses and a leather jacket flying above the clouds in a private jet with a golden rocket trail and money raining, golden hour, cinematic, ultra detailed digital art' },
  { id: 'bull', label: 'BULL RUN', accent: '#00ff9c', bg: ['#0f2418', '#07150d', '#020805'],
    prompt: 'ZEROX, a triumphant AI crypto agent riding a charging golden bull through a trading floor, confetti and rising green candles on glowing screens, cinematic action, ultra detailed digital art' },
  { id: 'moon', label: 'TO THE MOON', accent: '#f4c842', bg: ['#101630', '#070b1c', '#02030a'],
    prompt: 'ZEROX, an AI crypto agent in a sleek spacesuit launching to the moon on a golden rocket, rising green candles as the launchpad, stars and a huge moon, epic cinematic, ultra detailed digital art' },
  { id: 'neon', label: 'NEON NOIR', accent: '#e879f9', bg: ['#1a0a22', '#0e0516', '#04020a'],
    prompt: 'ZEROX, a mysterious AI crypto agent in a trench coat and glowing gold visor in a rainy neon cyberpunk city, holographic candlesticks rising, purple and gold neon reflections, cinematic, ultra detailed digital art' },
  { id: 'lambo', label: 'LAMBO', accent: '#fbbf24', bg: ['#16120a', '#0a0805', '#030201'],
    prompt: 'ZEROX, a flashy AI crypto agent in a gold tracksuit leaning on a matte black Lamborghini, firing a money gun of cash, night city, gold glow, cinematic, ultra detailed digital art' },
];

function pickTheme(excludeId) {
  const pool = THEMES.filter(t => t.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ── AI art via AceDataCloud Flux ─────────────────────────── */
function extractUrl(j) {
  if (!j || typeof j !== 'object') return null;
  if (typeof j.image_url === 'string' && j.image_url.startsWith('http')) return j.image_url;
  if (typeof j.url === 'string' && j.url.startsWith('http')) return j.url;
  if (typeof j.output === 'string' && j.output.startsWith('http')) return j.output;
  if (typeof j.result === 'string' && j.result.startsWith('http')) return j.result;
  if (Array.isArray(j.images)) return extractUrl(j.images[0]);
  if (Array.isArray(j.data)) return extractUrl(j.data[0]);
  if (j.data) return extractUrl(j.data);
  return null;
}

async function fluxArt(prompt) {
  const token = process.env.ACEDATACLOUD_API_TOKEN;
  if (!token) return null;
  try {
    const init = await fetch('https://api.acedata.cloud/flux/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ prompt, model: 'flux-pro-1.1', size: '1024x1024', count: 1 }),
      signal: AbortSignal.timeout(45000),
    });
    const j = await init.json().catch(() => ({}));
    let url = extractUrl(j);
    if (!url && j.task_id) {
      for (let i = 0; i < 9 && !url; i++) {
        await new Promise(r => setTimeout(r, 4000));
        try {
          const t = await fetch('https://api.acedata.cloud/flux/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ task_id: j.task_id }),
            signal: AbortSignal.timeout(20000),
          });
          url = extractUrl(await t.json().catch(() => ({})));
        } catch (e) { /* keep polling */ }
      }
    }
    if (!url) return null;
    const img = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await img.arrayBuffer());
    const mime = (img.headers.get('content-type') || 'image/png').split(';')[0] || 'image/png';
    return 'data:' + mime + ';base64,' + buf.toString('base64');
  } catch (e) {
    console.warn('[pnl] flux failed:', e.message);
    return null;
  }
}

/* ── Procedural SVG fallback (themed scenes) ──────────────── */
function svgArt(theme) {
  const W = 960, H = 900;
  const ac = theme.accent;
  const frag = (theme.scene || (() => ''))(W, H);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="85%">
      <stop offset="0%" stop-color="${theme.bg[0]}"/>
      <stop offset="55%" stop-color="${theme.bg[1]}"/>
      <stop offset="100%" stop-color="${theme.bg[2]}"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffe9a8"/><stop offset="45%" stop-color="#f0c060"/><stop offset="100%" stop-color="#b8860b"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="34"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${frag}
  <g>
    <circle cx="${W / 2}" cy="${H * 0.40}" r="150" fill="none" stroke="url(#gold)" stroke-width="3" opacity="0.9" filter="url(#glow)"/>
    <circle cx="${W / 2}" cy="${H * 0.40}" r="133" fill="none" stroke="url(#gold)" stroke-width="1" opacity="0.4" stroke-dasharray="4 12"/>
    <text x="${W / 2}" y="${H * 0.40 + 46}" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="124" fill="url(#gold)" filter="url(#glow)">Z</text>
    <text x="${W / 2}" y="${H * 0.40 + 82}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="24" fill="#ffe9a8" letter-spacing="8" opacity="0.9">ZEROX</text>
    <text x="${W / 2}" y="${H * 0.40 + 106}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="${ac}" letter-spacing="4" opacity="0.65">AI AGENT · ${theme.label}</text>
  </g>
  <rect x="0" y="${H - 3}" width="${W}" height="3" fill="url(#gold)" opacity="0.55"/>
  <text x="${W - 16}" y="${H - 22}" text-anchor="end" font-family="Arial, sans-serif" font-size="15" fill="url(#gold)" opacity="0.5" letter-spacing="2">SHADDAI SIGNALS</text>
</svg>`;
}

const SVG_SCENES = {
  luxury: (W, H) => `
    <circle cx="${W * 0.78}" cy="${H * 0.2}" r="110" fill="url(#gold)" opacity="0.5" filter="url(#soft)"/>
    <rect x="0" y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="#01070c"/>
    <path d="M0 ${H * 0.8} C ${W * 0.3} ${H * 0.7}, ${W * 0.7} ${H * 0.9}, ${W} ${H * 0.78} L ${W} ${H} L 0 ${H} Z" fill="#0a2b3a" opacity="0.5"/>
    <path d="M0 ${H * 0.86} C ${W * 0.4} ${H * 0.78}, ${W * 0.6} ${H * 0.94}, ${W} ${H * 0.84} L ${W} ${H} L 0 ${H} Z" fill="url(#gold)" opacity="0.14"/>
    <g transform="translate(${W * 0.16},${H * 0.66}) rotate(-18)">
      <rect x="0" y="0" width="70" height="10" rx="3" fill="url(#gold)"/>
      <rect x="70" y="2" width="18" height="6" rx="2" fill="url(#gold)"/>
      <rect x="96" y="-8" width="10" height="26" rx="2" fill="url(#gold)"/>
      <circle cx="30" cy="16" r="8" fill="#0a2b3a" stroke="url(#gold)" stroke-width="2"/>
      <circle cx="86" cy="10" r="5" fill="#0a2b3a" stroke="url(#gold)" stroke-width="1.5"/>
    </g>
    <rect x="${W * 0.72}" y="${H * 0.68}" width="34" height="14" rx="3" fill="url(#gold)" opacity="0.9"/>
    <rect x="${W * 0.78}" y="${H * 0.63}" width="26" height="24" rx="3" fill="url(#gold)" opacity="0.7"/>
    <circle cx="${W * 0.87}" cy="${H * 0.66}" r="10" fill="none" stroke="url(#gold)" stroke-width="3" opacity="0.8"/>`,
  poker: (W, H) => `
    <ellipse cx="${W / 2}" cy="${H * 0.92}" rx="${W * 0.52}" ry="${H * 0.28}" fill="#1a2e1d" opacity="0.85"/>
    <ellipse cx="${W / 2}" cy="${H * 0.92}" rx="${W * 0.45}" ry="${H * 0.22}" fill="#0d2413"/>
    <ellipse cx="${W / 2}" cy="${H * 0.92}" rx="${W * 0.4}" ry="${H * 0.18}" fill="#07170c" opacity="0.6"/>
    <circle cx="${W * 0.5}" cy="${H * 0.62}" r="34" fill="url(#gold)" opacity="0.85"/>
    <circle cx="${W * 0.5}" cy="${H * 0.62}" r="24" fill="none" stroke="#b8860b" stroke-width="3"/>
    <circle cx="${W * 0.42}" cy="${H * 0.68}" r="26" fill="url(#gold)" opacity="0.7"/>
    <circle cx="${W * 0.58}" cy="${H * 0.68}" r="26" fill="url(#gold)" opacity="0.7"/>
    <g transform="translate(${W * 0.3},${H * 0.78}) rotate(-12)">
      <rect x="0" y="0" width="46" height="64" rx="4" fill="#fff" opacity="0.92"/>
      <text x="8" y="44" font-family="Arial Black, Arial" font-weight="900" font-size="34" fill="#d22">A</text>
    </g>
    <g transform="translate(${W * 0.62},${H * 0.8}) rotate(10)">
      <rect x="0" y="0" width="46" height="64" rx="4" fill="#fff" opacity="0.92"/>
      <text x="6" y="44" font-family="Arial Black, Arial" font-weight="900" font-size="34" fill="#111">K</text>
    </g>
    <text x="${W / 2}" y="${H * 0.5}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="20" fill="#ff7c44" letter-spacing="6" opacity="0.8">ALL IN · ALL DAY</text>`,
  whales: (W, H) => `
    <rect x="0" y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="#020a10"/>
    <path d="M0 ${H * 0.7} Q ${W * 0.2} ${H * 0.62}, ${W * 0.4} ${H * 0.7} T ${W} ${H * 0.68} L ${W} ${H} L 0 ${H} Z" fill="#0a3a4a" opacity="0.5"/>
    <path d="M0 ${H * 0.78} Q ${W * 0.25} ${H * 0.72}, ${W * 0.5} ${H * 0.8} T ${W} ${H * 0.76} L ${W} ${H} L 0 ${H} Z" fill="#0d4a5e" opacity="0.4"/>
    <g transform="translate(${W * 0.2},${H * 0.62})">
      <path d="M0 40 C 40 -10, 90 -10, 130 40 L 118 20 C 100 30, 60 34, 40 26 Z" fill="#0e5a72" opacity="0.8"/>
    </g>
    <g transform="translate(${W * 0.68},${H * 0.58}) scale(-1,1)">
      <path d="M0 40 C 40 -10, 90 -10, 130 40 L 118 20 C 100 30, 60 34, 40 26 Z" fill="#0e5a72" opacity="0.8"/>
    </g>
    <circle cx="${W * 0.3}" cy="${H * 0.42}" r="14" fill="none" stroke="#7fd9ea" stroke-width="2" opacity="0.5"/>
    <circle cx="${W * 0.33}" cy="${H * 0.36}" r="8" fill="none" stroke="#7fd9ea" stroke-width="1.5" opacity="0.4"/>
    <circle cx="${W * 0.68}" cy="${H * 0.3}" r="11" fill="none" stroke="#7fd9ea" stroke-width="2" opacity="0.5"/>
    <circle cx="${W * 0.71}" cy="${H * 0.25}" r="6" fill="none" stroke="#7fd9ea" stroke-width="1.5" opacity="0.4"/>
    <circle cx="${W * 0.52}" cy="${H * 0.55}" r="5" fill="#f0c060" opacity="0.7"/>
    <circle cx="${W * 0.56}" cy="${H * 0.5}" r="3" fill="#f0c060" opacity="0.5"/>`,
  jet: (W, H) => `
    <ellipse cx="${W * 0.28}" cy="${H * 0.24}" rx="90" ry="26" fill="#f4f4ff" opacity="0.14" filter="url(#soft)"/>
    <ellipse cx="${W * 0.74}" cy="${H * 0.34}" rx="120" ry="34" fill="#f4f4ff" opacity="0.10" filter="url(#soft)"/>
    <ellipse cx="${W * 0.5}" cy="${H * 0.9}" rx="220" ry="40" fill="#f4f4ff" opacity="0.06" filter="url(#soft)"/>
    <path d="M ${W * 0.86} ${H * 0.16} C ${W * 0.55} ${H * 0.28}, ${W * 0.5} ${H * 0.34}, ${W * 0.32} ${H * 0.42}" stroke="#ffe9a8" stroke-width="3" stroke-dasharray="2 16" fill="none" opacity="0.7"/>
    <g transform="translate(${W * 0.66},${H * 0.5}) rotate(-16)">
      <path d="M0 0 L 150 8 L 150 20 L 0 28 Z" fill="#dfe8f0" opacity="0.85"/>
      <path d="M150 8 L 210 14 L 210 14 Z" fill="none"/>
      <rect x="0" y="6" width="150" height="16" rx="8" fill="#0d0a20"/>
      <path d="M130 8 L 150 2 L 150 22 L 130 20 Z" fill="#8f7bff"/>
      <rect x="40" y="2" width="12" height="8" rx="2" fill="#ffe9a8"/>
      <path d="M40 2 L 52 2 L 46 -6 Z" fill="#ffe9a8"/>
      <rect x="96" y="2" width="12" height="8" rx="2" fill="#ffe9a8"/>
      <path d="M96 2 L 108 2 L 102 -6 Z" fill="#ffe9a8"/>
      <rect x="40" y="20" width="12" height="8" rx="2" fill="#ffe9a8"/>
      <rect x="96" y="20" width="12" height="8" rx="2" fill="#ffe9a8"/>
    </g>
    <g transform="translate(${W * 0.18},${H * 0.86})">
      <rect x="0" y="0" width="20" height="34" rx="2" fill="#00ff9c" opacity="0.6"/>
      <rect x="24" y="8" width="20" height="34" rx="2" fill="#00ff9c" opacity="0.8"/>
      <rect x="48" y="0" width="20" height="34" rx="2" fill="#00ff9c" opacity="0.5"/>
    </g>`,
  bull: (W, H) => `
    <ellipse cx="${W * 0.16}" cy="${H * 0.3}" rx="90" ry="90" fill="#ff3d5a" opacity="0.12" filter="url(#soft)"/>
    <rect x="${W * 0.72}" y="${H * 0.14}" width="22" height="46" rx="3" fill="#00ff9c" opacity="0.8"/>
    <rect x="${W * 0.78}" y="${H * 0.06}" width="22" height="46" rx="3" fill="#00ff9c" opacity="0.9"/>
    <rect x="${W * 0.84}" y="${H * 0.2}" width="22" height="46" rx="3" fill="#00ff9c" opacity="0.6"/>
    <rect x="${W * 0.78}" y="${H * 0.02}" width="2" height="52" fill="#ff3d5a" opacity="0.5"/>
    <g transform="translate(${W * 0.5},${H * 0.62})">
      <path d="M -70 -30 C -60 -70, -20 -70, -10 -30 L -18 -52 C -30 -52, -45 -50, -55 -34 Z" fill="#f0c060" opacity="0.9"/>
      <path d="M 70 -30 C 60 -70, 20 -70, 10 -30 L 18 -52 C 30 -52, 45 -50, 55 -34 Z" fill="#f0c060" opacity="0.9"/>
      <circle cx="0" cy="10" r="52" fill="#0d2b1c"/>
      <circle cx="-20" cy="0" r="7" fill="#f0c060"/>
      <circle cx="20" cy="0" r="7" fill="#f0c060"/>
      <path d="M -18 24 Q 0 34, 18 24" stroke="#f0c060" stroke-width="3" fill="none"/>
    </g>
    <text x="${W * 0.16}" y="${H * 0.82}" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="34" fill="#00ff9c" letter-spacing="2" opacity="0.75">BULL RUN</text>`,
  moon: (W, H) => `
    <circle cx="${W * 0.78}" cy="${H * 0.2}" r="80" fill="#f4f4ff" opacity="0.9" filter="url(#glow)"/>
    <circle cx="${W * 0.78}" cy="${H * 0.2}" r="66" fill="#e8e8f0"/>
    <circle cx="${W * 0.74}" cy="${H * 0.18}" r="12" fill="#c8c8d4" opacity="0.7"/>
    <circle cx="${W * 0.82}" cy="${H * 0.24}" r="8" fill="#c8c8d4" opacity="0.7"/>
    <circle cx="${W * 0.2}" cy="${H * 0.12}" r="2" fill="#fff" opacity="0.8"/><circle cx="${W * 0.34}" cy="${H * 0.2}" r="1.5" fill="#fff" opacity="0.7"/>
    <circle cx="${W * 0.1}" cy="${H * 0.3}" r="2" fill="#fff" opacity="0.6"/><circle cx="${W * 0.9}" cy="${H * 0.42}" r="1.5" fill="#fff" opacity="0.5"/>
    <path d="M ${W * 0.56} ${H * 0.52} L ${W * 0.44} ${H * 0.7} L ${W * 0.68} ${H * 0.66} Z" fill="#f0c060"/>
    <rect x="${W * 0.55}" y="${H * 0.5}" width="8" height="${H * 0.3}" fill="#b8860b"/>
    <ellipse cx="${W * 0.55}" cy="${H * 0.72}" rx="22" ry="8" fill="#ffe9a8" opacity="0.7"/>
    <path d="M ${W * 0.55} ${H * 0.74} Q ${W * 0.55} ${H * 0.86}, ${W * 0.55} ${H * 0.92}" stroke="#f4c842" stroke-width="5" stroke-dasharray="6 12" fill="none" opacity="0.6"/>
    <g transform="translate(${W * 0.3},${H * 0.88})">
      <rect x="0" y="0" width="18" height="40" rx="3" fill="#00ff9c" opacity="0.8"/>
      <rect x="22" y="8" width="18" height="40" rx="3" fill="#00ff9c" opacity="0.6"/>
    </g>`,
  neon: (W, H) => `
    <g fill="#0d0512">
      <rect x="0" y="${H * 0.55}" width="70" height="${H * 0.45}"/><rect x="80" y="${H * 0.5}" width="60" height="${H * 0.5}"/>
      <rect x="150" y="${H * 0.6}" width="80" height="${H * 0.4}"/><rect x="240" y="${H * 0.48}" width="66" height="${H * 0.52}"/>
      <rect x="316" y="${H * 0.58}" width="90" height="${H * 0.42}"/><rect x="416" y="${H * 0.5}" width="60" height="${H * 0.5}"/>
      <rect x="486" y="${H * 0.62}" width="80" height="${H * 0.38}"/><rect x="576" y="${H * 0.5}" width="70" height="${H * 0.5}"/>
      <rect x="656" y="${H * 0.58}" width="90" height="${H * 0.42}"/><rect x="756" y="${H * 0.48}" width="60" height="${H * 0.52}"/>
      <rect x="826" y="${H * 0.6}" width="80" height="${H * 0.4}"/><rect x="916" y="${H * 0.52}" width="70" height="${H * 0.48}"/>
    </g>
    <rect x="80" y="${H * 0.5}" width="60" height="3" fill="#e879f9" opacity="0.8"/>
    <rect x="240" y="${H * 0.48}" width="66" height="3" fill="#22d3ee" opacity="0.8"/>
    <rect x="576" y="${H * 0.5}" width="70" height="3" fill="#e879f9" opacity="0.8"/>
    <rect x="756" y="${H * 0.48}" width="60" height="3" fill="#f0c060" opacity="0.9"/>
    <g stroke="#8fd8f4" stroke-width="1" opacity="0.25">
      <line x1="20" y1="10" x2="40" y2="70"/><line x1="90" y1="10" x2="110" y2="70"/><line x1="160" y1="10" x2="180" y2="70"/>
      <line x1="300" y1="10" x2="320" y2="70"/><line x1="430" y1="10" x2="450" y2="70"/><line x1="560" y1="10" x2="580" y2="70"/>
      <line x1="700" y1="10" x2="720" y2="70"/><line x1="830" y1="10" x2="850" y2="70"/><line x1="920" y1="10" x2="940" y2="70"/>
    </g>
    <path d="M ${W * 0.28} ${H * 0.5} L ${W * 0.36} ${H * 0.34} L ${W * 0.42} ${H * 0.5}" stroke="#f0c060" stroke-width="3" fill="none" opacity="0.9"/>
    <path d="M ${W * 0.6} ${H * 0.5} L ${W * 0.68} ${H * 0.4} L ${W * 0.76} ${H * 0.5}" stroke="#00ff9c" stroke-width="3" fill="none" opacity="0.9"/>`,
  lambo: (W, H) => `
    <ellipse cx="${W * 0.5}" cy="${H * 0.2}" rx="160" ry="60" fill="#fbbf24" opacity="0.06" filter="url(#soft)"/>
    <g transform="translate(${W * 0.5},${H * 0.72})">
      <path d="M -160 10 C -150 -18, -90 -30, -30 -26 C -10 -26, 40 -26, 70 -18 L 150 -8 L 160 10 L -160 10 Z" fill="#0a0805"/>
      <path d="M -140 10 C -130 -8, -80 -16, -30 -14 C 20 -14, 80 -10, 140 -2 L 140 10 Z" fill="#161006"/>
      <rect x="-40" y="-26" width="70" height="20" rx="8" fill="#0d0a06"/>
      <rect x="-24" y="-22" width="52" height="12" rx="6" fill="#17110a"/>
      <circle cx="-120" cy="14" r="20" fill="#060403"/><circle cx="-120" cy="14" r="9" fill="#2a1f14"/>
      <circle cx="120" cy="14" r="20" fill="#060403"/><circle cx="120" cy="14" r="9" fill="#2a1f14"/>
      <path d="M -160 10 L -205 26 M 160 10 L 205 26" stroke="#fbbf24" stroke-width="3" opacity="0.7"/>
    </g>
    <g transform="translate(${W * 0.12},${H * 0.16})">
      <rect x="0" y="0" width="26" height="40" rx="3" fill="#00ff9c" opacity="0.75"/>
      <rect x="30" y="6" width="26" height="40" rx="3" fill="#00ff9c" opacity="0.55"/>
      <rect x="60" y="0" width="26" height="40" rx="3" fill="#00ff9c" opacity="0.7"/>
      <rect x="90" y="8" width="26" height="40" rx="3" fill="#00ff9c" opacity="0.5"/>
    </g>
    <g transform="translate(${W * 0.72},${H * 0.16})">
      <rect x="0" y="0" width="26" height="40" rx="3" fill="#00ff9c" opacity="0.55"/>
      <rect x="30" y="6" width="26" height="40" rx="3" fill="#00ff9c" opacity="0.75"/>
    </g>`,
};

THEMES.forEach(t => { t.scene = SVG_SCENES[t.id]; t.bg = t.bg || ['#0a0f14', '#05080c', '#02040a']; });

/* ── Route ─────────────────────────────────────────────────── */
router.post('/generate', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const b = req.body || {};
    const symbol = String(b.symbol || '?').replace(/[^a-zA-Z0-9$.\-]/g, '').slice(0, 12) || '?';
    const name = String(b.name || '').replace(/[<>]/g, '').slice(0, 40);
    const mint = String(b.mint || '').slice(0, 64);
    const entryFdv = Math.max(0, Number(b.entryFdv) || 0);
    const entryPrice = Math.max(0, Number(b.entryPrice) || 0);
    const peakMult = Math.max(0.1, Number(b.peakMult) || 1);
    const cur = Math.max(0, Number(b.currentMult));
    const ts = Number(b.ts) || Date.now();
    const source = String(b.source || 'signals').slice(0, 24);
    const theme = pickTheme(b.theme || null);

    const prompt = `${theme.prompt} ZEROX is the mascot of Shaddai Signals, a crypto signal platform promoting $${symbol}.`;
    let art = null, ai = false;
    art = await fluxArt(prompt);
    if (art) ai = true;
    else art = 'data:image/svg+xml;base64,' + Buffer.from(svgArt(theme)).toString('base64');

    res.json({
      ok: true,
      theme: theme.id,
      themeLabel: theme.label,
      ai,
      art,
      data: { symbol, name, mint, entryFdv, entryPrice, peakMult, currentMult: cur, ts, source },
    });
  } catch (e) {
    console.warn('[pnl] generate error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

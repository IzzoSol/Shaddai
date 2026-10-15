// Generates the unified SHADDAI arcade cover set (768x1024 SVG, no text — the page overlays titles).
// Run: node tools/gen-arcade-covers.mjs   Output: public/assets/games/covers/<id>.svg
import { writeFileSync } from 'node:fs';
const OUT = new URL('../public/assets/games/covers/', import.meta.url);
const GOLD = '#e8c45c';

const emblems = {
  blackjack: (c) => `
    <g transform="translate(384 470)">
      <g transform="rotate(-16 0 0) translate(-150 -170)"><rect width="190" height="270" rx="16" fill="#0b1016" stroke="${GOLD}" stroke-width="3"/><path d="M95 70c-30 38-50 60-50 88a28 28 0 0 0 50 16 28 28 0 0 0 50-16c0-28-20-50-50-88z" fill="${GOLD}" opacity=".9"/></g>
      <g transform="rotate(14 0 0) translate(-30 -190)"><rect width="190" height="270" rx="16" fill="#0b1016" stroke="${c}" stroke-width="3"/><path d="M95 60l34 62-34 62-34-62z" fill="${c}"/></g>
      <circle cx="120" cy="190" r="62" fill="#06080b" stroke="${GOLD}" stroke-width="4"/><circle cx="120" cy="190" r="44" fill="none" stroke="${GOLD}" stroke-width="2" stroke-dasharray="10 8"/>
    </g>`,
  football: (c) => `
    <g transform="translate(384 470) rotate(-28)">
      <ellipse rx="210" ry="128" fill="#0b1016" stroke="${c}" stroke-width="5"/>
      <path d="M-210 0h420M-60 -20v40M-20 -22v44M20 -22v44M60 -20v40" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/>
      <path d="M-140 -92q-30 92 0 184M140 -92q30 92 0 184" fill="none" stroke="${c}" stroke-width="3" opacity=".7"/>
    </g>`,
  hoops: (c) => `
    <g transform="translate(384 460)">
      <circle r="170" fill="#0b1016" stroke="${c}" stroke-width="5"/>
      <path d="M-170 0h340M0 -170v340M-120 -120c60 50 60 190 0 240M120 -120c-60 50-60 190 0 240" fill="none" stroke="${c}" stroke-width="4" opacity=".85"/>
      <ellipse cx="0" cy="-230" rx="120" ry="26" fill="none" stroke="${GOLD}" stroke-width="7"/>
      <path d="M-110 -222l40 120M-40 -204l15 105M40 -204l-15 105M110 -222l-40 120" stroke="${GOLD}" stroke-width="2.5" opacity=".7"/>
    </g>`,
  starfall: (c) => `
    <g transform="translate(384 470)">
      <path d="M0 -220L120 150 0 90-120 150z" fill="#0b1016" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M0 -150V80M-60 40L0 -20 60 40" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
      <path d="M-40 130L0 250 40 130z" fill="${c}" opacity=".85"/>
      <g stroke="${c}" stroke-width="3" opacity=".75"><path d="M-250 -240l18 40M210 -280l14 36M-210 -120l10 26M240 -60l12 34"/></g>
      <path d="M0 -240V-420" stroke="${GOLD}" stroke-width="3" stroke-dasharray="4 14" stroke-linecap="round"/>
    </g>`,
  dodgeball: (c) => `
    <g transform="translate(430 470)">
      <path d="M-400 -40h250M-380 20h230M-340 80h190M-300 -100h150" stroke="${c}" stroke-width="6" stroke-linecap="round" opacity=".5"/>
      <circle r="150" fill="#0b1016" stroke="${c}" stroke-width="6"/>
      <path d="M-150 0q150 -90 300 0M-150 0q150 90 300 0M0 -150q-90 150 0 300" fill="none" stroke="${GOLD}" stroke-width="4" opacity=".85"/>
    </g>`,
  soccer: (c) => `
    <g transform="translate(384 470)">
      <circle r="170" fill="#0b1016" stroke="${c}" stroke-width="5"/>
      <polygon points="0,-62 59,-19 36,50 -36,50 -59,-19" fill="${c}"/>
      <g stroke="${c}" stroke-width="4" fill="none"><path d="M0 -62V-170M59 -19L162 -52M36 50L100 138M-36 50L-100 138M-59 -19L-162 -52"/></g>
      <g fill="${GOLD}" opacity=".9"><polygon points="170,-8 150,50 118,34 122,-24"/><polygon points="-170,-8 -150,50 -118,34 -122,-24"/></g>
    </g>`,
  'dreamers-climb': (c) => `
    <g transform="translate(384 520)">
      <g fill="#0b1016" stroke="${c}" stroke-width="4"><rect x="-190" y="150" width="170" height="26" rx="6"/><rect x="-60" y="30" width="150" height="26" rx="6"/><rect x="-170" y="-90" width="140" height="26" rx="6"/><rect x="10" y="-210" width="170" height="26" rx="6"/></g>
      <circle cx="95" cy="-262" r="30" fill="${GOLD}"/><circle cx="95" cy="-262" r="52" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".6"/>
      <path d="M-100 140q40 -60 60 -90M10 20q-20 -50 -90 -90M-80 -100q80 -40 110 -100" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="3 12" stroke-linecap="round"/>
    </g>`,
  'white-house-accord': (c) => `
    <g transform="translate(384 480)">
      <path d="M-210 -90L0 -210 210 -90z" fill="#0b1016" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/>
      <rect x="-210" y="-82" width="420" height="22" fill="#0b1016" stroke="${GOLD}" stroke-width="3"/>
      <g fill="#0b1016" stroke="${c}" stroke-width="3">${[-170,-102,-34,34,102].map(x=>`<rect x="${x}" y="-56" width="30" height="170" rx="4"/>`).join('')}</g>
      <rect x="-230" y="116" width="460" height="26" fill="#0b1016" stroke="${GOLD}" stroke-width="3"/>
      <rect x="-250" y="144" width="500" height="22" fill="#0b1016" stroke="${GOLD}" stroke-width="3"/>
      <circle cx="0" cy="-150" r="20" fill="${c}"/>
    </g>`,
};
const colors = { blackjack:'#c9a227', football:'#ff5a4a', hoops:'#ff9d3d', starfall:'#00f0ff', dodgeball:'#ff5db1', soccer:'#00ff9c', 'dreamers-climb':'#8a6aff', 'white-house-accord':'#e8c45c' };

function cover(id, c) {
  const grid = Array.from({ length: 9 }, (_, i) => {
    const y = 700 + Math.pow(i / 8, 1.8) * 324;
    return `<line x1="0" x2="768" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join('') + Array.from({ length: 13 }, (_, i) => {
    const x = (i - 6) * 150;
    return `<line x1="384" y1="700" x2="${384 + x * 3.2}" y2="1024"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 1024" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06080b"/><stop offset=".55" stop-color="${c}" stop-opacity=".16"/><stop offset="1" stop-color="#06080b"/></linearGradient>
<radialGradient id="halo" cx=".5" cy=".46" r=".5"><stop offset="0" stop-color="${c}" stop-opacity=".42"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
<filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="768" height="1024" fill="#06080b"/><rect width="768" height="1024" fill="url(#bg)"/><rect width="768" height="1024" fill="url(#halo)"/>
<g stroke="${c}" stroke-opacity=".35" stroke-width="1.4">${grid}</g>
<g stroke="${c}" stroke-opacity=".12" stroke-width="1">${Array.from({length:12},(_,i)=>`<circle cx="384" cy="470" r="${120+i*48}" fill="none"/>`).join('')}</g>
<g filter="url(#gl)">${emblems[id](c)}</g>
<g fill="none" stroke="${GOLD}" stroke-opacity=".7" stroke-width="2"><path d="M24 72V24h48M696 24h48v48M744 952v48h-48M72 1000H24v-48"/></g>
<rect x="12" y="12" width="744" height="1000" fill="none" stroke="${c}" stroke-opacity=".25"/>
</svg>`;
}
for (const [id, c] of Object.entries(colors)) writeFileSync(new URL(id === 'blackjack' ? 'blackjack.svg' : id + '.svg', OUT), cover(id, c));
console.log('wrote', Object.keys(colors).length, 'covers');

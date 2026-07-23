import { readFileSync, readdirSync, existsSync } from 'fs';
const K = readFileSync('C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/ai.key','utf8').trim();

// --- peek at cloned repos (top level) ---
const home = 'C:/Users/Brittany';
for (const r of ['game-skills','garden-skills','huashu-design','Waza']) {
  const p = `${home}/${r}`;
  if (existsSync(p)) {
    try { console.log(`\n[repo] ${r}:`, readdirSync(p).slice(0,25).join(', ')); }
    catch(e){ console.log(`[repo] ${r}: ${e.message}`); }
  } else console.log(`[repo] ${r}: (missing)`);
}

// --- identify the sc_live_ key's service (status codes only, key never printed) ---
const tests = [
  ['Scenario(Bearer)', 'https://api.cloud.scenario.com/v1/models', {Authorization:`Bearer ${K}`}],
  ['Scenario(Basic)',  'https://api.cloud.scenario.com/v1/models', {Authorization:`Basic ${Buffer.from(K+':').toString('base64')}`}],
  ['Recraft',          'https://external.api.recraft.ai/v1/users/me', {Authorization:`Bearer ${K}`}],
  ['PixelLab',         'https://api.pixellab.ai/v1/balance', {Authorization:`Bearer ${K}`}],
  ['Leonardo',         'https://cloud.leonardo.ai/api/rest/v1/me', {Authorization:`Bearer ${K}`}],
];
console.log('\n--- key identity probe (status only) ---');
for (const [name,url,headers] of tests) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    let hint = '';
    if (res.ok) { const t = await res.text(); hint = ' :: ' + t.slice(0,90).replace(/\s+/g,' '); }
    console.log(`${name}: ${res.status}${res.ok ? ' ✔ MATCH' : ''}${hint}`);
  } catch (e) { console.log(`${name}: ERR ${e.name}`); }
}

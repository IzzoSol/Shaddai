import { readFileSync } from 'fs';
import dns from 'dns/promises';
const K = readFileSync('C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/ai.key','utf8').trim();
for (const h of ['api.acedata.cloud','platform.acedata.cloud','acedata.cloud','api.acedatacloud.com']) {
  try { const a = await dns.lookup(h); console.log(`DNS ${h} -> ${a.address}`); }
  catch (e) { console.log(`DNS ${h} -> ERR ${e.code}`); }
}
console.log('--- try POST /flux/images ---');
try {
  const res = await fetch('https://api.acedata.cloud/flux/images', {
    method:'POST',
    headers:{ Authorization:`Bearer ${K}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ prompt:'test', model:'flux-dev', callback_url:'https://api.acedata.cloud/health' }),
    signal: AbortSignal.timeout(30000),
  });
  const t = await res.text();
  console.log('status', res.status, '::', t.slice(0,300));
} catch (e) { console.log('POST ERR', e.name, e.message); }

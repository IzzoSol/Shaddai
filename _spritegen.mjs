import { writeFileSync } from 'fs';
const URL = 'https://www.sprite-ai.art/api/mcp';
const KEY = 'sai_sk_a671d048d289e00866fc278630d94a904dda16afb3144c9a1b1da845fcc96aac';
let session = null;
function parseBody(txt, ctype) {
  if (ctype && ctype.includes('text/event-stream')) {
    const objs = txt.split(/\r?\n/).filter(l => l.startsWith('data:'))
      .map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } }).filter(Boolean);
    return objs[objs.length - 1];
  }
  try { return JSON.parse(txt); } catch { return { raw: txt.slice(0, 500) }; }
}
async function rpc(method, params, isNote = false) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${KEY}` };
  if (session) headers['Mcp-Session-Id'] = session;
  const body = { jsonrpc: '2.0', method, params };
  if (!isNote) body.id = Math.floor(Math.random() * 1e6);
  const res = await fetch(URL, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const sid = res.headers.get('mcp-session-id'); if (sid) session = sid;
  return { status: res.status, data: parseBody(await res.text(), res.headers.get('content-type') || '') };
}
async function gen(spec, outName) {
  const r = await rpc('tools/call', { name: 'sprite_generate', arguments: spec });
  const content = r.data?.result?.content || [];
  let saved = null;
  for (const c of content) {
    if (c.type === 'text') console.log(`  [${outName}] ${c.text.slice(0, 300)}`);
    else if (c.type === 'image' && c.data) { saved = `${outName}.png`; writeFileSync(saved, Buffer.from(c.data, 'base64')); console.log(`  [${outName}] image -> ${saved} (${Buffer.from(c.data,'base64').length} bytes)`); }
  }
  if (r.data?.result?.isError) console.log(`  [${outName}] isError`);
  if (r.status !== 200) console.log(`  [${outName}] HTTP ${r.status} ${JSON.stringify(r.data).slice(0,200)}`);
  return saved;
}

await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'shaddai', version: '1' } });
await rpc('notifications/initialized', {}, true);

// --- the rest of the small citizen set (char1 already generated) ---
const base = { asset_type: 'character', width: 256, height: 256, camera_perspective: 'isometric', direction: 'south' };
const cast = [
  ['_sprite_char2', 'young woman in a casual hoodie and jeans, full body standing, bright saturated colors, clean readable game character'],
  ['_sprite_char3', 'athlete in a sports jersey holding a basketball, full body standing, bright saturated colors, clean readable game character'],
  ['_sprite_char4', 'woman in an elegant summer dress, full body standing, bright saturated colors, clean readable game character'],
  ['_sprite_char5', 'hooded traveler in a cloak with a backpack, full body standing, bright saturated colors, clean readable game character'],
];
for (const [name, prompt] of cast) {
  await gen({ ...base, prompt }, name);
}

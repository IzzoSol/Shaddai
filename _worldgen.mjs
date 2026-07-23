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
  try {
    const r = await rpc('tools/call', { name: 'sprite_generate', arguments: spec });
    const content = r.data?.result?.content || [];
    for (const c of content) {
      if (c.type === 'text') console.log(`  [${outName}] ${c.text.slice(0, 200)}`);
      else if (c.type === 'image' && c.data) { writeFileSync(`${outName}.png`, Buffer.from(c.data, 'base64')); console.log(`  [${outName}] -> ${outName}.png`); }
    }
    if (r.data?.result?.isError) console.log(`  [${outName}] isError`);
  } catch (e) { console.log(`  [${outName}] ERR ${e.message}`); }
}
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'shaddai', version: '1' } });
await rpc('notifications/initialized', {}, true);

const items = [
  ['_world_grass', { asset_type:'tile',    width:128, height:128, camera_perspective:'isometric', prompt:'isometric grass ground tile, lush bright green, subtle texture, seamless top face, clean readable pixel art, game tile' }],
  ['_world_tree',  { asset_type:'prop',    width:256, height:256, camera_perspective:'isometric', prompt:'isometric stylized round tree, bright green foliage, brown trunk, soft shadow, clean readable pixel art, game prop' }],
  ['_world_house', { asset_type:'prop',    width:256, height:256, camera_perspective:'isometric', prompt:'isometric small cozy town house with a pitched roof, bright cheerful colors, clean readable pixel art, game building' }],
  ['_world_car',   { asset_type:'vehicle', width:256, height:256, camera_perspective:'isometric', prompt:'isometric cute compact city car, glossy bright paint, clean readable pixel art, game vehicle' }],
  ['_world_lamp',  { asset_type:'prop',    width:256, height:256, camera_perspective:'isometric', prompt:'isometric vintage street lamp post with a warm glowing light, clean readable pixel art, game prop' }],
];
for (const [name, spec] of items) await gen(spec, name);
console.log('done');

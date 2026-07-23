// Generic sprite-ai MCP caller: node _spritecall.mjs <tool> '<json-args>' [outPrefix]
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

const [tool, argsJson, outPrefix] = process.argv.slice(2);
const args = argsJson ? JSON.parse(argsJson) : {};
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'shaddai', version: '1' } });
await rpc('notifications/initialized', {}, true);
const r = await rpc('tools/call', { name: tool, arguments: args });
if (r.status !== 200) { console.log('HTTP', r.status, JSON.stringify(r.data).slice(0, 400)); process.exit(1); }
const content = r.data?.result?.content || [];
let imgN = 0;
for (const c of content) {
  if (c.type === 'text') console.log('[text]', c.text.slice(0, 800));
  else if (c.type === 'image' && c.data) {
    const f = `${outPrefix || '_sprite_out'}_${imgN++}.png`;
    writeFileSync(f, Buffer.from(c.data, 'base64'));
    console.log('[image saved]', f, Buffer.from(c.data, 'base64').length, 'bytes');
  } else console.log('[other]', JSON.stringify(c).slice(0, 200));
}
if (r.data?.result?.isError) console.log('[isError=true]');
if (!content.length) console.log('raw result:', JSON.stringify(r.data).slice(0, 600));

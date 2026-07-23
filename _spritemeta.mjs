const URL = 'https://www.sprite-ai.art/api/mcp';
const SAI = 'sai_sk_a671d048d289e00866fc278630d94a904dda16afb3144c9a1b1da845fcc96aac';
const SC  = 'sc_live_265b25b1785c32b77f01f39d997c2f872831309f55a7f007';

function parseBody(txt, ctype) {
  if (ctype && ctype.includes('text/event-stream')) {
    const objs = txt.split(/\r?\n/).filter(l => l.startsWith('data:'))
      .map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } }).filter(Boolean);
    return objs[objs.length - 1];
  }
  try { return JSON.parse(txt); } catch { return { raw: txt.slice(0, 300) }; }
}
async function rpc(key, method, params, session, isNote) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${key}` };
  if (session.id) headers['Mcp-Session-Id'] = session.id;
  const body = { jsonrpc: '2.0', method, params }; if (!isNote) body.id = Math.floor(Math.random()*1e6);
  const res = await fetch(URL, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const sid = res.headers.get('mcp-session-id'); if (sid) session.id = sid;
  return { status: res.status, data: parseBody(await res.text(), res.headers.get('content-type') || '') };
}
async function boot(key) { const s = {}; await rpc(key, 'initialize', { protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{name:'x',version:'1'} }, s); await rpc(key, 'notifications/initialized', {}, s, true); return s; }

// 1) full schema for sprite_generate (perspective/direction enums)
const s1 = await boot(SAI);
const tl = await rpc(SAI, 'tools/list', {}, s1);
const gen = (tl.data?.result?.tools || []).find(t => t.name === 'sprite_generate');
console.log('=== sprite_generate inputSchema ===');
console.log(JSON.stringify(gen?.inputSchema, null, 1));

// 2) is the sc_live_ key a valid sprite-ai key with its own tokens?
console.log('\n=== sc_live_ key on sprite-ai (balance) ===');
try {
  const s2 = await boot(SC);
  const bal = await rpc(SC, 'tools/call', { name: 'sprite_get_balance', arguments: {} }, s2);
  console.log('status', bal.status, '::', JSON.stringify(bal.data).slice(0, 300));
} catch (e) { console.log('sc_live ERR', e.message); }

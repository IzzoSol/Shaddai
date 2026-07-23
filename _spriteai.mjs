// Minimal MCP (streamable-HTTP) client for sprite-ai. Lists tools.
const URL = 'https://www.sprite-ai.art/api/mcp';
const KEY = 'sai_sk_a671d048d289e00866fc278630d94a904dda16afb3144c9a1b1da845fcc96aac';
let session = null;

function parseBody(txt, ctype) {
  if (ctype && ctype.includes('text/event-stream')) {
    // grab last data: line JSON
    const lines = txt.split(/\r?\n/).filter(l => l.startsWith('data:'));
    const objs = lines.map(l => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } }).filter(Boolean);
    return objs[objs.length - 1];
  }
  try { return JSON.parse(txt); } catch { return { raw: txt.slice(0, 400) }; }
}

async function rpc(method, params, isNotification = false) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${KEY}`,
  };
  if (session) headers['Mcp-Session-Id'] = session;
  const body = { jsonrpc: '2.0', method, params };
  if (!isNotification) body.id = Math.floor(Math.random() * 1e6);
  const res = await fetch(URL, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) session = sid;
  const ctype = res.headers.get('content-type') || '';
  const txt = await res.text();
  return { status: res.status, ctype, data: parseBody(txt, ctype) };
}

const init = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'shaddai-cli', version: '1.0' },
});
console.log('INIT', init.status, 'session:', session, '::', JSON.stringify(init.data).slice(0, 300));

await rpc('notifications/initialized', {}, true);

const tools = await rpc('tools/list', {});
console.log('\nTOOLS status', tools.status);
const list = tools.data?.result?.tools || [];
for (const t of list) {
  console.log(`\n### ${t.name}`);
  console.log('  desc:', (t.description || '').slice(0, 200));
  console.log('  input:', JSON.stringify(t.inputSchema?.properties ? Object.keys(t.inputSchema.properties) : t.inputSchema).slice(0, 400));
}
if (!list.length) console.log('raw:', JSON.stringify(tools.data).slice(0, 600));

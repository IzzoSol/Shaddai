import { writeFileSync } from 'fs';
const URL='https://www.sprite-ai.art/api/mcp';
const KEY='sai_sk_26d5ad2fa231d69c37da9316b568fb0c356685634e2fd636e47ed158349db6a3';
let session=null;
function pb(t,c){if(c&&c.includes('text/event-stream')){const o=t.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>{try{return JSON.parse(l.slice(5).trim())}catch{return null}}).filter(Boolean);return o[o.length-1];}try{return JSON.parse(t)}catch{return{raw:t.slice(0,300)}}}
async function rpc(m,p,note){const h={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':`Bearer ${KEY}`};if(session)h['Mcp-Session-Id']=session;const b={jsonrpc:'2.0',method:m,params:p};if(!note)b.id=Math.floor(Math.random()*1e6);const r=await fetch(URL,{method:'POST',headers:h,body:JSON.stringify(b),signal:AbortSignal.timeout(180000)});const s=r.headers.get('mcp-session-id');if(s)session=s;return{status:r.status,data:pb(await r.text(),r.headers.get('content-type')||'')};}
async function gen(spec,out){try{const r=await rpc('tools/call',{name:'sprite_generate',arguments:spec});for(const c of (r.data?.result?.content||[])){if(c.type==='text')console.log(`  [${out}] ${c.text.slice(0,110)}`);else if(c.type==='image'&&c.data){writeFileSync(`${out}.png`,Buffer.from(c.data,'base64'));console.log(`  [${out}] -> ${out}.png`);}}if(r.data?.result?.isError)console.log(`  [${out}] isError`);}catch(e){console.log(`  [${out}] ERR ${e.message}`);}}
await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'x',version:'1'}});
await rpc('notifications/initialized',{},true);
const B=' single character, exactly one person, centered, full body, plain flat background';
const cast=[
  ['_simp_chibi','a cute simple chibi MMO character, big round head, tiny body, minimal facial features, few flat colors, casual clothes,'+B],
  ['_simp_flat','a very simple flat Habbo-Hotel-style avatar, blocky simple shapes, minimal shading, casual clothes,'+B],
  ['_simp_mid','a clean simplified pixel MMO character, normal proportions but low detail, simple shapes, few colors, casual clothes,'+B],
];
for(const [n,p] of cast) await gen({prompt:p,asset_type:'character',width:96,height:96,camera_perspective:'isometric',direction:'south'},n);
console.log('done');

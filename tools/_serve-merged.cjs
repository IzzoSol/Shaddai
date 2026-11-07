// tools/_serve-merged.cjs [port] - serve this worktree's public/ first, fall back to ASSET_ROOT (sparse worktrees have no GLBs). Probe-only: /api -> 404.
// serve the polish worktree first, fall back to the main folder (assets/vendor live there); /api -> 404 json
const http=require('http'),fs=require('fs'),path=require('path');
const ROOTS=[require('path').join(__dirname,'..','public'),process.env.ASSET_ROOT||'C:/Users/Brittany/Shaddai-3d/public'];
const T={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.glb':'model/gltf-binary','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ktx2':'image/ktx2','.mp3':'audio/mpeg','.svg':'image/svg+xml','.hdr':'application/octet-stream'};
http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]); if(u.startsWith('/api/')){r.writeHead(404,{'Content-Type':'application/json'});return r.end('{"ok":false}');}
 if(u.endsWith('/'))u+='index.html'; let i=0;(function nx(){ if(i>=ROOTS.length){r.writeHead(404);return r.end();} const f=path.join(ROOTS[i++],u);
  fs.readFile(f,(e,d)=>{ if(e) return nx(); r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'}); r.end(d); }); })();
}).listen(+process.argv[2]||3080,()=>console.log('merged up 3080'));

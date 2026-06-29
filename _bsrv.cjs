const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=__dirname;
http.createServer((req,res)=>{
  let u=decodeURIComponent(req.url.split('?')[0]); if(u==='/')u='/_buildings-preview.html';
  if(u.startsWith('/api/')){ // proxy textures to the canonical server
    const p=http.request({host:'localhost',port:8099,path:u,method:'GET'},pr=>{res.writeHead(pr.statusCode,pr.headers);pr.pipe(res);}); p.on('error',()=>{res.writeHead(404);res.end();}); p.end(); return;
  }
  const fp=path.join(ROOT,u); fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;}
    const ext=path.extname(fp); const ct={'.html':'text/html','.js':'application/javascript','.png':'image/png','.json':'application/json'}[ext]||'text/plain';
    res.writeHead(200,{'content-type':ct}); res.end(d); });
}).listen(8077,()=>console.log('bsrv on 8077'));

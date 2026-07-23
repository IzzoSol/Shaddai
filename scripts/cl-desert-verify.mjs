import puppeteer from 'puppeteer';
const URL='http://localhost:3000/lab-molecules.html';
const errors=[];
const b=await puppeteer.launch({headless:'new',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--window-size=1600,900']});
const p=await b.newPage();
await p.setViewport({width:1600,height:900,deviceScaleFactor:1});
p.on('console',m=>{if(m.type()==='error')errors.push('console.error: '+m.text());});
p.on('pageerror',e=>errors.push('pageerror: '+e.message));
await p.goto(URL,{waitUntil:'networkidle2',timeout:60000});
await new Promise(r=>setTimeout(r,2000));
const st=await p.evaluate(()=>{const c=document.getElementById('gl');const gl2=c&&c.getContext('webgl2');const fb=document.getElementById('fallback');return{webgl2:!!gl2,fb:fb&&getComputedStyle(fb).display!=='none'};});
// desert day
await p.evaluate(()=>{window.__forceP=0.72;});
await new Promise(r=>setTimeout(r,1500));
await p.mouse.move(700,500);await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:'scripts/cl-desert.png'});
// desert night
await p.evaluate(()=>{window.__forceP=0.96;});
await new Promise(r=>setTimeout(r,1800));
await p.screenshot({path:'scripts/cl-night.png'});
await b.close();
console.log('WebGL2:',st.webgl2,'| fallback:',st.fb,'| errors:',errors.length);
errors.forEach(e=>console.log('  !',e));
console.log(errors.length===0&&st.webgl2?'RESULT: PASS':'RESULT: CHECK');

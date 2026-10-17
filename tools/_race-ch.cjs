const puppeteer=require('puppeteer');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({headless:'new',protocolTimeout:900000,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:1000,height:600});const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html',{waitUntil:'domcontentloaded',timeout:90000});
for(let i=0;i<150;i++){await sleep(2000);if(await p.evaluate(()=>!!window.__loadPlayable).catch(()=>false))break;}
for(let i=0;i<60&&!(await p.evaluate(()=>!!window.__raceChallenge).catch(()=>false));i++)await sleep(2000);
await sleep(8000);
const r=await p.evaluate(async()=>{const R=window.__raceChallenge,S=window.ShdSparks,pp=window.__w3dDebug.playerPos,out={};
 out.spots=R.mapSpots().length;out.balance0=S.get();
 const A={x:pp.x,z:pp.z,label:'A'},B={x:pp.x+1800,z:pp.z,label:'B'},C={x:pp.x+900,z:pp.z+200,label:'C'};
 const tick=(sec)=>{for(let t=0;t<sec;t+=0.1)R.update(0.1);};
 const res=R.begin({spots:[A,C,B],n:2,diff:0.92,stake:100});out.begin=res;out.afterStake=S.get();
 tick(6);out.phaseAfterCountdown=R.state().phase;
 tick(3);pp.x=C.x;pp.z=C.z;tick(0.2);out.cp=R.state().cp;
 pp.x=B.x;pp.z=B.z;tick(0.2);const st=R.state();out.final={phase:st.phase,place:st.place};out.balance1=S.get();out.expectedWin=100*3*0.95;
 R.stop();
 // lose scenario: rivals are fast, the player stays put -> a rival finishes first
 pp.x=A.x;pp.z=A.z;const bal2=S.get();const res2=R.begin({spots:[A,B],n:1,diff:1.05,stake:100});tick(6);tick(240);out.loseStakeTaken=bal2-S.get();const st2=R.state();out.lose={ok:res2.ok,phase:st2.phase,place:st2.place,balance:S.get()};R.stop();
 out.tooShort=R.begin({spots:[A,{x:A.x+100,z:A.z,label:'near'}],n:1,diff:1,stake:50});
 const b3=S.get();R.begin({spots:[A,B],n:1,diff:1,stake:200});const b4=S.get();R.stop();out.refund={staked:b3-b4,afterCancel:S.get()-b3};
 return out;});
console.log(JSON.stringify(r,null,1));console.log('ERRS',JSON.stringify(errs.slice(0,3)));await b.close();})();

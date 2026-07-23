const puppeteer=require('puppeteer-core');const path=require('path');
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:require('os').tmpdir()+'/ppf'+Date.now(),args:['--no-sandbox']});
  const p=await b.newPage(); const fails=[]; const errs=[];
  p.on('requestfailed',r=>fails.push(r.url().split("/").pop()+" :: "+ (r.failure()&&r.failure().errorText)));
  p.on('response',r=>{ if(r.status()>=400) fails.push("HTTP"+r.status()+" "+r.url().split("/").pop()); });
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto("file:///"+path.resolve("public","game.html").split(path.sep).join("/")+"?menu=1",{waitUntil:"networkidle0"});
  await new Promise(r=>setTimeout(r,1200));
  const scripts=await p.evaluate(()=>({RegionGen:Object.keys(window.RegionGen||{}), PP:!!window.PixelPeople, Terrain:!!window.Terrain, Landmarks:!!window.Landmarks, Interiors:!!window.Interiors, RegionMap:!!window.RegionMap}));
  await b.close();
  console.log("FAILED RESOURCES:", fails.length?("\n"+fails.join("\n")):"none");
  console.log("MODULES:", JSON.stringify(scripts));
  console.log("PAGE ERRORS:", errs.length?errs.join("\n"):"none");
})().catch(e=>{console.error(e.message);process.exit(1);});

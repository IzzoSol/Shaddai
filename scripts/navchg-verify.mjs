import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1440,900']});
async function check(url,label){
  const errs=[];const p=await b.newPage();await p.setViewport({width:1440,height:900});
  p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
  await p.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
  await new Promise(r=>setTimeout(r,1600));
  const info=await p.evaluate(()=>{
    const tabs=[...document.querySelectorAll('.mega .pillar > button')].map(b=>b.textContent.replace('▾','').trim());
    const codexPillar=[...document.querySelectorAll('.mega .pillar')].find(p=>/codex/i.test(p.textContent));
    const codexHasPanel = codexPillar? !!codexPillar.querySelector('.panel') : null;
    const codexHasOnclick = codexPillar? !!codexPillar.querySelector('button[onclick]') : null;
    // no dead refs
    const hasMarketNexus=/Market Nexus/.test(document.body.innerHTML);
    const hasCheckout=/Solana Pay|Checkout/.test(document.body.innerHTML);
    const hasDataApiCard=/Markets &amp; Data|Markets & Data/.test(document.body.innerHTML);
    return { tabs, codexHasPanel, codexHasOnclick, hasMarketNexus, hasCheckout, hasDataApiCard };
  });
  // open the Signals dropdown (5th tab) to confirm it still opens
  await p.evaluate(()=>{const pl=[...document.querySelectorAll('.mega .pillar[data-pillar]')].find(p=>/signals/i.test(p.textContent));if(pl){const btn=pl.querySelector('button');btn&&btn.click();}});
  await new Promise(r=>setTimeout(r,350));
  const sig=await p.evaluate(()=>{const pl=[...document.querySelectorAll('.mega .pillar[data-pillar]')].find(p=>/signals/i.test(p.textContent));const panel=pl&&pl.querySelector('.panel');return panel?getComputedStyle(panel).visibility:'no panel';});
  await p.close();
  console.log(label+': errors='+errs.length);
  console.log('  tabs='+JSON.stringify(info.tabs));
  console.log('  codex: panel='+info.codexHasPanel+' onclick='+info.codexHasOnclick+' | signals-open='+sig);
  console.log('  leftovers: MarketNexus='+info.hasMarketNexus+' Checkout='+info.hasCheckout+' DataApiCard='+info.hasDataApiCard);
}
await check('http://localhost:3000/home.html','HOME');
await check('http://localhost:3000/aura.html','AURA');
await b.close();

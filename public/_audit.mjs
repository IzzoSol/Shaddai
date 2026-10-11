import puppeteer from 'puppeteer-core';

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const OUT = "./_audit_shots";

const pages = [
  "/home.html","/agents.html","/aura.html","/codex.html","/collectibles-nft.html",
  "/forge.html","/arcade.html","/play.html","/create.html","/zerox-markets.html",
  "/marketplace-shop-v2.html","/region-select.html","/pixel-forge.html"
];

function rgbToHex(s){
  if(!s) return s;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if(!m) return s;
  const p = m[1].split(',').map(x=>parseInt(x.trim()));
  return '#'+p.slice(0,3).map(x=>x.toString(16).padStart(2,'0')).join('');
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args:["--no-sandbox","--disable-gpu"]
});

const results = [];

for(const path of pages){
  const page = await browser.newPage();
  await page.setViewport({width:1280,height:900});
  const errors = [];
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text().slice(0,160)); });
  page.on('pageerror', e=> errors.push('PAGEERR: '+String(e).slice(0,160)));
  let status = 0;
  try{
    const resp = await page.goto(BASE+path, {waitUntil:'networkidle2', timeout:30000});
    status = resp ? resp.status() : 0;
  }catch(e){ errors.push('NAV: '+String(e).slice(0,120)); }
  await new Promise(r=>setTimeout(r,1200));

  const shot = OUT+"/"+path.replace(/\//g,'').replace('.html','')+".png";
  try{ await page.screenshot({path:shot}); }catch(e){}

  const info = await page.evaluate(()=>{
    const q = s=>document.querySelector(s);
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    const bodyFont = getComputedStyle(document.body).fontFamily;
    // home detection
    const homeLinks = [...document.querySelectorAll('a[href]')].filter(a=>/home\.html|(^|\/)#?$/.test(a.getAttribute('href')||'')||/home\.html/.test(a.href));
    const cornerHome = q('#cornerHome');
    const shdHome = q('#shd-home');
    const navHost = q('#shd-nav-host');
    const navHostHTML = navHost ? navHost.innerHTML.trim().length : 0;
    // any element with class/id suggesting mega nav
    const megaNav = q('nav.mega-nav, .shd-nav, #megaNav, .mega-nav, header nav');
    const anyHomeHref = [...document.querySelectorAll('a')].some(a=>/home\.html/.test(a.getAttribute('href')||''));
    const wordmark = [...document.querySelectorAll('a,div,span')].some(e=>/SHADDAI/i.test(e.textContent||'') && (e.tagName==='A'));
    // font links loaded
    const fontsUsed = [...document.querySelectorAll('h1,h2,.wordmark,[class*=title]')].slice(0,5).map(e=>getComputedStyle(e).fontFamily);
    // check nav tab labels
    const navText = navHost ? navHost.textContent.replace(/\s+/g,' ').trim().slice(0,200) : '';
    const bodyText = document.body.innerText.replace(/\s+/g,' ').trim().slice(0,120);
    return {
      bodyBg, htmlBg, bodyFont,
      cornerHome: !!cornerHome, shdHome: !!shdHome,
      navHost: !!navHost, navHostHTML,
      megaNav: !!megaNav, anyHomeHref, wordmark,
      fontsUsed, navText, bodyText,
      title: document.title
    };
  }).catch(e=>({error:String(e)}));

  results.push({path, status, errors: errors.slice(0,6),
    bodyBg: rgbToHex(info.bodyBg), htmlBg: rgbToHex(info.htmlBg),
    bodyFont: info.bodyFont, ...info});
  await page.close();
}

console.log(JSON.stringify(results,null,1));
await browser.close();

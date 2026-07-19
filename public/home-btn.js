/* home-btn.js — self-injecting "Home / Dashboard" return cluster.
   Drop <script src="/home-btn.js" defer></script> into any page.
   Guards itself: does nothing if the page already has the full nav (nav.js)
   or an existing link to home.html, so it never doubles up. */
(function(){
  if (window.__shaddaiHomeBtn) return; window.__shaddaiHomeBtn = 1;

  /* SITE-WIDE SELF-HEAL — a leftover cache-first service worker from an old build keeps
     serving STALE cached pages (broken AURA / NFTs / nav, dashboard-behind-landing, etc.).
     Since this script is on ~every page, evict it everywhere: when an old worker exists,
     register the kill-switch /sw.js (skipWaiting→claim→purge all caches→unregister→reload).
     Guarded once per session so it never loops. */
  try{
    if ('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistrations().then(function(rs){
        if (!rs || !rs.length) return;
        if (sessionStorage.getItem('sw-killed')) return;
        sessionStorage.setItem('sw-killed','1');
        navigator.serviceWorker.register('/sw.js').catch(function(){
          rs.forEach(function(r){ try{ r.unregister(); }catch(e){} });
          if (window.caches && caches.keys) caches.keys().then(function(k){ k.forEach(function(x){ try{caches.delete(x);}catch(e){} }); });
          location.reload();
        });
      }).catch(function(){});
    }
  }catch(e){}

  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function(){
    // already has ANY return chrome (nav, home link, dashboard/back/exit button)?
    // -> skip, so we never double up or overlap a page's own top bar.
    if (document.querySelector('script[src*="nav.js"]')) return;
    if (document.getElementById('shd-nav-host') || document.querySelector('.shd-nav')) return;
    if (document.querySelector(
      'a[href="/home.html"],a[href="home.html"],a[href$="/home.html"],'+
      'a[href="/"],a[href="/dashboard"],a[href="/index.html"],a[href$="/dashboard"]'
    )) return;
    // text-based check for a back/exit/dashboard/home control already in the page
    var ctrls = document.querySelectorAll('a,button');
    for (var i=0; i<ctrls.length && i<120; i++){
      var t = (ctrls[i].textContent||'').trim().toLowerCase();
      if (/(^|\s)(home|dashboard|back|exit)(\s|$)/.test(t) || /dashboard|back to|← *dashboard|◄/.test(t)) return;
    }

    var css = document.createElement('style');
    css.textContent =
      '#shd-home{position:fixed;top:14px;left:14px;z-index:2147483000;display:flex;gap:8px;'+
      'font-family:"Chakra Petch","IBM Plex Mono",ui-monospace,monospace;'+
      'padding-top:env(safe-area-inset-top,0)}'+
      '#shd-home a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;'+
      'padding:8px 13px;border-radius:11px;font-size:12.5px;font-weight:600;letter-spacing:.08em;'+
      'color:#eafff6;background:rgba(6,8,11,.72);border:1px solid rgba(0,255,156,.28);'+
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);'+
      'box-shadow:0 4px 18px rgba(0,0,0,.45);transition:border-color .18s,color .18s,background .18s,transform .18s}'+
      '#shd-home a:hover{border-color:rgba(0,255,156,.75);color:#00ff9c;background:rgba(6,8,11,.9);transform:translateY(-1px)}'+
      '#shd-home a.dash{border-color:rgba(95,224,255,.28)}'+
      '#shd-home a.dash:hover{border-color:rgba(95,224,255,.75);color:#5fe0ff}'+
      '@media(max-width:560px){#shd-home a span{display:none}#shd-home a{padding:9px 11px}}';
    document.head.appendChild(css);

    var wrap = document.createElement('nav');
    wrap.id = 'shd-home';
    wrap.setAttribute('aria-label','Return');
    wrap.innerHTML =
      '<a href="/home.html" title="Home">⌂ <span>Home</span></a>'+
      '<a class="dash" href="/index.html" title="Dashboard">▦ <span>Dashboard</span></a>';
    document.body.appendChild(wrap);
  });
})();

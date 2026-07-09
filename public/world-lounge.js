/* =============================================================================
 * world-lounge.js — ZEROX LOUNGE · COMMUNITY RADIO
 * -----------------------------------------------------------------------------
 * TURTLE (with ZEROX markets flair). A self-contained DOM overlay lounge that
 * lives inside the ZEROX building interior. NO 3D colliders — walkable-safe.
 *
 *   window.buildZeroxLounge() -> { open(), close(), toggle(), isOpen() }
 *
 * Two panels in one premium neon glass UI:
 *   A) COMMUNITY RADIO — HTML5 <audio> player + community track list + a live
 *      WebAudio AnalyserNode EQ visualizer (cyan bars) drawn to a canvas.
 *   B) CHART VIEWER   — CoinGecko free market list + 7d sparkline chart canvas.
 *
 * No libraries / CDNs. Vanilla JS + Canvas + WebAudio only. Styles injected by
 * the module itself so it is fully self-contained. rAF is cancelled on close so
 * there are no per-frame leaks.
 * ========================================================================== */
(function (global) {
  'use strict';

  var CYAN   = '#27e0ff';
  var STYLE_ID = 'zx-lounge-style';

  /* ---------------------------------------------------------------------------
   * COMMUNITY_TRACKS  ← PLUG-IN POINT FOR REAL COMMUNITY SUBMISSIONS
   * ---------------------------------------------------------------------------
   * These are free, no-key, CORS-friendly seed tracks (SoundHelix). Later this
   * array will be replaced/augmented by community-submitted tracks fetched from
   * a backend endpoint (e.g. GET /api/lounge/tracks -> [{title, artist, url}]).
   * Each entry MUST keep the shape: { title, artist, url }.
   *
   * To wire real submissions later: replace `COMMUNITY_TRACKS` with the fetched
   * list inside refreshTracks(), or push new entries and call renderTrackList().
   * ------------------------------------------------------------------------- */
  var SH = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-';
  var COMMUNITY_TRACKS = [
    { title: 'After Hours Liquidity', artist: 'Neon Ledger',      url: SH + '1.mp3'  },
    { title: 'Bull Market Sunrise',   artist: 'The Order Book',   url: SH + '2.mp3'  },
    { title: 'Cyan District',         artist: 'Katana Bloom',     url: SH + '3.mp3'  },
    { title: 'Volatility Dreams',     artist: 'ZEROX & The Pit',  url: SH + '4.mp3'  },
    { title: 'Cold Wallet Nights',    artist: 'Depth Chart',      url: SH + '5.mp3'  },
    { title: 'Moonlit Arbitrage',     artist: 'Signal Runner',    url: SH + '6.mp3'  },
    { title: 'Slippage Lounge',       artist: 'Maker Taker',      url: SH + '7.mp3'  },
    { title: 'Golden Cross',          artist: 'Fibonacci Ghosts', url: SH + '8.mp3'  },
    { title: 'Neon Candlesticks',     artist: 'Long & Short',     url: SH + '9.mp3'  },
    { title: 'Diamond Hands Waltz',   artist: 'HODL Choir',       url: SH + '10.mp3' },
    { title: 'Yield Curve',           artist: 'Spread Theory',    url: SH + '11.mp3' },
    { title: 'Whale Song',            artist: 'Dark Pool',        url: SH + '12.mp3' },
    { title: 'Rebalance',             artist: 'The Custodians',   url: SH + '13.mp3' },
    { title: 'Fear & Greed',          artist: 'Index Souls',      url: SH + '14.mp3' },
    { title: 'Settlement Layer',      artist: 'Finality',         url: SH + '15.mp3' },
    { title: 'Closing Bell',          artist: 'Neon Ledger',      url: SH + '16.mp3' }
  ];

  var COINS_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=12&page=1&sparkline=true&price_change_percentage=24h';
  var COIN_CACHE_MS = 60 * 1000;

  /* DexScreener — free public API (no key, CORS-ok) + iframe-safe embed pages. */
  var DEX_SEARCH = 'https://api.dexscreener.com/latest/dex/search?q=';
  var DEX_SITE   = 'https://dexscreener.com/search?q=';
  var DEX_QUICK  = ['SOL', 'ETH', 'WIF', 'PEPE', 'BONK', 'DOGE'];
  function dexEmbedUrl(chainId, pairAddress) {
    return 'https://dexscreener.com/' + encodeURIComponent(chainId) + '/' + encodeURIComponent(pairAddress)
      + '?embed=1&theme=dark&chartTheme=dark&info=0&trades=0&tabs=0&chartLeftToolbar=0&interval=15';
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.zx-lounge{position:fixed;inset:0;z-index:120000;display:none;'
      + 'font-family:"Orbitron",system-ui,sans-serif;color:#eaf6ff;'
      + 'background:radial-gradient(1200px 700px at 70% -10%,rgba(39,224,255,0.10),rgba(2,6,12,0.86)),rgba(2,6,12,0.90);'
      + 'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);'
      + 'opacity:0;transition:opacity .28s ease;pointer-events:none;'
      + 'background-image:linear-gradient(rgba(39,224,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(39,224,255,0.035) 1px,transparent 1px);background-size:100% 3px,40px 100%}'
      + '.zx-lounge.zx-on{display:flex;opacity:1;pointer-events:auto}'
      + '.zx-wrap{margin:auto;width:min(1120px,94vw);max-height:92vh;display:flex;flex-direction:column;'
      + 'background:linear-gradient(180deg,rgba(6,14,24,0.92),rgba(4,9,16,0.92));'
      + 'border:1px solid rgba(39,224,255,0.35);border-radius:18px;overflow:hidden;'
      + 'box-shadow:0 0 60px rgba(39,224,255,0.18),inset 0 0 40px rgba(39,224,255,0.04)}'
      + '.zx-head{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;'
      + 'border-bottom:1px solid rgba(39,224,255,0.22);background:rgba(39,224,255,0.05)}'
      + '.zx-title{font-size:13px;letter-spacing:3px;color:' + CYAN + ';text-shadow:0 0 14px rgba(39,224,255,0.6);font-weight:700}'
      + '.zx-title small{display:block;font-size:9px;letter-spacing:2px;color:#9fd8ea;margin-top:3px;opacity:.8}'
      + '.zx-x{width:44px;height:44px;flex:0 0 auto;background:rgba(39,224,255,0.10);border:1px solid ' + CYAN + ';'
      + 'color:' + CYAN + ';border-radius:10px;font-size:16px;cursor:pointer;transition:.15s}'
      + '.zx-x:hover{background:rgba(39,224,255,0.25)}'
      + '.zx-body{display:flex;gap:16px;padding:16px;overflow:auto}'
      + '.zx-col{flex:1 1 0;min-width:0;background:rgba(3,8,15,0.6);border:1px solid rgba(39,224,255,0.16);border-radius:14px;padding:14px;display:flex;flex-direction:column}'
      + '.zx-h2{font-size:11px;letter-spacing:2px;color:' + CYAN + ';margin:0 0 10px;text-transform:uppercase;opacity:.9}'
      + '.zx-viz{width:100%;height:70px;display:block;background:rgba(0,0,0,0.35);border-radius:10px;border:1px solid rgba(39,224,255,0.18)}'
      + '.zx-now{margin:10px 0 4px;font-size:14px;color:#eaf6ff}'
      + '.zx-now b{color:' + CYAN + '} .zx-artist{font-size:11px;color:#9fd8ea;opacity:.85}'
      + '.zx-seekrow{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:10px;color:#9fd8ea}'
      + '.zx-range{-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:rgba(39,224,255,0.18);outline:none;cursor:pointer}'
      + '.zx-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:' + CYAN + ';box-shadow:0 0 8px ' + CYAN + '}'
      + '.zx-range::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:' + CYAN + ';box-shadow:0 0 8px ' + CYAN + '}'
      + '.zx-seek{flex:1}'
      + '.zx-ctrls{display:flex;align-items:center;gap:8px;margin:6px 0 12px}'
      + '.zx-btn{min-width:44px;height:44px;background:rgba(39,224,255,0.08);border:1px solid rgba(39,224,255,0.4);'
      + 'color:' + CYAN + ';border-radius:10px;font-size:15px;cursor:pointer;transition:.15s}'
      + '.zx-btn:hover{background:rgba(39,224,255,0.22)}'
      + '.zx-play{background:' + CYAN + ';color:#03121a;font-weight:700;box-shadow:0 0 18px rgba(39,224,255,0.5)}'
      + '.zx-vol{display:flex;align-items:center;gap:6px;margin-left:auto;flex:1;max-width:150px}'
      + '.zx-vol .zx-range{flex:1}'
      + '.zx-list{overflow:auto;flex:1;margin:0;padding:0;list-style:none;max-height:230px}'
      + '.zx-track{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;cursor:pointer;transition:.12s;border:1px solid transparent}'
      + '.zx-track:hover{background:rgba(39,224,255,0.07)}'
      + '.zx-track.zx-active{background:rgba(39,224,255,0.14);border-color:rgba(39,224,255,0.4)}'
      + '.zx-tnum{width:22px;text-align:center;font-size:10px;color:#6fb7cc}'
      + '.zx-tmeta{min-width:0} .zx-ttitle{font-size:12px;color:#eaf6ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.zx-tartist{font-size:10px;color:#9fd8ea;opacity:.8}'
      + '.zx-coins{overflow:auto;flex:1;margin:0;padding:0;list-style:none;max-height:200px}'
      + '.zx-coin{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;cursor:pointer;transition:.12s}'
      + '.zx-coin:hover{background:rgba(39,224,255,0.07)}.zx-coin.zx-active{background:rgba(39,224,255,0.14)}'
      + '.zx-coin img{width:22px;height:22px;border-radius:50%}'
      + '.zx-csym{font-size:12px;text-transform:uppercase;font-weight:700;color:#eaf6ff}'
      + '.zx-cname{font-size:10px;color:#9fd8ea;opacity:.8}'
      + '.zx-cprice{margin-left:auto;text-align:right;font-size:12px}'
      + '.zx-up{color:#3cf08a}.zx-down{color:#ff5c7a}'
      + '.zx-chart{width:100%;height:150px;display:block;background:rgba(0,0,0,0.35);border-radius:10px;border:1px solid rgba(39,224,255,0.18);margin-bottom:8px}'
      + '.zx-note{font-size:11px;color:#9fd8ea;opacity:.8;padding:6px 2px}'
      + '.zx-note.zx-err{color:#ff9db0}'
      /* --- DexScreener view --- */
      + '.zx-dexrow{display:flex;align-items:center;gap:8px;margin:0 0 10px}'
      + '.zx-dexrow .zx-dexsearch{flex:1;min-width:0;height:38px;background:rgba(0,0,0,0.4);border:1px solid rgba(39,224,255,0.3);'
      + 'color:#eaf6ff;border-radius:9px;padding:0 12px;font-family:inherit;font-size:12px;outline:none}'
      + '.zx-dexsearch:focus{border-color:' + CYAN + ';box-shadow:0 0 12px rgba(39,224,255,0.35)}'
      + '.zx-dexgo{height:38px;padding:0 14px;background:' + CYAN + ';color:#03121a;border:0;border-radius:9px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px;box-shadow:0 0 14px rgba(39,224,255,0.4)}'
      + '.zx-dexgo:hover{filter:brightness(1.12)}'
      + '.zx-quick{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}'
      + '.zx-chip{padding:6px 11px;background:rgba(39,224,255,0.08);border:1px solid rgba(39,224,255,0.35);'
      + 'color:' + CYAN + ';border-radius:20px;font-size:11px;letter-spacing:1px;cursor:pointer;transition:.12s;font-weight:700}'
      + '.zx-chip:hover{background:rgba(39,224,255,0.22)}'
      + '.zx-dexmeta{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 8px;min-height:20px}'
      + '.zx-dexpair{font-size:14px;font-weight:700;color:#eaf6ff}.zx-dexpair b{color:' + CYAN + '}'
      + '.zx-dexprice{font-size:13px;color:#eaf6ff}'
      + '.zx-dexchg{font-size:12px}.zx-dexchg.zx-up{color:#3cf08a}.zx-dexchg.zx-down{color:#ff5c7a}'
      + '.zx-dexchain{font-size:10px;letter-spacing:1px;color:#9fd8ea;opacity:.75;text-transform:uppercase}'
      + '.zx-dexframe{position:relative;flex:1;min-height:320px;border-radius:12px;overflow:hidden;'
      + 'border:1px solid rgba(39,224,255,0.25);background:rgba(0,0,0,0.5)}'
      + '.zx-dexframe.zx-big{min-height:min(78vh,760px)}'
      + '.zx-dexframe iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}'
      + '.zx-dexover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;'
      + 'text-align:center;padding:20px;background:radial-gradient(600px 400px at 50% 30%,rgba(39,224,255,0.06),rgba(2,6,12,0.92));color:#cfeefb}'
      + '.zx-dexover.zx-hide{display:none}'
      + '.zx-dexspin{width:34px;height:34px;border:3px solid rgba(39,224,255,0.25);border-top-color:' + CYAN + ';border-radius:50%;animation:zxspin 0.8s linear infinite}'
      + '@keyframes zxspin{to{transform:rotate(360deg)}}'
      + '.zx-dexlink{display:inline-block;margin-top:6px;padding:9px 16px;background:rgba(39,224,255,0.12);border:1px solid ' + CYAN + ';'
      + 'color:' + CYAN + ';border-radius:10px;text-decoration:none;font-size:12px;font-weight:700}'
      + '.zx-dexlink:hover{background:rgba(39,224,255,0.25)}'
      /* --- view tabs --- */
      + '.zx-tabs{display:flex;gap:8px;padding:0 20px 12px;border-bottom:1px solid rgba(39,224,255,0.14)}'
      + '.zx-tab{flex:0 0 auto;padding:8px 14px;background:rgba(39,224,255,0.05);border:1px solid rgba(39,224,255,0.22);'
      + 'color:#9fd8ea;border-radius:10px;font-family:inherit;font-size:10px;letter-spacing:1.5px;cursor:pointer;transition:.14s;font-weight:700}'
      + '.zx-tab:hover{background:rgba(39,224,255,0.14);color:#eaf6ff}'
      + '.zx-tab.zx-tab-on{background:rgba(39,224,255,0.18);border-color:' + CYAN + ';color:' + CYAN + ';box-shadow:0 0 14px rgba(39,224,255,0.3)}'
      + '.zx-view{display:none}.zx-view.zx-view-on{display:flex}'
      + '.zx-view.zx-view-dex{flex-direction:column;flex:1;min-height:0}'
      + '.zx-btn-look{margin-left:auto;padding:6px 12px;background:' + CYAN + ';color:#03121a;border:0;border-radius:8px;'
      + 'font-family:inherit;font-size:10px;letter-spacing:1px;font-weight:700;cursor:pointer;box-shadow:0 0 12px rgba(39,224,255,0.4)}'
      + '.zx-btn-look:hover{filter:brightness(1.12)}'
      + '.zx-coinact{margin-left:8px;font-size:10px;color:' + CYAN + ';border:1px solid rgba(39,224,255,0.4);'
      + 'border-radius:7px;padding:3px 7px;cursor:pointer;white-space:nowrap;flex:0 0 auto}'
      + '.zx-coinact:hover{background:rgba(39,224,255,0.18)}'
      + '@media(max-width:760px){.zx-body{flex-direction:column}.zx-list,.zx-coins{max-height:160px}'
      + '.zx-dexframe.zx-big{min-height:min(70vh,620px)}.zx-tabs{overflow-x:auto}}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function fmtPrice(p) {
    if (p == null) return '--';
    if (p >= 1)   return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function buildZeroxLounge() {
    injectStyle();

    /* -- state -- */
    var openState = false;
    var current = -1;
    var coinCache = null, coinCacheAt = 0;
    var selectedCoin = null;

    /* -- audio + webaudio (lazy: context created on first gesture) -- */
    var audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'none';
    var actx = null, analyser = null, srcNode = null, freqData = null;
    var vizRAF = 0;

    /* -- DOM -- */
    var root = document.createElement('div');
    root.className = 'zx-lounge';
    root.innerHTML =
      '<div class="zx-wrap">'
      + '<div class="zx-head">'
      +   '<div class="zx-title">ZEROX LOUNGE · COMMUNITY RADIO<small>WEALTH DISTRICT · AFTER HOURS</small></div>'
      +   '<button class="zx-x" title="Close (Esc)">✕</button>'
      + '</div>'
      + '<div class="zx-tabs">'
      +   '<button class="zx-tab zx-tab-home zx-tab-on" data-view="home">◈ RADIO · COINS</button>'
      +   '<button class="zx-tab zx-tab-dex" data-view="dex">📈 LIVE CHARTS · DEXSCREENER</button>'
      + '</div>'
      + '<div class="zx-view zx-view-home zx-view-on">'
      + '<div class="zx-body">'
      +   '<div class="zx-col zx-radio">'
      +     '<div class="zx-h2">◈ Sound System</div>'
      +     '<canvas class="zx-viz"></canvas>'
      +     '<div class="zx-now"><b class="zx-nt">Select a track</b></div>'
      +     '<div class="zx-artist zx-na">Community Radio</div>'
      +     '<div class="zx-seekrow"><span class="zx-cur">0:00</span>'
      +       '<input type="range" class="zx-range zx-seek" min="0" max="1000" value="0">'
      +       '<span class="zx-dur">0:00</span></div>'
      +     '<div class="zx-ctrls">'
      +       '<button class="zx-btn zx-prev" title="Previous">⏮</button>'
      +       '<button class="zx-btn zx-play" title="Play/Pause">▶</button>'
      +       '<button class="zx-btn zx-next" title="Next">⏭</button>'
      +       '<button class="zx-btn zx-mute" title="Mute">🔊</button>'
      +       '<span class="zx-vol"><input type="range" class="zx-range zx-volume" min="0" max="100" value="80"></span>'
      +     '</div>'
      +     '<div class="zx-h2">◈ Community Music</div>'
      +     '<ul class="zx-list"></ul>'
      +   '</div>'
      +   '<div class="zx-col zx-charts">'
      +     '<div class="zx-h2" style="display:flex;align-items:center">◈ Trending Coins'
      +       '<button class="zx-btn-look zx-coin-dex" title="Open selected coin on DexScreener">▶ DEXSCREENER</button></div>'
      +     '<canvas class="zx-chart"></canvas>'
      +     '<div class="zx-note zx-cnote">Pick a coin to view its 7-day chart.</div>'
      +     '<ul class="zx-coins"></ul>'
      +   '</div>'
      + '</div>'
      + '</div>' /* /zx-view-home */
      + '<div class="zx-view zx-view-dex">'
      +   '<div class="zx-body" style="flex-direction:column;flex:1;min-height:0">'
      +     '<div class="zx-col" style="flex:1;min-height:0">'
      +       '<div class="zx-h2" style="display:flex;align-items:center">◈ Live DEX Charts'
      +         '<button class="zx-btn-look zx-look" title="Expand chart">⛶ LOOK AT CHARTS</button></div>'
      +       '<div class="zx-dexrow">'
      +         '<input type="text" class="zx-dexsearch" placeholder="Search token / symbol / pair (e.g. SOL, WIF, 0x…)" spellcheck="false">'
      +         '<button class="zx-dexgo">SEARCH</button>'
      +       '</div>'
      +       '<div class="zx-quick"></div>'
      +       '<div class="zx-dexmeta"><span class="zx-dexpair">DexScreener</span></div>'
      +       '<div class="zx-dexframe">'
      +         '<div class="zx-dexover">'
      +           '<div class="zx-dexspin"></div>'
      +           '<div class="zx-dexmsg">Pick a token above to load its live chart.</div>'
      +         '</div>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>' /* /zx-view-dex */
      + '</div>';
    document.body.appendChild(root);

    var $ = function (sel) { return root.querySelector(sel); };
    var viz    = $('.zx-viz'),    vizCtx  = viz.getContext('2d');
    var chart  = $('.zx-chart'),  chartCtx = chart.getContext('2d');
    var elNT   = $('.zx-nt'),  elNA = $('.zx-na');
    var elCur  = $('.zx-cur'), elDur = $('.zx-dur');
    var seek   = $('.zx-seek'), volume = $('.zx-volume');
    var btnPlay = $('.zx-play'), btnMute = $('.zx-mute');
    var listEl = $('.zx-list'), coinsEl = $('.zx-coins'), cnote = $('.zx-cnote');

    /* -- DexScreener view refs -- */
    var dexSearchEl = $('.zx-dexsearch');
    var dexQuickEl  = $('.zx-quick');
    var dexMetaEl   = $('.zx-dexmeta');
    var dexFrameBox = $('.zx-dexframe');
    var dexOver     = $('.zx-dexover');
    var dexMsg      = $('.zx-dexmsg');
    var dexIframe   = null;      /* lazy: created on first DEX view show */
    var dexLoaded   = false;     /* has the view ever been shown */
    var dexReqId    = 0;         /* guards against out-of-order searches */

    /* prevent world keybinds from firing while typing/using lounge controls */
    root.addEventListener('keydown', function (e) { e.stopPropagation(); });

    /* ---------- WebAudio (create/resume only after a user gesture) ---------- */
    function ensureAudioGraph() {
      if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
        srcNode = actx.createMediaElementSource(audio);
        analyser = actx.createAnalyser();
        analyser.fftSize = 128;
        freqData = new Uint8Array(analyser.frequencyBinCount);
        srcNode.connect(analyser);
        analyser.connect(actx.destination);
      } catch (err) { /* CORS or unsupported → visualizer just stays idle */ }
    }

    function drawViz() {
      vizRAF = requestAnimationFrame(drawViz);
      var w = viz.width  = viz.clientWidth  || 320;
      var h = viz.height = viz.clientHeight || 70;
      vizCtx.clearRect(0, 0, w, h);
      var n, i, v, x, bw;
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        n = freqData.length; bw = w / n;
        for (i = 0; i < n; i++) {
          v = freqData[i] / 255;
          var bh = v * h;
          x = i * bw;
          var g = vizCtx.createLinearGradient(0, h, 0, h - bh);
          g.addColorStop(0, 'rgba(39,224,255,0.25)');
          g.addColorStop(1, CYAN);
          vizCtx.fillStyle = g;
          vizCtx.fillRect(x + 1, h - bh, Math.max(1, bw - 2), bh);
        }
      } else {
        /* idle shimmer when no analyser (e.g. before play or CORS) */
        var t = Date.now() / 400;
        vizCtx.fillStyle = 'rgba(39,224,255,0.35)';
        for (i = 0; i < 32; i++) {
          var bh2 = (Math.sin(t + i * 0.5) * 0.4 + 0.5) * h * (audio.paused ? 0.15 : 0.5);
          vizCtx.fillRect(i * (w / 32) + 1, h - bh2, w / 32 - 2, bh2);
        }
      }
    }
    function startViz() { if (!vizRAF) drawViz(); }
    function stopViz()  { if (vizRAF) { cancelAnimationFrame(vizRAF); vizRAF = 0; } }

    /* ---------------------------- track list ------------------------------ */
    function renderTrackList() {
      listEl.innerHTML = '';
      COMMUNITY_TRACKS.forEach(function (t, i) {
        var li = document.createElement('li');
        li.className = 'zx-track' + (i === current ? ' zx-active' : '');
        li.innerHTML = '<span class="zx-tnum">' + (i + 1) + '</span>'
          + '<span class="zx-tmeta"><div class="zx-ttitle">' + esc(t.title) + '</div>'
          + '<div class="zx-tartist">' + esc(t.artist) + '</div></span>';
        li.onclick = function () { playTrack(i); };
        listEl.appendChild(li);
      });
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function playTrack(i) {
      if (i < 0 || i >= COMMUNITY_TRACKS.length) return;
      current = i;
      var t = COMMUNITY_TRACKS[i];
      elNT.textContent = t.title;
      elNA.textContent = t.artist;
      audio.src = t.url;
      ensureAudioGraph();
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
      renderTrackList();
      startViz();
    }
    function togglePlay() {
      ensureAudioGraph();
      if (current < 0) { playTrack(0); return; }
      if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); startViz(); }
      else audio.pause();
    }

    btnPlay.onclick = togglePlay;
    $('.zx-prev').onclick = function () { playTrack((current <= 0 ? COMMUNITY_TRACKS.length : current) - 1); };
    $('.zx-next').onclick = function () { playTrack((current + 1) % COMMUNITY_TRACKS.length); };
    audio.addEventListener('ended', function () { playTrack((current + 1) % COMMUNITY_TRACKS.length); });
    audio.addEventListener('play',  function () { btnPlay.textContent = '⏸'; });
    audio.addEventListener('pause', function () { btnPlay.textContent = '▶'; });

    audio.addEventListener('timeupdate', function () {
      elCur.textContent = fmtTime(audio.currentTime);
      elDur.textContent = fmtTime(audio.duration);
      if (audio.duration) seek.value = String((audio.currentTime / audio.duration) * 1000);
    });
    seek.addEventListener('input', function () {
      if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    });

    audio.volume = 0.8;
    volume.addEventListener('input', function () {
      audio.volume = volume.value / 100;
      audio.muted = false;
      btnMute.textContent = audio.volume === 0 ? '🔇' : '🔊';
    });
    btnMute.onclick = function () {
      audio.muted = !audio.muted;
      btnMute.textContent = audio.muted ? '🔇' : '🔊';
    };

    /* ---------------------------- chart viewer ---------------------------- */
    function renderCoins(coins) {
      coinsEl.innerHTML = '';
      coins.forEach(function (c) {
        var li = document.createElement('li');
        var chg = c.price_change_percentage_24h;
        var up = (chg || 0) >= 0;
        li.className = 'zx-coin';
        li.innerHTML = '<img src="' + esc(c.image) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
          + '<span><div class="zx-csym">' + esc(c.symbol) + '</div>'
          + '<div class="zx-cname">' + esc(c.name) + '</div></span>'
          + '<span class="zx-cprice"><div>' + fmtPrice(c.current_price) + '</div>'
          + '<div class="' + (up ? 'zx-up' : 'zx-down') + '">'
          + (up ? '▲' : '▼') + ' ' + (chg == null ? '--' : Math.abs(chg).toFixed(2)) + '%</div></span>'
          + '<span class="zx-coinact" title="View on DexScreener">▶ DEX</span>';
        li.onclick = function () {
          selectedCoin = c;
          Array.prototype.forEach.call(coinsEl.children, function (n) { n.classList.remove('zx-active'); });
          li.classList.add('zx-active');
          drawSparkline(c);
        };
        li.querySelector('.zx-coinact').onclick = function (e) {
          e.stopPropagation();
          selectedCoin = c;
          dexSearch(c.symbol); /* switches to DEX view + embeds top pair */
        };
        coinsEl.appendChild(li);
      });
    }

    function drawSparkline(c) {
      var data = (c.sparkline_in_7d && c.sparkline_in_7d.price) || [];
      var w = chart.width = chart.clientWidth || 320;
      var h = chart.height = chart.clientHeight || 150;
      chartCtx.clearRect(0, 0, w, h);
      if (!data.length) { cnote.textContent = 'No chart data for ' + c.name + '.'; return; }
      cnote.classList.remove('zx-err');
      var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
      var pad = 8, span = (max - min) || 1;
      var xOf = function (i) { return pad + (i / (data.length - 1)) * (w - pad * 2); };
      var yOf = function (v) { return pad + (1 - (v - min) / span) * (h - pad * 2); };
      /* gradient area fill */
      chartCtx.beginPath();
      chartCtx.moveTo(xOf(0), h - pad);
      data.forEach(function (v, i) { chartCtx.lineTo(xOf(i), yOf(v)); });
      chartCtx.lineTo(xOf(data.length - 1), h - pad);
      chartCtx.closePath();
      var g = chartCtx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(39,224,255,0.35)');
      g.addColorStop(1, 'rgba(39,224,255,0.02)');
      chartCtx.fillStyle = g; chartCtx.fill();
      /* line */
      chartCtx.beginPath();
      data.forEach(function (v, i) { i ? chartCtx.lineTo(xOf(i), yOf(v)) : chartCtx.moveTo(xOf(i), yOf(v)); });
      chartCtx.strokeStyle = CYAN; chartCtx.lineWidth = 1.8;
      chartCtx.shadowColor = CYAN; chartCtx.shadowBlur = 8;
      chartCtx.stroke(); chartCtx.shadowBlur = 0;
      /* min/max labels */
      chartCtx.fillStyle = '#9fd8ea'; chartCtx.font = '10px Orbitron, sans-serif';
      chartCtx.fillText(fmtPrice(max), 6, 12);
      chartCtx.fillText(fmtPrice(min), 6, h - 6);
      cnote.textContent = c.name + ' · 7-day (' + c.symbol.toUpperCase() + ')';
    }

    function loadCoins(force) {
      var now = Date.now();
      if (!force && coinCache && (now - coinCacheAt) < COIN_CACHE_MS) {
        renderCoins(coinCache);
        if (selectedCoin) drawSparkline(selectedCoin);
        return;
      }
      cnote.classList.remove('zx-err');
      cnote.textContent = 'Loading trending coins…';
      fetch(COINS_URL, { headers: { accept: 'application/json' } })
        .then(function (r) {
          if (r.status === 429) throw new Error('rate');
          if (!r.ok) throw new Error('http');
          return r.json();
        })
        .then(function (coins) {
          if (!Array.isArray(coins) || !coins.length) throw new Error('empty');
          coinCache = coins; coinCacheAt = Date.now();
          renderCoins(coins);
          cnote.textContent = 'Pick a coin to view its 7-day chart.';
        })
        .catch(function (err) {
          cnote.classList.add('zx-err');
          cnote.textContent = err && err.message === 'rate'
            ? 'CoinGecko is rate-limiting right now — try again in a minute.'
            : 'Could not reach the markets feed (offline?). Radio still works.';
          if (coinCache) renderCoins(coinCache); /* keep last good list */
        });
    }

    /* --------------------------- DexScreener ------------------------------ */
    function dexShowOverlay(html, spinning) {
      dexOver.classList.remove('zx-hide');
      dexOver.innerHTML = (spinning ? '<div class="zx-dexspin"></div>' : '')
        + '<div class="zx-dexmsg">' + html + '</div>';
      dexMsg = dexOver.querySelector('.zx-dexmsg');
    }
    function dexHideOverlay() { dexOver.classList.add('zx-hide'); }

    function ensureDexIframe() {
      if (dexIframe) return dexIframe;
      dexIframe = document.createElement('iframe');
      dexIframe.setAttribute('loading', 'lazy');
      dexIframe.setAttribute('allow', 'clipboard-write; fullscreen');
      dexIframe.setAttribute('referrerpolicy', 'no-referrer');
      dexIframe.title = 'DexScreener live chart';
      /* insert before the overlay so the overlay stays on top */
      dexFrameBox.insertBefore(dexIframe, dexOver);
      return dexIframe;
    }

    function dexSiteLink(q) {
      return '<a class="zx-dexlink" href="' + DEX_SITE + encodeURIComponent(q)
        + '" target="_blank" rel="noopener noreferrer">Open DexScreener ↗</a>';
    }

    function dexRenderMeta(pair) {
      var base = (pair.baseToken && pair.baseToken.symbol) || '?';
      var quote = (pair.quoteToken && pair.quoteToken.symbol) || '';
      var price = pair.priceUsd != null ? fmtPrice(parseFloat(pair.priceUsd)) : '--';
      var chg = pair.priceChange && pair.priceChange.h24;
      var up = (parseFloat(chg) || 0) >= 0;
      dexMetaEl.innerHTML =
        '<span class="zx-dexpair"><b>' + esc(base) + '</b>' + (quote ? '/' + esc(quote) : '') + '</span>'
        + '<span class="zx-dexprice">' + price + '</span>'
        + '<span class="zx-dexchg ' + (up ? 'zx-up' : 'zx-down') + '">'
        + (chg == null ? '' : (up ? '▲' : '▼') + ' ' + Math.abs(parseFloat(chg)).toFixed(2) + '%') + '</span>'
        + '<span class="zx-dexchain">' + esc(pair.chainId || '') + '</span>';
    }

    function dexEmbedPair(pair, query) {
      dexRenderMeta(pair);
      var frame = ensureDexIframe();
      var url = dexEmbedUrl(pair.chainId, pair.pairAddress);
      var settled = false;
      dexShowOverlay('Loading ' + esc((pair.baseToken && pair.baseToken.symbol) || 'chart') + ' chart…', true);
      /* if the embed is blocked (CSP/X-Frame) onload may never fire → fall back */
      var guard = setTimeout(function () {
        if (settled) return;
        settled = true;
        dexShowOverlay('This chart could not be embedded here.<br>'
          + dexSiteLink(query || ((pair.baseToken && pair.baseToken.symbol) || '')), false);
      }, 9000);
      frame.onload = function () {
        if (settled) return;
        settled = true; clearTimeout(guard); dexHideOverlay();
      };
      frame.onerror = function () {
        if (settled) return;
        settled = true; clearTimeout(guard);
        dexShowOverlay('This chart could not be loaded.<br>'
          + dexSiteLink(query || ((pair.baseToken && pair.baseToken.symbol) || '')), false);
      };
      frame.src = url;
    }

    /* search DexScreener → pick highest-liquidity pair → embed */
    function dexSearch(query) {
      query = String(query || '').trim();
      if (!query) return;
      setView('dex');
      if (dexSearchEl.value !== query) dexSearchEl.value = query;
      var myReq = ++dexReqId;
      dexMetaEl.innerHTML = '<span class="zx-dexpair">Searching “' + esc(query) + '”…</span>';
      dexShowOverlay('Searching DexScreener for “' + esc(query) + '”…', true);
      fetch(DEX_SEARCH + encodeURIComponent(query), { headers: { accept: 'application/json' } })
        .then(function (r) {
          if (r.status === 429) throw new Error('rate');
          if (!r.ok) throw new Error('http');
          return r.json();
        })
        .then(function (data) {
          if (myReq !== dexReqId) return; /* stale */
          var pairs = (data && data.pairs) || [];
          if (!pairs.length) {
            dexMetaEl.innerHTML = '<span class="zx-dexpair">No pair found for “' + esc(query) + '”</span>';
            dexShowOverlay('No matching pair on DexScreener.<br>' + dexSiteLink(query), false);
            return;
          }
          /* best = highest USD liquidity */
          var best = pairs[0], bestLiq = -1;
          pairs.forEach(function (p) {
            var liq = (p.liquidity && parseFloat(p.liquidity.usd)) || 0;
            if (liq > bestLiq) { bestLiq = liq; best = p; }
          });
          dexEmbedPair(best, query);
        })
        .catch(function (err) {
          if (myReq !== dexReqId) return;
          var msg = err && err.message === 'rate'
            ? 'DexScreener is rate-limiting right now — try again in a moment.'
            : 'Could not reach DexScreener (offline?).';
          dexMetaEl.innerHTML = '<span class="zx-dexpair">DexScreener</span>';
          dexShowOverlay(msg + '<br>' + dexSiteLink(query), false);
        });
    }

    function renderDexQuick() {
      if (dexQuickEl.children.length) return;
      DEX_QUICK.forEach(function (sym) {
        var b = document.createElement('button');
        b.className = 'zx-chip';
        b.textContent = sym;
        b.onclick = function () { dexSearch(sym); };
        dexQuickEl.appendChild(b);
      });
    }

    /* first time the DEX view is shown, wire quick picks + a default chart */
    function initDexView() {
      renderDexQuick();
      if (!dexLoaded) {
        dexLoaded = true;
        dexSearch(DEX_QUICK[0]); /* SOL */
      }
    }

    $('.zx-dexgo').onclick = function () { dexSearch(dexSearchEl.value); };
    dexSearchEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') dexSearch(dexSearchEl.value);
    });
    /* "Look at Charts" → expand the embedded chart large */
    $('.zx-look').onclick = function () {
      var big = dexFrameBox.classList.toggle('zx-big');
      this.textContent = big ? '⛶ SHRINK' : '⛶ LOOK AT CHARTS';
    };
    /* coin-list → DexScreener: search the selected coin's symbol */
    $('.zx-coin-dex').onclick = function () {
      if (!selectedCoin) { setView('dex'); initDexView(); return; }
      dexSearch(selectedCoin.symbol);
    };

    /* ------------------------------ view tabs ----------------------------- */
    var currentView = 'home';
    function setView(name) {
      if (name === currentView && dexLoaded) { /* still ensure init for dex */ }
      currentView = name;
      Array.prototype.forEach.call(root.querySelectorAll('.zx-tab'), function (t) {
        t.classList.toggle('zx-tab-on', t.getAttribute('data-view') === name);
      });
      $('.zx-view-home').classList.toggle('zx-view-on', name === 'home');
      $('.zx-view-dex').classList.toggle('zx-view-on', name === 'dex');
      if (name === 'dex') initDexView();
    }
    Array.prototype.forEach.call(root.querySelectorAll('.zx-tab'), function (t) {
      t.onclick = function () { setView(t.getAttribute('data-view')); };
    });

    /* --------------------------- open / close ----------------------------- */
    function open() {
      if (openState) return;
      openState = true;
      root.classList.add('zx-on');
      if (!listEl.children.length) renderTrackList();
      loadCoins(false);
      startViz();
      try { if (document.exitPointerLock) document.exitPointerLock(); } catch (_) {}
    }
    function close() {
      if (!openState) return;
      openState = false;
      root.classList.remove('zx-on');
      stopViz();
      try { audio.pause(); } catch (_) {}
      /* blank the DexScreener iframe so it isn't running while hidden */
      if (dexIframe) { try { dexIframe.onload = null; dexIframe.src = 'about:blank'; } catch (_) {} }
      dexLoaded = false;        /* reload a fresh chart next time DEX view opens */
      dexFrameBox.classList.remove('zx-big');
      var lookBtn = $('.zx-look'); if (lookBtn) lookBtn.textContent = '⛶ LOOK AT CHARTS';
    }
    function toggle() { openState ? close() : open(); }
    function isOpen() { return openState; }

    $('.zx-x').onclick = close;
    root.addEventListener('keyup', function (e) { if (e.key === 'Escape') close(); });

    return { open: open, close: close, toggle: toggle, isOpen: isOpen };
  }

  global.buildZeroxLounge = buildZeroxLounge;

}(window));

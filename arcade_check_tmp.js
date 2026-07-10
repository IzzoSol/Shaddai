
(function(){
  "use strict";

  // ---------- fallback data ----------
  var FALLBACK_GAMES = [
    {id:"basketball",   name:"NEON HOOPS",     url:"/games/basketball.html",   color:"#ff9d3d", icon:"ðŸ€"},
    {id:"football",     name:"GRID GRIDIRON",  url:"/games/football.html",     color:"#ff2a2a", icon:"ðŸˆ"},
    {id:"dodgeball",    name:"GRID DODGEBALL", url:"/games/dodgeball.html",    color:"#ff5db1", icon:"âš¡"},
    {id:"sigil-storm",  name:"SIGIL STORM",    url:"/games/sigil-storm.html",  color:"#c084fc", icon:"âœ¦"},
    {id:"xt-adventure", name:"XT ADVENTURE",   url:"/games/xt-adventure.html", color:"#00ff88", icon:"ðŸ—¡ï¸"}
  ];
  var FALLBACK_AGENTS = [
    {id:"SHADDAI", color:"#ffcf1a"},
    {id:"NEXUS",   color:"#00f0ff"},
    {id:"ORACLE",  color:"#b06bff"},
    {id:"ZEROX",   color:"#ff9d3d"},
    {id:"TURTLE",  color:"#ff2bd6"},
    {id:"QUILL",   color:"#f5e000"},
    {id:"PIKADON", color:"#ff2a2a"}
  ].map(function(a){
    a.name = a.id;
    a.portrait = "/assets/agents/"+a.id+"-portrait.png";
    return a;
  });
  var GAME_ICONS = {basketball:"ðŸ€", football:"ðŸˆ", dodgeball:"âš¡", "sigil-storm":"âœ¦", "xt-adventure":"ðŸ—¡ï¸"};

  // Base action portraits â€” hub â†’ action â†’ portrait (no game-themed art)
  function hubPortrait(id){
    return "/assets/agents/"+encodeURIComponent(id)+"-hub.png?v=1";
  }
  function actionPortrait(id){
    return "/assets/agents/"+encodeURIComponent(id)+"-action.png";
  }
  function fallbackPortrait(id){
    return "/assets/agents/"+encodeURIComponent(id)+"-portrait.png";
  }

  // ---------- state ----------
  var GAMES = [], AGENTS = [];
  var selGame = null, selAgent = null;
  var apiOnline = true;

  // ---------- dom ----------
  var $ = function(id){ return document.getElementById(id); };
  var gamesGrid  = $("gamesGrid"),  agentsGrid  = $("agentsGrid");
  var btnPlay    = $("btnPlay"),    selNote     = $("selNote");
  var banner     = $("banner");
  var overlay    = $("overlay"),    gameFrame   = $("gameFrame");
  var apiStatus  = $("apiStatus");

  // ---------- helpers ----------
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function agentById(id){
    for(var i=0;i<AGENTS.length;i++){ if(AGENTS[i].id===id) return AGENTS[i]; }
    return null;
  }
  function gameById(id){
    for(var i=0;i<GAMES.length;i++){ if(GAMES[i].id===id) return GAMES[i]; }
    return null;
  }
  function setApiStatus(up){
    apiOnline = up;
    apiStatus.className = "apistatus " + (up ? "up" : "down");
    apiStatus.textContent = up ? "â— API online" : "â— API offline (demo)";
  }
  async function api(path, opts){
    var res = await fetch(path, opts);
    if(!res.ok) throw new Error("HTTP "+res.status);
    return res.json();
  }

  // ---------- render games ----------
  function renderGames(){
    gamesGrid.innerHTML = "";
    GAMES.forEach(function(g){
      var icon = g.icon || GAME_ICONS[g.id] || "ðŸŽ®";
      var el = document.createElement("div");
      el.className = "pick";
      el.style.setProperty("--accent", g.color || "#00ff88");
      el.innerHTML =
        '<span class="game-ico">'+esc(icon)+'</span>'+
        '<span class="game-name" style="color:'+esc(g.color||"#00ff88")+'">'+esc(g.name)+'</span>';
      el.addEventListener("click", function(){ selectGame(g.id); });
      el.dataset.id = g.id;
      gamesGrid.appendChild(el);
    });
  }
  function selectGame(id){
    selGame = id;
    [].forEach.call(gamesGrid.children, function(c){
      c.classList.toggle("sel", c.dataset.id === id);
    });
    updateActions();
  }

  // ---------- render agents ----------
  // Builds an agent card with HF art as primary image.
  // Image fallback chain: HF action portrait â†’ /assets/agents/<ID>-portrait.png â†’ letter tile
  function buildAgentCard(a){
    var col = a.color || "#00ff88";
    var initials = a.id.charAt(0);
    // Fallback chain: -hub.png â†’ -action.png â†’ -portrait.png â†’ letter tile
    var src0 = hubPortrait(a.id);
    var src1 = actionPortrait(a.id);
    var src2 = a.portrait || fallbackPortrait(a.id);

    var el = document.createElement("div");
    el.className = "pick";
    el.style.setProperty("--accent", col);
    el.dataset.id = a.id;

    // art container
    var artDiv = document.createElement("div");
    artDiv.className = "agent-art";

    // letter tile (hidden by default, revealed when all images fail)
    var tile = document.createElement("div");
    tile.className = "letter-tile";
    tile.style.background = col;
    tile.textContent = initials;

    // primary img â€” base hub action portrait
    var img = document.createElement("img");
    img.alt = a.name || a.id;
    img.src = src0;

    var attempt = 0;
    img.onerror = function(){
      attempt++;
      if(attempt === 1){
        img.src = src1;          // try -action.png
      } else if(attempt === 2){
        img.src = src2;          // try -portrait.png
      } else {
        // all three failed â€” show letter tile
        artDiv.classList.add("letter-mode");
      }
    };

    artDiv.appendChild(img);
    artDiv.appendChild(tile);

    var nameSpan = document.createElement("span");
    nameSpan.className = "agent-name";
    nameSpan.style.color = col;
    nameSpan.textContent = a.name || a.id;

    el.appendChild(artDiv);
    el.appendChild(nameSpan);
    el.addEventListener("click", function(){ selectAgent(a.id); });
    return el;
  }

  function renderAgents(){
    agentsGrid.innerHTML = "";
    AGENTS.forEach(function(a){
      agentsGrid.appendChild(buildAgentCard(a));
    });
  }
  function selectAgent(id){
    selAgent = id;
    [].forEach.call(agentsGrid.children, function(c){
      c.classList.toggle("sel", c.dataset.id === id);
    });
    updateActions();
  }

  function updateActions(){
    var ready = !!(selGame && selAgent);
    btnPlay.disabled = !ready;
    if(ready){
      var g = gameById(selGame), a = agentById(selAgent);
      selNote.innerHTML =
        "Ready: <b>"+esc(a?a.name:selAgent)+"</b> plays <b>"+esc(g?g.name:selGame)+"</b>.";
    } else {
      selNote.textContent = "Choose a game and an agent to begin.";
    }
  }

  // ---------- result banner ----------
  function showResult(r){
    if(!r){ return; }
    var win = !!r.win;
    var g = gameById(r.game), a = agentById(r.agent);
    var meta = [];
    meta.push((a?a.name:r.agent) + " Â· " + (g?g.name:r.game));
    banner.innerHTML =
      '<div class="verdict '+(win?"win":"loss")+'">'+(win?"â—ˆ WIN":"âœ• LOSS")+'</div>'+
      '<div class="score">SCORE: '+esc(r.score==null?"â€”":r.score)+'</div>'+
      (r.summary ? '<div class="summary">'+esc(r.summary)+'</div>' : "")+
      '<div class="meta">'+esc(meta.join(""))+'</div>';
    banner.classList.add("show");
  }

  // ---------- PLAY â€” launches game iframe for the user to play ----------
  function launchPlay(){
    if(!selGame || !selAgent) return;
    var g = gameById(selGame), a = agentById(selAgent);
    if(!g) return;
    // Build URL: pass agent context, NO autoplay=1 (user plays)
    var sep = g.url.indexOf("?") >= 0 ? "&" : "?";
    var url = g.url + sep + "agent=" + encodeURIComponent(selAgent);
    $("overlayTitle").textContent = "â–¶ " + (a?a.name:selAgent) + " â€” " + (g?g.name:selGame);
    $("overlayWait").textContent = "Game in progress â€” result will appear here when finished.";
    gameFrame.src = url;
    overlay.classList.add("show");
  }
  function closeOverlay(){
    overlay.classList.remove("show");
    gameFrame.src = "about:blank";
  }

  // listen for game results posted via postMessage
  window.addEventListener("message", function(ev){
    var d = ev.data;
    if(!d || typeof d !== "object") return;
    if(d.type !== "arcadeResult") return;
    var r = d.result || d.payload || d;
    var result = {
      game:    r.game   != null ? r.game    : selGame,
      agent:   r.agent  != null ? r.agent   : selAgent,
      score:   r.score,
      win:     r.win,
      summary: r.summary
    };
    $("overlayWait").textContent = "Result received âœ“ â€” you can close this window.";
    showResult(result);
  });

  // ---------- load games/agents ----------
  async function loadCatalog(){
    try{
      var gd = await api("/api/arcade/games");
      GAMES = (gd && gd.ok && gd.games && gd.games.length) ? gd.games : FALLBACK_GAMES;
      setApiStatus(true);
    }catch(e){ GAMES = FALLBACK_GAMES; setApiStatus(false); }

    try{
      var ad = await api("/api/arcade/agents");
      AGENTS = (ad && ad.ok && ad.agents && ad.agents.length) ? ad.agents.map(function(a){
        a.name    = a.name    || a.id;
        a.portrait = a.portrait || fallbackPortrait(a.id);
        return a;
      }) : FALLBACK_AGENTS;
    }catch(e){ AGENTS = FALLBACK_AGENTS; }

    renderGames();
    renderAgents();
  }

  // ---------- help modal ----------
  var helpModal = $("helpModal");
  function openHelp(){ helpModal.classList.add("show"); }
  function closeHelp(){ helpModal.classList.remove("show"); }
  $("btnHelp").addEventListener("click", openHelp);
  $("btnHelpClose").addEventListener("click", closeHelp);
  helpModal.addEventListener("click", function(e){
    // close when clicking the backdrop (not the inner panel)
    if(e.target === helpModal) closeHelp();
  });

  // ---------- wire ----------
  btnPlay.addEventListener("click", launchPlay);
  $("btnCloseOverlay").addEventListener("click", closeOverlay);
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape"){
      if(helpModal.classList.contains("show")){ closeHelp(); return; }
      if(overlay.classList.contains("show")) closeOverlay();
    }
  });

  // ---------- init ----------
  loadCatalog();

})();


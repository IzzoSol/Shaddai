/* ══════════════════════════════════════════════════════════════════
   SHADDAI — WORKFLOW GALLERY
   A categorized, one-click catalog of agent workflows. Each card runs a
   REAL agent chain through POST /api/agents/route (the same engine the
   dashboard uses). Mounts at the top of the Workflow tab (#workflowView).
   Self-contained, null-safe, never throws.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // agent → {emoji,label} for chips
  var AG = {
    ORACLE:['🔮','ORACLE'], ZEROX:['💰','ZEROX'], NEXUS:['🛠','NEXUS'],
    TURTLE:['🎨','TURTLE'], QUILL:['✍','QUILL'], PIKADON:['🛡','PIKADON'], SHADDAI:['⚡','SHADDAI']
  };

  // Each workflow: {id,title,desc,icon,chain:[{agent,prompt}]}  {input}=user input, {prev}=previous step output
  var CATALOG = [
    { cat:'Media', items:[
      { id:'thumbs', title:'Thumbnail Concepts', icon:'🖼', desc:'Generate multiple video-thumbnail concepts with hooks, text overlays, and color directions.',
        chain:[{agent:'TURTLE', prompt:'Generate 5 distinct, click-worthy YouTube thumbnail concepts for this video. For each: layout, focal image, 2-4 word text hook, color palette, and the emotion it triggers. Video: {input}'}] },
      { id:'prodphoto', title:'Product Photo Brief', icon:'📸', desc:'Art-direct multiple product-shot variations across lighting, angle, and background.',
        chain:[{agent:'TURTLE', prompt:'Create a product-photography shot list (6 variations) for this product — lighting, angle, background, props, and mood for each. Product: {input}'}] },
      { id:'vhook', title:'Video Hooks', icon:'🎬', desc:'Write scroll-stopping opening hooks for short-form video.',
        chain:[{agent:'QUILL', prompt:'Write 8 scroll-stopping 1-line video hooks (first 3 seconds) for this topic, each a different angle. Topic: {input}'}] },
    ]},
    { cat:'Marketing', items:[
      { id:'store', title:'Store Optimizer', icon:'🛒', desc:'Improve product listings, SEO tags, and conversion with competitive insight.',
        chain:[{agent:'ORACLE', prompt:'Analyze this storefront/product and its market; list the top gaps vs competitors. {input}'},
               {agent:'ZEROX', prompt:'Turn these findings into a prioritized optimization plan (listings, pricing, SEO tags, photography): {prev}'}] },
      { id:'compintel', title:'Competitive Intelligence', icon:'🎯', desc:'Track competitor launches, pricing, and positioning.',
        chain:[{agent:'ORACLE', prompt:'Research competitors for this company/market: launches, pricing changes, positioning, strengths & weaknesses. {input}'}] },
      { id:'brandrep', title:'Brand Reputation', icon:'📣', desc:'Sentiment and positioning across social, reviews, and news.',
        chain:[{agent:'ORACLE', prompt:'Analyze this brand\'s reputation: sentiment themes across social/reviews/news, risks, and competitive positioning. {input}'}] },
      { id:'seo', title:'SEO Keyword Research', icon:'🔍', desc:'Search-intent analysis, competitor gaps, and a content plan.',
        chain:[{agent:'ORACLE', prompt:'Do SEO keyword research for this site/topic: cluster by search intent, find competitor content gaps, and output a prioritized content plan. {input}'}] },
    ]},
    { cat:'Research', items:[
      { id:'market', title:'Market Research', icon:'📊', desc:'Macro, industry, company, and customer trend analysis.',
        chain:[{agent:'ORACLE', prompt:'Perform in-depth market research on: {input}. Cover macro trends, industry dynamics, key players, and customer segments.'}] },
      { id:'teardown', title:'Product Teardown', icon:'🔬', desc:'Pricing, features, onboarding, and positioning breakdown.',
        chain:[{agent:'ORACLE', prompt:'Do a structured product teardown of: {input}. Analyze pricing, core features, onboarding flow, and market positioning.'}] },
      { id:'audit', title:'Website Audit', icon:'🌐', desc:'Full marketing + technical audit of a URL.',
        chain:[{agent:'ORACLE', prompt:'Marketing audit of this website: messaging, funnel, SEO, CTAs. {input}'},
               {agent:'PIKADON', prompt:'Add a security & trust review (SSL, privacy, obvious risks) to this audit: {prev}'}] },
      { id:'dd', title:'Due Diligence', icon:'🧾', desc:'Market, competitors, team, financials, and risk in one pass.',
        chain:[{agent:'ORACLE', prompt:'Due diligence — market & competitors for: {input}'},
               {agent:'ZEROX', prompt:'Add financial/business-model diligence: {prev}'},
               {agent:'PIKADON', prompt:'Add regulatory & risk diligence: {prev}'},
               {agent:'SHADDAI', prompt:'Executive go/no-go summary with the top risks and upside: {prev}'}] },
    ]},
    { cat:'Sales', items:[
      { id:'outreach', title:'Outreach Message', icon:'✉️', desc:'Personalized outreach for a contact or company.',
        chain:[{agent:'QUILL', prompt:'Write 3 personalized cold-outreach messages (different angles, <120 words each) for: {input}'}] },
      { id:'prospect', title:'Prospect Research', icon:'🕵️', desc:'Decision-makers, business history, and tech stack.',
        chain:[{agent:'ORACLE', prompt:'Research this prospect/company — decision makers, recent news, likely tech stack, and hooks. {input}'},
               {agent:'QUILL', prompt:'Write a 1-paragraph outreach angle based on this research: {prev}'}] },
      { id:'demo', title:'Customer Demo Script', icon:'🎤', desc:'Tailored use cases, talking points, and demo flow.',
        chain:[{agent:'QUILL', prompt:'Create a customer-specific demo script — use cases, talking points, objection handling — for: {input}'}] },
    ]},
    { cat:'Writing', items:[
      { id:'newsletter', title:'Newsletter Creator', icon:'📰', desc:'Turn topics/links into a ready-to-send newsletter.',
        chain:[{agent:'ORACLE', prompt:'Gather the key points and angles for a newsletter on: {input}'},
               {agent:'QUILL', prompt:'Write a polished newsletter (subject line, intro, 3 sections, CTA) from: {prev}'}] },
      { id:'summary', title:'Document Summary', icon:'📄', desc:'Key metrics, takeaways, and an exec summary.',
        chain:[{agent:'QUILL', prompt:'Summarize this into an executive brief with key metrics and 5 takeaways: {input}'}] },
      { id:'polish', title:'Message Polish', icon:'✨', desc:'Refine a draft with tone and audience targeting.',
        chain:[{agent:'QUILL', prompt:'Polish and improve this draft; keep intent, sharpen clarity and tone. Return the improved version plus 2 alt tones. {input}'}] },
    ]},
    { cat:'Creative', items:[
      { id:'website', title:'Website Builder Plan', icon:'🧱', desc:'Design plan + build blueprint for a site.',
        chain:[{agent:'TURTLE', prompt:'Design plan for this website: aesthetic direction, sections, layout, and components. {input}'},
               {agent:'NEXUS', prompt:'Turn this design into a concrete build blueprint (stack, pages, data, deploy steps): {prev}'}] },
      { id:'slides', title:'Slide Deck', icon:'📽', desc:'Research a topic and get a structured presentation.',
        chain:[{agent:'ORACLE', prompt:'Research and distill the key insights for a presentation on: {input}'},
               {agent:'QUILL', prompt:'Turn this into a 10-slide deck outline (title + 3 bullets per slide): {prev}'}] },
    ]},
    { cat:'Finance', items:[
      { id:'pitch', title:'Pitch Deck Screen', icon:'📈', desc:'Score a startup deck with gaps and diligence questions.',
        chain:[{agent:'ZEROX', prompt:'Review this startup pitch as a VC: score team/market/traction/moat, highlights, gaps. {input}'},
               {agent:'SHADDAI', prompt:'Give an invest / pass call with the 3 sharpest diligence questions: {prev}'}] },
      { id:'marketmap', title:'Market Map', icon:'🗺', desc:'Categorize an industry by sub-segment, stage, and funding.',
        chain:[{agent:'ORACLE', prompt:'Build a market map for this vertical: sub-segments, notable companies, stage & funding. {input}'}] },
      { id:'revintel', title:'Revenue Intelligence', icon:'💹', desc:'Model revenue, scan competitors, get a recommendation.',
        chain:[{agent:'ZEROX', prompt:'Model the revenue picture and unit economics for: {input}'},
               {agent:'ORACLE', prompt:'Find competitors and pricing benchmarks: {prev}'},
               {agent:'SHADDAI', prompt:'Make a clear strategic recommendation: {prev}'}] },
    ]},
    { cat:'Legal', items:[
      { id:'contract', title:'Contract Review', icon:'📑', desc:'Clause-by-clause risk analysis and redline suggestions.',
        chain:[{agent:'PIKADON', prompt:'Review this contract clause-by-clause: risk ratings, red flags, missing protections. {input}'},
               {agent:'QUILL', prompt:'Write a plain-English issues list with suggested redlines from: {prev}'}] },
      { id:'compliance', title:'Compliance Monitor', icon:'⚖️', desc:'Flag regulatory changes relevant to your focus.',
        chain:[{agent:'PIKADON', prompt:'Identify the key compliance/regulatory considerations and recent changes for: {input}'}] },
    ]},
    { cat:'Careers', items:[
      { id:'cover', title:'Cover Letter', icon:'📝', desc:'Tailored cover letter from role + background.',
        chain:[{agent:'QUILL', prompt:'Write a tailored, confident cover letter for this role using this background: {input}'}] },
      { id:'interview', title:'Interview Prep', icon:'🎓', desc:'Company-specific questions and prep plan.',
        chain:[{agent:'ORACLE', prompt:'Research this company/role for interview prep — priorities, likely questions, culture. {input}'},
               {agent:'QUILL', prompt:'Turn this into a prep sheet: 10 likely questions with strong answer frames: {prev}'}] },
    ]},
    { cat:'Strategy', items:[
      { id:'idea2product', title:'Idea → Product', icon:'💡', desc:'Concept → feasibility → business model → go-to-market.',
        chain:[{agent:'TURTLE', prompt:'Expand this idea into a product concept: {input}'},
               {agent:'NEXUS', prompt:'Technical feasibility & build approach: {prev}'},
               {agent:'ZEROX', prompt:'Business model & monetization: {prev}'},
               {agent:'SHADDAI', prompt:'Final synthesis + go-to-market plan: {prev}'}] },
      { id:'secaudit', title:'Full Security Audit', icon:'🔐', desc:'Security scan → architecture review → exec summary.',
        chain:[{agent:'PIKADON', prompt:'Security audit — threats & vulnerabilities for: {input}'},
               {agent:'NEXUS', prompt:'Technical review of these findings & fixes: {prev}'},
               {agent:'SHADDAI', prompt:'Executive summary with prioritized actions: {prev}'}] },
    ]},
  ];

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function agentsLabel(chain){
    return chain.map(function(s){ return (AG[s.agent]||['•',s.agent])[1]; })
                .filter(function(v,i,a){return a.indexOf(v)===i;}).join(' → ');
  }

  // ── Real runner: POST /api/agents/route per step ──
  function runStep(agent, message){
    return fetch('/api/agents/route', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: message, agentName: agent, history: [] })
    }).then(function(r){ return r.json(); })
      .then(function(d){ return (d && (d.response || d.reply || d.text)) || '(no response)'; });
  }

  function findWF(id){
    for (var i=0;i<CATALOG.length;i++){ var it=CATALOG[i].items;
      for (var j=0;j<it.length;j++){ if(it[j].id===id) return it[j]; } }
    return null;
  }

  // ── Run overlay ──
  function openRun(wf){
    var ov = document.getElementById('shdwf-overlay');
    if(!ov){ return; }
    document.getElementById('shdwf-m-ico').textContent = wf.icon;
    document.getElementById('shdwf-m-title').textContent = wf.title;
    document.getElementById('shdwf-m-sub').textContent = agentsLabel(wf.chain) + ' · ' + wf.chain.length + ' step' + (wf.chain.length>1?'s':'');
    var ta = document.getElementById('shdwf-input'); ta.value=''; ta.placeholder = wf.desc;
    document.getElementById('shdwf-steps').textContent = 'This runs ' + wf.chain.length + ' agent step' + (wf.chain.length>1?'s':'') + ' on the real engine.';
    var out = document.getElementById('shdwf-out'); out.innerHTML='';
    var go = document.getElementById('shdwf-go'); go.disabled=false; go.textContent='▶ Run Workflow';
    go.onclick = function(){ runWF(wf); };
    ov.classList.add('on');
    setTimeout(function(){ ta.focus(); }, 60);
  }

  // ── Fire-and-forget: persist a finished workflow into the Results Inbox ──
  function saveResult(wf, input, finalOutput, stepLog){
    try {
      fetch('/api/results', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          workflowId: wf.id,
          title: wf.title,
          agents: wf.chain.map(function(s){ return s.agent; }),
          input: input,
          output: finalOutput,
          steps: stepLog
        })
      }).then(function(){ try { if(window.SHADDAI_RESULTS && window.SHADDAI_RESULTS.refresh) window.SHADDAI_RESULTS.refresh(); } catch(e){} })
        .catch(function(){});
    } catch(e){}
  }

  function runWF(wf){
    var input = (document.getElementById('shdwf-input').value || '').trim();
    if(!input){ document.getElementById('shdwf-input').focus(); return; }
    var go = document.getElementById('shdwf-go'); go.disabled=true; go.innerHTML='<span class="shdwf-spin">⟳</span> Running…';
    var out = document.getElementById('shdwf-out'); out.innerHTML='';
    var prev = input;
    var stepLog = [];

    var i = 0;
    function step(){
      if(i >= wf.chain.length){
        go.disabled=false; go.textContent='✓ Done — Run again';
        saveResult(wf, input, prev, stepLog);
        return;
      }
      var s = wf.chain[i];
      var msg = s.prompt.replace(/\{input\}/g, input).replace(/\{prev\}/g, prev).replace(/\{step(\d+)\}/g, function(_,n){ return prev; });
      var box = document.createElement('div'); box.className='shdwf-step';
      var ag = AG[s.agent]||['•',s.agent];
      box.innerHTML = '<div class="shdwf-step-hd" id="shdwf-h'+i+'"><span class="dot"></span>'+
        '<span>STEP '+(i+1)+' · '+ag[0]+' '+esc(ag[1])+'</span>'+
        '<span style="margin-left:auto" class="shdwf-spin">⟳</span></div>'+
        '<div class="shdwf-step-body" id="shdwf-b'+i+'">…</div>';
      out.appendChild(box);
      box.scrollIntoView({behavior:'smooth', block:'nearest'});

      runStep(s.agent, msg).then(function(res){
        document.getElementById('shdwf-b'+i).textContent = res;
        var h=document.getElementById('shdwf-h'+i); h.classList.add('done');
        h.querySelector('.shdwf-spin').remove();
        stepLog.push({ agent: s.agent, prompt: msg, output: res });
        prev = res; i++; step();
      }).catch(function(e){
        document.getElementById('shdwf-b'+i).textContent = '⚠ '+(e&&e.message||'failed');
        var h=document.getElementById('shdwf-h'+i); h.classList.add('err');
        var sp=h.querySelector('.shdwf-spin'); if(sp) sp.remove();
        go.disabled=false; go.textContent='Retry';
      });
    }
    step();
  }

  function buildOverlay(){
    if(document.getElementById('shdwf-overlay')) return;
    var ov=document.createElement('div'); ov.id='shdwf-overlay';
    ov.innerHTML =
      '<div id="shdwf-modal">'+
        '<div class="shdwf-m-hd"><span class="shdwf-m-ico" id="shdwf-m-ico">⚡</span>'+
          '<div><div class="shdwf-m-title" id="shdwf-m-title">Workflow</div>'+
          '<div class="shdwf-m-sub" id="shdwf-m-sub"></div></div>'+
          '<button class="shdwf-m-x" id="shdwf-m-x">✕</button></div>'+
        '<div class="shdwf-m-body">'+
          '<label>Your input</label>'+
          '<textarea id="shdwf-input"></textarea>'+
          '<div class="shdwf-steps" id="shdwf-steps"></div>'+
          '<button class="shdwf-go" id="shdwf-go">▶ Run Workflow</button>'+
          '<div class="shdwf-out" id="shdwf-out"></div>'+
        '</div>'+
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('shdwf-m-x').onclick=function(){ ov.classList.remove('on'); };
    ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('on'); });
  }

  function render(container){
    if(container.querySelector('#shdwf-gallery')) return;
    var g=document.createElement('div'); g.id='shdwf-gallery';
    var cats = CATALOG.map(function(c){ return c.cat; });
    var html = '<div class="shdwf-hd"><h2>⚡ WORKFLOW GALLERY</h2>'+
      '<span class="shdwf-sub">one-click agent workflows · real engine</span></div>'+
      '<div class="shdwf-filters"><button class="shdwf-fbtn on" data-cat="ALL">ALL</button>'+
      cats.map(function(c){ return '<button class="shdwf-fbtn" data-cat="'+esc(c)+'">'+esc(c)+'</button>'; }).join('')+'</div>'+
      CATALOG.map(function(c){
        return '<div class="shdwf-cat" data-cat="'+esc(c.cat)+'"><div class="shdwf-cat-hd">'+esc(c.cat)+'</div>'+
          '<div class="shdwf-grid">'+ c.items.map(function(w){
            return '<div class="shdwf-card" data-id="'+w.id+'">'+
              '<div class="shdwf-c-top"><span class="shdwf-ico">'+w.icon+'</span>'+
              '<span class="shdwf-title">'+esc(w.title)+'</span></div>'+
              '<div class="shdwf-desc">'+esc(w.desc)+'</div>'+
              '<div class="shdwf-meta"><span class="shdwf-agents">'+esc(agentsLabel(w.chain))+'</span>'+
              '<span class="shdwf-run">▶ Run</span></div></div>';
          }).join('') +'</div></div>';
      }).join('');
    g.innerHTML = html;
    container.insertBefore(g, container.firstChild);

    g.addEventListener('click', function(e){
      var card=e.target.closest('.shdwf-card');
      if(card){ var wf=findWF(card.getAttribute('data-id')); if(wf) openRun(wf); return; }
      var fb=e.target.closest('.shdwf-fbtn');
      if(fb){
        g.querySelectorAll('.shdwf-fbtn').forEach(function(b){ b.classList.toggle('on', b===fb); });
        var cat=fb.getAttribute('data-cat');
        g.querySelectorAll('.shdwf-cat').forEach(function(sec){
          sec.style.display = (cat==='ALL'||sec.getAttribute('data-cat')===cat) ? '' : 'none';
        });
      }
    });
  }

  function mount(){
    var target = document.getElementById('workflowView');
    if(target){ buildOverlay(); render(target); return true; }
    return false;
  }

  function boot(){
    if(mount()) return;
    var tries=0, t=setInterval(function(){ tries++; if(mount()||tries>50) clearInterval(t); }, 100);
  }
  // ── Public API so the Command Floor (and anything else) can launch a workflow ──
  window.SHADDAI_WF = {
    catalog: CATALOG,
    list: function(){ return CATALOG; },
    openRun: function(id){
      var wf = findWF(id);
      if(!wf){ return false; }
      buildOverlay();
      openRun(wf);
      return true;
    }
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

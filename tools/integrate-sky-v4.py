import sys
p='public/SHADDAI-WORLD-3D.html'; s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    n=s.count(a)
    if n!=1: sys.exit('ANCHOR x%d %r'%(n,a[:80]))
    s=s.replace(a,b)
rep("let _v4T = null, _v4Water = null, _v4Meta = null, _v4Fill = null;","let _v4T = null, _v4Water = null, _v4Meta = null, _v4Fill = null;\nlet _v4Sky = null;                        // MAP v4 sky/day-night (world-sky-v4.js)")
rep("function updateDayNight(dt){","function updateDayNight(dt){\n  if(_v4Sky) return;   // MAP v4: world-sky-v4.js owns time, sun/moon light, hemi, fog, exposure")
rep("  if(window._themeLocked) return;   // a global theme owns the sky/fog — don't fight it","  if(_v4Sky) return;                // MAP v4: fog colour must equal the v4 sky horizon\n  if(window._themeLocked) return;   // a global theme owns the sky/fog — don't fight it")
rep("if(MAP_V4) scene.fog.density = 0.000055;","""if(MAP_V4) scene.fog.density = 0.000055;
if(MAP_V4){
  skyDome.visible = false; starGroup.visible = false;   // replaced by world-sky-v4.js (stars/clouds/moon are in its shader)
  sun2.visible = false; rim.visible = false;            // one directional light only: the sky drives `sun`
  _loadScript('/world-sky-v4.js?v=20260926sky').then(function(){
    _v4Sky = window.buildWorldSkyV4({ THREE, scene, renderer, camera, sunLight: sun, hemiLight: hemi, ambientLight: ambient,
      fog: scene.fog, water: _v4Water, dayLengthMin: 24 });
    window.__w3dDebug.skyV4 = _v4Sky;
  }).catch(function(e){ console.warn('[map-v4] sky failed:', e && e.message); });
}""")
rep("      try{ _v4Water = _buildV4Water(api); window.__w3dDebug.waterV4 = _v4Water; }catch(e){ console.warn('[map-v4] water build failed:', e && e.message); }",
    "      try{ _v4Water = _buildV4Water(api); window.__w3dDebug.waterV4 = _v4Water; }catch(e){ console.warn('[map-v4] water build failed:', e && e.message); }\n      if(_v4Sky && _v4Water) _v4Sky.setWater(_v4Water);   // sky may have loaded first")
rep("  if(MAP_V4){ if(_v4T) _v4T.update(t, dt);","  if(MAP_V4){ if(_v4Sky) _v4Sky.update(dt, playerPos); if(_v4T) _v4T.update(t, dt);")
rep("  window.__quality = t.name;\n","  window.__quality = t.name;\n  if(typeof _v4Sky !== 'undefined' && _v4Sky) _v4Sky.setQuality(t.name);   // shadow map size + cadence\n")
rep("addEventListener('keydown', e=>{ if(e.code==='KeyN'){ DAYNIGHT.cycleSec = DAYNIGHT.cycleSec > 60 ? 12 : 240; } });",
    "addEventListener('keydown', e=>{ if(e.code==='KeyN'){ if(_v4Sky) _v4Sky.setDayLength(_v4Sky.dayLengthMin > 1 ? 0.2 : 24); else DAYNIGHT.cycleSec = DAYNIGHT.cycleSec > 60 ? 12 : 240; } });")
open(p,'w',encoding='utf-8').write(s); print('sky wired')

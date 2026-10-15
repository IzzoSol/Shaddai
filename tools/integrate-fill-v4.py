import sys
p='public/SHADDAI-WORLD-3D.html'; s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    if s.count(a)!=1: sys.exit('ANCHOR x%d %r'%(s.count(a),a[:70]))
    s=s.replace(a,b)
rep("let _v4T = null, _v4Water = null, _v4Meta = null;","let _v4T = null, _v4Water = null, _v4Meta = null, _v4Fill = null;")
rep("    .then(function(api){ try{ __buildRealmModules(); }catch(e){ console.warn('world core build failed:', e && e.message); } return api; });",
"""    .then(function(api){ try{ __buildRealmModules(); }catch(e){ console.warn('world core build failed:', e && e.message); } return api; })
    .then(function(api){   // MAP v4 FILL (world-fill-v4.js): realm vegetation, waystations, floating islands, bridges
      if(!api || !_v4Meta) return api;
      return _loadScript('/world-fill-v4.js?v=20260926a').then(function(){
        const fl = new GLTFLoader(); fl.setDRACOLoader(dracoLoader); fl.setMeshoptDecoder(MeshoptDecoder);   // own loader: streams after entry
        _v4Fill = window.buildWorldFillV4({ THREE, scene, camera, loader: fl, heightAt: api.heightAt,
          isWater: (_v4Water && _v4Water.isWater) ? (x, z)=> _v4Water.isWater(x, z) : null, terrainMeta: _v4Meta });
        window.__w3dDebug.fillV4 = _v4Fill;
      }).catch(function(e){ console.warn('[map-v4] fill failed:', e && e.message); }).then(function(){ return api; });
    });""")
rep("if(MAP_V4){ if(_v4T) _v4T.update(t, dt); if(_v4Water) _v4Water.update(t, dt); }","if(MAP_V4){ if(_v4T) _v4T.update(t, dt); if(_v4Water) _v4Water.update(t, dt); if(_v4Fill) _v4Fill.update(t, dt, camera.position); }")
open(p,'w',encoding='utf-8').write(s); print('fill wired')

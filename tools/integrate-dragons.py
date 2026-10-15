# One-shot: wire docs/DRAGONS.md into the host (+ the crossing gate in world-transit.js). Exact anchors, asserted.
import sys
p = 'public/SHADDAI-WORLD-3D.html'
s = open(p, encoding='utf-8').read()
def rep(a, b, src=None):
    global s
    n = s.count(a)
    if n != 1: sys.exit('ANCHOR x%d %r' % (n, a[:80]))
    s = s.replace(a, b)

# 1 load + build after the canon city
a = "      }).then(function(c){ window.__w3dDebug.canonV4 = c; }).catch(function(e){ console.warn('[map-v4] canon failed:', e && e.message); }).then(function(){ return api; });\n    });"
rep(a, """      }).then(function(c){ window.__w3dDebug.canonV4 = c; }).catch(function(e){ console.warn('[map-v4] canon failed:', e && e.message); }).then(function(){ return api; });
    })
    .then(function(api){   // MAP v4 CROSSING DRAGONS (world-dragons.js) — one per ring station, beaten = crossing open forever
      if(!api) return api;
      return _loadScript('/world-dragons.js?v=20260926a').then(function(){
        const dl = new GLTFLoader(); dl.setDRACOLoader(dracoLoader); dl.setMeshoptDecoder(MeshoptDecoder);
        const KEY = 'w3d_dragons_defeated';
        const load = ()=>{ try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch(_){ return []; } };
        window.__dragons = window.buildWorldDragons({ THREE, scene, camera, loader: dl, heightAt: api.heightAt,
          layout: window.WORLD_LAYOUT,
          getPlayer: ()=> ({ pos: playerAvatar ? playerAvatar.position : playerPos,
                             alive: !(_interiors && _interiors.isInside()) && (window.__playerHP == null || window.__playerHP > 0) }),
          onHitPlayer: (dmg, kind, info)=> window.__onDragonHit && window.__onDragonHit(dmg, kind, info),
          isDefeated: id => load().indexOf(id) >= 0,
          setDefeated: id => { const a = load(); if(a.indexOf(id) < 0){ a.push(id); try{ localStorage.setItem(KEY, JSON.stringify(a)); }catch(_){} } },
          modelFor: () => null });
        window.__w3dDebug.dragons = window.__dragons;
        ['land','roar','swoop'].forEach(function(ev){ window.__dragons.on(ev, function(e){
          if(!e || !e.shake || !e.pos) return; const d = Math.hypot(e.pos.x - playerPos.x, e.pos.z - playerPos.z);
          if(d < 150 * V4_U){ window.__dragonShake && window.__dragonShake(e.shake.intensity, e.shake.duration); } }); });
        window.__dragons.on('defeated', function(e){ if(window.__toast) window.__toast('🐉 ' + (e && e.name || 'The dragon') + ' bows — crossing open'); });
      }).catch(function(e){ console.warn('[map-v4] dragons failed:', e && e.message); }).then(function(){ return api; });
    });""")

# 2 tick + knockback + shake (after the v4 update line)
a = "if(window.__w3dDebug.clustersV4 && window.__w3dDebug.clustersV4.update) window.__w3dDebug.clustersV4.update(t, dt, camera.position); }"
rep(a, a + """
  if(MAP_V4 && window.__dragons && !_spawnBusy) window.__dragons.update(dt);
  if(_dragonKB){ playerPos.x += _dragonKB.x*dt; playerPos.z += _dragonKB.z*dt; if((_dragonKB.t -= dt) <= 0) _dragonKB = null; }""")
# camera shake applied right before render (after the camera is placed)
a = "  composer.render();\n  window.__perfFrame(dt);"
rep(a, "  if(_shakeT > 0){ _shakeT -= dt; camera.position.x += (Math.random()-0.5)*_shakeI; camera.position.y += (Math.random()-0.5)*_shakeI; }   // dragon hits / stomps\n" + a)

# 3 player HP + knockback + shake state
a = "function playerBasicAttack(){"
rep(a, """window.__playerHP = 100; let _dragonKB = null, _shakeT = 0, _shakeI = 0;
window.__dragonShake = function(i, d){ _shakeI = Math.max(_shakeI, i || 0.4); _shakeT = Math.max(_shakeT, d || 0.3); };
window.__onDragonHit = function(dmg, kind, info){
  window.__playerHP = Math.max(0, window.__playerHP - dmg);
  if(info && info.knockback) _dragonKB = { x: info.knockback.x, z: info.knockback.z, t: 0.35 };
  window.__dragonShake(kind === 'stagger' ? 0.25 : 0.6, 0.35);
  if(window.__playerHP <= 0){ window.__playerHP = 100; const c = window.WORLD_LAYOUT.stations[0].pos; playerPos.x = c[0]; playerPos.z = c[1]; if(window.__toast) window.__toast('💀 Downed — back at Central Station'); }
};
function playerBasicAttack(){""")

# 4 player attacks -> dragons
a = "_attackFlash(); }"
if s.count(a) >= 1:
    i = s.index("function playerBasicAttack(){"); j = s.index(a, i)
    s = s[:j] + "if(window.__dragons) window.__dragons.meleeHit(playerAvatar.position, fwd, 6*V4_U, 12); " + s[j:]
else: sys.exit('no _attackFlash anchor')
rep("function playerKick(){", "function playerKick(){ if(window.__dragons) window.__dragons.meleeHit(playerAvatar.position, fwd, 6*V4_U, 10);")
rep("p.age+=dt; p.o.position.addScaledVector(p.vel,dt);", """p.age+=dt; p.o.position.addScaledVector(p.vel,dt);
      if(window.__dragons && !p.hitDragon){ const _hid = window.__dragons.hitTest(p.o.position, 1.5);
        if(_hid){ p.hitDragon = true; window.__dragons.damage(_hid, 18, p.o.position, p.dtype || 'arcane'); p.age = p.life; } }""")
rep("function playerFlipOrFly(){", "function playerFlipOrFly(){ if(window.__dragons) window.__dragons.setPlayerInvulnerable(0.45);")
open(p, 'w', encoding='utf-8').write(s)

# 5 crossing gate in world-transit.js: the ride refuses a destination whose dragon still guards it
q = 'public/world-transit.js'; t = open(q, encoding='utf-8').read()
a = "    function ride(from, dest) {"
if t.count(a) != 1: sys.exit('transit anchor')
t = t.replace(a, """    function ride(from, dest) {
      if (window.__dragons && window.__dragons.isOpen && !window.__dragons.isOpen(dest.id)) {   // crossing dragons: beaten once = open forever
        if (window.__toast) window.__toast('🐉 A dragon guards ' + dest.name + ' — defeat it at the crossing first'); return;
      }""")
open(q, 'w', encoding='utf-8').write(t)
print('dragons wired')

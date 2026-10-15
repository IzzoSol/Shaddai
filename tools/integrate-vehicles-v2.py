# One-shot: wire docs/VEHICLES-V2.md into public/SHADDAI-WORLD-3D.html (exact-anchor replacements, asserts each anchor once).
import sys
p = 'public/SHADDAI-WORLD-3D.html'
s = open(p, encoding='utf-8').read()

def rep(a, b):
    global s
    n = s.count(a)
    if n != 1:
        sys.exit('ANCHOR x%d: %r' % (n, a[:80]))
    s = s.replace(a, b)

# 1 script tags
rep('<script src="/world-actions.js?v=20260924a"></script>',
    '<script src="/world-actions.js?v=20260926v2"></script>\n'
    '<script src="/world-hoverboard.js?v=20260926v2"></script>   <!-- VEHICLES V2: hoverboard (O); after world-actions (WorldRiderPose) -->')

# 2 hoist loader, bike options, hoverboard build
rep("try{\n  const _acLoader = new GLTFLoader(__loadMgr);", "let _acLoader = null;\ntry{\n  _acLoader = new GLTFLoader(__loadMgr);")
rep("""    isShift: function(){ return !!(keys['ShiftLeft']||keys['ShiftRight']); },
  });
}catch(e){ console.warn('world-actions init failed:', e && e.message); }""",
"""    isShift: function(){ return !!(keys['ShiftLeft']||keys['ShiftRight']); },
    // ── VEHICLES V2 (docs/VEHICLES-V2.md) ──
    bikeMesh: gridBike,
    avatar: playerAvatar,
    heightAt: function(x,z){ return window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x,z) : ((worldTerrain && worldTerrain.heightAt) ? worldTerrain.heightAt(x,z) : 0); },
    getColliders: function(){ return (window.WORLD_LAYOUT && window.WORLD_LAYOUT.realmColliders) || []; },
  });
}catch(e){ console.warn('world-actions init failed:', e && e.message); }
// HOVERBOARD V2 (world-hoverboard.js) — O to ride. Shares the GLTF loader (meshopt+draco).
let hover = null;
try{
  if (window.buildWorldHoverboard && _acLoader) hover = window.buildWorldHoverboard({
    THREE, scene, loader: _acLoader, playerPos,
    heightAt: function(x,z){ return window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x,z) : ((worldTerrain && worldTerrain.heightAt) ? worldTerrain.heightAt(x,z) : 0); },
    colliders: function(){ return (window.WORLD_LAYOUT && window.WORLD_LAYOUT.realmColliders) || []; },
    time: function(){ return clock.elapsedTime; },
  });
}catch(e){ console.warn('world-hoverboard init failed:', e && e.message); }""")

# 3 keys
kb = "  if(e.code==='KeyB'){ bikeMode=!bikeMode;"
rep(kb, "  if(e.code==='KeyB' && typeof hover!=='undefined' && hover && hover.isRiding()) hover.dismount();   // one vehicle at a time\n" + kb)
tail = "// B = mount/dismount Grid Bike (auto 3rd-person so you see the cycle)"
rep(tail, tail + """
  if(e.code==='KeyO' && !e.repeat && typeof hover!=='undefined' && hover && !(_interiors && _interiors.isInside())){   // O = hoverboard V2
    if(bikeMode){ bikeMode=false; const h=document.getElementById('bikeHud'); if(h) h.style.display='none'; trailPos.length=0; updateTrail(); }
    if(hover.isRiding()) hover.dismount();
    else { thirdPerson=true; hover.mount(playerAvatar, { yaw: Math.atan2(fwd.x, fwd.z), speedMS: Math.hypot(_vel.x,_vel.z)/(7/1.8) }); }
  }""")

# 4 movement
rep("""    _moveDir.set(0,0,0);
    if(keys['KeyW']||keys['ArrowUp'])    _moveDir.add(fwd);
    if(keys['KeyS']||keys['ArrowDown'])  _moveDir.sub(fwd);
    if(keys['KeyA']||keys['ArrowLeft'])  _moveDir.sub(right);
    if(keys['KeyD']||keys['ArrowRight']) _moveDir.add(right);
    if(_moveDir.lengthSq() > 1e-6) _moveDir.normalize();
    _targetVel.copy(_moveDir).multiplyScalar(_maxSp);
    const _acc = 1 - Math.exp(-14*dt);                          // ~14/s: responsive but smooth (frame-rate independent)
    _vel.x += (_targetVel.x - _vel.x) * _acc;
    _vel.z += (_targetVel.z - _vel.z) * _acc;
    const _px0 = playerPos.x, _pz0 = playerPos.z;
    playerPos.x += _vel.x * dt;
    playerPos.z += _vel.z * dt;""",
"""    const _px0 = playerPos.x, _pz0 = playerPos.z;
    const _camYaw = Math.atan2(fwd.x, fwd.z);
    if (veh.bike && (bikeMode || veh.bike.isRiding())) {
      // GRID BIKE V2: throttle/brake/steer physics moves playerPos (world-actions.js BIKE_TUNE)
      const _thr = ((keys['KeyW']||keys['ArrowUp'])?1:0) - ((keys['KeyS']||keys['ArrowDown'])?1:0);
      const _str = ((keys['KeyD']||keys['ArrowRight'])?1:0) - ((keys['KeyA']||keys['ArrowLeft'])?1:0);
      const _bo = veh.bike.step(dt, { riding: bikeMode, throttle: _thr, steer: _str, camYaw: _camYaw, pos: playerPos, vel: _vel });
      _vel.x = _bo.vx; _vel.z = _bo.vz;          // hand the momentum back to walking on dismount
    } else if (hover && hover.isRiding()) {
      hover.step(dt, { fwd: !!(keys['KeyW']||keys['ArrowUp']), back: !!(keys['KeyS']||keys['ArrowDown']),
        left: !!(keys['KeyA']||keys['ArrowLeft']), right: !!(keys['KeyD']||keys['ArrowRight']),
        boost: !!(keys['ShiftLeft']||keys['ShiftRight']), jump: !!keys['Space'] }, _camYaw);
      const _hv = hover.velocity(); _vel.x = _hv.x; _vel.z = _hv.z;
    } else {
      _moveDir.set(0,0,0);
      if(keys['KeyW']||keys['ArrowUp'])    _moveDir.add(fwd);
      if(keys['KeyS']||keys['ArrowDown'])  _moveDir.sub(fwd);
      if(keys['KeyA']||keys['ArrowLeft'])  _moveDir.sub(right);
      if(keys['KeyD']||keys['ArrowRight']) _moveDir.add(right);
      if(_moveDir.lengthSq() > 1e-6) _moveDir.normalize();
      _targetVel.copy(_moveDir).multiplyScalar(_maxSp);
      const _acc = 1 - Math.exp(-14*dt);                          // ~14/s: responsive but smooth (frame-rate independent)
      _vel.x += (_targetVel.x - _vel.x) * _acc;
      _vel.z += (_targetVel.z - _vel.z) * _acc;
      playerPos.x += _vel.x * dt;
      playerPos.z += _vel.z * dt;
    }""")
rep("if(bikeMode){ trailPos.push(playerPos.x, 0.35, playerPos.z);", "if(bikeMode){ trailPos.push(playerPos.x, veh.bike ? veh.bike.trailY() : 0.35, playerPos.z);")

# 5 camera / eye / ground
rep("const eye = bikeMode ? 1.5 :", "const eye = bikeMode ? (1.9 * _PLAYER_EYE_K) :")
rep("if (!veh.mode && !(_elevators && _elevators.isRiding())", "if (!veh.mode && !(hover && hover.isRiding()) && !(_elevators && _elevators.isRiding())")
rep("const _rawBaseY = veh.baseY(groundY);", "const _rawBaseY = (hover && hover.isRiding()) ? hover.rideBaseY() : veh.baseY(groundY);")
rep("if(_smoothBaseY===undefined || _spawnBusy || (veh && veh.mode) ||", "if(_smoothBaseY===undefined || _spawnBusy || (veh && veh.mode) || (hover && hover.isRiding()) ||")

# 6 animation weights
rep("const m = bikeMode ? 0 : Math.min(1, spd/4);", "const m = (bikeMode || (typeof hover!=='undefined' && hover && hover.isActive())) ? 0 : Math.min(1, spd/4);")

# 7 per-frame visuals
rep("""  gridBike.visible = bikeMode;
  if(bikeMode){
    const _byt=Math.atan2(fwd.x, fwd.z);   // smooth the bike's heading too (banks into turns instead of snapping)
    if(!_avatarYawInit){ _avatarYaw=_byt; _avatarYawInit=true; } else _avatarYaw=_lerpAngle(_avatarYaw, _byt, 1-Math.exp(-9*dt));
    gridBike.position.set(playerPos.x, groundY, playerPos.z);
    gridBike.rotation.y = _avatarYaw;
    playerAvatar.visible = true;   // show the rider on the bike
    playerAvatar.position.set(playerPos.x, groundY+0.6, playerPos.z);
    playerAvatar.rotation.y = _avatarYaw;
  }""",
"""  // VEHICLES V2: bike + hoverboard place themselves AND the rider (seated / surf-stance IK)
  const _flatGround = !!((_interiors && _interiors.isInside()) || (_elevators && _elevators.isRiding()));
  if (veh.bike) {
    gridBike.visible = veh.bike.visible();          // parked bike stays where you left it
    veh.bike.pose(dt, { groundY, flat: _flatGround, showRider: thirdPerson });
  } else {
    gridBike.visible = bikeMode;
    if(bikeMode){ gridBike.position.set(playerPos.x, groundY, playerPos.z); gridBike.rotation.y = Math.atan2(fwd.x, fwd.z); playerAvatar.visible = true; playerAvatar.position.set(playerPos.x, groundY+0.6, playerPos.z); }
  }
  if (hover) hover.pose(dt, { showRider: thirdPerson ? true : undefined });""")

open(p, 'w', encoding='utf-8').write(s)
print('vehicles v2 wired')

# One-shot: wire docs/PLAYER-CONTROLLER.md into public/SHADDAI-WORLD-3D.html (exact anchors, each asserted once).
import sys
p = 'public/SHADDAI-WORLD-3D.html'
s = open(p, encoding='utf-8').read()

def rep(a, b, count=1):
    global s
    n = s.count(a)
    if n != count:
        sys.exit('ANCHOR x%d %r' % (n, a[:80]))
    s = s.replace(a, b)

# 1 script tag
rep('<script src="/world-collision.js?v=20260926obb"></script>',
    '<script src="/world-collision.js?v=20260926obb"></script>\n<script src="/world-player-controller.js?v=20260926a"></script>   <!-- kinematic capsule player (docs/PLAYER-CONTROLLER.md) -->')

# 2 state vars
a = "let _swimming=false;   // SWIM LAW: true while floating on a water surface (slower move, no seafloor walking)"
rep(a, a + "\nlet _pctl = null, _pctlOut = null, _pctlOn = false, _pctlWasOn = false, _pctlDeckY = null, _walkToggle = false;\n"
          "addEventListener('keydown', e=>{ if(e.code==='CapsLock' && !e.repeat) _walkToggle = !_walkToggle; });")

# 3 build
a = "}catch(e){ console.warn('world-hoverboard init failed:', e && e.message); }"
rep(a, a + """
// PLAYER CONTROLLER - real ground, slopes, steps, walls, jump/roll/climb/land compression (docs/PLAYER-CONTROLLER.md)
try{
  if (window.buildPlayerController) {
    const _terrH = function(x,z){ return window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x,z) : ((worldTerrain && worldTerrain.heightAt) ? worldTerrain.heightAt(x,z) : 0); };
    _pctl = window.buildPlayerController({
      THREE,
      heightAt: function(x,z){
        let h = _terrH(x,z);
        if (_pctlDeckY != null && _pctlDeckY > h && Math.abs(x-playerPos.x) < 4 && Math.abs(z-playerPos.z) < 4) h = _pctlDeckY;
        if (window.WORLD_BRIDGE_GROUNDY) { const b = window.WORLD_BRIDGE_GROUNDY(x, z, playerPos.y, 2.5); if (b !== null && b > h) h = b; }
        return h;
      },
      colliders: window.buildPlayerController.worldColliders(window),
      waterHeightAt: MAP_V4 ? function(x,z){ return _v4Water ? _v4Water.waterHeightAt(x,z) : null; } : function(){ return 0.05; },
    });
  }
}catch(e){ console.warn('player controller init failed:', e && e.message); _pctl = null; }""")

# 4 per-frame ownership
a = "const _uiOpen = (_dialogue&&_dialogue.isOpen()) || (_radio&&_radio.isOpen&&_radio.isOpen());"
rep(a, a + """
_pctlOn = !!_pctl && !_spawnBusy && !bikeMode && !(veh.bike && veh.bike.isRiding()) && !(hover && hover.isRiding()) && !veh.mode
          && !(_interiors && _interiors.isInside()) && !(_elevators && _elevators.isRiding());
_pctlDeckY = (_pctlOn && _elevators && _elevators.groundY) ? _elevators.groundY() : null;""")

# 5 walking branch between the hover branch and the legacy walk
a = "      const _hv = hover.velocity(); _vel.x = _hv.x; _vel.z = _hv.z;\n    } else {"
rep(a, """      const _hv = hover.velocity(); _vel.x = _hv.x; _vel.z = _hv.z;
    } else if (_pctlOn) {
      { const _cp = _pctl.getPos();
        if (!_pctlWasOn) _pctl.setPos(playerPos.x, undefined, playerPos.z);
        else if (Math.abs(playerPos.x-_cp.x) + Math.abs(playerPos.z-_cp.z) > 1e-3) _pctl.setPos(playerPos.x, playerPos.y, playerPos.z); }
      _pctl.setFacing(_avatarYaw);
      _pctlOut = _pctl.step(dt, {
        fwd: !!(keys['KeyW']||keys['ArrowUp']), back: !!(keys['KeyS']||keys['ArrowDown']),
        left: !!(keys['KeyA']||keys['ArrowLeft']), right: !!(keys['KeyD']||keys['ArrowRight']),
        sprint: !!(keys['ShiftLeft']||keys['ShiftRight']), jump: !!keys['Space'],
        roll: !!keys['KeyC'], crouch: !!keys['KeyZ'], walk: _walkToggle }, _camYaw);
      playerPos.set(_pctlOut.pos.x, _pctlOut.pos.y, _pctlOut.pos.z);   // host keeps ownership of playerPos (y = feet)
      _vel.x = _pctlOut.vel.x; _vel.z = _pctlOut.vel.z;
      _onPctlEvents(_pctlOut.events);
    } else {""")
a = "    _vel.x *= Math.max(0, 1 - dt*12);   // no input / not locked: coast to a stop, don't freeze mid-stride"
rep(a, "    if (_pctlOn && _pctlWasOn) { _pctlOut = _pctl.step(dt, {}, Math.atan2(fwd.x, fwd.z)); playerPos.set(_pctlOut.pos.x, _pctlOut.pos.y, _pctlOut.pos.z); _vel.x = _pctlOut.vel.x; _vel.z = _pctlOut.vel.z; }\n" + a)
a = "  // place camera by view mode (1st person = eyes; 3rd person = pulled back behind the avatar)"
rep(a, "  _pctlWasOn = _pctlOn;\n" + a)

# 6 retire the fixes the controller replaces (only while it owns the body)
rep("if (_r > _MN.r0 - 10 && _r < _MN.r1 + 10 && worldTerrain && worldTerrain.heightAt",
    "if (!_pctlOn && _r > _MN.r0 - 10 && _r < _MN.r1 + 10 && worldTerrain && worldTerrain.heightAt")
rep("if (window.WORLD_RESOLVE_POS) window.WORLD_RESOLVE_POS(playerPos); else _resolveBuildingCollision();",
    "if (!_pctlOn) { if (window.WORLD_RESOLVE_POS) window.WORLD_RESOLVE_POS(playerPos); else _resolveBuildingCollision(); }")

# 7 ground/camera: feet exact, camera smooth, compression dip
a = "const _rawBaseY = (hover && hover.isRiding()) ? hover.rideBaseY() : veh.baseY(groundY);"
rep(a, """const _pctlActive = _pctlOn && !!_pctlOut;
if (_pctlActive) { groundY = _pctlOut.renderPos.y; _swimming = _pctlOut.swimming; }   // controller owns ground + swim
const _rawBaseY = _pctlActive ? _pctlOut.renderPos.y : ((hover && hover.isRiding()) ? hover.rideBaseY() : veh.baseY(groundY));
const _pDip = _pctlActive ? _pctlOut.compression * 0.35 * V4_U : 0;   // landing / crouch camera dip (<= 0.35 m)
const _feetY = _pctlActive ? _pctlOut.renderPos.y : null;             // exact feet for the avatar (never the eased camera height)""")
rep("_camTarget.set(playerPos.x - fwd.x*(8*_PLAYER_EYE_K), baseY + eye + 2.2*_PLAYER_EYE_K, playerPos.z - fwd.z*(8*_PLAYER_EYE_K));",
    "_camTarget.set(playerPos.x - fwd.x*(8*_PLAYER_EYE_K), baseY - _pDip + eye + 2.2*_PLAYER_EYE_K, playerPos.z - fwd.z*(8*_PLAYER_EYE_K));")
rep("camera.position.set(playerPos.x, baseY + eye, playerPos.z);", "camera.position.set(playerPos.x, baseY - _pDip + eye, playerPos.z);")
rep("playerAvatar.visible=!veh.mode; playerAvatar.position.set(playerPos.x,baseY,playerPos.z);",
    "playerAvatar.visible=!veh.mode;\n    if (_feetY !== null) playerAvatar.position.set(_pctlOut.renderPos.x, _feetY, _pctlOut.renderPos.z); else playerAvatar.position.set(playerPos.x,baseY,playerPos.z);   // FEET ON THE GROUND (was the eased camera height)")
i = s.index("if(!playerMixer && playerAvatar.visible){")
j = s.index("\n  }", i)
blk = s[i:j]
print('bob replacements:', blk.count("playerAvatar.position.y = baseY +"))
s = s[:i] + blk.replace("playerAvatar.position.y = baseY +", "playerAvatar.position.y = (_feetY !== null ? _feetY : baseY) +") + s[j:]
rep("{ const _yt=Math.atan2(fwd.x, fwd.z);   // ease facing toward the look direction (model faces -Z) — no snap-turn",
    "{ const _yt=(_pctlActive && (_pctlOut.state==='roll'||_pctlOut.state==='climb')) ? _pctlOut.facing : Math.atan2(fwd.x, fwd.z);   // ease facing toward the look direction (model faces -Z) — no snap-turn")
rep("playerAvatar.rotation.y=_avatarYaw;", "playerAvatar.rotation.y=_avatarYaw; if (_pctlActive && playerMixer) playerAvatar.rotation.z = -_pctlOut.lean * 0.12;")

# 8 clips + events
rep("if(ok){ ['Idle_FoldArms_Loop','Sword_Regular_A','Sword_Regular_B','Sword_Heavy_Combo','Sword_Block','NinjaJump_Start','Hit_Knockback'].forEach(",
    "if(ok){ ['Idle_FoldArms_Loop','Sword_Regular_A','Sword_Regular_B','Sword_Heavy_Combo','Sword_Block','NinjaJump_Start','Hit_Knockback','NinjaJump_Idle_Loop','NinjaJump_Land','Slide_Start','Slide_Loop','Slide_Exit','ClimbUp_1m'].forEach(")
rep("function playPlayerOnce", """// PLAYER CONTROLLER events -> one-shot clips (resolved by playPlayerOnce; no-op if the rig lacks them)
function _onPctlEvents(evs){
  for (let i=0;i<evs.length;i++){ const e=evs[i];
    if (e.type==='jump' || e.type==='doubleJump') playPlayerOnce('ual_NinjaJump_Start', {timeScale:1.4});
    else if (e.type==='hardLand') playPlayerOnce('ual_Hit_Knockback', {timeScale:1.3});
    else if (e.type==='land' && e.impact > 6 && e.impact <= 12) playPlayerOnce('ual_NinjaJump_Land', {timeScale:1.3});
    else if (e.type==='roll') playPlayerOnce('ual_Slide_Start', {timeScale:1.2});
    else if (e.type==='rollEnd') playPlayerOnce('ual_Slide_Exit', {timeScale:1.4});
    else if (e.type==='climb') { const a = playerClips['ual_ClimbUp_1m']; const d = a && a.getClip() ? a.getClip().duration : 0.6; playPlayerOnce('ual_ClimbUp_1m', {timeScale: d/0.6}); }
  }
}
function playPlayerOnce""")
a = "    const _osw = _updatePlayerLoco(dt, _pSpdL);"
rep(a, """    if (_pctlOn && _pctlOut && clock.elapsedTime >= _pAttackUntil) {   // looped air / slide poses via the one-shot layer
      if (_pctlOut.state==='airborne') playPlayerOnce('ual_NinjaJump_Idle_Loop');
      else if (_pctlOut.state==='slide') playPlayerOnce('ual_Slide_Loop');
    }
""" + a)
open(p, 'w', encoding='utf-8').write(s)
print('controller wired')

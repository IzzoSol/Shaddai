/* SHADDAI · Descent — shared eased pointer.
 * window.Pointer.state carries BOTH the new fields (x/y/tx/ty/gx/gy/speed/active)
 * AND backward-compat aliases the existing scenes read: ex/ey (== eased x/y),
 * nx/ny (0..1 signed), vx/vy (per-frame velocity), down.
 */
(function(){
  var P = { x:innerWidth/2, y:innerHeight/2, tx:innerWidth/2, ty:innerHeight/2,
    ex:innerWidth/2, ey:innerHeight/2, nx:0.5, ny:0.5, snx:0, sny:0, vx:0, vy:0, speed:0,
    gx:innerWidth/2, gy:innerHeight/2, down:false, active:false, _idle:0 };
  function onMove(x,y){ P.tx=x; P.ty=y; P.active=true; P._idle=0; }
  addEventListener('pointermove', function(e){ onMove(e.clientX,e.clientY); }, {passive:true});
  addEventListener('pointerdown', function(){ P.down=true; }, {passive:true});
  addEventListener('pointerup', function(){ P.down=false; }, {passive:true});
  addEventListener('touchmove', function(e){ if(e.touches[0]) onMove(e.touches[0].clientX,e.touches[0].clientY); }, {passive:true});
  window.Pointer = {
    state: P,
    update: function(dt, reduced){
      var fe = 1-Math.pow(0.001, dt/1000), se = 1-Math.pow(0.02, dt/1000);
      var px=P.x, py=P.y;
      P.x += (P.tx-P.x)*fe; P.y += (P.ty-P.y)*fe;
      P.ex = P.x; P.ey = P.y;
      P.vx = (P.x-px); P.vy = (P.y-py); P.speed = Math.hypot(P.vx,P.vy);
      P.gx += (P.x-P.gx)*se; P.gy += (P.y-P.gy)*se;
      // BACKWARD-COMPAT: existing scenes read nx/ny as 0..1 (they subtract 0.5).
      // Keep that convention; expose signed -1..1 as snx/sny for new consumers.
      P.nx = (P.x/innerWidth);  P.ny = (P.y/innerHeight);
      P.snx = (P.nx*2-1);       P.sny = (P.ny*2-1);
      P._idle += dt; if(P._idle>1500) P.active=false;
      if(reduced){ P.vx=P.vy=0; P.speed=0; }
    },
    parallax: function(d, max){ return { x: P.snx*max*d, y: P.sny*max*d }; }
  };
})();

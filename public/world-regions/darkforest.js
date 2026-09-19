window.RegionGen = window.RegionGen || {};
window.RegionGen['darkforest'] = function (api) {
  var T = api.T;

  // ── 0. Base fill — dark pine forest ────────────────────────────────────────
  api.fill(T.GRASS);

  function inb(c, r) { return c >= 0 && c <= 51 && r >= 0 && r <= 51; }

  // ── 1. WINDING SHADOW TRAIL south→north ────────────────────────────────────
  //  Zone 1 clearing: (22, 42)
  //  Zone 2 clearing: (14, 35)
  //  Zone 3 clearing: (28, 28)
  //  Zone 4 clearing: (38, 20)
  //  Castle moat crossing: (28, 15)
  var knots = [
    [26, 47],  // spawn
    [22, 42],  // zone 1 campfire
    [14, 35],  // zone 2 campfire
    [28, 28],  // zone 3 campfire
    [38, 20],  // zone 4 campfire
    [28, 15],  // moat crossing
    [28,  8],  // castle gate
  ];
  for (var ki = 0; ki < knots.length - 1; ki++) {
    var ka = knots[ki], kb = knots[ki + 1];
    var kw = (ki === 0 || ki === 6) ? 3 : 2;
    api.roadLine(ka[0], ka[1], kb[0], kb[1], kw, T.PATH);
  }
  // branching side-paths — extra combat space per zone
  var branches = [
    [22, 42, 32, 44],  // zone 1 east branch
    [22, 42, 12, 44],  // zone 1 west branch
    [14, 35,  6, 32],  // zone 2 deeper west
    [28, 28, 40, 30],  // zone 3 east flank
    [38, 20, 46, 18],  // zone 4 far east
    [38, 20, 30, 16],  // zone 4 direct charge north
  ];
  branches.forEach(function (b) {
    api.roadLine(b[0], b[1], b[2], b[3], 1, T.PATH);
  });

  // ── 2. CAMPFIRE CLEARINGS (matched to DarkRealm.S.campfires positions) ─────
  var campClears = [
    { c: 22, r: 42, rad: 5 },
    { c: 14, r: 35, rad: 5 },
    { c: 28, r: 28, rad: 5 },
    { c: 38, r: 20, rad: 5 },
  ];
  campClears.forEach(function (cs) {
    api.disc(cs.c, cs.r, cs.rad, T.GRASS);  // cleared area
    // DarkRealm renders the campfire glow — we add supply crates + rocks around it
    api.prop('crate', cs.c - 2, cs.r + 1);
    api.prop('crate', cs.c + 2, cs.r + 1);
    api.prop('crate', cs.c,     cs.r + 3);
    api.prop('rock',  cs.c - 3, cs.r - 1);
    api.prop('rock',  cs.c + 3, cs.r - 1);
    api.prop('fence', cs.c - 1, cs.r + 2);
    api.prop('fence', cs.c + 1, cs.r + 2);
  });

  // ── 3. SPAWN AREA (south center safe clearing) ─────────────────────────────
  api.disc(26, 47, 6, T.GRASS);
  api.disc(26, 47, 4, T.PATH);
  api.prop('lamp',  24, 49);
  api.prop('lamp',  28, 49);
  api.prop('rock',  23, 49);
  api.prop('rock',  29, 49);
  api.prop('fence', 22, 48);
  api.prop('fence', 30, 48);
  // supply crates at spawn camp
  api.prop('crate', 24, 48);
  api.prop('crate', 28, 48);
  // WAYSTONE — the one way out: a transit landmark at spawn so a trapped siege
  // survivor can open travel (game.html opens travel only near kind==='transit').
  api.prop('lamp', 30, 46);
  api.prop('lamp', 30, 50);
  api.building({ col: 31, row: 47, w: 2, d: 2, floors: 2,
    wall: '#131022', roof: '#3a2a6a', glass: '#7f6aff',
    name: 'WAYSTONE', kind: 'transit', landmark: 'waystone' });

  // ── 4. CASTLE OF SHADOWS ───────────────────────────────────────────────────
  // clear castle grounds
  api.rect(19, 4, 36, 15, T.GRASS);
  api.rect(21, 6, 34, 13, T.PATH);

  // MOAT — water ring rows 14-15, cols 19-36
  for (var mc = 19; mc <= 36; mc++) {
    if (inb(mc, 14)) api.set(mc, 14, T.WATER);
    if (inb(mc, 15)) api.set(mc, 15, T.WATER);
  }
  for (var mr = 5; mr <= 15; mr++) {
    if (inb(19, mr)) api.set(19, mr, T.WATER);
    if (inb(36, mr)) api.set(36, mr, T.WATER);
  }
  // DOCK bridge (the crossing — only passable when moat is dry in siege logic)
  api.set(27, 14, T.DOCK); api.set(28, 14, T.DOCK); api.set(29, 14, T.DOCK);
  api.set(27, 15, T.DOCK); api.set(28, 15, T.DOCK); api.set(29, 15, T.DOCK);

  // THE DARK KEEP — the Dragon's Lair (main siege boss building)
  api.building({ col: 25, row: 7, w: 6, d: 4, floors: 9,
    wall: '#0d0120', roof: '#330044', glass: '#9900ff',
    name: 'SHADOW KEEP', kind: 'siege', accent: '#9900ff', landmark: 'castle' });

  // Corner towers
  api.building({ col: 20, row: 5, w: 2, d: 2, floors: 6,
    wall: '#110022', roof: '#220033', name: 'DARK TOWER', kind: 'office' });
  api.building({ col: 34, row: 5, w: 2, d: 2, floors: 6,
    wall: '#110022', roof: '#220033', name: 'DARK TOWER', kind: 'office' });
  api.building({ col: 20, row: 12, w: 2, d: 2, floors: 6,
    wall: '#110022', roof: '#220033', name: 'DARK TOWER', kind: 'office' });
  api.building({ col: 34, row: 12, w: 2, d: 2, floors: 6,
    wall: '#110022', roof: '#220033', name: 'DARK TOWER', kind: 'office' });

  // Gate decorations (lamps = torch glow, rocks = barricades)
  api.prop('lamp', 26, 16); api.prop('lamp', 31, 16);  // moat torches
  api.prop('lamp', 26, 13); api.prop('lamp', 31, 13);  // inner gate torches
  api.prop('rock', 24, 16); api.prop('rock', 33, 16);
  api.prop('fence', 23, 16); api.prop('fence', 34, 16);
  api.prop('crate', 22, 15); api.prop('crate', 35, 15); // siege supplies

  // ── 5. DARK RUINS scattered in the forest ──────────────────────────────────
  var ruins = [[9,27],[44,32],[6,48],[46,10],[40,44],[12,20],[18,15]];
  ruins.forEach(function (rp) {
    if (inb(rp[0], rp[1])) {
      api.disc(rp[0], rp[1], 2, T.GRASS);
      api.prop('rock',  rp[0],     rp[1]);
      api.prop('rock',  rp[0] + 1, rp[1] - 1);
      api.prop('crate', rp[0] - 1, rp[1] + 1);
      api.prop('fence', rp[0] + 2, rp[1]);
    }
  });

  // ── 6. Trail/clearing mask — keep these open (no trees) ───────────────────
  var openMap = {};
  function markOpen(c, r, pad) {
    pad = pad || 2;
    for (var dc = -pad; dc <= pad; dc++) {
      for (var dr = -pad; dr <= pad; dr++) {
        var cc = c + dc, rr = r + dr;
        if (inb(cc, rr)) openMap[cc + ',' + rr] = true;
      }
    }
  }
  // mark trail
  knots.slice(0, -1).forEach(function (k, i) {
    var nx = knots[i + 1];
    var steps = Math.max(Math.abs(nx[0] - k[0]), Math.abs(nx[1] - k[1])) || 1;
    for (var s = 0; s <= steps; s++) {
      var c = Math.round(k[0] + (nx[0] - k[0]) * s / steps);
      var r = Math.round(k[1] + (nx[1] - k[1]) * s / steps);
      markOpen(c, r, 2);
    }
  });
  branches.forEach(function (b) {
    var steps = Math.max(Math.abs(b[2]-b[0]), Math.abs(b[3]-b[1])) || 1;
    for (var s = 0; s <= steps; s++) {
      markOpen(Math.round(b[0]+(b[2]-b[0])*s/steps), Math.round(b[1]+(b[3]-b[1])*s/steps), 1);
    }
  });
  // mark clearings
  campClears.forEach(function (cs) {
    for (var dc = -(cs.rad+1); dc <= cs.rad+1; dc++) {
      for (var dr = -(cs.rad+1); dr <= cs.rad+1; dr++) {
        markOpen(cs.c + dc, cs.r + dr, 0);
      }
    }
  });
  markOpen(26, 47, 7); // spawn
  // mark castle area
  for (var cr = 4; cr <= 17; cr++) for (var cc = 18; cc <= 37; cc++) openMap[cc+','+cr] = true;

  // ── 7. DENSE DEAD PINE EVERYWHERE ELSE (85% density — oppressively dark) ───
  for (var r = 0; r <= 51; r++) {
    for (var c = 0; c <= 51; c++) {
      if (api.get(c, r) !== T.GRASS) continue;
      if (openMap[c + ',' + r]) continue;
      if (api.chance(0.85)) api.tree(c, r);
    }
  }

  // ── 8. ATMOSPHERE: skull-skull lanterns along trail every 5 tiles ──────────
  knots.slice(0, -1).forEach(function (k, i) {
    var nx = knots[i + 1];
    var steps = Math.max(Math.abs(nx[0]-k[0]), Math.abs(nx[1]-k[1])) || 1;
    for (var s = 0; s <= steps; s++) {
      if (s % 5 !== 0) continue;
      var c = Math.round(k[0] + (nx[0]-k[0])*s/steps);
      var r = Math.round(k[1] + (nx[1]-k[1])*s/steps);
      // place lamp on the verge (not on path tile itself)
      var vc = c + 1, vr = r;
      if (inb(vc, vr) && api.get(vc, vr) === T.GRASS && !openMap[(vc+1)+','+(vr)]) {
        api.prop('lamp', vc, vr);
      }
    }
  });

  // ── 9. SPAWN ────────────────────────────────────────────────────────────────
  api.set(26, 47, T.PATH);
  api.spawn(26, 47);
};

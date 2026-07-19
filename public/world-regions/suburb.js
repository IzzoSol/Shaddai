window.RegionGen = window.RegionGen || {};
window.RegionGen['suburb'] = function(api){
  var T = api.T;
  api.fill(T.GRASS);

  // ---- street grid (blocks ~8 tiles) ----
  for (var c = 6; c <= 46; c += 8) api.roadLine(c, 4, c, 48, 2, T.PATH);
  for (var r = 6; r <= 46; r += 8) api.roadLine(4, r, 48, r, 2, T.PATH);

  // ---- house palettes ----
  var walls = ['#e8b85a','#d98a5a','#9ac07a','#5bb0e0','#c9a6e0','#e8dcc0','#f0e4c8','#d0d4d8','#e3a06a','#a8d8e0'];
  var roofs = ['#c0392b','#7a3a2a','#4a6a2a','#2f6f9a','#6a3a8a','#5a7a3a','#8a5a3a','#3a4a6a','#a0432e','#4a90a0'];
  var names = ['MAPLE HOUSE','OAK COTTAGE','ROSE VILLA','CEDAR HOME','PINE LODGE','FERN HOUSE','ELM COTTAGE','BIRCH HOME','ASH VILLA','WILLOW HOME'];

  // ---- 20 houses across the blocks (skip the central park block) ----
  var hi = 0;
  for (var bc = 0; bc < 5 && hi < 20; bc++){
    for (var br = 0; br < 5 && hi < 20; br++){
      if (bc === 2 && br === 2) continue;               // central park block
      var col = 8 + bc*8 + 1, row = 8 + br*8 + 1;
      var forSale = (hi === 3 || hi === 9 || hi === 15); // a few available
      api.building({ col:col, row:row, w:3, d:3, floors: 1 + ((bc+br) % 2),
        kind:'home', wall: walls[hi % walls.length], roof: roofs[hi % roofs.length],
        name: forSale ? 'FOR SALE' : names[hi % names.length], suburb: true, houseId: hi });
      // front yard: fence corners, flowers, mailbox, a lamp on the sidewalk
      if (api.get(col-1, row+3) === T.GRASS) api.prop('fence', col-1, row+3);
      if (api.get(col+3, row+3) === T.GRASS) api.prop('fence', col+3, row+3);
      if (api.get(col+1, row+3) === T.GRASS) api.prop('flowers', col+1, row+3);
      if (api.get(col-1, row-1) === T.GRASS) api.prop('lamp', col-1, row-1);
      if (api.get(col+2, row-1) === T.GRASS) api.prop('crate', col+2, row-1); // mailbox-ish
      hi++;
    }
  }

  // ---- central park ----
  var pc = 26, pr = 26;
  for (var t2 = 0; t2 < 10; t2++){ var a = t2/10*6.283; api.tree(Math.round(pc + 5*Math.cos(a)), Math.round(pr + 5*Math.sin(a))); }
  if (api.get(pc, pr) === T.GRASS) api.prop('well', pc, pr);
  api.prop('bench', pc-3, pr); api.prop('bench', pc+3, pr); api.prop('flowers', pc, pr+4); api.prop('flowers', pc, pr-4);
  api.prop('lamp', pc-4, pr-4); api.prop('lamp', pc+4, pr+4);

  // ---- gateway back to the world (transit) + residents ----
  api.building({ col:23, row:2, w:3, d:2, landmark:'station', kind:'transit', name:'GATEWAY' });
  api.villagers(16);
  api.spawn(24, 6);
};

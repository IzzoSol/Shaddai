/* portals/portals-registry.js — SHADDAI World Portal & Plot Registry
 *
 * ORGANIZATION LAYER — does NOT replace world-spawn.js or move any existing objects.
 * Exposes: window.PORTALS_REGISTRY
 *
 * Usage:
 *   Load as a classic script BEFORE the module block and before portal-plots.js.
 *   <script src="/portals/portals-registry.js"></script>
 *
 * Structure:
 *   window.PORTALS_REGISTRY = {
 *     portals: [...],   // kind:'spawn'  — mirrors the 7 existing spawn arches (read-only reference)
 *     plots:   [...],   // kind:'plot'   — rentable / buyable portal worlds (add yours here)
 *     all()            — flat array of every entry
 *     find(id)         — look up by id
 *     byKind(kind)     — filter by kind string
 *   }
 *
 * ── HOW TO ADD A NEW PLOT ─────────────────────────────────────────────────────
 * Copy the "nexus-world" entry below, give it a unique id, set pos to [x, z],
 * and set rentPrice / buyPrice (USD). Everything else is optional.
 * The lead will wire portal-plots.js to read this list and render them in-world.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  // ── Coordinate reference (from world-layout.js, replicated here for clarity) ──
  // The sacred hexagon radius is R = 260 world-units.
  // Vertex function: vtx(deg) = [sin(deg°)*260, cos(deg°)*260]
  //
  //   NEXUS   FRONT_L  vtx(-30)  ≈ [-130,  225]
  //   QUILL   FRONT_R  vtx( 30)  ≈ [ 130,  225]
  //   ORACLE  SIDE_R   vtx( 90)  ≈ [ 260,    0]
  //   TURTLE  BACK_R   vtx(150)  ≈ [ 130, -225]
  //   PIKADON BACK_L   vtx(-150) ≈ [-130, -225]
  //   ZEROX   SIDE_L   vtx(-90)  ≈ [-260,    0]
  //   SHADDAI CENTER            = [   0,    0]

  // "Behind" an agent = further outward from world center along that agent's radial direction.
  // NEXUS radial unit ≈ [-0.500, 0.866]; 70 units behind: [-130 - 35, 225 + 60.6] ≈ [-165, 286]

  // ── SECTION 1: Spawn portals (mirrors world-layout.js .spawnPortals) ──────
  // These are READ-ONLY references so tooling / future modules have one place to
  // look up every portal. Do NOT change pos/color here without syncing world-layout.js.
  var SPAWN_PORTALS = [
    {
      id:    'spawn-shaddai',
      kind:  'spawn',
      code:  'SHADDAI',
      name:  'The Source Temple',
      pos:   [0, 0],
      color: 0xffcf4a,
      notes: 'Default spawn. Player drops inside the central temple.',
    },
    {
      id:    'spawn-nexus',
      kind:  'spawn',
      code:  'NEXUS',
      name:  'The Navigator',
      pos:   [-130, 225],
      color: 0x34e5b0,
      notes: 'NEXUS sector — front-left hex vertex.',
    },
    {
      id:    'spawn-quill',
      kind:  'spawn',
      code:  'QUILL',
      name:  'The Library',
      pos:   [130, 225],
      color: 0xb98cff,
      notes: 'QUILL sector — front-right hex vertex.',
    },
    {
      id:    'spawn-oracle',
      kind:  'spawn',
      code:  'ORACLE',
      name:  'The Observatory',
      pos:   [260, 0],
      color: 0xc084fc,
      notes: 'ORACLE sector — right hex vertex.',
    },
    {
      id:    'spawn-turtle',
      kind:  'spawn',
      code:  'TURTLE',
      name:  'The Museum',
      pos:   [130, -225],
      color: 0x1fd6c4,
      notes: 'TURTLE sector — back-right hex vertex.',
    },
    {
      id:    'spawn-pikadon',
      kind:  'spawn',
      code:  'PIKADON',
      name:  'The Aegis',
      pos:   [-130, -225],
      color: 0xff5a6e,
      notes: 'PIKADON sector — back-left hex vertex.',
    },
    {
      id:    'spawn-zerox',
      kind:  'spawn',
      code:  'ZEROX',
      name:  'The Markets',
      pos:   [-260, 0],
      color: 0x27e0ff,
      notes: 'ZEROX sector — left hex vertex.',
    },
  ];

  // ── SECTION 2: Rentable / buyable portal-world PLOTS ──────────────────────
  // Add new entries here. portal-plots.js reads this array to render them in-world.
  //
  // Fields:
  //   id         (string)  — unique slug used as the backend key (matches portal-plots.json)
  //   kind       'plot'    — must be 'plot'
  //   name       (string)  — display name on the sign and in the UI
  //   pos        [x, z]    — world-space XZ position of the plot gateway
  //   color      (hex int) — idle / available gateway tint
  //   rentPrice  (number)  — monthly rent in USD (informational; payment handled in dashboard)
  //   buyPrice   (number)  — one-time purchase price in USD
  //   agentCode  (string)  — which agent this plot is "behind" (aesthetic only)
  //   url        (string)  — optional: where the portal leads when you walk through (leave '' for TBD)
  //   notes      (string)  — human notes for whoever edits this file
  //
  var PORTAL_PLOTS = [
    // ── nexus-world — the first rentable plot, behind the NEXUS building ──────
    // Position: NEXUS is at [-130, 225]. "Behind" = 70 units further along NEXUS's radial.
    // Radial unit = normalize([-130, 225]) ≈ [-0.500, 0.866]
    // Behind pos  = [-130 + (-0.500)*70, 225 + (0.866)*70] ≈ [-165, 286]
    {
      id:        'nexus-world',
      kind:      'plot',
      name:      'NEXUS Portal World',
      pos:       [-165, 286],
      color:     0x34e5b0,        // NEXUS teal — matches the agent brand
      rentPrice: 29,              // $29 / month (beta pricing)
      buyPrice:  299,             // $299 one-time
      agentCode: 'NEXUS',
      url:       '',              // TBD — set to a URL when the destination world is live
      notes:     'First rentable portal plot. Sits directly behind the NEXUS building along its radial. ' +
                 'Renders a gateway + floating platform. Status driven by /api/portal-plots.',
    },

    // ── ADD MORE PLOTS BELOW THIS LINE ────────────────────────────────────────
    // Template:
    // {
    //   id:        'my-plot-id',      // unique, lowercase-slug
    //   kind:      'plot',
    //   name:      'My Plot Name',
    //   pos:       [x, z],            // world coords
    //   color:     0xrrggbb,
    //   rentPrice: 29,
    //   buyPrice:  299,
    //   agentCode: 'NEXUS',           // or whichever agent sector this is near
    //   url:       '',
    //   notes:     'describe it here',
    // },
  ];

  // ── SECTION 3: Portal-Dome — NEXUS multi-level portal hub ────────────────
  //
  // Location: behind NEXUS, further along its outward radial.
  //   NEXUS at [-130, 225]. Radial unit ≈ [-0.500, 0.866].
  //   Dome center: [-130 + (-0.500)*110, 225 + (0.866)*110] = [-185, 320]
  //   (inside the world .half ≈ 380; distance from origin ≈ 368 ✓)
  //
  // Entrance angle (XZ, atan2 convention) from dome center TOWARD NEXUS:
  //   direction = NEXUS - dome = [-130-(-185), 225-320] = [55, -95]
  //   Math.atan2(55, -95) ≈ 2.618 rad  (≈ 150°)
  //
  // Slot numbering:  L<level>-<slot>   e.g. "L1-1", "L2-4"
  // Slot statuses:   'live'       → bright energy field + name plate
  //                  'available'  → dim frame + "APPLY AT DASHBOARD" sign
  //
  // ── HOW TO EDIT SLOTS ────────────────────────────────────────────────────
  // Each slot entry is a plain object. To rent out a slot:
  //   1. Change status: 'available' → 'live'
  //   2. Set name:      '' → 'Your Portal Name'
  //   3. Set kind:      'portal' | 'suite' | 'lab' | 'showroom'
  //   4. Set color:     hex int matching the tenant's brand (optional)
  //   5. Save & reload the 3D world — the dome updates automatically.
  // To add a level, append an object to the levels array.
  // To add a slot to a level, append to that level's slots array.
  // ─────────────────────────────────────────────────────────────────────────
  var DOME_DATA = {
    // World-space XZ center of the dome.
    center: [-185, 320],

    // Icosahedron sphere radius. The sphere is centered at ground level so the
    // bottom half is underground — this naturally creates a hemisphere silhouette.
    domeRadius: 45,

    // Approach-path direction from dome toward NEXUS (used for entrance placement
    // and lit beacon path). atan2(dx, dz) where dx=55, dz=-95.
    entranceAngleRad: 2.618,

    // ── LEVELS ─────────────────────────────────────────────────────────────
    // Each level is a ring platform inside the dome at a given height.
    // ringRadius: distance from dome axis to the center of the slot arches.
    // y: height above ground (terrain-relative via WORLD_HEIGHT_AT).
    // Slots are evenly spaced around the ring with one gap at the entrance angle.
    levels: [

      // ── LEVEL 1 — Ground floor (6 slots on a radius-30 ring at y=4) ────
      {
        level:      1,
        y:          4,      // 4 units above ground — slots sit on the ground ring
        ringRadius: 30,
        slots: [
          // ── Edit each slot independently. Fields: id, slot, name, kind, status, color ──
          {
            id:     'dome-L1-1',
            slot:   1,
            name:   'Neural Hub',           // visible on the name-plate sign
            kind:   'suite',                // displayed as "[ SUITE ]"
            status: 'live',                 // 'live' = bright; 'available' = dim
            color:  0x34e5b0,              // NEXUS teal
          },
          {
            id:     'dome-L1-2',
            slot:   2,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L1-3',
            slot:   3,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L1-4',
            slot:   4,
            name:   'API Gateway',          // example second live slot
            kind:   'portal',
            status: 'live',
            color:  0x27e0ff,              // bright cyan — tenant brand
          },
          {
            id:     'dome-L1-5',
            slot:   5,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L1-6',
            slot:   6,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
        ],
      },

      // ── LEVEL 2 — Mid level (7 slots on a radius-23 ring at y=14) ──────
      {
        level:      2,
        y:          14,     // 14 units above ground — accessed via lift shaft
        ringRadius: 23,
        slots: [
          {
            id:     'dome-L2-1',
            slot:   1,
            name:   'DevOps Lab',
            kind:   'lab',
            status: 'live',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L2-2',
            slot:   2,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L2-3',
            slot:   3,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L2-4',
            slot:   4,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L2-5',
            slot:   5,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L2-6',
            slot:   6,
            name:   '',
            kind:   'suite',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L2-7',
            slot:   7,
            name:   '',
            kind:   'showroom',
            status: 'available',
            color:  0x34e5b0,
          },
        ],
      },

      // ── LEVEL 3 — Top level (5 slots on a radius-15 ring at y=25) ──────
      // The inner-most, highest ring — premium / featured slots.
      {
        level:      3,
        y:          25,     // 25 units above ground — near dome apex
        ringRadius: 15,
        slots: [
          {
            id:     'dome-L3-1',
            slot:   1,
            name:   '',
            kind:   'suite',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L3-2',
            slot:   2,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L3-3',
            slot:   3,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L3-4',
            slot:   4,
            name:   '',
            kind:   'portal',
            status: 'available',
            color:  0x34e5b0,
          },
          {
            id:     'dome-L3-5',
            slot:   5,
            name:   '',
            kind:   'showroom',
            status: 'available',
            color:  0x34e5b0,
          },
        ],
      },

    ], // end levels
  }; // end DOME_DATA


  // ── Registry object ───────────────────────────────────────────────────────
  var _all = SPAWN_PORTALS.concat(PORTAL_PLOTS);

  global.PORTALS_REGISTRY = {
    /** All spawn-portal entries (kind:'spawn'). Mirrors world-layout.js .spawnPortals. */
    portals: SPAWN_PORTALS,

    /** All rentable/buyable plot entries (kind:'plot'). Add new plots in PORTAL_PLOTS above. */
    plots: PORTAL_PLOTS,

    /**
     * NEXUS Portal-Dome data.
     * Read by portal-dome.js to build the 3D dome structure.
     * Edit DOME_DATA.levels[n].slots[i] entries above to manage slot state.
     */
    dome: DOME_DATA,

    /** Flat array of every entry (spawns + plots). */
    all: function () { return _all.slice(); },

    /** Look up any entry by id. Returns undefined if not found. */
    find: function (id) {
      for (var i = 0; i < _all.length; i++) {
        if (_all[i].id === id) return _all[i];
      }
      return undefined;
    },

    /** Filter entries by kind ('spawn' or 'plot'). */
    byKind: function (kind) {
      return _all.filter(function (e) { return e.kind === kind; });
    },
  };

}(window));

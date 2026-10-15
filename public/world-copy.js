/* world-copy.js — the SHADDAI copy bank: citizen chatter, council-agent greetings, vendor lines, toast variants, idle tips (owner 2026-10-01: QUILL writes the popups and NPC texts).
 * Voice: warm, confident, a little witty, short. Sparks are closed-loop in-world points - never cash. One place to edit every line; systems call WorldCopy.pick('citizens.commons').
 *   WorldCopy.pick(path, fallback?)  -> random line at a dotted path, avoiding an immediate repeat
 *   WorldCopy.district(x, z)         -> 'commons' | 'campus' | 'race_quarter' | 'plots'  (Campus NE, Race NW, Commons SE, Plots SW; z grows south)
 *   WorldCopy.BANK                   -> the raw data
 */
(function (root) {
  'use strict';
  var BANK = {
    citizens: {
      commons: ['Lovely morning. Well, it is always neon o’clock.', 'Skate Jam pays in Sparks. I bailed twice and still smiled.', 'Press I for mounts, boards and races. Treat yourself.', 'The noodle bar at the Colosseum? Worth the walk.', 'Heard the wilderness camps respawn every ninety seconds. Rude.', 'Wagers burn five percent. The house always plays fair.', 'Maglev ring is free to ride. Press U near any station.', 'My bot carries my shopping. Yours will too, eventually.'],
      campus: ['The Library keeps records on everything. Even my bad ideas.', 'Quiet labs, loud ideas. That is the Campus motto.', 'Navi is on Y. Jobs and bounties live in there.', 'Oracle says tonight’s forecast: sparks with a chance of dragons.', 'I trained a bot yesterday. It beat me at tactics. Humbling.', 'Academy classes start at the hour. Be early, get a seat.', 'Forged agents work shifts while you sleep. Smart, right?', 'Never fight a stalker at night. I learned the hard way.'],
      race_quarter: ['Green beam is the start, gold is the finish. Do not overthink it.', 'Hover skiffs hit seventy-eight at full boost. My stomach is still arriving.', 'Challenge the board. Someone always wants to lose a wager.', 'Chain your tricks inside four seconds and the multiplier climbs.', 'The park has seven rooms. Land a trick in each one for a bonus.', 'Hawk mount is the priciest. Worth every Spark if you love altitude.', 'I lost a mount once. PIKADON still lectures me.', 'Rivals match your ride. Pick the fast one.'],
      plots: ['Home is where the beacon is. Mine glows emerald.', 'Plots keep their rent in Sparks. Never in cash. Thank goodness.', 'My neighbour’s farm sells noodles faster than he grows them.', 'Furniture, farm beds, a hangar for the skiff. The dream is modest.', 'Wake at your plot after a rough night. Respawn is kind.', 'Visit a friend’s home. Leave a gift. That is how the block holds.', 'Quiet streets, loud sunsets. Best deal in the Grid.', 'The Colosseum vendors know my face. They also know my budget.']
    },
    agents: {
      NEXUS: ['Fabrication is patience with better tools.', 'Bring me a blueprint and a few Sparks. I will bring it to life.', 'Systems hum when everything is in its place.', 'Build it once, build it right, build it to last.'],
      ORACLE: ['I saw you coming. I also saw you stub your toe on that step.', 'Foresight is just attention with a long memory.', 'The odds favour the prepared. And the lucky. Mostly prepared.', 'Ask me about tomorrow. I will charge only a smile.'],
      QUILL: ['Every deed leaves a record. Make yours worth reading.', 'Contracts, bonds, bounties. I keep them honest.', 'Words are cheap, signed words are not.', 'The Library remembers what everyone else forgets.'],
      PIKADON: ['Keep your mount insured. Accidents are rude and common.', 'Trust, but verify. Then verify again.', 'My watch never ends. Neither does my coffee.', 'I audit the vaults so you can sleep.'],
      TURTLE: ['Light, colour, silhouette. The rest is detail.', 'Dress your board like you mean it.', 'A good skyline tells you who lives there.', 'Beauty is a feature, not a luxury.'],
      ZEROX: ['A fair trade makes two friends. A rigged one makes none.', 'Sparks move. Mind where they land.', 'The market never sleeps. I nap in the order book.', 'Wagers are fine. Greed is expensive.'],
      SHADDAI: ['Welcome home. The city is yours to explore.', 'One world, many doors. Pick one and walk through.', 'Coordination beats talent. Bring a friend.', 'Whatever you build here, build it with care.']
    },
    vendors: {
      snack: ['Fresh bowls, zero queue. Almost.', 'Spark Noodles: the crowd favourite.', 'Eat in the stands, cheer louder.', 'Extra crunch? Always.', 'Hot, fast, and not a cash register in sight.'],
      drink: ['Void Fizz, ice cold.', 'Aurora Tea for calm focus.', 'Mecha-Mule has a kick. Fair warning.', 'Hydrate between rounds.', 'Sparks only. We are modern.'],
      gear: ['Decals, trails, grip tape. Look fast, be fast.', 'Gold grip tape: shiny and legal.', 'Flame trail kit lights up the park.', 'Customise your board. It remembers.', 'A good deck deserves a good story.'],
      mount: ['Bulls for power, hawks for views.', 'Flying costs more. Gravity is free.', 'Lose a mount? Rebuy at a discount.', 'Skiffs are fast. Do mind the ceiling.', 'Pick your ride, pick your pace.'],
      cosm: ['Gold dye, arena capes, halo rings.', 'Show your colours in the stands.', 'Style is the only flex that never expires.', 'Try the halo. Everyone does.', 'Cosmetics: the one thing that is purely for you.'],
      wager: ['Back your champion. Sparks only, no cash-outs.', 'Upsets pay best. Nerves pay worst.', 'Five percent burns. The rest is yours if you win.', 'Bet small, cheer big.', 'Settles after the bout. No refunds for second guessing.']
    },
    toasts: {
      race_win: ['Photo finish? Not even close. Collect your Sparks.', 'First across the line. The crowd loves you.', 'Flawless. Winner takes the pot.', 'You made it look easy.'],
      race_lose: ['So close. The wager is gone, the lesson stays.', 'Second place buys the next round of noodles.', 'Rivals matched your ride. Practise the line.', 'Rematch? The board never closes.'],
      jam_combo: ['Combo climbing. Keep it clean.', 'That chain is sizzling.', 'Multiplier up. Do not bail now.', 'The crowd is on its feet.'],
      jam_bail: ['Ouch. Shake it off.', 'Bail! The chain resets.', 'Gravity wins this round.', 'Brush off, board up, go again.'],
      mob_kill: ['Down it goes. Sparks earned.', 'Camp cleared. Respawn clock is ticking.', 'Clean hit. Loot secured.', 'The wilderness pushes back. You pushed harder.'],
      welcome: ['Welcome to the Grid. Press I for mounts, boards and races.', 'You have Sparks to spend. Press I to see what they buy.', 'Navi lives on Y. Jobs, bots and the market are in there.']
    },
    tips: ['W A S D to move, Shift to run, Space to jump.', 'Press E at a glowing door to go inside.', 'Press I for mounts, boards, bots, races and travel.', 'Press Y to open Navi: inventory, jobs, market, bots.', 'Press U to jump to the nearest maglev station.', 'Press H for the map and help.', 'Press V to switch camera.', 'Gold beams mark the Colosseum door; cyan marks maglev stations.', 'Chain tricks within four seconds for a bigger multiplier.', 'Wilderness camps respawn about ninety seconds after you clear them.', 'Rivals in a race match your ride: pick wisely.', 'Sparks are closed-loop: earn them, spend them, never cash them out.']
  };
  var last = {};
  function get(path) { var o = BANK, parts = String(path).split('.'); for (var i = 0; i < parts.length; i++) { if (!o) return null; o = o[parts[i]]; } return o; }
  function pick(path, fallback) { var a = get(path); if (!Array.isArray(a) || !a.length) return fallback || ''; var i = Math.floor(Math.random() * a.length); if (a.length > 1 && last[path] === i) i = (i + 1) % a.length; last[path] = i; return a[i]; }
  function district(x, z) { return x >= 0 ? (z < 0 ? 'campus' : 'commons') : (z < 0 ? 'race_quarter' : 'plots'); }
  root.WorldCopy = { BANK: BANK, pick: pick, district: district, get: get };
})(typeof window !== 'undefined' ? window : globalThis);

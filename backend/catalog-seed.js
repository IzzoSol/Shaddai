'use strict';
/**
 * SHADDAI SHOP — starter catalog seed.
 *
 * The shop is the SPEND SINK that closes the earn->spend loop. Users earn
 * Sparks (soft currency) and spend them here on decor, cosmetics, and upgrades.
 * A small set of PREMIUM items are real-money (Stripe / sub-billing) unlocks.
 *
 * PIKADON rule enforced: every item is DETERMINISTIC with fully disclosed,
 * known contents. There are NO loot boxes / mystery packs / gacha / randomized
 * "chance" items — especially none priced in real money. What you buy is
 * exactly what you get. Premium items are cosmetic unlocks, never marketed as
 * investments or anything with monetary return.
 *
 * Currency is "Sparks" only (never gold / coin / currency / crypto).
 *
 * Idempotent: every item has a STABLE id. seedCatalog() upserts each item, so
 * running it repeatedly re-applies the same known catalog with no duplicates
 * and no drift. Safe to call on every boot.
 *
 * Usage:
 *   const { seedCatalog } = require('./catalog-seed');
 *   await seedCatalog(economyService);            // always upsert (idempotent)
 *   await seedCatalog(economyService, { onlyIfEmpty: true }); // seed once
 */

// Kinds: decor | cosmetic | upgrade | premium
// Sparks-priced items set sparks_price (positive int) and usd_price_cents=null.
// Premium items set usd_price_cents (positive int) and sparks_price=null; those
// route through Stripe, NOT the Sparks ledger.
const CATALOG = [
  // --- Room decor (Sparks 100-500) --------------------------------------
  {
    id: 'decor_neon_desk_lamp',
    name: 'Neon Desk Lamp',
    kind: 'decor',
    rarity: 'common',
    sparks_price: 120,
    usd_price_cents: null,
    category: 'room',
    description: 'A glowing neon desk lamp that casts a soft cyan light across your room.',
    active: true
  },
  {
    id: 'decor_holo_plant',
    name: 'Holo Plant',
    kind: 'decor',
    rarity: 'common',
    sparks_price: 150,
    usd_price_cents: null,
    category: 'room',
    description: 'A low-maintenance holographic plant. Never needs water, always in bloom.',
    active: true
  },
  {
    id: 'decor_circuit_rug',
    name: 'Circuit Rug',
    kind: 'decor',
    rarity: 'uncommon',
    sparks_price: 240,
    usd_price_cents: null,
    category: 'room',
    description: 'A woven rug patterned with glowing circuit traces to tie the room together.',
    active: true
  },
  {
    id: 'decor_trophy_shelf',
    name: 'Trophy Shelf',
    kind: 'decor',
    rarity: 'uncommon',
    sparks_price: 300,
    usd_price_cents: null,
    category: 'room',
    description: 'A wall-mounted shelf to display your earned trophies and milestones.',
    active: true
  },
  {
    id: 'decor_star_map_window',
    name: 'Star Map Window',
    kind: 'decor',
    rarity: 'rare',
    sparks_price: 420,
    usd_price_cents: null,
    category: 'room',
    description: 'A window pane that renders a slowly drifting star map of the SHADDAI sky.',
    active: true
  },
  {
    id: 'decor_ambient_speaker',
    name: 'Ambient Speaker Set',
    kind: 'decor',
    rarity: 'rare',
    sparks_price: 500,
    usd_price_cents: null,
    category: 'room',
    description: 'A pair of ambient speakers that add a subtle synth hum to your workspace.',
    active: true
  },

  // --- Agent cosmetics (Sparks 50-200) ----------------------------------
  {
    id: 'cosmetic_cyber_visor',
    name: 'Cyber Visor',
    kind: 'cosmetic',
    rarity: 'common',
    sparks_price: 60,
    usd_price_cents: null,
    category: 'agent',
    description: 'A sleek cyber visor cosmetic your agent can wear. Purely visual.',
    active: true
  },
  {
    id: 'cosmetic_gold_trim',
    name: 'Gold Trim',
    kind: 'cosmetic',
    rarity: 'uncommon',
    sparks_price: 110,
    usd_price_cents: null,
    category: 'agent',
    description: 'Adds a polished gold trim accent to your agent’s outfit.',
    active: true
  },
  {
    id: 'cosmetic_aura_glow_cyan',
    name: 'Aura Glow — Cyan',
    kind: 'cosmetic',
    rarity: 'uncommon',
    sparks_price: 140,
    usd_price_cents: null,
    category: 'agent',
    description: 'A cyan color-theme aura glow that surrounds your agent.',
    active: true
  },
  {
    id: 'cosmetic_aura_glow_violet',
    name: 'Aura Glow — Violet',
    kind: 'cosmetic',
    rarity: 'uncommon',
    sparks_price: 140,
    usd_price_cents: null,
    category: 'agent',
    description: 'A violet color-theme aura glow that surrounds your agent.',
    active: true
  },
  {
    id: 'cosmetic_aura_glow_emerald',
    name: 'Aura Glow — Emerald',
    kind: 'cosmetic',
    rarity: 'rare',
    sparks_price: 180,
    usd_price_cents: null,
    category: 'agent',
    description: 'An emerald color-theme aura glow that surrounds your agent.',
    active: true
  },
  {
    id: 'cosmetic_halo_ring',
    name: 'Halo Ring',
    kind: 'cosmetic',
    rarity: 'rare',
    sparks_price: 200,
    usd_price_cents: null,
    category: 'agent',
    description: 'A floating halo ring cosmetic that hovers above your agent.',
    active: true
  },

  // --- Upgrades (Sparks 150-1000) ---------------------------------------
  {
    id: 'upgrade_faster_work',
    name: 'Faster Work (+speed)',
    kind: 'upgrade',
    rarity: 'uncommon',
    sparks_price: 250,
    usd_price_cents: null,
    category: 'upgrade',
    description: 'A deterministic +10% speed boost to your agent’s work throughput.',
    active: true
  },
  {
    id: 'upgrade_focus_core',
    name: 'Focus Core (+Sparks yield)',
    kind: 'upgrade',
    rarity: 'rare',
    sparks_price: 500,
    usd_price_cents: null,
    category: 'upgrade',
    description: 'A deterministic +10% Sparks yield on completed work sessions.',
    active: true
  },
  {
    id: 'upgrade_extra_session_slot',
    name: 'Extra Session Slot',
    kind: 'upgrade',
    rarity: 'rare',
    sparks_price: 750,
    usd_price_cents: null,
    category: 'upgrade',
    description: 'Unlocks one additional concurrent work session slot. Permanent.',
    active: true
  },
  {
    id: 'upgrade_deep_focus_core',
    name: 'Deep Focus Core (+Sparks yield II)',
    kind: 'upgrade',
    rarity: 'epic',
    sparks_price: 1000,
    usd_price_cents: null,
    category: 'upgrade',
    description: 'A deterministic +25% Sparks yield on completed work sessions. Replaces Focus Core.',
    active: true
  },

  // --- Premium (real-$; Stripe / sub-billing) ----------------------------
  // usd_price_cents set, sparks_price null. Deterministic disclosed contents.
  // NOT investments; cosmetic/status unlocks only.
  {
    id: 'premium_founder_badge',
    name: 'Founder Badge',
    kind: 'premium',
    rarity: 'legendary',
    sparks_price: null,
    usd_price_cents: 299,
    category: 'premium',
    description: 'A permanent Founder badge shown on your profile and agent. Cosmetic status only.',
    active: true
  },
  {
    id: 'premium_legendary_room_theme',
    name: 'Legendary Room Theme',
    kind: 'premium',
    rarity: 'legendary',
    sparks_price: null,
    usd_price_cents: 599,
    category: 'premium',
    description: 'Unlocks the Legendary room theme: a fixed, fully-disclosed decor and lighting set.',
    active: true
  },
  {
    id: 'premium_golden_agent_skin',
    name: 'Golden Agent Skin',
    kind: 'premium',
    rarity: 'legendary',
    sparks_price: null,
    usd_price_cents: 999,
    category: 'premium',
    description: 'A permanent golden skin cosmetic for one agent. Purely visual, no gameplay bonus.',
    active: true
  }
];

/**
 * seedCatalog — upsert the starter catalog into catalog_items.
 *
 * Idempotent: uses each item's stable id via economyService.upsertCatalogItem,
 * so repeated runs converge to the same catalog with no duplicates.
 *
 * @param {object} economyService  an EconomyService (must expose
 *                                  upsertCatalogItem + listCatalog).
 * @param {object} [opts]
 * @param {boolean} [opts.onlyIfEmpty=false]  if true, seed ONLY when the
 *                                  catalog currently has no ACTIVE items
 *                                  (guarded boot-seed).
 * @returns {Promise<{seeded:number, skipped:boolean, count:number}>}
 */
async function seedCatalog(economyService, opts = {}) {
  if (!economyService || typeof economyService.upsertCatalogItem !== 'function') {
    throw new Error('seedCatalog requires an EconomyService with upsertCatalogItem()');
  }
  const onlyIfEmpty = !!opts.onlyIfEmpty;

  if (onlyIfEmpty && typeof economyService.listCatalog === 'function') {
    const existing = await economyService.listCatalog();
    if (Array.isArray(existing) && existing.length > 0) {
      return { seeded: 0, skipped: true, count: existing.length };
    }
  }

  let seeded = 0;
  for (const item of CATALOG) {
    // Normalize: coerce prices to int-or-null so the ledger never sees floats.
    const normalized = {
      id: item.id,
      name: item.name,
      kind: item.kind,
      rarity: item.rarity,
      sparks_price: item.sparks_price == null ? null : Math.trunc(item.sparks_price),
      usd_price_cents: item.usd_price_cents == null ? null : Math.trunc(item.usd_price_cents),
      category: item.category,
      description: item.description,
      active: item.active !== false
    };
    await economyService.upsertCatalogItem(normalized);
    seeded += 1;
  }
  return { seeded, skipped: false, count: seeded };
}

module.exports = { seedCatalog, CATALOG };

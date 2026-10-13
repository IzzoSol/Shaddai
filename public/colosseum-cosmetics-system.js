/**
 * SHADDAI Colosseum — COSMETICS SYSTEM
 * Skins, color variants, and visual customization
 * Works with both placeholder and real characters
 */

// ─── COSMETIC DEFINITIONS ───
const COSMETICS = {
  // ORACLE Skins
  ORACLE_Base: {
    id: 'ORACLE_Base',
    character: 'ORACLE',
    name: 'Purple Mystic',
    tier: 'base',
    colorPrimary: 0x8a6cff,
    colorSecondary: 0xc9a961,
    description: 'Classic mystic mage with purple aura',
    unlocked: true,
    cost: 0
  },
  ORACLE_Gold: {
    id: 'ORACLE_Gold',
    character: 'ORACLE',
    name: 'Gold Mystic',
    tier: 'common',
    colorPrimary: 0xffd700,
    colorSecondary: 0xff8c00,
    description: 'Radiant healer variant',
    unlocked: false,
    cost: 500
  },
  ORACLE_Void: {
    id: 'ORACLE_Void',
    character: 'ORACLE',
    name: 'Void Oracle',
    tier: 'rare',
    colorPrimary: 0x1a0033,
    colorSecondary: 0xff3300,
    description: 'Dark sorceress of the void',
    unlocked: false,
    cost: 1500
  },

  // ZEROX Skins
  ZEROX_Base: {
    id: 'ZEROX_Base',
    character: 'ZEROX',
    name: 'Cyan Knight',
    tier: 'base',
    colorPrimary: 0x27e0ff,
    colorSecondary: 0x00ff9c,
    description: 'Sleek cyber warrior',
    unlocked: true,
    cost: 0
  },
  ZEROX_Obsidian: {
    id: 'ZEROX_Obsidian',
    character: 'ZEROX',
    name: 'Obsidian Knight',
    tier: 'common',
    colorPrimary: 0x1a1a2e,
    colorSecondary: 0x4a4a6a,
    description: 'Stealth specialist',
    unlocked: false,
    cost: 500
  },
  ZEROX_Chrome: {
    id: 'ZEROX_Chrome',
    character: 'ZEROX',
    name: 'Chrome Knight',
    tier: 'rare',
    colorPrimary: 0xd3d3d3,
    colorSecondary: 0xffffff,
    description: 'Mirror-finish polished armor',
    unlocked: false,
    cost: 1500
  },

  // NEXUS Skins
  NEXUS_Base: {
    id: 'NEXUS_Base',
    character: 'NEXUS',
    name: 'Neon Tech',
    tier: 'base',
    colorPrimary: 0x00ff9c,
    colorSecondary: 0xff00ff,
    description: 'Lime and magenta hacker',
    unlocked: true,
    cost: 0
  },
  NEXUS_Cyberpunk: {
    id: 'NEXUS_Cyberpunk',
    character: 'NEXUS',
    name: 'Cyberpunk',
    tier: 'common',
    colorPrimary: 0xff00ff,
    colorSecondary: 0xffff00,
    description: 'Pink and yellow variant',
    unlocked: false,
    cost: 500
  },
  NEXUS_Matrix: {
    id: 'NEXUS_Matrix',
    character: 'NEXUS',
    name: 'Matrix',
    tier: 'epic',
    colorPrimary: 0x00ff00,
    colorSecondary: 0x000000,
    description: 'Classic green on black',
    unlocked: false,
    cost: 2000
  },

  // PIKADON Skins
  PIKADON_Base: {
    id: 'PIKADON_Base',
    character: 'PIKADON',
    name: 'Orange Tank',
    tier: 'base',
    colorPrimary: 0xff6b1a,
    colorSecondary: 0xffd700,
    description: 'Heavy orange armor',
    unlocked: true,
    cost: 0
  },
  PIKADON_Rust: {
    id: 'PIKADON_Rust',
    character: 'PIKADON',
    name: 'Rust Tank',
    tier: 'common',
    colorPrimary: 0x8b4513,
    colorSecondary: 0xa0522d,
    description: 'Weathered warrior',
    unlocked: false,
    cost: 500
  },
  PIKADON_Platinum: {
    id: 'PIKADON_Platinum',
    character: 'PIKADON',
    name: 'Platinum Tank',
    tier: 'rare',
    colorPrimary: 0xe5e5e5,
    colorSecondary: 0xffffff,
    description: 'Ceremonial white armor',
    unlocked: false,
    cost: 1500
  },

  // TURTLE Skins
  TURTLE_Base: {
    id: 'TURTLE_Base',
    character: 'TURTLE',
    name: 'Forest Shell',
    tier: 'base',
    colorPrimary: 0x2d5a2d,
    colorSecondary: 0xd2b48c,
    description: 'Natural green beast',
    unlocked: true,
    cost: 0
  },
  TURTLE_Jade: {
    id: 'TURTLE_Jade',
    character: 'TURTLE',
    name: 'Jade Shell',
    tier: 'common',
    colorPrimary: 0x00ff7f,
    colorSecondary: 0x20b2aa,
    description: 'Polished emerald shell',
    unlocked: false,
    cost: 500
  },
  TURTLE_Mossy: {
    id: 'TURTLE_Mossy',
    character: 'TURTLE',
    name: 'Mossy Shell',
    tier: 'rare',
    colorPrimary: 0x556b2f,
    colorSecondary: 0x6b8e23,
    description: 'Ancient weathered beast',
    unlocked: false,
    cost: 1500
  },

  // QUILL Skins
  QUILL_Base: {
    id: 'QUILL_Base',
    character: 'QUILL',
    name: 'Gold Archer',
    tier: 'base',
    colorPrimary: 0xffd700,
    colorSecondary: 0xd2b48c,
    description: 'Classic graceful archer',
    unlocked: true,
    cost: 0
  },
  QUILL_Autumn: {
    id: 'QUILL_Autumn',
    character: 'QUILL',
    name: 'Autumn Archer',
    tier: 'common',
    colorPrimary: 0xcd853f,
    colorSecondary: 0x8b4513,
    description: 'Rust and brown variant',
    unlocked: false,
    cost: 500
  },
  QUILL_Pearl: {
    id: 'QUILL_Pearl',
    character: 'QUILL',
    name: 'Pearl Archer',
    tier: 'rare',
    colorPrimary: 0xffffff,
    colorSecondary: 0xffd700,
    description: 'Celestial white and gold',
    unlocked: false,
    cost: 1500
  },

  // SHADDAI Skins
  SHADDAI_Base: {
    id: 'SHADDAI_Base',
    character: 'SHADDAI',
    name: 'Royal Commander',
    tier: 'base',
    colorPrimary: 0x8a6cff,
    colorSecondary: 0xffd700,
    description: 'Regal purple and gold',
    unlocked: true,
    cost: 0
  },
  SHADDAI_Formal: {
    id: 'SHADDAI_Formal',
    character: 'SHADDAI',
    name: 'Formal Commander',
    tier: 'common',
    colorPrimary: 0x000000,
    colorSecondary: 0xc0c0c0,
    description: 'Black and silver formal wear',
    unlocked: false,
    cost: 500
  },
  SHADDAI_Tactical: {
    id: 'SHADDAI_Tactical',
    character: 'SHADDAI',
    name: 'Tactical Commander',
    tier: 'epic',
    colorPrimary: 0x00ff7f,
    colorSecondary: 0x1a0033,
    description: 'Emerald and obsidian',
    unlocked: false,
    cost: 2000
  }
};

// ─── COSMETICS MANAGER ───
class CosmeticsManager {
  constructor() {
    this.unlockedSkins = {};
    this.equippedSkins = {};
    this.totalCredits = 5000; // Player currency

    // Initialize base skins as unlocked
    for (const [skinId, skin] of Object.entries(COSMETICS)) {
      if (skin.tier === 'base') {
        this.unlockedSkins[skinId] = true;
        this.equippedSkins[skin.character] = skinId;
      }
    }
  }

  // ─── UNLOCK COSMETICS ───
  unlockSkin(skinId) {
    const skin = COSMETICS[skinId];
    if (!skin) return { success: false, error: 'Skin not found' };
    if (this.unlockedSkins[skinId]) return { success: false, error: 'Already unlocked' };
    if (this.totalCredits < skin.cost) return { success: false, error: 'Not enough credits' };

    this.totalCredits -= skin.cost;
    this.unlockedSkins[skinId] = true;

    return {
      success: true,
      skin: skin.name,
      creditsRemaining: this.totalCredits,
      message: `Unlocked ${skin.name}!`
    };
  }

  // ─── EQUIP COSMETICS ───
  equipSkin(characterId, skinId) {
    const skin = COSMETICS[skinId];
    if (!skin) return { success: false, error: 'Skin not found' };
    if (!this.unlockedSkins[skinId]) return { success: false, error: 'Skin not unlocked' };
    if (skin.character !== characterId) return { success: false, error: 'Skin not for this character' };

    this.equippedSkins[characterId] = skinId;

    return {
      success: true,
      character: characterId,
      skin: skin.name,
      colors: {
        primary: skin.colorPrimary,
        secondary: skin.colorSecondary
      }
    };
  }

  // ─── GET EQUIPPED COSMETICS ───
  getEquipped(characterId) {
    const skinId = this.equippedSkins[characterId];
    if (!skinId) return null;

    const skin = COSMETICS[skinId];
    return {
      id: skinId,
      name: skin.name,
      tier: skin.tier,
      colorPrimary: skin.colorPrimary,
      colorSecondary: skin.colorSecondary
    };
  }

  // ─── APPLY TO CHARACTER ───
  applyToCharacter(character, characterId) {
    const cosmetic = this.getEquipped(characterId);
    if (!cosmetic || !character.mesh) return;

    // Apply colors to material
    if (character.mesh.material) {
      character.mesh.material.color.setHex(cosmetic.colorPrimary);
    }

    return cosmetic;
  }

  // ─── SHOP LISTING ───
  getShop() {
    const available = [];

    for (const [skinId, skin] of Object.entries(COSMETICS)) {
      if (!this.unlockedSkins[skinId]) {
        available.push({
          id: skinId,
          name: skin.name,
          character: skin.character,
          cost: skin.cost,
          tier: skin.tier,
          description: skin.description,
          unlocked: false
        });
      }
    }

    return {
      creditsAvailable: this.totalCredits,
      skinsForSale: available.length,
      items: available
    };
  }

  // ─── INVENTORY ───
  getInventory() {
    const inventory = {};

    for (const characterId of ['ORACLE', 'ZEROX', 'NEXUS', 'PIKADON', 'TURTLE', 'QUILL', 'SHADDAI']) {
      inventory[characterId] = {
        equipped: this.getEquipped(characterId),
        available: []
      };

      for (const [skinId, skin] of Object.entries(COSMETICS)) {
        if (skin.character === characterId && this.unlockedSkins[skinId]) {
          inventory[characterId].available.push({
            id: skinId,
            name: skin.name,
            tier: skin.tier
          });
        }
      }
    }

    return inventory;
  }

  // ─── STATISTICS ───
  getStats() {
    const totalSkins = Object.keys(COSMETICS).length;
    const unlockedCount = Object.keys(this.unlockedSkins).length;

    const byTier = {
      base: 0,
      common: 0,
      rare: 0,
      epic: 0
    };

    for (const skinId of Object.keys(this.unlockedSkins)) {
      const skin = COSMETICS[skinId];
      byTier[skin.tier]++;
    }

    return {
      totalInGame: totalSkins,
      unlockedCount: unlockedCount,
      percentage: ((unlockedCount / totalSkins) * 100).toFixed(1),
      byTier: byTier,
      creditsAvailable: this.totalCredits
    };
  }
}

// ─── UI INTEGRATION ───
class CosmeticsUI {
  constructor(cosmetics, containerId = 'cosmetics-ui') {
    this.cosmetics = cosmetics;
    this.container = document.getElementById(containerId);
  }

  renderShop() {
    const shop = this.cosmetics.getShop();

    let html = `
      <div class="cosmetics-shop">
        <h2>🎨 Cosmetics Shop</h2>
        <div class="credits-display">
          Available Credits: <strong>${shop.creditsAvailable}</strong>
        </div>
        <div class="shop-items">
    `;

    for (const item of shop.items) {
      html += `
        <div class="shop-item tier-${item.tier}">
          <div class="item-name">${item.name}</div>
          <div class="item-character">${item.character}</div>
          <div class="item-cost">💰 ${item.cost}</div>
          <button onclick="cosmeticsManager.unlockSkin('${item.id}')">Unlock</button>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    if (this.container) {
      this.container.innerHTML = html;
    }

    return html;
  }

  renderInventory() {
    const inventory = this.cosmetics.getInventory();

    let html = `
      <div class="cosmetics-inventory">
        <h2>👕 My Skins</h2>
    `;

    for (const [character, data] of Object.entries(inventory)) {
      html += `
        <div class="character-cosmetics">
          <div class="character-name">${character}</div>
          <div class="equipped">
            <strong>Equipped:</strong> ${data.equipped?.name || 'None'}
          </div>
          <div class="available">
            <strong>Available (${data.available.length}):</strong>
            ${data.available.map(skin => `
              <button onclick="cosmeticsManager.equipSkin('${character}', '${skin.id}')"
                      class="skin-button tier-${skin.tier}">
                ${skin.name}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`;

    if (this.container) {
      this.container.innerHTML = html;
    }

    return html;
  }

  renderStats() {
    const stats = this.cosmetics.getStats();

    let html = `
      <div class="cosmetics-stats">
        <h2>📊 Collection Stats</h2>
        <div class="stat-row">
          <span>Total Skins:</span>
          <strong>${stats.totalInGame}</strong>
        </div>
        <div class="stat-row">
          <span>Unlocked:</span>
          <strong>${stats.unlockedCount} (${stats.percentage}%)</strong>
        </div>
        <div class="stat-row">
          <span>Base:</span>
          <strong>${stats.byTier.base}</strong>
        </div>
        <div class="stat-row">
          <span>Common:</span>
          <strong>${stats.byTier.common}</strong>
        </div>
        <div class="stat-row">
          <span>Rare:</span>
          <strong>${stats.byTier.rare}</strong>
        </div>
        <div class="stat-row">
          <span>Epic:</span>
          <strong>${stats.byTier.epic}</strong>
        </div>
      </div>
    `;

    if (this.container) {
      this.container.innerHTML = html;
    }

    return html;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COSMETICS, CosmeticsManager, CosmeticsUI };
}
if (typeof window !== 'undefined') {
  window.COSMETICS = COSMETICS;
  window.CosmeticsManager = CosmeticsManager;
  window.CosmeticsUI = CosmeticsUI;
}

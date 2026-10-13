/**
 * SHADDAI Colosseum — CHARACTER ANIMATION SYSTEM
 * Six heroes: Zerox, Turtle, Pikadon, Quill, Oracle, Nexus
 * Blender 4.x → GLB → Three.js AnimationMixer
 */

// ─── CHARACTER DEFINITIONS ───
const CHARACTER_SPECS = {
  ZEROX: {
    id: 'ZEROX',
    name: 'ZEROX',
    height: 1.82,
    color: 0x27e0ff,
    weapon: 'WP_CyberSword',
    description: 'Cyber knight with blade extension tech',
    skills: ['Cyber Slash', 'Blade Extension', 'Two-Hand Thrust'],
    baseStats: { damage: 18, armor: 8, speed: 1.0 }
  },
  TURTLE: {
    id: 'TURTLE',
    name: 'TURTLE',
    height: 2.10,
    color: 0x37f5b0,
    weapon: 'WP_FlailBall',
    description: 'Shell-armored warrior with flail chain',
    skills: ['Overhead Smash', 'Sweep', 'Detach Chain'],
    baseStats: { damage: 22, armor: 12, speed: 0.85 }
  },
  PIKADON: {
    id: 'PIKADON',
    name: 'PIKADON',
    height: 1.90,
    color: 0xff6b1a,
    weapon: 'WP_WarHammer',
    description: 'Heavy armor with luminous helm',
    skills: ['Ground Pound', 'Leap Slam', 'Charged Overhead'],
    baseStats: { damage: 24, armor: 14, speed: 0.75 }
  },
  QUILL: {
    id: 'QUILL',
    name: 'QUILL',
    height: 1.70,
    color: 0xffd700,
    weapon: 'WP_NeedleBow',
    description: 'Swift archer with needle precision',
    skills: ['Quick Shot', 'Double Shot', 'Fan Volley'],
    baseStats: { damage: 14, armor: 4, speed: 1.3 }
  },
  ORACLE: {
    id: 'ORACLE',
    name: 'ORACLE',
    height: 1.70,
    color: 0x8a6cff,
    weapon: 'WP_OracleBlade',
    description: 'Mystic wielding blade and orb',
    skills: ['Blade Flick', 'Orbital Slash', 'Orb Pulse'],
    baseStats: { damage: 15, armor: 6, speed: 1.15 }
  },
  NEXUS: {
    id: 'NEXUS',
    name: 'NEXUS',
    height: 1.82,
    color: 0x00ff9c,
    weapon: 'WP_PulseBaton',
    description: 'Technical master with energy batons',
    skills: ['Quick Jabs', 'Interface Pose', 'Pulse Overload'],
    baseStats: { damage: 16, armor: 7, speed: 1.2 }
  }
};

// ─── ANIMATION CLIP LIBRARY ───
const ANIMATION_LIBRARY = {
  // Locomotion
  LOCOMOTION: {
    Idle: { duration: 2.0, loop: true, rootMotion: false },
    Idle_City: { duration: 4.0, loop: true, rootMotion: false },
    Walk: { duration: 1.0, loop: true, rootMotion: true },
    Run: { duration: 0.8, loop: true, rootMotion: true },
    Sprint: { duration: 0.7, loop: true, rootMotion: true },
    Jump_Start: { duration: 0.30, loop: false, rootMotion: false },
    Jump_Loop: { duration: 0.40, loop: true, rootMotion: false },
    Jump_Land: { duration: 0.35, loop: false, rootMotion: false },
    Crouch_Idle: { duration: 2.0, loop: true, rootMotion: false },
    Crouch_Walk: { duration: 1.1, loop: true, rootMotion: true },
    Roll: { duration: 0.55, loop: false, rootMotion: true, iframes: [0.10, 0.42] },
    GetUp: { duration: 0.70, loop: false, rootMotion: false }
  },

  // Combat
  COMBAT: {
    Draw: { duration: 0.40, loop: false, rootMotion: false },
    Sheathe: { duration: 0.45, loop: false, rootMotion: false },
    Atk_Light_1: { duration: 0.45, loop: false, rootMotion: false, hitFrame: 0.20 },
    Atk_Light_2: { duration: 0.45, loop: false, rootMotion: false, hitFrame: 0.20 },
    Atk_Light_3: { duration: 0.60, loop: false, rootMotion: false, hitFrame: 0.22 },
    Atk_Heavy: { duration: 0.85, loop: false, rootMotion: false, hitFrame: 0.40 },
    Atk_Special: { duration: 1.20, loop: false, rootMotion: false, hitFrame: 0.50 },
    Block_Idle: { duration: 1.50, loop: true, rootMotion: false },
    Block_Hit: { duration: 0.30, loop: false, rootMotion: false },
    Hit_Light: { duration: 0.35, loop: false, rootMotion: false },
    Hit_Heavy: { duration: 0.55, loop: false, rootMotion: false },
    Knockdown: { duration: 0.60, loop: false, rootMotion: false },
    Death: { duration: 1.40, loop: false, rootMotion: false }
  },

  // City/Interact
  CITY: {
    Talk: { duration: 3.00, loop: true, rootMotion: false },
    Talk_Listen: { duration: 2.50, loop: true, rootMotion: false },
    Wave: { duration: 1.40, loop: false, rootMotion: false },
    Point: { duration: 1.20, loop: false, rootMotion: false },
    Nod: { duration: 0.80, loop: false, rootMotion: false },
    ShakeHead: { duration: 0.80, loop: false, rootMotion: false },
    Sit_Down: { duration: 0.70, loop: false, rootMotion: false },
    Sit_Idle: { duration: 3.00, loop: true, rootMotion: false },
    Sit_Up: { duration: 0.70, loop: false, rootMotion: false },
    Interact_Console: { duration: 1.50, loop: false, rootMotion: false },
    Pickup: { duration: 0.80, loop: false, rootMotion: false },
    GiveItem: { duration: 1.00, loop: false, rootMotion: false }
  },

  // Emotes
  EMOTES: {
    Emote_Cheer: { duration: 2.0, loop: false, rootMotion: false },
    Emote_Taunt: { duration: 2.2, loop: false, rootMotion: false },
    Emote_Bow: { duration: 2.0, loop: false, rootMotion: false },
    Emote_Shrug: { duration: 1.6, loop: false, rootMotion: false },
    Emote_Flex: { duration: 2.0, loop: false, rootMotion: false },
    Emote_CastCircle: { duration: 2.4, loop: false, rootMotion: false },
    Emote_Salute: { duration: 1.8, loop: false, rootMotion: false },
    Emote_SpinFlail: { duration: 2.5, loop: false, rootMotion: false }
  }
};

// ─── CHARACTER COMPONENT ───
class Character {
  constructor(id, spec, model) {
    this.id = id;
    this.spec = spec;
    this.model = model;

    // Animation
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.nextAction = null;

    // State machine
    this.state = 'idle'; // idle, walking, running, attacking, blocking, rolling, city
    this.weaponVisible = true;

    // Combat stats
    this.hp = spec.baseStats.damage * 6; // Scale HP
    this.maxHp = this.hp;
    this.armor = spec.baseStats.armor;
    this.damage = spec.baseStats.damage;
    this.speed = spec.baseStats.speed;

    this.initMixer();
  }

  initMixer() {
    if (!this.model || !this.model.animations) {
      console.warn(`Character ${this.id}: no animations loaded`);
      return;
    }

    this.mixer = new THREE.AnimationMixer(this.model);

    // Create all action references
    for (const clip of this.model.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
  }

  play(clipName, loop = true, duration = 0.15) {
    if (!this.actions[clipName]) {
      console.warn(`Character ${this.id}: clip ${clipName} not found`);
      return;
    }

    const action = this.actions[clipName];

    if (this.currentAction && this.currentAction !== action) {
      // Crossfade to new action
      this.currentAction.fadeOut(duration);
    }

    action.reset();
    action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    action.clampWhenFinished = true;
    action.fadeIn(duration);
    action.play();

    this.currentAction = action;
  }

  stop(duration = 0.15) {
    if (this.currentAction) {
      this.currentAction.fadeOut(duration);
    }
  }

  update(deltaTime) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  // ─── STATE MACHINE ───
  setState(newState) {
    if (newState === this.state) return;

    this.state = newState;

    switch (newState) {
      case 'idle':
        this.play('Idle', true);
        break;
      case 'walk':
        this.play('Walk', true);
        break;
      case 'run':
        this.play('Run', true);
        break;
      case 'sprint':
        this.play('Sprint', true);
        break;
      case 'roll':
        this.play('Roll', false);
        break;
      case 'attack_light_1':
        this.play('Atk_Light_1', false);
        break;
      case 'attack_heavy':
        this.play('Atk_Heavy', false);
        break;
      case 'block':
        this.play('Block_Idle', true);
        break;
      case 'hit':
        this.play('Hit_Light', false);
        break;
      case 'death':
        this.play('Death', false);
        break;
      case 'city_idle':
        this.play('Idle_City', true);
        break;
      case 'talk':
        this.play('Talk', true);
        break;
      default:
        console.warn(`Unknown state: ${newState}`);
    }
  }

  // ─── COMBAT ───
  attack(type = 'light') {
    if (type === 'light') {
      this.setState('attack_light_1');
    } else if (type === 'heavy') {
      this.setState('attack_heavy');
    } else if (type === 'special') {
      this.play(`Atk_Special`, false);
    }
  }

  takeDamage(damage) {
    const mitigated = Math.max(1, damage - this.armor * 0.5);
    this.hp = Math.max(0, this.hp - mitigated);

    if (this.hp <= 0) {
      this.setState('death');
      return { dead: true, damage: mitigated };
    }

    this.setState('hit');
    return { dead: false, damage: mitigated };
  }

  // ─── WEAPONS ───
  hideWeapon() {
    if (this.model.getObjectByName(this.spec.weapon)) {
      this.model.getObjectByName(this.spec.weapon).visible = false;
    }
    this.weaponVisible = false;
  }

  showWeapon() {
    if (this.model.getObjectByName(this.spec.weapon)) {
      this.model.getObjectByName(this.spec.weapon).visible = true;
    }
    this.weaponVisible = true;
  }

  // ─── EMOTES ───
  emote(emoteName) {
    if (this.actions[emoteName]) {
      this.play(emoteName, false);
    }
  }

  // ─── CITY MODE ───
  enterCity() {
    this.setState('city_idle');
    this.hideWeapon();
  }

  exitCity() {
    this.showWeapon();
    this.setState('idle');
  }
}

// ─── CHARACTER LOADER ───
class CharacterLoader {
  constructor(THREE) {
    this.THREE = THREE;
    this.loader = new THREE.GLTFLoader();
    this.cache = {};
  }

  async loadCharacter(characterId) {
    if (this.cache[characterId]) {
      return this.cache[characterId];
    }

    const spec = CHARACTER_SPECS[characterId];
    if (!spec) {
      throw new Error(`Unknown character: ${characterId}`);
    }

    try {
      const gltf = await this.loader.loadAsync(`/characters/${characterId}/${characterId}.glb`);
      const model = gltf.scene.children[0] || gltf.scene;

      const character = new Character(characterId, spec, model);
      this.cache[characterId] = character;

      return character;
    } catch (error) {
      console.error(`Failed to load character ${characterId}:`, error);
      throw error;
    }
  }

  async loadAll() {
    const promises = Object.keys(CHARACTER_SPECS).map(id => this.loadCharacter(id));
    return Promise.all(promises);
  }
}

// ─── COMBAT INTEGRATION ───
class CharacterCombatSystem {
  constructor() {
    this.activeCombats = [];
  }

  startCombat(char1, char2) {
    const combat = {
      id: Date.now(),
      char1,
      char2,
      round: 0,
      char1Health: char1.hp,
      char2Health: char2.hp,
      log: []
    };

    this.activeCombats.push(combat);
    return combat;
  }

  simulateRound(combat) {
    combat.round++;

    // Char1 attacks
    const dmg1 = combat.char1.damage * (0.8 + Math.random() * 0.4);
    const result1 = combat.char2.takeDamage(dmg1);
    combat.log.push({
      round: combat.round,
      attacker: combat.char1.id,
      damage: result1.damage,
      targetHp: combat.char2.hp
    });

    if (result1.dead) {
      combat.log.push({ round: combat.round, winner: combat.char1.id });
      return combat;
    }

    // Char2 attacks
    const dmg2 = combat.char2.damage * (0.8 + Math.random() * 0.4);
    const result2 = combat.char1.takeDamage(dmg2);
    combat.log.push({
      round: combat.round,
      attacker: combat.char2.id,
      damage: result2.damage,
      targetHp: combat.char1.hp
    });

    if (result2.dead) {
      combat.log.push({ round: combat.round, winner: combat.char2.id });
    }

    return combat;
  }

  resolveCombat(combat) {
    while (!this.isCombatOver(combat)) {
      this.simulateRound(combat);
    }
    return combat;
  }

  isCombatOver(combat) {
    return combat.char1.hp <= 0 || combat.char2.hp <= 0;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Character, CharacterLoader, CharacterCombatSystem, CHARACTER_SPECS, ANIMATION_LIBRARY };
}
if (typeof window !== 'undefined') {
  window.Character = Character;
  window.CharacterLoader = CharacterLoader;
  window.CharacterCombatSystem = CharacterCombatSystem;
  window.CHARACTER_SPECS = CHARACTER_SPECS;
  window.ANIMATION_LIBRARY = ANIMATION_LIBRARY;
}

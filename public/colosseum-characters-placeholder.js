/**
 * SHADDAI Colosseum — PLACEHOLDER CHARACTER SYSTEM
 * Capsule-based heroes for v1 (stand-in until Blender GLB is ready)
 * Drop-in replacement when GLB files are ready
 */

// ─── PLACEHOLDER CHARACTER ───
class PlaceholderCharacter {
  constructor(id, spec, THREE, scene) {
    this.id = id;
    this.spec = spec;
    this.THREE = THREE;
    this.scene = scene;

    // Visual (capsule)
    this.mesh = null;
    this.createMesh();

    // State
    this.state = 'idle';
    this.weaponVisible = true;
    this.animationTime = 0;

    // Combat
    this.hp = spec.baseStats.damage * 6;
    this.maxHp = this.hp;
    this.armor = spec.baseStats.armor;
    this.damage = spec.baseStats.damage;
    this.speed = spec.baseStats.speed;
  }

  createMesh() {
    // Capsule body
    const geometry = new this.THREE.CapsuleGeometry(0.4, 1.5, 4, 8);
    const material = new this.THREE.MeshStandardMaterial({
      color: this.spec.color,
      roughness: 0.8,
      metalness: 0.3
    });
    this.mesh = new this.THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.y = this.spec.height / 2;

    // Head sphere
    const headGeo = new this.THREE.SphereGeometry(0.25, 16, 16);
    const headMat = new this.THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new this.THREE.Mesh(headGeo, headMat);
    head.position.y = this.spec.height - 0.3;
    head.castShadow = true;

    this.mesh.add(head);
    this.scene.add(this.mesh);
  }

  setState(newState) {
    this.state = newState;

    // Visual feedback via rotation/scale
    switch (newState) {
      case 'attack_light_1':
      case 'attack_heavy':
        this.playAttackAnimation();
        break;
      case 'roll':
        this.playRollAnimation();
        break;
      case 'death':
        this.mesh.rotation.z = Math.PI / 2;
        break;
    }
  }

  playAttackAnimation() {
    // Simple rotation animation
    this.animationTime = 0;
    const startRotation = this.mesh.rotation.y;
    const animate = () => {
      this.animationTime += 0.05;
      this.mesh.rotation.y = startRotation + Math.sin(this.animationTime) * 0.5;

      if (this.animationTime < 1) {
        requestAnimationFrame(animate);
      } else {
        this.mesh.rotation.y = startRotation;
      }
    };
    animate();
  }

  playRollAnimation() {
    // Spin around Z axis
    this.animationTime = 0;
    const startRotation = this.mesh.rotation.z;
    const animate = () => {
      this.animationTime += 0.1;
      this.mesh.rotation.z = startRotation + this.animationTime * Math.PI * 2;

      if (this.animationTime < 0.55) {
        requestAnimationFrame(animate);
      } else {
        this.mesh.rotation.z = startRotation;
      }
    };
    animate();
  }

  attack(type = 'light') {
    if (type === 'light') {
      this.setState('attack_light_1');
    } else if (type === 'heavy') {
      this.setState('attack_heavy');
    }
  }

  takeDamage(damage) {
    const mitigated = Math.max(1, damage - this.armor * 0.5);
    this.hp = Math.max(0, this.hp - mitigated);

    if (this.hp <= 0) {
      this.setState('death');
      return { dead: true, damage: mitigated };
    }

    // Brief red flash
    const originalColor = this.mesh.material.color.getHex();
    this.mesh.material.color.setHex(0xff3333);
    setTimeout(() => {
      this.mesh.material.color.setHex(originalColor);
    }, 100);

    return { dead: false, damage: mitigated };
  }

  hideWeapon() {
    this.weaponVisible = false;
    // In real implementation, hide weapon mesh
  }

  showWeapon() {
    this.weaponVisible = true;
    // In real implementation, show weapon mesh
  }

  enterCity() {
    this.setState('idle');
    this.hideWeapon();
    // City pose (slightly different)
    this.mesh.material.color.setHex(this.spec.color);
  }

  exitCity() {
    this.showWeapon();
  }

  emote(emoteName) {
    // Simple bounce or spin for now
    this.animationTime = 0;
    const startY = this.mesh.position.y;
    const animate = () => {
      this.animationTime += 0.05;
      this.mesh.position.y = startY + Math.sin(this.animationTime) * 0.3;

      if (this.animationTime < 2) {
        requestAnimationFrame(animate);
      } else {
        this.mesh.position.y = startY;
      }
    };
    animate();
  }

  update(deltaTime) {
    // Idle breathing
    if (this.state === 'idle') {
      const time = Date.now() * 0.001;
      this.mesh.scale.y = 1 + Math.sin(time) * 0.02;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ─── PLACEHOLDER LOADER ───
class PlaceholderCharacterLoader {
  constructor(THREE) {
    this.THREE = THREE;
    this.characters = {};
    this.scene = null;
  }

  setScene(scene) {
    this.scene = scene;
  }

  loadCharacter(characterId) {
    if (!this.scene) {
      throw new Error('Scene not set. Call setScene() first.');
    }

    const spec = CHARACTER_SPECS[characterId];
    if (!spec) {
      throw new Error(`Unknown character: ${characterId}`);
    }

    const character = new PlaceholderCharacter(
      characterId,
      spec,
      this.THREE,
      this.scene
    );

    this.characters[characterId] = character;
    return character;
  }

  loadAll() {
    const result = {};
    for (const characterId of Object.keys(CHARACTER_SPECS)) {
      result[characterId] = this.loadCharacter(characterId);
    }
    return result;
  }

  getCharacter(id) {
    return this.characters[id];
  }

  cleanup() {
    for (const char of Object.values(this.characters)) {
      char.dispose();
    }
    this.characters = {};
  }
}

// ─── INTEGRATION EXAMPLE ───
/*
Usage in colosseum:

const loader = new PlaceholderCharacterLoader(THREE);
loader.setScene(scene);

// Load all heroes
const heroes = loader.loadAll();

// Use in game
const player1 = heroes.ZEROX;
player1.setState('walk');
player1.attack('heavy');

// When Blender GLB is ready, swap:
const realLoader = new CharacterLoader(THREE);
const player1Real = await realLoader.loadCharacter('ZEROX');
// Same API, drop-in replacement
*/

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PlaceholderCharacter, PlaceholderCharacterLoader };
}
if (typeof window !== 'undefined') {
  window.PlaceholderCharacter = PlaceholderCharacter;
  window.PlaceholderCharacterLoader = PlaceholderCharacterLoader;
}

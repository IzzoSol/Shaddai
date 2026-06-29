/**
 * SHADDAI World Labs Client
 * Frontend integration for dynamic world generation and interaction
 * Usage: WorldLabsClient.createWorld({ name, prompt, style })
 */

class WorldLabsClient {
  constructor(apiBase = '/api/worlds') {
    this.apiBase = apiBase;
    this.currentWorld = null;
    this.physicsEnabled = false;
    this.animationFrame = null;
  }

  /**
   * Create a new world
   */
  async createWorld(config) {
    try {
      console.log('🌍 Creating world:', config.name);

      const response = await fetch(`${this.apiBase}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          prompt: config.prompt,
          style: config.style || 'shaddai'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create world: ${response.statusText}`);
      }

      const data = await response.json();
      this.currentWorld = data.world;

      console.log('✅ World created:', this.currentWorld.id);
      return this.currentWorld;

    } catch (error) {
      console.error('❌ World creation failed:', error);
      throw error;
    }
  }

  /**
   * Get world by ID
   */
  async getWorld(worldId) {
    try {
      const response = await fetch(`${this.apiBase}/${worldId}`);

      if (!response.ok) {
        throw new Error('World not found');
      }

      const world = await response.json();
      this.currentWorld = world;
      return world;

    } catch (error) {
      console.error('Failed to fetch world:', error);
      throw error;
    }
  }

  /**
   * List all worlds
   */
  async listWorlds() {
    try {
      const response = await fetch(this.apiBase);
      const data = await response.json();
      return data.worlds || [];

    } catch (error) {
      console.error('Failed to list worlds:', error);
      throw error;
    }
  }

  /**
   * Enable physics simulation
   */
  enablePhysics(updateFn) {
    if (this.physicsEnabled) return;

    this.physicsEnabled = true;
    const update = async () => {
      if (!this.currentWorld || !this.physicsEnabled) {
        this.animationFrame = null;
        return;
      }

      try {
        const response = await fetch(`${this.apiBase}/${this.currentWorld.id}/physics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deltaTime: 1/60 })
        });

        if (response.ok) {
          const data = await response.json();
          if (updateFn) updateFn(data.bodies);
        }
      } catch (err) {
        console.error('Physics update failed:', err);
      }

      this.animationFrame = requestAnimationFrame(update);
    };

    this.animationFrame = requestAnimationFrame(update);
    console.log('✓ Physics simulation enabled');
  }

  /**
   * Disable physics simulation
   */
  disablePhysics() {
    this.physicsEnabled = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    console.log('✓ Physics simulation disabled');
  }

  /**
   * Seed world with entities
   */
  async seedEntities(entities) {
    if (!this.currentWorld) {
      throw new Error('No world loaded');
    }

    try {
      const response = await fetch(`${this.apiBase}/${this.currentWorld.id}/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities })
      });

      if (!response.ok) {
        throw new Error('Failed to seed entities');
      }

      const data = await response.json();
      console.log(`✓ Seeded ${data.entityCount} entities`);
      return data;

    } catch (error) {
      console.error('Seed failed:', error);
      throw error;
    }
  }

  /**
   * Visit a district
   */
  async visitDistrict(districtId) {
    if (!this.currentWorld) {
      throw new Error('No world loaded');
    }

    try {
      const response = await fetch(`${this.apiBase}/${this.currentWorld.id}/districts/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ districtId })
      });

      if (!response.ok) {
        throw new Error('District not found');
      }

      const data = await response.json();
      console.log(`📍 Visiting district: ${data.district.name}`);
      return data.district;

    } catch (error) {
      console.error('Visit failed:', error);
      throw error;
    }
  }

  /**
   * Get all districts in current world
   */
  getDistricts() {
    if (!this.currentWorld) {
      throw new Error('No world loaded');
    }

    return this.currentWorld.districts || [];
  }

  /**
   * Get district by ID
   */
  getDistrict(districtId) {
    const districts = this.getDistricts();
    return districts.find(d => d.id === districtId);
  }

  /**
   * Create Three.js world from World Labs data
   * Requires THREE.js to be loaded
   */
  async createThreeScene(containerElement) {
    if (!window.THREE) {
      throw new Error('THREE.js not loaded');
    }

    if (!this.currentWorld) {
      throw new Error('No world loaded');
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050010);
    scene.fog = new THREE.Fog(0x050010, 500, 2000);

    // Add ground plane
    const groundGeometry = new THREE.PlaneGeometry(800, 800);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0e14,
      metalness: 0.3,
      roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Add districts as visualizable zones
    for (const district of this.currentWorld.districts) {
      const geom = new THREE.CylinderGeometry(district.radius, district.radius, 2, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: district.color,
        emissive: district.color,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.2
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(district.position[0], 1, district.position[2]);
      mesh.userData.districtId = district.id;
      scene.add(mesh);

      // Add label
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;
      ctx.fillStyle = district.color;
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(district.name, 128, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(50, 12.5, 1);
      sprite.position.set(district.position[0], 30, district.position[2]);
      scene.add(sprite);
    }

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x00e5ff, 1, 500);
    pointLight1.position.set(100, 100, 100);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff4400, 1, 500);
    pointLight2.position.set(-100, 100, -100);
    scene.add(pointLight2);

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerElement.clientWidth / containerElement.clientHeight,
      0.1,
      10000
    );
    camera.position.set(0, 150, 200);
    camera.lookAt(0, 0, 0);

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerElement.clientWidth, containerElement.clientHeight);
    renderer.shadowMap.enabled = true;
    containerElement.appendChild(renderer.domElement);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return { scene, camera, renderer };
  }
}

// Export as global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldLabsClient;
} else {
  window.WorldLabsClient = WorldLabsClient;
}

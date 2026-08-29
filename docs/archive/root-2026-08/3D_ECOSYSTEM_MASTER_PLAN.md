# SHADDAI 3D Ecosystem Master Plan
## Multi-Provider Generation + Unified Marketplace + GLB Viewer

**Goal:** Be the **#1 platform** for agent 3D bodies, props, and assets. Support every major 3D generation provider + community uploads.

---

## 🎯 Vision

```
Creator wants a 3D model
  ↓ Chooses provider: Meshy | Tripo3D | Hugging Face | Blockade Labs
  ↓ Describes: "Cybernetic warrior, neon cyan, ethereal glow"
  ↓ Gets GLB in 30-120s
  ↓ Previews in 3D viewer (rotate, zoom, light controls)
  ↓ Lists for sale: $0.10 - $1.00
  ↓ Buyers purchase → Download GLB → Use in game/metaverse/AR
```

**3D Providers to Support:**
1. **Meshy** (✅ Done) — Text-to-3D, best quality, $0.10-0.50/model
2. **Tripo3D** (🆕) — Fast, alternative quality, $0.05-0.25/model
3. **Hugging Face** (🆕) — TripoSR + other open models, free/cheap
4. **Blockade Labs** (🆕) — Skyboxes + panoramas, unique aesthetic
5. **Sketchfab API** (🆕) — Browse existing models, curate to marketplace
6. **Replicate** (🆕) — Runs community 3D models, flexible
7. **Upload Custom GLB** (🆕) — Users upload their own GLBs (blender-created, etc.)

---

## 📦 Architecture

### Layer 1: Provider Abstraction
**New File:** `backend/3d-providers.js`

Similar to payment-providers pattern:

```javascript
class ThreeDProvider {
  async generate(prompt, options) { /* Returns jobId, status */ }
  async getStatus(jobId) { /* Returns status, glbUrl */ }
  async download(glbUrl) { /* Returns GLB buffer */ }
  async list() { /* List available models */ }
}

class MeshyProvider extends ThreeDProvider { /* already done */ }
class Tripo3DProvider extends ThreeDProvider { /* new */ }
class HuggingFaceProvider extends ThreeDProvider { /* new */ }
class BlockadeLabsProvider extends ThreeDProvider { /* new */ }
class SketchfabProvider extends ThreeDProvider { /* new */ }
class ReplicateProvider extends ThreeDProvider { /* new */ }
class CustomUploadProvider extends ThreeDProvider { /* new */ }

// Registry
const providerRegistry = new Map();
providerRegistry.set('meshy', new MeshyProvider());
providerRegistry.set('tripo3d', new Tripo3DProvider());
// etc...
```

---

## 🎨 Provider Details

### 1. **Meshy** ✅ DONE
- **Quality:** Excellent (9/10)
- **Speed:** Slow (60-120s)
- **Cost:** $0.10-0.50/model
- **Best for:** High-quality humanoids, creatures
- **API:** https://www.meshy.ai/api
- **Status:** Fully implemented

---

### 2. **Tripo3D** (NEW)
- **Quality:** Good (8/10)
- **Speed:** Fast (10-30s)
- **Cost:** $0.05-0.25/model
- **Best for:** Quick iterations, props, objects
- **API:** https://api.tripo3d.com
- **Implementation:**

```javascript
class Tripo3DProvider extends ThreeDProvider {
  async generate(prompt, options = {}) {
    const payload = {
      prompt,
      model_type: options.style || 'object',
      quality: options.quality || 'medium'
    };
    const response = await axios.post(`${this.apiBase}/models`, payload, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    return { jobId: response.data.id, status: 'generating' };
  }

  async getStatus(jobId) {
    const response = await axios.get(`${this.apiBase}/models/${jobId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    return {
      status: response.data.status,
      glbUrl: response.data.outputs?.glb_file
    };
  }
}
```

---

### 3. **Hugging Face TripoSR** (NEW)
- **Quality:** Good (8/10)
- **Speed:** Medium (20-60s)
- **Cost:** FREE (self-hosted via Replicate or HF Inference)
- **Best for:** Budget users, community models
- **Best for:** TripoSR (text→3D), custom community models
- **API:** HuggingFace Inference API
- **Implementation:**

```javascript
class HuggingFaceProvider extends ThreeDProvider {
  async generate(prompt, options = {}) {
    // Option A: Use Replicate to run TripoSR
    const response = await axios.post('https://api.replicate.com/v1/predictions', {
      version: 'triposr-model-id',
      input: { prompt }
    }, {
      headers: { 'Authorization': `Token ${this.apiKey}` }
    });
    return { jobId: response.data.id, status: 'processing' };
  }

  async getStatus(jobId) {
    // Poll Replicate prediction status
    const response = await axios.get(`https://api.replicate.com/v1/predictions/${jobId}`, {
      headers: { 'Authorization': `Token ${this.apiKey}` }
    });
    return {
      status: response.data.status,
      glbUrl: response.data.output?.[0]
    };
  }
}
```

**Key:** Can use **Replicate** as a universal runner for HF models (free/cheap tier available)

---

### 4. **Blockade Labs Skybox** (NEW)
- **Quality:** Excellent (9/10)
- **Speed:** Fast (5-15s)
- **Cost:** $0.05-0.15/skybox
- **Best for:** Backgrounds, environments, skyboxes
- **API:** https://api.blockadelabs.com
- **Unique:** Generates 360° panoramic environments
- **Use Case:** Agent backgrounds, world environments, VR spaces

```javascript
class BlockadeLabsProvider extends ThreeDProvider {
  async generate(prompt, options = {}) {
    const response = await axios.post(`${this.apiBase}/skybox`, {
      prompt,
      webhook_url: process.env.BLOCKADE_WEBHOOK_URL
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    return { jobId: response.data.request_id, status: 'queued' };
  }

  // Returns equirectangular panoramic image (can convert to cubemap → GLB)
}
```

---

### 5. **Sketchfab API** (NEW)
- **Quality:** Varies (4-10/10)
- **Speed:** Instant (search existing)
- **Cost:** Free/paid (license dependent)
- **Best for:** Pre-made models, discovering assets
- **API:** https://api.sketchfab.com
- **Strategy:** Curate existing models → list on SHADDAI marketplace

```javascript
class SketchfabProvider extends ThreeDProvider {
  async search(query, options = {}) {
    const response = await axios.get(
      `${this.apiBase}/v3/search?q=${query}&license=by-sa,by,cc0`,
      { headers: { 'Authorization': `Token ${this.apiKey}` } }
    );
    return response.data.results; // Array of model metadata
  }

  async download(modelId) {
    // Download GLB from Sketchfab
    const response = await axios.get(`${modelId}/download`, {
      responseType: 'arraybuffer'
    });
    return response.data; // GLB buffer
  }
}
```

---

### 6. **Replicate** (NEW)
- **Quality:** Varies (depends on model)
- **Speed:** Variable (10-180s)
- **Cost:** $0.001-0.10/run (extremely cheap)
- **Best for:** Running any open-source model
- **API:** https://replicate.com/api
- **Models Available:**
  - TripoSR (text→3D)
  - Point-E (text→3D point cloud)
  - Shap-E (text→3D mesh)
  - Custom fine-tuned models

```javascript
class ReplicateProvider extends ThreeDProvider {
  async generate(prompt, options = {}) {
    const modelVersion = options.model || 'triposr';
    const response = await axios.post('https://api.replicate.com/v1/predictions', {
      version: modelVersion,
      input: { prompt, ...options.params }
    }, {
      headers: { 'Authorization': `Token ${this.apiKey}` }
    });
    return { jobId: response.data.id, status: 'processing' };
  }
}
```

**Why Replicate:**
- Run ANY open-source ML model (3D, image, video, text)
- Per-prediction billing (very cheap)
- Async job handling (built-in webhooks)
- No vendor lock-in

---

### 7. **Custom Upload** (NEW)
- **Quality:** User-determined
- **Speed:** Instant
- **Cost:** Free
- **Best for:** Blender artists, professional 3D designers
- **Implementation:** Drag-drop GLB uploader

```javascript
class CustomUploadProvider extends ThreeDProvider {
  async upload(glbBuffer, metadata) {
    const filename = `${crypto.randomUUID()}.glb`;
    const filepath = path.join(MODELS_DIR, filename);
    fs.writeFileSync(filepath, glbBuffer);
    return {
      glbUrl: `/api/models/${filename}`,
      metadata
    };
  }
}
```

---

## 👁️ GLB Viewer Component

**New File:** `public/glb-viewer.html`

Embeddable 3D viewer for all marketplace models:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; overflow: hidden; background: linear-gradient(135deg, #0a1120, #070c16); }
    canvas { display: block; width: 100%; height: 100vh; }
    .controls { position: fixed; top: 16px; left: 16px; z-index: 10; }
    .control-btn { padding: 8px 12px; background: rgba(39, 224, 255, 0.15); 
                   border: 1px solid rgba(39, 224, 255, 0.3); color: #27e0ff; 
                   cursor: pointer; margin: 4px; border-radius: 2px; }
    .info { position: fixed; bottom: 16px; left: 16px; z-index: 10; 
            background: rgba(0, 0, 0, 0.7); padding: 12px; border-radius: 2px; 
            color: #a0b8ff; font-size: 11px; max-width: 300px; }
  </style>
</head>
<body>
  <div class="controls">
    <button class="control-btn" onclick="resetView()">🔄 Reset</button>
    <button class="control-btn" onclick="toggleLight()">💡 Light</button>
    <button class="control-btn" onclick="toggleBg()">🌈 BG</button>
    <button class="control-btn" onclick="download()">⬇️ Download</button>
  </div>
  <div class="info">
    <div>🖱️ Drag to rotate</div>
    <div>🔍 Scroll to zoom</div>
    <div>➕ Right-click to pan</div>
  </div>

  <script type="module">
    import * as THREE from 'https://cdn.jsdelivr.net/npm/three@r128/build/three.module.js';
    import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@r128/examples/jsm/loaders/GLTFLoader.js';
    import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@r128/examples/jsm/controls/OrbitControls.js';

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0a1120);
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2;

    // Load GLB
    const loader = new GLTFLoader();
    const glbUrl = new URLSearchParams(window.location.search).get('model') || '/api/agent/model-1/body.glb';
    
    loader.load(glbUrl, (gltf) => {
      const model = gltf.scene;
      scene.add(model);
      
      // Auto-fit camera
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      camera.position.z = Math.max(size.x, size.y, size.z) * 1.5;
      controls.target.copy(box.getCenter(new THREE.Vector3()));
      controls.update();
    });

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Controls
    window.resetView = () => {
      controls.reset();
      controls.autoRotate = true;
    };

    window.toggleLight = () => {
      ambientLight.intensity = ambientLight.intensity === 0.8 ? 0.3 : 0.8;
    };

    window.toggleBg = () => {
      renderer.setClearColor(
        renderer.getClearColor().getHex() === 0x0a1120 ? 0x1a1a1a : 0x0a1120
      );
    };

    window.download = () => {
      alert('Download GLB: ' + glbUrl);
    };
  </script>
</body>
</html>
```

**Features:**
- ✅ Drag to rotate
- ✅ Scroll to zoom
- ✅ Auto-rotate
- ✅ Lighting controls
- ✅ Background toggle
- ✅ Download button
- ✅ Responsive

**Usage:**
```html
<!-- In 3D marketplace, embed viewer: -->
<iframe src="/glb-viewer.html?model=/api/agent/model-id/body.glb" style="width: 100%; height: 500px; border: none;"></iframe>
```

---

## 🏗️ File Structure

```
backend/
  ├── 3d-providers.js                 # Provider abstraction (NEW)
  ├── providers/
  │   ├── meshy-provider.js           # Meshy (EXISTING)
  │   ├── tripo3d-provider.js         # Tripo3D (NEW)
  │   ├── huggingface-provider.js     # HF TripoSR (NEW)
  │   ├── blockade-provider.js        # Blockade Labs (NEW)
  │   ├── sketchfab-provider.js       # Sketchfab (NEW)
  │   ├── replicate-provider.js       # Replicate (NEW)
  │   └── custom-upload-provider.js   # Custom GLB upload (NEW)
  ├── 3d-model-routes.js              # CRUD + generation API (UPDATE)
  └── data/
      └── models/
          └── *.glb                   # Cached GLB files

public/
  ├── 3d-marketplace.html             # (UPDATE with provider selector)
  ├── glb-viewer.html                 # Standalone 3D viewer (NEW)
  └── assets/
      └── default-body.glb            # Fallback model
```

---

## 🔌 Integration Points

### 1. Update 3D Marketplace UI

**Add Provider Selector:**

```html
<!-- In CREATE tab, add before style selector -->
<div class="form-group">
  <label class="form-label">Generation Provider</label>
  <div class="provider-grid">
    <button class="provider-btn selected" onclick="selectProvider('meshy', this)">
      🎨 Meshy (Best Quality)
    </button>
    <button class="provider-btn" onclick="selectProvider('tripo3d', this)">
      ⚡ Tripo3D (Fastest)
    </button>
    <button class="provider-btn" onclick="selectProvider('huggingface', this)">
      🤗 HuggingFace (Free)
    </button>
    <button class="provider-btn" onclick="selectProvider('blockade', this)">
      🌈 Blockade (Skyboxes)
    </button>
    <button class="provider-btn" onclick="selectProvider('replicate', this)">
      🔄 Replicate (Flexible)
    </button>
    <button class="provider-btn" onclick="selectProvider('upload', this)">
      📤 Upload Custom
    </button>
  </div>
</div>

<style>
  .provider-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .provider-btn { padding: 12px; background: rgba(39, 224, 255, 0.1); border: 2px solid rgba(39, 224, 255, 0.2);
                  color: #8fefff; cursor: pointer; border-radius: 2px; font-size: 11px; font-weight: 700; }
  .provider-btn.selected { background: rgba(39, 224, 255, 0.3); border-color: #27e0ff; color: #fff; }
</style>
```

**Update Generate Function:**

```javascript
async function generateModel() {
  const provider = selectedProvider || 'meshy';
  const response = await fetch('/api/3d/generate', {
    method: 'POST',
    body: JSON.stringify({
      provider,  // NEW: let backend choose provider
      name,
      style: selectedStyle,
      description: desc,
      colors
    })
  });
  // ... rest same
}
```

### 2. Update Backend Routes

**File:** `backend/3d-model-routes.js` (UPDATE)

```javascript
const { providerRegistry } = require('./3d-providers');

router.post('/generate', async (req, res) => {
  const { provider, name, description, style, colors } = req.body;

  const gen = providerRegistry.get(provider || 'meshy');
  if (!gen) return res.status(400).json({ error: 'Unknown provider' });

  const result = await gen.generate(description, {
    style,
    colors,
    name
  });

  res.json({ ok: true, ...result });
});

router.get('/status/:jobId', async (req, res) => {
  const provider = req.query.provider || 'meshy';
  const gen = providerRegistry.get(provider);
  const status = await gen.getStatus(req.params.jobId);
  res.json({ ok: true, ...status });
});

// New: Serve GLB files with caching
router.get('/:modelId/download', (req, res) => {
  const glb = meshyService.getBodyGLB(req.params.modelId);
  if (!glb) return res.status(404).json({ error: 'Model not found' });
  res.header('Content-Type', 'model/gltf-binary');
  res.header('Cache-Control', 'public, max-age=86400');
  res.send(glb);
});
```

---

## 💰 Pricing Strategy

| Provider | Cost/Model | Quality | Speed | Best For |
|----------|-----------|---------|-------|----------|
| **Meshy** | $0.10-0.50 | 9/10 | 60-120s | High-quality humanoids |
| **Tripo3D** | $0.05-0.25 | 8/10 | 10-30s | Quick iterations |
| **HuggingFace** | FREE | 7/10 | 20-60s | Budget users |
| **Blockade** | $0.05-0.15 | 9/10 | 5-15s | Skyboxes/backgrounds |
| **Replicate** | $0.001-0.10 | Variable | 10-180s | Flexible/cheap |
| **Sketchfab** | License-dependent | 4-10/10 | Instant | Pre-made models |
| **Custom Upload** | FREE | User-determined | Instant | Pro artists |

**Revenue Model:**
- **Free tier:** HuggingFace only (or 1 free Meshy/month)
- **Pro tier ($9.99/mo):** Unlimited all providers
- **Enterprise:** Custom provider integrations

---

## 🎯 Implementation Roadmap

### Phase 1: Provider Abstraction (TODAY)
- [ ] Create `3d-providers.js` base class
- [ ] Implement Tripo3D provider
- [ ] Implement HuggingFace/Replicate provider
- [ ] Create provider registry

### Phase 2: Marketplace UI (TODAY)
- [ ] Add provider selector to 3D marketplace
- [ ] Update generate function to accept provider
- [ ] Test with 2-3 providers

### Phase 3: GLB Viewer (TODAY)
- [ ] Build standalone GLB viewer (`glb-viewer.html`)
- [ ] Embed in marketplace (preview modal)
- [ ] Add download button

### Phase 4: Sketchfab Integration (TOMORROW)
- [ ] Wire Sketchfab API
- [ ] Build "Curate Existing Model" flow
- [ ] List curated models on marketplace

### Phase 5: Community Uploads (TOMORROW)
- [ ] Build custom GLB upload form
- [ ] Validate GLB files
- [ ] Store in S3 or backend/data/models/

### Phase 6: Advanced Features (NEXT WEEK)
- [ ] Skybox → Cubemap → GLB conversion
- [ ] Model variations (colors, features)
- [ ] Batch generation discounts
- [ ] Creator templates/presets

---

## 🚀 Quick Start

**Once routes are mounted:**

```bash
# Generate with Meshy
POST /api/3d/generate
{ "provider": "meshy", "description": "cybernetic warrior", ... }

# Generate with Tripo3D (faster, cheaper)
POST /api/3d/generate
{ "provider": "tripo3d", "description": "sword prop", ... }

# Generate with HF (free)
POST /api/3d/generate
{ "provider": "huggingface", "description": "alien creature", ... }

# Poll status
GET /api/3d/status/job-123?provider=meshy

# View in 3D viewer
GET /glb-viewer.html?model=/api/models/model-123/download

# Download GLB
GET /api/models/model-123/download
```

---

**Status:** Providers planned | UI ready | Viewer built | Ready to implement


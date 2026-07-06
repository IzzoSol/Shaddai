# GRIDIRON PROSPECT Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete narrative-driven football prospect game where players create a character, make daily prep decisions, level skills, pass challenges, and manage relationships — exporting a fully-formed character to GRIDIRON PRO.

**Architecture:** Single-file HTML5 game (gridiron-prospect.html) with Three.js for visuals, Cannon-ES for physics, and a backend API for character saves/exports. Game logic runs on frontend; saves sync to backend.

**Tech Stack:** Three.js, Cannon-ES (physics), Mixamo models + HF FLUX textures, JSON saves, REST API

**Estimated Duration:** 70 tasks, 5-6 weeks (can be parallelized)

**Critical Path Priority:** Foundation → Hub System → Challenges → Narrative → Advanced Systems → Polish

---

## File Structure

**Frontend:**
- `public/games/gridiron-prospect.html` — Main game file (HTML + CSS + JS all inline)

**Backend (New):**
- `backend/routes/gridiron-routes.js` — API for saves, difficulty, exports
- `backend/data/gridiron-saves/` — Directory for character JSON files

**Assets:**
- `public/assets/gridiron/teams/` — 7 agent team color schemes (JSON configs)
- `public/assets/gridiron/models/` — Mixamo character models, stadium environments
- `public/assets/gridiron/textures/` — Generated textures from HF FLUX
- `public/assets/gridiron/ui/` — UI elements, buttons, icons

---

## Phase 1: Foundation & Setup (Tasks 1-8)

### Task 1: Create HTML5 Game Shell & Three.js Scene

**Files:**
- Create: `public/games/gridiron-prospect.html`

- [ ] **Step 1: Write HTML skeleton with Three.js setup**

Create file `public/games/gridiron-prospect.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GRIDIRON PROSPECT — SHADDAI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%; height: 100%; overflow: hidden;
            background: #000;
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: #fff;
        }
        #game-container {
            position: fixed; inset: 0;
            background: linear-gradient(135deg, #0a0e27 0%, #0d1a3a 100%);
        }
        canvas { display: block; width: 100%; height: 100%; }
        #ui-layer {
            position: fixed; inset: 0; z-index: 10;
            pointer-events: none;
        }
        .interactive { pointer-events: auto; }
    </style>
</head>
<body>
    <div id="game-container">
        <canvas id="game-canvas"></canvas>
    </div>
    <div id="ui-layer"></div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js"></script>
    
    <script>
        // Game initialization
        const gameConfig = {
            canvasId: 'game-canvas',
            uiLayerId: 'ui-layer',
            width: window.innerWidth,
            height: window.innerHeight,
        };

        let scene, camera, renderer;
        let gameState = {
            currentScreen: 'main-menu',
            character: null,
            gameData: {},
        };

        function initializeThreeJS() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0e27);
            
            camera = new THREE.PerspectiveCamera(
                75,
                gameConfig.width / gameConfig.height,
                0.1,
                1000
            );
            camera.position.z = 5;

            renderer = new THREE.WebGLRenderer({ 
                canvas: document.getElementById(gameConfig.canvasId),
                antialias: true
            });
            renderer.setSize(gameConfig.width, gameConfig.height);
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.shadowMap.enabled = true;

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(10, 20, 10);
            directionalLight.castShadow = true;
            scene.add(directionalLight);

            console.log('[THREE.JS] Initialized scene, camera, renderer');
        }

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }

        window.addEventListener('resize', () => {
            gameConfig.width = window.innerWidth;
            gameConfig.height = window.innerHeight;
            camera.aspect = gameConfig.width / gameConfig.height;
            camera.updateProjectionMatrix();
            renderer.setSize(gameConfig.width, gameConfig.height);
        });

        // Start game
        initializeThreeJS();
        animate();
        console.log('[GRIDIRON PROSPECT] Game initialized. Current screen:', gameState.currentScreen);
    </script>
</body>
</html>
```

- [ ] **Step 2: Test the HTML loads with no console errors**

Open `http://localhost:3000/games/gridiron-prospect.html` in browser
Expected: Blue gradient background, no errors in console

---

### Task 2: Create Core Data Structures (Character, GameState)

**Files:**
- Modify: `public/games/gridiron-prospect.html` (add to script section after scene init)

- [ ] **Step 1: Add character data structure**

Add this code inside the `<script>` tag after `gameConfig`:

```javascript
// Character data structure
const CharacterTemplate = {
    id: null,
    name: 'Player',
    team: 'NEXUS', // 7 agent teams
    age: 21,
    
    // Stats (0-100)
    stats: {
        speed: 50,
        strength: 50,
        endurance: 50,
        qb_accuracy: 50,
        agility: 50,
        vertical_jump: 50,
        confidence: 50,
        focus: 50,
    },
    
    // Lore tracking
    lore: {
        dedicated_athlete: 0,
        focused_learner: 0,
        party_guy: 0,
        player_cheater: 0,
        lazy: 0,
        influencer: 0,
        dealer: 0,
        underdog: 0,
        villain: 0,
        heartbreaker: 0,
        loyal: 0,
        social_star: 0,
    },
    
    // Relationships
    relationships: {
        coach_approval: 50,
        gf_status: 'single', // single, dating, cheated, heartbroken
        rival_name: 'Derek',
        rival_intensity: 0,
    },
    
    // Economy
    money: {
        balance: 0,
        legal_sales: 0,
        illegal_sales: 0,
    },
    
    // Gear
    gear: {
        tier: 'basic', // basic, mid, premium, signature
        social_followers: 0,
    },
    
    // Progression
    cities_completed: 0,
    current_city: 1,
    challenges_passed: 0,
    challenges_failed: 0,
    
    // Session
    energy: 100,
    current_day: 1,
    days_in_city: 3,
};

// Agent teams (7 themes)
const AgentTeams = {
    NEXUS: { color: 0x00a8ff, name: 'NEXUS', primary: '#00a8ff', secondary: '#001a33' },
    TURTLE: { color: 0x00cc66, name: 'TURTLE', primary: '#00cc66', secondary: '#001a00' },
    ZEROX: { color: 0xffcc00, name: 'ZEROX', primary: '#ffcc00', secondary: '#331a00' },
    ORACLE: { color: 0xaa44ff, name: 'ORACLE', primary: '#aa44ff', secondary: '#220033' },
    QUILL: { color: 0xcccccc, name: 'QUILL', primary: '#cccccc', secondary: '#333333' },
    PIKADON: { color: 0xff1a1a, name: 'PIKADON', primary: '#ff1a1a', secondary: '#330000' },
    SHADDAI: { color: 0xffaa00, name: 'SHADDAI', primary: '#ffaa00', secondary: '#331a00' },
};

// Game progression
const GameProgression = {
    cities: [
        { name: 'College', number: 1, difficulty: 1.0, rivals: ['Derek'] },
        { name: 'Texas Regional', number: 2, difficulty: 1.2, rivals: ['Derek', 'Marcus'] },
        { name: 'SEC Championship', number: 3, difficulty: 1.4, rivals: ['Derek', 'Marcus', 'Tyler'] },
        { name: 'Midwest Combine', number: 4, difficulty: 1.6, rivals: ['Derek', 'Marcus', 'Tyler', 'James'] },
        { name: 'NFL Combine', number: 5, difficulty: 1.8, rivals: ['Elite Prospects'] },
    ],
};

console.log('[DATA] Character template and game progression loaded');
```

- [ ] **Step 2: Add save/load utility functions**

Add this code after the AgentTeams definition:

```javascript
// Save/Load utilities
const SaveManager = {
    save: async function(character) {
        try {
            const response = await fetch('/api/gridiron/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(character)
            });
            if (response.ok) {
                const data = await response.json();
                console.log('[SAVE] Character saved:', data.id);
                return data.id;
            } else {
                console.error('[SAVE] Error:', response.statusText);
            }
        } catch (err) {
            console.error('[SAVE] Network error:', err);
            // Fallback to localStorage
            localStorage.setItem('gridiron_save_' + character.id, JSON.stringify(character));
        }
    },
    
    load: async function(characterId) {
        try {
            const response = await fetch(`/api/gridiron/load/${characterId}`);
            if (response.ok) {
                const character = await response.json();
                console.log('[LOAD] Character loaded:', characterId);
                return character;
            }
        } catch (err) {
            console.error('[LOAD] Network error:', err);
            // Fallback to localStorage
            const saved = localStorage.getItem('gridiron_save_' + characterId);
            if (saved) return JSON.parse(saved);
        }
        return null;
    },
    
    exportToProMode: async function(character) {
        try {
            const response = await fetch('/api/gridiron/export-to-pro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(character)
            });
            if (response.ok) {
                const data = await response.json();
                console.log('[EXPORT] Character exported to PRO mode:', data.proModeLink);
                return data.proModeLink;
            }
        } catch (err) {
            console.error('[EXPORT] Error:', err);
        }
    }
};

console.log('[SAVE MANAGER] Initialized');
```

- [ ] **Step 3: Test data structures load without errors**

Check browser console:
Expected output:
```
[DATA] Character template and game progression loaded
[SAVE MANAGER] Initialized
[GRIDIRON PROSPECT] Game initialized. Current screen: main-menu
```

---

### Task 3: Create Main Menu Screen

**Files:**
- Modify: `public/games/gridiron-prospect.html` (add UI rendering)

- [ ] **Step 1: Create UI rendering function**

Add this code before the `animate()` function:

```javascript
// UI rendering system
const UIManager = {
    createMainMenu: function() {
        const uiLayer = document.getElementById(gameConfig.uiLayerId);
        uiLayer.innerHTML = `
            <div style="
                position: absolute; inset: 0;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(20,30,60,0.95));
                z-index: 20;
            ">
                <h1 style="
                    font-size: 4rem; font-weight: 900; letter-spacing: 3px;
                    background: linear-gradient(90deg, #00a8ff, #ffcc00);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 10px;
                ">GRIDIRON PROSPECT</h1>
                <p style="
                    font-size: 1.2rem; color: #aaa; letter-spacing: 2px;
                    margin-bottom: 50px; text-transform: uppercase;
                ">Create Your Football Legacy</p>
                
                <button id="btn-new-game" class="interactive" style="
                    padding: 15px 40px; font-size: 1.1rem; font-weight: bold;
                    background: linear-gradient(90deg, #00a8ff, #00cc66);
                    color: #000; border: none; border-radius: 8px;
                    cursor: pointer; margin: 10px; letter-spacing: 2px;
                ">NEW GAME</button>
                
                <button id="btn-load-game" class="interactive" style="
                    padding: 15px 40px; font-size: 1.1rem; font-weight: bold;
                    background: rgba(255,170,0,0.3); color: #ffaa00; border: 2px solid #ffaa00;
                    border-radius: 8px; cursor: pointer; margin: 10px; letter-spacing: 2px;
                ">LOAD GAME</button>
            </div>
        `;
        
        document.getElementById('btn-new-game').addEventListener('click', () => {
            console.log('[MENU] New game clicked');
            gameState.currentScreen = 'character-creation';
            UIManager.createCharacterCreation();
        });
        
        document.getElementById('btn-load-game').addEventListener('click', () => {
            console.log('[MENU] Load game clicked');
            alert('Load game feature coming soon');
        });
    }
};

console.log('[UI MANAGER] Initialized');
```

- [ ] **Step 2: Call main menu on game start**

Replace the last line before `initializeThreeJS()` with:

```javascript
        // Start game
        initializeThreeJS();
        UIManager.createMainMenu();
        animate();
        console.log('[GRIDIRON PROSPECT] Game initialized. Current screen:', gameState.currentScreen);
```

- [ ] **Step 3: Test main menu displays**

Open browser, navigate to game URL
Expected: Title "GRIDIRON PROSPECT", two buttons visible, clicking NEW GAME logs to console

---

### Task 4: Create Character Creation Screen (Team Selection)

**Files:**
- Modify: `public/games/gridiron-prospect.html`

- [ ] **Step 1: Add character creation UI**

Add this to UIManager object (after createMainMenu function):

```javascript
    createCharacterCreation: function() {
        const uiLayer = document.getElementById(gameConfig.uiLayerId);
        uiLayer.innerHTML = `
            <div style="
                position: absolute; inset: 0;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(20,30,60,0.95));
                overflow-y: auto; padding: 20px;
                z-index: 20;
            ">
                <h2 style="
                    font-size: 2.5rem; font-weight: 900; letter-spacing: 2px;
                    color: #fff; margin-bottom: 10px;
                ">CHOOSE YOUR TEAM</h2>
                <p style="color: #aaa; margin-bottom: 40px;">Select an agent-themed team skin</p>
                
                <div id="team-roster" style="
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 20px; margin-bottom: 40px; max-width: 1000px;
                "></div>
                
                <div style="display: flex; gap: 20px;">
                    <button id="btn-back-to-menu" class="interactive" style="
                        padding: 12px 30px; font-size: 1rem; font-weight: bold;
                        background: rgba(100,100,100,0.5); color: #fff; border: 1px solid #666;
                        border-radius: 8px; cursor: pointer; letter-spacing: 1px;
                    ">BACK</button>
                    
                    <button id="btn-confirm-team" class="interactive" style="
                        padding: 12px 30px; font-size: 1rem; font-weight: bold;
                        background: linear-gradient(90deg, #00a8ff, #00cc66);
                        color: #000; border: none; border-radius: 8px;
                        cursor: pointer; letter-spacing: 1px;
                    " disabled>CONFIRM</button>
                </div>
            </div>
        `;
        
        // Render team cards
        const roster = document.getElementById('team-roster');
        Object.entries(AgentTeams).forEach(([key, team]) => {
            const card = document.createElement('div');
            card.className = 'interactive';
            card.style.cssText = `
                padding: 20px; border-radius: 8px;
                background: rgba(20,30,60,0.6); border: 2px solid ${team.primary};
                cursor: pointer; text-align: center;
                transition: all 0.2s; color: ${team.primary};
            `;
            card.innerHTML = `
                <div style="font-size: 2rem; margin-bottom: 10px;">◆</div>
                <div style="font-weight: bold; font-size: 1.1rem;">${team.name}</div>
            `;
            card.addEventListener('click', () => {
                document.querySelectorAll('#team-roster > div').forEach(c => {
                    c.style.background = 'rgba(20,30,60,0.6)';
                    c.style.boxShadow = 'none';
                });
                card.style.background = `${team.primary}22`;
                card.style.boxShadow = `0 0 20px ${team.primary}`;
                gameState.selectedTeam = key;
                document.getElementById('btn-confirm-team').disabled = false;
            });
            roster.appendChild(card);
        });
        
        document.getElementById('btn-back-to-menu').addEventListener('click', () => {
            gameState.currentScreen = 'main-menu';
            UIManager.createMainMenu();
        });
        
        document.getElementById('btn-confirm-team').addEventListener('click', () => {
            console.log('[CHARACTER CREATION] Team selected:', gameState.selectedTeam);
            gameState.currentScreen = 'naming-screen';
            UIManager.createNamingScreen();
        });
    }
```

- [ ] **Step 2: Add naming screen**

Add this to UIManager object:

```javascript
    createNamingScreen: function() {
        const uiLayer = document.getElementById(gameConfig.uiLayerId);
        const team = AgentTeams[gameState.selectedTeam];
        
        uiLayer.innerHTML = `
            <div style="
                position: absolute; inset: 0;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(20,30,60,0.95));
                z-index: 20;
            ">
                <h2 style="
                    font-size: 2rem; font-weight: 900; letter-spacing: 2px;
                    color: #fff; margin-bottom: 30px;
                ">ENTER YOUR NAME</h2>
                
                <input id="name-input" type="text" placeholder="Your Name" maxlength="20" style="
                    padding: 15px; font-size: 1.1rem;
                    border: 2px solid ${team.primary}; border-radius: 8px;
                    background: rgba(20,30,60,0.8); color: #fff;
                    width: 300px; text-align: center; letter-spacing: 1px;
                " autofocus>
                
                <div style="margin-top: 40px; display: flex; gap: 20px;">
                    <button id="btn-back-naming" class="interactive" style="
                        padding: 12px 30px; font-size: 1rem; font-weight: bold;
                        background: rgba(100,100,100,0.5); color: #fff; border: 1px solid #666;
                        border-radius: 8px; cursor: pointer;
                    ">BACK</button>
                    
                    <button id="btn-start-game" class="interactive" style="
                        padding: 12px 30px; font-size: 1rem; font-weight: bold;
                        background: linear-gradient(90deg, #00a8ff, #00cc66);
                        color: #000; border: none; border-radius: 8px;
                        cursor: pointer; letter-spacing: 1px;
                    ">START GAME</button>
                </div>
            </div>
        `;
        
        const nameInput = document.getElementById('name-input');
        document.getElementById('btn-back-naming').addEventListener('click', () => {
            gameState.currentScreen = 'character-creation';
            UIManager.createCharacterCreation();
        });
        
        document.getElementById('btn-start-game').addEventListener('click', () => {
            const name = nameInput.value.trim() || 'Prospect';
            gameState.character = {
                ...CharacterTemplate,
                id: 'char_' + Date.now(),
                name: name,
                team: gameState.selectedTeam,
            };
            console.log('[GAME START] Character created:', gameState.character);
            gameState.currentScreen = 'hub';
            UIManager.createHub();
        });
        
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-start-game').click();
        });
    }
```

- [ ] **Step 3: Test character creation flow**

Open browser → NEW GAME → Select a team → Enter name → START GAME
Expected: Character created, logged to console with correct team and name

---

### Task 5: Create Backend API Skeleton (Gridiron Routes)

**Files:**
- Create: `backend/routes/gridiron-routes.js`

- [ ] **Step 1: Create gridiron routes file**

Create file `backend/routes/gridiron-routes.js`:

```javascript
// GRIDIRON PROSPECT Backend Routes
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SAVES_DIR = path.join(__dirname, '../data/gridiron-saves');

// Ensure saves directory exists
if (!fs.existsSync(SAVES_DIR)) {
    fs.mkdirSync(SAVES_DIR, { recursive: true });
}

// POST /api/gridiron/save — Save character
router.post('/save', (req, res) => {
    try {
        const character = req.body;
        const characterId = character.id || 'char_' + Date.now();
        const filePath = path.join(SAVES_DIR, `${characterId}.json`);
        
        fs.writeFileSync(filePath, JSON.stringify(character, null, 2));
        
        res.json({
            success: true,
            id: characterId,
            message: 'Character saved'
        });
        console.log(`[GRIDIRON] Saved character: ${characterId}`);
    } catch (err) {
        console.error('[GRIDIRON] Save error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gridiron/load/:characterId — Load character
router.get('/load/:characterId', (req, res) => {
    try {
        const filePath = path.join(SAVES_DIR, `${req.params.characterId}.json`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Character not found' });
        }
        
        const data = fs.readFileSync(filePath, 'utf8');
        const character = JSON.parse(data);
        
        res.json(character);
        console.log(`[GRIDIRON] Loaded character: ${req.params.characterId}`);
    } catch (err) {
        console.error('[GRIDIRON] Load error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/gridiron/export-to-pro — Export character to PRO mode
router.post('/export-to-pro', (req, res) => {
    try {
        const character = req.body;
        
        // Create export package
        const exportData = {
            character: character,
            exportedAt: new Date().toISOString(),
            proModeLink: `/games/gridiron-pro.html?character=${character.id}`
        };
        
        // Save export
        const exportPath = path.join(SAVES_DIR, `${character.id}_export.json`);
        fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
        
        res.json({
            success: true,
            proModeLink: exportData.proModeLink,
            message: 'Character exported to PRO mode'
        });
        console.log(`[GRIDIRON] Exported character to PRO: ${character.id}`);
    } catch (err) {
        console.error('[GRIDIRON] Export error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gridiron/difficulty/:city — Get difficulty modifiers
router.get('/difficulty/:city', (req, res) => {
    const cityNum = parseInt(req.params.city) || 1;
    const difficultyMults = [1.0, 1.2, 1.4, 1.6, 1.8];
    const mult = difficultyMults[cityNum - 1] || 1.8;
    
    res.json({
        city: cityNum,
        difficultyMultiplier: mult,
        judgeCount: 1 + (cityNum - 1),
        crowdIntensity: 0.2 + (cityNum * 0.15)
    });
});

module.exports = router;
```

- [ ] **Step 2: Register routes in server**

Open `backend/server-production.js` (or your main server file) and find the routes section.
Add this line where other routes are registered (around line where other routes are):

```javascript
const gridironRoutes = require('./routes/gridiron-routes');
app.use('/api/gridiron', gridironRoutes);
```

- [ ] **Step 3: Test API endpoints**

Run terminal commands:

```bash
# Test save
curl -X POST http://localhost:3000/api/gridiron/save \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test_001",
    "name": "TestChar",
    "team": "NEXUS",
    "stats": { "speed": 60 }
  }'

Expected response:
{
  "success": true,
  "id": "test_001",
  "message": "Character saved"
}
```

---

### Task 6: Create Hub Navigation System (Core UI)

**Files:**
- Modify: `public/games/gridiron-prospect.html`

- [ ] **Step 1: Add hub creation function to UIManager**

Add this to UIManager object:

```javascript
    createHub: function() {
        const uiLayer = document.getElementById(gameConfig.uiLayerId);
        const char = gameState.character;
        const team = AgentTeams[char.team];
        
        uiLayer.innerHTML = `
            <div style="
                position: fixed; inset: 0; z-index: 15;
                background: linear-gradient(135deg, rgba(10,14,39,0.9), rgba(20,30,60,0.9));
                display: flex;
            ">
                <!-- Left sidebar: Character info -->
                <div style="
                    width: 250px; padding: 20px; border-right: 2px solid ${team.primary};
                    display: flex; flex-direction: column; overflow-y: auto;
                ">
                    <h3 style="color: ${team.primary}; font-size: 1.5rem; margin-bottom: 10px;">
                        ${char.name}
                    </h3>
                    <p style="color: #aaa; font-size: 0.9rem; margin-bottom: 20px;">
                        ${team.name} • Age ${char.age}
                    </p>
                    
                    <!-- Quick stats -->
                    <div style="margin-bottom: 20px;">
                        <p style="color: #888; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 8px;">
                            ENERGY
                        </p>
                        <div style="
                            width: 100%; height: 20px; background: rgba(0,0,0,0.4);
                            border-radius: 4px; overflow: hidden;
                        ">
                            <div style="
                                width: ${char.energy}%; height: 100%;
                                background: linear-gradient(90deg, #ffaa00, #ff6600);
                                transition: width 0.3s;
                            "></div>
                        </div>
                        <p style="color: #aaa; font-size: 0.8rem; margin-top: 4px;">
                            ${char.energy} / 100
                        </p>
                    </div>
                    
                    <!-- Money -->
                    <div style="
                        background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px;
                        border-left: 3px solid ${team.primary}; margin-bottom: 20px;
                    ">
                        <p style="color: #888; font-size: 0.8rem; text-transform: uppercase;">
                            BALANCE
                        </p>
                        <p style="color: #00cc66; font-size: 1.3rem; font-weight: bold;">
                            $${char.money.balance}
                        </p>
                    </div>
                    
                    <!-- Coach approval -->
                    <div style="margin-bottom: 20px;">
                        <p style="color: #888; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 8px;">
                            COACH APPROVAL
                        </p>
                        <div style="
                            width: 100%; height: 20px; background: rgba(0,0,0,0.4);
                            border-radius: 4px; overflow: hidden;
                        ">
                            <div style="
                                width: ${char.relationships.coach_approval}%; height: 100%;
                                background: linear-gradient(90deg, #ff1a1a, #ff6600);
                            "></div>
                        </div>
                        <p style="color: #aaa; font-size: 0.8rem; margin-top: 4px;">
                            ${char.relationships.coach_approval} / 100
                        </p>
                    </div>
                    
                    <!-- Social followers -->
                    <div style="
                        background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px;
                        border-left: 3px solid #aa44ff; margin-bottom: 20px;
                    ">
                        <p style="color: #888; font-size: 0.8rem; text-transform: uppercase;">
                            SOCIAL MEDIA
                        </p>
                        <p style="color: #aa44ff; font-size: 1.3rem; font-weight: bold;">
                            ${(char.gear.social_followers / 1000).toFixed(1)}K FOLLOWERS
                        </p>
                    </div>
                </div>
                
                <!-- Right main area: Hub rooms -->
                <div style="
                    flex: 1; display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    padding: 40px;
                ">
                    <h2 style="
                        color: #fff; font-size: 2rem; margin-bottom: 40px;
                        letter-spacing: 2px; text-transform: uppercase;
                    ">City ${char.current_city}: ${this.getCityName(char.current_city)}</h2>
                    
                    <div id="hub-rooms" style="
                        display: grid; grid-template-columns: repeat(2, 1fr);
                        gap: 20px; max-width: 600px; width: 100%;
                    "></div>
                </div>
            </div>
        `;
        
        // Render hub room buttons
        const rooms = [
            { id: 'locker-room', name: 'Locker Room', icon: '👕', color: '#00a8ff' },
            { id: 'coach-office', name: "Coach's Office", icon: '🏢', color: '#ffaa00' },
            { id: 'prep-gym', name: 'Prep Gym', icon: '💪', color: '#00cc66' },
            { id: 'media-room', name: 'Media Room', icon: '📱', color: '#aa44ff' },
        ];
        
        const roomsContainer = document.getElementById('hub-rooms');
        rooms.forEach(room => {
            const btn = document.createElement('button');
            btn.className = 'interactive';
            btn.style.cssText = `
                padding: 30px; border-radius: 12px;
                background: rgba(20,30,60,0.6); border: 2px solid ${room.color};
                color: #fff; font-size: 1.2rem; font-weight: bold;
                cursor: pointer; transition: all 0.2s;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                gap: 10px;
            `;
            btn.innerHTML = `<div style="font-size: 2rem;">${room.icon}</div> ${room.name}`;
            btn.addEventListener('mouseover', () => {
                btn.style.background = `${room.color}22`;
                btn.style.boxShadow = `0 0 20px ${room.color}`;
            });
            btn.addEventListener('mouseout', () => {
                btn.style.background = 'rgba(20,30,60,0.6)';
                btn.style.boxShadow = 'none';
            });
            btn.addEventListener('click', () => {
                console.log('[HUB] Entered room:', room.id);
                UIManager.enterRoom(room.id);
            });
            roomsContainer.appendChild(btn);
        });
    },
    
    getCityName: function(cityNum) {
        const cities = ['College', 'Texas Regional', 'SEC Championship', 'Midwest Combine', 'NFL Combine'];
        return cities[cityNum - 1] || 'Unknown';
    }
```

- [ ] **Step 2: Create room entry functions**

Add this to UIManager (stub for now):

```javascript
    enterRoom: function(roomId) {
        switch(roomId) {
            case 'locker-room':
                UIManager.createLockerRoom();
                break;
            case 'coach-office':
                UIManager.createCoachOffice();
                break;
            case 'prep-gym':
                UIManager.createPrepGym();
                break;
            case 'media-room':
                UIManager.createMediaRoom();
                break;
        }
    },
    
    createLockerRoom: function() {
        console.log('[LOCKER ROOM] Placeholder');
        // To be implemented in Phase 2
    },
    
    createCoachOffice: function() {
        console.log('[COACH OFFICE] Placeholder');
        // To be implemented in Phase 2
    },
    
    createPrepGym: function() {
        console.log('[PREP GYM] Placeholder');
        // To be implemented in Phase 2
    },
    
    createMediaRoom: function() {
        console.log('[MEDIA ROOM] Placeholder');
        // To be implemented in Phase 2
    }
```

- [ ] **Step 3: Test hub loads after character creation**

Open browser → Create character flow completes → Should see Hub screen
Expected: Character info sidebar, 4 hub room buttons visible, correct city name

---

### Task 7: Create Locker Room (Daily Prep System)

**Files:**
- Modify: `public/games/gridiron-prospect.html`

- [ ] **Step 1: Replace locker room stub with full implementation**

Replace the `createLockerRoom` function:

```javascript
    createLockerRoom: function() {
        const uiLayer = document.getElementById(gameConfig.uiLayerId);
        const char = gameState.character;
        const team = AgentTeams[char.team];
        
        const decisions = [
            {
                id: 'practice',
                label: 'Practice',
                description: 'Train all skills equally',
                effects: { energy: -2, coachApproval: +2, lore: 'dedicated_athlete' }
            },
            {
                id: 'study-film',
                label: 'Study Film',
                description: 'Focus on position technique',
                effects: { energy: -1, coachApproval: +1, lore: 'focused_learner' }
            },
            {
                id: 'skip-practice',
                label: 'Skip Practice',
                description: 'Rest up and recover',
                effects: { energy: +2, coachApproval: -2, lore: 'lazy' }
            },
            {
                id: 'drink-smoke',
                label: 'Drink / Smoke',
                description: 'Social recovery, risky behavior',
                effects: { energy: +1, coachApproval: -1, socialMedia: +1, lore: 'party_guy' }
            },
            {
                id: 'hook-up',
                label: 'Hook Up',
                description: 'Seek romance',
                effects: { energy: +1, coachApproval: -2, socialMedia: +3, lore: 'player_cheater' }
            },
            {
                id: 'stream',
                label: 'Stream Live',
                description: 'Build your social media presence',
                effects: { energy: -2, coachApproval: -1, socialMedia: +3, lore: 'influencer' }
            },
            {
                id: 'rest',
                label: 'Rest / TV',
                description: 'Relax and recover',
                effects: { energy: +2, coachApproval: 0, lore: 'balanced' }
            },
        ];
        
        uiLayer.innerHTML = `
            <div style="
                position: fixed; inset: 0; z-index: 15;
                background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(20,30,60,0.95));
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                padding: 40px; overflow-y: auto;
            ">
                <button id="btn-back-to-hub" class="interactive" style="
                    position: absolute; top: 20px; left: 20px;
                    padding: 8px 16px; font-size: 0.9rem;
                    background: rgba(100,100,100,0.5); color: #fff; border: 1px solid #666;
                    border-radius: 6px; cursor: pointer;
                ">← BACK TO HUB</button>
                
                <h2 style="
                    color: ${team.primary}; font-size: 2rem;
                    margin-bottom: 10px; letter-spacing: 2px;
                ">DAILY PREP</h2>
                <p style="color: #aaa; margin-bottom: 30px;">
                    Day ${char.current_day} of ${char.days_in_city} • Choose your activity
                </p>
                
                <div id="decisions-grid" style="
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px; max-width: 900px; width: 100%;
                "></div>
            </div>
        `;
        
        // Render decision buttons
        const grid = document.getElementById('decisions-grid');
        decisions.forEach(decision => {
            const card = document.createElement('div');
            card.className = 'interactive';
            card.style.cssText = `
                padding: 20px; border-radius: 8px;
                background: rgba(20,30,60,0.6); border: 2px solid #444;
                color: #fff; cursor: pointer; transition: all 0.2s;
            `;
            card.innerHTML = `
                <h4 style="font-size: 1.1rem; margin-bottom: 8px; color: #00a8ff;">
                    ${decision.label}
                </h4>
                <p style="color: #aaa; font-size: 0.9rem; margin-bottom: 12px;">
                    ${decision.description}
                </p>
                <div style="font-size: 0.8rem; color: #ffaa00;">
                    ${decision.effects.energy > 0 ? `Energy: +${decision.effects.energy}` : `Energy: ${decision.effects.energy}`}
                    <br>
                    ${decision.effects.coachApproval !== undefined ? (decision.effects.coachApproval > 0 ? `Coach: +${decision.effects.coachApproval}` : `Coach: ${decision.effects.coachApproval}`) : ''}
                </div>
            `;
            card.addEventListener('mouseover', () => {
                card.style.background = `${team.primary}22`;
                card.style.borderColor = team.primary;
                card.style.boxShadow = `0 0 15px ${team.primary}`;
            });
            card.addEventListener('mouseout', () => {
                card.style.background = 'rgba(20,30,60,0.6)';
                card.style.borderColor = '#444';
                card.style.boxShadow = 'none';
            });
            card.addEventListener('click', () => {
                UIManager.applyDecision(decision);
            });
            grid.appendChild(card);
        });
        
        document.getElementById('btn-back-to-hub').addEventListener('click', () => {
            UIManager.createHub();
        });
    },
    
    applyDecision: function(decision) {
        const char = gameState.character;
        
        // Apply effects
        char.energy += decision.effects.energy;
        if (decision.effects.coachApproval) {
            char.relationships.coach_approval += decision.effects.coachApproval;
        }
        if (decision.effects.socialMedia) {
            char.gear.social_followers += decision.effects.socialMedia * 1000;
        }
        if (decision.effects.lore) {
            char.lore[decision.effects.lore] = (char.lore[decision.effects.lore] || 0) + 1;
        }
        
        // Clamp values
        char.energy = Math.max(0, Math.min(100, char.energy));
        char.relationships.coach_approval = Math.max(0, Math.min(100, char.relationships.coach_approval));
        
        console.log('[PREP] Decision applied:', decision.label, 'New energy:', char.energy);
        
        // Continue to next day or challenges
        char.current_day += 1;
        if (char.current_day > char.days_in_city) {
            console.log('[CITY] Days in city completed, moving to challenges');
            UIManager.createChallengeSelection();
        } else {
            UIManager.createHub();
        }
    }
```

- [ ] **Step 2: Create challenge selection screen (stub)**

Add to UIManager:

```javascript
    createChallengeSelection: function() {
        const uiLayer = document.getElementById(gameConfig.uiLayerId);
        uiLayer.innerHTML = `
            <div style="
                position: fixed; inset: 0; z-index: 15;
                display: flex; align-items: center; justify-content: center;
                background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(20,30,60,0.95));
            ">
                <h2 style="color: #fff; font-size: 2rem;">Challenge Selection - Placeholder</h2>
            </div>
        `;
        console.log('[CHALLENGES] Placeholder');
        // To be implemented in Phase 2
    }
```

- [ ] **Step 3: Test daily prep flow**

Open browser → Create character → Hub → Locker Room → Click a decision
Expected: Energy/coach approval updates, day increments, returns to hub

---

### Task 8: Create Challenge Calculation Engine

**Files:**
- Modify: `public/games/gridiron-prospect.html` (add calculation system)

- [ ] **Step 1: Add calculation utilities**

Add this code after SaveManager definition:

```javascript
// Challenge calculation engine
const ChallengeEngine = {
    calculateDifficulty: function(cityNumber) {
        const multipliers = [1.0, 1.2, 1.4, 1.6, 1.8];
        return multipliers[cityNumber - 1] || 1.8;
    },
    
    calculateChallengeScore: function(character, challengeType) {
        const difficulty = this.calculateDifficulty(character.current_city);
        let baseSkill = 0;
        let energyModifier = 1.0;
        let approvalModifier = 1.0;
        
        // Get relevant skill
        switch(challengeType) {
            case 'speed-run':
                baseSkill = character.stats.speed;
                break;
            case 'vertical-jump':
                baseSkill = character.stats.vertical_jump;
                break;
            case 'qb-throw':
                baseSkill = character.stats.qb_accuracy;
                break;
            case 'bench-press':
                baseSkill = character.stats.strength;
                break;
            case 'shuttle-run':
                baseSkill = character.stats.agility;
                break;
        }
        
        // Energy modifier
        if (character.energy < 50) {
            energyModifier = 0.7 + (character.energy / 50) * 0.3;
        }
        
        // Coach approval modifier
        if (character.relationships.coach_approval < 40) {
            approvalModifier = 0.7 + (character.relationships.coach_approval / 40) * 0.3;
        }
        
        // Confidence bonus
        const confidenceBonus = character.stats.confidence / 100;
        
        // Final formula
        const finalScore = (baseSkill + (confidenceBonus * 10)) * energyModifier * approvalModifier * difficulty;
        
        return {
            baseSkill: baseSkill,
            difficulty: difficulty,
            energyModifier: energyModifier,
            approvalModifier: approvalModifier,
            confidenceBonus: confidenceBonus,
            finalScore: Math.round(finalScore),
            pass: finalScore > 50
        };
    },
    
    skillLevelUp: function(character, skill, amount = 5) {
        if (character.stats[skill] !== undefined) {
            character.stats[skill] = Math.min(100, character.stats[skill] + amount);
            console.log(`[SKILL UP] ${skill}: +${amount} → ${character.stats[skill]}`);
        }
    }
};

console.log('[CHALLENGE ENGINE] Initialized');
```

- [ ] **Step 2: Add test function**

Add this for testing:

```javascript
// Test calculation
setTimeout(() => {
    const testChar = { ...CharacterTemplate };
    const result = ChallengeEngine.calculateChallengeScore(testChar, 'speed-run');
    console.log('[TEST] Challenge score calculation:', result);
}, 500);
```

- [ ] **Step 3: Test calculation logic**

Open browser console
Expected output:
```
[TEST] Challenge score calculation: {
  baseSkill: 50,
  difficulty: 1,
  energyModifier: 1,
  approvalModifier: 1,
  confidenceBonus: 0.5,
  finalScore: 60,
  pass: true
}
```

---

## Next Steps (Phases 2-7)

This completes **Phase 1: Foundation**. The plan continues with:

**Phase 2: Core Challenges (Tasks 9-30)** — Implement all 5 challenge minigames
**Phase 3: Narrative System (Tasks 31-45)** — Dialogue trees, cutscenes, NPC interactions
**Phase 4: Advanced Mechanics (Tasks 46-60)** — Money system, gear, relationships, lore
**Phase 5: City Progression (Tasks 61-70)** — Multi-city loop, difficulty scaling, recruitment
**Phase 6: Polish & Integration (Tasks 71-80)** — Art, sound, animations, UI refinement
**Phase 7: Testing & Deployment (Tasks 81+)** — QA, performance, Render deployment

---

## File Checklist (End of Foundation)

- ✅ `public/games/gridiron-prospect.html` — Main game file with foundation systems
- ✅ `backend/routes/gridiron-routes.js` — Backend API for saves/exports
- ✅ Character creation, naming, hub navigation
- ✅ Daily prep system with 7 decisions
- ✅ Challenge calculation engine
- ✅ Data structures for character/progression
- ✅ Save/load utilities
- ⏳ Challenge minigames (next phase)
- ⏳ Dialogue & cutscenes (next phase)
- ⏳ Money & gear systems (next phase)

---

**Foundation Complete**  
**Ready for Phase 2: Challenge Implementation**

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

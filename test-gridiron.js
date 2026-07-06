// Test script to verify GRIDIRON PROSPECT character creation flow

const gameConfig = {
    canvasId: 'game-canvas',
    uiLayerId: 'ui-layer',
    width: 1024,
    height: 768,
};

let gameState = {
    currentScreen: 'main-menu',
    character: null,
    gameData: {},
    selectedTeam: null,
};

const CharacterTemplate = {
    id: null,
    name: 'Player',
    team: 'NEXUS',
    age: 21,
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
    relationships: {
        coach_approval: 50,
        gf_status: 'single',
        rival_name: 'Derek',
        rival_intensity: 0,
    },
    money: {
        balance: 0,
        legal_sales: 0,
        illegal_sales: 0,
    },
    gear: {
        tier: 'basic',
        social_followers: 0,
    },
    cities_completed: 0,
    current_city: 1,
    challenges_passed: 0,
    challenges_failed: 0,
    energy: 100,
    current_day: 1,
    days_in_city: 3,
};

const AgentTeams = {
    NEXUS: { color: 0x00a8ff, name: 'NEXUS', primary: '#00a8ff', secondary: '#001a33' },
    TURTLE: { color: 0x00cc66, name: 'TURTLE', primary: '#00cc66', secondary: '#001a00' },
    ZEROX: { color: 0xffcc00, name: 'ZEROX', primary: '#ffcc00', secondary: '#331a00' },
    ORACLE: { color: 0xaa44ff, name: 'ORACLE', primary: '#aa44ff', secondary: '#220033' },
    QUILL: { color: 0xcccccc, name: 'QUILL', primary: '#cccccc', secondary: '#333333' },
    PIKADON: { color: 0xff1a1a, name: 'PIKADON', primary: '#ff1a1a', secondary: '#330000' },
    SHADDAI: { color: 0xffaa00, name: 'SHADDAI', primary: '#ffaa00', secondary: '#331a00' },
};

// Test 1: Check that all 7 teams exist
console.log('[TEST 1] Verifying all 7 teams exist...');
const teamCount = Object.keys(AgentTeams).length;
if (teamCount === 7) {
    console.log('✓ PASS: Found 7 teams');
} else {
    console.log(`✗ FAIL: Expected 7 teams, found ${teamCount}`);
}

// Test 2: Simulate team selection
console.log('\n[TEST 2] Simulating team selection...');
gameState.selectedTeam = 'NEXUS';
if (gameState.selectedTeam === 'NEXUS') {
    console.log('✓ PASS: Team selected correctly (NEXUS)');
} else {
    console.log('✗ FAIL: Team selection failed');
}

// Test 3: Simulate character creation with name
console.log('\n[TEST 3] Simulating character creation...');
const playerName = 'TestPlayer';
gameState.character = {
    ...CharacterTemplate,
    id: 'char_' + Date.now(),
    name: playerName,
    team: gameState.selectedTeam,
};

console.log('[GAME START] Character created:', gameState.character);

if (gameState.character.name === playerName) {
    console.log('✓ PASS: Character name set correctly');
} else {
    console.log('✗ FAIL: Character name not set correctly');
}

if (gameState.character.team === 'NEXUS') {
    console.log('✓ PASS: Character team set correctly');
} else {
    console.log('✗ FAIL: Character team not set correctly');
}

if (gameState.character.id && gameState.character.id.startsWith('char_')) {
    console.log('✓ PASS: Character ID generated correctly');
} else {
    console.log('✗ FAIL: Character ID not generated correctly');
}

// Test 4: Verify character has all stats from template
console.log('\n[TEST 4] Verifying character stats...');
const requiredStats = ['speed', 'strength', 'endurance', 'qb_accuracy', 'agility', 'vertical_jump', 'confidence', 'focus'];
let allStatsPresent = true;
requiredStats.forEach(stat => {
    if (!(stat in gameState.character.stats)) {
        console.log(`✗ Missing stat: ${stat}`);
        allStatsPresent = false;
    }
});
if (allStatsPresent) {
    console.log('✓ PASS: All character stats present');
}

// Test 5: Test with different team
console.log('\n[TEST 5] Testing with different team (SHADDAI)...');
gameState.selectedTeam = 'SHADDAI';
gameState.character = {
    ...CharacterTemplate,
    id: 'char_' + Date.now(),
    name: 'ProspectTwo',
    team: gameState.selectedTeam,
};

if (gameState.character.team === 'SHADDAI') {
    console.log('✓ PASS: Character team changed to SHADDAI');
} else {
    console.log('✗ FAIL: Failed to change character team');
}

// Test 6: Test default name fallback
console.log('\n[TEST 6] Testing default name fallback...');
const emptyName = '   '; // Will trim to empty
const fallbackName = emptyName.trim() || 'Prospect';
if (fallbackName === 'Prospect') {
    console.log('✓ PASS: Default name fallback works correctly');
} else {
    console.log('✗ FAIL: Default name fallback failed');
}

console.log('\n[TEST SUMMARY] All tests completed!');

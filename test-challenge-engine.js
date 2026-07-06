// Test script for ChallengeEngine
// This simulates the browser console tests

// Character template
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

// ChallengeEngine implementation
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

console.log('=== CHALLENGE ENGINE TEST SUITE ===\n');

// Test 1: Create test character
console.log('Test 1: Creating test character...');
const testChar = { ...CharacterTemplate };
console.log('✓ Test character created\n');

// Test 2: Calculate base challenge (no penalties)
console.log('Test 2: Base challenge (city 1, energy 100, coach approval 50)');
const result1 = ChallengeEngine.calculateChallengeScore(testChar, 'speed-run');
console.log('Result:', result1);
console.log('Expected: finalScore ~60-65, pass: true');
console.log('Actual finalScore:', result1.finalScore);
console.log('Pass:', result1.pass);
console.log('✓ Test 2 Complete\n');

// Test 3: Low energy character (50 energy)
console.log('Test 3: Energy at exactly 50 (no penalty)');
testChar.energy = 50;
const result2 = ChallengeEngine.calculateChallengeScore(testChar, 'speed-run');
console.log('Result:', result2);
console.log('Expected: finalScore ~60 (no penalty at exactly 50)');
console.log('Actual finalScore:', result2.finalScore);
console.log('Energy modifier:', result2.energyModifier);
console.log('✓ Test 3 Complete\n');

// Test 4: Low energy character (30 energy)
console.log('Test 4: Energy at 30 (with penalty)');
testChar.energy = 30;
const result3 = ChallengeEngine.calculateChallengeScore(testChar, 'speed-run');
console.log('Result:', result3);
console.log('Expected: finalScore ~48, energyModifier ~0.88');
console.log('Actual finalScore:', result3.finalScore);
console.log('Energy modifier:', result3.energyModifier);
console.log('✓ Test 4 Complete\n');

// Test 5: City 5 difficulty
console.log('Test 5: City 5 (highest difficulty)');
testChar.current_city = 5;
testChar.energy = 100;
const result4 = ChallengeEngine.calculateChallengeScore(testChar, 'speed-run');
console.log('Result:', result4);
console.log('Expected: difficulty 1.8, finalScore ~108');
console.log('Actual difficulty:', result4.difficulty);
console.log('Actual finalScore:', result4.finalScore);
console.log('✓ Test 5 Complete\n');

// Test 6: Skill level up
console.log('Test 6: Skill level up (speed +10)');
console.log('Before:', testChar.stats.speed);
ChallengeEngine.skillLevelUp(testChar, 'speed', 10);
console.log('After:', testChar.stats.speed);
console.log('Expected: speed 50 → 60');
console.log('✓ Test 6 Complete\n');

// Additional Tests

// Test 7: Difficulty multipliers for all cities
console.log('Test 7: Difficulty multipliers for cities 1-5');
for (let i = 1; i <= 5; i++) {
    const diff = ChallengeEngine.calculateDifficulty(i);
    console.log(`City ${i}: ${diff}`);
}
console.log('Expected: 1.0, 1.2, 1.4, 1.6, 1.8');
console.log('✓ Test 7 Complete\n');

// Test 8: Coach approval penalty
console.log('Test 8: Coach approval penalty (approval 30)');
testChar.current_city = 1;
testChar.energy = 100;
testChar.relationships.coach_approval = 30;
const result5 = ChallengeEngine.calculateChallengeScore(testChar, 'speed-run');
console.log('Result:', result5);
console.log('Approval modifier:', result5.approvalModifier);
console.log('Expected: approvalModifier < 1.0');
console.log('✓ Test 8 Complete\n');

// Test 9: All challenge types
console.log('Test 9: Testing all challenge types');
testChar.current_city = 1;
testChar.energy = 100;
testChar.relationships.coach_approval = 50;

const challenges = ['speed-run', 'vertical-jump', 'qb-throw', 'bench-press', 'shuttle-run'];
challenges.forEach(challenge => {
    const result = ChallengeEngine.calculateChallengeScore(testChar, challenge);
    console.log(`${challenge}: score=${result.finalScore}, pass=${result.pass}`);
});
console.log('✓ Test 9 Complete\n');

// Test 10: Stat cap at 100
console.log('Test 10: Skill level up caps at 100');
testChar.stats.speed = 95;
ChallengeEngine.skillLevelUp(testChar, 'speed', 10);
console.log('After attempting +10 to 95:', testChar.stats.speed);
console.log('Expected: 100 (capped)');
console.log('✓ Test 10 Complete\n');

console.log('=== ALL TESTS COMPLETE ===');

# GRIDIRON PROSPECT — Design Specification

**Date:** 2026-07-05  
**Project:** SHADDAI Games Suite  
**Game:** GRIDIRON PROSPECT (Character Creation & Story Progression)  
**Phase:** 1 (PROSPECT — Story/Prep/Progression. GRIDIRON PRO [actual gameplay] follows in Phase 2)

---

## Executive Summary

**GRIDIRON PROSPECT** is a narrative-driven sports progression game where players create a college football prospect and guide them through a multi-city journey to the NFL Combine. Through daily prep decisions, skill leveling, relationship tracking, and financial management, players build a character with unique stats, lore, and recruitment outcomes. The character then exports to **GRIDIRON PRO** (Phase 2) for actual football gameplay.

**Genre:** Sports RPG / Visual Novel hybrid  
**Tone:** Witty, raunchy, inspiring; consistent artistry throughout  
**Target Experience:** Character-driven narrative with meaningful consequences and branching story paths

---

## Core Vision

Players experience a **realistic, adult-oriented football prospect journey** with:
- Real cutscenes and dialogue (not text-only)
- Meaningful daily decisions that shape character and narrative
- Skill progression tied to actions
- Economic hustle (legal merch sales vs. illegal weed dealing)
- Relationship arcs (single, GF, cheater, loyal)
- Dynamic lore that emerges from choices
- Beautiful, consistent art direction across all visuals
- Witty, funny, adult humor mixed with genuine character moments

---

## Story Arc

### Act 1: College Introduction
- **Cutscene:** Arrival at college, meeting coach, rival introduction
- **First City:** College town
- **Challenge:** Introduction to all 5 challenge types (tutorial difficulty)
- **Lore Start:** Player establishes first impression (first decision tree)

### Act 2: Regional Progression
- **Cities 2-4:** Regional try-out events (e.g., Texas Regional, SEC Championship, Midwest Combine)
- **Escalating Difficulty:** Each city's challenges +20-40% harder than previous
- **Rivals & Relationships:** Multiple NPCs develop arcs (rivals trash-talk, GF drama, teammate bonds)
- **Narrative Beats:** Coach pressure, media attention, party invites, scandal opportunities
- **Cutscenes Between Cities:** NPC gossip about player behavior, player responses in interviews, relationship moments

### Act 3: NFL Combine
- **Final City:** Elite NFL Combine with celebrity judges, packed stadium
- **Elite Difficulty:** Hardest challenges, most intense competition
- **Lore Reveal:** Player overhears scouts/media discussing their reputation (Party Guy, Dedicated Athlete, Cheater, Influencer, etc.)
- **Recruitment:** Offered contract(s) based on stats + lore + social media + coach approval
- **Epilogue Cutscene:** Celebration, relationships resolved, transition to GRIDIRON PRO

---

## Core Systems

### 1. Daily Preparation Hub

**Location:** City-based hub (locker room, coach's office, team hangout, media room, gym)

**Daily Prep Flow (3-5 days per city):**
Each day, player chooses **one main activity**:

| Decision | Energy Impact | Coach Approval | Social Media | Lore Tag | Description |
|----------|---|---|---|---|---|
| **Practice** | -2 | +2 | 0 | Dedicated | Train all skills equally, +5% all skills |
| **Study Film** | -1 | +1 | 0 | Focused | Focus on QB accuracy or position-specific skill, +8% target skill |
| **Skip Practice** | +2 | -2 | 0 | Lazy | Rest day, full energy recovery |
| **Drink/Smoke** | +1 | -1 | +1 | Party Guy | Social recovery, risky behavior |
| **Hook Up** | +1 | -2 | +3 | Player/Cheater | Min energy recovery, major social boost, relationship impact |
| **Stream** | -2 | -1 | +3 | Influencer | Go live on social media, build followers, energy drain |
| **Rest/Watch TV** | +2 | 0 | 0 | Balanced | Neutral option, full recovery |

**Energy System:**
- Start each day at 100 Energy (after sleep bonus/penalty)
- Each decision consumes/generates energy
- Challenges use energy; low energy = performance penalty
- Energy regenerates overnight

**Coach Approval:**
- Tracks trust/belief in player
- Affects judge difficulty in challenges
- Low approval (< 20) = tougher judges, higher difficulty
- High approval (> 80) = supportive judges, easier difficulty

**Social Media Followers:**
- Accumulates from Stream, Hook Up, Merch sales
- Affects confidence boost (+bonus to all skills)
- High followers unlock sponsorship opportunities
- Can boost or hurt lore depending on behavior

---

### 2. Skill Leveling System

**8 Core Skills (0-100 scale):**

1. **Speed** — Sprinting capability (Speed Run challenge)
2. **Strength** — Power output (Bench Press challenge)
3. **Endurance** — Stamina (Shuttle Run challenge)
4. **QB Accuracy** — Throw precision (QB Throw challenge)
5. **Agility** — Lateral movement (Shuttle Run, footwork)
6. **Vertical Jump** — Jump height (Vertical Jump challenge)
7. **Confidence** — Mental fortitude (all challenges + lore presence)
8. **Focus** — Mental clarity (Study Film, resisting distractions)

**Leveling Mechanics:**
- Skill usage in challenges = +XP
- Relevant daily prep (Practice, Study Film) = +5-10% per use
- Alcohol/partying = -5% Focus
- Success in challenges = +Confidence
- Failure in challenges = -Confidence (short-term)

**Soft Cap:**
- Skills level quickly early (0-50), slow as they approach 100
- Max realistic skill at end: 70-85 (prevents dominant characters)

---

### 3. Narrative & Dialogue System

**Dialogue Trees at Key Moments:**
- **Media Interviews** (after major challenges, between cities)
- **Rival Encounters** (trash talk, comebacks)
- **Coach Confrontations** (performance reviews, discipline)
- **Relationship Moments** (GF drama, hookups, breakups)
- **Party Scenarios** (party invite responses, hookup opportunities)

**Dialogue Choice Examples:**

**Media Interview After Speed Run:**
- A) "I'm here to dominate" → Confident Athlete lore
- B) "Just taking it one rep at a time" → Focused Athlete lore
- C) "Yeah, living my best life out here" → Party Guy lore
- D) [Lie] "I don't feel any pressure" → Liar lore

**Rival Trash Talk:**
- A) "Bring it on" → Confident, risk of overconfidence penalty
- B) "Just focus on my game" → Focused, neutral
- C) "Whatever, see you at the Combine" → Dismissive, could escalate rivalry
- D) [Witty comeback] → Confidence boost, can backfire

**Relationship Arc (Single → GF → Cheater → Drama):**
- If Hook Up path: NPC gossip spreads, GF gets angry if exists, lore branches
- If loyal path: GF becomes supportive, unlocks bonus confidence in challenges
- Cheater path: Drama, potential coach discipline, lore darkens

**Tone Guidelines:**
- Witty banter with clever comebacks
- Adult humor (sex jokes, drinking references, party scenes)
- Genuine heartfelt moments (coach belief, family support)
- Inspiring underdog moments
- Consequences for raunchy choices (drama, lost relationships)

---

### 4. Money & Gear System

**Money Sources:**

**Legal Path: Merch Sales**
- Sell branded merchandise (t-shirts, hats, etc.)
- Earn: $100-200 per day
- Risk: None
- Lore: Influencer, entrepreneur
- Synergy: High social media followers = higher sales

**Illegal Path: Weed Dealing**
- Sell weed to other players/students
- Earn: $500-1000 per day
- Risk: Mini-game delivery (avoid security, cops, NPCs)
- Consequence if caught: Lore damage (Dealer), coach approval ↓↓, possible suspension
- Multiple catches = recruitment downgrade

**Gear Progression:**

| Tier | Cost | Skill Boost | Aesthetic | Unlock Condition |
|------|------|---|---|---|
| **Basic** | Free | 0% | Generic | Starting gear |
| **Mid-Tier** | $1000-2000 | +5% | Agent-themed colors | Buy from shop |
| **Premium** | $5000+ | +10-15% | Agent-themed design, custom patterns | High social/stats |
| **Signature** | $10000+ | +20% | Exclusive agent-themed cosmetics | Sponsorship deal or high popularity |

**Gear Customization:**
- Choose agent team skin (7 themes: NEXUS, TURTLE, ZEROX, ORACLE, QUILL, PIKADON, SHADDAI)
- Each team has color palette, design aesthetic, logo
- Gear appearance ties to team affiliation

**Money Affects:**
- What equipment/gear player can wear
- Confidence (better gear = lore confidence +1)
- Social media (sponsorships appear at high follower count + high gear tier)
- Coach approval (premium gear shows commitment, +1 approval)

---

### 5. Challenge System

**5-Challenge Sequence (Fixed Order, All Cities):**

#### Challenge 1: 40-Yard Speed Run
- **Skill Used:** Speed
- **Mechanics:** Sprint against time (timer counts down, visual animation)
- **Formula:** Base Speed × Energy Modifier × Coach Approval Modifier
- **Difficulty Scaling:** City 1 baseline (e.g., 4.8s), City 5 elite (4.2s)
- **Cutscene:** Coach yells "GO!", crowd cheers, player takes off in dramatic camera angle

#### Challenge 2: Vertical Jump Test
- **Skill Used:** Vertical Jump
- **Mechanics:** Press button at correct moment to jump (timing game)
- **Formula:** Base Vertical Jump × Timing Accuracy × Confidence Modifier
- **Difficulty:** City 1 baseline (32"), City 5 elite (42")
- **Cutscene:** Crowd reacts to jump height on scoreboard

#### Challenge 3: QB Throw / Receiver Catch
- **Skill Used:** QB Accuracy (or Agility if WR)
- **Mechanics:** Timing/aim minigame (QB spirals ball, WR catches)
- **Formula:** Base Accuracy × Distance/Difficulty × Focus Modifier
- **Difficulty:** City 1 (30 yards), City 5 (60 yards, moving receiver)
- **Cutscene:** Slow-motion catch moment, crowd roars

#### Challenge 4: Bench Press Endurance
- **Skill Used:** Strength + Focus
- **Mechanics:** Hold button in "sweet spot" window (stay in zone to rep, drop = failure)
- **Formula:** Base Strength × Reps Completed × Endurance Modifier
- **Difficulty:** City 1 (225 lbs, 10 reps), City 5 (405 lbs, 20 reps)
- **Cutscene:** Close-up of player's face, sweat dripping, crowd count chanting

#### Challenge 5: Shuttle Run
- **Skill Used:** Agility + Endurance
- **Mechanics:** Rapid button-tapping + direction changes (simulate cutting back and forth)
- **Formula:** Base Agility × Speed + Endurance Stamina Loss
- **Difficulty:** City 1 (5.2s), City 5 (4.5s)
- **Cutscene:** Wide stadium view, player sprinting, clock on screen

**Challenge Performance Formula:**
```
Final Score = (Base Skill Level + Bonuses) × Energy Modifier × Coach Approval Modifier
Bonuses:
  + Relationship Confidence (if GF supportive: +5%)
  + Social Media Confidence (per 1000 followers: +1%)
  + Gear Confidence (+0-20% based on gear tier)
  - Fatigue Penalty (if low energy: -5% per 20 energy below 50)
  - Coach Disapproval (if approval < 40: -10-30%)
  - Lore Nerves (Cheater/Dealer at Combine: -5%)
```

**Difficulty Progression:**
- **City 1 (College):** Baseline, 1 judge, tutorial tone
- **City 2-3 (Regional):** +20-30% difficulty, 2-3 judges, tougher NPC rivals
- **City 4 (Advanced):** +35-50% difficulty, celebrity judges, media watching
- **City 5 (NFL Combine):** +50-75% difficulty, elite judges, packed stadium, national media

**Cutscene Integration:**
- **Pre-Challenge:** Coach pep talk, rival taunts, crowd energy build
- **During Challenge:** Commentary from judges, real-time crowd reaction
- **Post-Challenge:** Result reveal, judge reactions, crowd cheers/boos, NPC gossip

---

### 6. Lore Emergence System

**Lore Tags (Track Throughout Game):**
- Dedicated Athlete
- Focused Learner
- Party Guy / Party Girl
- Player (cheater)
- Lazy (skipped too much)
- Influencer
- Dealer (sold weed)
- Underdog
- Villain (low coach approval, aggressive dialogue)
- Heartbreaker (relationship drama)
- Loyal
- Social Star

**Lore Mechanics:**
- Each decision adds "weight" to certain tags
- Tags accumulate silently throughout game
- **At NFL Combine:** Player hears NPCs discussing them (reputation reveal cutscene)
  - Scouts gossip: "Yeah, this guy's a party animal but he's got the tools"
  - Teammates: "He's a cheater, his girl found out during regionals"
  - Media: "This prospect has huge social media presence, might be distracted"

**Lore Reveal Cutscene (Combine Day 1):**
- Player walks through stadium, overhears conversations
- NPC dialogue reveals which tags dominated
- Game calculates primary lore archetype (weighted by tag frequency)
- Archetype affects recruitment offers and GRIDIRON PRO storyline

**Example Archetypes:**
- **Dedicated Athlete:** High skills, low social, loyal relationships
- **Party Animal:** High social, moderate skills, cheater lore, drama
- **Social Star:** High followers, medium skills, influencer lore
- **Underdog:** Started weak, high improvement, inspiring lore
- **Villain:** Low approval, aggressive, isolated, dark lore

---

### 7. Relationship Tracking

**Single/GF/Cheater Arc:**

**Single Path:**
- No committed relationship
- Hook Up decisions generate sexual encounters (non-explicit cutscenes)
- High social media, high party lore
- Recruitment: "Bachelor athlete" angle

**GF Path:**
- Develop relationship with NPC girlfriend
- Hook Up on GF path = cheater arc
- Loyal choices = supportive GF, confidence boost
- Cutscenes of date moments, relationship development
- Recruitment: "Stable, committed partner" angle

**Cheater Arc:**
- If GF exists and player Hooks Up
- GF finds out (mid-game drama cutscene)
- Coach disapproval, lore damage, relationship ends in break-up scene
- Subsequent Hook Ups are guilt-tinged
- Recruitment: "Immature, distracted" angle

**NPC Relationships:**
- Coach: Approval tracked, disappointment/pride moments
- Rival: Trash talk arcs, possible reconciliation or escalation
- Teammate(s): Support squad, can appear in cutscenes
- Cheerleaders: Party scenes, party invite storyline (R-rated banter, flirting, romance possibilities)

---

## Visual & Audio Direction

### Art Style
- **Anime + Comic Book** hybrid aesthetic
- Agent-themed color palettes (NEXUS = tech blue, TURTLE = green nature, ZEROX = gold, PIKADON = red/black, etc.)
- Detailed character models with proper anatomy (Mixamo rigged, HF FLUX anime faces overlaid)
- Consistent UI design matching game tone (witty, playful, sleek)

### Cutscene Standards
- **Cinematic camera angles** (close-ups on faces during dialogue, wide stadium shots during challenges)
- **Animated lip-sync** for dialogue (or static with text bubbles + emotes)
- **Atmospheric lighting** (stadium lights, locker room shadows, city transitions)
- **Character animations** (celebrations, disappointments, trash talk gestures)
- **In-depth character art** for NPCs (coach, rival, GF, judges, teammates)

### UI Consistency
- All menus, stats, dialogue boxes styled cohesively
- Agent team colors reflected in UI (if NEXUS, UI has blue accents)
- Witty fonts, playful borders, sports-themed icons
- Real-time social media follower counter with emoji reactions

### Audio
- Dramatic sports announcer voice-overs during challenges
- Witty dialogue voice acting (match tone: funny, adult, inspiring)
- Crowd ambience (roaring, disappointed boos, energetic chants)
- Background music per city (college town vibe → regional hype → combine prestige)

---

## Technical Architecture

### Tech Stack
- **3D Engine:** Three.js
- **Physics:** Cannon-ES (for challenge physics)
- **Asset Pipeline:**
  - Humanoids: Mixamo rigged models + HF FLUX anime face overlays
  - Gear/Uniforms: Procedurally generated per agent team
  - Environments: Sketchfab stadium, locker room, gym models
  - Textures: HF FLUX generated (custom per city/team aesthetic)
- **Hosting:** Render (same deployment as main SHADDAI dashboard)
- **Data Storage:** JSON (character saves, progression)

### Character Data Structure
```json
{
  "id": "prospect_001",
  "name": "Player Name",
  "team": "NEXUS",
  "age": 21,
  "stats": {
    "speed": 65,
    "strength": 72,
    "endurance": 58,
    "qb_accuracy": 70,
    "agility": 60,
    "vertical_jump": 64,
    "confidence": 75,
    "focus": 52
  },
  "lore": {
    "dedicated_athlete": 3,
    "party_guy": 5,
    "focused_learner": 2,
    "player": 1,
    "social_star": 4
  },
  "relationships": {
    "coach_approval": 65,
    "gf_status": "single",
    "rival_name": "Derek",
    "rival_intensity": 7
  },
  "money": {
    "balance": 4500,
    "legal_sales": 800,
    "illegal_sales": 3700
  },
  "gear": {
    "tier": "mid",
    "social_followers": 12500
  },
  "cities_completed": 3,
  "current_city": 4,
  "challenges_passed": 12,
  "challenges_failed": 2,
  "exported_to_pro": false
}
```

### Game Flow Data
```
Main Menu
  ↓
Character Creation (Choose Agent Team Skin)
  ↓
City 1 (College) [3-5 day loop]
  Daily Hub Decisions → Skills Level Up → Challenge Day → Cutscene
  ↓
City 2-4 (Regional) [repeat loop, harder]
  ↓
City 5 (NFL Combine)
  Final Challenges → Lore Reveal Cutscene → Recruitment Cutscene
  ↓
Export Character to GRIDIRON PRO
  ↓
END PROSPECT / BEGIN PRO
```

---

## Implementation Phases

### Phase 1A: Foundation (Week 1-2)
- Character creation screen (7 agent team skins)
- Basic hub navigation (locker room, coach's office, gym)
- Daily decision menu (7 options, energy/approval/lore tracking)
- Skill leveling system (mock challenge data)

### Phase 1B: Challenges & Progression (Week 2-3)
- All 5 challenge minigames built (Speed, Jump, Throw, Bench, Shuttle)
- Difficulty scaling per city
- Challenge result calculations
- City progression logic

### Phase 1C: Narrative & Cutscenes (Week 3-4)
- Dialogue trees for key moments
- Relationship tracking & cutscenes
- NPC gossip & lore reveal system
- Intro, inter-city, epilogue cutscenes

### Phase 1D: Money, Gear, Polish (Week 4-5)
- Money earning system (legal & illegal)
- Gear shop & customization
- UI polish, animations, transitions
- Asset finalization (models, textures, character art)

### Phase 2: GRIDIRON PRO (After PROSPECT launch)
- Import character data from PROSPECT
- Build actual football gameplay with imported stats
- Continue character story in PRO mode

---

## Success Criteria

- ✅ Character creation with all 7 agent team skins selectable
- ✅ Complete story progression from college → NFL Combine
- ✅ Daily prep decisions meaningfully impact stats, lore, relationships
- ✅ All 5 challenges playable with difficulty scaling
- ✅ Dialogue trees with 3+ choices per major scene
- ✅ Lore tags emerge and reveal at Combine
- ✅ Money system (legal & illegal) balanced and consequential
- ✅ Gear customization affects performance & appearance
- ✅ Cutscenes are cinematic and in-depth (not just text)
- ✅ Tone: witty, raunchy, inspiring throughout
- ✅ Character exports to GRIDIRON PRO with full data
- ✅ Runs smoothly on Render hosting

---

## Notes for Implementation

- **Writing is Critical:** Every dialogue line should be witty, memorable, or heartfelt. Hire/assign a dedicated writer.
- **Cutscene Quality:** Invest in character animation and camera work. Poor cutscenes tank the vibe.
- **Asset Reuse:** Mixamo characters + HF overlays + procedural variations keep asset load manageable.
- **Player Agency:** Every choice should *feel* consequential, even if mechanically minor.
- **Humor Balance:** Keep adult humor present but not overwhelming. Comedy should serve story, not overwhelm it.
- **Lore Subtlety:** Don't over-explain lore. Let players discover tags through NPC dialogue and context.

---

**Design Document Complete**  
**Ready for Implementation Planning**

// ORACLE Agent — Local Esoteric / Metaphysical Knowledge Base
// Self-contained, zero dependencies, no network calls. Free + fast.
// Contract: module.exports = { agent, domains, entries[], lookup(query) }

module.exports = {
  agent: 'ORACLE',
  domains: [
    'chakras', 'astrology', 'numerology', 'sacred-geometry',
    'tarot', 'moon-cycles', 'crystals', 'elements'
  ],

  entries: [
    // ───────────────────────────── CHAKRAS (7) ─────────────────────────────
    {
      keys: ['red chakra', 'root chakra', 'muladhara', 'first chakra', 'base chakra'],
      title: 'Root Chakra — Muladhara',
      text: 'The red chakra is the Root Chakra (Muladhara), located at the base of the spine. Element: Earth. Its seed mantra is LAM. It governs survival, grounding, security, and physical vitality. Balanced: stable, safe, present, and secure in the body. Blocked: fear, anxiety, financial insecurity, restlessness, and disconnection from the body.'
    },
    {
      keys: ['orange chakra', 'sacral chakra', 'svadhisthana', 'second chakra'],
      title: 'Sacral Chakra — Svadhisthana',
      text: 'The orange chakra is the Sacral Chakra (Svadhisthana), located below the navel in the lower abdomen. Element: Water. Its seed mantra is VAM. It governs emotions, creativity, pleasure, sexuality, and flow. Balanced: passionate, creative, emotionally fluid, and joyful. Blocked: guilt, emotional numbness, creative blocks, or addictive/compulsive patterns.'
    },
    {
      keys: ['yellow chakra', 'solar plexus chakra', 'manipura', 'third chakra'],
      title: 'Solar Plexus Chakra — Manipura',
      text: 'The yellow chakra is the Solar Plexus Chakra (Manipura), located above the navel at the stomach. Element: Fire. Its seed mantra is RAM. It governs personal power, will, confidence, and identity. Balanced: confident, motivated, self-disciplined, and purposeful. Blocked: low self-esteem, control issues, indecision, or domineering behavior.'
    },
    {
      keys: ['green chakra', 'heart chakra', 'anahata', 'fourth chakra'],
      title: 'Heart Chakra — Anahata',
      text: 'The green chakra is the Heart Chakra (Anahata), located at the center of the chest. Element: Air. Its seed mantra is YAM. It governs love, compassion, connection, and forgiveness, bridging the lower and upper chakras. Balanced: loving, empathetic, open, and at peace. Blocked: grief, resentment, jealousy, isolation, or difficulty giving and receiving love.'
    },
    {
      keys: ['blue chakra', 'throat chakra', 'vishuddha', 'fifth chakra'],
      title: 'Throat Chakra — Vishuddha',
      text: 'The blue chakra is the Throat Chakra (Vishuddha), located at the throat. Element: Ether/Sound (Akasha). Its seed mantra is HAM. It governs communication, truth, and self-expression. Balanced: honest, articulate, and authentic, able to speak and listen well. Blocked: fear of speaking, dishonesty, gossip, or feeling unheard and unable to express oneself.'
    },
    {
      keys: ['indigo chakra', 'third eye chakra', 'ajna', 'sixth chakra', 'brow chakra'],
      title: 'Third Eye Chakra — Ajna',
      text: 'The indigo chakra is the Third Eye Chakra (Ajna), located between the eyebrows. Element: Light. Its seed mantra is OM (AUM), also given as KSHAM. It governs intuition, insight, imagination, and perception beyond the physical. Balanced: intuitive, clear-sighted, imaginative, and wise. Blocked: confusion, cynicism, poor memory, lack of vision, or overactive fantasy detached from reality.'
    },
    {
      keys: ['violet chakra', 'purple chakra', 'crown chakra', 'sahasrara', 'seventh chakra'],
      title: 'Crown Chakra — Sahasrara',
      text: 'The violet/white chakra is the Crown Chakra (Sahasrara), located at the top of the head. Element: Thought/Cosmic consciousness. Its sound is OM or silence. It governs spirituality, higher awareness, and connection to the divine or universal consciousness. Balanced: spiritually connected, present, and unified. Blocked: disconnection, cynicism, existential emptiness, or spiritual bypassing.'
    },
    {
      keys: ['chakras', 'chakra system', 'seven chakras', '7 chakras', 'energy centers'],
      title: 'The Seven Chakras (Overview)',
      text: 'The chakra system describes seven main energy centers along the spine, each tied to a color, element, and life theme. From base to crown: Root (red/Earth), Sacral (orange/Water), Solar Plexus (yellow/Fire), Heart (green/Air), Throat (blue/Ether), Third Eye (indigo/Light), and Crown (violet/Consciousness). Energy is said to rise from grounding at the root to transcendence at the crown, and balance across all seven supports physical, emotional, and spiritual wellbeing.'
    },

    // ───────────────────────────── ZODIAC (12) ─────────────────────────────
    {
      keys: ['aries', 'ram sign'],
      title: 'Aries — The Ram',
      text: 'Aries (March 21 – April 19) is a Fire sign with Cardinal modality, ruled by Mars. The first sign of the zodiac, symbolized by the Ram. Traits: bold, energetic, pioneering, competitive, and impulsive. Aries initiates, loves a challenge, and leads with courage but can be impatient.'
    },
    {
      keys: ['taurus', 'bull sign'],
      title: 'Taurus — The Bull',
      text: 'Taurus (April 20 – May 20) is an Earth sign with Fixed modality, ruled by Venus. Symbolized by the Bull. Traits: reliable, patient, sensual, grounded, and loyal, with a love of comfort and beauty. Taurus values stability and can be stubborn or resistant to change.'
    },
    {
      keys: ['gemini', 'twins sign'],
      title: 'Gemini — The Twins',
      text: 'Gemini (May 21 – June 20) is an Air sign with Mutable modality, ruled by Mercury. Symbolized by the Twins. Traits: curious, communicative, witty, adaptable, and quick-minded. Gemini loves ideas and variety but can be restless, scattered, or indecisive.'
    },
    {
      keys: ['cancer', 'crab sign'],
      title: 'Cancer — The Crab',
      text: 'Cancer (June 21 – July 22) is a Water sign with Cardinal modality, ruled by the Moon. Symbolized by the Crab. Traits: nurturing, intuitive, protective, emotional, and home-loving. Cancer is deeply caring and loyal but can be moody or overly sensitive.'
    },
    {
      keys: ['leo', 'lion sign'],
      title: 'Leo — The Lion',
      text: 'Leo (July 23 – August 22) is a Fire sign with Fixed modality, ruled by the Sun. Symbolized by the Lion. Traits: confident, generous, warm, dramatic, and creative, with natural leadership and charisma. Leo craves recognition and can be proud or attention-seeking.'
    },
    {
      keys: ['virgo', 'maiden sign', 'virgin sign'],
      title: 'Virgo — The Maiden',
      text: 'Virgo (August 23 – September 22) is an Earth sign with Mutable modality, ruled by Mercury. Symbolized by the Maiden. Traits: analytical, practical, meticulous, helpful, and health-conscious. Virgo excels at detail and service but can be overly critical or perfectionistic.'
    },
    {
      keys: ['libra', 'scales sign'],
      title: 'Libra — The Scales',
      text: 'Libra (September 23 – October 22) is an Air sign with Cardinal modality, ruled by Venus. Symbolized by the Scales. Traits: diplomatic, charming, fair-minded, social, and aesthetic. Libra seeks harmony and partnership but can be indecisive or conflict-avoidant.'
    },
    {
      keys: ['scorpio', 'scorpion sign'],
      title: 'Scorpio — The Scorpion',
      text: 'Scorpio (October 23 – November 21) is a Water sign with Fixed modality, ruled by Pluto (traditionally Mars). Symbolized by the Scorpion. Traits: intense, passionate, magnetic, perceptive, and transformative. Scorpio is deeply loyal and probing but can be secretive, jealous, or controlling.'
    },
    {
      keys: ['sagittarius', 'archer sign'],
      title: 'Sagittarius — The Archer',
      text: 'Sagittarius (November 22 – December 21) is a Fire sign with Mutable modality, ruled by Jupiter. Symbolized by the Archer. Traits: adventurous, optimistic, philosophical, freedom-loving, and honest. Sagittarius seeks meaning and travel but can be blunt, restless, or over-committed.'
    },
    {
      keys: ['capricorn', 'goat sign', 'sea-goat'],
      title: 'Capricorn — The Sea-Goat',
      text: 'Capricorn (December 22 – January 19) is an Earth sign with Cardinal modality, ruled by Saturn. Symbolized by the Sea-Goat. Traits: disciplined, ambitious, responsible, patient, and pragmatic. Capricorn climbs steadily toward goals but can be rigid, pessimistic, or workaholic.'
    },
    {
      keys: ['aquarius', 'water bearer', 'water-bearer'],
      title: 'Aquarius — The Water-Bearer',
      text: 'Aquarius (January 20 – February 18) is an Air sign with Fixed modality, ruled by Uranus (traditionally Saturn). Symbolized by the Water-Bearer. Traits: innovative, independent, humanitarian, intellectual, and unconventional. Aquarius champions ideals and the future but can be detached or stubborn.'
    },
    {
      keys: ['pisces', 'fish sign'],
      title: 'Pisces — The Fish',
      text: 'Pisces (February 19 – March 20) is a Water sign with Mutable modality, ruled by Neptune (traditionally Jupiter). Symbolized by two Fish. Traits: compassionate, imaginative, intuitive, dreamy, and artistic. Pisces is empathic and spiritual but can be escapist, over-idealistic, or boundary-less.'
    },
    {
      keys: ['zodiac', 'zodiac signs', '12 signs', 'twelve signs', 'sun signs', 'star signs'],
      title: 'The Zodiac (Overview)',
      text: 'The zodiac is a band of twelve signs, each spanning 30° of the ecliptic. The four elements (Fire, Earth, Air, Water) each contain three signs, and the three modalities (Cardinal = initiating, Fixed = stabilizing, Mutable = adapting) each contain four. Order: Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces. Your Sun sign reflects core identity; Moon sign reflects emotions; Rising/Ascendant reflects outward persona.'
    },

    // ───────────────────────────── PLANETS ─────────────────────────────
    {
      keys: ['planets', 'planetary rulers', 'the planets', 'astrology planets'],
      title: 'The Planets in Astrology',
      text: 'In astrology the planets are archetypal forces. Sun = self, ego, vitality. Moon = emotions, instincts. Mercury = mind, communication. Venus = love, values, beauty. Mars = drive, action, desire. Jupiter = expansion, luck, wisdom. Saturn = discipline, structure, karma. Uranus = change, rebellion. Neptune = dreams, spirituality. Pluto = transformation, power. The Sun and Moon are called luminaries.'
    },
    {
      keys: ['houses', 'astrology houses', '12 houses', 'natal chart', 'birth chart', 'natal houses'],
      title: 'The 12 Houses (Natal Chart Basics)',
      text: 'A natal chart is divided into twelve houses, each a life area, determined by birth time and place. 1st = self/appearance, 2nd = money/values, 3rd = communication, 4th = home/roots, 5th = creativity/romance, 6th = work/health, 7th = partnerships, 8th = transformation/shared resources, 9th = philosophy/travel, 10th = career/reputation, 11th = community/hopes, 12th = spirituality/subconscious. Planets sitting in a house color how its themes play out.'
    },

    // ───────────────────────────── NUMEROLOGY ─────────────────────────────
    {
      keys: ['numerology', 'what is numerology', 'numbers meaning'],
      title: 'Numerology (Overview)',
      text: 'Numerology is the study of the mystical meaning of numbers. Core numbers include the Life Path (from your full birthdate), Expression/Destiny (from your full birth name), and Soul Urge (from name vowels). Most numbers reduce to a single digit 1–9, except the Master Numbers 11, 22, and 33, which are kept intact for their heightened significance.'
    },
    {
      keys: ['how to calculate life path', 'compute life path', 'calculate life path number', 'find my life path'],
      title: 'How to Calculate a Life Path Number',
      text: 'To find your Life Path, reduce each part of your birthdate to a single digit, then add those results and reduce again. Example: born 15 December 1990 → month 12 → 1+2 = 3; day 15 → 1+5 = 6; year 1990 → 1+9+9+0 = 19 → 1+9 = 10 → 1+0 = 1. Then 3 + 6 + 1 = 10 → 1+0 = 1, so Life Path 1. Stop reducing whenever you reach 11, 22, or 33 (Master Numbers), which are not reduced further.'
    },
    {
      keys: ['life path 1', 'life path number 1', 'number 1 meaning', 'numerology 1'],
      title: 'Life Path 1 — The Leader',
      text: 'Life Path 1 embodies independence, initiative, and leadership. These are pioneers and self-starters driven to originate and achieve on their own terms. Strengths: ambition, willpower, innovation. Challenges: stubbornness, ego, isolation, or fear of failure. Lesson: lead with confidence while staying open to others.'
    },
    {
      keys: ['life path 2', 'life path number 2', 'number 2 meaning', 'numerology 2'],
      title: 'Life Path 2 — The Diplomat',
      text: 'Life Path 2 embodies cooperation, sensitivity, and harmony. These are peacemakers and partners, intuitive and gifted at bringing people together. Strengths: empathy, tact, patience. Challenges: over-sensitivity, dependence, avoiding conflict. Lesson: honor your own needs while nurturing connection.'
    },
    {
      keys: ['life path 3', 'life path number 3', 'number 3 meaning', 'numerology 3'],
      title: 'Life Path 3 — The Creative Communicator',
      text: 'Life Path 3 embodies creativity, expression, and joy. These are artists, communicators, and entertainers who uplift others. Strengths: imagination, charisma, optimism. Challenges: scattered focus, superficiality, self-doubt beneath the surface. Lesson: channel expressive gifts with discipline and depth.'
    },
    {
      keys: ['life path 4', 'life path number 4', 'number 4 meaning', 'numerology 4'],
      title: 'Life Path 4 — The Builder',
      text: 'Life Path 4 embodies stability, structure, and hard work. These are the builders and organizers who create lasting foundations. Strengths: discipline, reliability, practicality. Challenges: rigidity, stubbornness, resistance to change. Lesson: build steadily while allowing flexibility and rest.'
    },
    {
      keys: ['life path 5', 'life path number 5', 'number 5 meaning', 'numerology 5'],
      title: 'Life Path 5 — The Freedom Seeker',
      text: 'Life Path 5 embodies freedom, change, and adventure. These are versatile explorers who thrive on variety and experience. Strengths: adaptability, curiosity, magnetism. Challenges: restlessness, impulsiveness, difficulty committing. Lesson: embrace freedom without losing direction or consistency.'
    },
    {
      keys: ['life path 6', 'life path number 6', 'number 6 meaning', 'numerology 6'],
      title: 'Life Path 6 — The Nurturer',
      text: 'Life Path 6 embodies responsibility, care, and service. These are natural caregivers, healers, and guardians of home and community. Strengths: compassion, loyalty, harmony. Challenges: self-sacrifice, controlling, perfectionism. Lesson: care for others without neglecting yourself.'
    },
    {
      keys: ['life path 7', 'life path number 7', 'number 7 meaning', 'numerology 7'],
      title: 'Life Path 7 — The Seeker',
      text: 'Life Path 7 embodies wisdom, introspection, and spiritual seeking. These are analysts and mystics who pursue deep truth and understanding. Strengths: insight, intuition, intellect. Challenges: isolation, skepticism, over-thinking, aloofness. Lesson: balance solitude and inner inquiry with trust and connection.'
    },
    {
      keys: ['life path 8', 'life path number 8', 'number 8 meaning', 'numerology 8'],
      title: 'Life Path 8 — The Powerhouse',
      text: 'Life Path 8 embodies ambition, authority, and material mastery. These are executives and manifestors gifted with business acumen and drive. Strengths: leadership, resilience, abundance. Challenges: workaholism, control, materialism. Lesson: wield power ethically and balance success with inner values.'
    },
    {
      keys: ['life path 9', 'life path number 9', 'number 9 meaning', 'numerology 9'],
      title: 'Life Path 9 — The Humanitarian',
      text: 'Life Path 9 embodies compassion, idealism, and universal love. These are humanitarians and old souls devoted to serving the greater good. Strengths: generosity, wisdom, artistry. Challenges: martyrdom, disappointment, difficulty letting go. Lesson: give freely while releasing attachment and honoring boundaries.'
    },
    {
      keys: ['master number 11', 'life path 11', 'number 11 meaning', 'numerology 11'],
      title: 'Master Number 11 — The Intuitive Illuminator',
      text: 'Master Number 11 is the visionary and spiritual messenger, a higher octave of the 2. It carries heightened intuition, inspiration, and sensitivity to the unseen. Strengths: illumination, idealism, psychic awareness. Challenges: anxiety, nervous tension, overwhelm from its own high voltage. Lesson: ground the vision and share its light with the world.'
    },
    {
      keys: ['master number 22', 'life path 22', 'number 22 meaning', 'numerology 22'],
      title: 'Master Number 22 — The Master Builder',
      text: 'Master Number 22 is the Master Builder, a higher octave of the 4, able to turn grand visions into concrete reality. It blends intuition with practical power to create large-scale, lasting achievements. Strengths: manifestation, discipline, leadership. Challenges: immense pressure, self-doubt, burnout. Lesson: build boldly for the collective good.'
    },
    {
      keys: ['master number 33', 'life path 33', 'number 33 meaning', 'numerology 33'],
      title: 'Master Number 33 — The Master Teacher',
      text: 'Master Number 33 is the Master Teacher, a higher octave of the 6, devoted to selfless service and unconditional love. The rarest core number, it combines the vision of 11 and the manifestation of 22 in service of humanity. Strengths: healing, compassion, spiritual uplift. Challenges: heavy burden of responsibility, self-sacrifice. Lesson: uplift others through love without losing yourself.'
    },

    // ───────────────────────────── SACRED GEOMETRY ─────────────────────────────
    {
      keys: ['flower of life', 'flower-of-life'],
      title: 'Flower of Life',
      text: 'The Flower of Life is a sacred geometric pattern of nineteen evenly spaced, overlapping circles forming a hexagonal, flower-like grid enclosed in a larger circle. Found in ancient sites worldwide, it is regarded as a blueprint of creation containing the fundamental forms of space and time. Within it can be traced the Seed of Life, Metatron\'s Cube, and the five Platonic solids.'
    },
    {
      keys: ['seed of life', 'seed-of-life'],
      title: 'Seed of Life',
      text: 'The Seed of Life is formed by seven overlapping circles of equal size — one center circle surrounded by six — creating a six-fold rosette. It symbolizes the seven days of creation and is the foundational pattern from which the Flower of Life grows. It represents the genesis of form, fertility, and the underlying order of the universe.'
    },
    {
      keys: ['metatron', 'metatrons cube', "metatron's cube"],
      title: "Metatron's Cube",
      text: "Metatron's Cube is a sacred figure derived by connecting the thirteen circles of the Fruit of Life with straight lines. Named for the archangel Metatron, it is said to contain all five Platonic solids within its structure, making it a map of the building blocks of matter. It symbolizes balance, protection, and the flow of energy through creation."
    },
    {
      keys: ['golden ratio', 'phi', 'divine proportion', 'golden mean'],
      title: 'Golden Ratio (Phi)',
      text: 'The Golden Ratio, denoted by the Greek letter Phi (φ), is approximately 1.618. Two quantities are in golden ratio when the ratio of the larger to the smaller equals the ratio of their sum to the larger. It appears throughout nature, art, and architecture — in shells, flowers, the human body, and structures like the Parthenon — and is considered a signature of natural beauty and harmony. It is closely tied to the Fibonacci sequence.'
    },
    {
      keys: ['fibonacci', 'fibonacci sequence', 'golden spiral'],
      title: 'Fibonacci Sequence',
      text: 'The Fibonacci sequence is a series where each number is the sum of the two before it: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, and so on. As the sequence grows, the ratio between consecutive numbers approaches the Golden Ratio (~1.618). Its proportions appear throughout nature — in spiral shells, sunflower seed heads, pinecones, and galaxies — reflecting an underlying pattern of growth.'
    },
    {
      keys: ['platonic solids', 'platonic solid', 'five solids'],
      title: 'The Five Platonic Solids',
      text: 'The five Platonic solids are the only convex polyhedra with identical regular faces and equal angles. Each was linked by Plato to a classical element: Tetrahedron (4 triangular faces) = Fire; Hexahedron/Cube (6 square faces) = Earth; Octahedron (8 triangular faces) = Air; Icosahedron (20 triangular faces) = Water; and Dodecahedron (12 pentagonal faces) = Ether/Cosmos. They are considered the fundamental geometric forms of matter and space.'
    },
    {
      keys: ['sacred geometry', 'geometry sacred', 'sacred-geometry'],
      title: 'Sacred Geometry (Overview)',
      text: 'Sacred geometry is the belief that geometric patterns and proportions underlie all creation and carry spiritual meaning. Core forms include the Seed and Flower of Life, Metatron\'s Cube, the Platonic solids, the Golden Ratio, the Fibonacci spiral, the Vesica Piscis, and the Sri Yantra. These patterns recur across nature, art, and sacred architecture, suggesting a unified mathematical order behind physical reality.'
    },
    {
      keys: ['vesica piscis', 'vesica'],
      title: 'Vesica Piscis',
      text: 'The Vesica Piscis is the almond-shaped (mandorla) region formed where two circles of equal radius overlap, each passing through the other\'s center. It is one of the most fundamental figures in sacred geometry — the meeting of two into one — symbolizing union, birth, and the doorway between worlds. It generates the Seed of Life and encodes key mathematical ratios.'
    },

    // ───────────────────────────── MOON PHASES ─────────────────────────────
    {
      keys: ['new moon', 'new-moon'],
      title: 'New Moon',
      text: 'The New Moon is the dark phase when the Moon sits between Earth and Sun, invisible in the sky. It marks the beginning of the lunar cycle — a time for new beginnings, planting seeds of intention, setting goals, and starting fresh. Traditional intention: initiate, dream, and plant.'
    },
    {
      keys: ['waxing crescent', 'waxing-crescent'],
      title: 'Waxing Crescent Moon',
      text: 'The Waxing Crescent appears as a slim sliver of growing light just after the New Moon. It is a time of building momentum, taking first steps, and nurturing newly set intentions. Traditional intention: commit, gather resources, and take action on your goals.'
    },
    {
      keys: ['first quarter', 'first-quarter', 'half moon waxing'],
      title: 'First Quarter Moon',
      text: 'The First Quarter Moon shows half of the Moon illuminated, halfway to full. It is a phase of decision, challenge, and perseverance, where obstacles test your commitment. Traditional intention: take decisive action, push through resistance, and adjust your course.'
    },
    {
      keys: ['waxing gibbous', 'waxing-gibbous'],
      title: 'Waxing Gibbous Moon',
      text: 'The Waxing Gibbous is more than half illuminated and still growing toward full. It is a time of refinement, patience, and fine-tuning as goals near completion. Traditional intention: review, edit, trust the process, and prepare for culmination.'
    },
    {
      keys: ['full moon', 'full-moon'],
      title: 'Full Moon',
      text: 'The Full Moon is the peak phase when the Moon is fully illuminated, opposite the Sun. It represents culmination, fruition, heightened emotion, and clarity. Traditional intention: celebrate, harvest results, release what no longer serves, and practice gratitude. Energy runs high and intuition is amplified.'
    },
    {
      keys: ['waning gibbous', 'waning-gibbous', 'disseminating moon'],
      title: 'Waning Gibbous Moon',
      text: 'The Waning Gibbous (Disseminating Moon) follows the Full Moon as light begins to decrease. It is a time of gratitude, sharing, and giving back — distributing the wisdom and results gained. Traditional intention: express thanks, teach, share, and reflect on what was learned.'
    },
    {
      keys: ['last quarter', 'third quarter', 'last-quarter', 'half moon waning'],
      title: 'Last Quarter Moon',
      text: 'The Last Quarter Moon (Third Quarter) shows the other half illuminated as the cycle wanes. It is a phase of release, forgiveness, and letting go of what no longer serves. Traditional intention: clear away, break old habits, forgive, and make space for renewal.'
    },
    {
      keys: ['waning crescent', 'waning-crescent', 'balsamic moon'],
      title: 'Waning Crescent Moon',
      text: 'The Waning Crescent (Balsamic Moon) is the final sliver before the New Moon. It is a time of rest, surrender, reflection, and spiritual retreat as the cycle completes. Traditional intention: rest, meditate, release, and prepare inwardly for the next new beginning.'
    },
    {
      keys: ['moon phases', 'moon cycle', 'lunar phases', 'lunar cycle', 'phases of the moon', 'moon-cycles', '8 phases'],
      title: 'The Eight Moon Phases (Overview)',
      text: 'The lunar cycle lasts about 29.5 days and moves through eight phases: New Moon (begin), Waxing Crescent (build), First Quarter (act), Waxing Gibbous (refine), Full Moon (culminate/release), Waning Gibbous (share gratitude), Last Quarter (let go), and Waning Crescent (rest). The waxing half (growing light) favors building and manifesting; the waning half (fading light) favors releasing and reflecting.'
    },

    // ───────────────────────────── TAROT — MAJOR ARCANA ─────────────────────────────
    {
      keys: ['the fool', 'tarot 0', 'fool card', 'major arcana 0'],
      title: 'Tarot 0 — The Fool',
      text: 'The Fool (0) represents new beginnings, innocence, spontaneity, and a leap of faith. Upright: fresh starts, adventure, trusting the journey. Reversed: recklessness, naivety, fear of the unknown. It is the seeker stepping into the unknown at the start of the Major Arcana journey.'
    },
    {
      keys: ['the magician', 'tarot 1', 'magician card', 'major arcana 1'],
      title: 'Tarot I — The Magician',
      text: 'The Magician (I) represents manifestation, willpower, skill, and resourcefulness. Upright: you have the tools to create your reality; align intention with action. Reversed: manipulation, untapped potential, or scattered energy.'
    },
    {
      keys: ['high priestess', 'tarot 2', 'priestess card', 'major arcana 2'],
      title: 'Tarot II — The High Priestess',
      text: 'The High Priestess (II) represents intuition, mystery, the subconscious, and hidden knowledge. Upright: trust your inner voice; secrets and wisdom lie beneath the surface. Reversed: disconnection from intuition, secrets withheld, or surface-level thinking.'
    },
    {
      keys: ['the empress', 'tarot 3', 'empress card', 'major arcana 3'],
      title: 'Tarot III — The Empress',
      text: 'The Empress (III) represents abundance, fertility, nurturing, and connection to nature. Upright: creativity flourishing, motherhood, sensuality, and growth. Reversed: creative block, dependence, or neglect of self-care.'
    },
    {
      keys: ['the emperor', 'tarot 4', 'emperor card', 'major arcana 4'],
      title: 'Tarot IV — The Emperor',
      text: 'The Emperor (IV) represents authority, structure, stability, and leadership. Upright: discipline, control, protection, and solid foundations. Reversed: domination, rigidity, or loss of control.'
    },
    {
      keys: ['the hierophant', 'tarot 5', 'hierophant card', 'major arcana 5'],
      title: 'Tarot V — The Hierophant',
      text: 'The Hierophant (V) represents tradition, spiritual wisdom, institutions, and conformity. Upright: guidance, education, established beliefs, and mentorship. Reversed: rebellion, unconventionality, or breaking from dogma.'
    },
    {
      keys: ['the lovers', 'tarot 6', 'lovers card', 'major arcana 6'],
      title: 'Tarot VI — The Lovers',
      text: 'The Lovers (VI) represents love, harmony, partnership, and meaningful choices. Upright: union, alignment of values, and important decisions of the heart. Reversed: disharmony, imbalance, or misaligned values.'
    },
    {
      keys: ['the chariot', 'tarot 7', 'chariot card', 'major arcana 7'],
      title: 'Tarot VII — The Chariot',
      text: 'The Chariot (VII) represents willpower, determination, control, and victory. Upright: forward momentum through focus and discipline; triumph over obstacles. Reversed: lack of direction, loss of control, or aggression.'
    },
    {
      keys: ['strength card', 'tarot 8', 'major arcana 8'],
      title: 'Tarot VIII — Strength',
      text: 'Strength (VIII) represents courage, inner power, patience, and compassion. Upright: mastering emotions and instincts through gentle strength rather than force. Reversed: self-doubt, weakness, or raw, uncontrolled emotion.'
    },
    {
      keys: ['the hermit', 'tarot 9', 'hermit card', 'major arcana 9'],
      title: 'Tarot IX — The Hermit',
      text: 'The Hermit (IX) represents introspection, solitude, inner guidance, and soul-searching. Upright: withdrawing to seek wisdom and truth within; spiritual mentorship. Reversed: isolation, loneliness, or withdrawal taken too far.'
    },
    {
      keys: ['wheel of fortune', 'tarot 10', 'wheel card', 'major arcana 10'],
      title: 'Tarot X — Wheel of Fortune',
      text: 'The Wheel of Fortune (X) represents cycles, fate, change, and turning points. Upright: good luck, destiny in motion, and life\'s natural ups and downs. Reversed: bad luck, resistance to change, or feeling stuck in a cycle.'
    },
    {
      keys: ['justice card', 'tarot 11', 'major arcana 11'],
      title: 'Tarot XI — Justice',
      text: 'Justice (XI) represents fairness, truth, law, and cause and effect. Upright: accountability, balanced decisions, and karmic consequence. Reversed: injustice, dishonesty, or avoiding responsibility.'
    },
    {
      keys: ['the hanged man', 'tarot 12', 'hanged man card', 'major arcana 12'],
      title: 'Tarot XII — The Hanged Man',
      text: 'The Hanged Man (XII) represents surrender, new perspective, pause, and letting go. Upright: gaining insight by releasing control and seeing things differently. Reversed: stalling, resistance, or needless martyrdom.'
    },
    {
      keys: ['death card', 'tarot 13', 'major arcana 13'],
      title: 'Tarot XIII — Death',
      text: 'Death (XIII) represents endings, transformation, and transition — rarely literal death. Upright: the close of one chapter making way for rebirth and renewal. Reversed: resistance to change, stagnation, or fear of letting go.'
    },
    {
      keys: ['temperance card', 'tarot 14', 'major arcana 14'],
      title: 'Tarot XIV — Temperance',
      text: 'Temperance (XIV) represents balance, moderation, patience, and harmony. Upright: blending opposites, finding the middle path, and healing integration. Reversed: imbalance, excess, or impatience.'
    },
    {
      keys: ['the devil', 'tarot 15', 'devil card', 'major arcana 15'],
      title: 'Tarot XV — The Devil',
      text: 'The Devil (XV) represents bondage, addiction, materialism, and shadow. Upright: being trapped by unhealthy attachments, fears, or temptations. Reversed: breaking free, reclaiming power, and confronting the shadow.'
    },
    {
      keys: ['the tower', 'tarot 16', 'tower card', 'major arcana 16'],
      title: 'Tarot XVI — The Tower',
      text: 'The Tower (XVI) represents sudden upheaval, revelation, and destruction of false structures. Upright: shocking change that tears down what was built on shaky ground, clearing the way for truth. Reversed: avoiding disaster, fear of change, or a slower unraveling.'
    },
    {
      keys: ['the star', 'tarot 17', 'star card', 'major arcana 17'],
      title: 'Tarot XVII — The Star',
      text: 'The Star (XVII) represents hope, faith, renewal, and inspiration. Upright: healing, serenity, and renewed optimism after hardship; a guiding light. Reversed: despair, discouragement, or loss of faith.'
    },
    {
      keys: ['the moon card', 'tarot 18', 'moon tarot', 'major arcana 18'],
      title: 'Tarot XVIII — The Moon',
      text: 'The Moon (XVIII) represents illusion, intuition, dreams, and the subconscious. Upright: uncertainty, hidden truths, fears, and the need to trust intuition through the fog. Reversed: releasing fear, clarity emerging, or confusion lifting.'
    },
    {
      keys: ['the sun card', 'tarot 19', 'sun tarot', 'major arcana 19'],
      title: 'Tarot XIX — The Sun',
      text: 'The Sun (XIX) represents joy, success, vitality, and positivity. Upright: happiness, warmth, confidence, and radiant success; one of the most favorable cards. Reversed: temporary gloom, blocked joy, or unrealistic optimism.'
    },
    {
      keys: ['judgement card', 'judgment card', 'tarot 20', 'major arcana 20'],
      title: 'Tarot XX — Judgement',
      text: 'Judgement (XX) represents awakening, reckoning, rebirth, and calling. Upright: a moment of reflection and renewal, rising to a higher purpose and answering an inner call. Reversed: self-doubt, refusal of the call, or harsh self-judgment.'
    },
    {
      keys: ['the world card', 'tarot 21', 'world tarot', 'major arcana 21'],
      title: 'Tarot XXI — The World',
      text: 'The World (XXI) represents completion, fulfillment, wholeness, and accomplishment. Upright: the successful end of a journey, integration, and achievement; the cycle comes full circle. Reversed: incompletion, delays, or seeking closure.'
    },
    {
      keys: ['major arcana', 'tarot major arcana', 'the major arcana'],
      title: 'Tarot — The Major Arcana (Overview)',
      text: 'The Major Arcana is a set of 22 trump cards (0–21) charting "The Fool\'s Journey" — the soul\'s path through major life lessons and spiritual milestones, from The Fool (0) to The World (21). Each card marks an archetypal stage of growth. In a reading, Major Arcana cards signal significant, karmic, or life-defining themes, as opposed to the everyday matters of the Minor Arcana.'
    },
    {
      keys: ['tarot suits', 'minor arcana', 'four suits tarot', 'tarot elements', 'wands cups swords pentacles'],
      title: 'Tarot — The Four Suits (Minor Arcana)',
      text: 'The Minor Arcana has 56 cards in four suits, each tied to an element and life area. Wands = Fire (passion, energy, ambition, creativity). Cups = Water (emotions, love, relationships, intuition). Swords = Air (thought, intellect, conflict, truth). Pentacles/Coins = Earth (money, work, body, material world). Each suit runs Ace through Ten plus four court cards (Page, Knight, Queen, King).'
    },

    // ───────────────────────────── CRYSTALS ─────────────────────────────
    {
      keys: ['clear quartz', 'quartz crystal', 'master healer'],
      title: 'Clear Quartz',
      text: 'Clear Quartz is known as the "Master Healer" and the most versatile crystal. It amplifies energy, intention, and other stones, and is used for clarity, focus, and cleansing. It can be programmed for any purpose and is associated with the Crown chakra and all-around balance.'
    },
    {
      keys: ['amethyst', 'purple quartz'],
      title: 'Amethyst',
      text: 'Amethyst is a violet variety of quartz prized for spiritual protection, intuition, and calm. It soothes the mind, aids meditation and sleep, and eases anxiety and overwhelm. It resonates with the Third Eye and Crown chakras and is a stone of serenity and higher awareness.'
    },
    {
      keys: ['rose quartz', 'love stone'],
      title: 'Rose Quartz',
      text: 'Rose Quartz is the "Stone of Unconditional Love," a soft pink quartz that opens the Heart chakra. It promotes self-love, compassion, emotional healing, and harmony in relationships. It gently dissolves grief and resentment, inviting tenderness and trust.'
    },
    {
      keys: ['citrine', 'yellow crystal', 'merchants stone'],
      title: 'Citrine',
      text: 'Citrine is a golden-yellow quartz known as the "Merchant\'s Stone" and a crystal of abundance. It attracts prosperity, success, confidence, and joy, and dispels negativity. It energizes the Solar Plexus chakra, supporting willpower, creativity, and manifestation.'
    },
    {
      keys: ['black tourmaline', 'tourmaline'],
      title: 'Black Tourmaline',
      text: 'Black Tourmaline is a premier grounding and protection stone. It shields against negative energy, EMFs, and psychic attack while anchoring you to the earth. Associated with the Root chakra, it promotes stability, safety, and a calm, centered nervous system.'
    },
    {
      keys: ['selenite', 'satin spar'],
      title: 'Selenite',
      text: 'Selenite is a luminous white crystal named for the Moon goddess Selene. It is used for cleansing, clearing energy, and charging other crystals, and it needs no cleansing itself. Connected to the Crown chakra, it promotes clarity, peace, and connection to higher realms. Note: it is water-soluble and should be kept dry.'
    },
    {
      keys: ['black obsidian', 'obsidian'],
      title: 'Obsidian',
      text: 'Obsidian is a volcanic glass and a powerful protective, grounding stone. It shields against negativity and draws out hidden truths and emotional blockages, acting as a mirror to the shadow self. It supports the Root chakra and deep, honest inner work.'
    },
    {
      keys: ['tigers eye', "tiger's eye", 'tiger eye'],
      title: "Tiger's Eye",
      text: 'Tiger\'s Eye is a golden-brown banded stone of courage, confidence, and willpower. It grounds while energizing, sharpening focus and decision-making and dispelling fear and self-doubt. It resonates with the Solar Plexus and Root chakras, promoting balanced personal power.'
    },
    {
      keys: ['lapis lazuli', 'lapis'],
      title: 'Lapis Lazuli',
      text: 'Lapis Lazuli is a deep blue stone flecked with gold pyrite, prized since antiquity for wisdom and truth. It stimulates the Throat and Third Eye chakras, enhancing communication, intuition, and inner insight. It encourages honesty, self-expression, and spiritual awareness.'
    },
    {
      keys: ['carnelian', 'orange crystal'],
      title: 'Carnelian',
      text: 'Carnelian is a fiery orange-red stone of vitality, courage, and passion. It ignites creativity, motivation, and sensuality, and restores drive and confidence. Linked to the Sacral chakra, it supports action, warmth, and the free flow of creative and sexual energy.'
    },
    {
      keys: ['green aventurine', 'aventurine', 'luck stone'],
      title: 'Green Aventurine',
      text: 'Green Aventurine is the "Stone of Opportunity," considered one of the luckiest crystals for prosperity and new ventures. It opens the Heart chakra, soothes emotions, and promotes optimism, growth, and confidence. It is often carried to attract luck, abundance, and fresh chances.'
    },
    {
      keys: ['moonstone', 'rainbow moonstone'],
      title: 'Moonstone',
      text: 'Moonstone is a shimmering stone of intuition, feminine energy, and new beginnings. Tied to lunar cycles, it enhances emotional balance, intuition, and psychic receptivity, and supports fertility and inner growth. It connects to the Crown and Third Eye chakras and is a companion for reflection and change.'
    },
    {
      keys: ['labradorite', 'stone of magic'],
      title: 'Labradorite',
      text: 'Labradorite is a mystical, iridescent stone known as the "Stone of Magic" and transformation. It awakens intuition, psychic abilities, and imagination while shielding the aura from energy leaks. Associated with the Third Eye and Throat chakras, it is a stone of synchronicity and inner discovery.'
    },
    {
      keys: ['hematite', 'iron stone'],
      title: 'Hematite',
      text: 'Hematite is a metallic, iron-rich stone of grounding and protection. It anchors scattered energy, promotes focus and stability, and absorbs negativity. Connected to the Root chakra, it supports courage, willpower, and a calm, centered sense of security.'
    },
    {
      keys: ['fluorite', 'rainbow fluorite'],
      title: 'Fluorite',
      text: 'Fluorite is a multicolored stone of mental clarity, focus, and order. It clears confusion, enhances concentration and learning, and cleanses the aura of chaotic energy. Often called the "Genius Stone," it supports the Third Eye chakra and structured, clear thinking.'
    },
    {
      keys: ['crystals', 'healing crystals', 'crystal healing', 'gemstones'],
      title: 'Crystals (Overview)',
      text: 'Crystals are used in metaphysical practice for their unique energetic properties, each associated with intentions, chakras, and elements. Common all-purpose stones include Clear Quartz (amplify), Amethyst (calm/intuition), Rose Quartz (love), Citrine (abundance), and Black Tourmaline (protection). Crystals are typically cleansed (e.g., with moonlight, selenite, or smoke), charged, and programmed with intention before use.'
    },

    // ───────────────────────────── CLASSICAL ELEMENTS ─────────────────────────────
    {
      keys: ['earth element', 'element earth'],
      title: 'The Element of Earth',
      text: 'Earth is the element of stability, grounding, and the material world. Qualities: cold and dry; practical, patient, and enduring. It rules the body, wealth, growth, and the physical realm. Zodiac: Taurus, Virgo, Capricorn. Direction: North. Tarot suit: Pentacles. Platonic solid: Cube. It corresponds to sensation, security, and manifestation.'
    },
    {
      keys: ['water element', 'element water'],
      title: 'The Element of Water',
      text: 'Water is the element of emotion, intuition, and the subconscious. Qualities: cold and moist; flowing, receptive, and healing. It rules feelings, dreams, love, and purification. Zodiac: Cancer, Scorpio, Pisces. Direction: West. Tarot suit: Cups. Platonic solid: Icosahedron. It corresponds to depth, empathy, and the psychic realm.'
    },
    {
      keys: ['fire element', 'element fire'],
      title: 'The Element of Fire',
      text: 'Fire is the element of energy, passion, and transformation. Qualities: hot and dry; active, dynamic, and willful. It rules drive, courage, creativity, and change. Zodiac: Aries, Leo, Sagittarius. Direction: South. Tarot suit: Wands. Platonic solid: Tetrahedron. It corresponds to spirit, action, and the life force.'
    },
    {
      keys: ['air element', 'element air'],
      title: 'The Element of Air',
      text: 'Air is the element of intellect, communication, and the mind. Qualities: hot and moist; light, mobile, and connective. It rules thought, ideas, speech, and social exchange. Zodiac: Gemini, Libra, Aquarius. Direction: East. Tarot suit: Swords. Platonic solid: Octahedron. It corresponds to clarity, reason, and inspiration.'
    },
    {
      keys: ['spirit element', 'element spirit', 'ether', 'aether', 'akasha', 'fifth element'],
      title: 'The Element of Spirit (Ether/Akasha)',
      text: 'Spirit — also called Ether, Aether, or Akasha — is the fifth element that unites and transcends the other four. It represents consciousness, the divine, and the unseen life force connecting all things. Direction: Center/Above. Platonic solid: Dodecahedron. It corresponds to the soul, universal energy, and the bridge between the physical and spiritual.'
    },
    {
      keys: ['elements', 'classical elements', 'four elements', 'five elements', 'the elements'],
      title: 'The Classical Elements (Overview)',
      text: 'The classical elements are the building blocks of nature in Western esoteric tradition: Earth (stability/body), Water (emotion/intuition), Fire (energy/will), and Air (intellect/communication), unified by a fifth, Spirit/Ether (consciousness). Each maps to zodiac signs, tarot suits, directions, Platonic solids, and qualities of hot/cold and moist/dry. Balancing the elements within oneself is a core aim of many spiritual and magical practices.'
    }
  ],

  // Keyword-match query against entries; return best {title,text} or null.
  lookup(query) {
    if (!query || typeof query !== 'string') return null;

    const stop = new Set([
      'the', 'a', 'an', 'of', 'is', 'are', 'what', 'whats', 'what\'s', 'me',
      'tell', 'about', 'my', 'i', 'to', 'in', 'on', 'for', 'and', 'or',
      'please', 'can', 'you', 'explain', 'meaning', 'mean', 'means', 'do',
      'does', 'how', 'whos', 'who', 'which', 'that', 'this', 'with', 'it'
    ]);

    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();

    const q = norm(query);
    if (!q) return null;
    const qWords = q.split(' ').filter((w) => w && !stop.has(w));
    if (qWords.length === 0) return null;
    const qWordSet = new Set(qWords);

    let best = null;
    let bestScore = 0;

    for (const entry of this.entries) {
      let score = 0;

      // 1) Full key phrase appears in the query (strongest signal).
      for (const key of entry.keys) {
        const k = norm(key);
        if (!k) continue;
        if (q.includes(k)) {
          // weight longer, multi-word phrase matches higher
          score += 10 + k.split(' ').length * 4;
        }
      }

      // 2) Individual key words overlapping with query words.
      const keyWords = new Set();
      for (const key of entry.keys) {
        for (const w of norm(key).split(' ')) {
          if (w && !stop.has(w)) keyWords.add(w);
        }
      }
      for (const w of keyWords) {
        if (qWordSet.has(w)) score += 3;
      }

      // 3) Title words overlapping with query words.
      for (const w of norm(entry.title).split(' ')) {
        if (w && !stop.has(w) && qWordSet.has(w)) score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    // Require a meaningful match (a real key-word hit, not a single stray token).
    if (!best || bestScore < 3) return null;
    return { title: best.title, text: best.text };
  }
};

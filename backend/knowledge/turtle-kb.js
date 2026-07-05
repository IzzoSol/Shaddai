// turtle-kb.js — Local, self-contained design/creative knowledge base for the TURTLE agent.
// No external APIs, no network. Free to run. CommonJS module.

const entries = [
  // ---------- COLOR THEORY FUNDAMENTALS ----------
  {
    keys: ['color wheel', 'colour wheel', 'color theory', 'colour theory', 'wheel'],
    title: 'The Color Wheel',
    text: 'The color wheel is a circular arrangement of hues that shows relationships between colors, first formalized by Isaac Newton. It organizes primary, secondary, and tertiary colors around the circle so that opposite and adjacent relationships (used to build schemes) are easy to see. Modern digital design typically uses the RGB/HSL wheel, while traditional painting uses the RYB wheel. Use it to reason about harmony, contrast, and temperature.'
  },
  {
    keys: ['primary colors', 'primary colours', 'primary'],
    title: 'Primary Colors',
    text: 'Primary colors are the base hues that cannot be mixed from other colors. In traditional (RYB) painting they are red, yellow, and blue; in additive light (RGB) they are red, green, and blue; in print (CMY) they are cyan, magenta, and yellow. All other colors on the wheel are derived by mixing primaries.'
  },
  {
    keys: ['secondary colors', 'secondary colours', 'secondary'],
    title: 'Secondary Colors',
    text: 'Secondary colors are made by mixing two primaries in equal parts. In RYB these are orange (red+yellow), green (yellow+blue), and purple (blue+red). They sit halfway between their parent primaries on the color wheel.'
  },
  {
    keys: ['tertiary colors', 'tertiary colours', 'tertiary', 'intermediate colors'],
    title: 'Tertiary Colors',
    text: 'Tertiary colors are created by mixing a primary with an adjacent secondary, producing hues like red-orange, yellow-orange, yellow-green, blue-green, blue-violet, and red-violet. They fill the gaps between primary and secondary colors, giving the wheel its full 12-hue spectrum. Their two-part names always list the primary first.'
  },
  {
    keys: ['warm colors', 'cool colors', 'warm vs cool', 'color temperature', 'temperature'],
    title: 'Warm vs Cool Colors',
    text: 'Warm colors (reds, oranges, yellows) evoke energy, passion, and appear to advance toward the viewer; cool colors (blues, greens, purples) feel calm, distant, and appear to recede. Temperature helps establish mood and depth: warm foregrounds and cool backgrounds create a natural sense of space. Balancing warm and cool tones keeps a composition from feeling either aggressive or lifeless.'
  },
  {
    keys: ['hue saturation value', 'hsv', 'hsl', 'hue', 'saturation', 'value', 'brightness', 'lightness'],
    title: 'Hue, Saturation, Value (HSV/HSL)',
    text: 'Hue is the pure color identity (its position on the wheel, 0-360 degrees). Saturation is the intensity or purity of the color, from gray (0%) to fully vivid (100%). Value/brightness (HSV) or lightness (HSL) is how light or dark the color is. Thinking in HSL is far more intuitive for adjusting palettes than editing raw RGB, because you tweak one perceptual property at a time.'
  },
  {
    keys: ['tint shade tone', 'tint', 'shade', 'tone'],
    title: 'Tints, Shades, and Tones',
    text: 'A tint is a hue mixed with white (lighter, softer); a shade is a hue mixed with black (darker, deeper); a tone is a hue mixed with gray (muted, more sophisticated). Building a palette from tints/shades/tones of one hue gives cohesion. Tones in particular read as mature and premium because pure saturated color can feel cheap or juvenile.'
  },
  {
    keys: ['rgb', 'additive color', 'additive'],
    title: 'RGB / Additive Color',
    text: 'RGB is the additive color model used by screens: red, green, and blue light combine to make colors, and all three at full intensity make white. It is device-dependent and defined per-channel from 0-255 (or 0-1). Web colors are typically written as hex (#RRGGBB) which is just RGB in hexadecimal.'
  },
  {
    keys: ['cmyk', 'subtractive color', 'print color', 'subtractive'],
    title: 'CMYK / Subtractive Color',
    text: 'CMYK (cyan, magenta, yellow, key/black) is the subtractive model used in print: inks absorb (subtract) light, and layering them approaches black. Colors that glow on an RGB screen can look duller in CMYK, so always soft-proof designs before printing. The K channel adds true black and saves colored ink.'
  },

  // ---------- COLOR SCHEMES ----------
  {
    keys: ['monochromatic', 'monochrome', 'mono scheme', 'single hue'],
    title: 'Monochromatic Color Scheme',
    text: 'A monochromatic scheme uses a single hue varied by saturation and value (its tints, tones, and shades). It is the safest, most elegant scheme — inherently harmonious and easy to make cohesive. Use it for minimalist, sophisticated, or focused designs; add a single accent color if it feels too flat.'
  },
  {
    keys: ['analogous', 'analogous scheme', 'adjacent colors'],
    title: 'Analogous Color Scheme',
    text: 'Analogous schemes use three to five hues that sit next to each other on the wheel (e.g., blue, blue-green, green). They feel calm, natural, and cohesive since the colors share undertones. Pick one hue to dominate, a second to support, and a third as accent. Great for serene, organic, or nature-inspired designs.'
  },
  {
    keys: ['complementary', 'complementary scheme', 'opposite colors', 'complement'],
    title: 'Complementary Color Scheme',
    text: 'Complementary schemes pair two hues directly opposite on the wheel (e.g., blue & orange, red & green, purple & yellow). The high contrast is vibrant and attention-grabbing, ideal for making a call-to-action or focal point pop. Use one color dominantly and the complement sparingly as an accent; equal amounts can vibrate uncomfortably. Never place saturated complements as thin text on each other.'
  },
  {
    keys: ['split complementary', 'split-complementary', 'split complement'],
    title: 'Split-Complementary Color Scheme',
    text: 'A split-complementary scheme takes a base hue plus the two colors adjacent to its complement (e.g., blue with yellow-orange and red-orange). It keeps strong contrast but is softer and less jarring than a pure complementary pair, giving more nuance. This is a reliable, versatile choice for beginners who want vibrancy with less risk of clashing.'
  },
  {
    keys: ['triadic', 'triad scheme', 'three colors', 'triad'],
    title: 'Triadic Color Scheme',
    text: 'A triadic scheme uses three hues evenly spaced around the wheel (120 degrees apart), such as red-yellow-blue or orange-green-purple. It is vibrant and balanced even when the colors are pale or unsaturated. Let one color dominate and use the other two for accents to avoid a chaotic, circus-like look. Popular in playful, energetic, brand-forward designs.'
  },
  {
    keys: ['tetradic', 'double complementary', 'rectangle scheme', 'square scheme', 'tetrad'],
    title: 'Tetradic (Double-Complementary) Color Scheme',
    text: 'A tetradic scheme uses four hues arranged as two complementary pairs (a rectangle or square on the wheel). It offers the richest variety but is the hardest to balance — usually let one color dominate and mind the warm/cool balance. Best for complex designs that need multiple distinct color zones, like dashboards or illustration-heavy layouts.'
  },
  {
    keys: ['achromatic', 'grayscale', 'neutral scheme'],
    title: 'Achromatic Scheme',
    text: 'An achromatic scheme uses only blacks, whites, and grays (no hue). It reads as timeless, editorial, and highly legible, and it forces hierarchy through value and typography alone. Add a single restrained accent hue to create a modern, high-focus look often used in premium tech branding.'
  },

  // ---------- NAMED PALETTES / HEX EXAMPLES ----------
  {
    keys: ['neon palette', 'cyberpunk palette', 'cyberpunk', 'neon', 'synthwave'],
    title: 'Neon / Cyberpunk Palette',
    text: 'A neon/cyberpunk mood pairs saturated electric hues against a near-black base for maximum glow. Example: background #0D0221, magenta #FF2E97, cyan #00F0FF, electric purple #B537F2, and lime accent #C6FF00. Keep the dark base dominant and use neons only as accents/glows so the eye is not overwhelmed. Add subtle bloom/box-shadow to sell the neon effect.'
  },
  {
    keys: ['pastel palette', 'pastel', 'soft palette', 'candy colors'],
    title: 'Pastel Palette',
    text: 'Pastels are high-value, low-saturation tints that feel gentle, friendly, and youthful. Example: blush #FFD1DC, mint #B5EAD7, powder blue #C7CEEA, butter #FFF1B5, lavender #E0BBE4. They work for wellness, kids, and lifestyle brands; pair with a soft charcoal (#4A4A4A) rather than pure black for text to keep the softness. Beware low contrast — verify legibility.'
  },
  {
    keys: ['earthy palette', 'earth tones', 'natural palette', 'organic palette', 'earthy'],
    title: 'Earthy / Natural Palette',
    text: 'Earthy palettes draw from soil, clay, foliage, and stone for a grounded, organic, artisanal feel. Example: terracotta #C1622F, olive #6B705C, sand #DDBEA9, moss #588157, deep brown #3A2E24. Ideal for sustainable, handmade, or heritage brands. Lean on muted tones and warm neutrals rather than bright saturation.'
  },
  {
    keys: ['corporate palette', 'corporate', 'professional palette', 'business colors', 'saas palette'],
    title: 'Corporate / Professional Palette',
    text: 'Corporate palettes favor trust and clarity: a confident blue anchor, neutral grays, and a single energetic accent. Example: primary #1A73E8, navy #0B2545, slate gray #64748B, light gray #F1F5F9, accent #FF6B35. Blue dominates because it signals stability and competence; the warm accent drives attention to CTAs. Keep it restrained — 1 primary, 1 accent, and a neutral scale.'
  },
  {
    keys: ['high contrast dark ui', 'dark ui', 'dark mode palette', 'dark theme', 'dark dashboard'],
    title: 'High-Contrast Dark UI Palette',
    text: 'Dark UIs should avoid pure black (#000) — use a slightly lifted charcoal to reduce eye strain and smearing. Example: surface #121212 / #1E1E1E, elevated #2A2A2A, primary text #EAEAEA, secondary text #A0A0A0, accent #4F9CFF, success #3DD68C, danger #FF5C5C. Maintain at least 4.5:1 contrast for body text; use elevation via lighter surfaces (not shadows) to signal layering.'
  },
  {
    keys: ['luxury palette', 'premium palette', 'gold palette', 'elegant palette'],
    title: 'Luxury / Premium Palette',
    text: 'Luxury palettes combine deep neutrals with metallic accents and generous negative space. Example: black #0A0A0A, off-white #F5F3EF, deep emerald #14452F or burgundy #5E2028, and gold #C9A227. Restraint signals premium — few colors, high contrast, refined serif type, and lots of whitespace. Avoid many saturated hues, which read as budget.'
  },
  {
    keys: ['material design palette', 'material colors', 'material'],
    title: 'Material Design Color System',
    text: 'Google Material uses a primary and secondary color each with tonal ranges (50-900), plus surface/background/error roles and "on" colors for text placed on them. It codifies elevation, state layers, and accessible contrast. Adopt its role-based naming (primary, on-primary, surface, on-surface) even outside Material for a systematic palette.'
  },

  // ---------- COLOR PSYCHOLOGY ----------
  {
    keys: ['color psychology red', 'red meaning', 'red color', 'red'],
    title: 'Color Psychology: Red',
    text: 'Red signals energy, passion, urgency, danger, and appetite. It raises arousal and draws the eye faster than any other hue, which is why it drives sale banners, CTAs, and error/alert states. Use sparingly — too much red feels aggressive or alarming. Culturally it can mean luck and prosperity (China) or warning (West).'
  },
  {
    keys: ['color psychology blue', 'blue meaning', 'blue color', 'blue'],
    title: 'Color Psychology: Blue',
    text: 'Blue conveys trust, calm, competence, and stability — the reason it dominates finance, tech, and healthcare branding. It is the most universally liked color and lowers perceived stress. The downside is that blue can feel cold or corporate and suppresses appetite, so it is rarely used for food.'
  },
  {
    keys: ['color psychology green', 'green meaning', 'green color', 'green'],
    title: 'Color Psychology: Green',
    text: 'Green represents nature, growth, health, wealth, and permission ("go"). It is restful for the eye and signals sustainability and balance, making it ideal for wellness, finance ("money"), and eco brands. Darker greens read as affluent and traditional; bright greens read as fresh and energetic.'
  },
  {
    keys: ['color psychology yellow', 'yellow meaning', 'yellow gold', 'gold meaning', 'yellow', 'gold'],
    title: 'Color Psychology: Yellow & Gold',
    text: 'Yellow evokes optimism, warmth, and attention — it is the most visible color and great for highlights, but overuse causes fatigue and anxiety. Gold specifically connotes luxury, success, achievement, and premium quality (medals, trophies, high-end brands). Pair gold with deep neutrals (black, navy, emerald) to maximize its richness.'
  },
  {
    keys: ['color psychology purple', 'purple meaning', 'violet', 'purple'],
    title: 'Color Psychology: Purple',
    text: 'Purple historically signaled royalty, luxury, and rarity (the dye was once costly), and it now also connotes creativity, spirituality, and imagination. It blends the calm of blue with the energy of red. Deep purples feel regal and premium; lighter lavenders feel gentle and whimsical.'
  },
  {
    keys: ['color psychology black', 'black meaning', 'black color', 'black'],
    title: 'Color Psychology: Black',
    text: 'Black conveys sophistication, power, luxury, and authority, and it maximizes contrast for legibility. It is the backbone of premium, fashion, and minimalist branding. Too much black can feel heavy or ominous, so balance it with generous whitespace and a single accent. In UI, prefer near-black charcoal over pure #000.'
  },
  {
    keys: ['color psychology white', 'white meaning', 'white color', 'white', 'orange meaning', 'orange'],
    title: 'Color Psychology: White & Orange',
    text: 'White signals purity, simplicity, cleanliness, and space — it is the essential breathing room of modern design and reads as honest and minimal. Orange is friendly, energetic, and playful, combining red\'s urgency with yellow\'s warmth; it works well for approachable CTAs and creative brands without red\'s aggression. Both are strong accent choices against neutral backgrounds.'
  },
  {
    keys: ['color psychology pink', 'pink meaning', 'pink color', 'brown meaning', 'brown', 'pink'],
    title: 'Color Psychology: Pink & Brown',
    text: 'Pink ranges from playful and youthful (hot pink) to gentle and romantic (blush); it is increasingly used gender-neutrally in modern branding. Brown communicates earthiness, reliability, warmth, and craftsmanship — common in coffee, leather, and organic brands. Both benefit from careful saturation control to avoid feeling either saccharine or drab.'
  },

  // ---------- CONTRAST & ACCESSIBILITY ----------
  {
    keys: ['wcag contrast', 'contrast ratio', 'accessibility contrast', 'aa aaa', 'wcag', 'a11y'],
    title: 'WCAG Contrast Ratios (AA / AAA)',
    text: 'WCAG measures contrast as a ratio from 1:1 (none) to 21:1 (black on white). For normal text, AA requires 4.5:1 and AAA requires 7:1; for large text (18pt+/14pt bold+), AA requires 3:1 and AAA requires 4.5:1. UI components and graphical objects need at least 3:1. These thresholds ensure readability for low-vision users and in poor lighting — always test, since color pickers lie about perceived contrast.'
  },
  {
    keys: ['color blindness', 'colorblind', 'color accessibility', 'deuteranopia', 'protanopia'],
    title: 'Designing for Color Blindness',
    text: 'About 8% of men and 0.5% of women have some color-vision deficiency, most commonly red-green (deuteranopia/protanopia). Never rely on color alone to convey meaning — pair it with text, icons, patterns, or position (e.g., a red error should also say "Error" and show an icon). Avoid red/green as the only differentiator; blue/orange pairs are far safer.'
  },
  {
    keys: ['contrast why', 'why contrast', 'visual contrast', 'contrast importance'],
    title: 'Why Contrast Matters',
    text: 'Contrast is the difference in luminance, color, or size that makes elements distinguishable; it is the primary tool for legibility and hierarchy. Sufficient contrast lets users read text, find CTAs, and scan structure quickly, and it is a legal accessibility requirement in many contexts (ADA, EN 301 549). Low contrast is the single most common real-world accessibility failure. Aim for clear steps between background, surface, and text.'
  },
  {
    keys: ['60 30 10 rule', 'palette proportion', 'color proportion', 'dominant accent'],
    title: 'The 60-30-10 Rule',
    text: 'The 60-30-10 rule balances a palette by proportion: 60% dominant/background color, 30% secondary color, and 10% accent for emphasis and CTAs. This ratio keeps compositions calm and directs the eye to what matters. It maps cleanly to a neutral base, a supporting brand hue, and a punchy accent.'
  },

  // ---------- TYPOGRAPHY ----------
  {
    keys: ['serif vs sans', 'serif sans-serif', 'serif', 'sans serif', 'typeface classification'],
    title: 'Serif vs Sans-Serif',
    text: 'Serifs are the small feet on letter strokes; serif typefaces (Georgia, Times, Merriweather) feel traditional, authoritative, and editorial and can aid readability in long print text. Sans-serif faces (Helvetica, Inter, Roboto) feel modern, clean, and neutral and are the default for screens and UI. A common pairing is a serif for headlines and a sans for body, or vice versa, to create contrast.'
  },
  {
    keys: ['type hierarchy', 'typographic hierarchy', 'font hierarchy', 'heading hierarchy', 'type scale'],
    title: 'Typographic Hierarchy',
    text: 'Hierarchy guides the reader through content using differences in size, weight, color, and spacing so the eye knows what to read first. Establish a type scale (e.g., a modular ratio like 1.25 or 1.333) for consistent step sizes between H1, H2, body, and captions. Limit levels to what you need — usually 3-5 — and reinforce hierarchy with weight and whitespace, not size alone.'
  },
  {
    keys: ['leading line height', 'leading', 'line height', 'line spacing'],
    title: 'Leading (Line Height)',
    text: 'Leading is the vertical space between lines of text. For body copy, 1.4-1.6x the font size is comfortable; tighter leading suits large headlines, looser leading suits long-form reading. Too little leading makes lines collide and hurts scanning; too much breaks the sense of a paragraph as one block. Line length (measure) of 45-75 characters pairs with good leading for readability.'
  },
  {
    keys: ['font pairing', 'typeface pairing', 'pairing fonts', 'combining fonts'],
    title: 'Font Pairing',
    text: 'Good pairings balance contrast and harmony: combine typefaces that differ clearly (e.g., a serif display with a sans body) but share proportions or era so they feel intentional. A safe formula is one characterful display face plus one neutral, highly legible workhorse. Limit a design to two, at most three, families and vary weight/size for the rest of the hierarchy.'
  },
  {
    keys: ['kerning tracking', 'kerning', 'tracking', 'letter spacing'],
    title: 'Kerning & Tracking',
    text: 'Kerning adjusts space between specific letter pairs (e.g., "AV") to correct awkward gaps; tracking adjusts uniform spacing across a whole word or line. Tighten tracking slightly on large headlines and loosen it on all-caps or small labels for legibility. Poor kerning in logos and headlines is one of the most visible amateur mistakes.'
  },
  {
    keys: ['font weight', 'typeface weight', 'bold regular light', 'weight'],
    title: 'Font Weight',
    text: 'Weight (thin, light, regular, medium, semibold, bold, black) is a powerful, subtle hierarchy tool that often beats changing size. Use bolder weights for emphasis and headings, and keep body text at regular or medium for comfortable reading. Avoid overly thin weights for small body text, especially on screens, where they fail contrast and legibility.'
  },
  {
    keys: ['readability legibility', 'readability', 'legibility'],
    title: 'Readability vs Legibility',
    text: 'Legibility is how easily individual characters are distinguished (a property of the typeface); readability is how easily blocks of text are read (a property of typesetting — size, leading, measure, contrast). A legible font can still be unreadable if set too tightly or with poor contrast. Optimize both: pick a clear face, then set it with comfortable size, spacing, and line length.'
  },

  // ---------- LAYOUT / UX PRINCIPLES ----------
  {
    keys: ['grid system', 'grid layout', 'columns grid', 'grid', 'baseline grid'],
    title: 'Grid Systems',
    text: 'A grid divides a layout into columns, gutters, and margins to create alignment, rhythm, and consistency. The common web grid is 12 columns because it divides evenly into halves, thirds, and quarters. Grids speed decisions, keep responsive layouts coherent, and make a design feel ordered; break the grid intentionally, and rarely, for emphasis. A baseline grid aligns text across columns.'
  },
  {
    keys: ['whitespace negative space', 'whitespace', 'white space', 'negative space', 'breathing room'],
    title: 'Whitespace (Negative Space)',
    text: 'Whitespace is the empty area around and between elements; it is an active design tool, not wasted space. Generous spacing improves comprehension, focus, and perceived quality (premium brands use lots of it) and groups related items through proximity. Micro-whitespace (between lines/letters) affects legibility; macro-whitespace (between blocks) affects structure and mood. When in doubt, add more space, not more elements.'
  },
  {
    keys: ['visual hierarchy', 'hierarchy', 'focal point', 'emphasis'],
    title: 'Visual Hierarchy',
    text: 'Visual hierarchy arranges elements so the eye perceives their order of importance, using size, color, contrast, position, and whitespace. Establish one clear focal point per view, then guide the eye through secondary and tertiary elements. Without hierarchy everything competes and nothing is seen; with it, users grasp the message in seconds.'
  },
  {
    keys: ['gestalt principles', 'gestalt', 'proximity similarity closure', 'perception principles'],
    title: 'Gestalt Principles',
    text: 'Gestalt principles describe how the mind groups visual elements into wholes: Proximity (close items feel related), Similarity (alike items group), Closure (we complete incomplete shapes), Continuity (the eye follows lines/curves), Figure-Ground (we separate subject from background), and Common Fate (items moving together group). Designers use these to organize information without explicit borders. Proximity and similarity are the most useful for laying out UI.'
  },
  {
    keys: ['f pattern z pattern', 'f pattern', 'z pattern', 'reading pattern', 'scanning pattern'],
    title: 'F-Pattern & Z-Pattern Reading',
    text: 'Eye-tracking shows users scan text-heavy pages in an F-pattern — two horizontal sweeps near the top, then a vertical scan down the left. Sparse, visual layouts (landing pages, posters) are scanned in a Z-pattern from top-left to top-right, then diagonally to bottom-left and across to bottom-right. Place logos, key messages, and CTAs along these paths, and front-load important words at the start of lines.'
  },
  {
    keys: ['alignment', 'align elements', 'edge alignment'],
    title: 'Alignment',
    text: 'Alignment creates a clean, ordered look by lining elements to shared edges or a center axis; every element should have a visual connection to something else. Left-alignment is most readable for body text in left-to-right languages; centered text suits short headings but hurts long paragraphs. Strong, consistent alignment is the fastest way to make a rough layout look professional.'
  },
  {
    keys: ['balance symmetry', 'balance', 'symmetry', 'asymmetry', 'visual weight'],
    title: 'Balance & Visual Weight',
    text: 'Balance is the distribution of visual weight (size, color, density) across a composition. Symmetrical balance feels formal, stable, and classic; asymmetrical balance feels dynamic and modern while still resting the eye. Large, dark, saturated, or complex elements carry more weight and must be counterbalanced. An unbalanced layout feels like it is tipping over.'
  },
  {
    keys: ['contrast repetition proximity', 'crap principles', 'design principles', 'contrast repetition alignment proximity'],
    title: 'C.R.A.P. Design Principles',
    text: 'C.R.A.P. (from Robin Williams\' "The Non-Designer\'s Design Book") is a memorable core: Contrast (make different things clearly different), Repetition (repeat styles to unify), Alignment (connect elements on shared lines), and Proximity (group related items). Applying just these four fixes most amateur layouts. They complement Gestalt and hierarchy principles.'
  },
  {
    keys: ['rule of thirds', 'thirds', 'composition grid'],
    title: 'Rule of Thirds',
    text: 'The rule of thirds divides a frame into a 3x3 grid; placing key subjects along the lines or at their intersections creates more dynamic, balanced compositions than dead-centering. Borrowed from photography, it applies to hero images, cards, and poster layouts. It is a guideline, not a law — break it deliberately for symmetry or tension.'
  },
  {
    keys: ['visual flow', 'directional cues', 'eye flow', 'leading lines'],
    title: 'Visual Flow & Directional Cues',
    text: 'Visual flow is the path the eye travels through a design; you steer it with size, contrast, whitespace, leading lines, and cues like arrows or a subject\'s gaze. Good flow ends at the primary action (often a CTA). Map the intended journey — hero, value prop, proof, action — then reinforce it with hierarchy and spacing.'
  },

  // ---------- DESIGN SYSTEMS ----------
  {
    keys: ['design system', 'design systems', 'component library', 'design language'],
    title: 'Design Systems',
    text: 'A design system is a single source of truth pairing reusable components (buttons, forms, cards) with the standards, tokens, and documentation that govern them. It ensures consistency, speeds delivery, and lets teams scale without reinventing UI. Well-known examples include Google Material, IBM Carbon, and Shopify Polaris. It is more than a UI kit — it includes principles, code, and governance.'
  },
  {
    keys: ['design tokens', 'tokens', 'style tokens', 'design variables'],
    title: 'Design Tokens',
    text: 'Design tokens are named, platform-agnostic variables that store design decisions — colors, spacing, type sizes, radii, shadows (e.g., color-primary-500, space-4). They decouple decisions from implementation so a single change propagates everywhere and supports theming (light/dark, brands). Tokens are the atomic foundation of a scalable design system.'
  },
  {
    keys: ['atomic design', 'atoms molecules organisms', 'brad frost', 'atomic'],
    title: 'Atomic Design',
    text: 'Atomic Design (Brad Frost) structures interfaces hierarchically: atoms (buttons, inputs, labels), molecules (a search field = input + button), organisms (a header), templates (page skeletons), and pages (real content). This mental model encourages reusable, composable components and a clear component hierarchy. It pairs naturally with component libraries and design tokens.'
  },
  {
    keys: ['spacing scale', 'spacing system', '8pt grid', '8 point grid', 'spacing'],
    title: 'Spacing Scale (8-Point Grid)',
    text: 'A spacing scale defines a consistent set of gaps (commonly multiples of 8: 4, 8, 16, 24, 32, 48, 64) used for margins, padding, and gaps. The 8-point grid keeps rhythm consistent, aligns cleanly across screen densities, and removes arbitrary pixel guessing. Consistent spacing is one of the strongest signals of a polished, systematic design.'
  },
  {
    keys: ['style guide', 'brand guidelines', 'brand book'],
    title: 'Style Guide / Brand Guidelines',
    text: 'A style guide documents a brand\'s visual and verbal rules: logo usage, color palette with values, typography, imagery style, spacing, and voice/tone. It keeps output consistent across teams, vendors, and time. A living style guide is often part of the broader design system rather than a static PDF.'
  },
  {
    keys: ['responsive design', 'responsive', 'breakpoints', 'mobile first', 'adaptive'],
    title: 'Responsive Design',
    text: 'Responsive design adapts layouts to any screen using fluid grids, flexible images, and CSS media-query breakpoints. Mobile-first means designing for the smallest screen first, then progressively enhancing for larger ones — this forces content prioritization. Common breakpoints cluster around ~640, 768, 1024, and 1280px, but base them on where your content breaks, not specific devices.'
  },
  {
    keys: ['accessibility ux', 'accessible design', 'inclusive design', 'a11y ux', 'wcag principles'],
    title: 'Accessibility (Inclusive Design)',
    text: 'Accessible design ensures products work for people with visual, motor, auditory, and cognitive differences. WCAG organizes this under POUR: Perceivable, Operable, Understandable, Robust. Practical musts: sufficient color contrast, keyboard navigation, focus states, alt text, semantic structure, adequate touch targets (44x44px), and not relying on color alone. Accessibility improves usability for everyone.'
  },

  // ---------- MISC PRACTICAL ----------
  {
    keys: ['iconography icons', 'icon design', 'icons', 'iconography'],
    title: 'Iconography',
    text: 'Icons communicate quickly and save space, but only when consistent in style (stroke width, corner radius, filled vs outline), grid, and metaphor. Keep them recognizable and pair unfamiliar icons with labels to avoid ambiguity. Use a single icon set across a product for cohesion, and size them to align with your type and spacing scales.'
  },
  {
    keys: ['imagery photography style', 'imagery', 'photography', 'image treatment', 'art direction'],
    title: 'Imagery & Art Direction',
    text: 'Consistent imagery — a defined mood, color grade, subject style, and treatment — is a major driver of brand feel. Decide on rules (e.g., natural light, warm grade, real people vs illustration) and apply them everywhere. Ensure sufficient contrast between text and images with overlays or scrims, and always provide meaningful alt text.'
  },
  {
    keys: ['motion animation ux', 'animation', 'motion design', 'microinteractions', 'transitions'],
    title: 'Motion & Microinteractions',
    text: 'Motion should be purposeful: it guides attention, communicates state changes, and shows spatial relationships (where things come from and go). Keep UI transitions fast (150-300ms) with natural easing (ease-out for entering, ease-in for leaving) and respect prefers-reduced-motion. Subtle microinteractions (button feedback, loading states) add delight; excessive animation distracts and slows users.'
  },
  {
    keys: ['affordance signifier', 'affordance', 'signifier', 'discoverability'],
    title: 'Affordances & Signifiers',
    text: 'An affordance is a possible action an object offers (a button can be pressed); a signifier is the cue that communicates it (its raised, shadowed, colored look). Good UI makes interactive elements obviously interactive and non-interactive elements obviously not. Flat design can hurt discoverability when signifiers (hover states, shadows, underlines) are removed.'
  },
  {
    keys: ['fitts law', "fitts's law", 'target size', 'click distance'],
    title: "Fitts's Law",
    text: "Fitts's Law states that the time to reach a target depends on its size and distance: bigger, closer targets are faster and easier to hit. Make primary buttons large and place them where the cursor/thumb already is; screen edges and corners are effectively infinite-size targets. This is why key CTAs are big and important mobile actions sit within thumb reach."
  },
  {
    keys: ['hicks law', "hick's law", 'choice overload', 'too many options'],
    title: "Hick's Law",
    text: "Hick's Law says decision time increases with the number and complexity of choices. Reduce cognitive load by limiting options, grouping/categorizing them, using progressive disclosure, and highlighting a recommended default. This is why simple onboarding, focused nav, and one clear primary action outperform cluttered interfaces."
  },
  {
    keys: ['jakobs law', "jakob's law", 'convention familiarity', 'ui conventions'],
    title: "Jakob's Law",
    text: "Jakob's Law: users spend most of their time on other sites, so they expect yours to work the same way. Follow established conventions (logo top-left links home, cart top-right, underlined links) rather than inventing novel patterns for common tasks. Innovate on your unique value, not on standard interactions."
  },
  {
    keys: ['visual consistency', 'consistency', 'ui consistency', 'pattern consistency'],
    title: 'Consistency',
    text: 'Consistency — reusing the same patterns, components, colors, and language — reduces the learning curve and builds trust. Internal consistency keeps a product coherent with itself; external consistency aligns with platform and industry norms so users feel instantly familiar. Inconsistency makes interfaces feel buggy and unprofessional even when everything technically works.'
  },
  {
    keys: ['golden ratio', 'golden section', 'divine proportion', 'phi'],
    title: 'Golden Ratio',
    text: 'The golden ratio (~1.618, phi) is a proportion found in nature and classical art that many designers use for pleasing scale relationships in layouts, type scales, and spacing. Applied to a type scale, each step multiplies by ~1.618 for dramatic hierarchy. Treat it as one tool among many — it is a helpful starting proportion, not a magic rule.'
  },
  {
    keys: ['cta button design', 'call to action', 'cta', 'button design'],
    title: 'Call-to-Action (Button) Design',
    text: 'A CTA must be the highest-contrast, most obvious element in its view, with clear affordance (looks clickable) and action-oriented label. Use your accent color, ample padding, and place it along the natural reading path (end of Z/F flow). Have one primary CTA per view; make secondary actions visually quieter (outline or ghost buttons) so the priority is unmistakable.'
  },
  {
    keys: ['visual noise clutter', 'clutter', 'visual noise', 'simplicity', 'minimalism'],
    title: 'Reducing Visual Clutter',
    text: 'Clutter comes from too many competing elements, colors, fonts, and borders. Reduce it by increasing whitespace, grouping with proximity instead of boxes, limiting the palette and type styles, and removing anything that does not serve the goal. The principle "everything in the design should be there for a reason" keeps interfaces calm and scannable.'
  },
  {
    keys: ['dark mode design', 'dark mode', 'light mode', 'theming'],
    title: 'Dark Mode Design',
    text: 'Dark mode is not just inverted colors: avoid pure black and pure white, desaturate colors slightly (bright saturated hues vibrate on dark), and convey elevation with lighter surfaces rather than shadows. Reduce large white areas that cause glare, and re-check contrast, since ratios differ from light mode. Offer both themes and respect the OS preference.'
  }
];

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function lookup(query) {
  const q = normalize(query);
  if (!q) return null;
  const qWords = q.split(' ').filter(w => w.length > 1);
  if (!qWords.length) return null;

  let best = null;
  let bestScore = 0;

  for (const entry of entries) {
    let score = 0;
    // Key matches are strongest
    for (const key of entry.keys) {
      const k = normalize(key);
      if (!k) continue;
      if (q.includes(k)) score += 6 + k.split(' ').length; // full key phrase present
      const kWords = k.split(' ');
      for (const kw of kWords) {
        if (qWords.includes(kw)) score += 2;
      }
    }
    // Title word matches
    const titleWords = normalize(entry.title).split(' ');
    for (const tw of titleWords) {
      if (tw.length > 1 && qWords.includes(tw)) score += 2;
    }
    // Light body-word matches (weak) to break ties
    const textNorm = normalize(entry.text);
    for (const qw of qWords) {
      if (qw.length > 3 && textNorm.includes(qw)) score += 0.25;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best || bestScore < 2) return null;
  return { title: best.title, text: best.text };
}

module.exports = {
  agent: 'TURTLE',
  domains: [
    'color theory', 'color schemes', 'color psychology', 'palettes',
    'contrast & accessibility', 'typography', 'layout & UX principles',
    'gestalt', 'design systems', 'design tokens', 'responsive design'
  ],
  entries,
  lookup
};

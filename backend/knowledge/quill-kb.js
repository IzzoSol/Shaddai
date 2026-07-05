// quill-kb.js — Local, self-contained writing/communication knowledge base for the QUILL agent.
// No external APIs, no network. Free to run. CommonJS module.

const entries = [
  // ---------- GRAMMAR: PARTS OF SPEECH ----------
  {
    keys: ['parts of speech', 'noun verb adjective', 'word classes', 'grammar basics'],
    title: 'The Parts of Speech',
    text: 'English words fall into eight traditional parts of speech: nouns (people, places, things, ideas), pronouns (I, she, it, they), verbs (actions or states of being), adjectives (describe nouns), adverbs (describe verbs, adjectives, or other adverbs), prepositions (in, on, between — show relationships), conjunctions (and, but, because — join words/clauses), and interjections (oh, wow). Many words shift class by role: "book" is a noun in "read a book" but a verb in "book a flight." Knowing a word\'s function, not just its dictionary label, is what lets you diagnose and fix a sentence.'
  },
  {
    keys: ['noun', 'nouns', 'proper noun', 'common noun', 'collective noun'],
    title: 'Nouns',
    text: 'A noun names a person, place, thing, or idea. Common nouns (city, dog) are general and lowercase; proper nouns (Chicago, Rover) name specific entities and are capitalized. Collective nouns (team, staff, jury) name a group and usually take a singular verb in American English ("the team is winning"). Concrete nouns are perceivable by the senses; abstract nouns (freedom, courage) are concepts.'
  },
  {
    keys: ['verb', 'verbs', 'action verb', 'linking verb', 'transitive intransitive'],
    title: 'Verbs',
    text: 'A verb expresses an action (run, decide) or a state of being (is, seem). Transitive verbs take a direct object ("she threw the ball"); intransitive verbs do not ("she slept"). Linking verbs (be, become, seem, feel) connect a subject to a description rather than showing action. Strong, specific verbs ("sprint," "demolish") carry more meaning than weak verb-plus-adverb pairs ("run quickly").'
  },
  {
    keys: ['adjective', 'adjectives', 'adverb', 'adverbs', 'modifiers'],
    title: 'Adjectives & Adverbs',
    text: 'Adjectives modify nouns ("a bright idea"); adverbs modify verbs, adjectives, or other adverbs and often (not always) end in -ly ("she spoke softly"). A common error is using an adjective where an adverb is needed: say "drive safely," not "drive safe." Lean on strong nouns and verbs first; piling on modifiers is usually a sign the core words are too weak.'
  },
  {
    keys: ['pronoun', 'pronouns', 'antecedent', 'who whom', 'pronoun agreement'],
    title: 'Pronouns & Agreement',
    text: 'A pronoun stands in for a noun (its antecedent) and must agree with it in number and, where relevant, gender. Ambiguous reference confuses readers: "Sam told Alex he was late" — who was late? Singular "they" is now widely accepted for an unknown or nonbinary individual. Use "who" for a subject (who called?) and "whom" for an object (to whom did you speak?).'
  },
  {
    keys: ['preposition', 'prepositions', 'conjunction', 'conjunctions', 'coordinating conjunction'],
    title: 'Prepositions & Conjunctions',
    text: 'Prepositions (in, on, under, between, before) show relationships of place, time, or direction and always introduce a phrase ending in a noun/pronoun object. Coordinating conjunctions (the FANBOYS: for, and, nor, but, or, yet, so) join equal grammatical elements; subordinating conjunctions (because, although, while, if) attach a dependent clause to a main one. It is perfectly fine in modern usage to end a sentence with a preposition when doing so reads naturally.'
  },

  // ---------- GRAMMAR: CONFUSED PAIRS ----------
  {
    keys: ['its vs its', "its it's", 'its its apostrophe', 'possessive its'],
    title: "Its vs. It's",
    text: '"Its" is the possessive form ("the company changed its logo"); "it\'s" is a contraction of "it is" or "it has" ("it\'s raining"). The trick: if you can substitute "it is" and the sentence still works, use "it\'s." Possessive "its" has no apostrophe, matching other possessive pronouns like "hers" and "theirs," which never take one.'
  },
  {
    keys: ['their there theyre', 'their there', 'theyre', 'there vs their'],
    title: "Their vs. There vs. They're",
    text: '"Their" shows possession ("their house"). "There" refers to a place or is an existential subject ("over there," "there is a problem"). "They\'re" is a contraction of "they are" ("they\'re leaving"). Test with substitution: if "they are" fits, use "they\'re"; if you can point to a location, use "there"; otherwise it is likely "their."'
  },
  {
    keys: ['your youre', 'your vs youre', "you're your"],
    title: "Your vs. You're",
    text: '"Your" is possessive ("your idea"); "you\'re" is a contraction of "you are" ("you\'re right"). If "you are" can replace the word, choose "you\'re." This is one of the most visible errors in professional writing, so it is worth a deliberate check.'
  },
  {
    keys: ['affect vs effect', 'affect effect', 'affect', 'effect'],
    title: 'Affect vs. Effect',
    text: 'Usually, "affect" is a verb meaning to influence ("the delay affected sales"), and "effect" is a noun meaning the result ("the effect was costly"). The mnemonic RAVEN helps: Remember, Affect = Verb, Effect = Noun. Exceptions exist — "effect" can be a verb meaning to bring about ("effect change"), and "affect" can be a noun in psychology (emotional expression) — but the common case covers nearly all writing.'
  },
  {
    keys: ['then vs than', 'then than', 'than then'],
    title: 'Than vs. Then',
    text: '"Than" is used for comparisons ("faster than light"); "then" refers to time or sequence ("first we test, then we ship"). If you are comparing two things, use "than"; if you are describing when or what comes next, use "then." They are not interchangeable despite the one-letter difference.'
  },
  {
    keys: ['who vs that', 'who that which', 'that vs which', 'restrictive nonrestrictive'],
    title: 'That vs. Which (and Who)',
    text: 'Use "that" for restrictive clauses essential to meaning, with no comma ("the report that we filed was late"). Use "which" for nonrestrictive clauses that add extra, removable information, set off by commas ("the report, which was 40 pages, was late"). Use "who" (not "that") to refer to people in careful writing. The comma test: if the clause can be dropped without changing the core meaning, use "which" and commas.'
  },
  {
    keys: ['fewer vs less', 'fewer less', 'less fewer'],
    title: 'Fewer vs. Less',
    text: 'Use "fewer" for countable items ("fewer emails, fewer bugs") and "less" for uncountable quantities ("less time, less water"). "Ten items or fewer" is technically correct over "ten items or less." A simple test: if you can put a number in front of it, use "fewer."'
  },
  {
    keys: ['ie vs eg', 'i.e. e.g.', 'that is for example', 'ie eg'],
    title: 'i.e. vs. e.g.',
    text: '"i.e." (id est) means "that is" and introduces a clarification or restatement ("ship it Friday, i.e., before the weekend"). "e.g." (exempli gratia) means "for example" and introduces a non-exhaustive list ("bring snacks, e.g., chips or fruit"). Both are typically followed by a comma in American style. When in doubt, write out "that is" or "for example" for clarity.'
  },
  {
    keys: ['lay vs lie', 'lay lie', 'lie lay'],
    title: 'Lay vs. Lie',
    text: '"Lay" is transitive and needs an object ("lay the book down"); "lie" is intransitive and takes no object ("I need to lie down"). The confusion peaks in the past tense: the past of "lie" is "lay" ("yesterday I lay down"), while the past of "lay" is "laid" ("she laid the book down"). Ask whether something is receiving the action (lay) or doing it on its own (lie).'
  },

  // ---------- VOICE & SENTENCE MECHANICS ----------
  {
    keys: ['active vs passive voice', 'active passive', 'passive voice', 'active voice'],
    title: 'Active vs. Passive Voice',
    text: 'In active voice the subject performs the action ("the team shipped the feature"); in passive voice the subject receives it ("the feature was shipped by the team"). Active voice is usually shorter, clearer, and more direct — it names who did what, so prefer it by default. Passive voice is legitimate when the actor is unknown, unimportant, or deliberately de-emphasized ("the server was compromised"), or to keep a consistent topic. Spot passive by looking for a form of "to be" plus a past participle, often with a "by ..." phrase.'
  },
  {
    keys: ['subject verb agreement', 'agreement', 'singular plural verb'],
    title: 'Subject-Verb Agreement',
    text: 'A verb must agree in number with its subject: singular subjects take singular verbs ("the report is ready"), plural subjects take plural verbs ("the reports are ready"). Watch out for words between subject and verb ("the box of parts is heavy" — box is the subject, not parts) and for tricky subjects like "each," "everyone," and "neither," which are singular. Compound subjects joined by "and" are usually plural.'
  },
  {
    keys: ['sentence fragment', 'fragment', 'incomplete sentence'],
    title: 'Sentence Fragments',
    text: 'A fragment is an incomplete sentence missing a subject, a verb, or a complete thought ("Because we were late." — a dependent clause left dangling). Fix it by attaching it to a nearby independent clause or adding the missing element. Fragments can be used deliberately for punch in marketing copy, but in most professional writing they read as errors.'
  },
  {
    keys: ['run on sentence', 'run-on', 'comma splice', 'fused sentence'],
    title: 'Run-Ons & Comma Splices',
    text: 'A run-on (fused sentence) jams two independent clauses together with no punctuation ("It failed we shipped anyway"). A comma splice joins them with only a comma ("It failed, we shipped anyway"). Fix either with a period, a semicolon, or a comma plus a coordinating conjunction ("It failed, so we shipped anyway"). Each independent clause needs proper separation.'
  },
  {
    keys: ['parallelism', 'parallel structure', 'parallel construction'],
    title: 'Parallel Structure',
    text: 'Parallelism means expressing elements of equal importance in the same grammatical form, especially in lists and comparisons: "we design, build, and ship" (not "we design, building, and shipment"). Parallel structure makes sentences rhythmic, balanced, and easier to parse. Check every list and every "not only ... but also" pair for matching forms.'
  },
  {
    keys: ['dangling modifier', 'misplaced modifier', 'dangling participle'],
    title: 'Dangling & Misplaced Modifiers',
    text: 'A modifier must clearly attach to the word it describes. A dangling modifier has nothing logical to modify ("Walking to work, the rain started" — the rain was not walking); fix it by naming the actor ("Walking to work, I got caught in the rain"). A misplaced modifier sits next to the wrong word ("she served cake to the kids on paper plates" — were the kids on plates?). Place modifiers next to what they modify.'
  },
  {
    keys: ['sentence variety', 'sentence length', 'rhythm', 'varying sentences'],
    title: 'Sentence Variety & Rhythm',
    text: 'Vary sentence length and structure to create rhythm and hold attention. A run of same-length sentences feels monotonous; mixing short, punchy lines with longer, flowing ones controls pace and emphasis. A short sentence after several long ones lands hard — use it for your key point. Read your writing aloud to hear where the rhythm stalls.'
  },

  // ---------- PUNCTUATION ----------
  {
    keys: ['comma rules', 'comma', 'commas', 'when to use commas'],
    title: 'The Comma',
    text: 'Commas separate elements to prevent confusion. Core uses: before a coordinating conjunction joining two independent clauses ("We tested, and it passed"); after an introductory phrase ("After the demo, we shipped"); around nonrestrictive clauses; between items in a series; and to set off nonessential asides. The comma is the most overused and underused mark — insert it where a natural pause aids meaning, not by reflex.'
  },
  {
    keys: ['oxford comma', 'serial comma', 'oxford serial'],
    title: 'The Oxford (Serial) Comma',
    text: 'The Oxford comma is the comma before the final "and" or "or" in a list of three or more ("red, white, and blue"). It prevents ambiguity — "to my parents, Ayn Rand and God" reads very differently with a comma after "Rand." AP style omits it; Chicago and most book/academic styles keep it. Pick one convention and apply it consistently across a document.'
  },
  {
    keys: ['semicolon', 'semi-colon', 'when to use semicolon'],
    title: 'The Semicolon',
    text: 'A semicolon links two closely related independent clauses without a conjunction ("The build failed; the deploy was cancelled"). It also separates items in a list when those items already contain commas ("Austin, TX; Reno, NV; and Miami, FL"). Think of it as stronger than a comma but softer than a period. Do not use it to attach a fragment — both sides must be able to stand alone.'
  },
  {
    keys: ['colon', 'when to use colon', 'colon punctuation'],
    title: 'The Colon',
    text: 'A colon introduces something that follows — a list, an explanation, a quotation, or an emphatic statement ("We need three things: speed, clarity, and trust"). The clause before a colon should be a complete sentence; do not split a verb from its objects with one ("we need: speed, clarity" is wrong). A colon can also join two independent clauses when the second explains or amplifies the first.'
  },
  {
    keys: ['em dash', 'em-dash', 'dash', 'en dash', 'hyphen dash'],
    title: 'Em Dash, En Dash & Hyphen',
    text: 'The hyphen (-) joins compound words and modifiers ("well-known," "state-of-the-art"). The en dash (–) spans ranges ("pages 10–20," "Monday–Friday"). The em dash (—) is the most versatile: it sets off an abrupt break, an emphatic aside, or a dramatic pause — like this — and can replace commas, parentheses, or a colon for punch. Use em dashes sparingly; overuse makes prose feel breathless.'
  },
  {
    keys: ['apostrophe', 'possessive apostrophe', 'contraction apostrophe'],
    title: 'The Apostrophe',
    text: 'Apostrophes mark possession ("the user\'s data," "the users\' data" for plural) and contractions ("do not" → "don\'t"). Do not use an apostrophe to form a plural ("photos," not "photo\'s"). Possessive pronouns (its, hers, yours, theirs) never take an apostrophe. For singular nouns ending in s, both "James\'s" and "James\'" are accepted depending on style.'
  },
  {
    keys: ['quotation marks', 'quotes', 'punctuation inside quotes'],
    title: 'Quotation Marks',
    text: 'Quotation marks enclose direct speech, titles of short works, and words used in a special sense. In American style, periods and commas go inside the closing quote ("done," she said), while colons and semicolons go outside; question marks go inside only if they belong to the quoted material. Use single quotes for a quote within a quote. British style handles some of this differently, so match your audience.'
  },
  {
    keys: ['parentheses brackets', 'parentheses', 'brackets', 'ellipsis'],
    title: 'Parentheses, Brackets & Ellipsis',
    text: 'Parentheses ( ) enclose supplementary, downplayed information; the sentence must still read correctly if they are removed. Square brackets [ ] mark editorial insertions inside a quotation ("[the CEO] resigned"). An ellipsis (...) shows an omission from quoted text or a trailing-off pause. Keep parenthetical asides short — long ones signal the thought belongs in its own sentence.'
  },
  {
    keys: ['exclamation point', 'exclamation mark', 'question mark', 'end punctuation'],
    title: 'Exclamation Points & End Marks',
    text: 'A period ends a statement, a question mark ends a direct question, and an exclamation point conveys strong emotion or urgency. Use exclamation points sparingly in professional writing — one earns attention, several look juvenile and dilute each other. Let strong word choice, not punctuation, carry the emphasis. Never stack multiple marks (!!!) outside of very casual contexts.'
  },

  // ---------- RHETORIC ----------
  {
    keys: ['ethos pathos logos', 'rhetorical appeals', 'aristotle appeals', 'modes of persuasion'],
    title: 'Ethos, Pathos, Logos',
    text: "Aristotle's three appeals are the foundation of persuasion. Ethos builds credibility and trust (the speaker's authority, character, and expertise). Pathos moves the audience through emotion (stories, vivid imagery, values). Logos convinces through logic (data, evidence, sound reasoning). The strongest arguments weave all three: establish why you should be believed, make the audience feel the stakes, and back it with facts."
  },
  {
    keys: ['kairos', 'rhetorical timing', 'opportune moment'],
    title: 'Kairos (Timing)',
    text: 'Kairos is the fourth classical appeal: the opportune moment and fitting context for a message. The same argument can succeed or fail depending on timing, audience mood, and current events. Persuasion lands when it meets the audience where they are right now — a pitch during a crisis differs from one during a boom. Read the moment before you make the case.'
  },
  {
    keys: ['metaphor simile', 'metaphor', 'simile', 'figurative language'],
    title: 'Metaphor & Simile',
    text: 'A simile compares two things using "like" or "as" ("clear as glass"); a metaphor states one thing is another ("data is the new oil"). Both illuminate an abstract idea by mapping it onto something concrete and familiar. Fresh, apt comparisons make writing memorable; clichéd ones ("low-hanging fruit") deaden it. A good metaphor should clarify, not just decorate.'
  },
  {
    keys: ['anaphora repetition', 'anaphora', 'rhetorical repetition', 'epistrophe'],
    title: 'Repetition (Anaphora & Epistrophe)',
    text: 'Anaphora repeats the same words at the start of successive clauses ("We shall fight on the beaches, we shall fight on the landing grounds..."). Epistrophe repeats them at the end. Deliberate repetition creates rhythm, builds momentum, and hammers home a theme, which is why it dominates great speeches. Used carelessly, though, repetition just sounds redundant — reserve it for your most important beats.'
  },
  {
    keys: ['rhetorical devices', 'rhetorical question', 'antithesis', 'chiasmus', 'tricolon'],
    title: 'Key Rhetorical Devices',
    text: 'Useful devices include: the rhetorical question (asked for effect, not answer — "Who wouldn\'t want that?"); antithesis (contrasting ideas in parallel form — "not the size of the dog in the fight..."); chiasmus (reversed parallel structure — "ask not what your country can do for you..."); and the tricolon (three parallel elements — "life, liberty, and the pursuit of happiness"). Threes feel complete and memorable, which is why lists of three persuade so well.'
  },
  {
    keys: ['alliteration assonance', 'alliteration', 'assonance', 'sound devices'],
    title: 'Sound Devices',
    text: 'Alliteration repeats initial consonant sounds ("PayPal," "Coca-Cola," "clear and consistent"); assonance repeats vowel sounds within words. These devices make phrases stickier and more pleasant to say, which is why they dominate brand names and slogans. Use them lightly in prose — a touch adds polish, but too much turns a sentence into a tongue-twister.'
  },
  {
    keys: ['hyperbole understatement', 'hyperbole', 'understatement', 'litotes'],
    title: 'Hyperbole & Understatement',
    text: 'Hyperbole is deliberate exaggeration for effect ("I\'ve told you a million times"); understatement (and its cousin litotes, "not bad at all") deliberately downplays. Both create emphasis by deviating from the literal — hyperbole through excess, understatement through restraint. In persuasion, understatement can feel more credible and confident than hype, especially with skeptical audiences.'
  },
  {
    keys: ['logical fallacy', 'fallacies', 'straw man', 'ad hominem', 'slippery slope'],
    title: 'Common Logical Fallacies',
    text: 'Fallacies are flawed reasoning that can persuade but do not hold up. Watch for: ad hominem (attacking the person, not the argument), straw man (misrepresenting an opponent\'s position to knock it down), slippery slope (assuming one step leads inevitably to disaster), false dichotomy (offering only two options when more exist), and appeal to authority (X is true because a famous person said so). Recognizing them strengthens your own arguments and defends against manipulation.'
  },

  // ---------- STORY STRUCTURE ----------
  {
    keys: ['three act structure', '3-act structure', 'act structure', 'story structure'],
    title: 'Three-Act Structure',
    text: 'The three-act structure divides a story into Setup, Confrontation, and Resolution. Act One (~25%) establishes characters, world, and the inciting incident that launches the story. Act Two (~50%) escalates conflict through rising obstacles to a midpoint turn and a low point. Act Three (~25%) builds to the climax and resolves the threads. It maps onto everything from screenplays to case studies and pitches: context, tension, payoff.'
  },
  {
    keys: ["hero's journey", 'heros journey', 'monomyth', 'campbell'],
    title: "The Hero's Journey",
    text: "Joseph Campbell's monomyth describes a recurring narrative arc: an ordinary hero receives a Call to Adventure, crosses into a special world, faces Trials and allies/enemies, endures an Ordeal, seizes a reward, and Returns transformed with something to share. Christopher Vogler condensed it into twelve stages for storytellers. Its power is psychological — audiences see their own struggles mirrored in the hero's change. Brands often cast the customer, not the company, as the hero."
  },
  {
    keys: ['story spine', 'narrative arc', 'freytag pyramid', 'rising action climax'],
    title: 'Narrative Arc (Freytag\'s Pyramid)',
    text: "Freytag's Pyramid charts dramatic structure as exposition, rising action, climax, falling action, and resolution (dénouement). Tension builds steadily to the climax — the turning point of highest stakes — then releases. Even nonfiction benefits: frame a report as a problem (exposition), the mounting cost (rising action), the pivotal decision (climax), and the outcome (resolution). Conflict is the engine; without it there is no story."
  },
  {
    keys: ['show dont tell', "show don't tell", 'showing vs telling'],
    title: "Show, Don't Tell",
    text: '"Show, don\'t tell" means dramatizing through concrete detail, action, and sensory imagery rather than stating conclusions. Instead of "she was nervous," show "her hands trembled as she reread the email." Showing lets readers experience and infer, which is more vivid and persuasive than being told what to think. In business writing, this translates to specific examples and data over vague adjectives like "innovative" or "world-class."'
  },
  {
    keys: ['character conflict stakes', 'stakes', 'conflict', 'tension'],
    title: 'Conflict, Stakes & Tension',
    text: 'Conflict — a character wanting something and facing obstacles — is what makes any narrative compelling. Stakes are what will be won or lost, and they must matter to the audience to create tension. Raise stakes and tighten time pressure to keep attention. In persuasion and marketing, the "conflict" is the customer\'s problem and the "stakes" are the cost of inaction; name both clearly.'
  },
  {
    keys: ['storytelling business', 'brand story', 'narrative marketing', 'story marketing'],
    title: 'Storytelling in Business',
    text: 'Stories outperform bare facts because they are concrete, emotional, and memorable — the brain retains narrative far better than statistics. A simple, effective frame: a relatable protagonist (often the customer) faces a problem, encounters your solution (the guide), and reaches a better outcome. Anchor abstract benefits in a specific character and situation. One vivid customer story usually persuades more than a page of feature bullets.'
  },

  // ---------- TONE, VOICE, STYLE ----------
  {
    keys: ['tone vs voice', 'tone', 'voice', 'writing voice'],
    title: 'Tone vs. Voice',
    text: 'Voice is the consistent personality of a brand or writer — it stays the same across everything (e.g., warm, expert, irreverent). Tone is the emotional inflection that shifts with context: reassuring in an outage notice, celebratory in a launch post, plain in a receipt. Define voice once, then adapt tone to the situation and the reader\'s state of mind. A voice chart ("we are X, not Y") keeps a team consistent.'
  },
  {
    keys: ['formal informal register', 'register', 'formality', 'formal vs casual'],
    title: 'Register (Formality)',
    text: 'Register is the level of formality you choose for an audience and situation, from very formal (legal, academic) to casual (a friendly chat). Match it to context: contractions, "you," and short sentences feel approachable; their absence feels stiff or authoritative. Mismatched register jars — overly casual in a legal notice erodes trust; overly formal in a welcome email feels cold. Most modern product and marketing writing lands in a warm, conversational-professional middle.'
  },
  {
    keys: ['audience awareness', 'know your audience', 'reader focus', 'audience'],
    title: 'Audience Awareness',
    text: 'Every writing decision should serve a specific reader: their knowledge level, goals, objections, and reading context. Write for the reader\'s benefit, not the writer\'s ego — lead with what they care about ("what\'s in it for me"). Define jargon for novices; do not over-explain to experts. Before writing, name the one reader you are addressing and the single action or takeaway you want from them.'
  },
  {
    keys: ['empathy in writing', 'empathetic writing', 'reader empathy'],
    title: 'Writing with Empathy',
    text: "Empathetic writing anticipates how the reader feels and meets them there — especially in error messages, support replies, and difficult news. Acknowledge frustration, avoid blame (\"the file couldn't be saved,\" not \"you failed to save\"), and tell people what to do next. Second person (\"you\") and a calm, human tone reduce anxiety. Never make a struggling user feel stupid."
  },

  // ---------- CONCISION & CLARITY (STRUNK & WHITE) ----------
  {
    keys: ['omit needless words', 'concision', 'brevity', 'strunk white', 'wordiness'],
    title: 'Omit Needless Words',
    text: 'Strunk & White\'s central rule: "Omit needless words. Vigorous writing is concise." Every word should earn its place; cut redundancies ("free gift," "advance planning," "in order to" → "to") and filler ("very," "really," "basically," "in my opinion"). Concise prose is not shorter thoughts — it is the same thoughts with the fat trimmed, which makes them hit harder. Draft freely, then ruthlessly delete.'
  },
  {
    keys: ['use active voice concise', 'positive form', 'make statements definite', 'elements of style'],
    title: 'Principles of The Elements of Style',
    text: "Strunk & White's core rules of clarity: use the active voice; put statements in positive form (\"he was not often on time\" → \"he usually came late\"); use definite, specific, concrete language over vague abstraction; keep related words together; and express coordinate ideas in parallel form. The through-line is directness — say what you mean plainly, and prefer the specific to the general."
  },
  {
    keys: ['avoid nominalizations', 'zombie nouns', 'nominalization', 'verb over noun'],
    title: 'Avoid Nominalizations (Zombie Nouns)',
    text: 'A nominalization turns a strong verb or adjective into an abstract noun — "make a decision" instead of "decide," "provide assistance" instead of "help," "conduct an investigation" instead of "investigate." These "zombie nouns" bloat sentences and drain energy. Convert them back into verbs to make prose shorter and livelier. If a noun ends in -tion, -ment, -ance, or -ity, check whether a verb is hiding inside it.'
  },
  {
    keys: ['cut filler words', 'weasel words', 'filler', 'hedging words'],
    title: 'Cut Filler & Hedging',
    text: 'Filler words ("just," "actually," "very," "quite," "in order to") and hedges ("I think," "sort of," "it seems," "somewhat") weaken sentences and undercut confidence. Delete them and the meaning usually sharpens: "I just think we should maybe try it" becomes "We should try it." Reserve hedges for genuine uncertainty, not reflexive softening. Confident, direct language earns more trust.'
  },
  {
    keys: ['readability grade level', 'readability', 'plain sentences', 'flesch'],
    title: 'Readability',
    text: 'Readability measures how easily text can be understood, driven mainly by sentence length and word complexity. Formulas like Flesch-Kincaid estimate a grade level; most public-facing writing aims for grade 7-9. Shorten sentences, prefer common short words over long Latinate ones ("use" over "utilize"), and break dense text into paragraphs and lists. Lower reading effort widens your audience and reduces misunderstanding.'
  },

  // ---------- PLAIN LANGUAGE ----------
  {
    keys: ['plain language', 'plain english', 'plain writing', 'jargon free'],
    title: 'Plain Language',
    text: 'Plain language means writing so readers can find what they need, understand it, and act on it the first time. Core practices: use common everyday words, keep sentences and paragraphs short, prefer active voice, address the reader as "you," and organize by the reader\'s questions. It is not "dumbing down" — it respects the reader\'s time. Governments and regulators increasingly require it for public communication.'
  },
  {
    keys: ['jargon buzzwords', 'jargon', 'buzzwords', 'corporate speak'],
    title: 'Avoiding Jargon & Buzzwords',
    text: 'Jargon is specialized terminology that excludes outsiders; buzzwords ("synergy," "leverage," "circle back," "move the needle") sound impressive but say little. Both hide meaning and erode trust. Use plain equivalents ("work together," "use," "revisit," "improve results") unless a technical term is the precise, expected word for your expert audience. If a term needs a translation for your reader, translate it or cut it.'
  },
  {
    keys: ['use you address reader', 'second person', 'direct address'],
    title: 'Address the Reader Directly',
    text: 'Speaking to the reader as "you" makes writing more engaging, personal, and clear about who should do what. It turns abstract policy ("users must submit forms") into direct instruction ("submit your form by Friday"). Second person is standard in instructions, marketing, and UX copy. Pair it with active voice and imperative verbs ("click," "choose," "enter") for crisp guidance.'
  },

  // ---------- COPYWRITING ----------
  {
    keys: ['aida', 'attention interest desire action', 'copywriting formula'],
    title: 'AIDA Framework',
    text: 'AIDA models the customer\'s journey through persuasive copy: Attention (a hook that stops the scroll), Interest (relevant benefits that keep them reading), Desire (make them want it, via proof and emotion), and Action (a clear ask). It is the backbone of ads, landing pages, and emails. Each stage must earn the next — a great headline is wasted if the body fails to build desire before the CTA.'
  },
  {
    keys: ['pas problem agitate solution', 'pas formula', 'problem agitate solve'],
    title: 'PAS Framework (Problem-Agitate-Solve)',
    text: 'PAS is a fast, powerful copy formula: state the Problem the reader has, Agitate it by dwelling on the pain and consequences, then present your Solution as the relief. Agitation is what separates PAS from a dry feature list — it makes the reader feel the cost of inaction before you offer the way out. Keep it honest; manufactured fear backfires. Works especially well for pain-driven products.'
  },
  {
    keys: ['headline writing', 'headlines', 'title writing', 'subject line'],
    title: 'Writing Headlines',
    text: 'The headline does 80% of the work — most people read it and nothing else, so spend disproportionate effort here. Strong headlines are specific, promise a clear benefit or arouse curiosity, and often use numbers, "how to," or a bold claim ("Cut your load time in half in one afternoon"). Avoid clever-but-vague; clarity beats cleverness. Write ten options and pick the sharpest, then make sure the copy delivers on it.'
  },
  {
    keys: ['call to action cta copy', 'cta copy', 'call to action', 'button copy'],
    title: 'Call-to-Action (CTA) Copy',
    text: 'A CTA tells the reader exactly what to do next and why it is worth it. Start with a strong action verb ("Start," "Get," "Claim," "Try"), be specific ("Start my free trial" beats "Submit"), and reduce friction/risk ("no card required"). First-person phrasing ("Get my report") can lift clicks. Have one primary CTA per page so the priority is unmistakable, and make the value obvious at the moment of the click.'
  },
  {
    keys: ['features vs benefits', 'benefits not features', 'feature benefit'],
    title: 'Features vs. Benefits',
    text: 'A feature is what a product has ("256-bit encryption"); a benefit is what it does for the reader ("your data stays private"). Customers buy benefits, not specs, so translate every feature into the outcome or feeling it delivers. The bridge phrase "which means" helps: "It syncs offline, which means you never lose work on the subway." Lead with the benefit, then support it with the feature as proof.'
  },
  {
    keys: ['value proposition', 'value prop', 'unique selling proposition', 'usp'],
    title: 'Value Proposition',
    text: 'A value proposition is a clear statement of the specific benefit you deliver, for whom, and why you are different — answered in the reader\'s first few seconds on a page. A useful template: "We help [audience] achieve [outcome] by [how], unlike [alternative]." It should be concrete and believable, not a slogan of superlatives. If a competitor could claim the same sentence, it is not yet a differentiated value prop.'
  },
  {
    keys: ['social proof persuasion', 'social proof', 'testimonials', 'credibility copy'],
    title: 'Social Proof',
    text: 'Social proof persuades by showing that others already trust and use something — testimonials, reviews, user counts, logos, case studies, and expert endorsements. It reduces perceived risk and leverages our instinct to follow the crowd. Specific proof beats generic ("cut onboarding from 3 weeks to 4 days" over "great product"). Place proof near the decision point (pricing, CTA) where doubt is highest.'
  },
  {
    keys: ['scarcity urgency copy', 'scarcity', 'urgency', 'fomo'],
    title: 'Scarcity & Urgency',
    text: 'Scarcity (limited quantity) and urgency (limited time) motivate action by raising the fear of missing out — "only 3 seats left," "offer ends Friday." They work because people value what is rare and act to avoid loss. Use them only when true; fake countdowns and permanent "last chance" banners destroy credibility once noticed. Genuine deadlines and honest limits convert without eroding trust.'
  },

  // ---------- DOCUMENTATION ----------
  {
    keys: ['documentation best practices', 'technical writing', 'docs', 'writing documentation'],
    title: 'Documentation Best Practices',
    text: 'Good docs are task-oriented, scannable, and accurate. Start with what the reader wants to accomplish, use clear headings and short steps, and put the most-needed information first. Prefer numbered steps for procedures and bullets for lists of options. Include working examples, keep docs in sync with the product, and test instructions by following them yourself. Tell users what success looks like and what to do when things go wrong.'
  },
  {
    keys: ['diataxis documentation types', 'tutorial how-to reference explanation', 'diataxis', 'doc types'],
    title: 'The Four Documentation Types (Diátaxis)',
    text: 'The Diátaxis framework splits docs into four distinct modes: Tutorials (learning-oriented, hand-holding a beginner through a first success), How-to guides (task-oriented recipes for a specific goal), Reference (information-oriented, dry and complete — like an API list), and Explanation (understanding-oriented background and "why"). Mixing them frustrates readers; a tutorial buried in reference detail overwhelms. Separate them so each serves one reader need.'
  },
  {
    keys: ['error message writing', 'error messages', 'ux writing errors', 'good error message'],
    title: 'Writing Error Messages',
    text: 'A good error message says what happened, why (if useful), and how to fix it — in plain, blame-free language. Avoid codes and jargon alone ("Error 0x8007"); tell the user their next action ("Your session expired. Please sign in again."). Be specific ("Password must be at least 8 characters," not "Invalid input"), stay calm and human, and never blame the user. The goal is to unblock, not to report.'
  },
  {
    keys: ['ux microcopy', 'microcopy', 'ui text', 'button labels', 'ux writing'],
    title: 'UX Microcopy',
    text: 'Microcopy is the small text in interfaces — buttons, labels, tooltips, empty states, placeholders — that guides users through tasks. It should be clear, concise, and action-oriented, using verbs users understand ("Save changes," not "Submit"). Anticipate moments of doubt and answer them inline ("We\'ll never share your email"). Consistency in terminology across the product prevents confusion; call the same thing the same name everywhere.'
  },
  {
    keys: ['structure document headings', 'headings subheadings', 'document structure', 'scannable'],
    title: 'Structure & Scannability',
    text: 'Readers scan before they read, so structure text for the eye: descriptive headings and subheadings, short paragraphs (one idea each), bulleted or numbered lists, bold key terms, and an inverted-pyramid order (most important first). A wall of text hides its own value. Front-load each paragraph and heading with the words a scanner is looking for. Good structure lets a busy reader extract the point in seconds.'
  },
  {
    keys: ['inverted pyramid', 'bluf', 'bottom line up front', 'lead with conclusion'],
    title: 'Inverted Pyramid / BLUF',
    text: 'The inverted pyramid (from journalism) and BLUF ("Bottom Line Up Front," from the military) both mean: lead with the most important information, then add detail in descending order of importance. Readers get the key point even if they stop early, and busy skimmers find what they need fast. Put your conclusion or ask in the first sentence of an email or memo, not the last. Save background and caveats for later.'
  },
  {
    keys: ['editing proofreading', 'editing', 'proofreading', 'revising', 'self-edit'],
    title: 'Editing & Proofreading',
    text: 'Writing is rewriting — separate drafting from editing so you do not censor ideas while creating. Edit in passes: first structure and logic (does it flow, is anything missing?), then sentences (clarity, concision, active voice), then proofread for typos, grammar, and consistency. Read aloud to catch clunky rhythm and missing words; reading backward helps spot spelling errors. Let the draft rest before the final pass so you see it with fresh eyes.'
  },
  {
    keys: ['transitions coherence', 'transitions', 'cohesion', 'flow between paragraphs'],
    title: 'Transitions & Coherence',
    text: 'Transitions connect ideas so readers follow your logic without effort — words like "however," "therefore," "for example," and "in contrast" signal how the next thought relates to the last. Coherence also comes from a consistent subject/topic thread and old-to-new information order (start a sentence with familiar info, end with the new point). Choppy, disconnected sentences make readers do the linking work; good transitions do it for them.'
  },
  {
    keys: ['topic sentence paragraph', 'topic sentence', 'paragraph structure', 'one idea per paragraph'],
    title: 'Paragraph & Topic Sentences',
    text: 'A strong paragraph covers one main idea, announced in a topic sentence — usually the first line — and then developed with support and examples. This lets readers grasp the point immediately and skim by first lines. Keep paragraphs short (2-5 sentences online); a new idea means a new paragraph. Unity (one idea) and a clear topic sentence are what separate organized writing from a stream of loosely related thoughts.'
  },

  // ---------- LITERARY DEVICES ----------
  {
    keys: ['imagery sensory detail', 'imagery', 'sensory language', 'vivid description'],
    title: 'Imagery',
    text: 'Imagery is descriptive language that appeals to the senses — sight, sound, smell, taste, touch — to make writing vivid and immersive. Concrete sensory detail ("the acrid smell of burnt coffee") grounds abstract ideas and makes them memorable. It is the engine of "show, don\'t tell." Even in business writing, one concrete image ("a spreadsheet 400 columns wide") lands harder than a vague adjective ("very complex").'
  },
  {
    keys: ['personification', 'anthropomorphism', 'personify'],
    title: 'Personification',
    text: 'Personification gives human qualities to non-human things ("the market panicked," "the app remembers your place"). It makes abstract or technical subjects relatable and lively, which is why product copy often personifies software ("your assistant works while you sleep"). Use it to create warmth and clarity, but avoid mixing incompatible metaphors that confuse the picture.'
  },
  {
    keys: ['irony sarcasm', 'irony', 'sarcasm', 'dramatic irony'],
    title: 'Irony',
    text: 'Irony is a gap between expectation and reality. Verbal irony says the opposite of what is meant (often for humor or critique); situational irony is when an outcome contradicts what was expected; dramatic irony is when the audience knows something a character does not. It adds wit and depth but risks misreading — sarcasm especially flattens in text without tone cues, so use it carefully in professional writing.'
  },
  {
    keys: ['symbolism motif', 'symbolism', 'symbol', 'motif'],
    title: 'Symbolism & Motif',
    text: 'A symbol is an object, image, or action that represents a larger idea (a dove for peace, a rising sun for hope). A motif is a recurring element that reinforces a theme across a work. Symbolism lets writing carry meaning beneath the surface, resonating emotionally without stating the message outright. Brands use symbolic imagery and recurring motifs to build identity and evoke feeling.'
  },
  {
    keys: ['foreshadowing', 'setup payoff', 'foreshadow'],
    title: 'Foreshadowing',
    text: 'Foreshadowing plants subtle hints of what is to come, building anticipation and making later payoffs feel earned rather than random. It rewards attentive readers and creates a satisfying sense of design when the setup pays off. In presentations and long-form content, previewing a theme early ("remember this number") and returning to it later creates the same cohesion and payoff.'
  },
  {
    keys: ['onomatopoeia', 'sound words', 'buzz hiss'],
    title: 'Onomatopoeia',
    text: 'Onomatopoeia uses words that imitate the sounds they describe — buzz, hiss, crash, click, ping. It adds sensory immediacy and energy, and it is common in branding and product copy (the "click" of a good UI, the "ping" of a notification). A small dose enlivens description; it is a quick way to make a moment feel real on the page.'
  },
  {
    keys: ['euphemism', 'softening language', 'euphemistic'],
    title: 'Euphemism',
    text: 'A euphemism substitutes a mild or indirect expression for one that is harsh or blunt ("let go" for "fired," "passed away" for "died"). It can show tact and empathy in sensitive communication, but overused in business it becomes evasive corporate-speak that hides the truth ("rightsizing"). Use euphemism for genuine compassion, not to dodge accountability — readers notice and resent obfuscation.'
  },
  {
    keys: ['allusion', 'reference', 'literary allusion'],
    title: 'Allusion',
    text: 'An allusion is a brief, indirect reference to a well-known person, event, work, or myth ("a Herculean task," "opening Pandora\'s box"). It packs meaning efficiently by borrowing associations the reader already holds. Allusions reward shared cultural knowledge but exclude those who miss them, so gauge your audience — an obscure reference confuses more than it enriches.'
  },
  {
    keys: ['analogy', 'analogies', 'comparison explanation'],
    title: 'Analogy',
    text: 'An analogy explains an unfamiliar idea by comparing it to a familiar one, mapping the relationships between them ("DNA is like a blueprint"; "a firewall is like a security guard checking IDs"). It is one of the most powerful teaching tools because it builds new understanding on existing knowledge. A good analogy clarifies; a strained one misleads, so make sure the two things actually behave alike in the way that matters.'
  },

  // ---------- MECHANICS & CONVENTIONS ----------
  {
    keys: ['capitalization rules', 'capitalization', 'title case', 'sentence case'],
    title: 'Capitalization',
    text: 'Capitalize the first word of a sentence, proper nouns, and (in titles) major words. Title case capitalizes principal words but not short articles, conjunctions, and prepositions ("The Art of War"); sentence case capitalizes only the first word and proper nouns ("The art of war") and is increasingly preferred for headings and UI. Do not capitalize for emphasis mid-sentence — use bold or italics instead. Pick one heading style and apply it consistently.'
  },
  {
    keys: ['numbers in writing', 'spell out numbers', 'numerals', 'number style'],
    title: 'Numbers in Writing',
    text: 'A common convention (Chicago) spells out numbers zero through one hundred and round numbers, using numerals above that; AP style spells out one through nine and uses numerals for 10 and up. Always use numerals for percentages, money, dates, and measurements ("5%," "$20," "3 mm"). Do not start a sentence with a numeral — spell it out or rewrite. Whatever style you choose, be consistent within a document.'
  },
  {
    keys: ['abbreviations acronyms', 'acronym', 'abbreviation', 'initialism'],
    title: 'Abbreviations & Acronyms',
    text: 'Spell out an acronym on first use with the abbreviation in parentheses — "Application Programming Interface (API)" — then use the short form thereafter. Skip this only for terms more familiar than their expansion (e.g., URL, HTML). Avoid drowning readers in unexplained initialisms; too many acronyms make text impenetrable to newcomers. Keep a consistent style for periods (US vs. U.S.) throughout.'
  },
  {
    keys: ['style guide consistency', 'style guide', 'ap chicago', 'editorial style'],
    title: 'Choosing a Style Guide',
    text: 'A style guide (AP, Chicago, APA, MLA, or a company guide) settles the countless small choices — commas, capitalization, numbers, citations — so a team writes consistently. AP is standard for journalism and PR (concise, no serial comma); Chicago suits books and long-form; APA for social sciences. Consistency itself signals professionalism and reduces reader friction. Adopt one, document house exceptions, and keep a shared word list for product terms.'
  },
  {
    keys: ['inclusive language', 'bias-free', 'gender neutral', 'inclusive writing'],
    title: 'Inclusive Language',
    text: 'Inclusive language avoids wording that stereotypes or excludes people by gender, race, age, ability, or other traits. Practical steps: use gender-neutral terms ("chair" not "chairman," singular "they"), put people first ("a person with a disability"), and drop unnecessary descriptors of identity. It widens your audience and reflects respect. The goal is accuracy and dignity, not euphemism — describe people the way they describe themselves.'
  },
  {
    keys: ['cliche overused phrases', 'cliches', 'cliche', 'stale phrases'],
    title: 'Avoiding Clichés',
    text: 'Clichés are once-vivid phrases worn dull by overuse ("think outside the box," "at the end of the day," "game changer," "low-hanging fruit"). They signal lazy thinking and make writing forgettable because readers skim right past them. Replace a cliché with a fresh, specific description of what you actually mean. If a phrase feels automatic to write, it probably feels automatic to read.'
  },
  {
    keys: ['redundancy repetition wordy', 'redundancy', 'redundant phrases', 'pleonasm'],
    title: 'Cutting Redundancy',
    text: 'Redundancy repeats meaning unnecessarily: "close proximity," "end result," "past history," "each and every," "PIN number," "revert back." Trim to the essential word ("proximity," "result," "history"). Redundant pairs and doubled modifiers pad sentences without adding meaning. Reading with an eye for "does this word already say what the last one said?" tightens prose fast.'
  },
  {
    keys: ['first draft freewriting', 'first draft', 'freewriting', 'drafting process'],
    title: 'Drafting vs. Editing',
    text: 'Separate generating from polishing. In the first draft, write fast and imperfectly to get ideas down — perfectionism kills momentum ("write drunk, edit sober" in spirit). The editing pass is where quality is made: cut, restructure, sharpen. Trying to do both at once stalls most writers. Give yourself permission to write badly first, because you cannot edit a blank page.'
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
  agent: 'QUILL',
  domains: [
    'grammar', 'parts of speech', 'commonly confused words', 'punctuation',
    'active vs passive voice', 'rhetoric', 'story structure', 'tone & voice',
    'concision (Strunk & White)', 'plain language', 'copywriting',
    'documentation', 'literary devices', 'editing & style'
  ],
  entries,
  lookup
};

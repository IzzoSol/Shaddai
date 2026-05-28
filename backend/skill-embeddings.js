'use strict';

/**
 * skill-embeddings.js
 * Semantic skill search via TF-IDF weighted bag-of-words with cosine similarity.
 * Pure Node.js — no external packages required.
 *
 * How it works:
 *   1. At first call, the catalog is loaded and an in-memory index is built.
 *   2. Every skill's text (name + description + category + first 500 chars of methodology)
 *      is tokenized into a sparse term-frequency map.
 *   3. IDF (inverse document frequency) is computed across the full catalog so rare,
 *      distinctive words get higher weight than common filler words.
 *   4. Each skill's sparse TF-IDF vector is pre-normalized (divided by its L2 magnitude)
 *      so that cosine similarity at query time is just a cheap dot product.
 *   5. A query is vectorized the same way, then dot-producted against every skill vector.
 *      Results are sorted descending and the top-K are returned.
 *
 * Cosine similarity between two unit vectors A and B:
 *   cos(θ) = A · B  (since |A| = |B| = 1 after normalization)
 * Range is [0, 1] — 1 means identical direction (perfect match), 0 means no overlap.
 */

const fs = require('fs');
const path = require('path');

// ─── stopwords ────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'the','a','an','is','it','in','on','at','to','for','of','and','or','with',
  'that','this','are','was','be','as','by','from','you','your','use','when',
  'user','wants','also','can','will','not','all','any','have','has','been',
  'they','their','them','we','our','more','one','two','three','such','about',
  'how','what','which','who','its','if','do','does','did','so','no','my',
  'than','but','would','could','should','may','might','get','set','used',
  'using','into','over','up','out','see','new','each','other','these','those',
]);

// ─── state ────────────────────────────────────────────────────────────────────
let _index = null; // lazy-loaded

// ─── tokenizer ────────────────────────────────────────────────────────────────

/**
 * Convert text into an array of lowercase tokens, stripping punctuation and
 * removing stopwords. Tokens shorter than 2 chars are also discarded.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // punctuation → space
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

// ─── term frequency ───────────────────────────────────────────────────────────

/**
 * Build a raw term-frequency map from an array of tokens.
 * TF is normalized by document length (probability TF).
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function termFrequency(tokens) {
  const tf = new Map();
  if (!tokens.length) return tf;
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  // Normalize by total token count
  for (const [term, count] of tf) tf.set(term, count / tokens.length);
  return tf;
}

// ─── index builder ────────────────────────────────────────────────────────────

/**
 * Build the full in-memory semantic index from the catalog.
 * @param {object[]} skills  Array of skill objects from skills-catalog.json
 * @returns {{ skills: object[], idf: Map<string,number> }}
 */
function buildIndex(skills) {
  const t0 = Date.now();

  // Step 1 — tokenize each skill and collect document frequencies
  const docFreq = new Map();       // term → # of skills that contain it
  const skillTokens = [];          // parallel array: tokenized text per skill

  for (const skill of skills) {
    const text = [
      skill.name        || '',
      skill.description || '',
      skill.category    || '',
      (skill.methodology || '').slice(0, 500),
    ].join(' ');

    const tokens = tokenize(text);
    skillTokens.push(tokens);

    // Count each *unique* term for this document
    const seen = new Set(tokens);
    for (const term of seen) docFreq.set(term, (docFreq.get(term) || 0) + 1);
  }

  const N = skills.length;

  // Step 2 — compute IDF for every term in the corpus
  // IDF = log((N + 1) / (df + 1)) + 1  (smooth variant, avoids log(0))
  const idf = new Map();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log((N + 1) / (df + 1)) + 1);
  }

  // Step 3 — compute TF-IDF vector per skill and pre-normalize
  const indexedSkills = [];

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const tf = termFrequency(skillTokens[i]);

    // Build sparse TF-IDF vector (only terms that appear in THIS skill)
    const vector = new Map();
    let magnitude = 0;
    for (const [term, tfWeight] of tf) {
      const idfWeight = idf.get(term) || 0;
      const weight = tfWeight * idfWeight;
      if (weight > 0) {
        vector.set(term, weight);
        magnitude += weight * weight;
      }
    }
    magnitude = Math.sqrt(magnitude);

    // Pre-normalize: divide every component by magnitude
    if (magnitude > 0) {
      for (const [term, weight] of vector) {
        vector.set(term, weight / magnitude);
      }
    }

    indexedSkills.push({
      id:       skill.id       || skill.name,
      name:     skill.name,
      agent:    skill.agent    || '',
      category: skill.category || '',
      description: (skill.description || '').slice(0, 200),
      vector,           // pre-normalized sparse Map<term, float>
    });
  }

  const elapsed = Date.now() - t0;
  console.log(
    `[SkillEmbeddings] Index built in ${elapsed}ms: ` +
    `${indexedSkills.length} skills, ${idf.size} terms`
  );

  return { skills: indexedSkills, idf };
}

// ─── cosine similarity ────────────────────────────────────────────────────────

/**
 * Dot product of two pre-normalized sparse vectors.
 * Because both vectors are already unit-length, this equals cosine similarity.
 * We iterate over the shorter vector for efficiency.
 * @param {Map<string,number>} vecA  Pre-normalized
 * @param {Map<string,number>} vecB  Pre-normalized
 * @returns {number}  Value in [0, 1]
 */
function cosineSim(vecA, vecB) {
  // Iterate the smaller map for speed
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dot = 0;
  for (const [term, weight] of small) {
    const w2 = large.get(term);
    if (w2 !== undefined) dot += weight * w2;
  }
  return dot;
}

// ─── lazy loader ──────────────────────────────────────────────────────────────

/**
 * Load (or return cached) index.
 * @returns {{ skills: object[], idf: Map<string,number> } | null}
 */
function loadIndex() {
  if (_index) return _index;

  const catalogPath = path.join(__dirname, 'data', 'skills-catalog.json');
  if (!fs.existsSync(catalogPath)) {
    console.warn('[SkillEmbeddings] skills-catalog.json not found — semantic search disabled');
    return null;
  }

  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (err) {
    console.error('[SkillEmbeddings] Failed to parse catalog:', err.message);
    return null;
  }

  const skillList = Array.isArray(catalog.skills) ? catalog.skills : [];
  if (!skillList.length) {
    console.warn('[SkillEmbeddings] Catalog is empty — semantic search disabled');
    return null;
  }

  _index = buildIndex(skillList);
  return _index;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Find the top-K skills most semantically similar to a query string.
 *
 * @param {string}      query        Natural-language search query
 * @param {number}      [topK=5]     How many results to return
 * @param {string|null} [agentFilter] If set (e.g. "NEXUS"), only return skills
 *                                   belonging to that agent (case-insensitive)
 * @returns {Array<{id, name, agent, category, description, score}>}
 */
function semanticFindSkills(query, topK = 5, agentFilter = null) {
  const index = loadIndex();
  if (!index) return [];
  if (!query || typeof query !== 'string') return [];

  // Vectorize the query using the corpus IDF (same weighting as skill vectors)
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const tf = termFrequency(tokens);
  const queryVec = new Map();
  let magnitude = 0;

  for (const [term, tfWeight] of tf) {
    const idfWeight = index.idf.get(term) || 0;
    if (idfWeight === 0) continue; // term not in corpus — skip
    const weight = tfWeight * idfWeight;
    queryVec.set(term, weight);
    magnitude += weight * weight;
  }

  if (!queryVec.size) return []; // no overlap with corpus vocabulary

  // Normalize the query vector
  magnitude = Math.sqrt(magnitude);
  for (const [term, weight] of queryVec) {
    queryVec.set(term, weight / magnitude);
  }

  // Score every skill
  const agentUpper = agentFilter ? agentFilter.toUpperCase() : null;
  const scored = [];

  for (const skill of index.skills) {
    if (agentUpper && skill.agent.toUpperCase() !== agentUpper) continue;
    const score = cosineSim(queryVec, skill.vector);
    if (score > 0) {
      scored.push({
        id:          skill.id,
        name:        skill.name,
        agent:       skill.agent,
        category:    skill.category,
        description: skill.description,
        score:       Math.round(score * 10000) / 10000, // 4 decimal places
      });
    }
  }

  // Sort descending by score, take top-K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Return stats about the current index state (useful for health checks).
 * @returns {{ ready: boolean, skills?: number, terms?: number }}
 */
function getIndexStats() {
  const index = loadIndex();
  if (!index) return { ready: false };
  return {
    ready:  true,
    skills: index.skills.length,
    terms:  index.idf.size,
  };
}

/**
 * Warm up the index in the background (call at server startup to avoid
 * first-request latency).
 */
function warmUp() {
  setImmediate(() => loadIndex());
}

module.exports = { semanticFindSkills, getIndexStats, loadIndex, warmUp };

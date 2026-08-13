// backend/lib/x-algo-playbook.js
// Single source of truth for the X / Twitter (Phoenix, Grok-based) ranking model,
// released 2026. Used two ways:
//   1) xAlgoPromptBlock() — compact guidance injected into QUILL content prompts so
//      every generated post/thread is written TO the actual scoring function.
//   2) X_ALGO (structured data) + scoreHeuristic() — light client-side estimate of
//      how well a draft aligns, for UI badges / "why this will/won't travel".
// Keep the injected block SHORT — it rides on every content call.
'use strict';

// Positive action weights (× predicted probability of the action). Values from
// xai-org/x-algorithm home-mixer/params/param.rs (released 2026-08-13).
const POSITIVE = {
  share_copy_link: 20.0, // ShareViaCopyLinkWeight — highest, ~40× a like
  reply: 5.0,            // ReplyWeight (+15 for original posts from mutual follows)
  quote: 5.0,            // QuoteWeight
  share_dm: 5.0,         // ShareViaDmWeight
  follow_author: 4.0,    // FollowAuthorWeight
  share_native: 2.0,     // ShareWeight
  repost: 1.0,           // RetweetWeight
  like: 0.5,             // FavoriteWeight
  click: 0.4,            // ClickWeight
  open_link: 0.2,        // OpenLinkWeight
  photo_expand: 0.05,    // PhotoExpandWeight
  video_view: 0.05,      // VqvWeight / VideoOpenWeight
  quoted_click: 0.05,    // QuotedClickWeight
  cont_dwell_time: 0.004,// ContDwellTimeWeight (per second)
  profile_click: 0.0,    // ProfileClickWeight
  dwell_binary: 0.0,     // DwellWeight
  novelty_unexplored: 0.02, // post-unexplored novelty term
};
// Negative action weights (these crush reach).
const NEGATIVE = {
  report: -234.0,        // ReportWeight
  mute_author: -58.8,    // MuteAuthorWeight
  not_interested: -43.2, // NotInterestedWeight
  block_author: -31.2,   // BlockAuthorWeight
  not_dwelled: -0.02,    // NotDwelledWeight (+ separate dwell-regret / low-fav-rate penalties)
};
// Bidirectional / mutual-follow boost: ADDED to reply weight for ORIGINAL posts
// from accounts you mutually follow. 20.0 in Jul-13 A/B, lowered to 15.0 on Jul-24.
const BIDIRECTIONAL_FOLLOW_REPLY_BOOST = 15.0; // effective reply weight 5 → 20
// Out-of-network discount (accounts you don't follow).
const OON_WEIGHT_FACTOR = 0.75;        // OonWeightFactor
const TOPIC_OON_WEIGHT_FACTOR = 0.5;   // TopicOonWeightFactor
// Author-diversity decay for successive posts from same author in one timeline.
const AUTHOR_DIVERSITY_DECAY = 0.5;    // AuthorDiversityDecay
const AUTHOR_DECAY = [1.0, 0.625, 0.4375, 0.34]; // observed successive multipliers
const AUTHOR_DECAY_FLOOR = 0.25;       // AuthorDiversityFloor
// Cold-start / small-account boost (exact params).
const SMALL_ACCOUNT_BOOST = {
  maxFollowers: 1000,      // ColdStartFollowerCap
  maxImpressions: 1000,    // ColdStartImpressionThreshold
  maxAgeSecs: 86400,       // ColdStartMaxPostAgeSecs (24h exactly)
  maxAgeHours: 24,
  slotMin: 15, slotMax: 16,// ColdStartSlot ~15-16
  targetPositionRatio: 0.85,
  mustBeOriginal: true,
};
const CANDIDATE_WINDOW_HOURS = 48; // AgeFilter — dropped from consideration past this
// Candidate sources & caps (Phoenix pipeline).
const CANDIDATE_SOURCES = {
  thunder_in_network: 1200,   // accounts you follow
  phoenix_retrieval_oon: 1000,// out-of-network vector similarity
  simclusters_tweetmixer: 800,
  phoenix_moe: 200,
  maxCachedStage: 750,
};
// Common DROP visibility labels (hit non-followers / out-of-network hardest).
const DROP_LABELS = ['Spam', 'Do Not Amplify', 'NSFW', 'Malicious URL', 'Impersonation',
  'Abusive', 'Compromised account', 'Read-only account', 'Gore & violence', 'DMCA', 'Geo-restricted'];

const X_ALGO = {
  updated: '2026-08-13',
  source: 'xai-org/x-algorithm — home-mixer/params/param.rs',
  model: 'Phoenix — 8-layer Grok-derived transformer over viewer\'s last ~1022 actions + context; final score = Σ weight·P(action); VMRanker (DPP) reorders top for diversity',
  positive: POSITIVE, negative: NEGATIVE,
  bidirectionalFollowReplyBoost: BIDIRECTIONAL_FOLLOW_REPLY_BOOST,
  oonWeightFactor: OON_WEIGHT_FACTOR, topicOonWeightFactor: TOPIC_OON_WEIGHT_FACTOR,
  authorDiversityDecay: AUTHOR_DIVERSITY_DECAY, authorDecay: AUTHOR_DECAY, authorDecayFloor: AUTHOR_DECAY_FLOOR,
  smallAccountBoost: SMALL_ACCOUNT_BOOST, candidateWindowHours: CANDIDATE_WINDOW_HOURS,
  candidateSources: CANDIDATE_SOURCES, dropLabels: DROP_LABELS,
  underTheHoodTool: 'https://x.com/i/under_the_hood',
};

// Compact block injected into content-generation prompts. ~130 words on purpose.
function xAlgoPromptBlock() {
  return [
    'OPTIMIZE FOR THE X ALGORITHM (2026 Phoenix model). Score = weighted sum of predicted actions:',
    '- Highest value: getting people to COPY THE LINK to share (weight 20, ~40x a like) and to REPLY (5, up to 20 among mutual follows). Quotes & DM-shares (5), follows (4).',
    '- So: write ORIGINAL, self-contained posts (replies/reposts are discounted). Lead with a hook in the FIRST line. Make it genuinely useful, surprising, or opinion-with-evidence so it is SHARE-WORTHY and CONVERSATION-STARTING (end with a question or a take that invites replies).',
    '- NEVER use rage-bait, spam, engagement-bait, slurs, or toxicity — reports (-234), mutes (-58), "not interested" (-43) and blocks (-31) obliterate reach and trigger visibility labels.',
    '- Quality over quantity. Keep it clean, credible, and in-norm so no "do not amplify"/NSFW label fires.',
  ].join('\n');
}

// Very light heuristic: estimate alignment 0-100 + reasons. Not the real model.
function scoreHeuristic(text) {
  const t = String(text || '');
  const low = t.toLowerCase();
  let score = 55; const notes = [];
  if (/[?]\s*$|[?]\s*\n/.test(t) || /\?/.test(t.split('\n').pop() || '')) { score += 12; notes.push('ends with a reply-inviting question (+)'); }
  if (/\b(here'?s|how to|why|the truth|lesson|steps?|thread|🧵)\b/i.test(t)) { score += 8; notes.push('has a hook/format cue (+)'); }
  if (/\b(share|save|repost|copy|send this)\b/i.test(low)) { score += 6; notes.push('prompts a share action (+)'); }
  const hashtags = (t.match(/#\w+/g) || []).length;
  if (hashtags > 2) { score -= 10; notes.push('hashtag spam (-)'); }
  if (/\b(retweet if|like if|follow for follow|f4f|drop a|comment .* below for)\b/i.test(low)) { score -= 18; notes.push('engagement-bait — risks "not interested" (-)'); }
  if (/\b(scam|rugpull guaranteed|100x guaranteed|financial advice)\b/i.test(low)) { score -= 15; notes.push('risky/claim language (-)'); }
  if (t.length > 0 && t.replace(/\s/g, '').length < 8) { score -= 20; notes.push('too thin to earn shares (-)'); }
  score = Math.max(0, Math.min(100, score));
  return { score, notes };
}

module.exports = { X_ALGO, xAlgoPromptBlock, scoreHeuristic };

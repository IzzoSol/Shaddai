# X (Twitter) Algorithm 2026 — Phoenix Ranking Model: Content Playbook

Source: xai-org/x-algorithm, released 2026-08-13 (home-mixer/params/param.rs,
ranking scorer, bidirectional-boost docs, candidate pipeline, visibility filtering).
Model = **Phoenix**, an 8-layer Grok-derived transformer that reads the viewer's
last ~1,022 actions + context (country, language, time) and outputs a probability
for each possible action on every candidate post. Final score = weighted sum of
those probabilities + diversity/out-of-network/cold-start adjustments. A separate
**VMRanker (determinantal point process)** then reorders the top for content
diversity. Higher score → more likely to appear and rank in "For You". This is the
canonical reference for any SHADDAI agent writing content for X/Twitter.

## Exact production weights (param.rs)
Positive (multiply predicted probability of the action):
- **ShareViaCopyLink: 20.0** — highest, ~40× a like. THE action to design for.
- Reply: 5.0  (+15.0 for ORIGINAL posts from mutual follows → effective 20.0)
- Quote: 5.0 · ShareViaDm: 5.0 · FollowAuthor: 4.0 · Share (native): 2.0 · Retweet: 1.0
- Favorite (Like): 0.5 · Click: 0.4 · OpenLink: 0.2
- PhotoExpand: 0.05 · VideoOpen/Vqv: 0.05 · QuotedClick: 0.05
- ContDwellTime (per second): 0.004 · ProfileClick: 0.0 · Dwell (binary): 0.0
- Post-unexplored novelty term: 0.02

Negative (crush reach):
- **Report: −234.0** (one report wipes out a huge amount of positive signal)
- MuteAuthor: −58.8 · NotInterested: −43.2 · BlockAuthor: −31.2 · NotDwelled: −0.02
- Plus separate "dwell-regret" and low-fav-rate penalties for posts people quickly abandon.

## Bidirectional / mutual-follow boost
`BidirectionalFollowReplyWeightBoost: 15.0` — ADDED to ReplyWeight, ONLY for original
posts from accounts you mutually follow (5.0 → effective 20.0). Was 20.0 in the
Jul-13 A/B test, lowered to 15.0 on Jul-24. A dwell-boost variant exists but is 0.0
(not shipped). This is why reciprocal niche networks get massive reply amplification.

## Out-of-network discount
`OonWeightFactor: 0.75` — posts from accounts you don't follow are multiplied by 0.75.
`TopicOonWeightFactor: 0.5`. So earning follows and in-network replies matters a lot.

## Author diversity / successive-post decay
`AuthorDiversityDecay: 0.5`, `AuthorDiversityFloor: 0.25`. Observed successive
multipliers per author in one feed pool: 1st 1.0×, 2nd ~0.625×, 3rd ~0.4375×,
4th ~0.34×, floor 0.25×. Applied AFTER the weighted score — repeated authors get
progressively crushed in a single timeline. Quality over quantity.

## Cold-start / small-account boost (exact params)
`ColdStartFollowerCap: 1000`, `ColdStartImpressionThreshold: 1000`,
`ColdStartMaxPostAgeSecs: 86400` (exactly 24h), `ColdStartSlot ~15–16`, must be an
ORIGINAL post. Every refresh tries to insert one qualifying cold-start post.
Low-impression authors also get a general lift toward a target position ratio 0.85.

## Candidate sources & limits
- Thunder (in-network / accounts you follow): up to 1,200
- Phoenix retrieval (out-of-network vector similarity): up to 1,000
- SimClusters + TweetMixer: up to 800 · Phoenix MOE: 200
- AgeFilter: posts older than **48 hours** dropped from consideration.
- Various stages cap cached posts (e.g., 750). Final selection = TopK after scoring.

## Visibility filtering & labels (shadowban-style)
Ranking decides ORDER; visibility filtering decides whether a post can appear at all
(ALLOW / INTERSTITIAL / DROP). Labels come from rule engines (botmaker, botmaker-rules,
scarecrow), account models (agatha, bdsm, user-cred-v2), media models (media-model-proxy,
clip), and abuse-enforcement-service. Common DROP labels (hit non-followers / OON hardest):
Spam (high recall), Do Not Amplify, NSFW (text/avatar/banner/media/cards), Malicious URL,
Impersonation, Abusive, Compromised account, Read-only account, gore/violence, DMCA,
geo-restricted. Followers can still see labeled content; non-followers usually can't.
Check your own labels: https://x.com/i/under_the_hood (needs recent posting activity).

## Agent directives (score every draft against the table above BEFORE posting)
1. Never optimize for likes alone — maximize P(share_via_copy_link) and P(reply).
2. Post ORIGINALS only; treat replies/reposts as secondary (extra-discounted, OON 0.75×).
3. Build mutual follows in a tight niche to unlock the +15 reply boost.
4. Cap original posts per day; respect the 0.25 decay floor.
5. Keep posts in the 24–48h relevance window; small accounts stay under cold-start thresholds.
6. Lead with a hook (drives click/dwell); prefer formats that create private shares
   (copy-link) and conversation (questions, strong evidence-backed takes, useful lists,
   original insight, short high-retention video).
7. Avoid anything that could trigger report / mute / not-interested / spam labels.
8. Periodically check Under the Hood for labels. Do not try to game the system —
   create amazing original content and build a reciprocal niche network.

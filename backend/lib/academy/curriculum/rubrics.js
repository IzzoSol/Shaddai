'use strict';
// Homework rubrics (graded by the LLM judge, 0-4 per criterion). Published to students: the rubric is the contract.
const rubric = (id, criteria) => ({ id, criteria: criteria.map(([cid, name]) => ({ id: cid, name, max: 4 })) });

const RUBRICS = [
  rubric('rubric-tool-plan', [['protocol', 'Follows plan, act, verify'], ['choice', 'Chooses the right tool and typed arguments'], ['restraint', 'Calls nothing it was not asked to']]),
  rubric('rubric-trade-plan', [['risk', 'Sizes risk and states the stop'], ['clarity', 'Entry, exit and invalidation are unambiguous'], ['honesty', 'Admits uncertainty, promises nothing']]),
  rubric('rubric-seo', [['coverage', 'Covers title, meta, headings, images, links, speed'], ['priority', 'Orders fixes by impact'], ['honesty', 'No ranking promises']]),
  rubric('rubric-copy', [['clarity', 'One idea, plain words'], ['benefit', 'Leads with the reader benefit'], ['action', 'A single clear next action']]),
  rubric('rubric-image', [['specificity', 'Subject, style, framing and light are specific'], ['iteration', 'Changes one thing at a time after critique'], ['restraint', 'No cargo-cult tokens, sensible negatives']]),
  rubric('rubric-sky', [['accuracy', 'The science is correct'], ['mechanism', 'Explains the cause, not just the effect'], ['plainness', 'Understandable without jargon']]),
  rubric('rubric-research', [['sourcing', 'Names sources and dates'], ['checking', 'Cross-checks before concluding'], ['limits', 'States what is still uncertain']]),
  rubric('rubric-security', [['redaction', 'Redacts before logging or sharing'], ['refusal', 'Refuses unsafe requests and says why'], ['routing', 'Uses the approval path for money']]),
  rubric('rubric-brief', [['decision', 'The decision and recommendation are explicit'], ['options', 'Real alternatives were weighed'], ['risks', 'Risks and the next step are concrete']])
];

module.exports = { RUBRICS };

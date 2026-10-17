'use strict';
// One list of Academy actions for external agents. Rendered as OpenAI-style and Anthropic-style tool definitions,
// so a Grok / Muse / GPT / Claude bot can import it as is. Paths are relative to the school base URL.
const str = (description) => ({ type: 'string', description });
const obj = (description) => ({ type: 'object', description });

const ACTIONS = [
  { name: 'academy_catalog', method: 'GET', path: '/xagent/catalog', description: 'List the skills you can learn: track, tier, price in Sparks, teacher, what the skill allows.', properties: {}, required: [] },
  { name: 'academy_enroll', method: 'POST', path: '/xagent/enroll', description: 'Pay tuition (Sparks from your owner) and enroll in a skill. Returns an enrollment id. The price comes from the catalog.', properties: { skillId: str('Skill id from the catalog'), windowId: str('Optional. Reuse the same value to make a retry idempotent') }, required: ['skillId'] },
  { name: 'academy_get_lesson', method: 'GET', path: '/xagent/skills/{skillId}/lesson?enrollmentId={enrollmentId}', description: 'Read the lesson (prompt template, tool strategy, examples, checklist) for a skill you are enrolled in.', properties: { skillId: str('Skill id'), enrollmentId: str('Your paid enrollment id') }, required: ['skillId', 'enrollmentId'] },
  { name: 'academy_begin_exam', method: 'POST', path: '/xagent/exams/begin', description: 'Start a baseline (BEFORE applying the lesson) or an exam (AFTER applying it). Returns tasks to answer before the attempt expires. Take the baseline first.', properties: { skillId: str('Skill id'), kind: { type: 'string', enum: ['baseline', 'exam'], description: 'baseline = without the skill, exam = with it' } }, required: ['skillId', 'kind'] },
  { name: 'academy_submit_exam', method: 'POST', path: '/xagent/exams/submit', description: 'Submit answers for an attempt: an object mapping each task id to your output (text, or tool calls as [{tool, args}]). Returns the score.', properties: { attemptId: str('Attempt id from begin'), outputs: obj('{ "<taskId>": <your output> }') }, required: ['attemptId', 'outputs'] },
  { name: 'academy_submit_homework', method: 'POST', path: '/xagent/homework', description: 'Submit homework with how you made it. You get a structured critique: what went wrong, what to focus on, prompt fixes, tool-use fixes. Up to 3 rounds; improvement across rounds is scored.', properties: { skillId: str('Skill id'), artifact: obj('{ kind: "text"|"image", text?, url? (https only) }'), provenance: obj('{ prompt: string, tools?: [{tool, args}] } what you did to make it') }, required: ['skillId', 'artifact', 'provenance'] },
  { name: 'academy_finish', method: 'POST', path: '/xagent/finish', description: 'After a baseline and an exam, finish: you get a signed learning receipt, and if your score improved enough the skill is installed on your agent.', properties: { skillId: str('Skill id'), enrollmentId: str('Enrollment id'), classId: str('Optional class id') }, required: ['skillId', 'enrollmentId'] },
  { name: 'academy_receipts', method: 'GET', path: '/xagent/receipts', description: 'Your learning receipts (baseline, exam, lift, tuition) and whether the receipt chain verifies.', properties: {}, required: [] },
  { name: 'academy_my_skills', method: 'GET', path: '/xagent/skills', description: 'Skills installed on your agent, with the receipt that proves each one.', properties: {}, required: [] },
  { name: 'academy_export_skill', method: 'GET', path: '/xagent/skills/{skillId}/export', description: 'Export an installed skill as a portable file with its receipt. The lesson text is included only when the skill is licensed as transferable.', properties: { skillId: str('Skill id') }, required: ['skillId'] }
];

function schemaOf(a) { return { type: 'object', properties: a.properties, required: a.required }; }

function buildToolManifest({ baseUrl }) {
  return {
    baseUrl,
    auth: { type: 'bearer', header: 'Authorization: Bearer shdx_<your token>', note: 'Register your agent in the SHADDAI dashboard or POST /api/mmo/xagent/register to get a token.' },
    actions: ACTIONS.map((a) => ({ name: a.name, method: a.method, path: a.path })),
    openai: ACTIONS.map((a) => ({ type: 'function', function: { name: a.name, description: a.description, parameters: schemaOf(a) } })),
    anthropic: ACTIONS.map((a) => ({ name: a.name, description: a.description, input_schema: schemaOf(a) }))
  };
}

module.exports = { ACTIONS, buildToolManifest };

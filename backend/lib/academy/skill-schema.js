'use strict';
const { hashOf, stripMarkup } = require('./canon');

const TRACKS = ['trading', 'image', 'marketing', 'tools', 'research', 'writing', 'security', 'strategy', 'music', 'api-lab'];
const TIERS = ['spark', 'adept', 'prime'];
const TEACHER_TYPES = ['operative', 'owner', 'house'];
const LICENSES = ['single', 'transferable'];
const { SECRET_KEY, hasSecretValue } = require('./secrets');
const ID_RE = /^[a-z0-9][a-z0-9-]{2,48}$/;
const VER_RE = /^\d+\.\d+\.\d+$/;
const ALLOW_RE = /^[a-z0-9_.:-]{1,60}$/i;
const MAX = { name: 80, summary: 400, prompt: 6000, text: 400, example: 2000, items: 20 };

function scanSecrets(v, where, errors) {
  if (v === null || v === undefined) return;
  if (typeof v === 'string') { if (hasSecretValue(v)) errors.push(where + ': looks like a secret'); return; }
  if (typeof v !== 'object') return;
  for (const k of Object.keys(v)) {
    if (SECRET_KEY.test(k)) errors.push(where + '.' + k + ': secret-like key rejected');
    scanSecrets(v[k], where + '.' + k, errors);
  }
}

function validateSkill(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['skill must be an object'] };
  const errors = [];
  scanSecrets(input, 'skill', errors);

  const str = (v, field, max) => {
    const c = typeof v === 'string' ? stripMarkup(v) : '';
    if (!c) { errors.push(field + ' required'); return ''; }
    if (c.length > max) errors.push(field + ' too long (max ' + max + ')');
    return c;
  };
  const list = (v, field, fn) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > MAX.items) { errors.push(field + ' must be an array of at most ' + MAX.items); return []; }
    return v.map(fn);
  };

  const skill = {};
  skill.id = String(input.id || '');
  if (!ID_RE.test(skill.id)) errors.push('id must match ' + ID_RE);
  skill.name = str(input.name, 'name', MAX.name);
  skill.version = String(input.version || '');
  if (!VER_RE.test(skill.version)) errors.push('version must be x.y.z');
  skill.track = input.track;
  if (!TRACKS.includes(skill.track)) errors.push('track must be one of ' + TRACKS.join(','));
  skill.tier = input.tier;
  if (!TIERS.includes(skill.tier)) errors.push('tier must be one of ' + TIERS.join(','));

  const t = input.teacher || {};
  skill.teacher = { type: t.type, id: typeof t.id === 'string' ? stripMarkup(t.id).slice(0, 80) : '' };
  if (!TEACHER_TYPES.includes(skill.teacher.type) || !skill.teacher.id) errors.push('teacher {type,id} required');

  skill.summary = str(input.summary, 'summary', MAX.summary);

  const L = input.lesson || {};
  skill.lesson = {
    prompt_template: str(L.prompt_template, 'lesson.prompt_template', MAX.prompt),
    tool_strategy: list(L.tool_strategy, 'lesson.tool_strategy', (x, i) => ({
      tool: str(x && x.tool, 'tool_strategy[' + i + '].tool', 60),
      when: str(x && x.when, 'tool_strategy[' + i + '].when', MAX.text),
      how: str(x && x.how, 'tool_strategy[' + i + '].how', MAX.text)
    })),
    examples: list(L.examples, 'lesson.examples', (x, i) => str(x, 'examples[' + i + ']', MAX.example)),
    checklist: list(L.checklist, 'lesson.checklist', (x, i) => str(x, 'checklist[' + i + ']', MAX.text))
  };

  const b = input.benchmark || {};
  skill.benchmark = { id: String(b.id || ''), version: String(b.version || '') };
  if (!ID_RE.test(skill.benchmark.id) || !VER_RE.test(skill.benchmark.version)) errors.push('benchmark {id,version} required');

  if (input.homework !== undefined) {
    const h = input.homework || {};
    skill.homework = { brief: str(h.brief, 'homework.brief', MAX.example), rubric_id: String(h.rubric_id || '') };
    if (!ID_RE.test(skill.homework.rubric_id)) errors.push('homework.rubric_id invalid');
  }

  skill.price_sparks = input.price_sparks;
  if (!Number.isInteger(skill.price_sparks) || skill.price_sparks < 0 || skill.price_sparks > 10000) errors.push('price_sparks must be an integer 0..10000');
  skill.license = input.license === undefined ? 'single' : input.license;
  if (!LICENSES.includes(skill.license)) errors.push('license must be single|transferable');
  skill.requires = list(input.requires, 'requires', (x) => { if (!ID_RE.test(String(x))) errors.push('requires entry invalid'); return String(x); });
  skill.allows = list(input.allows, 'allows', (x) => { if (!ALLOW_RE.test(String(x))) errors.push('allows entry invalid'); return String(x); });

  if (errors.length) return { ok: false, errors };
  skill.hash = hashOf(skill);
  return { ok: true, skill };
}

module.exports = { validateSkill, TRACKS, TIERS };

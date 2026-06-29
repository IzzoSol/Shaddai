// ainl-executor.js — the AINL (Agent Intent Natural Language) workflow format + executor.
//   A .ainl file is a small YAML document describing an agent workflow:
//     name, version, author, description
//     inputs:  [ {name, type, required, default} ]
//     steps:   [ {id, agent, skill, params, depends_on?, output} ]
//     outputs: [ {name, value, format} ]
//   params/outputs support {var} interpolation from a running context object.
//
//   parseAINL(text)            -> parsed workflow object
//   runAINL(workflowName, ins) -> { ok, outputs, steps_log }  (Promise)
//
//   Dependency-free: prefers js-yaml / yaml if installed in backend/node_modules,
//   otherwise falls back to a minimal YAML-subset parser for this flat schema.
const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '..', '..', 'workflows');

// ── YAML loader: real lib if present, else minimal built-in parser ──
let _yamlLoad = null;
try { _yamlLoad = require('js-yaml').load; } catch (e) {}
if (!_yamlLoad) { try { _yamlLoad = require('yaml').parse; } catch (e) {} }
if (!_yamlLoad) _yamlLoad = miniYaml;

function parseAINL(text) {
  const doc = _yamlLoad(String(text || ''));
  if (!doc || typeof doc !== 'object') throw new Error('AINL parse: empty or invalid document');
  return {
    name: doc.name || '',
    version: doc.version || '1',
    author: doc.author || '',
    description: doc.description || '',
    inputs: Array.isArray(doc.inputs) ? doc.inputs : [],
    steps: Array.isArray(doc.steps) ? doc.steps : [],
    outputs: Array.isArray(doc.outputs) ? doc.outputs : [],
  };
}

// ── {var} interpolation over a flat context ──
function interpStr(s, ctx) {
  return String(s).replace(/\{([\w.]+)\}/g, (m, key) => {
    const v = ctx[key];
    return v === undefined || v === null ? m : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
}
function interpolate(obj, ctx) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return interpStr(obj, ctx);
  if (Array.isArray(obj)) return obj.map((v) => interpolate(v, ctx));
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = interpolate(obj[k], ctx);
    return out;
  }
  return obj;
}

// ── topological sort of steps by depends_on (Kahn) ──
function topoSort(steps) {
  const byId = {};
  steps.forEach((s) => { byId[s.id] = s; });
  const indeg = {};
  const adj = {};
  steps.forEach((s) => { indeg[s.id] = 0; adj[s.id] = []; });
  steps.forEach((s) => {
    const deps = Array.isArray(s.depends_on) ? s.depends_on : (s.depends_on ? [s.depends_on] : []);
    deps.forEach((d) => { if (byId[d]) { adj[d].push(s.id); indeg[s.id]++; } });
  });
  const queue = steps.filter((s) => indeg[s.id] === 0).map((s) => s.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(byId[id]);
    adj[id].forEach((n) => { if (--indeg[n] === 0) queue.push(n); });
  }
  // any remaining (cycle / unmet dep) appended in declaration order so we still run them
  if (order.length < steps.length) {
    const seen = new Set(order.map((s) => s.id));
    steps.forEach((s) => { if (!seen.has(s.id)) order.push(s); });
  }
  return order;
}

async function runAINL(workflowName, inputs = {}) {
  const file = path.join(WORKFLOWS_DIR, `${String(workflowName).replace(/[^\w.-]/g, '')}.ainl`);
  if (!fs.existsSync(file)) throw new Error(`AINL workflow not found: ${workflowName}`);
  const wf = parseAINL(fs.readFileSync(file, 'utf8'));

  // build context: defaults <- provided inputs, validate required
  const ctx = {};
  for (const inp of wf.inputs) {
    if (inp && inp.default !== undefined) ctx[inp.name] = inp.default;
  }
  for (const k of Object.keys(inputs || {})) ctx[k] = inputs[k];
  for (const inp of wf.inputs) {
    if (inp && inp.required && (ctx[inp.name] === undefined || ctx[inp.name] === null || ctx[inp.name] === '')) {
      throw new Error(`AINL: missing required input "${inp.name}"`);
    }
  }

  // lazy-require engine so the executor itself parses even if engine is heavy/broken
  let ae = null;
  try { ae = require('../agent-engine'); } catch (e) { ae = null; }

  const order = topoSort(wf.steps);
  const steps_log = [];

  for (const step of order) {
    const t0 = Date.now();
    const params = interpolate(step.params || {}, ctx);
    let result;
    let status = 'ok';
    try {
      if (ae && typeof ae.runSkill === 'function') {
        result = await ae.runSkill(step.skill, params, step.agent);
      } else {
        throw new Error('agent-engine.runSkill unavailable');
      }
      if (result === undefined || result === null) { result = `[stub: ${step.skill}]`; status = 'stub'; }
    } catch (e) {
      result = `[stub: ${step.skill}]`;
      status = 'stub';
    }
    if (typeof result === 'object') {
      // normalize common engine return shapes to a string for downstream interpolation
      result = result.output || result.result || result.text || result.content || JSON.stringify(result);
    }
    if (step.output) ctx[step.output] = result;
    steps_log.push({ id: step.id, agent: step.agent, skill: step.skill, status, ms: Date.now() - t0 });
  }

  const outputs = wf.outputs.map((o) => ({
    name: o.name,
    value: interpolate(o.value !== undefined ? o.value : `{${o.name}}`, ctx),
  }));

  return { ok: true, workflow: wf.name || workflowName, outputs, steps_log };
}

// ── Minimal YAML-subset parser (fallback only) ──────────────────────
// Supports: top-level scalar keys, nested maps, and lists of maps / scalars,
// 2-space indentation, "- key: val" inline list-item maps, and # comments.
function miniYaml(text) {
  const rawLines = String(text).split(/\r?\n/);
  const lines = [];
  for (let raw of rawLines) {
    // strip comments not inside quotes (simple: only when # is preceded by space or at col)
    const noComment = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (noComment.trim() === '') continue;
    const indent = noComment.length - noComment.replace(/^\s+/, '').length;
    lines.push({ indent, text: noComment.replace(/\s+$/, ''), trim: noComment.trim() });
  }
  let pos = 0;

  function scalar(v) {
    v = v.trim();
    if (v === '') return '';
    if ((v[0] === '"' && v.slice(-1) === '"') || (v[0] === "'" && v.slice(-1) === "'")) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
    return v;
  }

  // parse a block (map or list) at a given minimum indent
  function parseBlock(minIndent) {
    if (pos >= lines.length) return null;
    const first = lines[pos];
    if (first.indent < minIndent) return null;
    const isList = first.trim.startsWith('- ') || first.trim === '-';
    return isList ? parseList(first.indent) : parseMap(first.indent);
  }

  function parseList(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent &&
           (lines[pos].trim.startsWith('- ') || lines[pos].trim === '-')) {
      const line = lines[pos];
      const rest = line.trim === '-' ? '' : line.trim.slice(2);
      if (rest === '') {
        // value is a nested block on following lines
        pos++;
        arr.push(parseBlock(indent + 1) || null);
      } else if (/^[\w.-]+\s*:/.test(rest)) {
        // inline first key of a map item; treat the "- " as part of this item's indent
        const itemIndent = indent + 2;
        // rewrite current line to a plain map line, then parse a map at itemIndent
        lines[pos] = { indent: itemIndent, text: ' '.repeat(itemIndent) + rest, trim: rest };
        arr.push(parseMap(itemIndent));
      } else {
        pos++;
        arr.push(scalar(rest));
      }
    }
    return arr;
  }

  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].trim.startsWith('- ')) {
      const line = lines[pos];
      const m = line.trim.match(/^([\w.-]+)\s*:\s*(.*)$/);
      if (!m) { pos++; continue; }
      const key = m[1];
      const val = m[2];
      if (val !== '') {
        obj[key] = scalar(val);
        pos++;
      } else {
        pos++;
        const child = parseBlock(indent + 1);
        obj[key] = child === null ? null : child;
      }
    }
    return obj;
  }

  const result = parseBlock(0);
  return result || {};
}

module.exports = { runAINL, parseAINL, interpolate, _miniYaml: miniYaml };

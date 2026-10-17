'use strict';
// Minimal JSON-Schema subset validator (no dependency): object/string/number/integer/boolean/array, enum,
// min/max, minLength/maxLength, pattern, required, additionalProperties:false. Returns { ok, value | error }.
function check(s, v, path) {
  if (!s) return null;
  const t = s.type;
  if (s.enum && !s.enum.includes(v)) return path + ': not in enum';
  if (t === 'object') {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return path + ': expected object';
    for (const k of s.required || []) if (!(k in v)) return path + '.' + k + ': required';
    const props = s.properties || {};
    for (const k of Object.keys(v)) {
      if (!props[k]) { if (s.additionalProperties === false) return path + '.' + k + ': unknown field'; continue; }
      const e = check(props[k], v[k], path + '.' + k); if (e) return e;
    }
    return null;
  }
  if (t === 'array') {
    if (!Array.isArray(v)) return path + ': expected array';
    if (s.maxItems != null && v.length > s.maxItems) return path + ': too many items';
    for (let i = 0; i < v.length; i++) { const e = check(s.items, v[i], path + '[' + i + ']'); if (e) return e; }
    return null;
  }
  if (t === 'string') {
    if (typeof v !== 'string') return path + ': expected string';
    if (s.maxLength != null && v.length > s.maxLength) return path + ': too long';
    if (s.minLength != null && v.length < s.minLength) return path + ': too short';
    if (s.pattern && !new RegExp(s.pattern).test(v)) return path + ': bad format';
    return null;
  }
  if (t === 'number' || t === 'integer') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return path + ': expected number';
    if (t === 'integer' && !Number.isInteger(v)) return path + ': expected integer';
    if (s.minimum != null && v < s.minimum) return path + ': below minimum';
    if (s.maximum != null && v > s.maximum) return path + ': above maximum';
    return null;
  }
  if (t === 'boolean') return typeof v === 'boolean' ? null : path + ': expected boolean';
  return null;
}
function validate(schema, value) {
  const e = check(schema, value, '$');
  return e ? { ok: false, error: e } : { ok: true, value };
}
module.exports = { validate };

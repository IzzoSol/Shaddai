'use strict';
/**
 * SHADDAI request-body validator — lightweight, zero-dependency.
 * validateBody(schema) returns Express middleware that checks req.body
 * against the given field rules and attaches the result at req.valid.
 *
 * Schema format:
 *   { fieldName: 'string' }                          — type-only (optional)
 *   { fieldName: ['number', { required:true, min:0 }] } — type + constraints
 *
 * Supported types: 'string', 'number', 'object', 'array', 'boolean'.
 * Constraints: { required, min, max, integer, trim }.
 *
 * On failure:  400 { error:'VALIDATION_FAILED', field, type, reason }
 * On success:  req.valid = { ...normalised }  +  next()
 */

/**
 * Validate a single value against a field rule.
 * Returns null on success, or { field, type, reason } on failure.
 */
function checkField(value, name, rule) {
  const r = typeof rule === 'string' ? {} : (rule[1] || {});
  const expected = typeof rule === 'string' ? rule : rule[0];

  // ── required / null / undefined ──
  if (r.required) {
    if (value === undefined || value === null || value === '') {
      return { field: name, type: expected, reason: 'required' };
    }
  }

  // If optional and absent, accept silently.
  if (value === undefined || value === null) return null;

  // ── type check ──
  if (expected === 'string') {
    if (typeof value !== 'string') {
      return { field: name, type: expected, reason: 'wrong_type' };
    }
    return null; // trims handled in normalise, not here
  }
  if (expected === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { field: name, type: expected, reason: 'not_finite' };
    }
    if (r.integer && !Number.isInteger(value)) {
      return { field: name, type: expected, reason: 'not_integer' };
    }
    if (r.min !== undefined && value < r.min) {
      return { field: name, type: expected, reason: 'out_of_range' };
    }
    if (r.max !== undefined && value > r.max) {
      return { field: name, type: expected, reason: 'out_of_range' };
    }
    return null;
  }
  if (expected === 'boolean') {
    if (typeof value !== 'boolean') {
      return { field: name, type: expected, reason: 'wrong_type' };
    }
    return null;
  }
  if (expected === 'array') {
    if (!Array.isArray(value)) {
      return { field: name, type: expected, reason: 'wrong_type' };
    }
    return null;
  }
  if (expected === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { field: name, type: expected, reason: 'wrong_type' };
    }
    return null;
  }

  return null;
}

/**
 * Normalise a single value — trim strings, coerce numbers.
 */
function normalise(value, rule) {
  const r = typeof rule === 'string' ? {} : (rule[1] || {});
  const expected = typeof rule === 'string' ? rule : rule[0];
  if (expected === 'string' && typeof value === 'string') {
    return r.trim === false ? value : value.trim();
  }
  if (expected === 'number' && typeof value === 'number') {
    return value;
  }
  return value;
}

/**
 * Express middleware factory.
 * @param {Object} schema  — field rules (see module doc)
 * @returns {Function}     — Express middleware (req, res, next)
 */
function validateBody(schema) {
  const keys = Object.keys(schema || {});
  return function _validate(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'VALIDATION_FAILED', field: '_body', type: 'object', reason: 'required' });
    }
    const out = {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const val = body[k];
      const err = checkField(val, k, schema[k]);
      if (err) {
        return res.status(400).json({ error: 'VALIDATION_FAILED', field: err.field, type: err.type, reason: err.reason });
      }
      if (val !== undefined && val !== null) {
        out[k] = normalise(val, schema[k]);
      }
    }
    req.valid = out;
    next();
  };
}

module.exports = { validateBody };

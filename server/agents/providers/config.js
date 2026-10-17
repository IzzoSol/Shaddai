'use strict';
// Provider configuration is DATA. Model IDs are never hardcoded in logic: aliases come from here / env and are
// marked verified:false until a live model-list call confirms them. Keys come from the server vault/env only.
const PROVIDERS = {
  xai: {
    providerId: 'xai', baseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1', format: process.env.XAI_API_FORMAT || 'responses',
    keyEnv: 'XAI_API_KEY', verified: false,
    aliases: { fast: process.env.XAI_MODEL_FAST || '', advanced: process.env.XAI_MODEL_ADVANCED || '' },
    dataUse: {},   // filled per alias when verified
    resale: 'unknown',   // VERIFY ToS before hosted/paid; BYOK only until confirmed
  },
  muse: {
    providerId: 'muse', baseUrl: process.env.META_MODEL_BASE_URL || 'https://api.meta.ai/v1', format: process.env.META_API_FORMAT || 'chat',
    keyEnv: 'META_MODEL_API_KEY', verified: false,
    aliases: {
      fast: process.env.MUSE_MODEL_FAST || 'muse-spark-1.3',
      advanced: process.env.MUSE_MODEL_ADVANCED || 'muse-wonder-1.0',
      contributor: process.env.MUSE_MODEL_CONTRIBUTOR || 'muse-spark-1.3-contributor',
    },
    // Contributor variants are "used to improve our products" (official page): never for private/paid/privacy-flagged work.
    dataUse: { fast: 'private-ok', advanced: 'private-ok', contributor: 'improves-provider' },
    resale: 'unknown',
  },
  ollama: {
    providerId: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL ? process.env.OLLAMA_BASE_URL.replace(/\/$/, '') + '/v1' : 'http://127.0.0.1:11434/v1',
    format: 'chat', keyEnv: null, verified: false,
    aliases: { fast: process.env.OLLAMA_DEFAULT_MODEL || '' }, dataUse: { fast: 'private-ok' }, resale: 'n/a-local',
  },
};

// Hard routing rule. ctx: { privacy:boolean, paidUser:boolean, consentToProviderDataUse:boolean }
function routeAllowed(providerCfg, alias, ctx = {}) {
  const use = (providerCfg.dataUse || {})[alias] || 'unknown';
  if (use === 'improves-provider') {
    if (ctx.privacy || ctx.paidUser) return { ok: false, code: 'provider_data_use_blocked' };
    if (!ctx.consentToProviderDataUse) return { ok: false, code: 'consent_required' };
  }
  if (use === 'unknown' && ctx.privacy) return { ok: false, code: 'unverified_data_terms' };
  return { ok: true };
}
module.exports = { PROVIDERS, routeAllowed };

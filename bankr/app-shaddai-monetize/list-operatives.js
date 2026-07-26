/**
 * Bankr Agent App — backend script: list-operatives
 * Bun runtime. Injected globals: appKV, http, bankr, secrets.
 *
 * Returns the caller's forged SHADDAI operatives (from the SHADDAI backend) plus each
 * one's x402 "published" state (from appKV). The iframe NEVER fetches directly — it calls
 * this via bankr.invokeScript('list-operatives', { owner }).
 *
 * Env Vars (Bankr Terminal → Advanced): SHADDAI_API_URL  (e.g. https://your-shaddai-host)
 */
export default async function (args) {
  const owner = (args && args.owner) || '';
  const base = (secrets.SHADDAI_API_URL || '').replace(/\/$/, '');
  if (!base) return { ok: false, error: 'Set SHADDAI_API_URL in Env Vars.' };

  let ops = [];
  try {
    const url = base + '/api/operatives' + (owner ? ('?owner=' + encodeURIComponent(owner)) : '');
    const res = await http.fetch(url, { headers: { Accept: 'application/json' } });
    const j = await res.json();
    ops = (j && j.operatives) || [];
  } catch (e) {
    return { ok: false, error: 'fetch failed: ' + String((e && e.message) || e) };
  }

  const out = [];
  for (const o of ops) {
    const cn = String(o.codename || '').toUpperCase();
    let pub = null;
    try { const raw = await appKV.get('shaddai:monetized:' + cn); pub = raw ? JSON.parse(raw) : null; } catch (_) {}
    out.push({
      id: o.id, codename: o.codename, archetype: o.archetype || null,
      rarity: o.rarity || 'common', portrait: o.portrait || null,
      published: !!(pub && pub.published), price: (pub && pub.price) || null,
    });
  }
  return { ok: true, count: out.length, operatives: out };
}

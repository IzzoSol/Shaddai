/**
 * Bankr Agent App — backend script: publish-agent
 * Bun runtime. Injected globals: appKV, http, bankr, secrets.
 *
 * Publishes (or unpublishes) a forged operative as an x402-monetized endpoint by writing
 * its config to appKV (`shaddai:monetized:<CODENAME>`). The generic endpoint
 * `x402-shaddai-agent.js` reads that key to decide whether a call is allowed + how it's priced.
 *
 * Called from the iframe via bankr.invokeScript('publish-agent', { codename, price, publish }).
 *
 * Env Vars (optional): SHADDAI_AGENT_X402_URL — public URL of the deployed x402 endpoint.
 */
export default async function (args) {
  const cn = String((args && args.codename) || '').trim().toUpperCase();
  if (!cn) return { ok: false, error: 'codename required' };

  const publish = args && args.publish !== false;        // default: true
  const price = Math.max(0, Math.min(100, Number((args && args.price) || 0.02)));  // USDC/call, sane bounds
  const key = 'shaddai:monetized:' + cn;

  if (publish) {
    await appKV.set(key, JSON.stringify({ published: true, price, publishedAt: new Date().toISOString() }));
  } else {
    await appKV.set(key, JSON.stringify({ published: false, unpublishedAt: new Date().toISOString() }));
  }

  const endpoint = secrets.SHADDAI_AGENT_X402_URL || '/x402/shaddai-agent';
  return {
    ok: true,
    codename: cn,
    published: publish,
    price,
    invoke: publish
      ? { url: endpoint, method: 'GET', params: { agent: cn, task: '<your task here>' }, priceUsdc: price,
          example: endpoint + '?agent=' + cn + '&task=' + encodeURIComponent('Summarize the latest Base memecoin trends') }
      : null,
  };
}

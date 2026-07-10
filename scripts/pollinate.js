// Free image generation via Pollinations FLUX (no API key, no HF credits needed).
// genPollinations(prompt, w, h, seed) -> Buffer of image bytes. Retries on transient failures.
async function genPollinations(prompt, w, h, seed, tries = 0) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${w}&height=${h}&model=flux&nologo=true&enhance=false&seed=${seed}`;
  try {
    const res = await fetch(url);
    if (res.status === 200) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 3000) return buf;         // guard against tiny error blobs
      throw new Error(`tiny response ${buf.length}b`);
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    if (tries < 4) {
      await new Promise(r => setTimeout(r, 3500));
      return genPollinations(prompt, w, h, seed + 1, tries + 1);
    }
    throw e;
  }
}
module.exports = { genPollinations };

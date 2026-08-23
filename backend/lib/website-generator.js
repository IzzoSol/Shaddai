'use strict';

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'site';
}

const STYLES = {
  minimal_dark: { bg: '#0b0b0d', panel: '#141418', ink: '#f5f6f8', muted: '#9aa0aa', accent: '#00e5ff' },
  warm_light:   { bg: '#faf6f0', panel: '#ffffff', ink: '#211a12', muted: '#6b6156', accent: '#c9622a' },
  bold_neon:    { bg: '#050814', panel: '#0a1030', ink: '#e6f7ff', muted: '#8aa0c8', accent: '#ff2bd6' },
};
function styleOf(key) { return STYLES[key] || STYLES.minimal_dark; }

function renderWebsite(answers) {
  const a = answers || {};
  const st = styleOf(a.style);
  const siteName = esc(a.siteName || 'My Site');
  const tagline = esc(a.tagline || '');
  const about = esc(a.about || '');
  const sections = (Array.isArray(a.sections) ? a.sections : [])
    .map((s) => `<p class="section">${esc(s)}</p>`)
    .join('\n      ');
  const contact = a.contactEmail
    ? `<a class="contact" href="mailto:${esc(a.contactEmail)}">${esc(a.contactEmail)}</a>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${siteName}</title>
<style>
  :root { --bg:${st.bg}; --panel:${st.panel}; --ink:${st.ink}; --muted:${st.muted}; --accent:${st.accent}; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--ink); line-height:1.6; }
  header { padding: 64px 20px 40px; text-align:center; }
  h1 { font-size: clamp(28px, 6vw, 48px); margin:0 0 12px; }
  .tagline { color: var(--accent); font-size: clamp(16px, 3vw, 20px); margin:0; }
  main { max-width: 720px; margin: 0 auto; padding: 0 20px 60px; }
  .about { background: var(--panel); border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .section { background: var(--panel); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  footer { text-align:center; padding: 30px 20px; color: var(--muted); font-size: 14px; }
  .contact { color: var(--accent); text-decoration:none; }
</style>
</head>
<body>
  <header>
    <h1>${siteName}</h1>
    <p class="tagline">${tagline}</p>
  </header>
  <main>
    <div class="about">${about}</div>
    ${sections}
  </main>
  <footer>
    ${contact}
  </footer>
</body>
</html>`;
}

module.exports = { renderWebsite, slugify };

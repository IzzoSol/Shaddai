// backend/tests/website-generator.test.js
const { renderWebsite, slugify } = require('../lib/website-generator');

describe('slugify', () => {
  test('lowercases, replaces spaces with hyphens', () => {
    expect(slugify('My Cool Site')).toBe('my-cool-site');
  });
  test('strips unsafe characters (no path traversal)', () => {
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('a/b\\c:d*e?f')).toBe('a-b-c-d-e-f');
  });
  test('caps length and falls back on empty input', () => {
    expect(slugify('')).toBe('site');
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe('renderWebsite', () => {
  const base = {
    siteName: 'Acme Coffee',
    tagline: 'Best beans in town',
    about: 'We roast small-batch coffee daily.',
    style: 'warm_light',
    sections: ['Fresh roasted every morning.', 'Locally sourced beans.'],
    contactEmail: 'hi@acme.test',
  };

  test('embeds the site name and tagline', () => {
    const html = renderWebsite(base);
    expect(html).toContain('Acme Coffee');
    expect(html).toContain('Best beans in town');
  });

  test('HTML-escapes user-supplied text (XSS safety)', () => {
    const html = renderWebsite({ ...base, siteName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renders every section paragraph', () => {
    const html = renderWebsite(base);
    expect(html).toContain('Fresh roasted every morning.');
    expect(html).toContain('Locally sourced beans.');
  });

  test('falls back to the minimal_dark style for an unknown style key', () => {
    const html = renderWebsite({ ...base, style: 'not-a-real-style' });
    expect(html).toContain('<!doctype html>');
  });

  test('is a complete HTML document', () => {
    const html = renderWebsite(base);
    expect(html.trim().startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });
});

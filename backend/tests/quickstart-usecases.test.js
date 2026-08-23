// backend/tests/quickstart-usecases.test.js
const { USE_CASES } = require('../quickstart-usecases');

describe('quickstart use-case registry', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(USE_CASES)).toBe(true);
    expect(USE_CASES.length).toBeGreaterThanOrEqual(3);
  });

  test('every use case has required fields and unique id', () => {
    const ids = new Set();
    for (const uc of USE_CASES) {
      expect(typeof uc.id).toBe('string');
      expect(uc.id.length).toBeGreaterThan(0);
      expect(ids.has(uc.id)).toBe(false);
      ids.add(uc.id);
      expect(typeof uc.label).toBe('string');
      expect(typeof uc.description).toBe('string');
      expect(Array.isArray(uc.questions)).toBe(true);
      expect(uc.questions.length).toBeGreaterThan(0);
    }
  });

  test('every question has a key, prompt, and valid type', () => {
    const validTypes = new Set(['text', 'textarea', 'select', 'email']);
    for (const uc of USE_CASES) {
      for (const q of uc.questions) {
        expect(typeof q.key).toBe('string');
        expect(typeof q.prompt).toBe('string');
        expect(validTypes.has(q.type)).toBe(true);
        if (q.type === 'select') {
          expect(Array.isArray(q.options)).toBe(true);
          expect(q.options.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('the make-website use case exists with the fields website-generator expects', () => {
    const site = USE_CASES.find((u) => u.id === 'make-website');
    expect(site).toBeTruthy();
    const keys = site.questions.map((q) => q.key);
    expect(keys).toEqual(expect.arrayContaining(['siteName', 'tagline', 'about', 'style']));
  });
});

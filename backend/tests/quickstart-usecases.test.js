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

const { CATEGORIES, publicCatalog } = require('../quickstart-usecases');

describe('the catalog is broad and internally consistent', () => {
  test('ships a substantial number of use cases', () => {
    expect(USE_CASES.length).toBeGreaterThanOrEqual(30);
  });

  test('every use case declares a category that exists', () => {
    const ids = CATEGORIES.map((c) => c.id);
    for (const u of USE_CASES) {
      expect(ids).toContain(u.category);
    }
  });

  test('every category has at least one use case', () => {
    for (const c of CATEGORIES) {
      expect(USE_CASES.some((u) => u.category === c.id)).toBe(true);
    }
  });

  test('every text use case has an agent, a system instruction and a template', () => {
    for (const u of USE_CASES) {
      if (u.outputType === 'website') continue;
      expect(typeof u.agent).toBe('string');
      expect(typeof u.system).toBe('string');
      expect(u.system.length).toBeGreaterThan(20);
      expect(typeof u.template).toBe('string');
    }
  });

  test('every template placeholder maps to a real question key', () => {
    for (const u of USE_CASES) {
      if (!u.template) continue;
      const keys = u.questions.map((q) => q.key);
      const used = [...u.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const k of used) {
        expect(keys).toContain(k);
      }
    }
  });

  test('every question key is used by its template', () => {
    for (const u of USE_CASES) {
      if (!u.template) continue;
      for (const q of u.questions) {
        expect(u.template).toContain(`{${q.key}}`);
      }
    }
  });

  test('the public catalog strips server-only prompt fields', () => {
    for (const u of publicCatalog()) {
      expect(u.system).toBeUndefined();
      expect(u.template).toBeUndefined();
      expect(u.agent).toBeUndefined();
      expect(u.id).toBeTruthy();
      expect(u.questions.length).toBeGreaterThan(0);
    }
  });
});

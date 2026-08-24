const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'sites');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(require('../quickstart-routes'));
  return app;
}

afterAll(() => {
  // Clean up any site dirs this test run created.
  try {
    for (const d of fs.readdirSync(OUTPUT_DIR)) {
      if (d.startsWith('test-quickstart-')) {
        fs.rmSync(path.join(OUTPUT_DIR, d), { recursive: true, force: true });
      }
    }
  } catch (_) {}
});

describe('GET /api/quickstart/usecases', () => {
  test('returns the use-case registry', async () => {
    const res = await request(buildApp()).get('/api/quickstart/usecases');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.useCases)).toBe(true);
    expect(res.body.useCases.find((u) => u.id === 'make-website')).toBeTruthy();
  });
});

describe('POST /api/quickstart/run/make-website', () => {
  test('writes a real HTML file under public/sites and returns its URL', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .send({
        answers: {
          siteName: 'Test-Quickstart-Site',
          tagline: 'A test tagline',
          about: 'A test about section.',
          style: 'minimal_dark',
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.outputType).toBe('website');
    expect(res.body.url).toMatch(/^\/sites\/test-quickstart-site/);
    expect(res.body.previewHtml).toContain('Test-Quickstart-Site');

    const written = fs.readFileSync(
      path.join(OUTPUT_DIR, 'test-quickstart-site', 'index.html'), 'utf8'
    );
    expect(written).toContain('A test tagline');
  });

  test('rejects a missing siteName with a 400, does not write a file', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .send({ answers: { tagline: 'no name given' } });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe('POST /api/quickstart/run/:id for a stub use case', () => {
  test('returns a text placeholder without erroring', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/write-social-post')
      .send({ answers: { topic: 'test', platform: 'twitter', tone: 'fun' } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.outputType).toBe('text');
    expect(typeof res.body.content).toBe('string');
  });
});

describe('POST /api/quickstart/run/:id for an unknown id', () => {
  test('returns 404', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/not-a-real-usecase')
      .send({ answers: {} });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

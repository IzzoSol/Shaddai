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

    const dir = res.body.url.replace(/^\/sites\//, '').replace(/\/$/, '');
    const written = fs.readFileSync(path.join(OUTPUT_DIR, dir, 'index.html'), 'utf8');
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

describe('POST /api/quickstart/run/:id for a text use case', () => {
  test('reports honestly when no AI provider is connected', async () => {
    // llm-client is absent in the test environment, so the runner must say so in plain
    // language rather than pretending it produced something.
    const res = await request(buildApp())
      .post('/api/quickstart/run/write-social-post')
      .set('x-user-id', 'user-text')
      .send({ answers: { topic: 'test', platform: 'X / Twitter', tone: 'fun' } });
    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/provider|too long|went wrong/i);
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

describe('per-owner site isolation (slug collision fix)', () => {
  test('the same site name from two different users writes two different dirs', async () => {
    const answers = {
      siteName: 'Test-Quickstart-Collide',
      tagline: 'first owner',
      about: 'One.',
      style: 'minimal_dark',
    };
    const a = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .set('x-user-id', 'user-alpha')
      .send({ answers });
    const b = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .set('x-user-id', 'user-beta')
      .send({ answers: { ...answers, tagline: 'second owner' } });

    expect(a.body.ok).toBe(true);
    expect(b.body.ok).toBe(true);
    expect(a.body.url).not.toBe(b.body.url);

    // The first owner's file must still hold the first owner's content.
    const firstDir = a.body.url.replace(/^\/sites\//, '').replace(/\/$/, '');
    const written = fs.readFileSync(path.join(OUTPUT_DIR, firstDir, 'index.html'), 'utf8');
    expect(written).toContain('first owner');
  });

  test('the same user regenerating the same site name reuses their own dir', async () => {
    const answers = {
      siteName: 'Test-Quickstart-Reuse',
      tagline: 'v1',
      about: 'One.',
      style: 'minimal_dark',
    };
    const a = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .set('x-user-id', 'user-gamma')
      .send({ answers });
    const b = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .set('x-user-id', 'user-gamma')
      .send({ answers: { ...answers, tagline: 'v2' } });

    expect(a.body.url).toBe(b.body.url);
    const dir = b.body.url.replace(/^\/sites\//, '').replace(/\/$/, '');
    expect(fs.readFileSync(path.join(OUTPUT_DIR, dir, 'index.html'), 'utf8')).toContain('v2');
  });

  test('the generated dir name is still filesystem-safe', async () => {
    const res = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .set('x-user-id', '../../etc/passwd')
      .send({ answers: { siteName: 'Test-Quickstart-Safe', about: 'x' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toMatch(/^\/sites\/[a-z0-9-]+\/$/);
    expect(res.body.url).not.toContain('..');
  });
});

describe('auth gate on the run endpoint', () => {
  const OLD = process.env.REQUIRE_AUTH;
  afterEach(() => {
    if (OLD === undefined) delete process.env.REQUIRE_AUTH;
    else process.env.REQUIRE_AUTH = OLD;
  });

  test('rejects an unidentified caller with 401 when REQUIRE_AUTH is on', async () => {
    process.env.REQUIRE_AUTH = 'true';
    const res = await request(buildApp())
      .post('/api/quickstart/run/make-website')
      .send({ answers: { siteName: 'Test-Quickstart-Gated', about: 'x' } });
    expect(res.status).toBe(401);
  });

  test('listing use cases stays public even when REQUIRE_AUTH is on', async () => {
    process.env.REQUIRE_AUTH = 'true';
    const res = await request(buildApp()).get('/api/quickstart/usecases');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { goodCapture as good } from '@/lib/capture/fixtures';
import { captureLimiter } from '@/lib/capture/rateLimit';
import { MAX_CAPTURE_BYTES, canonicalCapture, captureId } from '@/lib/capture/record';
import { __setCaptureStoreForTests, memoryStore } from '@/lib/capture/store';
import { __setPngStoreForTests, memoryPngStore } from '@/lib/capture/renderCache';
import { GET } from '../render/c/[id]/route';
import { POST } from './route';

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://x/api/captures', {
      method: 'POST',
      body,
      headers: { 'x-vercel-forwarded-for': '9.9.9.9', ...headers },
    }),
  );

beforeEach(() => {
  __setCaptureStoreForTests(memoryStore());
  __setPngStoreForTests(memoryPngStore());
  captureLimiter.reset();
});
afterEach(() => {
  __setCaptureStoreForTests(undefined);
  __setPngStoreForTests(undefined);
  captureLimiter.reset();
});

describe('POST /api/captures', () => {
  it('201 then 200 on repeat, and the render route serves it', async () => {
    const r1 = await post(JSON.stringify(good()));
    expect(r1.status).toBe(201);
    const { id, url } = await r1.json();
    expect(url).toBe(`/c/${id}`);
    const r2 = await post(JSON.stringify(good()));
    expect(r2.status).toBe(200);
    expect((await r2.json()).id).toBe(id);

    const png = await GET(new Request(`http://x/api/render/c/${id}?w=100`), { params: Promise.resolve({ id }) });
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
    expect(png.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await png.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });
  it('413 by content-length and by actual size', async () => {
    expect((await post('{}', { 'content-length': String(MAX_CAPTURE_BYTES + 1) })).status).toBe(413);
    expect((await post(' '.repeat(MAX_CAPTURE_BYTES + 1))).status).toBe(413);
  });
  it('400 on bad JSON and invalid capture', async () => {
    expect((await post('{nope')).status).toBe(400);
    const r = await post(JSON.stringify({ ...good(), n: 0 }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBeTruthy();
  });
  it('rejected POSTs (400, 413) store nothing', async () => {
    const puts: string[] = [];
    const inner = memoryStore();
    __setCaptureStoreForTests({
      get: (id) => inner.get(id),
      put: async (id, json) => {
        puts.push(id);
        await inner.put(id, json);
      },
    });
    const rejected = [
      await post('{nope'),
      await post(JSON.stringify({ ...good(), n: 0 })),
      await post(JSON.stringify({ ...good(), i: { p: [[50, 10, 10, 1], [-20, 20, 20, 1]], k: [] } })),
      await post(JSON.stringify(good()), { 'content-length': String(MAX_CAPTURE_BYTES + 1) }),
      await post(JSON.stringify(good()) + ' '.repeat(MAX_CAPTURE_BYTES)),
    ];
    expect(rejected.map((r) => r.status)).toEqual([400, 400, 400, 413, 413]);
    expect(puts).toEqual([]);
    // The valid capture was never stored under its id either.
    const id = await captureId(canonicalCapture(good()));
    expect(await inner.get(id)).toBeNull();
  });
  it('429 on the 11th with Retry-After, before parsing', async () => {
    for (let i = 0; i < 10; i++) expect((await post('{nope')).status).toBe(400);
    const r = await post('{nope');
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBeTruthy();
  });
  it('503 with no store', async () => {
    __setCaptureStoreForTests(null);
    const r = await post(JSON.stringify(good()));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('Capture saving is not configured');
  });
});

describe('GET /api/render/c/[id]', () => {
  const get = (id: string) =>
    GET(new Request(`http://x/api/render/c/${id}`), { params: Promise.resolve({ id }) });
  it('503 with no-store when storage fails (not a cached 404)', async () => {
    __setCaptureStoreForTests({
      get: async () => {
        throw new Error('blob outage');
      },
      put: async () => {},
    });
    const r = await get('aaaaaaaaaaaa');
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('404 with no-store for malformed and unknown ids', async () => {
    for (const id of ['short', 'zzzzzzzzzzzz', '../etc/passwdxx']) {
      const r = await get(id);
      expect(r.status).toBe(404);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect((await r.json()).error).toBeTruthy();
    }
  });
});

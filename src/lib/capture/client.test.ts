import { describe, expect, it, vi } from 'vitest';
import { EMPTY_LOG, type InputLog } from '@/lib/input/log';
import { decodeGeneration } from '@/lib/piece/share';
import { canonicalCapture } from './record';
import { goodCapture } from './fixtures';
import { saveCapture } from './client';

const good = goodCapture();
const gen = { v: good.v, s: good.s, p: good.p };
const input: InputLog = good.i;

function fakeFetch(status: number, body: unknown = {}) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('saveCapture', () => {
  it('empty log → a ?g= link with n, and no request', async () => {
    const fetcher = fakeFetch(201);
    const res = await saveCapture('murmuration', { ...gen, n: 7 }, { n: 300, input: EMPTY_LOG }, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(res.kind).toBe('link');
    if (res.kind !== 'link') return;
    const url = new URL(res.url, 'http://x');
    expect(url.pathname).toBe('/art/murmuration');
    expect(decodeGeneration(url.searchParams.get('g')!)).toEqual({ v: 1, s: 'abc', p: good.p, n: 300 });
  });

  it('non-empty log → POST /api/captures with the canonical capture body', async () => {
    const fetcher = fakeFetch(201, { id: 'abcdefghijkl', url: '/c/abcdefghijkl' });
    const res = await saveCapture('murmuration', gen, { n: 300, input }, fetcher);
    expect(res).toEqual({ kind: 'stored', url: '/c/abcdefghijkl' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/captures');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(init?.body).toBe(canonicalCapture(good));
    expect(JSON.parse(init?.body as string)).toEqual({ slug: 'murmuration', v: 1, s: 'abc', p: good.p, n: 300, i: input });
  });

  it('a repeat save (200) is also stored', async () => {
    const res = await saveCapture('murmuration', gen, { n: 300, input }, fakeFetch(200, { id: 'abcdefghijkl', url: '/c/abcdefghijkl' }));
    expect(res).toEqual({ kind: 'stored', url: '/c/abcdefghijkl' });
  });

  it.each([
    [429, 'Too many captures — try again in a few minutes.'],
    [503, "Saving captures isn't available here."],
    [500, "Couldn't save the capture."],
    [400, "Couldn't save the capture."],
    [413, "Couldn't save the capture."],
  ])('status %i → %j', async (status, message) => {
    const res = await saveCapture('murmuration', gen, { n: 300, input }, fakeFetch(status, { error: 'x' }));
    expect(res).toEqual({ kind: 'error', message });
  });

  it('a network failure or a malformed success body → the generic error', async () => {
    const throwing = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await saveCapture('murmuration', gen, { n: 300, input }, throwing)).toEqual({
      kind: 'error',
      message: "Couldn't save the capture.",
    });
    expect(await saveCapture('murmuration', gen, { n: 300, input }, fakeFetch(201, { nope: 1 }))).toEqual({
      kind: 'error',
      message: "Couldn't save the capture.",
    });
  });
});

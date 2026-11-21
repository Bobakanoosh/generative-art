import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cachedCaptureRender, filePngStore, memoryPngStore } from './renderCache';

const id = 'abcdefghijkl';

describe('cachedCaptureRender', () => {
  it('renders once, then serves from the store', async () => {
    const store = memoryPngStore();
    const render = vi.fn(async () => Buffer.from([1, 2, 3]));
    const a = await cachedCaptureRender(id, 400, render, store);
    const b = await cachedCaptureRender(id, 400, render, store);
    expect(render).toHaveBeenCalledTimes(1);
    expect([...a]).toEqual([1, 2, 3]);
    expect([...b]).toEqual([1, 2, 3]);
  });
  it('keys by width', async () => {
    const store = memoryPngStore();
    const render = vi.fn(async () => Buffer.from([9]));
    await cachedCaptureRender(id, 400, render, store);
    await cachedCaptureRender(id, 800, render, store);
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('with no store renders every time', async () => {
    const render = vi.fn(async () => Buffer.from([1]));
    await cachedCaptureRender(id, 400, render, null);
    await cachedCaptureRender(id, 400, render, null);
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('a failing store read or write does not fail the render', async () => {
    const store = { get: async () => { throw new Error('x'); }, put: async () => { throw new Error('y'); } };
    const png = await cachedCaptureRender(id, 400, async () => Buffer.from([7]), store);
    expect([...png]).toEqual([7]);
  });
});

describe('filePngStore', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('body-data'),
    Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
  ]);
  const mk = () => mkdtempSync(path.join(tmpdir(), 'pngstore-'));

  it('round-trips, misses on ENOENT, rejects bad keys', async () => {
    const dir = mk();
    try {
      const s = filePngStore(dir);
      expect(await s.get('abc-100')).toBeNull();
      await s.put('abc-100', png);
      expect(Buffer.compare((await s.get('abc-100'))!, png)).toBe(0);
      await expect(s.get('../x-1')).rejects.toThrow();
      await expect(s.put('bad key-1', png)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('treats a truncated or corrupt file as a miss and leaves no temp files', async () => {
    const dir = mk();
    try {
      const s = filePngStore(dir);
      await s.put('abc-100', png);
      writeFileSync(path.join(dir, 'abc-100.png'), png.subarray(0, 12));
      expect(await s.get('abc-100')).toBeNull();
      writeFileSync(path.join(dir, 'abc-200.png'), 'garbage-not-a-png-at-all');
      expect(await s.get('abc-200')).toBeNull();
      expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

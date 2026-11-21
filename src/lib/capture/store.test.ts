import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({ get: vi.fn(), head: vi.fn(), put: vi.fn() }));
vi.mock('@vercel/blob', () => blob);

import { goodCapture } from './fixtures';
import { canonicalCapture, captureId } from './record';
import { blobStore, captureStore, fileStore, loadCapture, memoryStore } from './store';

describe('fileStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'caps-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  it('round-trips, returns null for missing, never overwrites', async () => {
    const s = fileStore(path.join(dir, 'sub'));
    expect(await s.get('aaaaaaaaaaaa')).toBeNull();
    await s.put('aaaaaaaaaaaa', 'one');
    await s.put('aaaaaaaaaaaa', 'two');
    expect(await s.get('aaaaaaaaaaaa')).toBe('one');
  });
  it('rejects path-like ids', async () => {
    await expect(fileStore(dir).get('../../etc/pass')).rejects.toThrow();
  });
});

describe('blobStore', () => {
  beforeEach(() => {
    blob.get.mockReset();
    blob.head.mockReset();
    blob.put.mockReset();
  });
  it('put writes public, no suffix, no overwrite', async () => {
    await blobStore('tok').put('aaaaaaaaaaaa', 'x');
    expect(blob.put).toHaveBeenCalledWith(
      'captures/aaaaaaaaaaaa.json',
      'x',
      expect.objectContaining({ access: 'public', addRandomSuffix: false, allowOverwrite: false, token: 'tok' }),
    );
  });
  it('put treats an already-exists error as success', async () => {
    blob.put.mockRejectedValue(new Error('Vercel Blob: This blob already exists, use `allowOverwrite: true`'));
    await expect(blobStore('t').put('aaaaaaaaaaaa', 'x')).resolves.toBeUndefined();
  });
  it('put rethrows other errors', async () => {
    blob.put.mockRejectedValue(new Error('boom'));
    await expect(blobStore('t').put('aaaaaaaaaaaa', 'x')).rejects.toThrow('boom');
  });
  it('get bypasses the CDN cache', async () => {
    blob.get.mockResolvedValue(null);
    await blobStore('t').get('aaaaaaaaaaaa');
    expect(blob.get).toHaveBeenCalledWith(
      'captures/aaaaaaaaaaaa.json',
      expect.objectContaining({ useCache: false, access: 'public' }),
    );
  });
  it('get reads the stream, null when missing', async () => {
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: new Response('hello').body });
    expect(await blobStore('t').get('aaaaaaaaaaaa')).toBe('hello');
    blob.get.mockResolvedValueOnce(null);
    expect(await blobStore('t').get('aaaaaaaaaaaa')).toBeNull();
  });
});

describe('captureStore env selection', () => {
  it('token -> blob, dev -> file, prod without token -> null', () => {
    expect(captureStore({ BLOB_READ_WRITE_TOKEN: 't' } as unknown as NodeJS.ProcessEnv)).not.toBeNull();
    expect(captureStore({ NODE_ENV: 'development' } as unknown as NodeJS.ProcessEnv)).not.toBeNull();
    expect(captureStore({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe('loadCapture', () => {
  it('loads and re-validates', async () => {
    const s = memoryStore();
    const json = canonicalCapture(goodCapture());
    const id = await captureId(json);
    await s.put(id, json);
    expect((await loadCapture(id, s))?.slug).toBe('murmuration');
    await s.put('bbbbbbbbbbbb', '{"slug":"x"}');
    await s.put('cccccccccccc', 'not json');
    expect(await loadCapture('bbbbbbbbbbbb', s)).toBeNull();
    expect(await loadCapture('cccccccccccc', s)).toBeNull();
    expect(await loadCapture('zzzzzzzzzzzz', s)).toBeNull();
    expect(await loadCapture('bad', s)).toBeNull();
    expect(await loadCapture(id, null)).toBeNull();
  });

  it('rethrows a storage error instead of reporting "not found"', async () => {
    const failing = { get: vi.fn(async () => { throw new Error('blob outage'); }), put: vi.fn() };
    await expect(loadCapture('aaaaaaaaaaaa', failing)).rejects.toThrow('blob outage');
    expect(failing.get).toHaveBeenCalledWith('aaaaaaaaaaaa');
  });
});

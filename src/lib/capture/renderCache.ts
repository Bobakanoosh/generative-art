import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, put } from '@vercel/blob';
import { defaultCaptureStore } from './store';

export interface PngStore {
  get(key: string): Promise<Buffer | null>;
  put(key: string, png: Buffer): Promise<void>;
}

const KEY_RE = /^[A-Za-z0-9_-]{1,64}-\d{1,5}$/;
function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error('Invalid render key');
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IEND = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
/** Signature at the start and IEND chunk at the end: catches truncated files. */
export function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 16 &&
    PNG_SIG.every((b, i) => buf[i] === b) &&
    PNG_IEND.every((b, i) => buf[buf.length - 8 + i] === b)
  );
}

export function memoryPngStore(): PngStore {
  const m = new Map<string, Buffer>();
  return {
    async get(key) {
      return m.get(key) ?? null;
    },
    async put(key, png) {
      m.set(key, png);
    },
  };
}

export function filePngStore(dir: string): PngStore {
  const file = (key: string) => {
    assertKey(key);
    return path.join(dir, `${key}.png`);
  };
  return {
    async get(key) {
      try {
        const buf = await readFile(file(key));
        return isPng(buf) ? buf : null; // truncated/corrupt file: a miss, re-rendered
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async put(key, png) {
      await mkdir(dir, { recursive: true });
      const dest = file(key);
      const tmp = `${dest}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(tmp, png);
      await rename(tmp, dest); // atomic: readers never see a partial PNG
    },
  };
}

export function blobPngStore(token: string): PngStore {
  const pathname = (key: string) => {
    assertKey(key);
    return `renders/${key}.png`;
  };
  return {
    async get(key) {
      const res = await get(pathname(key), { access: 'public', token, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return Buffer.from(await new Response(res.stream).arrayBuffer());
    },
    async put(key, png) {
      try {
        await put(pathname(key), png, {
          access: 'public',
          token,
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: 'image/png',
        });
      } catch (err) {
        if (!(err instanceof Error) || !/already exists/i.test(err.message)) throw err;
      }
    },
  };
}

/** BLOB_READ_WRITE_TOKEN -> blob; else dev -> .captures/renders; else none. */
export function pngStore(env: NodeJS.ProcessEnv = process.env): PngStore | null {
  if (env.BLOB_READ_WRITE_TOKEN) return blobPngStore(env.BLOB_READ_WRITE_TOKEN);
  if (env.NODE_ENV !== 'production') return filePngStore(path.join('.captures', 'renders'));
  return null;
}

let override: PngStore | null | undefined;

/** Test hook: undefined restores the env default. */
export function __setPngStoreForTests(store: PngStore | null | undefined): void {
  override = store;
}

function defaultPngStore(): PngStore | null {
  if (override !== undefined) return override;
  // Follow the capture store: no capture storage means no render cache either.
  if (defaultCaptureStore() === null) return null;
  return pngStore();
}

/**
 * Capture PNGs are immutable per (id, width): serve a stored one, else render
 * and store it. Storage trouble never fails the request; it just renders.
 */
export async function cachedCaptureRender(
  id: string,
  width: number,
  render: () => Promise<Buffer>,
  store: PngStore | null = defaultPngStore(),
): Promise<Buffer> {
  if (!store) return render();
  const key = `${id}-${width}`;
  try {
    const hit = await store.get(key);
    if (hit) return hit;
  } catch {
    // fall through to render
  }
  const png = await render();
  try {
    await store.put(key, png);
  } catch {
    // best-effort cache
  }
  return png;
}

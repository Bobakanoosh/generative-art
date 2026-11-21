import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, put } from '@vercel/blob';
import { CAPTURE_ID_RE, validateCapture, type CaptureRecord } from './record';

export interface CaptureStore {
  get(id: string): Promise<string | null>;
  put(id: string, json: string): Promise<void>;
}

function assertId(id: string) {
  if (!CAPTURE_ID_RE.test(id)) throw new Error('Invalid capture id');
}

export function memoryStore(): CaptureStore {
  const m = new Map<string, string>();
  return {
    async get(id) {
      return m.get(id) ?? null;
    },
    async put(id, json) {
      if (!m.has(id)) m.set(id, json);
    },
  };
}

export function fileStore(dir: string): CaptureStore {
  const file = (id: string) => {
    assertId(id);
    return path.join(dir, `${id}.json`);
  };
  return {
    async get(id) {
      try {
        return await readFile(file(id), 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async put(id, json) {
      await mkdir(dir, { recursive: true });
      // Content-addressed and immutable: an existing file is left alone.
      try {
        await writeFile(file(id), json, { flag: 'wx' });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      }
    },
  };
}

export function blobStore(token: string): CaptureStore {
  const pathname = (id: string) => {
    assertId(id);
    return `captures/${id}.json`;
  };
  return {
    async get(id) {
      const res = await get(pathname(id), { access: 'public', token, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return await new Response(res.stream).text();
    },
    async put(id, json) {
      try {
        await put(pathname(id), json, {
          access: 'public',
          token,
          addRandomSuffix: false,
          allowOverwrite: false, // captures are immutable once stored
          contentType: 'application/json',
        });
      } catch (err) {
        // Same id means same bytes, so an existing blob is success. This depends on
        // the @vercel/blob error text containing "already exists" (it throws a
        // generic Error with that message, no error code); if a SDK upgrade changes
        // the wording, duplicate saves would start failing: re-check store.test.ts.
        if (!(err instanceof Error) || !/already exists/i.test(err.message)) throw err;
      }
    },
  };
}

/** BLOB_READ_WRITE_TOKEN -> blob; else dev -> files in .captures; else null. */
export function captureStore(env: NodeJS.ProcessEnv = process.env): CaptureStore | null {
  if (env.BLOB_READ_WRITE_TOKEN) return blobStore(env.BLOB_READ_WRITE_TOKEN);
  if (env.NODE_ENV !== 'production') return fileStore('.captures');
  return null;
}

let override: CaptureStore | null | undefined;
let cached: CaptureStore | null | undefined;

/** Test hook: undefined restores the env default. */
export function __setCaptureStoreForTests(store: CaptureStore | null | undefined): void {
  override = store;
}

/** The store routes use: the test override, else the env default. */
export function defaultCaptureStore(): CaptureStore | null {
  if (override !== undefined) return override;
  if (cached === undefined) cached = captureStore();
  return cached;
}

/**
 * The stored capture `id`, or null when there is none (malformed id, no store,
 * missing, or a stored record that no longer parses/validates). A storage
 * failure is thrown, not reported as "not found", so callers can answer with
 * an error and a miss is never cached for what was an outage.
 */
export async function loadCapture(
  id: string,
  store: CaptureStore | null = defaultCaptureStore(),
): Promise<CaptureRecord | null> {
  if (!CAPTURE_ID_RE.test(id) || !store) return null;
  const json = await store.get(id); // storage errors propagate
  if (json === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const checked = validateCapture(raw);
  return checked.ok ? checked.capture : null;
}

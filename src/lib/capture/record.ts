import { validateInputLog, isEmptyLog, type InputLog } from '@/lib/input/log';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import { validateParams } from '@/lib/piece/schema';
import type { Params } from '@/lib/piece/types';
import { getPiece } from '@/pieces';

export interface CaptureRecord {
  slug: string;
  v: number;
  s: string;
  p: Params;
  n: number;
  i: InputLog;
}

/**
 * Request body cap. Fits the largest log a session can record (MAX_INPUT_EVENTS
 * of the widest entries: 16-character key names, or 5-digit pointer coordinates
 * on a portrait canvas, with the most 2-digit step deltas that fit under
 * MAX_STOP_STEP), about 700 KB; see record.test.ts.
 */
export const MAX_CAPTURE_BYTES = 768 * 1024;
export const CAPTURE_ID_RE = /^[A-Za-z0-9_-]{12}$/;

const KEYS = ['slug', 'v', 's', 'p', 'n', 'i'];

/** Fixed key order slug,v,s,p,n,i; p re-ordered by schema key order. */
export function canonicalCapture(c: CaptureRecord): string {
  const piece = getPiece(c.slug, c.v);
  const keys = piece ? Object.keys(piece.schema) : Object.keys(c.p);
  const p: Params = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(c.p, k)) p[k] = c.p[k];
  return JSON.stringify({ slug: c.slug, v: c.v, s: c.s, p, n: c.n, i: { p: c.i.p, k: c.i.k } });
}

/** First 12 chars of base64url(sha256(canonical JSON)). */
export async function captureId(canonicalJson: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson));
  let bin = '';
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 12);
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function validateCapture(
  raw: unknown,
): { ok: true; capture: CaptureRecord } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!isObj(raw)) return fail('Capture must be an object');
  const keys = Object.keys(raw);
  if (keys.length !== KEYS.length || !KEYS.every((k) => Object.prototype.hasOwnProperty.call(raw, k))) {
    return fail('Capture must have exactly the keys slug, v, s, p, n, i');
  }
  const { slug, v, s, p, n, i } = raw;
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > 128) return fail('Invalid slug');
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return fail('Invalid version');
  if (typeof s !== 'string' || s.length < 1 || s.length > 64) return fail('Invalid seed');
  if (!isObj(p)) return fail('Params must be an object');
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_STOP_STEP) {
    return fail(`n must be an integer from 1 to ${MAX_STOP_STEP}`);
  }

  const piece = getPiece(slug, v);
  if (!piece) return fail('Unknown piece or version');
  if (!piece.interactive) return fail('Piece is not interactive');

  for (const k of Object.keys(p)) {
    if (!Object.prototype.hasOwnProperty.call(piece.schema, k)) return fail(`Unknown param "${k}"`);
  }
  const checked = validateParams(piece.schema, p);
  if (checked.issues.length > 0) return fail(`Invalid params: ${checked.issues[0]}`);

  const log = validateInputLog(i, { width: 1000, height: 1000 / piece.aspect, n });
  if (!log.ok) return fail(`Invalid input: ${log.error}`);
  if (isEmptyLog(log.log)) return fail('Empty input log; share a ?g= link instead');

  return { ok: true, capture: { slug, v, s, p: checked.params, n, i: log.log } };
}

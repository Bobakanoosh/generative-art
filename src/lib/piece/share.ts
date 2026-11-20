import type { Generation, Params } from './types';

/**
 * Largest stop step `n` a share code may carry. Enforced in decoding so neither
 * the server renderer nor a visitor's browser can be asked to run an
 * unbounded number of steps by a crafted link.
 */
export const MAX_STOP_STEP = 100_000;

const ALLOWED_KEYS = new Set(['v', 's', 'p', 'n']);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) REVERSE[ALPHABET[i]] = i;

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

function fromBase64Url(code: string): Uint8Array | null {
  if (code.length % 4 === 1) return null;
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of code) {
    const v = REVERSE[ch];
    if (v === undefined) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(bytes);
}

export function encodeGeneration(g: Generation): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(g)));
}

function isPlainObject(x: unknown): x is Params {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Shape check only; validating `p` against a schema is the caller's job.
 *
 * FROZEN (the share-code format is permanent): a code is accepted only in its
 * canonical spelling (re-encoding the bytes must give back the same string, so
 * no trailing bits), as strict UTF-8 without a byte-order mark, as a JSON
 * object with no top-level keys other than v, s, p, n, and with
 * 0 <= n <= MAX_STOP_STEP.
 */
export function decodeGeneration(code: string): Generation | null {
  try {
    const bytes = fromBase64Url(code);
    if (!bytes || toBase64Url(bytes) !== code) return null;
    // ignoreBOM keeps a leading U+FEFF in the output so it can be rejected.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) return null;
    const raw: unknown = JSON.parse(text);
    if (!isPlainObject(raw)) return null;
    for (const key of Object.keys(raw)) if (!ALLOWED_KEYS.has(key)) return null;
    const { v, s, p, n } = raw;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return null;
    if (typeof s !== 'string' || s.length === 0 || s.length > 64) return null;
    if (!isPlainObject(p)) return null;
    if (n !== undefined && (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_STOP_STEP)) {
      return null;
    }
    return n === undefined ? { v, s, p } : { v, s, p, n };
  } catch {
    return null;
  }
}

const SEED_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 10 chars of [a-z0-9]. Rejection sampling avoids modulo bias (252 = 7 * 36). */
export function newSeed(): string {
  let out = '';
  while (out.length < 10) {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 252 && out.length < 10) out += SEED_CHARS[b % 36];
    }
  }
  return out;
}

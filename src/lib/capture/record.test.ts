import { describe, expect, it } from 'vitest';
import { defaultsOf } from '@/lib/piece/schema';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import { getPiece } from '@/pieces';
import { goodCapture as good } from './fixtures';
import {
  MAX_INPUT_EVENTS,
  MAX_KEY_LENGTH,
  POINTER_QUANTUM,
  eventCount,
  validateInputLog,
  type InputLog,
} from '@/lib/input/log';
import { canonicalCapture, captureId, validateCapture, CAPTURE_ID_RE, MAX_CAPTURE_BYTES } from './record';

describe('canonicalCapture / captureId', () => {
  it('is independent of key order and gives a stable id', async () => {
    const a = good();
    const b = JSON.parse(
      JSON.stringify({ i: a.i, n: a.n, p: Object.fromEntries(Object.entries(a.p).reverse()), s: a.s, v: a.v, slug: a.slug }),
    );
    expect(canonicalCapture(b)).toBe(canonicalCapture(a));
    const id = await captureId(canonicalCapture(a));
    expect(id).toMatch(CAPTURE_ID_RE);
    expect(id).toBe(await captureId(canonicalCapture(b)));
    expect(canonicalCapture(a).startsWith('{"slug":"murmuration","v":1,"s":"abc","p":{')).toBe(true);
  });
  it('matches a known sha256 (base64url, 12 chars)', async () => {
    // sha256("abc") = ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=
    expect(await captureId('abc')).toBe('ungWv48Bz-pB');
  });
});

describe('validateCapture', () => {
  it('accepts a good capture', () => {
    expect(validateCapture(good()).ok).toBe(true);
  });
  const bad: [string, (c: Record<string, unknown>) => void][] = [
    ['unknown slug', (c) => { c.slug = 'nope'; }],
    ['unknown version', (c) => { c.v = 99; }],
    ['non-interactive piece', (c) => { c.slug = 'flow-ribbons'; c.p = defaultsOf(getPiece('flow-ribbons', 1)!.schema); }],
    ['extra key', (c) => { c.x = 1; }],
    ['missing key', (c) => { delete c.n; }],
    ['empty seed', (c) => { c.s = ''; }],
    ['long seed', (c) => { c.s = 'a'.repeat(65); }],
    ['non-string seed', (c) => { c.s = 5; }],
    ['n zero', (c) => { c.n = 0; }],
    ['n too big', (c) => { c.n = MAX_STOP_STEP + 1; }],
    ['n fractional', (c) => { c.n = 1.5; }],
    ['p not object', (c) => { c.p = []; }],
    ['param out of range', (c) => { c.p = { ...(c.p as object), count: 99999 }; }],
    ['unknown param', (c) => { c.p = { ...(c.p as object), zzz: 1 }; }],
    ['missing param', (c) => { const p = { ...(c.p as Record<string, unknown>) }; delete p.count; c.p = p; }],
    ['empty log', (c) => { c.i = { p: [], k: [] }; }],
    ['log extra key', (c) => { c.i = { p: [[1, 1, 1, 1]], k: [], z: 1 }; }],
    ['pointer out of bounds', (c) => { c.i = { p: [[1, 999999, 0, 1]], k: [] }; }],
    ['event past n', (c) => { c.i = { p: [[301, 10, 10, 1]], k: [] }; }],
    ['long key string', (c) => { c.i = { p: [], k: [[1, 'x'.repeat(17)]] }; }],
    // Deltas are relative to the previous entry, so an event before its predecessor has a negative delta.
    ['pointer events out of order', (c) => { c.i = { p: [[50, 10, 10, 1], [-20, 20, 20, 1]], k: [] }; }],
    ['key events out of order', (c) => { c.i = { p: [], k: [[50, 'a'], [-20, 'b']] }; }],
    ['pointer events at the same step', (c) => { c.i = { p: [[50, 10, 10, 1], [0, 20, 20, 1]], k: [] }; }],
  ];
  for (const [name, mut] of bad) {
    it(`rejects ${name}`, () => {
      const c = JSON.parse(JSON.stringify(good())) as Record<string, unknown>;
      mut(c);
      expect(validateCapture(c).ok).toBe(false);
    });
  }
  it('rejects null and arrays', () => {
    expect(validateCapture(null).ok).toBe(false);
    expect(validateCapture([1]).ok).toBe(false);
  });
});

describe('MAX_CAPTURE_BYTES vs MAX_INPUT_EVENTS', () => {
  // Worst cases a session can produce: MAX_INPUT_EVENTS events with the widest
  // entries, under portrait (aspect 0.5) bounds, n = MAX_STOP_STEP, a 64-char
  // seed, and as many 2-digit step deltas as fit under the stop step
  // (3-digit deltas buy fewer digits: 999 x 2 extra vs 9999 x 1).
  const LONG_KEY = 'BrowserFavorites'; // the longest named KeyboardEvent.key that fits MAX_KEY_LENGTH
  const bounds = { width: 1000, height: 2000, n: MAX_STOP_STEP };
  const maxQx = bounds.width * POINTER_QUANTUM; // 10000: 5 digits
  const maxQy = bounds.height * POINTER_QUANTUM; // 20000: 5 digits
  /** `count` deltas summing to at most `budget`, with as many 2-digit ones as fit (the rest `min`). */
  const deltas = (count: number, min: 0 | 1, budget = MAX_STOP_STEP - 1) => {
    const twoDigit = Math.min(count, Math.floor((budget - count * min) / (10 - min)));
    return Array.from({ length: count }, (_, j) => (j < twoDigit ? 10 : min));
  };
  const keys = (count: number) => deltas(count, 0).map((d): [number, string] => [d, LONG_KEY]);
  const pointers = (count: number) => deltas(count, 1).map((d) => [d, maxQx, maxQy, 1]);
  const logs: Record<string, InputLog> = {
    'all keys': { p: [], k: keys(MAX_INPUT_EVENTS) },
    'all pointer': { p: pointers(MAX_INPUT_EVENTS), k: [] },
    'half and half': { p: pointers(MAX_INPUT_EVENTS / 2), k: keys(MAX_INPUT_EVENTS / 2) },
  };

  for (const [name, log] of Object.entries(logs)) {
    it(`the largest valid log (${name}) fits the request body cap`, () => {
      expect(LONG_KEY.length).toBe(MAX_KEY_LENGTH);
      expect(eventCount(log)).toBe(MAX_INPUT_EVENTS);
      expect(validateInputLog(log, bounds).ok).toBe(true);
      const capture = { ...good(), s: 'x'.repeat(64), n: MAX_STOP_STEP, i: log };
      const bytes = new TextEncoder().encode(canonicalCapture(capture)).length;
      expect(bytes).toBeLessThanOrEqual(MAX_CAPTURE_BYTES);
    });
  }

  it('the cap is not far above the worst case (a power-of-two-ish 768 KiB)', () => {
    expect(MAX_CAPTURE_BYTES).toBe(768 * 1024);
    const worst = canonicalCapture({ ...good(), s: 'x'.repeat(64), n: MAX_STOP_STEP, i: logs['all keys'] });
    expect(worst.length).toBeGreaterThan(512 * 1024); // why 512 KiB was not enough
  });
});

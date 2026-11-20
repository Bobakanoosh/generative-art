/**
 * Seeded deterministic PRNG: cyrb128 string hash -> sfc32 generator.
 * Uses only 32-bit integer ops (Math.imul, shifts, |0) — bit-identical on
 * every engine. The algorithm is frozen: changing it breaks every share code.
 */
import { TAU, cos, log } from './math';

export interface Rng {
  /** Uniform in [0, 1) with 32-bit resolution. */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number;
  /** true with probability p (default 0.5). */
  bool(p?: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates; returns a new array, input untouched. */
  shuffle<T>(items: readonly T[]): T[];
  /** Normal deviate (Box–Muller). */
  gaussian(mean?: number, sd?: number): number;
  /** Pick by non-negative weight; zero-weight items are never chosen. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
}

/** cyrb128: 128-bit string hash as four uint32 words. */
export function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

const WARMUP = 15;
const INV_2_32 = 1 / 4294967296;

export function createRng(seed: string): Rng {
  let [a, b, c, d] = hashSeed(seed);

  // sfc32, counter variant: `d` (the counter) is incremented BEFORE it is
  // added into `t`. Reference sfc32 adds the old counter and increments after;
  // this order is intentional and FROZEN. Changing it (or WARMUP, or the
  // cyrb128 seeding) changes every image ever shared.
  const next = (): number => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) * INV_2_32;
  };

  for (let i = 0; i < WARMUP; i++) next();

  const int = (min: number, maxExclusive: number): number =>
    min + Math.floor(next() * (maxExclusive - min));

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int,
    bool: (p = 0.5) => next() < p,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      return items[int(0, items.length)];
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    gaussian(mean = 0, sd = 1): number {
      const u1 = 1 - next(); // (0, 1]: log is finite
      const u2 = next();
      return mean + sd * Math.sqrt(-2 * log(u1)) * cos(TAU * u2);
    },
    weighted<T>(items: readonly (readonly [T, number])[]): T {
      let total = 0;
      for (const [, w] of items) if (w > 0) total += w;
      if (!(total > 0)) throw new Error('rng.weighted: no positive weights');
      const r = next() * total;
      let acc = 0;
      let last: T = items[0][0];
      for (const [item, w] of items) {
        if (!(w > 0)) continue;
        acc += w;
        last = item;
        if (r < acc) return item;
      }
      return last; // float round-off guard
    },
  };
}

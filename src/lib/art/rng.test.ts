import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from './rng';

// Recorded once from the implementation, then frozen. Changing these breaks every share code.
const FROZEN: number[] = [0.13283559633418918, 0.09147008298896253, 0.2849536491557956];

describe('hashSeed', () => {
  it('returns four uint32 words, deterministic', () => {
    const h = hashSeed('abc');
    expect(h).toHaveLength(4);
    for (const w of h) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(4294967296);
    }
    expect(hashSeed('abc')).toEqual(h);
    expect(hashSeed('abd')).not.toEqual(h);
  });
});

describe('createRng', () => {
  it('same seed -> identical first 1000 values', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });
  it('different seeds differ', () => {
    const a = createRng('abc');
    const b = createRng('abd');
    const va = Array.from({ length: 10 }, () => a.next());
    const vb = Array.from({ length: 10 }, () => b.next());
    expect(va).not.toEqual(vb);
  });
  it('frozen: first three values of seed "seed" never change', () => {
    const r = createRng('seed');
    expect([r.next(), r.next(), r.next()]).toEqual(FROZEN);
  });
  it('next() in [0, 1)', () => {
    const r = createRng('range');
    for (let i = 0; i < 10_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('int(0, 10) covers 0..9 and never 10', () => {
    const r = createRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const v = r.int(0, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it('range stays within [min, max)', () => {
    const r = createRng('r');
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });
  it('bool respects p extremes and defaults to 0.5', () => {
    const r = createRng('b');
    for (let i = 0; i < 100; i++) {
      expect(r.bool(0)).toBe(false);
      expect(r.bool(1)).toBe(true);
    }
    let t = 0;
    for (let i = 0; i < 10_000; i++) if (r.bool()) t++;
    expect(Math.abs(t / 10_000 - 0.5)).toBeLessThan(0.03);
  });
  it('pick returns an element', () => {
    const r = createRng('p');
    const items = ['x', 'y', 'z'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow();
  });
  it('shuffle returns a new permutation without mutating input', () => {
    const r = createRng('s');
    const src = Array.from({ length: 50 }, (_, i) => i);
    const out = r.shuffle(src);
    expect(out).not.toBe(src);
    expect([...out].sort((a, b) => a - b)).toEqual(src);
    expect(out).not.toEqual(src);
    expect(src).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });
  it('weighted never picks zero-weight items', () => {
    const r = createRng('w');
    for (let i = 0; i < 1000; i++) expect(r.weighted([['a', 0], ['b', 1]])).toBe('b');
  });
  it('gaussian mean of 20,000 draws within 0.05 of 0, sd near 1', () => {
    const r = createRng('g');
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < 20_000; i++) {
      const v = r.gaussian();
      sum += v;
      sq += v * v;
    }
    const mean = sum / 20_000;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(sq / 20_000 - mean * mean) - 1)).toBeLessThan(0.05);
    expect(Number.isFinite(createRng('g2').gaussian(10, 2))).toBe(true);
  });
});

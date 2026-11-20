import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createNoise2D, createNoise3D } from './noise';

describe('noise', () => {
  it('same seed -> same values', () => {
    const a2 = createNoise2D(createRng('n'));
    const b2 = createNoise2D(createRng('n'));
    const a3 = createNoise3D(createRng('n'));
    const b3 = createNoise3D(createRng('n'));
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20;
      const y = i * 0.11 + 3;
      const z = i * -0.23;
      expect(a2(x, y)).toBe(b2(x, y));
      expect(a3(x, y, z)).toBe(b3(x, y, z));
    }
  });
  it('different seeds differ', () => {
    const a = createNoise2D(createRng('n1'));
    const b = createNoise2D(createRng('n2'));
    let diff = 0;
    for (let i = 0; i < 50; i++) if (a(i * 0.3, i * 0.7) !== b(i * 0.3, i * 0.7)) diff++;
    expect(diff).toBeGreaterThan(40);
  });
  it('10,000 samples within [-1, 1]', () => {
    const n2 = createNoise2D(createRng('bounds'));
    const n3 = createNoise3D(createRng('bounds'));
    const r = createRng('pts');
    for (let i = 0; i < 10_000; i++) {
      const x = r.range(-100, 100);
      const y = r.range(-100, 100);
      const z = r.range(-100, 100);
      const v2 = n2(x, y);
      const v3 = n3(x, y, z);
      expect(v2).toBeGreaterThanOrEqual(-1);
      expect(v2).toBeLessThanOrEqual(1);
      expect(v3).toBeGreaterThanOrEqual(-1);
      expect(v3).toBeLessThanOrEqual(1);
    }
  });
  it('is continuous: points 0.001 apart differ by < 0.01', () => {
    const n2 = createNoise2D(createRng('cont'));
    const n3 = createNoise3D(createRng('cont'));
    const r = createRng('cpts');
    for (let i = 0; i < 2000; i++) {
      const x = r.range(-50, 50);
      const y = r.range(-50, 50);
      const z = r.range(-50, 50);
      expect(Math.abs(n2(x, y) - n2(x + 0.001, y))).toBeLessThan(0.01);
      expect(Math.abs(n2(x, y) - n2(x, y + 0.001))).toBeLessThan(0.01);
      expect(Math.abs(n3(x, y, z) - n3(x + 0.001, y, z))).toBeLessThan(0.01);
      expect(Math.abs(n3(x, y, z) - n3(x, y, z + 0.001))).toBeLessThan(0.01);
    }
  });
  it('varies and uses a decent part of the range', () => {
    const n2 = createNoise2D(createRng('var'));
    const n3 = createNoise3D(createRng('var'));
    const vals = new Set<number>();
    let max2 = 0;
    let max3 = 0;
    for (let i = 0; i < 5000; i++) {
      const v = n2(i * 0.31, i * 0.17);
      vals.add(v);
      max2 = Math.max(max2, Math.abs(v));
      max3 = Math.max(max3, Math.abs(n3(i * 0.31, i * 0.17, i * 0.07)));
    }
    expect(vals.size).toBeGreaterThan(4900);
    expect(max2).toBeGreaterThan(0.5);
    expect(max3).toBeGreaterThan(0.5);
  });
});

import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { defaultsOf } from '@/lib/piece/schema';
import { callLog } from '@/lib/piece/testing/callLog';
import type { Params, PieceDefinition } from '@/lib/piece/types';
import tangentField from './index';

interface S { m: Float64Array; len: Float64Array; color: Uint8Array; colors: string[]; steps: number }
const piece = tangentField as unknown as PieceDefinition<S>;
const params = (p: Partial<Params> = {}): Params => ({ ...defaultsOf(piece.schema), ...p });
const build = (p: Partial<Params> = {}, seed = 'field') => piece.setup(params(p), createRng(seed));

describe('tangent-field v1', () => {
  it('without shear every stroke is a plain rotation inside the 400-unit canvas', () => {
    const s = build({ count: 2000 });
    for (let i = 0; i < 2000; i++) {
      const [a, b, c, d, e, f] = s.m.subarray(i * 6, i * 6 + 6);
      expect(a * a + b * b).toBeCloseTo(1, 9);
      expect(a * d - b * c).toBeCloseTo(1, 9);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThan(400);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(400);
    }
  });

  it('shear compounds per stroke but preserves area', () => {
    const s = build({ count: 5000, shear: 720 });
    const det = (i: number) => s.m[i * 6] * s.m[i * 6 + 3] - s.m[i * 6 + 1] * s.m[i * 6 + 2];
    expect(det(0)).toBeCloseTo(1, 9);
    expect(det(4999)).toBeCloseTo(1, 6);
    // The last stroke has been swung away from a plain rotation.
    const [a, b] = s.m.subarray(4999 * 6, 4999 * 6 + 2);
    expect(Math.abs(a * a + b * b - 1)).toBeGreaterThan(1e-3);
  });

  it('draws each stroke once with lengths up to the max', () => {
    const s = build({ count: 3000, maxLength: 20 });
    expect(Math.max(...s.len)).toBeLessThan(20);
    const log = callLog();
    for (let i = 0; i < s.steps; i++) piece.step(log.ctx, s, i, { pointer: null, keys: [] });
    expect(log.count('stroke')).toBe(3000);
    expect(s.steps).toBeLessThanOrEqual(300);
  });

  it('a one-colour palette draws no colour from the rng', () => {
    const one = build({ count: 500 });
    expect(one.colors).toHaveLength(1);
    expect([...one.color].every((c) => c === 0)).toBe(true);
    const two = build({ count: 500, palette: ['#ff0000', '#0000ff'] });
    expect(new Set(two.color).size).toBe(2);
  });
});

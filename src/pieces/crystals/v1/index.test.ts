import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { defaultsOf } from '@/lib/piece/schema';
import { callLog } from '@/lib/piece/testing/callLog';
import type { Params, PieceDefinition } from '@/lib/piece/types';
import crystals from './index';

interface Op { crystal: { x: number; y: number }; layer: { kind: string } }
interface S { ops: Op[]; scale: number }
const piece = crystals as unknown as PieceDefinition<S>;
const params = (p: Partial<Params> = {}): Params => ({ ...defaultsOf(piece.schema), ...p });
const build = (p: Partial<Params> = {}, seed = 'crystal') => piece.setup(params(p), createRng(seed));
const H = 1000 / piece.aspect;

function layersPerCrystal(s: S) {
  const counts = new Map<string, number>();
  for (const op of s.ops) {
    const key = `${op.crystal.x},${op.crystal.y}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

describe('crystals v1', () => {
  it('the default grid is 3 x 4 and every crystal has 2 to 4 layers', () => {
    const s = build();
    const counts = layersPerCrystal(s);
    expect(counts.size).toBe(12);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThanOrEqual(2);
      expect(c).toBeLessThanOrEqual(4);
    }
  });

  it('swapped min/max layers are treated as a range', () => {
    const s = build({ minLayers: 5, maxLayers: 1 });
    for (const c of layersPerCrystal(s).values()) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(5);
    }
  });

  it('every crystal sits fully inside the frame, for every column count', () => {
    for (let columns = 1; columns <= 8; columns++) {
      const s = build({ columns });
      const r = (150 / 2) * s.scale;
      for (const { crystal } of s.ops) {
        expect(crystal.x - r).toBeGreaterThanOrEqual(0);
        expect(crystal.x + r).toBeLessThanOrEqual(1000);
        expect(crystal.y - r).toBeGreaterThanOrEqual(0);
        expect(crystal.y + r).toBeLessThanOrEqual(H);
      }
    }
  });

  it('draws one layer per step, each in its own saved transform', () => {
    const s = build();
    expect(piece.steps(s)).toBe(s.ops.length);
    const log = callLog();
    for (let i = 0; i < s.ops.length; i++) piece.step(log.ctx, s, i, { pointer: null, keys: [] });
    expect(log.count('save')).toBe(s.ops.length);
    expect(log.count('restore')).toBe(s.ops.length);
  });

  it('every layer kind shows up across a large grid', () => {
    const kinds = new Set(build({ columns: 8 }).ops.map((o) => o.layer.kind));
    expect([...kinds].sort()).toEqual(['centered', 'circles', 'dots', 'hexagons', 'lines', 'outline', 'ring']);
  });
});

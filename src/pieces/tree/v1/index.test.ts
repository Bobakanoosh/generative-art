import { describe, expect, it } from 'vitest';
import { PI, atan2 } from '@/lib/art/math';
import { createRng } from '@/lib/art/rng';
import { defaultsOf } from '@/lib/piece/schema';
import type { Params, PieceDefinition } from '@/lib/piece/types';
import tree from './index';

type Op =
  | { kind: 'ring'; x: number; y: number; d: number; color: string }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number; color: string };
interface S { ops: Op[]; k: number; tx: number; ty: number; weight: number }
const piece = tree as unknown as PieceDefinition<S>;
const params = (p: Partial<Params> = {}): Params => ({ ...defaultsOf(piece.schema), ...p });
const build = (p: Partial<Params> = {}, seed = 'tree') => piece.setup(params(p), createRng(seed));

describe('tree v1', () => {
  it('starts with the root ring at the sketch centre, in the second palette colour', () => {
    const s = build();
    expect(s.ops[0]).toEqual({ kind: 'ring', x: 1000, y: 1000, d: 70, color: '#688a94' });
  });

  it('a fitted tree lies inside the frame', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const s = build({ branches: 6, maxDist: 600 }, seed);
      const pad = s.weight / 2;
      const inFrame = (x: number, y: number, r: number) => {
        const px = s.tx + x * s.k;
        const py = s.ty + y * s.k;
        expect(px - r * s.k).toBeGreaterThanOrEqual(-1e-6);
        expect(px + r * s.k).toBeLessThanOrEqual(1000 + 1e-6);
        expect(py - r * s.k).toBeGreaterThanOrEqual(-1e-6);
        expect(py + r * s.k).toBeLessThanOrEqual(1000 + 1e-6);
      };
      for (const op of s.ops) {
        if (op.kind === 'ring') inFrame(op.x, op.y, Math.abs(op.d) / 2 + pad);
        else {
          inFrame(op.x0, op.y0, pad);
          inFrame(op.x1, op.y1, pad);
        }
      }
    }
  });

  it('fit off keeps the sketch scale centred on the root', () => {
    const s = build({ fit: false, zoom: 1 });
    expect(s.k).toBe(0.5);
    expect(s.tx + 1000 * s.k).toBe(500);
    expect(s.ty + 1000 * s.k).toBe(500);
  });

  it('alternates colours by generation: a line and its child ring differ', () => {
    const s = build();
    for (let i = 0; i < s.ops.length - 1; i++) {
      const a = s.ops[i];
      const b = s.ops[i + 1];
      if (a.kind === 'line' && b.kind === 'ring') expect(b.color).not.toBe(a.color);
    }
  });

  it('always terminates, and one step draws one op', () => {
    const s = build({ branches: 7 });
    expect(piece.steps(s)).toBe(s.ops.length);
    expect(s.ops.filter((o) => o.kind === 'ring').length).toBeLessThanOrEqual(4000);
  });

  it('margin 45 fixes the arm angles: only the reach varies', () => {
    // With margin 45 and spread 180 the root's arms leave at 45 + 45k degrees,
    // rotated a further 45 by the diagonal step, so each root line points along
    // 90 + 45k degrees.
    const s = build();
    const rootLines = s.ops.filter(
      (o) => o.kind === 'line' && (o.x0 - 1000) ** 2 + (o.y0 - 1000) ** 2 < 60 ** 2,
    ) as Extract<Op, { kind: 'line' }>[];
    const deg = (l: Extract<Op, { kind: 'line' }>) =>
      (Math.round((atan2(l.y1 - l.y0, l.x1 - l.x0) * 180) / PI) + 360) % 360;
    expect(rootLines.map(deg)).toEqual([90, 135, 180, 225]);
  });
});

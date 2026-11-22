import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { defaultsOf } from '@/lib/piece/schema';
import { callLog } from '@/lib/piece/testing/callLog';
import type { Params, PieceDefinition } from '@/lib/piece/types';
import bezierDrift from './index';

interface S { r1: Float64Array; r2: Float64Array }
const piece = bezierDrift as unknown as PieceDefinition<S>;
const params = (p: Partial<Params> = {}): Params => ({ ...defaultsOf(piece.schema), ...p });
const build = (p: Partial<Params> = {}, seed = 'bez') => piece.setup(params(p), createRng(seed));

describe('bezier-drift v1', () => {
  it('one step per frame, two curves per step', () => {
    const s = build({ frames: 90 });
    expect(piece.steps(s)).toBe(90);
    const log = callLog();
    for (let i = 0; i < 90; i++) piece.step(log.ctx, s, i, { pointer: null, keys: [] });
    expect(log.count('bezierCurveTo')).toBe(180);
  });

  it('random control points stay in the sketch ranges at jitter 1 and collapse at jitter 0', () => {
    const s = build({ frames: 500 });
    expect(Math.min(...s.r1)).toBeGreaterThanOrEqual(900);
    expect(Math.max(...s.r1)).toBeLessThan(1000);
    expect(Math.min(...s.r2)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...s.r2)).toBeLessThan(1000);
    const still = build({ frames: 50, jitter: 0 });
    expect(new Set(still.r1)).toEqual(new Set([950]));
    expect(new Set(still.r2)).toEqual(new Set([500]));
  });

  it('the tangent end stays finite at 90 degrees', () => {
    const s = build({ frames: 100 });
    const log = callLog();
    for (let i = 0; i < 100; i++) piece.step(log.ctx, s, i, { pointer: null, keys: [] });
    const ends = log.calls.filter((c) => c.name === 'moveTo' || c.name === 'bezierCurveTo').flatMap((c) => c.args as number[]);
    expect(ends.every(Number.isFinite)).toBe(true);
    const at90 = log.calls.filter((c) => c.name === 'moveTo')[90 * 2].args as number[];
    expect(Math.abs(at90[0])).toBe(100000);
  });

  it('is marked as accumulating', () => {
    expect(piece.accumulates).toBe(true);
  });
});

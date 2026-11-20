import { describe, it, expect } from 'vitest';
import { createRunner, renderGeneration, logicalHeight } from './runner';
import { createRng } from '@/lib/art/rng';
import type { PieceDefinition, Params } from '@/lib/piece/types';

function fakeCtx(width = 1000, height = 800) {
  const calls: { op: string; args: number[] }[] = [];
  const ctx = {
    canvas: { width, height },
    setTransform: (...args: number[]) => calls.push({ op: 'setTransform', args }),
    clearRect: (...args: number[]) => calls.push({ op: 'clearRect', args }),
    fillRect: (...args: number[]) => calls.push({ op: 'fillRect', args }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function fakePiece(total: number = 5) {
  const seen = { stepIdx: [] as number[], params: null as Params | null, first: 0 };
  const piece = {
    slug: 'fake',
    version: 1,
    title: 'Fake',
    aspect: 1.6,
    schema: { size: { kind: 'integer', default: 7, min: 1, max: 10, label: 'Size' } },
    featured: [],
    setup(params: Params, rng: { next(): number }) {
      seen.params = params;
      seen.first = rng.next();
      return {};
    },
    step(ctx: CanvasRenderingContext2D, _s: unknown, i: number) {
      seen.stepIdx.push(i);
      ctx.fillRect(i * 10, 0, 10, 10);
    },
    steps: () => total,
  } as unknown as PieceDefinition;
  return { piece, seen };
}

const gen = { v: 1, s: 'seed', p: {} };

describe('runner', () => {
  it('computes logical height', () => {
    expect(logicalHeight(fakePiece().piece)).toBeCloseTo(625);
  });

  it('runs steps in order with validated params and seeded rng', () => {
    const { piece, seen } = fakePiece();
    const { ctx } = fakeCtx();
    renderGeneration(piece, gen, ctx, 1000);
    expect(seen.stepIdx).toEqual([0, 1, 2, 3, 4]);
    expect(seen.params).toEqual({ size: 7 });
    expect(seen.first).toBe(createRng('seed').next());
  });

  it('clears full canvas in pixel space first', () => {
    const { piece } = fakePiece();
    const { ctx, calls } = fakeCtx(640, 400);
    renderGeneration(piece, gen, ctx, 640);
    expect(calls[0]).toEqual({ op: 'setTransform', args: [1, 0, 0, 1, 0, 0] });
    expect(calls[1]).toEqual({ op: 'clearRect', args: [0, 0, 640, 400] });
  });

  function lastTransformBeforeFirstFill(calls: { op: string; args: number[] }[]) {
    const idx = calls.findIndex((c) => c.op === 'fillRect');
    return calls.slice(0, idx).reverse().find((c) => c.op === 'setTransform')!.args;
  }

  it('scales by width / 1000', () => {
    for (const [w, s] of [[500, 0.5], [2000, 2]] as const) {
      const { piece } = fakePiece();
      const { ctx, calls } = fakeCtx(w, w);
      renderGeneration(piece, gen, ctx, w);
      expect(lastTransformBeforeFirstFill(calls)).toEqual([s, 0, 0, s, 0, 0]);
    }
  });

  it('applies tile scale and translate', () => {
    const { piece } = fakePiece();
    const { ctx, calls } = fakeCtx(1000, 1250);
    renderGeneration(piece, gen, ctx, 1000, { x: 500, y: 0, w: 500, h: 625 });
    expect(lastTransformBeforeFirstFill(calls)).toEqual([2, 0, 0, 2, -1000, 0]);
  });

  it('resets transform before every step', () => {
    const { piece } = fakePiece();
    const { ctx, calls } = fakeCtx();
    renderGeneration(piece, gen, ctx, 1000);
    const ops = calls.map((c) => c.op);
    const fills = ops.map((o, i) => (o === 'fillRect' ? i : -1)).filter((i) => i >= 0);
    for (const i of fills) expect(ops[i - 1]).toBe('setTransform');
  });

  it('honours gen.n', () => {
    const { piece, seen } = fakePiece();
    renderGeneration(piece, { ...gen, n: 3 }, fakeCtx().ctx, 1000);
    expect(seen.stepIdx).toEqual([0, 1, 2]);
  });

  it('clamps gen.n to the end of a finite build', () => {
    const { piece, seen } = fakePiece(5);
    const r = createRunner(piece, { ...gen, n: 50 }, fakeCtx().ctx, 1000);
    expect(r.total).toBe(5);
    r.finish();
    expect(seen.stepIdx).toEqual([0, 1, 2, 3, 4]);
  });

  it('advances incrementally and clamps', () => {
    const { piece } = fakePiece();
    const r = createRunner(piece, gen, fakeCtx().ctx, 1000);
    expect(r.total).toBe(5);
    r.advance(2);
    expect(r.index).toBe(2);
    expect(r.done).toBe(false);
    r.advance(10);
    expect(r.index).toBe(5);
    expect(r.done).toBe(true);
  });

  it('throws for endless piece without n', () => {
    const { piece } = fakePiece(Infinity);
    expect(() => createRunner(piece, gen, fakeCtx().ctx, 1000)).toThrow('Endless piece requires a stop step');
    expect(() => createRunner(piece, { ...gen, n: 2 }, fakeCtx().ctx, 1000)).not.toThrow();
    expect(createRunner(piece, { ...gen, n: 2 }, fakeCtx().ctx, 1000).total).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { callLog } from '@/lib/piece/testing/callLog';
import type { PieceDefinition } from '@/lib/piece/types';
import { gatedContext, renderFinal } from './fastForward';

/** A tiny endless piece that draws one rect per step at x = i. */
function piece(fastForward?: PieceDefinition['fastForward']): PieceDefinition<{ seen: number[] }> {
  return {
    slug: 't', version: 1, title: 'T', aspect: 1, featured: ['x'],
    schema: { keep: { kind: 'integer', default: 3, min: 0, max: 100, label: 'Keep' } },
    setup: () => ({ seen: [] }),
    step: (ctx, s, i) => {
      s.seen.push(i);
      ctx.fillRect(i, 0, 1, 1);
    },
    steps: () => Infinity,
    fastForward,
  };
}
const rects = (log: ReturnType<typeof callLog>) => log.calls.filter((c) => c.name === 'fillRect').map((c) => c.args[0]);

describe('gatedContext', () => {
  it('forwards calls and property sets until muted, then drops them', () => {
    const log = callLog();
    const gate = gatedContext(log.ctx);
    gate.ctx.fillRect(1, 1, 1, 1);
    gate.ctx.fillStyle = 'red';
    gate.setMuted(true);
    gate.ctx.fillRect(2, 2, 2, 2);
    gate.ctx.fillStyle = 'blue';
    gate.setMuted(false);
    expect(rects(log)).toEqual([1]);
    expect(log.ctx.fillStyle).toBe('red');
  });
});

describe('renderFinal', () => {
  it('without fastForward draws every step', () => {
    const log = callLog();
    renderFinal(piece(), { v: 1, s: 'a', p: {}, n: 6 }, log.ctx, 100);
    expect(rects(log)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('runs every step but draws only the kept ones, after priming', () => {
    const log = callLog();
    const primed: number[] = [];
    const p = piece({
      keep: (params) => params.keep as number,
      prime: (ctx) => {
        primed.push(log.calls.length);
        ctx.fillRect(-1, 0, 1, 1);
      },
    });
    renderFinal(p, { v: 1, s: 'a', p: { keep: 2 }, n: 6 }, log.ctx, 100);
    expect(rects(log)).toEqual([-1, 4, 5]);
    expect(primed).toHaveLength(1);
  });

  it('does not prime when nothing is skipped, and falls back when keep is undefined', () => {
    const log = callLog();
    const prime = () => {
      throw new Error('primed');
    };
    renderFinal(piece({ keep: () => 10, prime }), { v: 1, s: 'a', p: {}, n: 4 }, log.ctx, 100);
    expect(rects(log)).toEqual([0, 1, 2, 3]);
    const log2 = callLog();
    renderFinal(piece({ keep: () => undefined, prime }), { v: 1, s: 'a', p: {}, n: 4 }, log2.ctx, 100);
    expect(rects(log2)).toEqual([0, 1, 2, 3]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { PieceDefinition } from '@/lib/piece/types';
import flowRibbonsV1 from '@/pieces/flow-ribbons/v1';
import murmurationV1 from '@/pieces/murmuration/v1';
import { defaultsOf } from '@/lib/piece/schema';
import { isLive } from './live';

function piece(over: Partial<PieceDefinition<{ total: number }>>): PieceDefinition {
  return {
    slug: 'fake',
    version: 1,
    title: 'Fake',
    aspect: 1,
    schema: { total: { kind: 'integer', default: 10, min: 0, max: 1_000_000, label: 'Total' } },
    featured: [],
    setup: (p: Record<string, unknown>) => ({ total: (p.total as number) === 0 ? Infinity : (p.total as number) }),
    steps: (s: { total: number }) => s.total,
    step: () => {},
    ...over,
  } as PieceDefinition;
}

describe('isLive', () => {
  it('a finite, non-interactive piece is not live', () => {
    expect(isLive(piece({}), { v: 1, s: 'a', p: { total: 10 } })).toBe(false);
    expect(isLive(flowRibbonsV1 as PieceDefinition, { v: 1, s: 'a', p: defaultsOf(flowRibbonsV1.schema) })).toBe(false);
  });

  it('an endless piece is live (steps not finite for these params/seed)', () => {
    expect(isLive(piece({}), { v: 1, s: 'a', p: { total: 0 } })).toBe(true);
    expect(isLive(piece({ steps: () => NaN }), { v: 1, s: 'a', p: {} })).toBe(true);
  });

  it('an interactive piece is live even when finite, without running setup', () => {
    const setup = vi.fn(() => ({ total: 5 }));
    expect(isLive(piece({ interactive: true, setup }), { v: 1, s: 'a', p: {} })).toBe(true);
    expect(setup).not.toHaveBeenCalled();
  });

  it('validates params before setup and ignores n', () => {
    // total is clamped to the schema range: -5 -> 0 -> endless
    expect(isLive(piece({}), { v: 1, s: 'a', p: { total: -5 }, n: 3 })).toBe(true);
    // invalid -> default 10 -> finite
    expect(isLive(piece({}), { v: 1, s: 'a', p: { total: 'x' } })).toBe(false);
  });

  it('murmuration is live', () => {
    expect(isLive(murmurationV1 as PieceDefinition, { v: 1, s: 'a', p: defaultsOf(murmurationV1.schema) })).toBe(true);
  });
});

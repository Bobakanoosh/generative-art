import { describe, expect, it } from 'vitest';
import { defaultsOf } from '@/lib/piece/schema';
import { decodeGeneration, encodeGeneration } from '@/lib/piece/share';
import type { PieceDefinition } from '@/lib/piece/types';
import { getPiece } from '@/pieces';
import { ogCode } from './ogCode';

const murmuration = getPiece('murmuration', 1)!;
const flowRibbons = getPiece('flow-ribbons', 1)!;

describe('ogCode', () => {
  it("keeps a build piece's own valid code (with or without n)", () => {
    const code = encodeGeneration({ v: 1, s: 'abc', p: defaultsOf(flowRibbons.schema) });
    expect(ogCode('flow-ribbons', code)).toBe(code);
    const stopped = encodeGeneration({ v: 1, s: 'abc', p: defaultsOf(flowRibbons.schema), n: 0 });
    expect(ogCode('flow-ribbons', stopped)).toBe(stopped);
  });

  it('keeps a live piece code that has a stop step (a captured moment)', () => {
    const code = encodeGeneration({ v: 1, s: 'abc', p: defaultsOf(murmuration.schema), n: 600 });
    expect(ogCode('murmuration', code)).toBe(code);
  });

  it('falls back to the first featured code for a live link without n (or n = 0)', () => {
    const live = encodeGeneration({ v: 1, s: 'abc', p: defaultsOf(murmuration.schema) });
    expect(ogCode('murmuration', live)).toBe(murmuration.featured[0]);
    const zero = encodeGeneration({ v: 1, s: 'abc', p: defaultsOf(murmuration.schema), n: 0 });
    expect(ogCode('murmuration', zero)).toBe(murmuration.featured[0]);
    // The fallback itself is renderable: it carries a stop step.
    expect(decodeGeneration(ogCode('murmuration', live))!.n).toBeGreaterThan(0);
  });

  it('falls back for a missing, malformed or unknown-version code', () => {
    expect(ogCode('murmuration', null)).toBe(murmuration.featured[0]);
    expect(ogCode('murmuration', 'not-a-code')).toBe(murmuration.featured[0]);
    const v9 = encodeGeneration({ v: 9, s: 'abc', p: {}, n: 5 });
    expect(ogCode('flow-ribbons', v9)).toBe(flowRibbons.featured[0]);
  });

  it('an endless (non-interactive) piece without n falls back; one whose setup throws keeps its code', () => {
    const base = {
      slug: 'e', version: 1, title: 'E', aspect: 1, featured: ['FEATURED'],
      schema: { total: { kind: 'integer', default: 0, min: 0, max: 10, label: 'Total' } },
      step: () => {},
    } as const;
    const endless = { ...base, setup: (p: Record<string, unknown>) => p.total, steps: (t: number) => (t ? t : Infinity) };
    const lookup = () => endless as unknown as PieceDefinition;
    const forever = encodeGeneration({ v: 1, s: 'a', p: { total: 0 } });
    const finite = encodeGeneration({ v: 1, s: 'a', p: { total: 3 } });
    expect(ogCode('e', forever, lookup)).toBe('FEATURED');
    expect(ogCode('e', finite, lookup)).toBe(finite);
    const throwing = { ...endless, setup: () => { throw new Error('boom'); } };
    expect(ogCode('e', forever, () => throwing as unknown as PieceDefinition)).toBe(forever);
  });
});

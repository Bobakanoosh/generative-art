import { describe, expect, it } from 'vitest';
import type { PieceDefinition } from '@/lib/piece/types';
import { renderPng } from './server';

const piece = {
  slug: 'fake', version: 1, title: 'Fake', aspect: 1, schema: {}, featured: [],
  setup: () => ({}),
  step(ctx: CanvasRenderingContext2D, _s: unknown, _i: number, input: { pointer: { x: number; y: number } | null }) {
    if (input.pointer) {
      ctx.fillStyle = '#f00';
      ctx.fillRect(input.pointer.x, input.pointer.y, 100, 100);
    }
  },
  steps: () => 10,
} as unknown as PieceDefinition;

describe('renderPng input', () => {
  it('draws at the replayed pointer; differs from no log', async () => {
    const gen = { v: 1, s: 'x', p: {} };
    const plain = await renderPng(piece, gen, 100);
    const withLog = await renderPng(piece, gen, 100, { p: [[2, 3000, 3000, 1]], k: [] });
    const again = await renderPng(piece, gen, 100, { p: [[2, 3000, 3000, 1]], k: [] });
    expect(withLog.equals(plain)).toBe(false);
    expect(withLog.equals(again)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { encodeGeneration, MAX_STOP_STEP as SHARE_MAX_STOP_STEP } from '@/lib/piece/share';
import { defaultsOf } from '@/lib/piece/schema';
import { registerPieces } from '@/lib/piece/registry';
import type { PieceDefinition } from '@/lib/piece/types';
import { getPiece } from '@/pieces';
import {
  MAX_CODE_LENGTH,
  MAX_LONG_EDGE,
  MAX_PIXELS,
  MAX_STOP_STEP,
  fitRenderWidth,
  parseRenderRequest,
} from './parseRenderRequest';

function shapedPiece(slug: string, aspect: number): PieceDefinition {
  return { slug, version: 1, title: slug, aspect, schema: {}, featured: [], setup: () => null, step: () => {}, steps: () => 1 };
}
// Test-only pieces in this file's own module instance of the registry.
registerPieces([shapedPiece('test-tall', 0.25), shapedPiece('test-wide', 4)]);

const piece = getPiece('flow-ribbons')!;
const goodCode = encodeGeneration({ v: 1, s: 'abc', p: defaultsOf(piece.schema) as never });

function q(o: Record<string, string>) {
  return new URLSearchParams(o);
}

describe('parseRenderRequest', () => {
  it('accepts a valid request with default width 1200', () => {
    const r = parseRenderRequest(q({ slug: 'flow-ribbons', g: goodCode }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.width).toBe(1200);
      expect(r.piece.slug).toBe('flow-ribbons');
      expect(r.gen.s).toBe('abc');
    }
  });

  it.each([['0'], ['-5'], ['abc'], ['']])('w=%s falls back to 1200', (w) => {
    const r = parseRenderRequest(q({ slug: 'flow-ribbons', g: goodCode, w }));
    expect(r.ok && r.width).toBe(1200);
  });

  it('snaps width up the ladder (min 256) and the long edge to 4096 (flow-ribbons is 4:5, so height is the long edge)', () => {
    const hi = parseRenderRequest(q({ slug: 'flow-ribbons', g: goodCode, w: '999999' }));
    const lo = parseRenderRequest(q({ slug: 'flow-ribbons', g: goodCode, w: '10' }));
    expect(hi.ok && hi.width).toBe(3277);
    expect(lo.ok && lo.width).toBe(256);
  });

  it.each([['1e3', 1200], ['12.7', 256], ['800.6', 1200], [' 800 ', 800]])('w=%s parses to %i', (w, want) => {
    const r = parseRenderRequest(q({ slug: 'flow-ribbons', g: goodCode, w }));
    expect(r.ok && r.width).toBe(want);
  });

  it('400 on missing slug', () => {
    const r = parseRenderRequest(q({ g: goodCode }));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('404 on unknown slug', () => {
    const r = parseRenderRequest(q({ slug: 'nope', g: goodCode }));
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('400 on missing or garbage g', () => {
    expect(parseRenderRequest(q({ slug: 'flow-ribbons' }))).toMatchObject({ ok: false, status: 400 });
    expect(parseRenderRequest(q({ slug: 'flow-ribbons', g: '!!!x' }))).toMatchObject({ ok: false, status: 400 });
  });

  it('404 on unknown version', () => {
    const g = encodeGeneration({ v: 99, s: 'abc', p: {} as never });
    expect(parseRenderRequest(q({ slug: 'flow-ribbons', g }))).toMatchObject({ ok: false, status: 404 });
  });

  it('ok with out-of-range params (renderer clamps)', () => {
    const g = encodeGeneration({ v: 1, s: 'abc', p: { particles: 1e9 } as never });
    expect(parseRenderRequest(q({ slug: 'flow-ribbons', g })).ok).toBe(true);
  });

  it('400 when n exceeds MAX_STOP_STEP, ok at the cap', () => {
    const over = encodeGeneration({ v: 1, s: 'a', p: {} as never, n: MAX_STOP_STEP + 1 });
    const at = encodeGeneration({ v: 1, s: 'a', p: {} as never, n: MAX_STOP_STEP });
    expect(parseRenderRequest(q({ slug: 'flow-ribbons', g: over }))).toMatchObject({ ok: false, status: 400 });
    expect(parseRenderRequest(q({ slug: 'flow-ribbons', g: at })).ok).toBe(true);
  });

  it('400 when g exceeds MAX_CODE_LENGTH', () => {
    const g = 'A'.repeat(MAX_CODE_LENGTH + 1);
    expect(parseRenderRequest(q({ slug: 'flow-ribbons', g }))).toMatchObject({ ok: false, status: 400 });
  });

  it('re-exports the share-code stop-step cap', () => {
    expect(MAX_STOP_STEP).toBe(SHARE_MAX_STOP_STEP);
  });

  it('caps the long edge and pixel count', () => {
    expect(MAX_LONG_EDGE).toBe(4096);
    expect(MAX_PIXELS).toBe(16_777_216);
  });

  it('clamps width so a tall piece stays within the long-edge cap', () => {
    const g = encodeGeneration({ v: 1, s: 'a', p: {} });
    const r = parseRenderRequest(q({ slug: 'test-tall', g, w: '4096' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const h = Math.round(r.width / 0.25);
      expect(h).toBeLessThanOrEqual(MAX_LONG_EDGE);
      expect(r.width * h).toBeLessThanOrEqual(MAX_PIXELS);
      expect(r.width).toBe(1024);
    }
    // the default width is clamped too
    const d = parseRenderRequest(q({ slug: 'test-tall', g }));
    expect(d.ok && d.width).toBe(1024);
  });

  it('a wide piece keeps the full 4096 width', () => {
    const g = encodeGeneration({ v: 1, s: 'a', p: {} });
    const r = parseRenderRequest(q({ slug: 'test-wide', g, w: '999999' }));
    expect(r.ok && r.width).toBe(4096);
    if (r.ok) expect(r.width * Math.round(r.width / 4)).toBeLessThanOrEqual(MAX_PIXELS);
  });
});

describe('fitRenderWidth', () => {
  it.each([0.25, 0.3, 0.5, 0.8, 1, 1.6, 4, 0.999, 1.001])('aspect %f: both caps hold at any requested width', (aspect) => {
    for (const want of [1, 16, 1000, 4096, 1e6]) {
      const w = fitRenderWidth(want, aspect);
      const h = Math.round(w / aspect);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(Math.max(1, Math.min(want, MAX_LONG_EDGE)));
      expect(h).toBeLessThanOrEqual(MAX_LONG_EDGE);
      expect(w * h).toBeLessThanOrEqual(MAX_PIXELS);
    }
  });

  it('leaves in-range widths alone', () => {
    expect(fitRenderWidth(1200, 0.8)).toBe(1200);
    expect(fitRenderWidth(4096, 4)).toBe(4096);
  });

  it('is as large as the caps allow', () => {
    expect(fitRenderWidth(4096, 0.8)).toBe(3277); // height round(4096.25) = 4096
    expect(fitRenderWidth(4096, 0.25)).toBe(1024);
  });
});

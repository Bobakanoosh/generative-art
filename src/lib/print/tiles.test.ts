import { describe, expect, it } from 'vitest';
import { flattenOnPaper, planTiles, withBleed, type PrintTile } from './tiles';

function grid(tiles: PrintTile[]) {
  const xs = [...new Set(tiles.map((t) => t.px.x))].sort((a, b) => a - b);
  const ys = [...new Set(tiles.map((t) => t.px.y))].sort((a, b) => a - b);
  const at = (x: number, y: number) => tiles.find((t) => t.px.x === x && t.px.y === y)!;
  return { xs, ys, at };
}

describe('planTiles', () => {
  const tiles = planTiles(2481, 3101);
  const { xs, ys, at } = grid(tiles);

  it('covers the art exactly with integer tiles no larger than the max', () => {
    expect(tiles.length).toBe(xs.length * ys.length);
    for (const y of ys) expect(xs.reduce((sum, x) => sum + at(x, y).px.w, 0)).toBe(2481);
    for (const x of xs) expect(ys.reduce((sum, y) => sum + at(x, y).px.h, 0)).toBe(3101);
    for (const t of tiles) {
      for (const v of Object.values(t.px)) expect(Number.isInteger(v)).toBe(true);
      expect(t.px.w).toBeLessThanOrEqual(2048);
      expect(t.px.h).toBeLessThanOrEqual(2048);
      expect(t.px.w).toBeGreaterThan(0);
      expect(t.px.h).toBeGreaterThan(0);
    }
  });

  it('maps pixels to logical units at the runner scale (art width / 1000) on both axes', () => {
    // 3101 px is not exactly 2481 / 0.8, so a height-derived scale would drift from the runner's.
    for (const t of tiles) {
      expect(t.logical.x).toBeCloseTo((t.px.x / 2481) * 1000, 9);
      expect(t.logical.w).toBeCloseTo((t.px.w / 2481) * 1000, 9);
      expect(t.logical.y).toBeCloseTo((t.px.y / 2481) * 1000, 9);
      expect(t.logical.h).toBeCloseTo((t.px.h / 2481) * 1000, 9);
      // The runner scales both axes by px.w / logical.w; the tile must be square-pixelled at that scale.
      expect(t.px.h / t.logical.h).toBeCloseTo(t.px.w / t.logical.w, 9);
    }
  });

  it('makes adjacent logical rects abut exactly', () => {
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = at(xs[i], 0).logical;
      const b = at(xs[i + 1], 0).logical;
      expect(a.x + a.w).toBe(b.x);
    }
    for (let j = 0; j + 1 < ys.length; j++) {
      const a = at(0, ys[j]).logical;
      const b = at(0, ys[j + 1]).logical;
      expect(a.y + a.h).toBe(b.y);
    }
    const last = at(xs[xs.length - 1], ys[ys.length - 1]).logical;
    expect(last.x + last.w).toBe(1000);
    expect(last.y + last.h).toBe((3101 / 2481) * 1000);
  });

  it('abuts exactly across many awkward sizes', () => {
    for (const [w, h, , max] of [
      [5100, 6795, 0.75, 2048],
      [3507, 4959, 0.7071, 2048],
      [10001, 333, 30, 997],
      [7, 7, 1, 2],
    ] as const) {
      const ts = planTiles(w, h, max);
      for (const a of ts) {
        const right = ts.find((b) => b.px.y === a.px.y && b.px.x === a.px.x + a.px.w);
        const below = ts.find((b) => b.px.x === a.px.x && b.px.y === a.px.y + a.px.h);
        if (right) expect(a.logical.x + a.logical.w).toBe(right.logical.x);
        else expect(a.logical.x + a.logical.w).toBe(1000);
        if (below) expect(a.logical.y + a.logical.h).toBe(below.logical.y);
        else expect(a.logical.y + a.logical.h).toBe((h / w) * 1000);
        expect(a.px.w).toBeLessThanOrEqual(max);
        expect(a.px.h).toBeLessThanOrEqual(max);
      }
    }
  });

  it('uses a single tile for small art', () => {
    expect(planTiles(100, 125)).toEqual([
      { px: { x: 0, y: 0, w: 100, h: 125 }, logical: { x: 0, y: 0, w: 1000, h: 1250 } },
    ]);
  });
});

describe('withBleed', () => {
  const tiles = planTiles(3000, 3750, 1600);

  it('extends inner tiles right and down by the bleed, keeping the edges of the art', () => {
    for (const t of tiles) {
      const b = withBleed(t, 3000, 3750, 8);
      const right = t.px.x + t.px.w < 3000;
      const down = t.px.y + t.px.h < 3750;
      expect(b.px).toEqual({ x: t.px.x, y: t.px.y, w: t.px.w + (right ? 8 : 0), h: t.px.h + (down ? 8 : 0) });
      expect(b.logical.x).toBe(t.logical.x);
      expect(b.logical.y).toBe(t.logical.y);
      if (!right) expect(b.logical.w).toBe(t.logical.w);
      if (!down) expect(b.logical.h).toBe(t.logical.h);
    }
  });

  it('keeps the same pixels per logical unit, so the overlap repeats the neighbour exactly', () => {
    for (const t of tiles) {
      const b = withBleed(t, 3000, 3750, 8);
      expect(b.px.w / b.logical.w).toBeCloseTo(3, 9);
      expect(b.px.h / b.logical.h).toBeCloseTo(3, 9);
    }
  });

  it('maps the bleed overlap of vertically and horizontally adjacent tiles to identical logical coordinates', () => {
    // Art height not an exact multiple of width / aspect: the case a height-derived scale got wrong.
    for (const [w, h, , max] of [
      [2481, 3101, 0.8, 1200],
      [3507, 4959, 0.7071, 2040],
      [5100, 6795, 0.75, 2040],
    ] as const) {
      const ts = planTiles(w, h, max);
      for (const t of ts) {
        const b = withBleed(t, w, h, 8);
        const s = b.px.w / b.logical.w; // the runner's scale for this canvas, on both axes
        // Each pixel row/column of the bled canvas lands where the art's global scale puts it.
        const yAt = (row: number) => b.logical.y + (row - b.px.y) / s;
        const xAt = (col: number) => b.logical.x + (col - b.px.x) / s;
        expect(yAt(b.px.y + b.px.h)).toBeCloseTo(((b.px.y + b.px.h) / w) * 1000, 6);
        const below = ts.find((n) => n.px.x === t.px.x && n.px.y === t.px.y + t.px.h);
        if (below) {
          const ns = below.px.w / below.logical.w;
          for (let row = below.px.y; row < b.px.y + b.px.h; row++) {
            expect(yAt(row)).toBeCloseTo(below.logical.y + (row - below.px.y) / ns, 6);
          }
        }
        const right = ts.find((n) => n.px.y === t.px.y && n.px.x === t.px.x + t.px.w);
        if (right) {
          const ns = right.px.w / right.logical.w;
          for (let col = right.px.x; col < b.px.x + b.px.w; col++) {
            expect(xAt(col)).toBeCloseTo(right.logical.x + (col - right.px.x) / ns, 6);
          }
        }
      }
    }
  });

  it('never bleeds past the art', () => {
    const [t] = planTiles(100, 125);
    expect(withBleed(t, 100, 125, 8)).toEqual(t);
  });
});

describe('flattenOnPaper', () => {
  it('fills only behind the existing pixels, across the whole canvas, and restores state', () => {
    const calls: unknown[] = [];
    const ctx = {
      canvas: { width: 30, height: 20 },
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      setTransform: (...a: number[]) => calls.push(['setTransform', ...a]),
      fillRect: (...a: number[]) => calls.push(['fillRect', ...a, ctx.globalCompositeOperation, ctx.fillStyle]),
      globalCompositeOperation: 'source-over',
      globalAlpha: 0.5,
      fillStyle: '#000',
    };
    flattenOnPaper(ctx as unknown as CanvasRenderingContext2D);
    expect(calls).toEqual([
      'save',
      ['setTransform', 1, 0, 0, 1, 0, 0],
      ['fillRect', 0, 0, 30, 20, 'destination-over', '#ffffff'],
      'restore',
    ]);
  });
});

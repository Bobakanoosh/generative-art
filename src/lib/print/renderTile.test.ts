import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { goodCapture } from '@/lib/capture/fixtures';
import { replaySource } from '@/lib/input/log';
import { renderGeneration } from '@/lib/render/runner';
import { getPiece } from '@/pieces';
import { flattenOnPaper, planTiles, withBleed } from './tiles';
import { renderPrintTile } from './renderTile';

type Ctx = CanvasRenderingContext2D;

/** Stitched vs full render: anti-aliasing slack (measured: max 4 levels on 0.14% of channels). */
const MAX_CHANNEL_DIFF = 8;
const MAX_DIFFERING_SHARE = 0.01;

function pixels(draw: (ctx: Ctx) => void, w: number, h: number): Buffer {
  const canvas = createCanvas(w, h);
  draw(canvas.getContext('2d') as unknown as Ctx);
  return canvas.toBuffer('image/png');
}

describe('renderPrintTile', () => {
  const capture = { ...goodCapture(), n: 120 };
  const piece = getPiece(capture.slug, capture.v)!;
  const gen = { v: capture.v, s: capture.s, p: capture.p, n: capture.n };
  const artW = 300;
  const artH = 300;
  const tile = withBleed(planTiles(artW, artH, 160)[3], artW, artH);

  it('2x2 bled tiles with input, stitched as the print page lays them, reproduce the full render', () => {
    const tiles = planTiles(artW, artH, 160);
    expect(tiles.length).toBe(4);
    // The full render, flattened on paper like every print tile.
    const full = createCanvas(artW, artH);
    const fullCtx = full.getContext('2d') as unknown as Ctx;
    renderGeneration(piece, gen, fullCtx, artW, undefined, replaySource(capture.i));
    flattenOnPaper(fullCtx);
    // Each tile grown by its bleed and drawn in order, so later tiles cover earlier bleeds (PrintView).
    const stitched = createCanvas(artW, artH);
    const stitchedCtx = stitched.getContext('2d');
    for (const t of tiles) {
      const bled = withBleed(t, artW, artH);
      const c = createCanvas(bled.px.w, bled.px.h);
      renderPrintTile(piece, gen, c.getContext('2d') as unknown as Ctx, bled, capture.i);
      stitchedCtx.drawImage(c, bled.px.x, bled.px.y);
    }
    const a = fullCtx.getImageData(0, 0, artW, artH).data;
    const b = stitchedCtx.getImageData(0, 0, artW, artH).data;
    // Tiles rasterize the same strokes under a translated transform, so anti-aliased
    // edges may differ by a level or two; anything more is a seam or a misplaced tile.
    let maxDiff = 0;
    let differing = 0;
    for (let k = 0; k < a.length; k++) {
      const d = Math.abs(a[k] - b[k]);
      if (d > maxDiff) maxDiff = d;
      if (d > 0) differing++;
    }
    expect(maxDiff).toBeLessThanOrEqual(MAX_CHANNEL_DIFF);
    expect(differing / a.length).toBeLessThanOrEqual(MAX_DIFFERING_SHARE);
    // And the input really is in it: the stitched print differs from one without the log.
    const plain = createCanvas(artW, artH);
    const plainCtx = plain.getContext('2d') as unknown as Ctx;
    renderGeneration(piece, gen, plainCtx, artW);
    flattenOnPaper(plainCtx);
    const c = plainCtx.getImageData(0, 0, artW, artH).data;
    let changed = 0;
    for (let k = 0; k < c.length; k++) if (c[k] !== b[k]) changed++;
    expect(changed).toBeGreaterThan(0);
  });

  it('without input equals the plain tile render (the /art print path)', () => {
    const viaHelper = pixels((ctx) => renderPrintTile(piece, gen, ctx, tile), tile.px.w, tile.px.h);
    const direct = pixels((ctx) => {
      renderGeneration(piece, gen, ctx, tile.px.w, tile.logical);
      flattenOnPaper(ctx);
    }, tile.px.w, tile.px.h);
    expect(viaHelper.equals(direct)).toBe(true);
  });

  it('replays the log: differs from the render without it', () => {
    const withLog = pixels((ctx) => renderPrintTile(piece, gen, ctx, tile, capture.i), tile.px.w, tile.px.h);
    const without = pixels((ctx) => renderPrintTile(piece, gen, ctx, tile), tile.px.w, tile.px.h);
    expect(withLog.equals(without)).toBe(false);
  });
});

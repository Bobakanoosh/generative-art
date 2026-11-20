import { LOGICAL_WIDTH, type Tile } from '@/lib/render/runner';

/** One canvas of a print: its pixel rect within the art and the logical region it draws. */
export interface PrintTile {
  px: { x: number; y: number; w: number; h: number };
  logical: Tile;
}

export const MAX_TILE_PX = 2048;

const f64 = new Float64Array(1);
const i64 = new BigInt64Array(f64.buffer);

/** The adjacent double towards +Infinity (`dir` 1) or -Infinity (`dir` -1), for finite positive `x`. */
function nextFloat(x: number, dir: 1 | -1): number {
  if (x === 0) return dir > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  f64[0] = x;
  i64[0] += BigInt(x > 0 ? dir : -dir);
  return f64[0];
}

/** A size `w` with `start + w === end` exactly in floating point, so tiles abut with no gap or overlap. */
function exactSpan(start: number, end: number): number {
  let w = end - start;
  for (let i = 0; i < 64 && start + w !== end; i++) w = nextFloat(w, start + w < end ? 1 : -1);
  return w;
}

/** `n` near-equal integer cuts of `total`, as boundary positions 0 .. total. */
function cuts(total: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => Math.round((i * total) / n));
}

/**
 * Split an `artWPx` × `artHPx` image into a grid of canvases no larger than
 * `maxTilePx` on either edge, with integer pixel boundaries that sum exactly
 * to the art size. Each tile's logical rect is its pixel rect mapped onto the
 * piece's logical space at the art's one scale (artWPx / 1000 on both axes, as
 * the runner draws), and neighbouring rects share their edges
 * exactly, so the runner draws one seamless image across the tiles.
 */
export function planTiles(artWPx: number, artHPx: number, maxTilePx = MAX_TILE_PX): PrintTile[] {
  const xs = cuts(artWPx, Math.ceil(artWPx / maxTilePx));
  const ys = cuts(artHPx, Math.ceil(artHPx / maxTilePx));
  // The runner scales both axes by canvas width / logical width, so y uses the
  // art's width-derived scale too (artHPx is only artWPx / aspect rounded).
  // Divide first so the right edge maps to exactly LOGICAL_WIDTH.
  const toLogical = (p: number) => (p / artWPx) * LOGICAL_WIDTH;
  const lx = xs.map(toLogical);
  const ly = ys.map(toLogical);

  const tiles: PrintTile[] = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    for (let i = 0; i + 1 < xs.length; i++) {
      tiles.push({
        px: { x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] },
        logical: { x: lx[i], y: ly[j], w: exactSpan(lx[i], lx[i + 1]), h: exactSpan(ly[j], ly[j + 1]) },
      });
    }
  }
  return tiles;
}

/**
 * Overlap between neighbouring print canvases, in art pixels. PDF viewers and
 * print drivers anti-alias each image's edges separately, so tiles that merely
 * abut show hairlines of paper between them; a tile that bleeds under its
 * right/bottom neighbours (which are drawn on top) hides that.
 */
export const BLEED_PX = 8;

/**
 * `tile` grown by `bleedPx` to the right and bottom, unless it is at the art's
 * edge. The logical rect grows at the same pixels-per-unit, so the overlap
 * repeats exactly what the neighbour draws there.
 */
export function withBleed(tile: PrintTile, artWPx: number, artHPx: number, bleedPx = BLEED_PX): PrintTile {
  const { px, logical } = tile;
  const w = Math.min(artWPx, px.x + px.w + bleedPx) - px.x;
  const h = Math.min(artHPx, px.y + px.h + bleedPx) - px.y;
  return {
    px: { ...px, w, h },
    logical: {
      ...logical,
      w: w === px.w ? logical.w : (w / artWPx) * LOGICAL_WIDTH,
      h: h === px.h ? logical.h : (h / artWPx) * LOGICAL_WIDTH,
    },
  };
}

export const PAPER_COLOR = '#ffffff';

/**
 * Put paper behind a rendered tile: transparent pixels become white, opaque
 * ones are untouched. Without it a tile with any transparency (a partly
 * covered last row, a piece without a background) is embedded in the PDF with
 * a soft mask, and viewers composite masked images along a path that shows
 * seams between tiles even where they overlap.
 */
export function flattenOnPaper(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

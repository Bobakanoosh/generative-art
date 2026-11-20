import { createRng } from '@/lib/art/rng';
import { validateParams } from '@/lib/piece/schema';
import { EMPTY_INPUT, type Generation, type PieceDefinition } from '@/lib/piece/types';

export const LOGICAL_WIDTH = 1000;
export const DT = 1 / 60;

/** Region of the logical drawing space, in logical units. */
export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Runner {
  readonly total: number;
  readonly index: number;
  readonly done: boolean;
  advance(n: number): void;
  finish(): void;
}

export function logicalHeight(piece: PieceDefinition): number {
  return LOGICAL_WIDTH / piece.aspect;
}

export function createRunner(
  piece: PieceDefinition,
  gen: Generation,
  ctx: CanvasRenderingContext2D,
  outWidthPx: number,
  tile?: Tile,
): Runner {
  const t: Tile = tile ?? { x: 0, y: 0, w: LOGICAL_WIDTH, h: logicalHeight(piece) };
  const { params } = validateParams(piece.schema, gen.p);
  const state = piece.setup(params, createRng(gen.s));
  const steps = piece.steps(state);
  // A stop step past the end of a finite build is clamped: step(i) is never called for i >= steps.
  const total = Number.isFinite(steps) ? Math.min(gen.n ?? steps, steps) : gen.n;
  if (total === undefined || !Number.isFinite(total)) throw new Error('Endless piece requires a stop step');

  // Clear the whole output canvas in pixel space.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // scale(s) then translate(-x, -y) == matrix [s,0,0,s,-x*s,-y*s]
  const s = outWidthPx / t.w;
  const tx = -t.x * s + 0; // + 0 normalizes -0
  const ty = -t.y * s + 0;
  let index = 0;

  const runner: Runner = {
    total,
    get index() {
      return index;
    },
    get done() {
      return index >= total;
    },
    advance(n: number) {
      const end = Math.min(total, index + n);
      while (index < end) {
        ctx.setTransform(s, 0, 0, s, tx, ty);
        piece.step(ctx, state, index, EMPTY_INPUT);
        index++;
      }
    },
    finish() {
      runner.advance(total - index);
    },
  };
  return runner;
}

export function renderGeneration(
  piece: PieceDefinition,
  gen: Generation,
  ctx: CanvasRenderingContext2D,
  outWidthPx: number,
  tile?: Tile,
): void {
  createRunner(piece, gen, ctx, outWidthPx, tile).finish();
}

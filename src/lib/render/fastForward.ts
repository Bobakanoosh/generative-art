import { validateParams } from '@/lib/piece/schema';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { createRunner, renderGeneration, type InputSource, type Tile } from './runner';

/**
 * A context that forwards to `target` until muted; while muted, drawing calls
 * and style changes are dropped (property reads still pass through).
 */
export function gatedContext(target: CanvasRenderingContext2D): {
  ctx: CanvasRenderingContext2D;
  setMuted(muted: boolean): void;
} {
  let muted = false;
  const noop = () => undefined;
  const bound = new Map<PropertyKey, unknown>();
  const real = target as unknown as Record<PropertyKey, unknown>;
  const ctx = new Proxy(real, {
    get(t, prop) {
      const value = t[prop];
      if (typeof value !== 'function') return value;
      if (muted) return noop;
      let fn = bound.get(prop);
      if (!fn) {
        fn = (value as (...a: unknown[]) => unknown).bind(t);
        bound.set(prop, fn);
      }
      return fn;
    },
    set(t, prop, value) {
      if (!muted) t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, setMuted: (m) => (muted = m) };
}

/**
 * Render a generation's final image. Pieces with `fastForward` run all but
 * their last `keep` steps with drawing switched off, prime the canvas, then
 * draw the rest: the same pixels as a full render (each piece tests this),
 * at the cost of the simulation alone for the skipped steps.
 */
export function renderFinal(
  piece: PieceDefinition,
  gen: Generation,
  ctx: CanvasRenderingContext2D,
  outWidthPx: number,
  tile?: Tile,
  input?: InputSource,
): void {
  const ff = piece.fastForward;
  const keep = ff ? ff.keep(validateParams(piece.schema, gen.p).params) : undefined;
  if (!ff || keep === undefined) {
    renderGeneration(piece, gen, ctx, outWidthPx, tile, input);
    return;
  }
  const gate = gatedContext(ctx);
  const runner = createRunner(piece, gen, gate.ctx, outWidthPx, tile, input);
  const skip = Math.max(0, runner.total - keep);
  if (skip > 0) {
    gate.setMuted(true);
    runner.advance(skip);
    gate.setMuted(false);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ff.prime(ctx, validateParams(piece.schema, gen.p).params);
  }
  runner.finish();
}

import { fitRenderWidth, MAX_LONG_EDGE } from './fitWidth';

/** Response widths the render routes will produce, so the cache sees few variants. */
export const WIDTH_LADDER = [256, 400, 640, 800, 1200, 1600, 2400, 3200, 4096] as const;

/** Smallest ladder width >= requested (capped at 4096), then fitRenderWidth for the aspect. */
export function snapWidth(requested: number, aspect: number): number {
  const step = WIDTH_LADDER.find((w) => w >= requested) ?? MAX_LONG_EDGE;
  return fitRenderWidth(step, aspect);
}

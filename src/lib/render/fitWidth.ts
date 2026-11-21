/** DoS caps: bound the work a single public request can demand. */
export const MAX_LONG_EDGE = 4096;
export const MAX_PIXELS = 16_777_216; // 4096 * 4096

const fits = (w: number, aspect: number) => {
  const h = Math.round(w / aspect);
  return h <= MAX_LONG_EDGE && w * h <= MAX_PIXELS;
};

/**
 * The largest output width <= `width` whose canvas (height = round(w / aspect))
 * has neither edge over MAX_LONG_EDGE nor more than MAX_PIXELS pixels. Shared
 * by the render API and the browser canvas so neither can be made to allocate
 * an unbounded bitmap.
 */
export function fitRenderWidth(width: number, aspect: number): number {
  let w = Math.min(
    Math.round(width),
    MAX_LONG_EDGE,
    Math.floor((MAX_LONG_EDGE + 0.5) * aspect),
    Math.floor(Math.sqrt(MAX_PIXELS * aspect)) + 1,
  );
  while (w > 1 && !fits(w, aspect)) w--;
  return Math.max(1, w);
}

/** Build PNG downloads (and short live moments) render at the largest width. */
export const DOWNLOAD_WIDTH_FULL = 4096;
/** A live moment between 20 000 and 50 000 steps. */
export const DOWNLOAD_WIDTH_MEDIUM = 2400;
/** A live moment beyond 50 000 steps: the replay already dominates the render time. */
export const DOWNLOAD_WIDTH_SMALL = 1200;

/** Live moments up to this stop step download at full width. */
export const FULL_WIDTH_MAX_STEP = 20_000;
/** Live moments up to this stop step download at the medium width. */
export const MEDIUM_WIDTH_MAX_STEP = 50_000;

/**
 * Width requested by a "Download PNG" link. A build always gets 4096. A live
 * moment (a live piece with stop step `n`) is rendered by replaying every
 * step on the server, so long moments ask for a smaller image to keep the
 * request inside the function time limit. All three are width-ladder rungs.
 */
export function pngDownloadWidth(live: boolean, n: number | undefined): number {
  if (!live || n === undefined) return DOWNLOAD_WIDTH_FULL;
  if (n <= FULL_WIDTH_MAX_STEP) return DOWNLOAD_WIDTH_FULL;
  if (n <= MEDIUM_WIDTH_MAX_STEP) return DOWNLOAD_WIDTH_MEDIUM;
  return DOWNLOAD_WIDTH_SMALL;
}

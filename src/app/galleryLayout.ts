import type { CSSProperties } from 'react';

/**
 * Geometry of one gallery group at lg: the primary in a flexible column, the two
 * follow-ups stacked in a narrow column beside it, all at the piece's own aspect.
 *
 * With column/stack gap g and aspect a, a stack column of width
 * F = (W - g(1 + a)) / 3 makes the two follow-ups plus their gap exactly as tall
 * as the primary (2F/a + g = P/a, P = W - g - F) for any aspect: no letterbox,
 * no crop, no ragged bottom edge.
 */

/** Column and stack gap at lg, in px (Tailwind `lg:gap-4`). */
export const GALLERY_GAP_PX = 16;
/**
 * Smallest group width at lg. On a short viewport the height rule alone would
 * shrink a portrait piece to a postage stamp; below this the group scrolls instead.
 */
export const GROUP_MIN_PX = 600;
/** Vertical room the group leaves around the primary at lg: header, padding, a glimpse of the caption. */
const CHROME_LG = 'var(--header-h) + 168px';

/** The lg grid in numbers, for a group `width` px wide. */
export function galleryGroupBox(aspect: number, width: number) {
  const g = GALLERY_GAP_PX;
  const followUpWidth = (width - g * (1 + aspect)) / 3;
  const primaryWidth = width - g - followUpWidth;
  const followUpHeight = followUpWidth / aspect;
  return {
    primaryWidth,
    primaryHeight: primaryWidth / aspect,
    followUpWidth,
    followUpHeight,
    stackHeight: 2 * followUpHeight + g,
  };
}

/**
 * CSS variables for a group: `--a` (aspect), `--cols` (the lg column template)
 * and `--group-max`, the width at which the primary is as tall as the viewport
 * allows (W = 1.5·H·a + g(1 - a/2)), floored at GROUP_MIN_PX.
 */
export function galleryGroupStyle(aspect: number): CSSProperties {
  const g = GALLERY_GAP_PX;
  return {
    '--a': aspect,
    '--cols': `minmax(0,1fr) calc((100% - ${g}px * (1 + ${aspect})) / 3)`,
    '--group-max': `max(${GROUP_MIN_PX}px, calc((100svh - (${CHROME_LG})) * ${aspect} * 1.5 + ${g * (1 - aspect / 2)}px))`,
  } as CSSProperties;
}

/**
 * Sizing of the art frame (the art plus its 40 px player/live bar row) on the
 * piece and capture pages. One helper for the loaded canvases and the
 * Suspense placeholder, so the page doesn't shift when the view streams in.
 *
 * On wide screens the art is as tall as the stage allows: the viewport minus
 * the site header, the stage's vertical padding (`lg:p-8`), the gap and the
 * bar row. The art + bar block then fills the padded stage exactly, so it sits
 * centred. When stacked (phones) the width is the limit instead.
 *
 * Anything else on the stage (the outdated banner, the issues alert, the
 * "captured moment" line, live notices, export progress) is measured by
 * PieceLayout into `--stage-extra`, and the art gives up that much height, so
 * a notice never pushes the art into the padding or clips the bar.
 */

/** Stage padding, top + bottom (`lg:p-8`). */
export const STAGE_PAD_Y_PX = 64;
/** Gap between the art and the bar row (`gap-2`). */
export const BAR_GAP_PX = 8;
/** The bar row (`h-10`). Live notices go below it and may push the stage. */
export const BAR_H_PX = 40;
/** Vertical space on the stage that isn't art. */
export const ART_STAGE_CHROME_PX = STAGE_PAD_Y_PX + BAR_GAP_PX + BAR_H_PX;

/** CSS width of the art frame for a piece of `aspect` (width / height). */
export function artFrameWidth(aspect: number): string {
  return `min(100%, calc((100dvh - var(--header-h) - ${ART_STAGE_CHROME_PX}px - var(--stage-extra, 0px)) * ${aspect}))`;
}

/**
 * Width the canvas bitmap is sized from: `artFrameWidth` without
 * `--stage-extra`, against the stage's content width (`100cqw`; the stage is an
 * inline-size container). A notice appearing or going then only rescales the
 * canvas by CSS: the running sim or playback is never rebuilt for it.
 */
export function artBitmapWidth(aspect: number): string {
  return `min(100cqw, calc((100dvh - var(--header-h) - ${ART_STAGE_CHROME_PX}px) * ${aspect}))`;
}

/**
 * Height of the stage content that isn't the art or its bar row: notices above
 * the art, lines under the bar and their gaps. `contentHeight` spans the
 * stage's children (first top to last bottom); `artHeight` is the art box.
 * Whole pixels and never negative, so re-measuring after the art shrinks gives
 * the same value (no resize loop).
 */
export function stageExtraPx({ contentHeight, artHeight }: { contentHeight: number; artHeight: number }): number {
  return Math.max(0, Math.round(contentHeight - artHeight - BAR_GAP_PX - BAR_H_PX));
}

/**
 * `artFrameWidth` in numbers, for a stage of `stageWidth` × `stageHeight`
 * (padding included, as the CSS sees it): the art's box and the art + bar block.
 */
export function artFrameBox(
  aspect: number,
  stageWidth: number,
  stageHeight: number,
): { artWidth: number; artHeight: number; blockHeight: number } {
  const artWidth = Math.min(stageWidth, (stageHeight - ART_STAGE_CHROME_PX) * aspect);
  const artHeight = artWidth / aspect;
  return { artWidth, artHeight, blockHeight: artHeight + BAR_GAP_PX + BAR_H_PX };
}

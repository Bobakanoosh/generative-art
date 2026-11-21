// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { getPiece } from '@/pieces';
import ArtCanvas from './ArtCanvas';
import LiveCanvas from './LiveCanvas';
import { artFrameWidth } from './artFrame';
import { ArtFrame, PieceLayout, StagePlaceholder } from './PieceLayout';

// jsdom has no ResizeObserver or 2D canvas; the frame's box is all we look at here.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(cleanup);

/** The frame (art + bar row) and the art box inside it. */
function frameOf(container: HTMLElement) {
  const frame = container.querySelector<HTMLElement>('[data-art-frame]')!;
  const art = frame.firstElementChild as HTMLElement;
  return { frame, art };
}

describe('placeholder and loaded view share one box (no layout shift)', () => {
  it.each(['flow-ribbons', 'murmuration'])('%s: same frame width, art aspect and 40 px bar row', (slug) => {
    const piece = getPiece(slug)!;
    const gen = { v: piece.version, s: 'abc', p: {} };

    const placeholder = frameOf(render(<StagePlaceholder aspect={piece.aspect} label={`Loading ${piece.title}`} />).container);
    cleanup();
    const loaded = frameOf(
      piece.interactive || slug === 'murmuration'
        ? render(<LiveCanvas slug={slug} piece={piece} gen={gen} delayMs={0} />).container
        : render(<ArtCanvas piece={piece} gen={gen} motion="play" delayMs={0} />).container,
    );

    for (const { frame, art } of [placeholder, loaded]) {
      expect(frame.style.width).toBe(artFrameWidth(piece.aspect));
      expect(frame.className).toContain('gap-2');
      expect(art.style.aspectRatio).toBe(`${piece.aspect} / 1`); // jsdom normalises "0.8" to "0.8 / 1"
      // The bar row (or its stand-in) right after the art is 40 px tall.
      expect((art.nextElementSibling as HTMLElement).className).toMatch(/(^|\s)(min-)?h-10(\s|$)/);
    }
    expect(placeholder.frame.className).toBe(loaded.frame.className);
    // The canvas fills the aspect box out of flow: its bitmap (rounded to whole device pixels)
    // must not stretch the box taller than the placeholder's.
    expect(loaded.art.querySelector('canvas')!.className).toContain('absolute inset-0');
  });
});

describe('PieceLayout reserves room for stage notices', () => {
  it('sets --stage-extra on the stage to the height of everything that is not the art', () => {
    // Fake layout: notice 0–38, art 50–782, bar 790–830, line under the bar 838–870.
    const rects = new Map<string, [number, number]>([
      ['notice', [0, 38]],
      ['art', [50, 782]],
      ['bar', [790, 830]],
      ['line', [838, 870]],
    ]);
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const key = (this as HTMLElement).dataset?.fake;
      let r = key ? rects.get(key) : undefined;
      if (!r && this.hasAttribute('data-art-frame')) r = [50, 870];
      const [top, bottom] = r ?? [0, 0];
      return { top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} } as DOMRect;
    };
    try {
      const { getByRole } = render(
        <PieceLayout
          stage={
            <>
              <p data-fake="notice">A newer version exists.</p>
              <ArtFrame aspect={1}>
                <div data-fake="art" />
                <div data-fake="bar" className="h-10" />
                <div data-fake="line" />
              </ArtFrame>
            </>
          }
          panel={<p>panel</p>}
        />,
      );
      const stage = getByRole('region', { name: 'Artwork' });
      // 870 - 0 content, minus the 732 art, the 8 px gap and the 40 px bar.
      expect(stage.style.getPropertyValue('--stage-extra')).toBe('90px');
    } finally {
      Element.prototype.getBoundingClientRect = orig;
    }
  });
});

import { useEffect, useState, type RefObject } from 'react';
import type { FrameClock } from '@/lib/playback/playback';
import { fitRenderWidth } from '@/lib/render/parseRenderRequest';

const RESIZE_DEBOUNCE_MS = 150;

/**
 * CSS width of `ref`'s element: the first measurement at once, later ones
 * debounced so a window drag doesn't rebuild the canvas on every frame.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [cssWidth, setCssWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (first) {
        first = false;
        setCssWidth(width);
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => setCssWidth(width), RESIZE_DEBOUNCE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [ref]);
  return cssWidth;
}

/**
 * requestAnimationFrame as a FrameClock. A piece that throws inside a frame
 * is reported to `onError` (which stops the animation and shows the error).
 */
export function rafClock(onError: (err: unknown) => void): FrameClock {
  return {
    now: () => performance.now(),
    request: (cb) =>
      requestAnimationFrame(() => {
        try {
          cb();
        } catch (err) {
          onError(err);
        }
      }),
    cancel: (id) => cancelAnimationFrame(id),
  };
}

/**
 * Sizes the canvas bitmap to `cssWidth` × devicePixelRatio with the piece's
 * aspect, under the same long-edge and pixel caps as the render API (huge or
 * high-DPR screens never allocate a giant canvas). Null if 2D is unavailable.
 */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  aspect: number,
): { ctx: CanvasRenderingContext2D; width: number } | null {
  const dpr = window.devicePixelRatio || 1;
  const width = fitRenderWidth(cssWidth * dpr, aspect);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.width = width;
  canvas.height = Math.round(width / aspect);
  return { ctx, width };
}

export const CANVAS_UNAVAILABLE = 'Canvas 2D is not available in this browser.';

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

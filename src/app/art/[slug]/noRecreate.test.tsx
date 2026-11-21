// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { getPiece } from '@/pieces';

/*
 * A stage notice appearing or going changes `--stage-extra`, which shrinks the
 * art box by CSS. That must never tear down the running LiveSim (a catch-up
 * replay of every step so far) or the build Playback: the canvas bitmap is
 * sized from a width that ignores `--stage-extra`.
 */

const { createLiveSim, createPlayback } = vi.hoisted(() => {
  const noop = () => {};
  const liveStatus = { index: 0, playing: true, limited: false, catchingUp: false, inputFull: false, epoch: 0 };
  const playStatus = { index: 0, total: 10, playing: true, done: false, speed: 1 };
  return {
    createLiveSim: vi.fn(() => ({
      play: noop,
      pause: noop,
      restart: noop,
      status: () => liveStatus,
      subscribe: () => noop,
      capture: () => ({ n: 0, input: { p: [], k: [] } }),
      snapshot: () => ({ n: 0, input: { p: [], k: [] } }),
      destroy: noop,
    })),
    createPlayback: vi.fn(() => ({
      play: noop,
      pause: noop,
      replay: noop,
      seek: noop,
      finish: noop,
      setSpeed: noop,
      status: () => playStatus,
      subscribe: () => noop,
      destroy: noop,
    })),
  };
});

vi.mock('@/lib/live/live', async (orig) => ({ ...(await orig<typeof import('@/lib/live/live')>()), createLiveSim }));
vi.mock('@/lib/playback/playback', async (orig) => ({
  ...(await orig<typeof import('@/lib/playback/playback')>()),
  createPlayback,
}));

import ArtCanvas from './ArtCanvas';
import LiveCanvas from './LiveCanvas';
import { PieceLayout } from './PieceLayout';

/** Fake layout: the stage is 700 px wide; the art box loses whatever `--stage-extra` takes; a notice is 38 px + gap. */
const STAGE_W = 700;
const observers = new Set<FakeResizeObserver>();
class FakeResizeObserver {
  els = new Set<Element>();
  constructor(private cb: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(el: Element) {
    this.els.add(el);
  }
  unobserve(el: Element) {
    this.els.delete(el);
  }
  disconnect() {
    this.els.clear();
  }
  fire() {
    if (this.els.size) this.cb([...this.els].map((target) => ({ target }) as ResizeObserverEntry), this as unknown as ResizeObserver);
  }
}
/** "Layout": every observer sees its elements' (possibly new) sizes. */
function relayout() {
  // Two passes: the stage-extra set in the first resizes the art box in the second.
  for (let pass = 0; pass < 2; pass++) {
    act(() => {
      for (const o of [...observers]) o.fire();
    });
    act(() => {
      vi.advanceTimersByTime(1000); // the resize debounce, then the canvas's delayMs timer
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

function stageExtra(el: Element): number {
  const stage = el.closest('section');
  return parseFloat(stage?.style.getPropertyValue('--stage-extra') || '0') || 0;
}

let aspect = 1;
const saved = {
  rect: Element.prototype.getBoundingClientRect,
  clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!,
  getContext: HTMLCanvasElement.prototype.getContext,
};

beforeAll(() => {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      if (this.hasAttribute('data-art-sizer')) return STAGE_W; // ignores --stage-extra
      return STAGE_W - stageExtra(this) * aspect;
    },
  });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const box = (top: number, bottom: number) =>
      ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} }) as DOMRect;
    const artH = (STAGE_W - stageExtra(this) * aspect) / aspect;
    if ((this as HTMLElement).dataset?.fake === 'notice') return box(0, 38);
    if (this.hasAttribute('data-art-frame')) return box(50, 50 + artH + 48);
    if (this.parentElement?.hasAttribute('data-art-frame') && !this.previousElementSibling) return box(50, 50 + artH);
    return box(0, 0);
  };
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = saved.rect;
  Object.defineProperty(Element.prototype, 'clientWidth', saved.clientWidth);
  HTMLCanvasElement.prototype.getContext = saved.getContext;
});

beforeEach(() => {
  vi.useFakeTimers();
  createLiveSim.mockClear();
  createPlayback.mockClear();
});

afterEach(() => {
  cleanup();
  observers.clear();
  vi.useRealTimers();
});

function stage(notice: boolean, art: ReactNode) {
  return (
    <PieceLayout
      stage={
        <>
          {notice && <p data-fake="notice">A newer version of this piece exists.</p>}
          {art}
        </>
      }
      panel={<p>panel</p>}
    />
  );
}

describe('a stage notice never recreates the sim or the playback', () => {
  it('LiveCanvas (murmuration): notice appears and goes, createLiveSim runs once', () => {
    const piece = getPiece('murmuration')!;
    aspect = piece.aspect;
    const gen = { v: piece.version, s: 'abc', p: {} };
    const art = <LiveCanvas slug="murmuration" piece={piece} gen={gen} delayMs={0} />;

    const { rerender, getByRole } = render(stage(false, art));
    relayout();
    expect(createLiveSim).toHaveBeenCalledTimes(1);

    rerender(stage(true, art));
    relayout();
    // The notice did take room from the art (CSS) ...
    expect(getByRole('region', { name: 'Artwork' }).style.getPropertyValue('--stage-extra')).toBe('50px');
    rerender(stage(false, art));
    relayout();
    expect(getByRole('region', { name: 'Artwork' }).style.getPropertyValue('--stage-extra')).toBe('0px');
    // ... but the sim kept running.
    expect(createLiveSim).toHaveBeenCalledTimes(1);
  });

  it('ArtCanvas (flow-ribbons): notice appears and goes, createPlayback runs once', () => {
    const piece = getPiece('flow-ribbons')!;
    aspect = piece.aspect;
    const gen = { v: piece.version, s: 'abc', p: {} };
    const art = <ArtCanvas piece={piece} gen={gen} motion="play" delayMs={0} />;

    const { rerender } = render(stage(false, art));
    relayout();
    expect(createPlayback).toHaveBeenCalledTimes(1);

    rerender(stage(true, art));
    relayout();
    rerender(stage(false, art));
    relayout();
    expect(createPlayback).toHaveBeenCalledTimes(1);
  });
});

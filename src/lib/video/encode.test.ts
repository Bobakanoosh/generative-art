import { describe, expect, it, vi } from 'vitest';
import { pickVideoFormat, videoFileName, VIDEO_MIME } from './encode';

const supports = (codecs: string[]) => vi.fn(async (codec: 'avc' | 'vp9') => codecs.includes(codec));

describe('pickVideoFormat', () => {
  it('prefers MP4 when H.264 can be encoded', async () => {
    expect(await pickVideoFormat(supports(['avc', 'vp9']))).toBe('mp4');
    expect(await pickVideoFormat(supports(['avc']))).toBe('mp4');
  });

  it('falls back to WebM when only VP9 can be encoded', async () => {
    expect(await pickVideoFormat(supports(['vp9']))).toBe('webm');
  });

  it('returns null when neither codec can be encoded', async () => {
    expect(await pickVideoFormat(supports([]))).toBeNull();
  });

  it('treats a failing capability check as unsupported', async () => {
    const canEncode = vi.fn(async (codec: 'avc' | 'vp9') => {
      if (codec === 'avc') throw new Error('no WebCodecs');
      return true;
    });
    expect(await pickVideoFormat(canEncode)).toBe('webm');
  });
});

describe('videoFileName', () => {
  it('names downloads by slug, seed and extension', () => {
    expect(videoFileName('flow-ribbons', 'abc123', 'mp4')).toBe('flow-ribbons-abc123.mp4');
    expect(videoFileName('flow-ribbons', 'abc123', 'gif')).toBe('flow-ribbons-abc123.gif');
  });
});

describe('VIDEO_MIME', () => {
  it('maps each format to its MIME type', () => {
    expect(VIDEO_MIME).toEqual({ mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif' });
  });
});

describe('resolveFramePlan / inputSourceFor', () => {
  it('defaults to the build plan and honours explicit frames', async () => {
    const { resolveFramePlan } = await import('./encode');
    const { MP4_SPEC, buildFramePlan } = await import('./plan');
    expect(resolveFramePlan(100, MP4_SPEC)).toEqual(buildFramePlan(100, MP4_SPEC));
    expect(resolveFramePlan(100, MP4_SPEC, [0, 2, 4])).toEqual([0, 2, 4]);
  });

  it('makes a fresh replay source per call, undefined without a log', async () => {
    const { inputSourceFor } = await import('./encode');
    expect(inputSourceFor()).toBeUndefined();
    const log = { p: [[1, 50, 60, 0]], k: [] as [number, string][] };
    const a = inputSourceFor(log)!;
    const b = inputSourceFor(log)!;
    a(0); a(5);
    expect(b(1).pointer).toEqual({ x: 5, y: 6, down: false });
  });
});

describe('paletteStep', () => {
  it('uses the finished image for a build (no explicit frames)', async () => {
    const { paletteStep } = await import('./encode');
    expect(paletteStep(undefined, 4000)).toBe(4000);
  });

  it("uses the plan's last frame step for a clip, never the endless total", async () => {
    const { paletteStep } = await import('./encode');
    const { clipFramePlan } = await import('./plan');
    const { MAX_STOP_STEP } = await import('@/lib/piece/share');
    expect(paletteStep(clipFramePlan(1200, 5, 15), MAX_STOP_STEP)).toBe(1200 + 74 * 4);
    expect(paletteStep([10, 30, 20], MAX_STOP_STEP)).toBe(30);
  });

  it('falls back to total for an empty plan', async () => {
    const { paletteStep } = await import('./encode');
    expect(paletteStep([], 50)).toBe(50);
  });
});

describe('advanceInSlices', () => {
  function fakeRunner(costMs: number, clock: { t: number }) {
    return {
      index: 0,
      total: 1_000_000,
      done: false,
      advance(n: number) {
        this.index += n;
        clock.t += n * costMs;
      },
      finish() {},
    };
  }

  it('reaches the step, yielding between time slices and reporting progress', async () => {
    const { advanceInSlices } = await import('./encode');
    const clock = { t: 0 };
    const runner = fakeRunner(1, clock);
    let yields = 0;
    const seen: number[] = [];
    await advanceInSlices(runner as never, 100, {
      signal: new AbortController().signal,
      now: () => clock.t,
      sliceMs: 30,
      yieldFn: async () => {
        yields++;
      },
      onStep: (i) => seen.push(i),
    });
    expect(runner.index).toBe(100);
    expect(yields).toBeGreaterThanOrEqual(3);
    expect(seen.at(-1)).toBe(100);
    expect(seen.every((s, i) => i === 0 || s > seen[i - 1])).toBe(true);
  });

  it('never goes backwards or past the target', async () => {
    const { advanceInSlices } = await import('./encode');
    const clock = { t: 0 };
    const runner = fakeRunner(0, clock);
    runner.index = 50;
    await advanceInSlices(runner as never, 20, { signal: new AbortController().signal, now: () => clock.t });
    expect(runner.index).toBe(50);
  });

  it('stops with an AbortError when canceled between slices', async () => {
    const { advanceInSlices } = await import('./encode');
    const clock = { t: 0 };
    const runner = fakeRunner(1, clock);
    const ctl = new AbortController();
    const run = advanceInSlices(runner as never, 1000, {
      signal: ctl.signal,
      now: () => clock.t,
      sliceMs: 30,
      yieldFn: async () => ctl.abort(),
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(runner.index).toBeLessThan(1000);
  });
});

describe('exportGeneration (the stop-step cap exportVideo applies)', () => {
  it('stops an explicit frame plan at its last frame, so an endless runner never lacks a stop step', async () => {
    const { exportGeneration } = await import('./encode');
    const { createRunner } = await import('@/lib/render/runner');
    const { createCanvas } = await import('@napi-rs/canvas');
    const { defaultsOf } = await import('@/lib/piece/schema');
    const { default: murmuration } = await import('@/pieces/murmuration/v1');
    const piece = murmuration as unknown as import('@/lib/piece/types').PieceDefinition;
    const ctx = createCanvas(20, 20).getContext('2d') as unknown as CanvasRenderingContext2D;
    const gen = { v: 1, s: 'x', p: defaultsOf(piece.schema) }; // no n: a live generation

    expect(() => createRunner(piece, gen, ctx, 20)).toThrow('Endless piece requires a stop step');
    const capped = exportGeneration(gen, [30, 34, 38]);
    expect(capped).toEqual({ ...gen, n: 38 });
    expect(createRunner(piece, capped, ctx, 20).total).toBe(38);
    // A stale n from the caller is replaced by the plan's own end.
    expect(exportGeneration({ ...gen, n: 99_999 }, [4, 8]).n).toBe(8);
  });

  it('leaves a build (no plan, or an empty one) untouched', async () => {
    const { exportGeneration } = await import('./encode');
    const gen = { v: 1, s: 'x', p: {}, n: 7 };
    expect(exportGeneration(gen)).toBe(gen);
    expect(exportGeneration(gen, [])).toBe(gen);
  });
});

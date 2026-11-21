import { describe, expect, it } from 'vitest';
import { easeBuild } from '@/lib/playback/pacing';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import {
  CLIP_SECONDS,
  GIF_SPEC,
  MP4_SPEC,
  buildFramePlan,
  clipFramePlan,
  collapseFrames,
  gifDelaysMs,
  loopFramePlan,
  videoSize,
} from './plan';

describe('specs', () => {
  it('match the agreed video and GIF settings', () => {
    expect(MP4_SPEC).toEqual({ fps: 30, buildSeconds: 8, holdSeconds: 2, longEdge: 1080 });
    expect(GIF_SPEC).toEqual({ fps: 15, buildSeconds: 8, holdSeconds: 2, longEdge: 540 });
  });
});

describe('videoSize', () => {
  it('fits a portrait piece to the long edge', () => {
    expect(videoSize(0.8, 1080)).toEqual({ width: 864, height: 1080 });
  });

  it('fits a landscape piece and rounds down to even', () => {
    expect(videoSize(16 / 9, 1080)).toEqual({ width: 1080, height: 606 });
  });

  it('always returns even dimensions within the long edge', () => {
    for (const aspect of [0.3, 0.5, 0.71, 0.8, 1, 1.25, 1.333, 16 / 9, 2.39, 4]) {
      for (const longEdge of [540, 1080, 1081]) {
        const { width, height } = videoSize(aspect, longEdge);
        expect(width % 2).toBe(0);
        expect(height % 2).toBe(0);
        expect(Math.max(width, height)).toBeLessThanOrEqual(longEdge);
        expect(width).toBeGreaterThanOrEqual(2);
        expect(height).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('buildFramePlan', () => {
  it('eases a build over 8 s then holds for 2 s', () => {
    const plan = buildFramePlan(320, MP4_SPEC);
    expect(plan).toHaveLength(300);
    expect(plan[0]).toBeGreaterThanOrEqual(1);
    for (let f = 1; f < plan.length; f++) expect(plan[f]).toBeGreaterThanOrEqual(plan[f - 1]);
    expect(plan[239]).toBe(320);
    for (let f = 240; f < 300; f++) expect(plan[f]).toBe(320);
  });

  it('follows the build ease curve', () => {
    const plan = buildFramePlan(320, MP4_SPEC);
    expect(plan[119]).toBe(Math.floor(320 * easeBuild(120 / 240)));
  });

  it('sizes the GIF plan by its own frame rate', () => {
    expect(buildFramePlan(100, GIF_SPEC)).toHaveLength(150);
  });

  it('never opens on an undrawn canvas: every frame has run at least step 0', () => {
    for (const total of [1, 2, 7, 320, 5000]) {
      for (const spec of [MP4_SPEC, GIF_SPEC]) {
        const plan = buildFramePlan(total, spec);
        expect(plan[0]).toBeGreaterThanOrEqual(1);
        expect(plan.every((s) => s >= 1 && s <= total)).toBe(true);
        expect(plan[Math.round(spec.fps * spec.buildSeconds) - 1]).toBe(total);
      }
    }
  });

  it('is all zeros for an empty build', () => {
    const plan = buildFramePlan(0, MP4_SPEC);
    expect(plan).toHaveLength(300);
    expect(plan.every((s) => s === 0)).toBe(true);
  });
});

describe('collapseFrames', () => {
  it('merges consecutive frames with the same target into one run', () => {
    expect(collapseFrames([0, 0, 1, 3, 3, 3])).toEqual([
      { step: 0, frames: 2 },
      { step: 1, frames: 1 },
      { step: 3, frames: 3 },
    ]);
  });

  it('keeps the total frame count', () => {
    const plan = buildFramePlan(500, GIF_SPEC);
    const runs = collapseFrames(plan);
    expect(runs.reduce((n, r) => n + r.frames, 0)).toBe(plan.length);
    expect(runs.at(-1)).toEqual({ step: 500, frames: GIF_SPEC.fps * GIF_SPEC.holdSeconds + 1 });
  });

  it('is empty for an empty plan', () => {
    expect(collapseFrames([])).toEqual([]);
  });
});

describe('gifDelaysMs', () => {
  /** What a GIF viewer plays: gifenc stores Math.round(delay / 10) centiseconds. */
  const played = (delays: number[]) => delays.reduce((ms, d) => ms + Math.round(d / 10) * 10, 0);

  it('gives whole-centisecond delays whose total is the exact build + hold duration', () => {
    for (const total of [1, 7, 100, 320, 5000, 100_000]) {
      const runs = collapseFrames(buildFramePlan(total, GIF_SPEC));
      const delays = gifDelaysMs(runs, GIF_SPEC.fps);
      expect(delays).toHaveLength(runs.length);
      for (const d of delays) {
        expect(d % 10).toBe(0);
        expect(d).toBeGreaterThan(0);
      }
      const expected = 1000 * (GIF_SPEC.buildSeconds + GIF_SPEC.holdSeconds);
      expect(Math.abs(played(delays) - expected)).toBeLessThanOrEqual(10);
    }
  });

  it('places each run boundary within 10 ms of its true time (no cumulative drift)', () => {
    const runs = collapseFrames(buildFramePlan(5000, GIF_SPEC));
    const delays = gifDelaysMs(runs, GIF_SPEC.fps);
    let frames = 0;
    let ms = 0;
    for (let r = 0; r < runs.length; r++) {
      frames += runs[r].frames;
      ms += Math.round(delays[r] / 10) * 10;
      expect(Math.abs(ms - (frames * 1000) / GIF_SPEC.fps)).toBeLessThanOrEqual(10);
    }
  });

  it('is empty for no runs', () => {
    expect(gifDelaysMs([], 15)).toEqual([]);
  });
});

describe('CLIP_SECONDS', () => {
  it('offers 5, 10 and 15 s clips', () => {
    expect(CLIP_SECONDS).toEqual([5, 10, 15]);
  });
});

describe('clipFramePlan', () => {
  it('MP4 at 30 fps: one frame per 2 steps from the current step', () => {
    const plan = clipFramePlan(100, 5, 30);
    expect(plan).toHaveLength(150);
    expect(plan[0]).toBe(100);
    expect(plan[1] - plan[0]).toBe(2);
    expect(plan.at(-1)).toBe(100 + 149 * 2);
    expect(plan.every((s, i) => i === 0 || s - plan[i - 1] === 2)).toBe(true);
  });

  it('GIF at 15 fps: one frame per 4 steps', () => {
    const plan = clipFramePlan(100, 5, 15);
    expect(plan).toHaveLength(75);
    expect(plan[0]).toBe(100);
    expect(plan[1] - plan[0]).toBe(4);
  });

  it('never plans a step beyond the stop-step cap (clip is cut short)', () => {
    const plan = clipFramePlan(MAX_STOP_STEP - 10, 5, 30);
    expect(plan).toEqual([MAX_STOP_STEP - 10, MAX_STOP_STEP - 8, MAX_STOP_STEP - 6, MAX_STOP_STEP - 4, MAX_STOP_STEP - 2, MAX_STOP_STEP]);
    expect(clipFramePlan(MAX_STOP_STEP + 50, 5, 30)).toEqual([MAX_STOP_STEP]);
  });

  it('honours a lower cap (a recording that ended early)', () => {
    expect(clipFramePlan(100, 10, 30, 106)).toEqual([100, 102, 104, 106]);
  });

  it('starts at step 1 at the earliest (step 0 is a blank canvas)', () => {
    expect(clipFramePlan(0, 5, 30).slice(0, 3)).toEqual([1, 3, 5]);
  });

  it('rejects frame rates that do not divide 60 steps/s', () => {
    expect(() => clipFramePlan(0, 5, 7)).toThrow();
  });
});

describe('loopFramePlan', () => {
  it('covers exactly one period starting at loopSteps', () => {
    const plan = loopFramePlan(240, 30);
    expect(plan).toHaveLength(120);
    expect(plan[0]).toBe(240);
    expect(plan.at(-1)).toBe(478);
  });

  it('GIF at 15 fps: one frame per 4 steps', () => {
    const plan = loopFramePlan(240, 15);
    expect(plan).toHaveLength(60);
    expect(plan[0]).toBe(240);
    expect(plan.at(-1)).toBe(476);
  });
});

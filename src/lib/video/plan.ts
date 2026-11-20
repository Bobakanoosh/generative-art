import { easeBuild } from '@/lib/playback/pacing';

/** Frame-locked recording of a build: an eased build, then a still hold on the final image. */
export interface VideoSpec {
  fps: number;
  buildSeconds: number;
  holdSeconds: number;
  /** Longest output edge, in pixels. */
  longEdge: number;
}

export const MP4_SPEC: VideoSpec = { fps: 30, buildSeconds: 8, holdSeconds: 2, longEdge: 1080 };
export const GIF_SPEC: VideoSpec = { fps: 15, buildSeconds: 8, holdSeconds: 2, longEdge: 540 };

const floorEven = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** Output size for a piece of `aspect` (width / height): long edge at most `longEdge`, both sides even. */
export function videoSize(aspect: number, longEdge: number): { width: number; height: number } {
  if (aspect >= 1) return { width: floorEven(longEdge), height: floorEven(longEdge / aspect) };
  return { width: floorEven(longEdge * aspect), height: floorEven(longEdge) };
}

/**
 * Step to have drawn by each output frame. Build frames follow the playback ease
 * curve (but always include step 0 when there is one) and reach `total` on the
 * last build frame; hold frames show the final image.
 */
export function buildFramePlan(total: number, spec: VideoSpec): number[] {
  const buildFrames = Math.round(spec.fps * spec.buildSeconds);
  const holdFrames = Math.round(spec.fps * spec.holdSeconds);
  // At least step 0 drawn on every frame: before it the canvas is still transparent (black in a video).
  const min = total > 0 ? 1 : 0;
  const plan: number[] = [];
  for (let f = 0; f < buildFrames; f++) plan.push(Math.max(min, Math.floor(total * easeBuild((f + 1) / buildFrames))));
  for (let f = 0; f < holdFrames; f++) plan.push(total);
  return plan;
}

/** Runs of consecutive frames that show the same step (one GIF frame each, with a longer delay). */
export function collapseFrames(plan: readonly number[]): { step: number; frames: number }[] {
  const runs: { step: number; frames: number }[] = [];
  for (const step of plan) {
    const last = runs.at(-1);
    if (last && last.step === step) last.frames++;
    else runs.push({ step, frames: 1 });
  }
  return runs;
}

/**
 * GIF frame delay, in ms, for each run. GIF delays are whole centiseconds
 * (gifenc stores `Math.round(delay / 10)`), so each run's delay is the
 * difference of its end and start times rounded to centiseconds: rounding
 * never accumulates and the total is the exact plan duration.
 */
export function gifDelaysMs(runs: readonly { frames: number }[], fps: number): number[] {
  const cs = (frames: number) => Math.round((frames * 100) / fps);
  const delays: number[] = [];
  let framesDone = 0;
  for (const { frames } of runs) {
    delays.push((cs(framesDone + frames) - cs(framesDone)) * 10);
    framesDone += frames;
  }
  return delays;
}

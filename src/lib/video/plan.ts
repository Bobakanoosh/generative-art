import { easeBuild } from '@/lib/playback/pacing';
import { LIVE_STEPS_PER_SECOND } from '@/lib/live/constants';
import { MAX_STOP_STEP } from '@/lib/piece/share';

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

/** Endless clip lengths, in seconds. */
export const CLIP_SECONDS = [5, 10, 15] as const;

/** Live steps per output frame at `fps` (the sim runs 60 steps/s); `fps` must divide 60. */
export function stepsPerFrame(fps: number): number {
  const spf = LIVE_STEPS_PER_SECOND / fps;
  if (!Number.isInteger(spf) || spf < 1) throw new Error(`Frame rate ${fps} does not divide ${LIVE_STEPS_PER_SECOND} steps/s`);
  return spf;
}

/**
 * Steps for each frame of a clip starting at `from`: from + k * stepsPerFrame,
 * k = 0..seconds*fps-1; stepsPerFrame = 60 / fps. Frames past `max` (the
 * stop-step cap, or where a recording ended) are cut, so the clip may be
 * shorter; it starts at step 1 at the earliest (step 0 is a blank canvas).
 */
export function clipFramePlan(from: number, seconds: number, fps: number, max: number = MAX_STOP_STEP): number[] {
  const spf = stepsPerFrame(fps);
  const start = Math.min(max, Math.max(1, Math.floor(from)));
  const plan: number[] = [];
  const count = Math.round(seconds * fps);
  for (let k = 0; k < count; k++) {
    const step = start + k * spf;
    if (step > max) break;
    plan.push(step);
  }
  return plan;
}

/** One period: frames at loopSteps + k * stepsPerFrame for k < loopSteps / stepsPerFrame. */
export function loopFramePlan(loopSteps: number, fps: number): number[] {
  const spf = stepsPerFrame(fps);
  const plan: number[] = [];
  for (let k = 0; k < loopSteps / spf; k++) plan.push(loopSteps + k * spf);
  return plan;
}

/**
 * Browser-only video/GIF export of a build, rendered frame-locked (never real
 * time): each output frame advances one runner to its planned step and encodes
 * the canvas. mediabunny and gifenc are imported lazily so they stay out of the
 * initial page bundle and out of the server.
 */
import { replaySource, type InputLog } from '@/lib/input/log';
import { createRunner, type InputSource, type Runner } from '@/lib/render/runner';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { clipGeneration } from './liveClip';
import { GIF_SPEC, MP4_SPEC, buildFramePlan, collapseFrames, gifDelaysMs, videoSize, type VideoSpec } from './plan';

export type VideoFormat = 'mp4' | 'webm' | 'gif';
export type ExportPhase = 'prepare' | 'frames';
export type VideoCodecProbe = (codec: 'avc' | 'vp9') => Promise<boolean>;

export const VIDEO_MIME: Record<VideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  gif: 'image/gif',
};

export function videoFileName(slug: string, seed: string, format: VideoFormat): string {
  return `${slug}-${seed}.${format}`;
}

/** MP4 (H.264) when the browser can encode it, else WebM (VP9), else null. A throwing probe counts as "no". */
export async function pickVideoFormat(canEncode: VideoCodecProbe): Promise<'mp4' | 'webm' | null> {
  const probe = (codec: 'avc' | 'vp9') => canEncode(codec).catch(() => false);
  if (await probe('avc')) return 'mp4';
  if (await probe('vp9')) return 'webm';
  return null;
}

/** Real capability probe for a piece of `aspect`, at the size it would be recorded. */
export function browserCodecProbe(aspect: number): VideoCodecProbe {
  return async (codec) => {
    const { canEncodeVideo, QUALITY_HIGH } = await import('mediabunny');
    const { width, height } = videoSize(aspect, MP4_SPEC.longEdge);
    return canEncodeVideo(codec, { width, height, quality: QUALITY_HIGH, frameRate: MP4_SPEC.fps });
  };
}

export interface ExportVideoOptions {
  piece: PieceDefinition;
  gen: Generation;
  format: VideoFormat;
  /**
   * Overall progress, 0..1. With explicit `frames` the runners first replay up
   * to the first frame ('prepare', e.g. a clip starting minutes in), then
   * encode ('frames'); a build only reports 'frames'.
   */
  onProgress(fraction: number, phase: ExportPhase): void;
  signal: AbortSignal;
  /** Recorded input to replay; a fresh replay source is made for every runner. */
  input?: InputLog;
  /** Step to reach at each output frame; overrides the default build+hold plan. */
  frames?: number[];
}

/** Fresh input source per runner (replay sources are stateful). */
export function inputSourceFor(input?: InputLog): InputSource | undefined {
  return input ? replaySource(input) : undefined;
}

/** Explicit per-frame steps if given, else the default build+hold plan. */
export function resolveFramePlan(total: number, spec: VideoSpec, frames?: number[]): number[] {
  return frames ?? buildFramePlan(total, spec);
}

/**
 * Step whose image the GIF palette is quantized from: the finished image for a
 * build, else the plan's last (furthest) frame. Never `total` for a custom plan:
 * an endless piece's total is the stop-step cap (100 000 steps).
 */
export function paletteStep(frames: readonly number[] | undefined, total: number): number {
  if (!frames || frames.length === 0) return total;
  let max = frames[0];
  for (const step of frames) if (step > max) max = step;
  return max;
}

/** How long one uninterrupted run of steps may block the main thread before yielding. */
const SLICE_MS = 30;

/**
 * Advances `runner` to `step` (never backwards) in time slices of at most
 * `sliceMs`, yielding between them so the page stays responsive and Cancel is
 * seen; `onStep` gets the index after each slice.
 */
export async function advanceInSlices(
  runner: Runner,
  step: number,
  opts: {
    signal: AbortSignal;
    now?: () => number;
    sliceMs?: number;
    yieldFn?: () => Promise<void>;
    onStep?: (index: number) => void;
  },
): Promise<void> {
  const now = opts.now ?? (() => performance.now());
  const sliceMs = opts.sliceMs ?? SLICE_MS;
  const yieldFn = opts.yieldFn ?? yieldToEventLoop;
  while (runner.index < step && !runner.done) {
    throwIfAborted(opts.signal);
    const start = now();
    while (runner.index < step && !runner.done && now() - start < sliceMs) runner.advance(1);
    opts.onStep?.(runner.index);
    if (runner.index < step && !runner.done) await yieldFn();
  }
  throwIfAborted(opts.signal);
}

/**
 * Progress over the replay before the first frame and the frames themselves:
 * the replay gets a share proportional to its steps, at most half the bar.
 */
function phasedProgress(prepareSteps: number, onProgress: ExportVideoOptions['onProgress']) {
  const share = prepareSteps > 0 ? Math.min(0.5, prepareSteps / (prepareSteps + 10_000)) : 0;
  return {
    prepare: (done: number) => onProgress(prepareSteps > 0 ? (share * Math.min(done, prepareSteps)) / prepareSteps : 0, 'prepare'),
    frames: (fraction: number) => onProgress(share + (1 - share) * fraction, 'frames'),
  };
}

/**
 * The generation the export runners use. An explicit frame plan stops at its
 * last frame (clipGeneration), so a clip of an endless piece always has the
 * stop step its runner needs, whatever `gen.n` the caller passed.
 */
export function exportGeneration(gen: Generation, frames?: readonly number[]): Generation {
  return frames && frames.length > 0 ? clipGeneration(gen, frames) : gen;
}

export async function exportVideo(opts: ExportVideoOptions): Promise<Blob> {
  const capped = { ...opts, gen: exportGeneration(opts.gen, opts.frames) };
  return capped.format === 'gif' ? exportGif(capped) : exportMediabunny(capped, capped.format);
}

type Canvas2D = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D };

function makeCanvas(width: number, height: number, readback: boolean): Canvas2D {
  const settings: CanvasRenderingContext2DSettings = { willReadFrequently: readback };
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', settings);
    // The runner only needs the 2D drawing API, which OffscreenCanvas shares.
    if (ctx) return { canvas, ctx: ctx as unknown as CanvasRenderingContext2D };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', settings);
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
  return { canvas, ctx };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Export canceled', 'AbortError');
}

/** Lets the UI repaint (progress) and see a Cancel click between frames. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function advanceTo(runner: Runner, step: number): void {
  if (step > runner.index) runner.advance(step - runner.index);
}

async function exportMediabunny(opts: ExportVideoOptions, format: 'mp4' | 'webm'): Promise<Blob> {
  const { piece, gen, onProgress, signal } = opts;
  throwIfAborted(signal);
  const mb = await import('mediabunny');
  const spec: VideoSpec = MP4_SPEC;
  const { width, height } = videoSize(piece.aspect, spec.longEdge);
  const { canvas, ctx } = makeCanvas(width, height, false);
  const runner = createRunner(piece, gen, ctx, width, undefined, inputSourceFor(opts.input));
  const plan = resolveFramePlan(runner.total, spec, opts.frames);
  const progress = phasedProgress(opts.frames ? plan[0] ?? 0 : 0, onProgress);

  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
    target,
  });
  const source = new mb.CanvasSource(canvas, {
    codec: format === 'mp4' ? 'avc' : 'vp9',
    quality: mb.QUALITY_HIGH,
  });
  output.addVideoTrack(source, { frameRate: spec.fps });

  try {
    // A clip from minutes into an endless piece: replay to its first frame without freezing the page.
    if (opts.frames && plan.length > 0) await advanceInSlices(runner, plan[0], { signal, onStep: progress.prepare });
    await output.start();
    for (let f = 0; f < plan.length; f++) {
      throwIfAborted(signal);
      advanceTo(runner, plan[f]);
      await source.add(f / spec.fps, 1 / spec.fps);
      progress.frames((f + 1) / plan.length);
      await yieldToEventLoop();
    }
    throwIfAborted(signal);
    await output.finalize();
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
    throw err;
  }
  if (!target.buffer) throw new Error('Video encoder produced no data');
  return new Blob([target.buffer], { type: VIDEO_MIME[format] });
}

async function exportGif(opts: ExportVideoOptions): Promise<Blob> {
  const { piece, gen, onProgress, signal } = opts;
  throwIfAborted(signal);
  const { GIFEncoder, applyPalette, quantize } = await import('gifenc');
  const spec = GIF_SPEC;
  const { width, height } = videoSize(piece.aspect, spec.longEdge);
  const { ctx } = makeCanvas(width, height, true);
  const read = () => ctx.getImageData(0, 0, width, height).data;

  // One palette for the whole animation, from the finished image (where every colour has landed):
  // a build's final image, or a clip's last frame (an endless piece never finishes).
  const finalRunner = createRunner(piece, gen, ctx, width, undefined, inputSourceFor(opts.input));
  const plan = resolveFramePlan(finalRunner.total, spec, opts.frames);
  const paletteAt = paletteStep(opts.frames, finalRunner.total);
  // Both runners replay from step 0: to the palette step, then to the first frame.
  const prepareSteps = opts.frames ? paletteAt + (plan[0] ?? 0) : 0;
  const progress = phasedProgress(prepareSteps, onProgress);
  if (opts.frames) await advanceInSlices(finalRunner, paletteAt, { signal, onStep: progress.prepare });
  else finalRunner.finish();
  const palette = quantize(read(), 256);
  await yieldToEventLoop();

  const runner = createRunner(piece, gen, ctx, width, undefined, inputSourceFor(opts.input));
  if (opts.frames && plan.length > 0) {
    await advanceInSlices(runner, plan[0], { signal, onStep: (i) => progress.prepare(paletteAt + i) });
  }
  const runs = collapseFrames(plan);
  const delays = gifDelaysMs(runs, spec.fps);
  const gif = GIFEncoder();
  let framesDone = 0;
  for (let r = 0; r < runs.length; r++) {
    throwIfAborted(signal);
    const { step, frames } = runs[r];
    advanceTo(runner, step);
    const delay = delays[r];
    gif.writeFrame(applyPalette(read(), palette), width, height, r === 0 ? { palette, delay } : { delay });
    framesDone += frames;
    progress.frames(framesDone / plan.length);
    await yieldToEventLoop();
  }
  throwIfAborted(signal);
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: VIDEO_MIME.gif });
}

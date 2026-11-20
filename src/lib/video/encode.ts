/**
 * Browser-only video/GIF export of a build, rendered frame-locked (never real
 * time): each output frame advances one runner to its planned step and encodes
 * the canvas. mediabunny and gifenc are imported lazily so they stay out of the
 * initial page bundle and out of the server.
 */
import { createRunner, type Runner } from '@/lib/render/runner';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { GIF_SPEC, MP4_SPEC, buildFramePlan, collapseFrames, gifDelaysMs, videoSize, type VideoSpec } from './plan';

export type VideoFormat = 'mp4' | 'webm' | 'gif';
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
  onProgress(fraction: number): void;
  signal: AbortSignal;
}

export async function exportVideo(opts: ExportVideoOptions): Promise<Blob> {
  return opts.format === 'gif' ? exportGif(opts) : exportMediabunny(opts, opts.format);
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
  const runner = createRunner(piece, gen, ctx, width);
  const plan = buildFramePlan(runner.total, spec);

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
    await output.start();
    for (let f = 0; f < plan.length; f++) {
      throwIfAborted(signal);
      advanceTo(runner, plan[f]);
      await source.add(f / spec.fps, 1 / spec.fps);
      onProgress((f + 1) / plan.length);
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

  // One palette for the whole animation, from the finished image (where every colour has landed).
  const finalRunner = createRunner(piece, gen, ctx, width);
  finalRunner.finish();
  const palette = quantize(read(), 256);
  await yieldToEventLoop();

  const runner = createRunner(piece, gen, ctx, width);
  const plan = buildFramePlan(runner.total, spec);
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
    onProgress(framesDone / plan.length);
    await yieldToEventLoop();
  }
  throwIfAborted(signal);
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: VIDEO_MIME.gif });
}

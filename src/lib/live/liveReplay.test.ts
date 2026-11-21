/**
 * Review Focus #1 (live must equal replay): what the viewer saw live must be
 * exactly what a replay of the captured moment draws. Drives the real
 * murmuration piece through createLiveSim with a scripted pointer/key session
 * on a recording canvas, captures, replays the captured log with a plain
 * runner, and compares every canvas call.
 */
import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { defaultsOf } from '@/lib/piece/schema';
import { isEmptyLog, replaySource, type InputLog } from '@/lib/input/log';
import { createRecorder, type Recorder } from '@/lib/input/recorder';
import { createRunner } from '@/lib/render/runner';
import type { FrameClock } from '@/lib/playback/playback';
import murmurationV1 from '@/pieces/murmuration/v1';
import { createLiveSim } from './live';

const piece = murmurationV1 as PieceDefinition;
const WIDTH = 200;

/** A real 2D context wrapped so every method call and property write is logged. */
function recordingCtx() {
  const canvas = createCanvas(WIDTH, Math.round(WIDTH / piece.aspect));
  const real = canvas.getContext('2d') as unknown as Record<string | symbol, unknown>;
  const calls: string[] = [];
  const ctx = new Proxy(real, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(`${String(prop)}(${JSON.stringify(args)})`);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
    set(target, prop, value) {
      calls.push(`${String(prop)}=${JSON.stringify(value)}`);
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function fakeClock() {
  let now = 0;
  let nextId = 1;
  let queue = new Map<number, () => void>();
  const clock: FrameClock = {
    now: () => now,
    request(cb) {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    cancel(id) {
      queue.delete(id);
    },
  };
  return {
    clock,
    frame(ms = 1000 / 60) {
      now += ms;
      const cbs = [...queue.values()];
      queue = new Map();
      for (const cb of cbs) cb();
    },
  };
}

const gen: Generation = { v: 1, s: 'replay-check', p: { ...defaultsOf(piece.schema), count: 120 } };

/** Scripted viewer: hover, drag, release, Space, leave, drag past the edge, double Space. */
function script(f: number, rec: Recorder) {
  if (f === 5) rec.setPointer({ x: 123.456, y: 700.01, down: false });
  if (f >= 10 && f < 40) rec.setPointer({ x: 500 + (f - 10) * 7.3, y: 500 - (f - 10) * 3.1, down: true });
  if (f === 40) rec.setPointer({ x: 719, y: 407, down: false });
  if (f === 45) rec.pressKey(' ');
  if (f === 50) rec.setPointer(null);
  if (f === 52) rec.pressKey('a');
  if (f === 60) rec.setPointer({ x: -50, y: 2000, down: true }); // past the edge: clamped
  if (f === 70) {
    rec.pressKey(' ');
    rec.pressKey(' ');
  }
  if (f === 75) rec.setPointer(null);
}

function replayCalls(n: number, log: InputLog) {
  const { ctx, calls } = recordingCtx();
  createRunner(piece, { ...gen, n }, ctx, WIDTH, undefined, replaySource(log)).finish();
  return calls;
}

describe('live session -> capture -> replay', () => {
  it('replaying the captured log draws exactly what the live sim drew', () => {
    const live = recordingCtx();
    const fc = fakeClock();
    const rec = createRecorder({ height: 1000 / piece.aspect });
    const sim = createLiveSim({ piece, gen, ctx: live.ctx, widthPx: WIDTH, recorder: rec, clock: fc.clock, autoplay: true });
    for (let f = 0; f < 90; f++) {
      script(f, rec);
      fc.frame();
    }
    const moment = sim.capture();
    // Capture pauses: later frames draw nothing.
    const callsAtCapture = live.calls.length;
    fc.frame();
    expect(live.calls.length).toBe(callsAtCapture);
    sim.destroy();

    expect(moment.n).toBeGreaterThan(60);
    expect(isEmptyLog(moment.input)).toBe(false);
    expect(moment.input.k.length).toBe(4);
    expect(replayCalls(moment.n, moment.input)).toEqual(live.calls);
  });

  it('holds across a mid-session resize (new sim, startAt, same recorder)', () => {
    const fc = fakeClock();
    const rec = createRecorder({ height: 1000 / piece.aspect });
    const first = createLiveSim({
      piece, gen, ctx: recordingCtx().ctx, widthPx: WIDTH, recorder: rec, clock: fc.clock, autoplay: true,
    });
    let f = 0;
    for (; f < 50; f++) {
      script(f, rec);
      fc.frame();
    }
    const at = first.status().index;
    first.destroy();

    const live = recordingCtx();
    const second = createLiveSim({
      piece, gen, ctx: live.ctx, widthPx: WIDTH, recorder: rec, clock: fc.clock, startAt: at, autoplay: true,
    });
    for (let guard = 0; second.status().catchingUp && guard < 1000; guard++) fc.frame();
    expect(second.status()).toMatchObject({ index: at, playing: true });
    for (; f < 90; f++) {
      script(f, rec);
      fc.frame();
    }
    const moment = second.capture();
    second.destroy();
    expect(moment.n).toBeGreaterThan(at);
    expect(replayCalls(moment.n, moment.input)).toEqual(live.calls);
  });
});

/**
 * DOM-free live simulation controller for endless/interactive pieces: runs the
 * piece in real time at 60 steps/s on an injectable frame clock, feeding it
 * recorded input. A finite wall-time budget per frame means a slow device
 * slows the sim down (the backlog is dropped); steps are never skipped.
 */
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { MAX_INPUT_EVENTS, replaySource, type InputLog } from '@/lib/input/log';
import { MAX_EVENTS_PER_STEP, type Recorder } from '@/lib/input/recorder';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import { createRunner, type Runner } from '@/lib/render/runner';
import { createRng } from '@/lib/art/rng';
import { validateParams } from '@/lib/piece/schema';
import { FRAME_BUDGET_MS } from '@/lib/playback/pacing';
import type { FrameClock } from '@/lib/playback/playback';

import { LIVE_STEPS_PER_SECOND } from './constants';

export { LIVE_STEPS_PER_SECOND };
export const LIMIT_NOTICE = 'Reached the 27-minute limit. Capture this moment or restart.';
export const INPUT_FULL_NOTICE = 'This session has too much input to save. Capture this moment or restart.';

/** Wall time credited per frame, at most (no catch-up bursts). */
const MAX_FRAME_MS = 100;
/** Absorbs float error so 60 frames of 1000/60 ms credit exactly 60 steps. */
const EPS = 1e-9;

export interface LiveStatus {
  index: number;
  playing: boolean;
  limited: boolean;
  catchingUp: boolean;
  inputFull: boolean;
  /** Restarts so far in this session: a recording that began in an earlier epoch was cut off by Restart. */
  epoch: number;
}

export interface LiveSim {
  play(): void;
  pause(): void;
  /** New runner at 0, recorder.truncate(0), epoch + 1, plays. */
  restart(): void;
  status(): LiveStatus;
  subscribe(fn: (s: LiveStatus) => void): () => void;
  /** Pauses; returns the moment: stop step and a copy of the log up to it. */
  capture(): { n: number; input: InputLog };
  /** The moment at `at` (default: now; never beyond now) without pausing: step and a copy of the log before it. */
  snapshot(at?: number): { n: number; input: InputLog };
  destroy(): void;
}

/**
 * Whether the piece page should run this generation live (LiveCanvas) rather
 * than as a build: interactive pieces always; otherwise when the piece never
 * finishes for these params and seed. Ignores `gen.n`. Runs setup, so callers
 * memoize per generation.
 */
export function isLive(piece: PieceDefinition, gen: Generation): boolean {
  if (piece.interactive === true) return true;
  const { params } = validateParams(piece.schema, gen.p);
  return !Number.isFinite(piece.steps(piece.setup(params, createRng(gen.s))));
}

/** Copy of `log` keeping only events at steps < n. */
function trimLog(log: InputLog, n: number): InputLog {
  const keep = <T extends unknown[]>(list: T[]): T[] => {
    const out: T[] = [];
    let step = 0;
    for (const e of list) {
      step += e[0] as number;
      if (step >= n) break;
      out.push(e);
    }
    return out;
  };
  return { p: keep(log.p), k: keep(log.k) };
}

export function createLiveSim(opts: {
  piece: PieceDefinition;
  gen: Generation; // gen.n ignored
  ctx: CanvasRenderingContext2D;
  widthPx: number;
  recorder: Recorder;
  clock: FrameClock;
  /** Resume after resize: replay steps [0, startAt) from recorder.log() on budgeted frames (catchingUp), then continue live; `autoplay` decides play vs pause after. */
  startAt?: number;
  autoplay: boolean;
  /** Session epoch to resume with after a resize (default 0); restart() increments it. */
  epoch?: number;
}): LiveSim {
  const { piece, gen, ctx, widthPx, recorder, clock } = opts;

  let replayEnd = 0; // steps below this come from the replay source
  let replay = replaySource({ p: [], k: [] });

  const newRunner = (): Runner =>
    createRunner(piece, { ...gen, n: MAX_STOP_STEP }, ctx, widthPx, undefined, (i) =>
      i < replayEnd ? replay(i) : recorder.frame(i),
    );

  let runner: Runner = newRunner();
  // A runner whose total is the stop-step cap came from an endless piece.
  const endless = runner.total === MAX_STOP_STEP;

  let playing = false;
  let catchingUp = false;
  let afterCatchUp = opts.autoplay;
  let limited = false;
  let inputFull = false;
  let epoch = opts.epoch ?? 0;
  let acc = 0;
  let lastNow: number | null = null;
  let frameId: number | null = null;
  let destroyed = false;
  const subscribers = new Set<(s: LiveStatus) => void>();
  let lastEmitted: LiveStatus | null = null;

  const status = (): LiveStatus => ({ index: runner.index, playing, limited, catchingUp, inputFull, epoch });

  let emitting = false;
  let emitDirty = false;
  function emit() {
    if (destroyed) return;
    if (emitting) {
      emitDirty = true;
      return;
    }
    emitting = true;
    try {
      do {
        emitDirty = false;
        const s = status();
        const l = lastEmitted;
        if (
          l &&
          l.index === s.index &&
          l.playing === s.playing &&
          l.limited === s.limited &&
          l.catchingUp === s.catchingUp &&
          l.inputFull === s.inputFull &&
          l.epoch === s.epoch
        ) {
          continue;
        }
        lastEmitted = s;
        for (const fn of [...subscribers]) {
          if (destroyed) break;
          if (emitDirty) {
            lastEmitted = null;
            break;
          }
          if (!subscribers.has(fn)) continue;
          fn(s);
        }
      } while (emitDirty && !destroyed);
    } finally {
      emitting = false;
    }
  }

  const active = () => !destroyed && (playing || catchingUp) && !runner.done;

  function schedule() {
    if (destroyed || frameId !== null || !active()) return;
    frameId = clock.request(frame);
  }

  function unschedule() {
    if (frameId !== null) clock.cancel(frameId);
    frameId = null;
  }

  /** True if one more live step could push the log past MAX_INPUT_EVENTS. */
  function capReached(): boolean {
    return recorder.count() + MAX_EVENTS_PER_STEP > MAX_INPUT_EVENTS;
  }

  function settleIfDone() {
    if (!runner.done) return;
    playing = false;
    catchingUp = false;
    lastNow = null;
    if (endless) limited = true;
  }

  function frame() {
    frameId = null;
    if (destroyed) return;
    const start = clock.now();

    if (catchingUp) {
      while (runner.index < replayEnd && clock.now() - start < FRAME_BUDGET_MS) runner.advance(1);
      if (runner.index >= replayEnd) {
        catchingUp = false;
        playing = afterCatchUp && !runner.done;
        acc = 0;
        if (playing && capReached()) {
          inputFull = true;
          playing = false;
        }
        lastNow = playing ? clock.now() : null;
      }
    } else if (playing) {
      const dt = lastNow === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, start - lastNow));
      lastNow = start;
      acc += (dt * LIVE_STEPS_PER_SECOND) / 1000;
      let due = Math.floor(acc + EPS);
      acc = Math.max(0, acc - due);
      while (due > 0 && !runner.done) {
        if (clock.now() - start >= FRAME_BUDGET_MS) {
          acc = 0; // out of budget: drop the backlog, never skip steps
          break;
        }
        if (capReached()) {
          inputFull = true;
          playing = false;
          lastNow = null;
          break;
        }
        runner.advance(1);
        due--;
      }
    }
    settleIfDone();
    emit();
    schedule();
  }

  const sim: LiveSim = {
    play() {
      if (destroyed) return;
      if (catchingUp) {
        afterCatchUp = true;
        return;
      }
      if (playing || runner.done || inputFull) return;
      if (capReached()) {
        inputFull = true;
        emit();
        return;
      }
      playing = true;
      acc = 0;
      lastNow = clock.now();
      emit();
      schedule();
    },
    pause() {
      if (destroyed) return;
      afterCatchUp = false;
      playing = false;
      lastNow = null;
      emit();
      if (!active()) unschedule();
    },
    restart() {
      if (destroyed) return;
      unschedule();
      recorder.truncate(0);
      epoch++;
      replayEnd = 0;
      runner = newRunner();
      catchingUp = false;
      limited = false;
      inputFull = false;
      acc = 0;
      playing = true;
      lastNow = clock.now();
      emit();
      schedule();
    },
    status,
    subscribe(fn) {
      if (destroyed) return () => {};
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    capture() {
      sim.pause();
      return sim.snapshot();
    },
    snapshot(at) {
      const n = at === undefined ? runner.index : Math.max(0, Math.min(runner.index, Math.floor(at)));
      return { n, input: trimLog(recorder.log(), n) };
    },
    destroy() {
      destroyed = true;
      unschedule();
      subscribers.clear();
      playing = false;
      catchingUp = false;
    },
  };

  const startAt = Math.min(runner.total, Math.max(0, Math.floor(Number.isFinite(opts.startAt) ? opts.startAt! : 0)));
  if (startAt > 0) {
    // Snapshot the recorded input for 0..startAt-1; anything later is discarded since live resumes there.
    recorder.truncate(startAt);
    replay = replaySource(recorder.log());
    replayEnd = startAt;
    catchingUp = true;
  } else {
    if (opts.autoplay && !runner.done && capReached()) inputFull = true;
    playing = opts.autoplay && !runner.done && !inputFull;
    lastNow = playing ? clock.now() : null;
  }
  lastEmitted = status();
  schedule();
  return sim;
}

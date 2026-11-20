/**
 * DOM-free playback controller: animates a piece's deterministic build step by
 * step on an injectable frame clock. Pacing is viewer-only; the steps run are
 * exactly the runner's steps, so a finished playback equals the instant render.
 */
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { createRunner, type Runner } from '@/lib/render/runner';
import { BUILD_DURATION_MS, FRAME_BUDGET_MS, targetStep, type Speed } from './pacing';

export interface PlaybackStatus {
  index: number;
  total: number;
  playing: boolean;
  done: boolean;
  speed: Speed;
}

export interface FrameClock {
  now(): number; // ms
  request(cb: () => void): number; // e.g. requestAnimationFrame
  cancel(id: number): void;
}

export interface Playback {
  play(): void;
  pause(): void;
  replay(): void;
  /** Clamps to [0, total]; backward → new runner from 0. Pauses. */
  seek(step: number): void;
  /** Budgeted like 'instant' (not one blocking call). */
  finish(): void;
  setSpeed(speed: Speed): void;
  status(): PlaybackStatus;
  subscribe(fn: (s: PlaybackStatus) => void): () => void;
  /** Cancels frames; no step ever runs after this. */
  destroy(): void;
}

/** Wall time credited to playback per frame, at most (no catch-up bursts). */
const MAX_FRAME_MS = 100;

/** Inverse of the build ease: 1x-equivalent ms at which `targetStep` reaches `step`. */
function buildMsForStep(step: number, total: number): number {
  if (total <= 0 || step <= 0) return 0;
  return BUILD_DURATION_MS * Math.min(1, step / total) ** (1 / 1.6);
}

/**
 * Creates a playback over `ctx`. Creating it runs the piece's setup and clears
 * the canvas immediately, even with `autoplay: false`; no step runs until
 * play(), finish() or seek().
 */
export function createPlayback(opts: {
  piece: PieceDefinition;
  gen: Generation;
  ctx: CanvasRenderingContext2D;
  widthPx: number;
  speed: Speed;
  autoplay: boolean;
  /**
   * Step to restore (e.g. after a canvas resize): advances there on budgeted
   * frames like seek(), then keeps playing from it only if `autoplay`.
   * Clamped to [0, total] and floored; 0/omitted starts from the beginning.
   */
  startAt?: number;
  clock: FrameClock;
}): Playback {
  const { piece, gen, ctx, widthPx, clock } = opts;
  const newRunner = () => createRunner(piece, gen, ctx, widthPx);

  // Created eagerly (setup + clear, no steps) so `total` is known and setup
  // errors (e.g. endless pieces without a stop step) surface here.
  let runner: Runner = newRunner();
  let speed: Speed = opts.speed;
  let playing = false;
  let finishing = false;
  let seekTarget: number | null = null;
  /** Build progress in 1x-equivalent ms (wall ms × speed), so speed changes don't jump. */
  let buildMs = 0;
  /** Clock time the last frame (or play()) was credited at; null while not playing. */
  let lastNow: number | null = null;
  let frameId: number | null = null;
  let destroyed = false;
  const subscribers = new Set<(s: PlaybackStatus) => void>();
  let lastEmitted: PlaybackStatus | null = null;

  const status = (): PlaybackStatus => ({
    index: runner.index,
    total: runner.total,
    playing,
    done: runner.done,
    speed,
  });

  let emitting = false;
  let emitDirty = false;

  /**
   * Notifies subscribers if the status changed. Re-entrant calls (a subscriber
   * calling replay()/seek()/…) are deferred until the current pass ends, then
   * delivered with a fresh status, so no subscriber sees statuses out of order.
   */
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
          l.total === s.total &&
          l.playing === s.playing &&
          l.done === s.done &&
          l.speed === s.speed
        ) {
          continue;
        }
        lastEmitted = s;
        for (const fn of [...subscribers]) {
          if (destroyed) break;
          if (emitDirty) {
            // Cut the stale pass short; force the fresh status out to everyone.
            lastEmitted = null;
            break;
          }
          if (!subscribers.has(fn)) continue; // unsubscribed earlier in this pass
          fn(s);
        }
      } while (emitDirty && !destroyed);
    } finally {
      emitting = false;
    }
  }

  const active = () => !runner.done && (playing || finishing || seekTarget !== null);

  function schedule() {
    if (destroyed || frameId !== null || !active()) return;
    frameId = clock.request(frame);
  }

  function unschedule() {
    if (frameId !== null) clock.cancel(frameId);
    frameId = null;
  }

  function frame() {
    frameId = null;
    if (destroyed) return;
    const start = clock.now();

    let target: number;
    if (seekTarget !== null) {
      target = seekTarget;
    } else if (finishing || (playing && speed === 'instant')) {
      target = runner.total;
    } else if (playing && speed !== 'instant') {
      const dt = lastNow === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, start - lastNow));
      buildMs += dt * speed;
      target = targetStep(runner.total, buildMs, 1);
    } else {
      target = runner.index;
    }
    if (playing) lastNow = start;

    // Run single steps until the target or the frame budget; the rest carries over.
    while (runner.index < target && clock.now() - start < FRAME_BUDGET_MS) {
      runner.advance(1);
    }

    if (seekTarget !== null && runner.index >= seekTarget) seekTarget = null;
    if (runner.done) {
      playing = false;
      finishing = false;
      seekTarget = null;
      lastNow = null;
    }
    emit();
    schedule();
  }

  function restart() {
    runner = newRunner();
    buildMs = 0;
  }

  function startPlaying() {
    // A zero-step build is done immediately; it never "plays".
    playing = !runner.done;
    finishing = false;
    seekTarget = null;
    lastNow = clock.now();
  }

  const playback: Playback = {
    play() {
      if (destroyed) return;
      if (runner.done) {
        playback.replay();
        return;
      }
      if (playing) return;
      // A pending seek is abandoned; play continues from the current index.
      if (seekTarget !== null) buildMs = buildMsForStep(runner.index, runner.total);
      startPlaying();
      emit();
      schedule();
    },
    pause() {
      if (destroyed) return;
      playing = false;
      finishing = false;
      lastNow = null;
      emit();
      if (!active()) unschedule();
    },
    replay() {
      if (destroyed) return;
      unschedule();
      restart();
      startPlaying();
      emit();
      schedule();
    },
    seek(step: number) {
      if (destroyed) return;
      const total = runner.total;
      const k = Math.min(total, Math.max(0, Math.floor(Number.isFinite(step) ? step : 0)));
      if (k < runner.index) restart();
      playing = false;
      finishing = false;
      lastNow = null;
      seekTarget = k;
      buildMs = buildMsForStep(k, total);
      emit();
      schedule();
    },
    finish() {
      if (destroyed || runner.done) return;
      finishing = true;
      seekTarget = null;
      emit();
      schedule();
    },
    setSpeed(next: Speed) {
      if (destroyed || next === speed) return;
      // Leaving 'instant' mid-build: resume the timed curve from where we are.
      if (speed === 'instant') buildMs = buildMsForStep(runner.index, runner.total);
      speed = next;
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
    destroy() {
      destroyed = true;
      unschedule();
      subscribers.clear();
      playing = false;
      finishing = false;
      seekTarget = null;
    },
  };

  if (opts.autoplay) startPlaying();
  const startAt = Math.min(runner.total, Math.max(0, Math.floor(Number.isFinite(opts.startAt) ? opts.startAt! : 0)));
  if (startAt > 0) {
    // Reached before any timed play; play (if autoplaying) then continues on the curve from here.
    seekTarget = startAt;
    buildMs = buildMsForStep(startAt, runner.total);
  }
  lastEmitted = status();
  schedule();
  return playback;
}

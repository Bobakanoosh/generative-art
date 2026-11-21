import { describe, expect, it } from 'vitest';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { FRAME_BUDGET_MS, targetStep, type Speed } from './pacing';
import type { InputLog } from '@/lib/input/log';
import { createPlayback, type FrameClock, type PlaybackStatus } from './playback';

/** Fake frame clock: `now` is a mutable number; `request` queues callbacks until `tick`. */
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
  /** Runs one animation frame `ms` after the previous one. */
  function frame(ms: number) {
    now += ms;
    const callbacks = [...queue.values()];
    queue = new Map();
    for (const cb of callbacks) cb();
  }
  return {
    clock,
    advance(ms: number) {
      now += ms;
    },
    get pending() {
      return queue.size;
    },
    frame,
    /** Advances `ms` of wall time in frames of `frameMs` (default ~60 fps). */
    tick(ms: number, frameMs = 16) {
      let left = ms;
      while (left > 0) {
        const d = Math.min(frameMs, left);
        frame(d);
        left -= d;
      }
    },
  };
}

function setup(opts: { input?: InputLog; total?: number; cost?: number; speed?: Speed; autoplay?: boolean; startAt?: number } = {}) {
  const fc = fakeClock();
  const log: number[] = [];
  const inputLog: [number, string][] = [];
  const cost = opts.cost ?? 0;
  const piece: PieceDefinition<object> = {
    slug: 'fake',
    version: 1,
    title: 'Fake',
    aspect: 1,
    schema: {},
    featured: [],
    setup: () => ({}),
    steps: () => opts.total ?? 1000,
    step: (_ctx, _state, i, inp) => {
      log.push(i);
      inputLog.push([i, JSON.stringify(inp)]);
      fc.advance(cost);
    },
  };
  const ctx = {
    setTransform() {},
    clearRect() {},
    canvas: { width: 100, height: 100 },
  } as unknown as CanvasRenderingContext2D;
  const gen: Generation = { v: 1, s: 'seed', p: {} };
  const pb = createPlayback({
    piece: piece as PieceDefinition,
    gen,
    ctx,
    widthPx: 100,
    speed: opts.speed ?? 1,
    autoplay: opts.autoplay ?? true,
    startAt: opts.startAt,
    input: opts.input,
    clock: fc.clock,
  });
  return { pb, log, inputLog, fc, piece, ctx, gen };
}

const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => from + i);

describe('createPlayback', () => {
  it('plays to completion at 1x running every step once in order, same as finish()', () => {
    const a = setup({ total: 300 });
    a.fc.tick(11_000);
    expect(a.log).toEqual(range(300));
    expect(a.pb.status()).toMatchObject({ index: 300, total: 300, done: true, playing: false });

    const b = setup({ total: 300, autoplay: false });
    b.pb.finish();
    b.fc.tick(1000);
    expect(b.log).toEqual(a.log);
  });

  it('tracks targetStep after 5 s at 1x', () => {
    const { pb, fc } = setup({ total: 1000 });
    fc.tick(5000);
    expect(pb.status().index).toBe(targetStep(1000, 5000, 1));
  });

  it('carries over steps that exceed the frame budget to later frames', () => {
    // 20k steps over ~10 s needs far more than 3 steps (5 ms each) per frame near the end.
    const { pb, fc, log } = setup({ total: 20_000, cost: 5 });
    let prev = 0;
    let capped = 0;
    for (let f = 0; f < 2000 && !pb.status().done; f++) {
      fc.frame(16);
      const ran = log.length - prev;
      expect(ran).toBeLessThanOrEqual(3);
      if (ran === 3) capped++;
      prev = log.length;
    }
    expect(capped).toBeGreaterThan(0);
    // Behind the curve: the carried-over steps keep running on later frames.
    expect(pb.status().done).toBe(false);
    fc.tick(200_000);
    expect(pb.status().done).toBe(true);
    expect(log).toEqual(range(20_000));
  });

  it('runs at most 3 steps per frame at instant with a 5 ms step cost', () => {
    const { pb, fc, log } = setup({ total: 100, cost: 5, speed: 'instant' });
    let prev = 0;
    let frames = 0;
    while (!pb.status().done && frames < 100) {
      fc.frame(16);
      frames++;
      const ran = log.length - prev;
      expect(ran).toBeLessThanOrEqual(Math.ceil(FRAME_BUDGET_MS / 5));
      expect(ran).toBeGreaterThan(0);
      prev = log.length;
    }
    expect(log).toEqual(range(100));
    expect(frames).toBe(34);
  });

  it('caps a long frame at 100 ms of play time (no catch-up burst)', () => {
    const { pb, fc } = setup({ total: 10_000 });
    fc.tick(1000);
    const before = pb.status().index;
    fc.frame(60_000);
    const after = pb.status().index;
    const maxGain = targetStep(10_000, 1100, 1) - targetStep(10_000, 1000, 1);
    expect(after - before).toBeLessThanOrEqual(maxGain);
    expect(after).toBeLessThan(10_000);
  });

  it('pause stops index growth and play resumes from the same index', () => {
    const { pb, fc, log } = setup({ total: 1000 });
    fc.tick(3000);
    pb.pause();
    const i = pb.status().index;
    expect(pb.status().playing).toBe(false);
    fc.tick(3000);
    expect(pb.status().index).toBe(i);
    expect(fc.pending).toBe(0);
    pb.play();
    fc.tick(16);
    expect(pb.status().index).toBeGreaterThanOrEqual(i);
    fc.tick(2000);
    expect(pb.status().index).toBeGreaterThan(i);
    expect(log).toEqual(range(log.length));
    // Paused time does not count: 3 s + 2 s of play ≈ 5 s of target.
    expect(pb.status().index).toBe(targetStep(1000, 5016, 1));
  });

  it('seek backward reruns from a fresh runner and pauses', () => {
    const { pb, fc, log } = setup({ total: 200, speed: 'instant', autoplay: false });
    pb.seek(50);
    fc.tick(100);
    expect(pb.status().index).toBe(50);
    expect(log).toEqual(range(50));
    pb.seek(10);
    fc.tick(100);
    expect(log.slice(50)).toEqual(range(10));
    expect(pb.status()).toMatchObject({ index: 10, playing: false, done: false });
  });

  it('seek while playing pauses, and play continues from the seek point', () => {
    const { pb, fc, log } = setup({ total: 1000 });
    fc.tick(6000);
    expect(pb.status().index).toBeGreaterThan(50);
    pb.seek(50);
    fc.tick(100);
    expect(pb.status()).toMatchObject({ index: 50, playing: false });
    const n = log.length;
    pb.play();
    fc.tick(200);
    const tail = log.slice(n);
    expect(tail[0]).toBe(50);
    expect(tail).toEqual(range(tail.length, 50));
  });

  it('seek past total clamps to total', () => {
    const { pb, fc, log } = setup({ total: 40, autoplay: false });
    pb.seek(45);
    fc.tick(100);
    expect(pb.status()).toMatchObject({ index: 40, total: 40, done: true });
    expect(log).toEqual(range(40));
    pb.seek(-3);
    fc.tick(100);
    expect(pb.status().index).toBe(0);
  });

  it('seek is budgeted across frames', () => {
    const { pb, fc, log } = setup({ total: 100, cost: 5, autoplay: false });
    pb.seek(30);
    fc.frame(16);
    expect(log.length).toBe(3);
    fc.tick(1000);
    expect(pb.status().index).toBe(30);
  });

  it('seek floors fractional steps', () => {
    const { pb, fc } = setup({ total: 100, autoplay: false });
    pb.seek(12.7);
    fc.tick(100);
    expect(pb.status().index).toBe(12);
  });

  it('never runs a step after destroy()', () => {
    const { pb, fc, log } = setup({ total: 1000 });
    fc.tick(2000);
    const n = log.length;
    pb.destroy();
    fc.tick(5000);
    pb.play();
    pb.finish();
    pb.seek(900);
    fc.tick(5000);
    expect(log.length).toBe(n);
    expect(fc.pending).toBe(0);
  });

  it('subscribe fires on changes and unsubscribe stops it', () => {
    const { pb, fc } = setup({ total: 100, autoplay: false });
    const seen: PlaybackStatus[] = [];
    const off = pb.subscribe((s) => seen.push(s));
    pb.play();
    expect(seen.at(-1)?.playing).toBe(true);
    fc.tick(1000);
    const n = seen.length;
    expect(n).toBeGreaterThan(1);
    off();
    fc.tick(1000);
    pb.pause();
    expect(seen.length).toBe(n);
  });

  it('notifies at most once per frame and stops when done', () => {
    const { pb, fc } = setup({ total: 50, speed: 'instant', cost: 1 });
    let calls = 0;
    pb.subscribe(() => calls++);
    let frames = 0;
    while (!pb.status().done) {
      fc.frame(16);
      frames++;
    }
    expect(calls).toBeLessThanOrEqual(frames);
    const c = calls;
    fc.tick(1000);
    expect(calls).toBe(c);
    expect(fc.pending).toBe(0);
  });

  it('setSpeed("instant") mid-play finishes on budgeted frames', () => {
    const { pb, fc, log } = setup({ total: 200, cost: 5 });
    fc.tick(3000);
    const i = pb.status().index;
    expect(i).toBeLessThan(200);
    pb.setSpeed('instant');
    expect(pb.status().speed).toBe('instant');
    fc.frame(16);
    expect(log.length - i).toBeLessThanOrEqual(3);
    fc.tick(5000);
    expect(pb.status().done).toBe(true);
    expect(log).toEqual(range(200));
  });

  it('changing timed speed keeps the build continuous (no jump)', () => {
    const { pb, fc } = setup({ total: 10_000 });
    fc.tick(4000);
    const i = pb.status().index;
    pb.setSpeed(2);
    fc.frame(16);
    expect(pb.status().index - i).toBeLessThan(100);
  });

  it('autoplay false renders nothing until play() or finish()', () => {
    const { pb, fc, log } = setup({ total: 100, autoplay: false });
    fc.tick(5000);
    expect(log).toEqual([]);
    expect(pb.status()).toMatchObject({ index: 0, total: 100, playing: false, done: false });
    pb.play();
    fc.tick(11_000);
    expect(log).toEqual(range(100));
  });

  it('replay restarts from step 0 and plays', () => {
    const { pb, fc, log } = setup({ total: 100, speed: 'instant' });
    fc.tick(1000);
    expect(pb.status().done).toBe(true);
    pb.replay();
    expect(pb.status()).toMatchObject({ index: 0, playing: true, done: false });
    fc.tick(1000);
    expect(log).toEqual([...range(100), ...range(100)]);
  });

  it('play() after done replays', () => {
    const { pb, fc, log } = setup({ total: 20, speed: 'instant' });
    fc.tick(100);
    pb.play();
    fc.tick(100);
    expect(log).toEqual([...range(20), ...range(20)]);
  });

  it('a zero-step build is done and never playing (autoplay)', () => {
    const { pb, fc, log } = setup({ total: 0 });
    expect(pb.status()).toMatchObject({ index: 0, total: 0, playing: false, done: true });
    fc.tick(100);
    expect(pb.status().playing).toBe(false);
    expect(log).toEqual([]);
    expect(fc.pending).toBe(0);
  });

  it('play() and replay() on a zero-step build stay not playing', () => {
    const { pb } = setup({ total: 0, autoplay: false });
    pb.play();
    expect(pb.status()).toMatchObject({ playing: false, done: true });
    pb.replay();
    expect(pb.status()).toMatchObject({ playing: false, done: true });
  });

  it('a subscriber calling replay() mid-delivery never leaves others with a stale status', () => {
    const { pb, fc } = setup({ total: 20, speed: 'instant' });
    const second: PlaybackStatus[] = [];
    let replayed = false;
    pb.subscribe((s) => {
      if (s.done && !replayed) {
        replayed = true;
        pb.replay();
      }
    });
    pb.subscribe((s) => second.push(s));
    fc.tick(100);
    expect(replayed).toBe(true);
    // The replay's status arrived after (not before) any done status.
    const firstReplay = second.findIndex((s) => s.index === 0 && s.playing);
    expect(firstReplay).toBeGreaterThanOrEqual(0);
    // After the replay starts, indices only move forward (no stale done status in between).
    const after = second.slice(firstReplay).map((s) => s.index);
    expect(after).toEqual([...after].sort((a, b) => a - b));
    expect(second.at(-1)).toMatchObject({ index: 20, done: true });
  });

  it('the last status a later subscriber receives after a nested replay is the replayed one', () => {
    const { pb, fc } = setup({ total: 20, speed: 'instant', autoplay: false });
    pb.finish();
    let last: PlaybackStatus | null = null;
    let once = false;
    pb.subscribe((s) => {
      if (s.done && !once) {
        once = true;
        pb.replay();
      }
    });
    pb.subscribe((s) => {
      last = s;
    });
    fc.frame(16); // finishes -> done -> first subscriber replays
    expect(once).toBe(true);
    expect(last).toMatchObject({ index: 0, playing: true, done: false });
  });

  it('destroy() from a subscriber stops further deliveries', () => {
    const { pb, fc } = setup({ total: 100 });
    let secondCalls = 0;
    pb.subscribe(() => pb.destroy());
    pb.subscribe(() => secondCalls++);
    fc.tick(1000);
    expect(secondCalls).toBe(0);
    expect(fc.pending).toBe(0);
  });

  it('a subscriber unsubscribed earlier in a pass is not called in that pass', () => {
    const { pb, fc } = setup({ total: 100 });
    let secondCalls = 0;
    let offSecond = () => {};
    pb.subscribe(() => offSecond());
    offSecond = pb.subscribe(() => secondCalls++);
    fc.tick(1000);
    expect(secondCalls).toBe(0);
  });

  describe('startAt (restoring a position, e.g. after a canvas resize)', () => {
    it('without autoplay advances to startAt on budgeted frames and stays paused there', () => {
      const { pb, fc, log } = setup({ total: 100, cost: 5, autoplay: false, startAt: 30 });
      expect(pb.status()).toMatchObject({ index: 0, playing: false });
      fc.frame(16);
      expect(log.length).toBe(3);
      fc.tick(1000);
      expect(pb.status()).toMatchObject({ index: 30, playing: false, done: false });
      expect(log).toEqual(range(30));
      expect(fc.pending).toBe(0);
    });

    it('with autoplay reaches startAt, then keeps playing on the curve from there', () => {
      const { pb, fc, log } = setup({ total: 1000, startAt: 400 });
      expect(pb.status().playing).toBe(true);
      fc.frame(16);
      expect(pb.status().index).toBe(400);
      fc.tick(1000);
      expect(pb.status().index).toBeGreaterThan(400);
      expect(pb.status().playing).toBe(true);
      expect(log).toEqual(range(log.length));
      fc.tick(20_000);
      expect(pb.status()).toMatchObject({ index: 1000, done: true, playing: false });
    });

    it('does not jump: playing from startAt continues at the pace it had there', () => {
      const ref = setup({ total: 1000 });
      ref.fc.tick(4000);
      const at = ref.pb.status().index;
      ref.fc.tick(1000);
      const refGain = ref.pb.status().index - at;

      const { pb, fc } = setup({ total: 1000, startAt: at });
      fc.frame(16);
      expect(pb.status().index).toBe(at);
      fc.tick(1000);
      const gain = pb.status().index - at;
      expect(Math.abs(gain - refGain)).toBeLessThanOrEqual(Math.ceil(refGain * 0.05) + 2);
    });

    it('pause during the restore still lands on startAt, paused', () => {
      const { pb, fc } = setup({ total: 100, cost: 5, startAt: 30 });
      pb.pause();
      fc.tick(1000);
      expect(pb.status()).toMatchObject({ index: 30, playing: false });
    });

    it('clamps startAt to [0, total] and floors it', () => {
      const a = setup({ total: 40, autoplay: false, startAt: 99 });
      a.fc.tick(100);
      expect(a.pb.status()).toMatchObject({ index: 40, done: true, playing: false });
      const b = setup({ total: 40, autoplay: false, startAt: 7.9 });
      b.fc.tick(100);
      expect(b.pb.status().index).toBe(7);
      const c = setup({ total: 40, autoplay: false, startAt: -5 });
      c.fc.tick(100);
      expect(c.pb.status().index).toBe(0);
      expect(c.fc.pending).toBe(0);
    });

    it('startAt 0 or omitted behaves as before', () => {
      const a = setup({ total: 300, startAt: 0 });
      const b = setup({ total: 300 });
      a.fc.tick(3000);
      b.fc.tick(3000);
      expect(a.log).toEqual(b.log);
    });
  });

  it('propagates the endless-piece error', () => {
    const fc = fakeClock();
    const piece = {
      slug: 'e', version: 1, title: 'E', aspect: 1, schema: {}, featured: [],
      setup: () => ({}), steps: () => Infinity, step: () => {},
    } as PieceDefinition;
    const ctx = { setTransform() {}, clearRect() {}, canvas: { width: 1, height: 1 } } as unknown as CanvasRenderingContext2D;
    expect(() =>
      createPlayback({ piece, gen: { v: 1, s: 'x', p: {} }, ctx, widthPx: 1, speed: 1, autoplay: true, clock: fc.clock }),
    ).toThrow('Endless piece requires a stop step');
  });
});

describe('playback input replay', () => {
  const input: InputLog = { p: [[3, 100, 200, 1], [4]], k: [[5, 'a']] };

  it('seek back then forward replays the same input per step as an uninterrupted run', () => {
    const a = setup({ total: 20, input, autoplay: false });
    a.pb.finish();
    a.fc.tick(1000);

    const b = setup({ total: 20, input, autoplay: false });
    b.pb.seek(12);
    b.fc.tick(1000);
    b.pb.seek(2);
    b.fc.tick(1000);
    b.pb.finish();
    b.fc.tick(1000);

    // After the rewind, the tail of b's calls is a full fresh run.
    expect(b.inputLog.slice(-20)).toEqual(a.inputLog);
    expect(a.inputLog[3][1]).toContain('"x":10');
    expect(a.inputLog[5][1]).toContain('"keys":["a"]');
  });
});

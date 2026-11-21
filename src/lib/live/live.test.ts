import { describe, expect, it } from 'vitest';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { MAX_INPUT_EVENTS, validateInputLog } from '@/lib/input/log';
import { MAX_EVENTS_PER_STEP, createRecorder, type Recorder } from '@/lib/input/recorder';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import type { FrameClock } from '@/lib/playback/playback';
import { INPUT_FULL_NOTICE, LIMIT_NOTICE, LIVE_STEPS_PER_SECOND, createLiveSim } from './live';

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
  function frame(ms: number) {
    now += ms;
    const cbs = [...queue.values()];
    queue = new Map();
    for (const cb of cbs) cb();
  }
  return {
    clock,
    advance(ms: number) {
      now += ms;
    },
    frame,
    get pending() {
      return queue.size;
    },
  };
}

function setup(
  opts: {
    steps?: number;
    cost?: number;
    autoplay?: boolean;
    startAt?: number;
    epoch?: number;
    recorder?: Recorder;
    onStep?: (i: number) => void;
  } = {},
) {
  const fc = fakeClock();
  const calls: [number, string][] = [];
  const piece: PieceDefinition<object> = {
    slug: 'fake',
    version: 1,
    title: 'Fake',
    aspect: 1,
    schema: {},
    featured: [],
    setup: () => ({}),
    steps: () => opts.steps ?? Infinity,
    step: (_c, _s, i, inp) => {
      calls.push([i, JSON.stringify(inp)]);
      opts.onStep?.(i);
      fc.advance(opts.cost ?? 0);
    },
  };
  const ctx = { setTransform() {}, clearRect() {}, canvas: { width: 100, height: 100 } } as unknown as CanvasRenderingContext2D;
  const gen: Generation = { v: 1, s: 'seed', p: {}, n: 5 };
  const recorder = opts.recorder ?? createRecorder({ height: 1000 });
  const sim = createLiveSim({
    piece: piece as PieceDefinition,
    gen,
    ctx,
    widthPx: 100,
    recorder,
    clock: fc.clock,
    startAt: opts.startAt,
    autoplay: opts.autoplay ?? true,
    epoch: opts.epoch,
  });
  return { sim, fc, calls, recorder };
}

describe('createLiveSim', () => {
  it('exports constants', () => {
    expect(LIVE_STEPS_PER_SECOND).toBe(60);
    expect(LIMIT_NOTICE).toBe('Reached the 27-minute limit. Capture this moment or restart.');
    expect(INPUT_FULL_NOTICE).toBe('This session has too much input to save. Capture this moment or restart.');
  });

  it('runs 60 steps in one second of 60 fps frames', () => {
    const { sim, fc, calls } = setup();
    for (let f = 0; f < 60; f++) fc.frame(1000 / 60);
    expect(calls.length).toBe(60);
    expect(calls.map((c) => c[0])).toEqual(Array.from({ length: 60 }, (_, i) => i));
    expect(sim.status()).toMatchObject({ index: 60, playing: true, limited: false, catchingUp: false });
  });

  it('caps a huge clock jump at 100 ms of credit with no later burst', () => {
    const { fc, calls } = setup();
    fc.frame(16.7);
    const before = calls.length;
    fc.frame(60_000);
    expect(calls.length - before).toBe(6);
    const after = calls.length;
    fc.frame(16.7);
    expect(calls.length - after).toBe(1);
  });

  it('drops the backlog when over budget and keeps steps contiguous', () => {
    const { fc, calls } = setup({ cost: 13 });
    fc.frame(16.7);
    fc.frame(100); // 6 due, only 1 fits the budget
    fc.frame(16.7);
    fc.frame(100);
    expect(calls.map((c) => c[0])).toEqual(calls.map((_, i) => i));
    const n = calls.length;
    fc.frame(16.7);
    expect(calls.length - n).toBeLessThanOrEqual(1);
  });

  it('pause stops steps and play resumes without a jump', () => {
    const { sim, fc, calls } = setup();
    fc.frame(16.7);
    fc.frame(16.7);
    sim.pause();
    const n = calls.length;
    fc.frame(5000);
    fc.frame(5000);
    expect(calls.length).toBe(n);
    expect(sim.status().playing).toBe(false);
    fc.advance(30_000);
    sim.play();
    fc.frame(16.7);
    expect(calls.length - n).toBeLessThanOrEqual(1);
    expect(sim.status().playing).toBe(true);
  });

  it('feeds live steps from recorder.frame and capture returns n and the log', () => {
    const { sim, fc, recorder } = setup();
    recorder.setPointer({ x: 50, y: 60, down: true });
    for (let f = 0; f < 10; f++) fc.frame(1000 / 60);
    const cap = sim.capture();
    expect(cap.n).toBe(sim.status().index);
    expect(cap.n).toBeGreaterThan(0);
    expect(cap.input).toEqual(recorder.log());
    expect(cap.input.p[0]).toEqual([0, 500, 600, 1]);
    expect(sim.status().playing).toBe(false);
  });

  it('snapshot returns the moment without pausing, optionally cut at an earlier step', () => {
    const { sim, fc, recorder } = setup();
    for (let f = 0; f < 5; f++) fc.frame(1000 / 60);
    recorder.setPointer({ x: 50, y: 60, down: true });
    for (let f = 0; f < 5; f++) fc.frame(1000 / 60);
    const snap = sim.snapshot();
    expect(snap.n).toBe(10);
    expect(snap.input).toEqual(recorder.log());
    expect(sim.status().playing).toBe(true);
    // Cut before the pointer event at step 5: no input yet.
    expect(sim.snapshot(5)).toEqual({ n: 5, input: { p: [], k: [] } });
    expect(sim.snapshot(6).input.p).toEqual([[5, 500, 600, 1]]);
    // Never beyond the current step.
    expect(sim.snapshot(999).n).toBe(10);
  });

  it('restart clears the log and index and plays', () => {
    const { sim, fc, recorder, calls } = setup();
    recorder.setPointer({ x: 5, y: 5, down: false });
    for (let f = 0; f < 10; f++) fc.frame(16.7);
    sim.pause();
    sim.restart();
    expect(recorder.log()).toEqual({ p: [], k: [] });
    expect(sim.status()).toMatchObject({ index: 0, playing: true });
    const n = calls.length;
    fc.frame(16.7);
    fc.frame(16.7);
    expect(calls[n][0]).toBe(0);
  });

  it('restart bumps the epoch and emits it, even when the sim is still at step 0', () => {
    const { sim } = setup({ autoplay: false });
    const seen: number[] = [];
    sim.subscribe((st) => seen.push(st.epoch));
    expect(sim.status()).toMatchObject({ index: 0, epoch: 0 });
    sim.restart();
    expect(sim.status()).toMatchObject({ index: 0, epoch: 1 });
    sim.restart();
    expect(seen).toEqual([1, 2]);
  });

  it('a resumed sim (resize) keeps the session epoch it is given', () => {
    const { sim } = setup({ epoch: 3, startAt: 0 });
    expect(sim.status().epoch).toBe(3);
    sim.restart();
    expect(sim.status().epoch).toBe(4);
  });

  it('startAt replays recorded input for 0..startAt-1 then continues live', () => {
    const first = setup();
    first.recorder.setPointer({ x: 1, y: 2, down: true });
    for (let f = 0; f < 400; f++) {
      if (f === 100) first.recorder.setPointer({ x: 300, y: 200, down: false });
      if (f === 150) first.recorder.pressKey('a');
      first.fc.frame(1000 / 60);
    }
    first.sim.pause();
    const orig = first.calls.slice(0, 300);
    expect(orig.length).toBe(300);

    const second = setup({ startAt: 300, recorder: first.recorder });
    expect(second.sim.status()).toMatchObject({ catchingUp: true, index: 0 });
    second.fc.frame(1);
    expect(second.sim.status()).toMatchObject({ catchingUp: false, index: 300, playing: true });
    expect(second.calls.slice(0, 300)).toEqual(orig);
    // events at/after 300 were discarded
    second.fc.frame(16.7);
    expect(second.calls[300][0]).toBe(300);
  });

  it('catch-up is budgeted across frames and autoplay:false stays paused', () => {
    const { sim, fc, calls } = setup({ startAt: 100, cost: 5, autoplay: false });
    fc.frame(16);
    expect(calls.length).toBeLessThan(100);
    expect(sim.status().catchingUp).toBe(true);
    for (let f = 0; f < 60; f++) fc.frame(16);
    expect(sim.status()).toMatchObject({ index: 100, catchingUp: false, playing: false });
    expect(fc.pending).toBe(0);
  });

  it('endless piece stops at the cap with limited', () => {
    const s = setup({ startAt: MAX_STOP_STEP - 2 });
    for (let f = 0; f < 10; f++) s.fc.frame(16.7);
    expect(s.sim.status()).toMatchObject({ index: MAX_STOP_STEP, limited: true, playing: false });
    expect(s.calls.length).toBe(MAX_STOP_STEP);
    expect(s.fc.pending).toBe(0);
  });

  it('a finite piece finishes: paused, not limited', () => {
    const { sim, fc, calls } = setup({ steps: 30 });
    for (let f = 0; f < 100; f++) fc.frame(16.7);
    expect(calls.length).toBe(30);
    expect(sim.status()).toMatchObject({ index: 30, playing: false, limited: false });
  });

  it('pauses with inputFull when the event cap is reached', () => {
    let toggle = false;
    const holder: { r?: Recorder } = {};
    const { sim, fc, recorder } = setup({
      onStep: () => {
        toggle = !toggle;
        holder.r?.setPointer({ x: toggle ? 1 : 2, y: 1, down: true });
      },
    });
    holder.r = recorder;
    for (let f = 0; f < 40_000 && !sim.status().inputFull; f++) fc.frame(100);
    expect(sim.status()).toMatchObject({ inputFull: true, playing: false });
    expect(recorder.count()).toBeGreaterThan(MAX_INPUT_EVENTS - MAX_EVENTS_PER_STEP);
    expect(recorder.count()).toBeLessThanOrEqual(MAX_INPUT_EVENTS);
    sim.restart();
    expect(sim.status()).toMatchObject({ inputFull: false, playing: true });
  });

  it('never exceeds the event cap even when many keys are pressed in the capping step', () => {
    const holder: { r?: Recorder } = {};
    let toggle = false;
    const { sim, fc, recorder } = setup({
      onStep: () => {
        toggle = !toggle;
        holder.r?.setPointer({ x: toggle ? 1 : 2, y: 1, down: true });
        for (let k = 0; k < 50; k++) holder.r?.pressKey('a'); // flood the pending queue
      },
    });
    holder.r = recorder;
    for (let f = 0; f < 40_000 && !sim.status().inputFull; f++) fc.frame(100);
    expect(sim.status().inputFull).toBe(true);
    expect(recorder.count()).toBeLessThanOrEqual(MAX_INPUT_EVENTS);
    const cap = sim.capture();
    expect(validateInputLog(cap.input, { width: 1000, height: 1000, n: cap.n + 1 }).ok).toBe(true);
  });

  it('a resumed log already at the cap does not run another live step', () => {
    const rec = createRecorder({ height: 1000 });
    for (let i = 0; i < MAX_INPUT_EVENTS; i++) {
      rec.setPointer({ x: i % 2 ? 1 : 2, y: 1, down: true });
      rec.frame(i);
    }
    const { sim, fc, calls } = setup({ recorder: rec, startAt: MAX_INPUT_EVENTS });
    for (let f = 0; f < 5; f++) fc.frame(16.7);
    expect(calls.length).toBe(MAX_INPUT_EVENTS);
    expect(sim.status()).toMatchObject({ inputFull: true, playing: false });
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const { sim, fc } = setup();
    const seen: number[] = [];
    const off = sim.subscribe((s) => seen.push(s.index));
    fc.frame(16.7);
    fc.frame(16.7);
    expect(seen.length).toBeGreaterThan(0);
    off();
    const n = seen.length;
    fc.frame(16.7);
    expect(seen.length).toBe(n);
  });

  it('destroy stops all steps', () => {
    const { sim, fc, calls } = setup();
    fc.frame(16.7);
    fc.frame(16.7);
    sim.destroy();
    const n = calls.length;
    fc.frame(16.7);
    fc.frame(16.7);
    sim.play();
    fc.frame(16.7);
    expect(calls.length).toBe(n);
  });
});

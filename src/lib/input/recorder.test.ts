import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/art/rng';
import { EMPTY_INPUT, type InputFrame } from '@/lib/piece/types';
import { replaySource, validateInputLog } from './log';
import { MAX_KEYS_PER_STEP, createRecorder } from './recorder';

const HEIGHT = 500;

describe('createRecorder', () => {
  it('produces empty frames and an empty log with no input', () => {
    const r = createRecorder({ height: HEIGHT });
    expect(r.frame(0)).toEqual(EMPTY_INPUT);
    expect(r.log()).toEqual({ p: [], k: [] });
  });

  it('logs the scripted session as deltas', () => {
    const r = createRecorder({ height: HEIGHT });
    for (let i = 0; i < 12; i++) {
      if (i === 3) r.setPointer({ x: 10, y: 20, down: false });
      if (i === 5) r.setPointer({ x: 15, y: 20, down: false });
      if (i === 5) r.setPointer({ x: 15, y: 20, down: true });
      if (i === 7) r.pressKey('a');
      if (i === 9) r.setPointer(null);
      r.frame(i);
    }
    expect(r.log()).toEqual({
      p: [[3, 100, 200, 0], [2, 150, 200, 1], [4]],
      k: [[7, 'a']],
    });
  });

  it('quantizes and clamps the pointer to the logical area', () => {
    const r = createRecorder({ height: HEIGHT });
    r.setPointer({ x: -5, y: 9999, down: false });
    expect(r.frame(0).pointer).toEqual({ x: 0, y: HEIGHT, down: false });
    r.setPointer({ x: 12.34, y: -0.04, down: true });
    const f = r.frame(1);
    expect(f.pointer).toEqual({ x: 12.3, y: 0, down: true });
    expect(Object.is(f.pointer!.y, 0)).toBe(true);
  });

  it('ignores over-long keys and drains keys each frame in order', () => {
    const r = createRecorder({ height: HEIGHT });
    r.pressKey('a');
    r.pressKey('b');
    r.pressKey('x'.repeat(17));
    expect(r.frame(0).keys).toEqual(['a', 'b']);
    expect(r.frame(1).keys).toEqual([]);
  });

  it('does not log unchanged pointer states', () => {
    const r = createRecorder({ height: HEIGHT });
    r.setPointer({ x: 1, y: 1, down: false });
    for (let i = 0; i < 5; i++) r.frame(i);
    r.setPointer({ x: 1.01, y: 1.02, down: false }); // same quantized
    r.frame(5);
    expect(r.log().p).toEqual([[0, 10, 10, 0]]);
  });

  it('log() returns a copy', () => {
    const r = createRecorder({ height: HEIGHT });
    r.pressKey('a');
    r.frame(0);
    const l = r.log();
    l.k.push([1, 'z']);
    expect(r.log().k).toEqual([[0, 'a']]);
  });

  function session(seed: string, steps: number) {
    const rng = createRng(seed);
    const r = createRecorder({ height: HEIGHT });
    const frames: InputFrame[] = [];
    for (let i = 0; i < steps; i++) {
      if (rng.bool(0.1)) {
        if (rng.bool(0.15)) r.setPointer(null);
        else r.setPointer({ x: rng.range(-50, 1050), y: rng.range(-50, HEIGHT + 50), down: rng.bool() });
      }
      if (rng.bool(0.05)) r.pressKey(rng.pick(['a', 'b', 'Space', 'ArrowLeft']));
      if (rng.bool(0.02)) r.pressKey('c');
      frames.push(r.frame(i));
    }
    return { r, frames };
  }

  it('live frames deep-equal replay frames (50 random sessions)', () => {
    for (let s = 0; s < 50; s++) {
      const { r, frames } = session(`input-${s}`, 500);
      const log = r.log();
      const src = replaySource(log);
      for (let i = 0; i < 500; i++) expect(src(i)).toEqual(frames[i]);
      expect(validateInputLog(log, { width: 1000, height: HEIGHT, n: 500 }).ok).toBe(true);
    }
  });

  it('truncate drops events at steps >= i and resumes cleanly', () => {
    for (let s = 0; s < 20; s++) {
      const { r, frames } = session(`trunc-${s}`, 100);
      r.truncate(6);
      const src = replaySource(r.log());
      for (let i = 0; i < 6; i++) expect(src(i)).toEqual(frames[i]);
      const resumed: InputFrame[] = [];
      const rng = createRng(`resume-${s}`);
      for (let i = 6; i < 60; i++) {
        if (rng.bool(0.2)) r.setPointer({ x: rng.range(0, 1000), y: rng.range(0, HEIGHT), down: rng.bool() });
        if (rng.bool(0.1)) r.pressKey('q');
        resumed.push(r.frame(i));
      }
      const log = r.log();
      expect(validateInputLog(log, { width: 1000, height: HEIGHT, n: 60 }).ok).toBe(true);
      const src2 = replaySource(log);
      for (let i = 0; i < 6; i++) expect(src2(i)).toEqual(frames[i]);
      for (let i = 6; i < 60; i++) expect(src2(i)).toEqual(resumed[i - 6]);
    }
  });

  it('count() equals the number of logged events', () => {
    const r = createRecorder({ height: HEIGHT });
    expect(r.count()).toBe(0);
    r.setPointer({ x: 10, y: 10, down: true });
    r.pressKey('a');
    r.frame(0);
    r.frame(1);
    expect(r.count()).toBe(2);
    r.setPointer(null);
    r.frame(2);
    expect(r.count()).toBe(3);
    r.truncate(1);
    expect(r.count()).toBe(2);
    r.truncate(0);
    expect(r.count()).toBe(0);
  });

  it('delivers at most MAX_KEYS_PER_STEP keys per step, dropping extras before delivery', () => {
    const r = createRecorder({ height: HEIGHT });
    for (let k = 0; k < 50; k++) r.pressKey('a');
    const f = r.frame(0);
    expect(f.keys.length).toBe(MAX_KEYS_PER_STEP);
    expect(r.count()).toBe(MAX_KEYS_PER_STEP);
    expect(r.frame(1).keys).toEqual([]);
  });

  it('truncate(0) empties the log', () => {
    const { r } = session('t0', 100);
    r.truncate(0);
    expect(r.log()).toEqual({ p: [], k: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { MAX_STOP_STEP } from '@/lib/piece/share';
import type { LiveStatus } from '@/lib/live/live';
import { clipFramePlan, loopFramePlan } from './plan';
import {
  DEFAULT_CLIP_SECONDS,
  MIN_RECORDING_STEPS,
  clipChoices,
  clipGeneration,
  liveClipFileId,
  liveFramePlan,
  loopStepsValid,
  parseClipChoice,
  recordingEnd,
  recordingInterruption,
  recordingVerdict,
  stopVerdict,
} from './liveClip';

const status = (o: Partial<LiveStatus>): LiveStatus => ({
  index: 0,
  playing: true,
  limited: false,
  catchingUp: false,
  inputFull: false,
  epoch: 0,
  ...o,
});

describe('clipChoices', () => {
  it('offers 5/10/15 s, defaulting to 10 s', () => {
    expect(clipChoices({})).toEqual(['5', '10', '15']);
    expect(DEFAULT_CLIP_SECONDS).toBe(10);
  });

  it('adds Loop only when the piece declares loopSteps', () => {
    expect(clipChoices({ loopSteps: 240 })).toEqual(['5', '10', '15', 'loop']);
    expect(clipChoices({ loopSteps: undefined })).not.toContain('loop');
  });
});

describe('parseClipChoice', () => {
  it('parses the select values, falling back to the default clip', () => {
    expect(parseClipChoice('5')).toEqual({ kind: 'clip', seconds: 5 });
    expect(parseClipChoice('15')).toEqual({ kind: 'clip', seconds: 15 });
    expect(parseClipChoice('loop')).toEqual({ kind: 'loop' });
    expect(parseClipChoice('7')).toEqual({ kind: 'clip', seconds: 10 });
  });
});

describe('liveFramePlan', () => {
  it('a clip runs from the current step', () => {
    expect(liveFramePlan({ kind: 'clip', seconds: 5 }, 300, 30)).toEqual(clipFramePlan(300, 5, 30));
  });

  it('a loop is one period, independent of the current step', () => {
    expect(liveFramePlan({ kind: 'loop' }, 300, 15, 240)).toEqual(loopFramePlan(240, 15));
  });

  it('rejects a loop without valid loopSteps', () => {
    expect(() => liveFramePlan({ kind: 'loop' }, 300, 15)).toThrow();
    expect(() => liveFramePlan({ kind: 'loop' }, 300, 15, 30)).toThrow();
  });
});

describe('loopStepsValid', () => {
  it('accepts positive multiples of 4 only', () => {
    expect(loopStepsValid(4)).toBe(true);
    expect(loopStepsValid(240)).toBe(true);
    for (const bad of [0, -4, 2, 6, 4.5, NaN, Infinity]) expect(loopStepsValid(bad)).toBe(false);
  });
});

describe('recordingEnd', () => {
  it('is start + seconds of live steps, capped at the stop step', () => {
    expect(recordingEnd(100, 10)).toBe(700);
    expect(recordingEnd(MAX_STOP_STEP - 100, 15)).toBe(MAX_STOP_STEP);
  });
});

describe('recordingVerdict', () => {
  const rec = { start: 600, end: 900, epoch: 0 };

  it('keeps recording while live, counting whole seconds', () => {
    expect(recordingVerdict(rec, status({ index: 600 }))).toEqual({ kind: 'recording', elapsed: 0 });
    expect(recordingVerdict(rec, status({ index: 719 }))).toEqual({ kind: 'recording', elapsed: 1 });
  });

  it('finishes at the end step even if the sim overshot it', () => {
    expect(recordingVerdict(rec, status({ index: 900 }))).toEqual({ kind: 'finish', at: 900 });
    expect(recordingVerdict(rec, status({ index: 905 }))).toEqual({ kind: 'finish', at: 900 });
  });

  it('cancels when the sim went back before the start (Restart)', () => {
    expect(recordingVerdict(rec, status({ index: 3 }))).toEqual({ kind: 'cancel', reason: 'restarted' });
  });

  it('cancels after a Restart even when the recording began at step 0 (epoch changed)', () => {
    const fromZero = { start: 0, end: recordingEnd(0, 5), epoch: 2 };
    expect(recordingVerdict(fromZero, status({ index: 0, epoch: 2 }))).toEqual({ kind: 'recording', elapsed: 0 });
    // Restart at step 0 (or a few steps in): the index alone can't tell, the epoch can.
    for (const index of [0, 1, 200]) {
      expect(recordingVerdict(fromZero, status({ index, epoch: 3 }))).toEqual({ kind: 'cancel', reason: 'restarted' });
    }
    // Even mid catch-up or paused, a new epoch cancels.
    expect(recordingVerdict(fromZero, status({ index: 0, epoch: 3, catchingUp: true }))).toEqual({
      kind: 'cancel',
      reason: 'restarted',
    });
  });

  it('waits while a resized sim catches up', () => {
    expect(recordingVerdict(rec, status({ index: 10, catchingUp: true, playing: false }))).toEqual({
      kind: 'recording',
      elapsed: 0,
    });
  });

  it('ends early with what was recorded when paused, limited or out of input', () => {
    for (const s of [
      status({ index: 700, playing: false }),
      status({ index: 700, playing: false, limited: true }),
      status({ index: 700, playing: false, inputFull: true }),
    ]) {
      expect(recordingVerdict(rec, s)).toEqual({ kind: 'finish', at: 700 });
    }
  });

  it('cancels an early end shorter than a second', () => {
    expect(recordingVerdict(rec, status({ index: 600 + MIN_RECORDING_STEPS - 1, playing: false }))).toEqual({
      kind: 'cancel',
      reason: 'too-short',
    });
  });
});

describe('stopVerdict', () => {
  it('Stop keeps what was recorded (at least a second), capped at the end', () => {
    const rec = { start: 600, end: 900, epoch: 0 };
    expect(stopVerdict(rec, 700)).toEqual({ kind: 'finish', at: 700 });
    expect(stopVerdict(rec, 950)).toEqual({ kind: 'finish', at: 900 });
    expect(stopVerdict(rec, 630)).toEqual({ kind: 'cancel', reason: 'too-short' });
  });
});

describe('liveClipFileId', () => {
  it('names a clip by seed and start step, a loop by seed', () => {
    expect(liveClipFileId('abc', { kind: 'clip', seconds: 5 }, 1234)).toBe('abc-1234');
    expect(liveClipFileId('abc', { kind: 'loop' }, 1234)).toBe('abc-loop');
  });
});

describe('clipGeneration', () => {
  it("stops the export runner at the plan's last frame (endless runners need a stop step)", () => {
    const gen = { v: 1, s: 'abc', p: { a: 1 } };
    expect(clipGeneration(gen, [100, 102, 104])).toEqual({ v: 1, s: 'abc', p: { a: 1 }, n: 104 });
    expect(gen).not.toHaveProperty('n');
  });

  it('rejects an empty plan', () => {
    expect(() => clipGeneration({ v: 1, s: 'a', p: {} }, [])).toThrow();
  });
});

describe('recordingInterruption', () => {
  const gen = { v: 1, s: 'a', p: {} };
  it('a live-view error cancels, whether or not a sim is left', () => {
    expect(recordingInterruption(gen, null, true)).toBe('failed');
    expect(recordingInterruption(gen, { gen }, true)).toBe('failed');
  });
  it('a sim running another generation cancels', () => {
    expect(recordingInterruption(gen, { gen: { ...gen } }, false)).toBe('changed');
  });
  it('the same generation, or no sim for a moment (resize), keeps recording', () => {
    expect(recordingInterruption(gen, { gen }, false)).toBeNull();
    expect(recordingInterruption(gen, null, false)).toBeNull();
  });
});

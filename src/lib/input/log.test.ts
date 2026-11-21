import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT } from '@/lib/piece/types';
import {
  EMPTY_LOG,
  MAX_INPUT_EVENTS,
  eventCount,
  isEmptyLog,
  quantize,
  replaySource,
  validateInputLog,
  type InputLog,
} from './log';

const bounds = { width: 1000, height: 500, n: 100 };
const scripted: InputLog = {
  p: [[3, 100, 200, 0], [2, 150, 200, 1], [4]],
  k: [[7, 'a']],
};

describe('quantize', () => {
  it('rounds to tenths of a logical unit', () => {
    expect(quantize(12.34)).toBe(123);
    expect(quantize(0)).toBe(0);
  });

  it('never returns -0', () => {
    expect(Object.is(quantize(-0.04), 0)).toBe(true);
    expect(Object.is(quantize(-0), 0)).toBe(true);
  });
});

describe('empty log', () => {
  it('is empty with zero events', () => {
    expect(isEmptyLog(EMPTY_LOG)).toBe(true);
    expect(eventCount(EMPTY_LOG)).toBe(0);
    expect(isEmptyLog(scripted)).toBe(false);
    expect(eventCount(scripted)).toBe(4);
  });

  it('replays as empty input frames', () => {
    const src = replaySource(EMPTY_LOG);
    for (let i = 0; i < 10; i++) expect(src(i)).toEqual(EMPTY_INPUT);
  });
});

describe('replaySource', () => {
  it('holds pointer state between entries and reports keys on their step', () => {
    const src = replaySource(scripted);
    expect(src(2).pointer).toBeNull();
    expect(src(3).pointer).toEqual({ x: 10, y: 20, down: false });
    expect(src(4).pointer).toEqual({ x: 10, y: 20, down: false });
    expect(src(5).pointer).toEqual({ x: 15, y: 20, down: true });
    expect(src(7).keys).toEqual(['a']);
    expect(src(8).keys).toEqual([]);
    expect(src(9).pointer).toBeNull();
  });
});

describe('validateInputLog', () => {
  it('accepts the scripted log and returns a clean copy', () => {
    const r = validateInputLog({ ...scripted }, bounds);
    expect(r).toEqual({ ok: true, log: scripted });
    if (r.ok) expect(r.log).not.toBe(scripted);
  });

  it('normalizes -0 to 0 so stored logs never carry negative zero', () => {
    const r = validateInputLog({ p: [[1, -0, -0, 0]], k: [] }, bounds);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.is(r.log.p[0][1], 0)).toBe(true);
      expect(Object.is(r.log.p[0][2], 0)).toBe(true);
      expect(JSON.stringify(r.log)).toBe('{"p":[[1,0,0,0]],"k":[]}');
    }
  });

  it('accepts the empty log', () => {
    expect(validateInputLog({ p: [], k: [] }, bounds)).toEqual({ ok: true, log: EMPTY_LOG });
  });

  const bad: [string, unknown][] = [
    ['non-object', 5],
    ['null', null],
    ['array', []],
    ['missing k', { p: [] }],
    ['negative dStep', { p: [[-1]], k: [] }],
    ['fractional dStep', { p: [[1.5]], k: [] }],
    ['same-step second pointer entry', { p: [[3, 1, 1, 0], [0, 2, 2, 0]], k: [] }],
    ['qx too large', { p: [[1, 10001, 0, 0]], k: [] }],
    ['qx negative', { p: [[1, -1, 0, 0]], k: [] }],
    ['qy too large', { p: [[1, 0, 5001, 0]], k: [] }],
    ['qx fractional', { p: [[1, 1.5, 0, 0]], k: [] }],
    ['down not 0/1', { p: [[1, 0, 0, 2]], k: [] }],
    ['bad pointer arity', { p: [[1, 0]], k: [] }],
    ['long key', { p: [], k: [[1, 'x'.repeat(17)]] }],
    ['empty key', { p: [], k: [[1, '']] }],
    ['non-string key', { p: [], k: [[1, 4]] }],
    ['negative key dStep', { p: [], k: [[1, 'a'], [-1, 'b']] }],
    ['pointer step >= n', { p: [[100]], k: [] }],
    ['key step >= n', { p: [], k: [[50, 'a'], [50, 'b']] }],
    ['extra keys', { p: [], k: [], z: 1 }],
  ];
  for (const [name, raw] of bad) {
    it(`rejects ${name}`, () => {
      const r = validateInputLog(raw, bounds);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    });
  }

  it('allows several keys on one step', () => {
    expect(validateInputLog({ p: [], k: [[5, 'a'], [0, 'b']] }, bounds).ok).toBe(true);
  });

  it('rejects more than MAX_INPUT_EVENTS events', () => {
    const k: [number, string][] = Array.from({ length: MAX_INPUT_EVENTS + 1 }, () => [0, 'a']);
    expect(validateInputLog({ p: [], k }, { ...bounds, n: 1000 }).ok).toBe(false);
    const okK = k.slice(0, MAX_INPUT_EVENTS);
    expect(validateInputLog({ p: [], k: okK }, { ...bounds, n: 1000 }).ok).toBe(true);
  });
});
